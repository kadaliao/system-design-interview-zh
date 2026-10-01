/* Chapter 28: Stock Exchange. Lab 1: a limit order book matching by price priority, then time priority; lab 2: the gates of a matching-engine failover, RTO, and RPO. */
(function(){
const {el:h,util}=SDLab;
const fmt=n=>util.fmt(Math.round(n));

/* ---------------- Lab 1: limit order book ---------------- */
SDLab.define({
  id:'order-book',chapter:28,
  title:'A Limit Order Book Matches by Price, Then Arrival Order',
  summary:'Each price level is a first-come, first-served queue. Submit a limit or market order and watch the matching engine find the best opposing price, take the order at the head of the queue, and trade the smaller of the two remaining quantities. Any remainder rests in the book; every trade is logged and rolled up into 1-minute candlesticks.',
  caveat:'One stock, integer prices (tick size 1). A trade executes at the resting order’s price; whatever a market order cannot fill is canceled. The chapter’s design supports limit orders only; market orders are here for contrast, and real exchanges define their own matching and pricing rules. Each command advances the simulated clock by 20 seconds, and candlesticks are built from trades only.',
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
    const STEPS=['Take the best opposing price level','Check the limit price allows it','Take the head of that level (earliest arrival)','Trade the smaller remaining quantity','Update both orders, remove empty orders and levels','Rest any remainder in the book (cancel it for a market order)'];
    const P={side:'buy',type:'limit',price:101,qty:80};
    let asks,bids,idx,nb,ns,seq,clock,trades,cand,active,hl,hit,sel,stepI,note,noteTone,pending=[],pumping=false,busy=false;
    const rng=util.rng(28);
    const spawn=fn=>{fn().catch(e=>{if(!(e&&e.abort))console.error(e)})};

    /* ---- Controls ---- */
    const cSide=ctx.segmented({label:'Side',value:P.side,options:[['buy','Buy'],['sell','Sell']],onChange:v=>{P.side=v}});
    const cType=ctx.segmented({label:'Type',value:P.type,options:[['limit','Limit order'],['market','Market order']],onChange:v=>{P.type=v;syncPrice()}});
    const cPrice=ctx.slider({label:'Limit price',min:95,max:105,value:P.price,onInput:v=>{P.price=v}});
    const cQty=ctx.slider({label:'Quantity (shares)',min:10,max:300,step:10,value:P.qty,onInput:v=>{P.qty=v}});
    const syncPrice=()=>{cPrice.input.disabled=P.type==='market';cPrice.el.style.opacity=P.type==='market'?.45:1};
    const btns=[
      ctx.button('Submit order',()=>{if(!busy)enqueue({kind:'new',side:P.side,type:P.type,price:P.price,qty:P.qty})},{primary:true}),
      ctx.button('Cancel selected order',()=>{if(busy)return;if(!sel){note='Click an order block in the book first, then cancel it';noteTone='warn';render();return}enqueue({kind:'cancel',id:sel})}),
      ctx.button('Add 5 random orders',()=>{if(busy)return;for(let i=0;i<5;i++){const ba=bestAsk(),bb=bestBid(),mid=ba!=null&&bb!=null?(ba+bb)/2:99.5;enqueue({kind:'new',side:rng()<.5?'buy':'sell',type:rng()<.15?'market':'limit',price:util.clamp(Math.round(mid+rng.int(-2,2)),95,105),qty:rng.int(1,12)*10})}}),
      ctx.button('Reset order book',()=>{if(!busy){reset();render()}}),
    ];

    /* ---- Stage ---- */
    const root=h('div'),lad=h('div',{class:'ob-lad',role:'group','aria-label':'Order book'});
    const inc=h('p',{class:'ob-inc'}),stepList=h('ol',{class:'ob-steps'}),noteEl=h('p',{class:'ob-note','aria-live':'polite'});
    const tape=h('ul',{class:'ob-tape'});
    const candleSvg=ctx.svgEl('svg',{viewBox:'0 0 300 128',role:'img','aria-label':'1-minute candlesticks'});
    root.append(h('div',{class:'ob-wrap'},lad,h('div',{class:'ob-side'},
      h('div',{class:'sdl-panel'},h('div',{class:'ph'},'Matching engine'),inc,stepList,noteEl),
      h('div',{class:'sdl-panel'},h('div',{class:'ph'},'Trades (each one sends a report to both buyer and seller)'),tape),
      h('div',{class:'sdl-panel'},h('div',{class:'ph'},'1-minute candlesticks (trades only)'),candleSvg,h('p',{class:'sdl-note',style:{margin:'2px 0 0'}},'Teal: close above open. Magenta: close below open. A black outline marks a candle formed by trades in this lab. Resting and canceled orders never change a candle.')))));
    ctx.stage.append(root);
    ctx.note('Click an order block to select it, then cancel it. The number on a block is its remaining shares; within a price level, orders queue from left to right in arrival order.');
    ctx.onResize(w=>root.classList.toggle('ob-narrow',w<640));
    const stats=ctx.stats([{key:'bid',label:'Best bid'},{key:'ask',label:'Best ask'},{key:'spread',label:'Spread'},{key:'last',label:'Last trade'}]);

    /* ---- Order book model ---- */
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
      ctx.log(`Trade ${t.id}: ${price} × ${qty} (buy ${buy} ⇄ sell ${sell}), 2 reports sent`,'ok');
    }

    /* ---- Rendering ---- */
    function row(p){
      const a=asks.get(p),b=bids.get(p),list=a||b||[],side=a?'ask':b?'bid':'empty',tot=list.reduce((s,o)=>s+o.rem,0);
      return h('div',{class:'ob-row '+side},h('span',{class:'ob-px'},p),
        h('span',{class:'ob-sz',style:{'--w':Math.min(100,tot/1.6)+'%','--c':side==='ask'?'#f1cfe0':'#cde8e8'}},tot||''),
        h('div',{class:'ob-q'},list.map(o=>h('button',{type:'button',class:'ob-o'+(o.id===sel?' sel':'')+(o.id===hl?' hl':'')+(o.id===hit?' hit':''),style:{minWidth:Math.round(40+o.rem*.4)+'px'},
          title:`${o.id}: ${o.side==='buy'?'buy':'sell'} at ${p}, originally ${o.qty} shares, ${o.rem} remaining`,'aria-label':`${o.id} ${o.side==='buy'?'buy order':'sell order'} at price ${p}, ${o.rem} shares remaining${o.id===sel?', selected':''}`,
          onclick:()=>{sel=sel===o.id?null:o.id;render()}},o.id+' '+o.rem))));
    }
    function render(){
      const ba=bestAsk(),bb=bestBid();
      const mid=()=>h('div',{class:'ob-mid'},ba!=null&&bb!=null?`Spread ${ba-bb} (best bid ${bb} / best ask ${ba})`:'One side of the book is empty');
      const rows=[h('div',{class:'ob-hd'},h('span',null,'Price'),h('span',null,'Total'),h('span',null,'Queue: earliest on the left'))];
      let midDone=false;
      for(let p=105;p>=95;p--){if(!midDone&&(ba!=null?p<ba:bb!=null&&p<=bb)){rows.push(mid());midDone=true}rows.push(row(p))}
      if(!midDone)rows.push(mid());
      lad.replaceChildren(...rows);
      const o=active,q=pending.length;
      inc.replaceChildren(o?h('span',null,h('b',null,`#${o.seq} ${o.id}`),` ${o.side==='buy'?'buy':'sell'} ${o.type==='limit'?'limit '+o.price:'market'} × ${o.qty}, remaining `,h('b',null,o.rem)):h('span',{style:{color:'#66756d'}},'Waiting for the next command'),q?`(${q} more queued behind it)`:'');
      stepList.replaceChildren(...STEPS.map((s,i)=>h('li',{class:i===stepI?'on':o&&i<stepI?'done':null},s)));
      noteEl.textContent=note;noteEl.className='ob-note'+(noteTone?' '+noteTone:'');
      tape.replaceChildren(...(trades.length?trades.slice(-6).reverse().map(t=>h('li',null,h('b',null,t.id),`${t.price} × ${t.qty}`,h('small',null,`${t.buy} ⇄ ${t.sell} · reports ×2`))):[h('li',null,h('small',null,'No trades yet'))]));
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
        const g=ctx.svgEl('g',null,ctx.svgEl('title',null,`${label} O ${k.o} H ${k.h} L ${k.l} C ${k.c} V ${k.v}`),
          ctx.svgEl('line',{x1:cx,x2:cx,y1:Y(k.h),y2:Y(k.l),stroke:col,'stroke-width':1.5}),
          ctx.svgEl('rect',{x:cx-7,y:top,width:14,height:hgt,fill:col,rx:1.5,stroke:cand.has(k.m)?'#23352f':'none','stroke-width':cand.has(k.m)?1:0}));
        kids.push(g);
        if((all.length-1-i)%2===0)kids.push(ctx.svgEl('text',{x:cx,y:124,'text-anchor':'middle','font-size':11,style:'fill:'+(cand.has(k.m)?'#23352f':'#66756d')},label));
      });
      candleSvg.replaceChildren(...kids);
    }
    const setStep=(i,t,tone)=>{stepI=i;note=t;noteTone=tone||'info';render()};

    /* ---- Matching ---- */
    async function execNew(c){
      seq++;clock+=20;
      const buy=c.side==='buy',o={id:(buy?'B'+(++nb):'S'+(++ns)),side:c.side,type:c.type,price:c.type==='limit'?c.price:null,qty:c.qty,rem:c.qty,seq};
      active=o;const opp=buy?asks:bids;let filled=0,cost=0;
      ctx.log(`#${seq} new order ${o.id}: ${buy?'buy':'sell'} ${o.type==='limit'?'limit '+o.price:'market'} × ${o.qty}`,'info');
      setStep(-1,`Sequencer assigns #${seq}, entering matching`);await ctx.wait(450);
      while(o.rem>0){
        const lv=buy?bestAsk():bestBid();
        setStep(0,lv==null?`The ${buy?'ask':'bid'} side is empty`:`${buy?'Best ask (lowest sell price)':'Best bid (highest buy price)'} is ${lv}`);await ctx.wait(330);
        if(lv==null)break;
        const ok=o.type==='market'||(buy?lv<=o.price:lv>=o.price);
        setStep(1,o.type==='market'?'A market order has no price cap, continue':ok?`${lv} ${buy?'≤':'≥'} limit ${o.price}, can trade`:`${lv} ${buy?'>':'<'} limit ${o.price}, stop matching`,ok?'info':'warn');await ctx.wait(ok?280:650);
        if(!ok)break;
        const head=opp.get(lv)[0];hl=head.id;
        setStep(2,`Head of level ${lv} is ${head.id} (${head.rem} remaining), the earliest arrival at this price`);await ctx.wait(420);
        const q=Math.min(o.rem,head.rem),r0=o.rem,h0=head.rem;head.rem-=q;o.rem-=q;filled+=q;cost+=q*lv;hl=null;hit=head.id;
        trade(lv,q,buy?o.id:head.id,buy?head.id:o.id);
        setStep(3,`Trade min(${r0}, ${h0}) = ${q} shares at price ${lv}`,'ok');await ctx.wait(480);
        const gone=head.rem===0;if(gone)removeOrder(head);hit=null;
        setStep(4,`${o.id} has ${o.rem} left, ${head.id} has ${head.rem} left${gone?', removed from the queue':''}${gone&&!opp.has(lv)?`; level ${lv} is now empty`:''}`);await ctx.wait(380);
      }
      if(o.rem>0){
        if(o.type==='limit'){addOrder(o);setStep(5,`Remaining ${o.rem} shares rest at the back of the ${buy?'bid':'ask'} queue at ${o.price}`,'info');ctx.log(`${o.id} rests ${o.rem} shares at ${o.price}`,'info')}
        else{setStep(5,`${o.rem} shares of the market order have no counterparty and are canceled`,'warn');ctx.log(`${o.id} canceled ${o.rem} remaining shares`,'warn')}
      }else setStep(5,'Fully filled, nothing rests in the book','ok');
      if(filled){const avg=cost/filled;ctx.log(`${o.id} filled ${filled} shares at an average price of ${+avg.toFixed(2)}`,'ok');note+=`. Filled ${filled} shares in total, average price ${+avg.toFixed(2)}`}
      ctx.announce(note);await ctx.wait(750);active=null;stepI=-1;render();
    }
    async function execCancel(c){
      seq++;clock+=20;active=null;
      ctx.log(`#${seq} cancel ${c.id}`,'info');
      const o=idx.get(c.id);
      if(!o){setStep(-1,`#${seq} cancel ${c.id}: it is no longer in the book (fully filled), returns CANNOT_CANCEL_ALREADY_MATCHED`,'bad');ctx.log(`#${seq} cancel failed: ${c.id} already filled`,'bad');await ctx.wait(1300);return}
      hl=o.id;setStep(-1,`#${seq} cancel ${o.id}: found by order ID, unlinked from the queue at ${o.price}`,'info');await ctx.wait(650);
      removeOrder(o);hl=null;if(sel===o.id)sel=null;
      setStep(-1,`Canceled the remaining ${o.rem} shares of ${o.id}${o.rem<o.qty?`; the ${o.qty-o.rem} shares already traded are unaffected`:''}`,'ok');ctx.log(`#${seq} canceled ${o.rem} remaining shares of ${o.id}`,'ok');await ctx.wait(1000);
    }
    const exec=c=>c.kind==='cancel'?execCancel(c):execNew(c);
    function enqueue(c){
      pending.push(c);render();
      if(!pumping){pumping=true;spawn(async()=>{try{while(pending.length)await exec(pending.shift())}finally{pumping=false}})}
    }

    reset();syncPrice();render();

    /* ---- Preset scenarios ---- */
    const wrap=fn=>async()=>{busy=true;btns.forEach(b=>b.disabled=true);try{await fn()}finally{busy=false;btns.forEach(b=>b.disabled=false)}};
    function prepare(side,type,price,qty){reset();Object.assign(P,{side,type,price,qty});cSide.set(side,true);cType.set(type,true);cPrice.set(price,true);cQty.set(qty,true);syncPrice();ctx.clearLog();render()}
    ctx.scenarios([
      {id:'fifo',label:'Same price: first come, first served',
        ask:'The 100 ask level queues S1 (30 shares, arrived first) and S2 (50 shares, arrived later); the 101 level holds S3 and S5. A buy limit order for 80 shares at 101 arrives. Who does it trade with first, and does the 101 level get touched?',
        insight:'It takes S1’s 30 shares, then S2’s 50 shares, both at 100; the 101 level is untouched. Price priority picks the lowest ask, 100; time priority at the same price puts S1 ahead of S2, which arrived later. Afterward the best ask rises to 101 and the spread goes from 1 to 2. Trading at the resting order’s price, 100, is this lab’s simplification.',
        run:wrap(async()=>{prepare('buy','limit',101,80);await ctx.wait(500);await execNew({side:'buy',type:'limit',price:101,qty:80});await ctx.wait(400)})},
      {id:'sweep',label:'A large market order sweeps several levels',
        ask:'A market order buys 200 shares. The ask side has 80 shares at 100, 70 at 101, and 60 at 102. What is the average fill price, and how do the best ask and the spread change afterward?',
        insight:'It consumes 80 shares at 100, 70 at 101, and 50 at 102, for an average of 100.85 (20,170 ÷ 200); that gap is slippage. The best ask moves from 100 to 102 (S4 keeps 10 shares), and the spread widens from 1 to 3. A sell order or a deeper book would give a different result, so “a big order pushes the price up and widens the spread” is not a general law.',
        run:wrap(async()=>{prepare('buy','market',101,200);await ctx.wait(500);await execNew({side:'buy',type:'market',price:null,qty:200});await ctx.wait(400)})},
      {id:'rest',label:'Partial fill, then rest in the book',
        ask:'A buy limit order for 120 shares at 100, but the 100 ask level has only 80 shares. How much trades? Will the remaining 40 shares go on to take the 101 level?',
        insight:'After 80 shares trade at 100 (S1 and S2), the best ask of 101 is above the limit, so matching stops. The remaining 40 shares become buy order B6 and rest at the back of the 100 bid queue; the best bid moves from 99 to 100 and the spread is 1. Pseudocode that only looks up get(order.price) and never rests the remainder gets both of these wrong.',
        run:wrap(async()=>{prepare('buy','limit',100,120);await ctx.wait(500);await execNew({side:'buy',type:'limit',price:100,qty:120});await ctx.wait(400)})},
      {id:'cancel-race',label:'Cancel versus trade: who goes first',
        ask:'The sequencer numbers the buy order “limit 100 × 40” as #41, then “cancel S1” as #42 and “cancel S2” as #43. Does the cancel of S1 succeed? How much of S2 can be canceled?',
        insight:'#41 is processed first: S1’s 30 shares fill completely and S2 trades 10 shares. By the time #42 arrives, S1 is no longer in the book, so it returns “already filled, cannot cancel”. #43 cancels only S2’s remaining 40 shares; the 10 shares already traded are unaffected. Cancels and new orders flow through the same ordered command stream, so sequence numbers decide the outcome, and replay gives the same result.',
        run:wrap(async()=>{prepare('buy','limit',100,40);await ctx.wait(500);await execNew({side:'buy',type:'limit',price:100,qty:40});await execCancel({id:'S1'});await execCancel({id:'S2'});await ctx.wait(300)})},
    ]);
  }
});

