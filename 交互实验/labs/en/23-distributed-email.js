/* Chapter 23: Distributed Email Service. One lab draws both the sending and receiving paths: trace one outgoing and one incoming email, and locate problems by queue watermark. */
(function(){
const {el:h}=SDLab;

SDLab.define({
  id:'mail-pipeline',chapter:23,
  title:'An Email’s Journey and Queue Watermarks',
  summary:'The left side is our sending path; the right side is receiving and indexing, and each stage has its own queue watermark. Trace the outgoing E7 and the incoming M9 to see what each “success” actually proves; slow down the index consumer or make the other side rate limit, then use the watermarks to find which stage is stuck.',
  caveat:'The simulation advances every 0.1 s; the background traffic of 30 emails/s each way is a scaled-down teaching number. Emails rejected with 4xx retry after a fixed 3 s (exponential backoff is not drawn); ES refreshes every 1 s; only one Kafka partition is drawn, and anti-spam, bounces, and partial Bulk failures are left out.',
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

    /* ---- Stage ---- */
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
    const outCol=h('section',{class:'mp-col'},h('p',{class:'mp-h'},'Sending path',h('small',null,'alice@our.site → bob@other.com')),
      row('o-api','Web API','Validates, then returns “queued”'),arrow(),
      row('o-q','Outbound queue','Waiting for outbound workers; includes retries after 4xx'),arrow(),
      row('o-w','SMTP outbound workers','5 emails/s each'),arrow(),
      row('o-remote','Remote server other.com','Replies 250 after the complete DATA'),arrow(),
      row('o-ext','Remote mailbox and recipient','Inbox or not, read or not: invisible to us',{ext:true}));
    const inCol=h('section',{class:'mp-col'},h('p',{class:'mp-h'},'Receiving path',h('small',null,'external → carol@our.site')),
      row('i-smtp','SMTP intake','Replies 250 only after the full email is persisted'),arrow(),
      row('i-spool','Inbound queue (spool)','Waiting for a processing worker'),arrow(),
      row('i-store','Worker → mail store','Once written, the inbox shows it and an index event is emitted'),arrow(),
      row('i-kafka','Index events (Kafka partition P)','Log end offset'),arrow(),
      row('i-cons','Index consumer','Writes events into Elasticsearch'),arrow(),
      row('i-es','ES refresh','Refreshes every 1 s; searchable only after that'));
    const cardE=h('div',{class:'mp-card'}),cardM=h('div',{class:'mp-card'});
    const result=h('div',{class:'mp-result'},'Click “Carol searches M9” to see whether the new email can be found.');
    const wrap=h('div',null,h('div',{class:'mp-cols'},outCol,inCol),h('div',{class:'mp-cards'},cardE,cardM),result);
    ctx.stage.append(wrap);
    ctx.onResize(w=>wrap.classList.toggle('mp-one',w<660));
    const stats=ctx.stats([{key:'obk',label:'Outbound backlog'},{key:'r4xx',label:'Remote 4xx per second'},{key:'lag',label:'Index backlog (end − processed)'},{key:'m9',label:'M9 searchable?'}]);

    /* ---- Controls ---- */
    const speedCtl=ctx.segmented({label:'Playback',value:1,options:[[0,'Pause'],[1,'1×'],[2,'2×']],onChange:v=>{P.speed=v;stopAt=Infinity;if(v)lp.start()}});
    const wCtl=ctx.slider({label:'Outbound workers',min:2,max:16,value:P.W,format:v=>`${v} workers · ${v*5} emails/s`,onInput:v=>{P.W=v;draw(true)}});
    const rCtl=ctx.segmented({label:'Remote server other.com',value:P.remote,options:[['normal','Accepting normally'],['throttle','Rate limit 20 emails/s']],onChange:v=>{P.remote=v;draw(true)}});
    const cCtl=ctx.slider({label:'Index consumer capacity',min:5,max:60,value:P.C,format:v=>v+' emails/s',onInput:v=>{P.C=v;draw(true)}});
    ctx.button('Send E7 and trace it',()=>{sendE7();draw(true)},{primary:true});
    ctx.button('Receive M9 and trace it',()=>{recvM9();draw(true)});
    ctx.button('Carol searches M9',()=>{search();draw(true)});

    /* ---- Model: 0.1 s per step ---- */
    const sum=a=>a.reduce((s,x)=>s+x,0);
    const push10=(a,v)=>{a.push(v);if(a.length>10)a.shift()};
    const SMTP=[['MAIL FROM:<alice@our.site>','250'],['RCPT TO:<bob@other.com>','250'],['DATA','354 Start mail input'],['Body (ends with a lone “.” line)','250 Accepted']];
    function sendE7(){S.e7={st:'queued',ahead:S.oq,t0:S.tick,tries:0,step:0};ctx.log(`E7: Web API validated it and returned “queued” (${S.oq} ahead)`,'info')}
    function recvM9(){S.m9={st:'smtp',next:S.tick+3,t0:S.tick};ctx.log('M9: the external server starts delivering to our SMTP intake','info')}
    function stepTick(){
      S.tick++;
      /* Sending: due retries rejoin the queue → new mail arrives → workers attempt delivery → remote accepts or replies 4xx */
      let back=0;S.retry=S.retry.filter(r=>{if(r.due<=S.tick){back+=r.n;return false}return true});
      S.oq+=back;
      const e=S.e7;
      if(e&&e.st==='retry'&&e.due<=S.tick){e.st='queued';e.ahead=S.oq;ctx.log(`E7: back in the outbound queue (attempt ${e.tries+1}, ${S.oq} ahead)`)}
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
        if(!e.ok){e.st='retry';e.due=S.tick+30;e.sess='';ctx.log('E7 → other.com: MAIL FROM → 451 try again later (remote is rate limiting), retry in 3 s','warn')}
        else{const [c,r]=SMTP[e.step];e.sess=`${c.split(':')[0].split(' (')[0]} → ${r.split(' ')[0]}`;ctx.log(`E7 → other.com: ${c} → ${r}`,e.step===3?'ok':null);e.step++;e.next=S.tick+5;
          if(e.step===4){e.st='done';e.t250=S.tick;ctx.log('E7: the remote server now owns delivery. Whether it reached the inbox or Bob read it, SMTP never tells us','warn')}}
      }
      /* Receiving: SMTP intake → spool → mail store + index event → consumer → refresh */
      const m=S.m9;
      if(m&&m.st==='smtp'&&S.tick>=m.next){m.st='spool';m.ahead=S.sp;m.t250=S.tick;ctx.log('M9: SMTP intake wrote the full email to the spool, then replied 250')}
      S.sp+=3;
      const m9s=!!(m&&m.st==='spool'),served=Math.min(6,S.sp+(m9s?1:0));
      let m9done=false;
      if(m9s){if(m.ahead<served){m9done=true;m.offset=S.logEnd+m.ahead+1;m.st='stored';m.tStored=S.tick}else m.ahead-=served}
      S.sp-=served-(m9done?1:0);S.logEnd+=served;
      if(m9done)ctx.log(`M9: written to the mail store; Carol’s inbox can show it now; its index event is at offset ${m.offset} of partition P`,'ok');
      S.cAcc+=P.C;const cc=Math.floor(S.cAcc/10);S.cAcc-=cc*10;S.cons=Math.min(S.logEnd,S.cons+cc);
      if(m&&m.st==='stored'&&S.cons>=m.offset){m.st='indexed';m.tIdx=S.tick;ctx.log(`M9: the consumer reached ${m.offset} and wrote it to ES; waiting for the next refresh`)}
      if(S.tick%10===0){S.search=S.cons;if(m&&m.st==='indexed'&&S.search>=m.offset){m.st='search';m.tSearch=S.tick;ctx.log('M9: after the refresh it is within the searchable watermark','ok')}}
    }
    const retryN=()=>sum(S.retry.map(r=>r.n));
    const backlog=()=>S.oq+retryN()+(S.e7&&(S.e7.st==='queued'||S.e7.st==='retry')?1:0);
    function search(){
      const m=S.m9;let tone='bad',text;
      if(!m)text='M9 is not being traced yet. Click “Receive M9 and trace it” first.';
      else if(m.st==='search'){tone='ok';text=`Found M9: offset ${m.offset} is within the searchable watermark ${S.search}.`}
      else if(m.st==='smtp'||m.st==='spool')text='No results: M9 hasn’t been written to the mail store yet, so the inbox can’t show it either.';
      else text=`No results. M9 is already in the inbox, but its index event is at offset ${m.offset} and the searchable watermark has only reached ${S.search}`+(m.st==='indexed'?'; it is written to ES and waiting for the next refresh.':`, and the consumer has only processed up to ${S.cons}.`);
      S.result={tone,text};ctx.log('Carol searches M9: '+text,tone);ctx.announce(text);
    }

    /* ---- Rendering ---- */
    const secs=t=>'+'+(t/10).toFixed(1)+' s';
    function setMeter(k,html,bar){
      const r=rowEls[k];const key=html+'|'+(bar?bar.join():'');if(r.mk===key)return;r.mk=key;
      r.meter.innerHTML=html;
      if(bar){const [v,max]=bar,f=Math.min(1,v/max);const i=h('i',{class:f>.6?'bad':f>.25?'warn':null,style:{width:(f*100).toFixed(1)+'%'}});r.meter.append(h('div',{class:'mp-bar'},i))}
    }
    function setToks(k,list){const r=rowEls[k];const key=list.map(x=>x.join()).join('|');if(r.tk===key)return;r.tk=key;r.toks.replaceChildren(...list.map(([c,t])=>h('span',{class:'mp-tok '+c},t)))}
    let cardKey='';
    function draw(force){
      const e=S.e7,m=S.m9,ok=sum(S.r250),bad=sum(S.r4xx),att=sum(S.ratt),lag=S.logEnd-S.cons;
      rowEls['o-w'].nm.textContent=`SMTP outbound workers × ${P.W}`;rowEls['o-w'].sub.textContent=`5 emails/s each, ${P.W*5} emails/s in total`;
      rowEls['o-remote'].sub.textContent=P.remote==='throttle'?'Rate limiting: accepts only 20 emails/s, replies 4xx to the rest':'Replies 250 after the complete DATA';
      rowEls['i-cons'].nm.textContent=`Index consumer · ${P.C} emails/s`;
      setMeter('o-api','Arriving <b>30</b> emails/s');
      setMeter('o-q',`Backlog <b>${backlog()}</b>`+(retryN()?` · ${retryN()} waiting to retry`:''),[backlog(),400]);
      setMeter('o-w',`Attempting <b>${att}</b> emails/s`);
      setMeter('o-remote',`250: <b>${ok}</b>/s · 4xx: <span class="${bad?'bad':''}">${bad}</span>/s`);
      setMeter('o-ext','—');
      setMeter('i-smtp','Arriving <b>30</b> emails/s');
      setMeter('i-spool',`Backlog <b>${S.sp}</b>`,[S.sp,400]);
      setMeter('i-store','Capacity <b>60</b> emails/s');
      setMeter('i-kafka',`End <b>${S.logEnd}</b> · backlog ${lag}`,[lag,400]);
      setMeter('i-cons',`Processed up to <b>${S.cons}</b>`);
      setMeter('i-es',`Searchable watermark <b>${S.search}</b>`);
      const t={};const add=(k,c,s)=>(t[k]=t[k]||[]).push([c,s]);
      if(e){
        if(e.st==='queued')add('o-q','e7',`E7 queued, ${e.ahead} ahead`);
        else if(e.st==='retry')add('o-q','e7',`E7 got 4xx, retrying in ${((e.due-S.tick)/10).toFixed(1)} s`);
        else if(e.st==='smtp')add('o-w','e7',e.ok?`E7 SMTP session: ${e.sess||'connecting'}`:'E7 SMTP session: MAIL FROM …');
        else{add('o-remote','e7','E7 remote replied 250');add('o-ext','e7','E7 in the inbox? Read? Unknown')}
      }
      if(m){
        if(m.st==='smtp')add('i-smtp','m9','M9 SMTP session in progress');
        else if(m.st==='spool')add('i-spool','m9',`M9 queued, ${m.ahead} ahead`);
        else{
          add('i-store','m9','M9 in the store, visible in the inbox');
          if(m.st==='stored')add('i-kafka','m9',`M9 event @${m.offset}, ${m.offset-S.cons-1} more ahead`);
          else if(m.st==='indexed')add('i-es','m9','M9 written to ES, waiting for refresh');
          else add('i-es','m9','M9 searchable');
        }
      }
      for(const k in rowEls){setToks(k,t[k]||[]);rowEls[k].el.className='mp-row'+(k==='o-ext'?' ext':'')+(S.diag[k]?' '+S.diag[k]:'')}
      /* Trace cards */
      const ck=JSON.stringify([e&&[e.st,e.t250,e.tries],m&&[m.st,m.offset],S.result&&S.result.text]);
      if(force||ck!==cardKey){
        cardKey=ck;
        const st=(done,txt,tone)=>h('span',{class:'sdl-tag '+(tone||(done?'ok':''))},txt);
        const ms=(items)=>h('dl',{class:'mp-ms'},items.flatMap(([a,b])=>[h('dt',null,a),h('dd',null,b)]));
        const e0=e?e.t0:0;
        cardE.replaceChildren(h('p',{class:'mp-h'},'Trace E7',h('small',null,'alice → bob@other.com')),e?ms([
          ['Web API returns “queued”',st(true,secs(0))],
          ['Remote replies 250 after the complete DATA',e.st==='done'?st(true,secs(e.t250-e0)):st(false,e.st==='retry'?'4xx, waiting to retry':'Not yet','warn')],
          ['Reaches Bob’s inbox',st(false,'Unknowable to us')],
          ['Bob has read it',st(false,'Unknowable to us')],
        ]):h('p',{class:'sdl-note'},'Click “Send E7 and trace it.”'));
        const m0=m?m.t0:0,after=(s)=>['stored','indexed','search'].indexOf(m.st)>=['stored','indexed','search'].indexOf(s);
        cardM.replaceChildren(h('p',{class:'mp-h'},'Trace M9',h('small',null,'external → carol@our.site')),m?ms([
          ['Our SMTP intake replies 250',m.t250!=null?st(true,secs(m.t250-m0)):st(false,'In session','warn')],
          ['Written to store, inbox shows it',m.tStored!=null?st(true,secs(m.tStored-m0)):st(false,'Not yet')],
          ['Index event offset',m.offset?st(false,'@'+m.offset,'info'):st(false,'Not yet created')],
          ['Consumer writes to ES',m.tIdx!=null?st(true,secs(m.tIdx-m0)):st(false,m.offset?'Queued':'Not yet',m.offset?'warn':'')],
          ['Searchable after refresh',m.tSearch!=null?st(true,secs(m.tSearch-m0)):st(false,m.offset&&after('indexed')?'Waiting for refresh':'Not yet',m.offset?'warn':'')],
        ]):h('p',{class:'sdl-note'},'Click “Receive M9 and trace it.”'));
        if(S.result){result.className='mp-result '+S.result.tone;result.textContent=S.result.text}
        else{result.className='mp-result';result.textContent='Click “Carol searches M9” to see whether the new email can be found.'}
      }
      const b=backlog();
      stats.set('obk',b,b>150?'bad':b>40?'warn':null);
      stats.set('r4xx',bad,bad?'bad':'ok');
      stats.set('lag',lag,lag>150?'bad':lag>30?'warn':'ok');
      stats.set('m9',!m?'—':m.st==='search'?'Yes':['smtp','spool'].includes(m.st)?'Not stored':'In inbox, not searchable',!m?null:m.st==='search'?'ok':'warn');
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

    /* ---- Preset scenarios (advance by exact simulation steps) ---- */
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
      {id:'smtp250',label:'The remote replied 250',
        ask:'Alice sends E7 with 60 emails queued ahead of it. An outbound worker runs the SMTP session with other.com, and after DATA ends the remote side replies 250. Can you now mark E7 as “delivered to the inbox” or “read”?',
        insight:'No. E7 first waited 1.6 s in the outbound queue, and “queued” only means we accepted the task. Then MAIL FROM and RCPT TO each got 250 and DATA got 354; only the 250 after the body ends means other.com has taken over delivery. Whether it reached the inbox, was filed as spam, or was read by Bob is invisible to us, so those two rows on the trace card always stay “Unknowable to us.”',
        run:()=>scen(async()=>{
          prepare({oq:60});sendE7();await hold(600);
          await runUntil(()=>S.e7.st==='done',120);
          diag({'o-remote':'good','o-ext':'unk'});await runFor(12);speed(0);await hold(300);
        })},
      {id:'index',label:'A new email isn’t searchable',
        ask:'The index consumer has been slowed to 9 emails/s while mail arrives at 30 emails/s; meanwhile other.com is rate limiting and the outbound queue is growing too. M9 has just arrived: Carol can see it in her inbox but can’t search for it. Which stage’s watermark do you check first? Would scaling out outbound workers help?',
        insight:'M9 is in the inbox, so the mail store has it. Its index event is at offset 4357, but the consumer has only processed up to 4263 and the searchable watermark is also stuck at 4263, so the bottleneck is the “index event → consumer” stage. The outbound backlog is red but is not on the receiving path, so scaling out outbound workers does nothing. After raising the consumer to 60 emails/s it catches up to 4357 in 1.6 s, then waits another 0.4 s for the next refresh before M9 becomes searchable. Consumption progress, the ES write, and visibility after refresh are three different watermarks.',
        run:()=>scen(async()=>{
          prepare({remote:'throttle',C:9,oq:120,speed:2});await runFor(50);
          speed(1);recvM9();await runFor(20);
          search();await hold(1200);
          diag({'o-q':'dim','o-w':'dim','o-remote':'dim','o-ext':'dim','i-spool':'good','i-store':'good'});ctx.log('Diagnosis: M9 is already in the inbox, so the store is fine; spool backlog is 0; the sending path isn’t on this route','info');await hold(1500);
          diag({'o-q':'dim','o-w':'dim','o-remote':'dim','o-ext':'dim','i-spool':'good','i-store':'good','i-kafka':'hot','i-cons':'hot'});ctx.log(`Diagnosis: partition P ends at ${S.logEnd}, the consumer is only at ${S.cons}, M9 is at ${S.m9.offset}; stuck in index consumption`,'bad');await hold(1500);
          P.C=60;cCtl.set(60,true);ctx.log('Fix: raise the index consumer to 60 emails/s','info');
          await runUntil(()=>S.m9.st==='search',80);
          diag({'o-q':'dim','o-w':'dim','o-remote':'dim','o-ext':'dim','i-es':'good'});search();speed(0);await hold(300);
        })},
      {id:'throttle',label:'Outbound backlog: do more workers help?',
        ask:'other.com is rate limiting and accepts only 20 emails per second. The outbound queue has a backlog of 300 and is still growing. If you raise outbound workers from 8 (40 emails/s) to 16 (80 emails/s), will the backlog fall? What happens to the 4xx replies?',
        insight:'It won’t fall. The remote side still accepts only 20 emails per second, so the backlog keeps growing by about 10 per second; 4xx replies jump from 20 to 60 per second, so mail is just rejected faster and pushed into the retry list, which also hurts sender reputation. Once the remote side recovers, the same 16 workers cut the backlog by about 50 per second. The cause of a backlog decides the action: back off when the other side is rate limiting; scaling out only helps when consumers are short.',
        run:()=>scen(async()=>{
          prepare({remote:'throttle',oq:300,C:45});diag({'o-q':'hot'});await hold(500);
          await runFor(30);ctx.log(`8 workers: backlog ${backlog()}, 4xx ${sum(S.r4xx)}/s`,'warn');
          P.W=16;wCtl.set(16,true);diag({'o-q':'hot','o-w':'unk'});ctx.log('Scaled up to 16 workers','info');
          await runFor(30);ctx.log(`16 workers: backlog ${backlog()}, 4xx ${sum(S.r4xx)}/s`,'bad');await hold(1200);
          P.remote='normal';rCtl.set('normal',true);diag({'o-remote':'good'});ctx.log('other.com is accepting normally again','info');speed(2);
          await runUntil(()=>backlog()<40,90);ctx.log(`After the remote recovers: backlog ${backlog()}`,'ok');speed(0);await hold(300);
        })},
    ]);
  }
});
})();
