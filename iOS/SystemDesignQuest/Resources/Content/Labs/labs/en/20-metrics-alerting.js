/* Chapter 20: Metrics Monitoring and Alerting. Lab 1: the alert state machine (threshold + for-duration). Lab 2: downsampling and tiered retention. */
(function(){
const {el:h,util}=SDLab;
let uid=0;
const until=async(ctx,cond)=>{let n=0;while(!cond()&&n<1200){await ctx.wait(50);n++}};
const hhmmss=s=>{const m=Math.floor(s/60),x=s%60;return `19:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`};
const secs=s=>s>=60?Math.floor(s/60)+' min'+(s%60?' '+s%60+' s':''):s+' s';

/* ---------------- Lab 1: alert rules ---------------- */
SDLab.define({
  id:'alert-rule',chapter:20,
  title:'Alert Rules: Threshold Plus For-Duration',
  summary:'CPU metrics from one host over 30 minutes, one point every 10 seconds. The rule is “alert only when CPU stays above the threshold for a while.” Drag the threshold and the duration to see whether spikes wake someone up, how long a real overload takes to be noticed, and what the rule does when the host goes silent.',
  caveat:'The rule is evaluated once per new data point, ignoring any offset between evaluation and collection times. With no data the expression has no result, which, as in Prometheus, counts as the condition being false. Notifications go out only on state changes; repeat reminders, grouping, and silencing are not modeled. “Reality” is ground truth preset in the simulation; in real life you only learn it from a postmortem.',
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
        v[76]=null;truth=[[90,125]];tlabel='Overload 6 min';
      }else{
        for(let i=100;i<=130;i++)set(i,Math.min(96,68+(i-100)*2.4),0.4);
        for(let i=131;i<N;i++)v[i]=null;truth=[[105,N-1]];tlabel='Overload, then lost';
      }
      data=v.map(x=>x==null?null:util.clamp(x,1,100));
    }
    /* State machine: condition true -> pending; held for the full `for` -> firing (send alert); condition false while firing -> send resolve, back to inactive. */
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
      R1.all=tag(R1.ev,'cpu_high');R2.all=tag(R2.ev,'no_data');
    }
    const events=()=>[...R1.all,...(P.absent?R2.all:[])].sort((a,b)=>a.i-b.i||(a.r<b.r?-1:1));

    /* ---- stage ---- */
    const rule=h('span',{class:'al-rule'}),state=h('span',{class:'al-state'});
    const head=h('div',{class:'al-head'},rule,state);
    const svgBox=h('div');
    const lg=(bg,txt)=>h('span',null,h('i',{style:{background:bg}}),txt);
    const legend=h('div',{class:'al-legend'},lg(C.warnSoft,'pending: over threshold, for-duration not yet met'),lg(C.bad,'firing: alert active'),h('span',null,h('b',{style:{color:C.bad}},'▼'),' alert sent'),h('span',null,h('b',{style:{color:C.ok}},'▲'),' resolve sent'),lg('#dfe3de','No data'));
    const notesList=h('ol'),notesHead=h('b');
    const notes=h('div',{class:'al-notes'},notesHead,notesList);
    ctx.stage.append(head,svgBox,legend,notes);
    const st=ctx.stats([{key:'n',label:'Notifications sent'},{key:'fa',label:'False alarms'},{key:'det',label:'Time to detect overload'},{key:'wr',label:'Wrong resolve notices'}]);

    const S=(t,a,...k)=>ctx.svgEl(t,a,...k);
    function build(){
      const narrow=W<520,x0=narrow?62:78,x1=W-12,cw=x1-x0,top=26,CH=narrow?120:150;
      const X=i=>x0+i/(N-1)*cw,Y=v=>top+CH-v/100*CH;
      const yT=top+CH+30,yR1=yT+24,yR2=yR1+24,H=(P.absent?yR2:yR1)+26;
      const svg=S('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'CPU metric curve, threshold, and alert state timeline'});
      const clipId='al-clip-'+id,clip=S('rect',{x:x0,y:0,width:0,height:H});
      svg.append(S('defs',null,S('clipPath',{id:clipId},clip)));
      svg.append(S('rect',{x:x0,y:top,width:cw,height:CH,fill:'#fbfcfa',stroke:C.line}));
      for(const v of [0,50,100]){svg.append(S('line',{x1:x0,x2:x1,y1:Y(v),y2:Y(v),stroke:'#e3e9e1','stroke-dasharray':v%100?'3 3':null}));svg.append(S('text',{x:x0-6,y:Y(v)+4,'text-anchor':'end','font-size':12,fill:C.muted},v+'%'))}
      const every=narrow?60:30;for(let i=0;i<N;i+=every)svg.append(S('text',{x:X(i),y:top+CH+16,'text-anchor':i?'middle':'start','font-size':12,fill:C.muted},hhmmss(i*STEP).slice(0,5)));
      // gaps with no data
      for(let i=0;i<N;i++)if(data[i]==null){let j=i;while(j+1<N&&data[j+1]==null)j++;const a=X(Math.max(0,i-0.5)),b=X(Math.min(N-1,j+0.5));svg.append(S('rect',{x:a,y:top,width:Math.max(2,b-a),height:CH,fill:'#dfe3de'}));if(b-a>60)svg.append(S('text',{x:(a+b)/2,y:top+CH/2,'text-anchor':'middle','font-size':12,fill:C.muted},'No data'));i=j}
      // curve (clipped to the current playback position)
      let d='',pen=false;for(let i=0;i<N;i++){if(data[i]==null){pen=false;continue}d+=(pen?'L':'M')+X(i).toFixed(1)+' '+Y(data[i]).toFixed(1);pen=true}
      const gClip=S('g',{'clip-path':`url(#${clipId})`});
      gClip.append(S('path',{d,fill:'none',stroke:C.series[0],'stroke-width':1.6,'stroke-linejoin':'round'}));
      svg.append(gClip);
      const ty=Y(P.T);svg.append(S('line',{x1:x0,x2:x1,y1:ty,y2:ty,stroke:C.bad,'stroke-width':1.3,'stroke-dasharray':'6 4'}));
      svg.append(S('text',{x:x1-4,y:ty-5,'text-anchor':'end','font-size':12,fill:C.bad,'font-weight':650,stroke:'#fbfcfa','stroke-width':4,'paint-order':'stroke'},'Threshold '+P.T+'%'));
      // timelines: reality and rule state
      const strip=(y,label,sub)=>{svg.append(S('text',{x:x0-6,y:y+4,'text-anchor':'end','font-size':12,fill:C.ink,'font-weight':650},label));if(sub)svg.append(S('text',{x:x0-6,y:y+17,'text-anchor':'end','font-size':11,fill:C.muted},sub));svg.append(S('rect',{x:x0,y:y-7,width:cw,height:14,rx:3,fill:'#eef1ec'}))};
      strip(yT,'Reality');
      for(const [a,b] of truth){const xa=X(a-0.5),xb=X(Math.min(N-1,b+0.5));svg.append(S('rect',{x:xa,y:yT-7,width:xb-xa,height:14,rx:3,fill:'#b8477a',opacity:.8}));if(xb-xa>100)svg.append(S('text',{x:(xa+xb)/2,y:yT+4,'text-anchor':'middle','font-size':11,fill:'#fff','font-weight':650},tlabel))}
      const rules=[[R1,yR1,'cpu_high']];if(P.absent)rules.push([R2,yR2,'no_data']);
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
      const lbl=hhmmss(i*STEP);ctx.attr(G.curT,{x:Math.min(Math.max(x,G.x0+44),G.x1-44),'text-anchor':'middle',text:'Now '+lbl});
      if(data[i]==null)G.dot.setAttribute('display','none');else ctx.attr(G.dot,{display:null,cx:G.X(i),cy:G.Y(data[i])});
      if(i===lastI)return;lastI=i;
      // current state
      const s=R1.st[i];let since=i;while(since>0&&R1.st[since-1]===s)since--;
      const tone=s==='firing'?'bad':s==='pending'?'warn':null;
      const tags=[h('span',{class:'sdl-tag'+(tone?' '+tone:'')},'cpu_high: '+s),h('span',{class:'sdl-note',style:{margin:0}},s==='inactive'?(data[i]==null?'No data at this moment, so the condition is false':'Current CPU '+Math.round(data[i])+'%'):`In this state for ${secs((i-since+1)*STEP)}`+(s==='pending'?`; fires after ${secs(P.fr)}`:''))];
      if(P.absent){const s2=R2.st[i];tags.push(h('span',{class:'sdl-tag'+(s2==='firing'?' bad':s2==='pending'?' warn':'')},'no_data: '+s2))}
      state.replaceChildren(...tags);
      // notifications and stats
      const ev=events().filter(e=>e.i<=i);
      const fires=ev.filter(e=>e.k==='fire'),fa=fires.filter(e=>e.bad).length,wr=ev.filter(e=>e.k==='res'&&e.bad).length;
      const hit=fires.find(e=>!e.bad);const det=hit?(hit.i-truth.find(([a,b])=>hit.i>=a-1&&hit.i<=b+1)[0])*STEP:null;
      notesHead.textContent=ev.length?`Notifications (${ev.length} in total, newest first)`:'Notifications: none sent yet';
      notesList.replaceChildren(...ev.slice(W<520?-5:-8).reverse().map(e=>h('li',null,hhmmss(e.i*STEP)+' ',h('span',{class:e.k==='fire'?'fire':'res'},e.k==='fire'?'Alert':'Resolved'),' '+e.r+(e.bad?(e.k==='fire'?' (false alarm)':' (host still down)'):''))));
      st.set('n',ev.length,ev.length>6?'warn':null);st.set('fa',fa,fa?'bad':'ok');st.set('det',det==null?(truth.some(([a])=>a<=i)?'Missed':'—'):secs(Math.max(0,det)),det==null?(truth.some(([a])=>a<=i)?'bad':null):det>120?'warn':'ok');st.set('wr',wr,wr?'bad':null);
      rule.textContent=`alert: cpu_high  expr: cpu > ${P.T}  for: ${P.fr>=60?P.fr/60+'m':P.fr+'s'}`;
    }
    function refresh(rebuild){gen();recompute();if(rebuild!==false)build();draw()}

    /* ---- controls ---- */
    const dsCtl=ctx.select({label:'Data',value:P.ds,options:[['spiky','Short spikes + one overload'],['down','Overload, then host lost']],onChange:v=>{P.ds=v;refresh()}});
    const sT=ctx.slider({label:'Threshold',min:60,max:95,value:P.T,format:v=>v+'%',onInput:v=>{P.T=v;recompute();build();draw()}});
    const forCtl=ctx.segmented({label:'Duration (for)',value:P.fr,options:[[0,'0'],[30,'30s'],[60,'1m'],[120,'2m'],[300,'5m']],onChange:v=>{P.fr=v;recompute();build();draw()}});
    const sN=ctx.slider({label:'Noise (std. dev.)',min:0,max:10,value:P.noise,format:v=>v+' pp',onChange:v=>{P.noise=v;refresh()}});
    const tAbs=ctx.toggle({label:'Add a “missing data” rule (absent, same for-duration)',value:P.absent,onChange:v=>{P.absent=v;recompute();build();draw()}});
    const playCtl=ctx.segmented({label:'Playback',value:0,options:[[0,'Paused'],[1,'1×'],[3,'3×']],onChange:v=>setSpeed(v)});
    ctx.button('Play from start',()=>{c=0;setSpeed(1);draw()},{primary:true});
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
      {id:'for0',label:'No for-duration',
        ask:'Threshold 80%, for=0 (alert the moment it goes over). Over these 30 minutes there are 5 spikes of 10–30 seconds and 1 real overload lasting 6 minutes. How many notifications go out, and how many are false alarms?',
        insight:'12 notifications go out: 6 alerts and 6 resolves, and 5 of the alerts are false alarms caused by spikes, so the on-call engineer is woken up 5 times for nothing. The only upside is that the real overload is noticed right away (0 seconds).',
        async run(){prepare({fr:0});await until(ctx,done)}},
      {id:'for1m',label:'for: 1 minute',
        ask:'Change only the duration to 1 minute. Do the spikes still trigger alerts? How long after the real overload starts does the alert fire?',
        insight:'All 5 spikes stay in pending (amber) and drop back before 1 minute is up, so no notification is sent. The real overload turns to firing after 1 minute and a resolve goes out when it ends: 2 notifications in total, 0 false alarms. The price is detecting it 1 minute later.',
        async run(){prepare({fr:60});await until(ctx,done)}},
      {id:'for5m',label:'for: 5 minutes',
        ask:'Raise the duration to 5 minutes. Is that better?',
        insight:'There are still no false alarms, but the real overload alerts only after 5 minutes, and it ends 1 minute after the alert. A longer duration filters more flapping but detects later; if the overload lasted only 4 minutes, it would be missed entirely. Choose the duration by how long you can tolerate nobody looking.',
        async run(){prepare({fr:300});await until(ctx,done)}},
      {id:'absent',label:'Host lost: is no data healthy?',
        ask:'The host’s CPU shoots up to 96% and then it hangs, so the collector never gets data again. for=1 minute. Will the cpu_high rule keep alerting? What about the separate “missing data” rule?',
        insight:'cpu_high fires after 1 minute of overload, but once the data stops the expression has no result and the condition counts as false, so it sends a “resolve” while the host is actually dead. The separate missing-data rule fires after 1 full minute without data and catches the problem. Never treat “no data” as “healthy.”',
        async run(){prepare({ds:'down',fr:60,absent:true});await until(ctx,done)}},
    ]);
  }
});

