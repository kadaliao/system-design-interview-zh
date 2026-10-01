/* Chapter 2: Back-of-the-Envelope Estimation. Lab 1 walks DAU step by step to QPS, storage, bandwidth, and server count; lab 2 uses a “sampled year” to show series multiplication and redundancy. */
(function(){
const {el:h,util}=SDLab;
const trimN=(x,d=2)=>String(+x.toFixed(d));
function cnt(n){if(n>=1e9)return trimN(n/1e9)+'B';if(n>=1e6)return trimN(n/1e6)+'M';if(n>=1e4)return util.fmt(n);return trimN(n,1)}
function approx(n){if(!(n>0))return n;const a=+n.toPrecision(1);return Math.abs(a-n)/n<.02?a:+n.toPrecision(2)}
const B=(b,d=2)=>util.bytes(b,d);
/* runtime.css overrides the fill attribute via .sdl-stage svg text{fill}; copy fill into the inline style here. */
const fixFill=root=>root.querySelectorAll('text[fill]').forEach(t=>{t.style.fill=t.getAttribute('fill')});

/* ---------------- Lab 1: estimation calculator ---------------- */
const TPL=[.34,.24,.17,.13,.12,.15,.26,.46,.66,.78,.84,.88,.92,.88,.84,.84,.88,.94,1,1.1,1.24,1.34,1.18,.72];
/** Daily traffic shape in 96 points of 15 minutes: mean 1, maximum equal to the peak factor (power-transform the template, then bisect). */
function dayShape(P){
  const pts=[];for(let i=0;i<96;i++){const t=i/4,a=Math.floor(t),b=(a+1)%24,w=(1-Math.cos(Math.PI*(t-a)))/2;pts.push(TPL[a]*(1-w)+TPL[b]*w)}
  if(P<=1.0001)return pts.map(()=>1);
  const make=k=>{const v=pts.map(x=>Math.pow(x,k)),m=v.reduce((s,x)=>s+x,0)/v.length;return v.map(x=>x/m)};
  let lo=0,hi=40;for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(Math.max(...make(mid))<P)lo=mid;else hi=mid}
  return make(hi);
}
SDLab.define({
  id:'estimate-calculator',chapter:2,
  title:'Estimation Calculator: From DAU to QPS, Storage, and Servers',
  summary:'Every step shows its formula and units. Change one assumption and the affected cells flash with the change factor; the one-day traffic curve below compares sizing servers for the average versus the peak.',
  caveat:'Decimal units (1 TB = 10^12 B), and a day is 86,400 seconds. Storage counts raw media only, and the replica factor multiplies media only; each text and ID is listed separately at the chapter’s 204 B (64 + 140). A common 64-bit ID really takes only 8 bytes, which does not change the media conclusion. The one-day curve is an illustrative shape with “mean 1 and top point equal to the peak factor,” the same for reads and writes; it is not real monitoring data.',
  mount(ctx){
    const C=ctx.colors;
    ctx.css('est',`
.est-col{display:flex;flex-direction:column;gap:0}
.est-card{border:1px solid #dbe2da;border-radius:10px;padding:7px 10px;background:#fff;transition:box-shadow .2s,border-color .2s}
.est-card.on{border-color:#2f6fb3;box-shadow:0 0 0 2px #dde9f6}
.est-k{display:flex;justify-content:space-between;gap:6px;font-size:12px;color:#66756d;font-weight:650}
.est-v{font-size:18px;font-weight:750;font-variant-numeric:tabular-nums;line-height:1.35;overflow-wrap:anywhere}
.est-v small{font-size:13px;font-weight:500;color:#66756d}
.est-f{font-size:12px;color:#4f5f57;font-family:ui-monospace,Menlo,monospace;line-height:1.5;overflow-wrap:anywhere}
.est-b{font-size:12px;border-radius:6px;padding:0 6px;background:#dde9f6;color:#24558a;white-space:nowrap}
.est-b.up{background:#f6ead2;color:#86561a}
.est-ar{text-align:center;color:#9fb0a5;font-size:12px;line-height:1.2;margin:1px 0}
.est-chart{margin-top:12px}
.est-chart .sdl-btnrow{margin:4px 0 6px}
.est-verdict{font-size:14px;margin:6px 0 0}
.sdl-controls.est-ctl{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.est-halo{paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}
`);
    const L={mau:[1e6,2e6,5e6,1e7,2e7,5e7,1e8,2e8,3e8,5e8,1e9,2e9],wpd:[.1,.2,.5,1,2,3,5,10,20,50],rw:[0,1,2,5,10,20,50,100],media:[1e4,5e4,1e5,2e5,5e5,1e6,2e6,5e6,1e7,1e8],inst:[100,200,350,500,1000,2000,5000]};
    const TW={mau:3e8,dau:.5,wpd:2,rw:0,peak:2,mediaPct:.1,media:1e6,years:5,copies:1,inst:350};
    const P={...TW};let mode='avg';ctx.controls.classList.add('est-ctl');
    const ix=(k,v)=>L[k].indexOf(v);
    const ctl={
      mau:ctx.slider({label:'Monthly actives (MAU)',min:0,max:L.mau.length-1,value:ix('mau',P.mau),format:v=>cnt(L.mau[v]),onInput:v=>set({mau:L.mau[v]})}),
      dau:ctx.slider({label:'Daily-active ratio',min:5,max:100,step:5,value:P.dau*100,format:v=>v+'%',onInput:v=>set({dau:v/100})}),
      wpd:ctx.slider({label:'Writes per user per day',min:0,max:L.wpd.length-1,value:ix('wpd',P.wpd),format:v=>L.wpd[v]+'×',onInput:v=>set({wpd:L.wpd[v]})}),
      rw:ctx.slider({label:'Read:write ratio',min:0,max:L.rw.length-1,value:ix('rw',P.rw),format:v=>L.rw[v]?L.rw[v]+' : 1':'Ignore reads',onInput:v=>set({rw:L.rw[v]})}),
      peak:ctx.slider({label:'Peak factor',min:1,max:10,step:.5,value:P.peak,format:v=>v+'×',onInput:v=>set({peak:v})}),
      mediaPct:ctx.slider({label:'Share with media',min:0,max:100,step:5,value:P.mediaPct*100,format:v=>v+'%',onInput:v=>set({mediaPct:v/100})}),
      media:ctx.slider({label:'Media size',min:0,max:L.media.length-1,value:ix('media',P.media),format:v=>B(L.media[v],0),onInput:v=>set({media:L.media[v]})}),
      years:ctx.slider({label:'Retention',min:1,max:10,value:P.years,format:v=>v+' yr',onInput:v=>set({years:v})}),
      copies:ctx.slider({label:'Replicas',min:1,max:5,value:P.copies,format:v=>v===1?'Raw data':v+' copies',onInput:v=>set({copies:v})}),
      inst:ctx.slider({label:'Per-instance capacity',min:0,max:L.inst.length-1,value:ix('inst',P.inst),format:v=>util.fmt(L.inst[v])+' QPS',onInput:v=>set({inst:L.inst[v]})}),
    };
    ctx.button('Reset to the chapter’s Twitter assumptions',()=>{set({...TW});syncCtl()});
    function syncCtl(){for(const k in ctl){const v=P[k];ctl[k].set(L[k]?ix(k,v):(k==='dau'||k==='mediaPct')?Math.round(v*100):v,true)}}

    /* ---- Derivation cards ---- */
    const DEF=[
      ['Traffic (QPS)',['dau','daily','wq','wp','rq']],
      ['Storage',['mday','tday','mtot','copies']],
      ['Bandwidth and servers',['bw','inst']],
    ];
    const TITLE={dau:'Daily actives (DAU)',daily:'Writes per day',wq:'Average write QPS',wp:'Peak write QPS',rq:'Read QPS (avg / peak)',mday:'New media per day',tday:'New text and IDs per day',mtot:'Media over retention',copies:'Media storage with replicas',bw:'Media upload bandwidth (avg / peak)',inst:'Instances (peak reads + writes)'};
    const cards={};
    const grid=h('div',{class:'sdl-grid3'});
    for(const [head,keys] of DEF){
      const col=h('div',{class:'est-col'},h('p',{class:'sdl-note',style:{margin:'0 0 4px',fontWeight:'700'}},head));
      keys.forEach((k,i)=>{
        const b=h('span',{class:'est-b',hidden:true}),v=h('div',{class:'est-v'}),f=h('div',{class:'est-f'});
        const card=h('div',{class:'est-card'},h('div',{class:'est-k'},h('span',null,TITLE[k]),b),v,f);
        cards[k]={card,b,v,f,val:null};if(i)col.append(h('div',{class:'est-ar','aria-hidden':'true'},'↓'));col.append(card);
      });
      grid.append(col);
    }
    /* ---- Traffic over one day ---- */
    const chartBox=h('div',{class:'sdl-panel est-chart'});
    const holder=h('div'),verdict=h('p',{class:'est-verdict'});
    chartBox.append(h('div',{class:'ph'},'Traffic over one day, and server count'));
    const modeCtl=ctx.segmented({label:'How to size servers',parent:chartBox,value:mode,options:[['avg','By average'],['peak','By peak'],['u70','Peak + utilization ≤ 70%'],['n1','Plus 1 spare (N+1)']],onChange:v=>{mode=v;draw()}});
    chartBox.append(holder,verdict);
    ctx.stage.append(grid,chartBox);
    const stats=ctx.stats([{key:'n',label:'Instances'},{key:'u',label:'Peak utilization'},{key:'hrs',label:'Hours per day over capacity'},{key:'over',label:'Requests over capacity'}]);
    let R,W=600;
    function calc(){
      const dau=P.mau*P.dau,daily=dau*P.wpd,wq=daily/86400,wp=wq*P.peak,rq=wq*P.rw,rp=rq*P.peak;
      const mday=daily*P.mediaPct*P.media,tday=daily*204,mtot=mday*365*P.years;
      const avg=wq+rq,pk=wp+rp,cap=P.inst;
      const n={avg:Math.ceil(avg/cap-1e-9),peak:Math.ceil(pk/cap-1e-9),u70:Math.ceil(pk/(cap*.7)-1e-9)};n.n1=n.u70+1;
      return {dau,daily,wq,wp,rq,rp,mday,tday,mtot,copies:mtot*P.copies,bw:mday/86400,avg,pk,n};
    }
    function show(k,val,text,formula){
      const c=cards[k];
      if(c.val!=null&&val!=null&&c.val>0&&Math.abs(val/c.val-1)>1e-9){const r=val/c.val;c.b.hidden=false;c.b.textContent=r>=1?'×'+trimN(r):'÷'+trimN(1/r);c.b.className='est-b'+(r>1?' up':'');c.card.classList.remove('sdl-flash');void c.card.offsetWidth;c.card.classList.add('sdl-flash')}
      else c.b.hidden=true;
      c.val=val;c.v.replaceChildren(...text);c.f.textContent=formula;
    }
    const q=n=>util.fmt(Math.round(n));
    const withApprox=n=>approx(n)!==Math.round(n)?' (about '+util.fmt(approx(n))+')':'';
    function set(o,silentBadges){
      Object.assign(P,o);R=calc();
      if(silentBadges)for(const k in cards){cards[k].b.hidden=true;cards[k].val=null}
      show('dau',R.dau,[cnt(R.dau),h('small',null,' users')],`${cnt(P.mau)} × ${Math.round(P.dau*100)}% = ${cnt(R.dau)}`);
      show('daily',R.daily,[cnt(R.daily),h('small',null,' writes/day')],`${cnt(R.dau)} × ${P.wpd} = ${cnt(R.daily)}`);
      show('wq',R.wq,[q(R.wq),h('small',null,' req/s')],`${cnt(R.daily)} ÷ 86,400 s ≈ ${q(R.wq)}${withApprox(R.wq)}`);
      show('wp',R.wp,[q(R.wp),h('small',null,' req/s')],`${q(R.wq)} × ${P.peak} ≈ ${q(R.wp)}${withApprox(R.wp)}`);
      show('rq',P.rw?R.rq:null,P.rw?[q(R.rq)+' / '+q(R.rp),h('small',null,' req/s')]:['Not counted'],P.rw?`Write QPS × ${P.rw}; peak × ${P.peak} on top`:'The chapter estimates only tweet writes; for reads, ask “how many refreshes per day?”');
      show('mday',R.mday,[B(R.mday)+'/day'],`${cnt(R.daily)} × ${Math.round(P.mediaPct*100)}% × ${B(P.media,0)} = ${B(R.mday)}`);
      show('tday',R.tday,[B(R.tday)+'/day'],`${cnt(R.daily)} × 204 B; ${R.mday?'about '+util.pct(R.tday/R.mday,1)+' of the media':'with no media, this is the bulk'}`);
      show('mtot',R.mtot,[B(R.mtot)],`${B(R.mday)} × 365 × ${P.years} ≈ ${B(R.mtot)}${approx(R.mtot)!==R.mtot?' (about '+B(approx(R.mtot),0)+')':''}`);
      show('copies',P.copies>1?R.copies:null,[P.copies>1?B(R.copies):'Replicas not counted'],P.copies>1?`${B(R.mtot)} × ${P.copies} copies = ${B(R.copies)}`:'In production, also add replicas, thumbnails, indexes, and backups');
      show('bw',R.bw,[B(R.bw,1)+'/s'],`${B(R.mday)} ÷ 86,400 ≈ ${B(R.bw,1)}/s ≈ ${trimN(R.bw*8/1e9,1)} Gbit/s; peak × ${P.peak} ≈ ${trimN(R.bw*8*P.peak/1e9,1)} Gbit/s`);
      show('inst',R.n.peak,[R.n.peak+' instances',h('small',null,' at minimum')],`${q(R.pk)} ÷ ${util.fmt(P.inst)} = ${trimN(R.pk/P.inst,1)} → ${R.n.peak}; with 30% headroom, about ${R.n.u70}`);
      draw();
    }
    let shape=null,shapeP=null;
    function draw(){
      if(!R)return;
      if(shapeP!==P.peak){shape=dayShape(P.peak);shapeP=P.peak}
      const n=R.n[mode],capQ=n*P.inst,lam=shape.map(x=>R.avg*x);
      let over=0,hrs=0;lam.forEach(l=>{if(l>capQ+1e-9){over+=(l-capQ)*900;hrs+=.25}});
      const peakU=R.pk/capQ;
      const narrow=W<560,H=narrow?190:210,x0=narrow?46:58,x1=W-10,y0=14,y1=H-24;
      const ymax=Math.max(R.pk,capQ)*1.12||1,X=i=>x0+(x1-x0)*i/96,Y=v=>y1-(y1-y0)*v/ymax;
      holder.replaceChildren();
      const svg=ctx.svg(W,H,{parent:holder,label:'Request curve over 24 hours, the average, and the server capacity line'});
      const g=(t,a)=>{const e=ctx.svgEl(t,a);svg.append(e);return e};
      for(let k=0;k<=3;k++){const v=ymax/1.12*k/3,y=Y(v);g('line',{x1:x0,x2:x1,y1:y,y2:y,stroke:'#edf1ec'});g('text',{x:x0-5,y:y+4,'text-anchor':'end','font-size':12,fill:C.muted,text:v>=1e4?trimN(v/1e3,1)+'k':util.fmt(Math.round(v))})}
      for(let hh=0;hh<=24;hh+=narrow?6:3)g('text',{x:X(hh*4),y:H-6,'text-anchor':'middle','font-size':12,fill:C.muted,text:hh+'h'});
      const pts=lam.map((l,i)=>`${X(i+.5).toFixed(1)},${Y(l).toFixed(1)}`);
      g('path',{d:`M${X(.5)},${y1} L${pts.join(' L')} L${X(95.5)},${y1} Z`,fill:'#dde9f6',opacity:.7});
      // the part above capacity
      let d='';lam.forEach((l,i)=>{if(l>capQ)d+=`M${X(i)},${Y(capQ)} L${X(i)},${Y(l)} L${X(i+1)},${Y(l)} L${X(i+1)},${Y(capQ)} Z `});
      if(d)g('path',{d,fill:C.bad,opacity:.35});
      g('polyline',{points:pts.join(' '),fill:'none',stroke:C.info,'stroke-width':2});
      g('line',{x1:x0,x2:x1,y1:Y(R.avg),y2:Y(R.avg),stroke:C.muted,'stroke-dasharray':'5 4'});
      g('text',{x:x0+4,y:Y(R.avg)+15,'font-size':12,fill:C.muted,class:'est-halo',text:'Avg '+q(R.avg)});
      const bad=over>0,cc=bad?C.bad:peakU>.8?C.warn:C.ok;
      g('line',{x1:x0,x2:x1,y1:Y(capQ),y2:Y(capQ),stroke:cc,'stroke-width':2});
      g('text',{x:x1-4,y:Y(capQ)-6,'text-anchor':'end','font-size':12,'font-weight':650,fill:cc,class:'est-halo',text:`Capacity ${n} × ${util.fmt(P.inst)} = ${q(capQ)}`});
      fixFill(svg);stats.set('n',n,'info');
      stats.set('u',util.pct(peakU,0),peakU>1?'bad':peakU>.8?'warn':'ok');
      stats.set('hrs',trimN(hrs)+' h',hrs?'bad':'ok');
      stats.set('over',over?util.pct(over/(R.avg*86400),1)+' of requests':'None',over?'bad':'ok');
      verdict.textContent=bad?`Sized this way, traffic exceeds capacity for ${trimN(hrs)} hours a day, and about ${util.pct(over/(R.avg*86400),1)} of requests must queue, time out, or be rejected. The average flattens busy and quiet periods.`
        :peakU>.9?`Peak utilization is ${util.pct(peakU,0)}: the total is just enough, but queueing delay climbs steeply and losing one server is too many.`
        :mode==='n1'?`Peak utilization is ${util.pct(peakU,0)}, and after one server fails the rest can still hold utilization near 70%.`:`Peak utilization is ${util.pct(peakU,0)}, leaving headroom for queueing and bursts.`;
    }
    ctx.onResize(w=>{if(Math.abs(w-W)>8){W=Math.max(300,Math.round(w));draw()}});
    set({},true);

    const prep=async o=>{set({...TW,...o},true);syncCtl();modeCtl.set('avg',true);mode='avg';draw();for(const k in cards)cards[k].card.classList.remove('on');await ctx.wait(400)};
    ctx.scenarios([
      {id:'twitter',label:'Recompute the chapter’s Twitter example',
        ask:'300M MAU, 50% daily active, 2 tweets per person per day, 10% with 1 MB of media, kept for 5 years. What are the average write QPS, the peak write QPS, and the 5-year media storage?',
        insight:'150M DAU × 2 = 300M tweets/day; ÷ 86,400 ≈ 3,472 tweets/s (about 3,500); the 2× peak gives ≈ 6,944 (about 7,000). Media is 30 TB a day and 54.75 PB over 5 years (about 55 PB). Text and IDs add only about 61 GB a day, 0.2% of the media, negligible at this scale. 55 PB is raw data only; with 3 replicas it becomes about 164 PB.',
        async run(){
          await prep({});
          for(const k of ['dau','daily','wq','wp','mday','tday','mtot']){cards[k].card.classList.add('on');await ctx.wait(1000);cards[k].card.classList.remove('on')}
          set({copies:3});syncCtl();cards.copies.card.classList.add('on');await ctx.wait(1600);cards.copies.card.classList.remove('on');
        }},
      {id:'ops10',label:'Actions per day: 2 → 10',
        ask:'DAU stays the same, but each person goes from 2 tweets a day to 10. By what factor do average QPS, peak QPS, and 5-year media storage each change?',
        insight:'All are ×5, not ×8 (that is 8 more actions, but the total is 10 ÷ 2 = 5 times): average write QPS 3,472 → 17,361 and peak 6,944 → 34,722; media per day 30 → 150 TB and over 5 years 54.75 → 273.75 PB; instances sized for the peak go from 20 to 100. Storage scales by 5 only if every action adds the same amount of data; unrelated cells such as the daily-active ratio do not flash.',
        async run(){await prep({});await ctx.wait(900);set({wpd:10});syncCtl();await ctx.wait(3500)}},
      {id:'avgonly',label:'Size servers by average QPS only',
        ask:'One instance steadily handles 350 QPS at the target latency. If you buy 10 servers for the average write QPS (about 3,472), for how long each day can they not keep up? How many does the peak call for, and why is that still not safe?',
        insight:'The 3,500 capacity of 10 servers is only slightly above the average, and traffic exceeds it for 14.25 hours a day, so about 23% of requests queue or fail. Sizing for the peak gives 20 servers at 99% peak utilization: just enough in total, but queueing delay climbs steeply and losing one server is too many. A 70% target utilization needs 29, and one spare makes 30, in line with the chapter’s “26 to 30.”',
        async run(){
          await prep({});await ctx.wait(2200);
          for(const m of ['peak','u70','n1']){modeCtl.set(m,true);mode=m;draw();await ctx.wait(2400)}
        }},
    ]);
  }
});

/* ---------------- Lab 2: availability and downtime ---------------- */
const AV=[[.99,'99%'],[.995,'99.5%'],[.999,'99.9%'],[.9995,'99.95%'],[.9999,'99.99%'],[.99999,'99.999%']];
const NINES=[[.99,'Two nines','3.65 days'],[.999,'Three nines','8.76 hours'],[.9999,'Four nines','52.6 minutes'],[.99999,'Five nines','5.26 minutes'],[.999999,'Six nines','31.5 seconds']];
const YEAR=8760;
function genOut(seed,a){
  const D=(1-a)*YEAR;if(D<=0)return [];
  const r=util.rng(seed),n=util.clamp(Math.round(D/2.5),1,10),w=util.range(n).map(()=>.4+r()),sw=w.reduce((s,x)=>s+x,0),out=[];
  for(const x of w){const d=D*x/sw;let s=0;for(let t=0;t<30;t++){s=r()*(YEAR-d);if(!out.some(([a,b])=>s<b+24&&s+d>a-24))break}out.push([s,s+d])}
  return out.sort((a,b)=>a[0]-b[0]);
}
function inter(A,Bs){let res=A;for(const Bl of Bs){const o=[];for(const [a,b] of res)for(const [c,d] of Bl){const s=Math.max(a,c),e=Math.min(b,d);if(e>s)o.push([s,e])}res=o}return res}
function union(lists){const all=lists.flat().sort((a,b)=>a[0]-b[0]),o=[];for(const [a,b] of all){const l=o[o.length-1];if(l&&a<=l[1])l[1]=Math.max(l[1],b);else o.push([a,b])}return o}
const len=l=>l.reduce((s,[a,b])=>s+b-a,0);
SDLab.define({
  id:'availability-nines',chapter:2,
  title:'How Many Nines: Series Multiplies, Redundancy Unions',
  summary:'A request uses the components below in turn. Each row is a sampled year, and red is downtime; if any required component is down, the request fails end to end. Change availability, add replicas, or mark a component as degradable, and compare the formula with this year’s downtime.',
  caveat:'Each replica’s downtime over the year is exactly (1 − availability) × 8,760 hours, split into a few random segments placed in the year; when “independent,” replicas are unrelated. The formula assumes independent failures and a consistent counting basis. Failure bars are drawn at a minimum width so you can see them, so their lengths are not to scale.',
  mount(ctx){
    const C=ctx.colors;
    ctx.css('avn',`
.avn-list{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}
.avn-row{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;border:1px solid #dbe2da;border-radius:10px;padding:6px 10px;background:#fbfcfa;font-size:13px}
.avn-row.opt{opacity:.62}
.avn-row b{min-width:5.5em}
.avn-row select{font:inherit;font-size:13px;padding:2px 6px;border:1px solid #bacdbf;border-radius:7px;background:#fff;color:#23352f}
.avn-row .sdl-btnrow button{padding:2px 9px;font-size:13px}
.avn-row label{display:flex;gap:4px;align-items:center;cursor:pointer}
.avn-row .x{margin-left:auto;padding:1px 9px;font-size:13px}
.avn-formula{font-family:ui-monospace,Menlo,monospace;font-size:13px;margin:8px 0 4px;overflow-wrap:anywhere}
.avn-nines{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.avn-nines span{font-size:12px;border:1px solid #dbe2da;border-radius:999px;padding:1px 9px;color:#66756d;background:#fff}
.avn-nines span.on{border-color:#2f6fb3;background:#dde9f6;color:#24558a;font-weight:650}
`);
    const POOL=[['Cache',.999],['SMS notifications',.99],['Auth service',.9999],['Message queue',.9995],['DNS',.99999]];
    let uid=0,seed=11,common=false;
    const mk=(name,a,copies=1,req=true)=>({id:++uid,name,a,copies,req});
    let comps=[mk('API service',.999),mk('Database',.999),mk('Payment gateway',.999)];
    const commonCtl=ctx.toggle({label:'Replicas in the same data center (fail together)',value:false,onChange:v=>{common=v;render()}});
    ctx.button('+ Add dependency',()=>{if(comps.length>=5)return;const p=POOL.find(([n])=>!comps.some(c=>c.name===n));if(p){comps.push(mk(p[0],p[1]));render()}});
    ctx.button('Resample the year',()=>{seed+=7;render()});
    const list=h('div',{class:'avn-list'}),holder=h('div'),foot=h('p',{class:'sdl-note',style:{margin:'2px 0 0'}}),formula=h('p',{class:'avn-formula'}),nines=h('div',{class:'avn-nines'});
    ctx.stage.append(list,holder,foot,formula,nines);
    const stats=ctx.stats([{key:'a',label:'End-to-end availability (formula)'},{key:'d',label:'Downtime per year (formula)'},{key:'s',label:'Downtime this year (sampled)'}]);
    let W=600;
    function rowUI(c){
      const sel=h('select',{'aria-label':c.name+' availability'},AV.map(([v,l])=>h('option',{value:v},l)));sel.value=String(c.a);
      sel.onchange=()=>{c.a=+sel.value;render()};
      const seg=h('div',{class:'sdl-btnrow',role:'group','aria-label':'Replica count'},[1,2,3].map(n=>h('button',{type:'button','aria-pressed':String(c.copies===n),onclick:()=>{c.copies=n;render()}},n===1?'Single':n+' replicas')));
      const req=h('input',{type:'checkbox',checked:c.req});req.onchange=()=>{c.req=req.checked;render()};
      return h('div',{class:'avn-row'+(c.req?'':' opt')},h('b',null,c.name),sel,seg,h('label',null,req,'Required'),comps.length>1?h('button',{type:'button',class:'x',title:'Remove '+c.name,onclick:()=>{comps=comps.filter(x=>x!==c);render()}},'Remove'):null);
    }
    const compA=c=>common?c.a:1-Math.pow(1-c.a,c.copies);
    function render(){
      list.replaceChildren(...comps.map(rowUI));
      // sampling
      const rows=[];
      for(const c of comps){
        const copies=util.range(c.copies).map(j=>genOut(seed*1000+c.id*10+(common?0:j),c.a));
        c.out=c.copies>1?inter(copies[0],copies.slice(1)):copies[0];c.copyOut=copies;
      }
      const req=comps.filter(c=>c.req),e2e=union(req.map(c=>c.out));
      const A=req.reduce((p,c)=>p*compA(c),1);
      // draw the year
      const narrow=W<560,LW=narrow?84:168,RW=narrow?62:84,x0=LW,x1=W-RW,X=hr=>x0+(x1-x0)*hr/YEAR;
      const lines=[];let y=22;
      for(const c of comps){
        if(c.copies>1){c.copyOut.forEach((o,j)=>{lines.push({y,h:8,label:'Replica '+(j+1),out:o,sub:true,opt:!c.req});y+=15});}
        lines.push({y,h:14,label:c.name+(c.copies>1?(common?' (fail together)':' (any one up)'):''),out:c.out,opt:!c.req,name:c.name});y+=c.copies>1?26:24;
      }
      y+=4;lines.push({y,h:18,label:'End to end',out:e2e,e2e:true});const H=y+26;
      holder.replaceChildren();
      const svg=ctx.svg(W,H,{parent:holder,label:'Downtime periods of each component and end to end in the sampled year'});
      const g=(t,a)=>{const e=ctx.svgEl(t,a);svg.append(e);return e};
      const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],months=narrow?[0,3,6,9]:util.range(12);
      for(const m of months)g('text',{x:X(m*730),y:13,'font-size':12,fill:C.muted,text:MON[m]});
      for(const r of lines){
        const yy=r.y;
        g('text',{x:r.sub?14:4,y:yy+r.h/2+4,'font-size':12,'font-weight':r.sub?400:650,fill:r.sub?C.muted:C.ink,text:narrow&&r.label.length>10?r.label.slice(0,10)+'…':r.label});
        g('rect',{x:x0,y:yy,width:x1-x0,height:r.h,rx:3,fill:r.e2e?'#eef4ee':'#f3f6f1',stroke:r.e2e?'#9ccbad':'none'});
        for(const [a,b] of r.out){const xa=X(a),w=Math.max(2.2,X(b)-xa);g('rect',{x:xa,y:yy,width:w,height:r.h,fill:r.opt?'#b9c3bc':C.bad,opacity:r.sub?.55:1})}
        const hrs=len(r.out);
        g('text',{x:W-4,y:yy+r.h/2+4,'text-anchor':'end','font-size':12,'font-weight':r.e2e?700:400,fill:r.e2e?C.bad:C.muted,text:hrs?util.duration(hrs*3600):'0'});
      }
      foot.textContent=req.length<comps.length?'Gray components can degrade: requests still succeed while they are down, so they do not count toward end to end.':'Red bars are downtime; the “End to end” row is the union of the downtime of all required components.';
      fixFill(svg);
      // formula and stats
      const part=c=>{const p=AV.find(x=>x[0]===c.a)[1];return c.copies>1&&!common?`(1 − ${trimN((1-c.a)*100,3)}%${c.copies===2?'²':'³'})`:p};
      formula.textContent=req.length?`End to end = ${req.map(part).join(' × ')} = ${util.pct(A,4)}`:'No required components';
      const down=(1-A)*YEAR*3600;
      stats.set('a',util.pct(A,4),A>=.999?'ok':A>=.99?'warn':'bad');
      stats.set('d',util.duration(down),A>=.999?'ok':A>=.99?'warn':'bad');
      stats.set('s',len(e2e)?util.duration(len(e2e)*3600):'0 (replica downtime never overlaps)','info');
      nines.replaceChildren(h('span',{style:{border:'0',background:'none',padding:'1px 0'}},'End-to-end tier reached: '),...NINES.map(([v,l,d],i)=>{const next=NINES[i+1];const on=A>=v&&(!next||A<next[0]);return h('span',{class:on?'on':null},`${l} · ${d} per year`)}));
      ctx.announce(`End-to-end availability ${util.pct(A,4)}, about ${util.duration(down)} of downtime per year`);
    }
    ctx.onResize(w=>{if(Math.abs(w-W)>8){W=Math.max(300,Math.round(w));render()}});
    const reset=(list,cm=false)=>{uid=0;comps=list.map(x=>mk(...x));common=cm;commonCtl.set(cm,true);seed=11;render()};
    ctx.scenarios([
      {id:'series',label:'Three 99.9% in series',
        ask:'The API, the database, and the payment gateway are each 99.9% available, and a payment uses all three. What is the end-to-end availability, and how much downtime is that per year?',
        insight:'0.999³ ≈ 99.7003%, about 26.3 hours a year, roughly 3 times a single component (8.8 hours) and lower than any one of them. In this sampled year the three failures barely overlap, so end-to-end downtime is about the sum of the three; the formula subtracts exactly that tiny overlap.',
        async run(){reset([['API service',.999],['Database',.999],['Payment gateway',.999]]);await ctx.wait(3000)}},
      {id:'redundant',label:'Add a replica to the database',
        ask:'Add one independent replica to the database; either one being up is enough. Does end to end get back to 99.9%? What if all three components get two replicas?',
        insight:'With a replica only for the database, it combines to about 99.9999%, but the other two 99.9% components are still in the chain, so end to end is about 99.8%, roughly 17.5 hours a year. With two replicas for all three, end to end is about 99.9997%, leaving only about 95 seconds a year; in this sampled year the two replicas’ downtime happened not to overlap, so end to end never went down. This assumes replica failures are independent.',
        async run(){reset([['API service',.999],['Database',.999],['Payment gateway',.999]]);await ctx.wait(1500);comps[1].copies=2;render();await ctx.wait(3000);comps.forEach(c=>c.copies=2);render();await ctx.wait(3000)}},
      {id:'common',label:'Replicas share one data center',
        ask:'All three components have two replicas, but each pair shares the same data center power and always fails together. What end-to-end availability is left?',
        insight:'It falls back to 99.7003%, about 26.3 hours a year, the same as with no replicas. Redundancy helps only when failures are independent; failures of shared power, network, or DNS must be treated as one whole and cannot simply be multiplied.',
        async run(){reset([['API service',.999,2],['Database',.999,2],['Payment gateway',.999,2]]);await ctx.wait(2000);commonCtl.set(true,true);common=true;render();await ctx.wait(3000)}},
      {id:'optional',label:'Add a 99% SMS service',
        ask:'After a payment succeeds, an SMS must be sent, and the SMS service is only 99% available. What happens to end to end if you call it synchronously inside the payment path? What if you send it asynchronously with retries?',
        insight:'Called synchronously, end to end is about 98.7%, roughly 4.7 days of downtime a year: a chain’s availability cannot exceed that of its worst required component. Once it is asynchronous, SMS is no longer a success condition (gray), and end to end returns to 99.7003%. Degradation, caching, and async all change the success condition, so first redraw which components are required.',
        async run(){reset([['API service',.999],['Database',.999],['Payment gateway',.999],['SMS notifications',.99]]);await ctx.wait(3200);comps[3].req=false;render();await ctx.wait(3000)}},
    ]);
    render();
  }
});
})();
