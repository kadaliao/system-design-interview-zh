/* Chapter 10: Notification System. Lab 1: per-channel queues, third-party outages, backoff retries, and expiry. Lab 2: why “check, then send” can’t stop duplicate notifications. */
(function(){
const {el:h,util}=SDLab;

/* ---------------- Lab 1: per-channel queues and third-party outages ---------------- */
SDLab.define({
  id:'notification-pipeline',chapter:10,
  title:'Per-Channel Queues Meet a Third-Party Outage',
  summary:'Notification events keep flowing into four queues (iOS, Android, SMS, email), each with its own workers calling its own third party. Click a channel’s provider button to inject an outage and see how backlog, backoff retries, and expiry trap the damage in that one pipeline; then switch to a shared queue and compare.',
  caveat:'Time advances in simulated seconds. A healthy third-party call takes 0.5 s; during an outage every call waits the full 8 s timeout. After a failure the worker retries with 1, 2, and 4 s backoff, and a 4th failure goes to the dead-letter queue; retries reuse the same event ID. Arrival rates are fixed: about 1.5 per second for each push channel, 1.2 per second for SMS, 1 per second for email; all SMS are treated as verification codes.',
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
    const CH=[{k:'ios',name:'iOS push',prov:'APNS',short:'APNS',rate:1.5,color:S2[0]},{k:'and',name:'Android push',prov:'FCM',short:'FCM',rate:1.5,color:S2[4]},{k:'sms',name:'SMS codes',prov:'SMS provider',short:'SMS',rate:1.2,color:S2[3]},{k:'mail',name:'Email',prov:'Email provider',short:'Email',rate:1,color:S2[5]}];
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
    function setDown(ch,v){down[ch]=v;ctx.log(`${CI[ch].prov}${v?' is down: calls will time out':' recovered'}`,v?'bad':'ok');dirty=true}
    function burst(n){for(let i=0;i<n;i++)push({id:++seq,ch:'mail',t0:now,att:0});ctx.log(`Campaign: ${n} emails enqueued at once`,'warn')}
    function tick(){
      now+=STEP;
      while(script.length&&script[0].t<=now+1e-9)script.shift().fn();
      for(const c of CH){while(now>=nextArr[c.k]){push({id:++seq,ch:c.k,t0:nextArr[c.k],att:0});nextArr[c.k]+=(0.5+rng())/c.rate}}
      for(const c of CH){const due=R[c.k].filter(r=>r.due<=now+1e-9);if(due.length){R[c.k]=R[c.k].filter(r=>r.due>now+1e-9);for(const r of due)push(r.ev)}}
      for(const w of wk){
        if(w.ev&&now>=w.end-1e-9){
          const ev=w.ev,st=St[ev.ch];w.ev=null;
          if(!w.fail)st.ok++;
          else if(ev.att>=MAXATT){st.dead++;ctx.log(`${CI[ev.ch].name} #${ev.id} still failing after attempt ${ev.att} → dead letter`,'bad')}
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

    /* ---- Controls ---- */
    const modeCtl=ctx.segmented({label:'Queue layout',value:P.mode,options:[['split','One queue per channel'],['shared','Shared by all channels']],onChange:v=>{P.mode=v;restart()}});
    const speedCtl=ctx.segmented({label:'Speed',value:1,options:[[0,'Pause'],[1,'1×'],[2,'2×'],[4,'4×']],onChange:v=>{P.speed=v}});
    const wCtl=ctx.slider({label:'Workers per channel',min:1,max:4,value:P.workers,format:v=>P.mode==='split'?String(v):v+' (shared pool of '+v*4+')',onChange:v=>{P.workers=v;restart()}});
    const tCtl=ctx.toggle({label:`Discard verification codes after ${TTL} s instead of sending`,value:P.ttl,onChange:v=>{P.ttl=v}});
    ctx.button('Campaign: enqueue 40 emails at once',()=>{burst(40);dirty=true},{primary:true});
    ctx.button('Restart',()=>restart());

    /* ---- Stage ---- */
    const wrap=h('div');
    const pool=h('div',{class:'np-pool'},h('div',{class:'ph'},'Shared worker pool: whichever worker is free takes the next item from the shared queue'));const poolWs=h('div',{class:'np-ws'});pool.append(poolWs);
    const lanesBox=h('div',{class:'np-lanes'});
    const lanes={};
    for(const c of CH){
      const q=h('div',{class:'np-q','aria-hidden':'true'}),ws=h('div',{class:'np-ws'}),nums=h('div',{class:'np-nums'});
      const btn=h('button',{type:'button',class:'np-p ok',title:'Click to toggle outage / recovery',onclick:()=>{setDown(c.k,!down[c.k])}});
      const spark=ctx.svgEl('svg',{class:'np-spark',viewBox:'0 0 60 26',preserveAspectRatio:'none','aria-hidden':'true'});
      const line=ctx.svgEl('polyline',{fill:'none',stroke:c.color,'stroke-width':2,'vector-effect':'non-scaling-stroke',points:''});spark.append(line);
      const sq=util.range(28).map(()=>{const i=h('i');q.append(i);return i});const more=h('span',{class:'more'}),none=h('span',{class:'none'},'Queue empty');q.append(more,none);
      const lane=h('div',{class:'np-lane'},h('div',{class:'np-lbl'},h('span',{style:{color:c.color}},'■ '),c.name,h('small',null,'→ '+c.prov)),q,ws,btn,h('div',{class:'np-info'},nums,spark));
      lanes[c.k]={lane,sq,more,none,ws,nums,btn,line,wEls:[]};lanesBox.append(lane);
    }
    const scaleNote=h('span');
    wrap.append(pool,lanesBox,h('div',{class:'np-legend'},h('span',null,h('i',{style:{background:'#b9c5bd'}}),'Queued'),h('span',null,h('i',{style:{background:'#e0b35a'}}),'Backing off, retry later'),h('span',null,h('i',{style:{background:'#dde9f6'}}),'Worker sending'),h('span',null,h('i',{style:{background:'#f7dedb'}}),'Worker waiting for timeout'),scaleNote));
    ctx.stage.append(wrap);
    ctx.onResize(w=>wrap.classList.toggle('np-narrow',w<620));
    const stats=ctx.stats([{key:'ok',label:'Accepted by provider'},{key:'retry',label:'Retries'},{key:'exp',label:'Codes expired'},{key:'dead',label:'Dead letters'},{key:'wait',label:'Longest wait, healthy channels'}]);

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
        L.btn.textContent=`${c.short}: ${down[c.k]?'down':'up'}`;L.btn.className='np-p '+(down[c.k]?'bad':'ok');L.lane.classList.toggle('down',down[c.k]);
        const age=oldest(c.k);
        L.nums.replaceChildren(h('span',null,'Queued ',h('b',{class:n>10?'bad':n>4?'warn':null},n),' · oldest ',h('b',{class:age>5?'bad':age>2?'warn':null},age.toFixed(1)+' s'),' · accepted ',h('b',{class:'ok'},st.ok),
          st.retry?[' · retries ',h('b',{class:'warn'},st.retry)]:null,st.exp?[' · expired ',h('b',{class:'warn'},st.exp)]:null,st.dead?[' · dead ',h('b',{class:'bad'},st.dead)]:null));
      }
      const top=Math.max(8,...CH.map(c=>Math.max(0,...hist[c.k])));
      for(const c of CH){const a=hist[c.k];lanes[c.k].line.setAttribute('points',a.map((v,i)=>`${60-(a.length-1-i)} ${24-22*v/top}`).join(' '))}
      scaleNote.textContent=`Line: backlog over the last 30 s (y-axis max ${top})`;
      for(const w of wk){const el=w.el;if(!el)continue;
        if(!w.ev){el.className='np-w';el.textContent='Idle';el.style.borderColor=''}
        else{el.className='np-w '+(w.fail?'wait':'send');el.textContent=w.fail?`Waiting ${Math.max(0,w.end-now).toFixed(1)}`:'Sending';el.style.borderColor=P.mode==='shared'?CI[w.ev.ch].color:''}}
      let ok=0,re=0,ex=0,de=0,wmax=0;for(const c of CH){const st=St[c.k];ok+=st.ok;re+=st.retry;ex+=st.exp;de+=st.dead;if(!down[c.k])wmax=Math.max(wmax,oldest(c.k))}
      stats.set('ok',util.fmt(ok),'ok');stats.set('retry',re,re?'warn':null);stats.set('exp',ex,ex?'warn':null);stats.set('dead',de,de?'bad':null);stats.set('wait',wmax.toFixed(1)+' s',wmax>5?'bad':wmax>2?'warn':'ok');
    }
    let acc=0,simAcc=0;
    ctx.loop(dt=>{
      if(P.speed){simAcc+=dt*P.speed;while(simAcc>=STEP-1e-9){tick();simAcc-=STEP}}
      acc+=dt;if(acc>=1/15){acc=0;render()}
    });
    function restart(){reset();simAcc=0;layoutWorkers();wCtl.set(P.workers,true);render();ctx.clearLog();ctx.log(`Started: ${P.mode==='split'?'one queue per channel':'one queue shared by all channels'}, ${wk.length} workers in total`,'info')}
    restart();

    async function prepare(o){
      Object.assign(P,{mode:'split',workers:2,ttl:true,speed:4},o);modeCtl.set(P.mode,true);tCtl.set(P.ttl,true);speedCtl.set(P.speed,true);restart();
    }
    const until=async t=>{while(now<t)await ctx.wait(100);await ctx.wait(300)};
    const outage=()=>{script=[{t:3,fn:()=>setDown('sms',true)},{t:19,fn:()=>setDown('sms',false)}]};
    function summary(){const o=['ios','and','mail'].map(k=>St[k].peakWait);return `SMS backlog peaked at ${St.sms.peakQ}, ${St.sms.exp} expired, ${St.sms.retry} retries, ${St.sms.dead} dead letters; push and email waited at most ${Math.max(...o).toFixed(1)} s`}
    ctx.scenarios([
      {id:'sms-down',label:'SMS provider down for 16 s',
        ask:'From second 3 the SMS provider is down for 16 s, and every call waits out the 8 s timeout. Are push and email waits affected? After recovery, will all the backlogged codes be sent?',
        insight:'Only SMS backs up: its queue peaks at 17 items, while push and email wait almost 0 s. During the outage the 2 SMS workers are stuck for the full 8 s on every call, and failed notifications retry after 1, 2, and 4 s of backoff. After recovery the backlog drains quickly, and 4 codes older than 15 s are discarded rather than arriving late. Per-channel queues keep one third party’s failure inside its own pipeline.',
        async run(){await prepare({});outage();await until(36);ctx.log('This run: '+summary(),'info');ctx.openLog(true)}},
      {id:'shared',label:'Switch to a shared queue',
        ask:'Same outage, but all four channels share one queue and 8 workers. Can push and email still go out within 1 s?',
        insight:'Push and email suffer: they wait up to 6.7 s, versus almost 0 with separate queues. With 8 workers shared, more and more get stuck on SMS timeouts, and the push and email items queued behind them just wait; SMS itself does worse too, with 15 retries and 6 expired. Giving each kind of notification its own queue exists precisely so that one third party’s outage doesn’t spread to other channels.',
        async run(){await prepare({mode:'shared'});outage();await until(36);ctx.log('This run: '+summary(),'info');ctx.openLog(true)}},
      {id:'burst',label:'Marketing email spike',
        ask:'40 marketing emails are enqueued at once. The email channel has 2 workers at 0.5 s each, so at most 4 emails per second, while about 1 new email per second keeps arriving. Roughly how long until the queue drains? Will push slow down?',
        insight:'The email backlog fell from 39 to 1 in about 11.6 s: the queue absorbed the spike, but sending still runs at 4 emails per second minus the new emails that keep arriving, so it drains slowly. Push’s longest wait stays near 0, unaffected. Draining faster depends on the third party’s quota and worker throughput; the queue itself adds no processing capacity.',
        async run(){await prepare({});script=[{t:2,fn:()=>burst(40)}];await until(2.2);let t0=now;while(now<30&&(Q.mail.length>2||now<4))await ctx.wait(100);ctx.log(`Email backlog fell from ${St.mail.peakQ} to ${Q.mail.length} in ${(now-t0).toFixed(1)} s; push waited at most ${Math.max(St.ios.peakWait,St.and.peakWait).toFixed(1)} s`,'info');ctx.openLog(true);await ctx.wait(400)}},
    ]);
  }
});

/* ---------------- Lab 2: why check-then-send is not enough ---------------- */
SDLab.define({
  id:'notification-dedup',chapter:10,
  title:'Why “Check, Then Send” Can’t Stop Duplicates',
  summary:'The queue delivers the same event, e42, twice. Step through three failure cases (a crash after sending, two workers at once, a lost acknowledgement) and see how many SMS the user gets under each deduplication approach.',
  caveat:'“Dedup table” means the per-event-ID processing state kept in the notification log. An “atomic claim” can be an INSERT with a unique constraint or a Redis SET NX, with an expiry so another worker can take over if the holder crashes. “Third-party idempotency” means the SMS provider recognizes duplicate requests by idempotency key and returns the earlier result.',
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
    const CASES={crash:'A crashes after sending',race:'A and B at once',late:'A finishes, ack lost'};
    const MODES={none:'No dedup',check:'Check, then send (source’s approach)',atomic:'Atomic claim + idempotency key'};
    let cs='crash',md='check',idem=true,steps=[],idx=0,S,cells=[];
    function build(){
      S={tbl:null,user:0,calls:0,prov:new Set()};
      const st=[],A=(op,fn,tone)=>st.push({who:'A',op,fn,tone}),B=(op,fn,tone)=>st.push({who:'B',op,fn,tone}),Q=op=>st.push({who:'Q',op});
      const send=key=>s=>{s.calls++;if(key&&idem&&s.prov.has(key))return ['Provider recognizes idempotency key e42, returns the earlier result, sends nothing','ok'];if(key&&idem)s.prov.add(key);s.user++;return [`Provider accepts → user gets SMS #${s.user}`,s.user>1?'bad':null]};
      const look=s=>[s.tbl?`Found “${s.tbl}”`:'No record',null];
      const mark=s=>{s.tbl='sent';return ['Done',null]};
      const crash=()=>['Process exits','bad'];
      const KEY=md==='atomic'?'e42':null,sendOp=md==='atomic'?'Call SMS provider (idempotency key e42)':'Call SMS provider';
      if(cs==='crash'){
        if(md==='check')A('Check dedup table for e42',look);
        if(md==='atomic')A('Atomically claim e42',s=>{s.tbl='in progress';return ['Success: state = in progress','ok']});
        A(sendOp,send(KEY));A(md==='none'?'Crash: message not yet acked':'Crash: state not yet updated',crash);
        Q('A never acks; after the visibility timeout the queue redelivers e42 to B');
        if(md==='check')B('Check dedup table for e42',look);
        if(md==='atomic')B('Atomically claim e42',s=>['Claim expired (A didn’t renew) → B takes over; whether it was sent is unknown, so it must retry','warn']);
        B(md==='atomic'?'Call SMS provider (same idempotency key e42)':sendOp,send(KEY));
        B(md==='none'?'Ack the message':'Write e42 = sent, then ack',mark);
      }else if(cs==='race'){
        if(md==='none'){A(sendOp,send(KEY));B(sendOp,send(KEY))}
        if(md==='check'){A('Check dedup table for e42',look);B('Check dedup table for e42',look);A(sendOp,send(KEY));B(sendOp,send(KEY));A('Write e42 = sent',mark);B('Write e42 = sent',mark)}
        if(md==='atomic'){A('Atomically claim e42',s=>{s.tbl='in progress';return ['Success: state = in progress','ok']});B('Atomically claim e42',s=>['Failed: A is processing → drop this delivery','ok']);A(sendOp,send(KEY));A('Write e42 = sent',mark)}
      }else{
        if(md==='check')A('Check dedup table for e42',look);
        if(md==='atomic')A('Atomically claim e42',s=>{s.tbl='in progress';return ['Success: state = in progress','ok']});
        A(sendOp,send(KEY));if(md!=='none')A('Write e42 = sent',mark);
        A('Ack the message',()=>['The ack is lost on the network','warn']);
        Q('The queue gets no ack and later redelivers e42 to B');
        if(md==='none')B(sendOp,send(KEY));
        if(md==='check'){B('Check dedup table for e42',s=>[`Found “${s.tbl}” → drop this delivery`,'ok'])}
        if(md==='atomic'){B('Atomically claim e42',s=>[`Failed: state is already “${s.tbl}” → drop this delivery`,'ok'])}
      }
      steps=st;idx=0;
      const narrow=grid.classList.contains('nd-narrow');
      grid.replaceChildren(h('div',{class:'hd ha'},narrow?'Worker A / B':'Worker A'),h('div',{class:'hd hm'},narrow?'State':'Dedup table / user got'),h('div',{class:'hd hb'},'Worker B'));
      cells=steps.map((s,i)=>{
        const r={'--r':i+2};
        if(s.who==='Q'){const q=h('div',{class:'q future',style:r},h('span',{class:'sdl-tag info'},'Queue'),s.op);grid.append(q);return {q,side:q}}
        const a=h('div',{class:'a future',style:r}),m=h('div',{class:'mid future',style:r}),b=h('div',{class:'b future',style:r});
        const side=s.who==='A'?a:b;side.append(h('span',{class:'sdl-tag'},s.who+(i+1)),h('span',null,s.op));
        grid.append(a,m,b);return {a,m,b,side};
      });
      verdict.textContent='Click “Next step” to go one step at a time, or use “Autoplay”.';nextBtn.disabled=false;idemCtl.el.style.opacity=md==='atomic'?1:.5;
      update();
    }
    function update(){stats.set('user',S.user,S.user>1?'bad':S.user===1?'ok':null);stats.set('calls',S.calls);stats.set('tbl',S.tbl||'none')}
    function step(){
      if(idx>=steps.length)return;
      const s=steps[idx],c=cells[idx];
      cells.forEach(x=>{for(const k of ['a','m','b','q'])if(x[k])x[k].classList.remove('cur')});
      for(const k of ['a','m','b','q'])if(c[k]){c[k].classList.remove('future');c[k].classList.add('cur')}
      if(s.fn){const [txt,tone]=s.fn(S);c.side.append(h('span',{class:'res'+(tone?' '+tone:'')},'→ '+txt));c.m.replaceChildren(h('span',null,`Table: ${S.tbl||'—'}`),h('span',null,`User got ${S.user}`))}
      idx++;update();
      if(idx>=steps.length){nextBtn.disabled=true;verdict.textContent=explain();ctx.announce(verdict.textContent)}
    }
    function explain(){
      const two=S.user>1;
      const M={
        'crash-none':'The user gets 2 SMS. A queue only promises at-least-once delivery, so a message that was never acked will always be delivered again.',
        'crash-check':'The user gets 2 SMS. A crashed after sending but before writing the table, so there is no trace, and B’s lookup can only see “no record.” Check-then-send can’t catch “sent but not recorded.”',
        'crash-atomic':idem?'The user gets 1 SMS. B can’t know whether A sent it, so it must retry; because the retry carries the same idempotency key, the provider recognizes a duplicate and doesn’t send again.':'The user gets 2 SMS. An atomic claim only tells B that “someone handled this, outcome unknown”; if the third party doesn’t support idempotency, the retry creates a duplicate. All the system can promise then is at-least-once.',
        'race-none':'The user gets 2 SMS.',
        'race-check':'The user gets 2 SMS. Both workers check the table before the other writes to it, and both see “no record.” The gap between the check and the write is the race window.',
        'race-atomic':'The user gets 1 SMS. The claim itself is atomic, so only one worker succeeds and the other simply gives up.',
        'late-none':'The user gets 2 SMS.',
        'late-check':'The user gets 1 SMS. A has already written “sent” to the table, so the later duplicate delivery is caught. The source’s approach handles this case, but not the first two.',
        'late-atomic':'The user gets 1 SMS. The state is already “sent,” so the duplicate delivery is simply dropped.',
      };
      return M[cs+'-'+md]||(two?'The user gets 2 SMS.':'The user gets 1 SMS.');
    }
    async function autoplay(){build();while(idx<steps.length){step();await ctx.wait(750)}}

    const caseCtl=ctx.segmented({label:'Failure case',wide:true,value:cs,options:Object.entries(CASES),onChange:v=>{cs=v;build()}});
    const modeCtl=ctx.segmented({label:'Dedup approach',wide:true,value:md,options:Object.entries(MODES),onChange:v=>{md=v;build()}});
    const idemCtl=ctx.toggle({label:'Provider supports idempotency keys (matters only for “atomic claim + idempotency key”)',wide:true,value:idem,onChange:v=>{idem=v;build()}});
    const nextBtn=ctx.button('Next step',()=>step(),{primary:true});
    ctx.button('Autoplay',()=>autoplay().catch(e=>{if(!(e&&e.abort))console.error(e)}));
    ctx.button('Start over',()=>build());
    const grid=h('div',{class:'nd-grid',role:'table','aria-label':'Execution steps'});
    const verdict=h('p',{class:'sdl-note',style:{fontSize:'14px',margin:'10px 0 0',color:'#23352f'}});
    ctx.stage.append(grid,verdict);
    const stats=ctx.stats([{key:'user',label:'SMS the user received'},{key:'calls',label:'Calls to SMS provider'},{key:'tbl',label:'e42 in dedup table'}]);
    ctx.onResize(w=>{const n=w<560;if(n!==grid.classList.contains('nd-narrow')){grid.classList.toggle('nd-narrow',n);const hd=grid.querySelector('.hd.ha');if(hd)hd.textContent=n?'Worker A / B':'Worker A';const hm=grid.querySelector('.hd.hm');if(hm)hm.textContent=n?'State':'Dedup table / user got'}});
    build();

    const setAll=(c,m,i)=>{cs=c;md=m;idem=i;caseCtl.set(c,true);modeCtl.set(m,true);idemCtl.set(i,true)};
    ctx.scenarios([
      {id:'crash-check',label:'Crash after sending · check-then-send',
        ask:'Worker A finds no record, sends the SMS, and crashes before writing “sent”; the queue redelivers e42 to B. With the source’s check-then-send, how many SMS does the user get?',
        insight:'2. The table holds no trace that A sent anything, so B’s lookup can only see “no record.” The same happens when the third party accepts but the response is lost: sending and recording are not one atomic action.',
        async run(){setAll('crash','check',true);await autoplay()}},
      {id:'race-check',label:'Two workers check at once',
        ask:'The same event is delivered to A and B at the same time, and both interleave “check table → send → write table.” How many SMS does the user get?',
        insight:'2. Both query before the other writes, so both get “no record.” The “check” and the “claim” must be merged into one atomic operation.',
        async run(){setAll('race','check',true);await autoplay()}},
      {id:'crash-atomic',label:'Atomic claim + idempotency key',
        ask:'A still crashes after sending, but now it first atomically claims e42 and passes e42 to the SMS provider as the idempotency key. After B takes over and retries, how many SMS does the user get?',
        insight:'1. B can’t know whether A sent it and has to retry; what saves the day is the provider recognizing the duplicate by the same idempotency key. Deduplication takes an atomic claim, a stable idempotency key, and the third party’s idempotency support working together.',
        async run(){setAll('crash','atomic',true);await autoplay()}},
      {id:'no-idem',label:'Third party lacks idempotency',
        ask:'Same atomic claim, but the SMS provider doesn’t support idempotency keys. A crashes after sending and B takes over and retries. How many SMS does the user get?',
        insight:'2. An atomic claim only stops two workers from processing at the same time; it can’t stop the duplicate caused by “outcome unknown, so retry.” The more accurate promise is “at-least-once plus best-effort dedup,” not exactly-once.',
        async run(){setAll('crash','atomic',false);await autoplay()}},
    ]);
  }
});
})();