/* ---------------- Lab 2: downsampling and tiered retention ---------------- */
SDLab.define({
  id:'metrics-downsample',chapter:20,
  title:'Downsampling and Tiered Retention: What You Save, What You Lose',
  summary:'The top half averages raw points (one every 10 seconds) by window, optionally keeping the maximum too; the bottom half estimates how many points a year of data takes under this chapter’s retention policy.',
  caveat:'Windows are aligned as half-open intervals [start, start+window). Storage counts data points only, not label indexes, replicas, or compression (a time-series database’s delta encoding makes each point far smaller than 16 bytes). Tiers split by age: 0–7 days raw, 7–30 days at 1 minute, 30 days to 1 year at 1 hour.',
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
    /* The first 6 points come from the book’s table; 5 more minutes of data follow, including one 20-second spike. */
    const RAW=[10,16,20,30,20,30,28,24,31,26,22,27,30,25,21,29,33,27,98,96,31,28,24,30,26,23,29,32,27,25,31,28,22,26,30,27];
    const N=RAW.length;
    const P={win:30,keepMax:false,series:1e7,bytes:16};
    let W=600,G=null,sweep=-1,sw=null;
    const wins=()=>{const k=P.win/10,out=[];for(let s=0;s<N;s+=k){const v=RAW.slice(s,s+k);out.push({s,e:s+v.length,avg:v.reduce((a,b)=>a+b,0)/v.length,max:Math.max(...v),v})}return out};
    const f2=x=>Number.isInteger(x)?String(x):x.toFixed(2);
    const S=(t,a,...k)=>ctx.svgEl(t,a,...k);

    const formula=h('div',{class:'ds-formula'});
    const svgBox=h('div');
    const legend=h('div',{class:'ds-legend'},h('span',null,h('i',{style:{background:C.series[0]}}),'Raw points (one per 10 seconds)'),h('span',null,h('i',{style:{background:C.ok}}),'Window average'),h('span',null,h('i',{style:{background:C.bad}}),'Window maximum (stored when checked)'));
    const bars=h('div',{class:'ds-bars'});
    ctx.stage.append(h('div',{class:'ds-sec'},'① Downsampling: merge the points in a window into one'),formula,svgBox,legend,h('div',{class:'ds-sec'},'② Tiered retention: points stored per series over one year'),bars);
    const st=ctx.stats([{key:'pts',label:'Points after downsampling'},{key:'peak',label:'Spike window shows'},{key:'ratio',label:'Tiered points vs. raw'},{key:'tb',label:'One-year total (tiered)'}]);

    function build(){
      const narrow=W<520,x0=40,x1=W-10,cw=x1-x0,top=14,CH=narrow?150:170,H=top+CH+26;
      const X=i=>x0+(i+0.5)/N*cw,Y=v=>top+CH-v/100*CH;
      const svg=S('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'Raw points and downsampled result'});
      svg.append(S('rect',{x:x0,y:top,width:cw,height:CH,fill:'#fbfcfa',stroke:C.line}));
      for(const v of [0,50,100]){svg.append(S('line',{x1:x0,x2:x1,y1:Y(v),y2:Y(v),stroke:'#e3e9e1','stroke-dasharray':v%100?'3 3':null}));svg.append(S('text',{x:x0-5,y:Y(v)+4,'text-anchor':'end','font-size':12,fill:C.muted},v))}
      for(let i=0;i<N;i+=narrow?12:6)svg.append(S('text',{x:x0+i/N*cw,y:top+CH+16,'text-anchor':i?'middle':'start','font-size':12,fill:C.muted},hhmmss(i*10).slice(0,5)));
      svg.append(S('line',{x1:x0,x2:x1,y1:Y(90),y2:Y(90),stroke:C.bad,'stroke-dasharray':'6 4',opacity:.7}),S('text',{x:x1-4,y:Y(90)-4,'text-anchor':'end','font-size':12,fill:C.bad,stroke:'#fbfcfa','stroke-width':4,'paint-order':'stroke'},'Alert threshold 90%'));
      const hl=S('path',{d:'M0 0',fill:C.infoSoft,opacity:0});
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
      if(sweep>=0&&sweep<ws.length){const w=ws[sweep];ctx.attr(hl,{d:`M${x0+w.s*dw} ${top}h${(w.e-w.s)*dw}v${CH}h${-(w.e-w.s)*dw}z`,opacity:.7})}else hl.setAttribute('opacity',0);
      const cur=sweep>=0&&sweep<ws.length?ws[sweep]:null;
      if(cur)formula.replaceChildren(`Window from ${hhmmss(cur.s*10)}: (`+cur.v.join('+')+`) / ${cur.v.length} = `,h('b',null,f2(cur.avg)),P.keepMax?`, max ${cur.max}`:'');
      else if(P.win===30)formula.replaceChildren('First two 30-second windows: (10+16+20)/3 = ',h('b',null,'15.33'),', (30+20+30)/3 = ',h('b',null,'26.67'),'. The book’s table says 19 and 25, which is an arithmetic error.');
      else formula.replaceChildren(`Every ${P.win/60>=1?P.win/60+' min':P.win+' s'} becomes one point, ${ws.length} in total. Click “Step through windows” to see each step.`);
      const peak=ws.find(w=>w.s<=18&&w.e>18);
      st.set('pts',`${N} → ${ws.length}`);st.set('peak',peak?`avg ${f2(peak.avg)}`+(P.keepMax?` / max ${peak.max}`:''):'—',peak&&peak.avg<90&&!P.keepMax?'warn':'ok');
    }
    function drawStore(){
      const perDay=86400/10,raw=365*perDay,t1=7*perDay,t2=23*1440,t3=335*24,m=P.keepMax?2:1,tier=t1+m*(t2+t3);
      const tb=x=>util.bytes(x*P.series*P.bytes);
      const mk=(label,parts,total,note)=>h('div',{class:'ds-bar'},h('div',null,label),h('div',{class:'ds-track'},...parts.map(([v,col])=>h('i',{style:{width:(v/raw*100)+'%',background:col}}))),h('div',{class:'ds-val'},note));
      bars.replaceChildren(
        mk('Raw for 1 year',[[raw,C.series[0]]],raw,`${util.fmt(raw)} points/series · ${tb(raw)}`),
        mk('Tiered retention',[[t1,C.series[0]],[m*t2,C.series[1]],[m*t3,C.series[4]]],tier,`${util.fmt(tier)} points/series · ${tb(tier)} (raw ${util.fmt(t1)} + minute-level ${util.fmt(m*t2)} + hour-level ${util.fmt(m*t3)}${P.keepMax?', average and max each kept':''})`),
        h('div',{class:'ds-legend'},h('span',null,h('i',{style:{background:C.series[0]}}),'0–7 days: raw, 10 s'),h('span',null,h('i',{style:{background:C.series[1]}}),'7–30 days: 1 min'),h('span',null,h('i',{style:{background:C.series[4]}}),'30 days–1 year: 1 h')));
      st.set('ratio',util.pct(tier/raw,1)+` (${Math.round(raw/tier)}× smaller)`,'ok');st.set('tb',tb(tier),null);
    }

    const winCtl=ctx.segmented({label:'Downsampling window',value:P.win,options:[[30,'30 s'],[60,'1 min'],[120,'2 min']],onChange:v=>{P.win=v;stopSweep();drawWins()}});
    const tMax=ctx.toggle({label:'Also keep the window maximum',value:P.keepMax,onChange:v=>{P.keepMax=v;drawWins();drawStore()}});
    const sSer=ctx.slider({label:'Series count',min:1e6,max:2e7,step:1e6,value:P.series,format:v=>util.fmt(v/1e6)+' M',onInput:v=>{P.series=v;drawStore()}});
    const sB=ctx.slider({label:'Bytes per point',min:2,max:16,value:P.bytes,format:v=>v+' B',onInput:v=>{P.bytes=v;drawStore()},hint:'Timestamp 8 + value 8 = 16 uncompressed'});
    ctx.button('Step through windows',()=>{runSweep().catch(()=>{})},{primary:true});
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
      {id:'text',label:'The book’s 30-second averages',
        ask:'The book’s 6 points sampled every 10 seconds are 10, 16, 20, 30, 20, 30. Averaged over 30-second windows [00,30) and [30,60), what are the results? The book’s table says 19 and 25.',
        insight:'The first window is (10+16+20)/3 ≈ 15.33 and the second is (30+20+30)/3 ≈ 26.67, so the book’s 19 and 25 are miscalculated. The full 6 minutes hold 36 raw points, which become 12 after 30-second downsampling.',
        async run(){prepare({win:30});const n=2;for(sweep=0;sweep<n;sweep++){drawWins();await ctx.wait(1600)}for(;sweep<wins().length;sweep++){drawWins();await ctx.wait(300)}sweep=-1;drawWins()}},
      {id:'spike',label:'Where did the 20-second spike go?',
        ask:'From 19:03:00, CPU hits 98% and 96% for 20 seconds. After downsampling to 1-minute averages, what does that minute show? With an alert threshold of 90%, can you still see this spike?',
        insight:'The average for that minute is only about 51.17% ((98+96+31+28+24+30)/6), far below 90%, so the spike is smoothed away, and once the raw points are deleted it can never be recovered. Storing the maximum too lets you see 98, at the cost of doubling the points in the downsampled tiers: the one-year total grows from 3.2% to 4.5% of the raw volume.',
        async run(){prepare({win:60});await ctx.wait(1200);sweep=3;drawWins();await ctx.wait(2500);sweep=-1;P.keepMax=true;tMax.set(true,true);drawWins();drawStore();await ctx.wait(1800)}},
      {id:'store',label:'Points stored per year',
        ask:'10 million series, one point every 10 seconds. Compare keeping everything raw for a year with tiered retention (7 days raw, 1 minute up to 30 days, 1 hour up to a year). How many times fewer points does tiering store?',
        insight:'Keeping raw data for a year takes 3.15 million points per series; for 10 million series at 16 bytes per point that is about 505 TB. With tiering each series needs about 100,000 points, only 3.2% of the raw volume (about 31 times smaller), roughly 16 TB. Most of the savings come from switching to hourly resolution after 30 days.',
        async run(){prepare({});sSer.set(1e7,true);await ctx.wait(1500)}},
    ]);
  }
});
})();
