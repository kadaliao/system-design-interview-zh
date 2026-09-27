/* 第 10 章：通知系统。实验一：分渠道队列、第三方故障、退避重试与过期作废；实验二：为什么「先查后发」挡不住重复通知。 */
(function(){
const {el:h,util}=SDLab;

/* ---------------- 实验一：分渠道队列与第三方故障 ---------------- */
SDLab.define({
  id:'notification-pipeline',chapter:10,
  title:'分渠道队列遇上第三方故障',
  summary:'通知事件持续进入 iOS、Android、短信、邮件四个队列，各自的 worker 调用对应第三方。点某个渠道的第三方按钮制造故障，看积压、退避重试和过期作废怎样只困住这一条链路；再换成共用队列对比。',
  caveat:'时间按模拟秒推进。第三方正常时一次调用 0.5 秒；故障时每次调用要等满 8 秒超时。失败后按 1、2、4 秒退避重试，第 4 次仍失败进死信；重试沿用同一个事件 ID。到达速率固定：推送各约 1.5 条/秒、短信 1.2 条/秒、邮件 1 条/秒；短信都按验证码处理。',
  mount(ctx){
    ctx.css('np',`
.np-lanes{display:flex;flex-direction:column;gap:8px}
.np-lane{display:grid;grid-template-columns:112px minmax(0,1fr) auto 118px;grid-template-areas:"lbl q w p" "lbl info info info";gap:4px 10px;align-items:center;border:1px solid #dbe2da;border-radius:10px;padding:7px 10px;background:#fbfcfa}
.np-lane.down{background:#fdf5f4;border-color:#ecc3bf}
.np-lbl{grid-area:lbl;font-size:13px;font-weight:700;line-height:1.35;min-width:0}
.np-lbl small{display:block;font-weight:400;color:#66756d;font-size:11px}
.np-q{grid-area:q;display:flex;flex-wrap:wrap;gap:2px;align-items:center;min-height:14px;min-width:0}
.np-q i{display:block;width:10px;height:12px;border-radius:2px;background:#b9c5bd}
.np-q i.r{background:#e0b35a}
.np-q .more{font-size:11px;color:#66756d;margin-left:4px}
.np-q .none{font-size:11px;color:#9aa89f}
.np-ws{grid-area:w;display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.np-w{font-size:11px;line-height:20px;padding:0 6px;border-radius:5px;background:#eef2ec;color:#66756d;white-space:nowrap;min-width:52px;text-align:center;border:1px solid transparent}
.np-w.send{background:#dde9f6;color:#24558a}.np-w.wait{background:#f7dedb;color:#9b2c27}
.sdl-frame .np-p{grid-area:p;font-size:12px;padding:3px 8px;border-radius:7px;line-height:1.4;text-align:center}
.sdl-frame .np-p.ok{background:#dcefe2;border-color:#9fcdb0;color:#1d6a41}
.sdl-frame .np-p.bad{background:#f7dedb;border-color:#e3aaa4;color:#9b2c27;font-weight:650}
.np-info{grid-area:info;display:grid;grid-template-columns:minmax(0,1fr) minmax(90px,.8fr);gap:10px;align-items:center}
.np-nums{font-size:12px;color:#44544b;font-variant-numeric:tabular-nums;line-height:1.5}
.np-nums b{font-weight:700}.np-nums .bad{color:#c2413b}.np-nums .warn{color:#86561a}.np-nums .ok{color:#1d6a41}
.sdl-stage .np-spark{display:block;width:100%;height:26px;background:#f2f5f0;border-radius:4px}
.np-pool{border:1px dashed #b9c5bd;border-radius:10px;padding:7px 10px;margin-bottom:8px;background:#fff}
.np-pool .ph{font-size:13px;color:#66756d;font-weight:700;margin-bottom:4px}
.np-pool .np-ws{justify-content:flex-start}
.np-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:#66756d;margin-top:8px}
.np-legend i{display:inline-block;width:10px;height:12px;border-radius:2px;vertical-align:-2px;margin-right:4px}
.np-narrow .np-lane{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"lbl p" "q q" "w w" "info info"}
.np-narrow .np-ws{justify-content:flex-start}
.np-narrow .np-info{grid-template-columns:minmax(0,1fr)}
`);
    const S2=ctx.colors.series;
    const CH=[{k:'ios',name:'iOS 推送',prov:'APNS',rate:1.5,color:S2[0]},{k:'and',name:'Android 推送',prov:'FCM',rate:1.5,color:S2[4]},{k:'sms',name:'短信验证码',prov:'短信服务商',rate:1.2,color:S2[3]},{k:'mail',name:'邮件',prov:'邮件服务商',rate:1,color:S2[5]}];
    const CI=Object.fromEntries(CH.map(c=>[c.k,c]));
    const LAT=0.5,TIMEOUT=8,MAXATT=4,TTL=15,STEP=0.05;
    const P={mode:'split',workers:2,ttl:true,speed:1};
    let now,Q,shared,R,down,wk,St,rng,nextArr,hist,script,seq,sampleT;
    function reset(){
      now=0;seq=0;rng=util.rng(10);Q={};R={};St={};nextArr={};hist={};down={};shared=[];script=[];sampleT=0;
      for(const c of CH){Q[c.k]=[];R[c.k]=[];St[c.k]={ok:0,retry:0,exp:0,dead:0,peakQ:0,peakWait:0};nextArr[c.k]=rng()/c.rate;hist[c.k]=[];down[c.k]=false}
      wk=P.mode==='split'?CH.flatMap(c=>util.range(P.workers).map(()=>({ch:c.k,ev:null}))):util.range(P.workers*4).map(()=>({ch:null,ev:null}));
    }
    const qOf=ch=>P.mode==='split'?Q[ch]:shared;
    const push=ev=>qOf(ev.ch).push(ev);
    const waiting=ch=>P.mode==='split'?Q[ch]:shared.filter(e=>e.ch===ch);
    function oldest(ch){let m=Infinity;for(const e of waiting(ch))m=Math.min(m,e.t0);for(const r of R[ch])m=Math.min(m,r.ev.t0);return m===Infinity?0:now-m}
    function setDown(ch,v){down[ch]=v;ctx.log(`${CI[ch].prov}${v?' 故障：调用会等到超时':' 恢复正常'}`,v?'bad':'ok');dirty=true}
    function burst(n){for(let i=0;i<n;i++)push({id:++seq,ch:'mail',t0:now,att:0});ctx.log(`营销活动：一次入队 ${n} 封邮件`,'warn')}
    function tick(){
      now+=STEP;
      while(script.length&&script[0].t<=now+1e-9)script.shift().fn();
      for(const c of CH){while(now>=nextArr[c.k]){push({id:++seq,ch:c.k,t0:nextArr[c.k],att:0});nextArr[c.k]+=(0.5+rng())/c.rate}}
      for(const c of CH){const due=R[c.k].filter(r=>r.due<=now+1e-9);if(due.length){R[c.k]=R[c.k].filter(r=>r.due>now+1e-9);for(const r of due)push(r.ev)}}
      for(const w of wk){
        if(w.ev&&now>=w.end-1e-9){
          const ev=w.ev,st=St[ev.ch];w.ev=null;
          if(!w.fail)st.ok++;
          else if(ev.att>=MAXATT){st.dead++;ctx.log(`${CI[ev.ch].name} #${ev.id} 第 ${ev.att} 次仍失败 → 进死信`,'bad')}
          else{st.retry++;R[ev.ch].push({ev,due:now+2**(ev.att-1)})}
        }
        if(!w.ev){
          const q=P.mode==='split'?Q[w.ch]:shared;
          while(q.length){const ev=q.shift();
            if(P.ttl&&ev.ch==='sms'&&now-ev.t0>TTL){St.sms.exp++;continue}
            ev.att++;w.ev=ev;w.fail=down[ev.ch];w.start=now;w.end=now+(w.fail?TIMEOUT:LAT);break}
        }
      }
      for(const c of CH){const st=St[c.k];st.peakQ=Math.max(st.peakQ,waiting(c.k).length+R[c.k].length);if(!down[c.k])st.peakWait=Math.max(st.peakWait,oldest(c.k))}
      if(now>=sampleT){sampleT=now+0.5;for(const c of CH){const a=hist[c.k];a.push(waiting(c.k).length+R[c.k].length);if(a.length>60)a.shift()}}
    }

    /* ---- 控件 ---- */
    const modeCtl=ctx.segmented({label:'队列结构',value:P.mode,options:[['split','每个渠道一个队列'],['shared','所有渠道共用']],onChange:v=>{P.mode=v;restart()}});
    const speedCtl=ctx.segmented({label:'播放速度',value:1,options:[[0,'暂停'],[1,'1×'],[2,'2×'],[4,'4×']],onChange:v=>{P.speed=v}});
    const wCtl=ctx.slider({label:'每个渠道的 worker 数',min:1,max:4,value:P.workers,format:v=>P.mode==='split'?v+' 个':v+' 个（共用池 '+v*4+' 个）',onChange:v=>{P.workers=v;restart()}});
    const tCtl=ctx.toggle({label:`验证码 ${TTL} 秒后作废，不再发送`,value:P.ttl,onChange:v=>{P.ttl=v}});
    ctx.button('营销活动：一次入队 40 封邮件',()=>{burst(40);dirty=true},{primary:true});
    ctx.button('重新开始',()=>restart());

    /* ---- 舞台 ---- */
    const wrap=h('div');
    const pool=h('div',{class:'np-pool'},h('div',{class:'ph'},'共用 worker 池：谁有空就从共用队列头部取一条'));const poolWs=h('div',{class:'np-ws'});pool.append(poolWs);
    const lanesBox=h('div',{class:'np-lanes'});
    const lanes={};
    for(const c of CH){
      const q=h('div',{class:'np-q','aria-hidden':'true'}),ws=h('div',{class:'np-ws'}),nums=h('div',{class:'np-nums'});
      const btn=h('button',{type:'button',class:'np-p ok',title:'点击切换第三方故障 / 恢复',onclick:()=>{setDown(c.k,!down[c.k])}});
      const spark=ctx.svgEl('svg',{class:'np-spark',viewBox:'0 0 60 26',preserveAspectRatio:'none','aria-hidden':'true'});
      const line=ctx.svgEl('polyline',{fill:'none',stroke:c.color,'stroke-width':2,'vector-effect':'non-scaling-stroke',points:''});spark.append(line);
      const sq=util.range(28).map(()=>{const i=h('i');q.append(i);return i});const more=h('span',{class:'more'}),none=h('span',{class:'none'},'队列空');q.append(more,none);
      const lane=h('div',{class:'np-lane'},h('div',{class:'np-lbl'},h('span',{style:{color:c.color}},'■ '),c.name,h('small',null,'→ '+c.prov)),q,ws,btn,h('div',{class:'np-info'},nums,spark));
      lanes[c.k]={lane,sq,more,none,ws,nums,btn,line,wEls:[]};lanesBox.append(lane);
    }
    const scaleNote=h('span');
    wrap.append(pool,lanesBox,h('div',{class:'np-legend'},h('span',null,h('i',{style:{background:'#b9c5bd'}}),'排队等待'),h('span',null,h('i',{style:{background:'#e0b35a'}}),'退避中，稍后重试'),h('span',null,h('i',{style:{background:'#dde9f6'}}),'worker 正在发送'),h('span',null,h('i',{style:{background:'#f7dedb'}}),'worker 在等第三方超时'),scaleNote));
    ctx.stage.append(wrap);
    ctx.onResize(w=>wrap.classList.toggle('np-narrow',w<620));
    const stats=ctx.stats([{key:'ok',label:'已被第三方接受'},{key:'retry',label:'重试次数'},{key:'exp',label:'验证码过期作废'},{key:'dead',label:'死信'},{key:'wait',label:'正常渠道最久等待'}]);

    function workerEl(){return h('span',{class:'np-w'})}
    function layoutWorkers(){
      pool.hidden=P.mode==='split';poolWs.replaceChildren();
      for(const c of CH){const L=lanes[c.k];L.ws.replaceChildren();L.wEls=[];L.ws.style.display=P.mode==='split'?'':'none'}
      wk.forEach(w=>{w.el=workerEl();if(P.mode==='split'){lanes[w.ch].ws.append(w.el)}else poolWs.append(w.el)});
    }
    let dirty=true;
    function render(){
      for(const c of CH){
        const L=lanes[c.k],st=St[c.k],wq=waiting(c.k),rq=R[c.k];
        const n=wq.length+rq.length,show=Math.min(n,L.sq.length);
        L.sq.forEach((el,i)=>{if(i<show){el.style.display='';el.className=i<Math.min(wq.length,show)?'':'r'}else el.style.display='none'});
        L.more.textContent=n>show?`+${n-show}`:'';L.none.style.display=n?'none':'';
        L.btn.textContent=`${c.prov}：${down[c.k]?'故障':'正常'}`;L.btn.className='np-p '+(down[c.k]?'bad':'ok');L.lane.classList.toggle('down',down[c.k]);
        const age=oldest(c.k);
        L.nums.replaceChildren(h('span',null,'排队 ',h('b',{class:n>10?'bad':n>4?'warn':null},n),' · 最久 ',h('b',{class:age>5?'bad':age>2?'warn':null},age.toFixed(1)+' 秒'),' · 已接受 ',h('b',{class:'ok'},st.ok),
          st.retry?[' · 重试 ',h('b',{class:'warn'},st.retry)]:null,st.exp?[' · 过期作废 ',h('b',{class:'warn'},st.exp)]:null,st.dead?[' · 死信 ',h('b',{class:'bad'},st.dead)]:null));
      }
      const top=Math.max(8,...CH.map(c=>Math.max(0,...hist[c.k])));
      for(const c of CH){const a=hist[c.k];lanes[c.k].line.setAttribute('points',a.map((v,i)=>`${60-(a.length-1-i)} ${24-22*v/top}`).join(' '))}
      scaleNote.textContent=`折线：近 30 秒的积压（纵轴上限 ${top} 条）`;
      for(const w of wk){const el=w.el;if(!el)continue;
        if(!w.ev){el.className='np-w';el.textContent='空闲';el.style.borderColor=''}
        else{el.className='np-w '+(w.fail?'wait':'send');el.textContent=w.fail?`等超时 ${Math.max(0,w.end-now).toFixed(1)}`:'发送中';el.style.borderColor=P.mode==='shared'?CI[w.ev.ch].color:''}}
      let ok=0,re=0,ex=0,de=0,wmax=0;for(const c of CH){const st=St[c.k];ok+=st.ok;re+=st.retry;ex+=st.exp;de+=st.dead;if(!down[c.k])wmax=Math.max(wmax,oldest(c.k))}
      stats.set('ok',util.fmt(ok),'ok');stats.set('retry',re,re?'warn':null);stats.set('exp',ex,ex?'warn':null);stats.set('dead',de,de?'bad':null);stats.set('wait',wmax.toFixed(1)+' 秒',wmax>5?'bad':wmax>2?'warn':'ok');
    }
    let acc=0,simAcc=0;
    ctx.loop(dt=>{
      if(P.speed){simAcc+=dt*P.speed;while(simAcc>=STEP-1e-9){tick();simAcc-=STEP}}
      acc+=dt;if(acc>=1/15){acc=0;render()}
    });
    function restart(){reset();simAcc=0;layoutWorkers();wCtl.set(P.workers,true);render();ctx.clearLog();ctx.log(`开始：${P.mode==='split'?'每个渠道一个队列':'所有渠道共用一个队列'}，worker 共 ${wk.length} 个`,'info')}
    restart();

    async function prepare(o){
      Object.assign(P,{mode:'split',workers:2,ttl:true,speed:4},o);modeCtl.set(P.mode,true);tCtl.set(P.ttl,true);speedCtl.set(P.speed,true);restart();
    }
    const until=async t=>{while(now<t)await ctx.wait(100);await ctx.wait(300)};
    const outage=()=>{script=[{t:3,fn:()=>setDown('sms',true)},{t:19,fn:()=>setDown('sms',false)}]};
    function summary(){const o=['ios','and','mail'].map(k=>St[k].peakWait);return `短信积压峰值 ${St.sms.peakQ} 条，过期作废 ${St.sms.exp}，重试 ${St.sms.retry}，死信 ${St.sms.dead}；推送与邮件最久等待 ${Math.max(...o).toFixed(1)} 秒`}
    ctx.scenarios([
      {id:'sms-down',label:'短信服务商故障 16 秒',
        ask:'第 3 秒起短信服务商故障 16 秒，每次调用都要等 8 秒超时。推送和邮件的等待时间会受影响吗？恢复后，积压的验证码都会发出去吗？',
        insight:'只有短信这一条积压：短信队列最多堆了 17 条，推送和邮件的最久等待几乎为 0。故障期间 2 个短信 worker 每次调用都卡满 8 秒，失败的通知按 1、2、4 秒退避后重试。恢复后积压很快排空，其中 4 条验证码已超过 15 秒，直接作废，而不是迟到发给用户。分渠道队列把一个第三方的故障关在了它自己的链路里。',
        async run(){await prepare({});outage();await until(36);ctx.log('本次：'+summary(),'info');ctx.openLog(true)}},
      {id:'shared',label:'换成共用队列',
        ask:'同样的故障，但四个渠道共用一个队列和 8 个 worker。推送和邮件还能保持在 1 秒内送出吗？',
        insight:'推送和邮件被拖累：最久等了 6.7 秒，分渠道时几乎为 0。8 个 worker 共用，卡在短信超时上的越来越多，排在短信后面的推送和邮件只能干等；短信自己也更糟，重试 15 次、作废 6 条。给每种通知各配一个队列，就是为了让一个第三方故障不波及其他渠道。',
        async run(){await prepare({mode:'shared'});outage();await until(36);ctx.log('本次：'+summary(),'info');ctx.openLog(true)}},
      {id:'burst',label:'营销邮件高峰',
        ask:'一次入队 40 封营销邮件。邮件渠道 2 个 worker、每封 0.5 秒，每秒最多发 4 封，同时每秒还有约 1 封新邮件进来。大约多久排空？推送会被拖慢吗？',
        insight:'邮件积压从 39 条降到 1 条用了约 11.6 秒：队列接住了高峰，但发送速度仍是每秒 4 封，还要扣掉持续进来的新邮件，只能慢慢消化。推送的最久等待仍接近 0，不受影响。想更快排空，要看第三方限额和 worker 吞吐，队列本身不会增加处理能力。',
        async run(){await prepare({});script=[{t:2,fn:()=>burst(40)}];await until(2.2);let t0=now;while(now<30&&(Q.mail.length>2||now<4))await ctx.wait(100);ctx.log(`邮件积压从 ${St.mail.peakQ} 条降到 ${Q.mail.length} 条用了 ${(now-t0).toFixed(1)} 秒；推送最久等待 ${Math.max(St.ios.peakWait,St.and.peakWait).toFixed(1)} 秒`,'info');ctx.openLog(true);await ctx.wait(400)}},
    ]);
  }
});

/* ---------------- 实验二：先查后发为什么不够 ---------------- */
SDLab.define({
  id:'notification-dedup',chapter:10,
  title:'为什么「先查后发」挡不住重复通知',
  summary:'同一个事件 e42 被队列投递了两次。逐步执行，看「发送后崩溃」「两个 worker 同时处理」「确认丢失」三种情形下，不同去重写法会让用户收到几条短信。',
  caveat:'「去重表」指通知日志里按事件 ID 记录的处理状态；「原子占用」可以是带唯一约束的 INSERT 或 Redis SET NX，并带过期时间，持有者崩溃后可被接手。第三方幂等指短信商按幂等键识别重复请求、返回上次结果。',
  mount(ctx){
    ctx.css('nd',`
.nd-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.8fr) minmax(0,1fr);border:1px solid #dbe2da;border-radius:10px;overflow:hidden;font-size:13px}
.nd-grid>div{padding:7px 10px;border-top:1px solid #e8ede6;min-height:36px;display:flex;align-items:center;gap:6px;line-height:1.45;flex-wrap:wrap}
.nd-grid>.hd{background:#f0f4ed;font-weight:700;border-top:0;justify-content:center}
.nd-grid>.mid{background:#fbfcfa;justify-content:center;align-items:center;text-align:center;font-size:12px;color:#44544b;flex-direction:column;gap:0}
.nd-grid>.b{justify-content:flex-end;text-align:right}
.nd-grid>.q{grid-column:1/-1;justify-content:center;background:#f3f7fb;color:#24558a;font-size:12px}
.nd-grid>.cur{background:#fff7dd}
.nd-grid>.future{color:#b4beb7}.nd-grid>.future .sdl-tag{opacity:.45}
.nd-grid .res{color:#44544b}.nd-grid .res.bad{color:#c2413b;font-weight:650}.nd-grid .res.ok{color:#1d6a41}
.nd-narrow{grid-template-columns:minmax(0,1fr) 84px}
.nd-narrow>.a,.nd-narrow>.b{grid-column:1;grid-row:var(--r);justify-content:flex-start;text-align:left}
.nd-narrow>.mid{grid-column:2;grid-row:var(--r)}
.nd-narrow>.q{grid-row:var(--r)}
.nd-narrow>.a:empty,.nd-narrow>.b:empty,.nd-narrow>.hd.hb{display:none}
.nd-narrow>.hd.ha{grid-column:1;grid-row:1}.nd-narrow>.hd.hm{grid-column:2;grid-row:1}
`);
    const CASES={crash:'A 发出后崩溃',race:'A、B 同时处理',late:'A 完成但确认丢失'};
    const MODES={none:'不去重',check:'先查后发（原文方案）',atomic:'原子占用 + 幂等键'};
    let cs='crash',md='check',idem=true,steps=[],idx=0,S,cells=[];
    function build(){
      S={tbl:null,user:0,calls:0,prov:new Set()};
      const st=[],A=(op,fn,tone)=>st.push({who:'A',op,fn,tone}),B=(op,fn,tone)=>st.push({who:'B',op,fn,tone}),Q=op=>st.push({who:'Q',op});
      const send=key=>s=>{s.calls++;if(key&&idem&&s.prov.has(key))return ['短信商认出幂等键 e42，返回上次结果，不再发送','ok'];if(key&&idem)s.prov.add(key);s.user++;return [`短信商接受 → 用户收到第 ${s.user} 条`,s.user>1?'bad':null]};
      const look=s=>[s.tbl?`查到「${s.tbl}」`:'没有记录',null];
      const mark=s=>{s.tbl='已发送';return ['完成',null]};
      const crash=()=>['进程退出','bad'];
      const KEY=md==='atomic'?'e42':null,sendOp=md==='atomic'?'调用短信商（幂等键 e42）':'调用短信商';
      if(cs==='crash'){
        if(md==='check')A('查去重表 e42',look);
        if(md==='atomic')A('原子占用 e42',s=>{s.tbl='发送中';return ['成功：状态＝发送中','ok']});
        A(sendOp,send(KEY));A(md==='none'?'崩溃：还没确认消息':'崩溃：还没更新状态',crash);
        Q('A 迟迟没有确认，可见性超时后队列把 e42 重新投给 B');
        if(md==='check')B('查去重表 e42',look);
        if(md==='atomic')B('原子占用 e42',s=>['占用已过期（A 没续约）→ B 接手；发没发出去不知道，只能重试','warn']);
        B(md==='atomic'?'调用短信商（同一幂等键 e42）':sendOp,send(KEY));
        B(md==='none'?'确认消息':'写入 e42＝已发送并确认',mark);
      }else if(cs==='race'){
        if(md==='none'){A(sendOp,send(KEY));B(sendOp,send(KEY))}
        if(md==='check'){A('查去重表 e42',look);B('查去重表 e42',look);A(sendOp,send(KEY));B(sendOp,send(KEY));A('写入 e42＝已发送',mark);B('写入 e42＝已发送',mark)}
        if(md==='atomic'){A('原子占用 e42',s=>{s.tbl='发送中';return ['成功：状态＝发送中','ok']});B('原子占用 e42',s=>['失败：A 正在处理 → 丢弃这次投递','ok']);A(sendOp,send(KEY));A('写入 e42＝已发送',mark)}
      }else{
        if(md==='check')A('查去重表 e42',look);
        if(md==='atomic')A('原子占用 e42',s=>{s.tbl='发送中';return ['成功：状态＝发送中','ok']});
        A(sendOp,send(KEY));if(md!=='none')A('写入 e42＝已发送',mark);
        A('确认消息',()=>['确认在网络上丢失','warn']);
        Q('队列没收到确认，稍后把 e42 重新投给 B');
        if(md==='none')B(sendOp,send(KEY));
        if(md==='check'){B('查去重表 e42',s=>[`查到「${s.tbl}」→ 丢弃这次投递`,'ok'])}
        if(md==='atomic'){B('原子占用 e42',s=>[`失败：状态已是「${s.tbl}」→ 丢弃这次投递`,'ok'])}
      }
      steps=st;idx=0;
      const narrow=grid.classList.contains('nd-narrow');
      grid.replaceChildren(h('div',{class:'hd ha'},narrow?'Worker A / B':'Worker A'),h('div',{class:'hd hm'},narrow?'状态':'去重表 / 用户收到'),h('div',{class:'hd hb'},'Worker B'));
      cells=steps.map((s,i)=>{
        const r={'--r':i+2};
        if(s.who==='Q'){const q=h('div',{class:'q future',style:r},h('span',{class:'sdl-tag info'},'队列'),s.op);grid.append(q);return {q,side:q}}
        const a=h('div',{class:'a future',style:r}),m=h('div',{class:'mid future',style:r}),b=h('div',{class:'b future',style:r});
        const side=s.who==='A'?a:b;side.append(h('span',{class:'sdl-tag'},s.who+(i+1)),h('span',null,s.op));
        grid.append(a,m,b);return {a,m,b,side};
      });
      verdict.textContent='点「下一步」逐步执行，或用「自动播放」。';nextBtn.disabled=false;idemCtl.el.style.opacity=md==='atomic'?1:.5;
      update();
    }
    function update(){stats.set('user',S.user,S.user>1?'bad':S.user===1?'ok':null);stats.set('calls',S.calls);stats.set('tbl',S.tbl||'无记录')}
    function step(){
      if(idx>=steps.length)return;
      const s=steps[idx],c=cells[idx];
      cells.forEach(x=>{for(const k of ['a','m','b','q'])if(x[k])x[k].classList.remove('cur')});
      for(const k of ['a','m','b','q'])if(c[k]){c[k].classList.remove('future');c[k].classList.add('cur')}
      if(s.fn){const [txt,tone]=s.fn(S);c.side.append(h('span',{class:'res'+(tone?' '+tone:'')},'→ '+txt));c.m.replaceChildren(h('span',null,`表：${S.tbl||'—'}`),h('span',null,`收到 ${S.user} 条`))}
      idx++;update();
      if(idx>=steps.length){nextBtn.disabled=true;verdict.textContent=explain();ctx.announce(verdict.textContent)}
    }
    function explain(){
      const two=S.user>1;
      const M={
        'crash-none':'用户收到 2 条。队列只保证「至少投递一次」，没确认的消息一定会再投。',
        'crash-check':'用户收到 2 条。A 在发送后、写表前崩溃，表里没有任何痕迹，B 查表只能看到「没有记录」。先查后发防不住「发出去了但没记下来」。',
        'crash-atomic':idem?'用户只收到 1 条。B 不知道 A 发没发，只能重试；因为重试带着同一个幂等键，短信商认出是重复请求，没有再发。':'用户收到 2 条。原子占用只能让 B 知道「有人处理过但结果未知」；第三方不支持幂等时，重试就会重复。这时系统只能承诺「至少一次」。',
        'race-none':'用户收到 2 条。',
        'race-check':'用户收到 2 条。两个 worker 都在对方写表之前查表，都看到「没有记录」。查询和写入之间的空隙就是竞态窗口。',
        'race-atomic':'用户只收到 1 条。占用本身是原子操作，只有一个 worker 能成功，另一个直接放弃。',
        'late-none':'用户收到 2 条。',
        'late-check':'用户只收到 1 条。A 已经把「已发送」写进表，之后的重复投递能被查出来。原文方案能处理这种情形，前两种不行。',
        'late-atomic':'用户只收到 1 条。状态已是「已发送」，重复投递直接丢弃。',
      };
      return M[cs+'-'+md]||(two?'用户收到 2 条。':'用户只收到 1 条。');
    }
    async function autoplay(){build();while(idx<steps.length){step();await ctx.wait(750)}}

    const caseCtl=ctx.segmented({label:'故障情形',wide:true,value:cs,options:Object.entries(CASES),onChange:v=>{cs=v;build()}});
    const modeCtl=ctx.segmented({label:'去重写法',wide:true,value:md,options:Object.entries(MODES),onChange:v=>{md=v;build()}});
    const idemCtl=ctx.toggle({label:'短信商支持幂等键（只对「原子占用 + 幂等键」有意义）',wide:true,value:idem,onChange:v=>{idem=v;build()}});
    const nextBtn=ctx.button('下一步',()=>step(),{primary:true});
    ctx.button('自动播放',()=>autoplay().catch(e=>{if(!(e&&e.abort))console.error(e)}));
    ctx.button('从头开始',()=>build());
    const grid=h('div',{class:'nd-grid',role:'table','aria-label':'执行步骤'});
    const verdict=h('p',{class:'sdl-note',style:{fontSize:'14px',margin:'10px 0 0',color:'#23352f'}});
    ctx.stage.append(grid,verdict);
    const stats=ctx.stats([{key:'user',label:'用户收到短信'},{key:'calls',label:'调用短信商次数'},{key:'tbl',label:'去重表中 e42'}]);
    ctx.onResize(w=>{const n=w<560;if(n!==grid.classList.contains('nd-narrow')){grid.classList.toggle('nd-narrow',n);const hd=grid.querySelector('.hd.ha');if(hd)hd.textContent=n?'Worker A / B':'Worker A';const hm=grid.querySelector('.hd.hm');if(hm)hm.textContent=n?'状态':'去重表 / 用户收到'}});
    build();

    const setAll=(c,m,i)=>{cs=c;md=m;idem=i;caseCtl.set(c,true);modeCtl.set(m,true);idemCtl.set(i,true)};
    ctx.scenarios([
      {id:'crash-check',label:'发送后崩溃 · 先查后发',
        ask:'Worker A 查表没有记录，发出短信后、写入「已发送」前崩溃；队列把 e42 重新投给 B。按原文「先查后发」，用户收到几条？',
        insight:'2 条。表里没有 A 发过的痕迹，B 查表只能看到「没有记录」。第三方已接受但响应丢失时也是同样的结果：发送和记录不是一个原子动作。',
        async run(){setAll('crash','check',true);await autoplay()}},
      {id:'race-check',label:'两个 worker 同时查',
        ask:'同一事件被同时投给 A 和 B，两边交替执行「查表 → 发送 → 写表」。用户收到几条？',
        insight:'2 条。两边都在对方写表前查询，都得到「没有记录」。要把「查」和「占」合成一个原子操作。',
        async run(){setAll('race','check',true);await autoplay()}},
      {id:'crash-atomic',label:'原子占用 + 幂等键',
        ask:'还是 A 发出后崩溃，但改成先原子占用 e42，并把 e42 作为幂等键传给短信商。B 接手重试后，用户收到几条？',
        insight:'1 条。B 无法知道 A 发没发，只能重试；靠的是短信商按同一个幂等键识别出重复请求。去重要靠原子占用、稳定幂等键和第三方的幂等能力一起完成。',
        async run(){setAll('crash','atomic',true);await autoplay()}},
      {id:'no-idem',label:'第三方不支持幂等',
        ask:'同样是原子占用，但短信商不支持幂等键。A 发出后崩溃，B 接手重试，用户收到几条？',
        insight:'2 条。原子占用只能防止两个 worker 同时处理，挡不住「结果未知只能重试」带来的重复。所以更准确的说法是「至少一次 + 尽力去重」，而不是承诺 exactly-once。',
        async run(){setAll('crash','atomic',false);await autoplay()}},
    ]);
  }
});
})();
