/* 第 21 章：广告点击事件聚合。实验一：事件时间、窗口与水位线；实验二：offset 与结果的提交顺序。 */
(function(){
const {el:h,util}=SDLab;
let uid=0;
const until=async(ctx,cond)=>{let n=0;while(!cond()&&n<1200){await ctx.wait(50);n++}};
const p2=n=>String(n).padStart(2,'0');
const clock=(s,sec=true)=>{s=Math.max(0,Math.floor(s));const hh=12+Math.floor(s/3600),mm=Math.floor(s%3600/60);return p2(hh)+':'+p2(mm)+(sec?':'+p2(s%60):'')};

/* ---------------- 实验一：事件时间、窗口与水位线 ---------------- */
SDLab.define({
  id:'stream-window',chapter:21,
  title:'事件时间、窗口与水位线',
  summary:'广告 ad001 的点击流：每个点按事件时间（点击发生的时刻）落在横轴上，空心点是已经发生、还在路上的点击。水位线越过窗口终点，窗口才输出结果。拖动乱序容忍和允许迟到，比较结果多快产出、有多少迟到点击被丢弃或更正。',
  caveat:'水位线 = 已见最大事件时间 − 乱序容忍（有界乱序），只进不退；允许迟到期内的迟到点击会让窗口发出新版本的完整结果，下游按（广告, 窗口, 版本）写绝对值；超期的点击进侧输出，留给每日对账。点击间隔与网络延迟用固定种子随机生成；不模拟节点故障与事务提交，这部分见下一个实验。',
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
    const L=(t,tone)=>{if(!S.quiet)ctx.log(`[处理时间 ${clock(S.t)}] `+t,tone)};
    function fresh(){S={t:0,rng:util.rng(21),nextEt:3,nid:0,evs:[],pend:[],maxEt:-1e9,wm:-1e9,wins:new Map(),side:0,corr:0,stopAt:null,hi:null,quiet:false,agenda:[]}}
    function win(k){let w=S.wins.get(k);if(!w){w={k,count:0,truth:0,out:null,ver:0,fireT:0,purged:false};S.wins.set(k,w)}return w}
    function gen(){
      while(S.nextEt<=S.t){
        const r=S.rng,et=S.nextEt,u=r(),id=S.nid+1;
        /* 大多数点击几秒内到达，少数晚几十秒；每 37 次有一次像手机离线后补报那样晚 2 分钟以上。 */
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
        else if(!w.purged){w.count++;w.ver++;w.out=w.count;corr=true;S.corr++;e.ws.push(k);L(`晚到 ${Math.round(e.d)} 秒的点击（发生于 ${clock(e.et)}）更正窗口 ${wl(k)}：发出 v${w.ver} = ${w.out}`,'warn')}
        else side=true;
      }
      if(side){S.side++;L(`晚到 ${Math.round(e.d)} 秒的点击（发生于 ${clock(e.et)}）所属窗口已关闭，进侧输出等对账`,'bad')}
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

    /* ---- 舞台 ---- */
    const status=h('div',{class:'sw-status'}),svgBox=h('div');
    const dotL=(col,txt,hollow)=>h('span',null,h('i',{style:hollow?{border:'1.5px solid #9aa89f'}:{background:col}}),txt);
    const legend=h('div',{class:'sw-legend'},dotL(0,'已发生、还在路上',1),dotL(C.info,'已到达，窗口未输出'),dotL(C.ok,'已计入输出'),dotL(C.warn,'迟到，已更正结果'),dotL(C.bad,'迟到被丢弃进侧输出 / 按到达时刻算错了窗口'));
    const recBox=h('div',{class:'sdl-scroll sw-rec'});
    ctx.stage.append(status,svgBox,legend,recBox);
    const st=ctx.stats([{key:'n',label:'已输出窗口'},{key:'lat',label:'窗口结束后多久出结果'},{key:'corr',label:'更正次数'},{key:'side',label:'进侧输出（待对账）'},{key:'err',label:'已输出结果与实际之差'}]);
    const S_=(t,a,...k)=>ctx.svgEl(t,a,...k);
    function build(){
      const narrow=W<560,x0=6,x1=W-6,cw=x1-x0,span=narrow?210:300,dy0=22,DH=narrow?96:104,ax=dy0+DH+15,ry=ax+10,RH=P.win==='tumble'?42:3*24-4,H=ry+RH+6;
      const svg=S_('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'按事件时间排列的点击、窗口与水位线'});
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
      // 分钟边界与坐标
      const m0=Math.ceil(vS/60),ms=[];for(let m=m0;m*60<=vEnd;m++)ms.push(m);
      while(G.lines.length<ms.length){const l=S_('line',{y1:dy0,y2:dy0+DH,stroke:'#b9c4bc','stroke-dasharray':'3 3'}),t=S_('text',{y:ax,'font-size':12,fill:C.muted,'text-anchor':'middle'});G.gLines.append(l,t);G.lines.push([l,t])}
      G.lines.forEach(([l,t],i)=>{const m=ms[i];if(m==null){l.setAttribute('display','none');t.setAttribute('display','none');return}const x=X(m*60);ctx.attr(l,{display:null,x1:x,x2:x});ctx.attr(t,{display:null,x,text:clock(m*60,false)})});
      // 点
      const seen=new Set();
      for(const e of S.evs){
        if(e.et>S.t||e.et<vS-10)continue;seen.add(e.id);let d=G.dots.get(e.id);
        if(!d){d=S_('circle',{r:G.narrow?4.5:5,'stroke-width':1.5,style:'cursor:pointer'});d.append(S_('title'));d.addEventListener('click',()=>{S.hi=S.hi===e.id?null:e.id;draw()});G.gDots.append(d);G.dots.set(e.id,d)}
        const f=dotFill(e);ctx.attr(d,{cx:X(e.et),cy:dy0+10+e.y*(DH-20),fill:f,stroke:f==='none'?'#9aa89f':(S.hi===e.id?C.ink:'#fff'),'stroke-width':S.hi===e.id?2.5:1.5,r:S.hi===e.id?7:(G.narrow?4.5:5)});
        const tt=`发生 ${clock(e.et)}，${e.at?'到达 '+clock(e.arr)+`（晚 ${Math.round(e.d)} 秒）`:'还在路上'}`;if(d.firstChild.textContent!==tt)d.firstChild.textContent=tt;
      }
      for(const [k,d] of G.dots)if(!seen.has(k)){d.remove();G.dots.delete(k)}
      // 窗口结果
      const hiE=S.hi&&S.evs.find(e=>e.id===S.hi),hiK=hiE?keysOf(P.mode==='proc'&&hiE.at?hiE.arr:hiE.et):[];
      const ks=[];for(let k=Math.max(0,Math.floor((vS-winLen())/60));k*60<=vEnd;k++)ks.push(k);
      const keep=new Set();
      for(const k of ks){
        const w=win(k),xa=X(k*60),xb=X(wEnd(k)),row=P.win==='tumble'?0:k%3,y=ry+row*24,hh=P.win==='tumble'?RH:20;keep.add(k);
        let r=G.res.get(k);if(!r){const g=S_('g'),rect=S_('rect',{rx:5,height:hh}),t1=S_('text',{'font-size':12,'text-anchor':'middle','font-weight':650}),t2=S_('text',{'font-size':12,'text-anchor':'middle'});g.append(rect,t1,t2);G.gRes.append(g);r={g,rect,t1,t2};G.res.set(k,r)}
        const fired=w.out!=null,bad=fired&&w.out!==w.truth,hi=hiK.includes(k);
        ctx.attr(r.rect,{x:xa+1.5,y,width:Math.max(0,xb-xa-3),height:hh,fill:fired?C.okSoft:'#eef1ec',stroke:hi?C.ink:fired?(bad?C.bad:'#9fcfb0'):'#cfd8cc','stroke-width':hi?2.5:1});
        const vs=Math.max(xa,x0),ve=Math.min(xb,x1),cx=(vs+ve)/2,room=ve-vs;
        const l1=fired?'输出 '+w.out+(w.ver>1?' · v'+w.ver:''):'累计 '+w.count,l2=P.win==='tumble'?(fired?(bad?'实际 '+w.truth:'与实际一致'):P.mode==='proc'?'等窗口结束':'等水位线'):'';
        if(P.win==='tumble'){ctx.attr(r.t1,{x:cx,y:y+17,text:room>54?l1:'',fill:fired?'#1d6a41':C.muted});ctx.attr(r.t2,{x:cx,y:y+33,text:room>54?l2:'',fill:bad?C.bad:C.muted})}
        else{ctx.attr(r.t1,{x:cx,y:y+14,text:room>70?l1+(bad?'（实际 '+w.truth+'）':''):'',fill:bad?C.bad:fired?'#1d6a41':C.muted});r.t2.textContent=''}
      }
      for(const [k,r] of G.res)if(!keep.has(k)){r.g.remove();G.res.delete(k)}
      // 窗口背景：已输出的滚动窗口
      G.gWinBg.replaceChildren();
      if(P.win==='tumble')for(const k of ks){const w=S.wins.get(k);if(w&&w.out!=null)G.gWinBg.append(S_('rect',{x:X(k*60),y:dy0,width:X(wEnd(k))-X(k*60),height:DH,fill:C.okSoft,opacity:.45}))}
      // 现在与水位线
      const xn=X(S.t);ctx.attr(G.nowL,{x1:xn,x2:xn});ctx.attr(G.nowT,{x:Math.min(xn+3,x1-30),text:'现在'});
      if(P.mode==='event'&&S.wm>-1e8){const xw=X(S.wm);ctx.attr(G.wmL,{x1:xw,x2:xw,display:null});ctx.attr(G.wmT,{x:Math.max(xw-3,x0+44),text:'水位线',display:null});ctx.attr(G.band,{x:xw,width:Math.max(0,xn-xw),display:null})}
      else{G.wmL.setAttribute('display','none');G.wmT.setAttribute('display','none');G.band.setAttribute('display','none')}
      status.replaceChildren(...(P.mode==='event'?['处理时间 ',h('b',null,clock(S.t)),' · 已见最大事件时间 ',h('b',null,S.maxEt>0?clock(S.maxEt):'—'),' · 水位线 ',h('b',null,S.wm>0?clock(S.wm):'—'),`（= 最大事件时间 − ${P.delay} 秒）`]:['处理时间 ',h('b',null,clock(S.t)),' · 按到达时刻归属窗口，窗口一结束就输出，不等迟到点击']));
      const c=calc();
      st.set('n',c.n);st.set('lat',c.lat==null?'—':c.lat.toFixed(1)+' 秒',c.lat>30?'warn':null);st.set('corr',S.corr,S.corr?'warn':null);st.set('side',S.side,S.side?'bad':null);st.set('err',c.err,c.err?'bad':'ok');
    }
    function record(label){
      const c=calc();recs.push([label||'手动记录',P.mode==='event'?'事件时间':'处理时间',P.win==='tumble'?'滚动 1 分钟':'滑动 3 分钟',P.mode==='event'?P.delay+' 秒':'—',P.mode==='event'?P.late+' 秒':'—',c.n,c.lat==null?'—':c.lat.toFixed(1)+' 秒',S.corr,P.mode==='event'?S.side:c.wrong+'（错窗）',c.err]);
      if(recs.length>6)recs.shift();
      recBox.replaceChildren(h('table',{class:'sdl-table'},h('caption',null,'记录的运行结果（同一段点击流）'),h('thead',null,h('tr',null,...['记录','归属','窗口','乱序容忍','允许迟到','输出窗口','平均出结果','更正','丢弃','与实际差'].map(x=>h('th',null,x)))),h('tbody',null,...recs.map(r=>h('tr',null,...r.map(x=>h('td',null,String(x))))))));
    }

    /* ---- 控件 ---- */
    const modeCtl=ctx.segmented({label:'窗口归属依据',value:P.mode,options:[['event','事件时间'],['proc','处理时间']],onChange:v=>{P.mode=v;restart()}});
    const winCtl=ctx.segmented({label:'窗口（滑动窗口每 1 分钟一个）',value:P.win,options:[['tumble','滚动 1 分钟'],['slide','滑动 3 分钟']],onChange:v=>{P.win=v;restart(true)}});
    const sD=ctx.slider({label:'乱序容忍',min:0,max:60,step:5,value:P.delay,format:v=>v+' 秒',onChange:v=>{P.delay=v;restart()},hint:'水位线 = 已见最大事件时间 − 这个值'});
    const sL=ctx.slider({label:'允许迟到（allowed lateness）',min:0,max:120,step:10,value:P.late,format:v=>v+' 秒',onChange:v=>{P.late=v;restart()},hint:'水位线越过窗口终点后，窗口状态再保留多久'});
    const playCtl=ctx.segmented({label:'播放',value:1,options:[[0,'暂停'],[1,'1×'],[3,'3×']],onChange:v=>{S.stopAt=null;setSpeed(v)}});
    ctx.button('重新开始',()=>restart(),{primary:true});
    ctx.button('记下本次结果',()=>record());
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
      {id:'proc',label:'按到达时刻归属',
        ask:'不看点击发生的时间，按服务器收到它的时刻归入分钟窗口，窗口一结束就输出。从 12:00 跑到 12:07:30：有多少点击会被算进错误的分钟？各窗口的输出和实际点击数一致吗？',
        insight:'到达的 97 次点击里有 12 次跨过分钟边界才到，被算进了后面的分钟（红点）；7 个已输出窗口有 5 个和实际对不上，合计差 9。好处是窗口一结束就出结果，但它统计的是「什么时候到」而不是「什么时候点」，计费会记错时段。',
        async run(){clearRec();await phase({mode:'proc'},450,'处理时间',2)}},
      {id:'wm',label:'乱序容忍 5 秒 vs 40 秒',
        ask:'改按事件时间归属，允许迟到为 0。乱序容忍 5 秒和 40 秒各跑 7 分钟：哪次被丢进侧输出的迟到点击更少？窗口结束后多久才出结果？',
        insight:'看下方记录表：容忍 5 秒时，窗口结束后平均 13.7 秒出结果，但有 5 次点击到得太晚、进了侧输出；容忍 40 秒时丢弃降到 2 次，代价是平均要等 48.2 秒，同样的时间里只来得及输出 6 个窗口。剩下的 2 次分别晚了 51 秒和 134 秒：有限的等待接不住所有迟到点击，只能靠对账修正。',
        async run(){clearRec();await phase({delay:5},450,'容忍 5 秒',3);await ctx.wait(600);await phase({delay:40},450,'容忍 40 秒',3)}},
      {id:'late',label:'允许迟到：发更正版本',
        ask:'乱序容忍 10 秒，另外允许迟到 60 秒：窗口输出以后才到的点击还会被丢掉吗？下游会收到什么？',
        insight:'窗口仍在水位线越过终点时先输出；之后到达的迟到点击（晚了 26–58 秒）让 4 个窗口各发出一个 v2（琥珀色点）。只有晚了 134 秒的那次超出允许迟到，进了侧输出。更正版本携带窗口的完整计数，下游按（广告, 窗口, 版本）覆盖写，重复收到同一版本也不会重复累加。「与实际之差」里还包括仍在路上的点击。',
        async run(){clearRec();await phase({delay:10,late:60},450,'容忍 10 秒 + 允许迟到 60 秒',2)}},
      {id:'slide',label:'滑动窗口：一次点击算几次',
        ask:'改成长 3 分钟、每 1 分钟滑动一次的窗口。运行结束时会选中一次点击（放大的圆点），它会被算进几个窗口？相邻窗口的计数能直接相加吗？',
        insight:'被选中的点击（大圆点）同时属于 3 个重叠的窗口（加粗边框），每个都把它算了一次，所以相邻窗口的计数不能相加，只能各自回答「最近 3 分钟有多少点击」。滚动窗口互不重叠，每分钟的结果才可以相加。',
        async run(){clearRec();await phase({win:'slide',delay:10},450,null,2);const c=S.evs.filter(e=>e.at&&e.st==='in'&&e.et>300&&e.et<330);if(c.length)S.hi=c[0].id;draw();await ctx.wait(800)}},
    ]);
  }
});

/* ---------------- 实验二：offset 与结果的提交顺序 ---------------- */
SDLab.define({
  id:'agg-exactly-once',chapter:21,
  title:'聚合节点崩溃：结果会重复还是丢失',
  summary:'聚合节点读取 offset 100–109 的 10 次点击，算出 ad001 在 12:00 这一分钟的计数，再把结果交给下游并记录读到哪里。逐步执行，在两步之间注入崩溃，看不同的提交顺序会让下游多算、漏算还是恰好算对。',
  caveat:'每一步代表一次独立的写入或处理；崩溃后由新节点接管，从上游已提交的 offset 重新读取。「原子提交」泛指把结果与 offset 放进同一个事务或检查点；幂等写要求下游用稳定的键覆盖写绝对值，并拒绝旧版本覆盖新版本。',
  mount(ctx){
    ctx.css('eo',`
.eo-list{display:flex;flex-direction:column;border:1px solid #dbe2da;border-radius:10px;overflow:hidden;font-size:13px}
.eo-row{display:grid;grid-template-columns:34px 92px minmax(0,1fr) 170px;gap:8px;align-items:center;padding:6px 10px;border-top:1px solid #e8ede6;line-height:1.45}
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
      send:{label:'先发结果，再提交 offset',steps:[
        ['agg','读取 offset 100–109，共 10 次点击'],['agg','内存里计数：ad001 @12:00 = 10'],
        ['down','发送结果，下游执行 count += 10',s=>{s.down+=10}],
        ['crash','崩溃：offset 还没提交'],
        ['up','新节点接管，从已提交的 offset 100 读起'],['agg','再读 offset 100–109，重新计数得 10'],
        ['down','再次发送，下游又执行 count += 10',s=>{s.down+=10}],['up','提交 offset 110',s=>{s.off=110}]],
        verdict:s=>`下游是 ${s.down}，实际只有 ${TRUE} 次点击，重复计了一倍。结果已送达、确认却丢了，重放时就会重复发送。`},
      offset:{label:'先存 offset，再发结果',steps:[
        ['agg','读取 offset 100–109，共 10 次点击'],['agg','内存里计数：ad001 @12:00 = 10'],
        ['up','先把 offset 110 存到 HDFS / S3',s=>{s.off=110}],
        ['crash','崩溃：结果还没发出'],
        ['up','新节点接管，从 offset 110 读起'],['agg','100–109 被当成已处理，不会再读']],
        verdict:s=>`下游是 ${s.down}，这 ${TRUE} 次点击的结果永久漏发。进度记得比结果早，崩溃就会漏。`},
      atomic:{label:'结果与 offset 原子提交',steps:[
        ['agg','读取 offset 100–109，共 10 次点击'],['agg','内存里计数：ad001 @12:00 = 10'],
        ['down','开启事务：写入结果 10 与 offset 110（尚未提交）'],
        ['crash','崩溃：事务中止，结果和 offset 都没生效'],
        ['up','新节点接管，从 offset 100 读起'],['agg','再读 offset 100–109，重新计数得 10'],
        ['down','提交事务：结果 10 与 offset 110 同时生效',s=>{s.down=10;s.off=110}]],
        verdict:s=>`下游是 ${s.down}，与实际一致。结果和进度要么一起生效，要么都不生效，重放不会重复也不会漏。`},
      idem:{label:'下游按键幂等写',steps:[
        ['agg','读取 offset 100–109，共 10 次点击'],['agg','内存里计数：ad001 @12:00 = 10'],
        ['down','按键 (ad001, 12:00, v1) 写入绝对值 10',s=>{s.down=10}],
        ['crash','崩溃：offset 还没提交'],
        ['up','新节点接管，从已提交的 offset 100 读起'],['agg','再读 offset 100–109，重新计数得 10'],
        ['down','同一个键再写一次 10：覆盖，不累加',s=>{s.down=10}],['up','提交 offset 110',s=>{s.off=110}]],
        verdict:s=>`下游是 ${s.down}，与实际一致。重复发送仍会发生，但同一键写绝对值不会重复累加；这就是原文说的「下游幂等时可以不用分布式事务」。`},
    };
    const WHO={agg:['info','聚合节点'],up:['','上游 offset'],down:['ok','下游结果'],crash:['bad','崩溃']};
    let mode='send',crashOn=true,steps=[],idx=0,S,rows=[];
    const list=h('div',{class:'eo-list',role:'table','aria-label':'执行步骤'}),verdict=h('p',{class:'eo-verdict'});
    ctx.stage.append(list,verdict);
    ctx.onResize(w=>list.classList.toggle('eo-narrow',w<560));
    const st=ctx.stats([{key:'off',label:'上游已提交 offset'},{key:'down',label:'下游计数'},{key:'truth',label:'实际点击',value:String(TRUE)},{key:'res',label:'结果'}]);
    const modeCtl=ctx.segmented({label:'提交顺序',value:mode,wide:true,options:Object.entries(MODES).map(([k,v])=>[k,v.label]),onChange:v=>{mode=v;build()}});
    const crashCtl=ctx.toggle({label:'在两步之间注入崩溃',value:crashOn,onChange:v=>{crashOn=v;build()}});
    const nextBtn=ctx.button('下一步',()=>step(),{primary:true});
    ctx.button('自动播放',()=>{autoplay().catch(()=>{})});
    ctx.button('从头开始',()=>build());
    function build(){
      S={off:100,down:0};idx=0;
      let all=MODES[mode].steps;
      if(!crashOn){const ci=all.findIndex(s=>s[0]==='crash');const pre=all.slice(0,ci);all=mode==='atomic'?[...pre.slice(0,2),['down','提交事务：结果 10 与 offset 110 同时生效',s=>{s.down=10;s.off=110}]]:mode==='offset'?[...pre,['down','发送结果，下游执行 count += 10',s=>{s.down+=10}]]:[...pre,['up','提交 offset 110',s=>{s.off=110}]]}
      steps=all;
      list.replaceChildren(h('div',{class:'eo-row hd'},h('span',null,'#'),h('span',null,'谁'),h('span',null,'动作'),h('span',null,'之后的状态')));
      rows=steps.map((s,i)=>{const [tone,name]=WHO[s[0]];const state=h('span',{class:'eo-state'});const row=h('div',{class:'eo-row future'},h('span',{class:'sdl-tag'+(tone?' '+tone:'')},String(i+1)),h('span',{class:'who'},name),h('span',{class:'what'},s[1]),state);list.append(row);return {row,state}});
      verdict.textContent='点击「下一步」逐步执行。';nextBtn.disabled=false;update();
    }
    function update(){const done=idx>=steps.length;st.set('off',S.off);st.set('down',S.down,S.down===TRUE?'ok':S.down>TRUE?'bad':S.down===0&&done?'bad':null);st.set('res',done?(S.down===TRUE?'计数正确':S.down>TRUE?'重复计数':'漏计'):'—',done?(S.down===TRUE?'ok':'bad'):null)}
    function step(){
      if(idx>=steps.length)return;const s=steps[idx],r=rows[idx];
      rows.forEach(x=>x.row.classList.remove('cur'));
      if(s[2])s[2](S);
      r.row.classList.remove('future');r.row.classList.add(s[0]==='crash'?'crash':'cur');r.state.textContent=`offset ${S.off} · 下游 ${S.down}`;
      idx++;update();
      if(idx>=steps.length){nextBtn.disabled=true;verdict.textContent=crashOn?MODES[mode].verdict(S):`没有崩溃时，下游是 ${S.down}，四种顺序都正确。区别只在故障发生在两步之间的时候。`;ctx.announce(verdict.textContent)}
    }
    async function autoplay(){build();while(idx<steps.length){step();await ctx.wait(750)}}
    build();
    const go=m=>async()=>{mode=m;modeCtl.set(m,true);crashOn=true;crashCtl.set(true,true);await autoplay()};
    ctx.scenarios([
      {id:'send',label:'先发结果再提交',ask:'聚合节点把结果发给下游（count += 10）之后、提交 offset 之前崩溃。新节点接管后，下游最终是多少？',insight:'20，重复计了一倍。这对应原文「确认丢失造成重复」的图：只要允许重试，至少一次投递就会带来重复。',run:go('send')},
      {id:'offset',label:'先存进度再发结果',ask:'反过来，先把 offset 110 存起来，再发结果；两步之间崩溃。下游最终是多少？',insight:'0，这 10 次点击的结果永久丢失。调换顺序只是把「重复」换成了「丢失」。',run:go('offset')},
      {id:'atomic',label:'原子提交',ask:'把「写结果」和「写 offset」放进同一个事务，提交前崩溃。下游最终是多少？',insight:'10。事务中止时两者都没生效，新节点从 100 重做，提交时一起生效。代价是需要事务或检查点机制的支持。',run:go('atomic')},
      {id:'idem',label:'下游幂等写',ask:'不用事务，但下游按 (广告, 分钟, 版本) 写绝对值。发送后、提交 offset 前崩溃，下游最终是多少？',insight:'10。网络上结果发了两次，但第二次是同一个键的覆盖写，不再累加：这是「结果恰好一次」，不是「只发送一次」。前提是写绝对值而不是 +10，并且版本号能挡住旧结果覆盖新结果。',run:go('idem')},
    ]);
  }
});
})();
