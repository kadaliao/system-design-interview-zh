/* Chapter 5: consistent hashing. Lab 1 compares how many keys move under modulo vs. the hash ring when servers join or leave; Lab 2 shows how virtual nodes improve balance and why they cannot spread out a hot key. */
(function(){
const {el:h,util}=SDLab;
const C=SDLab.colors;
const PAL=['#2f6fb3','#b8477a','#1f8a8a','#7b5cb8','#8c6d46','#56657a','#5b9bd5','#d0739f','#4fa9a2','#a08ad4'];
/* FNV-1a separates the high bits of adjacent strings poorly, so run it through murmur3’s fmix32 mixer as well. */
const mix=x=>{x^=x>>>16;x=Math.imul(x,0x85ebca6b);x^=x>>>13;x=Math.imul(x,0xc2b2ae35);x^=x>>>16;return x>>>0};
const hash32=s=>mix(util.hash(s));

/* ---------------- Lab 1: modulo vs. hash ring ---------------- */
SDLab.define({
  id:'hash-ring',chapter:5,
  title:'Hash Ring: Who Moves When a Server Joins or Leaves',
  summary:'The teaching hash ring spans 0–99, and each key walks clockwise from its position to the first server; the side panel routes the same keys with hash % N. Add or remove a server and compare which keys change owner under each scheme.',
  caveat:'The hash space is shrunk to the integers 0–99. The demo keys’ positions are given directly, while the 30 keys’ positions come from a hash modulo 100. Only primary owners are drawn, with no replicas or virtual nodes. Modulo routing numbers servers 0…N−1 in the order they joined. “Moved” only means the owner changed; a real migration also has to copy data, verify it, and switch routing.',
  mount(ctx){
    ctx.css('hr',`
.hr-wrap{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:14px;align-items:start}
.hr-narrow .hr-wrap{grid-template-columns:minmax(0,1fr)}
.hr-ring svg{max-width:380px;margin:0 auto}
.hr-hit{cursor:pointer}
.hr-cols{display:grid;gap:6px;margin-top:6px}
.hr-col{border:1px solid #dbe2da;border-radius:8px;background:#fff;min-height:84px;padding:4px 5px 6px;min-width:0}
.hr-col .hd{font-size:12px;font-weight:700;border-bottom:3px solid;padding:0 1px 2px;margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hr-chips{display:flex;flex-wrap:wrap;gap:3px}
.hr-chip{font-size:12px;line-height:1.55;padding:0 5px;border-radius:5px;background:#eef2ec;font-family:ui-monospace,Menlo,monospace;white-space:nowrap}
.hr-chip.mv{background:#f6ead2;color:#86561a;box-shadow:0 0 0 1px #b7791f inset}
.hr-formula{font-size:12px;color:#66756d;font-family:ui-monospace,Menlo,monospace;line-height:1.7;margin-top:6px}
.hr-sum{font-size:13.5px;margin:10px 0 0;padding:8px 12px;border-radius:8px;background:#f0f4ed;line-height:1.65}
.hr-sum b.w{color:#86561a}
@keyframes hr-pulse{0%{stroke-width:6;opacity:1}100%{stroke-width:2.5;opacity:.9}}
.hr-halo{animation:hr-pulse .8s ease-out 3}
`);
    const R=118,CX=170,CY=170;
    const DEMO=[['kA',10],['kB',35],['kC',60],['kD',90]].map(([name,hv])=>({name,h:hv}));
    const MANY=util.range(30).map(i=>({name:'k'+String(i+1).padStart(2,'0'),h:hash32('key:'+(i+1))%100}));
    const START=[['S1',20],['S2',50],['S3',80]];
    let servers,nextId,keys,keySet='demo',moved={ring:new Set(),mod:new Set()},hl=null,ghost=null,walkTok=0;
    const mk=(name,pos,i)=>({name,pos,order:i,color:PAL[(i-1)%PAL.length]});
    function initServers(){servers=START.map(([n,p],i)=>mk(n,p,i+1));nextId=4}
    const byPos=l=>l.slice().sort((a,b)=>a.pos-b.pos);
    const byOrder=l=>l.slice().sort((a,b)=>a.order-b.order);
    const ringOwner=(x,l)=>{const s=byPos(l);return s.find(v=>v.pos>=x)||s[0]};
    const modOwner=(x,l)=>{const s=byOrder(l);return s[x%s.length]};
    const pred=(p,l)=>{const s=byPos(l).filter(v=>v.pos!==p);const lo=s.filter(v=>v.pos<p);return lo.length?lo[lo.length-1]:s[s.length-1]};
    const succ=(p,l)=>{const s=byPos(l).filter(v=>v.pos!==p);return s.find(v=>v.pos>p)||s[0]};
    const iv=(a,b)=>`(${a},${b}]`;
    initServers();keys=DEMO;

    /* ---- stage ---- */
    const wrap=h('div',{class:'hr-wrap'});
    const ringBox=h('div',{class:'sdl-panel hr-ring'},h('div',{class:'ph'},'Consistent hashing: first server clockwise'));
    const modBox=h('div',{class:'sdl-panel'});
    const modTitle=h('div',{class:'ph'});
    const cols=h('div',{class:'hr-cols'});
    const formula=h('div',{class:'hr-formula'});
    modBox.append(modTitle,cols,formula);
    wrap.append(ringBox,modBox);
    const sum=h('p',{class:'hr-sum'});
    ctx.stage.append(wrap,sum);
    ctx.onResize(w=>ctx.stage.classList.toggle('hr-narrow',w<640));
    const svg=ctx.svg(340,340,{parent:ringBox,label:'Hash ring from 0 to 99, with server and key positions'});
    const S=(t,a,...k)=>ctx.svgEl(t,t==='text'&&a&&a.fill?{...a,style:'fill:'+a.fill}:a,...k);/* the runtime CSS sets the fill of every text element, so colors must be inline styles */
    const ang=p=>p/100*Math.PI*2-Math.PI/2;
    const pt=(p,r)=>[CX+r*Math.cos(ang(p)),CY+r*Math.sin(ang(p))];
    const f1=v=>v.toFixed(1);
    function arcPath(a,b,r){
      let span=((b-a)%100+100)%100;if(span===0)span=100;
      const [x0,y0]=pt(a,r);
      if(span>=99.99){const [x1,y1]=pt(a+50,r);return `M${f1(x0)} ${f1(y0)}A${r} ${r} 0 1 1 ${f1(x1)} ${f1(y1)}A${r} ${r} 0 1 1 ${f1(x0)} ${f1(y0)}`}
      const [x1,y1]=pt(a+span,r);return `M${f1(x0)} ${f1(y0)}A${r} ${r} 0 ${span>50?1:0} 1 ${f1(x1)} ${f1(y1)}`;
    }
    svg.append(S('circle',{cx:CX,cy:CY,r:R,fill:'none',stroke:C.line,'stroke-width':2}));
    const arcsG=S('g'),hlG=S('g'),tickG=S('g'),trailG=S('g'),keysG=S('g'),srvG=S('g'),ptrG=S('g');
    svg.append(arcsG,hlG,tickG,trailG,keysG,srvG,ptrG);
    for(const p of [0,25,50,75]){const [x0,y0]=pt(p,R-5),[x1,y1]=pt(p,R+5),[tx,ty]=pt(p,R-15);tickG.append(S('line',{x1:x0,y1:y0,x2:x1,y2:y1,stroke:'#9aa89f','stroke-width':1.5}),S('text',{x:tx,y:ty+4,'text-anchor':'middle','font-size':11,fill:C.muted,text:String(p)}))}
    const ctr1=S('text',{x:CX,y:CY-6,'text-anchor':'middle','font-size':14,'font-weight':700}),ctr2=S('text',{x:CX,y:CY+14,'text-anchor':'middle','font-size':12,fill:C.muted});
    svg.append(ctr1,ctr2);

    function drawRing(){
      arcsG.replaceChildren();hlG.replaceChildren();srvG.replaceChildren();keysG.replaceChildren();
      const s=byPos(servers);
      s.forEach((sv,i)=>{const p=s[(i-1+s.length)%s.length];arcsG.append(S('path',{d:s.length===1?arcPath(sv.pos,sv.pos,R):arcPath(p.pos,sv.pos,R),stroke:sv.color,'stroke-width':9,fill:'none',opacity:.3}))});
      if(hl)hlG.append(S('path',{d:arcPath(hl.a,hl.b,R),stroke:C.warn,'stroke-width':18,fill:'none',opacity:.35,'stroke-linecap':'butt'}));
      // keys at the same position are staggered inward
      const seen={};
      for(const k of keys){
        const o=ringOwner(k.h,servers),n=seen[k.h]=(seen[k.h]||0)+1,r=R-27-(n-1)*9;
        const [x,y]=pt(k.h,r);const g=S('g',{class:'hr-hit',role:'button',tabindex:0,'aria-label':`${k.name}, hash ${k.h}, owned by ${o.name}; click to animate the lookup`,onclick:()=>{walk(k).catch(()=>{})},onkeydown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();walk(k).catch(()=>{})}}});
        if(moved.ring.has(k.name))g.append(S('circle',{cx:f1(x),cy:f1(y),r:10,fill:'none',stroke:C.warn,'stroke-width':2.5,class:'hr-halo'}));
        g.append(S('circle',{cx:f1(x),cy:f1(y),r:keySet==='demo'?6:5,fill:o.color,stroke:'#fff','stroke-width':1.5}));
        if(keySet==='demo'){const [lx,ly]=pt(k.h,R-47);g.append(S('text',{x:f1(lx),y:f1(ly+4),'text-anchor':'middle','font-size':12.5,'font-weight':650,text:`${k.name} ${k.h}`}))}
        keysG.append(g);
      }
      for(const sv of s){
        const [x,y]=pt(sv.pos,R),[lx,ly]=pt(sv.pos,R+21);const dx=lx-CX;
        const g=S('g',{class:'hr-hit',role:'button',tabindex:0,'aria-label':`${sv.name}, position ${sv.pos}; click to select it for removal`,onclick:()=>{rmSel.set(sv.name)},onkeydown:e=>{if(e.key==='Enter'){rmSel.set(sv.name)}}});
        g.append(S('rect',{x:f1(x-8),y:f1(y-8),width:16,height:16,rx:3,fill:sv.color,stroke:'#fff','stroke-width':2}),
          S('text',{x:f1(lx),y:f1(ly+4),'text-anchor':Math.abs(dx)<18?'middle':dx>0?'start':'end','font-size':13,'font-weight':750,fill:sv.color,text:`${sv.name} ${sv.pos}`}));
        srvG.append(g);
      }
      if(ghost!=null&&!servers.some(v=>v.pos===ghost)){const [x,y]=pt(ghost,R),[lx,ly]=pt(ghost,R+21);const dx=lx-CX;srvG.append(S('rect',{x:f1(x-8),y:f1(y-8),width:16,height:16,rx:3,fill:'#fff',stroke:C.warn,'stroke-width':2,'stroke-dasharray':'3 2'}),S('text',{x:f1(lx),y:f1(ly+4),'text-anchor':Math.abs(dx)<18?'middle':dx>0?'start':'end','font-size':12.5,'font-weight':650,fill:C.warn,text:`new ${ghost}`}))}
      if(hl){ctr1.textContent=hl.title;ctr1.style.fill=C.warn;ctr2.textContent=hl.sub}
      else{ctr1.textContent=`${servers.length} server${servers.length===1?'':'s'}`;ctr1.style.fill=C.ink;ctr2.textContent='Click a key for the lookup'}
    }
    function chip(k){return h('span',{class:'hr-chip'+(moved.mod.has(k.name)?' mv':''),dataset:{k:k.name},title:`hash=${k.h}`},keySet==='demo'?`${k.name}=${k.h}`:k.name)}
    function drawMod(animate){
      const before=animate?new Map([...cols.querySelectorAll('.hr-chip')].map(c=>[c.dataset.k,c.getBoundingClientRect()])):null;
      const list=byOrder(servers);
      modTitle.textContent=`Comparison: hash % N (N=${list.length})`;
      cols.style.gridTemplateColumns=`repeat(${list.length},minmax(0,1fr))`;
      cols.replaceChildren(...list.map((sv,i)=>{const chips=h('div',{class:'hr-chips'});for(const k of keys)if(modOwner(k.h,list)===sv)chips.append(chip(k));return h('div',{class:'hr-col'},h('div',{class:'hd',style:{borderColor:sv.color,color:sv.color}},`${i} · ${sv.name}`),chips)}));
      formula.replaceChildren(...(keySet==='demo'?keys.map(k=>h('div',null,`${k.name}: ${k.h} % ${list.length} = ${k.h%list.length} → ${modOwner(k.h,list).name}`)):[h('div',null,`Each key goes to server (hash % ${list.length})`)]));
      if(!before)return;
      for(const c of cols.querySelectorAll('.hr-chip')){
        const b=before.get(c.dataset.k);if(!b)continue;const r=c.getBoundingClientRect();const dx=b.left-r.left,dy=b.top-r.top;
        if(Math.abs(dx)+Math.abs(dy)<1)continue;
        c.style.transition='none';c.style.transform=`translate(${dx}px,${dy}px)`;c.getBoundingClientRect();
        c.style.transition='transform .75s cubic-bezier(.3,.7,.3,1)';c.style.transform='';
      }
    }
    const st=ctx.stats([{key:'n',label:'Servers'},{key:'ring',label:'Ring: keys moved'},{key:'mod',label:'Modulo: keys moved'},{key:'iv',label:'Last affected range'}]);
    function render(animate){
      drawRing();drawMod(animate);
      st.set('n',servers.length+(servers.length===1?' server':' servers'));
      addBtn.disabled=servers.length>=6||servers.some(v=>v.pos===posCtl.get());
      rmBtn.disabled=servers.length<=1;
      const opts=byOrder(servers).map(v=>h('option',{value:v.name},`${v.name} (position ${v.pos})`));const cur=rmSel.get();rmSel.input.replaceChildren(...opts);rmSel.input.value=servers.some(v=>v.name===cur)?cur:byOrder(servers)[0].name;
    }
    function setMoved(){st.set('ring','—');st.set('mod','—');st.set('iv','—');moved={ring:new Set(),mod:new Set()}}
    const pct=(a,b)=>`${a} / ${b} (${Math.round(a/b*100)}%)`;
    function apply(next,change){
      const old=servers;servers=next;
      moved={ring:new Set(),mod:new Set()};const rm=[],mm=[];
      for(const k of keys){
        const r0=ringOwner(k.h,old).name,r1=ringOwner(k.h,next).name,m0=modOwner(k.h,old).name,m1=modOwner(k.h,next).name;
        if(r0!==r1){moved.ring.add(k.name);rm.push(`${k.name} ${r0}→${r1}`)}
        if(m0!==m1){moved.mod.add(k.name);mm.push(`${k.name} ${m0}→${m1}`)}
      }
      hl=change.hl;ghost=null;render(true);
      st.set('ring',pct(rm.length,keys.length),rm.length/keys.length<.4?'ok':'warn');
      st.set('mod',pct(mm.length,keys.length),mm.length/keys.length>=.5?'bad':'warn');
      st.set('iv',change.hl.iv,'warn');
      const list=a=>a.length<=4?a.join(', '):a.slice(0,4).join(', ')+`, … (${a.length} in all)`;
      sum.replaceChildren(h('b',null,change.text+': '),`the ring changes only the range ${change.hl.iv}, moving `,h('b',{class:'w'},`${rm.length} key${rm.length===1?'':'s'}`),rm.length?` (${list(rm)})`:'','; with modulo, N goes from '+old.length+' to '+next.length+' and moves ',h('b',{class:'w'},`${mm.length} key${mm.length===1?'':'s'}`),mm.length?` (${list(mm)})`:'','.');
      ctx.log(`${change.text}: ring moved ${rm.length}, modulo moved ${mm.length}`,'info');
      ctx.announce(sum.textContent);
    }
    function previewAdd(p){
      if(servers.some(v=>v.pos===p)){ghost=null;hl=null;drawRing();ctr1.textContent=`Position ${p} is taken`;ctr1.style.fill=C.bad;ctr2.textContent='Pick another position';return}
      const pr=pred(p,servers),nx=ringOwner(p,servers);ghost=p;
      hl={a:pr.pos,b:p,iv:iv(pr.pos,p),title:`Will take ${iv(pr.pos,p)}`,sub:`This range was ${nx.name}’s`};drawRing();
    }
    function previewRemove(name){
      const t=servers.find(v=>v.name===name);if(!t||servers.length<=1)return;
      const pr=pred(t.pos,servers),nx=succ(t.pos,servers);ghost=null;
      hl={a:pr.pos,b:t.pos,iv:iv(pr.pos,t.pos),title:`${t.name} owns ${iv(pr.pos,t.pos)}`,sub:`Goes to ${nx.name} if removed`};drawRing();
    }
    function addServer(p){
      if(servers.some(v=>v.pos===p)||servers.length>=6)return;
      const pr=pred(p,servers),nx=ringOwner(p,servers),name='S'+nextId;
      const sv=mk(name,p,nextId++);
      apply([...servers,sv],{text:`Add ${name}=${p}`,hl:{a:pr.pos,b:p,iv:iv(pr.pos,p),title:`${iv(pr.pos,p)} moves to ${name}`,sub:`Rest unchanged (was ${nx.name}’s)`}});
    }
    function removeServer(name){
      const t=servers.find(v=>v.name===name);if(!t||servers.length<=1)return;
      const pr=pred(t.pos,servers),nx=succ(t.pos,servers);
      apply(servers.filter(v=>v!==t),{text:`Remove ${name}`,hl:{a:pr.pos,b:t.pos,iv:iv(pr.pos,t.pos),title:`${iv(pr.pos,t.pos)} moves to ${nx.name}`,sub:'Rest unchanged'}});
    }
    /* clockwise lookup animation: the pointer walks the ring from the key’s position to the first server */
    async function walk(k){
      const tok=++walkTok;const o=ringOwner(k.h,servers);const span=((o.pos-k.h)%100+100)%100;
      const n=Math.max(8,Math.round(span/1.4));const dot=S('circle',{r:7,fill:C.info,stroke:'#fff','stroke-width':2});
      ptrG.replaceChildren(dot);trailG.replaceChildren();const trail=S('path',{fill:'none',stroke:C.info,'stroke-width':5,'stroke-linecap':'round',opacity:.8});trailG.append(trail);
      try{
        for(let i=0;i<=n;i++){if(tok!==walkTok)return;const p=k.h+span*i/n;const [x,y]=pt(p,R);ctx.attr(dot,{cx:f1(x),cy:f1(y)});ctx.attr(trail,{d:i&&span?arcPath(k.h,p,R):''});await ctx.wait(24)}
        const wrapTxt=k.h>o.pos?', wrapping past 99/0':'';
        ctx.log(`${k.name}=${k.h} clockwise${wrapTxt} → meets ${o.name}=${o.pos}`,'info');ctx.announce(`${k.name} belongs to ${o.name}`);
        await ctx.wait(700);
      }finally{if(tok===walkTok){ptrG.replaceChildren();trailG.replaceChildren()}}
    }

    /* ---- controls ---- */
    const posCtl=ctx.slider({label:'New server position',min:0,max:99,value:65,onInput:v=>{previewAdd(v);addBtn.disabled=servers.length>=6||servers.some(s=>s.pos===v)}});
    const rmSel=ctx.select({label:'Server to remove',options:[['S1','S1']],onChange:v=>previewRemove(v)});
    const keyCtl=ctx.segmented({label:'Key set',value:'demo',options:[['demo','Q05 demo, 4 keys'],['many','30 keys']],onChange:v=>{keySet=v;keys=v==='demo'?DEMO:MANY;setMoved();hl=null;ghost=null;sum.textContent='Switched the key set. Add or remove a server and compare how many keys move on each side.';render(false)}});
    const addBtn=ctx.button('Add server',()=>addServer(posCtl.get()),{primary:true});
    const rmBtn=ctx.button('Remove selected',()=>removeServer(rmSel.get()));
    ctx.button('Reset to 3',()=>{initServers();setMoved();hl=null;ghost=null;sum.textContent='Reset to S1=20, S2=50, S3=80.';render(false);previewAdd(posCtl.get())});
    render(false);previewAdd(65);
    sum.textContent='The dashed square is the server about to join (drag “New server position” to move it); the amber arc is the range it will take over. Click “Add server” to see which keys move on each side.';

    async function prepare(set){
      walkTok++;keySet=set;keys=set==='demo'?DEMO:MANY;keyCtl.set(set,true);initServers();setMoved();hl=null;ghost=null;ctx.clearLog();
      posCtl.set(65,true);render(false);sum.textContent='Getting ready…';await ctx.wait(500);
    }
    async function slideTo(target){let v=posCtl.get();while(v!==target){v+=v<target?1:-1;posCtl.set(v,true);previewAdd(v);await ctx.wait(45)}}
    ctx.scenarios([
      {id:'draw',label:'3 servers, 4 keys',
        ask:'S1=20, S2=50, S3=80; kA=10, kB=35, kC=60, kD=90. Who owns each key? kD=90 is closest to S3=80, so does it belong to S3?',
        insight:'kA→S1, kB→S2, kC→S3. kD walks clockwise past 99/0 and meets S1 first, so it belongs to S1, not the numerically nearest S3. S1 owns (80,20], which crosses zero, and one server getting 2 keys does not violate the definition of consistent hashing.',
        async run(){await prepare('demo');sum.textContent='Each key starts at its own position and walks clockwise to the first server.';for(const k of DEMO){await walk(k);await ctx.wait(200)}sum.textContent='kA→S1, kB→S2, kC→S3, kD→S1 (wraps past 99/0).'}},
      {id:'add',label:'Add S4=65',
        ask:'Add S4 at position 65. On the hash ring, which range and which keys move? With hash % N, when N goes from 3 to 4, how many keys move?',
        insight:'On the ring only (50,65] changes from S3 to S4, and of the 4 keys only kC=60 moves; (65,80] still belongs to S3. With modulo, kA, kB, and kD all change servers (75%) and only kC happens to stay put: once N changes, almost every key’s remainder changes.',
        async run(){await prepare('demo');await slideTo(65);await ctx.wait(900);addServer(65);await ctx.wait(1400);await walk(DEMO[2])}},
      {id:'wrap',label:'New node at 5 (crosses zero)',
        ask:'Still 3 servers, but this time S4 goes at position 5. How is the affected range written? How does the modulo move count compare with adding at 65?',
        insight:'The predecessor is 80, so the affected range is (80,5], crossing zero: 81…99 and 0…5. kD=90 moves from S1 to S4, while kA=10 stays with S1. Modulo still moves kA, kB, and kD, exactly as when adding at 65: modulo does not care where the new machine goes.',
        async run(){await prepare('demo');await slideTo(5);await ctx.wait(900);addServer(5);await ctx.wait(1400);await walk(DEMO[3])}},
      {id:'remove',label:'30 keys: remove S2',
        ask:'Switch to 30 keys and remove S2. How many keys move on the hash ring? How many with modulo (N from 3 to 2)?',
        insight:'S2 owned 8 keys in (20,50]. On the ring only those 8 go to the successor S3 (27%), and no key already on S1 or S3 moves. Modulo moves 17 (57%): besides S2’s keys, many keys that were sitting fine on S1 and S3 get reassigned too. Note also that S1 alone holds 14 keys; that skew is what the next lab addresses.',
        async run(){await prepare('many');rmSel.set('S2');await ctx.wait(1500);removeServer('S2');await ctx.wait(2500)}},
    ]);
  }
});

