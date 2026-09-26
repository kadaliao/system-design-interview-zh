/* 第 22 章：酒店预订。实验一逐步执行两条抢最后一间房的事务；实验二演示多晚库存事务、幂等重试与缓存延迟。 */
(function(){
const {el:h}=SDLab;
const catchAbort=e=>{if(!(e&&e.abort))console.error('[SDLab]',e)};

/* ---------------- 实验一：两位客人抢最后一间房 ---------------- */
SDLab.define({
  id:'booking-race',chapter:22,
  title:'两位客人抢最后一间房',
  summary:'物理库存 100 间，允许超售 10%，可售上限 110，已订 109。客人 A（订单 R7）和客人 B（订单 R8）的预订事务交错执行。切换并发保护方式，逐步看库存行的值、行锁和两条事务的结局。',
  caveat:'只画一个日期的一行库存（酒店 211、房型 1001、06-01），每人订一间。每一步代表一条 SQL 或一次应用内判断；交错顺序固定为「A 先读，B 先写入并提交」。锁等待、隔离级别和 CHECK 约束的具体行为以所用数据库为准。',
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
      ['naive','无保护：先查后改'],
      ['lock','悲观锁 FOR UPDATE'],
      ['version','乐观锁：版本号'],
      ['limit','约束：已订 ≤ 可售上限'],
      ['orig','原文约束：库存 − 已订 ≥ 0'],
    ];
    const RULES={
      naive:'没有约束，只靠应用先 SELECT 再判断',
      lock:'SELECT … FOR UPDATE：行锁保持到提交或回滚',
      version:'UPDATE … WHERE version = 我读到的版本，并检查影响行数',
      limit:'CHECK (total_reserved <= sellable_limit)',
      orig:'CHECK (total_inventory - total_reserved >= 0)',
    };
    let mode='naive',N=100,rem=1,trace=[],idx=0,cells=[],meta=null;
    const lim=()=>N+Math.floor(N/10);

    /* ---- 舞台 ---- */
    const kvBox=h('div',{class:'br-kvs'});
    const KV=[['inv','total_inventory'],['lim','sellable_limit'],['res','total_reserved'],['ver','version'],['lock','行锁']];
    const kv={};for(const [k,l] of KV){const b=h('b',null,'—');kv[k]={el:h('div',{class:'br-kv'},l,b),b};kvBox.append(kv[k].el)}
    const rule=h('div',{class:'br-rule'});
    const slots=h('div',{class:'br-slots',role:'img','aria-label':'已售房间示意'});
    const legend=h('div',{class:'br-legend'},
      h('span',null,h('i',{style:{background:'#2f8f5b'}}),'已提交'),
      h('span',null,h('i',{style:{background:'#f6ead2',borderColor:'#b7791f'}}),'事务中，未提交'),
      h('span',null,h('i',{style:{borderColor:'#c99a4a',borderStyle:'dashed'}}),'超售额度（超过物理房数）'),
      h('span',null,h('i',{style:{borderColor:'#c2413b',borderStyle:'dashed'}}),'越过可售上限'));
    const card=h('div',{class:'br-card'},h('p',{class:'br-cap'},'库存行：酒店 211 · 房型 1001 · 06-01'),kvBox,rule,slots,legend);
    const grid=h('div',{class:'br-grid',role:'table','aria-label':'两条事务的执行步骤'});
    const verdict=h('p',{class:'sdl-note',style:{fontSize:'14px',margin:'10px 0 0'}});
    ctx.stage.append(card,grid,verdict);
    let narrow=false;
    ctx.onResize(w=>{const n=w<560;if(n!==narrow){narrow=n;grid.classList.toggle('br-narrow',n);const hd=grid.querySelector('.hd.ha');if(hd)hd.textContent=n?'客人 A / 客人 B':'客人 A（R7）'}});
    const stats=ctx.stats([{key:'val',label:'已订 / 可售上限'},{key:'ok',label:'成交订单'},{key:'fail',label:'未成交'},{key:'over',label:'超卖'}]);

    /* ---- 控件 ---- */
    const modeCtl=ctx.segmented({label:'并发保护方式',value:mode,wide:true,options:MODES,onChange:v=>{mode=v;build()}});
    const nCtl=ctx.select({label:'物理库存 N（上限 = N + ⌊N/10⌋）',value:'100',options:[['100','100 间 → 上限 110'],['15','15 间 → 上限 16'],['9','9 间 → 上限 9']],onChange:v=>{N=+v;build()}});
    const remCtl=ctx.slider({label:'开始时剩余可售',min:0,max:3,value:rem,format:v=>v+' 间',onChange:v=>{rem=v;build()}});
    const nextBtn=ctx.button('下一步',()=>step(),{primary:true});
    ctx.button('自动播放',()=>autoplay().catch(catchAbort));
    ctx.button('从头开始',()=>build());

    /* ---- 生成两条事务的完整执行轨迹（确定性） ---- */
    function simulate(){
      const limit=lim();
      let R0=Math.max(0,limit-rem);if(mode==='orig')R0=Math.min(R0,N);
      const db={val:R0,ver:7,lock:null,pend:null};
      const T=[],seen={},out={A:'',B:''},oid={A:'R7',B:'R8'};
      const ver=mode==='version';
      const push=(who,op,text,tone,wait)=>T.push({who,op,text,tone,wait:!!wait,s:{val:db.val,ver:db.ver,lock:db.lock,pend:db.pend}});
      const read=w=>{seen[w]={v:db.val,ver:db.ver};push(w,ver?'SELECT total_reserved, version':'SELECT total_reserved',ver?`读到 ${db.val}，version = ${db.ver}`:`读到 ${db.val}`)};
      const check=(w,tail)=>{const v=seen[w].v,ok=v+1<=limit;if(!ok){out[w]='soldout';if(tail)db.lock=null}push(w,`判断 ${v} + 1 ≤ ${limit}`,ok?'还有房，继续':'售罄，ROLLBACK'+(tail||''),ok?null:'warn');return ok};
      const write=w=>{
        const v=db.val,nv=v+1;
        if(ver&&db.ver!==seen[w].ver){push(w,`UPDATE … WHERE version = ${seen[w].ver}`,`影响 0 行：version 已是 ${db.ver}`,'bad');return false}
        if(mode==='limit'&&nv>limit){push(w,'UPDATE … total_reserved + 1',`得到 ${nv} > ${limit}，违反 CHECK`,'bad');return false}
        if(mode==='orig'&&N-nv<0){push(w,'UPDATE … total_reserved + 1',`${N} − ${nv} < 0，违反 CHECK`,'bad');return false}
        db.val=nv;if(ver)db.ver++;db.pend=w;
        push(w,ver?`UPDATE … +1, version + 1 WHERE version = ${seen[w].ver}`:'UPDATE … total_reserved + 1',ver?`影响 1 行：已订 ${v} → ${nv}`:`已订 ${v} → ${nv}（未提交）`,'info');
        return true;
      };
      const commit=(w,tail)=>{db.pend=null;if(tail)db.lock=null;push(w,`INSERT 订单 ${oid[w]}；COMMIT`,'提交成功'+(tail||''),'ok');out[w]='ok'};
      const reject=w=>{push(w,'ROLLBACK','语句失败，订单未创建','warn');out[w]='reject'};
      let afterA=null,retried=false;
      if(mode==='lock'){
        db.lock='A';seen.A={v:db.val};push('A','SELECT … FOR UPDATE',`读到 ${db.val}，拿到行锁`,'info');
        push('B','SELECT … FOR UPDATE','行被 A 锁住，等待','warn',true);
        if(check('A','，释放行锁')){write('A');commit('A','，释放行锁')}
        afterA=db.val;db.lock='B';seen.B={v:db.val};
        push('B','（等待结束）SELECT 返回',`拿到行锁，读到 ${db.val}`,'info');
        if(check('B','，释放行锁')){write('B');commit('B','，释放行锁')}
      }else{
        read('A');read('B');
        const okA=check('A'),okB=check('B');
        if(okB){if(write('B'))commit('B');else reject('B')}
        if(okA){
          if(write('A'))commit('A');
          else if(ver){
            retried=true;seen.A={v:db.val,ver:db.ver};
            push('A','ROLLBACK，重新读取',`读到 ${db.val}，version = ${db.ver}`,'warn');
            if(check('A')){write('A');commit('A')}
          }else reject('A');
        }
      }
      return {T,R0,limit,out,afterA,retried};
    }

    function build(){
      meta=simulate();trace=meta.T;idx=0;
      grid.replaceChildren(h('div',{class:'hd ha'},narrow?'客人 A / 客人 B':'客人 A（R7）'),h('div',{class:'hd hm'},'库存行'),h('div',{class:'hd hb'},'客人 B（R8）'));
      cells=trace.map((st,i)=>{
        const a=h('div',{class:'a future',style:{'--r':i+2}}),m=h('div',{class:'mid future',style:{'--r':i+2}}),b=h('div',{class:'b future',style:{'--r':i+2}});
        const side=st.who==='A'?a:b;
        side.append(h('span',{class:'sdl-tag'},st.who+(i+1)),h('span',{class:'op'},st.op));
        grid.append(a,m,b);return {a,m,b,side};
      });
      rule.textContent='约束：'+RULES[mode];
      nextBtn.disabled=false;
      verdict.textContent=mode==='orig'&&meta.R0<meta.limit-rem?`原文约束下已订不可能超过 ${N}，这里从 ${meta.R0} 开始。点「下一步」逐步执行。`:'点「下一步」逐步执行，或点「自动播放」。';
      paint({val:meta.R0,ver:7,lock:null,pend:null});
      updateStats();
    }
    function paint(s){
      const limit=meta.limit;
      kv.inv.b.textContent=N;kv.lim.b.textContent=limit;kv.res.b.textContent=s.val+(s.pend?'*':'');kv.ver.b.textContent=mode==='version'?s.ver:'—';kv.lock.b.textContent=s.lock?s.lock+' 持有':'无';
      kv.res.el.className='br-kv'+(s.val>limit?' bad':s.val!==meta.R0?' chg':'');
      kv.lim.el.className='br-kv'+(mode==='orig'&&limit!==N?' dim':'');
      kv.ver.el.className='br-kv'+(mode==='version'?(s.ver!==7?' chg':''):' dim');
      kv.lock.el.className='br-kv'+(mode==='lock'?(s.lock?' chg':''):' dim');
      const lo=Math.max(1,limit-9),hi=limit+1,committed=s.val-(s.pend?1:0);
      slots.replaceChildren();
      for(let i=lo;i<=hi;i++){
        let c='br-slot';if(i>limit)c+=' beyond';else if(i>N)c+=' over';
        if(i<=committed)c+=' fill';else if(i<=s.val)c+=' pend';
        slots.append(h('span',{class:c,title:i>limit?'越过可售上限':i>N?'超售额度':'物理客房'},i));
      }
      slots.setAttribute('aria-label',`已订 ${s.val}，物理库存 ${N}，可售上限 ${limit}`);
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
      c.m.replaceChildren(...[h('span',null,String(s.val)+(mode==='version'?' · v'+s.ver:'')),s.pend?h('span',{class:'sdl-tag warn'},'未提交'):null,s.lock?h('span',{class:'sdl-tag info'},s.lock+' 锁'):null].filter(Boolean));
      paint(s);idx++;updateStats();
      if(idx>=trace.length){nextBtn.disabled=true;verdict.textContent=explain();ctx.announce(verdict.textContent)}
    }
    function explain(){
      const {R0,limit,out,afterA,retried}=meta,val=trace[trace.length-1].s.val,over=Math.max(0,val-limit);
      const oks=Object.values(out).filter(v=>v==='ok').length;
      if(out.A==='soldout'&&out.B==='soldout')return `开始时已经没有可售房，两条事务在判断时都发现售罄，已订保持 ${val}。`;
      if(mode==='naive')return over?`两条事务都读到 ${R0}，都判断「还有房」。B 提交后，A 的 UPDATE 又在最新值上加 1，最终 ${val}，比上限 ${limit} 多卖 ${over} 间。「先查后改」中间的空隙谁都能插进来。`
        :`这次没有超卖：开始时剩余 ${rem} 间，够两人各订一间，两单都成功是正确结果。把「开始时剩余」调成 1 就会看到问题。`;
      if(mode==='lock')return `B 的 SELECT … FOR UPDATE 被行锁挡住，等 A 提交并释放锁后才读到 ${afterA}，`+(out.B==='ok'?'仍有房，也成交了':'判断售罄并回滚')+`。最终 ${val}，没有超卖。代价是等待：持锁越久后来者等得越久，所以不要拿着行锁等付款。`;
      if(mode==='version')return retried?`A 的 UPDATE 带着旧版本 7，影响 0 行，于是回滚重读，看到 ${val}${out.A==='ok'?'，仍有房，重试成功':'，判断售罄'}。最终 ${val}，没有超卖。冲突越多，回滚重试越频繁。`
        :`两次更新没有冲突，最终 ${val}。`;
      if(mode==='limit')return out.A==='reject'?`B 先把已订改成 ${R0+1}；A 的 UPDATE 会得到 ${R0+2}，超过上限 ${limit}，被 CHECK 拒绝并回滚。数据库替应用守住「已订 ≤ 可售上限」这条不变量。`
        :`两单都没有越过上限 ${limit}，约束没有触发，最终 ${val}。`;
      const same=limit===N;
      return `应用按 110% 判断还有房，但原文约束要求 total_inventory − total_reserved ≥ 0，已订最多到 ${N}：成交 ${oks} 单，其余 UPDATE 被拒绝。`+(same?`N = ${N} 时 ⌊${N}/10⌋ = 0，本来就不能超售，两种约束恰好一样。`:`它禁止任何超售，和题目允许的 10% 矛盾；应约束 total_reserved ≤ sellable_limit（${N} + ⌊${N}/10⌋ = ${limit}）。`);
    }
    async function autoplay(){build();await ctx.wait(400);while(idx<trace.length){step();await ctx.wait(720)}}
    build();

    async function play(m,n,r){
      mode=m;N=n;rem=r;modeCtl.set(m,true);nCtl.set(String(n),true);remCtl.set(r,true);
      await autoplay();
    }
    ctx.scenarios([
      {id:'naive',label:'无保护：先查后改',
        ask:'可售上限 110、已订 109，只剩 1 间。A、B 都先 SELECT、再判断、最后 UPDATE，B 先提交，A 随后提交。最终 total_reserved 是多少？几张订单成功？',
        insight:'最终 111，两张订单都成功，多卖 1 间。两条事务都读到 109、都判断还有 1 间；B 把它改成 110，A 的 UPDATE 又在最新值上加 1。检查和更新之间没有任何保护。',
        async run(){await play('naive',100,1)}},
      {id:'lock',label:'悲观锁：一方等待',
        ask:'改用 SELECT … FOR UPDATE。A 先拿到行锁，B 紧接着也来查。B 会读到 109 吗？',
        insight:'不会。B 的查询被行锁挡住，等 A 提交释放锁后才读到 110，判断售罄并回滚。冲突被串行化，最终 110、只成交 R7。代价是 B 的等待时间：锁里做的事越多、事务越长，后来者等得越久。',
        async run(){await play('lock',100,1)}},
      {id:'version',label:'乐观锁：提交时发现冲突',
        ask:'两人都读到已订 109、version = 7。B 先提交，把 version 改成 8。A 的 UPDATE … WHERE version = 7 会影响几行？',
        insight:'0 行。A 据此知道有人抢先，回滚后重读到 110、version = 8，判断售罄。关键是 WHERE 比较「我读到的版本」并检查影响行数；争抢激烈时，这种回滚重试会大量发生。',
        async run(){await play('version',100,1)}},
      {id:'check',label:'约束应该限制什么',
        ask:'物理房 100 间，题目允许超售 10%。原文约束 CHECK(total_inventory − total_reserved ≥ 0) 下，已订 100 时还能再卖吗？换成 CHECK(total_reserved ≤ sellable_limit) 再抢最后一间呢？',
        insight:'原文约束下两次 UPDATE 都被拒绝：应用以为还有 10 间超售额度，数据库却把上限定死在 100。换成已订 ≤ 可售上限（100 + ⌊100/10⌋ = 110）后，先提交的 B 成功，A 的 UPDATE 得到 111，触发约束回滚，停在 110。上限按整数算：15 间是 16，9 间仍是 9。',
        async run(){await play('orig',100,1);await ctx.wait(1500);await play('limit',100,1)}},
    ]);
  }
});

