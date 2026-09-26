/* 第 23 章：分布式邮件服务。一个实验同时画发信与收信两条链路：追踪一封发出的信和一封收到的信，按队列水位定位问题。 */
(function(){
const {el:h}=SDLab;

SDLab.define({
  id:'mail-pipeline',chapter:23,
  title:'一封邮件的旅程与队列水位',
  summary:'左边是本站的发信链路，右边是收信与建索引链路，每一段都有自己的队列水位。追踪发出的 E7 和收到的 M9：看每个「成功」各自证明了什么；调慢索引消费者或让对方限流，再按水位找出卡在哪一段。',
  caveat:'每 0.1 秒推进一步；收、发各 30 封/秒的背景流量是缩小后的教学数字。被 4xx 拒绝的邮件固定 3 秒后重试（未画指数退避）；ES 每 1 秒 refresh 一次；只画一个 Kafka 分区，不画反垃圾、退信和 Bulk 部分失败。',
  mount(ctx){
    ctx.css('mp',`
.mp-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.mp-one .mp-cols,.mp-one .mp-cards{grid-template-columns:minmax(0,1fr)}
.mp-col{border:1px solid #dbe2da;border-radius:10px;background:#fbfcfa;padding:8px 10px 10px;min-width:0}
.mp-h{margin:0 0 6px;font-size:13px;color:#23352f;font-weight:700;line-height:1.4}
.mp-h small{font-weight:400;color:#66756d;font-size:12px;margin-left:4px}
.mp-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;align-items:center;background:#fff;border:1px solid #e3e9e1;border-radius:8px;padding:6px 9px;transition:box-shadow .25s,opacity .25s}
.mp-row.ext{background:transparent;border-style:dashed}
.mp-row.hot{box-shadow:0 0 0 2px #c2413b}
.mp-row.good{box-shadow:0 0 0 2px #2f8f5b}
.mp-row.unk{box-shadow:0 0 0 2px #b7791f}
.mp-row.dim{opacity:.4}
.mp-name{font-size:13px;font-weight:650;line-height:1.35;min-width:0}
.mp-name small{display:block;font-weight:400;color:#66756d;font-size:12px}
.mp-meter{font-size:12px;color:#66756d;font-variant-numeric:tabular-nums;text-align:right;line-height:1.4;min-width:112px}
.mp-meter b{color:#23352f;font-weight:650}
.mp-meter .bad{color:#c2413b;font-weight:650}
.mp-bar{height:7px;border-radius:4px;background:#e6eee2;margin-top:3px;overflow:hidden}
.mp-bar i{display:block;height:100%;width:0;border-radius:4px;background:#2f8f5b;transition:width .15s}
.mp-bar i.warn{background:#b7791f}.mp-bar i.bad{background:#c2413b}
.mp-toks{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:4px}
.mp-toks:empty{display:none}
.mp-tok{font-size:12px;font-weight:650;border-radius:6px;padding:0 7px;line-height:1.75}
.mp-tok.e7{background:#dde9f6;color:#24558a}
.mp-tok.m9{background:#ece4f6;color:#5b3f96}
.mp-arrow{font-size:12px;color:#9aa89f;text-align:center;line-height:1;margin:2px 0}
.mp-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:10px}
.mp-card{border:1px solid #dbe2da;border-radius:10px;padding:8px 10px;font-size:13px;min-width:0}
.mp-ms{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 10px;align-items:baseline;margin:0}
.mp-ms dt{margin:0;line-height:1.45}.mp-ms dd{margin:0;text-align:right}
.mp-result{margin-top:10px;padding:7px 10px;border-radius:8px;font-size:13px;background:#f0f4ed;color:#23352f}
.mp-result.bad{background:#f7dedb;color:#9b2c27}.mp-result.ok{background:#dcefe2;color:#1d6a41}
`);
    const P={W:8,remote:'normal',C:45,speed:1};
    let S,stopAt=Infinity,gen=0;
    const fresh=()=>({tick:0,oq:0,wAcc:0,retry:[],r250:[],r4xx:[],ratt:[],sp:0,logEnd:4200,cons:4200,search:4200,cAcc:0,e7:null,m9:null,diag:{},result:null});
    S=fresh();

    /* ---- 舞台 ---- */
    const rowEls={};
    function row(key,name,sub,opt={}){
      const nm=h('div',{class:'mp-name'},h('span',{class:'nm'},name),h('small',null,sub));
      const meter=h('div',{class:'mp-meter'});
      const toks=h('div',{class:'mp-toks'});
      const el=h('div',{class:'mp-row'+(opt.ext?' ext':'')},nm,meter,toks);
      rowEls[key]={el,nm:nm.querySelector('.nm'),sub:nm.querySelector('small'),meter,toks,tk:'',mk:''};
      return el;
    }
    const arrow=()=>h('div',{class:'mp-arrow','aria-hidden':'true'},'↓');
    const outCol=h('section',{class:'mp-col'},h('p',{class:'mp-h'},'发信链路',h('small',null,'alice@本站 → bob@other.com')),
      row('o-api','Web API','校验后返回「已排队」'),arrow(),
      row('o-q','发信队列','等待出站 worker；含 4xx 后待重试'),arrow(),
      row('o-w','SMTP 出站 worker','每个 5 封/秒'),arrow(),
      row('o-remote','对方服务器 other.com','完整 DATA 之后回 250'),arrow(),
      row('o-ext','对方邮箱与收件人','进没进收件箱、读没读：本站看不见',{ext:true}));
    const inCol=h('section',{class:'mp-col'},h('p',{class:'mp-h'},'收信链路',h('small',null,'外部 → carol@本站')),
      row('i-smtp','SMTP 接入','完整邮件持久化后才回 250'),arrow(),
      row('i-spool','收件队列 spool','等待处理 worker'),arrow(),
      row('i-store','处理 worker → 邮件主存','写入后收件箱可见，并发出索引事件'),arrow(),
      row('i-kafka','索引事件（Kafka 分区 P）','日志末尾 offset'),arrow(),
      row('i-cons','索引消费者','把事件写入 Elasticsearch'),arrow(),
      row('i-es','ES refresh','每 1 秒刷新，之后才搜得到'));
    const cardE=h('div',{class:'mp-card'}),cardM=h('div',{class:'mp-card'});
    const result=h('div',{class:'mp-result'},'点「Carol 搜索 M9」，看刚收到的信能不能搜到。');
    const wrap=h('div',null,h('div',{class:'mp-cols'},outCol,inCol),h('div',{class:'mp-cards'},cardE,cardM),result);
    ctx.stage.append(wrap);
    ctx.onResize(w=>wrap.classList.toggle('mp-one',w<660));
    const stats=ctx.stats([{key:'obk',label:'发信积压'},{key:'r4xx',label:'对方 4xx / 秒'},{key:'lag',label:'索引积压（末尾 − 已处理）'},{key:'m9',label:'M9 能否搜到'}]);

    /* ---- 控件 ---- */
    const speedCtl=ctx.segmented({label:'播放',value:1,options:[[0,'暂停'],[1,'1×'],[2,'2×']],onChange:v=>{P.speed=v;stopAt=Infinity;if(v)lp.start()}});
    const wCtl=ctx.slider({label:'出站 worker 数',min:2,max:16,value:P.W,format:v=>`${v} 个 · ${v*5} 封/秒`,onInput:v=>{P.W=v;draw(true)}});
    const rCtl=ctx.segmented({label:'对方服务器 other.com',value:P.remote,options:[['normal','正常接收'],['throttle','限流 20 封/秒']],onChange:v=>{P.remote=v;draw(true)}});
    const cCtl=ctx.slider({label:'索引消费者能力',min:5,max:60,value:P.C,format:v=>v+' 封/秒',onInput:v=>{P.C=v;draw(true)}});
    ctx.button('发出 E7 并追踪',()=>{sendE7();draw(true)},{primary:true});
    ctx.button('收到 M9 并追踪',()=>{recvM9();draw(true)});
    ctx.button('Carol 搜索 M9',()=>{search();draw(true)});

    /* ---- 模型：每步 0.1 秒 ---- */
    const sum=a=>a.reduce((s,x)=>s+x,0);
    const push10=(a,v)=>{a.push(v);if(a.length>10)a.shift()};
    const SMTP=[['MAIL FROM:<alice@本站>','250'],['RCPT TO:<bob@other.com>','250'],['DATA','354 开始发送正文'],['正文（以单独一行「.」结束）','250 已接受']];
    function sendE7(){S.e7={st:'queued',ahead:S.oq,t0:S.tick,tries:0,step:0};ctx.log(`E7：Web API 校验通过，返回「已排队」（前面 ${S.oq} 封）`,'info')}
    function recvM9(){S.m9={st:'smtp',next:S.tick+3,t0:S.tick};ctx.log('M9：外部服务器开始向本站 SMTP 接入投递','info')}
    function stepTick(){
      S.tick++;
      /* 发信：到期重试回队 → 新邮件到达 → worker 尝试投递 → 对方接受或 4xx */
      let back=0;S.retry=S.retry.filter(r=>{if(r.due<=S.tick){back+=r.n;return false}return true});
      S.oq+=back;
      const e=S.e7;
      if(e&&e.st==='retry'&&e.due<=S.tick){e.st='queued';e.ahead=S.oq;ctx.log(`E7：重新进入发信队列（第 ${e.tries+1} 次尝试，前面 ${S.oq} 封）`)}
      S.oq+=3;
      S.wAcc+=P.W;const cap=Math.floor(S.wAcc/2);S.wAcc-=cap*2;
      const e7q=!!(e&&e.st==='queued');
      const att=Math.min(cap,S.oq+(e7q?1:0)),acc=P.remote==='throttle'?Math.min(att,2):att;
      let e7att=false,e7ok=false;
      if(e7q){if(e.ahead<att){e7att=true;e7ok=e.ahead<acc}else e.ahead-=att}
      S.oq-=att-(e7att?1:0);
      const rej=att-acc-(e7att&&!e7ok?1:0);
      if(rej>0)S.retry.push({due:S.tick+30,n:rej});
      push10(S.r250,acc);push10(S.r4xx,att-acc);push10(S.ratt,att);
      if(e7att){e.st='smtp';e.ok=e7ok;e.step=0;e.next=S.tick;e.tries++}
      if(e&&e.st==='smtp'&&S.tick>=e.next){
        if(!e.ok){e.st='retry';e.due=S.tick+30;e.sess='';ctx.log('E7 → other.com：MAIL FROM → 451 稍后再试（对方限流），3 秒后重试','warn')}
        else{const [c,r]=SMTP[e.step];e.sess=`${c.split(':')[0].split('（')[0]} → ${r.split(' ')[0]}`;ctx.log(`E7 → other.com：${c} → ${r}`,e.step===3?'ok':null);e.step++;e.next=S.tick+5;
          if(e.step===4){e.st='done';e.t250=S.tick;ctx.log('E7：对方接下投递责任。它进没进收件箱、Bob 读没读，SMTP 都不会告诉本站','warn')}}
      }
      /* 收信：SMTP 接入 → spool → 主存 + 索引事件 → 消费者 → refresh */
      const m=S.m9;
      if(m&&m.st==='smtp'&&S.tick>=m.next){m.st='spool';m.ahead=S.sp;m.t250=S.tick;ctx.log('M9：SMTP 接入把完整邮件写入 spool 后回 250')}
      S.sp+=3;
      const m9s=!!(m&&m.st==='spool'),served=Math.min(6,S.sp+(m9s?1:0));
      let m9done=false;
      if(m9s){if(m.ahead<served){m9done=true;m.offset=S.logEnd+m.ahead+1;m.st='stored';m.tStored=S.tick}else m.ahead-=served}
      S.sp-=served-(m9done?1:0);S.logEnd+=served;
      if(m9done)ctx.log(`M9：写入邮件主存，Carol 的收件箱已能看到；索引事件在分区 P 的 offset ${m.offset}`,'ok');
      S.cAcc+=P.C;const cc=Math.floor(S.cAcc/10);S.cAcc-=cc*10;S.cons=Math.min(S.logEnd,S.cons+cc);
      if(m&&m.st==='stored'&&S.cons>=m.offset){m.st='indexed';m.tIdx=S.tick;ctx.log(`M9：消费者处理到 ${m.offset}，已写入 ES，等下一次 refresh`)}
      if(S.tick%10===0){S.search=S.cons;if(m&&m.st==='indexed'&&S.search>=m.offset){m.st='search';m.tSearch=S.tick;ctx.log('M9：refresh 后进入可搜索水位','ok')}}
    }
    const retryN=()=>sum(S.retry.map(r=>r.n));
    const backlog=()=>S.oq+retryN()+(S.e7&&(S.e7.st==='queued'||S.e7.st==='retry')?1:0);
    function search(){
      const m=S.m9;let tone='bad',text;
      if(!m)text='还没有追踪 M9。先点「收到 M9 并追踪」。';
      else if(m.st==='search'){tone='ok';text=`找到 M9：offset ${m.offset} 已在可搜索水位 ${S.search} 之内。`}
      else if(m.st==='smtp'||m.st==='spool')text='没有结果：M9 还没写进邮件主存，收件箱里也还看不到。';
      else text=`没有结果。M9 已在收件箱里，但它的索引事件在 offset ${m.offset}，可搜索水位只到 ${S.search}`+(m.st==='indexed'?'；已写入 ES，等下一次 refresh。':`，消费者才处理到 ${S.cons}。`);
      S.result={tone,text};ctx.log('Carol 搜索 M9：'+text,tone);ctx.announce(text);
    }

    /* ---- 渲染 ---- */
    const secs=t=>'+'+(t/10).toFixed(1)+' 秒';
    function setMeter(k,html,bar){
      const r=rowEls[k];const key=html+'|'+(bar?bar.join():'');if(r.mk===key)return;r.mk=key;
      r.meter.innerHTML=html;
      if(bar){const [v,max]=bar,f=Math.min(1,v/max);const i=h('i',{class:f>.6?'bad':f>.25?'warn':null,style:{width:(f*100).toFixed(1)+'%'}});r.meter.append(h('div',{class:'mp-bar'},i))}
    }
    function setToks(k,list){const r=rowEls[k];const key=list.map(x=>x.join()).join('|');if(r.tk===key)return;r.tk=key;r.toks.replaceChildren(...list.map(([c,t])=>h('span',{class:'mp-tok '+c},t)))}
    let cardKey='';
    function draw(force){
      const e=S.e7,m=S.m9,ok=sum(S.r250),bad=sum(S.r4xx),att=sum(S.ratt),lag=S.logEnd-S.cons;
      rowEls['o-w'].nm.textContent=`SMTP 出站 worker × ${P.W}`;rowEls['o-w'].sub.textContent=`每个 5 封/秒，共 ${P.W*5} 封/秒`;
      rowEls['o-remote'].sub.textContent=P.remote==='throttle'?'限流：每秒只接受 20 封，其余回 4xx':'完整 DATA 之后回 250';
      rowEls['i-cons'].nm.textContent=`索引消费者 · ${P.C} 封/秒`;
      setMeter('o-api','到达 <b>30</b> 封/秒');
      setMeter('o-q',`积压 <b>${backlog()}</b>`+(retryN()?` · 待重试 ${retryN()}`:''),[backlog(),400]);
      setMeter('o-w',`尝试 <b>${att}</b> 封/秒`);
      setMeter('o-remote',`250：<b>${ok}</b>/秒 · 4xx：<span class="${bad?'bad':''}">${bad}</span>/秒`);
      setMeter('o-ext','—');
      setMeter('i-smtp','到达 <b>30</b> 封/秒');
      setMeter('i-spool',`积压 <b>${S.sp}</b>`,[S.sp,400]);
      setMeter('i-store','能力 <b>60</b> 封/秒');
      setMeter('i-kafka',`末尾 <b>${S.logEnd}</b> · 积压 ${lag}`,[lag,400]);
      setMeter('i-cons',`已处理到 <b>${S.cons}</b>`);
      setMeter('i-es',`可搜索水位 <b>${S.search}</b>`);
      const t={};const add=(k,c,s)=>(t[k]=t[k]||[]).push([c,s]);
      if(e){
        if(e.st==='queued')add('o-q','e7',`E7 排队中，前面 ${e.ahead} 封`);
        else if(e.st==='retry')add('o-q','e7',`E7 收到 4xx，${((e.due-S.tick)/10).toFixed(1)} 秒后重试`);
        else if(e.st==='smtp')add('o-w','e7',e.ok?`E7 SMTP 会话：${e.sess||'建立连接'}`:'E7 SMTP 会话：MAIL FROM …');
        else{add('o-remote','e7','E7 对方已回 250');add('o-ext','e7','E7 进收件箱了吗？读了吗？不知道')}
      }
      if(m){
        if(m.st==='smtp')add('i-smtp','m9','M9 SMTP 会话中');
        else if(m.st==='spool')add('i-spool','m9',`M9 排队，前面 ${m.ahead} 封`);
        else{
          add('i-store','m9','M9 已入主存，收件箱可见');
          if(m.st==='stored')add('i-kafka','m9',`M9 事件 @${m.offset}，前面还有 ${m.offset-S.cons-1} 条`);
          else if(m.st==='indexed')add('i-es','m9','M9 已写入 ES，等 refresh');
          else add('i-es','m9','M9 可搜索');
        }
      }
      for(const k in rowEls){setToks(k,t[k]||[]);rowEls[k].el.className='mp-row'+(k==='o-ext'?' ext':'')+(S.diag[k]?' '+S.diag[k]:'')}
      /* 追踪卡 */
      const ck=JSON.stringify([e&&[e.st,e.t250,e.tries],m&&[m.st,m.offset],S.result&&S.result.text]);
      if(force||ck!==cardKey){
        cardKey=ck;
        const st=(done,txt,tone)=>h('span',{class:'sdl-tag '+(tone||(done?'ok':''))},txt);
        const ms=(items)=>h('dl',{class:'mp-ms'},items.flatMap(([a,b])=>[h('dt',null,a),h('dd',null,b)]));
        const e0=e?e.t0:0;
        cardE.replaceChildren(h('p',{class:'mp-h'},'追踪 E7',h('small',null,'alice → bob@other.com')),e?ms([
          ['Web API 返回「已排队」',st(true,secs(0))],
          ['对方在完整 DATA 后回 250',e.st==='done'?st(true,secs(e.t250-e0)):st(false,e.st==='retry'?'4xx，等待重试':'未发生','warn')],
          ['进入 Bob 的收件箱',st(false,'本站无法得知')],
          ['Bob 已读',st(false,'本站无法得知')],
        ]):h('p',{class:'sdl-note'},'点「发出 E7 并追踪」。'));
        const m0=m?m.t0:0,after=(s)=>['stored','indexed','search'].indexOf(m.st)>=['stored','indexed','search'].indexOf(s);
        cardM.replaceChildren(h('p',{class:'mp-h'},'追踪 M9',h('small',null,'外部 → carol@本站')),m?ms([
          ['本站 SMTP 接入回 250',m.t250!=null?st(true,secs(m.t250-m0)):st(false,'会话中','warn')],
          ['写入主存，收件箱可见',m.tStored!=null?st(true,secs(m.tStored-m0)):st(false,'未发生')],
          ['索引事件 offset',m.offset?st(false,'@'+m.offset,'info'):st(false,'未产生')],
          ['消费者写入 ES',m.tIdx!=null?st(true,secs(m.tIdx-m0)):st(false,m.offset?'排队中':'未发生',m.offset?'warn':'')],
          ['refresh 后可搜索',m.tSearch!=null?st(true,secs(m.tSearch-m0)):st(false,m.offset&&after('indexed')?'等 refresh':'未发生',m.offset?'warn':'')],
        ]):h('p',{class:'sdl-note'},'点「收到 M9 并追踪」。'));
        if(S.result){result.className='mp-result '+S.result.tone;result.textContent=S.result.text}
        else{result.className='mp-result';result.textContent='点「Carol 搜索 M9」，看刚收到的信能不能搜到。'}
      }
      const b=backlog();
      stats.set('obk',b+' 封',b>150?'bad':b>40?'warn':null);
      stats.set('r4xx',bad,bad?'bad':'ok');
      stats.set('lag',lag,lag>150?'bad':lag>30?'warn':'ok');
      stats.set('m9',!m?'—':m.st==='search'?'能':['smtp','spool'].includes(m.st)?'未入库':'收件箱有，搜不到',!m?null:m.st==='search'?'ok':'warn');
    }
    let acc=0,racc=0;
    const lp=ctx.loop(dt=>{
      if(!P.speed&&stopAt===Infinity){lp.stop();return}
      acc+=dt*(P.speed||1);let n=0;
      while(acc>=0.1&&S.tick<stopAt&&n<8){acc-=0.1;stepTick();n++}
      if(S.tick>=stopAt)acc=0;
      racc+=dt;if(racc>1/15){racc=0;draw()}
    });
    sendE7();recvM9();draw(true);

    /* ---- 预设场景（按模拟步数精确推进） ---- */
    async function runFor(n){const target=S.tick+n;stopAt=target;lp.start();while(S.tick<target)await ctx.wait(30);draw()}
    async function runUntil(cond,max){const end=S.tick+max;while(!cond()&&S.tick<end)await runFor(1)}
    async function hold(ms){stopAt=S.tick;draw(true);await ctx.wait(ms)}
    function prepare(o){
      Object.assign(P,{W:8,remote:'normal',C:45,speed:1},o);
      wCtl.set(P.W,true);rCtl.set(P.remote,true);cCtl.set(P.C,true);speedCtl.set(P.speed,true);
      S=fresh();S.oq=o.oq||0;stopAt=0;ctx.clearLog();ctx.openLog(true);draw(true);
    }
    function speed(v){P.speed=v;speedCtl.set(v,true)}
    function diag(d){S.diag=d;draw(true)}
    async function scen(fn){const g=++gen;try{await fn()}finally{if(g===gen){stopAt=Infinity;if(P.speed)lp.start()}}}
    ctx.scenarios([
      {id:'smtp250',label:'对方回了 250',
        ask:'Alice 发出 E7，它前面还排着 60 封。出站 worker 与 other.com 走完 SMTP 会话，DATA 结束后对方回 250。这时可以把 E7 标成「已送达收件箱」或「已读」吗？',
        insight:'不可以。E7 先在发信队列等了 1.6 秒，「已排队」只说明本站收下了任务；随后 MAIL FROM、RCPT TO 各回 250，DATA 回 354，正文结束后的 250 才表示 other.com 接下投递责任。进没进收件箱、有没有被分进垃圾邮件、Bob 读没读，本站都看不到，追踪卡上这两项始终是「本站无法得知」。',
        run:()=>scen(async()=>{
          prepare({oq:60});sendE7();await hold(600);
          await runUntil(()=>S.e7.st==='done',120);
          diag({'o-remote':'good','o-ext':'unk'});await runFor(12);speed(0);await hold(300);
        })},
      {id:'index',label:'搜不到刚收到的信',
        ask:'索引消费者被调慢到 9 封/秒，而收信是 30 封/秒；同时 other.com 在限流，发信队列也在涨。M9 刚到，Carol 在收件箱看得到它却搜不到。你先查哪一段的水位？扩容出站 worker 有用吗？',
        insight:'M9 在收件箱里，说明主存已写入；它的索引事件在 offset 4357，而消费者只处理到 4263，可搜索水位也停在 4263，卡点在「索引事件 → 消费者」这一段。发信积压虽然红了，却不在收信路径上，扩出站 worker 没用。把消费者提到 60 封/秒后，1.6 秒追上 4357，再等 0.4 秒到下一次 refresh，M9 才搜得到。消费进度、写入 ES、refresh 后可见是三个不同的水位。',
        run:()=>scen(async()=>{
          prepare({remote:'throttle',C:9,oq:120,speed:2});await runFor(50);
          speed(1);recvM9();await runFor(20);
          search();await hold(1200);
          diag({'o-q':'dim','o-w':'dim','o-remote':'dim','o-ext':'dim','i-spool':'good','i-store':'good'});ctx.log('排查：M9 已在收件箱 → 主存正常；spool 积压为 0；发信链路不在这条路径上','info');await hold(1500);
          diag({'o-q':'dim','o-w':'dim','o-remote':'dim','o-ext':'dim','i-spool':'good','i-store':'good','i-kafka':'hot','i-cons':'hot'});ctx.log(`排查：分区 P 末尾 ${S.logEnd}，消费者只到 ${S.cons}，M9 在 ${S.m9.offset}，卡在索引消费`,'bad');await hold(1500);
          P.C=60;cCtl.set(60,true);ctx.log('处理：把索引消费者提到 60 封/秒','info');
          await runUntil(()=>S.m9.st==='search',80);
          diag({'o-q':'dim','o-w':'dim','o-remote':'dim','o-ext':'dim','i-es':'good'});search();speed(0);await hold(300);
        })},
      {id:'throttle',label:'发信积压：加 worker 有用吗',
        ask:'other.com 限流，每秒只接受 20 封，发信队列已积压 300 封，还在涨。把出站 worker 从 8 个（40 封/秒）加到 16 个（80 封/秒），积压会下降吗？4xx 会怎样？',
        insight:'不会下降。对方每秒仍只接受 20 封，积压照样每秒涨约 10 封；4xx 却从每秒 20 次涨到 60 次，只是更快地被拒、塞进待重试，还伤害发信信誉。对方恢复正常后，同样 16 个 worker 让积压每秒下降约 50 封。积压原因决定动作：对方限流时要退避，消费者不足时扩容才有用。',
        run:()=>scen(async()=>{
          prepare({remote:'throttle',oq:300,C:45});diag({'o-q':'hot'});await hold(500);
          await runFor(30);ctx.log(`8 个 worker：积压 ${backlog()}，4xx ${sum(S.r4xx)}/秒`,'warn');
          P.W=16;wCtl.set(16,true);diag({'o-q':'hot','o-w':'unk'});ctx.log('加到 16 个 worker','info');
          await runFor(30);ctx.log(`16 个 worker：积压 ${backlog()}，4xx ${sum(S.r4xx)}/秒`,'bad');await hold(1200);
          P.remote='normal';rCtl.set('normal',true);diag({'o-remote':'good'});ctx.log('other.com 恢复正常接收','info');speed(2);
          await runUntil(()=>backlog()<40,90);ctx.log(`对方恢复后：积压 ${backlog()}`,'ok');speed(0);await hold(300);
        })},
    ]);
  }
});
})();
