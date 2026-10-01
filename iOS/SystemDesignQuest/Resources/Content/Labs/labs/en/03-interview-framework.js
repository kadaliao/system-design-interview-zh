/* Chapter 3: System design interview framework. Lab 1 is a timed 45-minute / 5-minute / 90-second drill; lab 2 shows how the answers to a Feed question's requirements change the architecture. */
(function(){
const {el:h,util}=SDLab;
const mmss=s=>{s=Math.max(0,Math.floor(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};

/* ---------------- Lab 1: interview pacing drill ---------------- */
const QS=[
  {id:'feed',name:'Design a News Feed System',ref:'Chapter 11',ask:['Newest first, or personalized recommendations?','What is the DAU? How many friends per person at most, and are there celebrities with millions of followers?','Text only, or images and videos too?'],deep:'The feed publish (fan-out) and fetch flows'},
  {id:'url',name:'Design a URL Shortener',ref:'Chapter 8',ask:['How many short URLs are created per day? What is the read/write ratio?','How short must the code be? Can it be customized, and does it expire?','Should the same long URL always return the same short URL?'],deep:'Hash function / ID generation and collision handling'},
  {id:'chat',name:'Design a Chat System',ref:'Chapter 12',ask:['One-on-one or group chat? How many people can a group have?','Do we need presence and multi-device sync?','How long are messages kept? Do we support offline messages?'],deep:'Reducing message latency and handling online / offline status'},
  {id:'rl',name:'Design a Rate Limiter',ref:'Chapter 4',ask:['Rate limit on the server or the client? By IP, user, or endpoint?','One machine, or many gateways sharing a quota? At what scale?','How do we tell users they hit the limit?'],deep:'Choosing a rate-limiting algorithm and atomic counting across instances'},
];
const PH=[
  {name:'Understand the problem, set the scope',short:'Scope',rec:[3,10],plan:8,items:['Core features and users','Scale: DAU, read/write ratio, peak','Consistency and availability needs','Core APIs (read and write endpoints)']},
  {name:'High-level design, get buy-in',short:'Blueprint',rec:[10,15],plan:12,items:['Write path','Read path','Capacity: QPS, storage','Confirm direction with the interviewer']},
  {name:'Deep dive',short:'Deep dive',rec:[10,25],plan:20,items:['Primary key and access pattern of key data','Capacity limit and failure modes','Consequences of lost, duplicated, delayed data','When to upgrade and how to migrate']},
  {name:'Wrap-up',short:'Wrap',rec:[3,5],plan:5,items:['Restate the goal and scope','Walk the write and read paths','The two most important trade-offs','Biggest bottleneck and one failure safeguard','Upgrade triggers and validation plan']},
];
const WRAP=[
  ['Restate the goal and core assumptions','We covered posting, time-ordered fetching, and media access; recommendation ranking is out of scope.'],
  ['Walk the write and read paths on the diagram','A post returns success once the main store commits it; ordinary users’ post IDs are pushed asynchronously, the read side aggregates the text, and a cache miss falls through to the backend.'],
  ['The two most important trade-offs','Precomputing the feed buys low read latency at the cost of fan-out writes and a brief propagation delay; celebrities merge on read, so the read side does one extra step.'],
  ['Biggest bottleneck and one failure safeguard','Top-user fan-out can back up the queue: monitor the age of the oldest message, merge celebrities on read, and replay with rate limiting.'],
  ['Upgrade triggers and validation plan','Split the database or shards only at a measured capacity threshold; before launch, rehearse replay, failover, and a full cache invalidation.'],
].map(([t,ex])=>({t,ex,dur:60}));
const PITCH=[
  ['Requirements','Who wants what?',15,'A friends’ feed, newest first, with text and images; seconds of propagation delay allowed; no recommendations for now.'],
  ['Path','How does a request flow?',25,'A post is written to the database first, then a fan-out task is reliably produced to push the post ID into followers’ inboxes; a read fetches the ID list, then aggregates the text, and images go through object storage and a CDN.'],
  ['Bottleneck','Where does it jam first?',15,'Celebrities with huge follower counts, and the fall-through load after cache invalidation; monitor fan-out backlog, hot shards, and read latency.'],
  ['Trade-off','Why accept the cost?',20,'Fan-out on write for ordinary users buys low read latency, and merge on read for celebrities accepts extra computation; “published” only means the post is saved.'],
  ['Evolution','What evidence triggers an upgrade?',15,'Start with a single database and stateless services; add read replicas, sharding, or a different fan-out only when measurements reach the capacity limit.'],
].map(([t,q,dur,ex])=>({t,q,dur,ex}));
SDLab.define({
  id:'interview-drill',transport:false,chapter:3,
  title:'Interview Pacing Drill: 45 Minutes, Last 5 Minutes, 90 Seconds',
  summary:'Pick a question, press Start, and talk at your own pace. Press Next step when you finish a step, and tick the checklist as you go. The timeline compares you with the suggested split, and the checkpoints at minutes 10, 20, and 40 tell you if you are drifting.',
  caveat:'Suggested durations come from this chapter: scope 3–10, blueprint 10–15, deep dive 10–25, wrap-up 3–5 minutes. The checkpoints are practical timing markers, the five wrap-up steps come from card Q03-04, and the 90-second split comes from Q03-05. The timer follows the browser clock and keeps running if you scroll away; ticks and times are kept only on this page. The sample answer is provided for the news feed only.',
  mount(ctx){
    const C=ctx.colors,COL=[C.series[0],C.series[1],C.series[2],C.series[3],C.series[4]];
    ctx.css('ivd',`
.ivd-q{display:flex;flex-direction:column;gap:4px}
.ivd-q .t{font-size:16px;font-weight:700}
.ivd-q details{font-size:13px}.ivd-q summary{cursor:pointer;color:#176b52}
.ivd-q ol{margin:4px 0 0;padding-left:20px}
.ivd-clock{display:flex;align-items:baseline;gap:6px 14px;flex-wrap:wrap;margin:12px 0 2px}
.ivd-clock .big{font-size:34px;font-weight:750;font-variant-numeric:tabular-nums;line-height:1.1}
.ivd-clock .of{color:#66756d;font-size:14px}
.ivd-clock .cur{font-size:15px;font-weight:650}
.ivd-clock .cur small{font-weight:400;color:#66756d;font-size:13px}
.ivd-tl{position:relative;padding-top:24px;margin:4px 0 2px}
.ivd-row{display:grid;grid-template-columns:36px minmax(0,1fr);align-items:center;margin:4px 0}
.ivd-row>span{font-size:12px;color:#66756d}
.ivd-bar{position:relative;height:26px;border-radius:6px;background:#f0f4ed;overflow:hidden;display:flex}
.ivd-bar>span{height:100%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:650;overflow:hidden;white-space:nowrap;border-right:2px solid #fff;min-width:0}
.ivd-act>span{position:absolute;top:0;color:#fff;border-right:0}
.ivd-now{position:absolute;top:0;bottom:0;width:2px;background:#23352f}
.ivd-cps{position:absolute;left:36px;right:0;top:0;bottom:0;pointer-events:none}
.ivd-cp{position:absolute;top:18px;bottom:0;border-left:1.5px dashed #9fb0a5}
.ivd-cp b{position:absolute;top:-18px;transform:translateX(-50%);font-size:12px;white-space:nowrap;padding:0 6px;border-radius:6px;background:#e6eee2;color:#4f5f57;font-weight:650}
.ivd-cp.ok b{background:#dcefe2;color:#1d6a41}.ivd-cp.warn b{background:#f6ead2;color:#86561a}.ivd-cp.bad b{background:#f7dedb;color:#9b2c27}
.ivd-cp.last b{transform:translateX(-85%)}
.ivd-axis{position:relative;height:16px;margin-left:36px;font-size:12px;color:#66756d}
.ivd-axis i{position:absolute;font-style:normal;transform:translateX(-50%);white-space:nowrap}
.ivd-axis i:first-child{transform:none}.ivd-axis i:last-child{transform:translateX(-100%)}
.ivd-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:10px}
.ivd-ph{border:1px solid #dbe2da;border-radius:10px;padding:8px 10px;background:#fbfcfa;font-size:13px;min-width:0}
.ivd-ph.cur{border-width:2px;background:#fff}
.ivd-ph h4{margin:0 0 4px;font-size:13px;display:flex;justify-content:space-between;gap:6px;border:0;padding:0}
.ivd-ph label{display:flex;gap:6px;align-items:flex-start;cursor:pointer;line-height:1.45;margin:3px 0}
.ivd-ph input{margin-top:3px;accent-color:#176b52}
.ivd-ph .ex{color:#4f5f57;margin:2px 0 0;font-size:13px}
.ivd-ph .q{color:#66756d}
.ivd-ph.done{opacity:.72}
`);
    let narrow=false,mode='full',qi=0,speed=1,running=false,since=0,base=0,p=0,starts=[0],ticks=new Map(),cpState={},ended=false,warned={};
    const segs=()=>mode==='wrap'?WRAP:mode==='pitch'?PITCH:PH;
    const total=()=>mode==='full'?2700:mode==='wrap'?300:90;
    const now=()=>Math.min(total(),running?base+(performance.now()-since)/1000*speed:base);
    const modeCtl=ctx.segmented({label:'Drill mode',wide:true,value:mode,options:[['full','Full 45 minutes'],['wrap','Last 5 minutes: wrap up'],['pitch','90-second answer']],onChange:v=>{mode=v;restart()}});
    const qCtl=ctx.select({label:'Question',value:'feed',options:QS.map(q=>[q.id,q.name.replace('Design a ','')+' ('+q.ref+')']),onChange:v=>{qi=QS.findIndex(q=>q.id===v);drawQ()}});
    const spCtl=ctx.segmented({label:'Clock speed',value:1,options:[[1,'Real time'],[10,'10×'],[60,'60×']],onChange:v=>{base=now();since=performance.now();speed=v}});
    const startBtn=ctx.button('Start',()=>running?pause():start(),{primary:true});
    const nextBtn=ctx.button('Next step',()=>next());
    ctx.button('Restart',()=>restart());
    const qBox=h('div',{class:'sdl-panel ivd-q'});
    const big=h('span',{class:'big'}),of=h('span',{class:'of'}),cur=h('span',{class:'cur'});
    const planBar=h('div',{class:'ivd-bar'}),actBar=h('div',{class:'ivd-bar ivd-act'}),nowMark=h('i',{class:'ivd-now'}),cps=h('div',{class:'ivd-cps'}),axis=h('div',{class:'ivd-axis'});
    actBar.append(nowMark);
    const grid=h('div',{class:'ivd-grid'});
    const tbl=h('table',{class:'sdl-table'}),tblBox=h('div',{class:'sdl-scroll',style:{marginTop:'10px'}},tbl);
    ctx.stage.append(qBox,h('div',{class:'ivd-clock','aria-live':'off'},big,of,cur),h('div',{class:'ivd-tl'},h('div',{class:'ivd-row'},h('span',null,'Plan'),planBar),h('div',{class:'ivd-row'},h('span',null,'Used'),actBar),cps),axis,grid,tblBox);
    const stats=ctx.stats([{key:'t',label:'Elapsed'},{key:'ph',label:'Current step'},{key:'cp',label:'Checkpoints'},{key:'ck',label:'Checklist'}]);
    const CPS=[
      {t:600,label:'10 min',ok:()=>ticks.has('0-3')&&[0,1,2,3].filter(i=>ticks.has('0-'+i)).length>=3,
        pass:'Requirements and core APIs are in place',fail:()=>ticks.has('0-3')?`Only ${cnt(0)}/4 on the scope checklist: assumptions on scale and consistency aren’t written down, so later capacity and trade-off talk has no basis.`:`Core APIs not written down yet (scope checklist ${cnt(0)}/4). Restate the scope in one sentence and add the read and write endpoints before the blueprint.`},
      {t:1200,label:'20 min',ok:()=>ticks.has('1-0')&&ticks.has('1-1')&&ticks.has('1-2'),
        pass:'High-level diagram and capacity estimates are done',fail:()=>'No read/write paths or capacity estimates yet. Finish the high-level diagram and confirm direction with the interviewer before the deep dive.'},
      {t:2400,label:'40 min',last:true,ok:()=>p===3,pass:'Stopped adding components and moved into the wrap-up',fail:()=>'Still in “'+PH[p].short+'”. Stop adding components and start the wrap-up: restate the goal, walk the read and write paths, cover trade-offs and failures.',bad:true},
    ];
    const cnt=i=>PH[i].items.filter((_,j)=>ticks.has(i+'-'+j)).length;
    function drawQ(){
      const q=QS[qi];
      qBox.replaceChildren(...[h('span',{class:'t'},q.name),
        mode==='full'?h('details',null,h('summary',null,'Stuck? Three design-changing clarifying questions'),h('ol',null,q.ask.map(a=>h('li',null,a)))):null,
        h('span',{class:'sdl-note',style:{margin:0}},mode==='full'?'Suggested deep-dive focus: '+q.deep:mode==='wrap'?'Assume you are at minute 40 and have 5 minutes to wrap up. Do one thing per minute below.':'Squeeze the whole question into 90 seconds: answer one question per part and keep a single storyline.')].filter(Boolean));
    }
    function build(){
      const S=segs(),T=total();
      planBar.replaceChildren(...S.map((s,i)=>{const d=mode==='full'?s.plan*60:s.dur;return h('span',{style:{width:(d/T*100)+'%',background:COL[i]+'2e',color:COL[i]}},(mode==='full'?s.short+(narrow?'':' '+s.plan+'′'):mode==='wrap'?(i+1)+'′':s.t+(narrow?'':' '+s.dur+'″')))}));
      cps.replaceChildren(...(mode==='full'?CPS.map(c=>{const el=h('div',{class:'ivd-cp'+(c.last?' last':''),style:{left:(c.t/T*100)+'%'}},h('b',null,c.label));c.el=el;return el}):[]));
      const marks=mode==='full'?[0,10,20,30,40,45]:mode==='wrap'?[0,1,2,3,4,5]:[0,15,40,55,75,90];
      axis.replaceChildren(...marks.map(m=>h('i',{style:{left:((mode==='full'||mode==='wrap'?m*60:m)/T*100)+'%'}},mode==='pitch'?m+'″':m+'′')));
      drawGrid();
    }
    function drawGrid(){
      const S=segs(),ci=curIdx();
      grid.replaceChildren(...S.map((s,i)=>{
        const box=h('div',{class:'ivd-ph'+(i===ci?' cur':'')+(i<ci?' done':''),style:{borderColor:i===ci?COL[i]:null}});
        if(mode==='full'){
          box.append(h('h4',null,h('span',{style:{color:COL[i]}},(i+1)+' '+s.name),h('span',{class:'sdl-note',style:{margin:0}},s.rec.join('–')+' min')));
          s.items.forEach((it,j)=>{const k=i+'-'+j,cb=h('input',{type:'checkbox',checked:ticks.has(k)});cb.onchange=()=>setTick(k,cb.checked);box.append(h('label',null,cb,h('span',null,it,ticks.has(k)?h('span',{class:'sdl-note'},' '+mmss(ticks.get(k))):null)))});
        }else{
          const d=mode==='wrap'?'Minute '+(i+1):s.dur+'\u00a0s';
          box.append(h('h4',null,h('span',{style:{color:COL[i]}},(mode==='wrap'?s.t:s.t+': '+s.q)),h('span',{class:'sdl-note',style:{margin:0}},d)));
          if(QS[qi].id==='feed')box.append(h('p',{class:'ex'},'Sample: '+s.ex));
        }
        return box;
      }));
    }
    function setTick(k,on,t){if(on){ticks.set(k,t??now());const [i,j]=k.split('-').map(Number);ctx.log(mmss(ticks.get(k))+' ✓ '+PH[i].items[j],'ok')}else ticks.delete(k);drawGrid();refresh()}
    function curIdx(t=now()){if(mode==='full')return p;let acc=0;const S=segs();for(let i=0;i<S.length;i++){acc+=S[i].dur;if(t<acc)return i}return S.length-1}
    let lastIdx=-1;
    function refresh(){
      const t=now(),T=total(),S=segs(),ci=curIdx(t);
      big.textContent=mmss(t);of.textContent='/ '+mmss(T);
      if(mode==='full'){
        const pt=t-starts[p],r=PH[p].rec;cur.replaceChildren(PH[p].short+' · '+mmss(pt),h('small',null,`(suggested ${r[0]}–${r[1]} min)`));
        if(!ended&&pt>r[1]*60&&!warned[p]){warned[p]=1;ctx.log(`${mmss(t)} “${PH[p].short}” is over the suggested limit of ${r[1]} min`,'warn')}
        // actual segments
        const segsEl=[...actBar.querySelectorAll('span')];
        for(let i=0;i<4;i++){
          let el=segsEl[i];if(!el){el=h('span',{style:{background:COL[i]}},PH[i].short);actBar.insertBefore(el,nowMark)}
          const s=starts[i],e=i<p?starts[i+1]:t;
          if(s==null||i>p){el.style.width='0';continue}
          const wp=Math.max(0,(e-s)/T*100);el.style.left=(s/T*100)+'%';el.style.width=wp+'%';el.textContent=wp>=(narrow?22:11)?PH[i].short:'';
        }
        for(const c of CPS){if(t>=c.t&&!cpState[c.t]){const ok=c.ok();cpState[c.t]=ok?'ok':c.bad?'bad':'warn';ctx.log(`${mmss(c.t)} Checkpoint ${ok?'passed: '+c.pass:': '+c.fail()}`,cpState[c.t])}if(c.el)c.el.className='ivd-cp'+(c.last?' last':'')+(cpState[c.t]?' '+cpState[c.t]:'')}
      }else{
        const s0=S.slice(0,ci).reduce((a,s)=>a+s.dur,0);cur.replaceChildren((mode==='wrap'?S[ci].t:S[ci].t+': '+S[ci].q)+' · ',h('small',null,'Left in this part: '+mmss(s0+S[ci].dur-t)));
        const els=[...actBar.querySelectorAll('span')];let a0=0;
        S.forEach((s,i)=>{let el=els[i];if(!el){el=h('span',{style:{background:COL[i]}});actBar.insertBefore(el,nowMark)}const w=Math.max(0,Math.min(t,a0+s.dur)-a0);el.style.left=(a0/T*100)+'%';el.style.width=(w/T*100)+'%';a0+=s.dur});
        if(ci!==lastIdx){lastIdx=ci;drawGrid();if(t<T)ctx.log(`${mmss(s0)} ${mode==='wrap'?'Minute '+(ci+1)+': '+S[ci].t:S[ci].t+' ('+S[ci].dur+' s): '+S[ci].q}`,'info')}
      }
      nowMark.style.left=`calc(${t/T*100}% - 1px)`;
      const done=Object.values(cpState).filter(v=>v==='ok').length,all=Object.keys(cpState).length;
      stats.set('t',mmss(t),t>=T?'warn':'info');
      stats.set('ph',mode==='full'?(p+1)+' / 4 '+PH[p].short:(ci+1)+' / '+S.length+' '+S[ci].t,null);
      stats.set('cp',mode==='full'?(all?done+' / '+all+' passed':'Not yet'):'—',mode!=='full'||!all?null:done===all?'ok':'bad');
      const tk=PH.reduce((s,_,i)=>s+cnt(i),0);stats.set('ck',mode==='full'?tk+' / 17':'—',null);
      if(mode==='full')drawTable(t);
      if(t>=T&&!ended){ended=true;pause();finish()}
    }
    function drawTable(t){
      tbl.replaceChildren(h('thead',null,h('tr',null,h('th',null,'Step'),h('th',null,'Plan'),h('th',null,'Actual'),h('th',null,'Done'))),
        h('tbody',null,PH.map((s,i)=>{const st=starts[i],d=st==null||i>p?null:(i<p?starts[i+1]:t)-st;const bad=d!=null&&(i<p||ended)&&(d<s.rec[0]*60||d>s.rec[1]*60);
          return h('tr',null,h('td',null,(i+1)+' '+s.short),h('td',null,s.rec.join('–')+' min'),h('td',{style:{color:bad?C.warn:null,fontWeight:bad?'700':null}},d==null?'—':mmss(d)),h('td',null,cnt(i)+' / '+s.items.length))})));
    }
    function finish(){
      if(mode==='full'){const ok=Object.values(cpState).filter(v=>v==='ok').length;ctx.log(`45:00 done: ${ok}/3 checkpoints passed, checklist ${PH.reduce((s,_,i)=>s+cnt(i),0)}/17. ${p<3?'You left no time for the wrap-up.':''}`,ok===3?'ok':'warn');ctx.openLog()}
      else ctx.log(mode==='wrap'?'5 minutes are up: if the interviewer has more questions, stop here and answer them.':'90 seconds are up. Play back your recording: did each part answer its question?','info');
      ctx.announce('Practice time is up');
    }
    let acc=0;const lp=ctx.loop(dt=>{acc+=dt;if(acc<.2)return;acc=0;if(running)refresh()},false);
    function start(){if(ended)restart();if(mode!=='full'&&now()===0)lastIdx=-1;running=true;since=performance.now();startBtn.textContent='Pause';lp.start()}
    function pause(){base=now();running=false;startBtn.textContent=ended?'Start':'Resume';lp.stop();refresh()}
    function next(){
      const t=now();
      if(mode==='full'){
        if(p>=3)return;
        if(p===1&&(t-starts[1]<180||cnt(1)<2))ctx.log(`${mmss(t)} Only ${mmss(t-starts[1])} on the blueprint and ${cnt(1)}/4 on the checklist before the deep dive: if assumptions aren’t aligned, the deeper you go, the more rework`,'warn');
        p++;starts[p]=t;ctx.log(`${mmss(t)} Entering “${PH[p].short}”`,'info');drawGrid();refresh();
      }else{const S=segs(),ci=curIdx(t);if(ci>=S.length-1)return;base=S.slice(0,ci+1).reduce((a,s)=>a+s.dur,0);since=performance.now();refresh()}
    }
    function restart(){running=false;lp.stop();base=0;p=0;starts=[0];ticks=new Map();cpState={};ended=false;warned={};lastIdx=0;actBar.querySelectorAll('span').forEach(s=>s.remove());startBtn.textContent='Start';tblBox.hidden=mode!=='full';nextBtn.textContent=mode==='full'?'Next step':'Skip to next part';ctx.clearLog();drawQ();build();refresh()}
    ctx.onResize(w=>{const n=w<520;if(n!==narrow){narrow=n;build();refresh()}});
    restart();

    /* ---- Scenarios: scripted replay (advanced by the lab clock, not the browser clock) ---- */
    async function replay(m,events,end,step,ms){
      modeCtl.set(m,true);mode=m;qCtl.set('feed',true);qi=0;restart();ctx.openLog();lastIdx=-1;
      const ev=[...events].sort((a,b)=>a[0]-b[0]);let i=0;
      for(let t=0;t<=end;t+=step){
        while(i<ev.length&&ev[i][0]<=t){const [et,fn]=ev[i++];base=et;fn()}
        base=t;refresh();await ctx.wait(ms);
      }
      base=end;refresh();
    }
    const tk=(t,k)=>[t,()=>setTick(k,true,t)],go=t=>[t,()=>next()],say=(t,s,tone)=>[t,()=>ctx.log(mmss(t)+' '+s,tone)];
    ctx.scenarios([
      {id:'early-deep',label:'Diving into the database right away',
        ask:'The candidate finishes the questions in 2 minutes, draws a block diagram for only 1 minute, then starts designing table schemas and indexes. How many of the checkpoints at minutes 10, 20, and 40 pass?',
        insight:'None pass. At minute 10 the core APIs aren’t written; at minute 20 there are no read/write paths or capacity estimates; at minute 26 the interviewer adds “we need personalized recommendations,” so the indexes designed for newest-first reads need rework; at minute 40 you are still deep-diving and never wrap up. High-level buy-in confirms the scope and data flows. If a basic assumption is wrong, the deeper the database details, the more rework.',
        run:()=>replay('full',[tk(40,'0-0'),tk(100,'0-1'),go(120),go(180),tk(420,'2-0'),say(700,'Still adding indexes to the post table and discussing column types','warn'),say(1560,'Interviewer: we actually need personalized ranking. The indexes designed for newest-first reads need rework','bad'),tk(1900,'2-1'),say(2300,'Adding yet another search service','warn')],2700,30,150)},
      {id:'paced',label:'Following the suggested pace for 45 minutes',
        ask:'Split the four steps as 8 / 11 / 21 / 5 minutes and tick the checklist as you go. Do all three checkpoints pass? Is about 20 minutes enough for the deep dive?',
        insight:'All three checkpoints pass: at minute 8 the requirements and APIs are written down, by minute 19 you have the read/write paths and capacity estimates, and you start the wrap-up on time at minute 40. A 20-minute deep dive covers only one or two key components thoroughly, so ask the interviewer during the blueprint which bottleneck they most want to explore. Each of the five wrap-up items gets about a minute.',
        run:()=>replay('full',[tk(60,'0-0'),tk(150,'0-1'),tk(240,'0-2'),tk(400,'0-3'),go(480),tk(600,'1-0'),tk(720,'1-1'),tk(900,'1-2'),tk(1080,'1-3'),go(1140),tk(1400,'2-0'),tk(1700,'2-1'),tk(2000,'2-2'),tk(2250,'2-3'),go(2400),tk(2430,'3-0'),tk(2490,'3-1'),tk(2550,'3-2'),tk(2610,'3-3'),tk(2670,'3-4')],2700,30,150)},
      {id:'wrap5',label:'How to wrap up with 5 minutes left',
        ask:'At minute 40 you still want to add search and recommendation services to the feed. How should you spend the remaining 5 minutes?',
        insight:'Stop expanding and do one thing per minute: first restate the goal and scope, then walk the write and read paths on the diagram (when data becomes durable, when to return success), then cover the two most important trade-offs, the biggest bottleneck, and one failure safeguard, and finally give the upgrade triggers and validation plan, leaving time for follow-ups. The wrap-up proves the design works and the trade-offs are explicit; it is not the time to invent a tenth service.',
        run:()=>replay('wrap',[say(0,'Minute 40: no more search service, start wrapping up','info')],300,5,250)},
      {id:'pitch90',label:'Cover a question in 90 seconds',
        ask:'You get 90 seconds for the news feed. How many seconds go to requirements, path, bottleneck, trade-off, and evolution?',
        insight:'15 / 25 / 15 / 20 / 15 seconds. The path is the longest because it must explain the write success point and the read and write data flows. Each part answers just one question: who wants what, how the request flows, where it jams first, why accept the cost, what evidence triggers an upgrade. When practicing, record and time yourself, and cut repeated adjectives.',
        run:()=>replay('pitch',[],90,1,180)},
    ]);
  }
});

/* ---------------- Lab 2: how requirements change the architecture ---------------- */
const FRIENDS=200,CELEB=1e6;
SDLab.define({
  id:'interview-scope',chapter:3,
  title:'News Feed: How Requirement Answers Change the Architecture',
  summary:'At the whiteboard, ask first: how to rank, how many people, what content, what scale. Each time you change an answer, the affected paths are redrawn and new components are marked, with a note below on why they appear.',
  caveat:'Assumptions: each daily active user posts 1 time per day and refreshes 10 times, has 200 friends or follows on average, peak is 2 times the average, and a celebrity has 1,000,000 followers. Pull on read counts 200 followed accounts queried per refresh. The backlog animation uses peak traffic and plays at 30× speed. The component list is a high-level whiteboard diagram, not the only correct design.',
  mount(ctx){
    const C=ctx.colors;
    ctx.css('ivs',`
.ivs-lane{margin:0 0 10px}
.ivs-lane .nm{font-size:12px;font-weight:700;color:#66756d;margin:0 0 3px}
.ivs-chips{display:flex;flex-wrap:wrap;gap:4px 2px;align-items:center}
.ivs-chip{font-size:13px;border:1px solid #cdd8cf;border-radius:8px;padding:3px 9px;background:#fff;line-height:1.45}
.ivs-chip.new{border-color:#2f8f5b;background:#eef8f1}
.ivs-chip.new::after{content:'new';font-size:11px;margin-left:5px;color:#1d6a41;font-weight:700}
.ivs-chip.warn{border-color:#c2413b;background:#fbeceb;color:#9b2c27}
.ivs-chip.note{border-style:dashed;color:#4f5f57;background:#fbfcfa}
.ivs-ar{color:#9fb0a5;font-size:13px;padding:0 2px}
@keyframes ivs-wave{0%{box-shadow:0 0 0 0 #2f6fb300}30%{box-shadow:0 0 0 3px #2f6fb366}100%{box-shadow:0 0 0 0 #2f6fb300}}
.ivs-lane.run .ivs-chip{animation:ivs-wave .9s ease-out both;animation-delay:calc(var(--i) * .12s)}
.ivs-why{margin:6px 0 0;padding-left:18px;font-size:13px}
.ivs-why li{margin:3px 0}
.ivs-why li.hot{color:#124832;font-weight:600}
.ivs-q{margin-top:10px}
.ivs-q .bar{height:14px;border-radius:7px;background:#e6eee2;overflow:hidden;margin:4px 0}
.ivs-q .bar i{display:block;height:100%;width:0;background:#b7791f;border-radius:7px}
`);
    const S={sort:'time',follow:'cap',media:'text',dau:1e7,fan:'push',cap:5e4};
    const CAPS=[1e4,2e4,5e4,1e5,2e5,5e5,1e6];
    const seg=(k,label,opts)=>ctx.segmented({label,value:S[k],options:opts,onChange:v=>{const old=S[k];S[k]=v;update(k,old)}});
    const c={
      sort:seg('sort','Ranking',[['time','Newest first'],['rank','Personalized']]),
      follow:seg('follow','Follow graph',[['cap','Friend cap 5,000'],['celeb','Celebrities allowed']]),
      media:seg('media','Content',[['text','Text only'],['image','Images'],['video','Video']]),
      dau:seg('dau','DAU',[[1e5,'100K'],[1e7,'10M'],[1e8,'100M']]),
      fan:seg('fan','Fan-out strategy (your design choice)',[['push','Push on write'],['pull','Pull on read'],['hybrid','Hybrid: pull for celebrities']]),
    };
    const capCtl=ctx.slider({label:'Total fan-out worker capacity',min:0,max:CAPS.length-1,value:CAPS.indexOf(S.cap),format:v=>util.fmt(CAPS[v])+' writes/s',onInput:v=>{S.cap=CAPS[v];update('cap')}});
    const celebBtn=ctx.button('Celebrity posts once (1,000,000 followers)',()=>celebPost(),{primary:true});
    const lanesBox=h('div'),why=h('ol',{class:'ivs-why'}),qBox=h('div',{class:'sdl-panel ivs-q'});
    const qText=h('div',{class:'sdl-note',style:{margin:0}}),qFill=h('i');
    qBox.append(h('div',{class:'ph'},'Fan-out queue'),h('div',{class:'bar'},qFill),qText);
    ctx.stage.append(lanesBox,h('div',{class:'sdl-panel',style:{marginTop:'6px'}},h('div',{class:'ph'},'Why these components'),why),qBox);
    const stats=ctx.stats([{key:'post',label:'Posts (avg)'},{key:'fan',label:'Inbox writes (peak)'},{key:'read',label:'Feed reads (peak)'},{key:'q',label:'Fan-out backlog'}]);
    let prev=new Set(),backlog=0,simT=0;
    const calc=()=>{const posts=S.dau/86400,push=S.fan!=='pull',fanAvg=push?posts*FRIENDS:0,fanPk=fanAvg*2,readPk=S.dau*10/86400*2;return {posts,fanAvg,fanPk,readPk,pullQ:S.fan==='pull'?readPk*FRIENDS:0}};
    function lanes(){
      const celeb=S.follow==='celeb',small=S.dau<=1e5,big=S.dau>=1e8,push=S.fan!=='pull';
      const pub=['Client posts','API service',big?'Post store (sharded)':'Post store'];
      if(push){if(small)pub.push('Write friends’ inboxes synchronously');else pub.push('Fan-out queue','Fan-out worker'+(big?' ×N':''));pub.push('Feed cache (a post ID list per user)')}
      else pub.push({t:'Publishing ends here, no fan-out',k:'note'});
      if(celeb&&S.fan==='push')pub.push({t:'Celebrity post = 1,000,000 inbox writes',k:'warn'});
      if(celeb&&S.fan==='hybrid')pub.push({t:'Celebrity posts are not fanned out',k:'note'});
      const rd=['Client refreshes','API service'];
      if(push)rd.push('Read post IDs from the feed cache');else rd.push(S.dau>=1e7?{t:'Query the latest posts of 200 followed accounts, then merge',k:'warn'}:'Query followed accounts’ latest posts, then merge');
      if(celeb&&S.fan==='hybrid')rd.push('Merge followed celebrities’ posts');
      if(S.sort==='rank')rd.push('Candidate retrieval','Feature + ranking service');else rd.push('Page by (time, ID) cursor');
      rd.push('Aggregate post text (post cache → post store)');
      if(S.media!=='text')rd.push(S.media==='video'?'Fetch video from the CDN (resolution by bandwidth)':'Fetch images from the CDN');
      const L=[['Publish path',pub],['Read path',rd]];
      if(S.media!=='text')L.push(['Media path',S.media==='video'?['Client uploads','Object storage','Transcoding queue','Transcoding worker','Multi-resolution files','CDN',{t:'Show “Processing” until done',k:'note'}]:['Client uploads','Object storage','CDN',{t:'The post stores only a media reference',k:'note'}]]);
      return L.map(([n,cs])=>[n,cs.map(x=>typeof x==='string'?{t:x}:x)]);
    }
    function whyList(changed){
      const R=calc(),items=[
        ['sort',S.sort==='time'?'Newest first: build a cursor from time and a stable ID, and read a materialized list of post IDs.':'Personalized: adds candidate retrieval, features, and ranking computation, and paging and caching get more complex. Don’t add it early when time order is all that’s required.'],
        ['follow',S.follow==='cap'?'Friends are capped: a post writes at most 5,000 inboxes, so the cost of fan-out on write is bounded and buys fast reads.':'Celebrities can be followed: an average of 200 followers hides the top users, and one celebrity post is 1,000,000 writes, so celebrities are usually switched to pull on read (hybrid fan-out).'],
        ['media',S.media==='text'?'Text only: the post text can live in the business database.':S.media==='image'?'Images: go into object storage and are served by a CDN; the post record stores only a reference.':'Video: needs async transcoding into several resolutions; define whether to show a placeholder after upload or wait until processing is done.'],
        ['dau',S.dau<=1e5?`100,000 DAU: about ${util.fmt(R.posts,1)} posts per second on average, so a single database plus a cache is enough and fan-out can be done synchronously. Sharding now would only add migration and operational burden.`:S.dau<1e8?`10,000,000 DAU: about ${util.fmt(R.posts)} posts per second on average with 200 recipients each, so fan-out should run asynchronously through a queue, and the feed cache stores only IDs.`:`100,000,000 DAU: about ${util.fmt(R.posts)} posts per second on average and hundreds of thousands of inbox writes per second at peak, so the post store must be sharded, and workers must scale out with backlog monitoring.`],
        ['fan',S.fan==='push'?'Push on write: reads are fastest, and write volume = posts × followers.':S.fan==='pull'?`Pull on read: publishing is cheapest, but every refresh must query ${FRIENDS} followed accounts and merge${S.dau>=1e7?', about '+util.fmt(R.pullQ)+' queries/s at peak':''}.`:(S.follow==='celeb'?'Hybrid: push on write for ordinary users and pull on read for celebrities, trading the celebrities’ write amplification for a small merge at read time.':'Hybrid: with no celebrities, it behaves like push on write.')],
      ];
      why.replaceChildren(...items.map(([k,t])=>h('li',{class:k===changed?'hot':null},t)));
    }
    function update(changed,old){
      const L=lanes(),seen=new Set(),hot=changed&&changed!=='cap';
      lanesBox.replaceChildren(...L.map(([n,cs])=>{
        const box=h('div',{class:'ivs-lane'+(hot?' run':'')},h('p',{class:'nm'},n));const row=h('div',{class:'ivs-chips'});
        cs.forEach((x,i)=>{seen.add(n+x.t);if(i)row.append(h('span',{class:'ivs-ar','aria-hidden':'true'},x.k?'·':'→'));row.append(h('span',{class:'ivs-chip'+(x.k?' '+x.k:'')+(hot&&!prev.has(n+x.t)&&!x.k?' new':''),style:{'--i':i}},x.t))});
        box.append(row);return box;
      }));
      prev=seen;whyList(changed);
      const R=calc();
      stats.set('post',util.fmt(R.posts,R.posts<10?1:0)+' posts/s',null);
      const u=R.fanPk/S.cap;
      stats.set('fan',S.fan==='pull'?'0 (no fan-out)':util.fmt(R.fanPk)+'/s · '+util.pct(u,0),S.fan==='pull'?null:u>1?'bad':u>.8?'warn':'ok');
      stats.set('read',S.fan==='pull'?util.fmt(R.pullQ)+' queries/s':util.fmt(R.readPk)+' reads/s',S.fan==='pull'&&S.dau>=1e7?'bad':null);
      celebBtn.disabled=S.follow!=='celeb';celebBtn.title=S.follow!=='celeb'?'First set the follow graph to “Celebrities allowed”':'';
      drawQ();
      if(changed&&changed!=='cap'&&old!=null){const nm={sort:'Ranking',follow:'Follow graph',media:'Content',dau:'DAU',fan:'Fan-out strategy'}[changed];ctx.log(`${nm} set to “${c[changed].el.querySelector('[aria-pressed=true]').textContent}”`,'info')}
    }
    function drawQ(){
      const R=calc(),spare=S.cap-R.fanPk;
      qFill.style.width=Math.min(100,backlog/CELEB*100)+'%';qFill.style.background=spare<=0?C.bad:C.warn;
      if(S.fan==='pull'){qText.textContent='Pull on read doesn’t go through the fan-out queue.';stats.set('q','—',null);return}
      if(backlog>0)qText.textContent=`Backlog of ${util.fmt(backlog)} messages: a new post waits about ${util.fmt(backlog/S.cap,0)} s before its fan-out starts. ${spare>0?'At peak, workers have only '+util.fmt(spare)+' per second of headroom, so it clears in about '+util.duration(backlog/spare)+'.':'Workers can’t keep up with peak traffic, so the backlog only grows.'}`;
      else qText.textContent=spare<=0?`Peak inbox writes of ${util.fmt(R.fanPk)}/s exceed worker capacity of ${util.fmt(S.cap)}/s, so the backlog keeps growing.`:`Peak utilization is ${util.pct(R.fanPk/S.cap,0)}, with headroom of ${util.fmt(spare)} messages per second. ${S.follow==='celeb'?'Press the button above to see a celebrity post.':''}`;
      stats.set('q',backlog>0?util.fmt(backlog)+' msgs':'0',backlog>0?(spare>0?'warn':'bad'):'ok');
    }
    const lp=ctx.loop(dt=>{
      const R=calc(),d=dt*30;simT+=d;backlog=Math.max(0,backlog+(R.fanPk-S.cap)*d);
      if(backlog<=0){lp.stop();ctx.log(`Backlog cleared after about ${util.duration(simT)} (simulated time)`,'ok')}
      else if(backlog>5*CELEB){lp.stop();ctx.log('Backlog exceeds 5,000,000 messages; simulation stopped','bad')}
      drawQ();
    },false);
    function celebPost(){
      if(S.follow!=='celeb')return;
      if(S.fan!=='push'){ctx.log('Celebrity post: no writes to followers’ inboxes; their new post is merged in when followers refresh','ok');return}
      backlog+=CELEB;simT=0;ctx.log(`Celebrity post: 1,000,000 inbox writes enter the queue, and a new post waits about ${util.fmt(backlog/S.cap,0)} s`,'warn');drawQ();lp.start();
    }
    update();
    const setAll=o=>{Object.assign(S,o);for(const k in c)c[k].set(S[k],true);capCtl.set(CAPS.indexOf(S.cap),true);backlog=0;lp.stop();prev=new Set(lanes().flatMap(([n,cs])=>cs.map(x=>n+x.t)));update()};
    const change=async(k,v,ms=2800)=>{const old=S[k];S[k]=v;c[k].set(v,true);update(k,old);await ctx.wait(ms)};
    ctx.scenarios([
      {id:'three',label:'Three questions change three paths',
        ask:'Start from “newest first, friend cap, text only” and change the three answers in turn to “personalized, celebrities allowed, video.” What appears on the diagram after each change?',
        insight:'With personalized ranking, the read path gains candidate retrieval and a ranking service, and cursor paging no longer applies. When celebrities can be followed, the publish path shows a red warning, “Celebrity post = 1,000,000 inbox writes,” and the fan-out strategy needs to become hybrid. With video, a whole media path appears: object storage, a transcoding queue and workers, multiple resolutions, and a CDN. Each clarifying question maps to a path it changes, and questions that don’t change the design needn’t be asked.',
        async run(){ctx.clearLog();ctx.openLog();setAll({sort:'time',follow:'cap',media:'text',dau:1e7,fan:'push',cap:5e4});await ctx.wait(1500);await change('sort','rank');await change('follow','celeb');await change('media','video');await change('fan','hybrid',2400)}},
      {id:'celeb',label:'A celebrity post floods the fan-out queue',
        ask:'With 10,000,000 DAU, peak inbox writes are about 46,000/s and total worker capacity is 50,000/s. A celebrity with 1,000,000 followers posts (push on write). How long does an ordinary user’s new post wait before fan-out starts, and how long until the backlog clears?',
        insight:'A new post waits about 20 seconds (1,000,000 ÷ 50,000), but at peak the workers have only about 3,700/s of headroom, so the backlog takes around 4.5 minutes to clear. Looking only at “workers handle 50,000 per second” suggests 20 seconds would be enough; the point is that processing capacity during recovery must exceed the incoming traffic. After switching to hybrid fan-out, celebrity posts no longer enter the queue.',
        async run(){ctx.clearLog();ctx.openLog();setAll({sort:'time',follow:'celeb',media:'text',dau:1e7,fan:'push',cap:5e4});await ctx.wait(1200);celebPost();while(lp.running)await ctx.wait(300);await ctx.wait(800);await change('fan','hybrid',1200);celebPost();await ctx.wait(1500)}},
      {id:'scale',label:'From 100,000 to 100,000,000 DAU',
        ask:'Same newest-first friends’ feed, text only. As DAU goes from 100,000 to 10,000,000 to 100,000,000, what does the publish path need at each stage? Is a worker capacity of 50,000/s still enough?',
        insight:'At 100,000 DAU there are about 1.2 posts per second, so a single database with synchronous fan-out is enough, and sharding would be over-engineering. At 10,000,000 DAU a queue and async workers appear, with peak inbox writes of about 46,000/s (93% worker utilization). At 100,000,000 DAU the peak is about 460,000/s, more than 9 times worker capacity, and the post store must be sharded too. Scaling workers to 1,000,000 per second brings utilization back to 46%. The scale numbers decide whether to add components.',
        async run(){ctx.clearLog();ctx.openLog();setAll({sort:'time',follow:'cap',media:'text',dau:1e5,fan:'push',cap:5e4});ctx.log('Starting at 100,000 DAU','info');await ctx.wait(2500);await change('dau',1e7,3500);await change('dau',1e8,3500);S.cap=1e6;capCtl.set(CAPS.indexOf(1e6),true);update('cap');ctx.log('Total worker capacity scaled to 1,000,000 per second','info');await ctx.wait(2500)}},
    ]);
  }
});
})();
