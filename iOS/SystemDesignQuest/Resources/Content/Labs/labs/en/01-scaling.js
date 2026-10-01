/* Chapter 1: Scaling from Zero to Millions of Users. Lab 1 adds components one by one to show the bottleneck moving; lab 2 shows primary-replica lag and read-your-writes. */
(function(){
const {el:h,util}=SDLab;
const TONE={off:['#fafbf9','#c9d3cb','#9aa89f'],plain:['#fff','#9fb0a5','#23352f'],ok:['#f3faf5','#8fc4a2','#23352f'],warn:['#fdf5e6','#b7791f','#23352f'],bad:['#fbeceb','#c2413b','#23352f']};
const toneOf=r=>r>=1?'bad':r>=.8?'warn':'ok';
/* runtime.css overrides the fill attribute via .sdl-stage svg text{fill}; copy fill into the inline style here. */
const fixFill=root=>root.querySelectorAll('text[fill]').forEach(t=>{t.style.fill=t.getAttribute('fill')});

/* ---- Teaching model: load, utilization, latency, and success rate per tier (pure functions, so scenario numbers are easy to verify) ---- */
/* Capacity per tier is in units/s: a dynamic request costs 1 unit on the web tier, a static file 0.2; a database read costs 1 unit, a write 4. */
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

/* ---------------- Lab 1: from one server to shards ---------------- */
SDLab.define({
  id:'scale-journey',chapter:1,
  title:'From One Server to Shards: Which Tier Is the Bottleneck?',
  summary:'Drag the traffic and add database separation, a load balancer, a cache, a CDN, read replicas, a message queue, and shards one at a time. Dots are requests flowing through each tier, the percentage in each box is utilization, and the red box is the current bottleneck, where excess requests queue until they time out.',
  caveat:'Latency per tier is approximated as service time ÷ (1 − utilization); at 100% utilization a request times out after 3 seconds. Capacities are illustrative: each web server handles 1,000 units/s, each database 1,500 units/s, and one write counts as 4 reads. Half of all requests are static files, and 5% of dynamic requests are writes. The model ignores the cost of replaying writes on replicas, network time, and cache capacity; the queue and workers scale on demand, so no backlog is simulated.',
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
    const sR=ctx.slider({label:'Incoming traffic',min:0,max:LV.length-1,value:LV.indexOf(P.R),format:v=>util.fmt(LV[v])+' req/s',onInput:v=>{P.R=LV[v];update()}});
    const sWeb=ctx.slider({label:'Web servers',min:1,max:12,value:1,format:v=>String(v),onInput:v=>{P.web=v;if(v>1)needSplit();update()}});
    const sRep=ctx.slider({label:'Read replicas (per shard)',min:0,max:3,value:0,format:v=>v?String(v):'None',onInput:v=>{P.rep=v;if(v)needSplit();update()}});
    const sSh=ctx.slider({label:'Shards (by user_id)',min:1,max:6,value:1,format:v=>v>1?String(v):'No sharding',onInput:v=>{P.shards=v;if(v>1)needSplit();update()}});
    const row=h('div',{class:'sj-comp',role:'group','aria-label':'Component toggles'}),comp={};
    for(const [k,l] of [['split','Separate database'],['cache','Cache'],['cdn','CDN'],['queue','Message queue'],['stateless','Shared sessions (stateless web)'],['flash','Flash sale: every order updates one stock row']]){comp[k]=h('button',{type:'button','aria-pressed':'false',onclick:()=>setComp(k,!P[k])},l);row.append(comp[k])}
    ctx.controls.append(h('div',{class:'sdl-ctrl wide'},h('span',{class:'lbl'},h('span',null,'Components (click to add or remove)')),row));
    const sHit=ctx.slider({label:'Cache hit rate',min:50,max:99,value:90,format:v=>v+'%',onInput:v=>{P.hit=v/100;update()}});
    const sCel=ctx.slider({label:'Celebrity share of DB traffic',min:0,max:60,step:5,value:0,format:v=>v+'%',onInput:v=>{P.celeb=v/100;update()}});
    ctx.button('Take one web server down',killWeb);
    function needSplit(){if(!P.split){P.split=true;ctx.log('Move the database to its own server first; only then can you scale the web tier or the database on its own','info')}}
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
      if(P.web<2){ctx.log('Only 1 web server left: taking it down would make the whole site unavailable. This is a single point of failure (SPOF)','bad');return}
      const n=P.web;P.web--;
      if(P.stateless)ctx.log(`Took 1 server down (${n} → ${P.web}): sessions live in shared storage, so the remaining servers take over and users notice nothing`,'ok');
      else ctx.log(`Took 1 server down (${n} → ${P.web}): sessions were in this machine's memory (sticky sessions), so about 1/${n} of logged-in users are forced to sign in again`,'bad');
      ctx.openLog();update();flash('web');
    }

    /* ---- Stage ---- */
    const holder=h('div');
    const legend=h('p',{class:'sj-legend'},h('i',{style:{background:C.ok}}),'Requests flowing normally',h('i',{style:{background:C.warn}}),'Target tier near saturation',h('i',{style:{background:C.bad}}),'Target tier overloaded, queueing to timeout',h('i',{style:{background:'none',border:'1px dashed #9aa89f',borderRadius:'2px'}}),'Component not added yet');
    const diag=h('p',{class:'sj-diag','aria-live':'polite'});
    const table=h('table',{class:'sdl-table sj-tbl'});
    ctx.stage.append(holder,legend,diag,h('div',{class:'sdl-scroll'},table));
    const stats=ctx.stats([{key:'ok',label:'Success rate'},{key:'lat',label:'Avg. dynamic request time'},{key:'order',label:'Flash-sale orders (done / arriving)'},{key:'srv',label:'Servers (excl. CDN)'}]);
    let G=null,svg=null,N={},E={},dbG=null,chipG=null,narrow=null,M=null;
    function geo(n){
      return n?{W:360,H:520,user:[130,6,100,42],cdn:[10,74,130,46],lb:[220,74,130,46],web:[10,148,340,74],cache:[10,252,104,46],sess:[128,252,104,46],queue:[246,252,104,46],db:[10,330,340,184],
        e:{uc:[150,48,86,74],ul:[210,48,274,74],cw:[75,120,75,148],lw:[285,120,285,148],wc:[62,222,62,252],ws:[180,222,180,252],wq:[298,222,298,252],cd:[62,298,62,330],wd:[121,222,121,330],lk:[0,0,0,1]}}
      :{W:860,H:312,user:[8,124,80,56],cdn:[124,20,104,52],lb:[124,124,104,56],web:[264,72,142,150],sess:[264,254,142,48],cache:[444,20,112,52],queue:[444,254,112,48],db:[592,20,262,282],
        e:{uc:[88,138,124,50],ul:[88,152,124,152],cw:[228,46,264,90],lw:[228,152,264,152],wc:[406,98,444,50],cd:[556,46,592,46],wd:[406,152,592,152],ws:[335,222,335,254],wq:[406,204,444,268],lk:[0,0,0,1]}};
    }
    function build(){
      G=geo(narrow);holder.replaceChildren();
      svg=ctx.svg(G.W,G.H,{parent:holder,label:'Architecture sketch: users, CDN, load balancer, web, cache, session store, message queue, and database',maxWidth:narrow?460:null});
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
    const ms=v=>v>=K.tmo?'timeout':Math.round(v)+' ms';
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
        paint('db','off','Database','On the web server');
      }else{
        ctx.attr(N.db.rect,{fill:'#fbfcfa',stroke:'#c9d3cb','stroke-dasharray':null,'stroke-width':1.2});ctx.attr(N.db.t1,{text:''});ctx.attr(N.db.t2,{text:''});
        const S=M.S,gap=6,cw=(w-12-(S-1)*gap)/S,wide=cw>=64;
        for(let i=0;i<S;i++){
          const cx0=x+6+i*(cw+gap),hot=P.celeb>0&&S>1&&i===0;
          dbG.append(ctx.svgEl('text',{x:cx0+cw/2,y:y+17,'text-anchor':'middle','font-size':12,'font-weight':650,fill:hot?C.series[3]:C.muted,text:(S===1?'Database':(wide?'Shard '+(i+1):'S'+(i+1)))+(hot?' ★':'')}));
          const pr=M.prim[i],t=toneOf(pr);
          dbG.append(ctx.svgEl('rect',{x:cx0,y:y+24,width:cw,height:36,rx:6,fill:TONE[t][0],stroke:TONE[t][1],'stroke-width':t==='bad'?2.2:1.5}));
          dbG.append(ctx.svgEl('text',{x:cx0+cw/2,y:y+47,'text-anchor':'middle','font-size':12,'font-weight':650,text:(wide?'Primary ':'')+pct(pr)}));
          for(let j=0;j<M.repN;j++){
            const rr=M.rep[i],t2=toneOf(rr),ry=y+66+j*24;
            dbG.append(ctx.svgEl('rect',{x:cx0+3,y:ry,width:cw-6,height:20,rx:4,fill:TONE[t2][0],stroke:TONE[t2][1]}));
            dbG.append(ctx.svgEl('text',{x:cx0+cw/2,y:ry+14.5,'text-anchor':'middle','font-size':12,text:(wide?'Replica ':'')+pct(rr)}));
          }
        }
        if(P.celeb>0&&S>1&&!narrow)dbG.append(ctx.svgEl('text',{x:x+6,y:y+hh-lockH-10,'font-size':12,fill:C.series[3],text:'★ Celebrity\'s shard'}));
      }
      if(P.flash){
        const t=toneOf(M.lockRho),ly=narrow?y+base+18:y+hh-lockH-2;
        if(P.split){const lx=x+7.5,e=E.lk;e.c=[lx,y+60,lx,ly];e.len=Math.max(1,ly-y-60);ctx.attr(e.line,{x1:lx,y1:y+60,x2:lx,y2:ly})}
        dbG.append(ctx.svgEl('rect',{x:x+6,y:ly,width:w-12,height:lockH-4,rx:6,fill:TONE[t][0],stroke:TONE[t][1],'stroke-width':t==='bad'?2.2:1.5}));
        dbG.append(ctx.svgEl('text',{x:x+w/2,y:ly+16,'text-anchor':'middle','font-size':12,'font-weight':650,text:'Hot-row lock (50 ms per order)'}));
        dbG.append(ctx.svgEl('text',{x:x+w/2,y:ly+32,'text-anchor':'middle','font-size':12,text:`${util.fmt(M.ordersIn,1)} orders/s in · cap 20 · ${pct(M.lockRho)}`}));
      }
    }
    function setEdge(k,flow,rho){
      const e=E[k];if(!e)return;
      e.n=flow>0.5?util.clamp(1+Math.floor(Math.log10(flow)),1,6):0;
      const t=rho==null?'ok':toneOf(rho);e.color=t==='bad'?C.bad:t==='warn'?C.warn:C.ok;e.speed=t==='bad'?.35:t==='warn'?.6:1;
      ctx.attr(e.line,{stroke:e.n?'#b9c6bd':'#e3e9e1','stroke-dasharray':e.n?null:'4 4'});
      e.dots.forEach((d,i)=>{d.setAttribute('fill',e.color);if(i>=e.n)d.setAttribute('visibility','hidden')});
    }
    function bnName(){const b=M.bn;return {single:'The single server',web:'The web tier',prim:M.S>1?`Shard ${b.i+1}'s primary`:'The primary',rep:M.S>1?`Shard ${b.i+1}'s replica`:'The replica',lock:'The hot-row lock'}[b.key]}
    function update(){
      sync();M=model(P);
      const web=P.split?P.web:1,lb=P.split&&P.web>1;
      paint('user','plain','Users',util.fmt(P.R)+' req/s');
      paint('cdn',P.cdn?'ok':'off',P.cdn?'CDN':'+ CDN',P.cdn?'Static hit 95%':'Static: origin');
      paint('lb',lb?'ok':'off',lb?'Load balancer':'No LB',lb?(P.stateless?'Any server':'Sticky sessions'):'Single host');
      const wt=toneOf(M.webRho);
      paint('web',wt,P.split?`Web servers ×${web}`:'Single server',P.split?'Utilization '+pct(M.webRho):'Web + DB · '+pct(M.webRho));
      paint('cache',P.cache?'ok':'off',P.cache?'Cache':'+ Cache',P.cache?'Hit rate '+Math.round(P.hit*100)+'%':'Reads hit DB');
      paint('sess',P.stateless&&P.split?'ok':'off',P.stateless?'Session store':'+ Sessions',P.stateless?'Stateless web':'Local sessions');
      paint('queue',P.queue?'ok':'off',P.queue?'Queue/Worker':'+ Queue',P.queue?'Async '+util.fmt(M.writes*M.p)+'/s':'Runs inline');
      drawChips();drawDb();
      const dbRead=Math.max(...(M.repN?M.rep:M.prim)),dbW=Math.max(...M.prim);
      setEdge('uc',P.cdn?M.st:0);setEdge('cw',P.cdn?M.stO:0,M.webRho);
      setEdge('ul',M.dyn+(P.cdn?0:M.st),M.webRho);setEdge('lw',M.dyn+(P.cdn?0:M.st),M.webRho);
      setEdge('wc',P.cache?M.reads*M.p:0);setEdge('cd',P.cache&&P.split?M.reads*M.p*(1-M.hit):0,dbRead);
      setEdge('wd',P.split?M.writes*M.p+(P.cache?0:M.reads*M.p):0,P.cache?dbW:Math.max(dbW,dbRead));
      setEdge('ws',P.stateless&&P.split?M.dyn*M.p:0);setEdge('lk',P.flash&&P.split?M.ordersIn:0,M.lockRho);ctx.attr(E.lk.line,{visibility:P.flash&&P.split?'visible':'hidden'});setEdge('wq',P.queue?M.writes*M.p:0);
      // Diagnosis
      const b=M.bn,top=b.rho;let tone=toneOf(top),msg;
      const name=bnName();
      if(top>=1){
        if(b.key==='single')msg=`The single server is at ${pct(top)} utilization: the web app and database fight over the same CPU, memory, and disk, and excess requests queue until they time out. Move the database out first.`;
        else if(b.key==='web')msg=`The web tier is at ${pct(top)} utilization, and excess requests queue here until they time out. Add web servers (a load balancer appears automatically), or offload static files and async work with a CDN and a message queue.`;
        else if(b.key==='lock')msg=`Hot-row lock: each order holds this row's lock for 50 ms, so at most 20 orders can commit per second, but ${util.fmt(M.ordersIn,1)} are arriving, and the excess waits in the lock queue until it times out. Adding web servers or replicas doesn't raise this ceiling; shorten the transaction, split the inventory, or serialize orders for this item.`;
        else if(b.key==='prim'&&P.celeb>0&&M.S>1&&b.i===0)msg=`${name} is at ${pct(top)} utilization: the celebrity's requests all land on the shard that owns one user_id. Adding shards only thins out other users and can't spread this one, and ordinary users on the same shard are slowed down too. Share the reads with a cache; split writes into buckets or handle them separately.`;
        else if(b.key==='prim'&&!M.repN&&M.reads*M.p*(1-M.hit)*M.shareOf(b.i)>M.writes*M.p*M.shareOf(b.i)*K.wCost)msg=`${name} is at ${pct(top)} utilization, and most of the load is reads. Add a cache, raise the hit rate, or add read replicas to share the reads.`;
        else if(b.key==='prim')msg=`${name} is at ${pct(top)} utilization, mostly from writes. Read replicas don't share writes and a cache can't absorb them; shard by user_id.`;
        else msg=`${name} is at ${pct(top)} utilization: add replicas or raise the cache hit rate.`;
      }else if(top>=.8)msg=`Near saturation: ${name} is at ${pct(top)} utilization, so queueing already makes its response time ${Math.round(1/(1-top))} times what it is when idle. A little more traffic will cause timeouts.`;
      else msg=`Every tier has headroom; the busiest is ${name.replace(/^The /,'the ')} (${pct(top)}). With no bottleneck, there's no need to rush into adding components.`;
      diag.className='sj-diag '+tone;diag.textContent=msg;
      stats.set('ok',util.pct(M.success,1),M.success>.995?'ok':M.success>.95?'warn':'bad');
      stats.set('lat',ms(M.latency),M.latency>=1000?'bad':M.latency>=200?'warn':'ok');
      stats.set('order',P.flash?`${util.fmt(M.ordersOk,1)} / ${util.fmt(M.ordersIn,1)}`:'Off',P.flash?(M.ordersOk<M.ordersIn-0.05?'bad':'ok'):null);
      stats.set('srv',M.servers+(M.servers===1?' server':' servers'),'info');
      // Detail table
      const rows=[[P.split?'Web tier':'Single server',P.split?M.webLoad:M.webLoad+M.dbLoad,P.split?web*K.webCap:null,M.webRho,lat(K.webMs,M.webRho)]];
      if(P.split){
        const busy=M.prim.indexOf(Math.max(...M.prim));
        rows.push([M.S>1?`Primary (busiest: shard ${busy+1})`:'Primary',M.prim[busy]*K.dbCap,K.dbCap,M.prim[busy],lat(K.wMs,M.prim[busy])]);
        if(M.repN){const r=Math.max(...M.rep);rows.push(['Replica (busiest)',r*K.repCap,K.repCap,r,lat(K.rMs,r)])}
      }
      if(P.flash)rows.push(['Hot-row lock (orders/s)',M.ordersIn,K.lockMu,M.lockRho,lat(K.lockMs,M.lockRho)]);
      table.replaceChildren(h('thead',null,h('tr',null,h('th',null,'Tier'),h('th',null,'Load (units/s)'),h('th',null,'Capacity'),h('th',null,'Utilization'),h('th',null,'Avg. time'))),
        h('tbody',null,rows.map(([n,l,c,r,t])=>h('tr',null,h('td',null,n),h('td',null,util.fmt(l)),h('td',null,c?util.fmt(c):'Shared with DB'),h('td',{style:{color:r>=1?C.bad:r>=.8?C.warn:null,fontWeight:r>=.8?'700':null}},pct(r)),h('td',null,ms(t))))));
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

    /* ---- Preset scenarios ---- */
    const BASE={R:300,split:false,web:1,rep:0,shards:1,cache:false,hit:.9,cdn:false,queue:false,stateless:false,celeb:0,flash:false};
    function prepare(o){Object.assign(P,BASE,o);ctx.clearLog();update()}
    const brief=()=>{
      if(!P.split)return 'Single server '+pct(M.webRho)+(P.flash?' · row lock '+pct(M.lockRho):'');
      const mx=Math.max(...M.prim),i=M.prim.indexOf(mx),out=['Web '+pct(M.webRho),'Primary '+pct(mx)+(M.S<2?'':mx-Math.min(...M.prim)>.005?` (shard ${i+1}; others ${pct(Math.min(...M.prim))})`:' (each shard)')];
      if(M.repN)out.push('Replica '+pct(Math.max(...M.rep)));if(P.flash)out.push('Row lock '+pct(M.lockRho));return out.join(' · ');
    };
    async function step(o,text,wait=1300){Object.assign(P,o);update();ctx.log(text+' → '+brief(),toneOf(M.bn.rho));await ctx.wait(wait)}
    ctx.scenarios([
      {id:'journey',label:'From one server all the way to shards',
        ask:'Traffic grows from 300 to 20,000 requests per second. Which tier gives out first? And each time you add a component, where does the bottleneck move?',
        insight:'The single server fills up first, at 1,000 req/s (103%). After the database is separated and traffic reaches 3,000 req/s, the web tier is first to buckle (195%); with 3 web servers the bottleneck jumps straight to the primary (115%), and the cache pushes it back down to 30%. At 10,000 req/s, a CDN and a message queue take static files and async work off the web tier, dropping it from 217% to 168%, which still takes 6 servers; the primary is then back at 98%, and 1 read replica brings it down to 67%. At 20,000 req/s, writes push the primary to 133%, and replicas can\'t share writes, so splitting into 2 shards gives 67% each. At every step, first see which tier fills up first, then add the capability that matches.',
        async run(){
          prepare({});ctx.openLog();ctx.log('One server, 300 req/s → '+brief(),'ok');await ctx.wait(900);
          await step({R:1000},'Traffic reaches 1,000 req/s');
          await step({split:true},'Separate the database');
          await step({R:3000},'Traffic reaches 3,000 req/s');
          await step({web:3},'Scale to 3 web servers + load balancer');
          await step({cache:true,hit:.9},'Add a cache, 90% hit rate');
          await step({R:10000},'Traffic reaches 10,000 req/s');
          await step({cdn:true,queue:true},'Add a CDN and a message queue');
          await step({web:6},'Scale web to 6 servers');
          await step({rep:1},'Add 1 read replica');
          await step({R:20000,web:12},'Traffic reaches 20,000 req/s, web scaled to 12 servers');
          await step({shards:2},'Split into 2 shards by user_id');
          await step({stateless:true},'Move sessions to shared storage so web servers can come and go freely',600);
        }},
      {id:'lock',label:'Only add web servers',
        ask:'In a flash sale, every order updates the same inventory row, and the row lock is held for 50 ms per order. Right now there is 1 web server, already at full load, and about 15 orders per second succeed. After scaling to 3 web servers, how many orders per second can succeed?',
        insight:'It tops out at 20 orders/s, only about 1.3 times as many. With 1 web server, that server held back half of the requests, so the row lock received just 15.4 orders/s (77% utilization); after adding web servers, browsing requests recover, but the concurrent transactions let in rise to 30 orders/s, the lock queue fills up, and a third of the orders wait until they time out. Scaling to 6 servers changes nothing: more web servers don\'t add any parallelism for modifying the same row.',
        async run(){
          prepare({R:3000,split:true,cache:true,hit:.9,flash:true});ctx.openLog();ctx.log('1 web server → '+brief(),toneOf(M.bn.rho));await ctx.wait(2500);
          await step({web:3},'Scale to 3 web servers',3500);
          await step({web:6},'Scale to 6 web servers',2500);
        }},
      {id:'hit',label:'Cache hit rate falls from 98% to 80%',
        ask:'With 4,750 reads per second and a 98% cache hit rate, the primary is at 73% utilization. If the hit rate drops only 18 percentage points to 80%, how many times more reads fall through to the database? Can the primary cope?',
        insight:'Reads that fall through to the database go from 95 per second to 950 per second, which is 10 times as many, not 18% more. The primary climbs through 83%, 98%, 114%, and 130%, and some reads and writes start to time out. So when troubleshooting, convert the hit rate into fall-through QPS, then look at database utilization and latency; finally, 1 read replica moves the reads off the primary and brings it down to 67%.',
        async run(){
          prepare({R:10000,split:true,web:6,cache:true,hit:.98,cdn:true,queue:true});ctx.openLog();ctx.log('98% hit rate: 95 reads/s fall through, primary at '+pct(M.prim[0]),'ok');await ctx.wait(1600);
          for(const x of [95,90,85,80]){P.hit=x/100;update();ctx.log(`${x}% hit rate: ${util.fmt(M.reads*(1-P.hit))} reads/s fall through, primary at ${pct(M.prim[0])}`,M.prim[0]>=1?'bad':M.prim[0]>=.8?'warn':'ok');await ctx.wait(1700)}
          await step({rep:1},'Add 1 read replica',1800);
        }},
      {id:'celeb',label:'A celebrity hotspot overwhelms one shard',
        ask:'Data is split into 3 shards by user_id, and one celebrity accounts for 40% of database traffic (no cache yet). If you go from 3 shards to 6, can the celebrity\'s shard utilization drop by half?',
        insight:'No: shard 1 only drops from 230% to 192%, while the other shards drop from 77% to 38%. The same user_id always lands on the same shard, so adding shards only thins out ordinary users, and the ordinary users sharing the celebrity\'s shard time out along with it. With a cache at a 90% hit rate, the celebrity\'s reads are absorbed by the cache and shard 1 drops to 49%, still about 5 times the other shards (10%), because the writes remain concentrated there.',
        async run(){
          prepare({R:10000,split:true,web:6,cdn:true,queue:true,shards:3,celeb:.4});ctx.openLog();ctx.log('3 shards → '+brief(),toneOf(M.bn.rho));await ctx.wait(2400);
          await step({shards:6},'Scale to 6 shards',3000);
          await step({cache:true,hit:.9},'Add a cache, 90% hit rate',2500);
        }},
    ]);
    update();
  }
});

