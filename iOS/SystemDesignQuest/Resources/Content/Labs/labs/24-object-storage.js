/* 第 24 章：S3 类对象存储。实验一对比 8+4 纠删码与三副本的容错和空间；实验二演示上传的成功边界：孤儿对象、GC 与旧元数据缓存。 */
(function(){
const {el:h,util}=SDLab;
const catchAbort=e=>{if(!(e&&e.abort))console.error('[SDLab]',e)};

/* ---------------- 实验一：8+4 纠删码与三副本 ---------------- */
SDLab.define({
  id:'erasure-coding',chapter:24,
  title:'8+4 纠删码与三副本的容错和空间',
  summary:'同一个 800 MB 对象，分别按三副本和 8+4 纠删码放进 3 个机架、15 台节点。点节点让它宕机，或让整个机架断电，看剩下的副本或分片够不够恢复，以及两种方案各占多少空间。',
  caveat:'假设 8+4 使用 MDS 编码（例如 Reed–Solomon），任意 8 个有效分片可恢复；宕机都是已定位的缺失，静默损坏需先由校验和发现。空间只算数据与校验字节，不含元数据、对齐填充和修复时的临时空间；修复流程与耐久性「几个九」没有模拟。',
  mount(ctx){
    ctx.css('ec',`
.ec-racks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.ec-rack{border:1px solid #dbe2da;border-radius:10px;background:#fbfcfa;padding:6px;display:flex;flex-direction:column;gap:5px;min-width:0;transition:background .2s}
.ec-rack.off{background:#fbeceb;border-color:#e3aaa4}
.ec-rack>button.rk{font-size:12px;padding:3px 6px;font-weight:650}
.ec-node{display:flex;flex-wrap:wrap;align-items:center;gap:3px 5px;text-align:left;padding:4px 7px!important;min-height:38px;border-radius:8px!important;background:#fff}
.ec-node .nid{font-size:12px;color:#66756d;font-family:ui-monospace,Menlo,monospace;min-width:24px}
.ec-node.down{background:#f7dedb!important;border-color:#c2413b!important}
.ec-node.down .nid{color:#9b2c27;text-decoration:line-through}
.ec-node.down .ec-chip{opacity:.4;text-decoration:line-through}
.ec-chip{font-size:12px;font-weight:650;border-radius:5px;padding:0 5px;line-height:1.6}
.ec-chip.d{background:#dde9f6;color:#24558a}.ec-chip.p{background:#ece4f6;color:#5b3f96}.ec-chip.r{background:#d6eeee;color:#176868}
.ec-cards{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:10px;margin-top:10px}
.ec-one .ec-cards{grid-template-columns:minmax(0,1fr)}
.ec-card{border:1px solid #dbe2da;border-radius:10px;padding:8px 10px;min-width:0}
.ec-card.lost{border-color:#c2413b;box-shadow:inset 0 0 0 1px #c2413b}
.ec-h{margin:0 0 6px;font-size:13px;font-weight:700;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.ec-slots{display:grid;gap:4px}
.ec-slot{border-radius:6px;text-align:center;font-size:12px;font-weight:650;line-height:1.3;padding:5px 0;border:2px solid transparent;position:relative;font-variant-numeric:tabular-nums}
.ec-slot small{display:block;font-weight:400;font-size:11px;opacity:.85}
.ec-slot.d{background:#dde9f6;color:#24558a}.ec-slot.p{background:#ece4f6;color:#5b3f96}.ec-slot.r{background:#d6eeee;color:#176868}
.ec-slot.use{border-color:#23352f}
.ec-slot.dead{background:#f7dedb;color:#9b2c27;text-decoration:line-through}
.ec-verdict{font-size:13px;margin:8px 0 0;line-height:1.5}
.ec-verdict.ok{color:#1d6a41}.ec-verdict.warn{color:#86561a}.ec-verdict.bad{color:#9b2c27;font-weight:650}
.ec-space{border:1px solid #dbe2da;border-radius:10px;padding:8px 10px;margin-top:10px}
.ec-srow{margin:4px 0 8px}
.ec-slab{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px;color:#66756d;margin-bottom:3px}
.ec-slab b{color:#23352f}
.ec-sbar{display:flex;height:22px;border-radius:6px;background:#f0f4ed;overflow:hidden}
.ec-tight .ec-slots.ec12{grid-template-columns:repeat(6,minmax(0,1fr))!important}
.ec-seg{height:100%;width:0;transition:width .5s ease;border-right:1px solid #fff;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;overflow:hidden;white-space:nowrap}
`);
    const CH=['D1','D2','D3','D4','D5','D6','D7','D8','P1','P2','P3','P4'];
    const PLACE={
      spread:{1:'D1',2:'D4',3:'D7',4:'P1',6:'D2',7:'D5',8:'D8',9:'P2',11:'D3',12:'D6',13:'P3',14:'P4'},
      packed:{1:'D1',2:'D2',3:'D3',4:'D4',5:'D5',6:'D6',7:'D7',8:'D8',9:'P1',11:'P2',12:'P3',13:'P4'},
    };
    const REPL={1:1,6:2,11:3};
    const RACKS=[['A',[1,2,3,4,5]],['B',[6,7,8,9,10]],['C',[11,12,13,14,15]]];
    const rackOf=n=>RACKS.find(r=>r[1].includes(n))[0];
    let place='spread',down=new Set(),rng=util.rng(24);
    const nodeOf=c=>+Object.keys(PLACE[place]).find(k=>PLACE[place][k]===c);

    /* ---- 舞台 ---- */
    const racksBox=h('div',{class:'ec-racks'});
    const nodeBtns={},rackBtns={},rackEls={};
    for(const [r,ns] of RACKS){
      const rb=h('button',{type:'button',class:'rk',onclick:()=>toggleRack(r)},`机架 ${r} 断电`);rackBtns[r]=rb;
      const col=h('div',{class:'ec-rack'},rb);rackEls[r]=col;
      for(const n of ns){const b=h('button',{type:'button',class:'ec-node',onclick:()=>toggleNode(n)});nodeBtns[n]=b;col.append(b)}
      racksBox.append(col);
    }
    const repCard=h('div',{class:'ec-card'}),ecCard=h('div',{class:'ec-card'});
    const repSlots=h('div',{class:'ec-slots',style:{gridTemplateColumns:'repeat(3,minmax(0,1fr))'}}),ecSlots=h('div',{class:'ec-slots ec12',style:{gridTemplateColumns:'repeat(12,minmax(0,1fr))'}});
    const repHead=h('p',{class:'ec-h'}),ecHead=h('p',{class:'ec-h'}),repV=h('p',{class:'ec-verdict'}),ecV=h('p',{class:'ec-verdict'});
    repCard.append(repHead,repSlots,repV);ecCard.append(ecHead,ecSlots,ecV);
    const seg=(w,bg,txt)=>h('div',{class:'ec-seg',style:{background:bg},'data-w':w},txt||'');
    const repBar=h('div',{class:'ec-sbar'},[1,2,3].map(i=>seg(800,i%2?'#1f8a8a':'#26a0a0','副本 '+i)));
    const ecBar=h('div',{class:'ec-sbar'},CH.map(c=>seg(100,c[0]==='D'?'#2f6fb3':'#7b5cb8','')));
    const space=h('div',{class:'ec-space'},h('p',{class:'ec-h'},'800 MB 对象的总占用（同一刻度）'),
      h('div',{class:'ec-srow'},h('div',{class:'ec-slab'},h('span',null,h('b',null,'三副本'),' 3 × 800 MB'),h('span',{class:'rv'},'')),repBar),
      h('div',{class:'ec-srow'},h('div',{class:'ec-slab'},h('span',null,h('b',null,'8+4'),' 8 片数据 + 4 片校验，每片 100 MB'),h('span',{class:'ev'},'')),ecBar));
    const wrap=h('div',null,racksBox,h('div',{class:'ec-cards'},repCard,ecCard),space);
    ctx.stage.append(wrap);
    ctx.onResize(w=>{wrap.classList.toggle('ec-one',w<640);wrap.classList.toggle('ec-tight',w<480)});
    const stats=ctx.stats([{key:'down',label:'宕机节点'},{key:'rep',label:'三副本'},{key:'ec',label:'8+4 纠删码'},{key:'sp',label:'占用：三副本 / 8+4'}]);

    /* ---- 控件 ---- */
    const placeCtl=ctx.segmented({label:'8+4 分片放置',value:place,wide:true,options:[['spread','分散：每个机架 4 片'],['packed','集中：机架 A 5 片、B 4 片、C 3 片']],onChange:v=>{place=v;ctx.log(v==='spread'?'改为分散放置（4/4/4）':'改为集中放置（5/4/3）','info');draw()}});
    ctx.button('随机坏一台',()=>{const up=Object.keys(PLACE[place]).map(Number).filter(n=>!down.has(n));if(up.length)toggleNode(up[Math.floor(rng()*up.length)])},{primary:true});
    ctx.button('全部恢复',()=>{down.clear();ctx.log('所有节点恢复','ok');draw()});

    function toggleNode(n,silent){
      if(down.has(n))down.delete(n);else down.add(n);
      if(!silent){const c=PLACE[place][n],r=REPL[n];ctx.log(`N${n}（机架 ${rackOf(n)}）${down.has(n)?'宕机':'恢复'}`+(c||r?`：${[c,r?'副本 '+r:null].filter(Boolean).join('、')}`:'：没有这个对象的数据'),down.has(n)?'bad':'ok')}
      draw();
    }
    function toggleRack(r,silent){
      const ns=RACKS.find(x=>x[0]===r)[1],allDown=ns.every(n=>down.has(n));
      for(const n of ns)allDown?down.delete(n):down.add(n);
      if(!silent)ctx.log(`机架 ${r} ${allDown?'恢复供电':'断电'}：${ns.map(n=>'N'+n).join('、')} ${allDown?'恢复':'全部宕机'}`,allDown?'ok':'bad');
      draw();
    }
    function evalEC(){
      const alive=CH.filter(c=>!down.has(nodeOf(c)));
      const aliveD=alive.filter(c=>c[0]==='D'),missD=CH.slice(0,8).filter(c=>!alive.includes(c));
      const useP=alive.filter(c=>c[0]==='P').slice(0,Math.max(0,8-aliveD.length));
      return {alive,aliveD,missD,useP,ok:alive.length>=8,use:alive.length>=8?[...aliveD,...useP]:[]};
    }
    function evalRep(){const alive=[1,6,11].filter(n=>!down.has(n));return {alive,ok:alive.length>0}}
    function draw(){
      for(const [r,ns] of RACKS){
        const all=ns.every(n=>down.has(n));rackEls[r].classList.toggle('off',all);rackBtns[r].textContent=all?`机架 ${r} 恢复供电`:`机架 ${r} 断电`;
        for(const n of ns){
          const b=nodeBtns[n],c=PLACE[place][n],rp=REPL[n],d=down.has(n);
          b.className='ec-node'+(d?' down':'');b.setAttribute('aria-pressed',String(d));
          b.setAttribute('aria-label',`节点 N${n}，机架 ${r}${c?'，分片 '+c:''}${rp?'，副本 '+rp:''}，${d?'宕机':'正常'}，点击切换`);
          b.replaceChildren(...[h('span',{class:'nid'},'N'+n),c?h('span',{class:'ec-chip '+(c[0]==='D'?'d':'p')},c):null,rp?h('span',{class:'ec-chip r'},'副本 '+rp):null].filter(Boolean));
        }
      }
      const R=evalRep(),E=evalEC();
      repHead.replaceChildren(h('span',null,'三副本'),h('span',{class:'sdl-tag '+(R.ok?(R.alive.length<3?'warn':'ok'):'bad')},`有效 ${R.alive.length} / 3`));
      repSlots.replaceChildren(...[1,6,11].map((n,i)=>{const d=down.has(n),use=!d&&n===R.alive[0];return h('div',{class:'ec-slot r'+(d?' dead':'')+(use?' use':'')},'副本 '+(i+1),h('small',null,`N${n} · 机架 ${rackOf(n)}`))}));
      repCard.classList.toggle('lost',!R.ok);
      repV.className='ec-verdict '+(R.ok?(R.alive.length<3?'warn':'ok'):'bad');
      repV.textContent=R.ok?`读任意 1 份完整副本即可（黑框）。${R.alive.length<3?`已丢 ${3-R.alive.length} 份，`+(R.alive.length>1?'还能再丢 1 份。':'再丢 1 份就丢数据。'):'任意丢 2 份仍可读。'}`:'3 份副本全部宕机：数据丢失。';
      ecHead.replaceChildren(h('span',null,'8+4 纠删码'),h('span',{class:'sdl-tag '+(E.ok?(E.alive.length<12?'warn':'ok'):'bad')},`有效 ${E.alive.length} / 12 · 至少 8`));
      ecSlots.replaceChildren(...CH.map(c=>{const n=nodeOf(c),d=down.has(n),use=E.use.includes(c);return h('div',{class:'ec-slot '+(c[0]==='D'?'d':'p')+(d?' dead':'')+(use?' use':''),title:`${c} 在 N${n}`},c,h('small',null,'N'+n))}));
      ecCard.classList.toggle('lost',!E.ok);
      ecV.className='ec-verdict '+(E.ok?(E.alive.length<12?'warn':'ok'):'bad');
      ecV.textContent=!E.ok?`只剩 ${E.alive.length} 片，少于 8 片：不可恢复。`
        :E.missD.length?`缺 ${E.missD.join('、')}：读黑框里的 8 片，用 ${E.useP.join('、')} 解码补回。${E.alive.length>8?`还能再丢 ${E.alive.length-8} 片。`:'已没有余量，再丢 1 片就不可恢复。'}`
        :`8 个数据分片都在，直接读 D1–D8（黑框），不用解码。${E.alive.length<12?(E.alive.length>8?`还能再丢 ${E.alive.length-8} 片。`:'已没有余量。'):'任意丢 4 片仍可恢复。'}`;
      stats.set('down',down.size+' 台',down.size?'warn':null);
      stats.set('rep',R.ok?'可读':'丢失',R.ok?'ok':'bad');
      stats.set('ec',E.ok?(E.missD.length?'需解码':'可直接读'):'不可恢复',E.ok?'ok':'bad');
      stats.set('sp','2400 / 1200 MB','info');
      ctx.announce(`三副本${R.ok?'可读':'丢失'}，8+4 有效 ${E.alive.length} 片，${E.ok?'可恢复':'不可恢复'}`);
    }
    function showSpace(parts){
      const segs=[...repBar.children,...ecBar.children];
      segs.forEach((s,i)=>{s.style.width=(i<parts?(+s.dataset.w/2400*100):0)+'%'});
      space.querySelector('.rv').textContent=parts>=3?'2400 MB · 3 倍 · 额外 200%':'';
      space.querySelector('.ev').textContent=parts>=15?'1200 MB · 12/8 = 1.5 倍 · 额外 50%':parts>=11?'800 MB：8 片数据':'';
    }
    draw();showSpace(15);

    /* ---- 预设场景 ---- */
    function prepare(p){place=p;placeCtl.set(p,true);down.clear();ctx.clearLog();ctx.openLog(true);showSpace(15);draw()}
    const kill=async(ns,ms=1100)=>{for(const n of ns){toggleNode(n);await ctx.wait(ms)}};
    ctx.scenarios([
      {id:'four-five',label:'坏 4 台，再坏第 5 台',
        ask:'12 个分片分散在 12 台节点上。依次宕机 N7、N6、N13、N2 四台（其中 N6 还放着副本 2），对象还能读吗？再坏第 5 台 N12 呢？',
        insight:'坏 4 台后剩 8 片：D2、D4、D5 缺了，要用剩下的 P1、P2、P4 解码补回，仍能恢复，只是已经没有余量。第 5 台宕机只剩 7 片，不可恢复。三副本这时还剩 2 份：它能容忍任意 2 份丢失，前提是付出 3 倍空间；8+4 能容忍任意 4 片丢失，空间只要 1.5 倍。',
        async run(){prepare('spread');await ctx.wait(600);await kill([7,6,13,2]);await ctx.wait(700);await kill([12],600)}},
      {id:'space',label:'800 MB 占多少空间',
        ask:'800 MB 的对象，三副本总共占多少？8+4 占多少？8+4 的「额外开销」是 150% 吗？',
        insight:'三副本 3 × 800 = 2400 MB，总量 3 倍，额外 200%。8+4 先切成 8 片各 100 MB，再算出 4 片同样大小的校验：总量 1200 MB，12/8 = 1.5 倍，额外开销是 4/8 = 50%，不是 150%；总占用是三副本的一半。实际还要加元数据、校验和与对齐填充。',
        async run(){prepare('spread');showSpace(0);await ctx.wait(700);for(let i=1;i<=3;i++){showSpace(i);await ctx.wait(900)}for(let i=4;i<=11;i++){showSpace(i);await ctx.wait(220)}await ctx.wait(900);for(let i=12;i<=15;i++){showSpace(i);await ctx.wait(450)}await ctx.wait(600)}},
      {id:'domain',label:'5 片挤在一个机架',
        ask:'有人把 12 片中的 5 片放在机架 A（B 放 4 片、C 放 3 片）。机架 A 断电一次，对象还能恢复吗？按每个机架 4 片分散放置呢？',
        insight:'集中放置时，机架 A 一次断电带走 5 片，只剩 7 片，不可恢复：「最多容忍 4 片」说的是任意 4 个已定位的缺失分片，不是任意一次故障。按 4/4/4 分散后，同样断电还剩 8 片，刚好能解码，但已没有余量，再坏一台就丢数据。三副本每个机架放一份，断一个机架还剩 2 份。',
        async run(){prepare('packed');await ctx.wait(700);toggleRack('A');await ctx.wait(2600);toggleRack('A');place='spread';placeCtl.set('spread',true);ctx.log('改为分散放置（4/4/4）','info');draw();await ctx.wait(1300);toggleRack('A');await ctx.wait(1500)}},
      {id:'replicas',label:'三副本的节点一起坏',
        ask:'三份副本分别在 N1、N6、N11（每个机架一台）。如果恰好这三台同时宕机，三副本还能读吗？8+4 呢？',
        insight:'三副本全部丢失；8+4 只丢了 D1、D2、D3 三片，还剩 9 片，用 P1、P2、P3 解码即可恢复，还能再丢 1 片。副本数和分片数都只是空间换容错的方式，关键是一次相关故障会同时带走多少份。',
        async run(){prepare('spread');await ctx.wait(600);await kill([1,6,11],1200);await ctx.wait(400)}},
    ]);
  }
});

/* ---------------- 实验二：上传的成功边界 ---------------- */
SDLab.define({
  id:'object-commit',chapter:24,
  title:'孤儿对象、GC 与旧元数据缓存',
  summary:'PUT photo.jpg 先把新对象的字节写到三个数据节点，再把「photo.jpg → 对象 ID」提交到元数据库。逐步看提交超时后留下了什么、GC 什么时候才能删，以及三份新字节为什么挡不住旧的元数据缓存。',
  caveat:'桶已开启版本管理，旧版本 O1 一直保留。数据写入按「三副本都持久化才算写成」简化；GC 宽限期设为 24 小时；API 节点 2 的元数据缓存 TTL 设为 60 秒。每一步代表一次网络往返或一次元数据库操作。',
  mount(ctx){
    ctx.css('oc',`
.oc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.oc-one .oc-grid{grid-template-columns:minmax(0,1fr)}
.oc-p{border:1px solid #dbe2da;border-radius:10px;background:#fbfcfa;padding:8px 10px;min-width:0;font-size:13px;transition:box-shadow .25s}
.oc-p.hot{box-shadow:0 0 0 2px #c2413b}.oc-p.good{box-shadow:0 0 0 2px #2f8f5b}.oc-p.act{box-shadow:0 0 0 2px #2f6fb3}
.oc-h{margin:0 0 6px;font-size:13px;font-weight:700;display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap}
.oc-h small{font-weight:400;color:#66756d;font-size:12px}
.oc-line{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;margin:3px 0;line-height:1.5}
.oc-mono{font-family:ui-monospace,Menlo,monospace;font-size:12px}
.oc-nodes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;grid-column:1/-1}
.oc-node{border:1px solid #e3e9e1;border-radius:8px;background:#fff;padding:6px 8px;min-height:62px}
.oc-node .nid{font-size:12px;color:#66756d;margin-bottom:3px}
.oc-objs{display:flex;flex-wrap:wrap;gap:4px}
.oc-obj{font-size:12px;font-weight:650;border-radius:5px;padding:0 6px;line-height:1.7;border:1.5px solid transparent;font-family:ui-monospace,Menlo,monospace}
.oc-obj.old{background:#e6eee2;color:#3c5a4b}
.oc-obj.cur{background:#dcefe2;color:#1d6a41;border-color:#2f8f5b}
.oc-obj.writing{background:#dde9f6;color:#24558a;border-style:dashed;border-color:#2f6fb3}
.oc-obj.pending{background:#dde9f6;color:#24558a}
.oc-obj.orphan{background:#f6ead2;color:#86561a;border-style:dashed;border-color:#b7791f}
.oc-obj.gone{background:#fff;color:#b4beb7;text-decoration:line-through;border-color:#e3e9e1}
.oc-seq{border:1px solid #dbe2da;border-radius:10px;background:#fbfcfa;margin-top:10px;overflow:hidden;font-size:13px}
.oc-ev{display:grid;grid-template-columns:86px 128px minmax(0,1fr);gap:8px;padding:5px 10px;border-top:1px solid #eef2ec;align-items:baseline;line-height:1.45}
.oc-ev:first-child{border-top:0}
.oc-ev .t{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#66756d}
.oc-ev .ln{font-size:12px;color:#66756d;white-space:nowrap}
.oc-ev.ok .x{color:#1d6a41}.oc-ev.bad .x{color:#9b2c27}.oc-ev.warn .x{color:#86561a}.oc-ev.info .x{color:#24558a}
.oc-ev.last{background:#fff7dd}
.oc-narrow .oc-ev{grid-template-columns:auto minmax(0,1fr);gap:0 8px}
.oc-narrow .oc-ev .x{grid-column:1/-1}
`);
    const GRACE=24*3600*1000,TTL=60000,STEP=580;
    let S,commitMode='ok',onTimeout='verify',trust=true,gen=0,busy=false;
    const fresh=()=>({t:0,next:9,versions:[{v:1,obj:'O1'}],uploads:{},objs:{O1:{st:'old',nodes:[1,1,1]}},cache2:{obj:'O1',until:TTL},gc:{},seq:[],hl:{},lastPut:null});
    S=fresh();

    /* ---- 舞台 ---- */
    const clock=h('span',{class:'oc-mono',style:{color:'#2f6fb3',fontWeight:'650'}});
    const pApi1=h('div',{class:'oc-p'}),pApi2=h('div',{class:'oc-p'}),pMeta=h('div',{class:'oc-p'}),pGc=h('div',{class:'oc-p'});
    const nodeEls=[1,2,3].map(i=>{const objs=h('div',{class:'oc-objs'});const el=h('div',{class:'oc-node'},h('div',{class:'nid'},`数据节点 N${i}`),objs);el.objs=objs;return el});
    const pData=h('div',{class:'oc-p',style:{gridColumn:'1/-1'}},h('p',{class:'oc-h'},h('span',null,'数据存储（三副本）'),h('small',null,'绿框 = 最新版本；蓝 = 还没有元数据引用；琥珀 = 孤儿候选；删除线 = 字节已删')),h('div',{class:'oc-nodes'},nodeEls));
    const seqBox=h('div',{class:'oc-seq',role:'log','aria-label':'请求时序'});
    const wrap=h('div',null,h('div',{class:'sdl-note',style:{margin:'0 0 8px',display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:'6px'}},h('span',null,'桶 photos（已开启版本管理）· key = photo.jpg'),h('span',null,'模拟时钟 ',clock)),
      h('div',{class:'oc-grid'},pApi1,pApi2,pMeta,pGc,pData),seqBox);
    ctx.stage.append(wrap);
    ctx.onResize(w=>{wrap.classList.toggle('oc-one',w<600);wrap.classList.toggle('oc-narrow',w<560)});
    const stats=ctx.stats([{key:'cur',label:'photo.jpg 最新版本'},{key:'orphan',label:'孤儿候选'},{key:'get',label:'上次 GET 读到'},{key:'bad',label:'坏引用'}]);

    /* ---- 控件 ---- */
    const commitCtl=ctx.segmented({label:'元数据提交的真实结果',value:commitMode,wide:true,options:[['ok','成功并正常返回'],['lostc','已提交，但响应丢失（超时）'],['lostr','连接断开，事务回滚（超时）']],onChange:v=>{commitMode=v}});
    const toCtl=ctx.segmented({label:'超时后 API 怎么做',value:onTimeout,options:[['verify','按 upload_id 查证'],['delete','当作失败，立即删字节']],onChange:v=>{onTimeout=v}});
    const trustCtl=ctx.toggle({label:'API 节点 2 命中缓存时直接使用（不确认版本）',value:trust,onChange:v=>{trust=v;render()}});
    const putBtn=ctx.button('PUT photo.jpg（新上传）',()=>free(()=>put()),{primary:true});
    const getBtn=ctx.button('客户端 B：GET photo.jpg',()=>free(()=>get()));
    const gcBtn=ctx.button('GC 扫描',()=>free(()=>gcScan()));
    const ffBtn=ctx.button('快进 24 小时',()=>free(()=>ff()));
    const btns=[putBtn,getBtn,gcBtn,ffBtn];

    /* ---- 渲染 ---- */
    const fmtT=t=>t<120000?'+'+(t/1000).toFixed(2)+' 秒':'+'+(t/3600000).toFixed(1)+' 小时';
    const latest=()=>S.versions[S.versions.length-1];
    const refOf=o=>S.versions.some(v=>v.obj===o);
    const activeUp=o=>Object.values(S.uploads).some(u=>u.obj===o&&['writing','committing','uncertain'].includes(u.st));
    function say(lane,text,tone){S.seq.push({t:S.t,lane,text,tone});if(S.seq.length>60)S.seq.shift();renderSeq()}
    function renderSeq(){
      const list=S.seq.slice(-7);
      seqBox.replaceChildren(...list.map((e,i)=>h('div',{class:'oc-ev'+(e.tone?' '+e.tone:'')+(busy&&i===list.length-1?' last':'')},h('span',{class:'t'},fmtT(e.t)),h('span',{class:'ln'},e.lane),h('span',{class:'x'},e.text))));
      if(!list.length)seqBox.append(h('div',{class:'oc-ev'},h('span',{class:'t'},fmtT(S.t)),h('span',{class:'ln'},'提示'),h('span',{class:'x'},'选好「元数据提交的真实结果」，点「PUT photo.jpg」；或运行上方的预设场景。')));
    }
    function chip(o){
      const x=S.objs[o];let c='old',t=o;
      if(x.st==='gone')c='gone';else if(S.gc[o])c='orphan';else if(latest().obj===o)c='cur';else if(x.st==='writing')c='writing';else if(!refOf(o))c='pending';
      return h('span',{class:'oc-obj '+c},t);
    }
    function render(){
      clock.textContent=fmtT(S.t);
      const L=latest(),up=S.lastPut&&S.uploads[S.lastPut];
      const UPST={writing:['写字节中','info'],committing:['提交元数据中','info'],uncertain:['结果未知（超时）','warn'],committed:['已提交','ok'],rolledback:['未提交（已回滚）','warn'],abandoned:['未提交，已放弃','warn']};
      pApi1.className='oc-p'+(S.hl.api1?' '+S.hl.api1:'');
      pApi1.replaceChildren(h('p',{class:'oc-h'},h('span',null,'API 节点 1'),h('small',null,'处理 PUT')),
        up?h('div',{class:'oc-line'},h('span',{class:'oc-mono'},`${S.lastPut} → ${up.obj}`),h('span',{class:'sdl-tag '+UPST[up.st][1]},UPST[up.st][0])):h('div',{class:'oc-line sdl-note'},'还没有上传'));
      const c=S.cache2&&S.t<S.cache2.until?S.cache2:null;
      pApi2.className='oc-p'+(S.hl.api2?' '+S.hl.api2:'');
      pApi2.replaceChildren(h('p',{class:'oc-h'},h('span',null,'API 节点 2'),h('small',null,trust?'命中缓存直接用':'读前向元数据确认版本')),
        h('div',{class:'oc-line'},'元数据缓存：',c?h('span',{class:'oc-mono'},`photo.jpg → ${c.obj}`):h('span',{class:'sdl-note'},'空'),c?h('span',{class:'sdl-tag '+(c.obj===L.obj?'':'warn')},c.obj===L.obj?`TTL 剩 ${Math.max(0,Math.ceil((c.until-S.t)/1000))} 秒`:`旧值 · TTL 剩 ${Math.max(0,Math.ceil((c.until-S.t)/1000))} 秒`):null));
      pMeta.className='oc-p'+(S.hl.meta?' '+S.hl.meta:'');
      pMeta.replaceChildren(h('p',{class:'oc-h'},h('span',null,'元数据库'),h('small',null,'bucket/key/版本 → 对象 ID')),
        ...S.versions.slice().reverse().map(v=>h('div',{class:'oc-line'},h('span',{class:'oc-mono'},`photo.jpg v${v.v} → ${v.obj}`),v===L?h('span',{class:'sdl-tag ok'},'最新'):h('span',{class:'sdl-tag'},'旧版本，保留'),S.objs[v.obj].st==='gone'?h('span',{class:'sdl-tag bad'},'字节已删：坏引用'):null)));
      pGc.className='oc-p'+(S.hl.gc?' '+S.hl.gc:'');
      const cands=Object.entries(S.gc);
      pGc.replaceChildren(h('p',{class:'oc-h'},h('span',null,'垃圾回收 GC'),h('small',null,'宽限期 24 小时')),
        cands.length?cands.map(([o,g])=>h('div',{class:'oc-line'},h('span',{class:'oc-mono'},o),h('span',{class:'sdl-tag warn'},S.t>=g.until?'宽限期已过，待复核':`候选，宽限期剩 ${((g.until-S.t)/3600000).toFixed(1)} 小时`))):h('div',{class:'oc-line sdl-note'},'没有候选'));
      for(let i=0;i<3;i++){nodeEls[i].objs.replaceChildren(...Object.keys(S.objs).filter(o=>S.objs[o].nodes[i]).map(chip))}
      stats.set('cur',`v${L.v} → ${L.obj}`,'info');
      stats.set('orphan',cands.length,cands.length?'warn':null);
      const bad=S.versions.filter(v=>S.objs[v.obj].st==='gone').length;
      stats.set('bad',bad,bad?'bad':'ok');
      for(const b of btns)b.disabled=busy;
    }
    function setGet(txt,tone){stats.set('get',txt,tone)}

    /* ---- 动作 ---- */
    const step=(ms=STEP,dt=40)=>{S.t+=dt;render();return ctx.wait(ms)};
    async function put(){
      const n=S.next++,U='U'+n,O='O'+n;S.lastPut=U;
      S.uploads[U]={obj:O,st:'writing'};S.objs[O]={st:'writing',nodes:[0,0,0]};
      S.hl={api1:'act'};say('客户端 A → API 1',`PUT photo.jpg（upload_id ${U}，新对象 ${O}）`);await step();
      for(let i=0;i<3;i++){S.objs[O].nodes[i]=1;say('API 1 → 数据节点',`${O} 写入 N${i+1}`+(i===2?'：三副本都已持久化':''),i===2?'ok':null);await step(480,15)}
      S.objs[O].st='durable';S.uploads[U].st='committing';S.hl={api1:'act',meta:'act'};
      say('API 1 → 元数据库',`BEGIN；photo.jpg 新版本 → ${O}；COMMIT`);await step();
      const mode=commitMode;
      if(mode==='ok'){
        S.versions.push({v:latest().v+1,obj:O});S.uploads[U].st='committed';S.hl={meta:'good'};
        say('元数据库',`已提交：photo.jpg v${latest().v} → ${O}`,'ok');await step();
        say('API 1 → 客户端 A','200 上传成功','ok');await step(400,20);S.hl={};render();return;
      }
      if(mode==='lostc'){S.versions.push({v:latest().v+1,obj:O})}
      S.uploads[U].st='uncertain';S.hl={api1:'hot',meta:mode==='lostc'?'good':''};
      say('元数据库',mode==='lostc'?`（其实已提交 photo.jpg v${latest().v} → ${O}，但响应在路上丢了）`:'（连接断开，事务被回滚）',mode==='lostc'?'info':'warn');await step(500,10);
      say('API 1',`等待 3 秒无响应：${U} 结果未知`,'warn');S.t+=3000;await step();
      if(onTimeout==='delete'){
        S.objs[O].st='gone';S.uploads[U].st=mode==='lostc'?'committed':'abandoned';S.hl={api1:'hot'};
        say('API 1 → 数据节点',`把超时当失败：立即删除 ${O} 的三份副本`,'bad');await step();
        if(mode==='lostc'){S.hl={meta:'hot'};say('元数据库',`photo.jpg v${latest().v} 仍指向 ${O}，字节却没了`,'bad');await step()}
        S.hl={};render();return;
      }
      S.hl={api1:'act',meta:'act'};say('API 1 → 元数据库',`按 upload_id ${U} 查提交记录`);await step();
      if(mode==='lostc'){S.uploads[U].st='committed';S.hl={meta:'good'};say('元数据库',`${U} 已提交：photo.jpg v${latest().v} → ${O}`,'ok');await step();say('API 1 → 客户端 A','200 上传成功（返回原结果，不重复提交）','ok');await step(400,20)}
      else{S.uploads[U].st='abandoned';S.hl={meta:'act'};say('元数据库',`${U} 未提交，photo.jpg 仍指向 ${latest().obj}`,'warn');await step();say('API 1 → 客户端 A',`500 上传失败；${O} 的字节留在数据节点上，没有任何引用`,'warn');await step(400,20)}
      S.hl={};render();
    }
    async function get(){
      S.hl={api2:'act'};say('客户端 B → API 2','GET photo.jpg');await step();
      const c=S.cache2&&S.t<S.cache2.until?S.cache2:null,L=latest();let obj;
      if(c&&trust){obj=c.obj;say('API 2',`命中缓存：photo.jpg → ${obj}`,obj===L.obj?null:'warn');await step(500,5)}
      else{S.hl={api2:'act',meta:'act'};obj=L.obj;S.cache2={obj,until:S.t+TTL};say('API 2 → 元数据库',c?`缓存有 ${c.obj}，先确认最新版本：${obj}`:`缓存为空，查到 photo.jpg → ${obj}`,'info');await step()}
      S.hl={api2:'act'};
      const x=S.objs[obj];
      if(x.st==='gone'){S.hl={api2:'hot',meta:'hot'};say('API 2 → 客户端 B',`元数据指向 ${obj}，三个数据节点都找不到：读取失败`,'bad');setGet(obj+'（失败）','bad')}
      else{const stale=obj!==L.obj;say('API 2 → 客户端 B',`读到 ${obj}`+(stale?`：旧对象。PUT 早已返回，最新是 ${L.obj}`:''),stale?'bad':'ok');setGet(obj+(stale?'（旧）':''),stale?'bad':'ok');if(stale)S.hl={api2:'hot'}}
      await step(500,10);render();
    }
    async function gcScan(){
      S.hl={gc:'act'};say('GC','扫描数据节点上的对象');await step();
      let did=false;
      for(const o of Object.keys(S.objs)){
        const x=S.objs[o];if(x.st==='gone')continue;
        const g=S.gc[o];
        if(refOf(o)||activeUp(o)){if(g){delete S.gc[o];say('GC',`${o} 又有了引用，取消候选`,'info');did=true}continue}
        if(!g){S.gc[o]={since:S.t,until:S.t+GRACE};say('GC',`${o} 没有元数据引用：先标为孤儿候选，24 小时后复核`,'warn');did=true}
        else if(S.t>=g.until){x.st='gone';delete S.gc[o];say('GC',`${o} 复核：无已提交版本、无活跃上传、无保留策略 → 删除三份副本`,'ok');did=true}
        else{say('GC',`${o} 仍在宽限期（剩 ${((g.until-S.t)/3600000).toFixed(1)} 小时），不删`,'info');did=true}
        await step(450,5);
      }
      if(!did){say('GC','所有对象都有引用，没有可回收的');await step(400,5)}
      S.hl={};render();
    }
    async function ff(){S.t+=GRACE;say('时钟','快进 24 小时（API 节点 2 的缓存早已过期）','info');S.cache2=null;await step(500,0);render()}

    function lock(v){busy=v;render();renderSeq()}
    async function guarded(fn){const g=++gen;lock(true);try{await fn()}finally{if(g===gen)lock(false)}}
    function free(fn){if(busy)return;guarded(fn).catch(catchAbort)}
    render();renderSeq();

    /* ---- 预设场景 ---- */
    function prepare(o={}){
      S=fresh();commitMode=o.commit||'ok';commitCtl.set(commitMode,true);onTimeout=o.to||'verify';toCtl.set(onTimeout,true);trust=o.trust!==false;trustCtl.set(trust,true);
      setGet('—',null);render();renderSeq();
    }
    ctx.scenarios([
      {id:'orphan',label:'提交超时，其实回滚了',
        ask:'O9 的三份字节已经写好，提交 photo.jpg → O9 时连接断开；按 U9 查证后确认事务回滚了。GC 第一次扫描发现 O9 没有任何引用，会立刻删掉它吗？',
        insight:'不会。O9 先被标成孤儿候选，24 小时宽限期过后再复核：没有已提交版本、没有活跃的上传、没有保留策略引用，才删掉三份副本。「这一刻查不到引用」不足以证明是垃圾，因为新上传本来就是先写字节、后发布元数据。整个过程中 photo.jpg 一直指向 O1，读者不受影响。',
        run:()=>guarded(async()=>{prepare({commit:'lostr'});await ctx.wait(400);await put();await gcScan();await ctx.wait(500);await ff();await gcScan();await ctx.wait(300)})},
      {id:'committed',label:'超时了，其实已提交',
        ask:'提交请求超时了，但元数据库其实已经把 photo.jpg 指向 O9，只是响应丢了。如果 API 把「超时」当成「失败」立即删掉 O9，客户端 B 随后 GET photo.jpg 会怎样？换成按 U9 查证呢？',
        insight:'立即删除后，GET 查到 photo.jpg → O9，三个数据节点却都没有 O9：一个看得见、读不出的坏引用，比暂时多一份孤儿危险得多。按 U9 查证时，元数据库答复「已提交」，API 保留 O9 并把原结果返回客户端，同一个 GET 读到 O9。超时只说明「结果未知」。',
        run:()=>guarded(async()=>{
          prepare({commit:'lostc',to:'delete',trust:false});await ctx.wait(400);await put();await get();await ctx.wait(1200);
          prepare({commit:'lostc',to:'verify',trust:false});say('提示','重来一次：这回超时后按 upload_id 查证','info');await ctx.wait(700);await put();await get();await ctx.wait(300);
        })},
      {id:'stale',label:'三份新字节，读到旧对象',
        ask:'O9 的三份副本和元数据都已提交，PUT 已向客户端 A 返回成功。之后客户端 B 才发起 GET photo.jpg，请求落到还缓存着 photo.jpg → O1 的 API 节点 2。它会读到哪个对象？',
        insight:'O1。O9 虽然有三份完整副本，这次读仍拿到旧值，违反「已完成的写之后开始的读，应看到该写或更新的值」。让 API 节点 2 读前向元数据确认版本后，同一个 GET 读到 O9。副本数回答「数据有几份」，读到哪一份历史取决于提交点、读路径和缓存规则。',
        run:()=>guarded(async()=>{
          prepare({commit:'ok',trust:true});await ctx.wait(400);await put();await get();await ctx.wait(1300);
          trust=false;trustCtl.set(false,true);say('提示','改成读前向元数据确认版本，再 GET 一次','info');render();await ctx.wait(700);await get();await ctx.wait(300);
        })},
    ]);
  }
});
})();
