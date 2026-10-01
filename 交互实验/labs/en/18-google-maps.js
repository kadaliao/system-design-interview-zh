/* Chapter 18: Google Maps. Lab 1 shows the tile pyramid and the client fetching tiles by z/x/y; lab 2 shows on-demand loading of routing tiles and hierarchical routing. */
(function(){
const {el:h,util}=SDLab;

/* ---------------- Lab 1: map tiles ---------------- */
const LAT0=37.776720,LON0=-122.416730;
const U0=(LON0+180)/360,V0=(()=>{const p=LAT0*Math.PI/180;return (1-Math.log(Math.tan(p)+1/Math.cos(p))/Math.PI)/2})();
function merc(lon,lat){const p=util.clamp(lat,-85,85)*Math.PI/180;return [(lon+180)/360,(1-Math.log(Math.tan(p)+1/Math.cos(p))/Math.PI)/2]}
/* Rough continent outlines (longitude, latitude), only to give the world map a shape */
const LAND=[
  [-168,65,-140,70,-95,72,-80,62,-60,52,-75,40,-81,25,-97,18,-105,20,-118,33,-124,42,-125,50,-150,60],
  [-80,10,-60,8,-35,-7,-40,-22,-58,-38,-68,-55,-75,-45,-72,-18,-81,-5],
  [-10,36,0,50,10,58,25,70,60,70,100,77,140,72,170,66,160,58,140,52,130,35,120,22,105,10,100,20,80,8,70,22,55,25,40,15,35,30,28,36,20,40,10,44,0,38],
  [-17,21,-5,36,10,37,32,31,43,12,51,11,40,-15,20,-35,12,-17,9,4,-8,5,-17,14],
  [114,-22,130,-12,142,-11,153,-27,146,-39,135,-35,115,-34],
  [-55,60,-20,70,-25,83,-60,82,-72,77],
].map(a=>{const pts=[];for(let i=0;i<a.length;i+=2)pts.push(merc(a[i],a[i+1]));return pts});
function big(n){const t=(x,d)=>x.toFixed(d).replace(/\.0$/,'');if(n>=1e12)return t(n/1e12,1)+' trillion';if(n>=1e9)return t(n/1e9,n<1e11?1:0)+' billion';if(n>=1e6)return t(n/1e6,n<1e7?1:0)+' million';return util.fmt(n)}
const tl=(n,s=n)=>s+(n===1?' tile':' tiles');

SDLab.define({
  id:'map-tiles',chapter:18,
  title:'Map Tiles: Each Zoom Level Multiplies the Tiles by 4',
  summary:'On the left is the whole world at zoom level z with its tile grid; on the right are the tiles the phone screen needs (numbered z/x/y). Zoom and pan to watch the total grow 4 times per level while the screen needs only ten or so. Blue tiles were just downloaded from the CDN; white ones are already cached locally.',
  caveat:'The screen is modeled as about 1.5 × 2.6 tiles of 256 pixels, and the continent outlines on the world map are illustrative. Numbering uses the common Web Mercator z/x/y scheme (not the same thing as a geohash string), and x wraps around at the edges.',
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
    const zCtl=ctx.slider({label:'Zoom level z',min:0,max:20,value:S.z,format:v=>'Level '+v,onInput:v=>{S.z=v;update()}});
    ctx.button('Zoom in +1',()=>zoom(1),{primary:true});ctx.button('Zoom out −1',()=>zoom(-1));
    ctx.button('← Pan',()=>pan(-1,0));ctx.button('→ Pan',()=>pan(1,0));ctx.button('↑',()=>pan(0,-1));ctx.button('↓',()=>pan(0,1));
    ctx.button('Reset position',()=>{S.u=U0;S.v=V0;update()});
    function zoom(d){S.z=util.clamp(S.z+d,0,20);zCtl.set(S.z,true);update()}
    function pan(dx,dy){const n=2**S.z;S.u=((S.u+dx*SW/2/n)%1+1)%1;S.v=util.clamp(S.v+dy*SH/2/n,0,0.9999);update()}

    const wrap=h('div',{class:'mt-wrap'}),wb=h('div',{class:'mt-box'}),pb=h('div',{class:'mt-box'});
    const wt=h('p',{class:'t'}),pt=h('p',{class:'t'},'Tiles the phone screen needs');
    wb.append(wt);pb.append(pt);wrap.append(wb,pb);
    const cap=h('p',{class:'mt-cap','aria-live':'polite'});ctx.stage.append(wrap,cap);
    let WS=300,PW=180,TP=120,PH=312;
    const wsvg=ctx.svg(WS,WS,{label:'World map and tile grid',parent:wb}),psvg=ctx.svg(PW,PH,{label:'Tiles on the phone screen',parent:pb});
    const gW=ctx.svgEl('g'),gP=ctx.svgEl('g');wsvg.append(gW);
    const clipId='mt-clip-'+Math.random().toString(36).slice(2,8);
    const clipR=ctx.svgEl('rect',{rx:12});psvg.append(ctx.svgEl('defs',null,ctx.svgEl('clipPath',{id:clipId},clipR)));
    gP.setAttribute('clip-path',`url(#${clipId})`);const frame=ctx.svgEl('rect',{rx:12,fill:'none',stroke:'#23352f','stroke-width':2});psvg.append(gP,frame);
    const st=ctx.stats([{key:'total',label:'Tiles at this level (4^z)'},{key:'need',label:'Screen needs'},{key:'new',label:'Newly downloaded'},{key:'dl',label:'Total downloaded from CDN'}]);

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
        st.set('new',tl(fresh.length),fresh.length?'info':'ok');
        if(fresh.length)ctx.log(`Level ${S.z}: downloaded ${tl(fresh.length)} (${fresh.slice(0,3).map(k=>'GET /tiles/'+k+'.png').join(', ')}${fresh.length>3?' …':''}), ${keys.length-fresh.length} served from the cache`,'info');
        else ctx.log(`Level ${S.z}: all ${tl(keys.length)} on screen came from the local cache`,'ok');
        if(fresh.length)fade.start();
      }
      st.set('total',big(4**S.z)+(S.z===0?' tile':' tiles'));st.set('need',tl(keys.length));st.set('dl',tl(S.dl));
      pt.textContent=`Phone screen: your location is in ${S.z}/${Math.floor(S.u*n)}/${Math.floor(S.v*n)}`;
      wt.textContent=`The world at level ${S.z}: ${tl(n,util.fmt(n))} per side`;
      cap.innerHTML=`Level ${S.z} has <b>${big(4**S.z)}</b> ${S.z===0?'tile':'tiles'} in total (×4 per zoom level), and this screen needs only <b>${keys.length}</b>. The client computes tile IDs directly from latitude, longitude, and z; your location is in <b>${S.z}/${Math.floor(S.u*n)}/${Math.floor(S.v*n)}</b>, and the client fetches that tile from the CDN by ID.`;
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
        const lt=cx<sz/2;gW.append(ctx.svgEl('text',{x:lt?cx+11:cx-11,y:cy>sz-30?cy-12:cy+4,'text-anchor':lt?'start':'end','font-size':11,fill:'#1d4f86',stroke:'#fff','stroke-width':3,'paint-order':'stroke',text:'Screen (< 4 px to scale)'}))}
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
          gP.append(ctx.svgEl('text',{x:tx,y:cy+26,'text-anchor':'middle','font-size':11,fill:fresh?'#1d4f86':'#66756d',text:fresh?'from CDN':'cached'}))}
        else gP.append(ctx.svgEl('text',{x:tx,y:cy+4,'text-anchor':'middle','font-size':11,fill:'#8a968f',text:'off the map'}));
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
      {id:'pyramid',label:'Zoom in one level, tiles ×4',
        ask:'At level 0, a single 256×256 tile is the whole world. How many tiles are there at level 3? At level 18? Does the number of tiles a phone screen must download also grow ×4?',
        insight:'Levels 1, 2, and 3 have 4, 16, and 64 tiles, and level 18 has about 68.7 billion (4^18). The screen still needs only a handful of tiles (6 at level 18 this time): the total grows exponentially with zoom level, but what one user downloads per screen depends only on the screen size. That is why tiles can be pre-generated, put on a CDN, and fetched on demand, and the petabyte-scale total estimated in the original never has to be downloaded to the client',
        async run(){reset(0);for(const z of [1,2,3]){await ctx.wait(1300);zoom(1)}await ctx.wait(1500);S.z=12;zCtl.set(12,true);update();await ctx.wait(1500);S.z=18;zCtl.set(18,true);update();await ctx.wait(1200)}},
      {id:'child',label:'IDs are computed',
        ask:'At level 15, your location falls in tile 15/5241/12665. Zoom to level 16: which tile is it in? Does the client have to ask the server first?',
        insight:'It lands in 16/10482/25330: x and y each become 2x or 2x+1 (here both happen to be exactly double), so the parent tile is covered by exactly 4 child tiles. The ID depends only on latitude, longitude, and z, so the client can build the CDN URL directly; the cost is that the algorithm must stay compatible for a long time once shipped (approach 1 in the chapter). A server API can compute the URL instead (approach 2): one more request, but the rules are easier to change.',
        async run(){reset(15);await ctx.wait(1800);zoom(1);await ctx.wait(2200)}},
      {id:'pan',label:'Panning fetches only new tiles',
        ask:'At level 16, the screen has loaded a full screenful of tiles. If you pan right by half a screen width, must it download everything again? What about panning back?',
        insight:'The first screen downloads 9 tiles. After panning right half a screen it still needs 9, but only the newly revealed column of 3 comes from the CDN while the other 6 are already cached locally; panning back to the original spot downloads nothing. The CDN brings the first download closer to the user, and the client cache keeps the same tile from being downloaded twice',
        async run(){reset(16);await ctx.wait(1800);pan(1,0);await ctx.wait(2000);pan(-1,0);await ctx.wait(1600)}},
    ]);
  }
});

