/* 第 7 章：分布式唯一 ID。Snowflake 位预算编辑器 + 三台机器按模拟毫秒发号：序列耗尽、时钟回拨、机器号重复与时间有序。 */
(function(){
const {el:h,util}=SDLab;
const C=SDLab.colors;

SDLab.define({
  id:'snowflake',chapter:7,
  title:'Snowflake 发号器：位预算、序列耗尽与时钟回拨',
  summary:'上半部分调 63 个可用位的分配，看年限、机器数和每毫秒上限怎样此消彼长；下半部分三台机器按模拟毫秒发号，每个 ID 拆成「时间 | 机房 | 机器 | 序列」。试试同一毫秒请求过多、时钟回拨和机器号重复。',
  caveat:'时间按模拟毫秒推进，一格放慢到零点几秒；时间戳从 epoch 之后第 1,000,000 毫秒开始。每毫秒三台机器按 A、B、C 的顺序处理请求，这个顺序就是「生成顺序」。重复只在本次模拟发出的 ID 之间检测。',
  mount(ctx){
    ctx.css('sf',`
.sf-bar{display:flex;height:34px;border-radius:8px;overflow:hidden;border:1px solid #dbe2da;font-size:12px;font-weight:700;color:#fff}
.sf-bar span{display:flex;align-items:center;justify-content:center;min-width:0;white-space:nowrap;overflow:hidden;transition:flex-grow .3s}
.sf-caps{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px;margin:8px 0 12px}
.sf-cap{border-left:4px solid;padding:3px 8px;background:#fbfcfa;border-radius:0 8px 8px 0;font-size:12.5px;line-height:1.5;min-width:0}
.sf-cap b{display:block;font-size:13px}
.sf-cap .warn{color:#86561a;font-weight:650}
.sf-machines{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.sf-m{border:1.5px solid #dbe2da;border-radius:10px;padding:7px 9px;background:#fff;font-size:12.5px;line-height:1.55;min-width:0}
.sf-m.warn{border-color:#dfbf85;background:#fffaf0}.sf-m.bad{border-color:#e3aaa4;background:#fff6f5}
.sf-m .hd{display:flex;justify-content:space-between;align-items:center;gap:4px;flex-wrap:wrap}
.sf-m .hd b{font-size:14px}
.sf-m .k{color:#66756d}
.sf-m .mono{font-family:ui-monospace,Menlo,monospace;font-size:12px}
.sf-seq{display:flex;gap:2px;margin:3px 0}
.sf-seq i{flex:1;height:9px;border-radius:2px;background:#e6eee2}
.sf-seq i.on{background:#b8477a}
.sf-prog{height:9px;border-radius:3px;background:#e6eee2;margin:3px 0;overflow:hidden}
.sf-prog i{display:block;height:100%;background:#b8477a}
.sf-ids{margin-top:10px}
.sf-props{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;margin:4px 0 6px}
.sf-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;padding:4px 6px;border-top:1px solid #e8ede6;font-size:12.5px}
.sf-row:first-child{border-top:0}
.sf-row.dup{background:#fff1ef}.sf-row.inv{background:#fffaf0}
.sf-row .n{color:#66756d;font-family:ui-monospace,Menlo,monospace;min-width:6.5em}
.sf-f{display:inline-flex;gap:3px;flex-wrap:wrap}
.sf-f span{font-family:ui-monospace,Menlo,monospace;font-size:12px;padding:0 5px;border-radius:4px;color:#fff}
.sf-row .id{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;margin-left:auto;overflow-wrap:anywhere}
.sf-bin{font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.6;overflow-wrap:anywhere;word-break:break-all;margin-top:6px}
.sf-bin span{font-weight:700}
.sf-narrow .sf-machines{grid-template-columns:minmax(0,1fr)}
.sf-narrow .sf-row .id{margin-left:0;width:100%}
`);
    const EPOCH=1288834974657,T0=1000000;
    const COL={sign:'#9aa89f',t:'#2f6fb3',d:'#1f8a8a',m:'#7b5cb8',s:'#b8477a'};
    const L={d:5,m:5,s:12};const tb=()=>63-L.d-L.m-L.s;
    const P={speed:1,rate:1,policy:'wait',wrap:false,ident:'own',skewB:0};
    const IDENT={own:[2,1],clone:[1,2],dc:[2,2]};
    let T,ms,ids,seen,maxId,dups,invs,rejected;
    function reset(){
      T=T0;ids=[];seen=new Map();maxId=null;dups=0;invs=0;rejected=0;
      ms=[{name:'M-A',dc:1,mid:1,off:0},{name:'M-B',dc:1,mid:2,off:P.skewB},{name:'M-C',dc:IDENT[P.ident][0],mid:IDENT[P.ident][1],off:0}].map(x=>({...x,last:-1,seq:0,queue:0,wait:0,rej:0,status:'空闲',tone:null,issued:0}));
    }
    const maxSeq=()=>(1<<L.s)-1;
    function issue(mc,ts,seq){
      const S=BigInt(L.s),M=BigInt(L.m),D=BigInt(L.d);
      const dc=mc.dc&((1<<L.d)-1),mid=mc.mid&((1<<L.m)-1);
      const big=(BigInt(ts)<<(D+M+S))|(BigInt(dc)<<(M+S))|(BigInt(mid)<<S)|BigInt(seq);
      const key=big.toString();const c=seen.get(key)||0;seen.set(key,c+1);
      const dup=c>0,inv=!dup&&maxId!==null&&big<maxId;if(dup)dups++;if(inv)invs++;if(maxId===null||big>maxId)maxId=big;
      const prev=ids.length?ids[ids.length-1].big:null;
      ids.push({n:ids.length+1,name:mc.name,ts,dc,mid,seq,big,key,dup,inv,gap:prev===null?null:big-prev});
      if(ids.length>400)ids.splice(0,ids.length-400);
      mc.issued++;
      if(dup)ctx.log(`${mc.name} 发出重复 ID ${key}（t=${ts}, dc=${dc}, 机器=${mid}, seq=${seq}）`,'bad');
    }
    /* 一台机器处理排队请求；返回本毫秒是否停下等待 */
    function serve(mc){
      const now=T+mc.off;mc.status='正常发号';mc.tone='ok';
      while(mc.queue>0){
        if(now<mc.last&&P.policy!=='none'){
          if(P.policy==='wait'){mc.status=`时钟回拨：等本地时间追上 ${util.fmt(mc.last)}`;mc.tone='warn';mc.wait++;return}
          mc.rej+=mc.queue;rejected+=mc.queue;ctx.log(`${mc.name} 时钟回拨（${util.fmt(now)} < ${util.fmt(mc.last)}），拒绝 ${mc.queue} 个请求并报警`,'bad');mc.queue=0;mc.status='时钟回拨：拒绝并报警';mc.tone='bad';return;
        }
        if(now===mc.last){
          if(mc.seq<maxSeq())mc.seq++;
          else if(P.wrap){mc.seq=0;ctx.log(`${mc.name} 序列用尽后绕回 0`,'bad')}
          else{mc.status=`序列用尽：${mc.queue} 个请求等下一毫秒`;mc.tone='warn';mc.wait++;return}
        }else{if(now<mc.last)ctx.log(`${mc.name} 没检查回拨：把 ${util.fmt(now)} 当作新毫秒，seq 从 0 开始`,'bad');mc.seq=0;mc.last=now}
        issue(mc,now,mc.seq);mc.queue--;
      }
      if(!mc.issued)mc.status='空闲';
    }
    function tick(){T++;for(const mc of ms){mc.issued=0;mc.queue+=P.rate;serve(mc)}render()}
    function burst(n){const a=ms[0];a.issued=0;a.queue+=n;ctx.log(`M-A 在 ${util.fmt(T)} 毫秒收到 ${n} 个请求`,'info');serve(a);render()}
    function rollback(k){ms[0].off-=k;ctx.log(`M-A 时钟回拨 ${k} ms：本地时间变为 ${util.fmt(T+ms[0].off)}`,'warn');render()}

    /* ---- 舞台 ---- */
    const bar=h('div',{class:'sf-bar',role:'img'});
    const caps=h('div',{class:'sf-caps'});
    const machBox=h('div',{class:'sf-machines'});
    const props=h('div',{class:'sf-props'});
    const list=h('div');
    const bin=h('div',{class:'sf-bin'});
    ctx.stage.append(h('div',{class:'ph',style:{fontSize:'13px',color:C.muted,fontWeight:700,margin:'0 0 6px'}},'64 位怎么分'),bar,caps,
      h('div',{class:'ph',style:{fontSize:'13px',color:C.muted,fontWeight:700,margin:'0 0 6px'}},'三台发号机（每格一个模拟毫秒）'),machBox,
      h('div',{class:'sdl-panel sf-ids'},h('div',{class:'ph'},'最近发出的 ID（新的在上）'),props,list,bin));
    ctx.onResize(w=>{ctx.stage.classList.toggle('sf-narrow',w<620);if(ms)drawLayout()});
    const big=n=>n>=1e8?(+(n/1e8).toFixed(2))+' 亿':n>=1e4?(+(n/1e4).toFixed(1))+' 万':util.fmt(n);
    function drawLayout(){
      const t=tb();const segs=[['sign',1,'符号'],['t',t,'时间'],['d',L.d,'机房'],['m',L.m,'机器'],['s',L.s,'序列']];
      bar.setAttribute('aria-label',segs.map(x=>`${x[2]} ${x[1]} 位`).join('，'));
      const W=bar.clientWidth||ctx.stage.clientWidth||600;/* 按实际像素宽决定段内写多少字，窄段只写位数 */
      bar.replaceChildren(...segs.map(([k,n,lbl])=>{const px=W*n/64;return h('span',{style:{flexGrow:n,flexBasis:0,background:COL[k]},title:`${lbl} ${n} 位`},px>=54?`${lbl} ${n}`:px>=17?String(n):'')}));
      const span=2**t,end=EPOCH+span;
      const yrs=span<8.6e15-EPOCH?new Date(end).getUTCFullYear()+' 年 '+(new Date(end).getUTCMonth()+1)+' 月':'超过 27 万年';
      caps.replaceChildren(
        h('div',{class:'sf-cap',style:{borderColor:COL.t}},h('b',null,`时间戳 ${t} 位`),`可用 ${util.duration(span/1000)}，从 2010-11-04 起约用到 ${yrs}`,t<35?h('div',{class:'warn'},'时间位太少，很快就会用完'):null),
        h('div',{class:'sf-cap',style:{borderColor:COL.d}},h('b',null,`机房 ${L.d} 位`),`最多 ${util.fmt(2**L.d)} 个数据中心`),
        h('div',{class:'sf-cap',style:{borderColor:COL.m}},h('b',null,`机器 ${L.m} 位`),`每个机房 ${util.fmt(2**L.m)} 台，全局 ${util.fmt(2**(L.d+L.m))} 台`),
        h('div',{class:'sf-cap',style:{borderColor:COL.s}},h('b',null,`序列 ${L.s} 位`),`每台每毫秒 ${util.fmt(2**L.s)} 个，理论 ${big(2**L.s*1000)}/秒`));
    }
    function seqViz(mc){
      const n=1<<L.s,used=mc.last===T+mc.off?mc.seq+1:0;
      if(n<=16)return h('div',{class:'sf-seq','aria-hidden':'true'},util.range(n).map(i=>h('i',{class:i<used?'on':null})));
      return h('div',{class:'sf-prog','aria-hidden':'true'},h('i',{style:{width:used/n*100+'%'}}));
    }
    function drawMachines(){
      machBox.replaceChildren(...ms.map(mc=>{
        const same=ms.find(o=>o!==mc&&o.dc===mc.dc&&o.mid===mc.mid);
        const now=T+mc.off;
        return h('div',{class:'sf-m'+(mc.tone==='warn'?' warn':mc.tone==='bad'||same?' bad':'')},
          h('div',{class:'hd'},h('b',null,mc.name),h('span',{class:'sdl-tag '+(same?'bad':'')},`dc=${mc.dc} · 机器=${mc.mid}`)),
          same?h('div',{style:{color:C.bad,fontWeight:650}},`与 ${same.name} 身份相同`):null,
          h('div',null,h('span',{class:'k'},'本地时钟 '),h('span',{class:'mono'},util.fmt(now)),mc.off?h('span',{style:{color:C.warn}},` (${mc.off>0?'快':'慢'} ${Math.abs(mc.off)} ms)`):null),
          h('div',null,h('span',{class:'k'},'上次时间 '),h('span',{class:'mono'},mc.last<0?'—':util.fmt(mc.last)),h('span',{class:'k'},' · seq '),h('span',{class:'mono'},mc.last<0?'—':String(mc.seq))),
          seqViz(mc),
          h('div',null,h('span',{class:'sdl-tag '+(mc.tone||'')},mc.status)),
          h('div',{class:'k'},`本毫秒发出 ${mc.issued} · 排队 ${mc.queue}${mc.rej?' · 已拒绝 '+mc.rej:''}`));
      }));
    }
    function chips(x){return h('span',{class:'sf-f'},h('span',{style:{background:COL.t}},'t '+util.fmt(x.ts)),h('span',{style:{background:COL.d}},'dc '+x.dc),h('span',{style:{background:COL.m}},'m '+x.mid),h('span',{style:{background:COL.s}},'seq '+x.seq))}
    function drawIds(){
      const last=ids.slice(ctx.stage.classList.contains('sf-narrow')?-5:-8).reverse();
      list.replaceChildren(...(last.length?last.map(x=>h('div',{class:'sf-row'+(x.dup?' dup':x.inv?' inv':'')},h('span',{class:'n'},`#${x.n} ${x.name}`),chips(x),x.dup?h('span',{class:'sdl-tag bad'},'重复'):null,x.inv?h('span',{class:'sdl-tag warn'},'比之前的小'):null,h('span',{class:'id'},x.key))):[h('p',{class:'sdl-note'},'还没有 ID。')]));
      const g=ids.length>1?ids[ids.length-1].gap:null;
      props.replaceChildren(
        h('span',null,'唯一：',h('b',{style:{color:dups?C.bad:C.ok}},dups?`否，${dups} 个重复`:'是')),
        h('span',null,'连续：',h('b',null,'否'),g!==null?`（最新减前一个 = ${util.fmt(Number(g))}）`:''),
        h('span',null,'按生成顺序递增：',h('b',{style:{color:invs?C.warn:C.ok}},invs?`否，${invs} 次变小`:'是')));
      const x=ids[ids.length-1];
      if(!x){bin.replaceChildren();return}
      const b=x.big.toString(2).padStart(64,'0');const t=tb();const cuts=[['sign',1],['t',t],['d',L.d],['m',L.m],['s',L.s]];let i=0;
      bin.replaceChildren(h('span',{style:{color:C.muted,fontWeight:400}},'最新 ID 的二进制：'),...cuts.map(([k,n])=>{const s=b.slice(i,i+n);i+=n;return h('span',{style:{color:COL[k]}},s+' ')}));
    }
    const st=ctx.stats([{key:'n',label:'已发 ID'},{key:'dup',label:'重复'},{key:'inv',label:'比前面的 ID 小'},{key:'wait',label:'等待 / 拒绝'}]);
    function render(){
      drawMachines();drawIds();
      st.set('n',util.fmt(ids.length?ids[ids.length-1].n:0));st.set('dup',String(dups),dups?'bad':'ok');st.set('inv',String(invs),invs?'warn':null);
      const w=ms.reduce((a,m)=>a+m.queue,0);st.set('wait',`${w} / ${rejected}`,rejected?'bad':w?'warn':null);
    }
    /* ---- 控件 ---- */
    function relayout(){drawLayout();reset();render()}
    const dCtl=ctx.slider({label:'机房位',min:2,max:10,value:L.d,format:v=>v+' 位',onChange:v=>{L.d=v;relayout()},onInput:v=>{L.d=v;drawLayout()}});
    const mCtl=ctx.slider({label:'机器位',min:2,max:10,value:L.m,format:v=>v+' 位',onChange:v=>{L.m=v;relayout()},onInput:v=>{L.m=v;drawLayout()}});
    const sCtl=ctx.slider({label:'序列位',min:1,max:16,value:L.s,format:v=>v+' 位',onChange:v=>{L.s=v;relayout()},onInput:v=>{L.s=v;drawLayout()}});
    const spCtl=ctx.segmented({label:'时间推进',value:1,options:[[0,'暂停'],[1,'慢'],[2,'快']],onChange:v=>{P.speed=v;v?lp.start():lp.stop()}});
    const rCtl=ctx.slider({label:'每台每毫秒请求',min:0,max:6,value:P.rate,format:v=>v+' 个',onInput:v=>{P.rate=v}});
    const kCtl=ctx.slider({label:'M-B 时钟偏差',min:-5,max:5,value:0,format:v=>v?(v>0?'快 ':'慢 ')+Math.abs(v)+' ms':'准',onInput:v=>{P.skewB=v;ms[1].off=v;render()}});
    const idCtl=ctx.select({label:'M-C 的身份',value:'own',options:[['own','dc=2 · 机器=1（独立）'],['clone','dc=1 · 机器=2（冒用 M-B）'],['dc','dc=2 · 机器=2（只重用机器号）']],onChange:v=>{P.ident=v;ms[2].dc=IDENT[v][0];ms[2].mid=IDENT[v][1];ctx.log(`M-C 身份改为 dc=${ms[2].dc}、机器=${ms[2].mid}`,'info');render()}});
    const polCtl=ctx.segmented({label:'发现时钟回拨时',value:'wait',options:[['wait','等待追平'],['reject','拒绝并报警'],['none','不检查（错误）']],onChange:v=>{P.policy=v}});
    const wrapCtl=ctx.toggle({label:'序列用尽时绕回 0（错误示范）',value:false,onChange:v=>{P.wrap=v}});
    ctx.button('走 1 毫秒',()=>tick(),{primary:true});
    ctx.button('M-A 瞬间来 6 个请求',()=>burst(6));
    ctx.button('M-A 时钟回拨 3 ms',()=>rollback(3));
    let acc=0;
    const lp=ctx.loop(dt=>{if(!P.speed)return;acc+=dt;if(acc>=(P.speed===1?0.9:0.25)){acc=0;tick()}});
    drawLayout();reset();for(let i=0;i<3;i++)tick();

    /* ---- 场景：暂停自动推进，由脚本逐毫秒走 ---- */
    async function prepare(o,keepLog){
      Object.assign(L,{d:5,m:5,s:12},o.layout);Object.assign(P,{speed:0,rate:1,policy:'wait',wrap:false,ident:'own',skewB:0},o);
      dCtl.set(L.d,true);mCtl.set(L.m,true);sCtl.set(L.s,true);spCtl.set(0,true);lp.stop();rCtl.set(P.rate,true);kCtl.set(P.skewB,true);idCtl.set(P.ident,true);polCtl.set(P.policy,true);wrapCtl.set(P.wrap,true);
      if(!keepLog)ctx.clearLog();drawLayout();reset();render();await ctx.wait(600);
    }
    async function ticks(n,gap){for(let i=0;i<n;i++){tick();await ctx.wait(gap)}}
    ctx.scenarios([
      {id:'exhaust',label:'同一毫秒序列用完',
        ask:'把序列位设为 2，每台每毫秒只有 seq 0–3 四个号。M-A 在同一毫秒来了 6 个请求，第 5、6 个怎么办？如果实现让 seq 绕回 0 呢？',
        insight:'前 4 个拿到 seq 0–3；第 5、6 个排队，到下一毫秒以 seq 0、1 发出，全部唯一。打开「绕回 0」后，同一毫秒的第 5、6 个又用了 seq 0、1，和这一毫秒前两个 ID 完全相同，出现 2 个重复。换成 12 位序列，就是第 4097 个请求必须等待或拒绝。',
        async run(){await prepare({rate:0,layout:{s:2}});burst(6);await ctx.wait(2200);tick();await ctx.wait(2200);P.wrap=true;wrapCtl.set(true,true);ctx.log('改为：序列用尽时绕回 0','warn');tick();await ctx.wait(700);burst(6);await ctx.wait(2400)}},
      {id:'rollback',label:'时钟回拨 3 ms',
        ask:'M-A 每毫秒发 1 个号，发到本地时间 1,000,004 后时钟回拨 3 ms。如果实现不检查回拨，会怎样？改成「等待追平」呢？',
        insight:'不检查时，M-A 把 1,000,002–1,000,004 当成新的毫秒又走一遍，seq 从 0 开始，这 3 个 ID 与之前发过的完全相同（重复 3 个）。改成等待追平后，M-A 停发 2 ms、请求排队，本地时间回到 1,000,004 时接着用 seq 1–3 发出积压的 3 个，没有重复。不过它的时钟仍慢 3 ms，之后发的 ID 会比 M-B、M-C 刚发的小（出现 4 次「变小」）：不重复，但也不保证跨机器有序。',
        async run(){await prepare({policy:'none'});await ticks(4,550);rollback(3);await ctx.wait(900);await ticks(4,650);await ctx.wait(1200);
          ctx.log('—— 重来一遍，这次「等待追平」 ——','info');await prepare({policy:'wait'},true);await ticks(4,450);rollback(3);await ctx.wait(900);await ticks(4,750);await ctx.wait(600)}},
      {id:'clone',label:'机器号重复',
        ask:'M-C 是从 M-B 克隆出来的，也配置成 dc=1、机器=2。两台每毫秒各发 1 个号，4 毫秒会产生几个重复？把 M-C 改到 dc=2、机器号仍是 2 呢？',
        insight:'每毫秒 M-B 和 M-C 都以相同的时间、dc=1、机器=2、seq=0 发号，输入完全相同，输出必然相同，4 毫秒撞了 4 次：这是确定性重复，不是小概率碰撞。M-C 改到机房 2 后，即使机器号还是 2，dc 字段不同，就不再冲突。',
        async run(){await prepare({ident:'clone'});await ctx.wait(600);await ticks(4,900);await ctx.wait(800);P.ident='dc';idCtl.set('dc');await ctx.wait(600);await ticks(3,800)}},
      {id:'order',label:'唯一、连续、有序',
        ask:'三台机器每毫秒各发 1 个号，但 M-B 的时钟慢 2 ms。6 毫秒后，这 18 个 ID 唯一吗？连续吗？按生成顺序是递增的吗？',
        insight:'18 个 ID 全部唯一；相邻两个 ID 相差 400 多万到 800 多万，并不连续；M-B 用的时间戳总比刚刚 M-A 用的小 2 ms，它每次发出的 ID 都比前一个小，按生成顺序出现 6 次「变小」。Snowflake 只保证大致按时间有序，跨机器的时钟偏差会打乱先后。',
        async run(){await prepare({skewB:-2});await ticks(6,1100);await ctx.wait(600)}},
    ]);
  }
});
})();