/* ---------------- Lab 2: replication lag and read-your-writes ---------------- */
SDLab.define({
  id:'replica-lag',chapter:1,
  title:'Replication Lag: Why Does the Nickname I Just Changed Revert?',
  summary:'A user changes their nickname from A to B (version 41 → 42), writes to the primary, and then refreshes a few times. Switch the read strategy, drag the replication lag, or click the timeline to add a refresh, and see whether each read returns the new value or the old one.',
  caveat:'Replication lag is fixed: replica 1 lags by L and replica 2 by L/2, with no other writes in between. One read counts as 5 ms; a versioned read waits at most 300 ms and, if no replica has caught up by then, reads the primary instead. “Cache not invalidated” means the cache in front of the read path still holds v41.',
  mount(ctx){
    const C=ctx.colors,T=3000;
    ctx.css('rlg',`
.rlg-list{margin:8px 0 0;padding:0;list-style:none;font-size:13px;display:grid;gap:4px}
.rlg-list li{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;line-height:1.5}
.rlg-list .t{font-family:ui-monospace,Menlo,monospace;color:#66756d;min-width:3.6em}
.rlg-svg{cursor:crosshair}
`);
    const S={strat:'rr',lag:800,cache:false,reads:[300,500,700,1200]};
    const stratCtl=ctx.segmented({label:'Read strategy',wide:true,value:S.strat,options:[['rr','Read/write split: replicas in turn'],['window','Primary for 1 s after write'],['primary','Always read the primary'],['version','Versioned read (min_version=42)']],onChange:v=>{S.strat=v;replay()}});
    const lagCtl=ctx.slider({label:'Replication lag L',hint:'Replica 1 lags by L, replica 2 by L/2',min:0,max:3000,step:100,value:S.lag,format:v=>util.fmt(v)+' ms',onInput:v=>{S.lag=v;compute();render(T)},onChange:()=>replay()});
    const cacheCtl=ctx.toggle({label:'Cache not invalidated after write (still v41)',value:false,onChange:v=>{S.cache=v;build();replay()}});
    ctx.button('Replay',()=>replay(),{primary:true});
    ctx.button('Clear refreshes',()=>{S.reads=[];compute();render(T)});
    const holder=h('div');const list=h('ol',{class:'rlg-list','aria-live':'polite'});
    ctx.stage.append(holder,h('p',{class:'sdl-note'},'Click anywhere on the timeline to add a refresh at that moment (up to 8).'),list);
    const stats=ctx.stats([{key:'stale',label:'Stale reads'},{key:'prim',label:'Reads on the primary'},{key:'lat',label:'Avg. read time'}]);
    let res=[],narrow=null,G,svg,future,head,headT,dyn;
    const lagOf=n=>n==='r1'?S.lag:n==='r2'?S.lag/2:0;
    const NAME={p:'Primary',r1:'Replica 1',r2:'Replica 2',cache:'Cache'};
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
      G={W:narrow?360:660,x0:narrow?76:84,rh:narrow?46:44,top:30};G.x1=G.W-14;G.H=G.top+rows.length*G.rh+18;
      G.y=k=>G.top+rows.indexOf(k)*G.rh+G.rh/2;G.x=t=>G.x0+(G.x1-G.x0)*util.clamp(t,0,T)/T;
      holder.replaceChildren();
      svg=ctx.svg(G.W,G.H,{parent:holder,label:'Timeline: version changes on the primary, replicas, and cache, and the value each refresh reads',maxWidth:narrow?480:null});
      svg.classList.add('rlg-svg');
      svg.addEventListener('click',ev=>{
        const pt=svg.createSVGPoint();pt.x=ev.clientX;pt.y=ev.clientY;const m=svg.getScreenCTM();if(!m)return;const q=pt.matrixTransform(m.inverse());
        if(q.x<G.x0||q.x>G.x1)return;if(S.reads.length>=8){ctx.announce('At most 8 refreshes');return}
        const t=Math.round((q.x-G.x0)/(G.x1-G.x0)*T/50)*50;S.reads.push(t);compute();render(T);
        const r=res.find(x=>x.t===t);if(r)ctx.announce(`Refresh at ${(t/1000).toFixed(2)} s: read ${r.val}`);
      });
      // Static: row labels and time ticks
      for(const k of rows){
        svg.append(ctx.svgEl('text',{x:6,y:G.y(k)+4,'font-size':12,'font-weight':650,text:k==='user'?'User':NAME[k]}));
        if(k!=='user')svg.append(ctx.svgEl('line',{x1:G.x0,x2:G.x1,y1:G.y(k),y2:G.y(k),stroke:'#e3e9e1'}));
      }
      const step=narrow?1000:500;
      for(let t=0;t<=T;t+=step)svg.append(ctx.svgEl('text',{x:G.x(t),y:G.H-4,'text-anchor':'middle','font-size':12,fill:C.muted,text:(t/1000)+' s'}));
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
      if(S.cache)dyn.append(...band('cache',T,'v41 · A (not invalidated)',''));
      dyn.append(...band('p',0,'','v42 · B'),...band('r1',S.lag,'v41 · A','v42 · B'),...band('r2',S.lag/2,'v41 · A','v42 · B'));
      // Write and replication
      const yu=G.y('user'),yp=G.y('p');
      dyn.append(ctx.svgEl('line',{x1:G.x(0),y1:yu+10,x2:G.x(0),y2:yp-10,stroke:C.ink,'stroke-width':1.5}),ctx.svgEl('text',{x:G.x(0)+4,y:yu-16,'font-size':12,'font-weight':650,text:'Write B'}));
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
      // List and stats
      list.replaceChildren(...res.map((r,i)=>h('li',null,h('span',{class:'t'},(r.t/1000).toFixed(2)+'s'),
        h('span',null,(r.wait?`Waited ${r.wait} ms, then read the `:'Read the ')+NAME[r.node].toLowerCase()+(r.node==='cache'?' (v41)':r.stale?' (still v41)':' (already v42)')),
        h('span',{class:'sdl-tag '+(r.stale?'bad':'ok')},r.stale?'Read A: stale':'Read B'))));
      if(!res.length)list.append(h('li',{class:'sdl-note'},'No refreshes yet. Click the timeline to add one.'));
      const stale=res.filter(r=>r.stale).length,prim=res.filter(r=>r.node==='p').length;
      const avg=res.length?res.reduce((s,r)=>s+5+r.wait,0)/res.length:0;
      stats.set('stale',`${stale} / ${res.length}`,stale?'bad':'ok');stats.set('prim',prim+(prim===1?' read':' reads'),prim?'info':null);stats.set('lat',Math.round(avg)+' ms',avg>100?'warn':null);
    }
    function setTime(now){
      const x=G.x(now);ctx.attr(future,{x,width:Math.max(0,G.x1+4-x)});ctx.attr(head,{x1:x,x2:x,visibility:now>=T?'hidden':'visible'});ctx.attr(headT,{x,text:(now/1000).toFixed(1)+' s',visibility:now>=T?'hidden':'visible'});
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
      {id:'flip',label:'Refresh right after changing the nickname',
        ask:'Replica 1 lags by 800 ms and replica 2 by 400 ms. After the nickname change, you refresh at 0.3, 0.5, 0.7, and 1.2 seconds, and requests go to the two replicas in turn. How many times do you see the old nickname?',
        insight:'Twice. At 0.3 s the read goes to replica 1 and still shows A; at 0.5 s it goes to replica 2, which is already at B; at 0.7 s it is replica 1\'s turn again and the page goes back from B to A; only at 1.2 s does it settle on B. What the user sees is “the change worked, then reverted.” The problem isn\'t the write; it is reading from a replica that hasn\'t caught up.',
        run:()=>scen({strat:'rr',lag:800,cache:false},[300,500,700,1200])},
      {id:'window',label:'Read the primary for 1 s after a write',
        ask:'The replicas are under heavy load: replica 1 lags by 2.4 seconds and replica 2 by 1.2 seconds. The strategy is to read the primary for 1 second after a write and the replicas in turn after that. If you refresh at 0.3, 1.1, 1.5, and 2.0 seconds, are you guaranteed to read B?',
        insight:'No: 2 of the 4 reads return the old value. At 1.1 s the read goes to replica 2 (which catches up only at 1.2 s), and at 1.5 s it goes to replica 1 (which catches up only at 2.4 s). “Always read the primary for 1 second after a write” is a rule of thumb; once replication lag exceeds the window it stops working, so it is not a strict guarantee.',
        run:()=>scen({strat:'window',lag:2400,cache:false},[300,1100,1500,2000])},
      {id:'version',label:'Versioned reads',
        ask:'The lag is unchanged (2.4 s / 1.2 s). The write response returns version 42, and later reads require min_version=42, waiting at most 300 ms before falling back to the primary. With the same four refreshes, how many stale values do you read? How many reads does the primary serve?',
        insight:'No stale values, and the primary serves only 1 read. At 0.3 s neither replica has reached v42, so the read waits the full 300 ms and then reads the primary; at 1.1 s replica 2 is still 100 ms short, so it waits a moment and reads it; at 1.5 s and 2.0 s it reads replica 2 directly, since it has caught up. The cost is an occasional short wait, and the version number must be issued by the server; you can\'t trust whatever the client fills in.',
        run:()=>scen({strat:'version',lag:2400,cache:false},[300,1100,1500,2000])},
      {id:'cache',label:'The cache still holds the old value',
        ask:'You switch to “always read the primary,” but there is a cache in front of the read path, and the v41 entry was not deleted after the write. Can any of the four refreshes read B?',
        insight:'Not once: requests hit the cache first and never reach the primary. Read-your-writes has to count the cache as part of the read path: with cache-aside, you delete the cache entry after updating the database, and retry or compensate if the delete fails.',
        run:()=>scen({strat:'primary',lag:800,cache:true},[300,700,1200,2000])},
    ]);
  }
});
})();
