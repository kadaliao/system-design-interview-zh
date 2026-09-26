/* 第 5 章：一致性哈希。实验一对比取模与哈希环在增删服务器时的搬家量；实验二看虚拟节点怎样改善均衡、为何分摊不了热门 key。 */
(function(){
const {el:h,util}=SDLab;
const C=SDLab.colors;
const PAL=['#2f6fb3','#b8477a','#1f8a8a','#7b5cb8','#8c6d46','#56657a','#5b9bd5','#d0739f','#4fa9a2','#a08ad4'];
/* FNV-1a 对相邻字符串的高位区分度不够，再过一道 murmur3 的 fmix32 混合。 */
const mix=x=>{x^=x>>>16;x=Math.imul(x,0x85ebca6b);x^=x>>>13;x=Math.imul(x,0xc2b2ae35);x^=x>>>16;return x>>>0};
const hash32=s=>mix(util.hash(s));

/* ---------------- 实验一：取模 vs 哈希环 ---------------- */
SDLab.define({
  id:'hash-ring',chapter:5,
  title:'哈希环：增删一台服务器，谁要搬家',
  summary:'教学哈希环的取值是 0–99，key 从自己的位置顺时针找到第一台服务器；对照面板用 hash % N 路由同一批 key。加入或移除服务器，对比两种路由各有哪些 key 换了主人。',
  caveat:'哈希空间缩小为 0–99 的整数，示例 key 的位置直接给定，30 个 key 的位置由哈希取模得到；只画主归属，不画副本和虚拟节点。取模路由按服务器加入顺序编号 0…N−1。「搬家」只表示归属改变，真实迁移还要复制数据、校验并切换路由。',
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

    /* ---- 舞台 ---- */
    const wrap=h('div',{class:'hr-wrap'});
    const ringBox=h('div',{class:'sdl-panel hr-ring'},h('div',{class:'ph'},'一致性哈希：顺时针找第一台服务器'));
    const modBox=h('div',{class:'sdl-panel'});
    const modTitle=h('div',{class:'ph'});
    const cols=h('div',{class:'hr-cols'});
    const formula=h('div',{class:'hr-formula'});
    modBox.append(modTitle,cols,formula);
    wrap.append(ringBox,modBox);
    const sum=h('p',{class:'hr-sum'});
    ctx.stage.append(wrap,sum);
    ctx.onResize(w=>ctx.stage.classList.toggle('hr-narrow',w<640));
    const svg=ctx.svg(340,340,{parent:ringBox,label:'0 到 99 的哈希环，服务器与 key 的位置'});
    const S=(t,a,...k)=>ctx.svgEl(t,t==='text'&&a&&a.fill?{...a,style:'fill:'+a.fill}:a,...k);/* 运行时 CSS 统一设置了 text 的 fill，着色要写成内联样式 */
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
      // key：同一位置的多个 key 往内错开
      const seen={};
      for(const k of keys){
        const o=ringOwner(k.h,servers),n=seen[k.h]=(seen[k.h]||0)+1,r=R-27-(n-1)*9;
        const [x,y]=pt(k.h,r);const g=S('g',{class:'hr-hit',role:'button',tabindex:0,'aria-label':`${k.name}，哈希 ${k.h}，归 ${o.name}；点击演示查找`,onclick:()=>{walk(k).catch(()=>{})},onkeydown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();walk(k).catch(()=>{})}}});
        if(moved.ring.has(k.name))g.append(S('circle',{cx:f1(x),cy:f1(y),r:10,fill:'none',stroke:C.warn,'stroke-width':2.5,class:'hr-halo'}));
        g.append(S('circle',{cx:f1(x),cy:f1(y),r:keySet==='demo'?6:5,fill:o.color,stroke:'#fff','stroke-width':1.5}));
        if(keySet==='demo'){const [lx,ly]=pt(k.h,R-47);g.append(S('text',{x:f1(lx),y:f1(ly+4),'text-anchor':'middle','font-size':12.5,'font-weight':650,text:`${k.name} ${k.h}`}))}
        keysG.append(g);
      }
      for(const sv of s){
        const [x,y]=pt(sv.pos,R),[lx,ly]=pt(sv.pos,R+21);const dx=lx-CX;
        const g=S('g',{class:'hr-hit',role:'button',tabindex:0,'aria-label':`${sv.name}，位置 ${sv.pos}；点击选中以便移除`,onclick:()=>{rmSel.set(sv.name)},onkeydown:e=>{if(e.key==='Enter'){rmSel.set(sv.name)}}});
        g.append(S('rect',{x:f1(x-8),y:f1(y-8),width:16,height:16,rx:3,fill:sv.color,stroke:'#fff','stroke-width':2}),
          S('text',{x:f1(lx),y:f1(ly+4),'text-anchor':Math.abs(dx)<18?'middle':dx>0?'start':'end','font-size':13,'font-weight':750,fill:sv.color,text:`${sv.name} ${sv.pos}`}));
        srvG.append(g);
      }
      if(ghost!=null&&!servers.some(v=>v.pos===ghost)){const [x,y]=pt(ghost,R),[lx,ly]=pt(ghost,R+21);const dx=lx-CX;srvG.append(S('rect',{x:f1(x-8),y:f1(y-8),width:16,height:16,rx:3,fill:'#fff',stroke:C.warn,'stroke-width':2,'stroke-dasharray':'3 2'}),S('text',{x:f1(lx),y:f1(ly+4),'text-anchor':Math.abs(dx)<18?'middle':dx>0?'start':'end','font-size':12.5,'font-weight':650,fill:C.warn,text:`新 ${ghost}`}))}
      if(hl){ctr1.textContent=hl.title;ctr1.style.fill=C.warn;ctr2.textContent=hl.sub}
      else{ctr1.textContent=`${servers.length} 台服务器`;ctr1.style.fill=C.ink;ctr2.textContent='点 key 看顺时针查找'}
    }
    function chip(k){return h('span',{class:'hr-chip'+(moved.mod.has(k.name)?' mv':''),dataset:{k:k.name},title:`hash=${k.h}`},keySet==='demo'?`${k.name}=${k.h}`:k.name)}
    function drawMod(animate){
      const before=animate?new Map([...cols.querySelectorAll('.hr-chip')].map(c=>[c.dataset.k,c.getBoundingClientRect()])):null;
      const list=byOrder(servers);
      modTitle.textContent=`对照：hash % N 取模（N=${list.length}）`;
      cols.style.gridTemplateColumns=`repeat(${list.length},minmax(0,1fr))`;
      cols.replaceChildren(...list.map((sv,i)=>{const chips=h('div',{class:'hr-chips'});for(const k of keys)if(modOwner(k.h,list)===sv)chips.append(chip(k));return h('div',{class:'hr-col'},h('div',{class:'hd',style:{borderColor:sv.color,color:sv.color}},`${i} · ${sv.name}`),chips)}));
      formula.replaceChildren(...(keySet==='demo'?keys.map(k=>h('div',null,`${k.name}: ${k.h} % ${list.length} = ${k.h%list.length} → ${modOwner(k.h,list).name}`)):[h('div',null,`每个 key 去第 (hash % ${list.length}) 号服务器`)]));
      if(!before)return;
      for(const c of cols.querySelectorAll('.hr-chip')){
        const b=before.get(c.dataset.k);if(!b)continue;const r=c.getBoundingClientRect();const dx=b.left-r.left,dy=b.top-r.top;
        if(Math.abs(dx)+Math.abs(dy)<1)continue;
        c.style.transition='none';c.style.transform=`translate(${dx}px,${dy}px)`;c.getBoundingClientRect();
        c.style.transition='transform .75s cubic-bezier(.3,.7,.3,1)';c.style.transform='';
      }
    }
    const st=ctx.stats([{key:'n',label:'服务器'},{key:'ring',label:'一致性哈希：搬家的 key'},{key:'mod',label:'取模：搬家的 key'},{key:'iv',label:'上次受影响区间'}]);
    function render(animate){
      drawRing();drawMod(animate);
      st.set('n',servers.length+' 台');
      addBtn.disabled=servers.length>=6||servers.some(v=>v.pos===posCtl.get());
      rmBtn.disabled=servers.length<=1;
      const opts=byOrder(servers).map(v=>h('option',{value:v.name},`${v.name}（位置 ${v.pos}）`));const cur=rmSel.get();rmSel.input.replaceChildren(...opts);rmSel.input.value=servers.some(v=>v.name===cur)?cur:byOrder(servers)[0].name;
    }
    function setMoved(){st.set('ring','—');st.set('mod','—');st.set('iv','—');moved={ring:new Set(),mod:new Set()}}
    const pct=(a,b)=>`${a} / ${b}（${Math.round(a/b*100)}%）`;
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
      const list=a=>a.length<=4?a.join('、'):a.slice(0,4).join('、')+` 等 ${a.length} 个`;
      sum.replaceChildren(h('b',null,change.text+'：'),`一致性哈希只改动区间 ${change.hl.iv}，搬家 `,h('b',{class:'w'},`${rm.length} 个`),rm.length?`（${list(rm)}）`:'','；取模时 N 从 '+old.length+' 变 '+next.length+'，搬家 ',h('b',{class:'w'},`${mm.length} 个`),mm.length?`（${list(mm)}）`:'','。');
      ctx.log(`${change.text}：哈希环搬家 ${rm.length}，取模搬家 ${mm.length}`,'info');
      ctx.announce(sum.textContent);
    }
    function previewAdd(p){
      if(servers.some(v=>v.pos===p)){ghost=null;hl=null;drawRing();ctr1.textContent=`位置 ${p} 已有服务器`;ctr1.style.fill=C.bad;ctr2.textContent='换一个位置';return}
      const pr=pred(p,servers),nx=ringOwner(p,servers);ghost=p;
      hl={a:pr.pos,b:p,iv:iv(pr.pos,p),title:`将接管 ${iv(pr.pos,p)}`,sub:`这段原属 ${nx.name}`};drawRing();
    }
    function previewRemove(name){
      const t=servers.find(v=>v.name===name);if(!t||servers.length<=1)return;
      const pr=pred(t.pos,servers),nx=succ(t.pos,servers);ghost=null;
      hl={a:pr.pos,b:t.pos,iv:iv(pr.pos,t.pos),title:`${t.name} 负责 ${iv(pr.pos,t.pos)}`,sub:`移除后交给 ${nx.name}`};drawRing();
    }
    function addServer(p){
      if(servers.some(v=>v.pos===p)||servers.length>=6)return;
      const pr=pred(p,servers),nx=ringOwner(p,servers),name='S'+nextId;
      const sv=mk(name,p,nextId++);
      apply([...servers,sv],{text:`加入 ${name}=${p}`,hl:{a:pr.pos,b:p,iv:iv(pr.pos,p),title:`${iv(pr.pos,p)} 改归 ${name}`,sub:`其余区间不变（原属 ${nx.name}）`}});
    }
    function removeServer(name){
      const t=servers.find(v=>v.name===name);if(!t||servers.length<=1)return;
      const pr=pred(t.pos,servers),nx=succ(t.pos,servers);
      apply(servers.filter(v=>v!==t),{text:`移除 ${name}`,hl:{a:pr.pos,b:t.pos,iv:iv(pr.pos,t.pos),title:`${iv(pr.pos,t.pos)} 改归 ${nx.name}`,sub:'其余区间不变'}});
    }
    /* 顺时针查找动画：指针从 key 的位置沿环走到第一台服务器 */
    async function walk(k){
      const tok=++walkTok;const o=ringOwner(k.h,servers);const span=((o.pos-k.h)%100+100)%100;
      const n=Math.max(8,Math.round(span/1.4));const dot=S('circle',{r:7,fill:C.info,stroke:'#fff','stroke-width':2});
      ptrG.replaceChildren(dot);trailG.replaceChildren();const trail=S('path',{fill:'none',stroke:C.info,'stroke-width':5,'stroke-linecap':'round',opacity:.8});trailG.append(trail);
      try{
        for(let i=0;i<=n;i++){if(tok!==walkTok)return;const p=k.h+span*i/n;const [x,y]=pt(p,R);ctx.attr(dot,{cx:f1(x),cy:f1(y)});ctx.attr(trail,{d:i&&span?arcPath(k.h,p,R):''});await ctx.wait(24)}
        const wrapTxt=k.h>o.pos?'，越过 99/0 绕回':'';
        ctx.log(`${k.name}=${k.h} 顺时针${wrapTxt} → 遇到 ${o.name}=${o.pos}`,'info');ctx.announce(`${k.name} 归 ${o.name}`);
        await ctx.wait(700);
      }finally{if(tok===walkTok){ptrG.replaceChildren();trailG.replaceChildren()}}
    }

    /* ---- 控件 ---- */
    const posCtl=ctx.slider({label:'新服务器位置',min:0,max:99,value:65,onInput:v=>{previewAdd(v);addBtn.disabled=servers.length>=6||servers.some(s=>s.pos===v)}});
    const rmSel=ctx.select({label:'要移除的服务器',options:[['S1','S1']],onChange:v=>previewRemove(v)});
    const keyCtl=ctx.segmented({label:'key 集合',value:'demo',options:[['demo','Q05 示例 4 个'],['many','30 个 key']],onChange:v=>{keySet=v;keys=v==='demo'?DEMO:MANY;setMoved();hl=null;ghost=null;sum.textContent='换了一批 key。加入或移除服务器，对比两边的搬家数量。';render(false)}});
    const addBtn=ctx.button('加入服务器',()=>addServer(posCtl.get()),{primary:true});
    const rmBtn=ctx.button('移除所选服务器',()=>removeServer(rmSel.get()));
    ctx.button('恢复 3 台',()=>{initServers();setMoved();hl=null;ghost=null;sum.textContent='已恢复 S1=20、S2=50、S3=80。';render(false);previewAdd(posCtl.get())});
    render(false);previewAdd(65);
    sum.textContent='虚线方块是准备加入的服务器（拖动「新服务器位置」移动它），琥珀色弧是它会接管的区间。点「加入服务器」，看两边各有哪些 key 搬家。';

    async function prepare(set){
      walkTok++;keySet=set;keys=set==='demo'?DEMO:MANY;keyCtl.set(set,true);initServers();setMoved();hl=null;ghost=null;ctx.clearLog();
      posCtl.set(65,true);render(false);sum.textContent='准备中…';await ctx.wait(500);
    }
    async function slideTo(target){let v=posCtl.get();while(v!==target){v+=v<target?1:-1;posCtl.set(v,true);previewAdd(v);await ctx.wait(45)}}
    ctx.scenarios([
      {id:'draw',label:'3 台服务器、4 个 key',
        ask:'S1=20、S2=50、S3=80；kA=10、kB=35、kC=60、kD=90。每个 key 归谁？kD=90 离 S3=80 最近，它归 S3 吗？',
        insight:'kA→S1，kB→S2，kC→S3；kD 顺时针越过 99/0 后先碰到 S1，所以归 S1，而不是数值上最近的 S3。S1 负责跨零点的 (80,20]，一台拿到 2 个 key，这不违反一致性哈希的定义。',
        async run(){await prepare('demo');sum.textContent='逐个 key 从自己的位置出发，顺时针走到第一台服务器。';for(const k of DEMO){await walk(k);await ctx.wait(200)}sum.textContent='kA→S1、kB→S2、kC→S3、kD→S1（越过 99/0 绕回）。'}},
      {id:'add',label:'加入 S4=65',
        ask:'在位置 65 加入 S4。一致性哈希下哪个区间、哪些 key 要搬家？若用 hash % N，N 从 3 变成 4，又有几个 key 搬家？',
        insight:'哈希环上只有 (50,65] 从 S3 改归 S4，四个 key 里只有 kC=60 搬家；(65,80] 仍归 S3。取模时 kA、kB、kD 三个都换了服务器（75%），只有 kC 碰巧不动：N 一变，几乎所有 key 的余数都变了。',
        async run(){await prepare('demo');await slideTo(65);await ctx.wait(900);addServer(65);await ctx.wait(1400);await walk(DEMO[2])}},
      {id:'wrap',label:'新节点加在 5（跨零点）',
        ask:'还是 3 台服务器，这次把 S4 加在位置 5。受影响的区间怎么写？取模的搬家数和加在 65 时相比呢？',
        insight:'前驱是 80，受影响区间是跨零点的 (80,5]，即 81…99 与 0…5：kD=90 从 S1 迁到 S4，kA=10 仍归 S1。取模仍然是 kA、kB、kD 三个搬家，和加在 65 时一样：取模根本不关心新机器放在哪。',
        async run(){await prepare('demo');await slideTo(5);await ctx.wait(900);addServer(5);await ctx.wait(1400);await walk(DEMO[3])}},
      {id:'remove',label:'30 个 key：移除 S2',
        ask:'换成 30 个 key，移除 S2。一致性哈希要搬几个 key？取模（N 从 3 变 2）呢？',
        insight:'S2 原本负责 (20,50] 里的 8 个 key，哈希环上只有这 8 个转给后继 S3（27%），S1、S3 原有的 key 一个不动。取模要搬 17 个（57%）：除了 S2 的 key，大量原本在 S1、S3 上好好的 key 也被重新分配。另外注意 S1 独占 14 个 key，这就是下一个实验要解决的分布不均。',
        async run(){await prepare('many');rmSel.set('S2');await ctx.wait(1500);removeServer('S2');await ctx.wait(2500)}},
    ]);
  }
});

