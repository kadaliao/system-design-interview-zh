/* Chapter 22: Hotel Reservation. Lab 1 steps through two transactions racing for the last room; lab 2 shows multi-night inventory transactions, idempotent retries, and cache delay. */
(function(){
const {el:h}=SDLab;
const catchAbort=e=>{if(!(e&&e.abort))console.error('[SDLab]',e)};

/* ---------------- Lab 1: two guests, one last room ---------------- */
SDLab.define({
  id:'booking-race',chapter:22,
  title:'Two Guests, One Last Room',
  summary:'Physical inventory is 100 rooms, 10% overselling is allowed, so the sellable limit is 110, and 109 are booked. Guest A (order R7) and guest B (order R8) run booking transactions that interleave. Switch the concurrency protection and step through the inventory row’s values, the row lock, and how each transaction ends.',
  caveat:'Only one inventory row for one date is drawn (hotel 211, room type 1001, 06-01), and each guest books one room. Each step is one SQL statement or one in-app check; the interleaving is fixed as “A reads first, B writes and commits first.” Exact lock-wait, isolation-level, and CHECK-constraint behavior depends on the database you use.',
  mount(ctx){
    ctx.css('br',`
.br-card{border:1px solid #dbe2da;border-radius:10px;background:#fbfcfa;padding:10px 12px;margin-bottom:10px}
.br-cap{font-size:12px;color:#66756d;margin:0 0 6px}
.br-kvs{display:flex;flex-wrap:wrap;gap:6px 18px;align-items:flex-end}
.br-kv{font-size:12px;color:#66756d;line-height:1.35;min-width:0}
.br-kv b{display:block;font-size:19px;color:#23352f;font-variant-numeric:tabular-nums;font-family:ui-monospace,Menlo,monospace}
.br-kv.chg b{color:#2f6fb3}.br-kv.bad b{color:#c2413b}.br-kv.dim b{color:#a3aea7}
.br-rule{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#24558a;background:#dde9f6;border-radius:6px;padding:1px 7px;display:inline-block;margin-top:8px;overflow-wrap:anywhere}
.br-slots{display:flex;flex-wrap:wrap;gap:4px;margin:10px 0 4px}
.br-slot{width:30px;height:28px;border-radius:6px;border:1.5px solid #9fb3a6;display:flex;align-items:center;justify-content:center;font-size:11px;color:#66756d;background:#fff;font-variant-numeric:tabular-nums}
.br-slot.over{border-style:dashed;border-color:#c99a4a}
.br-slot.beyond{border-style:dashed;border-color:#c2413b;color:#c2413b}
.br-slot.fill{background:#2f8f5b;border:1.5px solid #2f8f5b;color:#fff}
.br-slot.pend{background:#f6ead2;border:1.5px solid #b7791f;color:#86561a}
.br-slot.fill.beyond,.br-slot.pend.beyond{background:#c2413b;border:1.5px solid #c2413b;color:#fff}
.br-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:#66756d}
.br-legend i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:4px;vertical-align:-1px;border:1.5px solid transparent}
.br-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.8fr) minmax(0,1fr);border:1px solid #dbe2da;border-radius:10px;overflow:hidden;font-size:13px}
.br-grid>div{padding:6px 10px;border-top:1px solid #e8ede6;min-height:36px;display:flex;align-items:center;gap:6px;line-height:1.45;flex-wrap:wrap}
.br-grid>.hd{background:#f0f4ed;font-weight:700;border-top:0;justify-content:center}
.br-grid>.mid{background:#fbfcfa;justify-content:center;font-family:ui-monospace,Menlo,monospace;text-align:center}
.br-grid>.b{justify-content:flex-end;text-align:right}
.br-grid>.cur{background:#fff7dd}
.br-grid>.wait{background:#f6ead2}
.br-grid>.future{color:#b4beb7}
.br-grid>.future .sdl-tag{opacity:.45}
.br-grid .op{font-family:ui-monospace,Menlo,monospace;font-size:12px}
.br-grid .res{color:#66756d}
.br-grid .res.ok{color:#1d6a41}.br-grid .res.bad{color:#9b2c27;font-weight:650}.br-grid .res.warn{color:#86561a}.br-grid .res.info{color:#24558a}
.br-narrow{grid-template-columns:minmax(0,1fr) 92px}
.br-narrow>.a,.br-narrow>.b{grid-column:1;grid-row:var(--r);justify-content:flex-start;text-align:left}
.br-narrow>.mid{grid-column:2;grid-row:var(--r);font-size:12px}
.br-narrow>.a:empty,.br-narrow>.b:empty,.br-narrow>.hd.hb{display:none}
.br-narrow>.hd.ha{grid-column:1;grid-row:1}.br-narrow>.hd.hm{grid-column:2;grid-row:1}
`);
    const MODES=[
      ['naive','None: check, then update'],
      ['lock','Pessimistic lock: FOR UPDATE'],
      ['version','Optimistic lock: version'],
      ['limit','Constraint: booked ≤ limit'],
      ['orig','Naive constraint: stock − booked ≥ 0'],
    ];
    const RULES={
      naive:'none; the app just SELECTs, then decides',
      lock:'SELECT … FOR UPDATE: the row lock is held until commit or rollback',
      version:'UPDATE … WHERE version = the version I read, then check affected rows',
      limit:'CHECK (total_reserved <= sellable_limit)',
      orig:'CHECK (total_inventory - total_reserved >= 0)',
    };
    let mode='naive',N=100,rem=1,trace=[],idx=0,cells=[],meta=null;
    const lim=()=>N+Math.floor(N/10);

    /* ---- Stage ---- */
    const kvBox=h('div',{class:'br-kvs'});
    const KV=[['inv','total_inventory'],['lim','sellable_limit'],['res','total_reserved'],['ver','version'],['lock','row lock']];
    const kv={};for(const [k,l] of KV){const b=h('b',null,'—');kv[k]={el:h('div',{class:'br-kv'},l,b),b};kvBox.append(kv[k].el)}
    const rule=h('div',{class:'br-rule'});
    const slots=h('div',{class:'br-slots',role:'img','aria-label':'Illustrative booked rooms'});
    const legend=h('div',{class:'br-legend'},
      h('span',null,h('i',{style:{background:'#2f8f5b'}}),'Committed'),
      h('span',null,h('i',{style:{background:'#f6ead2',borderColor:'#b7791f'}}),'In transaction, uncommitted'),
      h('span',null,h('i',{style:{borderColor:'#c99a4a',borderStyle:'dashed'}}),'Oversell allowance (beyond physical rooms)'),
      h('span',null,h('i',{style:{borderColor:'#c2413b',borderStyle:'dashed'}}),'Past the sellable limit'));
    const card=h('div',{class:'br-card'},h('p',{class:'br-cap'},'Inventory row: hotel 211 · room type 1001 · 06-01'),kvBox,rule,slots,legend);
    const grid=h('div',{class:'br-grid',role:'table','aria-label':'Execution steps of the two transactions'});
    const verdict=h('p',{class:'sdl-note',style:{fontSize:'14px',margin:'10px 0 0'}});
    ctx.stage.append(card,grid,verdict);
    let narrow=false;
    ctx.onResize(w=>{const n=w<560;if(n!==narrow){narrow=n;grid.classList.toggle('br-narrow',n);const hd=grid.querySelector('.hd.ha');if(hd)hd.textContent=n?'Guest A / B':'Guest A (R7)'}});
    const stats=ctx.stats([{key:'val',label:'Booked / limit'},{key:'ok',label:'Orders succeeded'},{key:'fail',label:'Orders failed'},{key:'over',label:'Oversold'}]);

    /* ---- Controls ---- */
    const modeCtl=ctx.segmented({label:'Concurrency protection',value:mode,wide:true,options:MODES,onChange:v=>{mode=v;build()}});
    const nCtl=ctx.select({label:'Physical inventory N (limit = N + ⌊N/10⌋)',value:'100',options:[['100','100 rooms → limit 110'],['15','15 rooms → limit 16'],['9','9 rooms → limit 9']],onChange:v=>{N=+v;build()}});
    const remCtl=ctx.slider({label:'Sellable rooms left at start',min:0,max:3,value:rem,format:v=>v+(v===1?' room':' rooms'),onChange:v=>{rem=v;build()}});
    const nextBtn=ctx.button('Next step',()=>step(),{primary:true});
    ctx.button('Autoplay',()=>autoplay().catch(catchAbort));
    ctx.button('Restart',()=>build());

    /* ---- Build the full execution trace of the two transactions (deterministic) ---- */
    function simulate(){
      const limit=lim();
      let R0=Math.max(0,limit-rem);if(mode==='orig')R0=Math.min(R0,N);
      const db={val:R0,ver:7,lock:null,pend:null};
      const T=[],seen={},out={A:'',B:''},oid={A:'R7',B:'R8'};
      const ver=mode==='version';
      const push=(who,op,text,tone,wait)=>T.push({who,op,text,tone,wait:!!wait,s:{val:db.val,ver:db.ver,lock:db.lock,pend:db.pend}});
      const read=w=>{seen[w]={v:db.val,ver:db.ver};push(w,ver?'SELECT total_reserved, version':'SELECT total_reserved',ver?`Read ${db.val}, version = ${db.ver}`:`Read ${db.val}`)};
      const check=(w,tail)=>{const v=seen[w].v,ok=v+1<=limit;if(!ok){out[w]='soldout';if(tail)db.lock=null}push(w,`Check ${v} + 1 ≤ ${limit}`,ok?'Room left, continue':'Sold out, ROLLBACK'+(tail||''),ok?null:'warn');return ok};
      const write=w=>{
        const v=db.val,nv=v+1;
        if(ver&&db.ver!==seen[w].ver){push(w,`UPDATE … WHERE version = ${seen[w].ver}`,`0 rows affected: version is now ${db.ver}`,'bad');return false}
        if(mode==='limit'&&nv>limit){push(w,'UPDATE … total_reserved + 1',`Result ${nv} > ${limit}, violates CHECK`,'bad');return false}
        if(mode==='orig'&&N-nv<0){push(w,'UPDATE … total_reserved + 1',`${N} − ${nv} < 0, violates CHECK`,'bad');return false}
        db.val=nv;if(ver)db.ver++;db.pend=w;
        push(w,ver?`UPDATE … +1, version + 1 WHERE version = ${seen[w].ver}`:'UPDATE … total_reserved + 1',ver?`1 row affected: booked ${v} → ${nv}`:`Booked ${v} → ${nv} (uncommitted)`,'info');
        return true;
      };
      const commit=(w,tail)=>{db.pend=null;if(tail)db.lock=null;push(w,`INSERT order ${oid[w]}; COMMIT`,'Committed'+(tail||''),'ok');out[w]='ok'};
      const reject=w=>{push(w,'ROLLBACK','Statement failed; no order created','warn');out[w]='reject'};
      let afterA=null,retried=false;
      if(mode==='lock'){
        db.lock='A';seen.A={v:db.val};push('A','SELECT … FOR UPDATE',`Read ${db.val}, got the row lock`,'info');
        push('B','SELECT … FOR UPDATE','Row locked by A, waiting','warn',true);
        if(check('A',', release the row lock')){write('A');commit('A',', release the row lock')}
        afterA=db.val;db.lock='B';seen.B={v:db.val};
        push('B','(wait over) SELECT returns',`Got the row lock, read ${db.val}`,'info');
        if(check('B',', release the row lock')){write('B');commit('B',', release the row lock')}
      }else{
        read('A');read('B');
        const okA=check('A'),okB=check('B');
        if(okB){if(write('B'))commit('B');else reject('B')}
        if(okA){
          if(write('A'))commit('A');
          else if(ver){
            retried=true;seen.A={v:db.val,ver:db.ver};
            push('A','ROLLBACK, read again',`Read ${db.val}, version = ${db.ver}`,'warn');
            if(check('A')){write('A');commit('A')}
          }else reject('A');
        }
      }
      return {T,R0,limit,out,afterA,retried};
    }

    function build(){
      meta=simulate();trace=meta.T;idx=0;
      grid.replaceChildren(h('div',{class:'hd ha'},narrow?'Guest A / B':'Guest A (R7)'),h('div',{class:'hd hm'},'Inventory row'),h('div',{class:'hd hb'},'Guest B (R8)'));
      cells=trace.map((st,i)=>{
        const a=h('div',{class:'a future',style:{'--r':i+2}}),m=h('div',{class:'mid future',style:{'--r':i+2}}),b=h('div',{class:'b future',style:{'--r':i+2}});
        const side=st.who==='A'?a:b;
        side.append(h('span',{class:'sdl-tag'},st.who+(i+1)),h('span',{class:'op'},st.op));
        grid.append(a,m,b);return {a,m,b,side};
      });
      rule.textContent='Constraint: '+RULES[mode];
      nextBtn.disabled=false;
      verdict.textContent=mode==='orig'&&meta.R0<meta.limit-rem?`With the naive constraint, booked can never exceed ${N}, so this starts at ${meta.R0}. Click “Next step” to run step by step.`:'Click “Next step” to run step by step, or “Autoplay.”';
      paint({val:meta.R0,ver:7,lock:null,pend:null});
      updateStats();
    }
    function paint(s){
      const limit=meta.limit;
      kv.inv.b.textContent=N;kv.lim.b.textContent=limit;kv.res.b.textContent=s.val+(s.pend?'*':'');kv.ver.b.textContent=mode==='version'?s.ver:'—';kv.lock.b.textContent=s.lock?'held by '+s.lock:'none';
      kv.res.el.className='br-kv'+(s.val>limit?' bad':s.val!==meta.R0?' chg':'');
      kv.lim.el.className='br-kv'+(mode==='orig'&&limit!==N?' dim':'');
      kv.ver.el.className='br-kv'+(mode==='version'?(s.ver!==7?' chg':''):' dim');
      kv.lock.el.className='br-kv'+(mode==='lock'?(s.lock?' chg':''):' dim');
      const lo=Math.max(1,limit-9),hi=limit+1,committed=s.val-(s.pend?1:0);
      slots.replaceChildren();
      for(let i=lo;i<=hi;i++){
        let c='br-slot';if(i>limit)c+=' beyond';else if(i>N)c+=' over';
        if(i<=committed)c+=' fill';else if(i<=s.val)c+=' pend';
        slots.append(h('span',{class:c,title:i>limit?'Past the sellable limit':i>N?'Oversell allowance':'Physical room'},i));
      }
      slots.setAttribute('aria-label',`Booked ${s.val}, physical inventory ${N}, sellable limit ${limit}`);
    }
    function updateStats(){
      const done=idx>=trace.length,s=idx?trace[idx-1].s:{val:meta.R0},limit=meta.limit;
      const ok=Object.values(meta.out).filter(v=>v==='ok').length,fail=2-ok,over=Math.max(0,s.val-limit);
      stats.set('val',s.val+' / '+limit,s.val>limit?'bad':null);
      stats.set('ok',done?ok:'—',done&&ok?'ok':null);
      stats.set('fail',done?fail:'—',done&&fail?'warn':null);
      stats.set('over',done?over:'—',done?(over?'bad':'ok'):null);
    }
    function step(){
      if(idx>=trace.length)return;
      const st=trace[idx],c=cells[idx];
      for(const x of cells){x.a.classList.remove('cur');x.m.classList.remove('cur');x.b.classList.remove('cur')}
      for(const k of ['a','m','b'])c[k].classList.remove('future');
      c.a.classList.add('cur');c.m.classList.add('cur');c.b.classList.add('cur');
      if(st.wait)c.side.classList.add('wait');
      c.side.append(h('span',{class:'res'+(st.tone?' '+st.tone:'')},'→ '+st.text));
      const s=st.s;
      c.m.replaceChildren(...[h('span',null,String(s.val)+(mode==='version'?' · v'+s.ver:'')),s.pend?h('span',{class:'sdl-tag warn'},'Uncommitted'):null,s.lock?h('span',{class:'sdl-tag info'},s.lock+' lock'):null].filter(Boolean));
      paint(s);idx++;updateStats();
      if(idx>=trace.length){nextBtn.disabled=true;verdict.textContent=explain();ctx.announce(verdict.textContent)}
    }
    function explain(){
      const {R0,limit,out,afterA,retried}=meta,val=trace[trace.length-1].s.val,over=Math.max(0,val-limit);
      const oks=Object.values(out).filter(v=>v==='ok').length;
      if(out.A==='soldout'&&out.B==='soldout')return `No rooms were left at the start, so both transactions find it sold out at the check, and booked stays at ${val}.`;
      if(mode==='naive')return over?`Both transactions read ${R0} and both decide “a room is left.” After B commits, A’s UPDATE adds 1 on top of the latest value, ending at ${val}, which is ${over} over the limit of ${limit}. Anyone can slip into the gap between “check” and “update.”`
        :`No overselling this time: ${rem} rooms were left at the start, enough for each guest to book one, so both orders succeeding is correct. Set “Sellable rooms left at start” to 1 to see the problem.`;
      if(mode==='lock')return `B’s SELECT … FOR UPDATE is blocked by the row lock and reads ${afterA} only after A commits and releases it`+(out.B==='ok'?'; a room is still left, so B succeeds too':'; B finds it sold out and rolls back')+`. Final value ${val}, no overselling. The cost is waiting: the longer the lock is held, the longer latecomers wait, so never hold a row lock while waiting for payment.`;
      if(mode==='version')return retried?`A’s UPDATE carries the stale version 7 and affects 0 rows, so A rolls back and rereads, seeing ${val}${out.A==='ok'?'; a room is still left, so the retry succeeds':'; it finds it sold out'}. Final value ${val}, no overselling. The more conflicts, the more rollbacks and retries.`
        :`The two updates did not conflict; final value ${val}.`;
      if(mode==='limit')return out.A==='reject'?`B first raises booked to ${R0+1}; A’s UPDATE would produce ${R0+2}, past the limit of ${limit}, so CHECK rejects it and A rolls back. The database guards the “booked ≤ sellable limit” invariant on the app’s behalf.`
        :`Neither order passed the limit of ${limit}, so the constraint never fired; final value ${val}.`;
      const same=limit===N;
      return `The app judges by 110% that a room is left, but the naive constraint requires total_inventory − total_reserved ≥ 0, so booked can reach only ${N}: ${oks} orders succeed and the other UPDATEs are rejected. `+(same?`With N = ${N}, ⌊${N}/10⌋ = 0, so overselling was never possible and the two constraints happen to be identical.`:`It forbids any overselling, contradicting the 10% the problem allows; constrain total_reserved ≤ sellable_limit (${N} + ⌊${N}/10⌋ = ${limit}) instead.`);
    }
    async function autoplay(){build();await ctx.wait(400);while(idx<trace.length){step();await ctx.wait(720)}}
    build();

    async function play(m,n,r){
      mode=m;N=n;rem=r;modeCtl.set(m,true);nCtl.set(String(n),true);remCtl.set(r,true);
      await autoplay();
    }
    ctx.scenarios([
      {id:'naive',label:'No protection: check, then update',
        ask:'The sellable limit is 110 and 109 are booked, so 1 room is left. A and B each SELECT, then check, then UPDATE; B commits first and A follows. What is the final total_reserved, and how many orders succeed?',
        insight:'The final value is 111 and both orders succeed, one room oversold. Both transactions read 109 and both decide 1 room is left; B raises it to 110, and A’s UPDATE adds 1 on top of the latest value. Nothing protects the gap between check and update.',
        async run(){await play('naive',100,1)}},
      {id:'lock',label:'Pessimistic lock: one side waits',
        ask:'Switch to SELECT … FOR UPDATE. A takes the row lock first, and B queries right after. Will B read 109?',
        insight:'No. B’s query is blocked by the row lock, and only after A commits and releases it does B read 110, find it sold out, and roll back. The conflict is serialized: final value 110, and only R7 succeeds. The cost is B’s wait: the more work done under the lock and the longer the transaction, the longer latecomers wait.',
        async run(){await play('lock',100,1)}},
      {id:'version',label:'Optimistic lock: conflict found at commit',
        ask:'Both read booked = 109 and version = 7. B commits first and sets version to 8. How many rows does A’s UPDATE … WHERE version = 7 affect?',
        insight:'0 rows. A learns someone got there first, rolls back, rereads 110 and version = 8, and finds it sold out. The key is that WHERE compares “the version I read” and you check the affected row count; under heavy contention these rollbacks and retries happen a lot.',
        async run(){await play('version',100,1)}},
      {id:'check',label:'What the constraint should limit',
        ask:'With 100 physical rooms and 10% overselling allowed: under the naive CHECK(total_inventory − total_reserved ≥ 0), can you sell more once 100 are booked? What about the last room under CHECK(total_reserved ≤ sellable_limit)?',
        insight:'Under the naive constraint both UPDATEs are rejected: the app thinks 10 rooms of overselling allowance remain, but the database caps booked at 100. With booked ≤ sellable limit (100 + ⌊100/10⌋ = 110), B commits first and succeeds, and A’s UPDATE would reach 111, trips the constraint, and rolls back, stopping at 110. The limit is an integer: 15 rooms give 16, and 9 rooms still give 9.',
        async run(){await play('orig',100,1);await ctx.wait(1500);await play('limit',100,1)}},
    ]);
  }
});

/* ---------------- Lab 2: three consecutive nights, idempotent retries, and cache ---------------- */
SDLab.define({
  id:'booking-multi-night',chapter:22,
  title:'Multi-Night Transactions, Idempotent Retries, and Cache Delay',
  summary:'Inventory has one row per night, by “hotel × room type × date.” On submit, one transaction updates each night conditionally, and if any night is short the whole order rolls back; a timeout retry is recognized as the same order by reservation_id; the display page reads a Redis cache synced asynchronously by CDC.',
  caveat:'Only four dates for hotel 211, room type 1001, are drawn, each night has a sellable limit of 110, and each order books one room. The conditional update reads “booked + 1 ≤ limit.” The clock is slowed-down simulated time (20 ms per network hop, 10 ms per SQL statement, 3 s client timeout). Payment, hold expiry, and cancellation are not drawn.',
  mount(ctx){
    ctx.css('bm',`
.bm-top{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline;justify-content:space-between;margin-bottom:6px;font-size:13px;color:#66756d}
.bm-clock{font-family:ui-monospace,Menlo,monospace;color:#2f6fb3;font-weight:650;font-size:14px}
.bm-inv{display:table;width:100%;border-collapse:separate;border-spacing:4px;font-size:13px;table-layout:fixed;margin:0;overflow:visible}
.bm-inv th,.bm-inv td{min-width:0}
.bm-inv th{font-weight:650;color:#66756d;text-align:center;font-size:13px;padding:0;background:none;border:0}
.bm-inv th.rl{width:86px}
.bm-inv td{background:#f6f8f4;border:1px solid #e3e9e1;border-radius:8px;text-align:center;padding:5px 2px;vertical-align:middle;line-height:1.3;transition:background .2s}
.bm-inv td.rl{background:none;border:0;text-align:left;font-size:12px;color:#66756d;padding:0 2px 0 0}
.bm-inv .n{font-size:19px;font-weight:750;font-variant-numeric:tabular-nums;display:block}
.bm-inv .s{font-size:11px;color:#66756d;display:block}
.bm-inv td.use{background:#dde9f6;border-color:#b9d0ea;color:#24558a;font-weight:650}
.bm-inv td.out{background:#fff;border-style:dashed;color:#66756d;font-size:12px}
.bm-inv td.none{background:#fff;color:#b4beb7}
.bm-inv td.pend{background:#f6ead2;border-color:#d9b36b}
.bm-inv td.fail{background:#f7dedb;border-color:#e3aaa4}
.bm-inv td.fail .n{color:#9b2c27}
.bm-inv td.stale{background:#fff7e6;border-color:#e0c088}
.bm-inv td.stale .n{color:#86561a}
.bm-bar{display:block;height:4px;border-radius:2px;background:#eadfc8;margin:3px 8px 0;overflow:hidden}
.bm-bar i{display:block;height:100%;width:0;background:#b7791f}
.bm-orders{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:10px 0 8px;font-size:13px;color:#66756d}
.bm-seq{border:1px solid #dbe2da;border-radius:10px;background:#fbfcfa;font-size:13px;overflow:hidden}
.bm-ev{display:grid;grid-template-columns:92px 112px minmax(0,1fr);gap:8px;padding:5px 10px;align-items:baseline;border-top:1px solid #eef2ec;line-height:1.45}
.bm-ev:first-child{border-top:0}
.bm-ev .t{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#66756d}
.bm-ev .ln{font-size:12px;color:#66756d;white-space:nowrap}
.bm-ev.ok .x{color:#1d6a41}.bm-ev.bad .x{color:#9b2c27}.bm-ev.warn .x{color:#86561a}.bm-ev.info .x{color:#24558a}
.bm-ev.last{background:#fff7dd}
.bm-narrow .bm-ev{grid-template-columns:auto minmax(0,1fr);gap:0 8px}
.bm-narrow .bm-ev .x{grid-column:1/-1}
.bm-narrow .bm-inv th.rl{width:58px}
.bm-narrow .bm-inv .n{font-size:17px}
`);
    const DATES=['9/10','9/11','9/12','9/13'],LIMIT=110,HOP=20,SQL=10,STEP=560;
    const STAYS={
      a:{label:'9/10 check-in → 9/13 check-out (3 nights)',short:'9/10–9/13',nights:[0,1,2],out:3},
      b:{label:'9/12 check-in → 9/14 check-out (2 nights)',short:'9/12–9/14',nights:[2,3],out:-1},
      c:{label:'9/12 check-in → 9/13 check-out (1 night)',short:'9/12–9/13',nights:[2],out:3},
    };
    let S,stay='a',cdcDelay=200,lose=false,scripted=false,clockTarget=null,clockRate=0,gen=0,busy=false;
    const fresh=rem=>({res:rem.map(r=>LIMIT-r),pend:[0,0,0,0],fail:-1,cache:rem.slice(),cdc:[],orders:[],idem:new Map(),seq:[],t:0,next:7,last:null,dup:0});
    S=fresh([2,0,4,3]);

    /* ---- Stage ---- */
    const clock=h('span',{class:'bm-clock'});
    const top=h('div',{class:'bm-top'},h('span',null,'Hotel 211 · room type 1001 · sellable limit 110 per night'),h('span',null,'Simulated clock ',clock));
    const table=h('table',{class:'bm-inv'});
    const head=h('tr',null,h('th',{class:'rl'}),DATES.map(d=>h('th',null,d)));
    const rows={use:[],db:[],cache:[]};
    const mkRow=(key,label)=>{const tr=h('tr',null,h('td',{class:'rl'},label));for(let i=0;i<4;i++){const td=h('td');rows[key].push(td);tr.append(td)}return tr};
    table.append(h('thead',null,head),h('tbody',null,mkRow('use','This order'),mkRow('db','Database (authoritative)'),mkRow('cache','Redis (display)')));
    const orders=h('div',{class:'bm-orders'});
    const seqBox=h('div',{class:'bm-seq',role:'log','aria-label':'Request timeline'});
    ctx.stage.append(top,h('div',{class:'sdl-scroll'},table),orders,seqBox);
    ctx.onResize(w=>ctx.stage.classList.toggle('bm-narrow',w<560));
    const stats=ctx.stats([{key:'ok',label:'Confirmed orders'},{key:'fail',label:'Sold out / rolled back'},{key:'dup',label:'Retries caught by idempotency'},{key:'stale',label:'Stale cache cells'}]);

    /* ---- Controls ---- */
    const stayCtl=ctx.select({label:'Stay (check-out day is not a night)',value:stay,options:Object.entries(STAYS).map(([k,v])=>[k,v.label]),onChange:v=>{stay=v;renderTable()}});
    const cdcCtl=ctx.slider({label:'CDC sync delay',min:50,max:2000,step:50,value:cdcDelay,format:v=>v+' ms',onChange:v=>{cdcDelay=v}});
    const loseCtl=ctx.toggle({label:'Lose the next response in the network',value:false,onChange:v=>{lose=v}});
    const newBtn=ctx.button('Submit a new order',()=>free(()=>{const id='R'+S.next++;const l=lose;lose=false;loseCtl.set(false,true);return submit(id,stay,{lose:l,who:'Guest'})}),{primary:true});
    const retryBtn=ctx.button('Retry with the same ID',()=>free(()=>submit(S.last,stay,{who:'Guest',retry:true})));
    const viewBtn=ctx.button('View the display page',()=>free(()=>view('Guest')));
    const actBtns=[newBtn,retryBtn,viewBtn];

    /* ---- Clock and CDC ---- */
    const fmtT=t=>{const ms=Math.round(t),s=Math.floor(ms/1000),m=Math.floor(s/60);return `10:${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`};
    function applyCDC(){
      if(!S.cdc.length)return;
      const due=S.cdc.filter(e=>S.t>=e.due-1e-6).sort((a,b)=>a.due-b.due);
      if(!due.length)return;
      S.cdc=S.cdc.filter(e=>!due.includes(e));
      for(const e of due){S.cache[e.n]=e.val;say('CDC → Redis',`cache ${DATES[e.n]} updated to ${e.val}`,'info',e.due)}
      renderTable();
    }
    let acc=0;
    const lp=ctx.loop(dt=>{
      if(clockTarget!=null)S.t=Math.min(clockTarget,S.t+dt*1000*clockRate);
      else if(S.cdc.length&&!scripted)S.t+=dt*1000*0.25;
      else{lp.stop();return}
      applyCDC();acc+=dt;if(acc>1/30){acc=0;renderClock();renderCacheBars()}
    },false);
    async function adv(ms,real=STEP){
      const target=S.t+ms;clockTarget=target;clockRate=ms/real;lp.start();
      await ctx.wait(real);
      S.t=target;clockTarget=null;applyCDC();renderClock();renderCacheBars();
      if(S.cdc.length&&!scripted)lp.start();
    }

    /* ---- Rendering ---- */
    function renderClock(){clock.textContent=fmtT(S.t)}
    function renderTable(){
      const st=STAYS[stay];
      for(let i=0;i<4;i++){
        const u=rows.use[i];
        if(st.nights.includes(i)){u.className='use';u.textContent='Stay'}
        else if(st.out===i){u.className='out';u.textContent='Check-out'}
        else{u.className='none';u.textContent='—'}
        const d=rows.db[i],r=LIMIT-S.res[i];
        d.className=S.fail===i?'fail':S.pend[i]?'pend':'';
        d.replaceChildren(h('span',{class:'n'},r),h('span',{class:'s'},S.fail===i?'Short by 1':S.pend[i]?'Held, pending':'Booked '+S.res[i]));
      }
      renderCacheBars(true);
      const committed=S.res.map((x,i)=>LIMIT-(x-S.pend[i]));
      const stale=S.cache.filter((c,i)=>c!==committed[i]).length;
      stats.set('ok',S.orders.filter(o=>o.status==='ok').length,'ok');
      stats.set('fail',S.orders.filter(o=>o.status==='fail').length,S.orders.some(o=>o.status==='fail')?'warn':null);
      stats.set('dup',S.dup,S.dup?'info':null);
      stats.set('stale',stale,stale?'warn':null);
    }
    function renderCacheBars(full){
      const committed=S.res.map((x,i)=>LIMIT-(x-S.pend[i]));
      for(let i=0;i<4;i++){
        const c=rows.cache[i],ev=S.cdc.filter(e=>e.n===i).sort((a,b)=>a.due-b.due)[0];
        const stale=S.cache[i]!==committed[i];
        if(full||c.__v!==S.cache[i]||c.__s!==stale||c.__e!==ev){
          c.__v=S.cache[i];c.__s=stale;c.__e=ev;c.className=stale?'stale':'';
          c.__bar=ev?h('i'):null;
          c.replaceChildren(...[h('span',{class:'n'},S.cache[i]),h('span',{class:'s'},stale?(ev?'Stale, syncing':'Stale'):'Synced'),ev?h('span',{class:'bm-bar'},c.__bar):null].filter(Boolean));
        }
        if(ev&&c.__bar)c.__bar.style.width=Math.min(100,Math.max(0,(S.t-ev.start)/(ev.due-ev.start)*100))+'%';
      }
    }
    function renderOrders(){
      orders.replaceChildren(h('span',null,'Orders: '));
      if(!S.orders.length){orders.append(h('span',null,'None yet'));return}
      for(const o of S.orders)orders.append(h('span',{class:'sdl-tag '+({ok:'ok',fail:'bad',pend:'warn'}[o.status]),title:o.note||''},`${o.id} ${STAYS[o.key].short} ${({ok:'confirmed',fail:'sold out, rolled back',pend:'in progress'}[o.status])}`));
    }
    function say(lane,text,tone,t){
      S.seq.push({t:t??S.t,lane,text,tone});if(S.seq.length>60)S.seq.shift();
      renderSeq();
    }
    function renderSeq(){
      const list=S.seq.slice(-8);
      seqBox.replaceChildren(...list.map((e,i)=>h('div',{class:'bm-ev'+(e.tone?' '+e.tone:'')+(i===list.length-1&&busy?' last':'')},h('span',{class:'t'},fmtT(e.t)),h('span',{class:'ln'},e.lane),h('span',{class:'x'},e.text))));
      if(!list.length)seqBox.append(h('div',{class:'bm-ev'},h('span',{class:'t'},fmtT(S.t)),h('span',{class:'ln'},'Hint'),h('span',{class:'x'},'Pick a stay, click “Submit a new order,” or run a preset scenario above.')));
    }
    function setOrder(id,key,status,note){let o=S.orders.find(x=>x.id===id);if(!o){o={id,key};S.orders.push(o)}o.status=status;o.note=note;renderOrders();renderTable()}
    function renderAll(){renderClock();renderTable();renderOrders();renderSeq()}

    /* ---- Reservation service ---- */
    async function db(text,tone){await adv(SQL);say('Database',text,tone)}
    async function submit(id,key,o={}){
      const st=STAYS[key],who=o.who||'Guest';
      S.fail=-1;renderTable();
      await adv(HOP);say('Client → service',`${who} ${o.retry?'retries':'submits'} ${id}: ${st.short}, 1 room`);
      const prev=S.idem.get(id);
      if(prev){
        await db(`INSERT order ${id} → unique constraint violation, ${id} already exists`,'warn');
        if(prev.key!==key){await db('ROLLBACK','warn');await adv(HOP);say('Service → client',`409 rejected: ${id} is already bound to ${STAYS[prev.key].short}; one key cannot switch dates`,'bad');return 'mismatch'}
        await db('Same parameters: read the existing order, ROLLBACK, no further deduction','warn');S.dup++;renderTable();
        await adv(HOP);say('Service → client',`200 returns the original order ${id}: confirmed`,'ok');return 'dup';
      }
      S.last=id;
      await db(`BEGIN; INSERT order ${id} (reservation_id unique) → success`);
      setOrder(id,key,'pend');
      for(const n of st.nights){
        await adv(SQL);
        const r=LIMIT-S.res[n];
        if(r>=1){S.res[n]++;S.pend[n]++;renderTable();say('Database',`UPDATE ${DATES[n]} (booked + 1 ≤ 110) → 1 row affected, remaining ${r} → ${r-1}, held`,'info')}
        else{
          S.fail=n;renderTable();say('Database',`UPDATE ${DATES[n]} (booked + 1 ≤ 110) → 0 rows affected, 0 left that night`,'bad');
          await adv(SQL);const undone=[];
          for(let i=0;i<4;i++)if(S.pend[i]){S.res[i]-=S.pend[i];S.pend[i]=0;undone.push(`${DATES[i]} restored to ${LIMIT-S.res[i]}`)}
          say('Database',`ROLLBACK: ${undone.length?undone.join(', ')+'; ':''}order ${id} is undone too`,'warn');
          setOrder(id,key,'fail',`${DATES[n]} sold out`);
          await adv(HOP);say('Service → client',`409 sold out: no rooms left on ${DATES[n]}, so the whole order fails`,'bad');return 'soldout';
        }
      }
      await adv(SQL);
      for(let i=0;i<4;i++)if(S.pend[i]){S.pend[i]=0;S.cdc.push({n:i,start:S.t,due:S.t+cdcDelay,val:LIMIT-S.res[i]})}
      S.idem.set(id,{key});setOrder(id,key,'ok');
      say('Database',`COMMIT: inventory for ${st.nights.length===1?'1 night':st.nights.length+' nights'} and order ${id} take effect together`,'ok');
      if(o.lose){await adv(HOP);say('Service → client',`201 confirmed ${id}, but the response is lost in the network`,'bad');await adv(3000,800);say('Client',`No reply after 3 s; the guest can’t tell whether the booking went through`,'warn')}
      else{await adv(HOP);say('Service → client',`201 confirmed ${id}`,'ok')}
      return 'ok';
    }
    async function view(who){
      await adv(0,420);
      const st=STAYS[stay];
      say('Display ← Redis',`${who} sees: `+st.nights.map(n=>`${DATES[n]}: ${S.cache[n]} left`).join(', '),'info');
    }
    function lockBtns(v){busy=v;for(const b of actBtns)b.disabled=v||(b===retryBtn&&!S.last);renderSeq()}
    async function guarded(fn){const g=++gen;lockBtns(true);try{await fn()}finally{if(g===gen)lockBtns(false)}}
    function free(fn){
      if(busy)return;
      if(scripted){scripted=false}
      if(S.pend.some(Boolean)){for(let i=0;i<4;i++){S.res[i]-=S.pend[i];S.pend[i]=0}S.orders=S.orders.filter(o=>o.status!=='pend');renderAll()}
      clockTarget=null;
      guarded(fn).catch(catchAbort);
    }
    renderAll();lockBtns(false);

    /* ---- Preset scenarios ---- */
    function prepare(rem,key,delay){
      S=fresh(rem);stay=key;stayCtl.set(key,true);cdcDelay=delay||200;cdcCtl.set(cdcDelay,true);lose=false;loseCtl.set(false,true);
      scripted=true;clockTarget=null;renderAll();
    }
    ctx.scenarios([
      {id:'rollback',label:'No room on the middle night',
        ask:'Check-in 9/10 and check-out 9/13 occupy the nights of 9/10, 9/11, and 9/12, with 2, 0, and 4 rooms left. The transaction first holds 9/10 down to 1, then finds no room on 9/11. How many rooms are left on each night in the end? What is the state of order R7?',
        insight:'The three nights are still 2, 0, and 4: the conditional update on 9/11 affects 0 rows, the transaction rolls back, the hold on 9/10 is restored, 9/12 is never reached, and R7 leaves no trace. The tightest night decides whether you can book: min(2, 0, 4) = 0; 9/13 is the check-out day and does not use a night. Rebooking R8 for 9/12–9/14 then has room on both nights, and 4 → 3 and 3 → 2 commit together; 200 ms later CDC updates the cache too.',
        run:()=>guarded(async()=>{
          prepare([2,0,4,3],'a');await adv(0,500);
          await submit('R7','a',{who:'Guest A'});
          await adv(0,1300);stay='b';stayCtl.set('b',true);renderTable();await adv(0,500);
          await submit('R8','b',{who:'Guest A (rebooking)'});
          await adv(220,1100);
        })},
      {id:'retry',label:'Timeout retry and two orders',
        ask:'R7 books 9/12–9/14, and 9/12 had only 1 room left. R7’s deduction succeeds, but the response is lost. The client retries with the same R7; will inventory be deducted again? Then guest B books the same two nights with R8; can the idempotency key stop B?',
        insight:'The retried R7 hits the unique constraint and the service returns the original order; 9/12 and 9/13 are deducted only once (1 → 0, 3 → 2). R8 is a different, valid order, so the idempotency layer lets it through as usual; it is the conditional update on 9/12 affecting 0 rows that rolls back all of R8 and returns sold out. Idempotency governs how many times one thing is done; inventory control governs how many copies different people can buy. If the client retried with a new ID after the timeout, it would be treated as a second order.',
        run:()=>guarded(async()=>{
          prepare([2,0,1,3],'b');await adv(0,500);
          await submit('R7','b',{who:'Guest A',lose:true});
          await submit('R7','b',{who:'Guest A',retry:true});
          await adv(0,700);
          await submit('R8','b',{who:'Guest B'});
          await adv(0,600);
        })},
      {id:'cache',label:'Cache shows a room',
        ask:'At 10:00:00 the cache shows 1 room left on 9/12. Guest B’s order is submitted at 10:00:01.000, and CDC takes 200 ms to set the cache to 0. Guest A opens the display page at 10:00:01.100: how many rooms does A see? Will A’s submission then succeed?',
        insight:'At 10:00:01.100 A still sees 1 room: the CDC event updates Redis only at 10:00:01.200. By the time A submits, the database already says 0, so the conditional update affects 0 rows, rolls back, and returns sold out. Displayed inventory is just an observation that can go stale, and the database transaction decides the sale; even with no cache, someone else could book the room between viewing and submitting.',
        run:()=>guarded(async()=>{
          prepare([2,0,1,3],'c',200);
          await view('Guest A');
          await adv(950,700);say('Client','Guest B also sees 1 room and clicks Book');
          await submit('R8','c',{who:'Guest B'});
          await adv(80,700);await view('Guest A');
          await submit('R7','c',{who:'Guest A'});
          await adv(30,700);
          await view('Guest A');await adv(0,400);
        })},
    ]);
  }
});
})();
