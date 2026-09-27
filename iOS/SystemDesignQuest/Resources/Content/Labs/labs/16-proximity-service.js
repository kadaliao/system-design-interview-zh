/* 第 16 章：附近地点服务。实验一演示 Geohash 选精度、查九格与边界问题；实验二演示四叉树按密度拆分与 k 近邻查询。 */
(function(){
const {el:h,util}=SDLab;

/* ---------- 共享：原书例子坐标、真实 Geohash 算法、虚拟商家数据（单位 km，x 向东、y 向北） ---------- */
const LAT0=37.776720,LON0=-122.416730;
const KX=111.32*Math.cos(LAT0*Math.PI/180),KY=111.0;
const B32='0123456789bcdefghjkmnpqrstuvwxyz';
const toLL=(x,y)=>[LAT0+y/KY,LON0+x/KX];
function encode(x,y,len){
  const [lat,lon]=toLL(x,y);let lo=[-90,90],ln=[-180,180],bit=0,ch=0,even=true,s='';
  while(s.length<len){const r=even?ln:lo,v=even?lon:lat,m=(r[0]+r[1])/2;if(v>=m){ch=ch*2+1;r[0]=m}else{ch=ch*2;r[1]=m}even=!even;if(++bit===5){s+=B32[ch];bit=0;ch=0}}
  return s;
}
/** 某长度的格子尺寸（度）与编码 code 对应格子的 km 范围。 */
function cellDeg(len){const bits=5*len;return [360/2**Math.ceil(bits/2),180/2**Math.floor(bits/2)]}
function cellBox(x,y,len){
  const [dLon,dLat]=cellDeg(len),[lat,lon]=toLL(x,y);
  const lon0=Math.floor((lon+180)/dLon)*dLon-180,lat0=Math.floor((lat+90)/dLat)*dLat-90;
  return {x0:(lon0-LON0)*KX,x1:(lon0+dLon-LON0)*KX,y0:(lat0-LAT0)*KY,y1:(lat0+dLat-LAT0)*KY};
}
function lcp(list){let p=list[0];for(const s of list)while(!s.startsWith(p))p=p.slice(0,-1);return p}
const BIZ=(()=>{
  const r=util.rng(16),pts=[];
  const cl=[[1.4,1.2,1.0,240],[-0.5,-2.2,0.9,70],[-8,-1,1.4,60],[3,-9,1.6,50],[-10,9,1.2,40],[10,6,1.3,40]];
  for(const [cx,cy,sd,n] of cl)for(let i=0;i<n;i++){const x=cx+r.normal()*sd,y=cy+r.normal()*sd;if(Math.abs(x)<15.9&&Math.abs(y)<15.9)pts.push([x,y])}
  for(let i=0;i<60;i++)pts.push([r()*31.8-15.9,r()*31.8-15.9]);
  return pts;
})();
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const fmtKm=v=>v>=10?v.toFixed(0)+' km':v>=1?v.toFixed(1)+' km':Math.round(v*1000)+' m';
const COL={idle:'#b9c3bc'};
const HALO={stroke:'#fff','stroke-width':3,'paint-order':'stroke','stroke-linejoin':'round'};

/* 按原书对照表，由半径选 Geohash 长度 */
const TABLE=[[0.5,6],[1,5],[2,5],[5,4],[20,4]];

/* ---------------- 实验一：Geohash 九格查询 ---------------- */
SDLab.define({
  id:'geohash-nearby',chapter:16,
  title:'Geohash 附近搜索：选精度、查九格、再精确过滤',
  summary:'点地图设定用户位置，再选搜索半径。LBS 按对照表选 Geohash 长度，取本格和 8 个邻格的商家作为候选，再按真实距离过滤。绿色是返回结果，琥珀色是取回后被距离过滤掉的候选，红色是在半径内却不在九格里、被漏掉的商家。',
  caveat:'商家是围绕原书坐标（37.776720, −122.416730）生成的虚拟数据；Geohash 编码与格子尺寸按真实算法和该纬度计算，距离用局部平面近似。邻格按「本格中心 ± 一个格子」重新编码得到，不处理极区和 180° 经线。',
  mount(ctx){
    ctx.css('gh',`
.gh-cap{font-size:13px;color:#66756d;margin:8px 0 0;line-height:1.6;min-height:3.2em}
.gh-cap b{color:#23352f}
.gh-cap code{font-family:ui-monospace,Menlo,monospace;font-size:13px;background:#eef2ec;border-radius:4px;padding:0 4px;color:#23352f}
.gh-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:#66756d;margin:6px 0 0}
.gh-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:0}
.gh-map{cursor:crosshair;touch-action:manipulation;border:1px solid #e3e9e1;border-radius:10px;background:#f7f9f5}
`);
    const S={x:0,y:0,R:0.5,prec:'auto',shown:[],phase:'done',pair:null};
    const P=()=>S.prec==='auto'?TABLE.find(t=>t[0]===S.R)[1]:+S.prec;
    const radius=ctx.segmented({label:'搜索半径',value:0.5,options:TABLE.map(([r])=>[r,r+' km']),onChange:v=>{S.R=v;ui()}});
    const precCtl=ctx.segmented({label:'Geohash 长度',value:'auto',options:[['auto','按表自动'],['4','4'],['5','5'],['6','6'],['7','7']],onChange:v=>{S.prec=v;ui()}});
    ctx.button('逐步演示查询',()=>ui(),{primary:true});
    ctx.button('回到原书坐标',()=>{S.x=0;S.y=0;S.pair=null;ui()});
    const ui=()=>{run(true).catch(()=>{})};

    let W=600,H=360,view=null;
    const svg=ctx.svg(W,H,{label:'Geohash 网格、查询圆与商家分布'});svg.classList.add('gh-map');
    const gGrid=ctx.svgEl('g'),gCells=ctx.svgEl('g'),gPts=ctx.svgEl('g'),gLab=ctx.svgEl('g'),gTop=ctx.svgEl('g');
    const circle=ctx.svgEl('circle',{fill:'none',stroke:ctx.colors.info,'stroke-width':1.6,'stroke-dasharray':'5 4'});
    svg.append(gGrid,gCells,circle,gPts,gLab,gTop);
    const dots=BIZ.map(()=>{const c=ctx.svgEl('circle',{r:2.6});gPts.append(c);return c});
    const cap=h('p',{class:'gh-cap','aria-live':'polite'});
    const legend=h('div',{class:'gh-legend'},[['返回（半径内）',ctx.colors.ok],['候选但被距离过滤',ctx.colors.warn],['漏掉（圆内但不在所查格子）',ctx.colors.bad],['已取回、尚未过滤',ctx.colors.info],['未取回',COL.idle]].map(([t,c])=>h('span',null,h('i',{style:{background:c}}),t)));
    ctx.stage.append(cap,legend);
    const st=ctx.stats([{key:'code',label:'用户所在格'},{key:'cell',label:'格子（东西 × 南北）'},{key:'cand',label:'取回候选'},{key:'hit',label:'返回（半径内）'},{key:'miss',label:'漏掉'}]);

    function nine(){
      const p=P(),b=cellBox(S.x,S.y,p),w=b.x1-b.x0,hh=b.y1-b.y0,cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2;
      const order=[[0,0],[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]];
      return order.map(([dx,dy])=>{const x=cx+dx*w,y=cy+dy*hh;return {code:encode(x,y,p),box:cellBox(x,y,p)}});
    }
    function fit(cells){
      const bx=cells.reduce((a,c)=>({x0:Math.min(a.x0,c.box.x0),x1:Math.max(a.x1,c.box.x1),y0:Math.min(a.y0,c.box.y0),y1:Math.max(a.y1,c.box.y1)}),{x0:1e9,x1:-1e9,y0:1e9,y1:-1e9});
      const mx=(bx.x1-bx.x0)/6,my=(bx.y1-bx.y0)/6;
      let x0=Math.min(bx.x0-mx,S.x-S.R*1.08),x1=Math.max(bx.x1+mx,S.x+S.R*1.08),y0=Math.min(bx.y0-my,S.y-S.R*1.08),y1=Math.max(bx.y1+my,S.y+S.R*1.08);
      const s=Math.min(W/(x1-x0),H/(y1-y0)),cx=(x0+x1)/2,cy=(y0+y1)/2;
      view={s,cx,cy};
    }
    const X=x=>W/2+(x-view.cx)*view.s,Y=y=>H/2-(y-view.cy)*view.s;
    function drawGrid(){
      gGrid.replaceChildren();
      const p=P(),[dLon,dLat]=cellDeg(p),wx=dLon*KX,wy=dLat*KY;
      const xl=view.cx-W/2/view.s,xr=view.cx+W/2/view.s,yb=view.cy-H/2/view.s,yt=view.cy+H/2/view.s;
      const bx=cellBox(S.x,S.y,p);
      for(let x=bx.x0-Math.ceil((bx.x0-xl)/wx)*wx;x<=xr;x+=wx)gGrid.append(ctx.svgEl('line',{x1:X(x),x2:X(x),y1:0,y2:H,stroke:'#cdd7cf','stroke-width':1}));
      for(let y=bx.y0-Math.ceil((bx.y0-yb)/wy)*wy;y<=yt;y+=wy)gGrid.append(ctx.svgEl('line',{x1:0,x2:W,y1:Y(y),y2:Y(y),stroke:'#cdd7cf','stroke-width':1}));
    }
    function inCells(pt,cells){return cells.some(c=>pt[0]>=c.box.x0&&pt[0]<c.box.x1&&pt[1]>=c.box.y0&&pt[1]<c.box.y1)}
    function paint(){
      const cells=S.all,shown=S.shown;
      gCells.replaceChildren();gLab.replaceChildren();
      const pre=lcp(cells.map(c=>c.code));
      shown.forEach((c,i)=>{
        const x0=X(c.box.x0),x1=X(c.box.x1),y0=Y(c.box.y1),y1=Y(c.box.y0);
        gCells.append(ctx.svgEl('rect',{x:x0,y:y0,width:x1-x0,height:y1-y0,fill:i===0?'#cfe0f3':'#e5eef8',stroke:ctx.colors.info,'stroke-width':i===0?1.8:1,'fill-opacity':0.85}));
        const cw=x1-x0,fs=12,full=cw>c.code.length*fs*0.62+4,head=full?pre:'…',tail=c.code.slice(pre.length);
        const low=i===0&&S.y>(c.box.y0+c.box.y1)/2&&y1-y0>40;
        if((full||cw>(tail.length+1)*fs*0.62+4)&&y1-y0>18){const t=ctx.svgEl('text',{x:(x0+x1)/2,y:low?y1-6:y0+15,'text-anchor':'middle','font-size':fs,class:'mono',...HALO});
          t.append(ctx.svgEl('tspan',{fill:'#7d8b83',text:head}),ctx.svgEl('tspan',{'font-weight':700,fill:'#1d4f86',text:tail}));gLab.append(t)}
      });
      const R=S.R,u=[S.x,S.y],filt=S.phase==='done';
      let cand=0,hit=0,miss=0,inR=0;
      BIZ.forEach((pt,i)=>{
        const d=dots[i],x=X(pt[0]),y=Y(pt[1]);
        if(x<-4||x>W+4||y<-4||y>H+4){d.setAttribute('display','none');return}
        d.removeAttribute('display');d.setAttribute('cx',x.toFixed(1));d.setAttribute('cy',y.toFixed(1));
        const got=inCells(pt,shown),near=dist(pt,u)<=R;if(near)inR++;
        let c=COL.idle;
        if(got){cand++;if(filt){if(near){hit++;c=ctx.colors.ok}else c=ctx.colors.warn}else c=ctx.colors.info}
        else if(near){miss++;if(filt||S.phase==='center')c=ctx.colors.bad}
        d.setAttribute('fill',c);d.setAttribute('r',got||near?3:2.4);
      });
      ctx.attr(circle,{cx:X(S.x),cy:Y(S.y),r:R*view.s});
      gTop.replaceChildren();
      if(S.pair){const [a,b]=S.pair;
        gTop.append(ctx.svgEl('line',{x1:X(a[0]),y1:Y(a[1]),x2:X(b[0]),y2:Y(b[1]),stroke:'#23352f','stroke-width':1.5}));
        const bx=X(b[0]),by=Y(b[1]);
        gTop.append(ctx.svgEl('circle',{cx:bx,cy:by,r:6,fill:ctx.colors.ok,stroke:'#fff','stroke-width':2}));
        const lx=Math.min(W-4,bx+10);gTop.append(ctx.svgEl('text',{x:lx,y:by-8,'font-size':12,'font-weight':650,'text-anchor':lx<bx+10?'end':'start',...HALO,text:'商家 B '+encode(b[0],b[1],6)}));
      }
      const ux=X(S.x),uy=Y(S.y);
      gTop.append(ctx.svgEl('circle',{cx:ux,cy:uy,r:6,fill:ctx.colors.info,stroke:'#fff','stroke-width':2}));
      const lx=ux+10>W-40;
      gTop.append(ctx.svgEl('text',{x:lx?ux-10:ux+10,y:uy+(S.pair?18:4),'font-size':12,'font-weight':700,'text-anchor':lx?'end':'start',fill:'#1d4f86',...HALO,text:'用户'}));
      return {cand,hit,miss,inR,pre};
    }
    function update(r){
      const p=P(),[dLon,dLat]=cellDeg(p),code=encode(S.x,S.y,8);
      st.set('code',code.slice(0,p),'info');
      const a=dLon*KX,b=dLat*KY;st.set('cell',a>=1&&b>=1?a.toFixed(1)+' × '+b.toFixed(1)+' km':a<1&&b<1?Math.round(a*1000)+' × '+Math.round(b*1000)+' m':fmtKm(a)+' × '+fmtKm(b));
      st.set('cand',S.shown.length?r.cand+' 家':'—');
      st.set('hit',S.phase==='done'?r.hit+' 家':'—',S.phase==='done'?'ok':null);
      st.set('miss',S.phase==='done'?r.miss+' 家':'—',S.phase==='done'?(r.miss?'bad':'ok'):null);
    }
    function setCap(html){cap.innerHTML=html}
    let seq=0;
    /** 执行一次查询；animate 时逐格展示。返回最终统计。 */
    async function run(animate){
      const my=++seq;
      S.all=nine();fit(S.all);drawGrid();
      const p=P(),code=encode(S.x,S.y,8),auto=S.prec==='auto';
      const head=`用户 Geohash <code>${code}</code>，取前 ${p} 位 <code>${code.slice(0,p)}</code>${auto?`（半径 ${S.R} km 按表取 ${p} 位）`:'（手动指定）'}。`;
      if(animate){
        S.shown=[S.all[0]];S.phase='center';let r=paint();update(r);
        setCap(head+`<br>第 1 步：只查本格 → 取回 <b>${r.cand}</b> 家；圆内另有 <b>${r.miss}</b> 家在本格之外（红色）。`);
        await ctx.wait(1100);if(my!==seq)return;
        S.phase='ring';
        for(let i=1;i<9;i++){S.shown=S.all.slice(0,i+1);r=paint();update(r);setCap(head+`<br>第 2 步：加查邻格 ${i}/8 <code>${S.all[i].code}</code> → 累计取回 <b>${r.cand}</b> 家。`);await ctx.wait(180);if(my!==seq)return}
        await ctx.wait(350);if(my!==seq)return;
      }
      S.shown=S.all;S.phase='done';const r=paint();update(r);
      const cover=r.miss?`<b style="color:${ctx.colors.bad}">九格没有盖住整个圆，漏掉 ${r.miss} 家</b>；需要扩大到更外圈的格子或换更短的编码。`:'九格盖住了整个圆，没有漏掉。';
      setCap(head+`<br>第 3 步：9 格共取回 <b>${r.cand}</b> 家，按真实距离过滤后返回 <b>${r.hit}</b> 家，丢弃 ${r.cand-r.hit} 家。${cover}九格的公共前缀是 <code>${r.pre||'（无）'}</code>。`);
      ctx.announce(`取回 ${r.cand} 家，返回 ${r.hit} 家，漏掉 ${r.miss} 家`);
      return r;
    }
    svg.addEventListener('click',e=>{
      if(!view)return;const b=svg.getBoundingClientRect();
      const px=(e.clientX-b.left)*W/b.width,py=(e.clientY-b.top)*H/b.height;
      S.x=util.clamp(view.cx+(px-W/2)/view.s,-15.9,15.9);S.y=util.clamp(view.cy-(py-H/2)/view.s,-15.9,15.9);S.pair=null;ui();
    });
    ctx.onResize(w=>{W=Math.round(w);H=Math.round(util.clamp(w*0.6,300,440));svg.setAttribute('viewBox',`0 0 ${W} ${H}`);if(S.all){fit(S.all);drawGrid();const r=paint();update(r)}});
    run(false);

    function prepare(R,prec,x,y,pair){S.R=R;S.prec=prec;S.x=x;S.y=y;S.pair=pair||null;radius.set(R,true);precCtl.set(prec,true)}
    ctx.scenarios([
      {id:'book',label:'原书例子：500 米',
        ask:'用户在原书坐标搜 500 米，按表取 6 位 Geohash，格子约 0.97 × 0.61 km，两边都比半径长。只查用户所在的那一格够不够？',
        insight:'不够。只查本格取回 7 家，圆内还有 3 家落在相邻的格子里：这个坐标离所在格子的南边界只有约 25 米、离西边界约 345 米，半径 500 米的圆必然越界。加上 8 个邻格后取回 68 家，按距离过滤剩 9 家，没有漏掉。格子比半径大，不代表圆落在一格里；取回的 68 家里有 59 家要靠精确距离丢掉',
        async run(){prepare(0.5,'auto',0,0);await run(true);await ctx.wait(1200)}},
      {id:'boundary',label:'边界两侧：近在咫尺，前缀不同',
        ask:'用户和商家 B 只隔约 60 米，中间正好是 4 位格子 9q8y 与 9q8z 的分界线。它们的 6 位 Geohash 有几位相同？只查用户所在的那一格能找到 B 吗？',
        insight:'用户在 9q8yyx，商家 B 在 9q8zn8，只有前 3 位 9q8 相同。只查本格（相当于按前缀 9q8yyx 匹配）找不到 B；查到北侧邻格 9q8zn8 时 B 才被取回，再通过距离过滤。这次九格的公共前缀也只剩 9q8。共享长前缀说明在同一个格子里，但距离近不保证前缀相同；在赤道或本初子午线两侧，很近的两点可能一位都不同',
        async run(){prepare(0.5,'auto',1.0,1.775,[[1.0,1.775],[1.0,1.835]]);await run(true);await ctx.wait(1500)}},
      {id:'fine',label:'精度选太细：九格盖不住圆',
        ask:'同样在原书坐标搜 500 米，但把长度手动改成 7 位（格子约 120 × 150 米）。九格还能盖住半径 500 米的圆吗？',
        insight:'盖不住。7 位九格只覆盖约 0.36 × 0.46 km，圆内 9 家只找到 4 家，漏掉 5 家（红色）。对照表的作用是让格子至少和半径一样大，九格才能盖住圆；批注提醒格子尺寸随纬度和精度变化，覆盖不足时要继续向外扩邻格',
        async run(){prepare(0.5,'7',0,0);await run(true);await ctx.wait(1500)}},
      {id:'density',label:'固定精度遇上密度差',
        ask:'都搜 1 km（5 位，格子约 3.9 × 4.9 km），先在市中心、再在郊区各查一次。两次取回的候选数量差多少？',
        insight:'市中心九格取回 327 家，过滤后返回 94 家；郊区九格只取回 20 家，1 km 内只有 1 家。格子大小固定，不随商家密度变化：市中心要取回并丢掉大量候选，郊区却可能找不到足够结果。这正是方案权衡里 Geohash 的缺点，四叉树按密度拆分（见下一个实验）',
        async run(){prepare(1,'auto',1.4,1.2);await run(true);await ctx.wait(1600);prepare(1,'auto',-12.5,-12);await run(true);await ctx.wait(1200)}},
    ]);
  }
});

/* ---------------- 实验二：四叉树 ---------------- */
SDLab.define({
  id:'quadtree-knn',chapter:16,
  title:'四叉树：按密度拆格子，再找最近的 k 家',
  summary:'每个格子里的商家超过阈值 x 就一分为四，直到都不超过 x。拖动阈值看树怎样变深；点地图任意位置，看 k 近邻查询按距离依次访问了哪些节点（蓝色），检查了哪些商家（琥珀色），最后返回哪些（绿色）。',
  caveat:'与上一个实验同一批虚拟商家（约 32 × 32 km 区域），原书阈值是 100、数据量 2 亿；这里用小阈值让结构看得清。查询用「按到格子的最短距离优先」的最佳优先搜索，距离为平面近似。',
  mount(ctx){
    ctx.css('qt',`
.qt-wrap{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}
.qt-svg{flex:0 0 auto;border:1px solid #e3e9e1;border-radius:10px;background:#f7f9f5;cursor:crosshair;touch-action:manipulation;overflow:hidden}
.qt-side{flex:1 1 220px;min-width:0;font-size:13px}
.qt-bars{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:3px 8px;align-items:center;font-variant-numeric:tabular-nums}
.qt-bars .b{height:10px;border-radius:3px;background:#eef1ec;overflow:hidden;display:flex}
.qt-bars .b i{display:block;height:100%}
.qt-cap{font-size:13px;color:#66756d;margin:8px 0 0;line-height:1.6}
.qt-cap b{color:#23352f}
`);
    const S={T:20,k:5,q:null,tree:null,res:null,maxD:9};
    const sT=ctx.slider({label:'阈值 x（每个叶子最多商家数）',min:5,max:60,step:5,value:S.T,onChange:v=>{S.T=v;rebuild(true).catch(()=>{})}});
    const sK=ctx.slider({label:'k（要找最近几家）',min:1,max:10,value:S.k,onChange:v=>{S.k=v;if(S.q)query(true).catch(()=>{})}});
    ctx.button('逐层重建',()=>{rebuild(true).catch(()=>{})},{primary:true});
    ctx.button('清除查询',()=>{clearQ();draw()});

    const wrap=h('div',{class:'qt-wrap'});const box=h('div',{class:'qt-svg'});
    const side=h('div',{class:'qt-side'});const bars=h('div',{class:'qt-bars'});const cap=h('p',{class:'qt-cap','aria-live':'polite'});
    side.append(h('div',{style:{fontWeight:650,marginBottom:'4px'}},'每层节点：浅蓝 = 叶子，深蓝 = 继续拆分'),bars,cap);
    wrap.append(box,side);ctx.stage.append(wrap);
    let Z=420;
    const svg=ctx.svg(Z,Z,{label:'四叉树格子与商家分布',parent:box});
    const gLeaf=ctx.svgEl('g'),gVis=ctx.svgEl('g'),gPts=ctx.svgEl('g'),gTop=ctx.svgEl('g');svg.append(gVis,gLeaf,gPts,gTop);
    const dots=BIZ.map(()=>{const c=ctx.svgEl('circle',{r:2.2,fill:COL.idle});gPts.append(c);return c});
    const st=ctx.stats([{key:'depth',label:'最大深度'},{key:'leaf',label:'叶子 / 节点'},{key:'vis',label:'查询访问节点'},{key:'exam',label:'检查商家'},{key:'kd',label:'第 k 近距离'},{key:'gh',label:'对照：6 位九格内商家'}]);
    const clearQ=()=>{S.q=null;S.res=null;for(const k of ['vis','exam','kd','gh'])st.set(k,'—')};
    const M=16,X=x=>(x+M)/(2*M)*Z,Y=y=>(M-y)/(2*M)*Z;

    function node(x0,y0,x1,y1,d,pts){return {x0,y0,x1,y1,d,pts,kids:null}}
    /** 把叶子中超过阈值的拆成四块；返回本轮是否有拆分。 */
    function splitLevel(t,depth){
      let any=false;
      const walk=n=>{if(n.kids){n.kids.forEach(walk);return}
        if(n.d===depth&&n.pts.length>S.T&&n.d<S.maxD){const mx=(n.x0+n.x1)/2,my=(n.y0+n.y1)/2;
          const q=[node(n.x0,my,mx,n.y1,n.d+1,[]),node(mx,my,n.x1,n.y1,n.d+1,[]),node(n.x0,n.y0,mx,my,n.d+1,[]),node(mx,n.y0,n.x1,my,n.d+1,[])];
          for(const i of n.pts){const [x,y]=BIZ[i];q[(y<my?2:0)+(x<mx?0:1)].pts.push(i)}n.kids=q;any=true}};
      walk(t);return any;
    }
    function all(t){const out=[];const w=n=>{out.push(n);if(n.kids)n.kids.forEach(w)};w(t);return out}
    function summary(){
      const ns=all(S.tree),leaves=ns.filter(n=>!n.kids);const depth=Math.max(...ns.map(n=>n.d));
      st.set('depth',depth+' 层');st.set('leaf',leaves.length+' / '+ns.length);
      bars.replaceChildren();const mx=Math.max(...util.range(depth+1).map(d=>ns.filter(n=>n.d===d).length));
      for(let d=0;d<=depth;d++){const lv=ns.filter(n=>n.d===d),lf=lv.filter(n=>!n.kids).length,inn=lv.length-lf,side=32/2**d;
        bars.append(h('span',null,'第 '+d+' 层'),h('span',{class:'b'},h('i',{style:{width:inn/mx*100+'%',background:ctx.colors.info}}),h('i',{style:{width:lf/mx*100+'%',background:'#a9c6e6'}})),h('span',{style:{color:'#66756d'}},lv.length+' 个 · 边长 '+fmtKm(side)))}
      return {depth,leaves:leaves.length,nodes:ns.length};
    }
    function draw(){
      gLeaf.replaceChildren();gVis.replaceChildren();gTop.replaceChildren();
      const vis=S.res?S.res.visited:[];const exam=S.res?S.res.exam:new Set(),win=S.res?S.res.win:new Set();
      for(const n of vis)if(!n.kids)gVis.append(ctx.svgEl('rect',{x:X(n.x0),y:Y(n.y1),width:X(n.x1)-X(n.x0),height:Y(n.y0)-Y(n.y1),fill:'#d6e5f5'}));
      for(const n of all(S.tree))if(!n.kids)gLeaf.append(ctx.svgEl('rect',{x:X(n.x0),y:Y(n.y1),width:X(n.x1)-X(n.x0),height:Y(n.y0)-Y(n.y1),fill:'none',stroke:'#93a79b','stroke-width':0.8}));
      BIZ.forEach((p,i)=>{const d=dots[i];d.setAttribute('cx',X(p[0]).toFixed(1));d.setAttribute('cy',Y(p[1]).toFixed(1));
        const c=win.has(i)?ctx.colors.ok:exam.has(i)?ctx.colors.warn:'#8e9b93';d.setAttribute('fill',c);d.setAttribute('r',win.has(i)?3.4:2.2)});
      for(const i of win)gPts.append(dots[i]);
      if(S.q){const qx=X(S.q[0]),qy=Y(S.q[1]);
        if(S.res&&S.res.done){for(const i of win)gTop.append(ctx.svgEl('line',{x1:qx,y1:qy,x2:X(BIZ[i][0]),y2:Y(BIZ[i][1]),stroke:ctx.colors.ok,'stroke-width':1.2}));
          gTop.append(ctx.svgEl('circle',{cx:qx,cy:qy,r:S.res.kd/(2*M)*Z,fill:'none',stroke:ctx.colors.ok,'stroke-dasharray':'4 3'}))}
        gTop.append(ctx.svgEl('circle',{cx:qx,cy:qy,r:4,fill:ctx.colors.info,stroke:'#fff','stroke-width':1.5}));}
    }
    let seq=0;
    async function rebuild(animate){
      const my=++seq;S.tree=node(-M,-M,M,M,0,BIZ.map((_,i)=>i));S.res=null;
      if(animate){draw();summary();cap.innerHTML=`根节点覆盖整个区域，含 <b>${BIZ.length}</b> 家，超过阈值 ${S.T}，开始拆分。`;await ctx.wait(500);if(my!==seq)return}
      for(let d=0;d<S.maxD;d++){const any=splitLevel(S.tree,d);if(!any)break;if(animate){draw();const s=summary();cap.innerHTML=`第 ${d} 层中商家数 &gt; ${S.T} 的格子一分为四，现在最深 ${s.depth} 层、${s.leaves} 个叶子。`;await ctx.wait(420);if(my!==seq)return}}
      const s=summary();draw();
      const leaves=all(S.tree).filter(n=>!n.kids),big=leaves.reduce((a,n)=>n.x1-n.x0>a.x1-a.x0?n:a),small=leaves.reduce((a,n)=>n.x1-n.x0<a.x1-a.x0?n:a);
      cap.innerHTML=`构建完成：最深 <b>${s.depth}</b> 层，<b>${s.leaves}</b> 个叶子。最大的叶子边长 ${fmtKm(big.x1-big.x0)}，最小的 ${fmtKm(small.x1-small.x0)}：密的地方格子小，稀的地方格子大。`;
      if(S.q)await query(false);
      return s;
    }
    function minD(n,p){const dx=Math.max(n.x0-p[0],0,p[0]-n.x1),dy=Math.max(n.y0-p[1],0,p[1]-n.y1);return Math.hypot(dx,dy)}
    async function query(animate){
      const my=++seq,p=S.q,k=S.k;
      const heap=[[0,S.tree]],best=[],visited=[],exam=new Set();
      S.res={visited,exam,win:new Set(),done:false,kd:0};
      while(heap.length){
        heap.sort((a,b)=>a[0]-b[0]);const [d,n]=heap.shift();
        if(best.length>=k&&d>best[k-1][0])break;
        visited.push(n);
        if(n.kids)for(const c of n.kids)heap.push([minD(c,p),c]);
        else{for(const i of n.pts){exam.add(i);best.push([dist(BIZ[i],p),i])}best.sort((a,b)=>a[0]-b[0]);best.length=Math.min(best.length,k);
          if(animate){draw();st.set('vis',visited.length+' 个');st.set('exam',exam.size+' 家');await ctx.wait(160);if(my!==seq)return}}
      }
      S.res.win=new Set(best.map(b=>b[1]));S.res.done=true;S.res.kd=best.length?best[best.length-1][0]:0;
      draw();
      const pre=encode(p[0],p[1],6),bx=cellBox(p[0],p[1],6),w=bx.x1-bx.x0,hh=bx.y1-bx.y0;
      const ghN=BIZ.filter(q=>q[0]>=bx.x0-w&&q[0]<bx.x1+w&&q[1]>=bx.y0-hh&&q[1]<bx.y1+hh).length;
      st.set('vis',visited.length+' 个','info');st.set('exam',exam.size+' 家','warn');st.set('kd',fmtKm(S.res.kd),'ok');st.set('gh',ghN+' 家',ghN<k?'bad':null);
      cap.innerHTML=`找最近 ${k} 家：按「到格子的最短距离」由近到远访问了 <b>${visited.length}</b> 个节点，检查 <b>${exam.size}</b> 家（全表 ${BIZ.length} 家），第 ${k} 近在 ${fmtKm(S.res.kd)}。对照：固定 6 位 Geohash 的九格（${pre} 及邻格）内有 ${ghN} 家${ghN<k?'，不够 '+k+' 家，还得向外扩':''}。`;
      ctx.announce(`访问 ${visited.length} 个节点，检查 ${exam.size} 家`);
      return {vis:visited.length,exam:exam.size,kd:S.res.kd,gh:ghN};
    }
    svg.addEventListener('click',e=>{const b=svg.getBoundingClientRect();const px=(e.clientX-b.left)*Z/b.width,py=(e.clientY-b.top)*Z/b.height;
      S.q=[util.clamp(px/Z*2*M-M,-15.9,15.9),util.clamp(M-py/Z*2*M,-15.9,15.9)];query(true).catch(()=>{})});
    ctx.onResize(w=>{const nz=Math.round(Math.min(w,440));if(nz===Z&&S.tree)return;Z=nz;box.style.width=Z+'px';box.style.height=Z+'px';svg.setAttribute('viewBox',`0 0 ${Z} ${Z}`);if(S.tree)draw()});
    S.q=[0,0];rebuild(false);

    function prep(T,k){S.T=T;S.k=k;sT.set(T,true);sK.set(k,true);clearQ()}
    ctx.scenarios([
      {id:'build',label:'按阈值递归拆分',
        ask:'阈值 x = 20。市中心和郊区的叶子格边长会差几倍？树最深几层？',
        insight:'最深 6 层、94 个叶子。市中心的叶子只有 500 米见方（第 6 层），郊区最大的叶子边长 8 km（第 2 层），相差 16 倍。拆分只发生在商家多的地方，这就是四叉树「按密度动态调整区域大小」',
        async run(){prep(20,5);await rebuild(true);await ctx.wait(800)}},
      {id:'knn',label:'最近 5 家：市中心与郊区',
        ask:'分别在市中心和郊区找最近的 5 家。四叉树要检查的商家数会差很多吗？固定 6 位 Geohash 的九格能凑够 5 家吗？',
        insight:'市中心访问 9 个节点、检查 15 家，第 5 近约 193 米；郊区访问 7 个节点、检查 13 家，第 5 近在 5.1 km 外。两处都只检查了全表 560 家中的一小部分。对照固定 6 位 Geohash 九格：市中心那一格周围有 123 家要过滤，郊区只有 1 家、必须一圈圈往外扩。四叉树的叶子大小跟着密度走，所以适合 k 近邻',
        async run(){prep(20,5);await rebuild(false);S.q=[1.3,1.1];await query(true);await ctx.wait(1400);S.q=[-12.5,-12];await query(true);await ctx.wait(1200)}},
      {id:'threshold',label:'阈值变小，树变深',
        ask:'阈值从 40 降到 5，叶子数和最大深度分别怎么变？',
        insight:'阈值 40 时最深 5 层、40 个叶子；降到 5 后最深 8 层、265 个叶子，最小的叶子只有 125 米。阈值越小，每次查询检查的商家越少，但节点更多、树更深，占用内存和重建时间也更多。原书取 100，并估计 2 亿商家构建要几分钟，所以要分批滚动发布，更新多用定期重建',
        async run(){prep(40,5);await rebuild(false);await ctx.wait(1500);prep(5,5);await rebuild(true);await ctx.wait(800)}},
    ]);
  }
});
})();
