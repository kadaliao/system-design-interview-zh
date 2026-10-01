/* Chapter 7: distributed unique IDs. A Snowflake bit-budget editor plus three machines issuing IDs in simulated milliseconds: sequence exhaustion, clock rollback, duplicate machine IDs, and time ordering. */
(function(){
const {el:h,util}=SDLab;
const C=SDLab.colors;

SDLab.define({
  id:'snowflake',chapter:7,
  title:'Snowflake ID Generator: Bit Budget, Sequence Exhaustion, and Clock Rollback',
  summary:'Top: split the 63 usable bits and watch lifespan, machine count, and the per-millisecond limit trade off. Bottom: three machines issue IDs in simulated milliseconds, and each ID splits into “time | data center | machine | sequence.” Try too many requests in one millisecond, clock rollback, and duplicate machine IDs.',
  caveat:'Time advances in simulated milliseconds, slowed to a fraction of a second per tick; timestamps start at millisecond 1,000,000 after the epoch. In each millisecond the three machines handle requests in the order A, B, C, and that order is the “generation order.” Duplicates are detected only among the IDs issued in this simulation.',
  mount(ctx){
    ctx.css('sf',`
.sf-bar{display:flex;height:34px;border-radius:8px;overflow:hidden;border:1px solid #dbe2da;font-size:12px;font-weight:700;color:#fff}
.sf-bar span{display:flex;align-items:center;justify-content:center;min-width:0;white-space:nowrap;overflow:hidden;transition:flex-grow .3s}
.sf-caps{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px;margin:8px 0 12px}
.sf-cap{border-left:4px solid;padding:3px 8px;background:#fbfcfa;border-radius:0 8px 8px 0;font-size:12.5px;line-height:1.5;min-width:0}
.sf-cap b{display:block;font-size:13px}
.sf-cap .warn{color:#86561a;font-weight:650}
.sf-machines{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.sf-m{border:1.5px solid #dbe2da;border-radius:10px;padding:7px 9px;background:#fff;font-size:12.5px;line-height:1.55;min-width:0}
.sf-m.warn{border-color:#dfbf85;background:#fffaf0}.sf-m.bad{border-color:#e3aaa4;background:#fff6f5}
.sf-m .hd{display:flex;justify-content:space-between;align-items:center;gap:4px;flex-wrap:wrap}
.sf-m .hd b{font-size:14px}
.sf-m .k{color:#66756d}
.sf-m .mono{font-family:ui-monospace,Menlo,monospace;font-size:12px}
.sf-seq{display:flex;gap:2px;margin:3px 0}
.sf-seq i{flex:1;height:9px;border-radius:2px;background:#e6eee2}
.sf-seq i.on{background:#b8477a}
.sf-prog{height:9px;border-radius:3px;background:#e6eee2;margin:3px 0;overflow:hidden}
.sf-prog i{display:block;height:100%;background:#b8477a}
.sf-ids{margin-top:10px}
.sf-props{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;margin:4px 0 6px}
.sf-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;padding:4px 6px;border-top:1px solid #e8ede6;font-size:12.5px}
.sf-row:first-child{border-top:0}
.sf-row.dup{background:#fff1ef}.sf-row.inv{background:#fffaf0}
.sf-row .n{color:#66756d;font-family:ui-monospace,Menlo,monospace;min-width:6.5em}
.sf-f{display:inline-flex;gap:3px;flex-wrap:wrap}
.sf-f span{font-family:ui-monospace,Menlo,monospace;font-size:12px;padding:0 5px;border-radius:4px;color:#fff}
.sf-row .id{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;margin-left:auto;overflow-wrap:anywhere}
.sf-bin{font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.6;overflow-wrap:anywhere;word-break:break-all;margin-top:6px}
.sf-bin span{font-weight:700}
.sf-narrow .sf-machines{grid-template-columns:minmax(0,1fr)}
.sf-narrow .sf-row .id{margin-left:0;width:100%}
`);
    const EPOCH=1288834974657,T0=1000000;
    const COL={sign:'#9aa89f',t:'#2f6fb3',d:'#1f8a8a',m:'#7b5cb8',s:'#b8477a'};
    const L={d:5,m:5,s:12};const tb=()=>63-L.d-L.m-L.s;
    const P={speed:1,rate:1,policy:'wait',wrap:false,ident:'own',skewB:0};
    const IDENT={own:[2,1],clone:[1,2],dc:[2,2]};
    let T,ms,ids,seen,maxId,dups,invs,rejected;
    function reset(){
      T=T0;ids=[];seen=new Map();maxId=null;dups=0;invs=0;rejected=0;
      ms=[{name:'M-A',dc:1,mid:1,off:0},{name:'M-B',dc:1,mid:2,off:P.skewB},{name:'M-C',dc:IDENT[P.ident][0],mid:IDENT[P.ident][1],off:0}].map(x=>({...x,last:-1,seq:0,queue:0,wait:0,rej:0,status:'Idle',tone:null,issued:0}));
    }
    const maxSeq=()=>(1<<L.s)-1;
    function issue(mc,ts,seq){
      const S=BigInt(L.s),M=BigInt(L.m),D=BigInt(L.d);
      const dc=mc.dc&((1<<L.d)-1),mid=mc.mid&((1<<L.m)-1);
      const big=(BigInt(ts)<<(D+M+S))|(BigInt(dc)<<(M+S))|(BigInt(mid)<<S)|BigInt(seq);
      const key=big.toString();const c=seen.get(key)||0;seen.set(key,c+1);
      const dup=c>0,inv=!dup&&maxId!==null&&big<maxId;if(dup)dups++;if(inv)invs++;if(maxId===null||big>maxId)maxId=big;
      const prev=ids.length?ids[ids.length-1].big:null;
      ids.push({n:ids.length+1,name:mc.name,ts,dc,mid,seq,big,key,dup,inv,gap:prev===null?null:big-prev});
      if(ids.length>400)ids.splice(0,ids.length-400);
      mc.issued++;
      if(dup)ctx.log(`${mc.name} issued duplicate ID ${key} (t=${ts}, dc=${dc}, machine=${mid}, seq=${seq})`,'bad');
    }
    /* One machine serves its queued requests; returns whether it stops to wait this millisecond */
    function serve(mc){
      const now=T+mc.off;mc.status='Issuing normally';mc.tone='ok';
      while(mc.queue>0){
        if(now<mc.last&&P.policy!=='none'){
          if(P.policy==='wait'){mc.status=`Clock rollback: waiting for local time to reach ${util.fmt(mc.last)}`;mc.tone='warn';mc.wait++;return}
          mc.rej+=mc.queue;rejected+=mc.queue;ctx.log(`${mc.name} clock rollback (${util.fmt(now)} < ${util.fmt(mc.last)}): rejected ${mc.queue} requests and raised an alert`,'bad');mc.queue=0;mc.status='Clock rollback: rejected, alert raised';mc.tone='bad';return;
        }
        if(now===mc.last){
          if(mc.seq<maxSeq())mc.seq++;
          else if(P.wrap){mc.seq=0;ctx.log(`${mc.name} wrapped the sequence back to 0 after exhaustion`,'bad')}
          else{mc.status=`Sequence exhausted: ${mc.queue} queued until the next ms`;mc.tone='warn';mc.wait++;return}
        }else{if(now<mc.last)ctx.log(`${mc.name} didn’t check for rollback: treated ${util.fmt(now)} as a new millisecond and restarted seq at 0`,'bad');mc.seq=0;mc.last=now}
        issue(mc,now,mc.seq);mc.queue--;
      }
      if(!mc.issued)mc.status='Idle';
    }
    function tick(){T++;for(const mc of ms){mc.issued=0;mc.queue+=P.rate;serve(mc)}render()}
    function burst(n){const a=ms[0];a.issued=0;a.queue+=n;ctx.log(`M-A received ${n} requests at millisecond ${util.fmt(T)}`,'info');serve(a);render()}
    function rollback(k){ms[0].off-=k;ctx.log(`M-A clock rolled back ${k} ms: local time is now ${util.fmt(T+ms[0].off)}`,'warn');render()}

    /* ---- stage ---- */
    const bar=h('div',{class:'sf-bar',role:'img'});
    const caps=h('div',{class:'sf-caps'});
    const machBox=h('div',{class:'sf-machines'});
    const props=h('div',{class:'sf-props'});
    const list=h('div');
    const bin=h('div',{class:'sf-bin'});
    ctx.stage.append(h('div',{class:'ph',style:{fontSize:'13px',color:C.muted,fontWeight:700,margin:'0 0 6px'}},'How the 64 bits are split'),bar,caps,
      h('div',{class:'ph',style:{fontSize:'13px',color:C.muted,fontWeight:700,margin:'0 0 6px'}},'Three ID generators (each tick is one simulated millisecond)'),machBox,
      h('div',{class:'sdl-panel sf-ids'},h('div',{class:'ph'},'Recently issued IDs (newest first)'),props,list,bin));
    ctx.onResize(w=>{ctx.stage.classList.toggle('sf-narrow',w<620);if(ms)drawLayout()});
    const big=n=>n>=1e9?(+(n/1e9).toFixed(2))+' billion':n>=1e6?(+(n/1e6).toFixed(3))+' million':util.fmt(n);
    const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    function drawLayout(){
      const t=tb();const segs=[['sign',1,'Sign'],['t',t,'Time'],['d',L.d,'DC'],['m',L.m,'Machine'],['s',L.s,'Seq']];
      bar.setAttribute('aria-label',segs.map(x=>`${x[2]} ${x[1]} bits`).join(', '));
      const W=bar.clientWidth||ctx.stage.clientWidth||600;/* The label length follows the real pixel width; narrow segments show only the bit count */
      bar.replaceChildren(...segs.map(([k,n,lbl])=>{const px=W*n/64;return h('span',{style:{flexGrow:n,flexBasis:0,background:COL[k]},title:`${lbl} ${n} bits`},px>=(lbl.length+String(n).length+1)*7.4+12?`${lbl} ${n}`:px>=17?String(n):'')}));
      const span=2**t,end=EPOCH+span;
      const yrs=span<8.6e15-EPOCH?MON[new Date(end).getUTCMonth()]+' '+new Date(end).getUTCFullYear():'over 270,000 years';
      caps.replaceChildren(
        h('div',{class:'sf-cap',style:{borderColor:COL.t}},h('b',null,`Timestamp ${t} bits`),`${util.duration(span/1000)} of range; counting from 2010-11-04, it lasts until about ${yrs}`,t<35?h('div',{class:'warn'},'Too few time bits; they run out very soon'):null),
        h('div',{class:'sf-cap',style:{borderColor:COL.d}},h('b',null,`Data center ${L.d} bits`),`Up to ${util.fmt(2**L.d)} data centers`),
        h('div',{class:'sf-cap',style:{borderColor:COL.m}},h('b',null,`Machine ${L.m} bits`),`${util.fmt(2**L.m)} per data center, ${util.fmt(2**(L.d+L.m))} globally`),
        h('div',{class:'sf-cap',style:{borderColor:COL.s}},h('b',null,`Sequence ${L.s} bits`),`${util.fmt(2**L.s)} per machine per ms, ${big(2**L.s*1000)} per second in theory`));
    }
    function seqViz(mc){
      const n=1<<L.s,used=mc.last===T+mc.off?mc.seq+1:0;
      if(n<=16)return h('div',{class:'sf-seq','aria-hidden':'true'},util.range(n).map(i=>h('i',{class:i<used?'on':null})));
      return h('div',{class:'sf-prog','aria-hidden':'true'},h('i',{style:{width:used/n*100+'%'}}));
    }
    function drawMachines(){
      machBox.replaceChildren(...ms.map(mc=>{
        const same=ms.find(o=>o!==mc&&o.dc===mc.dc&&o.mid===mc.mid);
        const now=T+mc.off;
        return h('div',{class:'sf-m'+(mc.tone==='warn'?' warn':mc.tone==='bad'||same?' bad':'')},
          h('div',{class:'hd'},h('b',null,mc.name),h('span',{class:'sdl-tag '+(same?'bad':'')},`dc=${mc.dc} · machine=${mc.mid}`)),
          same?h('div',{style:{color:C.bad,fontWeight:650}},`Same identity as ${same.name}`):null,
          h('div',null,h('span',{class:'k'},'Local clock '),h('span',{class:'mono'},util.fmt(now)),mc.off?h('span',{style:{color:C.warn}},` (${Math.abs(mc.off)} ms ${mc.off>0?'ahead':'behind'})`):null),
          h('div',null,h('span',{class:'k'},'Last time '),h('span',{class:'mono'},mc.last<0?'—':util.fmt(mc.last)),h('span',{class:'k'},' · seq '),h('span',{class:'mono'},mc.last<0?'—':String(mc.seq))),
          seqViz(mc),
          h('div',null,h('span',{class:'sdl-tag '+(mc.tone||'')},mc.status)),
          h('div',{class:'k'},`Issued this ms ${mc.issued} · queued ${mc.queue}${mc.rej?' · rejected '+mc.rej:''}`));
      }));
    }
    function chips(x){return h('span',{class:'sf-f'},h('span',{style:{background:COL.t}},'t '+util.fmt(x.ts)),h('span',{style:{background:COL.d}},'dc '+x.dc),h('span',{style:{background:COL.m}},'m '+x.mid),h('span',{style:{background:COL.s}},'seq '+x.seq))}
    function drawIds(){
      const last=ids.slice(ctx.stage.classList.contains('sf-narrow')?-5:-8).reverse();
      list.replaceChildren(...(last.length?last.map(x=>h('div',{class:'sf-row'+(x.dup?' dup':x.inv?' inv':'')},h('span',{class:'n'},`#${x.n} ${x.name}`),chips(x),x.dup?h('span',{class:'sdl-tag bad'},'Duplicate'):null,x.inv?h('span',{class:'sdl-tag warn'},'Out of order'):null,h('span',{class:'id'},x.key))):[h('p',{class:'sdl-note'},'No IDs yet.')]));
      const g=ids.length>1?ids[ids.length-1].gap:null;
      props.replaceChildren(
        h('span',null,'Unique: ',h('b',{style:{color:dups?C.bad:C.ok}},dups?`No, ${dups} duplicate${dups>1?'s':''}`:'Yes')),
        h('span',null,'Consecutive: ',h('b',null,'No'),g!==null?` (latest minus previous = ${util.fmt(Number(g))})`:''),
        h('span',null,'Increasing in generation order: ',h('b',{style:{color:invs?C.warn:C.ok}},invs?`No, out of order ${invs}×`:'Yes')));
      const x=ids[ids.length-1];
      if(!x){bin.replaceChildren();return}
      const b=x.big.toString(2).padStart(64,'0');const t=tb();const cuts=[['sign',1],['t',t],['d',L.d],['m',L.m],['s',L.s]];let i=0;
      bin.replaceChildren(h('span',{style:{color:C.muted,fontWeight:400}},'Latest ID in binary: '),...cuts.map(([k,n])=>{const s=b.slice(i,i+n);i+=n;return h('span',{style:{color:COL[k]}},s+' ')}));
    }
    const st=ctx.stats([{key:'n',label:'IDs issued'},{key:'dup',label:'Duplicates'},{key:'inv',label:'Out of order'},{key:'wait',label:'Waiting / rejected'}]);
    function render(){
      drawMachines();drawIds();
      st.set('n',util.fmt(ids.length?ids[ids.length-1].n:0));st.set('dup',String(dups),dups?'bad':'ok');st.set('inv',String(invs),invs?'warn':null);
      const w=ms.reduce((a,m)=>a+m.queue,0);st.set('wait',`${w} / ${rejected}`,rejected?'bad':w?'warn':null);
    }
    /* ---- controls ---- */
    function relayout(){drawLayout();reset();render()}
    const dCtl=ctx.slider({label:'Data center bits',min:2,max:10,value:L.d,format:v=>v+' bits',onChange:v=>{L.d=v;relayout()},onInput:v=>{L.d=v;drawLayout()}});
    const mCtl=ctx.slider({label:'Machine bits',min:2,max:10,value:L.m,format:v=>v+' bits',onChange:v=>{L.m=v;relayout()},onInput:v=>{L.m=v;drawLayout()}});
    const sCtl=ctx.slider({label:'Sequence bits',min:1,max:16,value:L.s,format:v=>v+' bits',onChange:v=>{L.s=v;relayout()},onInput:v=>{L.s=v;drawLayout()}});
    const spCtl=ctx.segmented({label:'Time advance',value:1,options:[[0,'Paused'],[1,'Slow'],[2,'Fast']],onChange:v=>{P.speed=v;v?lp.start():lp.stop()}});
    const rCtl=ctx.slider({label:'Requests per machine per ms',min:0,max:6,value:P.rate,format:v=>String(v),onInput:v=>{P.rate=v}});
    const kCtl=ctx.slider({label:'M-B clock skew',min:-5,max:5,value:0,format:v=>v?Math.abs(v)+' ms '+(v>0?'ahead':'behind'):'exact',onInput:v=>{P.skewB=v;ms[1].off=v;render()}});
    const idCtl=ctx.select({label:'M-C identity',value:'own',options:[['own','dc=2 · machine=1 (independent)'],['clone','dc=1 · machine=2 (impersonates M-B)'],['dc','dc=2 · machine=2 (reuses only the machine ID)']],onChange:v=>{P.ident=v;ms[2].dc=IDENT[v][0];ms[2].mid=IDENT[v][1];ctx.log(`M-C identity changed to dc=${ms[2].dc}, machine=${ms[2].mid}`,'info');render()}});
    const polCtl=ctx.segmented({label:'On detecting clock rollback',value:'wait',options:[['wait','Wait to catch up'],['reject','Reject and alert'],['none','No check (wrong)']],onChange:v=>{P.policy=v}});
    const wrapCtl=ctx.toggle({label:'Wrap sequence to 0 on exhaustion (wrong)',value:false,onChange:v=>{P.wrap=v}});
    ctx.button('Advance 1 ms',()=>tick(),{primary:true});
    ctx.button('M-A gets 6 requests at once',()=>burst(6));
    ctx.button('Roll back M-A clock 3 ms',()=>rollback(3));
    let acc=0;
    const lp=ctx.loop(dt=>{if(!P.speed)return;acc+=dt;if(acc>=(P.speed===1?0.9:0.25)){acc=0;tick()}});
    drawLayout();reset();for(let i=0;i<3;i++)tick();

    /* ---- scenarios: pause auto-advance and step millisecond by millisecond from the script ---- */
    async function prepare(o,keepLog){
      Object.assign(L,{d:5,m:5,s:12},o.layout);Object.assign(P,{speed:0,rate:1,policy:'wait',wrap:false,ident:'own',skewB:0},o);
      dCtl.set(L.d,true);mCtl.set(L.m,true);sCtl.set(L.s,true);spCtl.set(0,true);lp.stop();rCtl.set(P.rate,true);kCtl.set(P.skewB,true);idCtl.set(P.ident,true);polCtl.set(P.policy,true);wrapCtl.set(P.wrap,true);
      if(!keepLog)ctx.clearLog();drawLayout();reset();render();await ctx.wait(600);
    }
    async function ticks(n,gap){for(let i=0;i<n;i++){tick();await ctx.wait(gap)}}
    ctx.scenarios([
      {id:'exhaust',label:'Sequence runs out in one millisecond',
        ask:'Set the sequence to 2 bits, so each machine has only four numbers per millisecond, seq 0–3. M-A gets 6 requests in the same millisecond. What happens to the 5th and 6th? What if the implementation lets seq wrap back to 0?',
        insight:'The first 4 get seq 0–3; the 5th and 6th queue and go out in the next millisecond with seq 0 and 1, so all IDs are unique. With wrap-to-0 turned on, the 5th and 6th in the same millisecond reuse seq 0 and 1 and are identical to the first two IDs of that millisecond: 2 duplicates. With a 12-bit sequence, it is the 4097th request that must wait or be rejected.',
        async run(){await prepare({rate:0,layout:{s:2}});burst(6);await ctx.wait(2200);tick();await ctx.wait(2200);P.wrap=true;wrapCtl.set(true,true);ctx.log('Changed to: wrap sequence to 0 on exhaustion','warn');tick();await ctx.wait(700);burst(6);await ctx.wait(2400)}},
      {id:'rollback',label:'Clock rolls back 3 ms',
        ask:'M-A issues 1 ID per millisecond, and after local time 1,000,004 its clock rolls back 3 ms. What happens if the implementation doesn’t check for rollback? And with “wait to catch up”?',
        insight:'Without a check, M-A treats 1,000,002–1,000,004 as new milliseconds and goes through them again, with seq starting at 0, so those 3 IDs are identical to ones already issued (3 duplicates). With “wait to catch up,” M-A stops issuing for 2 ms and queues requests; when local time is back at 1,000,004 it continues with seq 1–3 and issues the 3 backlogged IDs, with no duplicates. But its clock is still 3 ms slow, so IDs it issues afterward are smaller than the ones M-B and M-C just issued (4 times “out of order”): no duplicates, but no cross-machine ordering guarantee either.',
        async run(){await prepare({policy:'none'});await ticks(4,550);rollback(3);await ctx.wait(900);await ticks(4,650);await ctx.wait(1200);
          ctx.log('— Replay, this time with “wait to catch up” —','info');await prepare({policy:'wait'},true);await ticks(4,450);rollback(3);await ctx.wait(900);await ticks(4,750);await ctx.wait(600)}},
      {id:'clone',label:'Duplicate machine ID',
        ask:'M-C was cloned from M-B and is also configured as dc=1, machine=2. Each of the two issues 1 ID per millisecond; how many duplicates appear in 4 milliseconds? What if M-C moves to dc=2 with the machine ID still 2?',
        insight:'Every millisecond, M-B and M-C issue with the same time, dc=1, machine=2, and seq=0: identical inputs, so identical outputs, and 4 milliseconds produce 4 collisions. This is a deterministic duplicate, not a rare collision. After M-C moves to data center 2, even with the machine ID still 2, the dc field differs and the conflict is gone.',
        async run(){await prepare({ident:'clone'});await ctx.wait(600);await ticks(4,900);await ctx.wait(800);P.ident='dc';idCtl.set('dc');await ctx.wait(600);await ticks(3,800)}},
      {id:'order',label:'Unique, consecutive, ordered',
        ask:'Three machines each issue 1 ID per millisecond, but M-B’s clock is 2 ms slow. After 6 milliseconds, are these 18 IDs unique? Consecutive? Increasing in generation order?',
        insight:'All 18 IDs are unique; adjacent IDs differ by roughly 4 million to 8 million, so they are not consecutive; M-B’s timestamp is always 2 ms smaller than the one M-A just used, so each ID it issues is smaller than the one before, giving 6 “out of order” events in generation order. Snowflake only guarantees rough time order, and clock skew across machines scrambles the sequence.',
        async run(){await prepare({skewB:-2});await ticks(6,1100);await ctx.wait(600)}},
    ]);
  }
});
})();
