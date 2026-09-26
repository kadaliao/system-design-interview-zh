/* 第 27 章：数字钱包。实验：事件溯源——命令校验、只追加的事件、按序号重放、快照边界与新旧版本比对。 */
(function(){
const {el:h,util}=SDLab;

SDLab.define({
  id:'wallet-event-sourcing',chapter:27,
  title:'事件溯源钱包的命令、事件与重放',
  summary:'转账命令先由状态机校验，通过后才追加成不可变的事件；余额只是重放事件的结果。拖动回放位置重建任意序号的余额，看快照怎样省掉重放，再用守恒校验和新旧版本比对区分「可重现」和「正确」。',
  caveat:'单个状态机、单一有序事件流，不涉及分片与跨组事务。每笔转账生成付款方、收款方两个事件；期初余额视为序号 #0 的快照，之后每隔固定事件数生成一个快照。按提交序号回放，不区分业务生效时间；金额以分为单位存储。',
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

    /* ---- 控件 ---- */
    const sFrom=ctx.select({label:'付款方',value:'D',options:ACC.map(a=>[a,'账户 '+a])});
    const sTo=ctx.select({label:'收款方',value:'B',options:ACC.map(a=>[a,'账户 '+a])});
    const sAmt=ctx.slider({label:'金额',min:25,max:6000,step:25,value:500,format:money});
    const sK=ctx.slider({label:'快照间隔',min:0,max:8,value:snapK,format:v=>v?`每 ${v} 个事件`:'不做快照',onInput:v=>{snapK=v;render()}});
    const tBug=ctx.toggle({label:'恢复时连快照那条再算一次（错误）',value:false,onChange:v=>{restoreBug=v;render()}});
    const btns=[
      ctx.button('提交转账命令',()=>{if(!busy)enqueue(mk(sFrom.get(),sTo.get(),sAmt.get()))},{primary:true}),
      ctx.button('从头重放两次',()=>{if(!busy)spawn(twice)}),
      ctx.button('逐事件比对 v1 / v2',()=>{if(!busy)spawn(compare)}),
    ];

    /* ---- 舞台 ---- */
    const root=h('div');
    const qList=h('ul',{class:'we-q','aria-label':'命令队列'}),steps=h('ol',{class:'we-steps'});
    const grid=h('div',{class:'we-grid','aria-label':'事件日志'});
    const sw=(bg,bd,t)=>h('span',null,h('i',{style:{background:bg,borderColor:bd}}),t);
    const logPanel=h('div',{class:'sdl-panel we-log'},h('div',{class:'ph'},'事件日志（只追加，不修改）'),
      h('div',{class:'we-legend'},sw('#eef3ec','#cfdccf','已含在所用快照里'),sw('#dde9f6','#2f6fb3','本次重放应用'),sw('#fff','#dbe2da','回放位置之后（淡色）'),sw('#f7dedb','#c2413b','重复应用 / 有问题')),grid);
    const balHead=h('div',{class:'ph'}),balNote=h('p',{class:'sdl-note'}),balEls={};
    const balPanel=h('div',{class:'sdl-panel'},balHead,ACC.map(a=>{const bar=h('i'),v=h('span',{class:'v'});balEls[a]={bar,v};return h('div',{class:'we-bal'},h('b',null,a),h('div',{class:'we-bar'},bar),v)}),balNote);
    const chkList=h('ul',{class:'we-chk'}),extra=h('div');
    root.append(h('div',{class:'we-top'},h('div',{class:'sdl-panel'},h('div',{class:'ph'},'命令队列（FIFO）'),qList),h('div',{class:'sdl-panel'},h('div',{class:'ph'},'状态机：校验命令 → 生成事件 → 更新状态'),steps)),
      logPanel,h('div',{class:'we-bot'},balPanel,h('div',{class:'sdl-panel'},h('div',{class:'ph'},'校验（针对当前回放位置）'),chkList,extra)));
    ctx.stage.append(root);
    const slPos=ctx.slider({label:'回放到事件序号',min:0,max:1,value:0,wide:true,parent:logPanel,format:v=>'#'+v+(v===events.length?'（最新）':''),onInput:v=>{pos=v;render()}});
    ctx.onResize(w=>root.classList.toggle('we-narrow',w<600));
    const stats=ctx.stats([{key:'n',label:'事件总数'},{key:'pos',label:'回放位置'},{key:'cnt',label:'本次需应用'},{key:'tot',label:'资金总额'}]);

    /* ---- 模型 ---- */
    const mk=(from,to,amount)=>({id:'tx'+(++txSeq),from,to,amount});
    function stateAt(to,v='v1'){const b={...OPEN};for(const e of events){if(e.seq>to)break;b[e.acct]+=RED[v](e.delta)}return b}
    const why=(c,st)=>c.from===c.to?'付款方与收款方相同':st[c.from]<c.amount?'余额不足':null;
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
      pos=events.length;setSteps([['等待下一条命令','idle']]);
    }
    function setSteps(list){steps.replaceChildren(...list.map(([t,c])=>h('li',{class:c||null},t)))}

    /* ---- 渲染 ---- */
    function render(){
      slPos.input.max=events.length;slPos.set(pos,true);
      const r=replay(pos),total=sum(r.bal),neg=ACC.filter(a=>r.bal[a]<0);
      const bad=txs.filter(t=>t.seqs&&t.seqs[1]<=pos&&legs(t)!==0),badTx=new Set(bad.map(t=>t.id));
      qList.replaceChildren(
        ...queue.map(c=>h('li',{class:'pend'},h('span',{class:'id'},c.id),`${c.from} 向 ${c.to} 转 ${money(c.amount)}`,h('span',{class:'sdl-tag info'},'排队中'))),
        ...txs.slice(-5).reverse().map(c=>h('li',{class:c.status==='rej'?'rej':'done'},h('span',{class:'id'},c.id),`${c.from} 向 ${c.to} 转 ${money(c.amount)}`,c.status==='rej'?h('span',{class:'sdl-tag bad'},c.reason+'，无事件'):h('span',{class:'sdl-tag ok'},`事件 #${c.seqs[0]}、#${c.seqs[1]}`))));
      const snapChip=s=>h('div',{class:'we-snap'+(r.base===s?' use':'')},s?`◆ 快照 #${s}`:'◆ 期初 #0');
      const kids=[snapChip(0)];
      for(const e of events){
        const cls=['we-ev',e.seq>pos?'future':e.seq===r.dup?'dup':e.seq<=r.base?'snap':'apply'];
        if(badTx.has(e.tx))cls.push('badtx');
        if(cmp&&cmp.mis&&cmp.mis.seq===e.seq)cls.push('mis');else if((cmp&&!cmp.done&&cmp.cur===e.seq)||cursor===e.seq)cls.push('cur');
        if(flash.has(e.seq))cls.push('sdl-flash');
        kids.push(h('div',{class:cls.join(' '),title:`事件 #${e.seq}，来自 ${e.tx}`},h('small',null,`#${e.seq} · ${e.tx}`),h('b',null,`${e.acct} ${sgn(e.delta)}`)));
        if(snapK&&e.seq%snapK===0)kids.push(snapChip(e.seq));
      }
      grid.replaceChildren(...kids);
      balHead.textContent=`余额 · 重放到 #${pos}${pos===events.length?'（最新）':''}`;
      for(const a of ACC){balEls[a].bar.style.width=util.clamp(r.bal[a]/SCALE*100,0,100)+'%';balEls[a].bar.style.background=r.bal[a]<0?'#c2413b':'#2f6fb3';balEls[a].v.textContent=money(r.bal[a])}
      balNote.textContent=`${r.base?'从快照 #'+r.base:'从期初 #0'} 恢复，${r.count?`应用 #${r.from}–#${pos} 共 ${r.count} 个事件`:'不需要再应用事件'}；不用快照要从 #1 应用 ${pos} 个。`;
      const items=[
        [total===TOTAL,`资金总额 ${money(total)} ${total===TOTAL?'=':'≠'} 期初 ${money(TOTAL)}`],
        [!neg.length,neg.length?'出现负余额：'+neg.join('、'):'没有负余额'],
        [!bad.length,bad.length?bad.map(t=>`${t.id} 两条腿相加 ${sgn(legs(t))}，不为 0`).join('；'):'每笔转账的两条腿相加为 0'],
        [r.dup==null,r.dup!=null?`快照 #${r.dup} 已含事件 #${r.dup}，重放又应用了一次`:r.count?`重放从快照 #${r.base} 的下一条 #${r.base+1} 开始`:'回放位置正好落在快照上，直接使用'],
      ];
      chkList.replaceChildren(...items.map(([ok,t])=>h('li',null,h('span',{class:'sdl-tag '+(ok?'ok':'bad')},ok?'✓':'✗'),h('span',null,t))));
      extra.replaceChildren(...[detView(),cmpView()].filter(Boolean));
      stats.set('n',events.length);stats.set('pos','#'+pos);
      stats.set('cnt',`${r.count} 个`+(snapK&&pos?`（从头 ${pos} 个）`:''),'info');
      stats.set('tot',money(total),total===TOTAL?'ok':'bad');
    }
    function detView(){
      if(!det)return null;
      return h('p',{class:'sdl-note'},det.h2?h('span',null,'从头重放两次，状态校验和 ',h('span',{class:'sdl-mono'},det.h1),' 与 ',h('span',{class:'sdl-mono'},det.h2),det.h1===det.h2?'：完全相同，过程可重现。':'：不同，重放不确定。'):`从头重放中（第 ${det.run} 次）…`);
    }
    function cmpView(){
      if(!cmp)return null;
      const rows=cmp.rows.slice(-6),m=cmp.mis;
      return h('div',null,h('div',{class:'ph',style:{marginTop:'10px'}},'v1 与候选 v2 逐事件比对'),
        h('div',{class:'sdl-scroll'},h('table',{class:'sdl-table we-table'},h('thead',null,h('tr',null,h('th',null,'事件'),h('th',null,'v1 结果'),h('th',null,'v2 结果'))),
          h('tbody',null,rows.map(x=>h('tr',null,h('td',null,`#${x.seq} ${x.acct} ${sgn(x.delta)}`),h('td',{class:x.same?null:'mis'},`${x.acct} = ${money(x.v1)}`),h('td',{class:x.same?null:'mis'},`${x.acct} = ${money(x.v2)}`)))))),
        cmp.done?h('p',{class:'sdl-note'},m?`第一个分歧在 #${m.seq}（${m.acct} ${sgn(m.delta)}）：v1 算出 ${m.acct} = ${money(m.v1)}，v2 是 ${money(m.v2)}。两版末尾资金总额：v1 ${money(cmp.t1)}，v2 ${money(cmp.t2)}；v2 自己的守恒校验${cmp.v2ok?'全部通过':'没有通过'}。`:'全部事件的结果一致。'):null);
    }

    /* ---- 动作 ---- */
    async function process(c){
      queue.shift();cmp=null;det=null;
      const L=[[`读取命令 ${c.id}：${c.from} 向 ${c.to} 转 ${money(c.amount)}`,'info']];setSteps(L);render();await ctx.wait(550);
      const st=stateAt(events.length);
      L.push([`读取当前状态：${c.from} 余额 ${money(st[c.from])}`]);setSteps(L);await ctx.wait(550);
      const r=why(c,st);
      if(r){L.push([`校验失败：${r}，拒绝，不产生事件`,'bad']);setSteps(L);commit(c);ctx.log(`${c.id} 被拒绝：${r}。命令可以失败，事件日志不变`,'bad');render();await ctx.wait(500);return}
      L.push([`校验通过：${money(st[c.from])} ≥ ${money(c.amount)}`,'ok']);setSteps(L);await ctx.wait(500);
      const follow=pos===events.length,bug=bugNext;bugNext=false;
      commit(c,bug);if(follow)pos=events.length;
      const [a,b]=c.seqs;flash=new Set([a,b]);
      L.push([`追加事件 #${a}「${c.from} ${sgn(-c.amount)}」、#${b}「${c.to} ${sgn(events[b-1].delta)}」${bug?'（代码缺陷：入账写成了 10 倍）':''}`,bug?'warn':'info']);setSteps(L);
      ctx.log(`${c.id} 通过校验，追加事件 #${a}、#${b}`+(bug?'（入账金额错误）':''),bug?'warn':'ok');render();await ctx.wait(550);flash=new Set();
      const s2=stateAt(events.length);
      L.push([`应用事件：${c.from} → ${money(s2[c.from])}，${c.to} → ${money(s2[c.to])}`,'ok']);setSteps(L);render();await ctx.wait(400);
    }
    function enqueue(c){
      queue.push(c);render();
      if(!pumping){pumping=true;spawn(async()=>{try{while(queue.length)await process(queue[0])}finally{pumping=false}})}
    }
    async function twice(){
      det={run:1};cmp=null;
      for(let run=1;run<=2;run++){det.run=run;for(const e of events){cursor=e.seq;render();await ctx.wait(45)}cursor=0;det['h'+run]=hex(stateAt(events.length));render();await ctx.wait(300)}
      ctx.log(`从头重放两次：${det.h1} / ${det.h2}`,det.h1===det.h2?'ok':'bad');
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
      render();ctx.log(cmp.mis?`v1 / v2 在 #${cmp.mis.seq} 第一次分歧`:'v1 / v2 全部一致',cmp.mis?'bad':'ok');
      ctx.announce(cmp.mis?`第一个分歧在事件 ${cmp.mis.seq}`:'两个版本结果一致');
    }

    reset();render();
    enqueue(mk('D','B',500));

    /* ---- 预设场景 ---- */
    const wrap=fn=>async()=>{busy=true;btns.forEach(b=>b.disabled=true);try{await fn()}finally{busy=false;btns.forEach(b=>b.disabled=false)}};
    function prepare(k){reset();snapK=k;sK.set(k,true);restoreBug=false;tBug.set(false,true);ctx.clearLog();render()}
    ctx.scenarios([
      {id:'history',label:'回放到任意序号',
        ask:'期初 A = $100。把回放位置拖回事件 #6，A 的余额是多少？快照每 4 个事件一个，这次要应用几个事件？',
        insight:'A 在 #6 时是 $82.50：从快照 #4（A = $70.00）出发，只应用 #5、#6 两个事件；关掉快照要从 #1 应用 6 个，结果相同。#7 以后的事件不参与计算。tx3（C 向 B 转 $80）因余额不足被拒，没有产生事件，历史里也就不会出现它。',
        run:wrap(async()=>{prepare(4);await ctx.wait(700);for(let v=pos-1;v>=6;v--){pos=v;render();await ctx.wait(380)}ctx.announce('回放到事件 6');await ctx.wait(1600);sK.set(0);await ctx.wait(1800);sK.set(4);await ctx.wait(900)})},
      {id:'snapshot-boundary',label:'快照边界多算一次',
        ask:'快照每 8 个事件一个，快照 #8 存的是应用完 #8 之后的余额。重建最新余额时，如果从 #8 而不是 #9 开始重放，资金总额会变成多少？',
        insight:'#8（B +$25.00）已经包含在快照里，又被重放一次：B 从 $40.00 变成 $65.00，资金总额 $195.00，比期初多出 $25。快照必须记下最后应用的序号，恢复从下一条开始；应用前检查「只接受上一个序号 + 1」就能挡住这种重复。',
        run:wrap(async()=>{prepare(8);await ctx.wait(1600);ctx.log('恢复程序忽略了快照里的最后应用序号，从 #8 开始重放','bad');tBug.set(true);ctx.announce('资金总额变为 195 美元');await ctx.wait(2600)})},
      {id:'bad-event',label:'错误事件照样能重放',
        ask:'命令处理代码有 bug，把「A 向 C 转 $1」写成了事件 A −$1、C +$10。从头重放两次，两次结果一致吗？余额算被证明正确了吗？',
        insight:'两次重放的状态校验和完全相同：事件不可变、状态机确定，所以可重现。但资金总额变成 $179.00，tx8 两条腿相加是 +$9.00，守恒校验失败。重放只证明「可重现」，错误的事实也会被忠实重放；还要检查资金守恒、账户约束，并与来源凭证、外部结算对账。修复要追加补正事件，而不是改写 #14。',
        run:wrap(async()=>{prepare(4);await ctx.wait(500);bugNext=true;const c=mk('A','C',100);queue.push(c);render();await ctx.wait(500);await process(c);await ctx.wait(500);await twice();await ctx.wait(1600)})},
      {id:'version-diff',label:'新旧版本逐事件比对',
        ask:'候选版本 v2 为了「简化」，把每个事件的金额截成整美元再应用。它能通过资金总额守恒校验吗？第一个分歧出现在哪个事件？',
        insight:'v2 的资金总额仍是 $170.00，守恒校验全部通过：每笔转账两条腿截掉的零头正好抵消。逐事件比对在 #5（D −$12.50）第一次分歧：v1 算出 D = $7.50，v2 是 $8.00。只比末尾总额发现不了，要逐事件比较每个账户，并定位第一个分歧事件。',
        run:wrap(async()=>{prepare(4);await ctx.wait(600);await compare();await ctx.wait(2000)})},
    ]);
  }
});
})();
