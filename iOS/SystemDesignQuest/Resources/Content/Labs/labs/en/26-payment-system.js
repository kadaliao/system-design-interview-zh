/* Chapter 26: Payment System. Lab: how to retry after a PSP call times out, how idempotency keys deduplicate, duplicate webhooks, and nightly reconciliation. */
(function(){
const {el:h,util}=SDLab;

SDLab.define({
  id:'payment-retry',chapter:26,
  title:'Retries, Idempotency Keys, and Reconciliation After a Payment Timeout',
  summary:'A $3.15 payment order hits a fault while calling the PSP. Choose what to do after the timeout, inject faults, and watch how the order status moves, how many times the buyer is charged, and how many times the wallet is credited. Finally, run nightly reconciliation to check that internal and external records agree.',
  caveat:'Time is compressed: one-way network 0.8 s, call timeout 2.2 s, retries back off exponentially at 0.5, 1, and 2 s, at most 3 times; only the first call hits the chosen fault. The model covers a single payment order only. Webhook signature verification, hosted-page redirects, how long the PSP keeps idempotency keys, and refunds are not modeled; reconciliation compares amounts by payment_order_id only.',
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

    /* ---- Controls ---- */
    const selPolicy=ctx.select({label:'After a timeout',value:cfg.policy,options:[['newkey','Retry with a new idempotency key (wrong)'],['samekey','Retry with the original key'],['query','Query the PSP first, then decide']],onChange:v=>{cfg.policy=v}});
    const selFault=ctx.select({label:'On the first PSP call',value:cfg.fault,options:[['none','Everything works'],['reqlost','Request lost (PSP never got it)'],['resplost','Response lost (PSP already charged)'],['down','Response lost, then PSP unreachable'],['declined','Card declined']],onChange:v=>{cfg.fault=v}});
    const selHook=ctx.select({label:'PSP webhook',value:cfg.hook,options:[['normal','Delivered once after about 3.5 s'],['dup','Delivered 3 times'],['late','Late by about 7 s'],['lost','Lost']],onChange:v=>{cfg.hook=v}});
    const tgDedupe=ctx.toggle({label:'Ledger and wallet dedupe by payment_order_id',value:true,onChange:v=>{cfg.dedupe=v}});
    const bPay=ctx.button('Start payment',()=>{if(busy)return;start();spawn(pay)},{primary:true});
    const bRecon=ctx.button('Nightly reconciliation',()=>{if(busy||!S.order)return;spawn(reconcile)});
    const bClear=ctx.button('Clear',()=>{if(!busy)start()});

    /* ---- Stage: state machine, message diagram, record panels ---- */
    const stEls={};for(const s of ['NOT_STARTED','EXECUTING','SUCCESS','FAILED'])stEls[s]=h('span',{class:'pr-st'},s);
    const smNote=h('span',{class:'pr-smnote'});
    const sm=h('div',{class:'pr-sm',role:'group','aria-label':'payment_order_status state machine'},stEls.NOT_STARTED,h('span',{class:'pr-ar'},'→'),stEls.EXECUTING,h('span',{class:'pr-ar'},'→'),stEls.SUCCESS,h('span',{class:'pr-ar'},'/'),stEls.FAILED,smNote);
    const svg=ctx.svgEl('svg',{role:'img','aria-label':'Message flow between the payment service, the PSP, the wallet and ledger, and the buyer’s credit card'});
    const defs=ctx.svgEl('defs',null,ctx.svgEl('marker',{id:'pr-ah',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'},ctx.svgEl('path',{d:'M0 0L10 5L0 10Z',fill:'#a6b3aa'})));
    const gBase=ctx.svgEl('g'),gPk=ctx.svgEl('g');svg.append(defs,gBase,gPk);
    const dot=(c,t)=>h('span',null,h('i',{style:{background:c}}),t);
    const legend=h('div',{class:'pr-legend'},dot(C.info,'Request / query'),dot(C.ok,'Success / credit'),dot(C.series[5],'webhook'),dot(C.bad,'Lost / failed / duplicate'));
    const pOrder=h('div',{class:'sdl-panel'}),pPsp=h('div',{class:'sdl-panel'}),pRecon=h('div',{class:'sdl-panel wide'});
    ctx.stage.append(sm,svg,legend,h('div',{class:'pr-panels'},pOrder,pPsp,pRecon));
    const stats=ctx.stats([{key:'charged',label:'Buyer charged'},{key:'wallet',label:'Seller wallet credited'},{key:'ledger',label:'Ledger entries'},{key:'recon',label:'Reconciliation diff'}]);

    const NODE={svc:'Payment service',psp:'PSP',wal:'Wallet / Ledger',card:'Buyer’s card'};
    const nodeEls={};
    const txt=(x,y,t,o={})=>ctx.svgEl('text',{x,y,'font-size':o.size||12,'font-weight':o.bold?700:null,'text-anchor':o.anchor||null,style:o.fill?'fill:'+o.fill:null},t);
    function layout(w){
      const narrow=w<560,nw=narrow?Math.max(116,Math.floor((w-92)/2)):Math.min(240,Math.floor(w*.3)),nh=76,gap=narrow?48:44,y2=nh+gap;
      L={w,nw,nh,y2,reqY:26,resY:nh-18,H:y2+nh+2,pos:{svc:[0,0],psp:[w-nw,0],wal:[0,y2],card:[w-nw,y2]}};
      svg.setAttribute('viewBox',`0 0 ${w} ${L.H}`);
      gBase.replaceChildren();
      const ln=(x1,y1,x2,y2)=>ctx.svgEl('line',{x1,y1,x2,y2,stroke:'#b9c6bd','stroke-width':1.5,'marker-end':'url(#pr-ah)'});
      gBase.append(ln(nw+6,L.reqY,w-nw-6,L.reqY),ln(w-nw-6,L.resY,nw+6,L.resY),ln(nw/2,nh+4,nw/2,y2-4),ln(w-nw/2,nh+4,w-nw/2,y2-4));
      gBase.append(txt(w/2,L.reqY-8,narrow?'Request':'Request / query',{size:11,anchor:'middle',fill:'#66756d'}),txt(w/2,L.resY+17,narrow?'Response':'Response / webhook',{size:11,anchor:'middle',fill:'#66756d'}),
        txt(nw/2+8,nh+gap/2+4,'Credit',{size:11,fill:'#66756d'}),txt(w-nw/2-8,nh+gap/2+4,'Charge',{size:11,anchor:'end',fill:'#66756d'}));
      for(const k of Object.keys(NODE)){
        const [x,y]=L.pos[k];
        const rect=ctx.svgEl('rect',{x:x+.75,y:y+.75,width:nw-1.5,height:nh-1.5,rx:10,fill:'#fbfcfa',stroke:'#c9d4cc','stroke-width':1.5});
        const t2=txt(x+10,y+43,''),t3=txt(x+10,y+63,'',{fill:'#66756d'});
        gBase.append(rect,txt(x+10,y+21,NODE[k],{size:13,bold:true}),t2,t3);nodeEls[k]={rect,t2,t3};
      }
      renderNodes();for(const p of [...pk])place(p);
    }

    /* ---- Messages in flight ---- */
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
        if(!p.lost){p.lost=true;p.la=p.age;ctx.attr(p.r,{fill:C.bad});size(p,'✕ Lost')}
        k=p.lostAt;const f=(p.age-p.la)/900;p.g.setAttribute('opacity',Math.max(0,1-f*f));if(f>=1){kill(p);return}
      }else if(k>=1){kill(p);return}
      const [x1,y1,x2,y2]=ends(p.path);p.g.setAttribute('transform',`translate(${util.lerp(x1,x2,k).toFixed(1)},${util.lerp(y1,y2,k).toFixed(1)})`);
    }
    function kill(p){p.g.remove();const i=pk.indexOf(p);if(i>=0)pk.splice(i,1)}
    let acc=0;
    const lp=ctx.loop(dt=>{for(const p of pk)p.age+=dt*1000;acc+=dt;if(acc>=1/30){acc=0;for(const p of [...pk])place(p)}if(!pk.length)lp.stop()},false);

    /* ---- Rendering ---- */
    const charged=()=>S.psp.charges.filter(c=>c.status==='SUCCESS');
    function tone(k,fill,stroke,dash){ctx.attr(nodeEls[k].rect,{fill,stroke,'stroke-dasharray':dash||null})}
    function renderNodes(){
      if(!L||!S)return;const o=S.order,E=nodeEls,ch=charged(),sum=ch.reduce((s,c)=>s+c.amount,0);
      E.svc.t2.textContent=o?o.status:'Idle';
      E.svc.t3.textContent=!o?'':S.dlq&&o.status==='EXECUTING'?'In DLQ · alerted':o.unknown?'Outcome unknown':o.status==='SUCCESS'?`Ledger ${o.ledger_updated?'✓':'—'}  Wallet ${o.wallet_updated?'✓':'—'}`:S.phase||'';
      if(!o)tone('svc','#fbfcfa','#c9d4cc');else if(o.status==='SUCCESS')tone('svc',C.okSoft,C.ok);else if(o.status==='FAILED')tone('svc',C.badSoft,C.bad);else if(o.unknown)tone('svc',C.warnSoft,C.warn);else tone('svc',C.infoSoft,C.info);
      E.psp.t2.textContent=S.psp.down?'Temporarily down':`${S.psp.charges.length} ${S.psp.charges.length===1?'charge':'charges'}`;E.psp.t3.textContent=S.psp.down?'Requests time out':S.pspNote;
      tone('psp',S.psp.down?'#eceeed':'#fbfcfa',S.psp.down?'#9aa89f':'#c9d4cc',S.psp.down?'5 4':null);
      E.wal.t2.textContent='Balance '+money(S.wallet);E.wal.t3.textContent=`Ledger entries: ${S.ledger.length}`;
      if(S.wallet>AMT)tone('wal',C.badSoft,C.bad);else if(S.wallet)tone('wal',C.okSoft,C.ok);else tone('wal','#fbfcfa','#c9d4cc');
      E.card.t2.textContent=`Charged: ${ch.length}`;E.card.t3.textContent=ch.length?money(sum)+(ch.length>1?' · duplicate':''):'Not charged';
      if(ch.length>1)tone('card',C.badSoft,C.bad);else tone('card','#fbfcfa','#c9d4cc');
    }
    function render(){
      const o=S.order,st=o&&o.status;
      for(const [k,e] of Object.entries(stEls))e.className='pr-st'+(k===st?' on '+(k==='SUCCESS'?'ok':k==='FAILED'?'bad':o.unknown?'warn':'info'):'');
      const fixed=S.recon&&S.recon.fixed;
      smNote.textContent=!o?'':fixed?'Corrected from settlement file':S.dlq&&st==='EXECUTING'?'In dead-letter queue · alerted':o.unknown?'Outcome unknown, which is not the same as failed':S.phase||'';
      smNote.className='pr-smnote'+(fixed?' ok':S.dlq&&st==='EXECUTING'?' bad':o&&o.unknown?' warn':'');
      renderNodes();
      pOrder.replaceChildren(h('div',{class:'ph'},'Internal records · payment_orders'),o?h('dl',{class:'pr-kv'},
        h('dt',null,'payment_order_id'),h('dd',null,o.id),
        h('dt',null,'payment_order_status'),h('dd',null,o.status+(o.unknown?' (outcome unknown)':'')),
        h('dt',null,'Idempotency key sent to PSP'),h('dd',null,keysText(o.keys)),
        h('dt',null,'ledger_updated'),h('dd',null,String(o.ledger_updated)),
        h('dt',null,'wallet_updated'),h('dd',null,String(o.wallet_updated)),
        h('dt',null,'Retries'),h('dd',null,S.retries+(S.dlq?' (in dead-letter queue)':''))):h('p',{class:'pr-empty'},'No payment order yet. Click “Start payment”.'));
      const cs=S.psp.charges;
      pPsp.replaceChildren(h('div',{class:'ph'},'PSP records (deduplicated by idempotency key)'),cs.length?h('div',{class:'sdl-scroll'},h('table',{class:'sdl-table'},
        h('thead',null,h('tr',null,h('th',null,'Idempotency key'),h('th',null,'Charge'),h('th',null,'Amount'),h('th',null,'Result'))),
        h('tbody',null,cs.map(c=>h('tr',null,h('td',{class:'sdl-mono'},c.key),h('td',{class:'sdl-mono'},c.id),h('td',null,money(c.amount)),h('td',null,h('span',{class:'sdl-tag '+(c.status==='SUCCESS'?'ok':'bad')},c.status==='SUCCESS'?'Success':'Declined'))))))):h('p',{class:'pr-empty'},'The PSP hasn’t processed this payment yet.'));
      const R=S.recon;
      pRecon.replaceChildren(h('div',{class:'ph'},'Nightly reconciliation · PSP settlement file ↔ internal ledger'),...R?[h('div',{class:'sdl-scroll'},h('table',{class:'sdl-table'},
        h('thead',null,h('tr',null,h('th',null,'payment_order_id'),h('th',null,'PSP settled'),h('th',null,'Ledger'),h('th',null,'Verdict'))),
        h('tbody',null,h('tr',null,h('td',{class:'sdl-mono'},R.id),h('td',null,R.psp),h('td',null,R.internal),h('td',null,h('span',{class:'sdl-tag '+R.tone},R.verdict)))))),h('p',{class:'sdl-note'},R.action)]:[h('p',{class:'pr-empty'},'Not reconciled yet. Click “Nightly reconciliation” once the payment flow ends.')]);
      const ch=charged(),sum=ch.reduce((s,c)=>s+c.amount,0);
      stats.set('charged',ch.length?`${money(sum)} (${ch.length} ${ch.length===1?'charge':'charges'})`:'$0.00',ch.length>1?'bad':ch.length?'info':null);
      stats.set('wallet',money(S.wallet),S.wallet>sum||S.wallet>AMT?'bad':S.wallet?'ok':null);
      stats.set('ledger',String(S.ledger.length),S.ledger.length>1?'bad':S.ledger.length?'ok':null);
      stats.set('recon',R?(R.diff?'1 mismatch':'None'):'—',R?(R.diff?(R.fixed?'warn':'bad'):'ok'):null);
    }
    const keysText=ks=>!ks.length?'—':ks.every(k=>k===ks[0])?ks[0]+(ks.length>1?` ×${ks.length} (same key)`:''):ks.join(', ');
    function fresh(){S={order:null,psp:{charges:[],down:false},pspNote:'',wallet:0,ledger:[],retries:0,dlq:false,recon:null,phase:'',seq:0}}
    function start(){gen++;fresh();for(const p of [...pk])kill(p);ctx.clearLog();render()}
    const log=(t,tone)=>ctx.log(t,tone);

    /* ---- Payment flow ---- */
    async function pay(){
      const o=S.order={id:'po_1',status:'NOT_STARTED',unknown:false,ledger_updated:false,wallet_updated:false,keys:[]};
      log('① Write payment order po_1 (NOT_STARTED), amount $3.15','info');render();
      await sleep(500);
      o.status='EXECUTING';S.phase='Awaiting PSP';log('② Status becomes EXECUTING; call the PSP');render();
      await attempt(0);
    }
    async function attempt(n){
      const o=S.order,key=cfg.policy==='newkey'?`${o.id}·a${n+1}`:o.id;
      o.keys.push(key);
      if(n){S.retries=n;log(`Retry #${n}, idempotency key ${key}${cfg.policy==='newkey'?' (newly generated)':' (original key reused)'}`,cfg.policy==='newkey'?'bad':'info')}
      S.phase='Awaiting PSP';render();
      const r=await callPay(key,n?'none':cfg.fault);
      if(r||o.status!=='EXECUTING')return;
      o.unknown=true;S.phase='';log('No response after 2.2 s: outcome unknown, which is not the same as the charge failing; order stays EXECUTING','warn');render();
      await afterTimeout(n);
    }
    async function callPay(key,fault){
      const lostReq=fault==='reqlost'||S.psp.down;
      fly('req','Charge '+key,C.info,{lostAt:lostReq?(S.psp.down?.9:.5):null});
      if(lostReq){await sleep(T.timeout);return null}
      await sleep(T.leg+T.proc);
      let ch=S.psp.charges.find(c=>c.key===key);const replay=!!ch;
      if(ch){S.pspNote='Dedup hit '+key;log(`PSP: idempotency key ${key} was already processed; returning the original result ${ch.id} without charging again`,'ok')}
      else{
        ch={key,id:'ch_'+(++S.seq),orderId:S.order.id,amount:AMT,status:fault==='declined'?'FAILED':'SUCCESS'};S.psp.charges.push(ch);
        if(ch.status==='SUCCESS'){const dup=charged().length>1;S.pspNote='New charge '+ch.id;fly('card','Charge '+money(AMT),dup?C.bad:'#4d5d55',{dur:500});log(`PSP: first time seeing idempotency key ${key}; charge ${ch.id} succeeded${dup?': the same order is charged a second time':''}`,dup?'bad':'info')}
        else{S.pspNote='Card declined';log(`PSP: card declined; charge ${ch.id} failed`,'bad')}
        spawn(()=>webhooks(ch));
      }
      if(fault==='down'){S.psp.down=true;log('The PSP failed before the response arrived and is now unreachable','bad')}
      render();
      const lostRes=fault==='resplost'||fault==='down';
      fly('res',(replay?'Original ':ch.status==='SUCCESS'?'Succeeded ':'Failed ')+ch.id,ch.status==='SUCCESS'?C.ok:C.bad,{lostAt:lostRes?.5:null});
      if(lostRes){await sleep(T.timeout-T.leg-T.proc);return null}
      await sleep(T.leg);
      applyResult(ch,'Sync response');return ch;
    }
    async function callQuery(key){
      const down=S.psp.down;
      fly('req','Query '+key,C.info,{lostAt:down?.9:null});
      if(down){await sleep(T.timeout);return null}
      await sleep(T.leg+T.proc/2);
      const ch=S.psp.charges.find(c=>c.key===key);
      fly('res',ch?(ch.status==='SUCCESS'?'Succeeded ':'Failed ')+ch.id:'No record',ch?(ch.status==='SUCCESS'?C.ok:C.bad):C.muted);
      await sleep(T.leg);return {ch};
    }
    async function afterTimeout(n){
      const o=S.order;
      if(n>=3){S.dlq=true;S.phase='';log('3 retries and still no confirmation: sent to the dead-letter queue with an alert; the order is still EXECUTING','bad');render();return}
      const w=T.backoff[n];
      if(cfg.policy==='query'){
        S.phase='Querying PSP';render();await sleep(300);if(o.status!=='EXECUTING')return;
        log(`Querying the PSP for the result under the original key ${o.keys[0]}, without resending the charge`,'info');
        const r=await callQuery(o.keys[0]);if(o.status!=='EXECUTING')return;
        if(!r){S.retries=n+1;S.phase=`Backoff ${w/1000}s, re-query`;log(`The query timed out too; querying again in ${w/1000} s`,'warn');render();await sleep(w);return afterTimeout(n+1)}
        if(r.ch){applyResult(r.ch,'Query result');return}
        log('The PSP has no record of this payment: the request never arrived, so resending with the original key is safe','info');S.phase=`Backoff ${w/1000}s, resend`;render();await sleep(w);
        if(o.status!=='EXECUTING')return;return attempt(n+1);
      }
      S.phase=`Backoff ${w/1000}s, retry`;log(`Exponential backoff: retrying in ${w/1000} s`,'warn');render();
      await sleep(w);
      if(o.status!=='EXECUTING'){log('A final state was confirmed while waiting; retry canceled','ok');return}
      return attempt(n+1);
    }
    async function webhooks(ch){
      const times=cfg.hook==='dup'?[T.hook,T.gap,T.gap]:[cfg.hook==='late'?T.late:T.hook];
      for(let i=0;i<times.length;i++){
        await sleep(times[i]);
        if(S.psp.down){log('The PSP is down, so the webhook could not be sent','warn');return}
        if(cfg.hook==='lost'){fly('res','webhook',C.series[5],{lostAt:.5});log('The webhook was lost in the network','warn');return}
        fly('res','webhook '+ch.id+(times.length>1?' #'+(i+1):''),C.series[5]);
        spawn(async()=>{await sleep(T.leg);log(`Webhook received (signature verified): ${ch.orderId} ${ch.status}, charge ${ch.id}`);applyResult(ch,'Webhook')});
      }
    }
    function applyResult(ch,src){
      const o=S.order;if(!o||ch.orderId!==o.id)return;
      const done=o.status==='SUCCESS'||o.status==='FAILED';
      if(done&&(cfg.dedupe||ch.status!=='SUCCESS'||o.status!=='SUCCESS')){log(`${src}: ${o.id} is already ${o.status}; ignored after dedup by payment_order_id`,'ok');render();return}
      o.unknown=false;S.phase='';
      if(ch.status==='FAILED'){o.status='FAILED';log(`${src}: failure confirmed; order → FAILED, wallet balance unchanged`,'bad');render();return}
      if(!done){o.status='SUCCESS';log(`${src}: success confirmed; order → SUCCESS`,'ok')}
      if(!o.ledger_updated||!cfg.dedupe){S.ledger.push({id:o.id,amount:ch.amount});o.ledger_updated=true}
      if(!o.wallet_updated||!cfg.dedupe){
        S.wallet+=ch.amount;o.wallet_updated=true;const dup=S.wallet>AMT;
        fly('wal','Credit '+money(ch.amount),dup?C.bad:C.ok,{dur:500});
        log(dup?`${src}: no dedup, so the wallet is credited ${money(ch.amount)} again, total ${money(S.wallet)}`:`Record a ledger entry and credit the seller’s wallet ${money(ch.amount)}`,dup?'bad':'ok');
      }
      render();
    }
    async function reconcile(){
      const o=S.order;S.psp.down=false;S.pspNote='Settlement sent';render();
      log('Overnight: the PSP sends its settlement file, compared line by line with the internal ledger','info');
      fly('res','Settlement file',C.ink);await sleep(T.leg);
      const ch=charged(),pa=ch.reduce((s,c)=>s+c.amount,0),ia=S.ledger.reduce((s,x)=>s+x.amount,0);
      const R={id:o.id,psp:`${money(pa)} (${ch.length} ${ch.length===1?'charge':'charges'})`,internal:`${money(ia)} (${o.status})`,diff:true,tone:'bad'};
      if(pa===ia&&(pa?o.status==='SUCCESS':o.status!=='EXECUTING')){Object.assign(R,{diff:false,tone:'ok',verdict:'Match',action:'The PSP settlement and the internal ledger agree on amount and status. Nothing to do.'})}
      else if(pa>0&&ia===0&&o.status==='EXECUTING'){
        Object.assign(R,{tone:'warn',verdict:'Internal stuck in progress',fixed:true,action:'A known, classifiable mismatch: the PSP charged successfully, but the internal order is still EXECUTING. Following the standard procedure, record SUCCESS, add a new ledger entry, and credit the wallet; existing records are not rewritten.'});
        o.status='SUCCESS';o.unknown=false;S.ledger.push({id:o.id,amount:pa,fix:true});o.ledger_updated=true;S.wallet+=pa;o.wallet_updated=true;
        fly('wal','Correction '+money(pa),C.ok,{dur:500});log(`Reconciliation correction: po_1 recorded as SUCCESS, wallet credited ${money(pa)}`,'warn');
      }
      else if(pa>ia)Object.assign(R,{verdict:'PSP over-charged by '+money(pa-ia),action:`The buyer was charged ${ch.length} times for the same order, but internally only ${money(ia)} is recognized. Hand it to finance to refund the buyer, and add a refund entry.`});
      else if(ia>pa)Object.assign(R,{verdict:'Internal over-recorded by '+money(ia-pa),action:`The internal ledger holds ${S.ledger.length} entries totaling ${money(ia)}, while the PSP settled only ${money(pa)}. Add a reversing entry and claw back the excess wallet balance, without deleting or editing the original records.`});
      else Object.assign(R,{tone:'info',verdict:'No PSP charge',action:'The settlement file has no charge for this order, so it is confirmed uncharged: close the order per procedure, or start again with the original idempotency key.'});
      S.recon=R;log('Reconciliation verdict: '+R.verdict,R.diff?(R.fixed?'warn':'bad'):'ok');render();
      ctx.announce('Reconciliation verdict: '+R.verdict);
      await sleep(600);
    }

    fresh();
    ctx.onResize(w=>layout(Math.max(300,Math.floor(w))));
    render();
    spawn(pay);

    /* ---- Preset scenarios ---- */
    const wrap=fn=>async()=>{busy=true;for(const b of [bPay,bRecon,bClear])b.disabled=true;try{await fn()}catch(e){if(!e||!e.stop)throw e}finally{busy=false;for(const b of [bPay,bRecon,bClear])b.disabled=false}};
    function prepare(o){Object.assign(cfg,o);selPolicy.set(cfg.policy,true);selFault.set(cfg.fault,true);selHook.set(cfg.hook,true);tgDedupe.set(cfg.dedupe,true);start()}
    ctx.scenarios([
      {id:'newkey',label:'Retry with a new key after a timeout',
        ask:'Payment of $3.15: the PSP actually charged, but the response was lost on the way, and the payment service times out after 2.2 s. If the retry generates a new idempotency key, how many times is the buyer charged in the end? What will nightly reconciliation see?',
        insight:'The PSP treats po_1·a1 and po_1·a2 as two different payments, so the buyer is charged twice, $6.30 in total. Internally, dedup by payment_order_id credits the wallet only $3.15, and both webhooks are then ignored, so everything looks fine inside. Only reconciliation reveals that the PSP settled $6.30 while the internal ledger shows $3.15, and finance has to refund the difference. A timeout only means “the result is unknown”; retrying the transport must not turn into redoing the business action.',
        run:wrap(async()=>{prepare({policy:'newkey',fault:'resplost',hook:'normal',dedupe:true});await pay();await sleep(3800);await reconcile()})},
      {id:'samekey',label:'Retry with the original key',
        ask:'Same lost response and 2.2 s timeout, but this time the retry reuses the original idempotency key po_1. Will the PSP charge again? How many times is the buyer charged?',
        insight:'The PSP sees that po_1 was already processed and returns the original result ch_1 without charging again; the retry’s response confirms the order as SUCCESS, and the webhook that arrives later is ignored by dedup. The buyer is charged only $3.15, and reconciliation matches. The idempotency key must be bound to the payment itself (payment_order_id), not to each HTTP call.',
        run:wrap(async()=>{prepare({policy:'samekey',fault:'resplost',hook:'normal',dedupe:true});await pay();await sleep(1500);await reconcile()})},
      {id:'dup-webhook',label:'Duplicate webhooks meet non-idempotent crediting',
        ask:'After the timeout you query the PSP first and find the charge succeeded; then the PSP delivers the webhook 3 more times. If the wallet credit doesn’t check wallet_updated, how much does the seller’s wallet end up credited?',
        insight:'The query result credits the wallet once, and each of the 3 duplicate webhooks credits it again: wallet $12.60, 4 ledger entries, while the buyer was charged only $3.15. Reconciliation finds $9.45 over-recorded internally, and all you can do is add reversing entries. Duplicate message delivery is normal, so the consumer must dedupe by payment_order_id. Close this scenario, turn the dedupe switch on, and click “Start payment” again: the wallet is credited only $3.15.',
        run:wrap(async()=>{prepare({policy:'query',fault:'resplost',hook:'dup',dedupe:false});await pay();await sleep(4000);await reconcile()})},
      {id:'recon',label:'PSP goes down; reconciliation settles it',
        ask:'The PSP charges successfully and then goes down at once: the response is lost, the webhook can’t be sent, and all 3 retries (backoff 0.5, 1, 2 s) time out. What state does the order end up in? How does nightly reconciliation handle it?',
        insight:'After all 3 retries fail, the order goes to the dead-letter queue with an alert and stays EXECUTING: the result is unknown, so it must not be treated as a failure, and certainly not charged again under a new key. The nightly settlement file shows the PSP charged $3.15 while the internal ledger shows 0, a known, classifiable mismatch: following the standard procedure, record SUCCESS, add a new ledger entry, and credit the wallet, without rewriting existing records.',
        run:wrap(async()=>{prepare({policy:'samekey',fault:'down',hook:'normal',dedupe:true});await pay();await sleep(600);await reconcile()})},
    ]);
  }
});
})();
