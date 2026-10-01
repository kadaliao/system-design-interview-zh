/* Chapter 14: Video system. The transcoding DAG is scheduled on a worker pool: GOP segments run in parallel, failures are retried, and ready is published only after the required outputs are persisted and verified. */
(function(){
const {el:h,util}=SDLab;

const RES=[['360','360p',2],['720','720p',3],['1080','1080p',5]],NG=6;
const ENC=new Set(['360','720','1080','audio','thumb']);
/** Builds one transcoding job as a discrete-event simulation; advance(seconds) steps exactly to the next task end or failure point. */
function makeJob(cfg){
  const T=new Map(),low=cfg.req==='low';
  const add=(id,label,dur,deps,kind,opt)=>T.set(id,{id,label,dur,deps,kids:[],kind,opt:!!opt,state:'wait',p:0,attempt:1,seq:0,failAt:null,failKind:null});
  add('pre','Preprocess',1.5,[],'ctl');
  add('sv','Extract video',1,['pre'],'ctl');add('sa','Extract audio',1,['pre'],'ctl');add('sm','Get metadata',1,['pre'],'ctl');
  add('thumb','Thumbnails',1.5,['sv'],'thumb');
  for(let g=1;g<=NG;g++)for(const [r,l,d] of RES)add(`e${r}-${g}`,`${l} G${g}`,d,['sv'],r,low&&r==='1080');
  add('aenc','Audio encode',3,['sa'],'audio');
  for(const [r,l] of RES)add('m'+r,'Assemble '+l,1,util.range(NG).map(i=>`e${r}-${i+1}`),'ctl',low&&r==='1080');
  add('man','Manifest + verify',1,low?['m360','m720','aenc','thumb','sm']:['m360','m720','m1080','aenc','thumb','sm'],'ctl');
  if(low)add('man2','Append 1080p',0.5,['m1080','man'],'ctl',true);
  for(const t of T.values())for(const d of t.deps)T.get(d).kids.push(t.id);
  if(cfg.fail){const f=T.get(cfg.fail.id);f.failAt=cfg.fail.at??0.5;f.failKind=cfg.fail.kind}
  const J={cfg,T,t:0,queue:[],workers:util.range(cfg.workers).map(i=>({i,task:null,segs:[],seg:null})),seq:0,retries:0,busy:0,readyAt:null,notifyAt:null,manAt:null,hdAt:null,allAt:null,failed:null,failNext:null,on:cfg.on||(()=>{})};
  const all=[...T.values()],isDone=id=>T.get(id).state==='done';
  const enq=t=>{t.state='queue';t.seq=J.seq++;J.queue.push(t)};
  function schedule(){
    for(const w of J.workers){
      if(w.task||!J.queue.length)continue;
      J.queue.sort((a,b)=>(a.opt-b.opt)||(a.seq-b.seq));
      const t=J.queue.shift();
      if(J.failNext&&t.kind===J.failNext.res&&t.attempt===1){t.failAt=0.5;t.failKind=J.failNext.kind;J.failNext=null}
      t.state='run';t.p=0;t.w=w.i;w.task=t;w.seg={s:J.t,e:null,kind:t.kind,fail:false};w.segs.push(w.seg);
    }
  }
  function endSeg(w,fail){w.seg.e=J.t;w.seg.fail=fail;J.busy+=w.seg.e-w.seg.s;w.task=null}
  function finish(t,w){
    t.state='done';t.p=1;endSeg(w,false);J.on('done',t);
    for(const k of t.kids){const kt=T.get(k);if(kt.state==='wait'&&kt.deps.every(isDone))enq(kt)}
    if(J.cfg.notify==='early'&&J.notifyAt==null&&all.filter(x=>!x.opt&&ENC.has(x.kind)).every(x=>x.state==='done')){J.notifyAt=J.readyAt=J.t;J.on('notify',t)}
    if(t.id==='man'){J.manAt=J.t;J.on('man',t);if(J.notifyAt==null){J.notifyAt=J.readyAt=J.t;J.on('notify',t)}}
    if(t.id==='man2'){J.hdAt=J.t;J.on('hd',t)}
    if(all.every(x=>x.state==='done')){J.allAt=J.t;if(!low)J.hdAt=J.manAt;J.on('all',t)}
  }
  function fail(t,w){
    const kind=t.failKind;t.failAt=null;endSeg(w,true);
    if(kind==='crash'){t.attempt++;J.retries++;t.p=0;enq(t);J.on('retry',t)}
    else{t.state='fail';J.failed={t,at:J.t};for(const x of all)if(x.state==='queue'||x.state==='wait')x.state='cancel';for(const w2 of J.workers)if(w2.task){w2.task.state='cancel';endSeg(w2,false)}J.queue=[];J.on('abort',t)}
  }
  J.finished=()=>J.failed!=null||J.allAt!=null;
  J.advance=function(dt){
    const target=J.t+dt;
    for(let guard=0;guard<5000;guard++){
      if(J.finished())return;
      schedule();
      let next=Infinity;
      for(const w of J.workers)if(w.task){const t=w.task;next=Math.min(next,((t.failAt??1)-t.p)*t.dur)}
      if(next===Infinity)return;
      const step=Math.min(next,target-J.t);
      for(const w of J.workers)if(w.task)w.task.p+=step/w.task.dur;
      J.t+=step;
      if(step<next-1e-9)return;
      for(const w of J.workers){const t=w.task;if(!t)continue;if(t.failAt!=null&&t.p>=t.failAt-1e-9)fail(t,w);else if(t.p>=1-1e-9)finish(t,w)}
    }
  };
  enq(T.get('pre'));
  return J;
}
const sim=cfg=>{const j=makeJob(cfg);j.advance(Infinity);return j};

SDLab.define({
  id:'transcode-dag',chapter:14,
  title:'Transcoding DAG: Parallelism, Retries, and Completion',
  summary:'An uploaded video is cut into 6 GOP segments and enters the transcoding DAG: split, per-quality segment encoding, thumbnails, audio encoding, assembly, manifest. Change the worker count and inject failures to see how tasks queue, run in parallel, and retry, and when ready is published.',
  caveat:'Task durations are relative units (simulated seconds); at 1× speed, 1 second of animation is about 3 simulated seconds. The resource manager takes tasks from the queue with required tasks first, then first-ready first-served. All workers are equally capable, and after a crash the task reruns at once on an idle worker. Watermarking, checks, and similar steps are folded into each segment’s encoding. A rerun reads the same GOP from temporary storage and writes to a location fixed by video, quality, and segment, so it overwrites instead of creating a second copy.',
  mount(ctx){
    ctx.css('td',`
.td-flow{display:grid;grid-template-columns:minmax(118px,.8fr) minmax(236px,1.6fr) minmax(96px,.65fr) minmax(150px,1fr);gap:16px}
.td-narrow .td-flow{grid-template-columns:minmax(0,1fr);gap:18px}
.td-col{position:relative;display:flex;flex-direction:column;gap:5px;min-width:0}
.td-col:not(:last-child)::after{content:'→';position:absolute;right:-13px;top:46%;color:#9fb1a5;font-size:14px}
.td-narrow .td-col:not(:last-child)::after{content:'↓';right:auto;left:50%;top:auto;bottom:-18px}
.td-h{font-size:12px;font-weight:700;color:#66756d;margin-bottom:1px}
.td-t{position:relative;border:1px solid #dbe2da;border-radius:7px;padding:3px 8px;font-size:12.5px;line-height:1.45;background:#f6f8f4;color:#66756d;--p:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.td-t[data-s=queue],.td-c[data-s=queue]{background:#f6ead2;border-color:#dfbf85;color:#86561a}
.td-t[data-s=run],.td-c[data-s=run]{border-color:#2f6fb3;color:#24558a;background:linear-gradient(90deg,#cfe0f3 calc(var(--p)*100%),#fff 0)}
.td-t[data-s=done],.td-c[data-s=done]{background:#dcefe2;border-color:#8fc4a2;color:#1d6a41}
.td-t[data-s=fail],.td-c[data-s=fail]{background:#f7dedb;border-color:#c2413b;color:#9b2c27}
.td-t[data-s=cancel],.td-c[data-s=cancel]{opacity:.45;text-decoration:line-through}
.td-t.opt,.td-c.opt{border-style:dashed}
.td-t .rt,.td-c .rt{font-size:11px;font-weight:700;color:#b7791f;margin-left:3px}
.td-row{display:flex;gap:5px;flex-wrap:wrap}.td-row .td-t{flex:1 1 60px}
.td-gop{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:3px}
.td-gop span{font-size:11px;text-align:center;border-radius:4px;background:#e6eee2;color:#66756d;line-height:1.8}
.td-gop.cut span{background:#dde9f6;color:#24558a}
.td-mx{display:grid;grid-template-columns:44px repeat(6,minmax(0,1fr));gap:3px;align-items:center}
.td-mx .lb{font-size:12px;color:#66756d;font-weight:650}
.td-mx .gh{font-size:11px;color:#66756d;text-align:center}
.td-c{border:1px solid #dbe2da;border-radius:5px;height:22px;background:#f6f8f4;font-size:11px;text-align:center;line-height:20px;--p:0;overflow:hidden}
.td-card{border:1px solid #dbe2da;border-radius:9px;padding:7px 9px;background:#fff;font-size:12.5px;line-height:1.6}
.td-card .k{color:#66756d}
.td-card .bad{color:#c2413b;font-weight:650}.td-card .ok{color:#2f8f5b;font-weight:650}
.td-rm{margin-top:14px;border:1px solid #dbe2da;border-radius:10px;padding:8px 10px;background:#fbfcfa}
.td-rm .hd{font-size:12.5px;color:#66756d;margin-bottom:5px}
.td-rm .hd b{color:#23352f}
.td-lane{display:grid;grid-template-columns:30px 92px minmax(0,1fr);gap:8px;align-items:center;margin:3px 0;font-size:12px}
.td-lane .nm{font-weight:700;color:#66756d}
.td-lane .cur{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#24558a}
.td-lane .cur.idle{color:#9aa89f}
.td-lane .trk{position:relative;height:16px;background:#f0f4ed;border-radius:4px;overflow:hidden}
.td-lane svg{position:absolute;inset:0;width:100%;height:100%}
.td-axis{position:relative;height:16px;margin-left:138px;font-size:11px;color:#66756d}
.td-axis span{position:absolute;transform:translateX(-50%);white-space:nowrap}
.td-leg{display:flex;flex-wrap:wrap;gap:3px 12px;font-size:11.5px;color:#66756d;margin-top:4px}
.td-leg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
`);
    const C=ctx.colors,fmt=util.fmt;
    const KCOL={ctl:'#8fa396','360':C.series[0],'720':C.series[1],'1080':C.series[3],audio:C.series[4],thumb:C.series[5]};
    const P={workers:4,req:'all',notify:'verified',speed:1};
    const s1=v=>(+v.toFixed(1))+' s';
    const put=(el,...kids)=>el.replaceChildren(...kids.flat().filter(k=>k!=null&&k!==false));
    // Precompute the numbers used in the scenario takeaways with the same engine
    const B1=sim({workers:1,req:'all',notify:'verified'}),B6=sim({workers:6,req:'all',notify:'verified'}),B4=sim({workers:4,req:'all',notify:'verified'});
    const F4=sim({workers:4,req:'all',notify:'verified',fail:{id:'e720-3',kind:'crash'}});
    const F4h=sim({workers:4,req:'all',notify:'verified',fail:{id:'e1080-3',kind:'crash'}});
    const util4=j=>util.pct(j.busy/(4*j.allAt),0),dF=F4.readyAt-B4.readyAt;
    const E4=sim({workers:4,req:'all',notify:'early'}),L4=sim({workers:4,req:'low',notify:'verified'});
    let job,els={},scale=30,player=null;

    const flowBox=h('div'),rm=h('div',{class:'td-rm'});
    ctx.stage.append(flowBox,rm);
    ctx.onResize(w=>flowBox.classList.toggle('td-narrow',w<640));

    function onEvent(type,t){
      const J=job;
      if(type==='done'&&t.id==='pre')ctx.log(`${s1(J.t)}: Preprocessing done. The 6 GOPs and metadata are in temporary storage, and the DAG is generated from config`,'info');
      if(type==='retry')ctx.log(`${s1(J.t)}: The worker running ${t.label} crashed. The task returns to the queue, and attempt ${t.attempt} re-reads the GOP from temporary storage`,'warn');
      if(type==='abort')ctx.log(`${s1(J.t)}: The GOP data for ${t.label} is corrupt, an unrecoverable error. The whole job stops and returns the error code “corrupt input file”`,'bad');
      if(type==='notify'){
        const ok=J.manAt!=null;player={at:J.t,ok};
        ctx.log(`${s1(J.t)}: User is notified that the video is playable`,ok?'ok':'warn');
        ctx.log(ok?'Player requests the manifest → 200 OK, playback starts':'Player requests the manifest → 404: the qualities are not assembled and the manifest is not written, so the user sees “playable” but cannot play',ok?'ok':'bad');
        ctx.announce(ok?'Ready published, playback succeeded':'Notified too early, player got a 404');
      }
      if(type==='man'&&J.cfg.notify==='early')ctx.log(`${s1(J.t)}: The manifest is only now written and verified, ${s1(J.t-J.notifyAt)} after the notification`,'info');
      if(type==='man'&&J.cfg.notify!=='early')ctx.log(`${s1(J.t)}: Required outputs and the manifest are written and verified; publishing ready${J.cfg.req==='low'?' (360p and 720p playable, 1080p to be added later)':''}`,'ok');
      if(type==='hd'&&J.cfg.req==='low')ctx.log(`${s1(J.t)}: 1080p assembly finished and appended to the manifest`,'ok');
      if(type==='all')ctx.log(`${s1(J.t)}: The DAG is complete. Worker utilization ${util.pct(J.busy/(J.workers.length*J.t),0)}`,'info');
    }
    function restart(extra){
      job=makeJob({workers:P.workers,req:P.req,notify:P.notify,...extra,on:(a,b)=>onEvent(a,b)});
      player=null;
      scale=Math.max(10,sim({workers:P.workers,req:P.req,notify:P.notify}).t*1.04);
      buildDom();draw(true);lp.start();
    }
    function tBox(id,cls){const t=job.T.get(id);const el=h('div',{class:'td-t'+(t.opt?' opt':'')+(cls?' '+cls:''),title:t.label},t.label);els[id]=el;return el}
    function buildDom(){
      els={};
      const gop=h('div',{class:'td-gop'},util.range(NG).map(i=>h('span',null,'G'+(i+1))));els.gop=gop;
      const mx=h('div',{class:'td-mx'},h('span'),util.range(NG).map(i=>h('span',{class:'gh'},'G'+(i+1))));
      for(const [r,l] of RES){mx.append(h('span',{class:'lb'},l));for(let g=1;g<=NG;g++){const id=`e${r}-${g}`,t=job.T.get(id);const c=h('div',{class:'td-c'+(t.opt?' opt':''),title:t.label});els[id]=c;mx.append(c)}}
      const card=h('div',{class:'td-card'});els.card=card;
      flowBox.replaceChildren(h('div',{class:'td-flow'},
        h('div',{class:'td-col'},h('div',{class:'td-h'},'① Original: 6 GOPs'),gop,tBox('pre'),tBox('sv'),tBox('sa'),tBox('sm')),
        h('div',{class:'td-col'},h('div',{class:'td-h'},'② Segment encoding (parallel)'),mx,h('div',{class:'td-row'},tBox('thumb'),tBox('aenc'))),
        h('div',{class:'td-col'},h('div',{class:'td-h'},'③ Assemble'),tBox('m360'),tBox('m720'),tBox('m1080')),
        h('div',{class:'td-col'},h('div',{class:'td-h'},'④ Manifest & publish'),tBox('man'),job.T.has('man2')?tBox('man2'):null,card)));
      const lanes=job.workers.map(w=>{
        const svg=ctx.svgEl('svg',{viewBox:`0 0 ${scale} 10`,preserveAspectRatio:'none','aria-hidden':'true'});
        const g=ctx.svgEl('g'),now=ctx.svgEl('line',{y1:0,y2:10,stroke:C.info,'stroke-width':1.5,'vector-effect':'non-scaling-stroke'});svg.append(g,now);
        const cur=h('span',{class:'cur idle'},'Idle');
        w.ui={svg,g,now,cur,n:0};
        return h('div',{class:'td-lane'},h('span',{class:'nm'},'W'+(w.i+1)),cur,h('div',{class:'trk'},svg));
      });
      els.rmHd=h('div',{class:'hd'});els.axis=h('div',{class:'td-axis'});
      rm.replaceChildren(els.rmHd,...lanes,els.axis,h('div',{class:'td-leg'},[['360p','360'],['720p','720'],['1080p','1080'],['Audio','audio'],['Thumbnails','thumb'],['Preprocess/assemble/manifest','ctl']].map(([l,k])=>h('span',null,h('i',{style:{background:KCOL[k]}}),l)),h('span',null,h('i',{style:{background:C.bad}}),'Failed')));
      els.last={};
    }
    function draw(force){
      const J=job;
      for(const t of J.T.values()){
        const el=els[t.id];if(!el)continue;
        const key=t.state+t.attempt+(t.state==='run'?Math.round(t.p*40):'');
        if(!force&&els.last[t.id]===key)continue;els.last[t.id]=key;
        el.dataset.s=t.state;el.style.setProperty('--p',t.state==='run'?t.p.toFixed(3):0);
        const isCell=el.classList.contains('td-c');
        put(el,isCell?null:t.label,t.attempt>1?h('span',{class:'rt',title:'Retries'},'↻'+(t.attempt-1)):null);
      }
      els.gop.classList.toggle('cut',J.T.get('pre').state==='done');
      // Publish status card
      const st0=J.failed?['Failed · corrupt input','bad']:J.cfg.notify==='early'?(J.notifyAt!=null?['Marked playable','ok']:['Processing',null]):J.readyAt!=null?[J.cfg.req==='low'&&J.hdAt==null?'ready (360p, 720p)':'ready (all qualities)','ok']:['Processing',null];
      const hdTxt=J.cfg.req==='low'?(J.hdAt!=null?'1080p added':'1080p to follow'):'';
      put(els.card,
        h('div',null,h('span',{class:'k'},'Video status: '),h('span',{class:st0[1]||null},st0[0])),
        h('div',null,h('span',{class:'k'},'User notified: '),J.notifyAt!=null?s1(J.notifyAt):'—'),
        h('div',null,h('span',{class:'k'},'Player: '),player?h('span',{class:player.ok?'ok':'bad'},player.ok?'Manifest 200 OK':'Manifest 404'):'—'),
        J.cfg.notify==='early'&&J.notifyAt!=null?h('div',null,h('span',{class:'k'},'Manifest written: '),J.manAt!=null?s1(J.manAt):'not yet'):null,
        hdTxt?h('div',{class:'k'},hdTxt):null);
      // Resource manager and Gantt chart
      const running=J.workers.filter(w=>w.task).length;
      els.rmHd.replaceChildren('Resource manager: task queue ',h('b',null,J.queue.length),' · running ',h('b',null,running),' · idle workers ',h('b',null,J.workers.length-running),' · simulated time ',h('b',null,s1(J.t)));
      const vb=Math.max(scale,J.t*1.02);
      for(const w of J.workers){
        const u=w.ui;
        while(u.n<w.segs.length){const sg=w.segs[u.n];sg.el=ctx.svgEl('rect',{x:sg.s,y:1,width:0,height:8,fill:KCOL[sg.kind]});u.g.append(sg.el);u.n++}
        for(const sg of w.segs){if(sg.done)continue;const e=sg.e??J.t;ctx.attr(sg.el,{width:Math.max(0,e-sg.s-0.04),fill:sg.fail?C.bad:KCOL[sg.kind]});if(sg.e!=null)sg.done=true}
        u.svg.setAttribute('viewBox',`0 0 ${vb} 10`);ctx.attr(u.now,{x1:J.t,x2:J.t});
        u.cur.textContent=w.task?w.task.label:'Idle';u.cur.className='cur'+(w.task?'':' idle');
      }
      els.axis.replaceChildren(...util.range(Math.floor(vb/5)+1).map(i=>i*5).filter(s=>s/vb<0.97).map(s=>h('span',{style:{left:s/vb*100+'%'}},s+'s')));
      stats.set('t',s1(J.t));
      stats.set('ready',J.failed?'Failed':J.notifyAt!=null?s1(J.notifyAt):'—',J.failed?'bad':J.notifyAt!=null?(player&&!player.ok?'bad':'ok'):null);
      stats.set('all',J.allAt!=null?s1(J.allAt):J.failed?'Stopped':'—',J.allAt!=null?'ok':J.failed?'bad':null);
      stats.set('util',J.t?util.pct(J.busy/(J.workers.length*J.t),0):'—');
      stats.set('retry',J.retries,J.retries?'warn':null);
    }

    /* ---- Controls ---- */
    const sW=ctx.slider({label:'Workers',min:1,max:8,value:P.workers,hint:'Changing this restarts the transcode',onChange:v=>{P.workers=v;restart()}});
    const cReq=ctx.segmented({label:'ready requires',value:P.req,options:[['all','All 3 qualities'],['low','360p + 720p, 1080p later']],onChange:v=>{P.req=v;restart()}});
    const cNot=ctx.segmented({label:'Notify user',value:P.notify,options:[['verified','After manifest is verified'],['early','When encoding ends (parallel branch)']],onChange:v=>{P.notify=v;restart()}});
    const cSpd=ctx.segmented({label:'Speed',value:1,options:[[0,'Pause'],[1,'1×'],[2,'2×']],onChange:v=>{P.speed=v;if(v)lp.start()}});
    ctx.button('Re-upload',()=>restart(),{primary:true});
    const cTgt=ctx.segmented({label:'Segment to fail',value:'720',options:RES.map(([r,l])=>[r,l])});
    const inject=kind=>{const r=cTgt.get();job.failNext={res:r,kind};ctx.log(kind==='crash'?`Set: the next ${r}p segment task to start will lose its worker halfway through (recoverable)`:`Set: the next ${r}p segment task to start will find corrupt GOP data (unrecoverable)`,kind==='crash'?'warn':'bad')};
    ctx.button('Inject: worker crash',()=>inject('crash'));
    ctx.button('Inject: corrupt segment',()=>inject('corrupt'),{danger:true});
    const stats=ctx.stats([{key:'t',label:'Simulated time'},{key:'ready',label:'User told “playable”'},{key:'all',label:'DAG complete'},{key:'util',label:'Worker utilization'},{key:'retry',label:'Retries'}]);

    let acc=0;
    const lp=ctx.loop(dt=>{
      if(!P.speed)return;
      job.advance(dt*3*P.speed);
      acc+=dt;
      if(job.finished()){draw(true);lp.stop();return}
      if(acc>1/30){acc=0;draw()}
    },false);
    restart();

    function prepare(o){
      Object.assign(P,{workers:4,req:'all',notify:'verified',speed:1},o.p||{});
      sW.set(P.workers,true);cReq.set(P.req,true);cNot.set(P.notify,true);cSpd.set(P.speed,true);
      ctx.clearLog();restart(o.fail?{fail:o.fail}:null);
    }
    const done=async()=>{while(!job.finished())await ctx.wait(150);await ctx.wait(300)};
    ctx.scenarios([
      {id:'more-workers',label:'How much faster with more workers',
        ask:`One worker takes ${s1(B1.allAt)} (simulated) to transcode this video. With 6 workers, will it be 6 times faster, at just ${s1(B1.allAt/6)}?`,
        insight:`No. 6 workers took ${s1(B6.allAt)}, only about ${(B1.allAt/B6.allAt).toFixed(1)} times faster, with utilization of just ${util.pct(B6.busy/(6*B6.allAt),0)}. Preprocessing at the start, and assembly and manifest writing at the end, each wait for the previous step, so most workers sit idle then (the gaps in the Gantt chart). The 1080p segments are the slowest and set when the encoding stage ends. Parallelism only shrinks the 18 segment encodings.`,
        async run(){prepare({p:{workers:6}});await done()}},
      {id:'retry',label:'720p segment crashes',
        ask:'4 workers. Halfway through encoding the 3rd 720p segment, its worker crashes. Do you have to transcode the whole video again? How much later is ready?',
        insight:`No. Only the “720p G3” task goes back to the queue and reruns, re-reading the same GOP from temporary storage (marked ↻1 on the cell); every other segment’s result is kept. ${dF<0.05?`Ready still lands at ${s1(F4.readyAt)} this time: the rerun used 1.5 s of extra compute (utilization ${util4(B4)} → ${util4(F4)}), but 720p is not on the slowest 1080p chain, so the wait is absorbed by idle time. If a 1080p segment crashed instead, ready would slip from ${s1(B4.readyAt)} to ${s1(F4h.readyAt)} (try choosing 1080p under “Segment to fail”).`:`Ready slips from ${s1(B4.readyAt)} to ${s1(F4.readyAt)}; the extra time comes from rerunning this segment and queueing again.`} Tasks need stable IDs and outputs need fixed locations, so a rerun never produces duplicate or inconsistent results.`,
        async run(){prepare({fail:{id:'e720-3',kind:'crash'}});await done()}},
      {id:'early-notify',label:'Premature completion notice',
        ask:'Following the chapter’s diagram, treat “completion event” and “write to transcoded storage” as two parallel branches: notify the user as soon as segment encoding ends. What happens when the user opens the video right away?',
        insight:`When the notification goes out at ${s1(E4.notifyAt)}, the qualities are not assembled and the manifest does not exist, so the player gets a 404; the manifest is not written and verified until ${s1(E4.manAt)}. The right approach is to make “required outputs and manifest written and verified” the completion condition, and publish ready and notify only once it holds.`,
        async run(){prepare({p:{notify:'early'}});await done()}},
      {id:'hd-later',label:'1080p available later',
        ask:'Make only 360p and 720p required for ready, demote the 1080p segments to low priority, and append 1080p to the manifest once it finishes. How much earlier can ready come than publishing after every quality is done?',
        insight:`With every quality required, ready is published at ${s1(B4.readyAt)}. Requiring only 360p and 720p moves ready up to ${s1(L4.readyAt)}, and 1080p is appended to the manifest at ${s1(L4.hdAt)}. Users can start with lower quality while higher quality becomes available gradually; this requires the manifest to support appending and the player to see the new version.`,
        async run(){prepare({p:{req:'low'}});await done()}},
    ]);
  }
});
})();
