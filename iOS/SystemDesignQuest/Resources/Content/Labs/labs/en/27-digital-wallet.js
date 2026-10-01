/* Chapter 27: Digital Wallet. Lab: event sourcing, covering command validation, append-only events, replay by sequence number, snapshot boundaries, and old/new version comparison. */
(function(){
const {el:h,util}=SDLab;

SDLab.define({
  id:'wallet-event-sourcing',chapter:27,
  title:'Commands, Events, and Replay in an Event-Sourced Wallet',
  summary:'A transfer command is validated by the state machine first, and only then appended as immutable events; a balance is just the result of replaying events. Drag the replay position to rebuild the balance at any sequence number, see how snapshots save replay work, then use the conservation check and old/new version comparison to tell “reproducible” from “correct.”',
  caveat:'One state machine and a single ordered event stream; no sharding or cross-group transactions. Each transfer produces two events, one for the payer and one for the payee. The opening balances count as the snapshot at sequence #0, and a snapshot is taken after every fixed number of events. Replay follows commit sequence and ignores business effective time; amounts are stored in cents.',
  mount(ctx){
    ctx.css('we',`
.we-top{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:10px}
.we-narrow .we-top{grid-template-columns:minmax(0,1fr)}
.we-q{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;font-size:13px}
.we-q li{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;padding:3px 8px;border-radius:7px;background:#fff;border:1px solid #dbe2da;line-height:1.5}
.we-q li.pend{border-color:#2f6fb3;background:#eef4fb}
.we-q li.rej{color:#9b2c27}.we-q li.done{color:#4d5d55}
.we-q .id{font-family:var(--lab-mono);font-size:12px;color:#66756d}
.we-steps{margin:0;padding-left:20px;font-size:13px;line-height:1.65}
.we-steps li.info{color:#24558a}.we-steps li.ok{color:#1d6a41}.we-steps li.bad{color:#9b2c27;font-weight:650}.we-steps li.warn{color:#86561a;font-weight:650}.we-steps li.idle{color:#8a978f;list-style:none;margin-left:-20px}
.we-log{margin-top:10px}
.we-legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:#66756d}
.we-legend i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:4px;vertical-align:-1px;border:1px solid #c9d4cc}
.we-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:6px;margin:8px 0 4px}
.we-ev{border:1px solid #dbe2da;border-radius:8px;padding:3px 7px;background:#fff;font-size:13px;line-height:1.4;transition:opacity .2s}
.we-ev small{display:block;font-size:11px;color:#66756d}
.we-ev b{font-weight:650;font-variant-numeric:tabular-nums;white-space:nowrap}
.we-ev.snap{background:#eef3ec;border-color:#cfdccf;color:#4d5d55}
.we-ev.apply{background:#dde9f6;border-color:#2f6fb3}
.we-ev.future{opacity:.38}
.we-ev.dup{background:#f7dedb;border-color:#c2413b}
.we-ev.badtx{border:1.5px dashed #c2413b}
.we-ev.cur{outline:2px solid #2f6fb3;outline-offset:1px}
.we-ev.mis{background:#f7dedb;border-color:#c2413b;outline:2px solid #c2413b;outline-offset:1px}
.we-snap{border:1px dashed #9fb3a5;border-radius:8px;padding:3px 7px;font-size:12px;color:#4d5d55;display:flex;align-items:center;background:#fbfcfa;line-height:1.35}
.we-snap.use{border-style:solid;border-color:#2f8f5b;background:#dcefe2;color:#1d6a41;font-weight:650}
.we-bot{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-top:10px}
.we-bal{display:grid;grid-template-columns:22px minmax(0,1fr) 72px;gap:8px;align-items:center;font-size:13px;margin:6px 0}
.we-bar{height:12px;border-radius:6px;background:#e6eee2;overflow:hidden}
.we-bar i{display:block;height:100%;background:#2f6fb3;border-radius:6px;transition:width .35s}
.we-bal .v{text-align:right;font-family:var(--lab-mono);font-size:13px}
.we-chk{list-style:none;margin:0;padding:0;font-size:13px}
.we-chk li{display:flex;gap:7px;align-items:baseline;margin:5px 0;line-height:1.5}
.we-chk .sdl-tag{flex:none}
.we-table td.mis{background:#f7dedb;color:#9b2c27;font-weight:650}
`);
    const ACC=['A','B','C','D'],OPEN={A:10000,B:5000,C:2000,D:0},TOTAL=17000,SCALE=12000;
    const money=c=>(c<0?'−$':'$')+(Math.abs(c)/100).toFixed(2);
    const sgn=c=>(c<0?'−':'+')+'$'+(Math.abs(c)/100).toFixed(2);
    const RED={v1:d=>d,v2:d=>Math.trunc(d/100)*100};
    const PRE=[['A','C',3000],['B','D',2000],['C','B',8000],['D','A',1250],['A','B',2500],['C','D',725],['B','C',1500]];
    const sum=b=>ACC.reduce((s,a)=>s+b[a],0);
    let events=[],txs=[],queue=[],txSeq=0,pos=0,snapK=4,restoreBug=false,bugNext=false,cmp=null,det=null,cursor=0,flash=new Set(),busy=false,pumping=false;
    const spawn=fn=>{fn().catch(e=>{if(!(e&&e.abort))console.error(e)})};

    /* ---- Controls ---- */
    const sFrom=ctx.select({label:'Payer',value:'D',options:ACC.map(a=>[a,'Account '+a])});
    const sTo=ctx.select({label:'Payee',value:'B',options:ACC.map(a=>[a,'Account '+a])});
    const sAmt=ctx.slider({label:'Amount',min:25,max:6000,step:25,value:500,format:money});
    const sK=ctx.slider({label:'Snapshot interval',min:0,max:8,value:snapK,format:v=>v?(v===1?'Every event':`Every ${v} events`):'No snapshots',onInput:v=>{snapK=v;render()}});
    const tBug=ctx.toggle({label:'On recovery, re-apply the snapshot’s own event (bug)',value:false,onChange:v=>{restoreBug=v;render()}});
    const btns=[
      ctx.button('Submit transfer command',()=>{if(!busy)enqueue(mk(sFrom.get(),sTo.get(),sAmt.get()))},{primary:true}),
      ctx.button('Replay from scratch twice',()=>{if(!busy)spawn(twice)}),
      ctx.button('Compare v1 / v2 per event',()=>{if(!busy)spawn(compare)}),
    ];

    /* ---- Stage ---- */
    const root=h('div');
    const qList=h('ul',{class:'we-q','aria-label':'Command queue'}),steps=h('ol',{class:'we-steps'});
    const grid=h('div',{class:'we-grid','aria-label':'Event log'});
    const sw=(bg,bd,t)=>h('span',null,h('i',{style:{background:bg,borderColor:bd}}),t);
    const logPanel=h('div',{class:'sdl-panel we-log'},h('div',{class:'ph'},'Event log (append-only, never modified)'),
      h('div',{class:'we-legend'},sw('#eef3ec','#cfdccf','Included in the snapshot used'),sw('#dde9f6','#2f6fb3','Applied in this replay'),sw('#fff','#dbe2da','After the replay position (faded)'),sw('#f7dedb','#c2413b','Applied twice / faulty')),grid);
    const balHead=h('div',{class:'ph'}),balNote=h('p',{class:'sdl-note'}),balEls={};
    const balPanel=h('div',{class:'sdl-panel'},balHead,ACC.map(a=>{const bar=h('i'),v=h('span',{class:'v'});balEls[a]={bar,v};return h('div',{class:'we-bal'},h('b',null,a),h('div',{class:'we-bar'},bar),v)}),balNote);
    const chkList=h('ul',{class:'we-chk'}),extra=h('div');
    root.append(h('div',{class:'we-top'},h('div',{class:'sdl-panel'},h('div',{class:'ph'},'Command queue (FIFO)'),qList),h('div',{class:'sdl-panel'},h('div',{class:'ph'},'State machine: validate command → generate events → update state'),steps)),
      logPanel,h('div',{class:'we-bot'},balPanel,h('div',{class:'sdl-panel'},h('div',{class:'ph'},'Checks (at the current replay position)'),chkList,extra)));
    ctx.stage.append(root);
    const slPos=ctx.slider({label:'Replay up to event',min:0,max:1,value:0,wide:true,parent:logPanel,format:v=>'#'+v+(v===events.length?' (latest)':''),onInput:v=>{pos=v;render()}});
    ctx.onResize(w=>root.classList.toggle('we-narrow',w<600));
    const stats=ctx.stats([{key:'n',label:'Total events'},{key:'pos',label:'Replay position'},{key:'cnt',label:'Events to apply'},{key:'tot',label:'Total funds'}]);

    /* ---- Model ---- */
    const mk=(from,to,amount)=>({id:'tx'+(++txSeq),from,to,amount});
    function stateAt(to,v='v1'){const b={...OPEN};for(const e of events){if(e.seq>to)break;b[e.acct]+=RED[v](e.delta)}return b}
    const why=(c,st)=>c.from===c.to?'Payer and payee are the same':st[c.from]<c.amount?'Insufficient balance':null;
    function commit(c,bug){
      const r=why(c,stateAt(events.length));
      if(r){c.status='rej';c.reason=r;txs.push(c);return false}
      const n=events.length;events.push({seq:n+1,tx:c.id,acct:c.from,delta:-c.amount},{seq:n+2,tx:c.id,acct:c.to,delta:bug?c.amount*10:c.amount});
      c.status='ok';c.seqs=[n+1,n+2];txs.push(c);return true;
    }
    function snaps(){const a=[0];if(snapK)for(let s=snapK;s<=events.length;s+=snapK)a.push(s);return a}
    function replay(to){
      const base=Math.max(...snaps().filter(s=>s<=to)),b=stateAt(base),from=restoreBug&&base>0?base:base+1;
      for(const e of events)if(e.seq>=from&&e.seq<=to)b[e.acct]+=e.delta;
      return {bal:b,base,from,count:Math.max(0,to-from+1),dup:restoreBug&&base>0?base:null};
    }
    const legs=(t,v='v1')=>RED[v](events[t.seqs[0]-1].delta)+RED[v](events[t.seqs[1]-1].delta);
    const hex=b=>util.hash(ACC.map(a=>a+':'+b[a]).join(',')).toString(16).padStart(8,'0');
    function reset(){
      events=[];txs=[];queue=[];txSeq=0;cmp=null;det=null;cursor=0;bugNext=false;flash=new Set();
      for(const [f,t,a] of PRE)commit(mk(f,t,a));
      pos=events.length;setSteps([['Waiting for the next command','idle']]);
    }
    function setSteps(list){steps.replaceChildren(...list.map(([t,c])=>h('li',{class:c||null},t)))}

    /* ---- Rendering ---- */
    function render(){
      slPos.input.max=events.length;slPos.set(pos,true);
      const r=replay(pos),total=sum(r.bal),neg=ACC.filter(a=>r.bal[a]<0);
      const bad=txs.filter(t=>t.seqs&&t.seqs[1]<=pos&&legs(t)!==0),badTx=new Set(bad.map(t=>t.id));
      qList.replaceChildren(
        ...queue.map(c=>h('li',{class:'pend'},h('span',{class:'id'},c.id),`Transfer ${money(c.amount)} from ${c.from} to ${c.to}`,h('span',{class:'sdl-tag info'},'Queued'))),
        ...txs.slice(-5).reverse().map(c=>h('li',{class:c.status==='rej'?'rej':'done'},h('span',{class:'id'},c.id),`Transfer ${money(c.amount)} from ${c.from} to ${c.to}`,c.status==='rej'?h('span',{class:'sdl-tag bad'},c.reason+', no events'):h('span',{class:'sdl-tag ok'},`Events #${c.seqs[0]}, #${c.seqs[1]}`))));
      const snapChip=s=>h('div',{class:'we-snap'+(r.base===s?' use':'')},s?`◆ Snapshot #${s}`:'◆ Opening #0');
      const kids=[snapChip(0)];
      for(const e of events){
        const cls=['we-ev',e.seq>pos?'future':e.seq===r.dup?'dup':e.seq<=r.base?'snap':'apply'];
        if(badTx.has(e.tx))cls.push('badtx');
        if(cmp&&cmp.mis&&cmp.mis.seq===e.seq)cls.push('mis');else if((cmp&&!cmp.done&&cmp.cur===e.seq)||cursor===e.seq)cls.push('cur');
        if(flash.has(e.seq))cls.push('sdl-flash');
        kids.push(h('div',{class:cls.join(' '),title:`Event #${e.seq} from ${e.tx}`},h('small',null,`#${e.seq} · ${e.tx}`),h('b',null,`${e.acct} ${sgn(e.delta)}`)));
        if(snapK&&e.seq%snapK===0)kids.push(snapChip(e.seq));
      }
      grid.replaceChildren(...kids);
      balHead.textContent=`Balances · replayed to #${pos}${pos===events.length?' (latest)':''}`;
      for(const a of ACC){balEls[a].bar.style.width=util.clamp(r.bal[a]/SCALE*100,0,100)+'%';balEls[a].bar.style.background=r.bal[a]<0?'#c2413b':'#2f6fb3';balEls[a].v.textContent=money(r.bal[a])}
      balNote.textContent=`Restored ${r.base?'from snapshot #'+r.base:'from opening #0'}; ${r.count?`applied #${r.from}–#${pos} (${r.count} event${r.count===1?'':'s'})`:'no events left to apply'}. Without snapshots it would apply ${pos} event${pos===1?'':'s'} from #1.`;
      const items=[
        [total===TOTAL,`Total funds ${money(total)} ${total===TOTAL?'=':'≠'} opening ${money(TOTAL)}`],
        [!neg.length,neg.length?'Negative balance: '+neg.join(', '):'No negative balances'],
        [!bad.length,bad.length?bad.map(t=>`${t.id}: the two legs sum to ${sgn(legs(t))}, not 0`).join('; '):'The two legs of every transfer sum to 0'],
        [r.dup==null,r.dup!=null?`Snapshot #${r.dup} already includes event #${r.dup}, and replay applied it again`:r.count?`Replay starts at #${r.base+1}, the event after snapshot #${r.base}`:'The replay position lands exactly on a snapshot, so it is used as is'],
      ];
      chkList.replaceChildren(...items.map(([ok,t])=>h('li',null,h('span',{class:'sdl-tag '+(ok?'ok':'bad')},ok?'✓':'✗'),h('span',null,t))));
      extra.replaceChildren(...[detView(),cmpView()].filter(Boolean));
      stats.set('n',events.length);stats.set('pos','#'+pos);
      stats.set('cnt',`${r.count}`+(snapK&&pos?` (${pos} from scratch)`:''),'info');
      stats.set('tot',money(total),total===TOTAL?'ok':'bad');
    }
    function detView(){
      if(!det)return null;
      return h('p',{class:'sdl-note'},det.h2?h('span',null,'Replayed from scratch twice; state checksums ',h('span',{class:'sdl-mono'},det.h1),' and ',h('span',{class:'sdl-mono'},det.h2),det.h1===det.h2?': identical, so the process is reproducible.':': different, so replay is nondeterministic.'):`Replaying from scratch (run ${det.run})…`);
    }
    function cmpView(){
      if(!cmp)return null;
      const rows=cmp.rows.slice(-6),m=cmp.mis;
      return h('div',null,h('div',{class:'ph',style:{marginTop:'10px'}},'v1 vs. candidate v2, event by event'),
        h('div',{class:'sdl-scroll'},h('table',{class:'sdl-table we-table'},h('thead',null,h('tr',null,h('th',null,'Event'),h('th',null,'v1 result'),h('th',null,'v2 result'))),
          h('tbody',null,rows.map(x=>h('tr',null,h('td',null,`#${x.seq} ${x.acct} ${sgn(x.delta)}`),h('td',{class:x.same?null:'mis'},`${x.acct} = ${money(x.v1)}`),h('td',{class:x.same?null:'mis'},`${x.acct} = ${money(x.v2)}`)))))),
        cmp.done?h('p',{class:'sdl-note'},m?`First divergence at #${m.seq} (${m.acct} ${sgn(m.delta)}): v1 computes ${m.acct} = ${money(m.v1)}, v2 computes ${money(m.v2)}. Final total funds: v1 ${money(cmp.t1)}, v2 ${money(cmp.t2)}; v2’s own conservation checks ${cmp.v2ok?'all pass':'fail'}.`:'All events give identical results.'):null);
    }

    /* ---- Actions ---- */
    async function process(c){
      queue.shift();cmp=null;det=null;
      const L=[[`Read command ${c.id}: Transfer ${money(c.amount)} from ${c.from} to ${c.to}`,'info']];setSteps(L);render();await ctx.wait(550);
      const st=stateAt(events.length);
      L.push([`Read current state: ${c.from} balance ${money(st[c.from])}`]);setSteps(L);await ctx.wait(550);
      const r=why(c,st);
      if(r){L.push([`Validation failed: ${r.toLowerCase()}; rejected, no events produced`,'bad']);setSteps(L);commit(c);ctx.log(`${c.id} rejected: ${r.toLowerCase()}. A command may fail; the event log is unchanged`,'bad');render();await ctx.wait(500);return}
      L.push([`Validation passed: ${money(st[c.from])} ≥ ${money(c.amount)}`,'ok']);setSteps(L);await ctx.wait(500);
      const follow=pos===events.length,bug=bugNext;bugNext=false;
      commit(c,bug);if(follow)pos=events.length;
      const [a,b]=c.seqs;flash=new Set([a,b]);
      L.push([`Append event #${a} “${c.from} ${sgn(-c.amount)}” and #${b} “${c.to} ${sgn(events[b-1].delta)}”${bug?' (code bug: credit written as 10 times)':''}`,bug?'warn':'info']);setSteps(L);
      ctx.log(`${c.id} passed validation; appended events #${a} and #${b}`+(bug?' (wrong credit amount)':''),bug?'warn':'ok');render();await ctx.wait(550);flash=new Set();
      const s2=stateAt(events.length);
      L.push([`Apply events: ${c.from} → ${money(s2[c.from])}, ${c.to} → ${money(s2[c.to])}`,'ok']);setSteps(L);render();await ctx.wait(400);
    }
    function enqueue(c){
      queue.push(c);render();
      if(!pumping){pumping=true;spawn(async()=>{try{while(queue.length)await process(queue[0])}finally{pumping=false}})}
    }
    async function twice(){
      det={run:1};cmp=null;
      for(let run=1;run<=2;run++){det.run=run;for(const e of events){cursor=e.seq;render();await ctx.wait(45)}cursor=0;det['h'+run]=hex(stateAt(events.length));render();await ctx.wait(300)}
      ctx.log(`Replayed from scratch twice: ${det.h1} / ${det.h2}`,det.h1===det.h2?'ok':'bad');
    }
    async function compare(){
      cmp={rows:[],cur:0,mis:null,done:false};det=null;const b1={...OPEN},b2={...OPEN};
      for(const e of events){
        b1[e.acct]+=e.delta;b2[e.acct]+=RED.v2(e.delta);
        const same=ACC.every(a=>b1[a]===b2[a]),row={seq:e.seq,acct:e.acct,delta:e.delta,v1:b1[e.acct],v2:b2[e.acct],same};
        cmp.cur=e.seq;cmp.rows.push(row);if(!same)cmp.mis=row;render();
        if(!same)break;
        await ctx.wait(320);
      }
      const s1=stateAt(events.length),s2=stateAt(events.length,'v2');
      Object.assign(cmp,{t1:sum(s1),t2:sum(s2),done:true,v2ok:sum(s2)===TOTAL&&ACC.every(a=>s2[a]>=0)&&txs.every(t=>!t.seqs||legs(t,'v2')===0)});
      render();ctx.log(cmp.mis?`v1 / v2 first diverge at #${cmp.mis.seq}`:'v1 / v2 agree on every event',cmp.mis?'bad':'ok');
      ctx.announce(cmp.mis?`First divergence at event ${cmp.mis.seq}`:'Both versions agree');
    }

    reset();render();
    enqueue(mk('D','B',500));

    /* ---- Preset scenarios ---- */
    const wrap=fn=>async()=>{busy=true;btns.forEach(b=>b.disabled=true);try{await fn()}finally{busy=false;btns.forEach(b=>b.disabled=false)}};
    function prepare(k){reset();snapK=k;sK.set(k,true);restoreBug=false;tBug.set(false,true);ctx.clearLog();render()}
    ctx.scenarios([
      {id:'history',label:'Replay to any sequence',
        ask:'Opening balance A = $100. Drag the replay position back to event #6: what is A’s balance? With a snapshot every 4 events, how many events does this replay apply?',
        insight:'At #6, A is $82.50: starting from snapshot #4 (A = $70.00), replay applies only the two events #5 and #6; with snapshots off it applies all 6 from #1, with the same result. Events after #6 take no part. tx3 (C sends B $80) was rejected for insufficient balance and produced no events, so it never appears in the history.',
        run:wrap(async()=>{prepare(4);await ctx.wait(700);for(let v=pos-1;v>=6;v--){pos=v;render();await ctx.wait(380)}ctx.announce('Replayed to event 6');await ctx.wait(1600);sK.set(0);await ctx.wait(1800);sK.set(4);await ctx.wait(900)})},
      {id:'snapshot-boundary',label:'Snapshot event applied twice',
        ask:'A snapshot is taken every 8 events, and snapshot #8 stores the balances after applying #8. When rebuilding the latest balances, if replay starts from #8 instead of #9, what do total funds become?',
        insight:'Event #8 (B +$25.00) is already in the snapshot and gets applied again: B goes from $40.00 to $65.00, and total funds become $195.00, $25 more than the opening. A snapshot must record its last applied sequence number, and recovery starts at the next event; checking that each event is “previous sequence + 1” before applying blocks this duplicate.',
        run:wrap(async()=>{prepare(8);await ctx.wait(1600);ctx.log('The recovery program ignored the snapshot’s last applied sequence number and started replaying from #8','bad');tBug.set(true);ctx.announce('Total funds become 195 dollars');await ctx.wait(2600)})},
      {id:'bad-event',label:'A bad event still replays',
        ask:'The command-handling code has a bug and writes “A sends C $1” as the events A −$1 and C +$10. Replay from scratch twice: do both runs agree? Does that prove the balances are correct?',
        insight:'Both replays give identical state checksums: events are immutable and the state machine is deterministic, so the result is reproducible. But total funds become $179.00 and the two legs of tx8 sum to +$9.00, so the conservation check fails. Replay proves only “reproducible”; a wrong fact is replayed faithfully too. You also need to check conservation of funds and account constraints, and reconcile against source documents and external settlement. The fix is to append a correction event, not to rewrite #14.',
        run:wrap(async()=>{prepare(4);await ctx.wait(500);bugNext=true;const c=mk('A','C',100);queue.push(c);render();await ctx.wait(500);await process(c);await ctx.wait(500);await twice();await ctx.wait(1600)})},
      {id:'version-diff',label:'Compare old and new versions per event',
        ask:'To “simplify,” candidate v2 truncates each event’s amount to whole dollars before applying it. Does it pass the total-funds conservation check? At which event does the first divergence appear?',
        insight:'v2’s total funds are still $170.00 and every conservation check passes: the cents truncated from the two legs of each transfer cancel out. The per-event comparison first diverges at #5 (D −$12.50): v1 computes D = $7.50, v2 gets $8.00. Comparing only the final total would miss this; compare every account at every event and locate the first divergence.',
        run:wrap(async()=>{prepare(4);await ctx.wait(600);await compare();await ctx.wait(2000)})},
    ]);
  }
});
})();
