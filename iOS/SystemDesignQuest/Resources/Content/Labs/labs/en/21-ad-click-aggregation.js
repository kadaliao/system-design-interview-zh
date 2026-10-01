/* Chapter 21: Ad click event aggregation. Lab 1: event time, windows, and watermarks; lab 2: commit order of offsets and results. */
(function(){
const {el:h,util}=SDLab;
let uid=0;
const until=async(ctx,cond)=>{let n=0;while(!cond()&&n<1200){await ctx.wait(50);n++}};
const p2=n=>String(n).padStart(2,'0');
const clock=(s,sec=true)=>{s=Math.max(0,Math.floor(s));const hh=12+Math.floor(s/3600),mm=Math.floor(s%3600/60);return p2(hh)+':'+p2(mm)+(sec?':'+p2(s%60):'')};

/* ---------------- Lab 1: event time, windows, and watermarks ---------------- */
SDLab.define({
  id:'stream-window',chapter:21,
  title:'Event Time, Windows, and Watermarks',
  summary:'Click stream for ad ad001: each dot sits on the horizontal axis at its event time (when the click happened), and hollow dots are clicks that already happened but are still in flight. A window outputs its result only once the watermark passes its end. Drag out-of-order tolerance and allowed lateness to compare how fast results come out and how many late clicks are dropped or corrected.',
  caveat:'Watermark = largest event time seen − out-of-order tolerance (bounded out-of-orderness); it only moves forward. A late click within the allowed lateness makes the window emit a new version with the full count, and downstream writes absolute values keyed by (ad, window, version). Clicks beyond that go to the side output, left for the daily reconciliation. Click gaps and network delays are generated randomly from a fixed seed. Node failures and transaction commits are not simulated; see the next lab.',
  mount(ctx){
    ctx.css('sw',`
.sw-status{font-size:12.5px;color:#66756d;margin-bottom:4px;font-variant-numeric:tabular-nums;min-height:20px}
.sw-status b{color:#23352f;font-weight:650}
.sw-legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:#66756d;margin:6px 0 4px}
.sw-legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px;vertical-align:-1px}
.sw-rec{margin-top:8px}
.sw-rec caption{text-align:left;font-size:12px;color:#66756d;padding-bottom:4px}
.sw-rec td,.sw-rec th{white-space:nowrap}
`);
    const C=ctx.colors,id=++uid,DT=0.1;
    const P={mode:'event',win:'tumble',delay:10,late:0};
    let S,W=600,G=null,speed=1,recs=[];
    const winLen=()=>P.win==='tumble'?60:180;
    const keysOf=x=>{const m=Math.floor(x/60);return (P.win==='tumble'?[m]:[m-2,m-1,m]).filter(k=>k>=0)};
    const wEnd=k=>k*60+winLen();
    const wl=k=>'['+clock(k*60,false)+', '+clock(wEnd(k),false)+')';
    const L=(t,tone)=>{if(!S.quiet)ctx.log(`[Processing time ${clock(S.t)}] `+t,tone)};
    function fresh(){S={t:0,rng:util.rng(21),nextEt:3,nid:0,evs:[],pend:[],maxEt:-1e9,wm:-1e9,wins:new Map(),side:0,corr:0,stopAt:null,hi:null,quiet:false,agenda:[]}}
    function win(k){let w=S.wins.get(k);if(!w){w={k,count:0,truth:0,out:null,ver:0,fireT:0,purged:false};S.wins.set(k,w)}return w}
    function gen(){
      while(S.nextEt<=S.t){
        const r=S.rng,et=S.nextEt,u=r(),id=S.nid+1;
        /* Most clicks arrive within seconds and a few tens of seconds late; every 37th is over 2 minutes late, like a phone reporting after being offline. */
        const d=id%37===0?122+id%5*6:u<.68?r()*6:u<.9?8+r()*22:u<.98?35+r()*40:110+r()*50;
        const e={id:++S.nid,et,arr:et+d,d,y:r(),st:null,ws:[],at:false};S.evs.push(e);S.pend.push(e);
        for(const k of keysOf(et))win(k).truth++;
        S.nextEt+=0.3-Math.log(1-r())*4.7;
      }
      S.pend.sort((a,b)=>a.arr-b.arr);
    }
    function arrive(e){
      e.at=true;
      if(P.mode==='proc'){for(const k of keysOf(e.arr)){win(k).count++;e.ws.push(k)}e.st=Math.floor(e.arr/60)!==Math.floor(e.et/60)?'wrong':'in';return}
      S.maxEt=Math.max(S.maxEt,e.et);S.wm=Math.max(S.wm,S.maxEt-P.delay);
      let side=false,corr=false;
      for(const k of keysOf(e.et)){
        const w=win(k);
        if(w.out==null){w.count++;e.ws.push(k)}
        else if(!w.purged){w.count++;w.ver++;w.out=w.count;corr=true;S.corr++;e.ws.push(k);L(`A click ${Math.round(e.d)} s late (happened at ${clock(e.et)}) corrects window ${wl(k)}: emits v${w.ver} = ${w.out}`,'warn')}
        else side=true;
      }
      if(side){S.side++;L(`A click ${Math.round(e.d)} s late (happened at ${clock(e.et)}) belongs to a closed window, so it goes to the side output for reconciliation`,'bad')}
      e.st=side?'side':corr?'corr':'in';
    }
    function fire(){
      for(const w of S.wins.values()){
        const end=wEnd(w.k);
        if(w.out==null&&S.wm>=end){w.out=w.count;w.ver=1;w.fireT=S.t}
        if(w.out!=null&&!w.purged&&(P.mode==='proc'||S.wm>=end+P.late))w.purged=true;
      }
    }
    function step(){
      if(S.stopAt!=null&&S.t>=S.stopAt-1e-9)return;
      S.t+=DT;gen();
      while(S.pend.length&&S.pend[0].arr<=S.t)arrive(S.pend.shift());
      if(P.mode==='proc')S.wm=S.t;
      fire();
      for(const a of S.agenda.slice())if(S.t>=a.at-1e-9){S.agenda.splice(S.agenda.indexOf(a),1);a.fn()}
      if(S.evs.length>400)S.evs=S.evs.filter(e=>!e.at||e.et>S.t-900);
    }
    function calc(){
      const f=[...S.wins.values()].filter(w=>w.out!=null);
      const lat=f.length?f.reduce((s,w)=>s+w.fireT-wEnd(w.k),0)/f.length:null;
      const err=f.reduce((s,w)=>s+Math.abs(w.out-w.truth),0);
      const wrong=S.evs.filter(e=>e.st==='wrong').length;
      return {n:f.length,lat,err,wrong};
    }

    /* ---- Stage ---- */
    const status=h('div',{class:'sw-status'}),svgBox=h('div');
    const dotL=(col,txt,hollow)=>h('span',null,h('i',{style:hollow?{border:'1.5px solid #9aa89f'}:{background:col}}),txt);
    const legend=h('div',{class:'sw-legend'},dotL(0,'Happened, still in flight',1),dotL(C.info,'Arrived, window not output yet'),dotL(C.ok,'Counted in output'),dotL(C.warn,'Late, result corrected'),dotL(C.bad,'Late, sent to side output / wrong window by arrival time'));
    const recBox=h('div',{class:'sdl-scroll sw-rec'});
    ctx.stage.append(status,svgBox,legend,recBox);
    const st=ctx.stats([{key:'n',label:'Windows output'},{key:'lat',label:'Delay after window end'},{key:'corr',label:'Corrections'},{key:'side',label:'Side output (to reconcile)'},{key:'err',label:'Output vs. actual (difference)'}]);
    const S_=(t,a,...k)=>ctx.svgEl(t,a,...k);
    function build(){
      const narrow=W<560,x0=6,x1=W-6,cw=x1-x0,span=narrow?210:300,dy0=22,DH=narrow?96:104,ax=dy0+DH+15,ry=ax+10,RH=P.win==='tumble'?42:3*24-4,H=ry+RH+6;
      const svg=S_('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'Clicks, windows, and watermark laid out by event time'});
      const cid='sw-clip-'+id;svg.append(S_('defs',null,S_('clipPath',{id:cid},S_('rect',{x:x0,y:0,width:cw,height:H}))));
      const body=S_('g',{'clip-path':`url(#${cid})`});
      svg.append(S_('rect',{x:x0,y:dy0,width:cw,height:DH,fill:'#fbfcfa',stroke:C.line}),body);
      const gWinBg=S_('g'),gLines=S_('g'),band=S_('rect',{y:dy0,height:DH,fill:C.warnSoft,opacity:.55}),gRes=S_('g'),gDots=S_('g');
      const nowL=S_('line',{y1:dy0-4,y2:ry+RH,stroke:C.info,'stroke-width':1.6}),wmL=S_('line',{y1:dy0-4,y2:ry+RH,stroke:C.warn,'stroke-width':1.6,'stroke-dasharray':'5 3'});
      const nowT=S_('text',{y:dy0-8,'font-size':12,fill:C.info,'font-weight':650}),wmT=S_('text',{y:dy0-8,'font-size':12,fill:'#86561a','font-weight':650,'text-anchor':'end'});
      body.append(gWinBg,band,gLines,gRes,gDots,wmL,nowL);svg.append(nowT,wmT);
      svgBox.replaceChildren(svg);
      G={x0,x1,cw,span,dy0,DH,ax,ry,RH,narrow,gWinBg,gLines,band,gRes,gDots,nowL,wmL,nowT,wmT,dots:new Map(),res:new Map(),lines:[],axisT:[]};
      draw();
    }
    const dotFill=e=>{if(!e.at)return 'none';if(e.st==='side'||e.st==='wrong')return C.bad;if(e.st==='corr')return C.warn;return e.ws.some(k=>{const w=S.wins.get(k);return w&&w.out!=null})?C.ok:C.info};
    function draw(){
      if(!G)return;
      const {x0,x1,cw,span,dy0,DH,ax,ry,RH}=G,vEnd=S.t+(G.narrow?16:22),vS=vEnd-span,X=t=>x0+(t-vS)/span*cw;
      // Minute boundaries and axis labels
      const m0=Math.ceil(vS/60),ms=[];for(let m=m0;m*60<=vEnd;m++)ms.push(m);
      while(G.lines.length<ms.length){const l=S_('line',{y1:dy0,y2:dy0+DH,stroke:'#b9c4bc','stroke-dasharray':'3 3'}),t=S_('text',{y:ax,'font-size':12,fill:C.muted,'text-anchor':'middle'});G.gLines.append(l,t);G.lines.push([l,t])}
      G.lines.forEach(([l,t],i)=>{const m=ms[i];if(m==null){l.setAttribute('display','none');t.setAttribute('display','none');return}const x=X(m*60);ctx.attr(l,{display:null,x1:x,x2:x});ctx.attr(t,{display:null,x,text:clock(m*60,false)})});
      // Dots
      const seen=new Set();
      for(const e of S.evs){
        if(e.et>S.t||e.et<vS-10)continue;seen.add(e.id);let d=G.dots.get(e.id);
        if(!d){d=S_('circle',{r:G.narrow?4.5:5,'stroke-width':1.5,style:'cursor:pointer'});d.append(S_('title'));d.addEventListener('click',()=>{S.hi=S.hi===e.id?null:e.id;draw()});G.gDots.append(d);G.dots.set(e.id,d)}
        const f=dotFill(e);ctx.attr(d,{cx:X(e.et),cy:dy0+10+e.y*(DH-20),fill:f,stroke:f==='none'?'#9aa89f':(S.hi===e.id?C.ink:'#fff'),'stroke-width':S.hi===e.id?2.5:1.5,r:S.hi===e.id?7:(G.narrow?4.5:5)});
        const tt=`Happened ${clock(e.et)}, ${e.at?'arrived '+clock(e.arr)+` (${Math.round(e.d)} s late)`:'still in flight'}`;if(d.firstChild.textContent!==tt)d.firstChild.textContent=tt;
      }
      for(const [k,d] of G.dots)if(!seen.has(k)){d.remove();G.dots.delete(k)}
      // Window results
      const hiE=S.hi&&S.evs.find(e=>e.id===S.hi),hiK=hiE?keysOf(P.mode==='proc'&&hiE.at?hiE.arr:hiE.et):[];
      const ks=[];for(let k=Math.max(0,Math.floor((vS-winLen())/60));k*60<=vEnd;k++)ks.push(k);
      const keep=new Set();
      for(const k of ks){
        const w=win(k),xa=X(k*60),xb=X(wEnd(k)),row=P.win==='tumble'?0:k%3,y=ry+row*24,hh=P.win==='tumble'?RH:20;keep.add(k);
        let r=G.res.get(k);if(!r){const g=S_('g'),rect=S_('rect',{rx:5,height:hh}),t1=S_('text',{'font-size':12,'text-anchor':'middle','font-weight':650}),t2=S_('text',{'font-size':12,'text-anchor':'middle'});g.append(rect,t1,t2);G.gRes.append(g);r={g,rect,t1,t2};G.res.set(k,r)}
        const fired=w.out!=null,bad=fired&&w.out!==w.truth,hi=hiK.includes(k);
        ctx.attr(r.rect,{x:xa+1.5,y,width:Math.max(0,xb-xa-3),height:hh,fill:fired?C.okSoft:'#eef1ec',stroke:hi?C.ink:fired?(bad?C.bad:'#9fcfb0'):'#cfd8cc','stroke-width':hi?2.5:1});
        const vs=Math.max(xa,x0),ve=Math.min(xb,x1),cx=(vs+ve)/2,room=ve-vs;
        const l1=fired?'Output '+w.out+(w.ver>1?' · v'+w.ver:''):'Total '+w.count,l2=P.win==='tumble'?(fired?(bad?'Actual '+w.truth:'Matches actual'):'Pending'):'';
        if(P.win==='tumble'){ctx.attr(r.t1,{x:cx,y:y+17,text:room>54?l1:'',fill:fired?'#1d6a41':C.muted});ctx.attr(r.t2,{x:cx,y:y+33,text:room>54?l2:'',fill:bad?C.bad:C.muted})}
        else{ctx.attr(r.t1,{x:cx,y:y+14,text:room>70?l1+(bad?' (actual '+w.truth+')':''):'',fill:bad?C.bad:fired?'#1d6a41':C.muted});r.t2.textContent=''}
      }
      for(const [k,r] of G.res)if(!keep.has(k)){r.g.remove();G.res.delete(k)}
      // Window background: tumbling windows already output
      G.gWinBg.replaceChildren();
      if(P.win==='tumble')for(const k of ks){const w=S.wins.get(k);if(w&&w.out!=null)G.gWinBg.append(S_('rect',{x:X(k*60),y:dy0,width:X(wEnd(k))-X(k*60),height:DH,fill:C.okSoft,opacity:.45}))}
      // Now and watermark
      const xn=X(S.t);ctx.attr(G.nowL,{x1:xn,x2:xn});ctx.attr(G.nowT,{x:Math.min(xn+3,x1-30),text:'Now'});
      if(P.mode==='event'&&S.wm>-1e8){const xw=X(S.wm);ctx.attr(G.wmL,{x1:xw,x2:xw,display:null});ctx.attr(G.wmT,{x:Math.max(xw-3,x0+66),text:'Watermark',display:null});ctx.attr(G.band,{x:xw,width:Math.max(0,xn-xw),display:null})}
      else{G.wmL.setAttribute('display','none');G.wmT.setAttribute('display','none');G.band.setAttribute('display','none')}
      status.replaceChildren(...(P.mode==='event'?['Processing time ',h('b',null,clock(S.t)),' · Max event time seen ',h('b',null,S.maxEt>0?clock(S.maxEt):'—'),' · Watermark ',h('b',null,S.wm>0?clock(S.wm):'—'),` (= max event time − ${P.delay} s)`]:['Processing time ',h('b',null,clock(S.t)),' · Windows are assigned by arrival time and output as soon as they end, without waiting for late clicks']));
      const c=calc();
      st.set('n',c.n);st.set('lat',c.lat==null?'—':c.lat.toFixed(1)+' s',c.lat>30?'warn':null);st.set('corr',S.corr,S.corr?'warn':null);st.set('side',S.side,S.side?'bad':null);st.set('err',c.err,c.err?'bad':'ok');
    }
    function record(label){
      const c=calc();recs.push([label||'Manual record',P.mode==='event'?'Event time':'Processing time',P.win==='tumble'?'Tumbling 1 min':'Sliding 3 min',P.mode==='event'?P.delay+' s':'—',P.mode==='event'?P.late+' s':'—',c.n,c.lat==null?'—':c.lat.toFixed(1)+' s',S.corr,P.mode==='event'?S.side:c.wrong+' (wrong window)',c.err]);
      if(recs.length>6)recs.shift();
      recBox.replaceChildren(h('table',{class:'sdl-table'},h('caption',null,'Recorded runs (same click stream)'),h('thead',null,h('tr',null,...['Run','Assigned by','Window','Out-of-order tolerance','Allowed lateness','Windows output','Avg. delay','Corrections','Dropped','Diff vs. actual'].map(x=>h('th',null,x)))),h('tbody',null,...recs.map(r=>h('tr',null,...r.map(x=>h('td',null,String(x))))))));
    }

    /* ---- Controls ---- */
    const modeCtl=ctx.segmented({label:'Window assignment basis',value:P.mode,options:[['event','Event time'],['proc','Processing time']],onChange:v=>{P.mode=v;restart()}});
    const winCtl=ctx.segmented({label:'Window (sliding windows start every 1 min)',value:P.win,options:[['tumble','Tumbling 1 min'],['slide','Sliding 3 min']],onChange:v=>{P.win=v;restart(true)}});
    const sD=ctx.slider({label:'Out-of-order tolerance',min:0,max:60,step:5,value:P.delay,format:v=>v+' s',onChange:v=>{P.delay=v;restart()},hint:'Watermark = max event time seen − this value'});
    const sL=ctx.slider({label:'Allowed lateness',min:0,max:120,step:10,value:P.late,format:v=>v+' s',onChange:v=>{P.late=v;restart()},hint:'How long window state is kept after the watermark passes the window end'});
    const playCtl=ctx.segmented({label:'Playback',value:1,options:[[0,'Pause'],[1,'1×'],[3,'3×']],onChange:v=>{S.stopAt=null;setSpeed(v)}});
    ctx.button('Restart',()=>restart(),{primary:true});
    ctx.button('Record this run',()=>record());
    let acc=0,da=0;
    const lp=ctx.loop(dt=>{acc+=dt*20*speed;let n=0;while(acc>=DT&&n<400){acc-=DT;step();n++}da+=dt;if(da>=1/30){da=0;draw()}},false);
    function setSpeed(v){speed=v;playCtl.set(v,true);if(v)lp.start();else{lp.stop();draw()}}
    function warm(to){S.quiet=true;while(S.t<to-1e-9)step();S.quiet=false}
    function restart(rebuild){fresh();ctx.clearLog();warm(150);if(rebuild||!G)build();else{G.dots.forEach(d=>d.remove());G.dots.clear();G.res.forEach(r=>r.g.remove());G.res.clear();draw()}if(!speed)setSpeed(1)}
    fresh();warm(150);
    ctx.onResize(w=>{if(Math.abs(w-W)>2||!G){W=w;build()}});
    setSpeed(1);

    async function phase(o,end,label,sp){
      Object.assign(P,{mode:'event',win:'tumble',delay:10,late:0},o);
      const wasWin=winCtl.get();modeCtl.set(P.mode,true);winCtl.set(P.win,true);sD.set(P.delay,true);sL.set(P.late,true);
      fresh();ctx.clearLog();warm(30);S.stopAt=end;if(wasWin!==P.win||!G)build();else{G.dots.forEach(d=>d.remove());G.dots.clear();G.res.forEach(r=>r.g.remove());G.res.clear()}
      setSpeed(sp);await until(ctx,()=>S.t>=end-1e-9);setSpeed(0);if(label)record(label);
    }
    const clearRec=()=>{recs=[];recBox.replaceChildren()};
    ctx.scenarios([
      {id:'proc',label:'Assign by arrival time',
        ask:'Ignore when each click happened and assign it to a one-minute window by when the server received it, outputting each window as soon as it ends. Run from 12:00 to 12:07:30: how many clicks get counted in the wrong minute? Do the window outputs match the actual click counts?',
        insight:'Of the 97 clicks that arrived, 12 crossed a minute boundary before arriving and were counted in a later minute (red dots). 5 of the 7 windows output do not match the actual counts, a total difference of 9. The upside is that results appear the moment a window ends, but this counts when a click arrived rather than when it was made, so billing records the wrong period.',
        async run(){clearRec();await phase({mode:'proc'},450,'Processing time',2)}},
      {id:'wm',label:'Tolerance 5 s vs. 40 s',
        ask:'Switch to event-time assignment with allowed lateness at 0. Run 7 minutes each at out-of-order tolerance 5 s and 40 s: which run sends fewer late clicks to the side output? How long after a window ends does its result appear?',
        insight:'See the record table below. With 5 s tolerance, results appear 13.7 s after the window ends on average, but 5 clicks arrive too late and go to the side output. With 40 s tolerance, drops fall to 2, at the cost of waiting 48.2 s on average, and only 6 windows get output in the same time. The remaining 2 clicks were 51 s and 134 s late: a finite wait cannot catch every late click, so reconciliation has to fix them.',
        async run(){clearRec();await phase({delay:5},450,'Tolerance 5 s',3);await ctx.wait(600);await phase({delay:40},450,'Tolerance 40 s',3)}},
      {id:'late',label:'Allowed lateness: emit corrections',
        ask:'With 10 s out-of-order tolerance plus 60 s allowed lateness: are clicks that arrive after a window has output still dropped? What does downstream receive?',
        insight:'Windows still output first, when the watermark passes their end. Late clicks that arrive afterward (26–58 s late) make 4 windows each emit a v2 (amber dots). Only the click that was 134 s late exceeds the allowed lateness and goes to the side output. A correction carries the window’s full count, and downstream overwrites by (ad, window, version), so receiving the same version twice does not double count. “Output vs. actual” also includes clicks still in flight.',
        async run(){clearRec();await phase({delay:10,late:60},450,'Tolerance 10 s + allowed lateness 60 s',2)}},
      {id:'slide',label:'Sliding window: one click, how many counts',
        ask:'Switch to 3-minute windows that slide every 1 minute. When the run ends, one click is selected (the enlarged dot): how many windows is it counted in? Can adjacent windows’ counts simply be added?',
        insight:'The selected click (big dot) belongs to 3 overlapping windows (bold outlines), and each one counts it, so adjacent windows’ counts cannot be added; each only answers “how many clicks in the last 3 minutes”. Tumbling windows do not overlap, so only their per-minute results can be added.',
        async run(){clearRec();await phase({win:'slide',delay:10},450,null,2);const c=S.evs.filter(e=>e.at&&e.st==='in'&&e.et>300&&e.et<330);if(c.length)S.hi=c[0].id;draw();await ctx.wait(800)}},
    ]);
  }
});

/* ---------------- Lab 2: commit order of offsets and results ---------------- */
SDLab.define({
  id:'agg-exactly-once',chapter:21,
  title:'Aggregation Node Crash: Duplicated or Lost Results',
  summary:'An aggregation node reads the 10 clicks at offsets 100–109, computes the count for ad001 in the 12:00 minute, hands the result downstream, and records how far it has read. Step through, inject a crash between two steps, and see whether each commit order makes downstream overcount, undercount, or count exactly right.',
  caveat:'Each step is one independent write or processing action. After a crash, a new node takes over and re-reads from the offset last committed upstream. “Atomic commit” stands for putting the result and the offset in the same transaction or checkpoint; an idempotent write needs downstream to overwrite absolute values under a stable key and to reject old versions overwriting new ones.',
  mount(ctx){
    ctx.css('eo',`
.eo-list{display:flex;flex-direction:column;border:1px solid #dbe2da;border-radius:10px;overflow:hidden;font-size:13px}
.eo-row{display:grid;grid-template-columns:34px 124px minmax(0,1fr) 215px;gap:8px;align-items:center;padding:6px 10px;border-top:1px solid #e8ede6;line-height:1.45}
.eo-row:first-child{border-top:0}
.eo-row.hd{background:#f0f4ed;font-weight:700;font-size:12px}
.eo-row.future{color:#b4beb7}.eo-row.future .sdl-tag{opacity:.45}
.eo-row.cur{background:#fff7dd}
.eo-row.crash{background:#f7dedb}
.eo-state{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#66756d}
.eo-verdict{font-size:14px;margin:10px 0 0}
.eo-narrow .eo-row{grid-template-columns:30px minmax(0,1fr)}
.eo-narrow .eo-row>.who{grid-column:2}
.eo-narrow .eo-row>.what{grid-column:2}
.eo-narrow .eo-row>.eo-state{grid-column:2}
.eo-narrow .eo-row.hd{display:none}
`);
    const TRUE=10;
    const MODES={
      send:{label:'Send result, then commit offset',steps:[
        ['agg','Read offsets 100–109: 10 clicks'],['agg','Count in memory: ad001 @12:00 = 10'],
        ['down','Send the result; downstream runs count += 10',s=>{s.down+=10}],
        ['crash','Crash: offset not yet committed'],
        ['up','New node takes over, reading from committed offset 100'],['agg','Read offsets 100–109 again; the count is 10 again'],
        ['down','Send again; downstream runs count += 10 again',s=>{s.down+=10}],['up','Commit offset 110',s=>{s.off=110}]],
        verdict:s=>`Downstream shows ${s.down}, but there were only ${TRUE} clicks: counted twice. The result was delivered but the acknowledgement was lost, so replay sends it again.`},
      offset:{label:'Save offset, then send result',steps:[
        ['agg','Read offsets 100–109: 10 clicks'],['agg','Count in memory: ad001 @12:00 = 10'],
        ['up','Save offset 110 to HDFS / S3 first',s=>{s.off=110}],
        ['crash','Crash: result not yet sent'],
        ['up','New node takes over, reading from offset 110'],['agg','Offsets 100–109 count as processed and are not read again']],
        verdict:s=>`Downstream shows ${s.down}: the result for these ${TRUE} clicks is lost for good. Progress was recorded before the result, so a crash loses data.`},
      atomic:{label:'Atomic commit of result and offset',steps:[
        ['agg','Read offsets 100–109: 10 clicks'],['agg','Count in memory: ad001 @12:00 = 10'],
        ['down','Begin transaction: write result 10 and offset 110 (not yet committed)'],
        ['crash','Crash: transaction aborts, so neither result nor offset takes effect'],
        ['up','New node takes over, reading from offset 100'],['agg','Read offsets 100–109 again; the count is 10 again'],
        ['down','Commit transaction: result 10 and offset 110 take effect together',s=>{s.down=10;s.off=110}]],
        verdict:s=>`Downstream shows ${s.down}, matching the actual count. The result and progress take effect together or not at all, so replay neither duplicates nor loses anything.`},
      idem:{label:'Downstream idempotent write by key',steps:[
        ['agg','Read offsets 100–109: 10 clicks'],['agg','Count in memory: ad001 @12:00 = 10'],
        ['down','Write absolute value 10 under key (ad001, 12:00, v1)',s=>{s.down=10}],
        ['crash','Crash: offset not yet committed'],
        ['up','New node takes over, reading from committed offset 100'],['agg','Read offsets 100–109 again; the count is 10 again'],
        ['down','Write 10 under the same key again: overwrite, no accumulation',s=>{s.down=10}],['up','Commit offset 110',s=>{s.off=110}]],
        verdict:s=>`Downstream shows ${s.down}, matching the actual count. Duplicate sends still happen, but writing an absolute value under the same key never accumulates, which is why an idempotent downstream can do without a distributed transaction.`},
    };
    const WHO={agg:['info','Aggregation node'],up:['','Upstream offset'],down:['ok','Downstream result'],crash:['bad','Crash']};
    let mode='send',crashOn=true,steps=[],idx=0,S,rows=[];
    const list=h('div',{class:'eo-list',role:'table','aria-label':'Execution steps'}),verdict=h('p',{class:'eo-verdict'});
    ctx.stage.append(list,verdict);
    ctx.onResize(w=>list.classList.toggle('eo-narrow',w<560));
    const st=ctx.stats([{key:'off',label:'Upstream committed offset'},{key:'down',label:'Downstream count'},{key:'truth',label:'Actual clicks',value:String(TRUE)},{key:'res',label:'Result'}]);
    const modeCtl=ctx.segmented({label:'Commit order',value:mode,wide:true,options:Object.entries(MODES).map(([k,v])=>[k,v.label]),onChange:v=>{mode=v;build()}});
    const crashCtl=ctx.toggle({label:'Inject a crash between two steps',value:crashOn,onChange:v=>{crashOn=v;build()}});
    const nextBtn=ctx.button('Next step',()=>step(),{primary:true});
    ctx.button('Autoplay',()=>{autoplay().catch(()=>{})});
    ctx.button('Restart',()=>build());
    function build(){
      S={off:100,down:0};idx=0;
      let all=MODES[mode].steps;
      if(!crashOn){const ci=all.findIndex(s=>s[0]==='crash');const pre=all.slice(0,ci);all=mode==='atomic'?[...pre.slice(0,2),['down','Commit transaction: result 10 and offset 110 take effect together',s=>{s.down=10;s.off=110}]]:mode==='offset'?[...pre,['down','Send the result; downstream runs count += 10',s=>{s.down+=10}]]:[...pre,['up','Commit offset 110',s=>{s.off=110}]]}
      steps=all;
      list.replaceChildren(h('div',{class:'eo-row hd'},h('span',null,'#'),h('span',null,'Who'),h('span',null,'Action'),h('span',null,'State after')));
      rows=steps.map((s,i)=>{const [tone,name]=WHO[s[0]];const state=h('span',{class:'eo-state'});const row=h('div',{class:'eo-row future'},h('span',{class:'sdl-tag'+(tone?' '+tone:'')},String(i+1)),h('span',{class:'who'},name),h('span',{class:'what'},s[1]),state);list.append(row);return {row,state}});
      verdict.textContent='Click “Next step” to run step by step.';nextBtn.disabled=false;update();
    }
    function update(){const done=idx>=steps.length;st.set('off',S.off);st.set('down',S.down,S.down===TRUE?'ok':S.down>TRUE?'bad':S.down===0&&done?'bad':null);st.set('res',done?(S.down===TRUE?'Count correct':S.down>TRUE?'Double counted':'Missed'):'—',done?(S.down===TRUE?'ok':'bad'):null)}
    function step(){
      if(idx>=steps.length)return;const s=steps[idx],r=rows[idx];
      rows.forEach(x=>x.row.classList.remove('cur'));
      if(s[2])s[2](S);
      r.row.classList.remove('future');r.row.classList.add(s[0]==='crash'?'crash':'cur');r.state.textContent=`offset ${S.off} · downstream ${S.down}`;
      idx++;update();
      if(idx>=steps.length){nextBtn.disabled=true;verdict.textContent=crashOn?MODES[mode].verdict(S):`With no crash, downstream shows ${S.down}, and all four orders are correct. The difference only appears when a failure hits between two steps.`;ctx.announce(verdict.textContent)}
    }
    async function autoplay(){build();while(idx<steps.length){step();await ctx.wait(750)}}
    build();
    const go=m=>async()=>{mode=m;modeCtl.set(m,true);crashOn=true;crashCtl.set(true,true);await autoplay()};
    ctx.scenarios([
      {id:'send',label:'Send, then commit',ask:'The aggregation node crashes after sending the result downstream (count += 10) but before committing the offset. After a new node takes over, what does downstream end up with?',insight:'20: counted twice. This is the classic lost-acknowledgement case: whenever retries are allowed, at-least-once delivery brings duplicates.',run:go('send')},
      {id:'offset',label:'Save progress, then send',ask:'Reverse the order: save offset 110 first, then send the result, with a crash between the two steps. What does downstream end up with?',insight:'0: the result for these 10 clicks is lost for good. Swapping the order just trades duplicates for loss.',run:go('offset')},
      {id:'atomic',label:'Atomic commit',ask:'Put “write the result” and “write the offset” in one transaction, and crash before it commits. What does downstream end up with?',insight:'10. When the transaction aborts, neither takes effect; the new node redoes the work from 100, and both take effect together at commit. The price is needing transaction or checkpoint support.',run:go('atomic')},
      {id:'idem',label:'Idempotent downstream write',ask:'No transaction, but downstream writes absolute values keyed by (ad, minute, version). The node crashes after sending but before committing the offset. What does downstream end up with?',insight:'10. The result crosses the network twice, but the second write overwrites the same key instead of accumulating: this is “exactly-once results”, not “sent only once”. It requires writing absolute values rather than +10, and version numbers that stop old results overwriting new ones.',run:go('idem')},
    ]);
  }
});
})();
