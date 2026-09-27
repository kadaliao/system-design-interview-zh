/* 第 14 章：视频系统。转码 DAG 在 worker 池上调度：GOP 分片并行、失败重试、只有必需输出落盘校验后才发布 ready。 */
(function(){
const {el:h,util}=SDLab;

const RES=[['360','360p',2],['720','720p',3],['1080','1080p',5]],NG=6;
const ENC=new Set(['360','720','1080','audio','thumb']);
/** 构建一次转码作业：离散事件模拟，advance(秒) 精确推进到下一个任务结束或失败点。 */
function makeJob(cfg){
  const T=new Map(),low=cfg.req==='low';
  const add=(id,label,dur,deps,kind,opt)=>T.set(id,{id,label,dur,deps,kids:[],kind,opt:!!opt,state:'wait',p:0,attempt:1,seq:0,failAt:null,failKind:null});
  add('pre','预处理：切 GOP',1.5,[],'ctl');
  add('sv','拆出视频',1,['pre'],'ctl');add('sa','拆出音频',1,['pre'],'ctl');add('sm','提取元数据',1,['pre'],'ctl');
  add('thumb','缩略图',1.5,['sv'],'thumb');
  for(let g=1;g<=NG;g++)for(const [r,l,d] of RES)add(`e${r}-${g}`,`${l} G${g}`,d,['sv'],r,low&&r==='1080');
  add('aenc','音频编码',3,['sa'],'audio');
  for(const [r,l] of RES)add('m'+r,'组装 '+l,1,util.range(NG).map(i=>`e${r}-${i+1}`),'ctl',low&&r==='1080');
  add('man','写清单并校验',1,low?['m360','m720','aenc','thumb','sm']:['m360','m720','m1080','aenc','thumb','sm'],'ctl');
  if(low)add('man2','清单追加 1080p',0.5,['m1080','man'],'ctl',true);
  for(const t of T.values())for(const d of t.deps)T.get(d).kids.push(t.id);
  if(cfg.fail){const f=T.get(cfg.fail.id);f.failAt=cfg.fail.at??0.5;f.failKind=cfg.fail.kind}
  const J={cfg,T,t:0,queue:[],workers:util.range(cfg.workers).map(i=>({i,task:null,segs:[],seg:null})),seq:0,retries:0,busy:0,readyAt:null,notifyAt:null,manAt:null,hdAt:null,allAt:null,failed:null,failNext:null,on:cfg.on||(()=>{})};
  const all=[...T.values()],isDone=id=>T.get(id).state==='done';
  const enq=t=>{t.state='queue';t.seq=J.seq++;J.queue.push(t)};
  function schedule(){
    for(const w of J.workers){
      if(w.task||!J.queue.length)continue;
      J.queue.sort((a,b)=>(a.opt-b.opt)||(a.seq-b.seq));
      const t=J.queue.shift();
      if(J.failNext&&t.kind===J.failNext.res&&t.attempt===1){t.failAt=0.5;t.failKind=J.failNext.kind;J.failNext=null}
      t.state='run';t.p=0;t.w=w.i;w.task=t;w.seg={s:J.t,e:null,kind:t.kind,fail:false};w.segs.push(w.seg);
    }
  }
  function endSeg(w,fail){w.seg.e=J.t;w.seg.fail=fail;J.busy+=w.seg.e-w.seg.s;w.task=null}
  function finish(t,w){
    t.state='done';t.p=1;endSeg(w,false);J.on('done',t);
    for(const k of t.kids){const kt=T.get(k);if(kt.state==='wait'&&kt.deps.every(isDone))enq(kt)}
    if(J.cfg.notify==='early'&&J.notifyAt==null&&all.filter(x=>!x.opt&&ENC.has(x.kind)).every(x=>x.state==='done')){J.notifyAt=J.readyAt=J.t;J.on('notify',t)}
    if(t.id==='man'){J.manAt=J.t;J.on('man',t);if(J.notifyAt==null){J.notifyAt=J.readyAt=J.t;J.on('notify',t)}}
    if(t.id==='man2'){J.hdAt=J.t;J.on('hd',t)}
    if(all.every(x=>x.state==='done')){J.allAt=J.t;if(!low)J.hdAt=J.manAt;J.on('all',t)}
  }
  function fail(t,w){
    const kind=t.failKind;t.failAt=null;endSeg(w,true);
    if(kind==='crash'){t.attempt++;J.retries++;t.p=0;enq(t);J.on('retry',t)}
    else{t.state='fail';J.failed={t,at:J.t};for(const x of all)if(x.state==='queue'||x.state==='wait')x.state='cancel';for(const w2 of J.workers)if(w2.task){w2.task.state='cancel';endSeg(w2,false)}J.queue=[];J.on('abort',t)}
  }
  J.finished=()=>J.failed!=null||J.allAt!=null;
  J.advance=function(dt){
    const target=J.t+dt;
    for(let guard=0;guard<5000;guard++){
      if(J.finished())return;
      schedule();
      let next=Infinity;
      for(const w of J.workers)if(w.task){const t=w.task;next=Math.min(next,((t.failAt??1)-t.p)*t.dur)}
      if(next===Infinity)return;
      const step=Math.min(next,target-J.t);
      for(const w of J.workers)if(w.task)w.task.p+=step/w.task.dur;
      J.t+=step;
      if(step<next-1e-9)return;
      for(const w of J.workers){const t=w.task;if(!t)continue;if(t.failAt!=null&&t.p>=t.failAt-1e-9)fail(t,w);else if(t.p>=1-1e-9)finish(t,w)}
    }
  };
  enq(T.get('pre'));
  return J;
}
const sim=cfg=>{const j=makeJob(cfg);j.advance(Infinity);return j};

SDLab.define({
  id:'transcode-dag',chapter:14,
  title:'转码 DAG 的并行、重试与完成条件',
  summary:'上传的视频按 GOP 切成 6 段，进入转码 DAG：拆分、各清晰度分片编码、缩略图、音频编码、组装、写清单。调 worker 数、注入失败，看任务怎样排队、并行、重试，以及 ready 在什么条件下才发布。',
  caveat:'任务时长是相对单位（模拟秒），1 倍速下 1 秒动画约等于 3 模拟秒。资源管理器按「必需任务优先、先就绪先执行」从任务队列取任务，worker 能力相同，崩溃后立即换一台空闲 worker 重跑；水印、检查等步骤并入各分片编码。重跑从临时存储读取同一个 GOP，输出写到按「视频/清晰度/分片」确定的位置，覆盖而不是多出一份。',
  mount(ctx){
    ctx.css('td',`
.td-flow{display:grid;grid-template-columns:minmax(118px,.8fr) minmax(236px,1.6fr) minmax(96px,.65fr) minmax(150px,1fr);gap:16px}
.td-narrow .td-flow{grid-template-columns:minmax(0,1fr);gap:18px}
.td-col{position:relative;display:flex;flex-direction:column;gap:5px;min-width:0}
.td-col:not(:last-child)::after{content:'→';position:absolute;right:-13px;top:46%;color:#9fb1a5;font-size:14px}
.td-narrow .td-col:not(:last-child)::after{content:'↓';right:auto;left:50%;top:auto;bottom:-18px}
.td-h{font-size:12px;font-weight:700;color:#66756d;margin-bottom:1px}
.td-t{position:relative;border:1px solid #dbe2da;border-radius:7px;padding:3px 8px;font-size:12.5px;line-height:1.45;background:#f6f8f4;color:#66756d;--p:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.td-t[data-s=queue],.td-c[data-s=queue]{background:#f6ead2;border-color:#dfbf85;color:#86561a}
.td-t[data-s=run],.td-c[data-s=run]{border-color:#2f6fb3;color:#24558a;background:linear-gradient(90deg,#cfe0f3 calc(var(--p)*100%),#fff 0)}
.td-t[data-s=done],.td-c[data-s=done]{background:#dcefe2;border-color:#8fc4a2;color:#1d6a41}
.td-t[data-s=fail],.td-c[data-s=fail]{background:#f7dedb;border-color:#c2413b;color:#9b2c27}
.td-t[data-s=cancel],.td-c[data-s=cancel]{opacity:.45;text-decoration:line-through}
.td-t.opt,.td-c.opt{border-style:dashed}
.td-t .rt,.td-c .rt{font-size:11px;font-weight:700;color:#b7791f;margin-left:3px}
.td-row{display:flex;gap:5px;flex-wrap:wrap}.td-row .td-t{flex:1 1 60px}
.td-gop{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:3px}
.td-gop span{font-size:11px;text-align:center;border-radius:4px;background:#e6eee2;color:#66756d;line-height:1.8}
.td-gop.cut span{background:#dde9f6;color:#24558a}
.td-mx{display:grid;grid-template-columns:44px repeat(6,minmax(0,1fr));gap:3px;align-items:center}
.td-mx .lb{font-size:12px;color:#66756d;font-weight:650}
.td-mx .gh{font-size:11px;color:#66756d;text-align:center}
.td-c{border:1px solid #dbe2da;border-radius:5px;height:22px;background:#f6f8f4;font-size:11px;text-align:center;line-height:20px;--p:0;overflow:hidden}
.td-card{border:1px solid #dbe2da;border-radius:9px;padding:7px 9px;background:#fff;font-size:12.5px;line-height:1.6}
.td-card .k{color:#66756d}
.td-card .bad{color:#c2413b;font-weight:650}.td-card .ok{color:#2f8f5b;font-weight:650}
.td-rm{margin-top:14px;border:1px solid #dbe2da;border-radius:10px;padding:8px 10px;background:#fbfcfa}
.td-rm .hd{font-size:12.5px;color:#66756d;margin-bottom:5px}
.td-rm .hd b{color:#23352f}
.td-lane{display:grid;grid-template-columns:30px 92px minmax(0,1fr);gap:8px;align-items:center;margin:3px 0;font-size:12px}
.td-lane .nm{font-weight:700;color:#66756d}
.td-lane .cur{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#24558a}
.td-lane .cur.idle{color:#9aa89f}
.td-lane .trk{position:relative;height:16px;background:#f0f4ed;border-radius:4px;overflow:hidden}
.td-lane svg{position:absolute;inset:0;width:100%;height:100%}
.td-axis{position:relative;height:16px;margin-left:138px;font-size:11px;color:#66756d}
.td-axis span{position:absolute;transform:translateX(-50%);white-space:nowrap}
.td-leg{display:flex;flex-wrap:wrap;gap:3px 12px;font-size:11.5px;color:#66756d;margin-top:4px}
.td-leg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
`);
    const C=ctx.colors,fmt=util.fmt;
    const KCOL={ctl:'#8fa396','360':C.series[0],'720':C.series[1],'1080':C.series[3],audio:C.series[4],thumb:C.series[5]};
    const P={workers:4,req:'all',notify:'verified',speed:1};
    const s1=v=>(+v.toFixed(1))+' 秒';
    const put=(el,...kids)=>el.replaceChildren(...kids.flat().filter(k=>k!=null&&k!==false));
    // 用同一引擎预先算出场景结论里的数字
    const B1=sim({workers:1,req:'all',notify:'verified'}),B6=sim({workers:6,req:'all',notify:'verified'}),B4=sim({workers:4,req:'all',notify:'verified'});
    const F4=sim({workers:4,req:'all',notify:'verified',fail:{id:'e720-3',kind:'crash'}});
    const F4h=sim({workers:4,req:'all',notify:'verified',fail:{id:'e1080-3',kind:'crash'}});
    const util4=j=>util.pct(j.busy/(4*j.allAt),0),dF=F4.readyAt-B4.readyAt;
    const E4=sim({workers:4,req:'all',notify:'early'}),L4=sim({workers:4,req:'low',notify:'verified'});
    let job,els={},scale=30,player=null;

    const flowBox=h('div'),rm=h('div',{class:'td-rm'});
    ctx.stage.append(flowBox,rm);
    ctx.onResize(w=>flowBox.classList.toggle('td-narrow',w<640));

    function onEvent(type,t){
      const J=job;
      if(type==='done'&&t.id==='pre')ctx.log(`${s1(J.t)}：预处理完成，6 个 GOP 与元数据存入临时存储，按配置生成 DAG`,'info');
      if(type==='retry')ctx.log(`${s1(J.t)}：${t.label} 的 worker 崩溃，任务回到队列，第 ${t.attempt} 次执行会从临时存储重新读 GOP`,'warn');
      if(type==='abort')ctx.log(`${s1(J.t)}：${t.label} 的 GOP 数据损坏，属于不可恢复错误：停止整个作业，返回错误码「输入文件损坏」`,'bad');
      if(type==='notify'){
        const ok=J.manAt!=null;player={at:J.t,ok};
        ctx.log(`${s1(J.t)}：通知用户「视频可以播放了」`,ok?'ok':'warn');
        ctx.log(ok?'播放器请求播放清单 → 200 OK，开始播放':'播放器请求播放清单 → 404：各清晰度还没组装，清单也没写，用户看到「可播放」却放不了',ok?'ok':'bad');
        ctx.announce(ok?'已发布 ready，播放成功':'过早通知，播放器得到 404');
      }
      if(type==='man'&&J.cfg.notify==='early')ctx.log(`${s1(J.t)}：清单这时才写好并校验，比通知晚 ${s1(J.t-J.notifyAt)}`,'info');
      if(type==='man'&&J.cfg.notify!=='early')ctx.log(`${s1(J.t)}：必需输出与清单都已落盘并校验，发布 ready${J.cfg.req==='low'?'（360p、720p 可播放，1080p 稍后追加）':''}`,'ok');
      if(type==='hd'&&J.cfg.req==='low')ctx.log(`${s1(J.t)}：1080p 组装完成并追加进清单`,'ok');
      if(type==='all')ctx.log(`${s1(J.t)}：DAG 全部完成，worker 利用率 ${util.pct(J.busy/(J.workers.length*J.t),0)}`,'info');
    }
    function restart(extra){
      job=makeJob({workers:P.workers,req:P.req,notify:P.notify,...extra,on:(a,b)=>onEvent(a,b)});
      player=null;
      scale=Math.max(10,sim({workers:P.workers,req:P.req,notify:P.notify}).t*1.04);
      buildDom();draw(true);lp.start();
    }
    function tBox(id,cls){const t=job.T.get(id);const el=h('div',{class:'td-t'+(t.opt?' opt':'')+(cls?' '+cls:''),title:t.label},t.label);els[id]=el;return el}
    function buildDom(){
      els={};
      const gop=h('div',{class:'td-gop'},util.range(NG).map(i=>h('span',null,'G'+(i+1))));els.gop=gop;
      const mx=h('div',{class:'td-mx'},h('span'),util.range(NG).map(i=>h('span',{class:'gh'},'G'+(i+1))));
      for(const [r,l] of RES){mx.append(h('span',{class:'lb'},l));for(let g=1;g<=NG;g++){const id=`e${r}-${g}`,t=job.T.get(id);const c=h('div',{class:'td-c'+(t.opt?' opt':''),title:t.label});els[id]=c;mx.append(c)}}
      const card=h('div',{class:'td-card'});els.card=card;
      flowBox.replaceChildren(h('div',{class:'td-flow'},
        h('div',{class:'td-col'},h('div',{class:'td-h'},'① 原片：6 个 GOP'),gop,tBox('pre'),tBox('sv'),tBox('sa'),tBox('sm')),
        h('div',{class:'td-col'},h('div',{class:'td-h'},'② 分片编码（可并行）'),mx,h('div',{class:'td-row'},tBox('thumb'),tBox('aenc'))),
        h('div',{class:'td-col'},h('div',{class:'td-h'},'③ 组装'),tBox('m360'),tBox('m720'),tBox('m1080')),
        h('div',{class:'td-col'},h('div',{class:'td-h'},'④ 清单与发布'),tBox('man'),job.T.has('man2')?tBox('man2'):null,card)));
      const lanes=job.workers.map(w=>{
        const svg=ctx.svgEl('svg',{viewBox:`0 0 ${scale} 10`,preserveAspectRatio:'none','aria-hidden':'true'});
        const g=ctx.svgEl('g'),now=ctx.svgEl('line',{y1:0,y2:10,stroke:C.info,'stroke-width':1.5,'vector-effect':'non-scaling-stroke'});svg.append(g,now);
        const cur=h('span',{class:'cur idle'},'空闲');
        w.ui={svg,g,now,cur,n:0};
        return h('div',{class:'td-lane'},h('span',{class:'nm'},'W'+(w.i+1)),cur,h('div',{class:'trk'},svg));
      });
      els.rmHd=h('div',{class:'hd'});els.axis=h('div',{class:'td-axis'});
      rm.replaceChildren(els.rmHd,...lanes,els.axis,h('div',{class:'td-leg'},[['360p','360'],['720p','720'],['1080p','1080'],['音频','audio'],['缩略图','thumb'],['预处理/组装/清单','ctl']].map(([l,k])=>h('span',null,h('i',{style:{background:KCOL[k]}}),l)),h('span',null,h('i',{style:{background:C.bad}}),'失败')));
      els.last={};
    }
    function draw(force){
      const J=job;
      for(const t of J.T.values()){
        const el=els[t.id];if(!el)continue;
        const key=t.state+t.attempt+(t.state==='run'?Math.round(t.p*40):'');
        if(!force&&els.last[t.id]===key)continue;els.last[t.id]=key;
        el.dataset.s=t.state;el.style.setProperty('--p',t.state==='run'?t.p.toFixed(3):0);
        const isCell=el.classList.contains('td-c');
        put(el,isCell?null:t.label,t.attempt>1?h('span',{class:'rt',title:'重试次数'},'↻'+(t.attempt-1)):null);
      }
      els.gop.classList.toggle('cut',J.T.get('pre').state==='done');
      // 发布状态卡
      const st0=J.failed?['失败 · 输入文件损坏','bad']:J.cfg.notify==='early'?(J.notifyAt!=null?['已标记可播放','ok']:['处理中',null]):J.readyAt!=null?[J.cfg.req==='low'&&J.hdAt==null?'ready（360p、720p）':'ready（全部清晰度）','ok']:['处理中',null];
      const hdTxt=J.cfg.req==='low'?(J.hdAt!=null?'1080p 已追加':'1080p 稍后追加'):'';
      put(els.card,
        h('div',null,h('span',{class:'k'},'视频状态：'),h('span',{class:st0[1]||null},st0[0])),
        h('div',null,h('span',{class:'k'},'通知用户：'),J.notifyAt!=null?s1(J.notifyAt):'—'),
        h('div',null,h('span',{class:'k'},'播放器：'),player?h('span',{class:player.ok?'ok':'bad'},player.ok?'清单 200 OK':'清单 404'):'—'),
        J.cfg.notify==='early'&&J.notifyAt!=null?h('div',null,h('span',{class:'k'},'清单落盘：'),J.manAt!=null?s1(J.manAt):'还没有'):null,
        hdTxt?h('div',{class:'k'},hdTxt):null);
      // 资源管理器与甘特图
      const running=J.workers.filter(w=>w.task).length;
      els.rmHd.replaceChildren('资源管理器：任务队列 ',h('b',null,J.queue.length),' · 运行中 ',h('b',null,running),' · 空闲 worker ',h('b',null,J.workers.length-running),' · 模拟时间 ',h('b',null,s1(J.t)));
      const vb=Math.max(scale,J.t*1.02);
      for(const w of J.workers){
        const u=w.ui;
        while(u.n<w.segs.length){const sg=w.segs[u.n];sg.el=ctx.svgEl('rect',{x:sg.s,y:1,width:0,height:8,fill:KCOL[sg.kind]});u.g.append(sg.el);u.n++}
        for(const sg of w.segs){if(sg.done)continue;const e=sg.e??J.t;ctx.attr(sg.el,{width:Math.max(0,e-sg.s-0.04),fill:sg.fail?C.bad:KCOL[sg.kind]});if(sg.e!=null)sg.done=true}
        u.svg.setAttribute('viewBox',`0 0 ${vb} 10`);ctx.attr(u.now,{x1:J.t,x2:J.t});
        u.cur.textContent=w.task?w.task.label:'空闲';u.cur.className='cur'+(w.task?'':' idle');
      }
      els.axis.replaceChildren(...util.range(Math.floor(vb/5)+1).map(i=>i*5).filter(s=>s/vb<0.97).map(s=>h('span',{style:{left:s/vb*100+'%'}},s+'s')));
      stats.set('t',s1(J.t));
      stats.set('ready',J.failed?'失败':J.notifyAt!=null?s1(J.notifyAt):'—',J.failed?'bad':J.notifyAt!=null?(player&&!player.ok?'bad':'ok'):null);
      stats.set('all',J.allAt!=null?s1(J.allAt):J.failed?'已停止':'—',J.allAt!=null?'ok':J.failed?'bad':null);
      stats.set('util',J.t?util.pct(J.busy/(J.workers.length*J.t),0):'—');
      stats.set('retry',J.retries,J.retries?'warn':null);
    }

    /* ---- 控件 ---- */
    const sW=ctx.slider({label:'worker 数',min:1,max:8,value:P.workers,hint:'调整后重新开始一次转码',onChange:v=>{P.workers=v;restart()}});
    const cReq=ctx.segmented({label:'ready 需要',value:P.req,options:[['all','全部 3 种清晰度'],['low','360p + 720p，1080p 稍后']],onChange:v=>{P.req=v;restart()}});
    const cNot=ctx.segmented({label:'何时通知用户',value:P.notify,options:[['verified','清单落盘校验后'],['early','编码一结束（原图并行分支）']],onChange:v=>{P.notify=v;restart()}});
    const cSpd=ctx.segmented({label:'播放',value:1,options:[[0,'暂停'],[1,'1×'],[2,'2×']],onChange:v=>{P.speed=v;if(v)lp.start()}});
    ctx.button('重新上传',()=>restart(),{primary:true});
    const cTgt=ctx.segmented({label:'注入失败的分片',value:'720',options:RES.map(([r,l])=>[r,l])});
    const inject=kind=>{const r=cTgt.get();job.failNext={res:r,kind};ctx.log(kind==='crash'?`已设定：下一个开始执行的 ${r}p 分片任务会在一半时 worker 崩溃（可恢复）`:`已设定：下一个开始执行的 ${r}p 分片任务会发现 GOP 数据损坏（不可恢复）`,kind==='crash'?'warn':'bad')};
    ctx.button('注入：worker 崩溃',()=>inject('crash'));
    ctx.button('注入：分片数据损坏',()=>inject('corrupt'),{danger:true});
    const stats=ctx.stats([{key:'t',label:'模拟时间'},{key:'ready',label:'通知用户可播放'},{key:'all',label:'DAG 全部完成'},{key:'util',label:'worker 利用率'},{key:'retry',label:'重试次数'}]);

    let acc=0;
    const lp=ctx.loop(dt=>{
      if(!P.speed)return;
      job.advance(dt*3*P.speed);
      acc+=dt;
      if(job.finished()){draw(true);lp.stop();return}
      if(acc>1/30){acc=0;draw()}
    },false);
    restart();

    function prepare(o){
      Object.assign(P,{workers:4,req:'all',notify:'verified',speed:1},o.p||{});
      sW.set(P.workers,true);cReq.set(P.req,true);cNot.set(P.notify,true);cSpd.set(P.speed,true);
      ctx.clearLog();restart(o.fail?{fail:o.fail}:null);
    }
    const done=async()=>{while(!job.finished())await ctx.wait(150);await ctx.wait(300)};
    ctx.scenarios([
      {id:'more-workers',label:'加 worker 能快几倍',
        ask:`1 个 worker 转完这段视频要 ${s1(B1.allAt)}（模拟）。换成 6 个 worker，会快 6 倍、只要 ${s1(B1.allAt/6)} 吗？`,
        insight:`不会：6 个 worker 用了 ${s1(B6.allAt)}，快了约 ${(B1.allAt/B6.allAt).toFixed(1)} 倍，利用率只有 ${util.pct(B6.busy/(6*B6.allAt),0)}。开头的预处理、结尾的组装和写清单都要等前一步完成，这时多数 worker 只能空闲（甘特图里的空白）；1080p 分片最慢，决定了编码阶段何时结束。并行能压缩的只是 18 个分片编码这一段。`,
        async run(){prepare({p:{workers:6}});await done()}},
      {id:'retry',label:'720p 分片崩溃',
        ask:'4 个 worker。720p 第 3 个分片编码到一半，worker 崩溃了。需要把整段视频重新转一遍吗？ready 会晚多少？',
        insight:`不需要：只有「720p G3」这一个任务回到队列，从临时存储重新读同一个 GOP 重跑（格子上标 ↻1），其他分片的成果都保留。${dF<0.05?`这次 ready 仍在 ${s1(F4.readyAt)}：重跑多用了 1.5 秒算力（利用率 ${util4(B4)} → ${util4(F4)}），但 720p 不在最慢的 1080p 链条上，等待被空闲时间吸收了。如果崩溃的是 1080p 分片，ready 会从 ${s1(B4.readyAt)} 推迟到 ${s1(F4h.readyAt)}（可以在「注入失败的分片」选 1080p 试试）。`:`ready 从 ${s1(B4.readyAt)} 推迟到 ${s1(F4.readyAt)}，多出的时间来自重跑这一片和重新排队。`}任务要有稳定标识、输出写到确定位置，重跑才不会产生重复或不一致的成品。`,
        async run(){prepare({fail:{id:'e720-3',kind:'crash'}});await done()}},
      {id:'early-notify',label:'过早的完成通知',
        ask:'按原图把「完成事件」和「写入转码存储」当成两条并行分支：分片编码一结束就通知用户。用户立刻点开会怎样？',
        insight:`${s1(E4.notifyAt)} 发出通知时，各清晰度还没组装，播放清单也不存在，播放器拿到 404；清单要到 ${s1(E4.manAt)} 才写好并校验。正确做法是把「所需输出与清单已落盘并校验」作为完成条件，满足后才发布 ready 并通知。`,
        async run(){prepare({p:{notify:'early'}});await done()}},
      {id:'hd-later',label:'1080p 稍后可用',
        ask:'只把 360p、720p 设为 ready 的必需项，1080p 分片降为低优先级，转完再追加进清单。ready 能比「全部清晰度转完才发布」早多少？',
        insight:`全部清晰度都作为必需项时，ready 在 ${s1(B4.readyAt)} 发布；只要求 360p、720p 时，ready 提前到 ${s1(L4.readyAt)}，1080p 在 ${s1(L4.hdAt)} 追加进清单。用户可以先看低清晰度，高清晰度逐步可用；前提是清单支持追加，播放器能看到新版本。`,
        async run(){prepare({p:{req:'low'}});await done()}},
    ]);
  }
});
})();
