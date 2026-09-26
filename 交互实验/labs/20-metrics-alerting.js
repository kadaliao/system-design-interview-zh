/* 第 20 章：指标监控与告警。实验一：阈值 + 持续时长的告警状态机；实验二：降采样与分层保留。 */
(function(){
const {el:h,util}=SDLab;
let uid=0;
const until=async(ctx,cond)=>{let n=0;while(!cond()&&n<1200){await ctx.wait(50);n++}};
const hhmmss=s=>{const m=Math.floor(s/60),x=s%60;return `19:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`};
const secs=s=>s>=60?Math.floor(s/60)+' 分'+(s%60?' '+s%60+' 秒':'钟'):s+' 秒';

/* ---------------- 实验一：告警规则 ---------------- */
SDLab.define({
  id:'alert-rule',chapter:20,
  title:'告警规则：阈值加持续时长',
  summary:'一台主机 30 分钟的 CPU 指标，每 10 秒一个点。规则是「CPU 超过阈值，并持续一段时间才告警」。拖动阈值和持续时长，看尖峰会不会把人叫醒、真实过载多久才被发现，以及主机失联不再上报时规则会怎样。',
  caveat:'规则随每个新数据点评估一次，不考虑评估周期与采集时间的错位；缺数据时表达式没有结果，按 Prometheus 的做法视为条件不成立。通知只在状态变化时发送，不模拟重复提醒、分组与静默。「实际情况」是模拟时预先设定的真值，现实里要靠事后复盘才知道。',
  mount(ctx){
    ctx.css('al',`
.al-head{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:13px;margin-bottom:6px}
.al-rule{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;background:#f0f4ed;border-radius:6px;padding:2px 8px;color:#23352f}
.al-state{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.al-state .sdl-tag{font-size:13px}
.al-legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:#66756d;margin:4px 0 8px}
.al-legend i{display:inline-block;width:12px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.al-notes{border:1px solid #dbe2da;border-radius:10px;background:#fbfcfa;padding:6px 10px;font-size:12.5px}
.al-notes b{font-size:12px;color:#66756d}
.al-notes ol{list-style:none;margin:4px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:2px 14px}
.al-notes li{font-variant-numeric:tabular-nums;white-space:nowrap}
.al-notes .fire{color:#9b2c27;font-weight:650}.al-notes .res{color:#1d6a41;font-weight:650}
`);
    const C=ctx.colors,N=180,STEP=10,id=++uid;
    const P={ds:'spiky',T:80,fr:60,noise:4,absent:false};
    let data,truth,tlabel,R1,R2,c=N-1,speed=0,W=600,G=null,lastI=-1;
    function gen(){
      const r=util.rng(P.ds==='spiky'?20:21),sig=P.noise,v=[];
      for(let i=0;i<N;i++)v.push(52+6*Math.sin(i/17)+r.normal()*sig);
      const set=(i,x,j)=>{v[i]=x+r.normal()*sig*j};
      if(P.ds==='spiky'){
        for(const [a,n,x] of [[18,2,89],[41,1,93],[63,3,86],[150,2,91],[166,1,88]])for(let k=0;k<n;k++)set(a+k,x,0.4);
        for(let i=90;i<=125;i++)set(i,88,0.5);
        v[76]=null;truth=[[90,125]];tlabel='真实过载 6 分钟';
      }else{
        for(let i=100;i<=130;i++)set(i,Math.min(96,68+(i-100)*2.4),0.4);
        for(let i=131;i<N;i++)v[i]=null;truth=[[105,N-1]];tlabel='过载，随后失联';
      }
      data=v.map(x=>x==null?null:util.clamp(x,1,100));
    }
    /* 状态机：条件成立 → pending；持续满 for → firing（发告警）；条件不成立时 firing → 发恢复，回到 inactive。 */
    function evalRule(cond){
      const st=new Array(N),ev=[];let s='inactive',since=0;
      for(let i=0;i<N;i++){
        if(cond(i)){if(s==='inactive'){s='pending';since=i}if(s==='pending'&&(i-since)*STEP>=P.fr){s='firing';ev.push({i,k:'fire'})}}
        else{if(s==='firing')ev.push({i,k:'res'});s='inactive'}
        st[i]=s;
      }
      return {st,ev,since};
    }
    function recompute(){
      R1=evalRule(i=>data[i]!=null&&data[i]>P.T);R2=evalRule(i=>data[i]==null);
      const tag=(ev,name)=>ev.map((e,j)=>{
        const end=e.k==='fire'?(ev.slice(j+1).find(x=>x.k==='res')||{i:N}).i-1:e.i;
        const inT=truth.some(([a,b])=>e.k==='fire'?e.i<=b&&end>=a:e.i>a&&e.i<=b);
        return {...e,r:name,bad:e.k==='fire'?!inT:inT};
      });
      R1.all=tag(R1.ev,'cpu_high');R2.all=tag(R2.ev,'数据缺失');
    }
    const events=()=>[...R1.all,...(P.absent?R2.all:[])].sort((a,b)=>a.i-b.i||(a.r<b.r?-1:1));

    /* ---- 舞台 ---- */
    const rule=h('span',{class:'al-rule'}),state=h('span',{class:'al-state'});
    const head=h('div',{class:'al-head'},rule,state);
    const svgBox=h('div');
    const lg=(bg,txt)=>h('span',null,h('i',{style:{background:bg}}),txt);
    const legend=h('div',{class:'al-legend'},lg(C.warnSoft,'pending：已超阈值，未满持续时长'),lg(C.bad,'firing：告警中'),h('span',null,h('b',{style:{color:C.bad}},'▼'),' 发出告警'),h('span',null,h('b',{style:{color:C.ok}},'▲'),' 发出恢复'),lg('#dfe3de','无数据'));
    const notesList=h('ol'),notesHead=h('b');
    const notes=h('div',{class:'al-notes'},notesHead,notesList);
    ctx.stage.append(head,svgBox,legend,notes);
    const st=ctx.stats([{key:'n',label:'已发通知'},{key:'fa',label:'误报'},{key:'det',label:'发现过载用时'},{key:'wr',label:'错误的恢复通知'}]);

    const S=(t,a,...k)=>ctx.svgEl(t,a,...k);
    function build(){
      const narrow=W<520,x0=narrow?62:78,x1=W-12,cw=x1-x0,top=26,CH=narrow?120:150;
      const X=i=>x0+i/(N-1)*cw,Y=v=>top+CH-v/100*CH;
      const yT=top+CH+30,yR1=yT+24,yR2=yR1+24,H=(P.absent?yR2:yR1)+26;
      const svg=S('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'CPU 指标曲线、阈值与告警状态时间线'});
      const clipId='al-clip-'+id,clip=S('rect',{x:x0,y:0,width:0,height:H});
      svg.append(S('defs',null,S('clipPath',{id:clipId},clip)));
      svg.append(S('rect',{x:x0,y:top,width:cw,height:CH,fill:'#fbfcfa',stroke:C.line}));
      for(const v of [0,50,100]){svg.append(S('line',{x1:x0,x2:x1,y1:Y(v),y2:Y(v),stroke:'#e3e9e1','stroke-dasharray':v%100?'3 3':null}));svg.append(S('text',{x:x0-6,y:Y(v)+4,'text-anchor':'end','font-size':12,fill:C.muted},v+'%'))}
      const every=narrow?60:30;for(let i=0;i<N;i+=every)svg.append(S('text',{x:X(i),y:top+CH+16,'text-anchor':i?'middle':'start','font-size':12,fill:C.muted},hhmmss(i*STEP).slice(0,5)));
      // 缺数据区间
      for(let i=0;i<N;i++)if(data[i]==null){let j=i;while(j+1<N&&data[j+1]==null)j++;const a=X(Math.max(0,i-0.5)),b=X(Math.min(N-1,j+0.5));svg.append(S('rect',{x:a,y:top,width:Math.max(2,b-a),height:CH,fill:'#dfe3de'}));if(b-a>60)svg.append(S('text',{x:(a+b)/2,y:top+CH/2,'text-anchor':'middle','font-size':12,fill:C.muted},'无数据'));i=j}
      // 曲线（按当前播放位置裁剪）
      let d='',pen=false;for(let i=0;i<N;i++){if(data[i]==null){pen=false;continue}d+=(pen?'L':'M')+X(i).toFixed(1)+' '+Y(data[i]).toFixed(1);pen=true}
      const gClip=S('g',{'clip-path':`url(#${clipId})`});
      gClip.append(S('path',{d,fill:'none',stroke:C.series[0],'stroke-width':1.6,'stroke-linejoin':'round'}));
      svg.append(gClip);
      const ty=Y(P.T);svg.append(S('line',{x1:x0,x2:x1,y1:ty,y2:ty,stroke:C.bad,'stroke-width':1.3,'stroke-dasharray':'6 4'}));
      svg.append(S('text',{x:x1-4,y:ty-5,'text-anchor':'end','font-size':12,fill:C.bad,'font-weight':650,stroke:'#fbfcfa','stroke-width':4,'paint-order':'stroke'},'阈值 '+P.T+'%'));
      // 时间线：实际情况、规则状态
      const strip=(y,label,sub)=>{svg.append(S('text',{x:x0-6,y:y+4,'text-anchor':'end','font-size':12,fill:C.ink,'font-weight':650},label));if(sub)svg.append(S('text',{x:x0-6,y:y+17,'text-anchor':'end','font-size':11,fill:C.muted},sub));svg.append(S('rect',{x:x0,y:y-7,width:cw,height:14,rx:3,fill:'#eef1ec'}))};
      strip(yT,'实际情况');
      for(const [a,b] of truth){const xa=X(a-0.5),xb=X(Math.min(N-1,b+0.5));svg.append(S('rect',{x:xa,y:yT-7,width:xb-xa,height:14,rx:3,fill:'#b8477a',opacity:.8}));if(xb-xa>100)svg.append(S('text',{x:(xa+xb)/2,y:yT+4,'text-anchor':'middle','font-size':11,fill:'#fff','font-weight':650},tlabel))}
      const rules=[[R1,yR1,'cpu_high']];if(P.absent)rules.push([R2,yR2,'数据缺失']);
      const gStrips=S('g',{'clip-path':`url(#${clipId})`});
      for(const [R,y,name] of rules){
        strip(y,name);
        for(let i=0;i<N;i++){const s=R.st[i];if(s==='inactive')continue;let j=i;while(j+1<N&&R.st[j+1]===s)j++;const xa=X(i-0.5),xb=X(Math.min(N-1,j+0.5));gStrips.append(S('rect',{x:Math.max(x0,xa),y:y-7,width:Math.max(2,xb-Math.max(x0,xa)),height:14,fill:s==='firing'?C.bad:C.warnSoft,stroke:s==='firing'?null:C.warn,'stroke-width':s==='firing'?null:.8}));i=j}
        for(const e of R.all){const x=X(e.i-0.5);gStrips.append(e.k==='fire'?S('path',{d:`M${x-5} ${y-16}L${x+5} ${y-16}L${x} ${y-8}Z`,fill:C.bad}):S('path',{d:`M${x-5} ${y-8}L${x+5} ${y-8}L${x} ${y-16}Z`,fill:C.ok}))}
      }
      svg.append(gStrips);
      const cur=S('line',{y1:top-4,y2:H-6,stroke:C.info,'stroke-width':1.5});
      const curT=S('text',{y:top-9,'font-size':12,fill:C.info,'font-weight':650});
      const dot=S('circle',{r:4,fill:C.info,stroke:'#fff','stroke-width':1.5});
      svg.append(cur,curT,dot);
      svgBox.replaceChildren(svg);
      G={X,Y,clip,cur,curT,dot,x0,x1};lastI=-1;
    }
    function draw(){
      if(!G)return;
      const i=Math.floor(c+1e-9),x=G.X(c);
      G.clip.setAttribute('width',Math.max(0,G.X(i+0.5)-G.x0));
      ctx.attr(G.cur,{x1:x,x2:x});
      const lbl=hhmmss(i*STEP);ctx.attr(G.curT,{x:Math.min(Math.max(x,G.x0+30),G.x1-30),'text-anchor':'middle',text:'现在 '+lbl});
      if(data[i]==null)G.dot.setAttribute('display','none');else ctx.attr(G.dot,{display:null,cx:G.X(i),cy:G.Y(data[i])});
      if(i===lastI)return;lastI=i;
      // 当前状态
      const s=R1.st[i];let since=i;while(since>0&&R1.st[since-1]===s)since--;
      const tone=s==='firing'?'bad':s==='pending'?'warn':null;
      const tags=[h('span',{class:'sdl-tag'+(tone?' '+tone:'')},'cpu_high：'+s),h('span',{class:'sdl-note',style:{margin:0}},s==='inactive'?(data[i]==null?'这一刻没有数据，条件不成立':'当前 CPU '+Math.round(data[i])+'%'):`已持续 ${secs((i-since+1)*STEP)}`+(s==='pending'?`，满 ${secs(P.fr)} 才告警`:''))];
      if(P.absent){const s2=R2.st[i];tags.push(h('span',{class:'sdl-tag'+(s2==='firing'?' bad':s2==='pending'?' warn':'')},'数据缺失：'+s2))}
      state.replaceChildren(...tags);
      // 通知与统计
      const ev=events().filter(e=>e.i<=i);
      const fires=ev.filter(e=>e.k==='fire'),fa=fires.filter(e=>e.bad).length,wr=ev.filter(e=>e.k==='res'&&e.bad).length;
      const hit=fires.find(e=>!e.bad);const det=hit?(hit.i-truth.find(([a,b])=>hit.i>=a-1&&hit.i<=b+1)[0])*STEP:null;
      notesHead.textContent=ev.length?`通知记录（共 ${ev.length} 条，最新在前）`:'通知记录：还没有发出通知';
      notesList.replaceChildren(...ev.slice(W<520?-5:-8).reverse().map(e=>h('li',null,hhmmss(e.i*STEP)+' ',h('span',{class:e.k==='fire'?'fire':'res'},e.k==='fire'?'告警':'恢复'),' '+e.r+(e.bad?(e.k==='fire'?'（误报）':'（主机其实没恢复）'):''))));
      st.set('n',ev.length,ev.length>6?'warn':null);st.set('fa',fa,fa?'bad':'ok');st.set('det',det==null?(truth.some(([a])=>a<=i)?'未发现':'—'):secs(Math.max(0,det)),det==null?(truth.some(([a])=>a<=i)?'bad':null):det>120?'warn':'ok');st.set('wr',wr,wr?'bad':null);
      rule.textContent=`alert: cpu_high  expr: cpu > ${P.T}  for: ${P.fr>=60?P.fr/60+'m':P.fr+'s'}`;
    }
    function refresh(rebuild){gen();recompute();if(rebuild!==false)build();draw()}

    /* ---- 控件 ---- */
    const dsCtl=ctx.select({label:'数据',value:P.ds,options:[['spiky','短尖峰 + 一次过载'],['down','过载后主机失联']],onChange:v=>{P.ds=v;refresh()}});
    const sT=ctx.slider({label:'阈值',min:60,max:95,value:P.T,format:v=>v+'%',onInput:v=>{P.T=v;recompute();build();draw()}});
    const forCtl=ctx.segmented({label:'持续时长 for',value:P.fr,options:[[0,'0'],[30,'30s'],[60,'1m'],[120,'2m'],[300,'5m']],onChange:v=>{P.fr=v;recompute();build();draw()}});
    const sN=ctx.slider({label:'噪声（标准差）',min:0,max:10,value:P.noise,format:v=>v+' 个百分点',onChange:v=>{P.noise=v;refresh()}});
    const tAbs=ctx.toggle({label:'另设「数据缺失」规则（absent，同样的持续时长）',value:P.absent,onChange:v=>{P.absent=v;recompute();build();draw()}});
    const playCtl=ctx.segmented({label:'播放',value:0,options:[[0,'暂停'],[1,'1×'],[3,'3×']],onChange:v=>setSpeed(v)});
    ctx.button('从头播放',()=>{c=0;setSpeed(1);draw()},{primary:true});
    let acc=0;
    const lp=ctx.loop(dt=>{c=Math.min(N-1,c+dt*15*speed);acc+=dt;if(acc>=1/30||c>=N-1){acc=0;draw()}if(c>=N-1)setSpeed(0)},false);
    function setSpeed(v){speed=v;playCtl.set(v,true);if(v){if(c>=N-1)c=0;lp.start()}else lp.stop()}
    gen();recompute();
    ctx.onResize(w=>{if(Math.abs(w-W)>2||!G){W=w;build();draw()}});

    function prepare(o){
      Object.assign(P,{ds:'spiky',T:80,fr:60,noise:4,absent:false},o);
      dsCtl.set(P.ds,true);sT.set(P.T,true);forCtl.set(P.fr,true);sN.set(P.noise,true);tAbs.set(P.absent,true);
      refresh();c=0;setSpeed(1);draw();
    }
    const done=()=>c>=N-1;
    ctx.scenarios([
      {id:'for0',label:'不设持续时长',
        ask:'阈值 80%，for=0（一超过就告警）。这 30 分钟里有 5 次 10–30 秒的尖峰，还有 1 次 6 分钟的真实过载。一共会发出几条通知？几次是误报？',
        insight:'发出 12 条通知：6 次告警、6 次恢复，其中 5 次告警是尖峰引起的误报，值班的人会被叫醒 5 次白跑。唯一的好处是真实过载一开始就被发现（用时 0 秒）。',
        async run(){prepare({fr:0});await until(ctx,done)}},
      {id:'for1m',label:'for：1 分钟',
        ask:'只把持续时长改成 1 分钟。尖峰还会触发告警吗？真实过载开始后多久才告警？',
        insight:'5 次尖峰都只停留在 pending（琥珀色），没满 1 分钟就回落，不发通知。真实过载在 1 分钟后转为 firing，结束时再发一次恢复，一共 2 条通知、0 次误报。代价是发现晚了 1 分钟。',
        async run(){prepare({fr:60});await until(ctx,done)}},
      {id:'for5m',label:'for：5 分钟',
        ask:'持续时长再加到 5 分钟，会更好吗？',
        insight:'依然没有误报，但真实过载 5 分钟后才告警，告警 1 分钟后过载就结束了。持续时长越长越能过滤抖动，发现也越晚；如果过载只持续 4 分钟，就会被完全漏掉。持续时长要按「能容忍多久没人管」来定。',
        async run(){prepare({fr:300});await until(ctx,done)}},
      {id:'absent',label:'主机失联：没数据就是健康？',
        ask:'主机 CPU 冲到 96% 后卡死，采集器再也拿不到数据。for=1 分钟。cpu_high 规则会一直告警吗？另设的「数据缺失」规则呢？',
        insight:'cpu_high 在过载 1 分钟后告警，可数据一断，表达式没有结果，它就当条件不成立，发出了一条「恢复」，而主机其实已经挂了。另设的「数据缺失」规则在断数据满 1 分钟后告警，才把问题接住。不能把「没有数据」默认为「健康」。',
        async run(){prepare({ds:'down',fr:60,absent:true});await until(ctx,done)}},
    ]);
  }
});

/* ---------------- 实验二：降采样与分层保留 ---------------- */
SDLab.define({
  id:'metrics-downsample',chapter:20,
  title:'降采样与分层保留：省了什么，丢了什么',
  summary:'上半部分把每 10 秒一个的原始点按窗口求平均，可以同时保留最大值；下半部分按本章的保留策略估算一年要存多少个点。',
  caveat:'窗口按半开区间 [起点, 起点+窗口) 对齐；存储只数数据点，不含标签索引、副本和压缩（时序库的差值编码会让每点远小于 16 字节）；分层按年龄区间划分为 0–7 天原始、7–30 天 1 分钟、30 天–1 年 1 小时。',
  mount(ctx){
    ctx.css('ds',`
.ds-formula{font-size:13px;min-height:22px;margin:4px 0 8px;font-variant-numeric:tabular-nums}
.ds-formula b{color:#2f6fb3}
.ds-bars{display:flex;flex-direction:column;gap:8px;margin-top:6px}
.ds-bar{display:grid;grid-template-columns:118px minmax(0,1fr);gap:8px;align-items:center;font-size:12.5px}
.ds-track{height:22px;background:#f0f4ed;border-radius:6px;overflow:hidden;display:flex}
.ds-track i{display:block;height:100%;transition:width .5s}
.ds-val{font-size:12px;color:#66756d;grid-column:2;margin-top:-4px;font-variant-numeric:tabular-nums}
.ds-sec{font-size:13px;font-weight:700;margin:14px 0 2px;color:#23352f}
.ds-legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:#66756d;margin-top:6px}
.ds-legend i{display:inline-block;width:12px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
@media(max-width:520px){.ds-bar{grid-template-columns:1fr}.ds-val{grid-column:1}}
`);
    const C=ctx.colors,id=++uid;
    /* 前 6 个点来自原文表格；后面补 5 分钟数据，其中有一次 20 秒尖峰。 */
    const RAW=[10,16,20,30,20,30,28,24,31,26,22,27,30,25,21,29,33,27,98,96,31,28,24,30,26,23,29,32,27,25,31,28,22,26,30,27];
    const N=RAW.length;
    const P={win:30,keepMax:false,series:1e7,bytes:16};
    let W=600,G=null,sweep=-1,sw=null;
    const wins=()=>{const k=P.win/10,out=[];for(let s=0;s<N;s+=k){const v=RAW.slice(s,s+k);out.push({s,e:s+v.length,avg:v.reduce((a,b)=>a+b,0)/v.length,max:Math.max(...v),v})}return out};
    const f2=x=>Number.isInteger(x)?String(x):x.toFixed(2);
    const S=(t,a,...k)=>ctx.svgEl(t,a,...k);

    const formula=h('div',{class:'ds-formula'});
    const svgBox=h('div');
    const legend=h('div',{class:'ds-legend'},h('span',null,h('i',{style:{background:C.series[0]}}),'原始点（10 秒一个）'),h('span',null,h('i',{style:{background:C.ok}}),'窗口平均'),h('span',null,h('i',{style:{background:C.bad}}),'窗口最大值（勾选后保存）'));
    const bars=h('div',{class:'ds-bars'});
    ctx.stage.append(h('div',{class:'ds-sec'},'① 降采样：把一个窗口里的点合成一个'),formula,svgBox,legend,h('div',{class:'ds-sec'},'② 分层保留：一条序列一年要存多少个点'),bars);
    const st=ctx.stats([{key:'pts',label:'降采样后点数'},{key:'peak',label:'尖峰那一窗显示'},{key:'ratio',label:'分层后点数约为原来的'},{key:'tb',label:'一年总量（分层）'}]);

    function build(){
      const narrow=W<520,x0=40,x1=W-10,cw=x1-x0,top=14,CH=narrow?150:170,H=top+CH+26;
      const X=i=>x0+(i+0.5)/N*cw,Y=v=>top+CH-v/100*CH;
      const svg=S('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'原始点与降采样结果'});
      svg.append(S('rect',{x:x0,y:top,width:cw,height:CH,fill:'#fbfcfa',stroke:C.line}));
      for(const v of [0,50,100]){svg.append(S('line',{x1:x0,x2:x1,y1:Y(v),y2:Y(v),stroke:'#e3e9e1','stroke-dasharray':v%100?'3 3':null}));svg.append(S('text',{x:x0-5,y:Y(v)+4,'text-anchor':'end','font-size':12,fill:C.muted},v))}
      for(let i=0;i<N;i+=narrow?12:6)svg.append(S('text',{x:x0+i/N*cw,y:top+CH+16,'text-anchor':i?'middle':'start','font-size':12,fill:C.muted},hhmmss(i*10).slice(0,5)));
      svg.append(S('line',{x1:x0,x2:x1,y1:Y(90),y2:Y(90),stroke:C.bad,'stroke-dasharray':'6 4',opacity:.7}),S('text',{x:x1-4,y:Y(90)-4,'text-anchor':'end','font-size':12,fill:C.bad,stroke:'#fbfcfa','stroke-width':4,'paint-order':'stroke'},'告警阈值 90%'));
      const hl=S('rect',{y:top,height:CH,fill:C.infoSoft,opacity:0});
      svg.append(hl);
      const gW=S('g'),gP=S('g');
      for(let i=0;i<N;i++)gP.append(S('circle',{cx:X(i),cy:Y(RAW[i]),r:narrow?2.6:3.2,fill:C.series[0]}));
      svg.append(gW,gP);
      svgBox.replaceChildren(svg);
      G={X,Y,x0,cw,top,CH,hl,gW,narrow};
      drawWins();
    }
    function drawWins(){
      if(!G)return;const {x0,cw,Y,gW,hl,top,CH}=G;gW.replaceChildren();
      const ws=wins(),dw=cw/N;
      ws.forEach((w,j)=>{
        if(sweep>=0&&j>sweep)return;
        const xa=x0+w.s*dw,xb=x0+w.e*dw;
        gW.append(S('line',{x1:xa,x2:xa,y1:top,y2:top+CH,stroke:'#cfd8cc','stroke-dasharray':'2 3'}));
        gW.append(S('line',{x1:xa+1,x2:xb-1,y1:Y(w.avg),y2:Y(w.avg),stroke:C.ok,'stroke-width':3}));
        if(P.keepMax)gW.append(S('line',{x1:xa+1,x2:xb-1,y1:Y(w.max),y2:Y(w.max),stroke:C.bad,'stroke-width':2,'stroke-dasharray':'5 3'}));
      });
      if(sweep>=0&&sweep<ws.length){const w=ws[sweep];ctx.attr(hl,{x:x0+w.s*dw,width:(w.e-w.s)*dw,opacity:.7})}else hl.setAttribute('opacity',0);
      const cur=sweep>=0&&sweep<ws.length?ws[sweep]:null;
      if(cur)formula.replaceChildren(`${hhmmss(cur.s*10)} 起的窗口：(`+cur.v.join('+')+`) / ${cur.v.length} = `,h('b',null,f2(cur.avg)),P.keepMax?`，最大值 ${cur.max}`:'');
      else if(P.win===30)formula.replaceChildren('前两个 30 秒窗口：(10+16+20)/3 = ',h('b',null,'15.33'),'，(30+20+30)/3 = ',h('b',null,'26.67'),'。原文表格写成 19 和 25，是算术错误。');
      else formula.replaceChildren(`每 ${P.win/60>=1?P.win/60+' 分钟':P.win+' 秒'}合成一个点，共 ${ws.length} 个。点击「逐窗计算」看每一步。`);
      const peak=ws.find(w=>w.s<=18&&w.e>18);
      st.set('pts',`${N} → ${ws.length}`);st.set('peak',peak?`平均 ${f2(peak.avg)}`+(P.keepMax?` / 最大 ${peak.max}`:''):'—',peak&&peak.avg<90&&!P.keepMax?'warn':'ok');
    }
    function drawStore(){
      const perDay=86400/10,raw=365*perDay,t1=7*perDay,t2=23*1440,t3=335*24,m=P.keepMax?2:1,tier=t1+m*(t2+t3);
      const tb=x=>util.bytes(x*P.series*P.bytes);
      const mk=(label,parts,total,note)=>h('div',{class:'ds-bar'},h('div',null,label),h('div',{class:'ds-track'},...parts.map(([v,col])=>h('i',{style:{width:(v/raw*100)+'%',background:col}}))),h('div',{class:'ds-val'},note));
      bars.replaceChildren(
        mk('原样保存一年',[[raw,C.series[0]]],raw,`${util.fmt(raw)} 点/序列 · ${tb(raw)}`),
        mk('分层保留',[[t1,C.series[0]],[m*t2,C.series[1]],[m*t3,C.series[4]]],tier,`${util.fmt(tier)} 点/序列 · ${tb(tier)}（原始 ${util.fmt(t1)} + 分钟级 ${util.fmt(m*t2)} + 小时级 ${util.fmt(m*t3)}${P.keepMax?'，平均与最大值各一份':''}）`),
        h('div',{class:'ds-legend'},h('span',null,h('i',{style:{background:C.series[0]}}),'0–7 天：原始 10 秒'),h('span',null,h('i',{style:{background:C.series[1]}}),'7–30 天：1 分钟'),h('span',null,h('i',{style:{background:C.series[4]}}),'30 天–1 年：1 小时')));
      st.set('ratio',util.pct(tier/raw,1)+`（省 ${Math.round(raw/tier)} 倍）`,'ok');st.set('tb',tb(tier),null);
    }

    const winCtl=ctx.segmented({label:'降采样窗口',value:P.win,options:[[30,'30 秒'],[60,'1 分钟'],[120,'2 分钟']],onChange:v=>{P.win=v;stopSweep();drawWins()}});
    const tMax=ctx.toggle({label:'同时保存窗口最大值',value:P.keepMax,onChange:v=>{P.keepMax=v;drawWins();drawStore()}});
    const sSer=ctx.slider({label:'序列数',min:1e6,max:2e7,step:1e6,value:P.series,format:v=>util.fmt(v/1e4)+' 万',onInput:v=>{P.series=v;drawStore()}});
    const sB=ctx.slider({label:'每个点的字节数',min:2,max:16,value:P.bytes,format:v=>v+' 字节',onInput:v=>{P.bytes=v;drawStore()},hint:'时间戳 8 + 数值 8，未压缩为 16'});
    ctx.button('逐窗计算',()=>{runSweep().catch(()=>{})},{primary:true});
    function stopSweep(){sweep=-1;if(sw)sw.cancel=true;sw=null}
    async function runSweep(){
      stopSweep();const me={cancel:false};sw=me;const n=wins().length;
      for(sweep=0;sweep<n;sweep++){drawWins();await ctx.wait(P.win===30?650:900);if(me.cancel)return}
      sweep=-1;sw=null;drawWins();
    }
    ctx.onResize(w=>{if(Math.abs(w-W)>2||!G){W=w;build()}});
    drawStore();

    function prepare(o){Object.assign(P,{win:30,keepMax:false,series:1e7,bytes:16},o);winCtl.set(P.win,true);tMax.set(P.keepMax,true);sSer.set(P.series,true);sB.set(P.bytes,true);stopSweep();drawWins();drawStore()}
    ctx.scenarios([
      {id:'text',label:'原文的 30 秒平均',
        ask:'原文 10 秒采样的 6 个点是 10、16、20、30、20、30。按 30 秒窗口 [00,30) 和 [30,60) 求平均，结果是多少？原文表格写的是 19 和 25。',
        insight:'第一个窗口 (10+16+20)/3 ≈ 15.33，第二个 (30+20+30)/3 ≈ 26.67，原文的 19 和 25 算错了。整段 6 分钟共 36 个原始点，按 30 秒降采样后剩 12 个。',
        async run(){prepare({win:30});const n=2;for(sweep=0;sweep<n;sweep++){drawWins();await ctx.wait(1600)}for(;sweep<wins().length;sweep++){drawWins();await ctx.wait(300)}sweep=-1;drawWins()}},
      {id:'spike',label:'20 秒的尖峰去哪了',
        ask:'19:03:00 起 CPU 有 20 秒冲到 98% 和 96%。降采样成 1 分钟平均后，这一分钟显示多少？如果告警阈值是 90%，还看得见这次尖峰吗？',
        insight:'这一分钟的平均只有约 51.17%（(98+96+31+28+24+30)/6），远低于 90%，尖峰被抹平了；原始点一旦删掉就再也恢复不出来。同时保存最大值后能看到 98，代价是降采样层的点数翻倍：一年总点数从原来的 3.2% 变成 4.5%。',
        async run(){prepare({win:60});await ctx.wait(1200);sweep=3;drawWins();await ctx.wait(2500);sweep=-1;P.keepMax=true;tMax.set(true,true);drawWins();drawStore();await ctx.wait(1800)}},
      {id:'store',label:'一年要存多少点',
        ask:'1000 万条序列，每 10 秒一个点。全部原样保存一年，和「7 天原始、30 天内 1 分钟、一年内 1 小时」分层保留相比，点数相差多少倍？',
        insight:'原样保存一年每条序列要 315 万个点，1000 万条、每点 16 字节约 505 TB；分层后每条约 10 万个点，只有原来的 3.2%（省约 31 倍），约 16 TB。省下的主要来自 30 天以后改为小时级。',
        async run(){prepare({});sSer.set(1e7,true);await ctx.wait(1500)}},
    ]);
  }
});
})();