/* ---------------- Lab 2: virtual nodes and the hot key ---------------- */
SDLab.define({
  id:'hash-ring-vnodes',chapter:5,
  title:'Virtual Nodes: Even Keys, Same Hot Key',
  summary:'10,000 keys are divided among a few physical servers. Drag each server’s virtual node count to see the territory on the ring get chopped up and the skew in per-server key counts shrink; then give one hot key a share of the requests and see whether it gets spread out too.',
  caveat:'Key and virtual node positions are 32-bit hashes (FNV-1a plus a mixing function); the statistics count the primary owners of 10,000 sample keys, with no replicas. Ordinary keys are assumed to be accessed uniformly, and the hot key’s share is set directly by the slider.',
  mount(ctx){
    ctx.css('hv',`
.hv-wrap{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:14px;align-items:start}
.hv-narrow .hv-wrap{grid-template-columns:minmax(0,1fr)}
.hv-wrap svg{max-width:330px;margin:0 auto}
.hv-row{display:grid;grid-template-columns:34px minmax(0,1fr) 118px;gap:8px;align-items:center;font-size:12.5px;margin:3px 0}
.hv-row .nm{font-weight:750}
.hv-row .val{font-variant-numeric:tabular-nums;text-align:right;color:#66756d;line-height:1.35}
.hv-row .val b{color:#23352f;font-weight:650}
.hv-row .val .hot{color:#c2413b;font-weight:700}
.hv-track{position:relative;height:10px;background:#eef2ec;border-radius:3px;margin:2px 0}
.hv-track i{position:absolute;left:0;top:0;bottom:0;border-radius:3px;transition:width .35s}
.hv-track .gv{position:absolute;right:0;top:0;bottom:0;background:repeating-linear-gradient(45deg,#b7791f 0 3px,#f6ead2 3px 6px);border-radius:0 3px 3px 0;transition:width .35s}
.hv-track u{position:absolute;top:-3px;bottom:-3px;width:0;border-left:2px dashed #23352f;opacity:.55}
.hv-track.req i{background:#9aa89f}
.hv-track.req i.hot{background:#c2413b}
.hv-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:#66756d;margin-top:8px}
.hv-legend span{display:inline-flex;align-items:center;gap:5px}
.hv-legend i{display:inline-block;width:12px;height:8px;border-radius:2px}
.hv-row .val>div:first-child,.hv-row .val>b{white-space:nowrap}
.hv-narrow .hv-row{grid-template-columns:30px minmax(0,1fr) 112px;font-size:12px}
`);
    const K=10000,VS=[1,2,5,10,20,50,100,200,500];
    const keyH=new Uint32Array(K);for(let i=0;i<K;i++)keyH[i]=hash32('user:'+i);
    const HOT=hash32('product:hot');
    const P={n:4,vi:0,hot:0,dbl:false};let join=null;
    function build(n,v,dbl){
      const pts=[];for(let s=0;s<n;s++){const c=v*(dbl&&s===0?2:1);for(let j=0;j<c;j++)pts.push([hash32('S'+(s+1)+'#'+j),s])}
      pts.sort((a,b)=>a[0]-b[0]);return {pos:pts.map(p=>p[0]),own:pts.map(p=>p[1]),n};
    }
    function owner(ring,x){let lo=0,hi=ring.pos.length;while(lo<hi){const m=(lo+hi)>>1;if(ring.pos[m]>=x)hi=m;else lo=m+1}return ring.own[lo===ring.pos.length?0:lo]}
    function assign(ring){const o=new Uint8Array(K),c=new Array(ring.n).fill(0);for(let i=0;i<K;i++){const s=owner(ring,keyH[i]);o[i]=s;c[s]++}return {o,c}}

    const wrap=h('div',{class:'hv-wrap'});
    const ringBox=h('div',{class:'sdl-panel'},h('div',{class:'ph'},'Ring territory (color = physical server)'));
    const barBox=h('div',{class:'sdl-panel'});
    const barTitle=h('div',{class:'ph'},'Keys and requests per server');
    const rows=h('div');
    const legend=h('div',{class:'hv-legend'});
    barBox.append(barTitle,rows,legend);
    wrap.append(ringBox,barBox);
    const note=h('p',{class:'sdl-note',style:{fontSize:'13.5px'}});
    ctx.stage.append(wrap,note);
    ctx.onResize(w=>ctx.stage.classList.toggle('hv-narrow',w<640));
    const svg=ctx.svg(300,300,{parent:ringBox,label:'Virtual node positions on the hash ring'});
    const S=(t,a,...k)=>ctx.svgEl(t,t==='text'&&a&&a.fill?{...a,style:'fill:'+a.fill}:a,...k);/* the runtime CSS sets the fill of every text element, so colors must be inline styles */
    const CX=150,CY=150,R=112;
    const arcsG=S('g'),joinG=S('g'),hotG=S('g');
    const c1=S('text',{x:CX,y:CY-4,'text-anchor':'middle','font-size':15,'font-weight':750}),c2=S('text',{x:CX,y:CY+16,'text-anchor':'middle','font-size':12,fill:C.muted});
    svg.append(S('circle',{cx:CX,cy:CY,r:R,fill:'none',stroke:C.line,'stroke-width':16}),arcsG,joinG,hotG,c1,c2);
    const TAU=Math.PI*2,U=4294967296;
    const xy=(p,r)=>{const a=p/U*TAU-Math.PI/2;return [(CX+r*Math.cos(a)).toFixed(1),(CY+r*Math.sin(a)).toFixed(1)]};
    function arc(a,b,r){let span=b-a;if(span<=0)span+=U;const [x0,y0]=xy(a,r),[x1,y1]=xy(a+Math.min(span,U-1),r);return `M${x0} ${y0}A${r} ${r} 0 ${span>U/2?1:0} 1 ${x1} ${y1}`}
    function runs(ring,filter){
      // merge adjacent arcs with the same owner; returns [start, end, owner]
      const L=ring.pos.length,out=[];
      for(let i=0;i<L;i++){const a=ring.pos[(i-1+L)%L],b=ring.pos[i],o=ring.own[i];if(filter&&!filter(i))continue;const last=out[out.length-1];if(last&&last[2]===o&&last[1]===a)last[1]=b;else out.push([a,b,o])}
      return out;
    }
    const st=ctx.stats([{key:'vn',label:'Total virtual nodes on ring'},{key:'cv',label:'Key count skew (std dev / mean)'},{key:'max',label:'Largest server / fair share'},{key:'hot',label:'Hot key server’s share of requests'}]);
    let ring,res;
    function weight(s){return P.dbl&&s===0?2:1}
    function update(){
      const V=VS[P.vi];ring=build(P.n,V,P.dbl);res=assign(ring);
      const wsum=util.range(P.n).reduce((a,s)=>a+weight(s),0);
      const ideal=s=>K*weight(s)/wsum;
      // ring
      // all arcs of a server are joined into one path, so there are only N elements however many virtual nodes exist
      const segs=runs(ring),ds=util.range(P.n).map(()=>[]);for(const [a,b,o] of segs)ds[o].push(arc(a,b,R));
      arcsG.replaceChildren(...ds.map((d,o)=>S('path',{d:d.join(''),stroke:PAL[o],'stroke-width':16,fill:'none'})));
      joinG.replaceChildren();
      if(join&&join.n===P.n)joinG.append(S('path',{d:runs(ring,i=>ring.own[i]===P.n-1).map(([a,b])=>arc(a,b,R+13)).join(''),stroke:C.warn,'stroke-width':5,fill:'none'}));
      hotG.replaceChildren();
      const hotOwner=owner(ring,HOT);
      if(P.hot>0){const [x,y]=xy(HOT,R);const [lx,ly]=xy(HOT,R-26);hotG.append(S('circle',{cx:x,cy:y,r:6,fill:C.bad,stroke:'#fff','stroke-width':2}),S('text',{x:lx,y:+ly+4,'text-anchor':'middle','font-size':12,'font-weight':700,fill:C.bad,text:'hot'}))}
      c1.textContent=`${P.n} servers × ${V}`;c2.textContent=`${V===1?'position':'virtual nodes'} each, ${segs.length} arcs`;
      // bars
      const req=util.range(P.n).map(s=>(1-P.hot)*res.c[s]/K+(P.hot>0&&s===hotOwner?P.hot:0));
      const shares=res.c.map(c=>c/K);
      const gaveOf=s=>join&&join.n===P.n&&s<P.n-1?join.from[s]:0;
      const scale=Math.max(...shares.map((x,s)=>Math.max(x+gaveOf(s)/K,ideal(s)/K)),...(P.hot>0?req:[0]))*1.08;
      rows.replaceChildren(...util.range(P.n).map(s=>{
        const gave=gaveOf(s);
        const keyTrack=h('div',{class:'hv-track'},h('i',{style:{width:(shares[s]/scale*100)+'%',background:PAL[s]}}),gave?h('span',{class:'gv',style:{width:(gave/K/scale*100)+'%',right:(100-(shares[s]+gave/K)/scale*100)+'%'}}):null,h('u',{style:{left:(ideal(s)/K/scale*100)+'%'}}));
        const reqTrack=P.hot>0?h('div',{class:'hv-track req'},h('i',{class:s===hotOwner?'hot':null,style:{width:(req[s]/scale*100)+'%'}})):null;
        return h('div',{class:'hv-row'},h('div',{class:'nm',style:{color:PAL[s]}},'S'+(s+1)),h('div',null,keyTrack,reqTrack),
          h('div',{class:'val'},h('div',null,h('b',null,util.fmt(res.c[s])),' keys · '+util.pct(shares[s])),gave?h('div',{style:{color:C.warn}},'gave up '+util.fmt(gave)):null,P.hot>0?h('div',{class:s===hotOwner?'hot':null},'Requests '+util.pct(req[s])+(s===hotOwner?' (hot)':'')):null));
      }));
      legend.replaceChildren(...[h('span',null,h('i',{style:{background:PAL[0]}}),'Key count'),h('span',null,h('i',{style:{background:'none',borderLeft:'2px dashed #23352f',width:'2px'}}),'Fair share by capacity'),
        join&&join.n===P.n?h('span',null,h('i',{style:{background:'repeating-linear-gradient(45deg,#b7791f 0 3px,#f6ead2 3px 6px)'}}),'Keys given to the new server'):null,
        P.hot>0?h('span',null,h('i',{style:{background:'#9aa89f'}}),'Requests'):null,P.hot>0?h('span',null,h('i',{style:{background:C.bad}}),'Server with the hot key'):null].filter(Boolean));
      // stats
      let sq=0,mx=0;for(let s=0;s<P.n;s++){const d=(res.c[s]-ideal(s))/ideal(s);sq+=d*d;mx=Math.max(mx,res.c[s]/ideal(s))}
      const cv=Math.sqrt(sq/P.n);
      st.set('vn',util.fmt(ring.pos.length));
      st.set('cv',util.pct(cv),cv>0.2?'bad':cv>0.08?'warn':'ok');
      st.set('max',mx.toFixed(2)+'×',mx>1.3?'bad':mx>1.1?'warn':'ok');
      st.set('hot',P.hot>0?`S${hotOwner+1} · ${util.pct(req[hotOwner])}`:'Off',P.hot>0?(req[hotOwner]>2/P.n?'bad':'warn'):null);
      return {cv,mx,hotOwner,req,counts:res.c.slice()};
    }
    function doJoin(){
      if(P.n>=10)return;
      const V=VS[P.vi];const before=assign(build(P.n,V,P.dbl)).o;const r2=build(P.n+1,V,P.dbl);const after=assign(r2).o;
      const from=new Array(P.n).fill(0);let total=0,other=0;
      for(let i=0;i<K;i++){if(after[i]!==before[i]){if(after[i]===P.n){from[before[i]]++;total++}else other++}}
      P.n++;nCtl.set(P.n,true);join={n:P.n,from,total};
      const srcs=from.map((c,s)=>[c,s]).filter(x=>x[0]>0);
      const r=update();
      note.textContent=`S${P.n} joins: it takes over ${util.fmt(total)} keys (${util.pct(total/K)}) from ${srcs.length} old server${srcs.length===1?'':'s'} (${srcs.map(([c,s])=>`S${s+1} ${util.fmt(c)}`).join(', ')}). ${other?'':'No other key changed owner.'}`;
      ctx.log(note.textContent,'info');ctx.announce(note.textContent);
      return {srcs,total,r};
    }
    const nCtl=ctx.slider({label:'Physical servers',min:3,max:10,value:P.n,format:v=>v+' servers',onInput:v=>{P.n=v;join=null;update()}});
    const vCtl=ctx.slider({label:'Virtual nodes each',min:0,max:VS.length-1,value:P.vi,format:i=>''+VS[i],onInput:i=>{P.vi=i;join=null;update()}});
    const hotCtl=ctx.slider({label:'Hot key’s share of requests',min:0,max:80,step:5,value:0,format:v=>v?v+'%':'off',onInput:v=>{P.hot=v/100;update()}});
    const dblCtl=ctx.toggle({label:'Double S1’s capacity (virtual nodes ×2)',value:false,onChange:v=>{P.dbl=v;join=null;update()}});
    ctx.button('Add a server',()=>doJoin(),{primary:true});
    update();
    note.textContent='Each server holds just 1 position on the ring, so territory size is pure luck. Drag “Virtual nodes each” to the right and watch the skew change.';

    async function prepare(o){
      Object.assign(P,{n:4,vi:0,hot:0,dbl:false},o);join=null;ctx.clearLog();
      nCtl.set(P.n,true);vCtl.set(P.vi,true);hotCtl.set(P.hot*100,true);dblCtl.set(P.dbl,true);update();await ctx.wait(700);
    }
    ctx.scenarios([
      {id:'balance',label:'Virtual nodes cut skew',
        ask:'4 servers, 10,000 keys. With 1 position each, how many times its fair share does the largest server hold? And with 100 virtual nodes each?',
        insight:'With 1 position each, S3 alone holds 7,196 keys, 2.88 times its fair share of 2,500, while S1 has only 19: a skew of 112%. The more virtual nodes, the more small pieces each territory is cut into, and the deviations cancel out: at 100 it drops to 8.5% (largest 1.10 times), and at 500 to 3.9%. The curve wobbles along the way (200 is slightly worse than 100), so look at the overall trend. More nodes also mean a bigger routing table and more upkeep.',
        async run(){await prepare({});const lines=[];for(let i=0;i<VS.length;i++){P.vi=i;vCtl.set(i,true);const r=update();lines.push(`${VS[i]===1?'1 position':VS[i]+' virtual nodes'}: skew ${util.pct(r.cv)}, largest ${r.mx.toFixed(2)}×`);note.textContent=lines[lines.length-1];ctx.log(lines[lines.length-1]);await ctx.wait(i===0?2200:1250)}note.textContent=lines.join('; ')+'.'}},
      {id:'join',label:'5th server: where keys come from',
        ask:'4 servers, then a 5th joins. With 1 position each, how many old servers do the new server’s keys come from? And with 100 virtual nodes each?',
        insight:'With 1 position, S5 cuts off just one range, and all 3,527 keys come from S3 alone. With 100 virtual nodes each, S5’s 100 small ranges are scattered around the whole ring and take 259–852 keys from each of the 4 old servers, 2,036 in total, about a fifth. In both cases no keys move between old servers. This is also the boundary Q05-02 mentions: a physical machine joining with several virtual nodes changes several small ranges.',
        async run(){await prepare({vi:0});const a=doJoin();await ctx.wait(4200);await prepare({vi:6});const b=doJoin();await ctx.wait(4200);note.textContent=`1 position: takes over ${util.fmt(a.total)} keys, from ${a.srcs.length} server${a.srcs.length===1?'':'s'}; 100 virtual nodes: takes over ${util.fmt(b.total)} keys, from ${b.srcs.length} server${b.srcs.length===1?'':'s'}.`}},
      {id:'hot',label:'A hot key is not spread out',
        ask:'10 servers, 100 virtual nodes each, and the key counts are already fairly close. If product:hot alone takes half of all requests, how much traffic does its server carry? What if you raise it to 200 virtual nodes?',
        insight:'At 100 virtual nodes the key counts are already fairly close (skew 11.8%), but product:hot lands on S8, which carries 55.4% of the requests while each of the other 9 servers gets only 4%–6%. At 200 the key skew drops to 7.6%, yet S8 still carries 55.2%: virtual nodes only change how keys are assigned, and every lookup of the same key still lands on one primary owner. A hot key needs application-level fixes such as replicating read-only data, request coalescing, or splitting counters.',
        async run(){await prepare({n:10,vi:6});await ctx.wait(800);for(let v=5;v<=50;v+=5){P.hot=v/100;hotCtl.set(v,true);update();await ctx.wait(110)}const a=update();note.textContent=`100 virtual nodes: key skew ${util.pct(a.cv)}, hot key on S${a.hotOwner+1}, whose share of requests is ${util.pct(a.req[a.hotOwner])}.`;await ctx.wait(3000);P.vi=7;vCtl.set(7,true);const b=update();note.textContent+=` Raised to 200: hot key on S${b.hotOwner+1}, and its share of requests is still ${util.pct(b.req[b.hotOwner])}.`;await ctx.wait(3000)}},
    ]);
  }
});
})();
