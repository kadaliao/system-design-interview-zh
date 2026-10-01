/* Chapter 13: search autocomplete. On a Trie, compares on-the-spot traversal with node-cached top-k, and demonstrates batch rebuilds, whole-version switching, and short-prefix hotspots. */
(function(){
const {el:h,util}=SDLab;

SDLab.define({
  id:'trie-topk',chapter:13,
  title:'Top-K on a Trie: Compute Now or Precompute?',
  summary:'Type a prefix and watch which nodes the query visits in the Trie. Compare “walk to the node, then traverse and sort the subtree” with “top-k cached on the node”; then build this week’s log into a new version and compare in-place overwrite with a whole-version switch; finally see why short prefixes are hotspots.',
  caveat:'The toy vocabulary has only 15 words; in a real vocabulary one prefix’s subtree can hold thousands of nodes. Each prefix node caches its 5 most frequent words (ties broken alphabetically). The heat simulation assumes each user picks one word at random in proportion to its frequency and sends one query per letter typed, with no browser cache.',
  mount(ctx){
    ctx.css('tt',`
.tt-main{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:14px;align-items:start}
.tt-narrow .tt-main{grid-template-columns:minmax(0,1fr)}
.tt-tree svg{max-width:470px;margin:0 auto}
.tt-tree .nd{cursor:pointer}
.tt-side{display:flex;flex-direction:column;gap:10px;min-width:0}
.tt-side .sdl-panel{font-size:13px;line-height:1.6}
.tt-side .ph{display:flex;justify-content:space-between;gap:8px;align-items:center}
.tt-res{list-style:none;margin:4px 0 6px;padding:0}
.tt-res li{display:grid;grid-template-columns:18px 50px minmax(0,1fr) 26px;gap:6px;align-items:center;font-variant-numeric:tabular-nums;line-height:1.75}
.tt-res .rk{color:#66756d;font-size:12px}
.tt-res .w{font-family:ui-monospace,Menlo,monospace;font-weight:650}
.tt-res .bar{height:8px;border-radius:4px;background:#e6eee2;overflow:hidden}
.tt-res .bar i{display:block;height:100%;background:#2f6fb3;border-radius:4px}
.tt-res .f{text-align:right;color:#66756d;font-size:12px}
.tt-res li.chg .w,.tt-res li.chg .f{color:#2f8f5b}
.tt-proc{margin:0}
.tt-hist{list-style:none;margin:4px 0 0;padding:0;font-size:12.5px}
.tt-hist li{margin:3px 0;overflow-wrap:anywhere}
.tt-hist .p{font-family:ui-monospace,Menlo,monospace;font-weight:650}
.tt-prog{height:6px;border-radius:3px;background:#e6eee2;overflow:hidden;margin:5px 0}
.tt-prog i{display:block;height:100%;background:#2f8f5b}
.tt-shard{display:grid;grid-template-columns:92px minmax(0,1fr) 40px;gap:6px;align-items:center;font-size:12.5px;margin:3px 0}
.tt-shard .bar{height:10px;border-radius:5px;background:#e6eee2;overflow:hidden}
.tt-shard .bar i{display:block;height:100%;background:#c98a16}
.tt-shard .v{text-align:right;font-variant-numeric:tabular-nums}
.tt-inp{font-family:ui-monospace,Menlo,monospace!important;letter-spacing:.06em}
.tt-warn{color:#c2413b;font-weight:650;margin:4px 0 0}
`);
    const C=ctx.colors,fmt=util.fmt,K=5;
    const WORDS={be:15,bee:20,best:35,bet:29,buy:14,can:25,cap:12,car:33,card:18,care:21,cat:40,tea:9,ten:6,win:11,wine:7};

    /* ---- Build the tree and lay it out ---- */
    const nodes=new Map();
    function node(key){if(!nodes.has(key)){const n={key,depth:key.length,kids:[],term:false,parent:null};nodes.set(key,n);if(key){const p=node(key.slice(0,-1));n.parent=p;p.kids.push(n)}}return nodes.get(key)}
    const root=node('');
    for(const w of Object.keys(WORDS)){for(let i=1;i<=w.length;i++)node(w.slice(0,i));nodes.get(w).term=true}
    for(const n of nodes.values())n.kids.sort((a,b)=>a.key<b.key?-1:1);
    const X0=18,DX=78,NW=58,RW=30,RH=25,TOP=16;let row=0;
    (function lay(n){n.x=X0+n.depth*DX;if(!n.kids.length)n.y=TOP+row++*RH;else{n.kids.forEach(lay);n.y=(n.kids[0].y+n.kids[n.kids.length-1].y)/2}})(root);
    const VW=X0+4*DX+NW/2+4,VH=TOP*2+(row-1)*RH;
    const post=[];(function po(n){n.kids.forEach(po);post.push(n)})(root);
    const subtree=n=>{const out=[];(function pre(m){for(const k of m.kids){out.push(k);pre(k)}})(n);return out};
    const byFreq=(a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:1);
    const topk=(n,freq)=>[n,...subtree(n)].filter(m=>m.term).map(m=>[m.key,freq[m.key]]).sort(byFreq).slice(0,K);
    const makeVersion=(v,freq)=>({v,freq,cache:new Map([...nodes.values()].map(n=>[n.key,{list:topk(n,freq),v}]))});
    function pickUsers(freq,n,seed){const r=util.rng(seed),ws=Object.keys(freq),tot=ws.reduce((s,w)=>s+freq[w],0);return util.range(n).map(()=>{let x=r()*tot;for(const w of ws){x-=freq[w];if(x<0)return w}return ws[ws.length-1]})}
    function addHeat(hs,w){for(let j=1;j<=w.length;j++){const p=w.slice(0,j);hs.count[p]=(hs.count[p]||0)+1;if(p[0]<='m')hs.am++;else hs.nz++}hs.users++}
    const newHeat=()=>({count:{},am:0,nz:0,users:0,max:1});
    // Precompute the heat results with the same random seed, for the scenario text to quote
    const H0=newHeat();for(const w of pickUsers(WORDS,300,13))addHeat(H0,w);
    const hot0=Object.entries(H0.count).sort((a,b)=>b[1]-a[1]||a[0].length-b[0].length);

    /* ---- State ---- */
    let live,next,log,building=false,qTok=0,heat=null,hist=[],mode='cache',inPlace=false,prog=null,last=null;
    function resetData(){qTok++;live=makeVersion(1,{...WORDS});next=null;log={};heat=null;hist=[];prog=null;last=null;for(const n of nodes.values()){n.hl=null;n.done=false;n.dot=false}}

    /* ---- Stage ---- */
    const treeBox=h('div',{class:'tt-tree'}),side=h('div',{class:'tt-side'});
    const main=h('div',{class:'tt-main'},treeBox,side);
    const wrapAll=h('div',null,main);ctx.stage.append(wrapAll);
    ctx.onResize(w=>wrapAll.classList.toggle('tt-narrow',w<700));
    const svg=ctx.svg(VW,VH,{label:'Trie: each box is a prefix; a number marks a complete query word and its frequency',parent:treeBox});
    const ge=ctx.svgEl('g'),gn=ctx.svgEl('g');svg.append(ge,gn);
    for(const n of nodes.values()){
      const w=n.key?NW:RW;
      if(n.parent){const p=n.parent,px=p.x+(p.key?NW:RW)/2,cx=n.x-NW/2,mx=(px+cx)/2;n.edge=ctx.svgEl('path',{d:`M${px},${p.y} C${mx},${p.y} ${mx},${n.y} ${cx},${n.y}`,fill:'none',stroke:'#c6d2c9','stroke-width':1.3});ge.append(n.edge)}
      n.rect=ctx.svgEl('rect',{x:n.x-w/2,y:n.y-10,width:w,height:20,rx:6});
      n.ft=n.term?ctx.svgEl('tspan',{fill:C.muted,'font-weight':400}):null;
      const t=ctx.svgEl('text',{x:n.x,y:n.y+4.2,'text-anchor':'middle','font-size':12,'font-weight':n.term?650:500},n.key||'root',n.ft?' ':null,n.ft);
      n.dotEl=ctx.svgEl('circle',{cx:n.x+w/2-1,cy:n.y-9,r:3.6,fill:C.ok,stroke:'#fff','stroke-width':1,display:'none'});
      n.tip=ctx.svgEl('title');
      n.g=ctx.svgEl('g',{class:'nd',onclick:()=>{if(n.key){inp.value=n.key;runQ(n.key)}}},n.tip,n.rect,t,n.dotEl);gn.append(n.g);
    }
    function paint(n){
      let fill='#fff',stroke=n.term?'#8fa396':'#cfd8cc',sw=1.2,es='#c6d2c9',ew=1.3;
      const hc=heat&&heat.count[n.key];
      if(hc)fill=`rgba(201,138,22,${(0.1+0.65*hc/heat.max).toFixed(3)})`;
      if(n.done){stroke=C.ok;sw=2.2}
      if(n.hl==='path'){fill=C.infoSoft;stroke=C.info;sw=2;es=C.info;ew=2.2}
      else if(n.hl==='visit'||n.hl==='cand'){fill=C.warnSoft;stroke=C.warn;sw=n.hl==='cand'?2:1.4;es=C.warn;ew=1.8}
      ctx.attr(n.rect,{fill,stroke,'stroke-width':sw});
      if(n.edge)ctx.attr(n.edge,{stroke:es,'stroke-width':ew});
      n.dotEl.setAttribute('display',n.dot?'inline':'none');
      if(n.ft)n.ft.textContent=live.freq[n.key];
      n.tip.textContent=(n.key?'Prefix '+n.key:'root')+(n.term?', frequency '+live.freq[n.key]:'')+(hc?', queried '+hc+' times':'');
    }
    const paintAll=()=>{for(const n of nodes.values())paint(n)};

    const resBox=h('div',{class:'sdl-panel'}),verBox=h('div',{class:'sdl-panel'}),shardBox=h('div',{class:'sdl-panel',hidden:true});
    side.append(resBox,verBox,shardBox);
    const pathTxt=path=>path.map(n=>n.key||'root').join(' → ');
    const tag=(v,bad)=>h('span',{class:'sdl-tag '+(bad?'bad':v>1?'ok':'info')},'v'+v);
    function renderRes(){
      if(!last){resBox.replaceChildren(h('div',{class:'ph'},'Query result'),h('p',{class:'tt-proc sdl-note'},'Type a prefix above, or click a node in the tree.'));return}
      const q=last,mx=Math.max(1,...q.list.map(x=>x[1]));
      resBox.replaceChildren(
        h('div',{class:'ph'},h('span',null,'Prefix “',h('span',{class:'sdl-mono'},q.prefix),'” → top ',K,' suggestions'),q.list?tag(q.ver):null),
        q.found?h('ol',{class:'tt-res'},q.list.map(([w,f],i)=>h('li',{class:q.chg.includes(w)?'chg':null},h('span',{class:'rk'},i+1),h('span',{class:'w'},w),h('span',{class:'bar'},h('i',{style:{width:f/mx*100+'%'}})),h('span',{class:'f'},f)))):h('p',{class:'tt-proc'},'No word in the vocabulary has this prefix, so the list is empty.'),
        h('p',{class:'tt-proc'},q.proc));
    }
    function renderVer(){
      const lg=Object.entries(log);
      const kids=[h('div',{class:'ph'},h('span',null,'Live version'),tag(live.v)),
        h('div',null,'This week’s log (not in the Trie yet): ',lg.length?h('b',null,lg.map(([w,d])=>`${w} +${d}`).join(', ')):'none')];
      if(prog)kids.push(h('div',{class:'tt-prog'},h('i',{style:{width:prog.p*100+'%'}})),h('div',{class:'sdl-note',style:{margin:0}},prog.text));
      if(hist.length){
        kids.push(h('div',{class:'sdl-note',style:{margin:'6px 0 0'}},'Recent queries:'),h('ul',{class:'tt-hist'},hist.map(x=>h('li',null,h('span',{class:'p'},x.prefix),' → ',x.list.map(y=>y[0]).join(', ')||'(empty)',' ',tag(x.ver)))));
        const [a,b]=hist;
        if(a&&b&&a.ver!==b.ver&&a.prefix.startsWith(b.prefix)&&a.gen===b.gen){
          const extra=a.list.map(x=>x[0]).filter(w=>!b.list.some(y=>y[0]===w)&&a.list.find(y=>y[0]===w)[1]>Math.min(...b.list.map(y=>y[1])));
          kids.push(h('p',{class:'tt-warn'},`Mixed versions: ${b.prefix} read v${b.ver}, ${a.prefix} read v${a.ver}${extra.length?`; ${extra.join(', ')} rank near the top under the longer prefix but are missing under the shorter one`:''}`));
        }
      }
      verBox.replaceChildren(...kids);
      st.set('ver','v'+live.v,live.v>1?'ok':'info');st.set('log',lg.length?lg.map(([w,d])=>`${w} +${d}`).join(', '):'none',lg.length?'warn':null);
    }
    function renderShard(){
      if(!heat){shardBox.hidden=true;return}
      shardBox.hidden=false;const tot=heat.am+heat.nz||1;
      const hot=Object.entries(heat.count).sort((a,b)=>b[1]-a[1]||a[0].length-b[0].length).slice(0,4);
      shardBox.replaceChildren(h('div',{class:'ph'},h('span',null,`Split by first letter into two shards · ${heat.users} users, ${fmt(tot)} queries`)),
        ...[['Shard 1: a–m',heat.am],['Shard 2: n–z',heat.nz]].map(([k,v])=>h('div',{class:'tt-shard'},h('span',null,k),h('span',{class:'bar'},h('i',{style:{width:v/tot*100+'%'}})),h('span',{class:'v'},util.pct(v/tot,0)))),
        h('div',{class:'sdl-note',style:{margin:'4px 0 0'}},'Hottest prefixes: '+hot.map(([p,c])=>`${p} (${c})`).join(', ')));
    }

    /* ---- Query animation ---- */
    function clearHl(){for(const n of nodes.values())n.hl=null}
    async function query(prefix,m){
      m=m||mode;const tok=++qTok;clearHl();paintAll();
      const path=[root];let cur=root;
      for(const ch of prefix){const nx=cur.kids.find(k=>k.key===cur.key+ch);if(!nx)break;path.push(nx);cur=nx}
      const found=prefix.length>0&&cur.key===prefix;
      const sub=found?subtree(cur):[],cands=found?[cur,...sub].filter(x=>x.term).length:0;
      let visited=0;st.set('visit',0);st.set('cand',0);
      for(const n of path){n.hl='path';paint(n);visited++;st.set('visit',visited,'info');await ctx.wait(240);if(tok!==qTok)return null}
      let list=[],ver=live.v,proc;
      if(!found){proc=`Following ${pathTxt(path)} leads nowhere: there is no “${prefix}”. Returned empty after visiting ${visited} nodes.`}
      else if(m==='naive'){
        const got=cur.term?[cur.key]:[];st.set('cand',got.length);
        for(const n of sub){n.hl=n.term?'cand':'visit';paint(n);visited++;if(n.term)got.push(n.key);st.set('visit',visited,'warn');st.set('cand',got.length,'warn');await ctx.wait(150);if(tok!==qTok)return null}
        await ctx.wait(300);if(tok!==qTok)return null;
        list=got.map(w=>[w,live.freq[w]]).sort(byFreq).slice(0,K);
        proc=`Path of ${path.length} nodes (${pathTxt(path)}) + ${sub.length} subtree nodes traversed = ${visited} visited; collected ${got.length} candidates, sorted, and took the top ${Math.min(K,got.length)}. With node caching you would visit only ${path.length} nodes.`;
      }else{
        const e=live.cache.get(cur.key);list=e.list;ver=e.v;
        proc=`Followed ${pathTxt(path)} (${visited} nodes), then read the ${list.length} precomputed entries on node “${cur.key}” directly: no traversal, no sorting. The naive approach would visit ${path.length+sub.length} nodes and sort ${cands} candidates.`;
      }
      if(m!=='naive')st.set('cand',0,'ok');
      last={prefix,list,ver,found,proc,chg:Object.keys(chgWords)};
      if(found){hist.unshift({prefix,list,ver,gen});hist=hist.slice(0,3)}
      renderRes();renderVer();
      ctx.announce(`${prefix}: ${list.map(x=>x[0]).join(', ')||'no results'}`);
      return last;
    }
    let gen=0,chgWords={};
    const runQ=v=>{if(!v){qTok++;clearHl();paintAll();last=null;renderRes();return}query(v).catch(()=>{})};

    /* ---- Batch rebuild ---- */
    async function build(o={}){
      if(building)return;building=true;
      const inPl=o.inPlace??inPlace;
      try{
        const freq={...live.freq};for(const [w,d] of Object.entries(log))freq[w]=(freq[w]||0)+d;
        const v=live.v+1,old=live.v;
        const lt=Object.entries(log).map(([w,d])=>`${w} ${live.freq[w]} → ${freq[w]}`).join(', ')||'no change';
        for(const w of Object.keys(log))chgWords[w]=1;
        ctx.log(`Aggregated this week’s log (${lt}); building v${v}: ${inPl?'overwriting the live Trie’s nodes in place':'in a new copy while the live Trie keeps serving v'+old}`,inPl?'warn':'info');
        log={};gen++;
        if(!inPl)next={v,freq,cache:new Map()};
        let i=0;
        for(const n of post){
          if(inPl){if(n.term)live.freq[n.key]=freq[n.key];live.cache.set(n.key,{list:topk(n,freq),v});n.done=true}
          else{next.cache.set(n.key,{list:topk(n,freq),v});n.dot=true}
          i++;prog={p:i/post.length,text:inPl?`In-place overwrite: ${i} / ${post.length} nodes are now v${v}, the rest are still v${old} (green border = overwritten)`:`Building v${v}: ${i} / ${post.length} nodes computed (green dots), live is still v${old}`};
          paint(n);renderVer();
          await ctx.wait(110);
          if(o.hook)await o.hook(n.key);
        }
        if(!inPl){prog={p:1,text:'Validating the new version, warming up the cache…'};renderVer();await ctx.wait(500);live=next;next=null;for(const n of nodes.values())n.dot=false;ctx.log(`Atomic switch: the query service now points to v${v} as a whole; v${old} is kept for rollback`,'ok')}
        else{live.v=v;ctx.log(`In-place overwrite finished; the live Trie is now v${v}. Queries during the overwrite may have read a mix of new and old nodes`,'warn')}
        prog=null;paintAll();renderVer();
        await ctx.wait(700);for(const n of nodes.values())n.done=false;paintAll();
      }finally{building=false;prog=null}
    }

    /* ---- Heat simulation ---- */
    async function heatSim(){
      heat=newHeat();const users=pickUsers(live.freq,300,13);
      for(let i=0;i<users.length;i++){
        addHeat(heat,users[i]);
        if(i%20===19||i===users.length-1){heat.max=Math.max(...Object.values(heat.count));paintAll();renderShard();await ctx.wait(110)}
      }
      const tot=heat.am+heat.nz;
      ctx.log(`${heat.users} users sent ${tot} prefix queries: shard a–m took ${heat.am} (${util.pct(heat.am/tot,0)}), shard n–z took ${heat.nz}`,'info');
    }

    /* ---- Controls ---- */
    const inp=h('input',{type:'text',class:'tt-inp',value:'',maxlength:6,autocomplete:'off',spellcheck:false,'aria-label':'Enter a prefix'});
    inp.addEventListener('input',()=>{const v=inp.value.toLowerCase().replace(/[^a-z]/g,'').slice(0,6);if(v!==inp.value)inp.value=v;runQ(v)});
    ctx.controls.append(h('label',{class:'sdl-ctrl'},h('span',{class:'lbl'},h('span',null,'Prefix (lowercase letters)')),inp));
    const modeCtl=ctx.segmented({label:'Query method',value:mode,options:[['cache','Node-cached top-k'],['naive','Naive: traverse subtree, then sort']],onChange:v=>{mode=v;if(inp.value)runQ(inp.value)}});
    const wordSel=ctx.select({label:'Word searched more this week',value:'cap',options:Object.keys(WORDS).map(w=>[w,w])});
    const inPlaceT=ctx.toggle({label:'Overwrite the live Trie in place (no new version)',value:false,onChange:v=>{inPlace=v}});
    const addLog=(w,d)=>{log[w]=(log[w]||0)+d;ctx.log(`This week’s log: ${w} was searched ${d} more times (written to the log only; the live Trie is unchanged)`);renderVer()};
    ctx.button('Log +10 searches',()=>addLog(wordSel.get(),10));
    ctx.button('Build new version',()=>{build().catch(()=>{})},{primary:true});
    ctx.button('Simulate 300 inputs',()=>{heatSim().catch(()=>{})});
    ctx.button('Clear heat',()=>{heat=null;paintAll();renderShard()});
    const st=ctx.stats([{key:'visit',label:'Nodes visited'},{key:'cand',label:'Candidates to sort'},{key:'ver',label:'Live version'},{key:'log',label:'This week’s log (not live)'}]);

    resetData();paintAll();renderRes();renderVer();
    ctx.wait(500).then(()=>{if(!inp.value&&!last){inp.value='ca';runQ('ca')}}).catch(()=>{});

    function prepare(){
      resetData();building=false;chgWords={};inPlace=false;inPlaceT.set(false,true);mode='cache';modeCtl.set('cache',true);
      inp.value='';paintAll();renderRes();renderVer();renderShard();ctx.clearLog();st.set('visit','—');st.set('cand','—');
    }
    const tot0=H0.am+H0.nz;
    ctx.scenarios([
      {id:'naive-vs-cache',label:'Type ca: compute or look up',
        ask:'The vocabulary has 6 words starting with ca. When you type ca, the naive approach must traverse the whole subtree after reaching ca and then sort; node-cached top-k stops at ca. How many nodes does each approach visit?',
        insight:'The naive approach visits 9 nodes (3 on the path root → c → ca, plus 6 in the subtree), collects 6 candidates, then sorts and takes the top 5; the cached approach visits only 3 nodes and reads the precomputed [cat, car, can, care, card] on ca directly. In this toy vocabulary the gap is only 3 times, but in a real one the ca subtree could hold thousands of words: computing on demand grows with subtree size, while a lookup depends only on prefix length.',
        async run(){prepare();inp.value='ca';modeCtl.set('naive',true);mode='naive';await query('ca','naive');await ctx.wait(1400);modeCtl.set('cache',true);mode='cache';await query('ca','cache');await ctx.wait(500)}},
      {id:'weekly-rebuild',label:'cap suddenly gets hot',
        ask:'This week cap was searched 30 more times (12 → 42). Before a rebuild, will you see cap when you type ca? After building and switching to the new version, which word gets pushed out of ca’s top 5?',
        insight:'Not before the rebuild: new searches go only into the log and the live Trie is still v1, so query real-time wins over data real-time. v2 is built in a copy, recomputing each prefix’s top 5 from the leaves upward (green dots), then switched in one step after validation: cap 42 ranks first and card 18 is pushed out. The cache on node c updates too, because cap is also in c’s subtree.',
        async run(){prepare();inp.value='ca';await query('ca');await ctx.wait(500);addLog('cap',30);await ctx.wait(700);await query('ca');await ctx.wait(500);await build({inPlace:false});await query('ca');await ctx.wait(400)}},
      {id:'in-place',label:'Overwrite while serving',
        ask:'Without building a new version, overwrite the live Trie node by node (from the leaves up). Halfway through, a user types c, then ca. What might they see?',
        insight:'When the overwrite has reached ca but not yet c: typing ca reads v2, with cap 42 first; typing c reads v1, which has no cap in its top 5 at all. One more letter and the popular word appears: that is the mixed version users see. Build in a copy, validate and warm up, then switch as a whole (the approach in the “cap suddenly gets hot” scenario), and this in-between state never occurs.',
        async run(){prepare();inPlaceT.set(true);addLog('cap',30);await ctx.wait(500);await build({inPlace:true,hook:async k=>{if(k==='ca'){inp.value='c';await query('c');await ctx.wait(300);inp.value='ca';await query('ca');await ctx.wait(1600)}}});await ctx.wait(300)}},
      {id:'hot-prefix',label:'Short prefixes are hotspots',
        ask:'300 users each type one word, and every letter typed sends a query. Split the Trie by first letter into two shards, a–m and n–z (13 letters each). How many queries does each shard take, and which node is hottest?',
        insight:`Of ${fmt(tot0)} queries, shard a–m takes ${H0.am} (${util.pct(H0.am/tot0,0)}) and n–z only ${H0.nz}: the letters are split evenly, yet the traffic is lopsided. The hottest are ${hot0.slice(0,2).map(([p,c])=>`${p} (${c} queries)`).join(', ')}: every input starting with them passes through that short prefix. So monitor the prefix access distribution before choosing shard boundaries, and precompute results for short prefixes.`,
        async run(){prepare();await heatSim();await ctx.wait(600)}},
    ]);
  }
});
})();
