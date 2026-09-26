/* 第 9 章：网络爬虫。在一张小网页图上做 BFS 抓取，看 URL Frontier 怎样兼顾优先级与按主机礼貌，以及两道去重和爬虫陷阱。 */
(function(){
const {el:h,util}=SDLab;
/* 主机：名称、说明、颜色、单次下载耗时（模拟秒） */
const HOSTS=[['a.com','新闻门户','#1f8a8a',0.8],['b.org','百科站','#7b5cb8',0.9],['mirror.net','a.com 的镜像','#b8477a',0.8],['cal.io','无限日历','#8a6d3b',0.6]];
const HC=Object.fromEntries(HOSTS.map(x=>[x[0],x[2]])),HD=Object.fromEntries(HOSTS.map(x=>[x[0],x[3]]));
/* 网页图：URL → [优先级 1 高 / 2 中 / 3 低, 内容指纹, 页面里的链接] */
const PAGES={
  'a.com/':[1,'A0',['a.com/p1','a.com/p2','a.com/p3','b.org/','mirror.net/']],
  'a.com/p1':[1,'A1',['a.com/p2','b.org/w1','a.com/p1?utm=share']],
  'a.com/p2':[2,'A2',['a.com/','a.com/p3','cal.io/']],
  'a.com/p3':[2,'A3',['a.com/p1','b.org/w2']],
  'a.com/p1?utm=share':[3,'A1',['a.com/p2','b.org/w1']],
  'b.org/':[1,'B0',['b.org/w1','b.org/w2','b.org/w3','a.com/']],
  'b.org/w1':[2,'B1',['b.org/w2','a.com/p2']],
  'b.org/w2':[2,'B2',['b.org/w3','b.org/']],
  'b.org/w3':[3,'B3',['b.org/w1','mirror.net/p3']],
  'mirror.net/':[2,'A0',['mirror.net/p1','mirror.net/p2','mirror.net/p3','b.org/']],
  'mirror.net/p1':[3,'A1',['mirror.net/p2','b.org/w1']],
  'mirror.net/p2':[3,'A2',['mirror.net/','mirror.net/p3','cal.io/']],
  'mirror.net/p3':[3,'A3',['mirror.net/p1','b.org/w2']],
  'cal.io/':[2,'C0',['cal.io/2026-01']],
};
function page(u){
  if(PAGES[u]){const [pri,fp,links]=PAGES[u];return {pri,fp,links}}
  const m=/^cal\.io\/(\d{4})-(\d{2})$/.exec(u);
  if(m){let y=+m[1],mo=+m[2]+1;if(mo>12){mo=1;y++}return {pri:3,fp:'C'+m[1]+m[2],links:[`cal.io/${y}-${String(mo).padStart(2,'0')}`]}}
  return {pri:3,fp:'X'+u,links:[]};
}
const hostOf=u=>u.split('/')[0];
const SEEDS=['a.com/','b.org/'];
const DELAY=1,LEN=40,BACK_CAP=3,FRONT_CAP=60,DL_CAP=150,W=[6,3,1];

SDLab.define({
  id:'crawler-frontier',chapter:9,
  title:'URL Frontier 决定先抓谁、何时抓、哪些不抓',
  summary:'从两个种子开始按 BFS 抓一张小网页图：前置队列按优先级排，后置队列按主机排、同一主机限速，多个下载 worker 并行。开关两道去重、调礼貌规则和深度上限，看镜像页、环路和无限日历会怎样消耗抓取能力。',
  caveat:'时间按模拟秒推进；每次下载固定耗时 0.6–0.9 秒，礼貌间隔 1 秒，每条后置队列最多暂存 3 个 URL。「URL 已见」在入队时记录；内容指纹用页面内容的精确哈希表示。Frontier 最多保存 60 个 URL，演示在下载 150 次后自动停止。修改参数会从种子重新开始。',
  mount(ctx){
    ctx.css('wc',`
.wc-top{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:12px}
.wc-narrow .wc-top{grid-template-columns:minmax(0,1fr)}
.wc-row{display:grid;grid-template-columns:78px minmax(0,1fr);gap:8px;align-items:center;padding:5px 0;border-top:1px dashed #e3e9e1;min-height:36px}
.wc-row:first-of-type{border-top:0}
.wc-lbl{font-size:12px;line-height:1.35;color:#44544b;font-weight:650;min-width:0;overflow-wrap:anywhere}
.wc-lbl small{display:block;font-weight:400;color:#66756d;font-size:11px}
.wc-chips{display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-height:24px;min-width:0}
.wc-chip{display:inline-block;font:12px/22px ui-monospace,Menlo,monospace;padding:0 6px;border-radius:5px;background:#fff;border:1px solid #d9e1d7;border-left:4px solid var(--hc);white-space:nowrap;color:#23352f;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.wc-chip.ok{background:#dcefe2;border-color:#9fcdb0}.wc-chip.dup{background:#f6ead2;border-color:#e2c48c;text-decoration:line-through;color:#6b4513}.wc-chip.dupstore{background:#f6ead2;border-color:#e2c48c;color:#6b4513}.wc-chip.trap{background:#f7dedb;border-color:#e7aaa4;color:#8c2a25}
.wc-chip{border-left-color:var(--hc)}
.wc-more{font-size:12px;color:#66756d}
.wc-empty{font-size:12px;color:#9aa89f}
.wc-host{display:flex;flex-direction:column;gap:3px}
.wc-meta{display:flex;align-items:center;gap:6px;font-size:11px;color:#66756d;flex-wrap:wrap}
.wc-cool{flex:1;min-width:40px;height:5px;border-radius:3px;background:#e6eee2;overflow:hidden}
.wc-cool i{display:block;height:100%;background:#b7791f;width:0}
.wc-conn{font-weight:700;color:#2f6fb3}.wc-conn.bad{color:#c2413b}
.wc-workers{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:8px}
.wc-worker{border:1px solid #dbe2da;border-radius:9px;padding:6px 8px;background:#fff;min-width:0}
.wc-worker .top{display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700;color:#44544b;gap:6px}
.wc-worker .st{font-weight:400;color:#66756d;font-size:11px;text-align:right}
.wc-worker .st.warn{color:#86561a}
.wc-slot{min-height:24px;margin:4px 0}
.wc-bar{height:5px;border-radius:3px;background:#e6eee2;overflow:hidden}.wc-bar i{display:block;height:100%;background:#2f6fb3;width:0}
.wc-off{opacity:.45}
.wc-legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:#66756d;margin-top:6px}
.wc-sets{font-size:12px;color:#44544b;margin:6px 0 0;line-height:1.6}
.wc-flow{font-size:12px;color:#66756d;margin:2px 0 6px}
`);
    const P={workers:3,polite:true,udedup:true,cdedup:true,depth:5,len:true,speed:1};
    let now,F,B,H,workers,seenUrl,seenContent,done,S,seq,rng,nextRoute,finished,busyT,totT,dirty;
    function reset(){
      now=0;F=[[],[],[]];B={};H={};for(const [hn] of HOSTS){B[hn]=[];H[hn]={next:0,conn:0}}
      workers=util.range(P.workers).map(()=>({task:null,end:0,start:0}));
      seenUrl=new Set();seenContent=new Map();done=[];seq=0;rng=util.rng(9);nextRoute=0;finished=false;busyT=0;totT=0;dirty=true;
      S={dl:0,valid:0,dupDrop:0,dupStore:0,trap:0,maxConn:0,seenSkip:0,cutDepth:0,cutLen:0,drop:0,end:null};
      for(const u of SEEDS)enqueue(u,0,null,true);
      ctx.clearLog();ctx.log(`从种子 ${SEEDS.join('、')} 开始；worker ${P.workers} 个，礼貌${P.polite?'开':'关'}，URL 去重${P.udedup?'开':'关'}，内容去重${P.cdedup?'开':'关'}，深度上限 ${P.depth||'不限'}`,'info');
    }
    const frontN=()=>F[0].length+F[1].length+F[2].length;
    const backN=()=>Object.values(B).reduce((s,q)=>s+q.length,0);
    function enqueue(u,depth,from,seed){
      if(!seed){
        if(P.depth&&depth>P.depth){S.cutDepth++;return 'depth'}
        if(P.len&&('https://'+u).length>LEN){S.cutLen++;return 'len'}
        if(P.udedup&&seenUrl.has(u)){S.seenSkip++;return 'seen'}
      }
      seenUrl.add(u);
      if(frontN()>=FRONT_CAP){S.drop++;return 'full'}
      const pg=page(u);F[pg.pri-1].push({id:++seq,url:u,host:hostOf(u),depth,pri:pg.pri});dirty=true;return 'ok';
    }
    function pickFront(accept){
      const idx=[0,1,2].filter(i=>F[i].some(accept));if(!idx.length)return null;
      let r=rng()*idx.reduce((s,i)=>s+W[i],0),qi=idx[idx.length-1];
      for(const i of idx){r-=W[i];if(r<0){qi=i;break}}
      const k=F[qi].findIndex(accept);return F[qi].splice(k,1)[0];
    }
    function route(){const t=pickFront(t=>B[t.host].length<BACK_CAP);if(!t)return false;B[t.host].push(t);dirty=true;return true}
    function assign(w){
      let t=null;
      if(P.polite){
        const ready=HOSTS.map(x=>x[0]).filter(hn=>B[hn].length&&!H[hn].conn&&H[hn].next<=now+1e-9).sort((a,b)=>H[a].next-H[b].next);
        if(ready.length)t=B[ready[0]].shift();
      }else t=pickFront(()=>true);
      if(!t)return;
      w.task=t;w.start=now;w.end=now+HD[t.host];const hs=H[t.host];hs.conn++;S.maxConn=Math.max(S.maxConn,hs.conn);dirty=true;
    }
    function complete(w,wi){
      const t=w.task;w.task=null;const hs=H[t.host];hs.conn--;hs.next=now+(P.polite?DELAY:0);S.dl++;
      const pg=page(t.url),trap=t.host==='cal.io';
      if(P.cdedup&&seenContent.has(pg.fp)){
        t.st='dup';S.dupDrop++;
        ctx.log(`W${wi+1} ${t.url}：内容与 ${seenContent.get(pg.fp)} 相同 → 丢弃，不再提取链接`,'warn');
      }else{
        const again=seenContent.has(pg.fp);if(!again)seenContent.set(pg.fp,t.url);
        t.st=again?'dupstore':trap?'trap':'ok';
        if(again)S.dupStore++;else if(trap)S.trap++;else S.valid++;
        const r={ok:0,seen:0,depth:0,len:0,full:0};for(const l of pg.links)r[enqueue(l,t.depth+1,t.url)]++;
        const parts=[`入队 ${r.ok}`];if(r.seen)parts.push(`已见 ${r.seen}`);if(r.depth)parts.push(`超深度 ${r.depth}`);if(r.len)parts.push(`超长 ${r.len}`);if(r.full)parts.push(`队列满丢弃 ${r.full}`);
        ctx.log(`W${wi+1} ${t.url}（深度 ${t.depth}）→ ${again?'重复内容也存了一份':trap?'陷阱页（内容各不相同）':'新内容'}；链接 ${pg.links.length} 个：${parts.join('，')}`,again?'warn':trap?'bad':'ok');
      }
      done.push(t);dirty=true;
    }
    function tick(dtt){
      now+=dtt;
      workers.forEach((w,i)=>{if(w.task&&now>=w.end-1e-9)complete(w,i)});
      if(P.polite&&now>=nextRoute-1e-9&&route())nextRoute=now+0.15;
      for(const w of workers)if(!w.task)assign(w);
      const busy=workers.filter(w=>w.task).length;busyT+=busy*dtt;totT+=workers.length*dtt;
      const idle=!busy&&!frontN()&&!backN();
      if(idle||S.dl>=(P.cap||DL_CAP)){finished=true;S.end=now;lp.stop();dirty=true;
        const msg=idle?`Frontier 已空，抓取结束：用时 ${now.toFixed(1)} 秒，下载 ${S.dl} 次`:`${P.cap?'场景暂停':'达到演示上限'}：已下载 ${S.dl} 次，Frontier 里还有 ${frontN()+backN()} 个 URL`;
        ctx.log(msg,idle?'info':'bad');ctx.announce(msg);}
    }

    /* ---- 控件 ---- */
    const speedCtl=ctx.segmented({label:'播放速度',value:1,options:[[0,'暂停'],[1,'1×'],[2,'2×'],[4,'4×']],onChange:v=>{P.speed=v}});
    const wCtl=ctx.slider({label:'下载 worker 数',min:1,max:6,value:P.workers,onChange:v=>{P.workers=v;restart()}});
    const dCtl=ctx.slider({label:'深度上限',min:0,max:8,value:P.depth,format:v=>v?v+' 层':'不限',onChange:v=>{P.depth=v;restart()}});
    const pCtl=ctx.toggle({label:'礼貌：同一主机同时 1 个请求、间隔 1 秒',value:P.polite,onChange:v=>{P.polite=v;restart()}});
    const uCtl=ctx.toggle({label:'URL 去重（URL Seen?）',value:P.udedup,onChange:v=>{P.udedup=v;restart()}});
    const cCtl=ctx.toggle({label:'内容去重（Content Seen?）',value:P.cdedup,onChange:v=>{P.cdedup=v;restart()}});
    const lCtl=ctx.toggle({label:`URL 长度上限 ${LEN} 字符`,value:P.len,onChange:v=>{P.len=v;restart()}});
    ctx.button('从种子重新开始',()=>restart(),{primary:true});

    /* ---- 舞台 ---- */
    const wrap=h('div');
    const frontRows=[],hostRows={};
    const frontPanel=h('div',{class:'sdl-panel'},h('div',{class:'ph'},'前置队列 f1–f3：先抓谁'),h('p',{class:'wc-flow'},'Prioritizer 按页面重要性分入三档；选择器按 6 : 3 : 1 加权随机挑队列。'));
    ['f1 高','f2 中','f3 低'].forEach((l,i)=>{const box=h('div',{class:'wc-chips'}),more=h('span',{class:'wc-more'});frontRows.push({box,more});frontPanel.append(h('div',{class:'wc-row'},h('div',{class:'wc-lbl'},l,h('small',null,['首页','普通页','镜像/参数/日历'][i])),h('div',{class:'wc-chips'},box,more)))});
    const backPanel=h('div',{class:'sdl-panel'},h('div',{class:'ph'},'后置队列 b1–b4：按主机排队，何时能抓'));
    const backNote=h('p',{class:'wc-flow'});backPanel.append(backNote);
    for(const [hn,desc,color] of HOSTS){
      const box=h('div',{class:'wc-chips'}),conn=h('span',{class:'wc-conn'}),cool=h('i'),coolTxt=h('span');
      hostRows[hn]={box,conn,cool,coolTxt};
      backPanel.append(h('div',{class:'wc-row'},h('div',{class:'wc-lbl'},h('span',{style:{color}},'■ '),hn,h('small',null,desc)),
        h('div',{class:'wc-host'},box,h('div',{class:'wc-meta'},h('span',null,'下载中 '),conn,h('span',null,'· 冷却'),h('span',{class:'wc-cool'},cool),coolTxt))));
    }
    const clockEl=h('span',{style:{float:'right',fontWeight:'650',color:'#2f6fb3',fontVariantNumeric:'tabular-nums'}});
    const workerBox=h('div',{class:'wc-workers'});let workerEls=[];
    const doneBox=h('div',{class:'wc-chips'}),doneMore=h('span',{class:'wc-more'});
    const sets=h('p',{class:'wc-sets'});
    wrap.append(h('div',{class:'wc-top'},frontPanel,backPanel),
      h('div',{class:'sdl-panel',style:{marginTop:'12px'}},h('div',{class:'ph'},'下载 worker：DNS 解析 + 下载 HTML',clockEl),workerBox),
      h('div',{class:'sdl-panel',style:{marginTop:'12px'}},h('div',{class:'ph'},'已下载页面：解析 → 内容去重 → 提取链接 → URL 过滤与去重 → 回到前置队列'),h('div',{class:'wc-chips'},doneMore,doneBox),
        h('div',{class:'wc-legend'},h('span',null,h('span',{class:'wc-chip ok',style:{'--hc':'#9fcdb0'}},'新内容')),h('span',null,h('span',{class:'wc-chip dup',style:{'--hc':'#e2c48c'}},'重复，已丢弃')),h('span',null,h('span',{class:'wc-chip dupstore',style:{'--hc':'#e2c48c'}},'重复也存了')),h('span',null,h('span',{class:'wc-chip trap',style:{'--hc':'#e7aaa4'}},'陷阱页'))),sets));
    ctx.stage.append(wrap);
    ctx.onResize(w=>wrap.classList.toggle('wc-narrow',w<700));
    const stats=ctx.stats([{key:'dl',label:'下载次数'},{key:'valid',label:'有效新页面'},{key:'dup',label:'重复：丢弃/存下'},{key:'trap',label:'陷阱页面'},{key:'conn',label:'单主机最大并发'},{key:'busy',label:'worker 忙碌率'}]);

    const chipEls=new Map();
    function chip(t,cls){let el=chipEls.get(t.id);if(!el){el=h('span',{class:'wc-chip',style:{'--hc':HC[t.host]},title:`${t.url}（深度 ${t.depth}）`},t.url);chipEls.set(t.id,el)}el.className='wc-chip'+(cls?' '+cls:'');return el}
    function place(box,more,tasks,max){box.replaceChildren(...tasks.slice(0,max).map(t=>chip(t)));more.textContent=tasks.length>max?`+${tasks.length-max}`:'';if(!tasks.length)box.append(h('span',{class:'wc-empty'},'空'))}
    function buildWorkers(){workerBox.replaceChildren();workerEls=workers.map((w,i)=>{const slot=h('div',{class:'wc-slot'}),bar=h('i'),st=h('span',{class:'st'});workerBox.append(h('div',{class:'wc-worker'},h('div',{class:'top'},h('span',null,'W'+(i+1)),st),slot,h('div',{class:'wc-bar'},bar)));return {slot,bar,st}})}
    function render(){
      const first=new Map();for(const [id,el] of chipEls)if(el.isConnected)first.set(id,el.getBoundingClientRect());
      F.forEach((q,i)=>place(frontRows[i].box,frontRows[i].more,q,narrow?4:6));
      for(const [hn] of HOSTS){const r=hostRows[hn];place(r.box,{set textContent(v){}},B[hn],BACK_CAP);r.box.classList.toggle('wc-off',!P.polite)}
      backNote.textContent=P.polite?'队列选择器只挑「没有请求在途、冷却已结束」的主机；同一主机的页面顺序下载。':'礼貌已关闭：worker 直接从前置队列取 URL，不看主机。';
      workers.forEach((w,i)=>{const e=workerEls[i];if(w.task)e.slot.replaceChildren(chip(w.task));else e.slot.replaceChildren()});
      const shown=done.slice(-(narrow?12:24)).reverse();
      doneBox.replaceChildren(...shown.map(t=>chip(t,t.st)));doneMore.textContent=done.length>shown.length?`最近 ${shown.length} 个（共 ${done.length}）`:'';
      if(!done.length)doneBox.append(h('span',{class:'wc-empty'},'还没有'));
      sets.textContent=`URL Seen 集合 ${seenUrl.size} 条 · Content Seen 指纹 ${seenContent.size} 个 · 已见而跳过 ${S.seenSkip} 次 · 深度规则拦下 ${S.cutDepth} 次 · 长度规则拦下 ${S.cutLen} 次`+(S.drop?` · Frontier 满而丢弃 ${S.drop} 个`:'');
      for(const [id,el] of chipEls){
        if(!el.isConnected){chipEls.delete(id);continue}
        const f=first.get(id);
        if(!f){el.animate([{opacity:0,transform:'scale(.7)'},{opacity:1,transform:'none'}],{duration:240,easing:'ease-out'});continue}
        const r=el.getBoundingClientRect(),dx=f.left-r.left,dy=f.top-r.top;
        if(Math.abs(dx)+Math.abs(dy)>1)el.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'none'}],{duration:360,easing:'cubic-bezier(.2,.7,.3,1)'});
      }
      dirty=false;
    }
    function live(){
      workers.forEach((w,i)=>{const e=workerEls[i];if(!e)return;
        if(w.task){e.bar.style.width=util.clamp((now-w.start)/(w.end-w.start),0,1)*100+'%';e.st.textContent='下载中';e.st.className='st'}
        else{e.bar.style.width='0';const waiting=P.polite&&backN()>0;e.st.textContent=finished?'完成':waiting?'等待：主机在途或冷却':frontN()?'等待分派':'空闲：没有任务';e.st.className='st'+(waiting&&!finished?' warn':'')}});
      for(const [hn] of HOSTS){const r=hostRows[hn],hs=H[hn],left=Math.max(0,hs.next-now);r.conn.textContent=hs.conn;r.conn.className='wc-conn'+(hs.conn>1?' bad':'');r.cool.style.width=(P.polite&&!finished?util.clamp(left/DELAY,0,1)*100:0)+'%';r.coolTxt.textContent=P.polite&&!finished&&left>0?left.toFixed(1)+' 秒':''}
      clockEl.textContent=(finished?'用时 ':'模拟时间 ')+(S.end??now).toFixed(1)+' 秒';
      stats.set('dl',S.dl);stats.set('valid',S.valid,'ok');
      stats.set('dup',`${S.dupDrop} / ${S.dupStore}`,S.dupStore?'bad':S.dupDrop?'warn':null);
      stats.set('trap',S.trap,S.trap>5?'bad':S.trap?'warn':null);
      stats.set('conn',S.maxConn,S.maxConn>1?'bad':'ok');
      stats.set('busy',totT?util.pct(busyT/totT,0):'—');
    }
    let narrow=false;ctx.onResize(w=>{const n=w<600;if(n!==narrow){narrow=n;dirty=true}});
    let acc=0,simAcc=0;
    const STEP=0.05;
    const lp=ctx.loop(dt=>{
      // 固定步长推进模拟：结果与帧率无关，场景每次运行一致
      if(P.speed&&!finished){simAcc+=dt*P.speed;while(simAcc>=STEP-1e-9&&!finished){tick(STEP);simAcc-=STEP}}
      acc+=dt;if(acc>=1/30||finished){acc=0;if(dirty)render();live()}
    });
    function restart(keep){if(!keep)P.cap=0;reset();simAcc=0;buildWorkers();render();live();lp.start()}
    restart();

    /* ---- 预设场景 ---- */
    async function prepare(o){
      Object.assign(P,{workers:3,polite:true,udedup:true,cdedup:true,depth:5,len:true,speed:4,cap:0},o);
      wCtl.set(P.workers,true);dCtl.set(P.depth,true);pCtl.set(P.polite,true);uCtl.set(P.udedup,true);cCtl.set(P.cdedup,true);lCtl.set(P.len,true);speedCtl.set(P.speed,true);
      restart(true);ctx.openLog(false);
    }
    async function untilDone(maxMs=16000){let t=0;while(!finished&&t<maxMs){await ctx.wait(200);t+=200}await ctx.wait(400)}
    const summary=()=>`下载 ${S.dl} 次、有效新页面 ${S.valid}、重复丢弃 ${S.dupDrop} / 存下 ${S.dupStore}、陷阱页 ${S.trap}、用时 ${(S.end??now).toFixed(1)} 秒`;
    ctx.scenarios([
      {id:'url-dedup',label:'关掉 URL 去重',
        ask:'页面之间有环（a.com/ ↔ a.com/p2，b.org/ ↔ b.org/w2 …）。关掉 URL 去重、保留内容去重，会无限循环吗？下载次数和有效新页面分别是多少？',
        insight:'没有无限循环：重复下载的页面在「内容是否已见」这一步被认出，不再提取链接，环路就断了。代价是下载 28 次（两道去重都开时只要 16 次），其中 16 次拿到的是已见内容，用时 20.1 秒，约为正常的两倍。URL 去重省的是下载和目标站点的压力；两道都关时，同一批页面会被反复下载、反复存储。',
        async run(){await prepare({udedup:false});await untilDone();ctx.log('本次：'+summary(),'info')}},
      {id:'content-dedup',label:'关掉内容去重',
        ask:'a.com/p1?utm=share 与 a.com/p1 内容相同，mirror.net 整站镜像 a.com。保留 URL 去重、关掉内容去重，会多存几份重复内容？',
        insight:'多存了 5 份重复内容：a.com/p1?utm=share 与 a.com/p1 是同一页，mirror.net 的 4 个页面与 a.com 的 4 个页面一一重复。关掉内容去重后，镜像首页的链接也被提取，mirror.net/p1、p2 跟着被发现、下载、存储。URL 去重拦不住它们，因为这些 URL 各不相同。精确哈希也只能认出一模一样的页面，只改了一行广告的近似重复要另想办法。',
        async run(){await prepare({cdedup:false});await untilDone();ctx.log('本次：'+summary(),'info')}},
      {id:'politeness',label:'加 worker 能快几倍',
        ask:'礼貌规则要求同一主机同时只有 1 个请求、两次间隔 1 秒，一共只有 4 个主机。worker 从 2 个加到 6 个，抓完的时间会缩短到 1/3 吗？',
        insight:'几乎没有变快：2 个 worker 用时 10.1 秒，6 个 worker 用时 9.9 秒，忙碌率从 62% 降到 21%，多出来的 worker 大多在等主机冷却。礼貌约束下，吞吐上限大约是「可抓的主机数 ÷（单次下载 + 间隔）」，与线程数无关。关掉礼貌后 6 个 worker 只用 4.0 秒，但单个主机同时挨了 3 个请求：快是以压垮站点为代价的。',
        async run(){
          const res=[];
          for(const [n,pol] of [[2,true],[6,true],[6,false]]){await prepare({workers:n,polite:pol});await untilDone();res.push(`${n} 个 worker、礼貌${pol?'开':'关'}：用时 ${S.end.toFixed(1)} 秒，忙碌率 ${util.pct(busyT/totT,0)}，单主机最大并发 ${S.maxConn}`)}
          ctx.log(res.join('；'),'info');ctx.openLog(true);
        }},
      {id:'trap',label:'无限日历陷阱',
        ask:'cal.io 每一页都链接到「下个月」，URL 长度始终不变。只保留 URL 长度上限、不限深度，能挡住它吗？换成深度上限 5 呢？',
        insight:'长度规则一次也没触发：日历 URL 始终只有 22 个字符。不限深度时，下载到第 30 次暂停，其中 18 页是 cal.io，而且还会继续增长；内容去重认不出它们，因为每个月的页面内容都不同。优先级把日历压在 f3，只能推迟、不能阻止。深度上限 5 时只抓了 4 个 cal.io 页面，9.9 秒抓完。实际还要配合抓取预算、站点配额和参数归一化。',
        async run(){
          await prepare({depth:0,cap:30});await untilDone();P.cap=0;const a=`不限深度：${summary()}`;
          await prepare({depth:5});await untilDone();ctx.log(a+'；深度上限 5：'+summary(),'info');ctx.openLog(true);
        }},
    ]);
  }
});
})();
