/* 第 18 章：Google Maps。实验一演示瓦片金字塔与客户端按 z/x/y 取图；实验二演示路由瓦片的按需加载与分层路由。 */
(function(){
const {el:h,util}=SDLab;

/* ---------------- 实验一：地图瓦片 ---------------- */
const LAT0=37.776720,LON0=-122.416730;
const U0=(LON0+180)/360,V0=(()=>{const p=LAT0*Math.PI/180;return (1-Math.log(Math.tan(p)+1/Math.cos(p))/Math.PI)/2})();
function merc(lon,lat){const p=util.clamp(lat,-85,85)*Math.PI/180;return [(lon+180)/360,(1-Math.log(Math.tan(p)+1/Math.cos(p))/Math.PI)/2]}
/* 粗略的大陆轮廓（经度, 纬度），只为让世界图有个样子 */
const LAND=[
  [-168,65,-140,70,-95,72,-80,62,-60,52,-75,40,-81,25,-97,18,-105,20,-118,33,-124,42,-125,50,-150,60],
  [-80,10,-60,8,-35,-7,-40,-22,-58,-38,-68,-55,-75,-45,-72,-18,-81,-5],
  [-10,36,0,50,10,58,25,70,60,70,100,77,140,72,170,66,160,58,140,52,130,35,120,22,105,10,100,20,80,8,70,22,55,25,40,15,35,30,28,36,20,40,10,44,0,38],
  [-17,21,-5,36,10,37,32,31,43,12,51,11,40,-15,20,-35,12,-17,9,4,-8,5,-17,14],
  [114,-22,130,-12,142,-11,153,-27,146,-39,135,-35,115,-34],
  [-55,60,-20,70,-25,83,-60,82,-72,77],
].map(a=>{const pts=[];for(let i=0;i<a.length;i+=2)pts.push(merc(a[i],a[i+1]));return pts});
function big(n){if(n>=1e12)return (n/1e12).toFixed(1)+' 万亿';if(n>=1e8)return (n/1e8).toFixed(n<1e10?1:0)+' 亿';if(n>=1e4)return Math.round(n/1e4)+' 万';return util.fmt(n)}

SDLab.define({
  id:'map-tiles',chapter:18,
  title:'地图瓦片：缩放一级，瓦片数 ×4',
  summary:'左边是第 z 级的整张世界图和它的瓦片网格，右边是手机屏幕需要的瓦片（按 z/x/y 编号）。缩放、平移，看瓦片总数怎样按 4 倍增长，而屏幕每次只需要十来张；蓝色是这次新从 CDN 下载的，白色是本地已缓存的。',
  caveat:'屏幕按约 1.5 × 2.6 张 256 像素瓦片计算；世界图的大陆轮廓只是示意。编号采用常见的 Web Mercator z/x/y 方案（正文批注：不要把它和 Geohash 字符串等同），x 方向首尾相接。',
  mount(ctx){
    ctx.css('mt',`
.mt-wrap{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;justify-content:center}
.mt-box{flex:0 0 auto;min-width:0}
.mt-box .t{font-size:12px;color:#66756d;margin:0 0 4px;font-weight:650}
.mt-box svg{border-radius:10px}
.mt-cap{font-size:13px;color:#66756d;margin:8px 0 0;line-height:1.6}
.mt-cap b{color:#23352f}
`);
    const SW=1.5,SH=2.6;
    const S={z:3,u:U0,v:V0,cache:new Set(),fresh:new Map(),dl:0,hit:0};
    const zCtl=ctx.slider({label:'缩放级别 z',min:0,max:20,value:S.z,format:v=>'第 '+v+' 级',onInput:v=>{S.z=v;update()}});
    ctx.button('放大 +1',()=>zoom(1),{primary:true});ctx.button('缩小 −1',()=>zoom(-1));
    ctx.button('← 平移',()=>pan(-1,0));ctx.button('→ 平移',()=>pan(1,0));ctx.button('↑',()=>pan(0,-1));ctx.button('↓',()=>pan(0,1));
    ctx.button('回到原书坐标',()=>{S.u=U0;S.v=V0;update()});
    function zoom(d){S.z=util.clamp(S.z+d,0,20);zCtl.set(S.z,true);update()}
    function pan(dx,dy){const n=2**S.z;S.u=((S.u+dx*SW/2/n)%1+1)%1;S.v=util.clamp(S.v+dy*SH/2/n,0,0.9999);update()}

    const wrap=h('div',{class:'mt-wrap'}),wb=h('div',{class:'mt-box'}),pb=h('div',{class:'mt-box'});
    const wt=h('p',{class:'t'}),pt=h('p',{class:'t'},'手机屏幕需要的瓦片');
    wb.append(wt);pb.append(pt);wrap.append(wb,pb);
    const cap=h('p',{class:'mt-cap','aria-live':'polite'});ctx.stage.append(wrap,cap);
    let WS=300,PW=180,TP=120,PH=312;
    const wsvg=ctx.svg(WS,WS,{label:'世界图与瓦片网格',parent:wb}),psvg=ctx.svg(PW,PH,{label:'手机屏幕中的瓦片',parent:pb});
    const gW=ctx.svgEl('g'),gP=ctx.svgEl('g');wsvg.append(gW);
    const clipId='mt-clip-'+Math.random().toString(36).slice(2,8);
    const clipR=ctx.svgEl('rect',{rx:12});psvg.append(ctx.svgEl('defs',null,ctx.svgEl('clipPath',{id:clipId},clipR)));
    gP.setAttribute('clip-path',`url(#${clipId})`);const frame=ctx.svgEl('rect',{rx:12,fill:'none',stroke:'#23352f','stroke-width':2});psvg.append(gP,frame);
    const st=ctx.stats([{key:'total',label:'本级瓦片总数（4^z）'},{key:'need',label:'屏幕需要'},{key:'new',label:'本次新下载'},{key:'dl',label:'累计从 CDN 下载'}]);

    function needed(){
      const n=2**S.z,cu=S.u*n,cv=S.v*n,out=[];
      for(let ty=Math.floor(cv-SH/2);ty<=Math.floor(cv+SH/2-1e-9);ty++)for(let tx=Math.floor(cu-SW/2);tx<=Math.floor(cu+SW/2-1e-9);tx++)out.push({tx,ty,x:((tx%n)+n)%n,y:ty,ok:ty>=0&&ty<n});
      return out;
    }
    let lastKey='';
    function update(){
      const n=2**S.z,tiles=needed(),keys=[...new Set(tiles.filter(t=>t.ok).map(t=>`${S.z}/${t.x}/${t.y}`))];
      const vk=S.z+'|'+keys.join(',');
      if(vk!==lastKey){
        lastKey=vk;const fresh=keys.filter(k=>!S.cache.has(k));
        S.fresh=new Map(fresh.map(k=>[k,0]));for(const k of fresh)S.cache.add(k);S.dl+=fresh.length;S.hit+=keys.length-fresh.length;
        st.set('new',fresh.length+' 张',fresh.length?'info':'ok');
        if(fresh.length)ctx.log(`第 ${S.z} 级：新下载 ${fresh.length} 张（${fresh.slice(0,3).map(k=>'GET /tiles/'+k+'.png').join('、')}${fresh.length>3?' …':''}），缓存命中 ${keys.length-fresh.length} 张`,'info');
        else ctx.log(`第 ${S.z} 级：屏幕需要的 ${keys.length} 张全部来自本地缓存`,'ok');
        if(fresh.length)fade.start();
      }
      st.set('total',big(4**S.z)+' 张');st.set('need',keys.length+' 张');st.set('dl',S.dl+' 张');
      pt.textContent=`手机屏幕：定位点在 ${S.z}/${Math.floor(S.u*n)}/${Math.floor(S.v*n)}`;
      wt.textContent=`第 ${S.z} 级的世界：每边 ${util.fmt(n)} 张`;
      cap.innerHTML=`第 ${S.z} 级一共 <b>${big(4**S.z)}</b> 张瓦片（每放大一级 ×4），这块屏幕只需要 <b>${keys.length}</b> 张。客户端用经纬度和 z 直接算出编号，定位点在 <b>${S.z}/${Math.floor(S.u*n)}/${Math.floor(S.v*n)}</b>，按这个编号向 CDN 取图。`;
      drawWorld(tiles);drawPhone(tiles);
    }
    function drawWorld(tiles){
      gW.replaceChildren();const n=2**S.z,sz=WS;
      gW.append(ctx.svgEl('rect',{x:0,y:0,width:sz,height:sz,fill:'#e4eef6'}));
      for(const poly of LAND)gW.append(ctx.svgEl('polygon',{points:poly.map(([u,v])=>(u*sz).toFixed(1)+','+(v*sz).toFixed(1)).join(' '),fill:'#d7e5cc',stroke:'#b3c6a6','stroke-width':1}));
      if(S.z<=7)for(const t of tiles)if(t.ok)gW.append(ctx.svgEl('rect',{x:t.x/n*sz,y:t.y/n*sz,width:sz/n,height:sz/n,fill:ctx.colors.info,'fill-opacity':.35}));
      if(n<=32)for(let i=1;i<n;i++){const p=i/n*sz;gW.append(ctx.svgEl('line',{x1:p,x2:p,y1:0,y2:sz,stroke:'#6d8196','stroke-width':n>16?.5:1,opacity:.55}),ctx.svgEl('line',{x1:0,x2:sz,y1:p,y2:p,stroke:'#6d8196','stroke-width':n>16?.5:1,opacity:.55}))}
      const vw=SW/n*sz,vh=SH/n*sz,cx=S.u*sz,cy=S.v*sz;
      if(vw>=4)gW.append(ctx.svgEl('rect',{x:cx-vw/2,y:cy-vh/2,width:vw,height:vh,fill:'none',stroke:ctx.colors.info,'stroke-width':2}));
      else{gW.append(ctx.svgEl('circle',{cx,cy,r:7,fill:'none',stroke:ctx.colors.info,'stroke-width':2}),ctx.svgEl('circle',{cx,cy,r:2.5,fill:ctx.colors.info}));
        const lt=cx<sz/2;gW.append(ctx.svgEl('text',{x:lt?cx+11:cx-11,y:cy>sz-30?cy-12:cy+4,'text-anchor':lt?'start':'end','font-size':11,fill:'#1d4f86',stroke:'#fff','stroke-width':3,'paint-order':'stroke',text:'屏幕在这里（按比例不到 4 像素）'}))}
      gW.append(ctx.svgEl('rect',{x:.5,y:.5,width:sz-1,height:sz-1,fill:'none',stroke:'#b8c6bb'}));
    }
    const tileEls=[];
    function drawPhone(tiles){
      gP.replaceChildren();tileEls.length=0;const n=2**S.z,cu=S.u*n,cv=S.v*n;
      gP.append(ctx.svgEl('rect',{x:0,y:0,width:PW,height:PH,fill:'#eef1ec'}));
      for(const t of tiles){
        const x=(t.tx-cu)*TP+PW/2,y=(t.ty-cv)*TP+PH/2,k=`${S.z}/${t.x}/${t.y}`,fresh=S.fresh.has(k);
        const r=ctx.svgEl('rect',{x:x+1,y:y+1,width:TP-2,height:TP-2,rx:3,fill:!t.ok?'#e3e7e2':fresh?'#dde9f6':'#fbfcfa',stroke:!t.ok?'#d0d6cf':fresh?ctx.colors.info:'#b9c6bc','stroke-width':fresh?1.6:1});
        gP.append(r);
        const vx0=Math.max(x,0),vx1=Math.min(x+TP,PW),vy0=Math.max(y,0),vy1=Math.min(y+TP,PH),tx=(vx0+vx1)/2,cy=(vy0+vy1)/2;
        if(vx1-vx0<52||vy1-vy0<(t.ok?50:18)){if(fresh)tileEls.push([r,k]);continue}
        if(t.ok){gP.append(ctx.svgEl('text',{x:tx,y:cy-6,'text-anchor':'middle','font-size':11,class:'mono',fill:'#23352f',text:'x '+t.x}),ctx.svgEl('text',{x:tx,y:cy+10,'text-anchor':'middle','font-size':11,class:'mono',fill:'#23352f',text:'y '+t.y}));
          gP.append(ctx.svgEl('text',{x:tx,y:cy+26,'text-anchor':'middle','font-size':11,fill:fresh?'#1d4f86':'#66756d',text:fresh?'CDN 下载':'本地缓存'}))}
        else gP.append(ctx.svgEl('text',{x:tx,y:cy+4,'text-anchor':'middle','font-size':11,fill:'#8a968f',text:'地图范围外'}));
        if(fresh)tileEls.push([r,k]);
      }
      gP.append(ctx.svgEl('circle',{cx:PW/2,cy:PH/2,r:6,fill:ctx.colors.bad,stroke:'#fff','stroke-width':2}));
    }
    const fade=ctx.loop(dt=>{let any=false;for(const [k,v] of S.fresh){const nv=Math.min(1,v+dt/0.45);S.fresh.set(k,nv);if(nv<1)any=true}
      for(const [r,k] of tileEls){const v=S.fresh.get(k)??1;r.setAttribute('opacity',(0.25+0.75*v).toFixed(2))}if(!any)fade.stop()},false);
    ctx.onResize(w=>{const narrow=w<560;WS=Math.round(narrow?Math.min(w,340):300);PW=narrow?Math.min(200,Math.round(w*0.6)):186;TP=PW/SW;PH=Math.round(TP*SH);
      ctx.attr(wsvg,{viewBox:`0 0 ${WS} ${WS}`});wsvg.style.width=WS+'px';ctx.attr(psvg,{viewBox:`0 0 ${PW} ${PH}`});psvg.style.width=PW+'px';
      ctx.attr(clipR,{x:0,y:0,width:PW,height:PH});ctx.attr(frame,{x:1,y:1,width:PW-2,height:PH-2});lastKey=lastKey||'';update()});

    function reset(z){S.z=z;S.u=U0;S.v=V0;S.cache=new Set();S.dl=0;S.hit=0;lastKey='';zCtl.set(z,true);ctx.clearLog();update()}
    ctx.scenarios([
      {id:'pyramid',label:'放大一级，瓦片 ×4',
        ask:'第 0 级一张 256×256 瓦片就是整个世界。第 3 级一共多少张？第 18 级呢？手机屏幕要下载的瓦片数也会跟着 ×4 吗？',
        insight:'第 1、2、3 级分别是 4、16、64 张，第 18 级约 687 亿张（4^18）。屏幕需要的瓦片却一直只有几张（这次第 18 级是 6 张）：总量随缩放级别指数增长，单个用户每屏的下载量只取决于屏幕大小。所以瓦片可以预先生成、放到 CDN 上按需取，原书估计的 PB 级总量从来不需要整体下载到客户端',
        async run(){reset(0);for(const z of [1,2,3]){await ctx.wait(1300);zoom(1)}await ctx.wait(1500);S.z=12;zCtl.set(12,true);update();await ctx.wait(1500);S.z=18;zCtl.set(18,true);update();await ctx.wait(1200)}},
      {id:'child',label:'编号靠计算得出',
        ask:'定位点在第 15 级落在瓦片 15/5241/12665。放大到第 16 级，它落在哪张瓦片？客户端需要先问服务器吗？',
        insight:'落在 16/10482/25330：x、y 各变成 2x 或 2x+1（这里恰好都是 2 倍），父瓦片正好被 4 个子瓦片铺满。编号只由经纬度和 z 算出，客户端可以直接拼出 CDN 地址；代价是这套算法一旦发布就要长期兼容（正文方式 1）。也可以由服务端 API 计算 URL（方式 2），多一次请求，但规则更容易调整。',
        async run(){reset(15);await ctx.wait(1800);zoom(1);await ctx.wait(2200)}},
      {id:'pan',label:'平移只补新露出的瓦片',
        ask:'在第 16 级，屏幕先加载好一整屏。向右平移半个屏幕宽，要重新下载整屏吗？再平移回来呢？',
        insight:'首屏下载 9 张。右移半屏后屏幕仍需要 9 张，其中只有新露出的一列 3 张要从 CDN 下载，另外 6 张已在本地缓存；平移回原位时一张都不用下载。CDN 让「第一次下载」离用户更近，客户端缓存让同一张瓦片不重复下载',
        async run(){reset(16);await ctx.wait(1800);pan(1,0);await ctx.wait(2000);pan(-1,0);await ctx.wait(1600)}},
    ]);
  }
});

/* ---------------- 实验二：路由瓦片 ---------------- */
const NX=32,NY=20,N=NX*NY;
const MPK={local:2,art:1.2,hwy:0.6};/* 每公里分钟数：30 / 50 / 100 km/h */
const nid=(x,y)=>y*NX+x,nxy=i=>[i%NX,Math.floor(i/NX)];
const GRAPH=(()=>{
  const adj=Array.from({length:N},()=>[]),edges=[];
  const add=(a,b,cls,len)=>{const c=len*MPK[cls];adj[a].push({to:b,cls,cost:c});adj[b].push({to:a,cls,cost:c});edges.push({a,b,cls})};
  for(let y=0;y<NY;y++)for(let x=0;x<NX;x++){
    if(x+1<NX)add(nid(x,y),nid(x+1,y),y%4===2?'art':'local',1);
    if(y+1<NY)add(nid(x,y),nid(x,y+1),x%4===2?'art':'local',1);
  }
  const hx=[2,6,10,14,18,22,26,30],hy=[2,6,10,14,18];
  for(let i=0;i+1<hx.length;i++)add(nid(hx[i],10),nid(hx[i+1],10),'hwy',4);
  for(let i=0;i+1<hy.length;i++)add(nid(18,hy[i]),nid(18,hy[i+1]),'hwy',4);
  return {adj,edges};
})();
/* 三级路由瓦片：本地 4×4 km（全部道路）、干道 8×8 km（干道 + 高速）、高速 1 块（只有高速） */
const TKEY=(lvl,i)=>{const [x,y]=nxy(i);return lvl===2?`L${x>>2},${y>>2}`:lvl===1?`M${x>>3},${y>>3}`:'H'};
const LVL_OK=(cls,lvl)=>lvl===2||(lvl===1&&cls!=='local')||(lvl===0&&cls==='hwy');
const TEDGES=(()=>{const m=new Map();for(const e of GRAPH.edges)for(const lvl of [2,1,0])if(LVL_OK(e.cls,lvl)){const k=TKEY(lvl,e.a);m.set(k,(m.get(k)||0)+1)}return m})();
const eu=(a,b)=>{const [x1,y1]=nxy(a),[x2,y2]=nxy(b);return Math.hypot(x1-x2,y1-y2)};
function search(mode,A,B){
  const dist=new Float64Array(N).fill(Infinity),prev=new Int32Array(N).fill(-1),done=new Uint8Array(N);
  const trace=[],loaded=new Set(),open=[[0,A]];dist[A]=0;
  const load=(k,lvl)=>{if(!loaded.has(k)){loaded.add(k);trace.push({t:'load',k,lvl})}};
  if(mode==='dij')for(let ty=0;ty<5;ty++)for(let tx=0;tx<8;tx++)load(`L${tx},${ty}`,2);
  const lv=i=>{if(mode!=='hier')return 2;const d=Math.min(eu(i,A),eu(i,B));return d<=3?2:d<=7?1:0};
  const hh=i=>mode==='dij'?0:eu(i,B)*MPK.hwy;
  let exp=0;
  while(open.length){
    let bi=0;for(let i=1;i<open.length;i++)if(open[i][0]<open[bi][0])bi=i;
    const [,u]=open[bi];open[bi]=open[open.length-1];open.pop();
    if(done[u])continue;done[u]=1;const l=lv(u);load(TKEY(l,u),l);trace.push({t:'exp',n:u});exp++;
    if(u===B)break;
    for(const e of GRAPH.adj[u]){if(!LVL_OK(e.cls,l))continue;const nd=dist[u]+e.cost;if(nd<dist[e.to]-1e-9){dist[e.to]=nd;prev[e.to]=u;open.push([nd+hh(e.to),e.to])}}
  }
  const path=[];if(dist[B]<Infinity)for(let c=B;c!==-1;c=prev[c])path.push(c);
  const cnt={2:0,1:0,0:0};let edges=0;for(const k of loaded){cnt[k[0]==='L'?2:k[0]==='M'?1:0]++;edges+=TEDGES.get(k)||0}
  return {trace,path:path.reverse(),time:dist[B],exp,cnt,edges};
}

SDLab.define({
  id:'routing-tiles',chapter:18,
  title:'路由瓦片：只加载路线需要的子图，长途走高层',
  summary:'32 × 20 km 的网格路网：细线是本地道路，粗一点的是干道，最粗的是两条高速。选一种搜索方式运行，看它加载了哪些路由瓦片（蓝色 = 4 km 本地瓦片，紫色 = 8 km 干道瓦片）、展开了多少路口（蓝点），最后的路线是绿色。点地图可以改起点或终点。',
  caveat:'道路耗时按本地 30、干道 50、高速 100 km/h 计算，高速只能在立交处（每 4 km）上下；分层规则简化为「离起点或终点 3 km 内用本地瓦片，7 km 内用干道瓦片，其余只用高速瓦片」。真实系统的层级划分、转移规则和路况权重复杂得多。',
  mount(ctx){
    ctx.css('rt',`
.rt-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:#66756d;margin:6px 0 0}
.rt-legend i{display:inline-block;width:14px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.rt-svg{border:1px solid #e3e9e1;border-radius:10px;background:#fbfcfa;cursor:crosshair;touch-action:manipulation}
.rt-cap{font-size:13px;color:#66756d;margin:8px 0 0;line-height:1.6;min-height:3.2em}
.rt-cap b{color:#23352f}
`);
    const S={mode:'astar',A:nid(3,16),B:nid(27,4),target:'B',res:null};
    const MODES={dij:'整张图 Dijkstra',astar:'A* + 按需加载瓦片',hier:'分层路由瓦片'};
    const modeCtl=ctx.segmented({label:'搜索方式',value:S.mode,wide:true,options:Object.entries(MODES),onChange:v=>{S.mode=v;ui()}});
    const tgtCtl=ctx.segmented({label:'点击地图设置',value:'B',options:[['A','起点 A'],['B','终点 B']],onChange:v=>{S.target=v}});
    ctx.button('运行搜索',()=>ui(),{primary:true});
    const ui=()=>{run(true).catch(()=>{})};

    let W=640,s=20,pad=10,padY=10,H=400,hwyPath=null;
    const svg=ctx.svg(W,H,{label:'网格路网、路由瓦片与搜索过程'});svg.classList.add('rt-svg');
    const gT1=ctx.svgEl('g'),gT2=ctx.svgEl('g'),gR=ctx.svgEl('g'),gE=ctx.svgEl('g'),gP=ctx.svgEl('g'),gM=ctx.svgEl('g');svg.append(gT1,gT2,gR,gE,gP,gM);
    const cap=h('p',{class:'rt-cap','aria-live':'polite'});
    const lg=(c,t,b)=>h('span',null,h('i',{style:{background:c,border:b||null}}),t);
    ctx.stage.append(h('div',{class:'rt-legend'},lg('#d3dbd5','本地道路'),lg('#9fb0a4','干道'),lg('#56708f','高速'),lg('#dfeaf7','已加载本地瓦片','1px solid #8fb2dc'),lg('#ece6f6','已加载干道瓦片','1px solid #b3a2d6'),lg(ctx.colors.info,'已展开路口'),lg(ctx.colors.ok,'路线')),cap);
    const st=ctx.stats([{key:'tiles',label:'加载瓦片（本地 / 干道 / 高速）'},{key:'edges',label:'加载的道路边数'},{key:'exp',label:'展开路口'},{key:'time',label:'路线耗时'},{key:'gap',label:'比最优路线'}]);
    const PX=x=>pad+x*s,PY=y=>padY+(NY-1-y)*s,NP=i=>{const [x,y]=nxy(i);return [PX(x),PY(y)]};
    function drawRoads(){
      gR.replaceChildren();
      const byCls={local:[],art:[],hwy:[]};for(const e of GRAPH.edges){const [x1,y1]=NP(e.a),[x2,y2]=NP(e.b);byCls[e.cls].push(`M${x1} ${y1}L${x2} ${y2}`)}
      gR.append(ctx.svgEl('path',{d:byCls.local.join(''),stroke:'#d3dbd5','stroke-width':1,fill:'none'}),ctx.svgEl('path',{d:byCls.art.join(''),stroke:'#9fb0a4','stroke-width':2.2,fill:'none'}),
        hwyPath=ctx.svgEl('path',{d:byCls.hwy.join(''),stroke:'#56708f','stroke-width':s>14?5:3.5,fill:'none','stroke-linecap':'round',opacity:.85}));
      const ic=[];for(const x of [2,6,10,14,18,22,26,30])ic.push([x,10]);for(const y of [2,6,14,18])ic.push([18,y]);
      for(const [x,y] of ic)gR.append(ctx.svgEl('circle',{cx:PX(x),cy:PY(y),r:s>14?3.5:2.5,fill:'#fff',stroke:'#56708f','stroke-width':1.5}));
    }
    function tileRect(k){
      if(k==='H')return null;const [a,b]=k.slice(1).split(',').map(Number),sz=k[0]==='L'?4:8;
      const x0=a*sz,y0=b*sz,x1=Math.min(NX,x0+sz),y1=Math.min(NY,y0+sz);
      return ctx.svgEl('rect',{x:PX(x0)-s/2,y:PY(y1-1)-s/2,width:(x1-x0)*s,height:(y1-y0)*s,fill:k[0]==='L'?'#dfeaf7':'#ece6f6',stroke:k[0]==='L'?'#8fb2dc':'#b3a2d6','stroke-width':1});
    }
    function markers(){
      gM.replaceChildren();
      for(const [i,lab,col] of [[S.A,'A',ctx.colors.info],[S.B,'B','#23352f']]){const [x,y]=NP(i);
        gM.append(ctx.svgEl('circle',{cx:x,cy:y,r:9,fill:col,stroke:'#fff','stroke-width':2}),ctx.svgEl('text',{x,y:y+4,'text-anchor':'middle','font-size':11,'font-weight':700,fill:'#fff',text:lab}))}
    }
    function clear(){if(hwyPath)hwyPath.setAttribute('stroke','#56708f');gT1.replaceChildren();gT2.replaceChildren();gE.replaceChildren();gP.replaceChildren();for(const k of ['tiles','edges','exp','time','gap'])st.set(k,'—')}
    function showStats(r,opt){
      st.set('tiles',`${r.cnt[2]} / ${r.cnt[1]} / ${r.cnt[0]}`,'info');st.set('edges',r.edges+' 条');st.set('exp',r.exp+' 个');
      st.set('time',r.time.toFixed(1)+' 分钟','ok');const g=(r.time/opt-1)*100;st.set('gap',g<0.05?'相同':'+'+g.toFixed(1)+'%',g<0.05?'ok':'warn');
    }
    let seq=0;
    async function run(animate){
      const my=++seq;clear();markers();
      const r=search(S.mode,S.A,S.B),opt=search('astar',S.A,S.B).time;S.res=r;
      const exps=r.trace.filter(e=>e.t==='exp').length,k=Math.max(1,Math.ceil(exps/80));
      let n=0,cntL=0,cntE=0;
      cap.innerHTML=`${MODES[S.mode]}：从 A 开始搜索…`;
      for(const ev of r.trace){
        if(ev.t==='load'){const el=tileRect(ev.k);if(el)(ev.k[0]==='L'?gT2:gT1).append(el);else hwyPath.setAttribute('stroke','#2f6fb3');cntL++}
        else{const [x,y]=NP(ev.n);gE.append(ctx.svgEl('circle',{cx:x,cy:y,r:s>14?2.6:1.8,fill:ctx.colors.info,opacity:.75}));cntE++;n++;
          if(animate&&n%k===0){st.set('exp',cntE+' 个');st.set('tiles',cntL+' 块');await ctx.wait(35);if(my!==seq)return}}
      }
      gP.append(ctx.svgEl('polyline',{points:r.path.map(i=>NP(i).join(',')).join(' '),fill:'none',stroke:ctx.colors.ok,'stroke-width':s>14?4:3,'stroke-linejoin':'round','stroke-linecap':'round'}));
      showStats(r,opt);
      const g=(r.time/opt-1)*100;
      cap.innerHTML=`${MODES[S.mode]}：加载 <b>${r.cnt[2]}</b> 块本地瓦片${r.cnt[1]?`、<b>${r.cnt[1]}</b> 块干道瓦片`:''}${r.cnt[0]?'、1 块高速瓦片':''}，共 <b>${r.edges}</b> 条道路边；展开 <b>${r.exp}</b> 个路口。路线 ${r.time.toFixed(1)} 分钟，${g<0.05?'与最优路线相同':'比最优路线慢 '+g.toFixed(1)+'%'}。`;
      ctx.announce(cap.textContent);
      return r;
    }
    svg.addEventListener('click',e=>{const b=svg.getBoundingClientRect();const px=(e.clientX-b.left)*W/b.width,py=(e.clientY-b.top)*H/b.height;
      const x=util.clamp(Math.round((px-pad)/s),0,NX-1),y=util.clamp(NY-1-Math.round((py-pad)/s),0,NY-1),i=nid(x,y);
      if(S.target==='A'){if(i!==S.B)S.A=i}else if(i!==S.A)S.B=i;ui()});
    ctx.onResize(w=>{W=Math.round(w);s=Math.min((W-20)/(NX-1),20);pad=(W-(NX-1)*s)/2;H=Math.round(2*padY+(NY-1)*s);svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
      drawRoads();if(S.res)run(false);else{markers()}});
    run(false);

    function prep(mode,A,B){S.mode=mode;modeCtl.set(mode,true);if(A!=null){S.A=A;S.B=B}}
    ctx.scenarios([
      {id:'whole',label:'整张图 vs 按需加载',
        ask:'从 A 到 B 直线约 27 km。对整张道路图跑 Dijkstra 要先加载全部 40 块本地路由瓦片；改成 A* 并按需加载瓦片，会加载多少块？',
        insight:'Dijkstra 加载了全部 40 块、1239 条道路边，展开 587 个路口才确定终点。A* 按「直线距离 ÷ 最高时速」估计剩余时间，同样找到 32.8 分钟的最优路线，展开 401 个路口、加载 34 块瓦片。省得不多：有高速时这个估计很保守，A* 仍要试探大片小路；路线越长，沿途要拼接的细粒度瓦片越多，这正是正文引出分层路由瓦片的原因',
        async run(){prep('dij',nid(3,16),nid(27,4));await run(true);await ctx.wait(1800);prep('astar');await run(true);await ctx.wait(1200)}},
      {id:'hier',label:'长途：换用分层瓦片',
        ask:'同一条长路线，改用分层路由瓦片：起终点附近用本地瓦片，稍远只看干道瓦片，中间只看高速瓦片。加载的道路边数和展开的路口能少多少？路线会变慢吗？',
        insight:'只加载 6 块本地瓦片、6 块干道瓦片和 1 块高速瓦片，共 348 条道路边（A* 按需加载是 1071 条），展开 103 个路口（A* 是 401 个），路线同样是 32.8 分钟。就像正文说的「先走高速公路，再在目的地附近展开小路」：远离起终点时不再看小路。这里恰好得到最优解，但分层是近似，规则设计不当可能错过更快的小路；原书也只要求路线准确可走、合理快',
        async run(){prep('hier',nid(3,16),nid(27,4));await run(true);await ctx.wait(1500)}},
      {id:'short',label:'短途只要一两块瓦片',
        ask:'起终点只隔 3 km，中间跨过一条瓦片边界。A* 按需加载需要几块本地瓦片？',
        insight:'只加载 2 块本地瓦片（66 条道路边）、展开 11 个路口就找到 6 分钟的路线，其余 38 块瓦片都没碰。只加载起终点相关的数据，是把道路图切成路由瓦片的初衷；分层主要是为长途准备的',
        async run(){prep('astar',nid(9,9),nid(12,9));await run(true);await ctx.wait(1500)}},
    ]);
  }
});
})();