/* ---------------- 实验二：虚拟节点与热门 key ---------------- */
SDLab.define({
  id:'hash-ring-vnodes',chapter:5,
  title:'虚拟节点：分布更匀，热门 key 照样压在一台',
  summary:'10,000 个 key 分给几台物理服务器。拖动每台的虚拟节点数，看环上的地盘怎样被切碎、各台 key 数的偏差怎样缩小；再给一个热门 key 分配请求量，看它会不会也被摊平。',
  caveat:'key 与虚拟节点的位置是 32 位哈希（FNV-1a 加混合函数）；统计的是 10,000 个样本 key 的主归属，不含副本。请求量假设普通 key 访问均匀，热门 key 的占比由滑块直接指定。',
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
    const ringBox=h('div',{class:'sdl-panel'},h('div',{class:'ph'},'环上的地盘（颜色 = 物理服务器）'));
    const barBox=h('div',{class:'sdl-panel'});
    const barTitle=h('div',{class:'ph'},'每台服务器分到的 key 与请求');
    const rows=h('div');
    const legend=h('div',{class:'hv-legend'});
    barBox.append(barTitle,rows,legend);
    wrap.append(ringBox,barBox);
    const note=h('p',{class:'sdl-note',style:{fontSize:'13.5px'}});
    ctx.stage.append(wrap,note);
    ctx.onResize(w=>ctx.stage.classList.toggle('hv-narrow',w<640));
    const svg=ctx.svg(300,300,{parent:ringBox,label:'虚拟节点在哈希环上的分布'});
    const S=(t,a,...k)=>ctx.svgEl(t,t==='text'&&a&&a.fill?{...a,style:'fill:'+a.fill}:a,...k);/* 运行时 CSS 统一设置了 text 的 fill，着色要写成内联样式 */
    const CX=150,CY=150,R=112;
    const arcsG=S('g'),joinG=S('g'),hotG=S('g');
    const c1=S('text',{x:CX,y:CY-4,'text-anchor':'middle','font-size':15,'font-weight':750}),c2=S('text',{x:CX,y:CY+16,'text-anchor':'middle','font-size':12,fill:C.muted});
    svg.append(S('circle',{cx:CX,cy:CY,r:R,fill:'none',stroke:C.line,'stroke-width':16}),arcsG,joinG,hotG,c1,c2);
    const TAU=Math.PI*2,U=4294967296;
    const xy=(p,r)=>{const a=p/U*TAU-Math.PI/2;return [(CX+r*Math.cos(a)).toFixed(1),(CY+r*Math.sin(a)).toFixed(1)]};
    function arc(a,b,r){let span=b-a;if(span<=0)span+=U;const [x0,y0]=xy(a,r),[x1,y1]=xy(a+Math.min(span,U-1),r);return `M${x0} ${y0}A${r} ${r} 0 ${span>U/2?1:0} 1 ${x1} ${y1}`}
    function runs(ring,filter){
      // 合并相邻同主人的弧段，返回 [起点, 终点, 主人]
      const L=ring.pos.length,out=[];
      for(let i=0;i<L;i++){const a=ring.pos[(i-1+L)%L],b=ring.pos[i],o=ring.own[i];if(filter&&!filter(i))continue;const last=out[out.length-1];if(last&&last[2]===o&&last[1]===a)last[1]=b;else out.push([a,b,o])}
      return out;
    }
    const st=ctx.stats([{key:'vn',label:'环上虚拟节点总数'},{key:'cv',label:'key 数偏差（标准差 / 平均）'},{key:'max',label:'最多的一台 / 应得'},{key:'hot',label:'热门 key 所在机器的请求占比'}]);
    let ring,res;
    function weight(s){return P.dbl&&s===0?2:1}
    function update(){
      const V=VS[P.vi];ring=build(P.n,V,P.dbl);res=assign(ring);
      const wsum=util.range(P.n).reduce((a,s)=>a+weight(s),0);
      const ideal=s=>K*weight(s)/wsum;
      // 环
      // 每台服务器的全部弧段拼成一条 path，虚拟节点再多也只有 N 个元素
      const segs=runs(ring),ds=util.range(P.n).map(()=>[]);for(const [a,b,o] of segs)ds[o].push(arc(a,b,R));
      arcsG.replaceChildren(...ds.map((d,o)=>S('path',{d:d.join(''),stroke:PAL[o],'stroke-width':16,fill:'none'})));
      joinG.replaceChildren();
      if(join&&join.n===P.n)joinG.append(S('path',{d:runs(ring,i=>ring.own[i]===P.n-1).map(([a,b])=>arc(a,b,R+13)).join(''),stroke:C.warn,'stroke-width':5,fill:'none'}));
      hotG.replaceChildren();
      const hotOwner=owner(ring,HOT);
      if(P.hot>0){const [x,y]=xy(HOT,R);const [lx,ly]=xy(HOT,R-26);hotG.append(S('circle',{cx:x,cy:y,r:6,fill:C.bad,stroke:'#fff','stroke-width':2}),S('text',{x:lx,y:+ly+4,'text-anchor':'middle','font-size':12,'font-weight':700,fill:C.bad,text:'热门'}))}
      c1.textContent=`${P.n} 台 × ${V} 个${V===1?'位置':'虚拟节点'}`;c2.textContent=`环被切成 ${segs.length} 段`;
      // 条形
      const req=util.range(P.n).map(s=>(1-P.hot)*res.c[s]/K+(P.hot>0&&s===hotOwner?P.hot:0));
      const shares=res.c.map(c=>c/K);
      const gaveOf=s=>join&&join.n===P.n&&s<P.n-1?join.from[s]:0;
      const scale=Math.max(...shares.map((x,s)=>Math.max(x+gaveOf(s)/K,ideal(s)/K)),...(P.hot>0?req:[0]))*1.08;
      rows.replaceChildren(...util.range(P.n).map(s=>{
        const gave=gaveOf(s);
        const keyTrack=h('div',{class:'hv-track'},h('i',{style:{width:(shares[s]/scale*100)+'%',background:PAL[s]}}),gave?h('span',{class:'gv',style:{width:(gave/K/scale*100)+'%',right:(100-(shares[s]+gave/K)/scale*100)+'%'}}):null,h('u',{style:{left:(ideal(s)/K/scale*100)+'%'}}));
        const reqTrack=P.hot>0?h('div',{class:'hv-track req'},h('i',{class:s===hotOwner?'hot':null,style:{width:(req[s]/scale*100)+'%'}})):null;
        return h('div',{class:'hv-row'},h('div',{class:'nm',style:{color:PAL[s]}},'S'+(s+1)),h('div',null,keyTrack,reqTrack),
          h('div',{class:'val'},h('div',null,h('b',null,util.fmt(res.c[s])),' 个 · '+util.pct(shares[s])),gave?h('div',{style:{color:C.warn}},'让出 '+util.fmt(gave)):null,P.hot>0?h('div',{class:s===hotOwner?'hot':null},'请求 '+util.pct(req[s])+(s===hotOwner?' 含热门':'')):null));
      }));
      legend.replaceChildren(...[h('span',null,h('i',{style:{background:PAL[0]}}),'key 数'),h('span',null,h('i',{style:{background:'none',borderLeft:'2px dashed #23352f',width:'2px'}}),'按容量应得'),
        join&&join.n===P.n?h('span',null,h('i',{style:{background:'repeating-linear-gradient(45deg,#b7791f 0 3px,#f6ead2 3px 6px)'}}),'让给新服务器的 key'):null,
        P.hot>0?h('span',null,h('i',{style:{background:'#9aa89f'}}),'请求量'):null,P.hot>0?h('span',null,h('i',{style:{background:C.bad}}),'含热门 key 的机器'):null].filter(Boolean));
      // 统计
      let sq=0,mx=0;for(let s=0;s<P.n;s++){const d=(res.c[s]-ideal(s))/ideal(s);sq+=d*d;mx=Math.max(mx,res.c[s]/ideal(s))}
      const cv=Math.sqrt(sq/P.n);
      st.set('vn',util.fmt(ring.pos.length));
      st.set('cv',util.pct(cv),cv>0.2?'bad':cv>0.08?'warn':'ok');
      st.set('max',mx.toFixed(2)+' 倍',mx>1.3?'bad':mx>1.1?'warn':'ok');
      st.set('hot',P.hot>0?`S${hotOwner+1} · ${util.pct(req[hotOwner])}`:'未开启',P.hot>0?(req[hotOwner]>2/P.n?'bad':'warn'):null);
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
      note.textContent=`加入 S${P.n}：它接管 ${util.fmt(total)} 个 key（${util.pct(total/K)}），来自 ${srcs.length} 台旧服务器（${srcs.map(([c,s])=>`S${s+1} ${util.fmt(c)}`).join('、')}）。${other?'':'其余 key 的归属都没变。'}`;
      ctx.log(note.textContent,'info');ctx.announce(note.textContent);
      return {srcs,total,r};
    }
    const nCtl=ctx.slider({label:'物理服务器',min:3,max:10,value:P.n,format:v=>v+' 台',onInput:v=>{P.n=v;join=null;update()}});
    const vCtl=ctx.slider({label:'每台虚拟节点',min:0,max:VS.length-1,value:P.vi,format:i=>VS[i]+' 个',onInput:i=>{P.vi=i;join=null;update()}});
    const hotCtl=ctx.slider({label:'热门 key 占总请求',min:0,max:80,step:5,value:0,format:v=>v?v+'%':'关闭',onInput:v=>{P.hot=v/100;update()}});
    const dblCtl=ctx.toggle({label:'S1 容量翻倍（虚拟节点 ×2）',value:false,onChange:v=>{P.dbl=v;join=null;update()}});
    ctx.button('加入一台服务器',()=>doJoin(),{primary:true});
    update();
    note.textContent='现在每台服务器只在环上占 1 个位置，地盘大小全凭运气。把「每台虚拟节点」往右拖，看偏差怎样变化。';

    async function prepare(o){
      Object.assign(P,{n:4,vi:0,hot:0,dbl:false},o);join=null;ctx.clearLog();
      nCtl.set(P.n,true);vCtl.set(P.vi,true);hotCtl.set(P.hot*100,true);dblCtl.set(P.dbl,true);update();await ctx.wait(700);
    }
    ctx.scenarios([
      {id:'balance',label:'虚拟节点降低偏差',
        ask:'4 台服务器、10,000 个 key。每台只占 1 个位置时，最多的一台大约是应得的几倍？每台 100 个虚拟节点时呢？',
        insight:'每台 1 个位置时，S3 独占 7,196 个 key，是应得 2,500 的 2.88 倍，S1 只有 19 个，偏差 112%。虚拟节点越多，每台的地盘被切成越多小段，偏差互相抵消：100 个时降到 8.5%（最多 1.10 倍），500 个时 3.9%。中途会有起伏（200 个比 100 个略差），看的是总体趋势；节点越多，路由表和维护成本也越高。',
        async run(){await prepare({});const lines=[];for(let i=0;i<VS.length;i++){P.vi=i;vCtl.set(i,true);const r=update();lines.push(`${VS[i]} 个：偏差 ${util.pct(r.cv)}，最多 ${r.mx.toFixed(2)} 倍`);note.textContent=lines[lines.length-1];ctx.log(lines[lines.length-1]);await ctx.wait(i===0?2200:1250)}note.textContent=lines.join('；')+'。'}},
      {id:'join',label:'加入第 5 台：key 从谁那里来',
        ask:'4 台服务器，再加入第 5 台。每台只有 1 个位置时，新服务器的 key 来自几台旧服务器？每台 100 个虚拟节点时呢？',
        insight:'只有 1 个位置时，S5 只截走一个区间，3,527 个 key 全部来自 S3 一台。每台 100 个虚拟节点时，S5 的 100 个小区间散布全环，从 4 台旧服务器分别接过 259–852 个 key，合计 2,036 个，约五分之一。两种情况下旧服务器之间都没有互相搬家。这也是 Q05-02 提到的边界：一台物理机带着多个虚拟节点加入，会改变多个小区间。',
        async run(){await prepare({vi:0});const a=doJoin();await ctx.wait(4200);await prepare({vi:6});const b=doJoin();await ctx.wait(4200);note.textContent=`1 个位置：接管 ${util.fmt(a.total)} 个，来自 ${a.srcs.length} 台；100 个虚拟节点：接管 ${util.fmt(b.total)} 个，来自 ${b.srcs.length} 台。`}},
      {id:'hot',label:'热门 key 不会被分摊',
        ask:'10 台服务器、每台 100 个虚拟节点，各台 key 数已经比较接近。若 product:hot 一个 key 占了一半请求，拥有它的那台要扛多少请求？把虚拟节点加到 200 呢？',
        insight:'100 个虚拟节点时各台 key 数已比较接近（偏差 11.8%），但 product:hot 落在 S8，这一台要扛 55.4% 的请求，其余 9 台各只有 4%–6%。加到 200 个后 key 偏差降到 7.6%，S8 仍扛 55.2%：虚拟节点只改变 key 的分配，同一个 key 每次查找仍落到一个主归属。热门 key 要靠复制只读数据、请求合并或拆分计数等业务办法。',
        async run(){await prepare({n:10,vi:6});await ctx.wait(800);for(let v=5;v<=50;v+=5){P.hot=v/100;hotCtl.set(v,true);update();await ctx.wait(110)}const a=update();note.textContent=`100 个虚拟节点：key 偏差 ${util.pct(a.cv)}，热门 key 在 S${a.hotOwner+1}，它的请求占比 ${util.pct(a.req[a.hotOwner])}。`;await ctx.wait(3000);P.vi=7;vCtl.set(7,true);const b=update();note.textContent+=` 加到 200 个：热门 key 在 S${b.hotOwner+1}，请求占比仍是 ${util.pct(b.req[b.hotOwner])}。`;await ctx.wait(3000)}},
    ]);
  }
});
})();
