/* 第 2 章：数量级估算。实验一把日活一步步推到 QPS、存储、带宽和机器数；实验二用「抽样的一年」演示串联相乘与冗余。 */
(function(){
const {el:h,util}=SDLab;
const trimN=(x,d=2)=>String(+x.toFixed(d));
function cnt(n){if(n>=1e9)return trimN(n/1e9)+'B';if(n>=1e6)return trimN(n/1e6)+'M';if(n>=1e4)return util.fmt(n);return trimN(n,1)}
function approx(n){if(!(n>0))return n;const a=+n.toPrecision(1);return Math.abs(a-n)/n<.02?a:+n.toPrecision(2)}
const B=(b,d=2)=>util.bytes(b,d);
/* runtime.css 用 .sdl-stage svg text{fill} 覆盖了 fill 属性，这里把 fill 同步到内联样式。 */
const fixFill=root=>root.querySelectorAll('text[fill]').forEach(t=>{t.style.fill=t.getAttribute('fill')});

/* ---------------- 实验一：估算计算器 ---------------- */
const TPL=[.34,.24,.17,.13,.12,.15,.26,.46,.66,.78,.84,.88,.92,.88,.84,.84,.88,.94,1,1.1,1.24,1.34,1.18,.72];
/** 96 个 15 分钟点的日内流量形状：均值 1、最大值等于峰值倍数（对模板做幂变换后二分）。 */
function dayShape(P){
  const pts=[];for(let i=0;i<96;i++){const t=i/4,a=Math.floor(t),b=(a+1)%24,w=(1-Math.cos(Math.PI*(t-a)))/2;pts.push(TPL[a]*(1-w)+TPL[b]*w)}
  if(P<=1.0001)return pts.map(()=>1);
  const make=k=>{const v=pts.map(x=>Math.pow(x,k)),m=v.reduce((s,x)=>s+x,0)/v.length;return v.map(x=>x/m)};
  let lo=0,hi=40;for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(Math.max(...make(mid))<P)lo=mid;else hi=mid}
  return make(hi);
}
SDLab.define({
  id:'estimate-calculator',chapter:2,
  title:'估算计算器：从日活推到 QPS、存储和机器数',
  summary:'每一步都写出算式和单位。改一个假设，受影响的格子会闪一下并标出变化倍数；下方的一天流量曲线对比按平均还是按峰值买机器。',
  caveat:'十进制单位（1 TB = 10^12 B），一天按 86,400 秒。存储只算媒体裸数据，副本系数只乘在媒体上；每条文本与 ID 按原文 204 B（64 + 140）单列；常见 64 位 ID 实际只占 8 字节，不影响媒体结论。一天的流量曲线是「均值为 1、最高点等于峰值倍数」的示意形状，读写同形，不是真实监控数据。',
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
      mau:ctx.slider({label:'月活 MAU',min:0,max:L.mau.length-1,value:ix('mau',P.mau),format:v=>cnt(L.mau[v]),onInput:v=>set({mau:L.mau[v]})}),
      dau:ctx.slider({label:'日活比例',min:5,max:100,step:5,value:P.dau*100,format:v=>v+'%',onInput:v=>set({dau:v/100})}),
      wpd:ctx.slider({label:'人均每天写',min:0,max:L.wpd.length-1,value:ix('wpd',P.wpd),format:v=>L.wpd[v]+' 次',onInput:v=>set({wpd:L.wpd[v]})}),
      rw:ctx.slider({label:'读写比',min:0,max:L.rw.length-1,value:ix('rw',P.rw),format:v=>L.rw[v]?L.rw[v]+' : 1':'不计读',onInput:v=>set({rw:L.rw[v]})}),
      peak:ctx.slider({label:'峰值倍数',min:1,max:10,step:.5,value:P.peak,format:v=>v+' 倍',onInput:v=>set({peak:v})}),
      mediaPct:ctx.slider({label:'含媒体比例',min:0,max:100,step:5,value:P.mediaPct*100,format:v=>v+'%',onInput:v=>set({mediaPct:v/100})}),
      media:ctx.slider({label:'媒体大小',min:0,max:L.media.length-1,value:ix('media',P.media),format:v=>B(L.media[v],0),onInput:v=>set({media:L.media[v]})}),
      years:ctx.slider({label:'保留年限',min:1,max:10,value:P.years,format:v=>v+' 年',onInput:v=>set({years:v})}),
      copies:ctx.slider({label:'副本数',min:1,max:5,value:P.copies,format:v=>v===1?'裸数据':v+' 份',onInput:v=>set({copies:v})}),
      inst:ctx.slider({label:'单实例承载',min:0,max:L.inst.length-1,value:ix('inst',P.inst),format:v=>util.fmt(L.inst[v])+' QPS',onInput:v=>set({inst:L.inst[v]})}),
    };
    ctx.button('恢复正文 Twitter 假设',()=>{set({...TW});syncCtl()});
    function syncCtl(){for(const k in ctl){const v=P[k];ctl[k].set(L[k]?ix(k,v):(k==='dau'||k==='mediaPct')?Math.round(v*100):v,true)}}

    /* ---- 推导卡片 ---- */
    const DEF=[
      ['流量（QPS）',['dau','daily','wq','wp','rq']],
      ['存储',['mday','tday','mtot','copies']],
      ['带宽与机器',['bw','inst']],
    ];
    const TITLE={dau:'日活 DAU',daily:'每天写入次数',wq:'平均写 QPS',wp:'峰值写 QPS',rq:'读 QPS（平均 / 峰值）',mday:'每天新增媒体',tday:'每天新增文本与 ID',mtot:'保留期内媒体总量',copies:'含副本的媒体存储',bw:'媒体上传带宽（平均 / 峰值）',inst:'实例数（按读 + 写的峰值）'};
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
    /* ---- 一天的流量 ---- */
    const chartBox=h('div',{class:'sdl-panel est-chart'});
    const holder=h('div'),verdict=h('p',{class:'est-verdict'});
    chartBox.append(h('div',{class:'ph'},'一天的流量与机器数'));
    const modeCtl=ctx.segmented({label:'按什么买机器',parent:chartBox,value:mode,options:[['avg','按平均'],['peak','按峰值'],['u70','峰值 + 利用率 ≤ 70%'],['n1','再加 1 台冗余（N+1）']],onChange:v=>{mode=v;draw()}});
    chartBox.append(holder,verdict);
    ctx.stage.append(grid,chartBox);
    const stats=ctx.stats([{key:'n',label:'实例数'},{key:'u',label:'高峰利用率'},{key:'hrs',label:'每天超出容量的时长'},{key:'over',label:'超出容量的请求'}]);
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
    const withApprox=n=>approx(n)!==Math.round(n)?'（约 '+util.fmt(approx(n))+'）':'';
    function set(o,silentBadges){
      Object.assign(P,o);R=calc();
      if(silentBadges)for(const k in cards){cards[k].b.hidden=true;cards[k].val=null}
      show('dau',R.dau,[cnt(R.dau),h('small',null,' 人')],`${cnt(P.mau)} × ${Math.round(P.dau*100)}% = ${cnt(R.dau)}`);
      show('daily',R.daily,[cnt(R.daily),h('small',null,' 次/天')],`${cnt(R.dau)} × ${P.wpd} = ${cnt(R.daily)}`);
      show('wq',R.wq,[q(R.wq),h('small',null,' 次/秒')],`${cnt(R.daily)} ÷ 86,400 秒 ≈ ${q(R.wq)}${withApprox(R.wq)}`);
      show('wp',R.wp,[q(R.wp),h('small',null,' 次/秒')],`${q(R.wq)} × ${P.peak} ≈ ${q(R.wp)}${withApprox(R.wp)}`);
      show('rq',P.rw?R.rq:null,P.rw?[q(R.rq)+' / '+q(R.rp),h('small',null,' 次/秒')]:['不计'],P.rw?`写 QPS × ${P.rw}；峰值再 × ${P.peak}`:'原文只估算发推写入；读取要另问「每天刷新几次」');
      show('mday',R.mday,[B(R.mday)+'/天'],`${cnt(R.daily)} × ${Math.round(P.mediaPct*100)}% × ${B(P.media,0)} = ${B(R.mday)}`);
      show('tday',R.tday,[B(R.tday)+'/天'],`${cnt(R.daily)} × 204 B；${R.mday?'约为媒体的 '+util.pct(R.tday/R.mday,1):'没有媒体时它就是主体'}`);
      show('mtot',R.mtot,[B(R.mtot)],`${B(R.mday)} × 365 × ${P.years} ≈ ${B(R.mtot)}${approx(R.mtot)!==R.mtot?'（约 '+B(approx(R.mtot),0)+'）':''}`);
      show('copies',P.copies>1?R.copies:null,[P.copies>1?B(R.copies):'未计副本'],P.copies>1?`${B(R.mtot)} × ${P.copies} 份 = ${B(R.copies)}`:'生产上还要加副本、缩略图、索引和备份');
      show('bw',R.bw,[B(R.bw,1)+'/s'],`${B(R.mday)} ÷ 86,400 ≈ ${B(R.bw,1)}/s ≈ ${trimN(R.bw*8/1e9,1)} Gbit/s；峰值 × ${P.peak} ≈ ${trimN(R.bw*8*P.peak/1e9,1)} Gbit/s`);
      show('inst',R.n.peak,[R.n.peak+' 台',h('small',null,' 起步')],`${q(R.pk)} ÷ ${util.fmt(P.inst)} = ${trimN(R.pk/P.inst,1)} → ${R.n.peak} 台；留 30% 余量约 ${R.n.u70} 台`);
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
      const svg=ctx.svg(W,H,{parent:holder,label:'一天 24 小时的请求量曲线、平均值和机器容量线'});
      const g=(t,a)=>{const e=ctx.svgEl(t,a);svg.append(e);return e};
      for(let k=0;k<=3;k++){const v=ymax/1.12*k/3,y=Y(v);g('line',{x1:x0,x2:x1,y1:y,y2:y,stroke:'#edf1ec'});g('text',{x:x0-5,y:y+4,'text-anchor':'end','font-size':12,fill:C.muted,text:v>=1e4?trimN(v/1e3,1)+'k':util.fmt(Math.round(v))})}
      for(let hh=0;hh<=24;hh+=narrow?6:3)g('text',{x:X(hh*4),y:H-6,'text-anchor':'middle','font-size':12,fill:C.muted,text:hh+'时'});
      const pts=lam.map((l,i)=>`${X(i+.5).toFixed(1)},${Y(l).toFixed(1)}`);
      g('path',{d:`M${X(.5)},${y1} L${pts.join(' L')} L${X(95.5)},${y1} Z`,fill:'#dde9f6',opacity:.7});
      // 超出容量的部分
      let d='';lam.forEach((l,i)=>{if(l>capQ)d+=`M${X(i)},${Y(capQ)} L${X(i)},${Y(l)} L${X(i+1)},${Y(l)} L${X(i+1)},${Y(capQ)} Z `});
      if(d)g('path',{d,fill:C.bad,opacity:.35});
      g('polyline',{points:pts.join(' '),fill:'none',stroke:C.info,'stroke-width':2});
      g('line',{x1:x0,x2:x1,y1:Y(R.avg),y2:Y(R.avg),stroke:C.muted,'stroke-dasharray':'5 4'});
      g('text',{x:x0+4,y:Y(R.avg)+15,'font-size':12,fill:C.muted,class:'est-halo',text:'平均 '+q(R.avg)});
      const bad=over>0,cc=bad?C.bad:peakU>.8?C.warn:C.ok;
      g('line',{x1:x0,x2:x1,y1:Y(capQ),y2:Y(capQ),stroke:cc,'stroke-width':2});
      g('text',{x:x1-4,y:Y(capQ)-6,'text-anchor':'end','font-size':12,'font-weight':650,fill:cc,class:'est-halo',text:`容量 ${n} 台 × ${util.fmt(P.inst)} = ${q(capQ)}`});
      fixFill(svg);stats.set('n',n+' 台','info');
      stats.set('u',util.pct(peakU,0),peakU>1?'bad':peakU>.8?'warn':'ok');
      stats.set('hrs',trimN(hrs)+' 小时',hrs?'bad':'ok');
      stats.set('over',over?util.pct(over/(R.avg*86400),1)+' 的请求':'无',over?'bad':'ok');
      verdict.textContent=bad?`按这个口径，一天里有 ${trimN(hrs)} 小时流量高于容量，约 ${util.pct(over/(R.avg*86400),1)} 的请求只能排队、超时或被拒。平均值把忙闲时段摊平了。`
        :peakU>.9?`高峰时利用率 ${util.pct(peakU,0)}：总量刚好够，但排队延迟会陡增，坏一台就不够。`
        :mode==='n1'?`高峰利用率 ${util.pct(peakU,0)}，并且坏一台后其余机器仍能把利用率控制在 70% 左右。`:`高峰利用率 ${util.pct(peakU,0)}，留出了排队和突发的余量。`;
    }
    ctx.onResize(w=>{if(Math.abs(w-W)>8){W=Math.max(300,Math.round(w));draw()}});
    set({},true);

    const prep=async o=>{set({...TW,...o},true);syncCtl();modeCtl.set('avg',true);mode='avg';draw();for(const k in cards)cards[k].card.classList.remove('on');await ctx.wait(400)};
    ctx.scenarios([
      {id:'twitter',label:'复算正文 Twitter 示例',
        ask:'3 亿 MAU、50% 日活、每人每天发 2 条、10% 带 1 MB 媒体、保留 5 年。平均写 QPS、峰值写 QPS 和 5 年媒体存储各是多少？',
        insight:'150M DAU × 2 = 300M 条/天，÷ 86,400 ≈ 3,472 条/秒（约 3,500），峰值 × 2 ≈ 6,944（约 7,000）。媒体每天 30 TB，5 年 54.75 PB（约 55 PB）。文本和 ID 每天只有约 61 GB，是媒体的 0.2%，量级上可以忽略。55 PB 只是裸数据，按 3 副本就是约 164 PB。',
        async run(){
          await prep({});
          for(const k of ['dau','daily','wq','wp','mday','tday','mtot']){cards[k].card.classList.add('on');await ctx.wait(1000);cards[k].card.classList.remove('on')}
          set({copies:3});syncCtl();cards.copies.card.classList.add('on');await ctx.wait(1600);cards.copies.card.classList.remove('on');
        }},
      {id:'ops10',label:'每天操作 2 次 → 10 次',
        ask:'DAU 不变，每人每天从发 2 条变成 10 条。平均 QPS、峰值 QPS 和 5 年媒体存储各变成原来的几倍？',
        insight:'都是 ×5，不是 ×8（多了 8 次，但总次数是 10 ÷ 2 = 5 倍）：平均写 QPS 3,472 → 17,361，峰值 6,944 → 34,722；媒体每天 30 → 150 TB，5 年 54.75 → 273.75 PB；按峰值算的实例数从 20 台到 100 台。存储跟着变 5 倍的前提是每次操作都新增同样多的数据；日活比例这类不相关的格子不会闪。',
        async run(){await prep({});await ctx.wait(900);set({wpd:10});syncCtl();await ctx.wait(3500)}},
      {id:'avgonly',label:'只按平均 QPS 买机器',
        ask:'单实例在目标延迟下稳定承载 350 QPS。按平均写 QPS（约 3,472）买 10 台，一天里有多久扛不住？按峰值要几台，为什么还不够稳？',
        insight:'10 台的容量 3,500 只比平均高一点，一天有 14.25 小时流量高于它，约 23% 的请求要排队或失败。按峰值 20 台时高峰利用率 99%，总量刚好够，但排队延迟陡增，也经不起坏一台。目标利用率 70% 需要 29 台，再留 1 台冗余是 30 台，和正文「26～30 个」的量级一致。',
        async run(){
          await prep({});await ctx.wait(2200);
          for(const m of ['peak','u70','n1']){modeCtl.set(m,true);mode=m;draw();await ctx.wait(2400)}
        }},
    ]);
  }
});

