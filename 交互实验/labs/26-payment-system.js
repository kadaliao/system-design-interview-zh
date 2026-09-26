/* 第 26 章：支付系统。实验：调用 PSP 超时之后怎样重试、幂等键怎样去重、重复 webhook 与夜间对账。 */
(function(){
const {el:h,util}=SDLab;

SDLab.define({
  id:'payment-retry',chapter:26,
  title:'支付超时后的重试、幂等键与对账',
  summary:'一笔 $3.15 的支付订单调用 PSP 时出故障。选择超时后的做法、注入故障，看订单状态怎样迁移、买家被扣几次、钱包入账几次，最后用夜间对账检查内外是否一致。',
  caveat:'时间已压缩：网络单程 0.8 秒、调用超时 2.2 秒，重试按 0.5、1、2 秒指数退避，最多 3 次；只有第一次调用会遇到所选故障。只模拟单笔支付订单，webhook 验签、托管支付页回跳、PSP 幂等键保存期与退款流程均未展开；对账只按 payment_order_id 比较金额。',
  mount(ctx){
    const C=ctx.colors;
    ctx.css('pr',`
.pr-sm{display:flex;flex-wrap:wrap;align-items:center;gap:5px 6px;margin:0 0 10px;font-size:13px}
.pr-st{font-family:var(--lab-mono);font-size:12px;padding:2px 8px;border-radius:6px;border:1px solid #dbe2da;background:#f6f8f4;color:#8a978f;white-space:nowrap}
.pr-st.on{color:#fff;font-weight:700}
.pr-st.on.info{background:#2f6fb3;border-color:#2f6fb3}.pr-st.on.ok{background:#2f8f5b;border-color:#2f8f5b}
.pr-st.on.bad{background:#c2413b;border-color:#c2413b}.pr-st.on.warn{background:#b7791f;border-color:#b7791f}
.pr-ar{color:#9aa89f}
.pr-smnote{font-size:13px;color:#66756d;margin-left:4px}
.pr-smnote.warn{color:#86561a;font-weight:650}.pr-smnote.bad{color:#9b2c27;font-weight:650}.pr-smnote.ok{color:#1d6a41;font-weight:650}
.pr-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:#66756d;margin:8px 0 0}
.pr-legend i{display:inline-block;width:10px;height:10px;border-radius:5px;margin-right:5px;vertical-align:-1px}
.pr-panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:10px;margin-top:12px}
.pr-panels .wide{grid-column:1/-1}
.pr-kv{display:grid;grid-template-columns:auto minmax(0,1fr);gap:3px 12px;font-size:13px;margin:0}
.pr-kv dt{color:#66756d}.pr-kv dd{margin:0;font-family:var(--lab-mono);font-size:12px;overflow-wrap:anywhere}
.pr-empty{color:#8a978f;font-size:13px;margin:4px 0}
`);
    const AMT=315,money=c=>'$'+(c/100).toFixed(2);
    const T={leg:800,proc:300,timeout:2200,backoff:[500,1000,2000],hook:3500,gap:1200,late:7000};
    const cfg={policy:'samekey',fault:'resplost',hook:'normal',dedupe:true};
    const STOP={stop:true};
    let gen=0,S=null,busy=false,L=null;
    const sleep=async ms=>{const g=gen;await ctx.wait(ms);if(g!==gen)throw STOP};
    const spawn=fn=>{fn().catch(e=>{if(!(e&&(e.abort||e.stop)))console.error(e)})};

    /* ---- 控件 ---- */
    const selPolicy=ctx.select({label:'超时后怎么办',value:cfg.policy,options:[['newkey','换新幂等键重试（错误示范）'],['samekey','沿用原幂等键重试'],['query','先查询 PSP，再决定']],onChange:v=>{cfg.policy=v}});
    const selFault=ctx.select({label:'第一次调用 PSP 时',value:cfg.fault,options:[['none','一切正常'],['reqlost','请求丢失（PSP 没收到）'],['resplost','响应丢失（PSP 已扣款）'],['down','响应丢失，随后 PSP 不可达'],['declined','卡被拒绝']],onChange:v=>{cfg.fault=v}});
    const selHook=ctx.select({label:'PSP 的 webhook',value:cfg.hook,options:[['normal','约 3.5 秒后投递一次'],['dup','重复投递 3 次'],['late','迟到约 7 秒'],['lost','丢失']],onChange:v=>{cfg.hook=v}});
    const tgDedupe=ctx.toggle({label:'账本与钱包按 payment_order_id 去重',value:true,onChange:v=>{cfg.dedupe=v}});
    const bPay=ctx.button('发起支付',()=>{if(busy)return;start();spawn(pay)},{primary:true});
    const bRecon=ctx.button('夜间对账',()=>{if(busy||!S.order)return;spawn(reconcile)});
    const bClear=ctx.button('清空',()=>{if(!busy)start()});

    /* ---- 舞台：状态机、消息图、记录面板 ---- */
    const stEls={};for(const s of ['NOT_STARTED','EXECUTING','SUCCESS','FAILED'])stEls[s]=h('span',{class:'pr-st'},s);
    const smNote=h('span',{class:'pr-smnote'});
    const sm=h('div',{class:'pr-sm',role:'group','aria-label':'payment_order_status 状态机'},stEls.NOT_STARTED,h('span',{class:'pr-ar'},'→'),stEls.EXECUTING,h('span',{class:'pr-ar'},'→'),stEls.SUCCESS,h('span',{class:'pr-ar'},'/'),stEls.FAILED,smNote);
    const svg=ctx.svgEl('svg',{role:'img','aria-label':'支付服务、PSP、钱包账本与买家信用卡之间的消息流'});
    const defs=ctx.svgEl('defs',null,ctx.svgEl('marker',{id:'pr-ah',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'},ctx.svgEl('path',{d:'M0 0L10 5L0 10Z',fill:'#a6b3aa'})));
    const gBase=ctx.svgEl('g'),gPk=ctx.svgEl('g');svg.append(defs,gBase,gPk);
    const dot=(c,t)=>h('span',null,h('i',{style:{background:c}}),t);
    const legend=h('div',{class:'pr-legend'},dot(C.info,'请求 / 查询'),dot(C.ok,'成功结果 / 入账'),dot(C.series[5],'webhook'),dot(C.bad,'丢失 / 失败 / 重复'));
    const pOrder=h('div',{class:'sdl-panel'}),pPsp=h('div',{class:'sdl-panel'}),pRecon=h('div',{class:'sdl-panel wide'});
    ctx.stage.append(sm,svg,legend,h('div',{class:'pr-panels'},pOrder,pPsp,pRecon));
    const stats=ctx.stats([{key:'charged',label:'买家被扣款'},{key:'wallet',label:'卖家钱包入账'},{key:'ledger',label:'账本凭证'},{key:'recon',label:'对账差异'}]);

    const NODE={svc:'支付服务',psp:'PSP',wal:'钱包 / 账本',card:'买家信用卡'};
    const nodeEls={};
    const txt=(x,y,t,o={})=>ctx.svgEl('text',{x,y,'font-size':o.size||12,'font-weight':o.bold?700:null,'text-anchor':o.anchor||null,style:o.fill?'fill:'+o.fill:null},t);
    function layout(w){
      const narrow=w<560,nw=narrow?Math.max(116,Math.floor((w-92)/2)):Math.min(240,Math.floor(w*.3)),nh=76,gap=narrow?48:44,y2=nh+gap;
      L={w,nw,nh,y2,reqY:26,resY:nh-18,H:y2+nh+2,pos:{svc:[0,0],psp:[w-nw,0],wal:[0,y2],card:[w-nw,y2]}};
      svg.setAttribute('viewBox',`0 0 ${w} ${L.H}`);
      gBase.replaceChildren();
      const ln=(x1,y1,x2,y2)=>ctx.svgEl('line',{x1,y1,x2,y2,stroke:'#b9c6bd','stroke-width':1.5,'marker-end':'url(#pr-ah)'});
      gBase.append(ln(nw+6,L.reqY,w-nw-6,L.reqY),ln(w-nw-6,L.resY,nw+6,L.resY),ln(nw/2,nh+4,nw/2,y2-4),ln(w-nw/2,nh+4,w-nw/2,y2-4));
      gBase.append(txt(w/2,L.reqY-8,narrow?'请求/查询':'请求 / 查询',{size:11,anchor:'middle',fill:'#66756d'}),txt(w/2,L.resY+17,narrow?'响应/webhook':'响应 / webhook',{size:11,anchor:'middle',fill:'#66756d'}),
        txt(nw/2+8,nh+gap/2+4,'入账',{size:11,fill:'#66756d'}),txt(w-nw/2-8,nh+gap/2+4,'扣款',{size:11,anchor:'end',fill:'#66756d'}));
      for(const k of Object.keys(NODE)){
        const [x,y]=L.pos[k];
        const rect=ctx.svgEl('rect',{x:x+.75,y:y+.75,width:nw-1.5,height:nh-1.5,rx:10,fill:'#fbfcfa',stroke:'#c9d4cc','stroke-width':1.5});
        const t2=txt(x+10,y+43,''),t3=txt(x+10,y+63,'',{fill:'#66756d'});
        gBase.append(rect,txt(x+10,y+21,NODE[k],{size:13,bold:true}),t2,t3);nodeEls[k]={rect,t2,t3};
      }
      renderNodes();for(const p of [...pk])place(p);
    }

    /* ---- 飞行中的消息 ---- */
    const pk=[];
    const tw=s=>{let n=0;for(const ch of s)n+=ch.charCodeAt(0)>255?11.5:6.6;return n};
    function ends(path){const {nw,nh,w,y2}=L;return path==='req'?[nw,L.reqY,w-nw,L.reqY]:path==='res'?[w-nw,L.resY,nw,L.resY]:path==='wal'?[nw/2,nh-6,nw/2,y2+8]:[w-nw/2,nh-6,w-nw/2,y2+8]}
    function fly(path,label,color,o={}){
      const g=ctx.svgEl('g',{'aria-hidden':'true'}),r=ctx.svgEl('rect',{y:-9,height:18,rx:9,fill:color}),t=txt(0,4,label,{size:11,bold:true,anchor:'middle',fill:'#fff'});
      g.append(r,t);gPk.append(g);
      const p={g,r,t,path,age:0,dur:o.dur||T.leg,lostAt:o.lostAt??null,lost:false};size(p,label);
      pk.push(p);place(p);lp.start();return p;
    }
    function size(p,label){const w=tw(label)+14;ctx.attr(p.r,{x:-w/2,width:w});p.t.textContent=label}
    function place(p){
      let k=p.age/p.dur;
      if(p.lostAt!=null&&k>=p.lostAt){
        if(!p.lost){p.lost=true;p.la=p.age;ctx.attr(p.r,{fill:C.bad});size(p,'✕ 丢失')}
        k=p.lostAt;const f=(p.age-p.la)/900;p.g.setAttribute('opacity',Math.max(0,1-f*f));if(f>=1){kill(p);return}
      }else if(k>=1){kill(p);return}
      const [x1,y1,x2,y2]=ends(p.path);p.g.setAttribute('transform',`translate(${util.lerp(x1,x2,k).toFixed(1)},${util.lerp(y1,y2,k).toFixed(1)})`);
    }
    function kill(p){p.g.remove();const i=pk.indexOf(p);if(i>=0)pk.splice(i,1)}
    let acc=0;
    const lp=ctx.loop(dt=>{for(const p of pk)p.age+=dt*1000;acc+=dt;if(acc>=1/30){acc=0;for(const p of [...pk])place(p)}if(!pk.length)lp.stop()},false);

    /* ---- 渲染 ---- */
    const charged=()=>S.psp.charges.filter(c=>c.status==='SUCCESS');
    function tone(k,fill,stroke,dash){ctx.attr(nodeEls[k].rect,{fill,stroke,'stroke-dasharray':dash||null})}
    function renderNodes(){
      if(!L||!S)return;const o=S.order,E=nodeEls,ch=charged(),sum=ch.reduce((s,c)=>s+c.amount,0);
      E.svc.t2.textContent=o?o.status:'空闲';
      E.svc.t3.textContent=!o?'':S.dlq&&o.status==='EXECUTING'?'死信队列 · 已告警':o.unknown?'结果未知':o.status==='SUCCESS'?`账本 ${o.ledger_updated?'✓':'—'}  钱包 ${o.wallet_updated?'✓':'—'}`:S.phase||'';
      if(!o)tone('svc','#fbfcfa','#c9d4cc');else if(o.status==='SUCCESS')tone('svc',C.okSoft,C.ok);else if(o.status==='FAILED')tone('svc',C.badSoft,C.bad);else if(o.unknown)tone('svc',C.warnSoft,C.warn);else tone('svc',C.infoSoft,C.info);
      E.psp.t2.textContent=S.psp.down?'暂时不可达':`${S.psp.charges.length} 笔扣款记录`;E.psp.t3.textContent=S.psp.down?'请求会超时':S.pspNote;
      tone('psp',S.psp.down?'#eceeed':'#fbfcfa',S.psp.down?'#9aa89f':'#c9d4cc',S.psp.down?'5 4':null);
      E.wal.t2.textContent='余额 '+money(S.wallet);E.wal.t3.textContent=`账本凭证 ${S.ledger.length} 张`;
      if(S.wallet>AMT)tone('wal',C.badSoft,C.bad);else if(S.wallet)tone('wal',C.okSoft,C.ok);else tone('wal','#fbfcfa','#c9d4cc');
      E.card.t2.textContent=`已扣 ${ch.length} 笔`;E.card.t3.textContent=ch.length?money(sum)+(ch.length>1?' · 重复扣款':''):'未扣款';
      if(ch.length>1)tone('card',C.badSoft,C.bad);else tone('card','#fbfcfa','#c9d4cc');
    }
    function render(){
      const o=S.order,st=o&&o.status;
      for(const [k,e] of Object.entries(stEls))e.className='pr-st'+(k===st?' on '+(k==='SUCCESS'?'ok':k==='FAILED'?'bad':o.unknown?'warn':'info'):'');
      const fixed=S.recon&&S.recon.fixed;
      smNote.textContent=!o?'':fixed?'已按结算文件补正':S.dlq&&st==='EXECUTING'?'死信队列 · 已告警':o.unknown?'结果未知，不等于失败':S.phase||'';
      smNote.className='pr-smnote'+(fixed?' ok':S.dlq&&st==='EXECUTING'?' bad':o&&o.unknown?' warn':'');
      renderNodes();
      pOrder.replaceChildren(h('div',{class:'ph'},'内部记录 · payment_orders'),o?h('dl',{class:'pr-kv'},
        h('dt',null,'payment_order_id'),h('dd',null,o.id),
        h('dt',null,'payment_order_status'),h('dd',null,o.status+(o.unknown?'（结果未知）':'')),
        h('dt',null,'发给 PSP 的幂等键'),h('dd',null,keysText(o.keys)),
        h('dt',null,'ledger_updated'),h('dd',null,String(o.ledger_updated)),
        h('dt',null,'wallet_updated'),h('dd',null,String(o.wallet_updated)),
        h('dt',null,'重试'),h('dd',null,S.retries+' 次'+(S.dlq?'，已进死信队列':''))):h('p',{class:'pr-empty'},'还没有支付订单，点「发起支付」。'));
      const cs=S.psp.charges;
      pPsp.replaceChildren(h('div',{class:'ph'},'PSP 侧记录（按幂等键去重）'),cs.length?h('div',{class:'sdl-scroll'},h('table',{class:'sdl-table'},
        h('thead',null,h('tr',null,h('th',null,'幂等键'),h('th',null,'扣款'),h('th',null,'金额'),h('th',null,'结果'))),
        h('tbody',null,cs.map(c=>h('tr',null,h('td',{class:'sdl-mono'},c.key),h('td',{class:'sdl-mono'},c.id),h('td',null,money(c.amount)),h('td',null,h('span',{class:'sdl-tag '+(c.status==='SUCCESS'?'ok':'bad')},c.status==='SUCCESS'?'成功':'被拒'))))))):h('p',{class:'pr-empty'},'PSP 还没有处理过这笔支付。'));
      const R=S.recon;
      pRecon.replaceChildren(h('div',{class:'ph'},'夜间对账 · PSP 结算文件 ↔ 内部账本'),...R?[h('div',{class:'sdl-scroll'},h('table',{class:'sdl-table'},
        h('thead',null,h('tr',null,h('th',null,'payment_order_id'),h('th',null,'PSP 结算'),h('th',null,'内部账本'),h('th',null,'结论'))),
        h('tbody',null,h('tr',null,h('td',{class:'sdl-mono'},R.id),h('td',null,R.psp),h('td',null,R.internal),h('td',null,h('span',{class:'sdl-tag '+R.tone},R.verdict)))))),h('p',{class:'sdl-note'},R.action)]:[h('p',{class:'pr-empty'},'尚未对账。支付流程结束后点「夜间对账」。')]);
      const ch=charged(),sum=ch.reduce((s,c)=>s+c.amount,0);
      stats.set('charged',ch.length?`${money(sum)}（${ch.length} 笔）`:'$0.00',ch.length>1?'bad':ch.length?'info':null);
      stats.set('wallet',money(S.wallet),S.wallet>sum||S.wallet>AMT?'bad':S.wallet?'ok':null);
      stats.set('ledger',S.ledger.length+' 张',S.ledger.length>1?'bad':S.ledger.length?'ok':null);
      stats.set('recon',R?(R.diff?'1 笔':'无'):'—',R?(R.diff?(R.fixed?'warn':'bad'):'ok'):null);
    }
    const keysText=ks=>!ks.length?'—':ks.every(k=>k===ks[0])?ks[0]+(ks.length>1?` ×${ks.length}（同一个键）`:''):ks.join('，');
    function fresh(){S={order:null,psp:{charges:[],down:false},pspNote:'',wallet:0,ledger:[],retries:0,dlq:false,recon:null,phase:'',seq:0}}
    function start(){gen++;fresh();for(const p of [...pk])kill(p);ctx.clearLog();render()}
    const log=(t,tone)=>ctx.log(t,tone);

    /* ---- 支付流程 ---- */
    async function pay(){
      const o=S.order={id:'po_1',status:'NOT_STARTED',unknown:false,ledger_updated:false,wallet_updated:false,keys:[]};
      log('① 写入支付订单 po_1（NOT_STARTED），金额 $3.15','info');render();
      await sleep(500);
      o.status='EXECUTING';S.phase='等待 PSP 响应';log('② 状态改为 EXECUTING，调用 PSP');render();
      await attempt(0);
    }
    async function attempt(n){
      const o=S.order,key=cfg.policy==='newkey'?`${o.id}·a${n+1}`:o.id;
      o.keys.push(key);
      if(n){S.retries=n;log(`第 ${n} 次重试，幂等键 ${key}${cfg.policy==='newkey'?'（新生成）':'（沿用原键）'}`,cfg.policy==='newkey'?'bad':'info')}
      S.phase='等待 PSP 响应';render();
      const r=await callPay(key,n?'none':cfg.fault);
      if(r||o.status!=='EXECUTING')return;
      o.unknown=true;S.phase='';log('等了 2.2 秒没有响应：结果未知，不等于扣款失败；订单保持 EXECUTING','warn');render();
      await afterTimeout(n);
    }
    async function callPay(key,fault){
      const lostReq=fault==='reqlost'||S.psp.down;
      fly('req','扣款 '+key,C.info,{lostAt:lostReq?(S.psp.down?.9:.5):null});
      if(lostReq){await sleep(T.timeout);return null}
      await sleep(T.leg+T.proc);
      let ch=S.psp.charges.find(c=>c.key===key);const replay=!!ch;
      if(ch){S.pspNote='幂等命中 '+key;log(`PSP：幂等键 ${key} 已处理过，直接返回原结果 ${ch.id}，不再扣款`,'ok')}
      else{
        ch={key,id:'ch_'+(++S.seq),orderId:S.order.id,amount:AMT,status:fault==='declined'?'FAILED':'SUCCESS'};S.psp.charges.push(ch);
        if(ch.status==='SUCCESS'){const dup=charged().length>1;S.pspNote='新扣款 '+ch.id;fly('card','扣 '+money(AMT),dup?C.bad:'#4d5d55',{dur:500});log(`PSP：首次见到幂等键 ${key}，扣款 ${ch.id} 成功${dup?'：同一笔订单被扣第二次':''}`,dup?'bad':'info')}
        else{S.pspNote='卡被拒绝';log(`PSP：卡被拒绝，扣款 ${ch.id} 失败`,'bad')}
        spawn(()=>webhooks(ch));
      }
      if(fault==='down'){S.psp.down=true;log('PSP 在响应送达前故障，之后暂时不可达','bad')}
      render();
      const lostRes=fault==='resplost'||fault==='down';
      fly('res',(replay?'原结果 ':ch.status==='SUCCESS'?'成功 ':'失败 ')+ch.id,ch.status==='SUCCESS'?C.ok:C.bad,{lostAt:lostRes?.5:null});
      if(lostRes){await sleep(T.timeout-T.leg-T.proc);return null}
      await sleep(T.leg);
      applyResult(ch,'同步响应');return ch;
    }
    async function callQuery(key){
      const down=S.psp.down;
      fly('req','查询 '+key,C.info,{lostAt:down?.9:null});
      if(down){await sleep(T.timeout);return null}
      await sleep(T.leg+T.proc/2);
      const ch=S.psp.charges.find(c=>c.key===key);
      fly('res',ch?(ch.status==='SUCCESS'?'已成功 ':'已失败 ')+ch.id:'无此记录',ch?(ch.status==='SUCCESS'?C.ok:C.bad):C.muted);
      await sleep(T.leg);return {ch};
    }
    async function afterTimeout(n){
      const o=S.order;
      if(n>=3){S.dlq=true;S.phase='';log('3 次重试仍未确认：送入死信队列并告警，订单仍是 EXECUTING','bad');render();return}
      const w=T.backoff[n];
      if(cfg.policy==='query'){
        S.phase='查询 PSP';render();await sleep(300);if(o.status!=='EXECUTING')return;
        log(`按原幂等键 ${o.keys[0]} 查询 PSP 的处理结果，不重发扣款`,'info');
        const r=await callQuery(o.keys[0]);if(o.status!=='EXECUTING')return;
        if(!r){S.retries=n+1;S.phase=`退避 ${w/1000} 秒后再查`;log(`查询也超时，${w/1000} 秒后再查`,'warn');render();await sleep(w);return afterTimeout(n+1)}
        if(r.ch){applyResult(r.ch,'查询结果');return}
        log('PSP 没有这笔记录：请求根本没到达，沿用原键重发是安全的','info');S.phase=`退避 ${w/1000} 秒后重发`;render();await sleep(w);
        if(o.status!=='EXECUTING')return;return attempt(n+1);
      }
      S.phase=`退避 ${w/1000} 秒后重试`;log(`指数退避：${w/1000} 秒后重试`,'warn');render();
      await sleep(w);
      if(o.status!=='EXECUTING'){log('等待期间已确认终态，取消重试','ok');return}
      return attempt(n+1);
    }
    async function webhooks(ch){
      const times=cfg.hook==='dup'?[T.hook,T.gap,T.gap]:[cfg.hook==='late'?T.late:T.hook];
      for(let i=0;i<times.length;i++){
        await sleep(times[i]);
        if(S.psp.down){log('PSP 故障中，webhook 没能发出','warn');return}
        if(cfg.hook==='lost'){fly('res','webhook',C.series[5],{lostAt:.5});log('webhook 在网络中丢失','warn');return}
        fly('res','webhook '+ch.id+(times.length>1?' #'+(i+1):''),C.series[5]);
        spawn(async()=>{await sleep(T.leg);log(`收到 webhook（验签通过）：${ch.orderId} ${ch.status}，扣款 ${ch.id}`);applyResult(ch,'webhook')});
      }
    }
    function applyResult(ch,src){
      const o=S.order;if(!o||ch.orderId!==o.id)return;
      const done=o.status==='SUCCESS'||o.status==='FAILED';
      if(done&&(cfg.dedupe||ch.status!=='SUCCESS'||o.status!=='SUCCESS')){log(`${src}：${o.id} 已是 ${o.status}，按 payment_order_id 去重后忽略`,'ok');render();return}
      o.unknown=false;S.phase='';
      if(ch.status==='FAILED'){o.status='FAILED';log(`${src}：确认失败，订单 → FAILED，不增加钱包余额`,'bad');render();return}
      if(!done){o.status='SUCCESS';log(`${src}：确认成功，订单 → SUCCESS`,'ok')}
      if(!o.ledger_updated||!cfg.dedupe){S.ledger.push({id:o.id,amount:ch.amount});o.ledger_updated=true}
      if(!o.wallet_updated||!cfg.dedupe){
        S.wallet+=ch.amount;o.wallet_updated=true;const dup=S.wallet>AMT;
        fly('wal','入账 '+money(ch.amount),dup?C.bad:C.ok,{dur:500});
        log(dup?`${src}：没有去重，钱包再次入账 ${money(ch.amount)}，累计 ${money(S.wallet)}`:`记账本凭证，并给卖家钱包入账 ${money(ch.amount)}`,dup?'bad':'ok');
      }
      render();
    }
    async function reconcile(){
      const o=S.order;S.psp.down=false;S.pspNote='发出结算文件';render();
      log('夜间：PSP 发来结算文件，逐笔与内部账本比对','info');
      fly('res','结算文件',C.ink);await sleep(T.leg);
      const ch=charged(),pa=ch.reduce((s,c)=>s+c.amount,0),ia=S.ledger.reduce((s,x)=>s+x.amount,0);
      const R={id:o.id,psp:`${money(pa)}（${ch.length} 笔）`,internal:`${money(ia)}（${o.status}）`,diff:true,tone:'bad'};
      if(pa===ia&&(pa?o.status==='SUCCESS':o.status!=='EXECUTING')){Object.assign(R,{diff:false,tone:'ok',verdict:'一致',action:'PSP 结算与内部账本金额、状态一致，无需处理。'})}
      else if(pa>0&&ia===0&&o.status==='EXECUTING'){
        Object.assign(R,{tone:'warn',verdict:'内部卡在处理中',fixed:true,action:'可分类的已知差异：PSP 已成功扣款，内部仍是 EXECUTING。按标准流程补记 SUCCESS，新增账本凭证并给钱包入账，原有记录不改写。'});
        o.status='SUCCESS';o.unknown=false;S.ledger.push({id:o.id,amount:pa,fix:true});o.ledger_updated=true;S.wallet+=pa;o.wallet_updated=true;
        fly('wal','补记 '+money(pa),C.ok,{dur:500});log(`对账补正：po_1 补记 SUCCESS，钱包入账 ${money(pa)}`,'warn');
      }
      else if(pa>ia)Object.assign(R,{verdict:'PSP 多扣 '+money(pa-ia),action:`买家为同一笔订单被扣了 ${ch.length} 次，内部只认 ${money(ia)}。交财务向买家退款，并新增退款凭证。`});
      else if(ia>pa)Object.assign(R,{verdict:'内部多记 '+money(ia-pa),action:`内部账本记了 ${S.ledger.length} 张凭证共 ${money(ia)}，PSP 只结算 ${money(pa)}。追加冲正凭证、扣回多入的钱包余额，不直接删改原记录。`});
      else Object.assign(R,{tone:'info',verdict:'PSP 无扣款',action:'结算文件里没有这笔扣款，可确认未扣款：按流程关闭订单，或沿用原幂等键重新发起。'});
      S.recon=R;log('对账结论：'+R.verdict,R.diff?(R.fixed?'warn':'bad'):'ok');render();
      ctx.announce('对账结论：'+R.verdict);
      await sleep(600);
    }

    fresh();
    ctx.onResize(w=>layout(Math.max(300,Math.floor(w))));
    render();
    spawn(pay);

    /* ---- 预设场景 ---- */
    const wrap=fn=>async()=>{busy=true;for(const b of [bPay,bRecon,bClear])b.disabled=true;try{await fn()}catch(e){if(!e||!e.stop)throw e}finally{busy=false;for(const b of [bPay,bRecon,bClear])b.disabled=false}};
    function prepare(o){Object.assign(cfg,o);selPolicy.set(cfg.policy,true);selFault.set(cfg.fault,true);selHook.set(cfg.hook,true);tgDedupe.set(cfg.dedupe,true);start()}
    ctx.scenarios([
      {id:'newkey',label:'超时后换新键重试',
        ask:'支付 $3.15：PSP 其实已经扣款，但响应在路上丢了，支付服务等 2.2 秒后超时。如果重试时生成一个新的幂等键，买家最终被扣几笔？夜间对账会看到什么？',
        insight:'PSP 把 po_1·a1 和 po_1·a2 当成两笔不同的支付，买家被扣 2 笔共 $6.30。内部按 payment_order_id 去重，钱包只入账 $3.15，之后两个 webhook 都被忽略，内部看起来一切正常。直到对账才发现 PSP 结算 $6.30、内部账本 $3.15，要交财务退款。超时只代表「不知道结果」，重试传输不能变成重做业务。',
        run:wrap(async()=>{prepare({policy:'newkey',fault:'resplost',hook:'normal',dedupe:true});await pay();await sleep(3800);await reconcile()})},
      {id:'samekey',label:'沿用原键重试',
        ask:'同样是响应丢失、2.2 秒超时，这次重试沿用原来的幂等键 po_1。PSP 会再扣一次吗？买家被扣几笔？',
        insight:'PSP 发现 po_1 已处理过，直接返回原结果 ch_1，不再扣款；订单由这次重试的响应确认为 SUCCESS，随后到达的 webhook 被去重忽略。买家只被扣 $3.15，对账一致。幂等键要绑定这笔支付本身（payment_order_id），而不是每一次 HTTP 调用。',
        run:wrap(async()=>{prepare({policy:'samekey',fault:'resplost',hook:'normal',dedupe:true});await pay();await sleep(1500);await reconcile()})},
      {id:'dup-webhook',label:'重复 webhook 遇上非幂等入账',
        ask:'超时后先查询 PSP，查到已成功；PSP 又把 webhook 重复投递了 3 次。如果钱包入账时不检查 wallet_updated，卖家钱包会入账多少？',
        insight:'查询结果入账 1 次，3 个重复 webhook 又各入账 1 次：钱包 $12.60、账本凭证 4 张，而买家只被扣 $3.15。对账发现内部多记 $9.45，只能追加冲正凭证。消息被重复投递是常态，消费端要按 payment_order_id 去重；打开「去重」开关后再点「发起支付」，钱包只入账 $3.15。',
        run:wrap(async()=>{prepare({policy:'query',fault:'resplost',hook:'dup',dedupe:false});await pay();await sleep(4000);await reconcile()})},
      {id:'recon',label:'PSP 宕机，靠对账收敛',
        ask:'PSP 扣款成功后立刻宕机：响应丢了，webhook 发不出来，3 次重试（退避 0.5、1、2 秒）也全部超时。订单最后停在什么状态？夜间对账怎么处理？',
        insight:'3 次重试都失败后，订单进入死信队列并告警，状态仍是 EXECUTING：结果未知，不能当失败处理，更不能换新键再扣。夜间结算文件显示 PSP 已扣款 $3.15、内部账本为 0，属于可分类的已知差异：按标准流程补记 SUCCESS，新增账本凭证并给钱包入账，原有记录不改写。',
        run:wrap(async()=>{prepare({policy:'samekey',fault:'down',hook:'normal',dedupe:true});await pay();await sleep(600);await reconcile()})},
    ]);
  }
});
})();
