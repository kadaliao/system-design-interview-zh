/* Chapter 19: distributed message queue. Lab 1: consumer-group partition assignment, rebalancing, and offset commit timing. Lab 2: replicas, ISR, and ACK. */
(function(){
const {el:h,util}=SDLab;
const DT=0.05;
/* Fixed-step advance: results are independent of frame rate; the animation loop stops when paused. */
function runner(ctx,step,draw){
  let acc=0,da=1;const r={speed:1};
  r.lp=ctx.loop(dt=>{acc+=dt*r.speed;let n=0;while(acc>=DT&&n<80){acc-=DT;step();n++}da+=dt;if(da>=1/30){da=0;draw()}},false);
  r.set=v=>{r.speed=v;if(v)r.lp.start();else{r.lp.stop();draw()}};
  return r;
}
const until=async(ctx,cond)=>{let n=0;while(!cond()&&n<1200){await ctx.wait(50);n++}};

/* ---------------- Lab 1: consumer group ---------------- */
SDLab.define({
  id:'mq-consumer-group',chapter:19,
  title:'Consumer Groups: Assignment, Rebalancing, and Offset Commits',
  summary:'Producers write messages to partitions by key, and consumers in one group share the partitions. Add, remove, or crash consumers to watch a rebalance hand partitions over; switch the offset commit timing to see whether a crash loses messages or processes them twice.',
  caveat:'Each consumer pulls one batch at a time and processes it message by message. Partitions are assigned with the range strategy. A crashed consumer is detected after a 1.5 s heartbeat timeout. During a rebalance, live members finish their current batch before giving up partitions. An offset is the next position to read. Time is in simulated seconds.',
  mount(ctx){
    ctx.css('cg',`
.cg-status{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13px;margin-bottom:6px}
.cg-keys{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center;font-size:12px;color:#66756d;margin-bottom:8px}
.cg-keys code{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:#f0f4ed;border-radius:5px;padding:0 5px;color:#23352f}
.cg-rows{display:flex;flex-direction:column;gap:5px}
.cg-row{display:grid;grid-template-columns:28px minmax(0,1fr) 92px;gap:6px;align-items:center}
.cg-pn{font-weight:700;font-size:13px}
.cg-cells{display:flex;gap:2px;overflow:hidden;padding:7px 0 0 4px}
.cg-c{flex:none;width:34px;height:34px;border:1px solid #cfd8cc;border-radius:5px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.15;font-size:11.5px;font-weight:650;position:relative;color:#23352f;letter-spacing:-.2px}
.cg-c small{font-size:11px;font-weight:400;color:#66756d}
.cg-c.e{border-style:dashed;background:transparent;border-color:#dbe2da}
.cg-c.ok{background:#dcefe2;border-color:#9fcfb0;color:#1d6a41}
.cg-c.dup{background:#f6ead2;border-color:#dfbf85;color:#86561a}
.cg-c.lost{background:#f7dedb;border-color:#e3aaa4;color:#9b2c27}
.cg-c.lost b{text-decoration:line-through}
.cg-c.b{border:2px dashed #2f6fb3}
.cg-c.cur{border:2px solid #2f6fb3;background:#dde9f6;color:#24558a}
.cg-c.cm::before{content:'';position:absolute;left:-4px;top:-5px;bottom:-3px;width:3px;border-radius:2px;background:#23352f}
.cg-c .x{position:absolute;top:-7px;right:-4px;font-size:11px;font-style:normal;line-height:1.25;background:#b7791f;color:#fff;border-radius:6px;padding:0 3px;font-weight:700}
.cg-c .x:empty{display:none}
.cg-side{font-size:12px;line-height:1.4;color:#66756d;white-space:nowrap}
.cg-own{display:inline-block;color:#fff;border-radius:5px;padding:0 6px;font-weight:700;margin-right:4px}
.cg-legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:#66756d;margin:8px 0 4px}
.cg-legend i{display:inline-block;width:12px;height:12px;border-radius:3px;border:1px solid #cfd8cc;margin-right:4px;vertical-align:-2px}
.cg-trail{display:flex;flex-wrap:wrap;gap:3px;align-items:center;font-size:12px;margin:6px 0 2px;color:#66756d}
.cg-trail span{font-family:ui-monospace,Menlo,monospace;border-radius:4px;padding:0 4px;background:#dcefe2;color:#1d6a41}
.cg-trail span.o{background:#f7dedb;color:#9b2c27;font-weight:700}
.cg-trail span.d{background:#f6ead2;color:#86561a}
.cg-trail span.s{background:none;color:#66756d;font-family:inherit}
.cg-cons{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:10px}
.cg-card{border:1px solid #dbe2da;border-top:4px solid var(--c);border-radius:10px;padding:6px 9px 8px;background:#fbfcfa;font-size:12px;line-height:1.5;min-width:0}
.cg-card.off{opacity:.55}
.cg-ch{display:flex;justify-content:space-between;gap:6px;align-items:center;font-size:13px}
.cg-bar{height:5px;background:#e6eee2;border-radius:3px;overflow:hidden;margin:3px 0 5px}
.cg-bar i{display:block;height:100%;background:#2f6fb3}
.cg-card .cg-btns{display:flex;gap:5px}
.cg-card .cg-btns button{font-size:12px;padding:1px 9px}
.cg-muted{color:#66756d}
.cg-narrow .cg-row{grid-template-columns:28px minmax(0,1fr);row-gap:0}
.cg-narrow .cg-side{grid-column:2;display:flex;gap:10px;align-items:center}
`);
    const C=ctx.colors,TRACK='A',KEYS='ABCDEFGH'.split(''),TIMEOUT=1.5,SYNC=0.6;
    const CCOL=[C.series[0],C.series[3],C.series[4],C.series[5],'#8a6d3b','#56708f'];
    const P={parts:4,rate:2.5,proc:0.5,batch:3,commit:'after',keyMode:'key',hotA:0};
    let S,K=10,W=600,rows=[],cards={},consKey='',keysKey='',trailVer=-1;
    const L=(t,tone)=>{if(!S.quiet)ctx.log(`[${S.t.toFixed(1)}s] `+t,tone)};
    const live=()=>S.cons.filter(c=>c.st==='live');
    const lag=()=>S.parts.reduce((s,p)=>s+p.log.length-p.committed,0);

    function fresh(nc){
      S={t:0,parts:[],cons:[],phase:'stable',syncAt:0,det:[],acc:0,rr:0,rng:util.rng(19),seq:{},max:{},trail:[],tv:0,nid:1,processed:0,dups:0,lost:0,ooo:0,agenda:[],quiet:false};
      for(let i=0;i<P.parts;i++)S.parts.push({log:[],committed:0,owner:null});
      for(const k of KEYS){S.seq[k]=0;S.max[k]=0}
      for(let i=0;i<nc;i++)newCons();
      assign(true);ctx.clearLog();
    }
    function newCons(){const c={id:'C'+S.nid,color:CCOL[(S.nid-1)%CCOL.length],st:'live',parts:[],batch:null,rr:0,leaving:false};S.nid++;S.cons.push(c);return c}
    /* Range assignment: partitions are cut into contiguous runs and handed to members in ID order; extra members stay idle. */
    function assign(quiet){
      for(const c of S.cons){if(c.leaving){c.st='left';c.leaving=false}if(c.st==='dead')c.st='gone';c.parts=[]}
      const mem=live();S.parts.forEach(p=>p.owner=null);
      let pi=0;mem.forEach((c,i)=>{const k=Math.floor(P.parts/mem.length)+(i<P.parts%mem.length?1:0);for(let j=0;j<k;j++){c.parts.push(pi);S.parts[pi].owner=c;pi++}});
      S.det=[];
      if(!quiet)L('Assignment done: '+mem.map(c=>c.id+' → '+(c.parts.length?c.parts.map(x=>'P'+x).join(','):'no partitions')).join('; '),'ok');
    }
    function rebalance(why){L((S.phase==='stable'?'Rebalance triggered: ':'Another change during the rebalance: ')+why,'warn');S.phase='wait'}
    function join(){if(live().length>=6)return;const c=newCons();rebalance(c.id+' asked to join')}
    function leave(c){if(c.st!=='live'||c.leaving)return;c.leaving=true;rebalance(c.id+' left voluntarily')}
    function crash(c){
      if(c.st!=='live')return;c.st='dead';const b=c.batch;
      if(b&&b.mode==='before'){const lost=[];for(let i=b.idx;i<b.to;i++){const m=S.parts[b.pi].log[i];if(!m.count){m.lost=true;S.lost++;lost.push('#'+i)}}L(`${c.id} crashed. In P${b.pi}, ${lost.join(', ')} were committed but never processed, and nobody will read them again`,'bad')}
      else if(b){const done=b.idx-b.from;L(`${c.id} crashed. In P${b.pi}, batch #${b.from}–${b.to-1} was not committed`+(done?`; the ${done} already processed will be processed again by the next owner`:''),'bad')}
      else L(c.id+' crashed','bad');
      c.batch=null;S.det.push({c,at:S.t+TIMEOUT});
    }
    function produce(key){
      const seq=++S.seq[key],pi=P.keyMode==='key'?util.hash(key)%P.parts:(S.rr++)%P.parts;
      const p=S.parts[pi];p.log.push({key,seq,p:pi,off:p.log.length,count:0});
    }
    function handle(m,c){
      m.count++;
      if(m.count>1){S.dups++;L(`${c.id} reprocessed P${m.p} #${m.off} (${m.key}${m.seq})`,'warn')}
      else{S.processed++;if(m.seq<S.max[m.key]){S.ooo++;m.ooo=true}else S.max[m.key]=m.seq}
      if(m.key===TRACK){S.trail.push({t:m.key+m.seq,c:m.count>1?'d':m.ooo?'o':''});if(S.trail.length>24)S.trail.shift();S.tv++}
    }
    function step(){
      S.t+=DT;
      S.acc+=P.rate*DT;while(S.acc>=1){S.acc-=1;produce(P.hotA&&S.rng()<P.hotA?TRACK:S.rng.pick(KEYS))}
      for(const d of S.det.slice())if(S.t>=d.at){S.det.splice(S.det.indexOf(d),1);if(d.c.st==='dead')rebalance(d.c.id+' heartbeat timed out')}
      if(S.phase==='wait'&&!live().some(c=>c.batch)){S.phase='sync';S.syncAt=S.t+SYNC}
      else if(S.phase==='sync'&&S.t>=S.syncAt){assign();S.phase='stable'}
      for(const c of live()){
        const b=c.batch;
        if(!b){
          if(S.phase!=='stable'||c.leaving)continue;
          for(let k=0;k<c.parts.length;k++){
            const pi=c.parts[(c.rr+k)%c.parts.length],p=S.parts[pi];
            if(p.committed<p.log.length){
              c.rr=(c.rr+k+1)%c.parts.length;
              const to=Math.min(p.log.length,p.committed+P.batch),nb={pi,from:p.committed,to,idx:p.committed,t:0,mode:P.commit};c.batch=nb;
              if(nb.mode==='before'){p.committed=to;L(`${c.id} fetched P${pi} #${nb.from}–${to-1} and committed offset=${to} at once`)}
              else L(`${c.id} fetched P${pi} #${nb.from}–${to-1}`);
              break;
            }
          }
          continue;
        }
        b.t+=DT;
        if(b.t>=P.proc-1e-9){
          handle(S.parts[b.pi].log[b.idx],c);b.idx++;b.t=0;
          if(b.idx>=b.to){if(b.mode==='after'){const p=S.parts[b.pi];p.committed=Math.max(p.committed,b.to);L(`${c.id} finished P${b.pi} #${b.from}–${b.to-1} and committed offset=${b.to}`)}c.batch=null}
        }
      }
      for(const a of S.agenda.slice())if(a.at!=null?S.t>=a.at-1e-9:a.when()){S.agenda.splice(S.agenda.indexOf(a),1);a.fn()}
    }

    /* ---- Stage ---- */
    const status=h('div',{class:'cg-status'}),keys=h('div',{class:'cg-keys'}),rowsBox=h('div',{class:'cg-rows'});
    const lg=(cls,txt,style)=>h('span',null,h('i',{class:cls||null,style}),txt);
    const legend=h('div',{class:'cg-legend'},lg('','Unprocessed'),lg('','Current batch',{border:'2px dashed #2f6fb3'}),lg('','Processing',{background:'#dde9f6',border:'2px solid #2f6fb3'}),lg('','Processed',{background:'#dcefe2',borderColor:'#9fcfb0'}),lg('','Reprocessed',{background:'#f6ead2',borderColor:'#dfbf85'}),lg('','Lost',{background:'#f7dedb',borderColor:'#e3aaa4'}),lg('','Committed offset (next position to read)',{width:'3px',background:'#23352f',border:0}));
    const trail=h('div',{class:'cg-trail'}),consBox=h('div',{class:'cg-cons'});
    ctx.stage.append(status,keys,rowsBox,legend,trail,consBox);
    const st=ctx.stats([{key:'lag',label:'Backlog (uncommitted)'},{key:'done',label:'Processed'},{key:'dup',label:'Reprocessed'},{key:'lost',label:'Lost'},{key:'ooo',label:'Same-key out of order'}]);

    const calcK=()=>Math.max(5,Math.min(22,Math.floor((W<560?W-28-6-4:W-28-92-12-4)/36)));
    function buildRows(){
      K=calcK();rowsBox.classList.toggle('cg-narrow',W<560);
      rowsBox.replaceChildren();
      rows=S.parts.map((p,i)=>{
        const cells=[],box=h('div',{class:'cg-cells'});
        for(let j=0;j<K;j++){const a=h('b'),b=h('small'),x=h('i',{class:'x'}),el=h('div',{class:'cg-c'},a,b,x);box.append(el);cells.push({el,a,b,x,k:''})}
        const own=h('span',{class:'cg-own'}),s1=h('span'),s2=h('div');
        rowsBox.append(h('div',{class:'cg-row'},h('div',{class:'cg-pn'},'P'+i),box,h('div',{class:'cg-side'},h('div',null,own,s1),s2)));
        return {cells,own,s1,s2};
      });
    }
    function buildCards(){
      consBox.replaceChildren();cards={};
      for(const c of S.cons){
        const tag=h('span',{class:'sdl-tag'}),parts=h('div'),bat=h('div'),cm=h('div',{class:'cg-muted'}),bar=h('i');
        const bx=h('button',{type:'button',onclick:()=>{leave(c);draw()}},'Leave'),bc=h('button',{type:'button',class:'danger',onclick:()=>{crash(c);draw()}},'Crash');
        const el=h('div',{class:'cg-card',style:{'--c':c.color}},h('div',{class:'cg-ch'},h('b',null,c.id),tag),parts,bat,h('div',{class:'cg-bar'},bar),cm,h('div',{class:'cg-btns'},bx,bc));
        consBox.append(el);cards[c.id]={el,tag,parts,bat,cm,bar,bx,bc};
      }
    }
    function draw(){
      if(rows.length!==S.parts.length)buildRows();
      const inb={};for(const c of live())if(c.batch)inb[c.batch.pi]=c.batch;
      S.parts.forEach((p,i)=>{
        const r=rows[i],len=p.log.length,start=Math.max(0,Math.min(p.committed-2,len+1-K)),ib=inb[i];
        for(let j=0;j<K;j++){
          const off=start+j,m=p.log[off],cell=r.cells[j];
          let cls='cg-c',a='',b=off<=len?'#'+off:'',x='';
          if(!m)cls+=' e';
          else{
            a=m.key+m.seq;
            if(m.lost)cls+=' lost';else if(m.count>1){cls+=' dup';x='×'+m.count}else if(m.count)cls+=' ok';
            if(ib&&off>=ib.idx&&off<ib.to)cls+=off===ib.idx?' cur':' b';
          }
          if(off===p.committed)cls+=' cm';
          const key=cls+a+b+x;
          if(key!==cell.k){cell.k=key;cell.el.className=cls;cell.a.textContent=a;cell.b.textContent=b;cell.x.textContent=x;cell.el.title=m?`P${i} offset ${off}: ${a}`:''}
        }
        const o=p.owner;
        r.own.textContent=o?o.id+(o.st==='live'?'':'✕'):'None';r.own.style.background=o?(o.st==='live'?o.color:C.bad):'#9aa89f';
        r.s1.textContent='Backlog '+(len-p.committed);r.s2.textContent='Committed #'+p.committed;
      });
      // Status line
      let tag,txt,tone;
      if(S.phase==='wait'){const busy=live().filter(c=>c.batch).map(c=>c.id);tag='Rebalancing';tone='warn';txt='Waiting for members to finish their current batch before giving up partitions'+(busy.length?' ('+busy.join(', ')+' still processing)':'')}
      else if(S.phase==='sync'){tag='Rebalancing';tone='warn';txt='The group leader computes the assignment, and the coordinator sends it to all members'}
      else{const dead=S.cons.filter(c=>c.st==='dead');if(dead.length){tag='Awaiting heartbeat timeout';tone='bad';txt=dead.map(c=>c.id).join(', ')+' crashed, and the coordinator has not noticed yet, so nobody reads its partitions'}else{tag='Stable';tone='ok';txt='Within a group, each partition belongs to only one consumer at a time'}}
      if(status.k!==tag+txt){status.k=tag+txt;status.replaceChildren(h('span',{class:'sdl-tag '+tone},tag),h('span',null,txt))}
      const kk=P.keyMode+P.parts;
      if(kk!==keysKey){keysKey=kk;keys.replaceChildren(...(P.keyMode==='key'?[h('span',null,`partition = hash(key) % ${P.parts}: `),...KEYS.map(k=>h('code',null,k+'→P'+util.hash(k)%P.parts))]:[h('span',null,'No key: written round-robin to '+S.parts.map((_,i)=>'P'+i).join(' → '))]))}
      if(S.tv!==trailVer){trailVer=S.tv;trail.replaceChildren(h('span',{class:'s'},'Completion order of user A’s messages: '),...(S.trail.length?S.trail.map(x=>h('span',{class:x.c||null},x.t)):[h('span',{class:'s'},'(none yet)')]))}
      const ck=S.cons.map(c=>c.id).join();if(ck!==consKey){consKey=ck;buildCards()}
      for(const c of S.cons){
        const d=cards[c.id],b=c.batch;let t,tone2=null;
        if(c.st==='dead'){t='Crashed';tone2='bad'}else if(c.st==='gone'){t='Crashed, removed';tone2='bad'}else if(c.st==='left'){t='Left'}
        else if(c.leaving){t='Leaving';tone2='warn'}else if(b){t='Processing';tone2='info'}else if(S.phase!=='stable'){t='Awaiting assignment';tone2='warn'}else if(!c.parts.length){t='Idle: no partition';tone2='warn'}else t='Waiting';
        d.tag.textContent=t;d.tag.className='sdl-tag'+(tone2?' '+tone2:'');
        d.parts.textContent='Partitions: '+(c.parts.length?c.parts.map(x=>'P'+x).join(' '):'—');
        d.bat.textContent=b?`P${b.pi} #${b.from}${b.to-1>b.from?'–'+(b.to-1):''}, message ${b.idx-b.from+1}/${b.to-b.from}`:'Current batch: —';
        d.cm.textContent=b?(b.mode==='before'?`offset committed early, up to #${b.to}`:`offset still at #${b.from}`):' ';
        d.bar.style.width=b?Math.min(100,(b.idx-b.from+Math.min(1,b.t/P.proc))/(b.to-b.from)*100)+'%':'0%';
        d.el.classList.toggle('off',c.st!=='live');d.bx.disabled=d.bc.disabled=c.st!=='live'||c.leaving;
      }
      st.set('lag',lag(),lag()>12?'warn':null);st.set('done',S.processed,'ok');st.set('dup',S.dups,S.dups?'warn':null);st.set('lost',S.lost,S.lost?'bad':null);st.set('ooo',S.ooo,S.ooo?'bad':null);
    }

    /* ---- Controls ---- */
    const commitCtl=ctx.segmented({label:'Offset commit timing',value:P.commit,wide:true,options:[['after','Commit after the whole batch (at-least-once)'],['before','Commit on fetch (at-most-once)']],onChange:v=>{P.commit=v;draw()}});
    const keyCtl=ctx.segmented({label:'Partitioning',value:P.keyMode,options:[['key','Hash by key'],['none','No key, round-robin']],onChange:v=>{P.keyMode=v;draw()}});
    const speedCtl=ctx.segmented({label:'Playback',value:1,options:[[0,'Pause'],[1,'1×'],[2,'2×']],onChange:v=>run.set(v)});
    const sRate=ctx.slider({label:'Production rate',min:0,max:6,step:0.5,value:P.rate,format:v=>v+' msg/s',onInput:v=>{P.rate=v}});
    const sProc=ctx.slider({label:'Time per message',min:0.2,max:1.5,step:0.1,value:P.proc,format:v=>v.toFixed(1)+' s',onInput:v=>{P.proc=v}});
    const sBatch=ctx.slider({label:'Messages per batch',min:1,max:5,value:P.batch,onInput:v=>{P.batch=v}});
    const sParts=ctx.slider({label:'Partitions (restarts on change)',min:2,max:6,value:P.parts,onChange:v=>{P.parts=v;restart()}});
    ctx.button('Add a consumer',()=>{join();draw()},{primary:true});
    ctx.button('Reset',()=>restart());
    const run=runner(ctx,step,draw);

    function restart(nc){fresh(nc||Math.max(1,live().length));S.quiet=true;for(let i=0;i<50;i++)step();S.quiet=false;buildRows();draw()}
    fresh(2);S.quiet=true;for(let i=0;i<60;i++)step();S.quiet=false;
    ctx.onResize(w=>{W=w;if(calcK()!==K||!rows.length||rowsBox.classList.contains('cg-narrow')!==(W<560))buildRows();draw()});
    run.set(1);

    function prepare(o){
      Object.assign(P,{parts:4,rate:0,proc:0.5,batch:3,commit:'after',keyMode:'key',hotA:0},o.P||{});
      commitCtl.set(P.commit,true);keyCtl.set(P.keyMode,true);sRate.set(P.rate,true);sProc.set(P.proc,true);sBatch.set(P.batch,true);sParts.set(P.parts,true);speedCtl.set(1,true);
      fresh(o.cons);if(o.fill)for(let i=0;i<o.fill;i++)produce(KEYS[i%4]);
      buildRows();run.set(1);draw();
    }
    const idle=()=>lag()===0&&!live().some(c=>c.batch)&&S.phase==='stable';
    ctx.scenarios([
      {id:'join',label:'Consumers join one by one',
        ask:'There are 4 partitions, 3.5 messages are produced per second, and each consumer can process only 2 per second. Consumers are added one at a time, from 1 to 5. How many partitions does the 5th one get? How does the backlog change each time someone joins?',
        insight:'The 5th consumer gets no partition and sits idle: within a group, a partition belongs to one consumer at a time, so active members never exceed the partition count. With only C1, it cannot keep up with production, and the backlog quickly climbs above 8. Every join triggers a rebalance: members finish their current batch, then stop and wait for the new assignment, and during that time the whole group pulls nothing new, so the backlog first rises (peaking around 14) and then falls. With 3 consumers on 4 partitions, C1 owns two, so the load is uneven; only with 4 consumers owning one each does the backlog fall back to around 5.',
        async run(){prepare({P:{rate:3.5,proc:0.5,batch:2},cons:1});for(const at of [4,8,12,15])S.agenda.push({at,fn:join});await until(ctx,()=>S.t>=18.5)}},
      {id:'before',label:'Commit on fetch, then crash',
        ask:'Two partitions hold 6 messages each, and C1 owns P0. Each batch is 3 messages, and the offset is committed as soon as they are fetched. C1 crashes after processing #0, while processing #1. Which offset of P0 does the new owner start reading from? How many messages are never processed?',
        insight:'The offset was already committed up to #3 at fetch time. After C1’s heartbeat times out, a rebalance hands P0 to C2, which starts reading from #3, so nobody ever processes #1 and #2 (red). This is at-most-once: no duplicates, but messages can be lost.',
        async run(){prepare({P:{parts:2,proc:0.6,commit:'before'},cons:2,fill:12});S.agenda.push({when:()=>{const b=S.cons[0].batch;return b&&b.idx===b.from+1&&b.t>=0.3},fn:()=>crash(S.cons[0])});await until(ctx,()=>S.t>3&&idle());await ctx.wait(600)}},
      {id:'after',label:'Commit after processing, then crash',
        ask:'Same data and crash timing, but now the offset is committed only after the whole batch is processed. Where does C2 start reading this time? Are any messages lost? How many are processed twice?',
        insight:'At the crash, P0’s offset is still at #0, so after taking over, C2 re-reads that batch: nothing is lost, but #0 is processed twice (amber ×2). This is at-least-once: nothing is missed, but duplicates happen, so the business logic needs an event ID or unique constraint for idempotency. Moving the commit before or after processing only chooses between losing and repeating; it never gives end-to-end exactly-once.',
        async run(){prepare({P:{parts:2,proc:0.6,commit:'after'},cons:2,fill:12});S.agenda.push({when:()=>{const b=S.cons[0].batch;return b&&b.idx===b.from+1&&b.t>=0.3},fn:()=>crash(S.cons[0])});await until(ctx,()=>S.t>3&&idle());await ctx.wait(600)}},
      {id:'order',label:'Ordering by key vs. no key',
        ask:'User A is very active, producing half of all messages, and two consumers own 2 partitions each. With key hashing, are A’s messages processed in the order they were sent? What if the producer switches to round-robin writes without a key midway?',
        insight:'With key hashing, all of A’s messages land in P0 and C1 processes them in offset order, so completion order matches send order; the price is that the hot key lets P0’s backlog reach 6. After switching to round-robin, load spreads out, but A’s messages land in 4 partitions and are processed in parallel by two consumers. Partitions with a smaller backlog finish first, so a later message completes before an earlier one (red) and “Same-key out of order” starts to climb. Order is guaranteed only within one partition, so messages that need ordering must share a key.',
        async run(){prepare({P:{rate:4,proc:0.45,hotA:0.5},cons:2});S.agenda.push({at:5.5,fn:()=>{P.keyMode='none';keyCtl.set('none',true);S.trail.push({t:'| switched to no key |',c:'s'});S.tv++;L('Producer switched to round-robin writes without a key','info')}});await until(ctx,()=>S.t>=12)}},
    ]);
  }
});

/* ---------------- Lab 2: replicas, ISR, and ACK ---------------- */
SDLab.define({
  id:'mq-isr-acks',chapter:19,
  title:'Replicas, ISR, and ACK: Is Data Lost When the Leader Dies?',
  summary:'A partition has 3 replicas: the producer writes only to the leader, and followers pull. Switch ACK between 0, 1, and all, stall a replica or crash the leader, and see which acknowledged messages are lost and how long each acknowledgement takes.',
  caveat:'ISR membership uses an “at most N messages behind” rule (replica.lag.max.messages; newer Kafka uses lag time instead). Each follower pulls every 0.5 s, and the leader learns its progress when the fetch arrives. Once the leader has been unreachable for 0.8 s, the live ISR member with the lowest ID becomes the new leader. min.insync.replicas constrains only ACK=all writes. Time is in slowed-down simulated seconds, so only relative lengths matter.',
  mount(ctx){
    ctx.css('ir',`
.ir-status{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13px;margin-bottom:8px}
.ir-row{display:grid;grid-template-columns:var(--lw,92px) minmax(0,1fr);gap:8px;align-items:center;min-height:34px}
.ir-lab{font-size:13px;font-weight:700;line-height:1.35}
.ir-lab .sdl-tag{font-size:11px;margin:2px 3px 0 0;padding:0 5px}
.ir-cells{display:flex;gap:2px;overflow:hidden}
.ir-c{flex:none;width:30px;height:26px;border:1px solid #cfd8cc;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:650;background:#fff;color:#23352f;letter-spacing:-.2px}
.ir-c.e{border-style:dashed;border-color:#e3e9e1;background:transparent}
.ir-c.c{background:#dcefe2;border-color:#9fcfb0;color:#1d6a41}
.ir-c.u{background:#fff;border-color:#7d8b83}
.ir-c.g{border-style:dashed;border-color:#b9c4bc;color:#9aa89f;background:transparent;font-weight:400}
.ir-c.x{background:#f7dedb;border-color:#e3aaa4;color:#9b2c27;text-decoration:line-through}
.ir-c.p-fly{border:1px dashed #2f6fb3;color:#2f6fb3;background:#fff}
.ir-c.p-pend{border:2px solid #b7791f;color:#86561a;background:#fff}
.ir-c.p-ok{background:#2f8f5b;border-color:#2f8f5b;color:#fff}
.ir-c.p-one{background:#f6ead2;border:2px solid #b7791f;color:#86561a}
.ir-c.p-s0{background:#e6eee2;border-color:#cfd8cc;color:#66756d}
.ir-c.p-rej{border:2px dashed #c2413b;color:#9b2c27;background:#fff}
.ir-c.p-lost{background:#c2413b;border-color:#c2413b;color:#fff;text-decoration:line-through}
.ir-brokers{position:relative;display:flex;flex-direction:column;gap:6px;margin-top:10px;padding-top:16px;border-top:1px solid #e8ede6}
.ir-row.dead .ir-cells{opacity:.6}
.ir-line{position:absolute;top:2px;bottom:-2px;border-left:2px dashed #2f8f5b;pointer-events:none}
.ir-line span{position:absolute;top:-2px;left:3px;font-size:11px;color:#1d6a41;white-space:nowrap;font-weight:650;background:#fff;padding:0 2px;line-height:1.2}
.ir-legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:#66756d;margin:8px 0 0}
.ir-legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:4px;vertical-align:-2px;border:1px solid #cfd8cc}
`);
    const C=ctx.colors;
    const P={ack:'all',minIsr:1,lagMax:3,rate:1.25,unclean:false};
    let S,K=12,Kp=12,W=600,LW=92;
    const L=(t,tone)=>{if(!S.quiet)ctx.log(`[${S.t.toFixed(1)}s] `+t,tone)};
    const has=(b,e)=>b.log[e.off]===e;
    const copies=m=>S.b.filter(b=>b.alive&&m.ents.some(e=>has(b,e))).length;
    const lead=()=>S.leader==null?null:S.b[S.leader];
    function fresh(){
      S={t:0,eid:0,b:[0,1,2].map(i=>({id:i+1,alive:true,stuck:false,log:[],next:0.12+i*0.17,fly:null})),leader:0,last:0,epoch:0,isr:new Set([0,1,2]),committed:0,scan:0,msgs:[],fly:[],n:0,acc:0.6,electAt:null,acked:0,lostOk:0,one:0,rej:0,lat:[],maxLat:0,agenda:[],quiet:false};
    }
    function send(){const m={n:++S.n,ack:P.ack,sent:S.t,st:P.ack==='0'?'s0':'fly',ents:[]};S.msgs.push(m);if(S.msgs.length>300)S.msgs.shift();S.fly.push({m,at:S.t+0.1})}
    function reject(m,msg){m.st='rej';m.retry=S.t+1.2;if(!m.rejd){m.rejd=true;S.rej++;L(msg,'warn')}}
    function ackMsg(m){const cp=copies(m);m.st='ok';const lat=S.t-m.sent+0.1;m.lat=lat;m.cp=cp;S.lat.push(lat);if(S.lat.length>12)S.lat.shift();S.maxLat=Math.max(S.maxLat,lat);S.acked++;if(cp<2)S.one++}
    function arrive(m){
      const Ld=lead();
      if(!Ld||!Ld.alive){if(m.ack==='0'){m.st='lost';S.lostOk++;L(`m${m.n} was sent to a crashed leader, and an ACK=0 producer cannot know`,'bad')}else m.st='wait';return}
      if(m.ack==='all'&&S.isr.size<P.minIsr){reject(m,`m${m.n} rejected: only ${S.isr.size} in the ISR, below min.insync.replicas=${P.minIsr}; the producer will retry later`);return}
      const e={id:++S.eid,n:m.n,m,off:Ld.log.length};Ld.log.push(e);
      if(m.ents.some(x=>has(Ld,x)))L(`m${m.n} appears twice in the log after a retry: at-least-once brings duplicates`,'warn');
      m.ents.push(e);
      if(m.ack==='1')ackMsg(m);else if(m.ack==='all')m.st='pend';
    }
    function truncate(f,Ld){
      let o=0;while(o<f.log.length&&f.log[o]===Ld.log[o])o++;
      if(o<f.log.length){const cut=f.log.splice(o);L(`Broker ${f.id} truncated ${cut.map(e=>'m'+e.n).join(', ')} to match the new leader`,'warn')}
      f.fly=null;
    }
    function recount(){const Ld=lead();let c=Ld.log.length;for(const i of S.isr)c=Math.min(c,S.b[i].log.length);S.committed=c;S.scan=c}
    function afterElect(){
      const Ld=lead(),lost=[];
      for(const m of S.msgs)if((m.st==='ok'||m.st==='s0')&&m.ents.length&&!m.ents.some(e=>has(Ld,e))){m.st='lost';S.lostOk++;lost.push('m'+m.n)}
      if(lost.length)L(`${lost.join(', ')}, which the producer thought succeeded, are not on the new leader: permanently lost`,'bad');
      const re=S.msgs.filter(m=>m.st==='pend'||m.st==='wait');
      re.forEach((m,i)=>{m.st='fly';S.fly.push({m,at:S.t+0.1+i*0.04})});
      if(re.length)L(`The producer got no acknowledgement and retries ${re.map(m=>'m'+m.n).join(', ')}`,'info');
    }
    function elect(){
      const old=S.leader;let cand=[...S.isr].filter(i=>S.b[i].alive&&i!==old).sort(),unclean=false;
      if(!cand.length&&P.unclean){cand=[0,1,2].filter(i=>S.b[i].alive).sort((a,b)=>S.b[b].log.length-S.b[a].log.length);unclean=cand.length>0}
      if(!cand.length){S.leader=null;L('No live replica is in the ISR. Unclean election is forbidden, so the partition is unavailable until the old leader recovers','bad');return}
      S.leader=cand[0];S.epoch++;const Ld=lead();
      L(unclean?`Unclean election: Broker ${Ld.id}, which is not in the ISR, is elected, and the committed messages it lacks are lost`:`Broker ${Ld.id} elected as the new leader from the ISR`,unclean?'bad':'info');
      for(const f of S.b)if(f!==Ld&&f.alive)truncate(f,Ld);
      S.isr=unclean?new Set([S.leader]):new Set([S.leader,...[...S.isr].filter(i=>S.b[i].alive&&i!==S.leader)]);
      recount();afterElect();
    }
    function crashLeader(){const Ld=lead();if(!Ld||!Ld.alive)return;Ld.alive=false;S.last=S.leader;S.isr.delete(S.leader);S.electAt=S.t+0.8;L(`Broker ${Ld.id} (leader) crashed`,'bad')}
    function restore(){
      let i=S.leader==null&&!S.b[S.last].alive?S.last:S.b.findIndex(b=>!b.alive);if(i<0)return;
      const f=S.b[i];f.alive=true;f.next=S.t+0.3;f.fly=null;
      if(S.leader==null){S.leader=i;S.epoch++;S.isr=new Set([i]);for(const g of S.b)if(g!==f&&g.alive)truncate(g,f);recount();L(`Broker ${f.id} recovered with its full log and is leader again`,'ok');afterElect();return}
      L(`Broker ${f.id} restarted and is catching up as a follower`,'info');truncate(f,lead());
    }
    function toggleStuck(i){const f=S.b[i];f.stuck=!f.stuck;L(f.stuck?`Broker ${f.id} stalled (for example a long GC pause or network flapping) and stopped fetching`:`Broker ${f.id} resumed fetching`,f.stuck?'warn':'info')}
    function step(){
      S.t+=DT;const Ld=lead();
      S.acc+=P.rate*DT;while(S.acc>=1){S.acc-=1;send()}
      for(const f of S.fly.slice())if(S.t>=f.at){S.fly.splice(S.fly.indexOf(f),1);arrive(f.m)}
      for(let i=0;i<3;i++){
        const f=S.b[i];if(i===S.leader||!f.alive)continue;
        if(f.fly&&S.t>=f.fly.at){if(f.fly.ep===S.epoch&&Ld&&Ld.alive)f.log=Ld.log.slice(0,Math.max(f.log.length,f.fly.upTo));f.fly=null}
        if(!f.fly&&!f.stuck&&Ld&&Ld.alive&&S.t>=f.next){f.fly={at:S.t+0.2,upTo:Ld.log.length,ep:S.epoch};f.next=S.t+0.5}
      }
      if(Ld&&Ld.alive){
        for(let i=0;i<3;i++){
          if(i===S.leader)continue;const f=S.b[i],lagN=Ld.log.length-f.log.length;
          if(!f.alive){S.isr.delete(i);continue}
          if(S.isr.has(i)&&lagN>P.lagMax){S.isr.delete(i);L(`Broker ${f.id} is ${lagN} messages behind, over the allowed ${P.lagMax}, and leaves the ISR`,'warn')}
          else if(!S.isr.has(i)&&lagN===0){S.isr.add(i);L(`Broker ${f.id} caught up with the leader and rejoined the ISR`,'ok')}
        }
        let c=Ld.log.length;for(const i of S.isr)c=Math.min(c,S.b[i].log.length);if(c>S.committed)S.committed=c;
        for(let o=S.scan;o<S.committed;o++){const e=Ld.log[o];if(e&&e.m.st==='pend'&&e.m.ents[e.m.ents.length-1]===e){if(S.isr.size<P.minIsr)reject(e.m,`m${e.m.n} was written, but the ISR shrank to ${S.isr.size}; the leader returns an error and the producer will retry`);else ackMsg(e.m)}}
        S.scan=Math.max(S.scan,S.committed);
      }
      if(S.electAt!=null&&S.t>=S.electAt){S.electAt=null;elect()}
      for(const m of S.msgs)if(m.st==='rej'&&S.t>=m.retry){m.st='fly';S.fly.push({m,at:S.t+0.1})}
      for(const a of S.agenda.slice())if(a.at!=null?S.t>=a.at-1e-9:a.when()){S.agenda.splice(S.agenda.indexOf(a),1);a.fn()}
    }

    /* ---- Stage ---- */
    const status=h('div',{class:'ir-status'});
    const mkRow=(label)=>{const lab=h('div',{class:'ir-lab'}),cells=h('div',{class:'ir-cells'}),row=h('div',{class:'ir-row'},lab,cells);return {row,lab,cells,els:[],label}};
    const prow=mkRow('Producer'),brows=[0,1,2].map(i=>mkRow('Broker '+(i+1)));
    const line=h('div',{class:'ir-line'},h('span',null,'Committed'));
    const bbox=h('div',{class:'ir-brokers'},line,...brows.map(r=>r.row));
    const lg=(style,txt)=>h('span',null,h('i',{style}),txt);
    const legend=h('div',{class:'ir-legend'},
      lg({background:'#dcefe2',borderColor:'#9fcfb0'},'Committed (all ISR have it)'),lg({background:'#fff',borderColor:'#7d8b83'},'Written, not committed'),lg({borderStyle:'dashed',borderColor:'#b9c4bc'},'Not fetched yet'),lg({background:'#f7dedb',borderColor:'#e3aaa4'},'Not on the current leader'),
      lg({border:'2px solid #b7791f'},'Awaiting ack'),lg({background:'#2f8f5b',borderColor:'#2f8f5b'},'Acknowledged'),lg({background:'#f6ead2',border:'2px solid #b7791f'},'Acked, but only 1 copy'),lg({background:'#e6eee2'},'ACK=0: no wait for ack'),lg({border:'2px dashed #c2413b'},'Rejected, retry later'),lg({background:'#c2413b',borderColor:'#c2413b'},'Thought safe but lost'));
    ctx.stage.append(status,prow.row,bbox,legend);
    const st=ctx.stats([{key:'acked',label:'Acknowledged'},{key:'lost',label:'Thought safe but lost'},{key:'one',label:'Only 1 copy at ack'},{key:'rej',label:'Rejected: ISR too small'},{key:'lat',label:'Ack wait avg / max'},{key:'isr',label:'ISR'}]);
    function build(){
      LW=W<520?70:92;const avail=W-LW-8;K=Math.max(6,Math.min(26,Math.floor(avail/32)));Kp=K;
      for(const r of [prow,...brows]){r.row.style.setProperty('--lw',LW+'px');r.cells.replaceChildren();r.els=[];for(let j=0;j<K;j++){const el=h('div',{class:'ir-c e'});r.cells.append(el);r.els.push({el,k:''})}}
    }
    const ml=n=>n<100?'m'+n:String(n);
    const setCell=(c,cls,txt,title)=>{const k=cls+txt;if(k!==c.k){c.k=k;c.el.className='ir-c '+cls;c.el.textContent=txt;c.el.title=title||''}};
    const PST={fly:['p-fly','In flight'],pend:['p-pend','Written to the leader, waiting for ISR sync'],wait:['p-pend','Leader unavailable, waiting to retry'],ok:['p-ok','Acknowledged'],s0:['p-s0','ACK=0: counted as success once sent'],rej:['p-rej','Rejected, retry later'],lost:['p-lost','The producer thought it succeeded, but the message is lost']};
    function draw(){
      const Ld=lead(),Lg=Ld?Ld.log:null;
      // Producer row
      const ms=S.msgs.slice(-Kp);
      if(prow.k!==P.ack){prow.k=P.ack;prow.lab.replaceChildren('Producer',h('br'),h('span',{class:'sdl-tag info'},'ACK='+P.ack))}
      for(let j=0;j<Kp;j++){const m=ms[j];if(!m){setCell(prow.els[j],'e','');continue}let [cls,tt]=PST[m.st];if(m.st==='ok'&&copies(m)<2){cls='p-one';tt='Acknowledged, but only 1 replica has it for now'}setCell(prow.els[j],cls,ml(m.n),'m'+m.n+': '+tt)}
      // Broker rows
      const maxLen=Math.max(...S.b.map(b=>b.log.length));const start=Math.max(0,maxLen-K+2);
      S.b.forEach((b,i)=>{
        const r=brows[i],tags=[];
        if(!b.alive)tags.push(['bad','Down']);else if(i===S.leader)tags.push(['info','Leader']);else if(S.isr.has(i))tags.push(['ok','ISR']);else tags.push(['warn','Out of ISR']);
        if(b.alive&&b.stuck&&i!==S.leader)tags.push(['warn','Stalled']);
        const tk=tags.join();if(r.k!==tk){r.k=tk;r.lab.replaceChildren(r.label,h('br'),...tags.map(([t,x])=>h('span',{class:'sdl-tag '+t},x)))}
        r.row.classList.toggle('dead',!b.alive);
        for(let j=0;j<K;j++){
          const o=start+j,e=b.log[o];let cls='e',txt='',tt='';
          if(e){txt=ml(e.n);if(Lg&&Lg[o]!==e){cls='x';tt='Not in the current leader’s log'}else if(o<S.committed){cls='c';tt='Committed'}else{cls='u';tt='Written, not yet committed'}}
          else if(Lg&&Lg[o]&&b.alive&&i!==S.leader){cls='g';txt=ml(Lg[o].n);tt='The leader has it, but it is not fetched here yet'}
          setCell(r.els[j],cls,txt,`Broker ${b.id} offset ${o}`+(tt?': '+tt:''));
        }
      });
      const cx=S.committed-start;
      if(Ld&&cx>=0&&cx<=K){line.style.display='';line.style.left=(LW+8+cx*32-2)+'px'}else line.style.display='none';
      // Status
      let tag,tone,txt;
      if(S.electAt!=null){tag='Electing';tone='warn';txt='The leader is unreachable; the controller is about to elect a new leader from the ISR, and writes wait meanwhile'}
      else if(!Ld){tag='Unavailable';tone='bad';txt='No leader can be elected, so all writes wait to retry'}
      else{tag='Leader: Broker '+Ld.id;tone='info';txt=`ISR = {${[...S.isr].sort().map(i=>i+1).join(', ')}}, ${S.committed} committed`+(P.ack==='all'?`; min.insync.replicas = ${P.minIsr}`:'')}
      if(status.k!==tag+txt){status.k=tag+txt;status.replaceChildren(h('span',{class:'sdl-tag '+tone},tag),h('span',null,txt))}
      const avg=S.lat.length?S.lat.reduce((a,b)=>a+b,0)/S.lat.length:0;
      st.set('acked',S.acked,'ok');st.set('lost',S.lostOk,S.lostOk?'bad':null);st.set('one',S.one,S.one?'warn':null);st.set('rej',S.rej,S.rej?'warn':null);
      st.set('lat',S.lat.length?avg.toFixed(1)+' / '+S.maxLat.toFixed(1)+' s':'—');st.set('isr',S.isr.size+(S.isr.size===1?' replica':' replicas'),S.isr.size<2?'warn':'ok');
      b2.textContent=S.b[1].stuck?'Broker 2 resumes fetching':'Broker 2 stalls';b3.textContent=S.b[2].stuck?'Broker 3 resumes fetching':'Broker 3 stalls';
      b2.disabled=S.leader===1||!S.b[1].alive;b3.disabled=S.leader===2||!S.b[2].alive;
      bc.disabled=!Ld||!Ld.alive||S.electAt!=null;br.disabled=S.b.every(b=>b.alive);
    }

    /* ---- Controls ---- */
    const ackCtl=ctx.segmented({label:'Producer ACK setting',value:P.ack,options:[['0','0'],['1','1'],['all','all']],onChange:v=>{P.ack=v;draw()}});
    const speedCtl=ctx.segmented({label:'Playback',value:1,options:[[0,'Pause'],[1,'1×'],[2,'2×']],onChange:v=>run.set(v)});
    const sMin=ctx.slider({label:'min.insync.replicas',min:1,max:3,value:P.minIsr,onInput:v=>{P.minIsr=v;draw()},hint:'Applies only to ACK=all writes'});
    const sLag=ctx.slider({label:'Allowed lag (messages)',min:1,max:6,value:P.lagMax,format:v=>v+' msg',onInput:v=>{P.lagMax=v}});
    const sRate=ctx.slider({label:'Send rate',min:0,max:3,step:0.25,value:P.rate,format:v=>v+' msg/s',onInput:v=>{P.rate=v}});
    const tUnclean=ctx.toggle({label:'Allow unclean election (leader from outside the ISR)',value:P.unclean,onChange:v=>{P.unclean=v}});
    const bc=ctx.button('Crash the leader',()=>{crashLeader();draw()},{danger:true});
    const b2=ctx.button('Broker 2 stalls',()=>{toggleStuck(1);draw()});
    const b3=ctx.button('Broker 3 stalls',()=>{toggleStuck(2);draw()});
    const br=ctx.button('Restart crashed broker',()=>{restore();draw()});
    ctx.button('Reset',()=>{fresh();warm();draw()});
    const run=runner(ctx,step,draw);
    function warm(){S.quiet=true;for(let i=0;i<60;i++)step();S.quiet=false;ctx.clearLog()}
    fresh();warm();
    ctx.onResize(w=>{W=w;build();draw()});
    run.set(1);

    function prepare(o){
      Object.assign(P,{ack:'all',minIsr:1,lagMax:3,rate:1.25,unclean:false},o);
      ackCtl.set(P.ack,true);sMin.set(P.minIsr,true);sLag.set(P.lagMax,true);sRate.set(P.rate,true);tUnclean.set(P.unclean,true);speedCtl.set(1,true);
      fresh();ctx.clearLog();run.set(1);draw();
    }
    const unrep=()=>{const Ld=lead();if(!Ld||!Ld.alive)return 0;const f=Math.max(...S.b.filter((b,i)=>i!==S.leader&&b.alive).map(b=>b.log.length));return Ld.log.length-f};
    /* Scenario actions hang on the simulation clock, so every run gives the same result. */
    async function burstCrash(){
      const rate=v=>{P.rate=v;sRate.set(v,true)};
      S.agenda.push({at:3,fn:()=>{rate(0);for(let k=0;k<3;k++)S.agenda.push({at:S.t+0.02+k*0.06,fn:send});
        S.agenda.push({when:()=>unrep()>=2,fn:()=>{crashLeader();S.agenda.push({at:S.t+2.5,fn:()=>rate(1.25)})}})}});
      await until(ctx,()=>S.t>=9);
    }
    ctx.scenarios([
      {id:'ack1',label:'Leader crashes with ACK=1',
        ask:'ACK=1. The producer sends 3 messages in a row, and the leader acknowledges each on receipt. The leader crashes before the two followers have pulled at least 2 of them. After a new leader is elected, are those messages still there? Will the producer resend them?',
        insight:'The new leader (Broker 2) does not have m5 and m6. The producer already considers them successful and will not resend them, so they are lost for good (red). m7, still in flight, got no acknowledgement, and the producer’s retry wrote it to the new leader. ACK=1 guarantees only that the leader itself wrote the message: every acknowledgement came with just 1 copy, and the time before replication is the loss window.',
        async run(){prepare({ack:'1',lagMax:5});await burstCrash()}},
      {id:'ackall',label:'Same crash with ACK=all',
        ask:'Switch to ACK=all and crash the leader in the same way, while more than two messages are not yet replicated. Are acknowledged messages lost this time? How much longer does each acknowledgement take?',
        insight:'At the crash, m4–m7 had not been synced by the whole ISR, so the producer never got an acknowledgement; after the new leader is elected, it retries these 4, and all are written to the new leader, so “Thought safe but lost” stays 0. The price is waiting: with ACK=1 each acknowledgement takes about 0.2 s, while ACK=all normally waits for the followers’ next fetch, about 0.4–1 s, and the retried messages waited about 2 s. m4 had actually been copied to Broker 2 but not committed, so after the retry it appears twice in the log: at-least-once allows duplicates, so consumers must deduplicate.',
        async run(){prepare({ack:'all',lagMax:5});await burstCrash()}},
      {id:'slow',label:'A slow replica leaves the ISR',
        ask:'ACK=all, with an allowed lag of 3 messages. Broker 3 suddenly stops fetching. Do the producer’s acknowledgements stay stuck forever? What happens after it recovers?',
        insight:'While Broker 3 is still in the ISR, new messages cannot be synced across the whole ISR, so every acknowledgement is stuck. Once it falls 4 messages behind, past the allowed 3, it is removed from the ISR and the queued acknowledgements complete at once, the longest after about 2.6 s. After that, the ISR has only 2 replicas, so durability is weaker. When Broker 3 resumes fetching and catches up, it rejoins the ISR. A slow replica can hold up the whole partition, so the ISR is a trade-off between latency and durability.',
        async run(){prepare({ack:'all',lagMax:3});S.agenda.push({at:2,fn:()=>toggleStuck(2)});S.agenda.push({at:9,fn:()=>toggleStuck(2)});await until(ctx,()=>S.t>=13)}},
      {id:'minisr',label:'Only the leader left in the ISR',
        ask:'ACK=all, and both followers stall and are removed from the ISR. With min.insync.replicas=1, does the producer still get acknowledgements? What if it is changed to 2 midway?',
        insight:'With min.insync.replicas=1, “all” means “everything in the ISR”, and the ISR holds only the leader: m3–m7 are still acknowledged, but with just 1 copy at that moment (shown in amber), so a disk failure on the leader would lose them. After changing it to 2, the 4 messages m8–m11 are rejected, the producer knows they failed and retries after a while; they are acknowledged only after Broker 2 recovers, catches up, and rejoins the ISR, the longest waiting 4.5 s. This trades availability for durability.',
        async run(){prepare({ack:'all',minIsr:1,lagMax:3,rate:1});S.agenda.push({at:1.5,fn:()=>{toggleStuck(1);toggleStuck(2)}});S.agenda.push({at:7,fn:()=>{P.minIsr=2;sMin.set(2,true);L('min.insync.replicas changed to 2','info')}});S.agenda.push({at:10.5,fn:()=>toggleStuck(1)});await until(ctx,()=>S.t>=14.5)}},
    ]);
  }
});
})();
