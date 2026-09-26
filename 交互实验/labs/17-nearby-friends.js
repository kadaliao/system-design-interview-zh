/* 第 17 章：附近好友。每人一个 Redis Pub/Sub 频道，好友所在的服务器订阅；收到位置后按距离过滤再推给手机。 */
(function(){
const {el:h,util}=SDLab;

SDLab.define({
  id:'nearby-pubsub',chapter:17,
  title:'附近好友：每人一个频道，订阅端按距离过滤',
  summary:'每个在线用户定期把位置发布到自己的 Redis 频道，频道的订阅者是他在线好友所在的 WebSocket 服务器。服务器收到后算距离：5 英里内推给手机（绿色），超出就丢弃（灰色）。调整更新间隔和规模参数，看推送量怎样变化。',
  caveat:'12 个用户、固定好友关系，平面直线距离；模拟时钟加速 6 倍，用户移动速度也做了夸大。图中把消息直接画到好友身上，实际订阅者是好友所在的 WebSocket 服务器，一台服务器可以代表多个本机客户端共享订阅。规模换算沿用原书估算（每台约 10 万推送/秒、频道约 200 GB），需要压测验证。',
  mount(ctx){
    ctx.css('nf',`
.nf-svg{border:1px solid #e3e9e1;border-radius:10px;background:#f7f9f5}
.nf-panels{margin-top:10px}
.nf-list{list-style:none;margin:0;padding:0;font-size:13px}
.nf-list li{display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-top:1px solid #e8ede6;font-variant-numeric:tabular-nums}
.nf-list li:first-child{border-top:0}
.nf-muted{color:#66756d;font-size:12px;margin:6px 0 0;line-height:1.55}
.nf-sub{font-size:13px;line-height:1.65;margin:0}
.nf-sub b{font-family:ui-monospace,Menlo,monospace}
.nf-calc{margin-top:10px;font-size:13px}
.nf-calc .row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:5px 10px;border-top:1px solid #e8ede6;align-items:baseline}
.nf-calc .row:first-of-type{border-top:0}
.nf-calc .row b{font-variant-numeric:tabular-nums;font-size:15px;white-space:nowrap}
.nf-calc .row.hot{background:#fff7dd}
.nf-calc .row .ex{color:#66756d;font-size:12px}
`);
    const SPEEDUP=6,RADIUS=5,MW=24,MH=15;
    const NAMES='ABCDEFGHIJKL'.split('');
    const HOME={A:[9,7.5],B:[11.5,9.2],C:[6.3,5.4],D:[6.8,11.8],E:[17.2,4.2],F:[2.2,13],G:[11.8,5.3],H:[3.8,2.4],I:[20.2,10.8],J:[21.8,2.8],K:[15.2,12.2],L:[18.2,7.6]};
    const EDGES=[['A','B'],['A','C'],['A','D'],['A','E'],['A','F'],['B','C'],['B','G'],['C','H'],['D','H'],['E','I'],['F','J'],['G','K'],['H','L'],['I','J'],['K','L']];
    let U,F,S;
    function init(){
      const r=util.rng(17);
      U={};for(const n of NAMES){const a=r()*Math.PI*2,sp=0.004+r()*0.006;U[n]={n,x:HOME[n][0],y:HOME[n][1],vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,online:!['D','L'].includes(n),next:1+r()*29,flash:0,fcol:null}}
      F={};for(const n of NAMES)F[n]=new Set();for(const [a,b] of EDGES){F[a].add(b);F[b].add(a)}
      S={t:0,interval:30,auto:true,move:true,play:1,cnt:{pub:0,push:0,deliver:0,drop:0},seen:{},nOnline:1e7,nFriends:40,rng:r};
    }
    init();
    const d2=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
    const subscribers=n=>[...F[n]].filter(m=>U[m].online);

    /* ---- 控件 ---- */
    const intCtl=ctx.segmented({label:'位置更新间隔',value:30,options:[[5,'5 秒'],[10,'10 秒'],[15,'15 秒'],[30,'30 秒'],[60,'60 秒']],onChange:v=>{S.interval=v;for(const n of NAMES)U[n].next=Math.min(U[n].next,v);calc()}});
    const playCtl=ctx.segmented({label:'自动演示',value:1,options:[[0,'暂停'],[1,'1×'],[2,'2×']],onChange:v=>{S.play=v}});
    const sOn=ctx.slider({label:'换算：同时在线用户',min:1,max:20,value:10,format:v=>v*100+' 万',onInput:v=>{S.nOnline=v*1e6;calc()}});
    const sFr=ctx.slider({label:'换算：人均在线好友',min:10,max:100,step:5,value:40,format:v=>v+' 人',onInput:v=>{S.nFriends=v;calc()}});
    const btnAG=ctx.button('让 A 与 G 成为好友',()=>{F.A.has('G')?unfriend('A','G'):befriend('A','G')},{primary:true});
    const btnD=ctx.button('让 D 上线',()=>setOnline('D',!U.D.online));
    ctx.button('A 立即上报一次',()=>publish('A'));

    /* ---- 舞台：地图 + Redis 频道条 ---- */
    let W=640,MAPH=320,H=370,sc=1,ox=0,oy=0;
    const svg=ctx.svg(W,H,{label:'用户位置、Redis 频道与消息流'});svg.classList.add('nf-svg');
    const gBase=ctx.svgEl('g'),gEdge=ctx.svgEl('g'),gChip=ctx.svgEl('g'),gUser=ctx.svgEl('g'),gPart=ctx.svgEl('g');
    svg.append(gBase,gEdge,gChip,gUser,gPart);
    const circle=ctx.svgEl('circle',{fill:'#2f6fb30d',stroke:ctx.colors.info,'stroke-dasharray':'5 4','stroke-width':1.4});
    const circleLab=ctx.svgEl('text',{'font-size':11,fill:ctx.colors.info,text:'A 的 5 英里范围'});
    const barLab=ctx.svgEl('text',{'font-size':12,'font-weight':650,fill:'#23352f'});
    gBase.append(circle,circleLab);
    const UE={};
    for(const n of NAMES){
      const ring=ctx.svgEl('circle',{fill:'none','stroke-width':3,opacity:0});
      const dot=ctx.svgEl('circle',{r:n==='A'?11:9,'stroke-width':1.5});
      const lab=ctx.svgEl('text',{'text-anchor':'middle','font-size':n==='A'?12:11,'font-weight':700,text:n});
      const g=ctx.svgEl('g',null,ring,dot,lab);gUser.append(g);
      const chip=ctx.svgEl('rect',{rx:5,height:22,'stroke-width':1});const ct=ctx.svgEl('text',{'text-anchor':'middle','font-size':12,'font-weight':650,class:'mono',text:n});
      gChip.append(chip,ct);UE[n]={ring,dot,lab,chip,ct,cflash:0,cdrop:0};
    }
    gChip.append(barLab);
    const X=x=>ox+x*sc,Y=y=>oy+(MH-y)*sc;
    let chipX={},chipY=0;
    function layout(){
      MAPH=Math.round(util.clamp(W*0.46,210,340));H=MAPH+52;
      svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
      sc=Math.min((W-16)/MW,(MAPH-12)/MH);ox=(W-MW*sc)/2;oy=6+(MAPH-12-MH*sc)/2;
      gBase.querySelectorAll('.nf-bg').forEach(e=>e.remove());
      gBase.prepend(ctx.svgEl('rect',{class:'nf-bg',x:0,y:MAPH,width:W,height:H-MAPH,fill:'#eef2ec'}),ctx.svgEl('line',{class:'nf-bg',x1:0,x2:W,y1:MAPH,y2:MAPH,stroke:'#dbe2da'}));
      const cw=Math.min(40,(W-16)/12-4),gap=((W-16)-cw*12)/11;chipY=MAPH+24;
      NAMES.forEach((n,i)=>{const x=8+i*(cw+gap);chipX[n]=x+cw/2;ctx.attr(UE[n].chip,{x,y:chipY,width:cw});ctx.attr(UE[n].ct,{x:x+cw/2,y:chipY+15.5})});
      ctx.attr(barLab,{x:8,y:MAPH+17,text:W<460?'Redis Pub/Sub：每人一个频道':'Redis Pub/Sub：每个用户一个位置频道（名称预先约定）'});
      drawEdges();
    }
    function drawEdges(){
      gEdge.replaceChildren();
      for(const m of F.A)gEdge.append(ctx.svgEl('line',{'data-f':m,stroke:'#9fb0c7','stroke-width':1.2,'stroke-dasharray':'2 4'}));
    }
    /* ---- 消息粒子（复用元素） ---- */
    const parts=[],pool=[],lpool=[];
    function spawn(o){const el=pool.pop()||ctx.svgEl('circle');if(o.trail){o.ln=lpool.pop()||ctx.svgEl('line',{stroke:ctx.colors.info,'stroke-width':1.2,opacity:.35});gPart.append(o.ln)}gPart.append(el);o.el=el;o.t=0;parts.push(o)}
    function stepParts(dt){
      for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.t+=dt;
        if(p.t>=p.dur){parts.splice(i,1);p.el.remove();pool.push(p.el);if(p.ln){p.ln.remove();lpool.push(p.ln)}p.end&&p.end();continue}}
    }
    function drawParts(){
      for(const p of parts){const k=util.clamp(p.t/p.dur,0,1),e=k<.5?2*k*k:1-(-2*k+2)**2/2;
        const x0=typeof p.from==='function'?p.from():p.from,x1=typeof p.to==='function'?p.to():p.to;
        const x=util.lerp(x0[0],x1[0],e),y=util.lerp(x0[1],x1[1],e);
        ctx.attr(p.el,{cx:x.toFixed(1),cy:y.toFixed(1),r:p.fade?4*(1-k)+1:4,fill:p.color,opacity:p.fade?1-k:1});if(p.ln)ctx.attr(p.ln,{x1:x0[0],y1:x0[1],x2:x.toFixed(1),y2:y.toFixed(1)})}
    }
    const upos=n=>()=>[X(U[n].x),Y(U[n].y)],cpos=n=>[chipX[n],chipY+11];

    /* ---- 发布与订阅 ---- */
    function publish(n){
      const u=U[n];if(!u.online)return;
      S.cnt.pub++;const at={x:u.x,y:u.y};u.flash=1;u.fcol=ctx.colors.info;
      spawn({from:[X(u.x),Y(u.y)],to:cpos(n),dur:0.45,color:ctx.colors.info,end:()=>{
        const subs=subscribers(n);UE[n].cflash=1;
        if(!subs.length){UE[n].cdrop=1;ctx.log(`频道 ${n} 没有订阅者：消息直接丢弃，不像队列那样保留`,'warn');return}
        if(!S.auto)ctx.log(`${n} 发布到频道 ${n}：推送给 ${subs.join('、')} 所在的服务器，共 ${subs.length} 份`,'info');
        for(const m of subs){S.cnt.push++;
          spawn({from:cpos(n),to:upos(m),dur:0.6,color:ctx.colors.info,trail:true,end:()=>{
            const d=d2(at,U[m]),ok=d<=RADIUS;
            if(ok){S.cnt.deliver++;U[m].flash=1;U[m].fcol=ctx.colors.ok;if(m==='A')S.seen[n]={d,t:S.t}}
            else{S.cnt.drop++;spawn({from:upos(m),to:upos(m),dur:0.5,color:'#98a39c',fade:true})}
            if(m==='A'||n==='A')ctx.log(`${n} → ${m}：相距 ${d.toFixed(1)} 英里，${ok?'推给 '+m+' 的手机':'超出 5 英里，服务器丢弃'}`,ok?'ok':null);
            refresh();
          }})}
        refresh();
      }});
      refresh();
    }
    function befriend(a,b){
      F[a].add(b);F[b].add(a);
      ctx.log(`${a}、${b} 成为好友：服务器先校验好友关系与分享权限，再让 ${a} 所在服务器订阅频道 ${b}、${b} 所在服务器订阅频道 ${a}`,'info');
      drawEdges();btnAG.textContent='删除 A 与 G 的好友关系';refresh(true);
    }
    function unfriend(a,b){
      F[a].delete(b);F[b].delete(a);delete S.seen[a==='A'?b:a];
      ctx.log(`${a}、${b} 解除好友：双方所在服务器退订对方的频道`,'warn');
      drawEdges();if(a==='A'&&b==='G')btnAG.textContent='让 A 与 G 成为好友';refresh(true);
    }
    function setOnline(n,on){
      U[n].online=on;if(!on){for(const k of Object.keys(S.seen))if(k===n)delete S.seen[k]}
      ctx.log(on?`${n} 上线：它的服务器订阅 ${[...F[n]].join('、')} 的频道；${n} 成为在线好友频道的新订阅者`:`${n} 下线：它的服务器退订全部好友频道，${n} 的频道也不再有新消息`,on?'info':'warn');
      btnD.textContent=U.D.online?'让 D 下线':'让 D 上线';refresh(true);
    }

    /* ---- 面板 ---- */
    const listBox=h('ul',{class:'nf-list'}),hidden=h('p',{class:'nf-muted'}),clock=h('span',{class:'nf-muted',style:{margin:0}});
    const subBox=h('div');
    const pA=h('div',{class:'sdl-panel'},h('div',{class:'ph',style:{display:'flex',justifyContent:'space-between',gap:'8px'}},h('span',null,'A 的手机：附近好友'),clock),listBox,hidden);
    const pS=h('div',{class:'sdl-panel'},h('div',{class:'ph'},'订阅关系（与 A 有关）'),subBox);
    const calcBox=h('div',{class:'sdl-panel nf-calc'},h('div',{class:'ph'},'按原书规模换算（每秒）'));
    const rows={};
    for(const k of ['qps','push','nodes','mem']){rows[k]={el:h('div',{class:'row'}),l:h('span'),v:h('b')};rows[k].el.append(rows[k].l,rows[k].v);calcBox.append(rows[k].el)}
    ctx.stage.append(h('div',{class:'sdl-grid2 nf-panels'},pA,pS),calcBox);
    const st=ctx.stats([{key:'pub',label:'累计上报'},{key:'push',label:'Redis 推送'},{key:'deliver',label:'推给手机'},{key:'drop',label:'距离过滤丢弃'},{key:'fan',label:'每次上报平均扇出'}]);
    const wan=v=>v>=1e8?(v/1e8).toFixed(2)+' 亿':v>=1e4?util.fmt(v/1e4,v>=1e6?0:1)+' 万':util.fmt(v);
    function calc(){
      const qps=S.nOnline/S.interval,push=qps*S.nFriends,nodes=Math.ceil(push/1e5);
      rows.qps.l.innerHTML=`${wan(S.nOnline)} 在线 ÷ 每 ${S.interval} 秒一次 = 位置上报`;rows.qps.v.textContent=wan(qps)+' 次';
      rows.push.l.innerHTML=`× 平均 ${S.nFriends} 位在线好友 = Redis 推送`;rows.push.v.textContent=wan(push)+' 次';
      rows.nodes.l.innerHTML=`÷ 单机约 10 万次/秒 = 至少需要 Pub/Sub 服务器${S.nOnline===1e7&&S.interval===30&&S.nFriends===40?' <span class="ex">（原书取整：约 1400 万次、140 台）</span>':''}`;rows.nodes.v.textContent=nodes+' 台';
      rows.mem.l.innerHTML='对照：频道占内存约 200 GB（原书估算）<span class="ex">，按 100 GB 一台，放得下只要</span>';rows.mem.v.textContent='2 台';
    }
    function refresh(flashSub){
      st.set('pub',S.cnt.pub);st.set('push',S.cnt.push,'info');st.set('deliver',S.cnt.deliver,'ok');st.set('drop',S.cnt.drop,S.cnt.drop?'warn':null);
      st.set('fan',S.cnt.pub?(S.cnt.push/S.cnt.pub).toFixed(1)+' 份':'—');
      const near=Object.entries(S.seen).filter(([n,v])=>F.A.has(n)&&U[n].online&&S.t-v.t<600).sort((a,b)=>a[1].d-b[1].d);
      listBox.replaceChildren(...(near.length?near.map(([n,v])=>h('li',null,h('span',null,h('b',null,n),' · ',v.d.toFixed(1)+' 英里'),h('span',{class:'sdl-tag '+(S.t-v.t>2*S.interval?'warn':'ok')},Math.round(S.t-v.t)+' 秒前'))):[h('li',{class:'nf-muted'},'还没有收到附近好友的位置')]));
      const far=[...F.A].filter(n=>U[n].online&&!near.find(x=>x[0]===n)),off=[...F.A].filter(n=>!U[n].online);
      hidden.textContent=(far.length?`没显示：${far.join('、')}（未收到 5 英里内的更新）。`:'')+(off.length?`${off.join('、')} 离线，没有连接也就没有订阅。`:'');
      const chA=subscribers('A'),mine=[...F.A];
      subBox.replaceChildren(h('p',{class:'nf-sub'},'频道 ',h('b',null,'A'),' 的订阅者：',chA.length?chA.join('、'):'无',' 所在的服务器（',chA.length,' 个）'),
        h('p',{class:'nf-sub'},'A 所在服务器订阅：',mine.map(n=>U[n].online?n:n+'（离线）').join('、'),' 的频道'),
        h('p',{class:'nf-muted'},'频道 G 的订阅者：'+(subscribers('G').join('、')||'无')+'。一次上报扇出的份数 = 该用户的在线好友数，与谁在附近无关。'));
      if(flashSub){subBox.classList.remove('sdl-flash');void subBox.offsetWidth;subBox.classList.add('sdl-flash')}
      const m=Math.floor(S.t/60),s=Math.floor(S.t%60);clock.textContent=`模拟时间 ${m}:${String(s).padStart(2,'0')}`;
    }
    function draw(){
      ctx.attr(circle,{cx:X(U.A.x),cy:Y(U.A.y),r:RADIUS*sc});ctx.attr(circleLab,{x:X(U.A.x),y:Y(U.A.y)+RADIUS*sc-8,'text-anchor':'middle'});
      for(const l of gEdge.children){const m=l.dataset.f;ctx.attr(l,{x1:X(U.A.x),y1:Y(U.A.y),x2:X(U[m].x),y2:Y(U[m].y)})}
      for(const n of NAMES){const u=U[n],e=UE[n],x=X(u.x),y=Y(u.y);
        ctx.attr(e.dot,{cx:x,cy:y,fill:u.online?(n==='A'?ctx.colors.info:'#5f7268'):'#fff',stroke:u.online?'#fff':'#9aa69f','stroke-dasharray':u.online?null:'3 2'});
        ctx.attr(e.lab,{x,y:y+4,fill:u.online?'#fff':'#8a968f'});
        ctx.attr(e.ring,{cx:x,cy:y,r:(n==='A'?12:10)+8*(1-u.flash),stroke:u.fcol||'#fff',opacity:u.flash});
        const cf=e.cflash;ctx.attr(e.chip,{fill:e.cdrop>0?'#f6ead2':cf>0?'#dde9f6':'#fff',stroke:cf>0?ctx.colors.info:'#c9d4cb'});
      }
      drawParts();
    }
    let acc=0,lastRefresh=0;
    ctx.loop(dt=>{
      const sdt=dt*SPEEDUP*S.play;
      if(S.play){S.t+=sdt;
        if(S.move)for(const n of NAMES){const u=U[n];if(!u.online)continue;const a=(S.rng()-.5)*0.3*dt;const c=Math.cos(a),s=Math.sin(a);[u.vx,u.vy]=[u.vx*c-u.vy*s,u.vx*s+u.vy*c];
          u.x+=u.vx*sdt;u.y+=u.vy*sdt;if(u.x<0.6||u.x>MW-0.6){u.vx*=-1;u.x=util.clamp(u.x,0.6,MW-0.6)}if(u.y<0.6||u.y>MH-0.6){u.vy*=-1;u.y=util.clamp(u.y,0.6,MH-0.6)}}
        if(S.auto)for(const n of NAMES){const u=U[n];if(!u.online)continue;u.next-=sdt;if(u.next<=0){u.next+=S.interval;publish(n)}}
      }
      stepParts(dt);
      for(const n of NAMES){const u=U[n],e=UE[n];u.flash=Math.max(0,u.flash-dt*1.6);e.cflash=Math.max(0,e.cflash-dt*1.5);e.cdrop=Math.max(0,e.cdrop-dt*0.8)}
      acc+=dt;if(acc>1/30){acc=0;draw()}
      lastRefresh+=sdt;if(lastRefresh>1){lastRefresh=0;refresh()}
    });
    ctx.onResize(w=>{W=Math.round(w);layout();draw()});
    calc();refresh();

    /* ---- 场景 ---- */
    function prepare(){
      init();parts.splice(0).forEach(p=>{p.el.remove();pool.push(p.el);if(p.ln){p.ln.remove();lpool.push(p.ln)}});
      S.auto=false;S.move=false;S.play=1;playCtl.set(1,true);intCtl.set(30,true);sOn.set(10,true);sFr.set(40,true);
      btnAG.textContent='让 A 与 G 成为好友';btnD.textContent='让 D 上线';drawEdges();ctx.clearLog();ctx.openLog(true);calc();refresh();draw();
    }
    const hot=async(k,ms)=>{for(const r of Object.values(rows))r.el.classList.remove('hot');rows[k].el.classList.add('hot');await ctx.wait(ms)};
    ctx.scenarios([
      {id:'fanout',label:'一次上报扇出几份',
        ask:'A 有 5 位好友：B、C 在 5 英里内，E、F 在线但离得远，D 离线。A 上报一次位置，Redis 推送几份？几部手机最终收到？',
        insight:'Redis 推送 4 份：频道 A 的订阅者是 4 位在线好友所在的服务器，离线的 D 没有连接，也就没有订阅。订阅端算距离后只推给 B、C，发往 E、F 的 2 份被丢弃。推送量取决于在线好友数，而不是附近好友数，所以原书按「400 位好友 × 10% 在线 = 40 份」估算扇出。随后 B 上报，推给 A、C、G 共 3 份，A 的手机列表出现 B 和「几秒前」的时间戳；累计 2 次上报、7 份推送。',
        async run(){prepare();await ctx.wait(400);publish('A');await ctx.wait(2200);publish('B');await ctx.wait(2400)}},
      {id:'scale',label:'原书规模：每秒多少推送',
        ask:'1000 万人同时在线，每 30 秒上报一次，平均 40 位在线好友。Redis Pub/Sub 每秒要推送多少条？单机按 10 万条/秒算要几台？改成每 10 秒上报呢？',
        insight:'每秒 33.3 万次上报 × 40 ≈ 1333 万次推送（原书取整为约 1400 万），按单机 10 万次/秒至少约 134 台（原书约 140 台）。频道内存估算只要约 200 GB，两台 100 GB 的机器就放得下：内存与吞吐是两张账，瓶颈在推送量。间隔改成 10 秒，推送量变成 3 倍，约 4000 万次/秒、400 台；上方的自动演示里消息也密了 3 倍。',
        async run(){prepare();S.auto=true;S.move=true;await hot('qps',1600);await hot('push',1600);await hot('nodes',1600);await hot('mem',1800);
          intCtl.set(10);await hot('push',1600);await hot('nodes',2600);for(const r of Object.values(rows))r.el.classList.remove('hot')}},
      {id:'friend',label:'加好友、删好友',
        ask:'G 在 A 约 3.6 英里外，但还不是好友。G 上报位置时 A 会收到吗？两人加为好友之后呢？再删掉 A 与 C 的好友关系，C 的上报还会到 A 吗？',
        insight:'加好友前，频道 G 的订阅者只有 B、K，A 收不到 G 的位置。好友关系变化后，双方所在的服务器各自订阅对方的频道，G 的下一次上报就推到了 A。删掉 C 后退订，C 的上报只发给 B、H（B 超出 5 英里被丢弃），不再到 A。频道名称预先约定、一直存在，变化的只是订阅关系；订阅前服务器要校验真实的好友关系和分享权限。',
        async run(){prepare();await ctx.wait(300);publish('G');await ctx.wait(2200);befriend('A','G');await ctx.wait(1400);publish('G');await ctx.wait(2200);unfriend('A','C');await ctx.wait(1200);publish('C');await ctx.wait(2300)}},
    ]);
  }
});
})();
