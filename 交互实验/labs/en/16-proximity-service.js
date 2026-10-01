/* Chapter 16: Proximity Service. Lab 1 shows geohash precision, the nine-cell query, and the boundary problem; lab 2 shows quadtree density splits and k-nearest-neighbor search. */
(function(){
const {el:h,util}=SDLab;

/* ---------- Shared: the book example’s coordinates, the real geohash algorithm, synthetic business data (km; x east, y north) ---------- */
const LAT0=37.776720,LON0=-122.416730;
const KX=111.32*Math.cos(LAT0*Math.PI/180),KY=111.0;
const B32='0123456789bcdefghjkmnpqrstuvwxyz';
const toLL=(x,y)=>[LAT0+y/KY,LON0+x/KX];
function encode(x,y,len){
  const [lat,lon]=toLL(x,y);let lo=[-90,90],ln=[-180,180],bit=0,ch=0,even=true,s='';
  while(s.length<len){const r=even?ln:lo,v=even?lon:lat,m=(r[0]+r[1])/2;if(v>=m){ch=ch*2+1;r[0]=m}else{ch=ch*2;r[1]=m}even=!even;if(++bit===5){s+=B32[ch];bit=0;ch=0}}
  return s;
}
/** Cell size in degrees for a given length, and the km extent of the cell containing a point. */
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

/* Pick the geohash length from the radius, per the book’s reference table */
const TABLE=[[0.5,6],[1,5],[2,5],[5,4],[20,4]];

/* ---------------- Lab 1: geohash nine-cell query ---------------- */
SDLab.define({
  id:'geohash-nearby',chapter:16,
  title:'Geohash Nearby Search: Pick Precision, Query Nine Cells, Filter Exactly',
  summary:'Click the map to place the user, then pick a search radius. The LBS picks a geohash length from the reference table, takes the businesses in the home cell and its 8 neighbors as candidates, then filters them by real distance. Green is returned, amber is a candidate dropped by the distance filter, and red is a business inside the radius but outside the nine cells, so it was missed.',
  caveat:'The businesses are synthetic data generated around the book’s coordinates (37.776720, −122.416730). Geohash encoding and cell sizes use the real algorithm at that latitude, and distances use a local flat approximation. Neighbors come from re-encoding the home cell’s center ± one cell, with no handling of the poles or the 180° meridian.',
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
    const radius=ctx.segmented({label:'Search radius',value:0.5,options:TABLE.map(([r])=>[r,r+' km']),onChange:v=>{S.R=v;ui()}});
    const precCtl=ctx.segmented({label:'Geohash length',value:'auto',options:[['auto','Auto (table)'],['4','4'],['5','5'],['6','6'],['7','7']],onChange:v=>{S.prec=v;ui()}});
    ctx.button('Step through the query',()=>ui(),{primary:true});
    ctx.button('Reset to example location',()=>{S.x=0;S.y=0;S.pair=null;ui()});
    const ui=()=>{run(true).catch(()=>{})};

    let W=600,H=360,view=null;
    const svg=ctx.svg(W,H,{label:'Geohash grid, query circle, and business distribution'});svg.classList.add('gh-map');
    const gGrid=ctx.svgEl('g'),gCells=ctx.svgEl('g'),gPts=ctx.svgEl('g'),gLab=ctx.svgEl('g'),gTop=ctx.svgEl('g');
    const circle=ctx.svgEl('circle',{fill:'none',stroke:ctx.colors.info,'stroke-width':1.6,'stroke-dasharray':'5 4'});
    svg.append(gGrid,gCells,circle,gPts,gLab,gTop);
    const dots=BIZ.map(()=>{const c=ctx.svgEl('circle',{r:2.6});gPts.append(c);return c});
    const cap=h('p',{class:'gh-cap','aria-live':'polite'});
    const legend=h('div',{class:'gh-legend'},[['Returned (in radius)',ctx.colors.ok],['Candidate, dropped by distance',ctx.colors.warn],['Missed (in circle, not in queried cells)',ctx.colors.bad],['Fetched, not yet filtered',ctx.colors.info],['Not fetched',COL.idle]].map(([t,c])=>h('span',null,h('i',{style:{background:c}}),t)));
    ctx.stage.append(cap,legend);
    const st=ctx.stats([{key:'code',label:'User’s cell'},{key:'cell',label:'Cell size (E–W × N–S)'},{key:'cand',label:'Candidates fetched'},{key:'hit',label:'Returned (in radius)'},{key:'miss',label:'Missed'}]);

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
        const lx=Math.min(W-4,bx+10);gTop.append(ctx.svgEl('text',{x:lx,y:by-8,'font-size':12,'font-weight':650,'text-anchor':lx<bx+10?'end':'start',...HALO,text:'Business B '+encode(b[0],b[1],6)}));
      }
      const ux=X(S.x),uy=Y(S.y);
      gTop.append(ctx.svgEl('circle',{cx:ux,cy:uy,r:6,fill:ctx.colors.info,stroke:'#fff','stroke-width':2}));
      const lx=ux+10>W-40;
      gTop.append(ctx.svgEl('text',{x:lx?ux-10:ux+10,y:uy+(S.pair?18:4),'font-size':12,'font-weight':700,'text-anchor':lx?'end':'start',fill:'#1d4f86',...HALO,text:'User'}));
      return {cand,hit,miss,inR,pre};
    }
    function update(r){
      const p=P(),[dLon,dLat]=cellDeg(p),code=encode(S.x,S.y,8);
      st.set('code',code.slice(0,p),'info');
      const a=dLon*KX,b=dLat*KY;st.set('cell',a>=1&&b>=1?a.toFixed(1)+' × '+b.toFixed(1)+' km':a<1&&b<1?Math.round(a*1000)+' × '+Math.round(b*1000)+' m':fmtKm(a)+' × '+fmtKm(b));
      st.set('cand',S.shown.length?String(r.cand):'—');
      st.set('hit',S.phase==='done'?String(r.hit):'—',S.phase==='done'?'ok':null);
      st.set('miss',S.phase==='done'?String(r.miss):'—',S.phase==='done'?(r.miss?'bad':'ok'):null);
    }
    function setCap(html){cap.innerHTML=html}
    let seq=0;
    /** Run one query; with animate, reveal cell by cell. Returns the final stats. */
    async function run(animate){
      const my=++seq;
      S.all=nine();fit(S.all);drawGrid();
      const p=P(),code=encode(S.x,S.y,8),auto=S.prec==='auto';
      const head=`User geohash <code>${code}</code>, first ${p} characters <code>${code.slice(0,p)}</code>${auto?` (radius ${S.R} km maps to ${p} characters in the table)`:' (set manually)'}.`;
      if(animate){
        S.shown=[S.all[0]];S.phase='center';let r=paint();update(r);
        setCap(head+`<br>Step 1: query only the home cell → <b>${r.cand}</b> fetched. Another <b>${r.miss}</b> inside the circle lie outside it (red).`);
        await ctx.wait(1100);if(my!==seq)return;
        S.phase='ring';
        for(let i=1;i<9;i++){S.shown=S.all.slice(0,i+1);r=paint();update(r);setCap(head+`<br>Step 2: add neighbor ${i}/8 <code>${S.all[i].code}</code> → <b>${r.cand}</b> fetched so far.`);await ctx.wait(180);if(my!==seq)return}
        await ctx.wait(350);if(my!==seq)return;
      }
      S.shown=S.all;S.phase='done';const r=paint();update(r);
      const cover=r.miss?`<b style="color:${ctx.colors.bad}">The nine cells don’t cover the whole circle, missing ${r.miss}</b>. Expand to an outer ring of cells or use a shorter encoding.`:'The nine cells cover the whole circle, so nothing is missed.';
      setCap(head+`<br>Step 3: the 9 cells fetched <b>${r.cand}</b> in all. After the real-distance filter, <b>${r.hit}</b> are returned and ${r.cand-r.hit} are discarded. ${cover} The nine cells’ common prefix is <code>${r.pre||'(none)'}</code>.`);
      ctx.announce(`Fetched ${r.cand}, returned ${r.hit}, missed ${r.miss}`);
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
      {id:'book',label:'Book example: 500 m',
        ask:'The user searches 500 m at the book’s coordinates. The table gives a 6-character geohash, with cells of about 0.97 × 0.61 km, longer than the radius on both sides. Is querying only the user’s own cell enough?',
        insight:'No. The home cell alone fetches 7, while 3 more inside the circle sit in neighboring cells: this spot is only about 25 m from the cell’s south edge and about 345 m from its west edge, so a 500 m circle must cross the boundary. Adding the 8 neighbors fetches 68, and the distance filter leaves 9, with none missed. A cell larger than the radius doesn’t mean the circle fits in one cell, and 59 of the 68 fetched have to be dropped by the exact distance check',
        async run(){prepare(0.5,'auto',0,0);await run(true);await ctx.wait(1200)}},
      {id:'boundary',label:'Across a boundary: close, different prefix',
        ask:'The user and business B are only about 60 m apart, with the boundary between 4-character cells 9q8y and 9q8z running right between them. How many characters of their 6-character geohashes match? Can querying only the user’s own cell find B?',
        insight:'The user is in 9q8yyx and business B is in 9q8zn8, so only the first 3 characters, 9q8, match. Querying only the home cell (matching on prefix 9q8yyx) can’t find B. B is fetched only when the northern neighbor 9q8zn8 is queried, then it passes the distance filter. The nine cells’ common prefix is also down to 9q8 this time. A long shared prefix means the same cell, but being close doesn’t guarantee a shared prefix. On either side of the equator or the prime meridian, two very close points may differ in every character',
        async run(){prepare(0.5,'auto',1.0,1.775,[[1.0,1.775],[1.0,1.835]]);await run(true);await ctx.wait(1500)}},
      {id:'fine',label:'Precision too fine: nine cells miss the circle',
        ask:'Same 500 m search at the book’s coordinates, but with the length set manually to 7 characters (cells of about 120 × 150 m). Can the nine cells still cover a 500 m circle?',
        insight:'No. Nine 7-character cells cover only about 0.36 × 0.46 km, so of the 9 businesses in the circle only 4 are found and 5 are missed (red). The table keeps cells at least as large as the radius so that nine cells can cover the circle. Cell size also varies with latitude and precision, so when coverage falls short, keep expanding to outer neighbors',
        async run(){prepare(0.5,'7',0,0);await run(true);await ctx.wait(1500)}},
      {id:'density',label:'Fixed precision meets uneven density',
        ask:'Both searches use 1 km (5 characters, cells of about 3.9 × 4.9 km), first downtown, then in the suburbs. How different are the two candidate counts?',
        insight:'Downtown, the nine cells fetch 327 and the filter returns 94. In the suburbs, the nine cells fetch only 20, with just 1 within 1 km. Cell size is fixed and doesn’t follow business density: downtown must fetch and discard a lot of candidates, while the suburbs may not find enough results. This is exactly geohash’s drawback in the trade-off comparison, and a quadtree splits by density (see the next lab)',
        async run(){prepare(1,'auto',1.4,1.2);await run(true);await ctx.wait(1600);prepare(1,'auto',-12.5,-12);await run(true);await ctx.wait(1200)}},
    ]);
  }
});

