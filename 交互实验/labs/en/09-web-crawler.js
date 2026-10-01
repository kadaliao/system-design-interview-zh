/* Chapter 9: Web crawler. BFS over a small web graph to see how the URL Frontier balances priority with per-host politeness, plus the two dedups and crawler traps. */
(function(){
const {el:h,util}=SDLab;
/* Hosts: name, description, color, per-download time (simulated seconds) */
const HOSTS=[['a.com','News portal','#1f8a8a',0.8],['b.org','Encyclopedia','#7b5cb8',0.9],['mirror.net','Mirror of a.com','#b8477a',0.8],['cal.io','Infinite calendar','#8a6d3b',0.6]];
const HC=Object.fromEntries(HOSTS.map(x=>[x[0],x[2]])),HD=Object.fromEntries(HOSTS.map(x=>[x[0],x[3]]));
/* Web graph: URL → [priority 1 high / 2 medium / 3 low, content fingerprint, links on the page] */
const PAGES={
  'a.com/':[1,'A0',['a.com/p1','a.com/p2','a.com/p3','b.org/','mirror.net/']],
  'a.com/p1':[1,'A1',['a.com/p2','b.org/w1','a.com/p1?utm=share']],
  'a.com/p2':[2,'A2',['a.com/','a.com/p3','cal.io/']],
  'a.com/p3':[2,'A3',['a.com/p1','b.org/w2']],
  'a.com/p1?utm=share':[3,'A1',['a.com/p2','b.org/w1']],
  'b.org/':[1,'B0',['b.org/w1','b.org/w2','b.org/w3','a.com/']],
  'b.org/w1':[2,'B1',['b.org/w2','a.com/p2']],
  'b.org/w2':[2,'B2',['b.org/w3','b.org/']],
  'b.org/w3':[3,'B3',['b.org/w1','mirror.net/p3']],
  'mirror.net/':[2,'A0',['mirror.net/p1','mirror.net/p2','mirror.net/p3','b.org/']],
  'mirror.net/p1':[3,'A1',['mirror.net/p2','b.org/w1']],
  'mirror.net/p2':[3,'A2',['mirror.net/','mirror.net/p3','cal.io/']],
  'mirror.net/p3':[3,'A3',['mirror.net/p1','b.org/w2']],
  'cal.io/':[2,'C0',['cal.io/2026-01']],
};
function page(u){
  if(PAGES[u]){const [pri,fp,links]=PAGES[u];return {pri,fp,links}}
  const m=/^cal\.io\/(\d{4})-(\d{2})$/.exec(u);
  if(m){let y=+m[1],mo=+m[2]+1;if(mo>12){mo=1;y++}return {pri:3,fp:'C'+m[1]+m[2],links:[`cal.io/${y}-${String(mo).padStart(2,'0')}`]}}
  return {pri:3,fp:'X'+u,links:[]};
}
const hostOf=u=>u.split('/')[0];
const SEEDS=['a.com/','b.org/'];
const DELAY=1,LEN=40,BACK_CAP=3,FRONT_CAP=60,DL_CAP=150,W=[6,3,1];

SDLab.define({
  id:'crawler-frontier',chapter:9,
  title:'The URL Frontier Decides What to Crawl, When, and What to Skip',
  summary:'Crawl a small web graph by BFS from two seeds: front queues order by priority, back queues order by host with per-host rate limiting, and several download workers run in parallel. Toggle the two dedups, politeness, and the depth cap to see how mirror pages, cycles, and an infinite calendar eat crawl capacity.',
  caveat:'Time advances in simulated seconds. Each download takes a fixed 0.6–0.9 s, the politeness gap is 1 s, and each back queue holds at most 3 URLs. “URL seen” is recorded at enqueue time; the content fingerprint stands for an exact hash of the page content. The Frontier holds at most 60 URLs, and the demo stops automatically after 150 downloads. Changing a parameter restarts from the seeds.',
  mount(ctx){
    ctx.css('wc',`
.wc-top{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:12px}
.wc-narrow .wc-top{grid-template-columns:minmax(0,1fr)}
.wc-row{display:grid;grid-template-columns:78px minmax(0,1fr);gap:8px;align-items:center;padding:5px 0;border-top:1px dashed #e3e9e1;min-height:36px}
.wc-row:first-of-type{border-top:0}
.wc-lbl{font-size:12px;line-height:1.35;color:#44544b;font-weight:650;min-width:0;overflow-wrap:anywhere}
.wc-lbl small{display:block;font-weight:400;color:#66756d;font-size:11px}
.wc-chips{display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-height:24px;min-width:0}
.wc-chip{display:inline-block;font:12px/22px ui-monospace,Menlo,monospace;padding:0 6px;border-radius:5px;background:#fff;border:1px solid #d9e1d7;border-left:4px solid var(--hc);white-space:nowrap;color:#23352f;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.wc-chip.ok{background:#dcefe2;border-color:#9fcdb0}.wc-chip.dup{background:#f6ead2;border-color:#e2c48c;text-decoration:line-through;color:#6b4513}.wc-chip.dupstore{background:#f6ead2;border-color:#e2c48c;color:#6b4513}.wc-chip.trap{background:#f7dedb;border-color:#e7aaa4;color:#8c2a25}
.wc-chip{border-left-color:var(--hc)}
.wc-more{font-size:12px;color:#66756d}
.wc-empty{font-size:12px;color:#9aa89f}
.wc-host{display:flex;flex-direction:column;gap:3px}
.wc-meta{display:flex;align-items:center;gap:6px;font-size:11px;color:#66756d;flex-wrap:wrap}
.wc-cool{flex:1;min-width:40px;height:5px;border-radius:3px;background:#e6eee2;overflow:hidden}
.wc-cool i{display:block;height:100%;background:#b7791f;width:0}
.wc-conn{font-weight:700;color:#2f6fb3}.wc-conn.bad{color:#c2413b}
.wc-workers{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:8px}
.wc-worker{border:1px solid #dbe2da;border-radius:9px;padding:6px 8px;background:#fff;min-width:0}
.wc-worker .top{display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700;color:#44544b;gap:6px}
.wc-worker .st{font-weight:400;color:#66756d;font-size:11px;text-align:right}
.wc-worker .st.warn{color:#86561a}
.wc-slot{min-height:24px;margin:4px 0}
.wc-bar{height:5px;border-radius:3px;background:#e6eee2;overflow:hidden}.wc-bar i{display:block;height:100%;background:#2f6fb3;width:0}
.wc-off{opacity:.45}
.wc-legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:#66756d;margin-top:6px}
.wc-sets{font-size:12px;color:#44544b;margin:6px 0 0;line-height:1.6}
.wc-flow{font-size:12px;color:#66756d;margin:2px 0 6px}
`);
    const P={workers:3,polite:true,udedup:true,cdedup:true,depth:5,len:true,speed:1};
    let now,F,B,H,workers,seenUrl,seenContent,done,S,seq,rng,nextRoute,finished,busyT,totT,dirty;
    function reset(){
      now=0;F=[[],[],[]];B={};H={};for(const [hn] of HOSTS){B[hn]=[];H[hn]={next:0,conn:0}}
      workers=util.range(P.workers).map(()=>({task:null,end:0,start:0}));
      seenUrl=new Set();seenContent=new Map();done=[];seq=0;rng=util.rng(9);nextRoute=0;finished=false;busyT=0;totT=0;dirty=true;
      S={dl:0,valid:0,dupDrop:0,dupStore:0,trap:0,maxConn:0,seenSkip:0,cutDepth:0,cutLen:0,drop:0,end:null};
      for(const u of SEEDS)enqueue(u,0,null,true);
      ctx.clearLog();ctx.log(`Starting from seeds ${SEEDS.join(', ')}; ${P.workers} worker${P.workers>1?'s':''}, politeness ${P.polite?'on':'off'}, URL dedup ${P.udedup?'on':'off'}, content dedup ${P.cdedup?'on':'off'}, depth cap ${P.depth||'none'}`,'info');
    }
    const frontN=()=>F[0].length+F[1].length+F[2].length;
    const backN=()=>Object.values(B).reduce((s,q)=>s+q.length,0);
    function enqueue(u,depth,from,seed){
      if(!seed){
        if(P.depth&&depth>P.depth){S.cutDepth++;return 'depth'}
        if(P.len&&('https://'+u).length>LEN){S.cutLen++;return 'len'}
        if(P.udedup&&seenUrl.has(u)){S.seenSkip++;return 'seen'}
      }
      seenUrl.add(u);
      if(frontN()>=FRONT_CAP){S.drop++;return 'full'}
      const pg=page(u);F[pg.pri-1].push({id:++seq,url:u,host:hostOf(u),depth,pri:pg.pri});dirty=true;return 'ok';
    }
    function pickFront(accept){
      const idx=[0,1,2].filter(i=>F[i].some(accept));if(!idx.length)return null;
      let r=rng()*idx.reduce((s,i)=>s+W[i],0),qi=idx[idx.length-1];
      for(const i of idx){r-=W[i];if(r<0){qi=i;break}}
      const k=F[qi].findIndex(accept);return F[qi].splice(k,1)[0];
    }
    function route(){const t=pickFront(t=>B[t.host].length<BACK_CAP);if(!t)return false;B[t.host].push(t);dirty=true;return true}
    function assign(w){
      let t=null;
      if(P.polite){
        const ready=HOSTS.map(x=>x[0]).filter(hn=>B[hn].length&&!H[hn].conn&&H[hn].next<=now+1e-9).sort((a,b)=>H[a].next-H[b].next);
        if(ready.length)t=B[ready[0]].shift();
      }else t=pickFront(()=>true);
      if(!t)return;
      w.task=t;w.start=now;w.end=now+HD[t.host];const hs=H[t.host];hs.conn++;S.maxConn=Math.max(S.maxConn,hs.conn);dirty=true;
    }
    function complete(w,wi){
      const t=w.task;w.task=null;const hs=H[t.host];hs.conn--;hs.next=now+(P.polite?DELAY:0);S.dl++;
      const pg=page(t.url),trap=t.host==='cal.io';
      if(P.cdedup&&seenContent.has(pg.fp)){
        t.st='dup';S.dupDrop++;
        ctx.log(`W${wi+1} ${t.url}: same content as ${seenContent.get(pg.fp)} → dropped, links not extracted`,'warn');
      }else{
        const again=seenContent.has(pg.fp);if(!again)seenContent.set(pg.fp,t.url);
        t.st=again?'dupstore':trap?'trap':'ok';
        if(again)S.dupStore++;else if(trap)S.trap++;else S.valid++;
        const r={ok:0,seen:0,depth:0,len:0,full:0};for(const l of pg.links)r[enqueue(l,t.depth+1,t.url)]++;
        const parts=[`${r.ok} enqueued`];if(r.seen)parts.push(`${r.seen} already seen`);if(r.depth)parts.push(`${r.depth} too deep`);if(r.len)parts.push(`${r.len} too long`);if(r.full)parts.push(`${r.full} dropped (queue full)`);
        ctx.log(`W${wi+1} ${t.url} (depth ${t.depth}) → ${again?'duplicate content stored anyway':trap?'trap page (content always differs)':'new content'}; ${pg.links.length} link${pg.links.length===1?'':'s'}: ${parts.join(', ')}`,again?'warn':trap?'bad':'ok');
      }
      done.push(t);dirty=true;
    }
    function tick(dtt){
      now+=dtt;
      workers.forEach((w,i)=>{if(w.task&&now>=w.end-1e-9)complete(w,i)});
      if(P.polite&&now>=nextRoute-1e-9&&route())nextRoute=now+0.15;
      for(const w of workers)if(!w.task)assign(w);
      const busy=workers.filter(w=>w.task).length;busyT+=busy*dtt;totT+=workers.length*dtt;
      const idle=!busy&&!frontN()&&!backN();
      if(idle||S.dl>=(P.cap||DL_CAP)){finished=true;S.end=now;lp.stop();dirty=true;
        const msg=idle?`Frontier empty, crawl finished: ${now.toFixed(1)} s, ${S.dl} downloads`:`${P.cap?'Scenario paused':'Demo limit reached'}: ${S.dl} downloads, ${frontN()+backN()} URLs still in the Frontier`;
        ctx.log(msg,idle?'info':'bad');ctx.announce(msg);}
    }

    /* ---- Controls ---- */
    const speedCtl=ctx.segmented({label:'Playback speed',value:1,options:[[0,'Pause'],[1,'1×'],[2,'2×'],[4,'4×']],onChange:v=>{P.speed=v}});
    const wCtl=ctx.slider({label:'Download workers',min:1,max:6,value:P.workers,onChange:v=>{P.workers=v;restart()}});
    const dCtl=ctx.slider({label:'Depth cap',min:0,max:8,value:P.depth,format:v=>v?v+(v===1?' level':' levels'):'None',onChange:v=>{P.depth=v;restart()}});
    const pCtl=ctx.toggle({label:'Politeness: 1 request per host at a time, 1 s gap',value:P.polite,onChange:v=>{P.polite=v;restart()}});
    const uCtl=ctx.toggle({label:'URL dedup (URL seen?)',value:P.udedup,onChange:v=>{P.udedup=v;restart()}});
    const cCtl=ctx.toggle({label:'Content dedup (content seen?)',value:P.cdedup,onChange:v=>{P.cdedup=v;restart()}});
    const lCtl=ctx.toggle({label:`URL length cap: ${LEN} characters`,value:P.len,onChange:v=>{P.len=v;restart()}});
    ctx.button('Restart from seeds',()=>restart(),{primary:true});

    /* ---- Stage ---- */
    const wrap=h('div');
    const frontRows=[],hostRows={};
    const frontPanel=h('div',{class:'sdl-panel'},h('div',{class:'ph'},'Front queues f1–f3: who goes first'),h('p',{class:'wc-flow'},'The Prioritizer sorts pages into three tiers by importance; the selector picks a queue by weighted random choice, 6 : 3 : 1.'));
    ['f1 high','f2 medium','f3 low'].forEach((l,i)=>{const box=h('div',{class:'wc-chips'}),more=h('span',{class:'wc-more'});frontRows.push({box,more});frontPanel.append(h('div',{class:'wc-row'},h('div',{class:'wc-lbl'},l,h('small',null,['Homepages','Regular pages','Mirror / params / calendar'][i])),h('div',{class:'wc-chips'},box,more)))});
    const backPanel=h('div',{class:'sdl-panel'},h('div',{class:'ph'},'Back queues b1–b4: one per host, when it may be fetched'));
    const backNote=h('p',{class:'wc-flow'});backPanel.append(backNote);
    for(const [hn,desc,color] of HOSTS){
      const box=h('div',{class:'wc-chips'}),conn=h('span',{class:'wc-conn'}),cool=h('i'),coolTxt=h('span');
      hostRows[hn]={box,conn,cool,coolTxt};
      backPanel.append(h('div',{class:'wc-row'},h('div',{class:'wc-lbl'},h('span',{style:{color}},'■ '),hn,h('small',null,desc)),
        h('div',{class:'wc-host'},box,h('div',{class:'wc-meta'},h('span',null,'Downloading '),conn,h('span',null,'· Cooldown'),h('span',{class:'wc-cool'},cool),coolTxt))));
    }
    const clockEl=h('span',{style:{float:'right',fontWeight:'650',color:'#2f6fb3',fontVariantNumeric:'tabular-nums'}});
    const workerBox=h('div',{class:'wc-workers'});let workerEls=[];
    const doneBox=h('div',{class:'wc-chips'}),doneMore=h('span',{class:'wc-more'});
    const sets=h('p',{class:'wc-sets'});
    wrap.append(h('div',{class:'wc-top'},frontPanel,backPanel),
      h('div',{class:'sdl-panel',style:{marginTop:'12px'}},h('div',{class:'ph'},'Download workers: DNS resolution + HTML download',clockEl),workerBox),
      h('div',{class:'sdl-panel',style:{marginTop:'12px'}},h('div',{class:'ph'},'Downloaded pages: parse → content dedup → extract links → URL filter and dedup → back to front queues'),h('div',{class:'wc-chips'},doneMore,doneBox),
        h('div',{class:'wc-legend'},h('span',null,h('span',{class:'wc-chip ok',style:{'--hc':'#9fcdb0'}},'New content')),h('span',null,h('span',{class:'wc-chip dup',style:{'--hc':'#e2c48c'}},'Duplicate, dropped')),h('span',null,h('span',{class:'wc-chip dupstore',style:{'--hc':'#e2c48c'}},'Duplicate, stored')),h('span',null,h('span',{class:'wc-chip trap',style:{'--hc':'#e7aaa4'}},'Trap page'))),sets));
    ctx.stage.append(wrap);
    ctx.onResize(w=>wrap.classList.toggle('wc-narrow',w<700));
    const stats=ctx.stats([{key:'dl',label:'Downloads'},{key:'valid',label:'Useful new pages'},{key:'dup',label:'Duplicates: dropped / stored'},{key:'trap',label:'Trap pages'},{key:'conn',label:'Max per-host concurrency'},{key:'busy',label:'Worker busy rate'}]);

    const chipEls=new Map();
    function chip(t,cls){let el=chipEls.get(t.id);if(!el){el=h('span',{class:'wc-chip',style:{'--hc':HC[t.host]},title:`${t.url} (depth ${t.depth})`},t.url);chipEls.set(t.id,el)}el.className='wc-chip'+(cls?' '+cls:'');return el}
    function place(box,more,tasks,max){box.replaceChildren(...tasks.slice(0,max).map(t=>chip(t)));more.textContent=tasks.length>max?`+${tasks.length-max}`:'';if(!tasks.length)box.append(h('span',{class:'wc-empty'},'empty'))}
    function buildWorkers(){workerBox.replaceChildren();workerEls=workers.map((w,i)=>{const slot=h('div',{class:'wc-slot'}),bar=h('i'),st=h('span',{class:'st'});workerBox.append(h('div',{class:'wc-worker'},h('div',{class:'top'},h('span',null,'W'+(i+1)),st),slot,h('div',{class:'wc-bar'},bar)));return {slot,bar,st}})}
    function render(){
      const first=new Map();for(const [id,el] of chipEls)if(el.isConnected)first.set(id,el.getBoundingClientRect());
      F.forEach((q,i)=>place(frontRows[i].box,frontRows[i].more,q,narrow?4:6));
      for(const [hn] of HOSTS){const r=hostRows[hn];place(r.box,{set textContent(v){}},B[hn],BACK_CAP);r.box.classList.toggle('wc-off',!P.polite)}
      backNote.textContent=P.polite?'The selector only picks hosts with no request in flight and cooldown over; a host’s pages download one after another.':'Politeness is off: workers take URLs straight from the front queues, ignoring hosts.';
      workers.forEach((w,i)=>{const e=workerEls[i];if(w.task)e.slot.replaceChildren(chip(w.task));else e.slot.replaceChildren()});
      const shown=done.slice(-(narrow?12:24)).reverse();
      doneBox.replaceChildren(...shown.map(t=>chip(t,t.st)));doneMore.textContent=done.length>shown.length?`Latest ${shown.length} (of ${done.length})`:'';
      if(!done.length)doneBox.append(h('span',{class:'wc-empty'},'None yet'));
      sets.textContent=`URL-seen set: ${seenUrl.size} · Content-seen fingerprints: ${seenContent.size} · Skipped as seen: ${S.seenSkip} · Blocked by depth rule: ${S.cutDepth} · Blocked by length rule: ${S.cutLen}`+(S.drop?` · Dropped, Frontier full: ${S.drop}`:'');
      for(const [id,el] of chipEls){
        if(!el.isConnected){chipEls.delete(id);continue}
        const f=first.get(id);
        if(!f){el.animate([{opacity:0,transform:'scale(.7)'},{opacity:1,transform:'none'}],{duration:240,easing:'ease-out'});continue}
        const r=el.getBoundingClientRect(),dx=f.left-r.left,dy=f.top-r.top;
        if(Math.abs(dx)+Math.abs(dy)>1)el.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'none'}],{duration:360,easing:'cubic-bezier(.2,.7,.3,1)'});
      }
      dirty=false;
    }
    function live(){
      workers.forEach((w,i)=>{const e=workerEls[i];if(!e)return;
        if(w.task){e.bar.style.width=util.clamp((now-w.start)/(w.end-w.start),0,1)*100+'%';e.st.textContent='Downloading';e.st.className='st'}
        else{e.bar.style.width='0';const waiting=P.polite&&backN()>0;e.st.textContent=finished?'Done':waiting?'Waiting: host busy or cooling':frontN()?'Waiting for assignment':'Idle: no tasks';e.st.className='st'+(waiting&&!finished?' warn':'')}});
      for(const [hn] of HOSTS){const r=hostRows[hn],hs=H[hn],left=Math.max(0,hs.next-now);r.conn.textContent=hs.conn;r.conn.className='wc-conn'+(hs.conn>1?' bad':'');r.cool.style.width=(P.polite&&!finished?util.clamp(left/DELAY,0,1)*100:0)+'%';r.coolTxt.textContent=P.polite&&!finished&&left>0?left.toFixed(1)+' s':''}
      clockEl.textContent=(finished?'Elapsed ':'Simulated time ')+(S.end??now).toFixed(1)+' s';
      stats.set('dl',S.dl);stats.set('valid',S.valid,'ok');
      stats.set('dup',`${S.dupDrop} / ${S.dupStore}`,S.dupStore?'bad':S.dupDrop?'warn':null);
      stats.set('trap',S.trap,S.trap>5?'bad':S.trap?'warn':null);
      stats.set('conn',S.maxConn,S.maxConn>1?'bad':'ok');
      stats.set('busy',totT?util.pct(busyT/totT,0):'—');
    }
    let narrow=false;ctx.onResize(w=>{const n=w<600;if(n!==narrow){narrow=n;dirty=true}});
    let acc=0,simAcc=0;
    const STEP=0.05;
    const lp=ctx.loop(dt=>{
      // Advance the simulation in fixed steps: results are frame-rate independent, so scenarios repeat exactly
      if(P.speed&&!finished){simAcc+=dt*P.speed;while(simAcc>=STEP-1e-9&&!finished){tick(STEP);simAcc-=STEP}}
      acc+=dt;if(acc>=1/30||finished){acc=0;if(dirty)render();live()}
    });
    function restart(keep){if(!keep)P.cap=0;reset();simAcc=0;buildWorkers();render();live();lp.start()}
    restart();

    /* ---- Preset scenarios ---- */
    async function prepare(o){
      Object.assign(P,{workers:3,polite:true,udedup:true,cdedup:true,depth:5,len:true,speed:4,cap:0},o);
      wCtl.set(P.workers,true);dCtl.set(P.depth,true);pCtl.set(P.polite,true);uCtl.set(P.udedup,true);cCtl.set(P.cdedup,true);lCtl.set(P.len,true);speedCtl.set(P.speed,true);
      restart(true);ctx.openLog(false);
    }
    async function untilDone(maxMs=16000){let t=0;while(!finished&&t<maxMs){await ctx.wait(200);t+=200}await ctx.wait(400)}
    const summary=()=>`${S.dl} downloads, ${S.valid} useful new pages, duplicates dropped / stored ${S.dupDrop} / ${S.dupStore}, ${S.trap} trap pages, ${(S.end??now).toFixed(1)} s`;
    ctx.scenarios([
      {id:'url-dedup',label:'URL dedup off',
        ask:'The pages contain cycles (a.com/ ↔ a.com/p2, b.org/ ↔ b.org/w2 …). With URL dedup off and content dedup kept on, will the crawl loop forever? How many downloads and useful new pages result?',
        insight:'No infinite loop: a re-downloaded page is recognized at the “content seen?” step, its links are not extracted, and the cycle breaks. The cost is 28 downloads (only 16 with both dedups on), 16 of which fetch already-seen content, and 20.1 s, about twice the normal time. URL dedup saves downloads and load on target sites; with both dedups off, the same pages are downloaded and stored again and again.',
        async run(){await prepare({udedup:false});await untilDone();ctx.log('This run: '+summary(),'info')}},
      {id:'content-dedup',label:'Content dedup off',
        ask:'a.com/p1?utm=share has the same content as a.com/p1, and mirror.net mirrors the whole of a.com. With URL dedup on and content dedup off, how many duplicate copies get stored?',
        insight:'5 extra duplicate copies are stored: a.com/p1?utm=share is the same page as a.com/p1, and the 4 pages of mirror.net duplicate the 4 pages of a.com one for one. With content dedup off, the mirror homepage’s links are extracted too, so mirror.net/p1 and p2 get discovered, downloaded, and stored. URL dedup can’t stop them because every URL is different. An exact hash also only recognizes identical pages; near-duplicates that differ by a line of advertising need another technique.',
        async run(){await prepare({cdedup:false});await untilDone();ctx.log('This run: '+summary(),'info')}},
      {id:'politeness',label:'How much do workers help?',
        ask:'Politeness allows only 1 request per host at a time with a 1 s gap, and there are just 4 hosts. If you go from 2 workers to 6, will the crawl finish in 1/3 of the time?',
        insight:'Almost no speedup: 2 workers take 10.1 s and 6 workers take 9.9 s, while the busy rate falls from 62% to 21%, because the extra workers mostly wait for host cooldowns. Under politeness, the throughput ceiling is roughly the number of crawlable hosts ÷ (one download + the gap), regardless of thread count. With politeness off, 6 workers finish in just 4.0 s, but a single host takes 3 requests at once: the speed comes at the cost of overwhelming the site.',
        async run(){
          const res=[];
          for(const [n,pol] of [[2,true],[6,true],[6,false]]){await prepare({workers:n,polite:pol});await untilDone();res.push(`${n} workers, politeness ${pol?'on':'off'}: ${S.end.toFixed(1)} s, busy rate ${util.pct(busyT/totT,0)}, max per-host concurrency ${S.maxConn}`)}
          ctx.log(res.join('; '),'info');ctx.openLog(true);
        }},
      {id:'trap',label:'Infinite calendar trap',
        ask:'Every cal.io page links to “next month”, and the URL length never changes. With only the URL length cap and no depth limit, can you stop it? What about a depth cap of 5?',
        insight:'The length rule never fires: the calendar URL stays at just 22 characters. With no depth limit, the crawl pauses at download 30, 18 of those pages are cal.io, and it would keep growing; content dedup can’t recognize them because each month’s page content differs. Priority pushes the calendar down to f3, which only delays it and doesn’t stop it. With a depth cap of 5, only 4 cal.io pages are crawled and the run finishes in 9.9 s. In practice you also need a crawl budget, site quotas, and parameter normalization.',
        async run(){
          await prepare({depth:0,cap:30});await untilDone();P.cap=0;const a=`No depth limit: ${summary()}`;
          await prepare({depth:5});await untilDone();ctx.log(a+'; depth cap 5: '+summary(),'info');ctx.openLog(true);
        }},
    ]);
  }
});
})();
