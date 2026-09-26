/* 第 3 章：系统设计面试框架。实验一是可计时的 45 分钟 / 5 分钟 / 90 秒练习；实验二演示 Feed 题的需求答案怎样改变架构。 */
(function(){
const {el:h,util}=SDLab;
const mmss=s=>{s=Math.max(0,Math.floor(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};

/* ---------------- 实验一：面试节奏练习 ---------------- */
const QS=[
  {id:'feed',name:'设计一个新闻 Feed 系统',ref:'第 11 章',ask:['Feed 按时间倒序，还是要个性化推荐？','DAU 多少？每人最多多少好友，有没有百万粉丝的名人？','只有文字，还是含图片和视频？'],deep:'Feed 发布（扇出）和获取流程'},
  {id:'url',name:'设计一个短链接服务',ref:'第 8 章',ask:['每天生成多少短链？读写比多少？','短链要多短？能否自定义、会不会过期？','同一个长链接要不要返回同一个短链？'],deep:'哈希函数 / ID 生成与冲突处理'},
  {id:'chat',name:'设计一个聊天系统',ref:'第 12 章',ask:['一对一还是群聊？群最多多少人？','要不要在线状态和多设备同步？','消息保存多久？要不要支持离线消息？'],deep:'降低消息延迟，处理在线 / 离线状态'},
  {id:'rl',name:'设计一个限流器',ref:'第 4 章',ask:['在服务端还是客户端限流？按 IP、用户还是接口？','单机还是多台网关共享配额？规模多大？','超限时怎样告知用户？'],deep:'限流算法选择与多实例原子计数'},
];
const PH=[
  {name:'理解问题、确定范围',short:'需求',rec:[3,10],plan:8,items:['核心功能和用户','规模：DAU、读写比、峰值','一致性与可用性要求','核心 API（读、写接口）']},
  {name:'高层设计、取得共识',short:'蓝图',rec:[10,15],plan:12,items:['写入路径','读取路径','容量量级：QPS、存储','向面试官确认方向']},
  {name:'深入设计',short:'深挖',rec:[10,25],plan:20,items:['关键数据的主键与访问模式','容量上限与故障模式','丢失、重复、延迟的后果','何时升级、怎样迁移']},
  {name:'收尾',short:'收尾',rec:[3,5],plan:5,items:['重述目标与范围','走一遍写路径和读路径','两个最重要的取舍','最大瓶颈与一个故障防护','升级条件与验证计划']},
];
const WRAP=[
  ['重述目标与核心假设','我们已覆盖发帖、按时间拉取和媒体访问；推荐排序留在范围外。'],
  ['沿图走写路径和读路径','发帖以主存提交为准返回成功；普通用户异步推送帖子 ID，读侧聚合正文，缓存未命中回源。'],
  ['两个最重要的取舍','预计算 Feed 换低读延迟，代价是扇出写和短暂传播延迟；名人读时合并，读侧多算一步。'],
  ['最大瓶颈与一个故障防护','头部用户扇出会让队列积压：监控最老消息年龄，名人读时合并，限速重放。'],
  ['升级条件与验证计划','数据库或分片达到实测容量阈值才拆分；上线前演练重放、故障切换和缓存全失效。'],
].map(([t,ex])=>({t,ex,dur:60}));
const PITCH=[
  ['需求','谁要什么？',15,'好友动态、按时间倒序、支持图文、允许秒级传播；暂不做推荐。'],
  ['路径','请求怎么走？',25,'发帖先写数据库，再可靠地产生扇出任务，把帖子 ID 推进粉丝收件箱；读取先取 ID 列表再聚合正文，图片走对象存储和 CDN。'],
  ['瓶颈','哪里先卡？',15,'名人的大量粉丝，以及缓存失效后的回源；监控扇出积压、热点分片和读延迟。'],
  ['取舍','为什么接受代价？',20,'普通用户写时推送换低读延迟，名人读时合并接受额外计算；发布成功只表示帖子已保存。'],
  ['演进','什么证据触发升级？',15,'起步用单库和无状态服务；实测到容量上限才加读副本、分片或调整扇出。'],
].map(([t,q,dur,ex])=>({t,q,dur,ex}));
SDLab.define({
  id:'interview-drill',chapter:3,
  title:'面试节奏练习：45 分钟、最后 5 分钟、90 秒',
  summary:'选一道题，点「开始」后按自己的节奏讲，讲完一步就点「下一步」，边讲边勾清单。时间轴对照本章的建议分配，第 10、20、40 分钟的检查点会告诉你是否跑偏。',
  caveat:'建议时长取自本章：需求 3–10、蓝图 10–15、深挖 10–25、收尾 3–5 分钟；检查点取自「实用计时点」批注，收尾五步取自第 29 章 Q03-04，90 秒分段取自 Q03-05。计时按浏览器时钟，页面滚走也继续；勾选和用时只保存在当前页面。示范文本只提供新闻 Feed 版。',
  mount(ctx){
    const C=ctx.colors,COL=[C.series[0],C.series[1],C.series[2],C.series[3],C.series[4]];
    ctx.css('ivd',`
.ivd-q{display:flex;flex-direction:column;gap:4px}
.ivd-q .t{font-size:16px;font-weight:700}
.ivd-q details{font-size:13px}.ivd-q summary{cursor:pointer;color:#176b52}
.ivd-q ol{margin:4px 0 0;padding-left:20px}
.ivd-clock{display:flex;align-items:baseline;gap:6px 14px;flex-wrap:wrap;margin:12px 0 2px}
.ivd-clock .big{font-size:34px;font-weight:750;font-variant-numeric:tabular-nums;line-height:1.1}
.ivd-clock .of{color:#66756d;font-size:14px}
.ivd-clock .cur{font-size:15px;font-weight:650}
.ivd-clock .cur small{font-weight:400;color:#66756d;font-size:13px}
.ivd-tl{position:relative;padding-top:24px;margin:4px 0 2px}
.ivd-row{display:grid;grid-template-columns:36px minmax(0,1fr);align-items:center;margin:4px 0}
.ivd-row>span{font-size:12px;color:#66756d}
.ivd-bar{position:relative;height:26px;border-radius:6px;background:#f0f4ed;overflow:hidden;display:flex}
.ivd-bar>span{height:100%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:650;overflow:hidden;white-space:nowrap;border-right:2px solid #fff;min-width:0}
.ivd-act>span{position:absolute;top:0;color:#fff;border-right:0}
.ivd-now{position:absolute;top:0;bottom:0;width:2px;background:#23352f}
.ivd-cps{position:absolute;left:36px;right:0;top:0;bottom:0;pointer-events:none}
.ivd-cp{position:absolute;top:18px;bottom:0;border-left:1.5px dashed #9fb0a5}
.ivd-cp b{position:absolute;top:-18px;transform:translateX(-50%);font-size:12px;white-space:nowrap;padding:0 6px;border-radius:6px;background:#e6eee2;color:#4f5f57;font-weight:650}
.ivd-cp.ok b{background:#dcefe2;color:#1d6a41}.ivd-cp.warn b{background:#f6ead2;color:#86561a}.ivd-cp.bad b{background:#f7dedb;color:#9b2c27}
.ivd-cp.last b{transform:translateX(-85%)}
.ivd-axis{position:relative;height:16px;margin-left:36px;font-size:12px;color:#66756d}
.ivd-axis i{position:absolute;font-style:normal;transform:translateX(-50%);white-space:nowrap}
.ivd-axis i:first-child{transform:none}.ivd-axis i:last-child{transform:translateX(-100%)}
.ivd-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:10px}
.ivd-ph{border:1px solid #dbe2da;border-radius:10px;padding:8px 10px;background:#fbfcfa;font-size:13px;min-width:0}
.ivd-ph.cur{border-width:2px;background:#fff}
.ivd-ph h4{margin:0 0 4px;font-size:13px;display:flex;justify-content:space-between;gap:6px;border:0;padding:0}
.ivd-ph label{display:flex;gap:6px;align-items:flex-start;cursor:pointer;line-height:1.45;margin:3px 0}
.ivd-ph input{margin-top:3px;accent-color:#176b52}
.ivd-ph .ex{color:#4f5f57;margin:2px 0 0;font-size:13px}
.ivd-ph .q{color:#66756d}
.ivd-ph.done{opacity:.72}
`);
    let narrow=false,mode='full',qi=0,speed=1,running=false,since=0,base=0,p=0,starts=[0],ticks=new Map(),cpState={},ended=false,warned={};
    const segs=()=>mode==='wrap'?WRAP:mode==='pitch'?PITCH:PH;
    const total=()=>mode==='full'?2700:mode==='wrap'?300:90;
    const now=()=>Math.min(total(),running?base+(performance.now()-since)/1000*speed:base);
    const modeCtl=ctx.segmented({label:'练习方式',wide:true,value:mode,options:[['full','45 分钟全程'],['wrap','只剩 5 分钟：收口'],['pitch','90 秒陈述']],onChange:v=>{mode=v;restart()}});
    const qCtl=ctx.select({label:'题目',value:'feed',options:QS.map(q=>[q.id,q.name.replace('设计一个','')+'（'+q.ref+'）']),onChange:v=>{qi=QS.findIndex(q=>q.id===v);drawQ()}});
    const spCtl=ctx.segmented({label:'时钟速度',value:1,options:[[1,'实时'],[10,'10×'],[60,'60×']],onChange:v=>{base=now();since=performance.now();speed=v}});
    const startBtn=ctx.button('开始',()=>running?pause():start(),{primary:true});
    const nextBtn=ctx.button('下一步',()=>next());
    ctx.button('重来',()=>restart());
    const qBox=h('div',{class:'sdl-panel ivd-q'});
    const big=h('span',{class:'big'}),of=h('span',{class:'of'}),cur=h('span',{class:'cur'});
    const planBar=h('div',{class:'ivd-bar'}),actBar=h('div',{class:'ivd-bar ivd-act'}),nowMark=h('i',{class:'ivd-now'}),cps=h('div',{class:'ivd-cps'}),axis=h('div',{class:'ivd-axis'});
    actBar.append(nowMark);
    const grid=h('div',{class:'ivd-grid'});
    const tbl=h('table',{class:'sdl-table'}),tblBox=h('div',{class:'sdl-scroll',style:{marginTop:'10px'}},tbl);
    ctx.stage.append(qBox,h('div',{class:'ivd-clock','aria-live':'off'},big,of,cur),h('div',{class:'ivd-tl'},h('div',{class:'ivd-row'},h('span',null,'建议'),planBar),h('div',{class:'ivd-row'},h('span',null,'实际'),actBar),cps),axis,grid,tblBox);
    const stats=ctx.stats([{key:'t',label:'已用时间'},{key:'ph',label:'当前步骤'},{key:'cp',label:'检查点'},{key:'ck',label:'清单'}]);
    const CPS=[
      {t:600,label:'10 分',ok:()=>ticks.has('0-3')&&[0,1,2,3].filter(i=>ticks.has('0-'+i)).length>=3,
        pass:'需求和核心 API 已就位',fail:()=>ticks.has('0-3')?`需求清单只有 ${cnt(0)}/4：规模、一致性这些假设还没写下，后面的容量和取舍没有依据。`:`还没写下核心 API（需求清单 ${cnt(0)}/4）。用一句话复述范围，补上读写接口再进蓝图。`},
      {t:1200,label:'20 分',ok:()=>ticks.has('1-0')&&ticks.has('1-1')&&ticks.has('1-2'),
        pass:'高层图和容量量级已有',fail:()=>'还没有读写路径和容量量级。深挖之前先把高层图画完，并和面试官确认方向。'},
      {t:2400,label:'40 分',last:true,ok:()=>p===3,pass:'已停止加组件、进入收尾',fail:()=>'还在「'+PH[p].short+'」。停止新增组件，进入收尾：重述目标、走读写路径、讲取舍和故障。',bad:true},
    ];
    const cnt=i=>PH[i].items.filter((_,j)=>ticks.has(i+'-'+j)).length;
    function drawQ(){
      const q=QS[qi];
      qBox.replaceChildren(...[h('span',{class:'t'},q.name),
        mode==='full'?h('details',null,h('summary',null,'卡住时看：三个会改变设计的澄清问题'),h('ol',null,q.ask.map(a=>h('li',null,a)))):null,
        h('span',{class:'sdl-note',style:{margin:0}},mode==='full'?'本章建议的深挖重点：'+q.deep:mode==='wrap'?'假设已经讲到第 40 分钟，用 5 分钟收口。下面每一分钟做一件事。':'把整道题压成 90 秒：每段回答一个问题，只保留一条主线。')].filter(Boolean));
    }
    function build(){
      const S=segs(),T=total();
      planBar.replaceChildren(...S.map((s,i)=>{const d=mode==='full'?s.plan*60:s.dur;return h('span',{style:{width:(d/T*100)+'%',background:COL[i]+'2e',color:COL[i]}},(mode==='full'?s.short+(narrow?'':' '+s.plan+'′'):mode==='wrap'?(i+1)+'′':s.t+(narrow?'':' '+s.dur+'″')))}));
      cps.replaceChildren(...(mode==='full'?CPS.map(c=>{const el=h('div',{class:'ivd-cp'+(c.last?' last':''),style:{left:(c.t/T*100)+'%'}},h('b',null,c.label));c.el=el;return el}):[]));
      const marks=mode==='full'?[0,10,20,30,40,45]:mode==='wrap'?[0,1,2,3,4,5]:[0,15,40,55,75,90];
      axis.replaceChildren(...marks.map(m=>h('i',{style:{left:((mode==='full'||mode==='wrap'?m*60:m)/T*100)+'%'}},mode==='pitch'?m+'″':m+'′')));
      drawGrid();
    }
    function drawGrid(){
      const S=segs(),ci=curIdx();
      grid.replaceChildren(...S.map((s,i)=>{
        const box=h('div',{class:'ivd-ph'+(i===ci?' cur':'')+(i<ci?' done':''),style:{borderColor:i===ci?COL[i]:null}});
        if(mode==='full'){
          box.append(h('h4',null,h('span',{style:{color:COL[i]}},(i+1)+' '+s.name),h('span',{class:'sdl-note',style:{margin:0}},s.rec.join('–')+' 分')));
          s.items.forEach((it,j)=>{const k=i+'-'+j,cb=h('input',{type:'checkbox',checked:ticks.has(k)});cb.onchange=()=>setTick(k,cb.checked);box.append(h('label',null,cb,h('span',null,it,ticks.has(k)?h('span',{class:'sdl-note'},' '+mmss(ticks.get(k))):null)))});
        }else{
          const d=mode==='wrap'?'第 '+(i+1)+' 分钟':s.dur+' 秒';
          box.append(h('h4',null,h('span',{style:{color:COL[i]}},(mode==='wrap'?s.t:s.t+'：'+s.q)),h('span',{class:'sdl-note',style:{margin:0}},d)));
          if(QS[qi].id==='feed')box.append(h('p',{class:'ex'},'示范：'+s.ex));
        }
        return box;
      }));
    }
    function setTick(k,on,t){if(on){ticks.set(k,t??now());const [i,j]=k.split('-').map(Number);ctx.log(mmss(ticks.get(k))+' ✓ '+PH[i].items[j],'ok')}else ticks.delete(k);drawGrid();refresh()}
    function curIdx(t=now()){if(mode==='full')return p;let acc=0;const S=segs();for(let i=0;i<S.length;i++){acc+=S[i].dur;if(t<acc)return i}return S.length-1}
    let lastIdx=-1;
    function refresh(){
      const t=now(),T=total(),S=segs(),ci=curIdx(t);
      big.textContent=mmss(t);of.textContent='/ '+mmss(T);
      if(mode==='full'){
        const pt=t-starts[p],r=PH[p].rec;cur.replaceChildren(PH[p].short+' · '+mmss(pt),h('small',null,`（建议 ${r[0]}–${r[1]} 分钟）`));
        if(!ended&&pt>r[1]*60&&!warned[p]){warned[p]=1;ctx.log(`${mmss(t)} 「${PH[p].short}」已超过建议上限 ${r[1]} 分钟`,'warn')}
        // 实际分段
        const segsEl=[...actBar.querySelectorAll('span')];
        for(let i=0;i<4;i++){
          let el=segsEl[i];if(!el){el=h('span',{style:{background:COL[i]}},PH[i].short);actBar.insertBefore(el,nowMark)}
          const s=starts[i],e=i<p?starts[i+1]:t;
          if(s==null||i>p){el.style.width='0';continue}
          const wp=Math.max(0,(e-s)/T*100);el.style.left=(s/T*100)+'%';el.style.width=wp+'%';el.textContent=wp>=(narrow?14:6)?PH[i].short:'';
        }
        for(const c of CPS){if(t>=c.t&&!cpState[c.t]){const ok=c.ok();cpState[c.t]=ok?'ok':c.bad?'bad':'warn';ctx.log(`${mmss(c.t)} 检查点${ok?'通过：'+c.pass:'：'+c.fail()}`,cpState[c.t])}if(c.el)c.el.className='ivd-cp'+(c.last?' last':'')+(cpState[c.t]?' '+cpState[c.t]:'')}
      }else{
        const s0=S.slice(0,ci).reduce((a,s)=>a+s.dur,0);cur.replaceChildren((mode==='wrap'?S[ci].t:S[ci].t+'：'+S[ci].q)+' · ',h('small',null,'本段还剩 '+mmss(s0+S[ci].dur-t)));
        const els=[...actBar.querySelectorAll('span')];let a0=0;
        S.forEach((s,i)=>{let el=els[i];if(!el){el=h('span',{style:{background:COL[i]}});actBar.insertBefore(el,nowMark)}const w=Math.max(0,Math.min(t,a0+s.dur)-a0);el.style.left=(a0/T*100)+'%';el.style.width=(w/T*100)+'%';a0+=s.dur});
        if(ci!==lastIdx){lastIdx=ci;drawGrid();if(t<T)ctx.log(`${mmss(s0)} ${mode==='wrap'?'第 '+(ci+1)+' 分钟：'+S[ci].t:S[ci].t+'（'+S[ci].dur+' 秒）：'+S[ci].q}`,'info')}
      }
      nowMark.style.left=`calc(${t/T*100}% - 1px)`;
      const done=Object.values(cpState).filter(v=>v==='ok').length,all=Object.keys(cpState).length;
      stats.set('t',mmss(t),t>=T?'warn':'info');
      stats.set('ph',mode==='full'?(p+1)+' / 4 '+PH[p].short:(ci+1)+' / '+S.length+' '+S[ci].t,null);
      stats.set('cp',mode==='full'?(all?done+' / '+all+' 通过':'还没到'):'—',mode!=='full'||!all?null:done===all?'ok':'bad');
      const tk=PH.reduce((s,_,i)=>s+cnt(i),0);stats.set('ck',mode==='full'?tk+' / 17':'—',null);
      if(mode==='full')drawTable(t);
      if(t>=T&&!ended){ended=true;pause();finish()}
    }
    function drawTable(t){
      tbl.replaceChildren(h('thead',null,h('tr',null,h('th',null,'步骤'),h('th',null,'建议'),h('th',null,'实际用时'),h('th',null,'清单'))),
        h('tbody',null,PH.map((s,i)=>{const st=starts[i],d=st==null||i>p?null:(i<p?starts[i+1]:t)-st;const bad=d!=null&&(i<p||ended)&&(d<s.rec[0]*60||d>s.rec[1]*60);
          return h('tr',null,h('td',null,(i+1)+' '+s.short),h('td',null,s.rec.join('–')+' 分'),h('td',{style:{color:bad?C.warn:null,fontWeight:bad?'700':null}},d==null?'—':mmss(d)),h('td',null,cnt(i)+' / '+s.items.length))})));
    }
    function finish(){
      if(mode==='full'){const ok=Object.values(cpState).filter(v=>v==='ok').length;ctx.log(`45:00 结束：检查点 ${ok}/3 通过，清单 ${PH.reduce((s,_,i)=>s+cnt(i),0)}/17。${p<3?'没有留出收尾时间。':''}`,ok===3?'ok':'warn');ctx.openLog()}
      else ctx.log(mode==='wrap'?'5 分钟到：面试官还有问题的话，停在这里回答。':'90 秒到。录音回听：每段有没有回答它的问题？','info');
      ctx.announce('练习时间到');
    }
    let acc=0;const lp=ctx.loop(dt=>{acc+=dt;if(acc<.2)return;acc=0;if(running)refresh()},false);
    function start(){if(ended)restart();if(mode!=='full'&&now()===0)lastIdx=-1;running=true;since=performance.now();startBtn.textContent='暂停';lp.start()}
    function pause(){base=now();running=false;startBtn.textContent=ended?'开始':'继续';lp.stop();refresh()}
    function next(){
      const t=now();
      if(mode==='full'){
        if(p>=3)return;
        if(p===1&&(t-starts[1]<180||cnt(1)<2))ctx.log(`${mmss(t)} 蓝图只用了 ${mmss(t-starts[1])}、清单 ${cnt(1)}/4 就开始深挖：假设没对齐，深挖越多返工越多`,'warn');
        p++;starts[p]=t;ctx.log(`${mmss(t)} 进入「${PH[p].short}」`,'info');drawGrid();refresh();
      }else{const S=segs(),ci=curIdx(t);if(ci>=S.length-1)return;base=S.slice(0,ci+1).reduce((a,s)=>a+s.dur,0);since=performance.now();refresh()}
    }
    function restart(){running=false;lp.stop();base=0;p=0;starts=[0];ticks=new Map();cpState={};ended=false;warned={};lastIdx=0;actBar.querySelectorAll('span').forEach(s=>s.remove());startBtn.textContent='开始';tblBox.hidden=mode!=='full';nextBtn.textContent=mode==='full'?'下一步':'跳到下一段';ctx.clearLog();drawQ();build();refresh()}
    ctx.onResize(w=>{const n=w<520;if(n!==narrow){narrow=n;build();refresh()}});
    restart();

    /* ---- 场景：脚本化回放（按实验时钟推进，不用浏览器时钟） ---- */
    async function replay(m,events,end,step,ms){
      modeCtl.set(m,true);mode=m;qCtl.set('feed',true);qi=0;restart();ctx.openLog();lastIdx=-1;
      const ev=[...events].sort((a,b)=>a[0]-b[0]);let i=0;
      for(let t=0;t<=end;t+=step){
        while(i<ev.length&&ev[i][0]<=t){const [et,fn]=ev[i++];base=et;fn()}
        base=t;refresh();await ctx.wait(ms);
      }
      base=end;refresh();
    }
    const tk=(t,k)=>[t,()=>setTick(k,true,t)],go=t=>[t,()=>next()],say=(t,s,tone)=>[t,()=>ctx.log(mmss(t)+' '+s,tone)];
    ctx.scenarios([
      {id:'early-deep',label:'一上来就深挖数据库',
        ask:'候选人 2 分钟问完需求，只画了 1 分钟框图就开始设计表结构和索引。第 10、20、40 分钟三个检查点会有几个通过？',
        insight:'一个都没过。10 分钟时核心 API 还没写；20 分钟时没有读写路径和容量量级；26 分钟面试官补充「要个性化推荐」，按时间倒序设计的索引要返工；40 分钟还在深挖，最后没有收尾。高层共识确认的是范围和数据流，基础假设错了，数据库细节越深返工越多。',
        run:()=>replay('full',[tk(40,'0-0'),tk(100,'0-1'),go(120),go(180),tk(420,'2-0'),say(700,'还在给帖子表加索引、讨论字段类型','warn'),say(1560,'面试官：其实要个性化推荐排序。按时间倒序设计的索引要返工','bad'),tk(1900,'2-1'),say(2300,'又加了一个搜索服务','warn')],2700,30,150)},
      {id:'paced',label:'按建议节奏走完 45 分钟',
        ask:'按 8 / 11 / 21 / 5 分钟分配四步，边讲边勾清单。三个检查点能全过吗？深挖只有 20 分钟左右，够用吗？',
        insight:'三个检查点全部通过：8 分钟时需求和 API 已写下，19 分钟时读写路径和容量量级都有，第 40 分钟准时进入收尾。深挖 20 分钟只够讲透一两个关键组件，所以要在蓝图阶段请面试官指出最想深入的瓶颈；收尾的五件事每件约一分钟。',
        run:()=>replay('full',[tk(60,'0-0'),tk(150,'0-1'),tk(240,'0-2'),tk(400,'0-3'),go(480),tk(600,'1-0'),tk(720,'1-1'),tk(900,'1-2'),tk(1080,'1-3'),go(1140),tk(1400,'2-0'),tk(1700,'2-1'),tk(2000,'2-2'),tk(2250,'2-3'),go(2400),tk(2430,'3-0'),tk(2490,'3-1'),tk(2550,'3-2'),tk(2610,'3-3'),tk(2670,'3-4')],2700,30,150)},
      {id:'wrap5',label:'只剩 5 分钟怎么收口',
        ask:'第 40 分钟，你还想给 Feed 加搜索和推荐服务。剩下 5 分钟该怎样分配？',
        insight:'停止扩张，一分钟一件事：先重述目标和范围，再沿图走写路径和读路径（何时持久化、何时返回成功），然后讲两个最重要的取舍、当前最大瓶颈和一个故障防护，最后给出升级条件和验证计划，留出追问时间。收尾是证明方案能跑通、取舍明确，不是再发明第十个服务。',
        run:()=>replay('wrap',[say(0,'第 40 分钟：不再加搜索服务，开始收口','info')],300,5,250)},
      {id:'pitch90',label:'90 秒讲完一道题',
        ask:'只给 90 秒讲新闻 Feed。需求、路径、瓶颈、取舍、演进各分多少秒？',
        insight:'15 / 25 / 15 / 20 / 15 秒。路径最长，因为要讲清写入成功点和读写数据流；每段只回答一个问题：谁要什么、请求怎么走、哪里先卡、为什么接受代价、什么证据触发升级。练习时录音计时，删掉重复的形容词。',
        run:()=>replay('pitch',[],90,1,180)},
    ]);
  }
});

/* ---------------- 实验二：需求怎样改变架构 ---------------- */
const FRIENDS=200,CELEB=1e6;
SDLab.define({
  id:'interview-scope',chapter:3,
  title:'新闻 Feed：需求答案怎样改变架构',
  summary:'在白板前先问清楚：怎么排、多少人、什么内容、多大规模。每改一个答案，受影响的路径会重新走一遍，新出现的组件会标出来；下面写着它为什么出现。',
  caveat:'假设每个日活每天发 1 条、刷新 10 次，平均 200 个好友或关注，峰值按平均的 2 倍，名人有 100 万粉丝。读时拉取按每次刷新查 200 个关注对象计。积压动画按高峰流量、30 倍速播放。组件清单是面试白板上的高层框图，不是唯一正确的方案。',
  mount(ctx){
    const C=ctx.colors;
    ctx.css('ivs',`
.ivs-lane{margin:0 0 10px}
.ivs-lane .nm{font-size:12px;font-weight:700;color:#66756d;margin:0 0 3px}
.ivs-chips{display:flex;flex-wrap:wrap;gap:4px 2px;align-items:center}
.ivs-chip{font-size:13px;border:1px solid #cdd8cf;border-radius:8px;padding:3px 9px;background:#fff;line-height:1.45}
.ivs-chip.new{border-color:#2f8f5b;background:#eef8f1}
.ivs-chip.new::after{content:'新';font-size:11px;margin-left:5px;color:#1d6a41;font-weight:700}
.ivs-chip.warn{border-color:#c2413b;background:#fbeceb;color:#9b2c27}
.ivs-chip.note{border-style:dashed;color:#4f5f57;background:#fbfcfa}
.ivs-ar{color:#9fb0a5;font-size:13px;padding:0 2px}
@keyframes ivs-wave{0%{box-shadow:0 0 0 0 #2f6fb300}30%{box-shadow:0 0 0 3px #2f6fb366}100%{box-shadow:0 0 0 0 #2f6fb300}}
.ivs-lane.run .ivs-chip{animation:ivs-wave .9s ease-out both;animation-delay:calc(var(--i) * .12s)}
.ivs-why{margin:6px 0 0;padding-left:18px;font-size:13px}
.ivs-why li{margin:3px 0}
.ivs-why li.hot{color:#124832;font-weight:600}
.ivs-q{margin-top:10px}
.ivs-q .bar{height:14px;border-radius:7px;background:#e6eee2;overflow:hidden;margin:4px 0}
.ivs-q .bar i{display:block;height:100%;width:0;background:#b7791f;border-radius:7px}
`);
    const S={sort:'time',follow:'cap',media:'text',dau:1e7,fan:'push',cap:5e4};
    const CAPS=[1e4,2e4,5e4,1e5,2e5,5e5,1e6];
    const seg=(k,label,opts)=>ctx.segmented({label,value:S[k],options:opts,onChange:v=>{const old=S[k];S[k]=v;update(k,old)}});
    const c={
      sort:seg('sort','排序',[['time','时间倒序'],['rank','个性化推荐']]),
      follow:seg('follow','关注关系',[['cap','好友上限 5,000'],['celeb','可关注名人']]),
      media:seg('media','内容',[['text','纯文本'],['image','图片'],['video','视频']]),
      dau:seg('dau','日活 DAU',[[1e5,'10 万'],[1e7,'1,000 万'],[1e8,'1 亿']]),
      fan:seg('fan','扇出策略（你的设计选择）',[['push','写时推送'],['pull','读时拉取'],['hybrid','混合：名人读时拉取']]),
    };
    const capCtl=ctx.slider({label:'扇出 Worker 总容量',min:0,max:CAPS.length-1,value:CAPS.indexOf(S.cap),format:v=>util.fmt(CAPS[v]/1e4)+' 万次/秒',onInput:v=>{S.cap=CAPS[v];update('cap')}});
    const celebBtn=ctx.button('名人发一条帖子（100 万粉丝）',()=>celebPost(),{primary:true});
    const lanesBox=h('div'),why=h('ol',{class:'ivs-why'}),qBox=h('div',{class:'sdl-panel ivs-q'});
    const qText=h('div',{class:'sdl-note',style:{margin:0}}),qFill=h('i');
    qBox.append(h('div',{class:'ph'},'扇出队列'),h('div',{class:'bar'},qFill),qText);
    ctx.stage.append(lanesBox,h('div',{class:'sdl-panel',style:{marginTop:'6px'}},h('div',{class:'ph'},'为什么是这些组件'),why),qBox);
    const stats=ctx.stats([{key:'post',label:'发帖（平均）'},{key:'fan',label:'收件箱写（峰值）'},{key:'read',label:'读 Feed（峰值）'},{key:'q',label:'扇出积压'}]);
    let prev=new Set(),backlog=0,simT=0;
    const calc=()=>{const posts=S.dau/86400,push=S.fan!=='pull',fanAvg=push?posts*FRIENDS:0,fanPk=fanAvg*2,readPk=S.dau*10/86400*2;return {posts,fanAvg,fanPk,readPk,pullQ:S.fan==='pull'?readPk*FRIENDS:0}};
    function lanes(){
      const celeb=S.follow==='celeb',small=S.dau<=1e5,big=S.dau>=1e8,push=S.fan!=='pull';
      const pub=['客户端发帖','API 服务',big?'帖子库（分片）':'帖子库'];
      if(push){if(small)pub.push('同步写好友收件箱');else pub.push('扇出队列','扇出 Worker'+(big?' ×N':''));pub.push('Feed 缓存（每人一份帖子 ID 列表）')}
      else pub.push({t:'发布即完成，不扇出',k:'note'});
      if(celeb&&S.fan==='push')pub.push({t:'名人发帖 = 100 万次收件箱写',k:'warn'});
      if(celeb&&S.fan==='hybrid')pub.push({t:'名人帖子不扇出',k:'note'});
      const rd=['客户端刷新','API 服务'];
      if(push)rd.push('从 Feed 缓存取帖子 ID');else rd.push(S.dau>=1e7?{t:'查 200 个关注对象的最新帖子再合并',k:'warn'}:'查关注对象的最新帖子再合并');
      if(celeb&&S.fan==='hybrid')rd.push('合并关注的名人帖子');
      if(S.sort==='rank')rd.push('候选召回','特征 + 排序服务');else rd.push('按（时间, ID）游标分页');
      rd.push('聚合正文（帖子缓存 → 帖子库）');
      if(S.media!=='text')rd.push(S.media==='video'?'CDN 取视频（按网速选清晰度）':'CDN 取图片');
      const L=[['发布路径',pub],['读取路径',rd]];
      if(S.media!=='text')L.push(['媒体路径',S.media==='video'?['客户端上传','对象存储','转码队列','转码 Worker','多清晰度文件','CDN',{t:'处理完成前显示「处理中」',k:'note'}]:['客户端上传','对象存储','CDN',{t:'帖子只存媒体引用',k:'note'}]]);
      return L.map(([n,cs])=>[n,cs.map(x=>typeof x==='string'?{t:x}:x)]);
    }
    function whyList(changed){
      const R=calc(),items=[
        ['sort',S.sort==='time'?'时间倒序：用时间和稳定 ID 组成游标，读取已物化的帖子 ID 列表。':'个性化推荐：多出候选召回、特征和排序计算，分页和缓存语义都更复杂；只要求时间排序时不要提前加。'],
        ['follow',S.follow==='cap'?'好友有上限：一条帖子最多写 5,000 个收件箱，写时推送的代价可控，换来快速读取。':'可关注名人：平均 200 个粉丝掩盖了头部用户，名人一次发布就是 100 万次写，通常改为名人读时拉取（混合扇出）。'],
        ['media',S.media==='text'?'纯文本：正文存业务数据库即可。':S.media==='image'?'图片：进对象存储、由 CDN 分发，帖子记录只存引用。':'视频：还要异步转码、生成多种清晰度；要定义上传后先显示占位，还是等处理完才可见。'],
        ['dau',S.dau<=1e5?`10 万日活：平均每秒约 ${util.fmt(R.posts,1)} 条帖子，单库加缓存足够，扇出可以同步做；这时分库分表只会带来迁移和运维负担。`:S.dau<1e8?`1,000 万日活：平均每秒约 ${util.fmt(R.posts)} 条帖子、每条 200 个接收者，发布后要用队列异步扇出，Feed 缓存只存 ID。`:`1 亿日活：平均每秒约 ${util.fmt(R.posts)} 条帖子，高峰每秒几十万次收件箱写，帖子库要分片，Worker 要横向扩展并监控积压。`],
        ['fan',S.fan==='push'?'写时推送：读最快，写入量 = 发帖数 × 粉丝数。':S.fan==='pull'?`读时拉取：发布最省，但每次刷新都要查 ${FRIENDS} 个关注对象再合并${S.dau>=1e7?'，高峰约 '+util.fmt(R.pullQ)+' 次查询/秒':''}。`:(S.follow==='celeb'?'混合：普通用户写时推送，名人读时拉取，把名人的写放大换成少量读时合并。':'混合：没有名人时，它和写时推送一样。')],
      ];
      why.replaceChildren(...items.map(([k,t])=>h('li',{class:k===changed?'hot':null},t)));
    }
    function update(changed,old){
      const L=lanes(),seen=new Set(),hot=changed&&changed!=='cap';
      lanesBox.replaceChildren(...L.map(([n,cs])=>{
        const box=h('div',{class:'ivs-lane'+(hot?' run':'')},h('p',{class:'nm'},n));const row=h('div',{class:'ivs-chips'});
        cs.forEach((x,i)=>{seen.add(n+x.t);if(i)row.append(h('span',{class:'ivs-ar','aria-hidden':'true'},x.k?'·':'→'));row.append(h('span',{class:'ivs-chip'+(x.k?' '+x.k:'')+(hot&&!prev.has(n+x.t)&&!x.k?' new':''),style:{'--i':i}},x.t))});
        box.append(row);return box;
      }));
      prev=seen;whyList(changed);
      const R=calc();
      stats.set('post',util.fmt(R.posts,R.posts<10?1:0)+' 条/秒',null);
      const u=R.fanPk/S.cap;
      stats.set('fan',S.fan==='pull'?'0（不扇出）':util.fmt(R.fanPk)+'/秒 · '+util.pct(u,0),S.fan==='pull'?null:u>1?'bad':u>.8?'warn':'ok');
      stats.set('read',S.fan==='pull'?util.fmt(R.pullQ)+' 查询/秒':util.fmt(R.readPk)+' 次/秒',S.fan==='pull'&&S.dau>=1e7?'bad':null);
      celebBtn.disabled=S.follow!=='celeb';celebBtn.title=S.follow!=='celeb'?'先把关注关系改成「可关注名人」':'';
      drawQ();
      if(changed&&changed!=='cap'&&old!=null){const nm={sort:'排序',follow:'关注关系',media:'内容',dau:'日活',fan:'扇出策略'}[changed];ctx.log(`${nm}改为「${c[changed].el.querySelector('[aria-pressed=true]').textContent}」`,'info')}
    }
    function drawQ(){
      const R=calc(),spare=S.cap-R.fanPk;
      qFill.style.width=Math.min(100,backlog/CELEB*100)+'%';qFill.style.background=spare<=0?C.bad:C.warn;
      if(S.fan==='pull'){qText.textContent='读时拉取不经过扇出队列。';stats.set('q','—',null);return}
      if(backlog>0)qText.textContent=`积压 ${util.fmt(backlog)} 条：新帖要排约 ${util.fmt(backlog/S.cap,0)} 秒才开始扇出；${spare>0?'高峰时 Worker 每秒只剩 '+util.fmt(spare)+' 的余量，约 '+util.duration(backlog/spare)+'后清空。':'Worker 跟不上高峰流量，积压只增不减。'}`;
      else qText.textContent=spare<=0?`高峰收件箱写 ${util.fmt(R.fanPk)}/秒超过 Worker 容量 ${util.fmt(S.cap)}/秒，积压会持续增长。`:`高峰利用率 ${util.pct(R.fanPk/S.cap,0)}，余量每秒 ${util.fmt(spare)} 条。${S.follow==='celeb'?'点上方按钮看名人发帖。':''}`;
      stats.set('q',backlog>0?util.fmt(backlog)+' 条':'0',backlog>0?(spare>0?'warn':'bad'):'ok');
    }
    const lp=ctx.loop(dt=>{
      const R=calc(),d=dt*30;simT+=d;backlog=Math.max(0,backlog+(R.fanPk-S.cap)*d);
      if(backlog<=0){lp.stop();ctx.log(`积压清空，用时约 ${util.duration(simT)}（模拟时间）`,'ok')}
      else if(backlog>5*CELEB){lp.stop();ctx.log('积压超过 500 万条，停止模拟','bad')}
      drawQ();
    },false);
    function celebPost(){
      if(S.follow!=='celeb')return;
      if(S.fan!=='push'){ctx.log('名人发帖：不写粉丝收件箱，粉丝刷新时把名人的新帖合并进来','ok');return}
      backlog+=CELEB;simT=0;ctx.log(`名人发帖：100 万次收件箱写进入队列，新帖要排约 ${util.fmt(backlog/S.cap,0)} 秒`,'warn');drawQ();lp.start();
    }
    update();
    const setAll=o=>{Object.assign(S,o);for(const k in c)c[k].set(S[k],true);capCtl.set(CAPS.indexOf(S.cap),true);backlog=0;lp.stop();prev=new Set(lanes().flatMap(([n,cs])=>cs.map(x=>n+x.t)));update()};
    const change=async(k,v,ms=2800)=>{const old=S[k];S[k]=v;c[k].set(v,true);update(k,old);await ctx.wait(ms)};
    ctx.scenarios([
      {id:'three',label:'三个问题改变三条路径',
        ask:'从「时间倒序、好友上限、纯文本」开始，把三个答案依次改成「个性化推荐、可关注名人、含视频」。每改一个，图上会多出什么？',
        insight:'改成推荐，读取路径多出候选召回和排序服务，游标分页不再适用；允许关注名人，发布路径出现「名人发帖 = 100 万次收件箱写」的红色警告，需要把扇出策略换成混合；含视频，多出一整条媒体路径：对象存储、转码队列与 Worker、多清晰度和 CDN。每个澄清问题都对应一条被改变的路径，不改变设计的问题可以不问。',
        async run(){ctx.clearLog();ctx.openLog();setAll({sort:'time',follow:'cap',media:'text',dau:1e7,fan:'push',cap:5e4});await ctx.wait(1500);await change('sort','rank');await change('follow','celeb');await change('media','video');await change('fan','hybrid',2400)}},
      {id:'celeb',label:'名人发帖压垮扇出队列',
        ask:'1,000 万日活，高峰时收件箱写约 4.6 万/秒，Worker 总容量 5 万/秒。一位 100 万粉丝的名人发帖（写时推送），普通用户的新帖要排多久才开始扇出？积压多久清空？',
        insight:'新帖要排约 20 秒（100 万 ÷ 5 万）；但高峰时 Worker 只剩约 3,700/秒的余量，积压要 4.5 分钟左右才清空。只看「Worker 每秒 5 万」会以为 20 秒就好，关键是恢复期的处理能力要大于新到的流量。改成混合扇出后，名人发帖不再进队列。',
        async run(){ctx.clearLog();ctx.openLog();setAll({sort:'time',follow:'celeb',media:'text',dau:1e7,fan:'push',cap:5e4});await ctx.wait(1200);celebPost();while(lp.running)await ctx.wait(300);await ctx.wait(800);await change('fan','hybrid',1200);celebPost();await ctx.wait(1500)}},
      {id:'scale',label:'10 万到 1 亿日活',
        ask:'同样是按时间倒序的好友动态、纯文本。DAU 从 10 万到 1,000 万再到 1 亿，发布路径分别需要什么？Worker 容量 5 万/秒还够吗？',
        insight:'10 万日活每秒约 1.2 条帖子，单库加同步扇出就够，此时分库分表是过度设计。1,000 万日活出现队列和异步 Worker，高峰收件箱写约 4.6 万/秒（Worker 利用率 93%）。1 亿日活高峰约 46 万/秒，是 Worker 容量的 9 倍多，帖子库也要分片；把 Worker 扩到每秒 100 万才回到 46%。规模数字决定了该不该加组件。',
        async run(){ctx.clearLog();ctx.openLog();setAll({sort:'time',follow:'cap',media:'text',dau:1e5,fan:'push',cap:5e4});ctx.log('从日活 10 万开始','info');await ctx.wait(2500);await change('dau',1e7,3500);await change('dau',1e8,3500);S.cap=1e6;capCtl.set(CAPS.indexOf(1e6),true);update('cap');ctx.log('Worker 总容量扩到每秒 100 万','info');await ctx.wait(2500)}},
    ]);
  }
});
})();