/* ---------------- Lab 2: routing tiles ---------------- */
const NX=32,NY=20,N=NX*NY;
const MPK={local:2,art:1.2,hwy:0.6};/* Minutes per km: 30 / 50 / 100 km/h */
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
/* Three levels of routing tiles: local 4×4 km (all roads), arterial 8×8 km (arterials + highways), and 1 highway tile (highways only) */
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
  title:'Routing Tiles: Load Only the Subgraph a Route Needs',
  summary:'A 32 × 20 km grid road network: thin lines are local roads, thicker ones are arterials, and the thickest are the two highways. Pick a search method and run it to see which routing tiles it loads (blue = 4 km local tiles, purple = 8 km arterial tiles), how many intersections it expands (blue dots), and the final route in green. Click the map to move the start or end.',
  caveat:'Travel times assume 30 km/h on local roads, 50 km/h on arterials, and 100 km/h on highways, and highways can only be entered or exited at interchanges (every 4 km). The hierarchy is simplified to “within 3 km of the start or end use local tiles, within 7 km use arterial tiles, and otherwise use only highway tiles”. Real systems divide levels, define transitions, and weight roads by traffic in far more complex ways.',
  mount(ctx){
    ctx.css('rt',`
.rt-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:#66756d;margin:6px 0 0}
.rt-legend i{display:inline-block;width:14px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.rt-svg{border:1px solid #e3e9e1;border-radius:10px;background:#fbfcfa;cursor:crosshair;touch-action:manipulation}
.rt-cap{font-size:13px;color:#66756d;margin:8px 0 0;line-height:1.6;min-height:3.2em}
.rt-cap b{color:#23352f}
`);
    const S={mode:'astar',A:nid(3,16),B:nid(27,4),target:'B',res:null};
    const MODES={dij:'Whole-graph Dijkstra',astar:'A* + on-demand tiles',hier:'Hierarchical routing tiles'};
    const modeCtl=ctx.segmented({label:'Search method',value:S.mode,wide:true,options:Object.entries(MODES),onChange:v=>{S.mode=v;ui()}});
    const tgtCtl=ctx.segmented({label:'Click map to set',value:'B',options:[['A','Start A'],['B','End B']],onChange:v=>{S.target=v}});
    ctx.button('Run search',()=>ui(),{primary:true});
    const ui=()=>{run(true).catch(()=>{})};

    let W=640,s=20,pad=10,padY=10,H=400,hwyPath=null;
    const svg=ctx.svg(W,H,{label:'Grid road network, routing tiles, and search progress'});svg.classList.add('rt-svg');
    const gT1=ctx.svgEl('g'),gT2=ctx.svgEl('g'),gR=ctx.svgEl('g'),gE=ctx.svgEl('g'),gP=ctx.svgEl('g'),gM=ctx.svgEl('g');svg.append(gT1,gT2,gR,gE,gP,gM);
    const cap=h('p',{class:'rt-cap','aria-live':'polite'});
    const lg=(c,t,b)=>h('span',null,h('i',{style:{background:c,border:b||null}}),t);
    ctx.stage.append(h('div',{class:'rt-legend'},lg('#d3dbd5','Local roads'),lg('#9fb0a4','Arterials'),lg('#56708f','Highways'),lg('#dfeaf7','Loaded local tiles','1px solid #8fb2dc'),lg('#ece6f6','Loaded arterial tiles','1px solid #b3a2d6'),lg(ctx.colors.info,'Expanded intersections'),lg(ctx.colors.ok,'Route')),cap);
    const st=ctx.stats([{key:'tiles',label:'Tiles loaded (local / arterial / highway)'},{key:'edges',label:'Road edges loaded'},{key:'exp',label:'Intersections expanded'},{key:'time',label:'Route time'},{key:'gap',label:'Versus optimal route'}]);
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
      st.set('tiles',`${r.cnt[2]} / ${r.cnt[1]} / ${r.cnt[0]}`,'info');st.set('edges',util.fmt(r.edges));st.set('exp',util.fmt(r.exp));
      st.set('time',r.time.toFixed(1)+' min','ok');const g=(r.time/opt-1)*100;st.set('gap',g<0.05?'same':'+'+g.toFixed(1)+'%',g<0.05?'ok':'warn');
    }
    let seq=0;
    async function run(animate){
      const my=++seq;clear();markers();
      const r=search(S.mode,S.A,S.B),opt=search('astar',S.A,S.B).time;S.res=r;
      const exps=r.trace.filter(e=>e.t==='exp').length,k=Math.max(1,Math.ceil(exps/80));
      let n=0,cntL=0,cntE=0;
      cap.innerHTML=`${MODES[S.mode]}: searching from A…`;
      for(const ev of r.trace){
        if(ev.t==='load'){const el=tileRect(ev.k);if(el)(ev.k[0]==='L'?gT2:gT1).append(el);else hwyPath.setAttribute('stroke','#2f6fb3');cntL++}
        else{const [x,y]=NP(ev.n);gE.append(ctx.svgEl('circle',{cx:x,cy:y,r:s>14?2.6:1.8,fill:ctx.colors.info,opacity:.75}));cntE++;n++;
          if(animate&&n%k===0){st.set('exp',String(cntE));st.set('tiles',String(cntL));await ctx.wait(35);if(my!==seq)return}}
      }
      gP.append(ctx.svgEl('polyline',{points:r.path.map(i=>NP(i).join(',')).join(' '),fill:'none',stroke:ctx.colors.ok,'stroke-width':s>14?4:3,'stroke-linejoin':'round','stroke-linecap':'round'}));
      showStats(r,opt);
      const g=(r.time/opt-1)*100;
      const parts=[`<b>${r.cnt[2]}</b> local ${r.cnt[2]===1?'tile':'tiles'}`];if(r.cnt[1])parts.push(`<b>${r.cnt[1]}</b> arterial ${r.cnt[1]===1?'tile':'tiles'}`);if(r.cnt[0])parts.push('1 highway tile');
      cap.innerHTML=`${MODES[S.mode]}: loaded ${parts.join(', ')}, <b>${util.fmt(r.edges)}</b> road edges in all, and expanded <b>${r.exp}</b> intersections. The route takes ${r.time.toFixed(1)} minutes, ${g<0.05?'the same as the optimal route':g.toFixed(1)+'% slower than the optimal route'}.`;
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
      {id:'whole',label:'Whole graph vs. on-demand loading',
        ask:'From A to B is about 27 km as the crow flies. Running Dijkstra on the whole road graph means loading all 40 local routing tiles first. If you switch to A* and load tiles on demand, how many tiles does it load?',
        insight:'Dijkstra loads all 40 tiles and 1,239 road edges, and expands 587 intersections before it settles the destination. A* estimates the remaining time as straight-line distance ÷ top speed and finds the same optimal 32.8-minute route, expanding 401 intersections and loading 34 tiles. The saving is small: with highways around, that estimate is very conservative, so A* still probes a large area of side roads. The longer the route, the more fine-grained tiles must be stitched together, which is why the chapter introduces hierarchical routing tiles',
        async run(){prep('dij',nid(3,16),nid(27,4));await run(true);await ctx.wait(1800);prep('astar');await run(true);await ctx.wait(1200)}},
      {id:'hier',label:'Long trip: hierarchical tiles',
        ask:'Same long route, now with hierarchical routing tiles: local tiles near the start and end, only arterial tiles a bit further out, and only highway tiles in the middle. How many fewer road edges are loaded and intersections expanded? Does the route get slower?',
        insight:'It loads just 6 local tiles, 6 arterial tiles, and 1 highway tile, 348 road edges in all (on-demand A* loaded 1,071), and expands 103 intersections (A* expanded 401); the route is again 32.8 minutes. This is the chapter’s “take the highway first, then expand local roads near the destination”: away from the start and end, side roads are no longer examined. Here the result happens to be optimal, but hierarchy is an approximation, and badly designed rules can miss a faster side road; the chapter only asks for routes that are accurate, drivable, and reasonably fast',
        async run(){prep('hier',nid(3,16),nid(27,4));await run(true);await ctx.wait(1500)}},
      {id:'short',label:'Short trip: one or two tiles',
        ask:'The start and end are only 3 km apart, with a tile boundary in between. How many local tiles does on-demand A* need to load?',
        insight:'It loads only 2 local tiles (66 road edges), expands 11 intersections, and finds a 6-minute route, never touching the other 38 tiles. Loading only the data relevant to the start and end is the whole point of cutting the road graph into routing tiles; the hierarchy is mainly for long trips',
        async run(){prep('astar',nid(9,9),nid(12,9));await run(true);await ctx.wait(1500)}},
    ]);
  }
});
})();