/* ---------------- Lab 2: primary-standby failover ---------------- */
SDLab.define({
  id:'exchange-failover',chapter:28,
  title:'Four Gates for a Matching-Engine Failover',
  summary:'Three matching nodes maintain the order book from the same ordered input, and only the primary publishes trades. Crash or freeze the primary and see which gates a failover must pass, where the RTO goes, whether acknowledged data is lost, and what happens when the old primary wakes up and receivers do no fencing.',
  caveat:'The order flow runs at the chapter’s estimated average of about 43,000 orders per second, in real time (1:1). Detection time equals the heartbeat timeout; election plus fencing takes 1 second and verification plus reopening the gateway takes 1.5 seconds (the illustrative budget from card P28-03). Catch-up time = applied lag ÷ replay speed, and applying only starts during catch-up. With “after the primary writes locally”, replication is always 50 ms late, and replication messages already sent during a freeze still arrive. In majority-ack mode, a woken old primary cannot get a majority and publishes nothing; in local-ack mode it wakes up still connected to gateways carrying about 30% of the traffic, plus the outbound channel.',
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
    const GATES=['① Legitimate leadership: majority vote + new term','② Fence off the old primary: receivers reject old terms','③ Restore authoritative state: replay committed log','④ Verify the output boundary: resume at the published position, dedupe by ID'];
    const P={lag:20,rate:20,hb:.5,ack:'sync',fence:true};
    const lagEv=()=>P.lag*1e4;
    let N,sim;

    /* ---- Controls ---- */
    const sLag=ctx.slider({label:'Hot standby applied lag',min:0,max:200,step:10,value:P.lag,format:v=>fmt(v*1e4)+' events',onInput:v=>{P.lag=v;render()}});
    const sRate=ctx.slider({label:'Replay speed',min:5,max:100,step:5,value:P.rate,format:v=>fmt(v*1e4)+' events/s',onInput:v=>{P.rate=v;render()}});
    const sHb=ctx.slider({label:'Heartbeat timeout',min:.2,max:2,step:.1,value:P.hb,format:v=>v.toFixed(1)+' s',onInput:v=>{P.hb=v;render()}});
    const cAck=ctx.segmented({label:'When to acknowledge clients',value:P.ack,options:[['sync','After a majority persists it'],['async','After the primary writes locally']],onChange:v=>{P.ack=v;render()}});
    const tFence=ctx.toggle({label:'Receiver fencing: reject old terms',value:P.fence,onChange:v=>{P.fence=v;render()}});
    const btns=[
      ctx.button('Crash the primary',()=>fault('crash'),{danger:true}),
      ctx.button('Freeze the primary for 5 s',()=>fault('pause')),
      ctx.button('Kill another standby',()=>killFollower()),
      ctx.button('Reset',()=>{init();ctx.clearLog();render()}),
    ];

    /* ---- Stage ---- */
    const gw=h('div',{class:'xf-strip'}),nodesEl=h('div',{class:'xf-nodes'}),pub=h('div',{class:'xf-strip'});
    const bar=h('div',{class:'xf-bar','aria-hidden':'true'}),segl=h('div',{class:'xf-segl'}),total=h('p',{class:'xf-total'}),gatesEl=h('ul',{class:'xf-gates','aria-label':'Failover gates'});
    ctx.stage.append(gw,nodesEl,pub,h('div',{class:'xf-tl'},h('div',{class:'ph',style:{fontSize:'13px',color:'#66756d',fontWeight:'700'}},'Recovery timeline (RTO budget 5 s)'),bar,segl,total),gatesEl);
    const stats=ctx.stats([{key:'rto',label:'Actual RTO'},{key:'rpo',label:'Acked but missing (RPO)'},{key:'acc',label:'Old-term publishes accepted'},{key:'rej',label:'Old-term publishes rejected'}]);

    /* ---- Model ---- */
    function init(){
      N=[0,1,2].map(i=>({id:'N'+(i+1),up:true,role:i?'follower':'leader',term:1,log:BASE,applied:BASE-(i?lagEv():0)}));
      sim={t:0,phase:'normal',ph:0,kind:null,term:1,leader:0,old:null,pub:BASE,prePub:BASE,maxTerm:1,acc:0,rej:0,rpo:0,rto:null,phases:null,gates:GATES.map(()=>['wait','']),halt:null,wake:0};
    }
    const log=(t,tone)=>ctx.log(`[${sim.t.toFixed(1)}s] ${t}`,tone);
    const gate=(i,st,t)=>{sim.gates[i]=[st,t]};
    const live=n=>n.up&&n.role!=='paused'&&n.role!=='stale';
    function plan(){return [['detect','Detect',P.hb],['elect','Elect + fence',ELECT],['catch','Catch up + rebuild',lagEv()/(P.rate*1e4)],['verify','Verify + open',VERIFY]].map(([key,label,dur])=>({key,label,dur,done:0}))}
    function fault(kind){
      if(!(sim.phase==='normal'||sim.phase==='open'))return;
      const L=N[sim.leader];
      if(kind==='crash'){L.up=false;L.role='down';log(`${L.id} crashed`,'bad')}
      else{L.role='paused';sim.wake=sim.t+PAUSE;for(const n of N)if(n!==L&&live(n))n.log=L.log;log(`${L.id} process paused (for example a long GC) and misses heartbeats`,'warn')}
      Object.assign(sim,{old:sim.leader,kind,fT:sim.t,prePub:sim.pub,phases:plan(),phase:'detect',ph:0,rto:null,halt:null,gates:GATES.map(()=>['wait',''])});
      render();
    }
    function killFollower(){
      const f=N.filter((n,i)=>i!==sim.leader&&n.up&&n.role==='follower').pop();
      if(!f)return;f.up=false;f.role='down';log(`Standby ${f.id} crashed too`,'bad');render();
    }
    function halt(msg){sim.phase='halt';sim.halt=msg;log(msg,'bad');ctx.announce(msg)}
    function advance(){
      const k=sim.phase,o=N[sim.old];
      if(k==='detect'){log(`Heartbeat timeout after ${P.hb.toFixed(1)} s: ${o.id} is suspected to have failed. The gateway pauses trading and keeps request IDs`,'warn');gate(0,'run','Requesting votes');gate(1,'run','');sim.phase='elect';return}
      if(k==='elect'){
        const voters=N.filter(n=>n!==o&&live(n));
        if(voters.length<2){gate(0,'bad',`Only ${voters.length} node${voters.length===1?'':'s'} can vote, short of the 2 of 3 votes needed`);gate(1,'wait','');return halt('No majority available, trading stays halted')}
        const c=voters.slice().sort((a,b)=>b.log-a.log)[0];
        sim.term++;for(const n of voters){n.term=sim.term;n.role=n===c?'leader':'follower'}sim.leader=N.indexOf(c);
        gate(0,'ok',`${c.id} gets ${voters.length}/3 votes, term ${sim.term}`);
        if(P.fence){sim.maxTerm=sim.term;gate(1,'ok',`Receivers record term ${sim.term} and reject writes and publishes from term ${o.term}`)}
        else gate(1,'warn',sim.kind==='crash'?'No fencing: the old primary is down, so nothing is published twice for now':P.ack==='sync'?'No fencing: only majority acks can stop a woken old primary':'No fencing: the old primary can still publish after waking');
        log(`${c.id} elected, term ${sim.term}`,'info');gate(2,'run','');sim.phase='catch';return;
      }
      if(k==='catch'){const c=N[sim.leader];c.applied=c.log;gate(2,'ok',`${c.id} has replayed the committed log; order book and frozen funds rebuilt`);gate(3,'run','');sim.phase='verify';return}
      if(k==='verify'){
        const c=N[sim.leader],gap=Math.round(sim.prePub-c.log);
        if(gap>0){sim.rpo=gap;gate(3,'bad',`Outbound published up to #${fmt(sim.prePub)}, but the new primary’s log ends at #${fmt(c.log)}: ${fmt(gap)} acknowledged events missing`);return halt('Gap in acknowledged data found, trading halted for investigation')}
        gate(3,'ok',`The new primary’s log covers the published position #${fmt(sim.prePub)}; resent reports reuse the original order and trade IDs`);
        sim.phase='open';sim.rto=sim.phases.reduce((s,p)=>s+p.dur,0);
        log(`Trading resumed, RTO ${sim.rto.toFixed(1)} s${sim.rto>BUDGET?`, over the ${BUDGET} s budget`:''}`,sim.rto>BUDGET?'bad':'ok');ctx.announce(`Trading resumed, RTO ${sim.rto.toFixed(1)} s`);
      }
    }
    function tick(dt){
      sim.t+=dt;
      const L=N[sim.leader],trading=sim.phase==='normal'||sim.phase==='open';
      if(trading){
        const fol=N.filter(n=>n!==L&&live(n));
        if(P.ack==='sync'&&!fol.length){halt(`${L.id} is alone and cannot get a majority ack, trading paused`);return}
        L.log+=EV*dt;L.applied=L.log;sim.pub=L.log;
        for(const n of fol){n.log=Math.max(n.log,L.log-(P.ack==='async'?EV*ASYNC:0));n.applied=n.log-lagEv()}
      }
      const o=sim.old!=null?N[sim.old]:null;
      if(o&&o.role==='paused'&&sim.t>=sim.wake){o.role='stale';log(`${o.id} resumes and still believes it is primary of term ${o.term}`,'warn');if(P.ack!=='sync'&&!P.fence&&sim.term>o.term)gate(1,'bad','The old primary keeps publishing after waking, and receivers accept everything')}
      if(o&&o.role==='stale'&&P.ack!=='sync'){const out=EV*STALE*dt;o.log+=out;o.applied=o.log;if(sim.term>o.term){if(P.fence&&sim.maxTerm>o.term)sim.rej+=out;else sim.acc+=out}}
      const cur=()=>sim.phases&&sim.phases.find(p=>p.key===sim.phase);
      if(cur()){
        sim.ph+=dt;
        if(sim.phase==='catch'){const c=N[sim.leader],d=cur().dur;c.applied=c.log-lagEv()*Math.max(0,1-sim.ph/(d||1))}
        let d;while((d=cur())&&sim.ph>=d.dur){d.done=d.dur;sim.ph-=d.dur;advance()}
        if(cur())cur().done=Math.min(cur().dur,sim.ph);else sim.ph=0;
      }
    }

    /* ---- Rendering ---- */
    function nodeCard(n,i){
      const tag=n.role==='leader'?['info',`Primary · term ${n.term}`]:n.role==='follower'?['',`Standby · term ${n.term}`]:n.role==='down'?['bad','Down']:n.role==='paused'?['warn','Paused (frozen)']:['bad',`Thinks it’s primary · term ${n.term}`];
      const behind=Math.max(0,n.log-n.applied);
      const pubTxt=n.role==='leader'?(sim.phase==='normal'||sim.phase==='open'?'Publishes trades: yes':'Publishes trades: paused'):n.role==='stale'?(P.ack==='sync'?'No majority ack, cannot publish':P.fence&&sim.maxTerm>n.term?'Still publishing, rejected by receivers':'Still publishing, accepted by receivers'):'Publishes trades: no';
      return h('div',{class:'xf-node '+n.role},h('div',{class:'xf-nh'},h('b',null,n.id),h('span',{class:'sdl-tag '+tag[0]},tag[1])),
        h('div',null,h('span',{class:'xf-k'},'Log '),h('span',{class:'xf-v'},'#'+fmt(n.log))),
        h('div',{class:'xf-lag'},h('i',{style:{width:util.clamp(behind/2e6*100,0,100)+'%'}})),
        h('div',{class:'xf-k'},n.up?(behind>=1?`Applied lag: ${fmt(behind)} events`:'Fully applied'):'Unavailable'),
        h('div',{class:'xf-k',style:{color:n.role==='stale'?(P.fence&&P.ack!=='sync'?'#86561a':'#9b2c27'):null,fontWeight:n.role==='stale'?'650':null}},pubTxt));
    }
    function render(){
      const L=N[sim.leader],ph=sim.phase,o=sim.old!=null?N[sim.old]:null;
      const g=ph==='normal'||ph==='open'?['ok',`Gateway: trading open, about 43,000 orders/s → ${L.id}`]:ph==='detect'?['warn',`Gateway: ${o.id} is not responding, waiting for the heartbeat timeout`]:ph==='halt'?['bad','Gateway: trading halted. '+sim.halt]:['warn','Gateway: trading paused, request IDs kept and handled by their original IDs after recovery'];
      gw.className='xf-strip '+g[0];gw.replaceChildren(h('span',null,g[1]),h('i',{class:'xf-flow'+(g[0]==='ok'?'':' off'),style:{'--fc':C.ok}}));
      nodesEl.replaceChildren(...N.map(nodeCard));
      const stale=o&&o.role==='stale'&&P.ack!=='sync',tone=sim.acc>0?'bad':sim.rej>0?'ok':'';
      pub.className='xf-strip '+tone;
      pub.replaceChildren(h('span',null,h('b',null,'Outbound publishing (trade reports / market data)'),P.fence?`: receivers accept only term ≥ ${sim.maxTerm}`:': receivers do not check terms'),
        h('i',{class:'xf-flow'+(stale||ph==='normal'||ph==='open'?'':' off'),style:{'--fc':stale?(P.fence&&sim.maxTerm>o.term?C.warn:C.bad):C.ok}}));
      const phs=sim.phases||plan(),sum=phs.reduce((s,p)=>s+p.dur,0),scale=Math.max(sum,BUDGET)*1.08;
      bar.replaceChildren(...phs.map((p,i)=>h('div',{class:'xf-seg',style:{width:p.dur/scale*100+'%'}},h('i',{style:{background:PHC[i]}}),h('b',{style:{width:(p.dur?p.done/p.dur*100:0)+'%',background:PHC[i]}}))),
        h('span',{class:'xf-budget'+(BUDGET/scale>.8?' flip':''),style:{left:BUDGET/scale*100+'%'}},'Budget 5 s'));
      segl.replaceChildren(...phs.map((p,i)=>h('span',null,h('i',{style:{background:PHC[i]}}),`${p.label} ${+p.dur.toFixed(2)} s`)));
      const used=sim.phases?sim.phases.reduce((s,p)=>s+p.done,0):0;
      const tt=!sim.phases?['',`If you fail over now: expected RTO ${sum.toFixed(1)} s${sum>BUDGET?`, ${(sum-BUDGET).toFixed(1)} s over budget`:', within budget'}`]:ph==='open'?[sim.rto>BUDGET?'bad':'ok',`RTO ${sim.rto.toFixed(1)} s, ${sim.rto>BUDGET?`${(sim.rto-BUDGET).toFixed(1)} s over budget`:'within budget'}`]:ph==='halt'?['bad',`Halted after ${used.toFixed(1)} s: ${sim.halt}`]:['warn',`Failing over, ${used.toFixed(1)} s used`];
      total.className='xf-total '+tt[0];total.textContent=tt[1];
      gatesEl.replaceChildren(...GATES.map((t,i)=>{const [st,d]=sim.gates[i];return h('li',{class:st},h('span',null,(st==='ok'?'✓ ':st==='bad'?'✗ ':st==='warn'?'! ':st==='run'?'… ':'')+t),d?h('small',null,d):null)}));
      stats.set('rto',sim.rto!=null?sim.rto.toFixed(1)+' s':ph==='halt'?'Halted':'—',sim.rto!=null?(sim.rto>BUDGET?'bad':'ok'):ph==='halt'?'bad':null);
      stats.set('rpo',ph==='open'&&sim.phases||sim.rpo?fmt(sim.rpo)+' events':'—',sim.rpo?'bad':ph==='open'&&sim.phases?'ok':null);
      stats.set('acc',fmt(sim.acc),sim.acc?'bad':null);stats.set('rej',fmt(sim.rej),sim.rej?'ok':null);
    }
    init();render();
    let acc=0;
    ctx.loop(dt=>{tick(dt);acc+=dt;if(acc>=.1){acc=0;render()}});

    /* ---- Preset scenarios ---- */
    async function until(fn){while(!fn())await ctx.wait(100)}
    function prepare(o){
      Object.assign(P,{lag:20,rate:20,hb:.5,ack:'sync',fence:true},o);
      sLag.set(P.lag,true);sRate.set(P.rate,true);sHb.set(P.hb,true);cAck.set(P.ack,true);tFence.set(P.fence,true);
      init();ctx.clearLog();render();
    }
    const done=()=>sim.phase==='open'||sim.phase==='halt';
    const wrap=fn=>async()=>{btns.forEach(x=>x.disabled=true);try{await fn()}finally{btns.forEach(x=>x.disabled=false)}};
    ctx.scenarios([
      {id:'rto',label:'Crash failover: is 5 seconds enough?',
        ask:'The primary crashes. The hot standby is 1 million events behind and can replay 200,000 per second; detection takes 0.5 s, election and fencing 1 s, verification 1.5 s. Can it meet the 5 s RTO budget?',
        insight:'Catching up on the log alone takes 5 s; with detection, election, and verification the RTO is 8.0 s, 3 s over budget. In majority-ack mode every acknowledged event is already on the new primary, so the RPO is 0. To meet the target, speed up the hot standby’s apply rate or shorten the snapshot interval; don’t skip the final verification. Bring the lag back to 200,000 events and the RTO returns to 4.0 s.',
        run:wrap(async()=>{prepare({lag:100});await ctx.wait(1500);fault('crash');await until(done);await ctx.wait(1200)})},
      {id:'zombie',label:'A frozen old primary wakes up, no fencing',
        ask:'The primary is only paused for 5 s (a long GC, say). After it misses heartbeats, N2 is elected for term 2. The old primary wakes up still believing it is primary and keeps processing orders from the gateways connected to it. What happens if receivers do not check terms?',
        insight:'The failover itself takes 4.0 s, and N2 starts publishing trades. About 1 s later N1 wakes up and publishes term-1 trades too; receivers accept them all, and “Old-term publishes accepted” keeps growing: two order books are each promising fills. A heartbeat timeout only means “possibly failed”; it does not prove the old primary is dead.',
        run:wrap(async()=>{prepare({ack:'async',fence:false});await ctx.wait(1500);fault('pause');await until(()=>N[0].role==='stale');await ctx.wait(2500)})},
      {id:'fencing',label:'Receiver fencing stops the old primary',
        ask:'The same freeze, but this time receivers record term 2 when N2 is elected and accept only writes and publishes from term 2 or later. What happens to the trades the old primary sends after it wakes up?',
        insight:'The old primary wakes up and keeps publishing term-1 trades, but receivers reject every one: “Old-term publishes accepted” stays at 0 and only N2’s trades take effect. Fencing must be enforced at the receiver; if the old primary only checks its own token, it can still slip past the check. With majority acks instead, a woken old primary cannot even commit, because it gets no majority ack from the standbys.',
        run:wrap(async()=>{prepare({ack:'async',fence:true});await ctx.wait(1500);fault('pause');await until(()=>N[0].role==='stale');await ctx.wait(2500)})},
      {id:'rpo',label:'The data gap with local acks',
        ask:'The primary acknowledges clients as soon as it writes locally, and replication to the standbys lags by 50 ms. At 43,000 orders per second, how many acknowledged events are missing on the new primary when the primary crashes? Can the failover complete normally?',
        insight:'The new primary’s log is 2,150 events short of the published position (43,000 × 0.05 s). Clients have already been told these were accepted, so the RPO is not 0. The gap shows up when the output boundary is verified, and the system halts to investigate rather than abandon those trades to reopen within 5 s. Switch to acknowledging “after a majority persists it” and crash again: the gap is 0.',
        run:wrap(async()=>{prepare({ack:'async'});await ctx.wait(1500);fault('crash');await until(done);await ctx.wait(1200)})},
    ]);
  }
});
})();
