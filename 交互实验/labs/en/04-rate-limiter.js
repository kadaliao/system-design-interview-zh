/* Chapter 4: Rate limiter. Lab 1 compares five algorithms; lab 2 shows the race when several gateways share a counter. */
(function(){
const {el:h,util}=SDLab;

/* ---------------- Lab 1: five algorithms side by side ---------------- */
SDLab.define({
  id:'rate-limiter-arena',chapter:4,
  title:'Five Rate Limiting Algorithms Side by Side',
  summary:'One stream of requests goes to all five algorithms at once: green is allowed (the leaking bucket is drawn at the moment it actually processes the request), red is rejected. Drag a parameter or switch the traffic pattern to see how they differ under bursts, window boundaries, and sustained overload.',
  caveat:'Time advances in simulated seconds. The token bucket and leaking bucket both use a long-term rate of quota ÷ window, so the comparison is fair. Rejected requests are not written to the sliding log, and the sliding window counter rounds its estimate down, as in the book’s example. A real system must also guarantee atomicity; see the next lab.',
  mount(ctx){
    ctx.css('rl',`
.rl-rows{display:flex;flex-direction:column;gap:6px}
.rl-row{display:grid;grid-template-columns:118px minmax(0,1fr) 128px;gap:10px;align-items:center}
.rl-name{font-size:13px;font-weight:650;line-height:1.3}
.rl-name small{display:block;font-weight:400;color:#66756d;font-size:11px}
.rl-track{position:relative;height:46px;background:#f6f8f4;border:1px solid #e3e9e1;border-radius:8px;overflow:hidden}
.rl-track svg{position:absolute;inset:0;width:100%;height:100%}
.rl-gauge{font-size:12px;color:#66756d;font-variant-numeric:tabular-nums}
.rl-gauge .bar{height:7px;border-radius:4px;background:#e6eee2;margin-top:3px;overflow:hidden}
.rl-gauge .bar i{display:block;height:100%;background:#2f6fb3;border-radius:4px;transition:width .1s}
.rl-axis{position:relative;height:18px;font-size:11px;color:#66756d}
.rl-axis span{position:absolute;transform:translateX(-50%);white-space:nowrap}
.rl-legend{display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:#66756d;margin:8px 0 2px}
.rl-legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.rl-narrow .rl-row{grid-template-columns:1fr auto}
.rl-narrow .rl-track{grid-column:1/-1;order:3}
.rl-narrow .rl-gauge{text-align:right;min-width:110px}
.rl-narrow .rl-axisrow .rl-name,.rl-narrow .rl-axisrow .rl-gauge{display:none}
.rl-narrow .rl-axisrow .rl-axis{grid-column:1/-1}
`);
    const SPAN=30,BIN=0.5,NB=Math.round(SPAN/BIN)+2;
    const P={L:10,W:10,C:10,Q:5,pattern:'steady',speed:1};
    const ALG=[
      {key:'tb',name:'Token bucket',en:'bursts allowed',color:ctx.colors.series[0]},
      {key:'lb',name:'Leaking bucket',en:'smooth output',color:ctx.colors.series[1]},
      {key:'fw',name:'Fixed window',en:'calendar-aligned',color:ctx.colors.series[2]},
      {key:'sl',name:'Sliding log',en:'exact, memory-heavy',color:ctx.colors.series[3]},
      {key:'sc',name:'Sliding counter',en:'approximate, light',color:ctx.colors.series[4]},
    ];
    let t=SPAN,rng=util.rng(7),nextArrival=SPAN,script=[],state,hist;
    const rate=()=>P.L/P.W;

    function resetState(){
      state={
        tb:{tokens:P.C,last:t},
        lb:{lastDue:-Infinity,dues:[]},
        fw:{win:Math.floor(t/P.W),count:0},
        sl:{log:[]},
        sc:{win:Math.floor(t/P.W),cur:0,prev:0},
      };
      hist={arr:[]};for(const a of ALG)hist[a.key]={pass:[],rej:[],wait:[]};
    }
    function offer(now){
      hist.arr.push(now);
      // Token bucket: refill by elapsed time, up to capacity
      const tb=state.tb;tb.tokens=Math.min(P.C,tb.tokens+(now-tb.last)*rate());tb.last=now;
      if(tb.tokens>=1){tb.tokens-=1;hist.tb.pass.push(now)}else hist.tb.rej.push(now);
      // Leaking bucket: drain at a fixed rate; reject when the queue is full
      const lb=state.lb;lb.dues=lb.dues.filter(d=>d>now);
      if(lb.dues.length>=P.Q)hist.lb.rej.push(now);
      else{const due=Math.max(now,lb.lastDue+1/rate());lb.lastDue=due;if(due>now)lb.dues.push(due);hist.lb.pass.push(due);hist.lb.wait.push(due-now)}
      // Fixed window: count per calendar-aligned window
      const fw=state.fw,win=Math.floor(now/P.W);if(win!==fw.win){fw.win=win;fw.count=0}
      if(fw.count<P.L){fw.count++;hist.fw.pass.push(now)}else hist.fw.rej.push(now);
      // Sliding log: count allowed requests in the past W seconds
      const sl=state.sl;sl.log=sl.log.filter(x=>x>now-P.W);
      if(sl.log.length<P.L){sl.log.push(now);hist.sl.pass.push(now)}else hist.sl.rej.push(now);
      // Sliding window counter: current window + previous window × the share still covered
      const sc=state.sc,w2=Math.floor(now/P.W);
      if(w2!==sc.win){sc.prev=w2===sc.win+1?sc.cur:0;sc.cur=0;sc.win=w2}
      const est=sc.cur+sc.prev*(1-(now-w2*P.W)/P.W);
      if(Math.floor(est)<P.L){sc.cur++;hist.sc.pass.push(now)}else hist.sc.rej.push(now);
    }
    function gauges(now){
      const tb=state.tb,tok=Math.min(P.C,tb.tokens+(now-tb.last)*rate());
      const q=state.lb.dues.filter(d=>d>now).length;
      const fwc=Math.floor(now/P.W)===state.fw.win?state.fw.count:0;
      const slc=state.sl.log.filter(x=>x>now-P.W).length;
      const sc=state.sc,w2=Math.floor(now/P.W);let cur=sc.cur,prev=sc.prev;if(w2!==sc.win){prev=w2===sc.win+1?sc.cur:0;cur=0}
      const est=cur+prev*(1-(now-w2*P.W)/P.W);
      return {tb:[tok,P.C,'Tokens '+tok.toFixed(1)+' / '+P.C],lb:[q,P.Q,'Queued '+q+' / '+P.Q],fw:[fwc,P.L,'This window '+fwc+' / '+P.L],sl:[slc,P.L,'Last '+P.W+' s: '+slc+' / '+P.L],sc:[est,P.L,'Estimate '+est.toFixed(1)+' / '+P.L]};
    }
    function peak(times){const a=times.slice().sort((x,y)=>x-y);let best=0,j=0;for(let i=0;i<a.length;i++){while(a[i]-a[j]>=P.W-1e-9)j++;best=Math.max(best,i-j+1)}return best}

    /* ---- Controls ---- */
    const pattern=ctx.select({label:'Traffic pattern',value:P.pattern,options:[['steady','Steady (about 0.8× the rate)'],['over','Sustained overload (2× the rate)'],['burst','Intermittent bursts (one wave every 15 s)'],['manual','Manual (send requests with the buttons below)']],onChange:v=>{P.pattern=v;nextArrival=t}});
    const speed=ctx.segmented({label:'Playback speed',value:1,options:[[0,'Pause'],[0.5,'0.5×'],[1,'1×'],[2,'2×']],onChange:v=>{P.speed=v}});
    const sL=ctx.slider({label:'Quota (requests / window)',min:2,max:20,value:P.L,onChange:v=>{P.L=v;restart()}});
    const sW=ctx.slider({label:'Window length',min:2,max:15,value:P.W,format:v=>v+' s',onChange:v=>{P.W=v;restart()}});
    const sC=ctx.slider({label:'Token bucket capacity',min:1,max:30,value:P.C,onChange:v=>{P.C=v;restart()}});
    const sQ=ctx.slider({label:'Leaking bucket queue length',min:0,max:20,value:P.Q,onChange:v=>{P.Q=v;restart()}});
    ctx.button('Send 1 request',()=>offer(t),{primary:true});
    ctx.button('Send 10 at once',()=>{for(let i=0;i<10;i++)offer(t+i*0.01)});
    ctx.button('Clear history',()=>restart());

    /* ---- Stage ---- */
    const rowsBox=h('div',{class:'rl-rows'});
    const tracks={};
    function track(key,color){
      const svg=ctx.svgEl('svg',{viewBox:`0 0 ${NB*10} 46`,preserveAspectRatio:'none','aria-hidden':'true'});
      const grid=ctx.svgEl('g');const bars=ctx.svgEl('g');svg.append(grid,ctx.svgEl('line',{x1:0,x2:NB*10,y1:23,y2:23,stroke:'#cfd8cc','stroke-width':1,'vector-effect':'non-scaling-stroke'}),bars);
      const up=[],down=[];
      for(let i=0;i<NB;i++){const u=ctx.svgEl('rect',{x:i*10+1,width:8,y:23,height:0,fill:color==='arr'?'#9aa89f':ctx.colors.ok,rx:1});const d=ctx.svgEl('rect',{x:i*10+1,width:8,y:23,height:0,fill:ctx.colors.bad,rx:1});bars.append(u,d);up.push(u);down.push(d)}
      tracks[key]={svg,grid,up,down};
      return h('div',{class:'rl-track'},svg);
    }
    const gaugeEls={};
    rowsBox.append(h('div',{class:'rl-row'},h('div',{class:'rl-name'},'Incoming requests',h('small',null,'shared by all')),track('arr','arr'),h('div',{class:'rl-gauge',id:null},h('span',{class:'rl-arrcount'},''))));
    for(const a of ALG){
      const txt=h('span');const bar=h('i');gaugeEls[a.key]={txt,bar};
      rowsBox.append(h('div',{class:'rl-row'},h('div',{class:'rl-name'},h('span',{style:{color:a.color}},'■ '),a.name,h('small',null,a.en)),track(a.key),h('div',{class:'rl-gauge'},txt,h('div',{class:'bar'},bar))));
    }
    const axis=h('div',{class:'rl-axis'});
    rowsBox.append(h('div',{class:'rl-row rl-axisrow'},h('div',{class:'rl-name'}),axis,h('div',{class:'rl-gauge'})));
    const legend=h('div',{class:'rl-legend'},h('span',null,h('i',{style:{background:ctx.colors.ok}}),'Allowed (one slot per 0.5 s; taller bar = more requests)'),h('span',null,h('i',{style:{background:ctx.colors.bad}}),'Rejected'),h('span',null,h('i',{style:{background:'none',border:'1px dashed #7d8b83'}}),'Window boundary'));
    const table=h('table',{class:'sdl-table'});
    ctx.stage.append(rowsBox,legend,h('div',{class:'sdl-scroll',style:{marginTop:'10px'}},table));
    ctx.onResize(w=>rowsBox.classList.toggle('rl-narrow',w<600));
    const arrCount=rowsBox.querySelector('.rl-arrcount');

    function binsOf(times,t0){const c=new Array(NB).fill(0);for(const x of times){const i=Math.floor((x-t0)/BIN);if(i>=0&&i<NB)c[i]++}return c}
    let lastTableKey='';
    function draw(){
      const t0=Math.floor((t-SPAN)/BIN)*BIN;
      const scale=v=>v?Math.min(22,5*Math.sqrt(v)):0;
      const setBars=(tr,ups,downs)=>{for(let i=0;i<NB;i++){const u=scale(ups[i]),d=scale(downs?downs[i]:0);tr.up[i].setAttribute('y',23-u);tr.up[i].setAttribute('height',u);tr.down[i].setAttribute('height',d)}};
      setBars(tracks.arr,binsOf(hist.arr,t0),null);
      for(const a of ALG){const hs=hist[a.key];setBars(tracks[a.key],binsOf(hs.pass.filter(x=>x<=t),t0),binsOf(hs.rej,t0))}
      // Window boundaries and “now”
      const k0=Math.ceil(t0/P.W),lines=[];
      for(let k=k0;k*P.W<=t0+NB*BIN;k++){const x=(k*P.W-t0)/BIN*10;lines.push(x)}
      const nowX=(t-t0)/BIN*10;
      for(const key of ['arr',...ALG.map(a=>a.key)]){
        const g=tracks[key].grid;g.replaceChildren();
        if(key!=='arr'&&key!=='tb'&&key!=='lb')for(const x of lines)g.append(ctx.svgEl('line',{x1:x,x2:x,y1:0,y2:46,stroke:'#7d8b83','stroke-dasharray':'3 3','stroke-width':1,'vector-effect':'non-scaling-stroke'}));
        g.append(ctx.svgEl('line',{x1:nowX,x2:nowX,y1:0,y2:46,stroke:ctx.colors.info,'stroke-width':1.5,'vector-effect':'non-scaling-stroke'}));
      }
      axis.replaceChildren();
      const nowPct=nowX/(NB*10)*100;for(let s=Math.ceil(t0/5)*5;s<=t;s+=5){const pct=(s-t0)/(NB*BIN)*100;if(pct>2&&pct<nowPct-9)axis.append(h('span',{style:{left:pct+'%'}},s+'s'))}
      axis.append(h('span',{style:{left:nowX/(NB*10)*100+'%',color:ctx.colors.info,fontWeight:'650'}},'Now'));
      const g=gauges(t);
      for(const a of ALG){const [v,max,txt]=g[a.key];gaugeEls[a.key].txt.textContent=txt;gaugeEls[a.key].bar.style.width=(max?util.clamp(v/max,0,1)*100:0)+'%'}
      arrCount.textContent=hist.arr.length+' total';
      const rows=ALG.map(a=>{const hs=hist[a.key],passed=hs.pass.filter(x=>x<=t);const w=hs.wait.length?hs.wait.reduce((s,x)=>s+x,0)/hs.wait.length:0;return [a,passed.length,hs.rej.length,peak(passed),w]});
      const key=rows.map(r=>r.slice(1).join(',')).join('|')+P.L;
      if(key!==lastTableKey){
        lastTableKey=key;
        table.replaceChildren(h('thead',null,h('tr',null,h('th',null,'Algorithm'),h('th',null,'Allowed'),h('th',null,'Rejected'),h('th',{title:'Most requests allowed in any continuous W seconds'},'Max in any '+P.W+' s'),h('th',null,'Avg. queueing'))),
          h('tbody',null,rows.map(([a,p,r,pk,w])=>h('tr',null,h('td',null,a.name),h('td',null,p),h('td',null,r),h('td',{style:{color:pk>P.L?ctx.colors.bad:null,fontWeight:pk>P.L?'700':null}},pk+(pk>P.L?' (over quota '+P.L+')':'')),h('td',null,a.key==='lb'?w.toFixed(1)+' s':'—')))));
      }
    }
    function restart(){t=Math.ceil(t/P.W)*P.W||0;script=[];rng=util.rng(7);nextArrival=t;resetState();lastTableKey='';draw()}
    function spawn(){
      if(P.pattern==='manual')return;
      if(P.pattern==='burst'){while(nextArrival<=t){for(let i=0;i<2.5*P.L;i++)script.push(nextArrival+i*0.02);nextArrival+=15}return}
      const lam=(P.pattern==='over'?2:0.8)*rate();
      while(nextArrival<=t){script.push(nextArrival);nextArrival+=-Math.log(1-rng())/lam}
    }
    let acc=0;
    ctx.loop(dt=>{
      if(!P.speed)return;
      const end=t+dt*P.speed;spawn();
      script.sort((a,b)=>a-b);
      while(script.length&&script[0]<=end){const x=script.shift();t=Math.max(t,x);offer(x)}
      t=end;acc+=dt;if(acc>1/30){acc=0;draw()}
    });
    resetState();draw();

    /* ---- Preset scenarios: all start at the beginning of a window, easy to check by hand ---- */
    async function prepare(opts){
      Object.assign(P,{L:10,W:10,C:10,Q:5,speed:1},opts);
      sL.set(P.L,true);sW.set(P.W,true);sC.set(P.C,true);sQ.set(P.Q,true);
      pattern.set('manual');speed.set(1,true);
      t=Math.ceil((t+0.001)/P.W)*P.W;script=[];resetState();lastTableKey='';draw();
      return t;
    }
    const at=(base,sec,n,gap=0.03)=>{for(let i=0;i<n;i++)script.push(base+sec+i*gap)};
    ctx.scenarios([
      {id:'boundary',label:'Burst at a window boundary',
        ask:'The quota is 10 per 10 seconds. 10 requests arrive at second 9.6, and 10 more at second 10.1 (just after the next window starts). How many does the fixed window allow in total? And the sliding log?',
        insight:'The fixed window lets both batches through: 20 pass in about 0.8 seconds, 2 times the quota. Neither calendar window is over quota on its own, and it never promised “any continuous 10 seconds.” The sliding log rejects the whole second batch. The sliding window counter estimates from the previous window’s proportion and lets through just 1 extra (approximation error). The token bucket spends all its tokens on the first batch, so the second batch has to wait for a refill.',
        async run(){const b=await prepare({});at(b,9.6,10);at(b,10.1,10);await ctx.wait(12500)}},
      {id:'idle-burst',label:'Big burst after idling',
        ask:'The bucket holds 10 tokens and refills 1 per second. The system sits idle for a long time, then 25 requests arrive at once. How many does the token bucket allow? And the leaking bucket (queue of 5)?',
        insight:'The token bucket allows 10 immediately: however long it idles, tokens stop at capacity, so capacity decides “how big a burst you can make.” The leaking bucket handles 1 right away, holds 5 more in its queue and releases them at 1 per second (the last waits 5 seconds), and rejects the rest. Its output is the smoothest, at the price of queueing delay.',
        async run(){const b=await prepare({});at(b,2,25,0.02);await ctx.wait(9000)}},
      {id:'sustained',label:'Sustained 2× overload',
        ask:'Requests keep arriving at twice the rate (about 2 per second against a quota of 1 per second). After 30 seconds, will the algorithms’ allowed totals differ much?',
        insight:'Over the long run they all approach “1 per second”: the five algorithms share the same long-term rate. The token bucket’s extra 10 or so come from the burst allowance of the full bucket at the start. In the “Max in any 10 s” column, the fixed window and sliding window counter also slightly exceed the quota near boundaries. Choose an algorithm by how large an instantaneous shock the downstream can take and whether waiting is acceptable.',
        async run(){await prepare({});pattern.set('over');speed.set(2);await ctx.wait(15000);pattern.set('manual',true);P.pattern='manual'}},
    ]);
  }
});

/* ---------------- Lab 2: two gateways race for the last slot ---------------- */
SDLab.define({
  id:'rate-limiter-race',chapter:4,
  title:'Two Gateways Race for the Last Slot',
  summary:'The quota is 10 and Redis has already counted 9. Gateways A and B each receive a request at almost the same time. Step through to see which approaches oversell.',
  caveat:'Each step is one round trip to Redis or one local check; “Interleaved” means the two gateways’ steps take turns. The cross-region case uses two Redis instances with a fixed replication delay to represent asynchronous sync.',
  mount(ctx){
    ctx.css('rr',`
.rr-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.9fr) minmax(0,1fr);border:1px solid #dbe2da;border-radius:10px;overflow:hidden;font-size:13px}
.rr-grid>div{padding:7px 10px;border-top:1px solid #e8ede6;min-height:36px;display:flex;align-items:center;gap:6px;line-height:1.45}
.rr-grid>.hd{background:#f0f4ed;font-weight:700;border-top:0;justify-content:center}
.rr-grid>.redis{background:#fbfcfa;justify-content:center;font-family:ui-monospace,Menlo,monospace;text-align:center}
.rr-grid>.a{justify-content:flex-start}.rr-grid>.b{justify-content:flex-end;text-align:right}
.rr-grid>.cur{background:#fff7dd}
.rr-grid>.future{color:#b4beb7}
.rr-grid>.future .sdl-tag{opacity:.45}
.rr-narrow{grid-template-columns:minmax(0,1fr) 96px}
.rr-narrow>.a,.rr-narrow>.b{grid-column:1;grid-row:var(--r);justify-content:flex-start;text-align:left;flex-wrap:wrap}
.rr-narrow>.redis{grid-column:2;grid-row:var(--r);font-size:12px}
.rr-narrow>.a:empty,.rr-narrow>.b:empty,.rr-narrow>.hd.hb{display:none}
.rr-narrow>.hd.ha{grid-column:1;grid-row:1}.rr-narrow>.hd.hr{grid-column:2;grid-row:1}
`);
    const MODES={
      naive:{label:'GET, check, then INCR',steps:who=>[
        {who,op:'GET quota:user',do:s=>{s.seen[who]=s.redis;return `Read ${s.redis}`}},
        {who,op:'Local check',do:s=>{const ok=s.seen[who]<s.limit;s.ok[who]=ok;return ok?`${s.seen[who]} < ${s.limit}, allow`:`${s.seen[who]} ≥ ${s.limit}, reject`},local:true},
        {who,op:'INCR quota:user',do:s=>{if(!s.ok[who])return 'Rejected, nothing written';s.redis++;return `Count is now ${s.redis}`}},
      ]},
      incr:{label:'INCR first, then check the result',steps:who=>[
        {who,op:'INCR quota:user',do:s=>{s.redis++;s.seen[who]=s.redis;return `Returned ${s.redis}`}},
        {who,op:'Local check',do:s=>{const ok=s.seen[who]<=s.limit;s.ok[who]=ok;return ok?`${s.seen[who]} ≤ ${s.limit}, allow`:`${s.seen[who]} > ${s.limit}, reject`},local:true},
      ]},
      lua:{label:'Lua script: purge, count, check, write in one step',steps:who=>[
        {who,op:'EVAL rate limit script',atomic:true,do:s=>{const ok=s.redis<s.limit;s.ok[who]=ok;if(ok)s.redis++;return ok?`Count in script ${s.redis-1} < ${s.limit}, write and allow`:`Count in script ${s.redis} ≥ ${s.limit}, reject`}},
      ]},
      geo:{label:'Two regions, each with its own Redis, syncing asynchronously',steps:who=>[
        {who,op:`INCR (local Redis ${who})`,do:s=>{s.local[who]++;s.seen[who]=s.local[who];return `Local Redis returned ${s.local[who]}`}},
        {who,op:'Local check',do:s=>{const ok=s.seen[who]<=s.limit;s.ok[who]=ok;return ok?`${s.seen[who]} ≤ ${s.limit}, allow`:'Reject'},local:true},
        {who,op:'Replicate to the other region asynchronously',do:s=>{s.pending++;return 'Reaches the other region later'},local:true},
      ]},
    };
    let mode='naive',interleave=true,steps=[],idx=0,S=null,cells=[];
    const grid=h('div',{class:'rr-grid',role:'table','aria-label':'Execution steps'});
    const verdict=h('p',{class:'sdl-note',style:{fontSize:'14px',margin:'10px 0 0'}});
    ctx.stage.append(grid,verdict);
    ctx.onResize(w=>{const n=w<560;if(n!==grid.classList.contains('rr-narrow')){grid.classList.toggle('rr-narrow',n);const hd=grid.querySelector('.hd.ha');if(hd)hd.textContent=n?'Gateway A / B':'Gateway A'}});
    const stats=ctx.stats([{key:'redis',label:'Count in Redis'},{key:'pass',label:'Allowed this round'},{key:'rej',label:'Rejected this round'},{key:'over',label:'Oversold'}]);
    const modeCtl=ctx.segmented({label:'Approach',value:mode,wide:true,options:Object.entries(MODES).map(([k,v])=>[k,v.label]),onChange:v=>{mode=v;build()}});
    const orderCtl=ctx.segmented({label:'Execution order',value:'inter',options:[['inter','Interleaved (A1 B1 A2 B2…)'],['serial','A finishes, then B']],onChange:v=>{interleave=v==='inter';build()}});
    const nextBtn=ctx.button('Next step',()=>step(),{primary:true});
    ctx.button('Autoplay',()=>autoplay());
    ctx.button('Restart',()=>build());

    function build(){
      S={redis:9,limit:10,seen:{},ok:{},local:{A:9,B:9},pending:0};
      const A=MODES[mode].steps('A'),B=MODES[mode].steps('B');
      steps=[];
      if(MODES[mode].steps('A')[0].atomic){steps=[A[0],B[0]]}
      else if(interleave){for(let i=0;i<Math.max(A.length,B.length);i++){if(A[i])steps.push(A[i]);if(B[i])steps.push(B[i])}}
      else steps=[...A,...B];
      idx=0;grid.replaceChildren(h('div',{class:'hd ha'},grid.classList.contains('rr-narrow')?'Gateway A / B':'Gateway A'),h('div',{class:'hd hr'},mode==='geo'?'Redis (Region A / B)':'Redis'),h('div',{class:'hd hb'},'Gateway B'));
      cells=steps.map((st,i)=>{
        const a=h('div',{class:'a future',style:{'--r':i+2}}),r=h('div',{class:'redis future',style:{'--r':i+2}}),b=h('div',{class:'b future',style:{'--r':i+2}});
        const side=st.who==='A'?a:b;
        side.append(h('span',{class:'sdl-tag'+(st.atomic?' info':'')},`${st.who}${i+1}`),h('span',null,st.op));
        grid.append(a,r,b);return {a,r,b,side};
      });
      verdict.textContent=mode==='lua'?'The script runs serially inside Redis: B’s script waits until A’s script has run to the end.':'Click “Next step” to run one step at a time.';
      nextBtn.disabled=false;orderCtl.el.style.opacity=mode==='lua'?.5:1;
      update();
    }
    function redisText(){return mode==='geo'?`Region A ${S.local.A} / Region B ${S.local.B}`:String(S.redis)}
    function update(){
      const pass=Object.values(S.ok).filter(Boolean).length,rej=Object.values(S.ok).filter(v=>v===false).length;
      const used=mode==='geo'?9+pass:S.redis;
      const over=Math.max(0,9+pass-S.limit);
      stats.set('redis',redisText());stats.set('pass',pass,pass?'ok':null);stats.set('rej',rej,rej?'warn':null);stats.set('over',over,over?'bad':'ok');
      return {pass,over,used};
    }
    function step(){
      if(idx>=steps.length)return;
      const st=steps[idx],c=cells[idx];
      cells.forEach(x=>{x.a.classList.remove('cur');x.r.classList.remove('cur');x.b.classList.remove('cur')});
      const res=st.do(S);
      for(const k of ['a','r','b'])c[k].classList.remove('future');
      c.a.classList.add('cur');c.r.classList.add('cur');c.b.classList.add('cur');
      c.side.append(h('span',{style:{color:'#66756d'}},'→ '+res));
      c.r.textContent=st.local?'—':redisText();
      idx++;
      const {over}=update();
      if(idx>=steps.length){
        nextBtn.disabled=true;
        const msgs={
          naive:over?'Both gateways read 9 and both decide “there is still room,” so 2 requests are allowed and 1 is oversold. GET, the check, and INCR are three separate operations, and someone else can cut in between them.':'Run one after the other, nothing is oversold, but as soon as the two gateways’ steps interleave there is a problem; in production you cannot guarantee the order.',
          incr:'INCR itself is atomic: only one gateway gets 10, and the other gets 11 and is rejected. Here the rejected request also pushes the count to 11; to store an exact count of allowed requests, you can roll back on a failed check or use a script instead.',
          lua:'The script runs atomically as a whole, and B’s script sees the count after A’s write, so only 1 request is allowed. Note that this atomicity covers only data on the same Redis instance.',
          geo:'Each region’s Redis thinks it has 1 slot left, so 2 requests are allowed globally and 1 is oversold. Asynchronous sync lowers latency but briefly oversells the global quota; to be strict you need central coordination or a quota pre-assigned to each region.',
        };
        verdict.textContent=msgs[mode];
        ctx.announce(verdict.textContent);
      }
    }
    async function autoplay(){build();while(idx<steps.length){step();await ctx.wait(700)}}
    build();

    ctx.scenarios([
      {id:'naive',label:'Interleaved non-atomic approach',ask:'Both gateways use “GET → check → INCR” and their steps interleave. How many requests get through?',insight:'2 get through, 1 is oversold. The race hides in the gap between the read and the write.',async run(){modeCtl.set('naive',true);mode='naive';orderCtl.set('inter',true);interleave=true;await autoplay()}},
      {id:'incr',label:'Switch to atomic INCR',ask:'Same interleaving, but INCR first and then look at the returned value. What happens?',insight:'Only 1 gets through. The decision now rests on the return value of an atomic operation, not on a read result that may be stale.',async run(){modeCtl.set('incr',true);mode='incr';orderCtl.set('inter',true);interleave=true;await autoplay()}},
      {id:'lua',label:'Sliding log in a Lua script',ask:'A sliding log needs four steps: purge old records, count, check, write. Once they are in one Lua script, can it still oversell?',insight:'No. The whole script runs serially inside Redis, with no gap in between. A sorted set alone does not make it atomic.',async run(){modeCtl.set('lua',true);mode='lua';await autoplay()}},
      {id:'geo',label:'Separate counts per region',ask:'To cut latency, two regions each count in a local Redis and sync asynchronously. Each region thinks only 9 have been used. What happens?',insight:'The global quota is oversold. You must trade low latency against a strict global quota.',async run(){modeCtl.set('geo',true);mode='geo';orderCtl.set('inter',true);interleave=true;await autoplay()}},
    ]);
  }
});
})();
