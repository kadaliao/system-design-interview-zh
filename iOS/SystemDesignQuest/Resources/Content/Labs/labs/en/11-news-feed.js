/* Chapter 11: News Feed. Lab 1 compares fan-out on write, fan-out on read, and the hybrid; lab 2 shows how the read path assembles, filters, and pages when the feed cache stores only IDs. */
(function(){
const {el:h,util}=SDLab;
const trim3=x=>String(+x.toPrecision(3));
const cn=n=>n>=1e9?trim3(n/1e9)+'B':n>=1e6?trim3(n/1e6)+'M':util.fmt(n);

/* ---------------- Lab 1: fan-out on write, fan-out on read, and hybrid ---------------- */
/* Each reader follows 300 accounts in four tiers by follower count: [name, followers, accounts followed, posts per day] */
const TIERS=[['Regular user',150,140,1],['Small creator',5000,50,3],['Large creator',200000,90,5],['Celebrity',2000000,20,5]];
const DAU=1e7,OPENS=10,SPEED=400000,ME=0.63;
SDLab.define({
  id:'feed-fanout',chapter:11,
  title:'Fan-out on write, fan-out on read, and hybrid when a celebrity posts',
  summary:'Hand the same post and the same feed open to all three fan-out approaches. See how many lists fan-out on write must update when a celebrity posts and how long until your turn; how many reads fan-out on read and the hybrid need on open; then drag the hybrid threshold to watch site-wide writes and reads trade off.',
  caveat:'Fan-out speed assumes 400,000 feed-cache writes per second, and you sit at 63% of the celebrity’s follower list. Read latency is a rough estimate: batches of 20 concurrent cache reads at 3 ms per batch, plus 5 ms to fetch post details. The site-wide estimate assumes 10 million DAU, each opening the feed 10 times a day; see the note under the table for the follow mix. It counts only fan-out writes and feed reads, not storage of the posts themselves.',
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
    const MODES=[{k:'push',name:'Fan-out on write',en:'Push to every follower'},{k:'pull',name:'Fan-out on read',en:'Pull when the reader opens'},{k:'hyb',name:'Hybrid',en:'Hybrid'}];
    const AUTH={A:{name:'Regular author A',f:150},S:{name:'Celebrity S',f:2000000}};
    let posts,fan,cum,seq,now=0,lastPost;
    const pushes=(mode,a)=>mode==='push'||(mode==='hyb'&&AUTH[a].f<=thr());
    function clear(){
      seq=3;now=0;lastPost=null;
      posts=[{id:1,a:'A',t:-90},{id:2,a:'S',t:-60},{id:3,a:'A',t:-30}];
      fan={};cum={};for(const m of MODES){fan[m.k]=null;cum[m.k]={w:0,r:0}}
      for(const m of MODES){const c=cols[m.k];c.feed.replaceChildren(h('li',{class:'ff-miss'},'Feed not opened yet'));c.rcap.textContent='';c.bar.style.width='0'}
    }
    const readsOf=mode=>mode==='push'?1:mode==='pull'?300:1+TIERS.filter(t=>t[1]>thr()).reduce((s,t)=>s+t[2],0);
    const latOf=n=>Math.ceil(n/20)*3+5;
    // Whether a post has reached your feed in a given mode right now
    function visible(mode,p){
      if(!pushes(mode,p.a))return true;           // Pulled at read time: always available on open
      const f=fan[mode];
      if(!f||f.id!==p.id)return true;             // Only the latest post may still be fanning out; earlier ones are done
      return f.done>=AUTH[p.a].f*(p.a==='S'?ME:1); // Fan-out writes in follower-list order; you are at 63%
    }

    /* ---- Controls ---- */
    const tCtl=ctx.slider({label:'Hybrid threshold: authors above this follower count are pulled at read time',min:3,max:7,value:P.T,wide:true,format:v=>cn(10**v),onInput:v=>{P.T=v;drawCols();drawTable()}});
    ctx.button('Regular author A posts (150 followers)',()=>post('A'));
    ctx.button('Celebrity S posts (2M followers)',()=>post('S'),{primary:true});
    const openBtn=ctx.button('You open the feed',()=>open().catch(e=>{if(!(e&&e.abort))console.error(e)}));
    ctx.button('Clear',()=>{clear();drawCols()});

    /* ---- Stage ---- */
    const wrap=h('div');const colsBox=h('div',{class:'ff-cols'});const cols={};
    for(const m of MODES){
      const grid=h('div',{class:'ff-grid','aria-hidden':'true'});const cells=util.range(100).map(i=>{const c=h('i',{class:i===Math.floor(ME*100)?'me':null});grid.append(c);return c});
      const head=h('small');const wcap=h('div',{class:'ff-cap'}),bar=h('i'),rcap=h('div',{class:'ff-cap',style:{minHeight:'18px'}}),feed=h('ol',{class:'ff-feed'});
      colsBox.append(h('div',{class:'ff-col'},h('div',{class:'ff-h'},m.name,head),h('div',{class:'ff-sec'},'Fan-out of the latest post (each cell = 1% of followers)'),grid,wcap,h('div',{class:'ff-sec'},'You open the feed'),h('div',{class:'ff-bar'},bar),rcap,feed));
      cols[m.k]={grid,cells,head,wcap,bar,rcap,feed};
    }
    const table=h('table',{class:'sdl-table ff-tbl'});
    wrap.append(h('p',{class:'sdl-note',style:{margin:'0 0 8px'}},'The blue box is your position in celebrity S’s follower list: fan-out writes in list order, and you see the post only once it reaches your cell.'),colsBox,
      h('div',{class:'sdl-panel',style:{marginTop:'12px'}},h('div',{class:'ph'},'Site-wide volume per day (10 million DAU, each opening the feed 10 times a day)'),h('div',{class:'sdl-scroll'},table),
        h('p',{class:'sdl-note',style:{margin:'6px 0 0'}},'Follow mix: each person follows 300 accounts: 140 regular users (about 150 followers, 1 post a day), 50 small creators (5,000 followers, 3 posts), 90 large creators (200,000 followers, 5 posts), and 20 celebrities (2 million followers, 5 posts).')));
    ctx.stage.append(wrap);
    ctx.onResize(w=>wrap.classList.toggle('ff-narrow',w<640));
    const stats=ctx.stats(MODES.map(m=>({key:m.k,label:m.name+': total writes / reads'})));

    function drawCols(){
      for(const m of MODES){
        const c=cols[m.k],f=fan[m.k];
        c.head.textContent=m.k==='hyb'?`${m.en}: pull above ${cn(thr())} followers`:m.en;
        if(!lastPost){c.grid.classList.add('off');c.cells.forEach(x=>x.classList.remove('on'));c.wcap.textContent='No one has posted yet.';continue}
        const a=AUTH[lastPost.a];
        if(!pushes(m.k,lastPost.a)){
          c.grid.classList.add('off');c.cells.forEach(x=>x.classList.remove('on'));
          c.wcap.replaceChildren(`${a.name} posts: `,h('b',null,'no fan-out'),m.k==='hyb'?' (followers above the threshold), 0 writes; pulled when a reader opens the feed.':', 0 writes; pulled when a reader opens the feed.');
        }else{
          c.grid.classList.remove('off');const pct=f?f.done/a.f:1;const k=Math.floor(pct*100+1e-9);c.cells.forEach((x,i)=>x.classList.toggle('on',i<k));
          const left=f?(a.f-f.done)/SPEED:0;
          c.wcap.replaceChildren(`${a.name} posts: wrote `,h('b',null,util.fmt(Math.round(f?f.done:a.f))),` / ${util.fmt(a.f)} feed caches`,left>0?h('span',{style:{color:ctx.colors.warn}},`, ${left.toFixed(1)} s to go`):h('span',{style:{color:ctx.colors.ok}},', done'));
        }
      }
      for(const m of MODES)stats.set(m.k,`${cn(cum[m.k].w)} / ${cum[m.k].r}`,null);
    }
    function drawTable(){
      const rows=MODES.map(m=>{
        const pushT=TIERS.filter(t=>m.k==='push'||(m.k==='hyb'&&t[1]<=thr()));
        const w=DAU*pushT.reduce((s,t)=>s+t[2]*t[3],0),r=DAU*OPENS*readsOf(m.k);
        const maxF=Math.max(0,...pushT.map(t=>t[1]));
        return [m.name+(m.k==='hyb'?` (threshold ${cn(thr())})`:''),cn(w),cn(r),`${readsOf(m.k)} ${readsOf(m.k)===1?'read':'reads'} · about ${latOf(readsOf(m.k))} ms`,maxF?`${cn(maxF)} feeds, written in ${util.duration(maxF/SPEED)}`:'No fan-out'];
      });
      table.replaceChildren(h('thead',null,h('tr',null,['Approach','Fan-out writes per day','Feed reads per day','Opening the feed once','Largest single fan-out'].map(x=>h('th',null,x)))),h('tbody',null,rows.map(r=>h('tr',null,r.map(x=>h('td',null,x))))));
    }
    function post(a){
      const p={id:++seq,a,t:now};posts.unshift(p);lastPost=p;
      for(const m of MODES){if(pushes(m.k,a)){fan[m.k]={id:p.id,done:0};cum[m.k].w+=AUTH[a].f}else fan[m.k]=null}
      ctx.log(`${AUTH[a].name} posted #${p.id}: fan-out on write must write ${util.fmt(AUTH[a].f)} feeds; the hybrid ${pushes('hyb',a)?'fans out too':'does not fan out'}; fan-out on read does not fan out`,'info');
      drawCols();lp.start();
    }
    let reading=false;
    async function open(){
      if(reading)return;reading=true;openBtn.disabled=true;
      try{
        // What you can read is decided at the moment of opening; the animation just slows the read down for display
        const since=lastPost?now-lastPost.t:null;
        const res=MODES.map(m=>({m,n:readsOf(m.k),vis:posts.filter(p=>visible(m.k,p)).slice(0,4),missing:posts.find(p=>!visible(m.k,p))}));
        for(const {m,n} of res){cum[m.k].r+=n;cols[m.k].rcap.textContent='Reading…';cols[m.k].bar.style.width='0'}
        // Each 1 ms of estimated latency is slowed to about 18 ms of animation
        let el=0,done=false;
        while(!done){await ctx.wait(40);el+=40;done=true;
          for(const {m,n} of res){const dur=Math.max(250,latOf(n)*18);const k=util.clamp(el/dur,0,1);if(k<1)done=false;cols[m.k].bar.style.width=k*100+'%';cols[m.k].rcap.textContent=`Reads: ${Math.round(n*k)} / ${n}`}}
        for(const {m,n,vis,missing} of res){
          const c=cols[m.k];c.rcap.replaceChildren(h('b',null,`Reads: ${n}`),` · about ${latOf(n)} ms`,since!=null?` · opened ${since.toFixed(1)} s after the post`:'');
          const items=vis.map(p=>h('li',{class:p.id===lastPost?.id?'new':null},h('span',null,`${AUTH[p.a].name} · post #${p.id}`),h('span',null,p.id>3?'Just posted':'Earlier')));
          if(missing)items.unshift(h('li',{class:'ff-miss'},`#${missing.id} is still fanning out and hasn’t reached you`));
          c.feed.replaceChildren(...items);
        }
        const msg=MODES.map(m=>`${m.name}: ${readsOf(m.k)} ${readsOf(m.k)===1?'read':'reads'}`).join('; ');ctx.log('You opened the feed. '+msg,'ok');ctx.announce(msg);
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
      {id:'celeb',label:'Open 2 s after a celebrity posts',
        ask:'Celebrity S has 2 million followers, and fan-out writes 400,000 feeds per second. You open your feed 2 seconds after S posts (you are at 63% of the follower list). How many writes does each mode do, and can you see the post?',
        insight:'Fan-out on write must write 2 million lists. At 2 seconds it has reached only 40%, not you yet, so this open doesn’t show the post; it appears when you open again after about 5 seconds. Fan-out on read and the hybrid (S is above the 100,000 threshold, so no fan-out) do 0 writes and pull on open, so you see the post immediately. The cost: this open took 300 reads for fan-out on read and 111 for the hybrid.',
        async run(){await prepare(5);post('S');await sec(2);await open();await sec(3.4);await open();await ctx.wait(300)}},
      {id:'normal',label:'Regular author posts',
        ask:'Regular author A has only 150 followers. After A posts and you open your feed, how many writes and reads does each mode do?',
        insight:'Fan-out on write and the hybrid both write 150 lists, finished in a blink. Opening the feed costs fan-out on write just 1 read (about 8 ms), fan-out on read 300 reads (about 50 ms), and the hybrid 111: 1 for your own feed list plus the 110 followed accounts above the threshold. Pushing for regular users is cheap; fan-out on read pays on every open.',
        async run(){await prepare(5);post('A');await sec(0.6);await open();await ctx.wait(300)}},
      {id:'threshold',label:'Move the hybrid threshold',
        ask:'Raise the hybrid threshold step by step from 1,000 to 10 million. How do site-wide daily fan-out writes and feed reads change?',
        insight:'At a threshold of 1,000, only regular users are pushed: 1.4 billion writes and 16.1 billion reads a day. At 10,000 and 100,000: 2.9 billion writes and 11.1 billion reads. At 1 million, large creators are pushed too: 7.4 billion writes and 2.1 billion reads, with the largest single fan-out at 200,000 feeds. At 10 million it equals pure fan-out on write: 8.4 billion writes and 100 million reads, but one celebrity post writes 2 million feeds and takes 5 seconds. The threshold balances write amplification, read cost, and freshness, based on follower count, activity, and posting frequency.',
        async run(){await prepare(3);for(const v of [4,5,6,7]){await ctx.wait(1500);tCtl.set(v)}await ctx.wait(1200)}},
    ]);
  }
});

/* ---------------- Lab 2: the feed cache stores only IDs ---------------- */
const INIT=[[101,'A','Hiking this weekend'],[102,'B','Finished the new book'],[103,'C','Tonight’s sunset'],[104,'D','Keyboard recommendations?'],[105,'A','Just ran 10 km'],[106,'B','We moved!'],[107,'C','The cat is on the table again'],[108,'D','Meeting notes']];
SDLab.define({
  id:'feed-hydrate',chapter:11,
  title:'The feed cache holds only IDs; assemble and filter on read',
  summary:'Your feed cache holds only post IDs; bodies and author relationships are looked up on read. Trigger a delete, a block, and new posts to see why a cached ID must still be filtered by current permissions, and why offset paging repeats items.',
  caveat:'Each page has 4 items. A read takes IDs one by one, checks the content cache, and decides whether each is currently visible; filtered IDs are replaced by fetching further down to fill the page, and are deleted from the feed cache asynchronously. The cursor records the last ID checked on the page.',
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
    const fCtl=ctx.toggle({label:'Filter by current permissions on read',value:true,onChange:v=>{P.filter=v}});
    const pgCtl=ctx.segmented({label:'Paging',value:'offset',options:[['offset','offset: skip the first N'],['cursor','cursor: continue after the last ID']],onChange:v=>{P.paging=v}});
    const refBtn=ctx.button('Refresh (page 1)',()=>guard(()=>load(true)),{primary:true});
    ctx.button('Next page',()=>guard(()=>load(false)));
    ctx.button('B deletes #106',()=>{post[106].deleted=true;draw();ctx.log('Author B deleted #106; its ID is still in your feed cache','warn')});
    ctx.button('C blocks you',()=>{blocked.add('C');draw();ctx.log('Author C blocked you; the IDs of C’s posts fanned out earlier are still in the cache','warn')});
    ctx.button('2 new posts arrive',()=>newPosts());
    ctx.button('Reset data',()=>{if(!busy){reset();liC.clear();liD.clear();draw();pageBox.replaceChildren();pageBar.textContent=''}});

    const cacheList=h('ol',{class:'fh-list'}),dbList=h('ol',{class:'fh-list'}),pageBox=h('div',{style:{display:'flex',flexDirection:'column',gap:'4px'}}),pageBar=h('p',{class:'fh-pagebar'});
    const wrap=h('div',null,h('div',{class:'fh-cols'},
      h('div',{class:'sdl-panel'},h('div',{class:'ph'},'News Feed Cache: IDs only'),cacheList),
      h('div',{class:'sdl-panel'},h('div',{class:'ph'},'Content Cache: post details and current status'),dbList),
      h('div',{class:'sdl-panel fh-page'},h('div',{class:'ph'},'The page you see'),pageBar,pageBox)));
    ctx.stage.append(wrap);
    ctx.onResize(w=>wrap.classList.toggle('fh-narrow',w<640));
    const stats=ctx.stats([{key:'shown',label:'Shown on this page'},{key:'skip',label:'Filtered out'},{key:'scan',label:'IDs checked'},{key:'dup',label:'Repeats of previous page'}]);
    const liC=new Map(),liD=new Map();
    function status(p){if(p.deleted)return ['Deleted','bad'];if(blocked.has(p.a))return ['Author blocked you','warn'];return null}
    function draw(){
      cacheList.replaceChildren(...cache.map(id=>{let li=liC.get(id);if(!li){li=h('li',null,h('span',{class:'mono'},'#'+id));liC.set(id,li)}return li}));
      const ids=Object.keys(post).map(Number).sort((a,b)=>b-a);
      dbList.replaceChildren(...ids.map(id=>{const p=post[id],st=status(p);let li=liD.get(id);if(!li){li=h('li');liD.set(id,li)}li.replaceChildren(h('div',{class:'fh-rec'},h('span',null,h('span',{class:'mono'},'#'+id),` ${p.a}: ${p.text}`),st?h('span',{class:'st '+st[1]},st[0]):null));return li}));
      stats.set('shown',S.shown,'ok');stats.set('skip',S.skip,S.skip?'warn':null);stats.set('scan',S.scan);stats.set('dup',S.dup,S.dup?'bad':'ok');
    }
    function newPosts(){const base=Math.max(...Object.keys(post).map(Number));for(let i=1;i<=2;i++){const id=base+i;post[id]={id,a:i===1?'B':'D',text:i===1?'Just arrived':'Another new post',deleted:false};cache.unshift(id)}draw();for(let i=1;i<=2;i++){const li=liC.get(base+i);li&&li.classList.add('fresh')}ctx.log(`New posts #${base+1} and #${base+2} fanned out and were inserted at the front of the feed cache`,'info')}
    async function guard(fn){if(busy)return;busy=true;refBtn.disabled=true;try{await fn()}catch(e){if(!(e&&e.abort))console.error(e)}finally{busy=false;refBtn.disabled=false}}
    async function load(first){
      const d=320;
      if(first){page=1;offset=0;cursor=null;seen=new Set()}else page++;
      let i=first?0:P.paging==='offset'?offset:(cursor==null?0:cache.indexOf(cursor)+1);
      if(!first&&P.paging==='cursor'&&cursor!=null&&cache.indexOf(cursor)<0)i=0;
      const prevSeen=new Set(seen);
      S={shown:0,skip:0,scan:0,dup:0};pageBox.replaceChildren();
      pageBar.textContent=first?'Page 1':P.paging==='offset'?`Page ${page}: skipping the first ${offset}`:`Page ${page}: starting after #${cursor}`;
      const stale=[];let last=null;
      while(S.shown<PAGE&&i<cache.length){
        const id=cache[i++],p=post[id],li=liC.get(id),ld=liD.get(id);S.scan++;last=id;
        li&&li.classList.add('cur');await ctx.wait(d*.6);ld&&ld.classList.add('cur');await ctx.wait(d*.6);
        const st=status(p);
        if(st&&P.filter){S.skip++;stale.push(id);pageBox.append(h('div',{class:'fh-skip'},`#${id} ${st[0]} → skipped, fetch the next one`));li&&li.classList.add('gone')}
        else{const dup=prevSeen.has(id);if(dup)S.dup++;S.shown++;seen.add(id);
          pageBox.append(h('div',{class:'fh-card'+(st?' leak':dup?' dup':'')},h('b',null,p.a),h('small',null,'#'+id),h('div',null,p.text),st?h('span',{class:'why'},`${st[0]}, yet still shown`):dup?h('span',{class:'why'},'Already seen on the previous page'):null))}
        li&&li.classList.remove('cur');ld&&ld.classList.remove('cur');draw();
      }
      offset=i;cursor=last;
      if(!S.shown)pageBox.append(h('p',{class:'sdl-note'},'No more posts.'));
      if(stale.length){await ctx.wait(500);cache=cache.filter(x=>!stale.includes(x));draw();ctx.log(`Async cleanup: removed stale IDs from the feed cache: ${stale.map(x=>'#'+x).join(', ')}`,'info')}
      ctx.announce(`Shown ${S.shown}, filtered out ${S.skip}, repeated ${S.dup}`);
    }
    draw();guard(()=>load(true));

    async function prepare(o){while(busy)await ctx.wait(50);Object.assign(P,{filter:true,paging:'offset'},o);fCtl.set(P.filter,true);pgCtl.set(P.paging,true);reset();liC.clear();liD.clear();draw();pageBox.replaceChildren();pageBar.textContent='';ctx.clearLog()}
    const act=async fn=>{busy=true;refBtn.disabled=true;try{await fn()}finally{busy=false;refBtn.disabled=false}};
    ctx.scenarios([
      {id:'deleted',label:'ID remains after a delete',
        ask:'B deleted #106, but the ID is still in your feed cache. With no permission filtering on read, what does page 1 show? And with filtering on?',
        insight:'Without filtering, the deleted #106 is still assembled and shown: a cache hit only proves the ID is there, not that the content is still visible. With filtering on, the read finds #106 deleted, skips it, fetches one more (#104) to fill the page, and then asynchronously removes #106 from the feed cache.',
        async run(){await prepare({filter:false});post[106].deleted=true;draw();await act(()=>load(true));await ctx.wait(900);P.filter=true;fCtl.set(true,true);await act(()=>load(true));await ctx.wait(600)}},
      {id:'blocked',label:'After a block',
        ask:'C’s two posts, #107 and #103, were fanned out into your feed cache long ago, and then C blocked you. What happens when you refresh page 1 and then load page 2?',
        insight:'Neither page shows C’s posts: #107 is skipped on page 1 and #103 on page 2, and each page is filled with later IDs. The block happened after fan-out, so permissions can only be judged against the current relationship at read time, not settled once at fan-out.',
        async run(){await prepare({paging:'cursor'});blocked.add('C');draw();await act(()=>load(true));await ctx.wait(700);await act(()=>load(false));await ctx.wait(600)}},
      {id:'paging',label:'Paging while new posts arrive',
        ask:'After page 1 (#108–#105), 2 new posts arrive at the front of the feed. What does page 2 show with offset paging? And with a cursor?',
        insight:'Offset skips the first 4, but 2 new posts sit in front, so page 2 starts at #106, and #106 and #105 repeat from page 1. A cursor remembers “last seen #105”, so page 2 continues after it with #104–#101, with no repeats and nothing missed. New posts show up by refreshing page 1.',
        async run(){
          await prepare({paging:'offset'});await act(()=>load(true));await ctx.wait(500);newPosts();await ctx.wait(700);await act(()=>load(false));await ctx.wait(1400);
          await prepare({paging:'cursor'});await act(()=>load(true));await ctx.wait(500);newPosts();await ctx.wait(700);await act(()=>load(false));await ctx.wait(600)}},
    ]);
  }
});
})();