/* ---------------- Lab 2: quadtree ---------------- */
SDLab.define({
  id:'quadtree-knn',chapter:16,
  title:'Quadtree: Split Cells by Density, Then Find the Nearest k',
  summary:'Any cell holding more than x businesses splits into four, until none exceeds x. Drag the threshold to see how the tree deepens. Click anywhere on the map to watch a k-nearest-neighbors query visit nodes in distance order (blue), check businesses (amber), and finally return its results (green).',
  caveat:'This uses the same synthetic businesses as the previous lab (a region of about 32 × 32 km). The book’s threshold is 100 with 200 million businesses; a small threshold here keeps the structure legible. The query is a best-first search ordered by the shortest distance to each cell, with distances approximated on a flat plane.',
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
    const sT=ctx.slider({label:'Threshold x (max businesses per leaf)',min:5,max:60,step:5,value:S.T,onChange:v=>{S.T=v;rebuild(true).catch(()=>{})}});
    const sK=ctx.slider({label:'k (how many nearest to find)',min:1,max:10,value:S.k,onChange:v=>{S.k=v;if(S.q)query(true).catch(()=>{})}});
    ctx.button('Rebuild level by level',()=>{rebuild(true).catch(()=>{})},{primary:true});
    ctx.button('Clear query',()=>{clearQ();draw()});

    const wrap=h('div',{class:'qt-wrap'});const box=h('div',{class:'qt-svg'});
    const side=h('div',{class:'qt-side'});const bars=h('div',{class:'qt-bars'});const cap=h('p',{class:'qt-cap','aria-live':'polite'});
    side.append(h('div',{style:{fontWeight:650,marginBottom:'4px'}},'Nodes per level: light blue = leaf, dark blue = split further'),bars,cap);
    wrap.append(box,side);ctx.stage.append(wrap);
    let Z=420;
    const svg=ctx.svg(Z,Z,{label:'Quadtree cells and business distribution',parent:box});
    const gLeaf=ctx.svgEl('g'),gVis=ctx.svgEl('g'),gPts=ctx.svgEl('g'),gTop=ctx.svgEl('g');svg.append(gVis,gLeaf,gPts,gTop);
    const dots=BIZ.map(()=>{const c=ctx.svgEl('circle',{r:2.2,fill:COL.idle});gPts.append(c);return c});
    const st=ctx.stats([{key:'depth',label:'Max depth'},{key:'leaf',label:'Leaves / nodes'},{key:'vis',label:'Nodes visited'},{key:'exam',label:'Businesses checked'},{key:'kd',label:'k-th nearest distance'},{key:'gh',label:'Compare: in 6-char nine cells'}]);
    const clearQ=()=>{S.q=null;S.res=null;for(const k of ['vis','exam','kd','gh'])st.set(k,'—')};
    const M=16,X=x=>(x+M)/(2*M)*Z,Y=y=>(M-y)/(2*M)*Z;

    function node(x0,y0,x1,y1,d,pts){return {x0,y0,x1,y1,d,pts,kids:null}}
    /** Split leaves above the threshold into four; returns whether any split this round. */
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
      st.set('depth',String(depth));st.set('leaf',leaves.length+' / '+ns.length);
      bars.replaceChildren();const mx=Math.max(...util.range(depth+1).map(d=>ns.filter(n=>n.d===d).length));
      for(let d=0;d<=depth;d++){const lv=ns.filter(n=>n.d===d),lf=lv.filter(n=>!n.kids).length,inn=lv.length-lf,side=32/2**d;
        bars.append(h('span',null,'Level '+d),h('span',{class:'b'},h('i',{style:{width:inn/mx*100+'%',background:ctx.colors.info}}),h('i',{style:{width:lf/mx*100+'%',background:'#a9c6e6'}})),h('span',{style:{color:'#66756d'}},lv.length+' · side '+fmtKm(side)))}
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
      if(animate){draw();summary();cap.innerHTML=`The root covers the whole area with <b>${BIZ.length}</b> businesses, over the threshold of ${S.T}, so it starts splitting.`;await ctx.wait(500);if(my!==seq)return}
      for(let d=0;d<S.maxD;d++){const any=splitLevel(S.tree,d);if(!any)break;if(animate){draw();const s=summary();cap.innerHTML=`Level ${d} cells with more than ${S.T} businesses split into four. The tree is now ${s.depth} levels deep with ${s.leaves} leaves.`;await ctx.wait(420);if(my!==seq)return}}
      const s=summary();draw();
      const leaves=all(S.tree).filter(n=>!n.kids),big=leaves.reduce((a,n)=>n.x1-n.x0>a.x1-a.x0?n:a),small=leaves.reduce((a,n)=>n.x1-n.x0<a.x1-a.x0?n:a);
      cap.innerHTML=`Build complete: <b>${s.depth}</b> levels deep, <b>${s.leaves}</b> leaves. The largest leaf is ${fmtKm(big.x1-big.x0)} on a side and the smallest ${fmtKm(small.x1-small.x0)}: cells are small where businesses are dense and large where they are sparse.`;
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
          if(animate){draw();st.set('vis',String(visited.length));st.set('exam',String(exam.size));await ctx.wait(160);if(my!==seq)return}}
      }
      S.res.win=new Set(best.map(b=>b[1]));S.res.done=true;S.res.kd=best.length?best[best.length-1][0]:0;
      draw();
      const pre=encode(p[0],p[1],6),bx=cellBox(p[0],p[1],6),w=bx.x1-bx.x0,hh=bx.y1-bx.y0;
      const ghN=BIZ.filter(q=>q[0]>=bx.x0-w&&q[0]<bx.x1+w&&q[1]>=bx.y0-hh&&q[1]<bx.y1+hh).length;
      st.set('vis',String(visited.length),'info');st.set('exam',String(exam.size),'warn');st.set('kd',fmtKm(S.res.kd),'ok');st.set('gh',String(ghN),ghN<k?'bad':null);
      cap.innerHTML=`Finding the nearest ${k}: visited <b>${visited.length}</b> nodes in order of shortest distance to each cell and checked <b>${exam.size}</b> businesses (out of ${BIZ.length} in total). The ${k}-th nearest is ${fmtKm(S.res.kd)} away. For comparison, the fixed 6-character geohash nine cells (${pre} and its neighbors) hold ${ghN}${ghN<k?', fewer than '+k+', so the search would have to expand outward':''}.`;
      ctx.announce(`Visited ${visited.length} nodes, checked ${exam.size} businesses`);
      return {vis:visited.length,exam:exam.size,kd:S.res.kd,gh:ghN};
    }
    svg.addEventListener('click',e=>{const b=svg.getBoundingClientRect();const px=(e.clientX-b.left)*Z/b.width,py=(e.clientY-b.top)*Z/b.height;
      S.q=[util.clamp(px/Z*2*M-M,-15.9,15.9),util.clamp(M-py/Z*2*M,-15.9,15.9)];query(true).catch(()=>{})});
    ctx.onResize(w=>{const nz=Math.round(Math.min(w,440));if(nz===Z&&S.tree)return;Z=nz;box.style.width=Z+'px';box.style.height=Z+'px';svg.setAttribute('viewBox',`0 0 ${Z} ${Z}`);if(S.tree)draw()});
    S.q=[0,0];rebuild(false);

    function prep(T,k){S.T=T;S.k=k;sT.set(T,true);sK.set(k,true);clearQ()}
    ctx.scenarios([
      {id:'build',label:'Recursive splitting by threshold',
        ask:'Threshold x = 20. How many times larger is a suburban leaf than a downtown one, and how deep does the tree go?',
        insight:'It goes 6 levels deep with 94 leaves. Downtown leaves are only 500 m square (level 6), while the largest suburban leaf is 8 km on a side (level 2), 16 times larger. Splitting happens only where businesses are plentiful, which is how a quadtree adjusts region size dynamically by density',
        async run(){prep(20,5);await rebuild(true);await ctx.wait(800)}},
      {id:'knn',label:'Nearest 5: downtown vs. suburbs',
        ask:'Find the nearest 5 businesses downtown and in the suburbs. Does the quadtree check very different numbers of businesses? Can the fixed 6-character geohash nine cells even find 5?',
        insight:'Downtown, it visits 9 nodes and checks 15 businesses, and the 5th nearest is about 193 m away. In the suburbs, it visits 7 nodes and checks 13, and the 5th nearest is 5.1 km away. Both check only a small part of the 560 businesses in total. By comparison, the fixed 6-character geohash nine cells hold 123 businesses to filter downtown, but only 1 in the suburbs, where you would have to widen ring by ring. Quadtree leaf size follows density, which is why it suits k-nearest neighbors',
        async run(){prep(20,5);await rebuild(false);S.q=[1.3,1.1];await query(true);await ctx.wait(1400);S.q=[-12.5,-12];await query(true);await ctx.wait(1200)}},
      {id:'threshold',label:'Smaller threshold, deeper tree',
        ask:'Lower the threshold from 40 to 5. How do the leaf count and maximum depth change?',
        insight:'At threshold 40 the tree is 5 levels deep with 40 leaves. At 5 it grows to 8 levels and 265 leaves, and the smallest leaf is only 125 m. A smaller threshold means each query checks fewer businesses, but there are more nodes, the tree is deeper, and memory use and rebuild time grow. The book uses 100 and estimates that building for 200 million businesses takes minutes, so roll out in batches and update mostly by periodic rebuilds',
        async run(){prep(40,5);await rebuild(false);await ctx.wait(1500);prep(5,5);await rebuild(true);await ctx.wait(800)}},
    ]);
  }
});
})();
