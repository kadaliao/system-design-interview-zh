/* 第 28 章：证券交易所。实验一：限价订单簿按价格优先、同价时间优先撮合；实验二：撮合主备切换的关口、RTO 与 RPO。 */
(function(){
const {el:h,util}=SDLab;
const fmt=n=>util.fmt(Math.round(n));

/* ---------------- 实验一：限价订单簿 ---------------- */
SDLab.define({
  id:'order-book',chapter:28,
  title:'限价订单簿按价格和到达顺序撮合',
  summary:'每个价位是一条先到先成交的队列。下限价单或市价单，看撮合引擎怎样先找最优对手价、再取队首订单、按双方剩余量成交，剩余量怎样挂进订单簿；成交同时写进成交记录，并汇总成 1 分钟 K 线。',
  caveat:'单一股票、整数价位（最小变动 1）。成交价取挂单方的价格；市价单吃不完的剩余量直接取消。本章设计只要求限价单，市价单仅作对照，真实成交与定价规则以交易所为准。每条命令让模拟时钟前进 20 秒，K 线只按成交计算。',
  mount(ctx){
    const C=ctx.colors,ASK=C.series[3],BID=C.series[4];
    ctx.css('ob',`
.ob-wrap{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:12px}
.ob-narrow .ob-wrap{grid-template-columns:minmax(0,1fr)}
.ob-side{display:flex;flex-direction:column;gap:10px;min-width:0}
.ob-lad{border:1px solid #dbe2da;border-radius:10px;overflow:hidden;background:#fff;align-self:start}
.ob-hd,.ob-row{display:grid;grid-template-columns:40px 44px minmax(0,1fr);gap:6px;align-items:center;padding:3px 8px}
.ob-hd{background:#f0f4ed;font-size:12px;color:#66756d;font-weight:650}
.ob-row{min-height:33px;border-top:1px solid #eef2ec;font-size:13px}
.ob-row.ask{background:#fbf3f7}.ob-row.bid{background:#eff8f8}
.ob-px{font-weight:700;font-variant-numeric:tabular-nums}
.ob-row.ask .ob-px{color:#b8477a}.ob-row.bid .ob-px{color:#1f7a7a}.ob-row.empty .ob-px{color:#b4beb7;font-weight:500}
.ob-sz{font-variant-numeric:tabular-nums;font-size:12px;color:#4d5d55;border-radius:4px;padding:0 4px;background:linear-gradient(90deg,var(--c) var(--w),transparent var(--w))}
.ob-q{display:flex;flex-wrap:wrap;gap:4px;min-width:0}
.sdl-frame .ob-o{font-size:12px;padding:1px 6px;border-radius:6px;line-height:1.5;text-align:left;white-space:nowrap;font-variant-numeric:tabular-nums;background:#fff}
.ob-row.ask .ob-o{border-color:#e2b3c8}.ob-row.bid .ob-o{border-color:#a9d3d3}
.sdl-frame .ob-o.sel{outline:2px dashed #23352f;outline-offset:1px}
.sdl-frame .ob-o.hl{border-color:#2f6fb3;background:#dde9f6;box-shadow:0 0 0 2px #2f6fb3}
.sdl-frame .ob-o.hit{border-color:#2f8f5b;background:#dcefe2;box-shadow:0 0 0 2px #2f8f5b}
.ob-mid{padding:3px 8px;font-size:12px;color:#24558a;background:#eef4fb;border-top:1px solid #d6e3f1;text-align:center;font-weight:650}
.ob-inc{font-size:13px;margin:0 0 6px;line-height:1.5}
.ob-steps{margin:0;padding-left:20px;font-size:13px;line-height:1.6;color:#8a978f}
.ob-steps li.on{color:#24558a;font-weight:700}.ob-steps li.done{color:#4d5d55}
.ob-note{font-size:13px;margin:6px 0 0;min-height:20px;line-height:1.5}
.ob-note.ok{color:#1d6a41}.ob-note.bad{color:#9b2c27;font-weight:650}.ob-note.warn{color:#86561a}.ob-note.info{color:#24558a}
.ob-tape{list-style:none;margin:0;padding:0;font-size:13px;font-variant-numeric:tabular-nums}
.ob-tape li{display:flex;flex-wrap:wrap;gap:2px 10px;padding:2px 0;border-top:1px solid #eef2ec}
.ob-tape li:first-child{border-top:0}
.ob-tape small{color:#66756d;font-size:12px}
`);
    const HIST=[[98,99,97,99,320],[99,100,98,98,180],[98,100,98,100,260],[100,101,99,99,210],[99,100,99,100,150]];
    const STEPS=['取最优对手价位','检查是否满足限价','取该价位队首（最早到达）','按双方剩余量成交','更新双方，清理空订单 / 空价位','剩余量挂入订单簿（市价单则取消）'];
    const P={side:'buy',type:'limit',price:101,qty:80};
    let asks,bids,idx,nb,ns,seq,clock,trades,cand,active,hl,hit,sel,stepI,note,noteTone,pending=[],pumping=false,busy=false;
    const rng=util.rng(28);
    const spawn=fn=>{fn().catch(e=>{if(!(e&&e.abort))console.error(e)})};

    /* ---- 控件 ---- */
    const cSide=ctx.segmented({label:'方向',value:P.side,options:[['buy','买入'],['sell','卖出']],onChange:v=>{P.side=v}});
    const cType=ctx.segmented({label:'类型',value:P.type,options:[['limit','限价单'],['market','市价单']],onChange:v=>{P.type=v;syncPrice()}});
    const cPrice=ctx.slider({label:'限价',min:95,max:105,value:P.price,onInput:v=>{P.price=v}});
    const cQty=ctx.slider({label:'数量（股）',min:10,max:300,step:10,value:P.qty,onInput:v=>{P.qty=v}});
    const syncPrice=()=>{cPrice.input.disabled=P.type==='market';cPrice.el.style.opacity=P.type==='market'?.45:1};
    const btns=[
      ctx.button('提交订单',()=>{if(!busy)enqueue({kind:'new',side:P.side,type:P.type,price:P.price,qty:P.qty})},{primary:true}),
      ctx.button('撤销选中的订单',()=>{if(busy)return;if(!sel){note='先点订单簿里的一个订单块，再撤单';noteTone='warn';render();return}enqueue({kind:'cancel',id:sel})}),
      ctx.button('随机来 5 笔',()=>{if(busy)return;for(let i=0;i<5;i++){const ba=bestAsk(),bb=bestBid(),mid=ba!=null&&bb!=null?(ba+bb)/2:99.5;enqueue({kind:'new',side:rng()<.5?'buy':'sell',type:rng()<.15?'market':'limit',price:util.clamp(Math.round(mid+rng.int(-2,2)),95,105),qty:rng.int(1,12)*10})}}),
      ctx.button('恢复初始订单簿',()=>{if(!busy){reset();render()}}),
    ];

    /* ---- 舞台 ---- */
    const root=h('div'),lad=h('div',{class:'ob-lad',role:'group','aria-label':'订单簿'});
    const inc=h('p',{class:'ob-inc'}),stepList=h('ol',{class:'ob-steps'}),noteEl=h('p',{class:'ob-note','aria-live':'polite'});
    const tape=h('ul',{class:'ob-tape'});
    const candleSvg=ctx.svgEl('svg',{viewBox:'0 0 300 128',role:'img','aria-label':'1 分钟 K 线'});
    root.append(h('div',{class:'ob-wrap'},lad,h('div',{class:'ob-side'},
      h('div',{class:'sdl-panel'},h('div',{class:'ph'},'撮合引擎'),inc,stepList,noteEl),
      h('div',{class:'sdl-panel'},h('div',{class:'ph'},'成交记录（每笔给买卖双方各一条回报）'),tape),
      h('div',{class:'sdl-panel'},h('div',{class:'ph'},'1 分钟 K 线（只按成交计算）'),candleSvg,h('p',{class:'sdl-note',style:{margin:'2px 0 0'}},'青色：收盘高于开盘；洋红：收盘低于开盘；黑框是本实验里新成交形成的蜡烛。挂单和撤单不改变 K 线。')))));
    ctx.stage.append(root);
    ctx.note('点订单块可以选中它再撤单。块上的数字是剩余股数，同一价位从左到右按到达先后排队。');
    ctx.onResize(w=>root.classList.toggle('ob-narrow',w<640));
    const stats=ctx.stats([{key:'bid',label:'买一（最高买价）'},{key:'ask',label:'卖一（最低卖价）'},{key:'spread',label:'价差'},{key:'last',label:'最新成交'}]);

    /* ---- 订单簿模型 ---- */
    const book=side=>side==='buy'?bids:asks;
    function addOrder(o){const m=book(o.side);if(!m.has(o.price))m.set(o.price,[]);m.get(o.price).push(o);idx.set(o.id,o)}
    function removeOrder(o){const m=book(o.side),q=m.get(o.price);q.splice(q.indexOf(o),1);if(!q.length)m.delete(o.price);idx.delete(o.id)}
    const bestAsk=()=>asks.size?Math.min(...asks.keys()):null,bestBid=()=>bids.size?Math.max(...bids.keys()):null;
    function reset(){
      asks=new Map();bids=new Map();idx=new Map();pending=[];
      [['S1',100,30],['S2',100,50],['S3',101,40],['S4',102,60],['S5',101,30],['S6',103,80]].forEach(([id,price,q])=>addOrder({id,side:'sell',price,qty:q,rem:q}));
      [['B1',99,40],['B2',99,20],['B3',98,60],['B4',97,50],['B5',96,70]].forEach(([id,price,q])=>addOrder({id,side:'buy',price,qty:q,rem:q}));
      ns=6;nb=5;seq=40;clock=300;trades=[];cand=new Map();active=null;hl=hit=sel=null;stepI=-1;note='';noteTone='';
    }
    function trade(price,qty,buy,sell){
      const t={id:'T'+(trades.length+1),price,qty,buy,sell};trades.push(t);
      const m=Math.floor(clock/60),k=cand.get(m);
      if(k){k.h=Math.max(k.h,price);k.l=Math.min(k.l,price);k.c=price;k.v+=qty}else cand.set(m,{m,o:price,h:price,l:price,c:price,v:qty});
      ctx.log(`成交 ${t.id}：${price} × ${qty}（买 ${buy} ⇄ 卖 ${sell}），发出 2 条回报`,'ok');
    }

    /* ---- 渲染 ---- */
    function row(p){
      const a=asks.get(p),b=bids.get(p),list=a||b||[],side=a?'ask':b?'bid':'empty',tot=list.reduce((s,o)=>s+o.rem,0);
      return h('div',{class:'ob-row '+side},h('span',{class:'ob-px'},p),
        h('span',{class:'ob-sz',style:{'--w':Math.min(100,tot/1.6)+'%','--c':side==='ask'?'#f1cfe0':'#cde8e8'}},tot||''),
        h('div',{class:'ob-q'},list.map(o=>h('button',{type:'button',class:'ob-o'+(o.id===sel?' sel':'')+(o.id===hl?' hl':'')+(o.id===hit?' hit':''),style:{minWidth:Math.round(40+o.rem*.4)+'px'},
          title:`${o.id}：${o.side==='buy'?'买':'卖'} ${p}，原始 ${o.qty} 股，剩余 ${o.rem} 股`,'aria-label':`${o.id} ${o.side==='buy'?'买单':'卖单'} 价格 ${p} 剩余 ${o.rem} 股${o.id===sel?'，已选中':''}`,
          onclick:()=>{sel=sel===o.id?null:o.id;render()}},o.id+' '+o.rem))));
    }
    function render(){
      const ba=bestAsk(),bb=bestBid();
      const mid=()=>h('div',{class:'ob-mid'},ba!=null&&bb!=null?`价差 ${ba-bb}（买一 ${bb} / 卖一 ${ba}）`:'一侧订单簿为空');
      const rows=[h('div',{class:'ob-hd'},h('span',null,'价格'),h('span',null,'总量'),h('span',null,'队列：先到的在左'))];
      let midDone=false;
      for(let p=105;p>=95;p--){if(!midDone&&(ba!=null?p<ba:bb!=null&&p<=bb)){rows.push(mid());midDone=true}rows.push(row(p))}
      if(!midDone)rows.push(mid());
      lad.replaceChildren(...rows);
      const o=active,q=pending.length;
      inc.replaceChildren(o?h('span',null,h('b',null,`#${o.seq} ${o.id}`),` ${o.side==='buy'?'买':'卖'} ${o.type==='limit'?'限价 '+o.price:'市价'} × ${o.qty}，剩余 `,h('b',null,o.rem)):h('span',{style:{color:'#66756d'}},'等待下一条命令'),q?`（后面还有 ${q} 条排队）`:'');
      stepList.replaceChildren(...STEPS.map((s,i)=>h('li',{class:i===stepI?'on':o&&i<stepI?'done':null},s)));
      noteEl.textContent=note;noteEl.className='ob-note'+(noteTone?' '+noteTone:'');
      tape.replaceChildren(...(trades.length?trades.slice(-6).reverse().map(t=>h('li',null,h('b',null,t.id),`${t.price} × ${t.qty}`,h('small',null,`${t.buy} ⇄ ${t.sell} · 回报 ×2`))):[h('li',null,h('small',null,'还没有成交'))]));
      drawCandles();
      stats.set('bid',bb??'—');stats.set('ask',ba??'—');stats.set('spread',ba!=null&&bb!=null?ba-bb:'—','info');
      const lt=trades[trades.length-1];stats.set('last',lt?`${lt.price} × ${lt.qty}`:'—',lt?'ok':null);
    }
    function drawCandles(){
      const all=[...HIST.map((c,i)=>({m:i+300/60-HIST.length,o:c[0],h:c[1],l:c[2],c:c[3],v:c[4]})),...cand.values()].sort((a,b)=>a.m-b.m).slice(-8);
      const Y=p=>8+(105-p)*9,X0=34,SW=33;
      const kids=[];
      for(const p of [96,98,100,102,104])kids.push(ctx.svgEl('line',{x1:X0,x2:298,y1:Y(p),y2:Y(p),stroke:'#e3e9e1'}),ctx.svgEl('text',{x:X0-5,y:Y(p)+4,'text-anchor':'end','font-size':11,style:'fill:#66756d'},p));
      all.forEach((k,i)=>{
        const cx=X0+SW*i+SW/2,col=k.c>k.o?BID:k.c<k.o?ASK:'#66756d',top=Y(Math.max(k.o,k.c)),hgt=Math.max(2,Math.abs(k.o-k.c)*9);
        const mm=30+k.m,label=`09:${String(mm).padStart(2,'0')}`;
        const g=ctx.svgEl('g',null,ctx.svgEl('title',null,`${label} 开 ${k.o} 高 ${k.h} 低 ${k.l} 收 ${k.c} 量 ${k.v}`),
          ctx.svgEl('line',{x1:cx,x2:cx,y1:Y(k.h),y2:Y(k.l),stroke:col,'stroke-width':1.5}),
          ctx.svgEl('rect',{x:cx-7,y:top,width:14,height:hgt,fill:col,rx:1.5,stroke:cand.has(k.m)?'#23352f':'none','stroke-width':cand.has(k.m)?1:0}));
        kids.push(g);
        if((all.length-1-i)%2===0)kids.push(ctx.svgEl('text',{x:cx,y:124,'text-anchor':'middle','font-size':11,style:'fill:'+(cand.has(k.m)?'#23352f':'#66756d')},label));
      });
      candleSvg.replaceChildren(...kids);
    }
    const setStep=(i,t,tone)=>{stepI=i;note=t;noteTone=tone||'info';render()};

    /* ---- 撮合 ---- */
    async function execNew(c){
      seq++;clock+=20;
      const buy=c.side==='buy',o={id:(buy?'B'+(++nb):'S'+(++ns)),side:c.side,type:c.type,price:c.type==='limit'?c.price:null,qty:c.qty,rem:c.qty,seq};
      active=o;const opp=buy?asks:bids;let filled=0,cost=0;
      ctx.log(`#${seq} 新单 ${o.id}：${buy?'买':'卖'} ${o.type==='limit'?'限价 '+o.price:'市价'} × ${o.qty}`,'info');
      setStep(-1,`排序器编号 #${seq}，进入撮合`);await ctx.wait(450);
      while(o.rem>0){
        const lv=buy?bestAsk():bestBid();
        setStep(0,lv==null?`${buy?'卖':'买'}盘已空`:`${buy?'卖一（最低卖价）':'买一（最高买价）'}是 ${lv}`);await ctx.wait(330);
        if(lv==null)break;
        const ok=o.type==='market'||(buy?lv<=o.price:lv>=o.price);
        setStep(1,o.type==='market'?'市价单不设价格上限，继续':ok?`${lv} ${buy?'≤':'≥'} 限价 ${o.price}，可以成交`:`${lv} ${buy?'>':'<'} 限价 ${o.price}，停止撮合`,ok?'info':'warn');await ctx.wait(ok?280:650);
        if(!ok)break;
        const head=opp.get(lv)[0];hl=head.id;
        setStep(2,`${lv} 档队首是 ${head.id}（剩余 ${head.rem}），同价里它最早到`);await ctx.wait(420);
        const q=Math.min(o.rem,head.rem),r0=o.rem,h0=head.rem;head.rem-=q;o.rem-=q;filled+=q;cost+=q*lv;hl=null;hit=head.id;
        trade(lv,q,buy?o.id:head.id,buy?head.id:o.id);
        setStep(3,`成交 min(${r0}, ${h0}) = ${q} 股，价格 ${lv}`,'ok');await ctx.wait(480);
        const gone=head.rem===0;if(gone)removeOrder(head);hit=null;
        setStep(4,`${o.id} 剩 ${o.rem}，${head.id} 剩 ${head.rem}${gone?'，移出队列':''}${gone&&!opp.has(lv)?`；${lv} 档已清空`:''}`);await ctx.wait(380);
      }
      if(o.rem>0){
        if(o.type==='limit'){addOrder(o);setStep(5,`剩余 ${o.rem} 股挂入${buy?'买':'卖'}盘 ${o.price} 档队尾`,'info');ctx.log(`${o.id} 剩余 ${o.rem} 股挂在 ${o.price}`,'info')}
        else{setStep(5,`市价单剩余 ${o.rem} 股没有对手，取消`,'warn');ctx.log(`${o.id} 剩余 ${o.rem} 股取消`,'warn')}
      }else setStep(5,'全部成交，不进订单簿','ok');
      if(filled){const avg=cost/filled;ctx.log(`${o.id} 共成交 ${filled} 股，均价 ${+avg.toFixed(2)}`,'ok');note+=`。共成交 ${filled} 股，均价 ${+avg.toFixed(2)}`}
      ctx.announce(note);await ctx.wait(750);active=null;stepI=-1;render();
    }
    async function execCancel(c){
      seq++;clock+=20;active=null;
      ctx.log(`#${seq} 撤单 ${c.id}`,'info');
      const o=idx.get(c.id);
      if(!o){setStep(-1,`#${seq} 撤 ${c.id}：订单簿里已经没有它（已全部成交），返回 CANNOT_CANCEL_ALREADY_MATCHED`,'bad');ctx.log(`#${seq} 撤单失败：${c.id} 已成交`,'bad');await ctx.wait(1300);return}
      hl=o.id;setStep(-1,`#${seq} 撤 ${o.id}：按订单 ID 找到它，从 ${o.price} 档队列中摘除`,'info');await ctx.wait(650);
      removeOrder(o);hl=null;if(sel===o.id)sel=null;
      setStep(-1,`已撤销 ${o.id} 剩余的 ${o.rem} 股${o.rem<o.qty?`，之前成交的 ${o.qty-o.rem} 股不受影响`:''}`,'ok');ctx.log(`#${seq} 已撤销 ${o.id} 剩余 ${o.rem} 股`,'ok');await ctx.wait(1000);
    }
    const exec=c=>c.kind==='cancel'?execCancel(c):execNew(c);
    function enqueue(c){
      pending.push(c);render();
      if(!pumping){pumping=true;spawn(async()=>{try{while(pending.length)await exec(pending.shift())}finally{pumping=false}})}
    }

    reset();syncPrice();render();

    /* ---- 预设场景 ---- */
    const wrap=fn=>async()=>{busy=true;btns.forEach(b=>b.disabled=true);try{await fn()}finally{busy=false;btns.forEach(b=>b.disabled=false)}};
    function prepare(side,type,price,qty){reset();Object.assign(P,{side,type,price,qty});cSide.set(side,true);cType.set(type,true);cPrice.set(price,true);cQty.set(qty,true);syncPrice();ctx.clearLog();render()}
    ctx.scenarios([
      {id:'fifo',label:'同价先到先成交',
        ask:'卖盘 100 档依次排着 S1（30 股，先到）和 S2（50 股，后到），101 档还有 S3、S5。一笔限价 101、数量 80 的买单进来，先和谁成交？101 档会被动到吗？',
        insight:'先吃 S1 的 30 股，再吃 S2 的 50 股，都按 100 成交；101 档一股没动。价格优先：先找最低卖价 100；同价时间优先：S1 比 S2 早到。成交后卖一升到 101，价差从 1 变成 2。成交价取挂单方的 100，是本实验的简化规则。',
        run:wrap(async()=>{prepare('buy','limit',101,80);await ctx.wait(500);await execNew({side:'buy',type:'limit',price:101,qty:80});await ctx.wait(400)})},
      {id:'sweep',label:'市价大单扫过多档',
        ask:'市价买 200 股。卖盘 100 档共 80 股、101 档 70 股、102 档 60 股。成交均价是多少？成交后卖一和价差怎样变化？',
        insight:'依次吃掉 100 档 80 股、101 档 70 股、102 档 50 股，均价 100.85（20,170 ÷ 200），这就是滑点。卖一从 100 升到 102（S4 剩 10 股），价差从 1 扩大到 3。换成卖出方向或更厚的深度，结果就不同，所以「大单让价格上涨、价差扩大」并非普遍规律。',
        run:wrap(async()=>{prepare('buy','market',101,200);await ctx.wait(500);await execNew({side:'buy',type:'market',price:null,qty:200});await ctx.wait(400)})},
      {id:'rest',label:'部分成交后挂簿',
        ask:'限价买 100、数量 120，而卖盘 100 档只有 80 股。能成交多少？剩下的 40 股会去吃 101 档吗？',
        insight:'在 100 成交 80 股（S1、S2）后，卖一 101 高于限价，撮合停止；剩余 40 股成为买单 B6，挂到买盘 100 档队尾，买一从 99 变成 100，价差为 1。原版伪代码只查 get(order.price)，也没有把剩余量入簿，正是批注指出的问题。',
        run:wrap(async()=>{prepare('buy','limit',100,120);await ctx.wait(500);await execNew({side:'buy',type:'limit',price:100,qty:120});await ctx.wait(400)})},
      {id:'cancel-race',label:'撤单与成交的先后',
        ask:'排序器先给买单「限价 100 × 40」编号 #41，再给「撤 S1」#42、「撤 S2」#43。S1 的撤单能成功吗？S2 能撤掉多少？',
        insight:'#41 先处理：S1 的 30 股全部成交，S2 成交 10 股。#42 到达时 S1 已不在订单簿里，返回「已成交，无法撤单」；#43 只撤掉 S2 剩余的 40 股，已成交的 10 股不受影响。撤单和新单走同一条有序命令流，结果由序号决定，重放时也一样。',
        run:wrap(async()=>{prepare('buy','limit',100,40);await ctx.wait(500);await execNew({side:'buy',type:'limit',price:100,qty:40});await execCancel({id:'S1'});await execCancel({id:'S2'});await ctx.wait(300)})},
    ]);
  }
});

/* ---------------- 实验二：主备切换 ---------------- */
SDLab.define({
  id:'exchange-failover',chapter:28,
  title:'撮合引擎主备切换的四道关口',
  summary:'三台撮合节点按同一有序输入维护订单簿，只有主节点发布成交。让主节点宕机或假死，看切换要过哪几道关口、RTO 花在哪里、已确认的数据会不会丢，以及接收端不做 fencing 时旧主醒来会怎样。',
  caveat:'订单流按本章估算的平均约 4.3 万个 / 秒推进，时间 1:1。检测时间等于心跳超时；选主与隔离按 1 秒、校验与开放网关按 1.5 秒（第 29 章 P28-03 的示例预算）；追日志时间 = 已应用落后量 ÷ 重放速度，追赶期间才开始应用。「主节点本地写入后确认」时复制固定晚 50 毫秒；假死期间已发出的复制消息仍会送达。多数确认模式下，醒来的旧主拿不到多数，不会发布；本地确认模式下，它醒来后仍连着约 3 成流量的网关和出站通道。',
  mount(ctx){
    const C=ctx.colors;
    ctx.css('xf',`
.xf-strip{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;border:1px solid #dbe2da;border-radius:10px;padding:6px 10px;font-size:13px;background:#fbfcfa}
.xf-strip.ok{border-color:#a8d2b6;background:#f1f8f3}.xf-strip.warn{border-color:#e3c68f;background:#fbf5e8}.xf-strip.bad{border-color:#e3aaa4;background:#fbeeec}
.xf-strip b{font-weight:700}
.xf-flow{flex:1 1 60px;min-width:40px;height:4px;border-radius:2px;background:repeating-linear-gradient(90deg,var(--fc) 0 8px,transparent 8px 16px);background-size:16px 4px;animation:xf-mv .7s linear infinite}
.xf-flow.off{animation-play-state:paused;opacity:.25}
@keyframes xf-mv{from{background-position:0 0}to{background-position:16px 0}}
.xf-nodes{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin:8px 0}
.xf-node{border:1.5px solid #dbe2da;border-radius:10px;padding:7px 10px;background:#fff;font-size:13px;line-height:1.55;min-width:0}
.xf-node.leader{border-color:#2f6fb3;background:#f3f7fc}.xf-node.down{border-color:#c9d0cb;background:#f1f2f1;color:#8a978f}
.xf-node.paused{border-color:#b7791f;background:#fbf5e8}.xf-node.stale{border-color:#c2413b;background:#fbeeec}
.xf-nh{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:2px}
.xf-nh b{font-size:15px}
.xf-k{color:#66756d;font-size:12px}
.xf-v{font-family:var(--lab-mono);font-size:12px}
.xf-lag{height:6px;border-radius:3px;background:#e6eee2;overflow:hidden;margin:2px 0 3px}
.xf-lag i{display:block;height:100%;background:#b7791f;border-radius:3px}
.xf-tl{margin-top:12px}
.xf-bar{position:relative;display:flex;height:22px;border-radius:6px;background:#f0f4ed;margin:20px 0 6px}
.xf-seg{position:relative;height:100%;overflow:hidden;border-right:2px solid #fff}
.xf-seg i{position:absolute;inset:0;opacity:.22}.xf-seg b{position:absolute;left:0;top:0;bottom:0}
.xf-budget{position:absolute;top:-18px;bottom:-3px;border-left:2px dashed #23352f;font-size:11px;padding-left:3px;color:#23352f;white-space:nowrap}
.xf-budget.flip{border-left:0;border-right:2px dashed #23352f;padding:0 3px 0 0;transform:translateX(-100%)}
.xf-segl{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:#4d5d55}
.xf-segl i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.xf-total{font-size:14px;font-weight:650;margin:6px 0 0}
.xf-total.ok{color:#1d6a41}.xf-total.bad{color:#9b2c27}.xf-total.warn{color:#86561a}
.xf-gates{list-style:none;margin:10px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:6px}
.xf-gates li{border:1px solid #dbe2da;border-radius:9px;padding:5px 9px;font-size:13px;line-height:1.5;background:#fff}
.xf-gates li.ok{border-color:#a8d2b6;background:#f1f8f3}.xf-gates li.bad{border-color:#e3aaa4;background:#fbeeec}.xf-gates li.warn{border-color:#e3c68f;background:#fbf5e8}.xf-gates li.run{border-color:#9dbde0;background:#f3f7fc}
.xf-gates small{display:block;color:#4d5d55;font-size:12px}
`);
    const EV=43000,ASYNC=0.05,ELECT=1,VERIFY=1.5,BUDGET=5,STALE=0.3,PAUSE=5,BASE=12000000;
    const PHC=['#7d8b83',C.series[5],C.series[0],C.series[4]];
    const GATES=['① 合法领导权：多数票 + 新任期','② 隔离旧主：接收端拒绝旧任期','③ 恢复权威状态：重放已提交日志','④ 校验输出边界：衔接已发布位置、按 ID 去重'];
    const P={lag:20,rate:20,hb:.5,ack:'sync',fence:true};
    const lagEv=()=>P.lag*1e4;
    let N,sim;

    /* ---- 控件 ---- */
    const sLag=ctx.slider({label:'热备已应用落后',min:0,max:200,step:10,value:P.lag,format:v=>v+' 万个事件',onInput:v=>{P.lag=v;render()}});
    const sRate=ctx.slider({label:'重放速度',min:5,max:100,step:5,value:P.rate,format:v=>v+' 万个 / 秒',onInput:v=>{P.rate=v;render()}});
    const sHb=ctx.slider({label:'心跳超时',min:.2,max:2,step:.1,value:P.hb,format:v=>v.toFixed(1)+' 秒',onInput:v=>{P.hb=v;render()}});
    const cAck=ctx.segmented({label:'何时向客户确认',value:P.ack,options:[['sync','多数副本持久化后'],['async','主节点本地写入后']],onChange:v=>{P.ack=v;render()}});
    const tFence=ctx.toggle({label:'接收端 fencing：拒绝旧任期',value:P.fence,onChange:v=>{P.fence=v;render()}});
    const btns=[
      ctx.button('主节点宕机',()=>fault('crash'),{danger:true}),
      ctx.button('主节点假死 5 秒',()=>fault('pause')),
      ctx.button('再坏一台备机',()=>killFollower()),
      ctx.button('恢复初始',()=>{init();ctx.clearLog();render()}),
    ];

    /* ---- 舞台 ---- */
    const gw=h('div',{class:'xf-strip'}),nodesEl=h('div',{class:'xf-nodes'}),pub=h('div',{class:'xf-strip'});
    const bar=h('div',{class:'xf-bar','aria-hidden':'true'}),segl=h('div',{class:'xf-segl'}),total=h('p',{class:'xf-total'}),gatesEl=h('ul',{class:'xf-gates','aria-label':'切换关口'});
    ctx.stage.append(gw,nodesEl,pub,h('div',{class:'xf-tl'},h('div',{class:'ph',style:{fontSize:'13px',color:'#66756d',fontWeight:'700'}},'恢复时间线（RTO 预算 5 秒）'),bar,segl,total),gatesEl);
    const stats=ctx.stats([{key:'rto',label:'实际 RTO'},{key:'rpo',label:'已确认但新主缺失（RPO）'},{key:'acc',label:'旧任期发布被接受'},{key:'rej',label:'旧任期发布被拒绝'}]);

    /* ---- 模型 ---- */
    function init(){
      N=[0,1,2].map(i=>({id:'N'+(i+1),up:true,role:i?'follower':'leader',term:1,log:BASE,applied:BASE-(i?lagEv():0)}));
      sim={t:0,phase:'normal',ph:0,kind:null,term:1,leader:0,old:null,pub:BASE,prePub:BASE,maxTerm:1,acc:0,rej:0,rpo:0,rto:null,phases:null,gates:GATES.map(()=>['wait','']),halt:null,wake:0};
    }
    const log=(t,tone)=>ctx.log(`[${sim.t.toFixed(1)}s] ${t}`,tone);
    const gate=(i,st,t)=>{sim.gates[i]=[st,t]};
    const live=n=>n.up&&n.role!=='paused'&&n.role!=='stale';
    function plan(){return [['detect','检测',P.hb],['elect','选主 + 隔离',ELECT],['catch','追日志 + 重建',lagEv()/(P.rate*1e4)],['verify','校验 + 开放',VERIFY]].map(([key,label,dur])=>({key,label,dur,done:0}))}
    function fault(kind){
      if(!(sim.phase==='normal'||sim.phase==='open'))return;
      const L=N[sim.leader];
      if(kind==='crash'){L.up=false;L.role='down';log(`${L.id} 宕机`,'bad')}
      else{L.role='paused';sim.wake=sim.t+PAUSE;for(const n of N)if(n!==L&&live(n))n.log=L.log;log(`${L.id} 进程暂停（例如长时间 GC），错过心跳`,'warn')}
      Object.assign(sim,{old:sim.leader,kind,fT:sim.t,prePub:sim.pub,phases:plan(),phase:'detect',ph:0,rto:null,halt:null,gates:GATES.map(()=>['wait',''])});
      render();
    }
    function killFollower(){
      const f=N.filter((n,i)=>i!==sim.leader&&n.up&&n.role==='follower').pop();
      if(!f)return;f.up=false;f.role='down';log(`备机 ${f.id} 也宕机了`,'bad');render();
    }
    function halt(msg){sim.phase='halt';sim.halt=msg;log(msg,'bad');ctx.announce(msg)}
    function advance(){
      const k=sim.phase,o=N[sim.old];
      if(k==='detect'){log(`心跳超时 ${P.hb.toFixed(1)} 秒：怀疑 ${o.id} 故障。网关暂停交易，保留请求 ID`,'warn');gate(0,'run','请求投票中');gate(1,'run','');sim.phase='elect';return}
      if(k==='elect'){
        const voters=N.filter(n=>n!==o&&live(n));
        if(voters.length<2){gate(0,'bad',`只有 ${voters.length} 个节点能投票，拿不到 3 票中的 2 票`);gate(1,'wait','');return halt('无法取得多数，保持停盘')}
        const c=voters.slice().sort((a,b)=>b.log-a.log)[0];
        sim.term++;for(const n of voters){n.term=sim.term;n.role=n===c?'leader':'follower'}sim.leader=N.indexOf(c);
        gate(0,'ok',`${c.id} 获得 ${voters.length}/3 票，任期 ${sim.term}`);
        if(P.fence){sim.maxTerm=sim.term;gate(1,'ok',`接收端登记任期 ${sim.term}，拒绝任期 ${o.term} 的写入与发布`)}
        else gate(1,'warn',sim.kind==='crash'?'没有 fencing：旧主已宕机，暂时没有双发':P.ack==='sync'?'没有 fencing：只能靠多数确认挡住醒来的旧主':'没有 fencing：旧主醒来后仍能发布');
        log(`${c.id} 当选，任期 ${sim.term}`,'info');gate(2,'run','');sim.phase='catch';return;
      }
      if(k==='catch'){const c=N[sim.leader];c.applied=c.log;gate(2,'ok',`${c.id} 重放完已提交日志，订单簿与冻结资金已重建`);gate(3,'run','');sim.phase='verify';return}
      if(k==='verify'){
        const c=N[sim.leader],gap=Math.round(sim.prePub-c.log);
        if(gap>0){sim.rpo=gap;gate(3,'bad',`出站已发布到 #${fmt(sim.prePub)}，新主日志只到 #${fmt(c.log)}，缺 ${fmt(gap)} 个已确认事件`);return halt('发现已确认数据缺口，停盘调查')}
        gate(3,'ok',`新主日志覆盖已发布位置 #${fmt(sim.prePub)}，重发回报沿用原订单 / 成交 ID`);
        sim.phase='open';sim.rto=sim.phases.reduce((s,p)=>s+p.dur,0);
        log(`交易恢复，RTO ${sim.rto.toFixed(1)} 秒${sim.rto>BUDGET?`，超出 ${BUDGET} 秒预算`:''}`,sim.rto>BUDGET?'bad':'ok');ctx.announce(`交易恢复，RTO ${sim.rto.toFixed(1)} 秒`);
      }
    }
    function tick(dt){
      sim.t+=dt;
      const L=N[sim.leader],trading=sim.phase==='normal'||sim.phase==='open';
      if(trading){
        const fol=N.filter(n=>n!==L&&live(n));
        if(P.ack==='sync'&&!fol.length){halt(`${L.id} 只剩自己，拿不到多数确认，暂停交易`);return}
        L.log+=EV*dt;L.applied=L.log;sim.pub=L.log;
        for(const n of fol){n.log=Math.max(n.log,L.log-(P.ack==='async'?EV*ASYNC:0));n.applied=n.log-lagEv()}
      }
      const o=sim.old!=null?N[sim.old]:null;
      if(o&&o.role==='paused'&&sim.t>=sim.wake){o.role='stale';log(`${o.id} 暂停结束，仍以为自己是任期 ${o.term} 的主`,'warn');if(P.ack!=='sync'&&!P.fence&&sim.term>o.term)gate(1,'bad','旧主醒来后照常发布，接收端全部接受')}
      if(o&&o.role==='stale'&&P.ack!=='sync'){const out=EV*STALE*dt;o.log+=out;o.applied=o.log;if(sim.term>o.term){if(P.fence&&sim.maxTerm>o.term)sim.rej+=out;else sim.acc+=out}}
      const cur=()=>sim.phases&&sim.phases.find(p=>p.key===sim.phase);
      if(cur()){
        sim.ph+=dt;
        if(sim.phase==='catch'){const c=N[sim.leader],d=cur().dur;c.applied=c.log-lagEv()*Math.max(0,1-sim.ph/(d||1))}
        let d;while((d=cur())&&sim.ph>=d.dur){d.done=d.dur;sim.ph-=d.dur;advance()}
        if(cur())cur().done=Math.min(cur().dur,sim.ph);else sim.ph=0;
      }
    }

    /* ---- 渲染 ---- */
    function nodeCard(n,i){
      const tag=n.role==='leader'?['info',`主 · 任期 ${n.term}`]:n.role==='follower'?['',`备 · 任期 ${n.term}`]:n.role==='down'?['bad','宕机']:n.role==='paused'?['warn','暂停（假死）']:['bad',`自认为主 · 任期 ${n.term}`];
      const behind=Math.max(0,n.log-n.applied);
      const pubTxt=n.role==='leader'?(sim.phase==='normal'||sim.phase==='open'?'发布成交：是':'发布成交：暂停'):n.role==='stale'?(P.ack==='sync'?'拿不到多数确认，发不出去':P.fence&&sim.maxTerm>n.term?'仍在发布，被接收端拒绝':'仍在发布，被接收端接受'):'发布成交：否';
      return h('div',{class:'xf-node '+n.role},h('div',{class:'xf-nh'},h('b',null,n.id),h('span',{class:'sdl-tag '+tag[0]},tag[1])),
        h('div',null,h('span',{class:'xf-k'},'日志 '),h('span',{class:'xf-v'},'#'+fmt(n.log))),
        h('div',{class:'xf-lag'},h('i',{style:{width:util.clamp(behind/2e6*100,0,100)+'%'}})),
        h('div',{class:'xf-k'},n.up?(behind>=1?`已应用落后 ${+(behind/1e4).toFixed(1)} 万个事件`:'已应用到最新'):'无法服务'),
        h('div',{class:'xf-k',style:{color:n.role==='stale'?(P.fence&&P.ack!=='sync'?'#86561a':'#9b2c27'):null,fontWeight:n.role==='stale'?'650':null}},pubTxt));
    }
    function render(){
      const L=N[sim.leader],ph=sim.phase,o=sim.old!=null?N[sim.old]:null;
      const g=ph==='normal'||ph==='open'?['ok',`网关：交易开放，约 4.3 万订单 / 秒 → ${L.id}`]:ph==='detect'?['warn',`网关：${o.id} 没有回应，等待心跳超时判定`]:ph==='halt'?['bad','网关：停盘。'+sim.halt]:['warn','网关：交易暂停，保留请求 ID，恢复后按原 ID 处理'];
      gw.className='xf-strip '+g[0];gw.replaceChildren(h('span',null,g[1]),h('i',{class:'xf-flow'+(g[0]==='ok'?'':' off'),style:{'--fc':C.ok}}));
      nodesEl.replaceChildren(...N.map(nodeCard));
      const stale=o&&o.role==='stale'&&P.ack!=='sync',tone=sim.acc>0?'bad':sim.rej>0?'ok':'';
      pub.className='xf-strip '+tone;
      pub.replaceChildren(h('span',null,h('b',null,'出站发布（成交回报 / 行情）'),P.fence?`：接收端只接受任期 ≥ ${sim.maxTerm}`:'：接收端不检查任期'),
        h('i',{class:'xf-flow'+(stale||ph==='normal'||ph==='open'?'':' off'),style:{'--fc':stale?(P.fence&&sim.maxTerm>o.term?C.warn:C.bad):C.ok}}));
      const phs=sim.phases||plan(),sum=phs.reduce((s,p)=>s+p.dur,0),scale=Math.max(sum,BUDGET)*1.08;
      bar.replaceChildren(...phs.map((p,i)=>h('div',{class:'xf-seg',style:{width:p.dur/scale*100+'%'}},h('i',{style:{background:PHC[i]}}),h('b',{style:{width:(p.dur?p.done/p.dur*100:0)+'%',background:PHC[i]}}))),
        h('span',{class:'xf-budget'+(BUDGET/scale>.8?' flip':''),style:{left:BUDGET/scale*100+'%'}},'预算 5 秒'));
      segl.replaceChildren(...phs.map((p,i)=>h('span',null,h('i',{style:{background:PHC[i]}}),`${p.label} ${+p.dur.toFixed(2)} 秒`)));
      const used=sim.phases?sim.phases.reduce((s,p)=>s+p.done,0):0;
      const tt=!sim.phases?['',`若此刻切换：预计 RTO ${sum.toFixed(1)} 秒${sum>BUDGET?`，超出预算 ${(sum-BUDGET).toFixed(1)} 秒`:'，在预算内'}`]:ph==='open'?[sim.rto>BUDGET?'bad':'ok',`RTO ${sim.rto.toFixed(1)} 秒，${sim.rto>BUDGET?`超出预算 ${(sim.rto-BUDGET).toFixed(1)} 秒`:'在预算内'}`]:ph==='halt'?['bad',`已用 ${used.toFixed(1)} 秒后停盘：${sim.halt}`]:['warn',`切换中，已用 ${used.toFixed(1)} 秒`];
      total.className='xf-total '+tt[0];total.textContent=tt[1];
      gatesEl.replaceChildren(...GATES.map((t,i)=>{const [st,d]=sim.gates[i];return h('li',{class:st},h('span',null,(st==='ok'?'✓ ':st==='bad'?'✗ ':st==='warn'?'! ':st==='run'?'… ':'')+t),d?h('small',null,d):null)}));
      stats.set('rto',sim.rto!=null?sim.rto.toFixed(1)+' 秒':ph==='halt'?'停盘':'—',sim.rto!=null?(sim.rto>BUDGET?'bad':'ok'):ph==='halt'?'bad':null);
      stats.set('rpo',ph==='open'&&sim.phases||sim.rpo?fmt(sim.rpo)+' 个事件':'—',sim.rpo?'bad':ph==='open'&&sim.phases?'ok':null);
      stats.set('acc',fmt(sim.acc),sim.acc?'bad':null);stats.set('rej',fmt(sim.rej),sim.rej?'ok':null);
    }
    init();render();
    let acc=0;
    ctx.loop(dt=>{tick(dt);acc+=dt;if(acc>=.1){acc=0;render()}});

    /* ---- 预设场景 ---- */
    async function until(fn){while(!fn())await ctx.wait(100)}
    function prepare(o){
      Object.assign(P,{lag:20,rate:20,hb:.5,ack:'sync',fence:true},o);
      sLag.set(P.lag,true);sRate.set(P.rate,true);sHb.set(P.hb,true);cAck.set(P.ack,true);tFence.set(P.fence,true);
      init();ctx.clearLog();render();
    }
    const done=()=>sim.phase==='open'||sim.phase==='halt';
    const wrap=fn=>async()=>{btns.forEach(x=>x.disabled=true);try{await fn()}finally{btns.forEach(x=>x.disabled=false)}};
    ctx.scenarios([
      {id:'rto',label:'宕机切换：5 秒够吗',
        ask:'主节点宕机。热备已应用落后 100 万个事件，每秒能重放 20 万个；检测 0.5 秒、选主与隔离 1 秒、校验 1.5 秒。RTO 预算 5 秒，能达标吗？',
        insight:'光追日志就要 5 秒，加上检测、选主和校验，RTO 是 8.0 秒，超出预算 3 秒。多数确认模式下已确认事件都在新主上，RPO 为 0。要达标应提高热备应用速度、缩短快照间隔，而不是省掉最后的校验；把落后量拖回 20 万，RTO 就回到 4.0 秒。',
        run:wrap(async()=>{prepare({lag:100});await ctx.wait(1500);fault('crash');await until(done);await ctx.wait(1200)})},
      {id:'zombie',label:'假死旧主醒来，没有 fencing',
        ask:'主节点只是暂停了 5 秒（比如长时间 GC），错过心跳后 N2 当选任期 2。旧主醒来时仍以为自己是主，继续处理连着它的那部分网关的订单。如果接收端不检查任期，会怎样？',
        insight:'切换本身用了 4.0 秒，N2 开始发布成交；约 1 秒后 N1 醒来，也在发布任期 1 的成交，接收端照单全收，「旧任期发布被接受」持续增长：两个订单簿各自在承诺成交。心跳超时只能说明「可能故障」，不能证明旧主已死。',
        run:wrap(async()=>{prepare({ack:'async',fence:false});await ctx.wait(1500);fault('pause');await until(()=>N[0].role==='stale');await ctx.wait(2500)})},
      {id:'fencing',label:'接收端 fencing 拦住旧主',
        ask:'同样的假死，这次选出 N2 时接收端登记任期 2，只接受任期 ≥ 2 的写入与发布。旧主醒来后发出的成交会怎样？',
        insight:'旧主醒来后仍在发布任期 1 的成交，但全部被接收端拒绝，「旧任期发布被接受」保持 0，只有 N2 的成交生效。隔离要在接收端生效：只靠旧主自己检查令牌，它照样可能越过检查。若改成多数确认，醒来的旧主拿不到备机的多数确认，连提交都做不到。',
        run:wrap(async()=>{prepare({ack:'async',fence:true});await ctx.wait(1500);fault('pause');await until(()=>N[0].role==='stale');await ctx.wait(2500)})},
      {id:'rpo',label:'本地确认的数据缺口',
        ask:'主节点写入本地就向客户确认，复制到备机平均晚 50 毫秒。按每秒 4.3 万个订单算，主节点宕机时有多少已确认事件不在新主上？切换能正常完成吗？',
        insight:'新主的日志比已发布位置少 2,150 个事件（4.3 万 × 0.05 秒），这些都是客户已收到确认的数据，RPO 不为 0。校验输出边界时发现缺口，系统停盘调查，而不是为了赶在 5 秒内开盘就放弃这些交易。改成「多数副本持久化后」确认再宕机，缺口为 0。',
        run:wrap(async()=>{prepare({ack:'async'});await ctx.wait(1500);fault('crash');await until(done);await ctx.wait(1200)})},
    ]);
  }
});
})();
