/* 第 1 章：从零扩展到百万用户。实验一逐步加组件看瓶颈转移；实验二演示主从复制延迟与读己之写。 */
(function(){
const {el:h,util}=SDLab;
const TONE={off:['#fafbf9','#c9d3cb','#9aa89f'],plain:['#fff','#9fb0a5','#23352f'],ok:['#f3faf5','#8fc4a2','#23352f'],warn:['#fdf5e6','#b7791f','#23352f'],bad:['#fbeceb','#c2413b','#23352f']};
const toneOf=r=>r>=1?'bad':r>=.8?'warn':'ok';
/* runtime.css 用 .sdl-stage svg text{fill} 覆盖了 fill 属性，这里把 fill 同步到内联样式。 */
const fixFill=root=>root.querySelectorAll('text[fill]').forEach(t=>{t.style.fill=t.getAttribute('fill')});

/* ---- 教学模型：各层负载、利用率、延迟与成功率（纯函数，便于核对场景数字） ---- */
/* 每层容量按「单位/秒」计：动态请求在 Web 上耗 1 单位，静态文件 0.2 单位；数据库读 1 单位、写 4 单位。 */
const K={fs:.5,sc:.2,cdnHit:.95,wr:.05,order:.02,side:2,sideMs:150,webCap:1000,webMs:20,dbCap:1500,repCap:1500,wCost:4,rMs:8,wMs:15,cacheMs:1,lockMu:20,lockMs:50,tmo:3000};
function lat(ms,rho){return rho>=1?K.tmo:Math.min(K.tmo,ms/(1-rho))}
function model(P){
  const R=P.R,st=R*K.fs,dyn=R-st;
  const cdnOk=P.cdn?st*K.cdnHit:0,stO=st-cdnOk;
  const webLoad=dyn*(1+(P.queue?0:K.wr*K.side))+stO*K.sc;
  const hit=P.cache?P.hit:0,S=P.split?P.shards:1,rep=P.split?P.rep:0;
  const shareOf=i=>S>1?(1-P.celeb)/S+(i===0?P.celeb:0):1;
  const reads=dyn*(1-K.wr),writes=dyn*K.wr;
  let p,webRho,prim=[],repR=[],dbLoad=0;
  const dbUnits=(q,i)=>{const f=shareOf(i);return {r:reads*q*(1-hit)*f,w:writes*q*f}};
  if(!P.split){
    const u=dbUnits(1,0);dbLoad=u.r+u.w*K.wCost;webRho=webLoad/K.webCap+dbLoad/K.dbCap;p=Math.min(1,1/webRho);prim=[webRho];
  }else{
    webRho=webLoad/(P.web*K.webCap);p=Math.min(1,1/webRho);
    for(let i=0;i<S;i++){const u=dbUnits(p,i);prim.push((u.w*K.wCost+(rep?0:u.r))/K.dbCap);if(rep)repR.push(u.r/rep/K.repCap)}
  }
  const pass=x=>Math.min(1,1/Math.max(x,1e-9));
  const ordersIn=P.flash?dyn*K.order*p:0,lockRho=ordersIn/K.lockMu;
  const lw=lat(K.webMs,webRho);
  let rdLat=0,wrLat=0,rdOk=0,wrOk=0;
  for(let i=0;i<S;i++){
    const f=shareOf(i),pr=P.split?prim[i]:webRho,rr=rep?repR[i]:pr;
    rdLat+=f*lat(K.rMs,rr);wrLat+=f*lat(K.wMs,pr);rdOk+=f*pass(rr);wrOk+=f*pass(pr);
  }
  const side=P.queue?0:K.sideMs,p0=P.split?prim[0]:webRho;
  const readLat=Math.min(K.tmo,lw+(P.cache?K.cacheMs:0)+(1-hit)*rdLat);
  const writeLat=Math.min(K.tmo,lw+wrLat+side);
  const orderLat=Math.min(K.tmo,lw+lat(K.wMs,p0)+side+lat(K.lockMs,lockRho));
  const readS=p*(hit+(1-hit)*rdOk),writeS=p*wrOk,orderS=p*pass(p0)*pass(lockRho);
  const oF=P.flash?K.order:0,wF=K.wr-oF,rF=1-K.wr;
  const success=(cdnOk+stO*p+dyn*(rF*readS+wF*writeS+oF*orderS))/R;
  const latency=rF*readLat+wF*writeLat+oF*orderLat;
  const tiers=[{key:P.split?'web':'single',rho:webRho}];
  if(P.split)prim.forEach((r,i)=>tiers.push({key:'prim',i,rho:r}));
  repR.forEach((r,i)=>tiers.push({key:'rep',i,rho:r}));
  if(P.flash)tiers.push({key:'lock',rho:lockRho});
  const bn=tiers.reduce((a,b)=>b.rho>a.rho+1e-9?b:a);
  const servers=P.split?P.web+(P.web>1?1:0)+S*(1+rep)+(P.cache?1:0)+(P.stateless?1:0)+(P.queue?2:0):1+(P.cache?1:0)+(P.queue?2:0);
  return {R,st,dyn,cdnOk,stO,webLoad,dbLoad,p,webRho,prim,rep:repR,reads,writes,hit,S,repN:rep,ordersIn,ordersOk:ordersIn*pass(lockRho)*pass(p0),lockRho,success,latency,orderLat,bn,servers,shareOf};
}

/* ---------------- 实验一：从单机到分片 ---------------- */
SDLab.define({
  id:'scale-journey',chapter:1,
  title:'从单机到分片：瓶颈在哪一层',
  summary:'拖动流量，逐个加上拆库、负载均衡、缓存、CDN、读副本、消息队列和分片。圆点是流过各层的请求，框里是利用率；红框是当前瓶颈，超出的请求在那里排队到超时。',
  caveat:'每层延迟按「服务时间 ÷ (1 − 利用率)」近似，利用率到 100% 按 3 秒超时计。容量是示意值：Web 每台 1,000 单位/秒，数据库每台 1,500 单位/秒，一次写按 4 次读计；一半请求是静态文件，动态请求里 5% 是写。忽略从库回放写入的开销、网络耗时和缓存容量；队列与 Worker 按需扩容，不模拟积压。',
  mount(ctx){
    const C=ctx.colors;
    ctx.css('sj',`
.sj-diag{font-size:14px;margin:10px 0 8px;padding:8px 12px;border-radius:8px;background:#f6f8f4;border-left:3px solid #9fb0a5;line-height:1.6}
.sj-diag.bad{border-color:#c2413b;background:#fbeeec}.sj-diag.warn{border-color:#b7791f;background:#fbf4e6}.sj-diag.ok{border-color:#2f8f5b}
.sj-comp{display:flex;flex-wrap:wrap;gap:6px}
.sj-comp button{font-size:13px;padding:3px 10px}
.sj-dim{opacity:.5}
.sj-svg{margin:0 auto}
.sj-legend{font-size:12px;color:#66756d;margin:4px 0 0}
.sj-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin:0 4px 0 10px;vertical-align:0}
.sj-legend i:first-child{margin-left:0}
.sj-tbl th,.sj-tbl td{white-space:nowrap}
`);
    const LV=[100,200,300,500,700,1000,1500,2000,3000,5000,7000,10000,15000,20000];
    const P={R:300,split:false,web:1,rep:0,shards:1,cache:false,hit:.9,cdn:false,queue:false,stateless:false,celeb:0,flash:false};
    const sR=ctx.slider({label:'入口流量',min:0,max:LV.length-1,value:LV.indexOf(P.R),format:v=>util.fmt(LV[v])+' 次/秒',onInput:v=>{P.R=LV[v];update()}});
    const sWeb=ctx.slider({label:'Web 服务器',min:1,max:12,value:1,format:v=>v+' 台',onInput:v=>{P.web=v;if(v>1)needSplit();update()}});
    const sRep=ctx.slider({label:'读副本（每个分片）',min:0,max:3,value:0,format:v=>v?v+' 个':'无',onInput:v=>{P.rep=v;if(v)needSplit();update()}});
    const sSh=ctx.slider({label:'分片数（按 user_id）',min:1,max:6,value:1,format:v=>v>1?v+' 个':'不分片',onInput:v=>{P.shards=v;if(v>1)needSplit();update()}});
    const row=h('div',{class:'sj-comp',role:'group','aria-label':'组件开关'}),comp={};
    for(const [k,l] of [['split','拆分数据库'],['cache','缓存'],['cdn','CDN'],['queue','消息队列'],['stateless','共享会话（无状态 Web）'],['flash','秒杀：下单都改同一行库存']]){comp[k]=h('button',{type:'button','aria-pressed':'false',onclick:()=>setComp(k,!P[k])},l);row.append(comp[k])}
    ctx.controls.append(h('div',{class:'sdl-ctrl wide'},h('span',{class:'lbl'},h('span',null,'组件（点击加上或去掉）')),row));
    const sHit=ctx.slider({label:'缓存命中率',min:50,max:99,value:90,format:v=>v+'%',onInput:v=>{P.hit=v/100;update()}});
    const sCel=ctx.slider({label:'名人热点占数据库流量',min:0,max:60,step:5,value:0,format:v=>v+'%',onInput:v=>{P.celeb=v/100;update()}});
    ctx.button('下线一台 Web',killWeb);
    function needSplit(){if(!P.split){P.split=true;ctx.log('先把数据库拆到独立服务器，才能单独扩 Web 或数据库','info')}}
    function setComp(k,v){
      P[k]=v;
      if(k==='split'&&!v){P.web=1;P.rep=0;P.shards=1}
      update();
    }
    function sync(){
      sR.set(LV.indexOf(P.R),true);sWeb.set(P.web,true);sRep.set(P.rep,true);sSh.set(P.shards,true);sHit.set(Math.round(P.hit*100),true);sCel.set(Math.round(P.celeb*100),true);
      for(const k in comp)comp[k].setAttribute('aria-pressed',String(!!P[k]));
      sHit.input.disabled=!P.cache;sHit.el.classList.toggle('sj-dim',!P.cache);
      sCel.el.classList.toggle('sj-dim',P.shards<2);
    }
    function killWeb(){
      if(P.web<2){ctx.log('只剩 1 台 Web：再下线就全站不可用。这就是单点故障（SPOF）','bad');return}
      const n=P.web;P.web--;
      if(P.stateless)ctx.log(`下线 1 台（${n} → ${P.web}）：会话在共享存储里，其余机器直接接手，用户无感知`,'ok');
      else ctx.log(`下线 1 台（${n} → ${P.web}）：会话存在这台机器内存里（sticky session），约 1/${n} 的登录用户被迫重新登录`,'bad');
      ctx.openLog();update();flash('web');
    }

    /* ---- 舞台 ---- */
    const holder=h('div');
    const legend=h('p',{class:'sj-legend'},h('i',{style:{background:C.ok}}),'请求流动正常',h('i',{style:{background:C.warn}}),'目标层接近饱和',h('i',{style:{background:C.bad}}),'目标层过载、排队超时',h('i',{style:{background:'none',border:'1px dashed #9aa89f',borderRadius:'2px'}}),'还没加入的组件');
    const diag=h('p',{class:'sj-diag','aria-live':'polite'});
    const table=h('table',{class:'sdl-table sj-tbl'});
    ctx.stage.append(holder,legend,diag,h('div',{class:'sdl-scroll'},table));
    const stats=ctx.stats([{key:'ok',label:'成功率'},{key:'lat',label:'动态请求平均耗时'},{key:'order',label:'秒杀下单（成功 / 到达）'},{key:'srv',label:'服务器台数（不含 CDN）'}]);
    let G=null,svg=null,N={},E={},dbG=null,chipG=null,narrow=null,M=null;
    function geo(n){
      return n?{W:360,H:520,user:[130,6,100,42],cdn:[10,74,130,46],lb:[220,74,130,46],web:[10,148,340,74],cache:[10,252,104,46],sess:[128,252,104,46],queue:[246,252,104,46],db:[10,330,340,184],
        e:{uc:[150,48,86,74],ul:[210,48,274,74],cw:[75,120,75,148],lw:[285,120,285,148],wc:[62,222,62,252],ws:[180,222,180,252],wq:[298,222,298,252],cd:[62,298,62,330],wd:[121,222,121,330],lk:[0,0,0,1]}}
      :{W:860,H:312,user:[8,124,80,56],cdn:[124,20,104,52],lb:[124,124,104,56],web:[264,72,142,150],sess:[264,254,142,48],cache:[444,20,112,52],queue:[444,254,112,48],db:[592,20,262,282],
        e:{uc:[88,138,124,50],ul:[88,152,124,152],cw:[228,46,264,90],lw:[228,152,264,152],wc:[406,98,444,50],cd:[556,46,592,46],wd:[406,152,592,152],ws:[335,222,335,254],wq:[406,204,444,268],lk:[0,0,0,1]}};
    }
    function build(){
      G=geo(narrow);holder.replaceChildren();
      svg=ctx.svg(G.W,G.H,{parent:holder,label:'架构示意：用户、CDN、负载均衡、Web、缓存、会话存储、消息队列与数据库',maxWidth:narrow?460:null});
      svg.classList.add('sj-svg');
      const edgeG=ctx.svgEl('g'),dotG=ctx.svgEl('g');svg.append(edgeG);
      N={};E={};
      for(const [k,c] of Object.entries(G.e)){
        const line=ctx.svgEl('line',{x1:c[0],y1:c[1],x2:c[2],y2:c[3],stroke:'#c3cec6','stroke-width':1.5});edgeG.append(line);
        const dots=util.range(6).map(()=>{const d=ctx.svgEl('circle',{r:3.2,fill:C.ok,visibility:'hidden'});dotG.append(d);return d});
        E[k]={c,line,dots,len:Math.hypot(c[2]-c[0],c[3]-c[1]),n:0,phase:Math.random(),speed:1,color:C.ok};
      }
      for(const k of ['user','cdn','lb','web','cache','sess','queue','db']){
        const r=G[k],g=ctx.svgEl('g'),big=r[3]>60&&k!=='user';
        const rect=ctx.svgEl('rect',{x:r[0],y:r[1],width:r[2],height:r[3],rx:9,'stroke-width':1.5});
        const cx=r[0]+r[2]/2,t1=ctx.svgEl('text',{x:cx,y:big?r[1]+19:r[1]+r[3]/2-3,'text-anchor':'middle','font-size':13,'font-weight':650});
        const t2=ctx.svgEl('text',{x:cx,y:big?r[1]+36:r[1]+r[3]/2+14,'text-anchor':'middle','font-size':12});
        g.append(rect,t1,t2);svg.append(g);N[k]={g,rect,t1,t2,r};
      }
      chipG=ctx.svgEl('g');dbG=ctx.svgEl('g');const lkG=ctx.svgEl('g');lkG.append(E.lk.line);svg.append(chipG,dbG,lkG,dotG);
    }
    function paint(k,tone,t1,t2){const n=N[k],[f,s,ink]=TONE[tone];ctx.attr(n.rect,{fill:f,stroke:s,'stroke-dasharray':tone==='off'?'5 4':null,'stroke-width':tone==='bad'?2.2:1.5});ctx.attr(n.t1,{text:t1,fill:ink});ctx.attr(n.t2,{text:t2||'',fill:tone==='off'?'#9aa89f':'#4f5f57'})}
    function flash(k){const n=N[k];if(!n)return;n.g.animate&&n.g.animate([{opacity:.25},{opacity:1}],{duration:700})}
    const pct=r=>Math.round(r*100)+'%';
    const ms=v=>v>=K.tmo?'超时':Math.round(v)+' 毫秒';
    function drawChips(){
      chipG.replaceChildren();const r=G.web,n=P.split?P.web:0;if(!n)return;
      const perRow=narrow?12:4,cw=narrow?23:28,gap=narrow?4.5:5;
      const tot=Math.min(n,perRow)*(cw+gap)-gap,x0=r[0]+(r[2]-tot)/2,y0=narrow?r[1]+44:r[1]+50;
      const tone=toneOf(M.webRho),fill=Math.min(1,M.webRho);
      for(let i=0;i<n;i++){
        const x=x0+(i%perRow)*(cw+gap),y=y0+Math.floor(i/perRow)*(22+gap);
        chipG.append(ctx.svgEl('rect',{x,y,width:cw,height:20,rx:3,fill:'#fff',stroke:TONE[tone][1]}),ctx.svgEl('rect',{x:x+2,y:y+18-16*fill,width:cw-4,height:16*fill,rx:2,fill:TONE[tone][1],opacity:.55}));
      }
    }
    function drawDb(){
      dbG.replaceChildren();
      const lockH=P.flash?44:0;
      const base=P.split?62+M.repN*24:44;
      if(narrow){const need=Math.max(96,base+(P.flash?18+lockH:0)+8);G.db[3]=need;G.H=G.db[1]+need+6;ctx.attr(svg,{viewBox:`0 0 ${G.W} ${G.H}`});ctx.attr(N.db.rect,{height:need})}
      const [x,y,w,hh]=G.db;
      if(!P.split){
        paint('db','off','数据库','与 Web 在同一台机器');
      }else{
        ctx.attr(N.db.rect,{fill:'#fbfcfa',stroke:'#c9d3cb','stroke-dasharray':null,'stroke-width':1.2});ctx.attr(N.db.t1,{text:''});ctx.attr(N.db.t2,{text:''});
        const S=M.S,gap=6,cw=(w-12-(S-1)*gap)/S,wide=cw>=64;
        for(let i=0;i<S;i++){
          const cx0=x+6+i*(cw+gap),hot=P.celeb>0&&S>1&&i===0;
          dbG.append(ctx.svgEl('text',{x:cx0+cw/2,y:y+17,'text-anchor':'middle','font-size':12,'font-weight':650,fill:hot?C.series[3]:C.muted,text:(S===1?'数据库':(wide?'分片 '+(i+1):'S'+(i+1)))+(hot?' ★':'')}));
          const pr=M.prim[i],t=toneOf(pr);
          dbG.append(ctx.svgEl('rect',{x:cx0,y:y+24,width:cw,height:36,rx:6,fill:TONE[t][0],stroke:TONE[t][1],'stroke-width':t==='bad'?2.2:1.5}));
          dbG.append(ctx.svgEl('text',{x:cx0+cw/2,y:y+47,'text-anchor':'middle','font-size':12,'font-weight':650,text:(wide?'主库 ':'')+pct(pr)}));
          for(let j=0;j<M.repN;j++){
            const rr=M.rep[i],t2=toneOf(rr),ry=y+66+j*24;
            dbG.append(ctx.svgEl('rect',{x:cx0+3,y:ry,width:cw-6,height:20,rx:4,fill:TONE[t2][0],stroke:TONE[t2][1]}));
            dbG.append(ctx.svgEl('text',{x:cx0+cw/2,y:ry+14.5,'text-anchor':'middle','font-size':12,text:(wide?'从库 ':'')+pct(rr)}));
          }
        }
        if(P.celeb>0&&S>1&&!narrow)dbG.append(ctx.svgEl('text',{x:x+6,y:y+hh-lockH-10,'font-size':12,fill:C.series[3],text:'★ 名人所在分片'}));
      }
      if(P.flash){
        const t=toneOf(M.lockRho),ly=narrow?y+base+18:y+hh-lockH-2;
        if(P.split){const lx=x+7.5,e=E.lk;e.c=[lx,y+60,lx,ly];e.len=Math.max(1,ly-y-60);ctx.attr(e.line,{x1:lx,y1:y+60,x2:lx,y2:ly})}
        dbG.append(ctx.svgEl('rect',{x:x+6,y:ly,width:w-12,height:lockH-4,rx:6,fill:TONE[t][0],stroke:TONE[t][1],'stroke-width':t==='bad'?2.2:1.5}));
        dbG.append(ctx.svgEl('text',{x:x+w/2,y:ly+16,'text-anchor':'middle','font-size':12,'font-weight':650,text:'热点库存行锁（每单持锁 50 毫秒）'}));
        dbG.append(ctx.svgEl('text',{x:x+w/2,y:ly+32,'text-anchor':'middle','font-size':12,text:`到达 ${util.fmt(M.ordersIn,1)} 单/秒 · 上限 20 · ${pct(M.lockRho)}`}));
      }
    }
    function setEdge(k,flow,rho){
      const e=E[k];if(!e)return;
      e.n=flow>0.5?util.clamp(1+Math.floor(Math.log10(flow)),1,6):0;
      const t=rho==null?'ok':toneOf(rho);e.color=t==='bad'?C.bad:t==='warn'?C.warn:C.ok;e.speed=t==='bad'?.35:t==='warn'?.6:1;
      ctx.attr(e.line,{stroke:e.n?'#b9c6bd':'#e3e9e1','stroke-dasharray':e.n?null:'4 4'});
      e.dots.forEach((d,i)=>{d.setAttribute('fill',e.color);if(i>=e.n)d.setAttribute('visibility','hidden')});
    }
    function bnName(){const b=M.bn;return {single:'单台服务器',web:'Web 层',prim:M.S>1?`分片 ${b.i+1} 的主库`:'主库',rep:M.S>1?`分片 ${b.i+1} 的从库`:'从库',lock:'热点行锁'}[b.key]}
    function update(){
      sync();M=model(P);
      const web=P.split?P.web:1,lb=P.split&&P.web>1;
      paint('user','plain','用户',util.fmt(P.R)+' 次/秒');
      paint('cdn',P.cdn?'ok':'off',P.cdn?'CDN':'+ CDN',P.cdn?'静态命中 95%':'静态文件回源');
      paint('lb',lb?'ok':'off',lb?'负载均衡器':'无负载均衡',lb?(P.stateless?'任意转发':'粘性会话'):'单台直连');
      const wt=toneOf(M.webRho);
      paint('web',wt,P.split?`Web 服务器 ×${web}`:'单台服务器',P.split?'利用率 '+pct(M.webRho):'Web + 数据库 · '+pct(M.webRho));
      paint('cache',P.cache?'ok':'off',P.cache?'缓存':'+ 缓存',P.cache?'命中 '+Math.round(P.hit*100)+'%':'读全部打到库');
      paint('sess',P.stateless&&P.split?'ok':'off',P.stateless?'会话存储':'+ 共享会话',P.stateless?'Web 无状态':'会话在 Web 内存');
      paint('queue',P.queue?'ok':'off',P.queue?'队列 → Worker':'+ 消息队列',P.queue?'异步 '+util.fmt(M.writes*M.p)+'/秒':'邮件等同步执行');
      drawChips();drawDb();
      const dbRead=Math.max(...(M.repN?M.rep:M.prim)),dbW=Math.max(...M.prim);
      setEdge('uc',P.cdn?M.st:0);setEdge('cw',P.cdn?M.stO:0,M.webRho);
      setEdge('ul',M.dyn+(P.cdn?0:M.st),M.webRho);setEdge('lw',M.dyn+(P.cdn?0:M.st),M.webRho);
      setEdge('wc',P.cache?M.reads*M.p:0);setEdge('cd',P.cache&&P.split?M.reads*M.p*(1-M.hit):0,dbRead);
      setEdge('wd',P.split?M.writes*M.p+(P.cache?0:M.reads*M.p):0,P.cache?dbW:Math.max(dbW,dbRead));
      setEdge('ws',P.stateless&&P.split?M.dyn*M.p:0);setEdge('lk',P.flash&&P.split?M.ordersIn:0,M.lockRho);ctx.attr(E.lk.line,{visibility:P.flash&&P.split?'visible':'hidden'});setEdge('wq',P.queue?M.writes*M.p:0);
      // 诊断
      const b=M.bn,top=b.rho;let tone=toneOf(top),msg;
      const name=bnName();
      if(top>=1){
        if(b.key==='single')msg=`单台服务器利用率 ${pct(top)}：Web 和数据库抢同一台机器的 CPU、内存和磁盘，超出的请求排队到超时。先把数据库拆出去。`;
        else if(b.key==='web')msg=`Web 层利用率 ${pct(top)}，超出的请求在这里排队到超时。加 Web 服务器（负载均衡器会自动出现），或用 CDN、消息队列卸掉静态文件和异步任务。`;
        else if(b.key==='lock')msg=`热点行锁：这一行每单持锁 50 毫秒，每秒最多提交 20 单，现在到达 ${util.fmt(M.ordersIn,1)} 单，多出的在锁队列里等到超时。加 Web、加从库都不会提高这个上限；要缩短事务、拆分库存或把该商品的下单串行化。`;
        else if(b.key==='prim'&&P.celeb>0&&M.S>1&&b.i===0)msg=`${name}利用率 ${pct(top)}：名人的请求都落在同一个 user_id 所在的分片，加分片只摊薄其他用户，摊不开它；同分片的普通用户也被拖慢。读取可用缓存分担，写入要拆桶或单独处理。`;
        else if(b.key==='prim'&&!M.repN&&M.reads*M.p*(1-M.hit)*M.shareOf(b.i)>M.writes*M.p*M.shareOf(b.i)*K.wCost)msg=`${name}利用率 ${pct(top)}，大部分负载是读。加缓存、提高命中率或加读副本来分担读取。`;
        else if(b.key==='prim')msg=`${name}利用率 ${pct(top)}，主要是写入。读副本不分担写，缓存也挡不住写；需要按 user_id 分片。`;
        else msg=`${name}利用率 ${pct(top)}：加从库或提高缓存命中率。`;
      }else if(top>=.8)msg=`接近饱和：${name}利用率 ${pct(top)}，排队让它的耗时已是空闲时的 ${Math.round(1/(1-top))} 倍。再涨一点流量就会超时。`;
      else msg=`各层都有余量，最忙的是${/^[A-Z]/.test(name)?' ':''}${name}（${pct(top)}）。没有瓶颈时不必急着加组件。`;
      diag.className='sj-diag '+tone;diag.textContent=msg;
      stats.set('ok',util.pct(M.success,1),M.success>.995?'ok':M.success>.95?'warn':'bad');
      stats.set('lat',ms(M.latency),M.latency>=1000?'bad':M.latency>=200?'warn':'ok');
      stats.set('order',P.flash?`${util.fmt(M.ordersOk,1)} / ${util.fmt(M.ordersIn,1)}`:'未开启',P.flash?(M.ordersOk<M.ordersIn-0.05?'bad':'ok'):null);
      stats.set('srv',M.servers+' 台','info');
      // 明细表
      const rows=[[P.split?'Web 层':'单台服务器',P.split?M.webLoad:M.webLoad+M.dbLoad,P.split?web*K.webCap:null,M.webRho,lat(K.webMs,M.webRho)]];
      if(P.split){
        const busy=M.prim.indexOf(Math.max(...M.prim));
        rows.push([M.S>1?`主库（最忙：分片 ${busy+1}）`:'主库',M.prim[busy]*K.dbCap,K.dbCap,M.prim[busy],lat(K.wMs,M.prim[busy])]);
        if(M.repN){const r=Math.max(...M.rep);rows.push(['从库（最忙的一个）',r*K.repCap,K.repCap,r,lat(K.rMs,r)])}
      }
      if(P.flash)rows.push(['热点行锁（单/秒）',M.ordersIn,K.lockMu,M.lockRho,lat(K.lockMs,M.lockRho)]);
      table.replaceChildren(h('thead',null,h('tr',null,h('th',null,'层'),h('th',null,'负载（单位/秒）'),h('th',null,'容量'),h('th',null,'利用率'),h('th',null,'平均耗时'))),
        h('tbody',null,rows.map(([n,l,c,r,t])=>h('tr',null,h('td',null,n),h('td',null,util.fmt(l)),h('td',null,c?util.fmt(c):'与数据库共用'),h('td',{style:{color:r>=1?C.bad:r>=.8?C.warn:null,fontWeight:r>=.8?'700':null}},pct(r)),h('td',null,ms(t))))));
      fixFill(svg);
    }
    ctx.onResize(w=>{const n=w<800;if(n!==narrow){narrow=n;build();update()}});
    let acc=0;
    ctx.loop(dt=>{
      acc+=dt;if(acc<1/30)return;const d=acc;acc=0;
      for(const e of Object.values(E)){
        if(!e.n)continue;e.phase=(e.phase+d*80*e.speed/e.len)%1;const c=e.c;
        for(let i=0;i<e.n;i++){const f=(e.phase+i/e.n)%1;ctx.attr(e.dots[i],{cx:c[0]+(c[2]-c[0])*f,cy:c[1]+(c[3]-c[1])*f,visibility:'visible'})}
      }
    });

    /* ---- 预设场景 ---- */
    const BASE={R:300,split:false,web:1,rep:0,shards:1,cache:false,hit:.9,cdn:false,queue:false,stateless:false,celeb:0,flash:false};
    function prepare(o){Object.assign(P,BASE,o);ctx.clearLog();update()}
    const brief=()=>{
      if(!P.split)return '单台服务器 '+pct(M.webRho)+(P.flash?' · 行锁 '+pct(M.lockRho):'');
      const mx=Math.max(...M.prim),i=M.prim.indexOf(mx),out=['Web '+pct(M.webRho),'主库 '+pct(mx)+(M.S<2?'':mx-Math.min(...M.prim)>.005?`（分片 ${i+1}；其余 ${pct(Math.min(...M.prim))}）`:'（每个分片）')];
      if(M.repN)out.push('从库 '+pct(Math.max(...M.rep)));if(P.flash)out.push('行锁 '+pct(M.lockRho));return out.join(' · ');
    };
    async function step(o,text,wait=1300){Object.assign(P,o);update();ctx.log(text+' → '+brief(),toneOf(M.bn.rho));await ctx.wait(wait)}
    ctx.scenarios([
      {id:'journey',label:'从单机一路扩到分片',
        ask:'流量从 300 次/秒涨到 20,000 次/秒。第一个撑不住的是哪一层？每加一个组件，瓶颈会转移到哪里？',
        insight:'单机在 1,000 次/秒时先满（103%）。拆库后流量涨到 3,000 次/秒，Web 先顶不住（195%）；加到 3 台 Web，瓶颈立刻转到主库（115%），缓存把它压回 30%。到 10,000 次/秒，CDN 和消息队列卸掉静态文件与异步任务，Web 从 217% 降到 168%，仍要加到 6 台；这时主库又到 98%，加 1 个读副本降到 67%。20,000 次/秒时写入把主库推到 133%，读副本分担不了写，分成 2 片后各 67%。每一步都是先看哪层先满，再加对应的能力。',
        async run(){
          prepare({});ctx.openLog();ctx.log('单机，300 次/秒 → '+brief(),'ok');await ctx.wait(900);
          await step({R:1000},'流量到 1,000 次/秒');
          await step({split:true},'拆分数据库');
          await step({R:3000},'流量到 3,000 次/秒');
          await step({web:3},'加到 3 台 Web + 负载均衡');
          await step({cache:true,hit:.9},'加缓存，命中率 90%');
          await step({R:10000},'流量到 10,000 次/秒');
          await step({cdn:true,queue:true},'加 CDN 和消息队列');
          await step({web:6},'Web 加到 6 台');
          await step({rep:1},'加 1 个读副本');
          await step({R:20000,web:12},'流量到 20,000 次/秒，Web 加到 12 台');
          await step({shards:2},'按 user_id 分成 2 个分片');
          await step({stateless:true},'会话移到共享存储，Web 可随时增减',600);
        }},
      {id:'lock',label:'只加 Web 服务器',
        ask:'秒杀时每单都要改同一行库存，行锁每单持有 50 毫秒。现在只有 1 台 Web 且已满载，每秒成功约 15 单。加到 3 台 Web 后，每秒成功下单能涨到多少？',
        insight:'只涨到 20 单/秒就封顶，约 1.3 倍。1 台 Web 时它挡住了一半请求，行锁只收到 15.4 单/秒（利用率 77%）；加 Web 后浏览请求恢复正常，但放进来的并发事务变成 30 单/秒，锁队列排满，三分之一的下单等到超时。再加到 6 台也一样：Web 没有增加同一行数据的并行修改能力。',
        async run(){
          prepare({R:3000,split:true,cache:true,hit:.9,flash:true});ctx.openLog();ctx.log('1 台 Web → '+brief(),toneOf(M.bn.rho));await ctx.wait(2500);
          await step({web:3},'加到 3 台 Web',3500);
          await step({web:6},'再加到 6 台 Web',2500);
        }},
      {id:'hit',label:'缓存命中率从 98% 掉到 80%',
        ask:'每秒 4,750 次读，缓存命中率 98% 时主库利用率 73%。命中率只掉 18 个百分点到 80%，回源读会变成几倍？主库扛得住吗？',
        insight:'回源读从 95 次/秒涨到 950 次/秒，是 10 倍，不是多 18%。主库依次到 83%、98%、114%、130%，部分读写开始超时。所以排查时要把命中率换算成回源 QPS，再看数据库利用率和延迟；最后加 1 个读副本，把读从主库挪走，主库降到 67%。',
        async run(){
          prepare({R:10000,split:true,web:6,cache:true,hit:.98,cdn:true,queue:true});ctx.openLog();ctx.log('命中率 98%：回源 95 次/秒，主库 '+pct(M.prim[0]),'ok');await ctx.wait(1600);
          for(const x of [95,90,85,80]){P.hit=x/100;update();ctx.log(`命中率 ${x}%：回源 ${util.fmt(M.reads*(1-P.hit))} 次/秒，主库 ${pct(M.prim[0])}`,M.prim[0]>=1?'bad':M.prim[0]>=.8?'warn':'ok');await ctx.wait(1700)}
          await step({rep:1},'加 1 个读副本',1800);
        }},
      {id:'celeb',label:'名人热点压垮一个分片',
        ask:'按 user_id 分 3 片，名人占数据库流量的 40%（暂未加缓存）。把分片从 3 个加到 6 个，名人所在的分片利用率能降一半吗？',
        insight:'降不了一半：分片 1 只从 230% 降到 192%，其他分片从 77% 降到 38%。同一个 user_id 永远落在同一个分片，加分片只摊薄普通用户，和名人同分片的普通用户也一起超时。打开 90% 命中率的缓存后，名人的读被缓存接住，分片 1 降到 49%，但仍约是其他分片（10%）的 5 倍，因为写入还集中在那里。',
        async run(){
          prepare({R:10000,split:true,web:6,cdn:true,queue:true,shards:3,celeb:.4});ctx.openLog();ctx.log('3 个分片 → '+brief(),toneOf(M.bn.rho));await ctx.wait(2400);
          await step({shards:6},'分片加到 6 个',3000);
          await step({cache:true,hit:.9},'加缓存，命中率 90%',2500);
        }},
    ]);
    update();
  }
});

/* ---------------- 实验二：复制延迟与读己之写 ---------------- */
SDLab.define({
  id:'replica-lag',chapter:1,
  title:'复制延迟：刚改的昵称为什么又变回去',
  summary:'用户把昵称从 A 改成 B（版本 41 → 42），写入主库后接着刷新几次。换一种读取策略、拖动复制延迟，或点时间轴加一次刷新，看每次读到新值还是旧值。',
  caveat:'复制延迟固定：从库 1 落后 L，从库 2 落后 L/2，期间没有其他写入。一次读按 5 毫秒计；带版本号读最多等 300 毫秒，仍没有从库追上就改读主库。「缓存未失效」表示读路径前面的缓存还存着 v41。',
  mount(ctx){
    const C=ctx.colors,T=3000;
    ctx.css('rlg',`
.rlg-list{margin:8px 0 0;padding:0;list-style:none;font-size:13px;display:grid;gap:4px}
.rlg-list li{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;line-height:1.5}
.rlg-list .t{font-family:ui-monospace,Menlo,monospace;color:#66756d;min-width:3.6em}
.rlg-svg{cursor:crosshair}
`);
    const S={strat:'rr',lag:800,cache:false,reads:[300,500,700,1200]};
    const stratCtl=ctx.segmented({label:'读取策略',wide:true,value:S.strat,options:[['rr','读写分离：轮流读从库'],['window','写后 1 秒内读主库'],['primary','这类读一律走主库'],['version','带版本号读（min_version=42）']],onChange:v=>{S.strat=v;replay()}});
    const lagCtl=ctx.slider({label:'复制延迟 L',hint:'从库 1 落后 L，从库 2 落后 L/2',min:0,max:3000,step:100,value:S.lag,format:v=>util.fmt(v)+' 毫秒',onInput:v=>{S.lag=v;compute();render(T)},onChange:()=>replay()});
    const cacheCtl=ctx.toggle({label:'写后没删缓存（仍是 v41）',value:false,onChange:v=>{S.cache=v;build();replay()}});
    ctx.button('重播',()=>replay(),{primary:true});
    ctx.button('清空刷新',()=>{S.reads=[];compute();render(T)});
    const holder=h('div');const list=h('ol',{class:'rlg-list','aria-live':'polite'});
    ctx.stage.append(holder,h('p',{class:'sdl-note'},'点时间轴上的任意位置，可以在那一刻加一次刷新（最多 8 次）。'),list);
    const stats=ctx.stats([{key:'stale',label:'读到旧值'},{key:'prim',label:'主库承担的读'},{key:'lat',label:'平均读耗时'}]);
    let res=[],narrow=null,G,svg,future,head,headT,dyn;
    const lagOf=n=>n==='r1'?S.lag:n==='r2'?S.lag/2:0;
    const NAME={p:'主库',r1:'从库 1',r2:'从库 2',cache:'缓存'};
    function compute(){
      const rs=[...S.reads].sort((a,b)=>a-b);
      res=rs.map((t,k)=>{
        let node,wait=0;
        if(S.cache)return {t,node:'cache',wait:0,val:'A',stale:true};
        if(S.strat==='primary'||(S.strat==='window'&&t<1000))node='p';
        else if(S.strat==='version'){
          const ok=['r1','r2'].filter(n=>lagOf(n)<=t);
          if(ok.length)node=ok.length>1?(k%2?'r2':'r1'):ok[0];
          else{const gap=lagOf('r2')-t;if(gap<=300){wait=gap;node='r2'}else{wait=300;node='p'}}
        }else node=k%2?'r2':'r1';
        const fresh=lagOf(node)<=t+wait;
        return {t,node,wait,val:fresh?'B':'A',stale:!fresh};
      });
    }
    function rowsList(){return S.cache?['user','cache','p','r1','r2']:['user','p','r1','r2']}
    function build(){
      const rows=rowsList();
      G={W:narrow?360:660,x0:narrow?58:74,rh:narrow?46:44,top:30};G.x1=G.W-14;G.H=G.top+rows.length*G.rh+18;
      G.y=k=>G.top+rows.indexOf(k)*G.rh+G.rh/2;G.x=t=>G.x0+(G.x1-G.x0)*util.clamp(t,0,T)/T;
      holder.replaceChildren();
      svg=ctx.svg(G.W,G.H,{parent:holder,label:'时间轴：主库、从库、缓存的版本变化与每次刷新读到的值',maxWidth:narrow?480:null});
      svg.classList.add('rlg-svg');
      svg.addEventListener('click',ev=>{
        const pt=svg.createSVGPoint();pt.x=ev.clientX;pt.y=ev.clientY;const m=svg.getScreenCTM();if(!m)return;const q=pt.matrixTransform(m.inverse());
        if(q.x<G.x0||q.x>G.x1)return;if(S.reads.length>=8){ctx.announce('最多 8 次刷新');return}
        const t=Math.round((q.x-G.x0)/(G.x1-G.x0)*T/50)*50;S.reads.push(t);compute();render(T);
        const r=res.find(x=>x.t===t);if(r)ctx.announce(`${(t/1000).toFixed(2)} 秒刷新：读到 ${r.val}`);
      });
      // 静态：行标签与时间刻度
      for(const k of rows){
        svg.append(ctx.svgEl('text',{x:6,y:G.y(k)+4,'font-size':12,'font-weight':650,text:k==='user'?'用户':NAME[k]}));
        if(k!=='user')svg.append(ctx.svgEl('line',{x1:G.x0,x2:G.x1,y1:G.y(k),y2:G.y(k),stroke:'#e3e9e1'}));
      }
      const step=narrow?1000:500;
      for(let t=0;t<=T;t+=step)svg.append(ctx.svgEl('text',{x:G.x(t),y:G.H-4,'text-anchor':'middle','font-size':12,fill:C.muted,text:(t/1000)+' 秒'}));
      dyn=ctx.svgEl('g');future=ctx.svgEl('rect',{y:G.top-6,height:G.H-G.top-12,fill:'#fff',opacity:.78});
      head=ctx.svgEl('line',{y1:G.top-8,y2:G.H-20,stroke:C.info,'stroke-width':1.5});headT=ctx.svgEl('text',{y:G.top-12,'text-anchor':'middle','font-size':12,fill:C.info,'font-weight':650});
      svg.append(dyn,future,head,headT);
    }
    function band(k,from,label0,label1){
      const y=G.y(k),x0=G.x0,xs=G.x(from),x1=G.x1,g=[];
      if(xs>x0)g.push(ctx.svgEl('rect',{x:x0,y:y-10,width:xs-x0,height:20,rx:4,fill:C.warnSoft||'#f6ead2',stroke:'#e2c48c'}));
      if(xs<x1)g.push(ctx.svgEl('rect',{x:xs,y:y-10,width:x1-xs,height:20,rx:4,fill:'#dcefe2',stroke:'#9ccbad'}));
      if(xs-x0>=48)g.push(ctx.svgEl('text',{x:k==='cache'?xs-6:x0+6,y:y+4,'text-anchor':k==='cache'?'end':null,'font-size':12,fill:'#86561a',text:label0}));
      if(x1-xs>=48)g.push(ctx.svgEl('text',{x:xs+6,y:y+4,'font-size':12,fill:'#1d6a41',text:label1}));
      return g;
    }
    let els=[];
    function render(now){
      dyn.replaceChildren();els=[];
      if(S.cache)dyn.append(...band('cache',T,'v41 · A（未失效）',''));
      dyn.append(...band('p',0,'','v42 · B'),...band('r1',S.lag,'v41 · A','v42 · B'),...band('r2',S.lag/2,'v41 · A','v42 · B'));
      // 写入与复制
      const yu=G.y('user'),yp=G.y('p');
      dyn.append(ctx.svgEl('line',{x1:G.x(0),y1:yu+10,x2:G.x(0),y2:yp-10,stroke:C.ink,'stroke-width':1.5}),ctx.svgEl('text',{x:G.x(0)+4,y:yu-16,'font-size':12,'font-weight':650,text:'写入 B'}));
      for(const k of ['r1','r2']){const l=ctx.svgEl('line',{x1:G.x(0),y1:yp,x2:G.x(lagOf(k)),y2:G.y(k),stroke:'#8a9a90','stroke-dasharray':'3 3'});dyn.append(l)}
      res.forEach((r,i)=>{
        const x=G.x(r.t),xe=G.x(r.t+r.wait),yn=G.y(r.node),col=r.stale?C.bad:C.ok;
        const g=ctx.svgEl('g');
        g.append(ctx.svgEl('line',{x1:x,y1:yu+9,x2:xe,y2:yn,stroke:r.wait?C.warn:col,'stroke-width':1.6}));
        g.append(ctx.svgEl('circle',{cx:xe,cy:yn,r:4.5,fill:col}));
        g.append(ctx.svgEl('circle',{cx:x,cy:yu,r:9.5,fill:r.stale?'#f7dedb':'#dcefe2',stroke:col,'stroke-width':1.5}));
        g.append(ctx.svgEl('text',{x,y:yu+4.5,'text-anchor':'middle','font-size':12,'font-weight':700,fill:r.stale?'#9b2c27':'#1d6a41',text:r.val}));
        dyn.append(g);els.push([r.t+r.wait,g]);
      });
      setTime(now);fixFill(svg);
      // 列表与统计
      list.replaceChildren(...res.map((r,i)=>h('li',null,h('span',{class:'t'},(r.t/1000).toFixed(2)+'s'),
        h('span',null,r.wait?`等 ${r.wait} 毫秒后读`:'读',NAME[r.node],r.node==='cache'?'（v41）':r.stale?'（还是 v41）':'（已是 v42）'),
        h('span',{class:'sdl-tag '+(r.stale?'bad':'ok')},r.stale?'读到 A：旧值':'读到 B'))));
      if(!res.length)list.append(h('li',{class:'sdl-note'},'还没有刷新。点时间轴添加一次。'));
      const stale=res.filter(r=>r.stale).length,prim=res.filter(r=>r.node==='p').length;
      const avg=res.length?res.reduce((s,r)=>s+5+r.wait,0)/res.length:0;
      stats.set('stale',`${stale} / ${res.length}`,stale?'bad':'ok');stats.set('prim',prim+' 次',prim?'info':null);stats.set('lat',Math.round(avg)+' 毫秒',avg>100?'warn':null);
    }
    function setTime(now){
      const x=G.x(now);ctx.attr(future,{x,width:Math.max(0,G.x1+4-x)});ctx.attr(head,{x1:x,x2:x,visibility:now>=T?'hidden':'visible'});ctx.attr(headT,{x,text:(now/1000).toFixed(1)+' 秒',visibility:now>=T?'hidden':'visible'});
      for(const [t,g] of els)g.setAttribute('visibility',t<=now?'visible':'hidden');
    }
    let playT=T;const lp=ctx.loop(dt=>{playT=Math.min(T,playT+dt*1000*0.85);setTime(playT);if(playT>=T)lp.stop()},false);
    function replay(){compute();playT=0;render(0);lp.start()}
    ctx.onResize(w=>{const n=w<640;if(n!==narrow){narrow=n;build();render(playT)}});
    compute();render(T);
    async function scen(o,reads){
      Object.assign(S,o);stratCtl.set(S.strat,true);lagCtl.set(S.lag,true);if(cacheCtl.get()!==S.cache){cacheCtl.set(S.cache,true);build()}
      S.reads=reads;replay();await ctx.wait(4200);
    }
    ctx.scenarios([
      {id:'flip',label:'改完昵称马上刷新',
        ask:'从库 1 落后 800 毫秒，从库 2 落后 400 毫秒。改完昵称后在 0.3、0.5、0.7、1.2 秒各刷新一次，请求轮流发往两个从库。会看到几次旧昵称？',
        insight:'两次。0.3 秒读从库 1，还是 A；0.5 秒读从库 2，已是 B；0.7 秒又轮到从库 1，页面从 B 退回 A；1.2 秒才稳定为 B。用户看到的是「改成功了又变回去」，问题不在写入，而在读到了还没追上的副本。',
        run:()=>scen({strat:'rr',lag:800,cache:false},[300,500,700,1200])},
      {id:'window',label:'写后 1 秒内读主库',
        ask:'从库压力大，从库 1 落后 2.4 秒、从库 2 落后 1.2 秒。策略是写后 1 秒内读主库、之后轮流读从库。在 0.3、1.1、1.5、2.0 秒刷新，能保证读到 B 吗？',
        insight:'不能，4 次里 2 次读到旧值：1.1 秒读从库 2（1.2 秒才追上），1.5 秒读从库 1（2.4 秒才追上）。「写后固定 1 秒读主库」是经验值，复制延迟一旦超过窗口就失效，不是严格保证。',
        run:()=>scen({strat:'window',lag:2400,cache:false},[300,1100,1500,2000])},
      {id:'version',label:'带版本号读',
        ask:'延迟不变（2.4 秒 / 1.2 秒）。写响应带回版本 42，之后的读要求 min_version=42，最多等 300 毫秒，否则改读主库。同样四次刷新，会读到几次旧值？主库承担几次读？',
        insight:'0 次旧值，主库只读 1 次。0.3 秒时两个从库都没到 v42，等满 300 毫秒后改读主库；1.1 秒时从库 2 还差 100 毫秒，等一下就读它；1.5、2.0 秒直接读已追上的从库 2。代价是偶尔多等一会儿，版本号也必须由服务端签发，不能信客户端随便填。',
        run:()=>scen({strat:'version',lag:2400,cache:false},[300,1100,1500,2000])},
      {id:'cache',label:'缓存里还是旧值',
        ask:'改用「这类读一律走主库」，但读路径前面有缓存，写入后没有删除缓存里的 v41。四次刷新能读到 B 吗？',
        insight:'一次都读不到：请求先命中缓存，根本到不了主库。读己之写要把缓存算进读路径：cache-aside 的做法是更新数据库后删除缓存，删失败要重试或补偿。',
        run:()=>scen({strat:'primary',lag:800,cache:true},[300,700,1200,2000])},
    ]);
  }
});
})();