/* ---------------- 实验二：连住三晚、幂等重试与缓存 ---------------- */
SDLab.define({
  id:'booking-multi-night',chapter:22,
  title:'多晚事务、幂等重试与缓存延迟',
  summary:'库存按「酒店 × 房型 × 日期」每晚一行。提交订单时在同一个事务里逐晚条件更新，任何一晚不够就整笔回滚；超时重试靠 reservation_id 认出同一笔订单；展示页读的是 CDC 异步同步的 Redis 缓存。',
  caveat:'只画酒店 211、房型 1001 的四个日期，每晚可售上限 110，每单订一间。条件更新写作「已订 + 1 ≤ 上限」；时钟是放慢的模拟时间（网络一跳 20 毫秒、一条 SQL 10 毫秒、客户端超时 3 秒）。支付、hold 过期与取消没有画出。',
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
      a:{label:'9/10 入住 → 9/13 退房（3 晚）',short:'9/10–9/13',nights:[0,1,2],out:3},
      b:{label:'9/12 入住 → 9/14 退房（2 晚）',short:'9/12–9/14',nights:[2,3],out:-1},
      c:{label:'9/12 入住 → 9/13 退房（1 晚）',short:'9/12–9/13',nights:[2],out:3},
    };
    let S,stay='a',cdcDelay=200,lose=false,scripted=false,clockTarget=null,clockRate=0,gen=0,busy=false;
    const fresh=rem=>({res:rem.map(r=>LIMIT-r),pend:[0,0,0,0],fail:-1,cache:rem.slice(),cdc:[],orders:[],idem:new Map(),seq:[],t:0,next:7,last:null,dup:0});
    S=fresh([2,0,4,3]);

    /* ---- 舞台 ---- */
    const clock=h('span',{class:'bm-clock'});
    const top=h('div',{class:'bm-top'},h('span',null,'酒店 211 · 房型 1001 · 每晚可售上限 110'),h('span',null,'模拟时钟 ',clock));
    const table=h('table',{class:'bm-inv'});
    const head=h('tr',null,h('th',{class:'rl'}),DATES.map(d=>h('th',null,d)));
    const rows={use:[],db:[],cache:[]};
    const mkRow=(key,label)=>{const tr=h('tr',null,h('td',{class:'rl'},label));for(let i=0;i<4;i++){const td=h('td');rows[key].push(td);tr.append(td)}return tr};
    table.append(h('thead',null,head),h('tbody',null,mkRow('use','本单占用'),mkRow('db','数据库剩余（权威）'),mkRow('cache','Redis 缓存（展示页）')));
    const orders=h('div',{class:'bm-orders'});
    const seqBox=h('div',{class:'bm-seq',role:'log','aria-label':'请求时序'});
    ctx.stage.append(top,h('div',{class:'sdl-scroll'},table),orders,seqBox);
    ctx.onResize(w=>ctx.stage.classList.toggle('bm-narrow',w<560));
    const stats=ctx.stats([{key:'ok',label:'已确认订单'},{key:'fail',label:'售罄 / 回滚'},{key:'dup',label:'幂等识别的重试'},{key:'stale',label:'缓存旧值格数'}]);

    /* ---- 控件 ---- */
    const stayCtl=ctx.select({label:'入住区间（退房日不占房晚）',value:stay,options:Object.entries(STAYS).map(([k,v])=>[k,v.label]),onChange:v=>{stay=v;renderTable()}});
    const cdcCtl=ctx.slider({label:'CDC 同步延迟',min:50,max:2000,step:50,value:cdcDelay,format:v=>v+' 毫秒',onChange:v=>{cdcDelay=v}});
    const loseCtl=ctx.toggle({label:'下一次响应在网络中丢失',value:false,onChange:v=>{lose=v}});
    const newBtn=ctx.button('提交新订单',()=>free(()=>{const id='R'+S.next++;const l=lose;lose=false;loseCtl.set(false,true);return submit(id,stay,{lose:l,who:'客人'})}),{primary:true});
    const retryBtn=ctx.button('用同一 ID 重试',()=>free(()=>submit(S.last,stay,{who:'客人',retry:true})));
    const viewBtn=ctx.button('查看展示页',()=>free(()=>view('客人')));
    const actBtns=[newBtn,retryBtn,viewBtn];

    /* ---- 时钟与 CDC ---- */
    const fmtT=t=>{const ms=Math.round(t),s=Math.floor(ms/1000),m=Math.floor(s/60);return `10:${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`};
    function applyCDC(){
      if(!S.cdc.length)return;
      const due=S.cdc.filter(e=>S.t>=e.due-1e-6).sort((a,b)=>a.due-b.due);
      if(!due.length)return;
      S.cdc=S.cdc.filter(e=>!due.includes(e));
      for(const e of due){S.cache[e.n]=e.val;say('CDC → Redis',`缓存 ${DATES[e.n]} 更新为 ${e.val}`,'info',e.due)}
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

    /* ---- 渲染 ---- */
    function renderClock(){clock.textContent=fmtT(S.t)}
    function renderTable(){
      const st=STAYS[stay];
      for(let i=0;i<4;i++){
        const u=rows.use[i];
        if(st.nights.includes(i)){u.className='use';u.textContent='住'}
        else if(st.out===i){u.className='out';u.textContent='退房日'}
        else{u.className='none';u.textContent='—'}
        const d=rows.db[i],r=LIMIT-S.res[i];
        d.className=S.fail===i?'fail':S.pend[i]?'pend':'';
        d.replaceChildren(h('span',{class:'n'},r),h('span',{class:'s'},S.fail===i?'不足 1 间':S.pend[i]?'暂扣，未提交':'已订 '+S.res[i]));
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
          c.replaceChildren(...[h('span',{class:'n'},S.cache[i]),h('span',{class:'s'},stale?(ev?'旧值，同步中':'旧值'):'已同步'),ev?h('span',{class:'bm-bar'},c.__bar):null].filter(Boolean));
        }
        if(ev&&c.__bar)c.__bar.style.width=Math.min(100,Math.max(0,(S.t-ev.start)/(ev.due-ev.start)*100))+'%';
      }
    }
    function renderOrders(){
      orders.replaceChildren(h('span',null,'订单：'));
      if(!S.orders.length){orders.append(h('span',null,'还没有'));return}
      for(const o of S.orders)orders.append(h('span',{class:'sdl-tag '+({ok:'ok',fail:'bad',pend:'warn'}[o.status]),title:o.note||''},`${o.id} ${STAYS[o.key].short} ${({ok:'已确认',fail:'售罄，已回滚',pend:'处理中'}[o.status])}`));
    }
    function say(lane,text,tone,t){
      S.seq.push({t:t??S.t,lane,text,tone});if(S.seq.length>60)S.seq.shift();
      renderSeq();
    }
    function renderSeq(){
      const list=S.seq.slice(-8);
      seqBox.replaceChildren(...list.map((e,i)=>h('div',{class:'bm-ev'+(e.tone?' '+e.tone:'')+(i===list.length-1&&busy?' last':'')},h('span',{class:'t'},fmtT(e.t)),h('span',{class:'ln'},e.lane),h('span',{class:'x'},e.text))));
      if(!list.length)seqBox.append(h('div',{class:'bm-ev'},h('span',{class:'t'},fmtT(S.t)),h('span',{class:'ln'},'提示'),h('span',{class:'x'},'选一个入住区间，点「提交新订单」，或运行上方的预设场景。')));
    }
    function setOrder(id,key,status,note){let o=S.orders.find(x=>x.id===id);if(!o){o={id,key};S.orders.push(o)}o.status=status;o.note=note;renderOrders();renderTable()}
    function renderAll(){renderClock();renderTable();renderOrders();renderSeq()}

    /* ---- 预订服务 ---- */
    async function db(text,tone){await adv(SQL);say('数据库',text,tone)}
    async function submit(id,key,o={}){
      const st=STAYS[key],who=o.who||'客人';
      S.fail=-1;renderTable();
      await adv(HOP);say('客户端 → 服务',`${who}${o.retry?'重试':'提交'} ${id}：${st.short}，1 间`);
      const prev=S.idem.get(id);
      if(prev){
        await db(`INSERT 订单 ${id} → 唯一约束冲突，${id} 已存在`,'warn');
        if(prev.key!==key){await db('ROLLBACK','warn');await adv(HOP);say('服务 → 客户端',`409 拒绝：${id} 已绑定 ${STAYS[prev.key].short}，同一个键不能换日期`,'bad');return 'mismatch'}
        await db('参数相同：读取已有订单，ROLLBACK，不再扣库存','warn');S.dup++;renderTable();
        await adv(HOP);say('服务 → 客户端',`200 返回原订单 ${id}：已确认`,'ok');return 'dup';
      }
      S.last=id;
      await db(`BEGIN；INSERT 订单 ${id}（reservation_id 唯一）→ 成功`);
      setOrder(id,key,'pend');
      for(const n of st.nights){
        await adv(SQL);
        const r=LIMIT-S.res[n];
        if(r>=1){S.res[n]++;S.pend[n]++;renderTable();say('数据库',`UPDATE ${DATES[n]}（已订 + 1 ≤ 110）→ 影响 1 行，剩余 ${r} → ${r-1}，暂扣`,'info')}
        else{
          S.fail=n;renderTable();say('数据库',`UPDATE ${DATES[n]}（已订 + 1 ≤ 110）→ 影响 0 行，这晚剩余 0`,'bad');
          await adv(SQL);const undone=[];
          for(let i=0;i<4;i++)if(S.pend[i]){S.res[i]-=S.pend[i];S.pend[i]=0;undone.push(`${DATES[i]} 恢复为 ${LIMIT-S.res[i]}`)}
          say('数据库',`ROLLBACK：${undone.length?undone.join('、')+'，':''}订单 ${id} 一并撤销`,'warn');
          setOrder(id,key,'fail',`${DATES[n]} 无房`);
          await adv(HOP);say('服务 → 客户端',`409 售罄：${DATES[n]} 没有可售房，整笔未成交`,'bad');return 'soldout';
        }
      }
      await adv(SQL);
      for(let i=0;i<4;i++)if(S.pend[i]){S.pend[i]=0;S.cdc.push({n:i,start:S.t,due:S.t+cdcDelay,val:LIMIT-S.res[i]})}
      S.idem.set(id,{key});setOrder(id,key,'ok');
      say('数据库',`COMMIT：${st.nights.length} 晚库存与订单 ${id} 一起生效`,'ok');
      if(o.lose){await adv(HOP);say('服务 → 客户端',`201 已确认 ${id}，但响应在网络中丢失`,'bad');await adv(3000,800);say('客户端',`等了 3 秒没有回应，不知道订没订上`,'warn')}
      else{await adv(HOP);say('服务 → 客户端',`201 已确认 ${id}`,'ok')}
      return 'ok';
    }
    async function view(who){
      await adv(0,420);
      const st=STAYS[stay];
      say('展示页 ← Redis',`${who}看到：`+st.nights.map(n=>`${DATES[n]} 剩 ${S.cache[n]} 间`).join('，'),'info');
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

    /* ---- 预设场景 ---- */
    function prepare(rem,key,delay){
      S=fresh(rem);stay=key;stayCtl.set(key,true);cdcDelay=delay||200;cdcCtl.set(cdcDelay,true);lose=false;loseCtl.set(false,true);
      scripted=true;clockTarget=null;renderAll();
    }
    ctx.scenarios([
      {id:'rollback',label:'中间一晚没房',
        ask:'9/10 入住、9/13 退房，要占 9/10、9/11、9/12 三晚，剩余分别是 2、0、4。事务先把 9/10 暂扣成 1，到 9/11 发现没房。最终三晚剩余是多少？订单 R7 是什么状态？',
        insight:'三晚仍是 2、0、4：9/11 的条件更新影响 0 行，事务回滚，9/10 的暂扣恢复，9/12 根本没轮到，R7 也没有留下。能不能订由最紧张的一晚决定，min(2, 0, 4) = 0；9/13 是退房日，不占房晚。随后改订 9/12–9/14 的 R8 两晚都够，4 → 3、3 → 2 一起提交，200 毫秒后 CDC 把缓存也改过来。',
        run:()=>guarded(async()=>{
          prepare([2,0,4,3],'a');await adv(0,500);
          await submit('R7','a',{who:'客人 A '});
          await adv(0,1300);stay='b';stayCtl.set('b',true);renderTable();await adv(0,500);
          await submit('R8','b',{who:'客人 A 改订，'});
          await adv(220,1100);
        })},
      {id:'retry',label:'超时重试与两张订单',
        ask:'R7 订 9/12–9/14，9/12 原本只剩 1 间。R7 扣房成功，但响应丢了。客户端用同一个 R7 重试，库存会再扣一次吗？接着客人 B 用 R8 订同样两晚，幂等键能挡住 B 吗？',
        insight:'重试的 R7 撞上唯一约束，服务返回原订单，9/12、9/13 只扣了一次（1 → 0、3 → 2）。R8 是另一张合法订单，幂等层照常放行；是 9/12 的条件更新影响 0 行，让 R8 整笔回滚、返回售罄。幂等管「同一件事做几次」，库存控制管「不同的人能买几份」。超时后若换新 ID 重试，就会被当成第二张订单。',
        run:()=>guarded(async()=>{
          prepare([2,0,1,3],'b');await adv(0,500);
          await submit('R7','b',{who:'客人 A ',lose:true});
          await submit('R7','b',{who:'客人 A ',retry:true});
          await adv(0,700);
          await submit('R8','b',{who:'客人 B '});
          await adv(0,600);
        })},
      {id:'cache',label:'缓存显示有房',
        ask:'10:00:00 缓存显示 9/12 剩 1 间。客人 B 的订单在 10:00:01.000 提交，CDC 要 200 毫秒才把缓存改成 0。客人 A 在 10:00:01.100 打开展示页，看到几间？随后提交会成功吗？',
        insight:'A 在 10:00:01.100 看到的仍是 1 间：CDC 事件到 10:00:01.200 才更新 Redis。A 提交时数据库里已是 0，条件更新影响 0 行，回滚并返回售罄。展示库存只是会变旧的观察，成交以数据库事务为准；就算没有缓存，查看和提交之间也可能被别人订走。',
        run:()=>guarded(async()=>{
          prepare([2,0,1,3],'c',200);
          await view('客人 A ');
          await adv(950,700);say('客户端','客人 B 也看到 1 间，点了预订');
          await submit('R8','c',{who:'客人 B '});
          await adv(80,700);await view('客人 A ');
          await submit('R7','c',{who:'客人 A '});
          await adv(30,700);
          await view('客人 A ');await adv(0,400);
        })},
    ]);
  }
});
})();
