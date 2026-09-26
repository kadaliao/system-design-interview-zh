/* 第 11 章：新闻流。实验一对比写扩散、读扩散与混合方案；实验二看 feed 缓存只存 ID 时，读取阶段怎样组装、过滤和分页。 */
(function(){
const {el:h,util}=SDLab;
const trim3=x=>String(+x.toPrecision(3));
const cn=n=>n>=1e8?trim3(n/1e8)+' 亿':n>=1e4?trim3(n/1e4)+' 万':util.fmt(n);

/* ---------------- 实验一：写扩散、读扩散与混合 ---------------- */
/* 每个读者关注 300 个账号，按粉丝规模分四档：[名称, 粉丝数, 关注人数, 每天发帖] */
const TIERS=[['普通用户',150,140,1],['小博主',5000,50,3],['大V',200000,90,5],['名人',2000000,20,5]];
const DAU=1e7,OPENS=10,SPEED=400000,ME=0.63;
SDLab.define({
  id:'feed-fanout',chapter:11,
  title:'名人发帖时的写扩散、读扩散与混合',
  summary:'同一条帖子、同一次打开 feed，同时交给三种扩散方式。看名人发帖时写扩散要写多少份目录、多久才轮到你；读扩散和混合在打开时要读多少次；再拖动混合模式的阈值，看全站的写入和读取怎样此消彼长。',
  caveat:'扩散速度按每秒写 40 万条 feed 缓存计；你排在名人粉丝列表的 63% 处。读延迟按「每批并发 20 个缓存读取、每批 3 毫秒，再加 5 毫秒取帖子详情」粗略估算。全站估算假设 1000 万 DAU、每人每天打开 10 次，关注构成见表下说明；只统计扩散写入与 feed 读取，不含帖子本身的存储。',
  mount(ctx){
    ctx.css('ff',`
.ff-cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.ff-narrow .ff-cols{grid-template-columns:minmax(0,1fr)}
.ff-col{border:1px solid #dbe2da;border-radius:10px;padding:9px 10px;background:#fbfcfa;min-width:0}
.ff-h{font-size:14px;font-weight:750;line-height:1.35}.ff-h small{display:block;font-size:11px;font-weight:400;color:#66756d}
.ff-sec{font-size:12px;color:#66756d;font-weight:650;margin:8px 0 3px}
.ff-grid{display:grid;grid-template-columns:repeat(20,minmax(0,1fr));gap:1px;max-width:260px}
.ff-grid i{display:block;aspect-ratio:1;background:#e6eee2;border-radius:1px}
.ff-grid i.on{background:#2f8f5b}.ff-grid i.me{outline:2px solid #2f6fb3;outline-offset:0;position:relative;z-index:1}.ff-grid.off i{background:#eef1ed}
.ff-cap{font-size:12px;line-height:1.5;margin-top:4px;min-height:36px;color:#23352f}
.ff-cap b{font-variant-numeric:tabular-nums}
.ff-bar{height:6px;border-radius:3px;background:#e6eee2;overflow:hidden;margin:3px 0}.ff-bar i{display:block;height:100%;width:0;background:#2f6fb3}
.ff-feed{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:3px;min-height:92px}
.ff-feed li{font-size:12px;line-height:1.5;padding:1px 7px;border-radius:5px;background:#fff;border:1px solid #e1e7df;margin:0;display:flex;justify-content:space-between;gap:6px}
.ff-feed li.new{background:#dcefe2;border-color:#9fcdb0}
.ff-feed li span:last-child{color:#66756d}
.ff-miss{font-size:12px;color:#86561a;background:#f6ead2;border-radius:5px;padding:1px 7px}
.ff-tbl td,.ff-tbl th{white-space:nowrap}
`);
    const P={T:5};
    const thr=()=>10**P.T;
    const MODES=[{k:'push',name:'写扩散',en:'Fanout on Write'},{k:'pull',name:'读扩散',en:'Fanout on Read'},{k:'hyb',name:'混合',en:'Hybrid'}];
    const AUTH={A:{name:'普通作者 A',f:150},S:{name:'名人 S',f:2000000}};
    let posts,fan,cum,seq,now=0,lastPost;
    const pushes=(mode,a)=>mode==='push'||(mode==='hyb'&&AUTH[a].f<=thr());
    function clear(){
      seq=3;now=0;lastPost=null;
      posts=[{id:1,a:'A',t:-90},{id:2,a:'S',t:-60},{id:3,a:'A',t:-30}];
      fan={};cum={};for(const m of MODES){fan[m.k]=null;cum[m.k]={w:0,r:0}}
      for(const m of MODES){const c=cols[m.k];c.feed.replaceChildren(h('li',{class:'ff-miss'},'还没打开过 feed'));c.rcap.textContent='';c.bar.style.width='0'}
    }
    const readsOf=mode=>mode==='push'?1:mode==='pull'?300:1+TIERS.filter(t=>t[1]>thr()).reduce((s,t)=>s+t[2],0);
    const latOf=n=>Math.ceil(n/20)*3+5;
    // 某条帖子在某模式下此刻是否已进入你的 feed
    function visible(mode,p){
      if(!pushes(mode,p.a))return true;           // 读时拉取：打开时一定能拿到
      const f=fan[mode];
      if(!f||f.id!==p.id)return true;             // 只有最新一条可能还在扩散，更早的都已写完
      return f.done>=AUTH[p.a].f*(p.a==='S'?ME:1); // 扩散按粉丝列表顺序写，你在第 63%
    }

    /* ---- 控件 ---- */
    const tCtl=ctx.slider({label:'混合模式阈值：粉丝数超过它就改为读时拉取',min:3,max:7,value:P.T,wide:true,format:v=>cn(10**v),onInput:v=>{P.T=v;drawCols();drawTable()}});
    ctx.button('普通作者 A 发帖（150 粉丝）',()=>post('A'));
    ctx.button('名人 S 发帖（200 万粉丝）',()=>post('S'),{primary:true});
    const openBtn=ctx.button('你打开 feed',()=>open().catch(e=>{if(!(e&&e.abort))console.error(e)}));
    ctx.button('清空',()=>{clear();drawCols()});

    /* ---- 舞台 ---- */
    const wrap=h('div');const colsBox=h('div',{class:'ff-cols'});const cols={};
    for(const m of MODES){
      const grid=h('div',{class:'ff-grid','aria-hidden':'true'});const cells=util.range(100).map(i=>{const c=h('i',{class:i===Math.floor(ME*100)?'me':null});grid.append(c);return c});
      const head=h('small');const wcap=h('div',{class:'ff-cap'}),bar=h('i'),rcap=h('div',{class:'ff-cap',style:{minHeight:'18px'}}),feed=h('ol',{class:'ff-feed'});
      colsBox.append(h('div',{class:'ff-col'},h('div',{class:'ff-h'},m.name,head),h('div',{class:'ff-sec'},'最近一条帖子的扩散（每格＝1% 粉丝）'),grid,wcap,h('div',{class:'ff-sec'},'你打开 feed'),h('div',{class:'ff-bar'},bar),rcap,feed));
      cols[m.k]={grid,cells,head,wcap,bar,rcap,feed};
    }
    const table=h('table',{class:'sdl-table ff-tbl'});
    wrap.append(h('p',{class:'sdl-note',style:{margin:'0 0 8px'}},'蓝框是你在名人 S 粉丝列表中的位置：扩散按列表顺序写，写到这一格你才看得到。'),colsBox,
      h('div',{class:'sdl-panel',style:{marginTop:'12px'}},h('div',{class:'ph'},'全站一天的量（1000 万 DAU，每人每天打开 10 次）'),h('div',{class:'sdl-scroll'},table),
        h('p',{class:'sdl-note',style:{margin:'6px 0 0'}},'关注构成：每人关注 300 个账号，其中 140 个普通用户（约 150 粉丝，每天发 1 条）、50 个小博主（5000 粉丝，3 条）、90 个大V（20 万粉丝，5 条）、20 个名人（200 万粉丝，5 条）。')));
    ctx.stage.append(wrap);
    ctx.onResize(w=>wrap.classList.toggle('ff-narrow',w<640));
    const stats=ctx.stats(MODES.map(m=>({key:m.k,label:m.name+'：累计写入 / 读取'})));

    function drawCols(){
      for(const m of MODES){
        const c=cols[m.k],f=fan[m.k];
        c.head.textContent=m.k==='hyb'?`${m.en}：超过 ${cn(thr())} 粉丝读时拉取`:m.en;
        if(!lastPost){c.grid.classList.add('off');c.cells.forEach(x=>x.classList.remove('on'));c.wcap.textContent='还没有人发帖。';continue}
        const a=AUTH[lastPost.a];
        if(!pushes(m.k,lastPost.a)){
          c.grid.classList.add('off');c.cells.forEach(x=>x.classList.remove('on'));
          c.wcap.replaceChildren(`${a.name} 发帖：`,h('b',null,'不扩散'),m.k==='hyb'?`（粉丝超过阈值），写入 0 次；读者打开时再去拉取。`:'，写入 0 次；读者打开时再去拉取。');
        }else{
          c.grid.classList.remove('off');const pct=f?f.done/a.f:1;const k=Math.floor(pct*100+1e-9);c.cells.forEach((x,i)=>x.classList.toggle('on',i<k));
          const left=f?(a.f-f.done)/SPEED:0;
          c.wcap.replaceChildren(`${a.name} 发帖：写入 `,h('b',null,util.fmt(Math.round(f?f.done:a.f))),` / ${util.fmt(a.f)} 份 feed 缓存`,left>0?h('span',{style:{color:ctx.colors.warn}},`，还需 ${left.toFixed(1)} 秒`):h('span',{style:{color:ctx.colors.ok}},'，已写完'));
        }
      }
      for(const m of MODES)stats.set(m.k,`${cn(cum[m.k].w)} / ${cum[m.k].r}`,null);
    }
    function drawTable(){
      const rows=MODES.map(m=>{
        const pushT=TIERS.filter(t=>m.k==='push'||(m.k==='hyb'&&t[1]<=thr()));
        const w=DAU*pushT.reduce((s,t)=>s+t[2]*t[3],0),r=DAU*OPENS*readsOf(m.k);
        const maxF=Math.max(0,...pushT.map(t=>t[1]));
        return [m.name+(m.k==='hyb'?`（阈值 ${cn(thr())}）`:''),cn(w),cn(r),`${readsOf(m.k)} 次 · 约 ${latOf(readsOf(m.k))} 毫秒`,maxF?`${cn(maxF)}${maxF>=1e4?'':' '}份，${util.duration(maxF/SPEED)}写完`:'不扩散'];
      });
      table.replaceChildren(h('thead',null,h('tr',null,['方案','每天扩散写入','每天 feed 读取','打开一次 feed','最大一次扩散'].map(x=>h('th',null,x)))),h('tbody',null,rows.map(r=>h('tr',null,r.map(x=>h('td',null,x))))));
    }
    function post(a){
      const p={id:++seq,a,t:now};posts.unshift(p);lastPost=p;
      for(const m of MODES){if(pushes(m.k,a)){fan[m.k]={id:p.id,done:0};cum[m.k].w+=AUTH[a].f}else fan[m.k]=null}
      ctx.log(`${AUTH[a].name} 发了帖子 #${p.id}：写扩散要写 ${util.fmt(AUTH[a].f)} 份；混合${pushes('hyb',a)?'同样扩散':'不扩散'}；读扩散不扩散`,'info');
      drawCols();lp.start();
    }
    let reading=false;
    async function open(){
      if(reading)return;reading=true;openBtn.disabled=true;
      try{
        // 打开的那一刻就决定能读到什么；之后的动画只是把读取过程放慢展示
        const since=lastPost?now-lastPost.t:null;
        const res=MODES.map(m=>({m,n:readsOf(m.k),vis:posts.filter(p=>visible(m.k,p)).slice(0,4),missing:posts.find(p=>!visible(m.k,p))}));
        for(const {m,n} of res){cum[m.k].r+=n;cols[m.k].rcap.textContent='读取中…';cols[m.k].bar.style.width='0'}
        // 每 1 毫秒估算延迟放慢成约 18 毫秒动画
        let el=0,done=false;
        while(!done){await ctx.wait(40);el+=40;done=true;
          for(const {m,n} of res){const dur=Math.max(250,latOf(n)*18);const k=util.clamp(el/dur,0,1);if(k<1)done=false;cols[m.k].bar.style.width=k*100+'%';cols[m.k].rcap.textContent=`读取 ${Math.round(n*k)} / ${n} 次`}}
        for(const {m,n,vis,missing} of res){
          const c=cols[m.k];c.rcap.replaceChildren(h('b',null,`读取 ${n} 次`),` · 约 ${latOf(n)} 毫秒`,since!=null?` · 发帖后 ${since.toFixed(1)} 秒打开`:'');
          const items=vis.map(p=>h('li',{class:p.id===lastPost?.id?'new':null},h('span',null,`${AUTH[p.a].name} · 帖子 #${p.id}`),h('span',null,p.id>3?'刚发':'较早')));
          if(missing)items.unshift(h('li',{class:'ff-miss'},`#${missing.id} 还在扩散，没轮到你`));
          c.feed.replaceChildren(...items);
        }
        const msg=MODES.map(m=>`${m.name} 读 ${readsOf(m.k)} 次`).join('，');ctx.log('你打开 feed：'+msg,'ok');ctx.announce(msg);
        drawCols();
      }finally{reading=false;openBtn.disabled=false}
    }
    let acc=0;
    const lp=ctx.loop(dt=>{
      now+=dt;let active=false;
      for(const m of MODES){const f=fan[m.k];if(f){const a=AUTH[posts.find(p=>p.id===f.id).a];if(f.done<a.f){f.done=Math.min(a.f,f.done+SPEED*dt);active=true}}}
      acc+=dt;if(acc>=1/30||!active){acc=0;drawCols()}
      if(!active)lp.stop();
    },false);
    clear();drawCols();drawTable();

    async function prepare(T){while(reading)await ctx.wait(50);P.T=T;tCtl.set(T,true);clear();drawCols();drawTable();ctx.clearLog()}
    const sec=async s=>{const t=now+s;while(now<t-1e-6){lp.start();await ctx.wait(50)}};
    ctx.scenarios([
      {id:'celeb',label:'名人发帖后 2 秒打开',
        ask:'名人 S 有 200 万粉丝，扩散每秒写 40 万份。S 发帖 2 秒后你打开 feed（你排在粉丝列表的 63% 处）。三种模式各写了多少次？你能看到这条帖子吗？',
        insight:'写扩散要写 200 万份目录，2 秒时只写到 40%，还没轮到你，这次打开看不到；约 5 秒写完后再打开才出现。读扩散和混合（S 超过 10 万阈值，不扩散）写入 0 次，打开时现拉，立刻看到；代价是这次打开读扩散读了 300 次、混合读了 111 次。',
        async run(){await prepare(5);post('S');await sec(2);await open();await sec(3.4);await open();await ctx.wait(300)}},
      {id:'normal',label:'普通作者发帖',
        ask:'普通作者 A 只有 150 个粉丝。A 发帖后你打开 feed，三种模式各写了几次、读了几次？',
        insight:'写扩散和混合都写 150 份，一眨眼就写完；打开 feed 时写扩散只读 1 次（约 8 毫秒），读扩散要读 300 次（约 50 毫秒），混合读 111 次：自己的 feed 列表 1 次，加上关注的 110 个超过阈值的账号。普通用户推送很便宜，读扩散的代价落在每一次打开上。',
        async run(){await prepare(5);post('A');await sec(0.6);await open();await ctx.wait(300)}},
      {id:'threshold',label:'挪动混合阈值',
        ask:'把混合模式的阈值从 1 千逐步调到 1000 万。全站每天的扩散写入和 feed 读取会怎样变化？',
        insight:'阈值 1 千时，只有普通用户推送：每天写 14 亿、读 161 亿；阈值 1 万和 10 万时写 29 亿、读 111 亿；阈值 100 万时大V也推送，写 74 亿、读 21 亿，单次最大扩散 20 万份；阈值 1000 万就等于纯写扩散：写 84 亿、读 1 亿，但一条名人帖要写 200 万份、5 秒写完。阈值是在写放大、读取成本和新鲜度之间选位置，依据是粉丝规模、活跃度和发帖频率。',
        async run(){await prepare(3);for(const v of [4,5,6,7]){await ctx.wait(1500);tCtl.set(v)}await ctx.wait(1200)}},
    ]);
  }
});

/* ---------------- 实验二：feed 缓存只存 ID ---------------- */
const INIT=[[101,'A','周末去爬山'],[102,'B','新书读完了'],[103,'C','今天的晚霞'],[104,'D','求推荐键盘'],[105,'A','跑完十公里'],[106,'B','搬家啦'],[107,'C','猫又上桌了'],[108,'D','会议纪要']];
SDLab.define({
  id:'feed-hydrate',chapter:11,
  title:'feed 缓存只存 ID，读取时再组装和过滤',
  summary:'你的 feed 缓存里只有帖子 ID，正文和作者关系要读取时再查。制造删帖、拉黑和新帖插入，看缓存命中的 ID 为什么还要按当前权限过滤，以及 offset 分页为什么会重复。',
  caveat:'每页 4 条。读取时逐个取 ID、查内容缓存、判断当前是否可见；被过滤的 ID 会继续往后取来补满一页，并异步从 feed 缓存删除。游标记录的是本页最后一个被检查的 ID。',
  mount(ctx){
    ctx.css('fh',`
.fh-cols{display:grid;grid-template-columns:minmax(0,.7fr) minmax(0,1.2fr) minmax(0,1.2fr);gap:10px}
.fh-narrow .fh-cols{grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr)}
.fh-narrow .fh-page{grid-column:1/-1}
.fh-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px}
.fh-list li{font-size:12px;line-height:1.5;padding:2px 7px;border-radius:5px;background:#fff;border:1px solid #e1e7df;margin:0;transition:background .2s,opacity .4s}
.fh-list li.cur{background:#dde9f6;border-color:#9dbbe0}
.fh-list li.gone{opacity:.35;text-decoration:line-through}
.fh-list li.fresh{background:#eef6f0}
.fh-list li .mono{font-family:ui-monospace,Menlo,monospace}
.fh-rec{display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap}
.fh-rec .st{font-size:11px;border-radius:5px;padding:0 5px}
.fh-rec .st.bad{background:#f7dedb;color:#9b2c27}.fh-rec .st.warn{background:#f6ead2;color:#86561a}
.fh-card{font-size:13px;line-height:1.5;padding:5px 9px;border-radius:7px;background:#fff;border:1px solid #dbe2da;margin:0}
.fh-card small{color:#66756d;font-size:11px;margin-left:6px}
.fh-card.dup{border-color:#e2c48c;background:#fbf4e6}.fh-card.leak{border-color:#e3aaa4;background:#fbeceb}
.fh-card .why{display:block;font-size:11px;font-weight:650}
.fh-card.dup .why{color:#86561a}.fh-card.leak .why{color:#9b2c27}
.fh-skip{font-size:12px;color:#86561a;padding:2px 9px}
.fh-pagebar{font-size:12px;color:#66756d;margin:0 0 6px}
`);
    const PAGE=4;
    const P={filter:true,paging:'offset'};
    let post,cache,blocked,page,cursor,offset,seen,S,busy=false;
    function reset(){
      post={};for(const [id,a,text] of INIT)post[id]={id,a,text,deleted:false};
      cache=INIT.map(x=>x[0]).reverse();blocked=new Set();page=0;cursor=null;offset=0;seen=new Set();S={shown:0,skip:0,scan:0,dup:0};
    }
    reset();
    const fCtl=ctx.toggle({label:'读取时按当前权限过滤',value:true,onChange:v=>{P.filter=v}});
    const pgCtl=ctx.segmented({label:'分页方式',value:'offset',options:[['offset','offset：跳过前 N 条'],['cursor','游标：接着上次的 ID']],onChange:v=>{P.paging=v}});
    const refBtn=ctx.button('刷新（第 1 页）',()=>guard(()=>load(true)),{primary:true});
    ctx.button('下一页',()=>guard(()=>load(false)));
    ctx.button('B 删除 #106',()=>{post[106].deleted=true;draw();ctx.log('作者 B 删除了 #106；你的 feed 缓存里的 ID 还在','warn')});
    ctx.button('C 拉黑了你',()=>{blocked.add('C');draw();ctx.log('作者 C 拉黑了你；早先扩散进来的 C 的帖子 ID 还在缓存里','warn')});
    ctx.button('新帖到达 2 条',()=>newPosts());
    ctx.button('恢复初始数据',()=>{if(!busy){reset();liC.clear();liD.clear();draw();pageBox.replaceChildren();pageBar.textContent=''}});

    const cacheList=h('ol',{class:'fh-list'}),dbList=h('ol',{class:'fh-list'}),pageBox=h('div',{style:{display:'flex',flexDirection:'column',gap:'4px'}}),pageBar=h('p',{class:'fh-pagebar'});
    const wrap=h('div',null,h('div',{class:'fh-cols'},
      h('div',{class:'sdl-panel'},h('div',{class:'ph'},'News Feed Cache：只有 ID'),cacheList),
      h('div',{class:'sdl-panel'},h('div',{class:'ph'},'Content Cache：帖子详情与当前状态'),dbList),
      h('div',{class:'sdl-panel fh-page'},h('div',{class:'ph'},'你看到的这一页'),pageBar,pageBox)));
    ctx.stage.append(wrap);
    ctx.onResize(w=>wrap.classList.toggle('fh-narrow',w<640));
    const stats=ctx.stats([{key:'shown',label:'本页展示'},{key:'skip',label:'本页过滤掉'},{key:'scan',label:'本页检查的 ID'},{key:'dup',label:'与上一页重复'}]);
    const liC=new Map(),liD=new Map();
    function status(p){if(p.deleted)return ['已删除','bad'];if(blocked.has(p.a))return ['作者已拉黑你','warn'];return null}
    function draw(){
      cacheList.replaceChildren(...cache.map(id=>{let li=liC.get(id);if(!li){li=h('li',null,h('span',{class:'mono'},'#'+id));liC.set(id,li)}return li}));
      const ids=Object.keys(post).map(Number).sort((a,b)=>b-a);
      dbList.replaceChildren(...ids.map(id=>{const p=post[id],st=status(p);let li=liD.get(id);if(!li){li=h('li');liD.set(id,li)}li.replaceChildren(h('div',{class:'fh-rec'},h('span',null,h('span',{class:'mono'},'#'+id),` ${p.a}：${p.text}`),st?h('span',{class:'st '+st[1]},st[0]):null));return li}));
      stats.set('shown',S.shown,'ok');stats.set('skip',S.skip,S.skip?'warn':null);stats.set('scan',S.scan);stats.set('dup',S.dup,S.dup?'bad':'ok');
    }
    function newPosts(){const base=Math.max(...Object.keys(post).map(Number));for(let i=1;i<=2;i++){const id=base+i;post[id]={id,a:i===1?'B':'D',text:i===1?'刚到的新帖':'又一条新帖',deleted:false};cache.unshift(id)}draw();for(let i=1;i<=2;i++){const li=liC.get(base+i);li&&li.classList.add('fresh')}ctx.log(`新帖 #${base+1}、#${base+2} 扩散进来，插到 feed 缓存最前面`,'info')}
    async function guard(fn){if(busy)return;busy=true;refBtn.disabled=true;try{await fn()}catch(e){if(!(e&&e.abort))console.error(e)}finally{busy=false;refBtn.disabled=false}}
    async function load(first){
      const d=320;
      if(first){page=1;offset=0;cursor=null;seen=new Set()}else page++;
      let i=first?0:P.paging==='offset'?offset:(cursor==null?0:cache.indexOf(cursor)+1);
      if(!first&&P.paging==='cursor'&&cursor!=null&&cache.indexOf(cursor)<0)i=0;
      const prevSeen=new Set(seen);
      S={shown:0,skip:0,scan:0,dup:0};pageBox.replaceChildren();
      pageBar.textContent=first?'第 1 页':P.paging==='offset'?`第 ${page} 页：跳过前 ${offset} 条`:`第 ${page} 页：从 #${cursor} 之后开始`;
      const stale=[];let last=null;
      while(S.shown<PAGE&&i<cache.length){
        const id=cache[i++],p=post[id],li=liC.get(id),ld=liD.get(id);S.scan++;last=id;
        li&&li.classList.add('cur');await ctx.wait(d*.6);ld&&ld.classList.add('cur');await ctx.wait(d*.6);
        const st=status(p);
        if(st&&P.filter){S.skip++;stale.push(id);pageBox.append(h('div',{class:'fh-skip'},`#${id} ${st[0]} → 跳过，再往后取一个`));li&&li.classList.add('gone')}
        else{const dup=prevSeen.has(id);if(dup)S.dup++;S.shown++;seen.add(id);
          pageBox.append(h('div',{class:'fh-card'+(st?' leak':dup?' dup':'')},h('b',null,p.a),h('small',null,'#'+id),h('div',null,p.text),st?h('span',{class:'why'},`${st[0]}，却还是展示了`):dup?h('span',{class:'why'},'上一页已经看过'):null))}
        li&&li.classList.remove('cur');ld&&ld.classList.remove('cur');draw();
      }
      offset=i;cursor=last;
      if(!S.shown)pageBox.append(h('p',{class:'sdl-note'},'没有更多了。'));
      if(stale.length){await ctx.wait(500);cache=cache.filter(x=>!stale.includes(x));draw();ctx.log(`异步清理：从 feed 缓存删除失效 ID ${stale.map(x=>'#'+x).join('、')}`,'info')}
      ctx.announce(`本页展示 ${S.shown} 条，过滤 ${S.skip} 条，重复 ${S.dup} 条`);
    }
    draw();guard(()=>load(true));

    async function prepare(o){while(busy)await ctx.wait(50);Object.assign(P,{filter:true,paging:'offset'},o);fCtl.set(P.filter,true);pgCtl.set(P.paging,true);reset();liC.clear();liD.clear();draw();pageBox.replaceChildren();pageBar.textContent='';ctx.clearLog()}
    const act=async fn=>{busy=true;refBtn.disabled=true;try{await fn()}finally{busy=false;refBtn.disabled=false}};
    ctx.scenarios([
      {id:'deleted',label:'删帖后 ID 还在',
        ask:'B 删除了 #106，但你的 feed 缓存里还留着这个 ID。读取时不做权限过滤，第一页会显示什么？打开过滤后呢？',
        insight:'不过滤时，已删除的 #106 照样被组装出来展示：缓存命中只说明 ID 还在，不说明内容还可见。打开过滤后，读取时发现 #106 已删除，跳过它并多取一个 #104 补满这一页，随后异步把 #106 从 feed 缓存删掉。',
        async run(){await prepare({filter:false});post[106].deleted=true;draw();await act(()=>load(true));await ctx.wait(900);P.filter=true;fCtl.set(true,true);await act(()=>load(true));await ctx.wait(600)}},
      {id:'blocked',label:'拉黑之后',
        ask:'C 的两条帖子 #107、#103 早就扩散进了你的 feed 缓存，之后 C 拉黑了你。刷新第一页和第二页时会发生什么？',
        insight:'两页都没有出现 C 的帖子：#107 在第一页被跳过，#103 在第二页被跳过，页面都用后面的 ID 补齐。拉黑发生在扩散之后，所以权限只能在读取那一刻按当前关系判断，不能指望扩散时一次定死。',
        async run(){await prepare({paging:'cursor'});blocked.add('C');draw();await act(()=>load(true));await ctx.wait(700);await act(()=>load(false));await ctx.wait(600)}},
      {id:'paging',label:'新帖插入时翻页',
        ask:'看完第一页（#108–#105）后来了 2 条新帖，插到 feed 最前面。用 offset 翻到第二页会看到哪些帖子？换成游标呢？',
        insight:'offset 跳过前 4 条，但前面多了 2 条新帖，第二页从 #106 开始，#106、#105 与第一页重复。游标记住「上次看到 #105」，第二页从它之后接着取 #104–#101，不重复也不漏。新帖要靠刷新第一页看到。',
        async run(){
          await prepare({paging:'offset'});await act(()=>load(true));await ctx.wait(500);newPosts();await ctx.wait(700);await act(()=>load(false));await ctx.wait(1400);
          await prepare({paging:'cursor'});await act(()=>load(true));await ctx.wait(500);newPosts();await ctx.wait(700);await act(()=>load(false));await ctx.wait(600)}},
    ]);
  }
});
})();