/* ---------------- 实验二：可用性与停机时间 ---------------- */
const AV=[[.99,'99%'],[.995,'99.5%'],[.999,'99.9%'],[.9995,'99.95%'],[.9999,'99.99%'],[.99999,'99.999%']];
const NINES=[[.99,'两个 9','3.65 天'],[.999,'三个 9','8.76 小时'],[.9999,'四个 9','52.6 分钟'],[.99999,'五个 9','5.26 分钟'],[.999999,'六个 9','31.5 秒']];
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
  title:'几个 9：串联相乘，冗余相并',
  summary:'一次请求要依次用到下面的组件。每一行是抽样的一年，红色是停机；任一必需组件停机，端到端就失败。改可用性、加副本或标成可降级，对照公式和这一年的停机。',
  caveat:'每个副本一年的停机时长正好是 (1 − 可用性) × 8,760 小时，拆成几段随机放进这一年；「独立」时各副本互不相关。公式假设故障独立、统计口径一致。故障条按最小宽度画出以便看见，长度不按比例。',
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
    const POOL=[['缓存',.999],['短信通知',.99],['认证服务',.9999],['消息队列',.9995],['DNS',.99999]];
    let uid=0,seed=11,common=false;
    const mk=(name,a,copies=1,req=true)=>({id:++uid,name,a,copies,req});
    let comps=[mk('API 服务',.999),mk('数据库',.999),mk('支付网关',.999)];
    const commonCtl=ctx.toggle({label:'副本在同一机房（一起坏）',value:false,onChange:v=>{common=v;render()}});
    ctx.button('+ 添加依赖',()=>{if(comps.length>=5)return;const p=POOL.find(([n])=>!comps.some(c=>c.name===n));if(p){comps.push(mk(p[0],p[1]));render()}});
    ctx.button('再抽一年',()=>{seed+=7;render()});
    const list=h('div',{class:'avn-list'}),holder=h('div'),foot=h('p',{class:'sdl-note',style:{margin:'2px 0 0'}}),formula=h('p',{class:'avn-formula'}),nines=h('div',{class:'avn-nines'});
    ctx.stage.append(list,holder,foot,formula,nines);
    const stats=ctx.stats([{key:'a',label:'端到端可用性（公式）'},{key:'d',label:'每年停机（公式）'},{key:'s',label:'这一年实际停机（抽样）'}]);
    let W=600;
    function rowUI(c){
      const sel=h('select',{'aria-label':c.name+' 的可用性'},AV.map(([v,l])=>h('option',{value:v},l)));sel.value=String(c.a);
      sel.onchange=()=>{c.a=+sel.value;render()};
      const seg=h('div',{class:'sdl-btnrow',role:'group','aria-label':'副本数'},[1,2,3].map(n=>h('button',{type:'button','aria-pressed':String(c.copies===n),onclick:()=>{c.copies=n;render()}},n===1?'单台':n+' 副本')));
      const req=h('input',{type:'checkbox',checked:c.req});req.onchange=()=>{c.req=req.checked;render()};
      return h('div',{class:'avn-row'+(c.req?'':' opt')},h('b',null,c.name),sel,seg,h('label',null,req,'必需'),comps.length>1?h('button',{type:'button',class:'x',title:'移除 '+c.name,onclick:()=>{comps=comps.filter(x=>x!==c);render()}},'移除'):null);
    }
    const compA=c=>common?c.a:1-Math.pow(1-c.a,c.copies);
    function render(){
      list.replaceChildren(...comps.map(rowUI));
      // 抽样
      const rows=[];
      for(const c of comps){
        const copies=util.range(c.copies).map(j=>genOut(seed*1000+c.id*10+(common?0:j),c.a));
        c.out=c.copies>1?inter(copies[0],copies.slice(1)):copies[0];c.copyOut=copies;
      }
      const req=comps.filter(c=>c.req),e2e=union(req.map(c=>c.out));
      const A=req.reduce((p,c)=>p*compA(c),1);
      // 画一年
      const narrow=W<560,LW=narrow?76:104,RW=narrow?62:84,x0=LW,x1=W-RW,X=hr=>x0+(x1-x0)*hr/YEAR;
      const lines=[];let y=22;
      for(const c of comps){
        if(c.copies>1){c.copyOut.forEach((o,j)=>{lines.push({y,h:8,label:'副本 '+(j+1),out:o,sub:true,opt:!c.req});y+=15});}
        lines.push({y,h:14,label:c.name+(c.copies>1?(common?'（同坏）':'（任一在线）'):''),out:c.out,opt:!c.req,name:c.name});y+=c.copies>1?26:24;
      }
      y+=4;lines.push({y,h:18,label:'端到端',out:e2e,e2e:true});const H=y+26;
      holder.replaceChildren();
      const svg=ctx.svg(W,H,{parent:holder,label:'抽样一年里各组件与端到端的停机时间段'});
      const g=(t,a)=>{const e=ctx.svgEl(t,a);svg.append(e);return e};
      const months=narrow?[0,3,6,9]:util.range(12);
      for(const m of months)g('text',{x:X(m*730),y:13,'font-size':12,fill:C.muted,text:(m+1)+'月'});
      for(const r of lines){
        const yy=r.y;
        g('text',{x:r.sub?14:4,y:yy+r.h/2+4,'font-size':12,'font-weight':r.sub?400:650,fill:r.sub?C.muted:C.ink,text:narrow&&r.label.length>6?r.label.slice(0,6)+'…':r.label});
        g('rect',{x:x0,y:yy,width:x1-x0,height:r.h,rx:3,fill:r.e2e?'#eef4ee':'#f3f6f1',stroke:r.e2e?'#9ccbad':'none'});
        for(const [a,b] of r.out){const xa=X(a),w=Math.max(2.2,X(b)-xa);g('rect',{x:xa,y:yy,width:w,height:r.h,fill:r.opt?'#b9c3bc':C.bad,opacity:r.sub?.55:1})}
        const hrs=len(r.out);
        g('text',{x:W-4,y:yy+r.h/2+4,'text-anchor':'end','font-size':12,'font-weight':r.e2e?700:400,fill:r.e2e?C.bad:C.muted,text:hrs?util.duration(hrs*3600):'0'});
      }
      foot.textContent=req.length<comps.length?'灰色是可降级的组件：它停机时请求仍能成功，不计入端到端。':'红条是停机；「端到端」这一行是所有必需组件停机时间的并集。';
      fixFill(svg);
      // 公式与统计
      const part=c=>{const p=AV.find(x=>x[0]===c.a)[1];return c.copies>1&&!common?`(1 − ${trimN((1-c.a)*100,3)}%${c.copies===2?'²':'³'})`:p};
      formula.textContent=req.length?`端到端 = ${req.map(part).join(' × ')} = ${util.pct(A,4)}`:'没有必需组件';
      const down=(1-A)*YEAR*3600;
      stats.set('a',util.pct(A,4),A>=.999?'ok':A>=.99?'warn':'bad');
      stats.set('d',util.duration(down),A>=.999?'ok':A>=.99?'warn':'bad');
      stats.set('s',len(e2e)?util.duration(len(e2e)*3600):'0（副本停机没有重叠）','info');
      nines.replaceChildren(h('span',{style:{border:'0',background:'none',padding:'1px 0'}},'端到端达到的档位：'),...NINES.map(([v,l,d],i)=>{const next=NINES[i+1];const on=A>=v&&(!next||A<next[0]);return h('span',{class:on?'on':null},`${l} · 每年 ${d}`)}));
      ctx.announce(`端到端可用性 ${util.pct(A,4)}，每年约停机 ${util.duration(down)}`);
    }
    ctx.onResize(w=>{if(Math.abs(w-W)>8){W=Math.max(300,Math.round(w));render()}});
    const reset=(list,cm=false)=>{uid=0;comps=list.map(x=>mk(...x));common=cm;commonCtl.set(cm,true);seed=11;render()};
    ctx.scenarios([
      {id:'series',label:'三个 99.9% 串联',
        ask:'API、数据库、支付网关各 99.9%，一次付款三者都要用到。端到端可用性约多少？一年停机多久？',
        insight:'0.999³ ≈ 99.7003%，每年约 26.3 小时，是单个组件（8.8 小时）的约 3 倍，也低于任何一个组件。抽样的这一年里三者的故障几乎不重叠，端到端停机约等于三段相加；公式里扣掉的正是极少的重叠。',
        async run(){reset([['API 服务',.999],['数据库',.999],['支付网关',.999]]);await ctx.wait(3000)}},
      {id:'redundant',label:'给数据库加一个副本',
        ask:'给数据库加一个独立的副本，任一台在线即可。端到端能回到 99.9% 吗？三个组件都做双副本呢？',
        insight:'只给数据库加副本：数据库合成后约 99.9999%，但另外两个 99.9% 还串在链路上，端到端约 99.8%，每年约 17.5 小时。三个都做双副本，端到端约 99.9997%，每年只剩约 95 秒；抽样的这一年里两份副本的停机恰好没有重叠，端到端一次也没停。前提是副本故障相互独立。',
        async run(){reset([['API 服务',.999],['数据库',.999],['支付网关',.999]]);await ctx.wait(1500);comps[1].copies=2;render();await ctx.wait(3000);comps.forEach(c=>c.copies=2);render();await ctx.wait(3000)}},
      {id:'common',label:'副本共用一个机房',
        ask:'三个组件都做了双副本，但每对副本共用同一个机房电源，总是一起坏。端到端还剩多少？',
        insight:'回到 99.7003%、每年约 26.3 小时，和没加副本一样。冗余只在故障相互独立时有效；共用电源、网络、DNS 的故障要当成一个整体来算，不能直接套乘法。',
        async run(){reset([['API 服务',.999,2],['数据库',.999,2],['支付网关',.999,2]]);await ctx.wait(2000);commonCtl.set(true,true);common=true;render();await ctx.wait(3000)}},
      {id:'optional',label:'再接一个 99% 的短信服务',
        ask:'付款成功后要发短信，短信服务只有 99%。如果把它放在付款链路里同步调用，端到端会怎样？改成异步发送、失败重试呢？',
        insight:'同步调用时端到端约 98.7%，每年停机约 4.7 天：串联链路的可用性不会高于最差的那个必需组件。改成异步后短信不再是成功条件（灰色），端到端回到 99.7003%。降级、缓存、异步都会改变成功条件，算之前先重画哪些组件是必需的。',
        async run(){reset([['API 服务',.999],['数据库',.999],['支付网关',.999],['短信通知',.99]]);await ctx.wait(3200);comps[3].req=false;render();await ctx.wait(3000)}},
    ]);
    render();
  }
});
})();
