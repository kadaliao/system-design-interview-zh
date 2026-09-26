/* 第 13 章：搜索自动补全。在 Trie 上对比现场遍历与节点缓存 Top-K，演示按批次重建、整版切换与短前缀热点。 */
(function(){
const {el:h,util}=SDLab;

SDLab.define({
  id:'trie-topk',chapter:13,
  title:'前缀树上的 Top-K，现算还是预先贴好',
  summary:'输入前缀，看查询在 Trie 里走过哪些节点。对比「走到节点再遍历子树排序」和「节点上缓存 Top-K」；再把本周日志批量构建成新版本，比较原地覆盖和整版切换，最后看短前缀为什么是热点。',
  caveat:'玩具词库只有 15 个词，真实词库里一个前缀的子树可能有成千上万个节点。每个前缀节点缓存按频率排序的前 5 个词（同频按字母序）。热度模拟假设每个用户按词频随机选一个词、每敲一个字母查询一次，不计浏览器缓存。',
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

    /* ---- 建树与布局 ---- */
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
    // 预先按同一随机种子算出热度结果，供场景说明引用
    const H0=newHeat();for(const w of pickUsers(WORDS,300,13))addHeat(H0,w);
    const hot0=Object.entries(H0.count).sort((a,b)=>b[1]-a[1]||a[0].length-b[0].length);

    /* ---- 状态 ---- */
    let live,next,log,building=false,qTok=0,heat=null,hist=[],mode='cache',inPlace=false,prog=null,last=null;
    function resetData(){qTok++;live=makeVersion(1,{...WORDS});next=null;log={};heat=null;hist=[];prog=null;last=null;for(const n of nodes.values()){n.hl=null;n.done=false;n.dot=false}}

    /* ---- 舞台 ---- */
    const treeBox=h('div',{class:'tt-tree'}),side=h('div',{class:'tt-side'});
    const main=h('div',{class:'tt-main'},treeBox,side);
    const wrapAll=h('div',null,main);ctx.stage.append(wrapAll);
    ctx.onResize(w=>wrapAll.classList.toggle('tt-narrow',w<700));
    const svg=ctx.svg(VW,VH,{label:'前缀树：每个方框是一个前缀，带数字的是完整查询词和它的频率',parent:treeBox});
    const ge=ctx.svgEl('g'),gn=ctx.svgEl('g');svg.append(ge,gn);
    for(const n of nodes.values()){
      const w=n.key?NW:RW;
      if(n.parent){const p=n.parent,px=p.x+(p.key?NW:RW)/2,cx=n.x-NW/2,mx=(px+cx)/2;n.edge=ctx.svgEl('path',{d:`M${px},${p.y} C${mx},${p.y} ${mx},${n.y} ${cx},${n.y}`,fill:'none',stroke:'#c6d2c9','stroke-width':1.3});ge.append(n.edge)}
      n.rect=ctx.svgEl('rect',{x:n.x-w/2,y:n.y-10,width:w,height:20,rx:6});
      n.ft=n.term?ctx.svgEl('tspan',{fill:C.muted,'font-weight':400}):null;
      const t=ctx.svgEl('text',{x:n.x,y:n.y+4.2,'text-anchor':'middle','font-size':12,'font-weight':n.term?650:500},n.key||'根',n.ft?' ':null,n.ft);
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
      n.tip.textContent=(n.key?'前缀 '+n.key:'根')+(n.term?'，频率 '+live.freq[n.key]:'')+(hc?'，被查询 '+hc+' 次':'');
    }
    const paintAll=()=>{for(const n of nodes.values())paint(n)};

    const resBox=h('div',{class:'sdl-panel'}),verBox=h('div',{class:'sdl-panel'}),shardBox=h('div',{class:'sdl-panel',hidden:true});
    side.append(resBox,verBox,shardBox);
    const pathTxt=path=>path.map(n=>n.key||'根').join(' → ');
    const tag=(v,bad)=>h('span',{class:'sdl-tag '+(bad?'bad':v>1?'ok':'info')},'v'+v);
    function renderRes(){
      if(!last){resBox.replaceChildren(h('div',{class:'ph'},'查询结果'),h('p',{class:'tt-proc sdl-note'},'在上方输入前缀，或点树上的节点。'));return}
      const q=last,mx=Math.max(1,...q.list.map(x=>x[1]));
      resBox.replaceChildren(
        h('div',{class:'ph'},h('span',null,'输入「',h('span',{class:'sdl-mono'},q.prefix),'」→ 前 ',K,' 条建议'),q.list?tag(q.ver):null),
        q.found?h('ol',{class:'tt-res'},q.list.map(([w,f],i)=>h('li',{class:q.chg.includes(w)?'chg':null},h('span',{class:'rk'},i+1),h('span',{class:'w'},w),h('span',{class:'bar'},h('i',{style:{width:f/mx*100+'%'}})),h('span',{class:'f'},f)))):h('p',{class:'tt-proc'},'词库里没有这个前缀，返回空列表。'),
        h('p',{class:'tt-proc'},q.proc));
    }
    function renderVer(){
      const lg=Object.entries(log);
      const kids=[h('div',{class:'ph'},h('span',null,'线上版本'),tag(live.v)),
        h('div',null,'本周日志（还没进入 Trie）：',lg.length?h('b',null,lg.map(([w,d])=>`${w} +${d}`).join('，')):'暂无')];
      if(prog)kids.push(h('div',{class:'tt-prog'},h('i',{style:{width:prog.p*100+'%'}})),h('div',{class:'sdl-note',style:{margin:0}},prog.text));
      if(hist.length){
        kids.push(h('div',{class:'sdl-note',style:{margin:'6px 0 0'}},'最近的查询：'),h('ul',{class:'tt-hist'},hist.map(x=>h('li',null,h('span',{class:'p'},x.prefix),' → ',x.list.map(y=>y[0]).join(', ')||'（空）',' ',tag(x.ver)))));
        const [a,b]=hist;
        if(a&&b&&a.ver!==b.ver&&a.prefix.startsWith(b.prefix)&&a.gen===b.gen){
          const extra=a.list.map(x=>x[0]).filter(w=>!b.list.some(y=>y[0]===w)&&a.list.find(y=>y[0]===w)[1]>Math.min(...b.list.map(y=>y[1])));
          kids.push(h('p',{class:'tt-warn'},`混合版本：${b.prefix} 读到 v${b.ver}，${a.prefix} 读到 v${a.ver}${extra.length?`；${extra.join('、')} 在更长的前缀里排进前列，在更短的前缀里却不见了`:''}`));
        }
      }
      verBox.replaceChildren(...kids);
      st.set('ver','v'+live.v,live.v>1?'ok':'info');st.set('log',lg.length?lg.map(([w,d])=>`${w} +${d}`).join('，'):'无',lg.length?'warn':null);
    }
    function renderShard(){
      if(!heat){shardBox.hidden=true;return}
      shardBox.hidden=false;const tot=heat.am+heat.nz||1;
      const hot=Object.entries(heat.count).sort((a,b)=>b[1]-a[1]||a[0].length-b[0].length).slice(0,4);
      shardBox.replaceChildren(h('div',{class:'ph'},h('span',null,`按首字母分两片 · ${heat.users} 个用户、${fmt(tot)} 次查询`)),
        ...[['分片 1：a–m',heat.am],['分片 2：n–z',heat.nz]].map(([k,v])=>h('div',{class:'tt-shard'},h('span',null,k),h('span',{class:'bar'},h('i',{style:{width:v/tot*100+'%'}})),h('span',{class:'v'},util.pct(v/tot,0)))),
        h('div',{class:'sdl-note',style:{margin:'4px 0 0'}},'最热的前缀：'+hot.map(([p,c])=>`${p}（${c}）`).join('、')));
    }

    /* ---- 查询动画 ---- */
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
      if(!found){proc=`沿 ${pathTxt(path)} 走到头也没有「${prefix}」，访问 ${visited} 个节点后返回空。`}
      else if(m==='naive'){
        const got=cur.term?[cur.key]:[];st.set('cand',got.length);
        for(const n of sub){n.hl=n.term?'cand':'visit';paint(n);visited++;if(n.term)got.push(n.key);st.set('visit',visited,'warn');st.set('cand',got.length,'warn');await ctx.wait(150);if(tok!==qTok)return null}
        await ctx.wait(300);if(tok!==qTok)return null;
        list=got.map(w=>[w,live.freq[w]]).sort(byFreq).slice(0,K);
        proc=`路径 ${path.length} 个节点（${pathTxt(path)}）+ 遍历子树 ${sub.length} 个节点 = ${visited} 个；收集 ${got.length} 个候选，排序取前 ${Math.min(K,got.length)} 条。换成节点缓存只需访问 ${path.length} 个节点。`;
      }else{
        const e=live.cache.get(cur.key);list=e.list;ver=e.v;
        proc=`沿 ${pathTxt(path)} 访问 ${visited} 个节点，直接读「${cur.key}」节点上预先算好的 ${list.length} 条，不遍历、不排序。朴素做法要访问 ${path.length+sub.length} 个节点、排序 ${cands} 个候选。`;
      }
      if(m!=='naive')st.set('cand',0,'ok');
      last={prefix,list,ver,found,proc,chg:Object.keys(chgWords)};
      if(found){hist.unshift({prefix,list,ver,gen});hist=hist.slice(0,3)}
      renderRes();renderVer();
      ctx.announce(`${prefix}：${list.map(x=>x[0]).join('、')||'无结果'}`);
      return last;
    }
    let gen=0,chgWords={};
    const runQ=v=>{if(!v){qTok++;clearHl();paintAll();last=null;renderRes();return}query(v).catch(()=>{})};

    /* ---- 批次重建 ---- */
    async function build(o={}){
      if(building)return;building=true;
      const inPl=o.inPlace??inPlace;
      try{
        const freq={...live.freq};for(const [w,d] of Object.entries(log))freq[w]=(freq[w]||0)+d;
        const v=live.v+1,old=live.v;
        const lt=Object.entries(log).map(([w,d])=>`${w} ${live.freq[w]} → ${freq[w]}`).join('，')||'无变化';
        for(const w of Object.keys(log))chgWords[w]=1;
        ctx.log(`聚合本周日志（${lt}），开始构建 v${v}：${inPl?'直接覆盖线上 Trie 的节点':'在新副本里构建，线上继续服务 v'+old}`,inPl?'warn':'info');
        log={};gen++;
        if(!inPl)next={v,freq,cache:new Map()};
        let i=0;
        for(const n of post){
          if(inPl){if(n.term)live.freq[n.key]=freq[n.key];live.cache.set(n.key,{list:topk(n,freq),v});n.done=true}
          else{next.cache.set(n.key,{list:topk(n,freq),v});n.dot=true}
          i++;prog={p:i/post.length,text:inPl?`原地覆盖：${i} / ${post.length} 个节点已是 v${v}，其余仍是 v${old}（绿框为已覆盖）`:`构建 v${v}：已算好 ${i} / ${post.length} 个节点（绿点），线上仍是 v${old}`};
          paint(n);renderVer();
          await ctx.wait(110);
          if(o.hook)await o.hook(n.key);
        }
        if(!inPl){prog={p:1,text:'校验新版本、预热缓存…'};renderVer();await ctx.wait(500);live=next;next=null;for(const n of nodes.values())n.dot=false;ctx.log(`原子切换：查询服务整体指向 v${v}，保留 v${old} 以便回滚`,'ok')}
        else{live.v=v;ctx.log(`原地覆盖完成，线上 Trie 变为 v${v}；覆盖期间的查询可能读到新旧混合的节点`,'warn')}
        prog=null;paintAll();renderVer();
        await ctx.wait(700);for(const n of nodes.values())n.done=false;paintAll();
      }finally{building=false;prog=null}
    }

    /* ---- 热度模拟 ---- */
    async function heatSim(){
      heat=newHeat();const users=pickUsers(live.freq,300,13);
      for(let i=0;i<users.length;i++){
        addHeat(heat,users[i]);
        if(i%20===19||i===users.length-1){heat.max=Math.max(...Object.values(heat.count));paintAll();renderShard();await ctx.wait(110)}
      }
      const tot=heat.am+heat.nz;
      ctx.log(`${heat.users} 个用户共发出 ${tot} 次前缀查询：a–m 分片 ${heat.am} 次（${util.pct(heat.am/tot,0)}），n–z 分片 ${heat.nz} 次`,'info');
    }

    /* ---- 控件 ---- */
    const inp=h('input',{type:'text',class:'tt-inp',value:'',maxlength:6,autocomplete:'off',spellcheck:false,'aria-label':'输入前缀'});
    inp.addEventListener('input',()=>{const v=inp.value.toLowerCase().replace(/[^a-z]/g,'').slice(0,6);if(v!==inp.value)inp.value=v;runQ(v)});
    ctx.controls.append(h('label',{class:'sdl-ctrl'},h('span',{class:'lbl'},h('span',null,'输入前缀（小写字母）')),inp));
    const modeCtl=ctx.segmented({label:'查询方式',value:mode,options:[['cache','节点缓存 Top-K'],['naive','朴素：遍历子树再排序']],onChange:v=>{mode=v;if(inp.value)runQ(inp.value)}});
    const wordSel=ctx.select({label:'本周多搜的词',value:'cap',options:Object.keys(WORDS).map(w=>[w,w])});
    const inPlaceT=ctx.toggle({label:'原地覆盖线上 Trie（不建新版本）',value:false,onChange:v=>{inPlace=v}});
    const addLog=(w,d)=>{log[w]=(log[w]||0)+d;ctx.log(`本周日志：${w} 又被搜了 ${d} 次（只写进日志，线上 Trie 不变）`);renderVer()};
    ctx.button('日志 +10 次',()=>addLog(wordSel.get(),10));
    ctx.button('构建新版本',()=>{build().catch(()=>{})},{primary:true});
    ctx.button('模拟 300 次输入',()=>{heatSim().catch(()=>{})});
    ctx.button('清除热度',()=>{heat=null;paintAll();renderShard()});
    const st=ctx.stats([{key:'visit',label:'本次访问节点'},{key:'cand',label:'需要排序的候选'},{key:'ver',label:'线上版本'},{key:'log',label:'本周日志（未生效）'}]);

    resetData();paintAll();renderRes();renderVer();
    ctx.wait(500).then(()=>{if(!inp.value&&!last){inp.value='ca';runQ('ca')}}).catch(()=>{});

    function prepare(){
      resetData();building=false;chgWords={};inPlace=false;inPlaceT.set(false,true);mode='cache';modeCtl.set('cache',true);
      inp.value='';paintAll();renderRes();renderVer();renderShard();ctx.clearLog();st.set('visit','—');st.set('cand','—');
    }
    const tot0=H0.am+H0.nz;
    ctx.scenarios([
      {id:'naive-vs-cache',label:'输入 ca：现算还是查表',
        ask:'词库里以 ca 开头的词有 6 个。输入 ca 时，朴素做法走到 ca 后还要遍历整棵子树再排序；节点缓存 Top-K 只走到 ca。两种做法各访问几个节点？',
        insight:'朴素做法访问 9 个节点（路径 根 → c → ca 共 3 个，加子树 6 个），收集 6 个候选再排序取前 5；缓存做法只访问 3 个节点，直接读 ca 上预先算好的 [cat, car, can, care, card]。玩具词库里只差 3 倍，真实词库里 ca 的子树可能有数千个词：现算的代价随子树规模增长，查表只和前缀长度有关。',
        async run(){prepare();inp.value='ca';modeCtl.set('naive',true);mode='naive';await query('ca','naive');await ctx.wait(1400);modeCtl.set('cache',true);mode='cache';await query('ca','cache');await ctx.wait(500)}},
      {id:'weekly-rebuild',label:'cap 这周突然变热',
        ask:'这周 cap 多被搜了 30 次（12 → 42）。重建之前输入 ca 能看到 cap 吗？构建新版本并切换后，ca 的前 5 条里谁会被挤掉？',
        insight:'重建前看不到：新搜索只写进日志，线上仍是 v1，这是「查询实时」优先于「数据实时」。v2 在副本里从叶子往上重算每个前缀的前 5 条（绿点），校验后一次切换：cap 42 排到第一，card 18 被挤出。c 节点的缓存同时更新，因为 cap 也在 c 的子树里。',
        async run(){prepare();inp.value='ca';await query('ca');await ctx.wait(500);addLog('cap',30);await ctx.wait(700);await query('ca');await ctx.wait(500);await build({inPlace:false});await query('ca');await ctx.wait(400)}},
      {id:'in-place',label:'边覆盖边服务',
        ask:'不建新版本，直接在线上 Trie 上逐个节点覆盖（从叶子往上）。覆盖进行到一半时，用户先输入 c，再输入 ca。可能看到什么？',
        insight:'覆盖到 ca、还没轮到 c 时：输入 ca 读到 v2，cap 42 排第一；输入 c 读到的还是 v1，前 5 条里根本没有 cap。多敲一个字母，热门词反而冒出来了，这就是读者看到的混合版本。先在副本里构建、校验、预热，再整体切换（上一个场景的做法），就不会出现这种中间状态。',
        async run(){prepare();inPlaceT.set(true);addLog('cap',30);await ctx.wait(500);await build({inPlace:true,hook:async k=>{if(k==='ca'){inp.value='c';await query('c');await ctx.wait(300);inp.value='ca';await query('ca');await ctx.wait(1600)}}});await ctx.wait(300)}},
      {id:'hot-prefix',label:'短前缀是热点',
        ask:'300 个用户各输入一个词，每敲一个字母查一次。按首字母把 Trie 平分成 a–m、n–z 两片（各 13 个字母）。两片各承担多少查询？哪个节点最热？',
        insight:`${fmt(tot0)} 次查询里 a–m 分片承担 ${H0.am} 次（${util.pct(H0.am/tot0,0)}），n–z 只有 ${H0.nz} 次：字母范围平分，流量却一边倒。最热的是 ${hot0.slice(0,2).map(([p,c])=>`${p}（${c} 次）`).join('、')}：以它开头的每次输入都要经过这个短前缀。所以要监控前缀访问分布再定分片边界，并为短前缀预先缓存结果。`,
        async run(){prepare();await heatSim();await ctx.wait(600)}},
    ]);
  }
});
})();
