/* 第 4 章：限流器。实验一对比五种算法；实验二演示多台网关共享计数时的竞态。 */
(function(){
const {el:h,util}=SDLab;

/* ---------------- 实验一：五种算法同场对比 ---------------- */
SDLab.define({
  id:'rate-limiter-arena',chapter:4,
  title:'五种限流算法同场对比',
  summary:'同一股请求流量同时交给五种算法：绿色是放行（漏桶按实际处理时刻画），红色是拒绝。拖动参数或换一种流量，看它们在突发、边界和持续超速下的差别。',
  caveat:'时间按模拟秒推进；令牌桶和漏桶的长期速率都设为「配额 ÷ 窗口」，便于公平比较。被拒请求不写入滑动日志；滑动窗口计数按原书示例对估算值向下取整。真实系统还要保证原子性，见下一个实验。',
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
      {key:'tb',name:'令牌桶',en:'Token Bucket',color:ctx.colors.series[0]},
      {key:'lb',name:'漏桶',en:'Leaking Bucket',color:ctx.colors.series[1]},
      {key:'fw',name:'固定窗口',en:'Fixed Window',color:ctx.colors.series[2]},
      {key:'sl',name:'滑动日志',en:'Sliding Log',color:ctx.colors.series[3]},
      {key:'sc',name:'滑动窗口计数',en:'Sliding Counter',color:ctx.colors.series[4]},
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
      // 令牌桶：按经过时间补充，最多补到容量
      const tb=state.tb;tb.tokens=Math.min(P.C,tb.tokens+(now-tb.last)*rate());tb.last=now;
      if(tb.tokens>=1){tb.tokens-=1;hist.tb.pass.push(now)}else hist.tb.rej.push(now);
      // 漏桶：固定速率出队；排队中的请求数达到队列长度就拒绝
      const lb=state.lb;lb.dues=lb.dues.filter(d=>d>now);
      if(lb.dues.length>=P.Q)hist.lb.rej.push(now);
      else{const due=Math.max(now,lb.lastDue+1/rate());lb.lastDue=due;if(due>now)lb.dues.push(due);hist.lb.pass.push(due);hist.lb.wait.push(due-now)}
      // 固定窗口：按日历对齐的窗口计数
      const fw=state.fw,win=Math.floor(now/P.W);if(win!==fw.win){fw.win=win;fw.count=0}
      if(fw.count<P.L){fw.count++;hist.fw.pass.push(now)}else hist.fw.rej.push(now);
      // 滑动日志：统计过去 W 秒内的放行记录
      const sl=state.sl;sl.log=sl.log.filter(x=>x>now-P.W);
      if(sl.log.length<P.L){sl.log.push(now);hist.sl.pass.push(now)}else hist.sl.rej.push(now);
      // 滑动窗口计数：当前窗口 + 上一窗口 × 仍覆盖比例
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
      return {tb:[tok,P.C,'令牌 '+tok.toFixed(1)+' / '+P.C],lb:[q,P.Q,'排队 '+q+' / '+P.Q],fw:[fwc,P.L,'本窗口 '+fwc+' / '+P.L],sl:[slc,P.L,'近 '+P.W+' 秒 '+slc+' / '+P.L],sc:[est,P.L,'估算 '+est.toFixed(1)+' / '+P.L]};
    }
    function peak(times){const a=times.slice().sort((x,y)=>x-y);let best=0,j=0;for(let i=0;i<a.length;i++){while(a[i]-a[j]>=P.W-1e-9)j++;best=Math.max(best,i-j+1)}return best}

    /* ---- 控件 ---- */
    const pattern=ctx.select({label:'流量模式',value:P.pattern,options:[['steady','平稳（约 0.8 倍速率）'],['over','持续超速（2 倍速率）'],['burst','间歇突发（每 15 秒来一波）'],['manual','手动（用下方按钮发请求）']],onChange:v=>{P.pattern=v;nextArrival=t}});
    const speed=ctx.segmented({label:'播放速度',value:1,options:[[0,'暂停'],[0.5,'0.5×'],[1,'1×'],[2,'2×']],onChange:v=>{P.speed=v}});
    const sL=ctx.slider({label:'配额（次 / 窗口）',min:2,max:20,value:P.L,onChange:v=>{P.L=v;restart()}});
    const sW=ctx.slider({label:'窗口长度',min:2,max:15,value:P.W,format:v=>v+' 秒',onChange:v=>{P.W=v;restart()}});
    const sC=ctx.slider({label:'令牌桶容量',min:1,max:30,value:P.C,onChange:v=>{P.C=v;restart()}});
    const sQ=ctx.slider({label:'漏桶队列长度',min:0,max:20,value:P.Q,onChange:v=>{P.Q=v;restart()}});
    ctx.button('发 1 个请求',()=>offer(t),{primary:true});
    ctx.button('瞬间发 10 个',()=>{for(let i=0;i<10;i++)offer(t+i*0.01)});
    ctx.button('清空记录',()=>restart());

    /* ---- 舞台 ---- */
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
    rowsBox.append(h('div',{class:'rl-row'},h('div',{class:'rl-name'},'到达的请求',h('small',null,'所有算法共用')),track('arr','arr'),h('div',{class:'rl-gauge',id:null},h('span',{class:'rl-arrcount'},''))));
    for(const a of ALG){
      const txt=h('span');const bar=h('i');gaugeEls[a.key]={txt,bar};
      rowsBox.append(h('div',{class:'rl-row'},h('div',{class:'rl-name'},h('span',{style:{color:a.color}},'■ '),a.name,h('small',null,a.en)),track(a.key),h('div',{class:'rl-gauge'},txt,h('div',{class:'bar'},bar))));
    }
    const axis=h('div',{class:'rl-axis'});
    rowsBox.append(h('div',{class:'rl-row rl-axisrow'},h('div',{class:'rl-name'}),axis,h('div',{class:'rl-gauge'})));
    const legend=h('div',{class:'rl-legend'},h('span',null,h('i',{style:{background:ctx.colors.ok}}),'放行（每 0.5 秒一格，柱越高请求越多）'),h('span',null,h('i',{style:{background:ctx.colors.bad}}),'拒绝'),h('span',null,h('i',{style:{background:'none',border:'1px dashed #7d8b83'}}),'窗口边界'));
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
      // 窗口边界与“现在”
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
      axis.append(h('span',{style:{left:nowX/(NB*10)*100+'%',color:ctx.colors.info,fontWeight:'650'}},'现在'));
      const g=gauges(t);
      for(const a of ALG){const [v,max,txt]=g[a.key];gaugeEls[a.key].txt.textContent=txt;gaugeEls[a.key].bar.style.width=(max?util.clamp(v/max,0,1)*100:0)+'%'}
      arrCount.textContent='共 '+hist.arr.length+' 个';
      const rows=ALG.map(a=>{const hs=hist[a.key],passed=hs.pass.filter(x=>x<=t);const w=hs.wait.length?hs.wait.reduce((s,x)=>s+x,0)/hs.wait.length:0;return [a,passed.length,hs.rej.length,peak(passed),w]});
      const key=rows.map(r=>r.slice(1).join(',')).join('|')+P.L;
      if(key!==lastTableKey){
        lastTableKey=key;
        table.replaceChildren(h('thead',null,h('tr',null,h('th',null,'算法'),h('th',null,'已放行'),h('th',null,'已拒绝'),h('th',{title:'任意连续 W 秒内的最大放行数'},'任意 '+P.W+' 秒内最多放行'),h('th',null,'平均排队'))),
          h('tbody',null,rows.map(([a,p,r,pk,w])=>h('tr',null,h('td',null,a.name),h('td',null,p),h('td',null,r),h('td',{style:{color:pk>P.L?ctx.colors.bad:null,fontWeight:pk>P.L?'700':null}},pk+(pk>P.L?'（超过配额 '+P.L+'）':'')),h('td',null,a.key==='lb'?w.toFixed(1)+' 秒':'—')))));
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

    /* ---- 预设场景：都从一个窗口的起点开始，便于手算 ---- */
    async function prepare(opts){
      Object.assign(P,{L:10,W:10,C:10,Q:5,speed:1},opts);
      sL.set(P.L,true);sW.set(P.W,true);sC.set(P.C,true);sQ.set(P.Q,true);
      pattern.set('manual');speed.set(1,true);
      t=Math.ceil((t+0.001)/P.W)*P.W;script=[];resetState();lastTableKey='';draw();
      return t;
    }
    const at=(base,sec,n,gap=0.03)=>{for(let i=0;i<n;i++)script.push(base+sec+i*gap)};
    ctx.scenarios([
      {id:'boundary',label:'窗口边界突发',
        ask:'配额是每 10 秒 10 次。第 9.6 秒来 10 个请求，第 10.1 秒（下一个窗口刚开始）再来 10 个。固定窗口一共放行几个？滑动日志呢？',
        insight:'固定窗口两批全放行：约 0.8 秒内通过 20 个，是配额的 2 倍。两个日历窗口各自都没超额，它本来就不保证「任意连续 10 秒」。滑动日志第二批全部拒绝。滑动窗口计数按上一窗口的比例估算，只多放了 1 个（近似误差）。令牌桶第一批用光了令牌，第二批只能等补充。',
        async run(){const b=await prepare({});at(b,9.6,10);at(b,10.1,10);await ctx.wait(12500)}},
      {id:'idle-burst',label:'空闲后的大突发',
        ask:'桶容量 10、每秒补 1 个令牌。系统空闲了很久，然后瞬间来 25 个请求。令牌桶放行几个？漏桶（队列 5）呢？',
        insight:'令牌桶立刻放行 10 个：空闲再久，令牌也只攒到容量为止，所以容量决定「能突发多少」。漏桶立即处理 1 个，再接住 5 个进队列，按每秒 1 个匀速放出（最后一个要等 5 秒），其余被拒。它输出最平滑，代价是排队延迟。',
        async run(){const b=await prepare({});at(b,2,25,0.02);await ctx.wait(9000)}},
      {id:'sustained',label:'持续两倍超速',
        ask:'请求以两倍速率持续到来（每秒约 2 个，配额每秒 1 个）。跑 30 秒后，各算法的放行总数会差很多吗？',
        insight:'长期看都接近「每秒 1 个」：五种算法的长期速率一样。令牌桶多出的约 10 个，来自开始时满桶的突发额度；看「任意 10 秒内最多放行」一列，固定窗口和滑动窗口计数也会在边界附近略超配额。选算法看的是下游能承受多大的瞬时冲击、能否接受等待。',
        async run(){await prepare({});pattern.set('over');speed.set(2);await ctx.wait(15000);pattern.set('manual',true);P.pattern='manual'}},
    ]);
  }
});

/* ---------------- 实验二：两台网关抢最后一个名额 ---------------- */
SDLab.define({
  id:'rate-limiter-race',chapter:4,
  title:'两台网关抢最后一个名额',
  summary:'配额 10 次，Redis 里已记了 9 次。网关 A、B 几乎同时各收到一个请求。逐步执行，看不同写法会不会超发。',
  caveat:'每一步代表一次与 Redis 的往返或一次本地判断；「交错」表示两台网关的步骤轮流执行。跨地区场景用两个 Redis 与固定复制延迟表示异步同步。',
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
      naive:{label:'先 GET 再判断，最后 INCR',steps:who=>[
        {who,op:'GET quota:user',do:s=>{s.seen[who]=s.redis;return `读到 ${s.redis}`}},
        {who,op:'本地判断',do:s=>{const ok=s.seen[who]<s.limit;s.ok[who]=ok;return ok?`${s.seen[who]} < ${s.limit}，放行`:`${s.seen[who]} ≥ ${s.limit}，拒绝`},local:true},
        {who,op:'INCR quota:user',do:s=>{if(!s.ok[who])return '已拒绝，不写入';s.redis++;return `计数变为 ${s.redis}`}},
      ]},
      incr:{label:'先 INCR，再看返回值',steps:who=>[
        {who,op:'INCR quota:user',do:s=>{s.redis++;s.seen[who]=s.redis;return `返回 ${s.redis}`}},
        {who,op:'本地判断',do:s=>{const ok=s.seen[who]<=s.limit;s.ok[who]=ok;return ok?`${s.seen[who]} ≤ ${s.limit}，放行`:`${s.seen[who]} > ${s.limit}，拒绝`},local:true},
      ]},
      lua:{label:'Lua 脚本：清理、计数、判断、写入一次完成',steps:who=>[
        {who,op:'EVAL 限流脚本',atomic:true,do:s=>{const ok=s.redis<s.limit;s.ok[who]=ok;if(ok)s.redis++;return ok?`脚本内计数 ${s.redis-1} < ${s.limit}，写入并放行`:`脚本内计数 ${s.redis} ≥ ${s.limit}，拒绝`}},
      ]},
      geo:{label:'两个地区各有 Redis，异步互相同步',steps:who=>[
        {who,op:`INCR（本地区 Redis ${who}）`,do:s=>{s.local[who]++;s.seen[who]=s.local[who];return `本地区返回 ${s.local[who]}`}},
        {who,op:'本地判断',do:s=>{const ok=s.seen[who]<=s.limit;s.ok[who]=ok;return ok?`${s.seen[who]} ≤ ${s.limit}，放行`:'拒绝'},local:true},
        {who,op:'异步复制到对端',do:s=>{s.pending++;return '稍后才到对端'},local:true},
      ]},
    };
    let mode='naive',interleave=true,steps=[],idx=0,S=null,cells=[];
    const grid=h('div',{class:'rr-grid',role:'table','aria-label':'执行步骤'});
    const verdict=h('p',{class:'sdl-note',style:{fontSize:'14px',margin:'10px 0 0'}});
    ctx.stage.append(grid,verdict);
    ctx.onResize(w=>{const n=w<560;if(n!==grid.classList.contains('rr-narrow')){grid.classList.toggle('rr-narrow',n);const hd=grid.querySelector('.hd.ha');if(hd)hd.textContent=n?'网关 A / B':'网关 A'}});
    const stats=ctx.stats([{key:'redis',label:'Redis 中的计数'},{key:'pass',label:'本轮放行'},{key:'rej',label:'本轮拒绝'},{key:'over',label:'超发'}]);
    const modeCtl=ctx.segmented({label:'写法',value:mode,wide:true,options:Object.entries(MODES).map(([k,v])=>[k,v.label]),onChange:v=>{mode=v;build()}});
    const orderCtl=ctx.segmented({label:'执行顺序',value:'inter',options:[['inter','交错（A1 B1 A2 B2…）'],['serial','A 全部做完再轮到 B']],onChange:v=>{interleave=v==='inter';build()}});
    const nextBtn=ctx.button('下一步',()=>step(),{primary:true});
    ctx.button('自动播放',()=>autoplay());
    ctx.button('从头开始',()=>build());

    function build(){
      S={redis:9,limit:10,seen:{},ok:{},local:{A:9,B:9},pending:0};
      const A=MODES[mode].steps('A'),B=MODES[mode].steps('B');
      steps=[];
      if(MODES[mode].steps('A')[0].atomic){steps=[A[0],B[0]]}
      else if(interleave){for(let i=0;i<Math.max(A.length,B.length);i++){if(A[i])steps.push(A[i]);if(B[i])steps.push(B[i])}}
      else steps=[...A,...B];
      idx=0;grid.replaceChildren(h('div',{class:'hd ha'},grid.classList.contains('rr-narrow')?'网关 A / B':'网关 A'),h('div',{class:'hd hr'},mode==='geo'?'Redis（A 区 / B 区）':'Redis'),h('div',{class:'hd hb'},'网关 B'));
      cells=steps.map((st,i)=>{
        const a=h('div',{class:'a future',style:{'--r':i+2}}),r=h('div',{class:'redis future',style:{'--r':i+2}}),b=h('div',{class:'b future',style:{'--r':i+2}});
        const side=st.who==='A'?a:b;
        side.append(h('span',{class:'sdl-tag'+(st.atomic?' info':'')},`${st.who}${i+1}`),h('span',null,st.op));
        grid.append(a,r,b);return {a,r,b,side};
      });
      verdict.textContent=mode==='lua'?'脚本在 Redis 内串行执行：B 的脚本要等 A 的脚本整段跑完。':'点击「下一步」逐步执行。';
      nextBtn.disabled=false;orderCtl.el.style.opacity=mode==='lua'?.5:1;
      update();
    }
    function redisText(){return mode==='geo'?`A区 ${S.local.A} / B区 ${S.local.B}`:String(S.redis)}
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
          naive:over?'两台网关都读到 9，都判断「还有名额」，结果放行 2 个、超发 1 个。GET、判断、INCR 是三次独立操作，中间可以被别人插队。':'顺序执行时没有超发，但只要两台网关的步骤交错就会出问题；线上无法保证顺序。',
          incr:'INCR 本身是原子的：只有一台网关拿到 10，另一台拿到 11 被拒。这里被拒的请求也让计数变成 11；若要保存精确的放行数，可以在判断失败时回退，或改用脚本。',
          lua:'脚本整体原子执行，B 的脚本看到的是 A 写入后的计数，因此只放行 1 个。注意：这种原子性只覆盖同一个 Redis 实例上的数据。',
          geo:'每个地区的 Redis 都以为自己还剩 1 个名额，全局放行 2 个、超发 1 个。异步同步降低了延迟，却会暂时超发全局配额；要严格就得集中协调，或预先把额度分给各地区。',
        };
        verdict.textContent=msgs[mode];
        ctx.announce(verdict.textContent);
      }
    }
    async function autoplay(){build();while(idx<steps.length){step();await ctx.wait(700)}}
    build();

    ctx.scenarios([
      {id:'naive',label:'非原子写法交错执行',ask:'两台网关都按「GET → 判断 → INCR」处理，且步骤交错。会放行几个？',insight:'放行 2 个，超发 1 个。竞态就藏在「读」和「写」之间的空隙里。',async run(){modeCtl.set('naive',true);mode='naive';orderCtl.set('inter',true);interleave=true;await autoplay()}},
      {id:'incr',label:'改成原子 INCR',ask:'同样交错执行，但先 INCR 再看返回值，会怎样？',insight:'只放行 1 个。判断依据来自原子操作的返回值，不再是一份可能过期的读取结果。',async run(){modeCtl.set('incr',true);mode='incr';orderCtl.set('inter',true);interleave=true;await autoplay()}},
      {id:'lua',label:'滑动日志用 Lua 脚本',ask:'滑动日志要「清理旧记录 → 计数 → 判断 → 写入」四步。放进一个 Lua 脚本后还会超发吗？',insight:'不会。整段脚本在 Redis 内串行执行，中间没有空隙。单靠 sorted set 不等于原子。',async run(){modeCtl.set('lua',true);mode='lua';await autoplay()}},
      {id:'geo',label:'跨地区各自计数',ask:'为了降低延迟，两个地区各用本地 Redis 计数、异步同步。每个地区都以为只用了 9 次，会怎样？',insight:'全局超发。低延迟与严格全局配额之间要取舍。',async run(){modeCtl.set('geo',true);mode='geo';orderCtl.set('inter',true);interleave=true;await autoplay()}},
    ]);
  }
});
})();
