/* Chapter 24: S3-like object storage. Lab 1 compares 8+4 erasure coding with 3 replicas for fault tolerance and space; lab 2 shows where an upload counts as successful: orphan objects, GC, and a stale metadata cache. */
(function(){
const {el:h,util}=SDLab;
const catchAbort=e=>{if(!(e&&e.abort))console.error('[SDLab]',e)};

/* ---------------- Lab 1: 8+4 erasure coding vs 3 replicas ---------------- */
SDLab.define({
  id:'erasure-coding',chapter:24,
  title:'Fault Tolerance and Space: 8+4 Erasure Coding vs 3 Replicas',
  summary:'The same 800 MB object is stored two ways across 3 racks and 15 nodes: as 3 replicas and with 8+4 erasure coding. Click a node to take it down, or cut power to a whole rack, and see whether the remaining replicas or shards are enough to recover, and how much space each scheme uses.',
  caveat:'Assumes 8+4 uses an MDS code (for example Reed–Solomon), so any 8 valid shards can recover the object. Every outage here is a known, located loss; silent corruption must first be found by a checksum. Space counts only data and parity bytes, not metadata, alignment padding, or temporary space during repair. The repair process and the “nines” of durability are not simulated.',
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

    /* ---- stage ---- */
    const racksBox=h('div',{class:'ec-racks'});
    const nodeBtns={},rackBtns={},rackEls={};
    for(const [r,ns] of RACKS){
      const rb=h('button',{type:'button',class:'rk',onclick:()=>toggleRack(r)},`Cut power to rack ${r}`);rackBtns[r]=rb;
      const col=h('div',{class:'ec-rack'},rb);rackEls[r]=col;
      for(const n of ns){const b=h('button',{type:'button',class:'ec-node',onclick:()=>toggleNode(n)});nodeBtns[n]=b;col.append(b)}
      racksBox.append(col);
    }
    const repCard=h('div',{class:'ec-card'}),ecCard=h('div',{class:'ec-card'});
    const repSlots=h('div',{class:'ec-slots',style:{gridTemplateColumns:'repeat(3,minmax(0,1fr))'}}),ecSlots=h('div',{class:'ec-slots ec12',style:{gridTemplateColumns:'repeat(12,minmax(0,1fr))'}});
    const repHead=h('p',{class:'ec-h'}),ecHead=h('p',{class:'ec-h'}),repV=h('p',{class:'ec-verdict'}),ecV=h('p',{class:'ec-verdict'});
    repCard.append(repHead,repSlots,repV);ecCard.append(ecHead,ecSlots,ecV);
    const seg=(w,bg,txt)=>h('div',{class:'ec-seg',style:{background:bg},'data-w':w},txt||'');
    const repBar=h('div',{class:'ec-sbar'},[1,2,3].map(i=>seg(800,i%2?'#1f8a8a':'#26a0a0','Replica '+i)));
    const ecBar=h('div',{class:'ec-sbar'},CH.map(c=>seg(100,c[0]==='D'?'#2f6fb3':'#7b5cb8','')));
    const space=h('div',{class:'ec-space'},h('p',{class:'ec-h'},'Total space for the 800 MB object (same scale)'),
      h('div',{class:'ec-srow'},h('div',{class:'ec-slab'},h('span',null,h('b',null,'3 replicas'),' 3 × 800 MB'),h('span',{class:'rv'},'')),repBar),
      h('div',{class:'ec-srow'},h('div',{class:'ec-slab'},h('span',null,h('b',null,'8+4'),' 8 data + 4 parity shards, 100 MB each'),h('span',{class:'ev'},'')),ecBar));
    const wrap=h('div',null,racksBox,h('div',{class:'ec-cards'},repCard,ecCard),space);
    ctx.stage.append(wrap);
    ctx.onResize(w=>{wrap.classList.toggle('ec-one',w<640);wrap.classList.toggle('ec-tight',w<480)});
    const stats=ctx.stats([{key:'down',label:'Nodes down'},{key:'rep',label:'3 replicas'},{key:'ec',label:'8+4 erasure coding'},{key:'sp',label:'Space: 3 replicas / 8+4'}]);

    /* ---- controls ---- */
    const placeCtl=ctx.segmented({label:'8+4 shard placement',value:place,wide:true,options:[['spread','Spread: 4 shards per rack'],['packed','Packed: 5 in rack A, 4 in B, 3 in C']],onChange:v=>{place=v;ctx.log(v==='spread'?'Switched to spread placement (4/4/4)':'Switched to packed placement (5/4/3)','info');draw()}});
    ctx.button('Fail a random node',()=>{const up=Object.keys(PLACE[place]).map(Number).filter(n=>!down.has(n));if(up.length)toggleNode(up[Math.floor(rng()*up.length)])},{primary:true});
    ctx.button('Restore all',()=>{down.clear();ctx.log('All nodes restored','ok');draw()});

    function toggleNode(n,silent){
      if(down.has(n))down.delete(n);else down.add(n);
      if(!silent){const c=PLACE[place][n],r=REPL[n];ctx.log(`N${n} (rack ${rackOf(n)}) ${down.has(n)?'went down':'recovered'}`+(c||r?`: ${[c,r?'replica '+r:null].filter(Boolean).join(', ')}`:': holds no data for this object'),down.has(n)?'bad':'ok')}
      draw();
    }
    function toggleRack(r,silent){
      const ns=RACKS.find(x=>x[0]===r)[1],allDown=ns.every(n=>down.has(n));
      for(const n of ns)allDown?down.delete(n):down.add(n);
      if(!silent)ctx.log(`Rack ${r} ${allDown?'power restored':'lost power'}: ${ns.map(n=>'N'+n).join(', ')} ${allDown?'back up':'all down'}`,allDown?'ok':'bad');
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
        const all=ns.every(n=>down.has(n));rackEls[r].classList.toggle('off',all);rackBtns[r].textContent=all?`Restore power to rack ${r}`:`Cut power to rack ${r}`;
        for(const n of ns){
          const b=nodeBtns[n],c=PLACE[place][n],rp=REPL[n],d=down.has(n);
          b.className='ec-node'+(d?' down':'');b.setAttribute('aria-pressed',String(d));
          b.setAttribute('aria-label',`Node N${n}, rack ${r}${c?', shard '+c:''}${rp?', replica '+rp:''}, ${d?'down':'up'}, click to toggle`);
          b.replaceChildren(...[h('span',{class:'nid'},'N'+n),c?h('span',{class:'ec-chip '+(c[0]==='D'?'d':'p')},c):null,rp?h('span',{class:'ec-chip r'},'Replica '+rp):null].filter(Boolean));
        }
      }
      const R=evalRep(),E=evalEC();
      repHead.replaceChildren(h('span',null,'3 replicas'),h('span',{class:'sdl-tag '+(R.ok?(R.alive.length<3?'warn':'ok'):'bad')},`${R.alive.length} of 3 alive`));
      repSlots.replaceChildren(...[1,6,11].map((n,i)=>{const d=down.has(n),use=!d&&n===R.alive[0];return h('div',{class:'ec-slot r'+(d?' dead':'')+(use?' use':'')},'Replica '+(i+1),h('small',null,`N${n} · rack ${rackOf(n)}`))}));
      repCard.classList.toggle('lost',!R.ok);
      repV.className='ec-verdict '+(R.ok?(R.alive.length<3?'warn':'ok'):'bad');
      repV.textContent=R.ok?`Read any 1 intact replica (black outline). ${R.alive.length<3?`${3-R.alive.length} lost. `+(R.alive.length>1?'One more can still fail.':'One more failure loses the data.'):'Any 2 can be lost and the data is still readable.'}`:'All 3 replicas are down: data lost.';
      ecHead.replaceChildren(h('span',null,'8+4 erasure coding'),h('span',{class:'sdl-tag '+(E.ok?(E.alive.length<12?'warn':'ok'):'bad')},`${E.alive.length} of 12 alive · need 8`));
      ecSlots.replaceChildren(...CH.map(c=>{const n=nodeOf(c),d=down.has(n),use=E.use.includes(c);return h('div',{class:'ec-slot '+(c[0]==='D'?'d':'p')+(d?' dead':'')+(use?' use':''),title:`${c} on N${n}`},c,h('small',null,'N'+n))}));
      ecCard.classList.toggle('lost',!E.ok);
      ecV.className='ec-verdict '+(E.ok?(E.alive.length<12?'warn':'ok'):'bad');
      ecV.textContent=!E.ok?`Only ${E.alive.length} shards left, fewer than 8: unrecoverable.`
        :E.missD.length?`${E.missD.join(', ')} missing: read the 8 shards in black outline and decode with ${E.useP.join(', ')} to rebuild them. ${E.alive.length>8?`Up to ${E.alive.length-8} more ${E.alive.length-8===1?'shard':'shards'} can be lost.`:'No margin left; losing 1 more shard makes it unrecoverable.'}`
        :`All 8 data shards are up: read D1–D8 (black outline) directly, no decoding. ${E.alive.length<12?(E.alive.length>8?`Up to ${E.alive.length-8} more ${E.alive.length-8===1?'shard':'shards'} can be lost.`:'No margin left.'):'Any 4 shards can be lost and the data is still recoverable.'}`;
      stats.set('down',down.size+(down.size===1?' node':' nodes'),down.size?'warn':null);
      stats.set('rep',R.ok?'Readable':'Lost',R.ok?'ok':'bad');
      stats.set('ec',E.ok?(E.missD.length?'Needs decoding':'Direct read'):'Unrecoverable',E.ok?'ok':'bad');
      stats.set('sp','2400 / 1200 MB','info');
      ctx.announce(`3 replicas ${R.ok?'readable':'lost'}, 8+4 has ${E.alive.length} shards alive, ${E.ok?'recoverable':'unrecoverable'}`);
    }
    function showSpace(parts){
      const segs=[...repBar.children,...ecBar.children];
      segs.forEach((s,i)=>{s.style.width=(i<parts?(+s.dataset.w/2400*100):0)+'%'});
      space.querySelector('.rv').textContent=parts>=3?'2400 MB · 3× · 200% extra':'';
      space.querySelector('.ev').textContent=parts>=15?'1200 MB · 12/8 = 1.5× · 50% extra':parts>=11?'800 MB: 8 data shards':'';
    }
    draw();showSpace(15);

    /* ---- preset scenarios ---- */
    function prepare(p){place=p;placeCtl.set(p,true);down.clear();ctx.clearLog();ctx.openLog(true);showSpace(15);draw()}
    const kill=async(ns,ms=1100)=>{for(const n of ns){toggleNode(n);await ctx.wait(ms)}};
    ctx.scenarios([
      {id:'four-five',label:'Lose 4 nodes, then a 5th',
        ask:'The 12 shards are spread across 12 nodes. N7, N6, N13, and N2 go down one after another (N6 also holds replica 2). Can the object still be read? What if a fifth node, N12, goes down too?',
        insight:'After 4 nodes go down, 8 shards remain: D2, D4, and D5 are missing and are rebuilt by decoding with the surviving P1, P2, and P4. The object is still recoverable, but there is no margin left. A fifth failure leaves only 7 shards, which is not recoverable. The 3 replicas still have 2 copies left at this point: they tolerate losing any 2 copies, at the price of 3 times the space, while 8+4 tolerates losing any 4 shards for only 1.5 times the space.',
        async run(){prepare('spread');await ctx.wait(600);await kill([7,6,13,2]);await ctx.wait(700);await kill([12],600)}},
      {id:'space',label:'How much space for 800 MB',
        ask:'How much space does an 800 MB object take with 3 replicas? With 8+4? Is the “extra overhead” of 8+4 equal to 150%?',
        insight:'Three replicas take 3 × 800 = 2400 MB: 3 times the original, or 200% extra. With 8+4, the object is first cut into 8 shards of 100 MB each, then 4 parity shards of the same size are computed. The total is 1200 MB, which is 12/8 = 1.5 times the original. The extra overhead is 4/8 = 50%, not 150%, and the total is half of what 3 replicas use. In practice you still add metadata, checksums, and alignment padding.',
        async run(){prepare('spread');showSpace(0);await ctx.wait(700);for(let i=1;i<=3;i++){showSpace(i);await ctx.wait(900)}for(let i=4;i<=11;i++){showSpace(i);await ctx.wait(220)}await ctx.wait(900);for(let i=12;i<=15;i++){showSpace(i);await ctx.wait(450)}await ctx.wait(600)}},
      {id:'domain',label:'5 shards in one rack',
        ask:'Someone puts 5 of the 12 shards in rack A (4 in rack B, 3 in rack C). If rack A loses power once, can the object still be recovered? What if the shards are spread 4 per rack?',
        insight:'With packed placement, one power loss in rack A takes out 5 shards, leaving 7, which is not recoverable. “Tolerates up to 4 shards” means any 4 located missing shards, not any single failure. Spread 4/4/4, the same power loss leaves 8 shards, just enough to decode but with no margin: one more node failure loses data. With 3 replicas and one copy per rack, losing a rack still leaves 2 copies.',
        async run(){prepare('packed');await ctx.wait(700);toggleRack('A');await ctx.wait(2600);toggleRack('A');place='spread';placeCtl.set('spread',true);ctx.log('Switched to spread placement (4/4/4)','info');draw();await ctx.wait(1300);toggleRack('A');await ctx.wait(1500)}},
      {id:'replicas',label:'All 3 replica nodes fail together',
        ask:'The three replicas sit on N1, N6, and N11 (one per rack). If exactly those three nodes go down at the same time, can the 3 replicas still be read? What about 8+4?',
        insight:'All 3 replicas are lost. 8+4 loses only the three shards D1, D2, and D3, leaving 9, which can be recovered by decoding with P1, P2, and P3, with room to lose 1 more shard. Replica count and shard count are both just ways to trade space for fault tolerance. What matters is how many pieces a single correlated failure takes out at once.',
        async run(){prepare('spread');await ctx.wait(600);await kill([1,6,11],1200);await ctx.wait(400)}},
    ]);
  }
});

/* ---------------- Lab 2: where an upload counts as successful ---------------- */
SDLab.define({
  id:'object-commit',chapter:24,
  title:'Orphan Objects, GC, and a Stale Metadata Cache',
  summary:'A PUT of photo.jpg first writes the new object’s bytes to three data nodes, then commits “photo.jpg → object ID” to the metadata DB. Step through what a commit timeout leaves behind, when GC may safely delete, and why three copies of the new bytes cannot stop a stale metadata cache.',
  caveat:'Versioning is on for the bucket, so the old version O1 is always kept. Data writes are simplified to “the write counts only once all three replicas are durable.” The GC grace period is 24 hours, and the metadata cache TTL on API node 2 is 60 seconds. Each step stands for one network round trip or one metadata DB operation.',
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

    /* ---- stage ---- */
    const clock=h('span',{class:'oc-mono',style:{color:'#2f6fb3',fontWeight:'650'}});
    const pApi1=h('div',{class:'oc-p'}),pApi2=h('div',{class:'oc-p'}),pMeta=h('div',{class:'oc-p'}),pGc=h('div',{class:'oc-p'});
    const nodeEls=[1,2,3].map(i=>{const objs=h('div',{class:'oc-objs'});const el=h('div',{class:'oc-node'},h('div',{class:'nid'},`Data node N${i}`),objs);el.objs=objs;return el});
    const pData=h('div',{class:'oc-p',style:{gridColumn:'1/-1'}},h('p',{class:'oc-h'},h('span',null,'Data store (3 replicas)'),h('small',null,'Green outline = latest version; blue = not yet referenced by metadata; amber = orphan candidate; strikethrough = bytes deleted')),h('div',{class:'oc-nodes'},nodeEls));
    const seqBox=h('div',{class:'oc-seq',role:'log','aria-label':'Request sequence'});
    const wrap=h('div',null,h('div',{class:'sdl-note',style:{margin:'0 0 8px',display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:'6px'}},h('span',null,'Bucket photos (versioning on) · key = photo.jpg'),h('span',null,'Simulated clock ',clock)),
      h('div',{class:'oc-grid'},pApi1,pApi2,pMeta,pGc,pData),seqBox);
    ctx.stage.append(wrap);
    ctx.onResize(w=>{wrap.classList.toggle('oc-one',w<600);wrap.classList.toggle('oc-narrow',w<560)});
    const stats=ctx.stats([{key:'cur',label:'Latest photo.jpg version'},{key:'orphan',label:'Orphan candidates'},{key:'get',label:'Last GET returned'},{key:'bad',label:'Broken references'}]);

    /* ---- controls ---- */
    const commitCtl=ctx.segmented({label:'Actual outcome of the metadata commit',value:commitMode,wide:true,options:[['ok','Succeeds and returns normally'],['lostc','Committed, but response lost (timeout)'],['lostr','Connection drops, rolled back (timeout)']],onChange:v=>{commitMode=v}});
    const toCtl=ctx.segmented({label:'What the API does after a timeout',value:onTimeout,options:[['verify','Verify by upload_id'],['delete','Treat as failed, delete bytes now']],onChange:v=>{onTimeout=v}});
    const trustCtl=ctx.toggle({label:'API node 2 uses a cache hit as is (no version check)',value:trust,onChange:v=>{trust=v;render()}});
    const putBtn=ctx.button('PUT photo.jpg (new upload)',()=>free(()=>put()),{primary:true});
    const getBtn=ctx.button('Client B: GET photo.jpg',()=>free(()=>get()));
    const gcBtn=ctx.button('Run GC scan',()=>free(()=>gcScan()));
    const ffBtn=ctx.button('Fast-forward 24 hours',()=>free(()=>ff()));
    const btns=[putBtn,getBtn,gcBtn,ffBtn];

    /* ---- rendering ---- */
    const fmtT=t=>t<120000?'+'+(t/1000).toFixed(2)+' s':'+'+(t/3600000).toFixed(1)+' h';
    const latest=()=>S.versions[S.versions.length-1];
    const refOf=o=>S.versions.some(v=>v.obj===o);
    const activeUp=o=>Object.values(S.uploads).some(u=>u.obj===o&&['writing','committing','uncertain'].includes(u.st));
    function say(lane,text,tone){S.seq.push({t:S.t,lane,text,tone});if(S.seq.length>60)S.seq.shift();renderSeq()}
    function renderSeq(){
      const list=S.seq.slice(-7);
      seqBox.replaceChildren(...list.map((e,i)=>h('div',{class:'oc-ev'+(e.tone?' '+e.tone:'')+(busy&&i===list.length-1?' last':'')},h('span',{class:'t'},fmtT(e.t)),h('span',{class:'ln'},e.lane),h('span',{class:'x'},e.text))));
      if(!list.length)seqBox.append(h('div',{class:'oc-ev'},h('span',{class:'t'},fmtT(S.t)),h('span',{class:'ln'},'Hint'),h('span',{class:'x'},'Pick the actual outcome of the metadata commit and click “PUT photo.jpg”, or run a preset scenario above.')));
    }
    function chip(o){
      const x=S.objs[o];let c='old',t=o;
      if(x.st==='gone')c='gone';else if(S.gc[o])c='orphan';else if(latest().obj===o)c='cur';else if(x.st==='writing')c='writing';else if(!refOf(o))c='pending';
      return h('span',{class:'oc-obj '+c},t);
    }
    function render(){
      clock.textContent=fmtT(S.t);
      const L=latest(),up=S.lastPut&&S.uploads[S.lastPut];
      const UPST={writing:['Writing bytes','info'],committing:['Committing metadata','info'],uncertain:['Outcome unknown (timeout)','warn'],committed:['Committed','ok'],rolledback:['Not committed (rolled back)','warn'],abandoned:['Not committed, abandoned','warn']};
      pApi1.className='oc-p'+(S.hl.api1?' '+S.hl.api1:'');
      pApi1.replaceChildren(h('p',{class:'oc-h'},h('span',null,'API node 1'),h('small',null,'Handles PUT')),
        up?h('div',{class:'oc-line'},h('span',{class:'oc-mono'},`${S.lastPut} → ${up.obj}`),h('span',{class:'sdl-tag '+UPST[up.st][1]},UPST[up.st][0])):h('div',{class:'oc-line sdl-note'},'No uploads yet'));
      const c=S.cache2&&S.t<S.cache2.until?S.cache2:null;
      pApi2.className='oc-p'+(S.hl.api2?' '+S.hl.api2:'');
      pApi2.replaceChildren(h('p',{class:'oc-h'},h('span',null,'API node 2'),h('small',null,trust?'Uses cache hits as is':'Checks the version with metadata before reading')),
        h('div',{class:'oc-line'},'Metadata cache: ',c?h('span',{class:'oc-mono'},`photo.jpg → ${c.obj}`):h('span',{class:'sdl-note'},'empty'),c?h('span',{class:'sdl-tag '+(c.obj===L.obj?'':'warn')},c.obj===L.obj?`TTL ${Math.max(0,Math.ceil((c.until-S.t)/1000))} s left`:`stale · TTL ${Math.max(0,Math.ceil((c.until-S.t)/1000))} s left`):null));
      pMeta.className='oc-p'+(S.hl.meta?' '+S.hl.meta:'');
      pMeta.replaceChildren(h('p',{class:'oc-h'},h('span',null,'Metadata DB'),h('small',null,'bucket/key/version → object ID')),
        ...S.versions.slice().reverse().map(v=>h('div',{class:'oc-line'},h('span',{class:'oc-mono'},`photo.jpg v${v.v} → ${v.obj}`),v===L?h('span',{class:'sdl-tag ok'},'latest'):h('span',{class:'sdl-tag'},'old version, kept'),S.objs[v.obj].st==='gone'?h('span',{class:'sdl-tag bad'},'bytes deleted: broken reference'):null)));
      pGc.className='oc-p'+(S.hl.gc?' '+S.hl.gc:'');
      const cands=Object.entries(S.gc);
      pGc.replaceChildren(h('p',{class:'oc-h'},h('span',null,'Garbage collection (GC)'),h('small',null,'Grace period: 24 hours')),
        cands.length?cands.map(([o,g])=>h('div',{class:'oc-line'},h('span',{class:'oc-mono'},o),h('span',{class:'sdl-tag warn'},S.t>=g.until?'grace period over, awaiting recheck':`candidate, ${((g.until-S.t)/3600000).toFixed(1)} h of grace left`))):h('div',{class:'oc-line sdl-note'},'No candidates'));
      for(let i=0;i<3;i++){nodeEls[i].objs.replaceChildren(...Object.keys(S.objs).filter(o=>S.objs[o].nodes[i]).map(chip))}
      stats.set('cur',`v${L.v} → ${L.obj}`,'info');
      stats.set('orphan',cands.length,cands.length?'warn':null);
      const bad=S.versions.filter(v=>S.objs[v.obj].st==='gone').length;
      stats.set('bad',bad,bad?'bad':'ok');
      for(const b of btns)b.disabled=busy;
    }
    function setGet(txt,tone){stats.set('get',txt,tone)}

    /* ---- actions ---- */
    const step=(ms=STEP,dt=40)=>{S.t+=dt;render();return ctx.wait(ms)};
    async function put(){
      const n=S.next++,U='U'+n,O='O'+n;S.lastPut=U;
      S.uploads[U]={obj:O,st:'writing'};S.objs[O]={st:'writing',nodes:[0,0,0]};
      S.hl={api1:'act'};say('Client A → API 1',`PUT photo.jpg (upload_id ${U}, new object ${O})`);await step();
      for(let i=0;i<3;i++){S.objs[O].nodes[i]=1;say('API 1 → data node',`${O} written to N${i+1}`+(i===2?': all three replicas durable':''),i===2?'ok':null);await step(480,15)}
      S.objs[O].st='durable';S.uploads[U].st='committing';S.hl={api1:'act',meta:'act'};
      say('API 1 → metadata DB',`BEGIN; new photo.jpg version → ${O}; COMMIT`);await step();
      const mode=commitMode;
      if(mode==='ok'){
        S.versions.push({v:latest().v+1,obj:O});S.uploads[U].st='committed';S.hl={meta:'good'};
        say('Metadata DB',`Committed: photo.jpg v${latest().v} → ${O}`,'ok');await step();
        say('API 1 → client A','200 upload succeeded','ok');await step(400,20);S.hl={};render();return;
      }
      if(mode==='lostc'){S.versions.push({v:latest().v+1,obj:O})}
      S.uploads[U].st='uncertain';S.hl={api1:'hot',meta:mode==='lostc'?'good':''};
      say('Metadata DB',mode==='lostc'?`(actually committed photo.jpg v${latest().v} → ${O}, but the response was lost on the way)`:'(connection dropped, transaction rolled back)',mode==='lostc'?'info':'warn');await step(500,10);
      say('API 1',`No response after 3 s: outcome of ${U} unknown`,'warn');S.t+=3000;await step();
      if(onTimeout==='delete'){
        S.objs[O].st='gone';S.uploads[U].st=mode==='lostc'?'committed':'abandoned';S.hl={api1:'hot'};
        say('API 1 → data node',`Treats the timeout as a failure: deletes all three replicas of ${O} immediately`,'bad');await step();
        if(mode==='lostc'){S.hl={meta:'hot'};say('Metadata DB',`photo.jpg v${latest().v} still points to ${O}, but the bytes are gone`,'bad');await step()}
        S.hl={};render();return;
      }
      S.hl={api1:'act',meta:'act'};say('API 1 → metadata DB',`Look up the commit record for upload_id ${U}`);await step();
      if(mode==='lostc'){S.uploads[U].st='committed';S.hl={meta:'good'};say('Metadata DB',`${U} committed: photo.jpg v${latest().v} → ${O}`,'ok');await step();say('API 1 → client A','200 upload succeeded (original result returned, no duplicate commit)','ok');await step(400,20)}
      else{S.uploads[U].st='abandoned';S.hl={meta:'act'};say('Metadata DB',`${U} not committed; photo.jpg still points to ${latest().obj}`,'warn');await step();say('API 1 → client A',`500 upload failed; the bytes of ${O} stay on the data nodes with no references`,'warn');await step(400,20)}
      S.hl={};render();
    }
    async function get(){
      S.hl={api2:'act'};say('Client B → API 2','GET photo.jpg');await step();
      const c=S.cache2&&S.t<S.cache2.until?S.cache2:null,L=latest();let obj;
      if(c&&trust){obj=c.obj;say('API 2',`Cache hit: photo.jpg → ${obj}`,obj===L.obj?null:'warn');await step(500,5)}
      else{S.hl={api2:'act',meta:'act'};obj=L.obj;S.cache2={obj,until:S.t+TTL};say('API 2 → metadata DB',c?`Cache holds ${c.obj}; checking the latest version first: ${obj}`:`Cache empty; looked up photo.jpg → ${obj}`,'info');await step()}
      S.hl={api2:'act'};
      const x=S.objs[obj];
      if(x.st==='gone'){S.hl={api2:'hot',meta:'hot'};say('API 2 → client B',`Metadata points to ${obj}, but none of the three data nodes has it: read fails`,'bad');setGet(obj+' (failed)','bad')}
      else{const stale=obj!==L.obj;say('API 2 → client B',`Got ${obj}`+(stale?`: an old object. The PUT returned long ago; the latest is ${L.obj}`:''),stale?'bad':'ok');setGet(obj+(stale?' (stale)':''),stale?'bad':'ok');if(stale)S.hl={api2:'hot'}}
      await step(500,10);render();
    }
    async function gcScan(){
      S.hl={gc:'act'};say('GC','Scan the objects on the data nodes');await step();
      let did=false;
      for(const o of Object.keys(S.objs)){
        const x=S.objs[o];if(x.st==='gone')continue;
        const g=S.gc[o];
        if(refOf(o)||activeUp(o)){if(g){delete S.gc[o];say('GC',`${o} is referenced again; candidate cancelled`,'info');did=true}continue}
        if(!g){S.gc[o]={since:S.t,until:S.t+GRACE};say('GC',`${o} has no metadata reference: marked as an orphan candidate, recheck after 24 hours`,'warn');did=true}
        else if(S.t>=g.until){x.st='gone';delete S.gc[o];say('GC',`${o} recheck: no committed version, no active upload, no retention policy → delete all three replicas`,'ok');did=true}
        else{say('GC',`${o} still in grace period (${((g.until-S.t)/3600000).toFixed(1)} h left); not deleted`,'info');did=true}
        await step(450,5);
      }
      if(!did){say('GC','All objects are referenced; nothing to reclaim');await step(400,5)}
      S.hl={};render();
    }
    async function ff(){S.t+=GRACE;say('Clock','Fast-forward 24 hours (the cache on API node 2 has long expired)','info');S.cache2=null;await step(500,0);render()}

    function lock(v){busy=v;render();renderSeq()}
    async function guarded(fn){const g=++gen;lock(true);try{await fn()}finally{if(g===gen)lock(false)}}
    function free(fn){if(busy)return;guarded(fn).catch(catchAbort)}
    render();renderSeq();

    /* ---- preset scenarios ---- */
    function prepare(o={}){
      S=fresh();commitMode=o.commit||'ok';commitCtl.set(commitMode,true);onTimeout=o.to||'verify';toCtl.set(onTimeout,true);trust=o.trust!==false;trustCtl.set(trust,true);
      setGet('—',null);render();renderSeq();
    }
    ctx.scenarios([
      {id:'orphan',label:'Commit timed out, actually rolled back',
        ask:'The three copies of O9’s bytes are written, but the connection drops while committing photo.jpg → O9. Checking by U9 confirms the transaction was rolled back. When GC first scans and finds that O9 has no references at all, will it delete O9 immediately?',
        insight:'No. O9 is first marked as an orphan candidate. After the 24-hour grace period it is rechecked: only if there is no committed version, no active upload, and no retention policy referencing it are the three replicas deleted. “No reference right now” does not prove an object is garbage, because a new upload writes its bytes first and publishes metadata afterward. Throughout, photo.jpg keeps pointing to O1, so readers are unaffected.',
        run:()=>guarded(async()=>{prepare({commit:'lostr'});await ctx.wait(400);await put();await gcScan();await ctx.wait(500);await ff();await gcScan();await ctx.wait(300)})},
      {id:'committed',label:'Timed out, actually committed',
        ask:'The commit request timed out, but the metadata DB has in fact already pointed photo.jpg at O9; only the response was lost. If the API treats the timeout as a failure and deletes O9 immediately, what happens when client B then does GET photo.jpg? What if the API verifies by U9 instead?',
        insight:'After the immediate delete, GET finds photo.jpg → O9, yet none of the three data nodes has O9: a visible but unreadable broken reference, far more dangerous than a temporary extra orphan. When the API verifies by U9, the metadata DB answers “committed,” the API keeps O9 and returns the original result to the client, and the same GET reads O9. A timeout only means “outcome unknown.”',
        run:()=>guarded(async()=>{
          prepare({commit:'lostc',to:'delete',trust:false});await ctx.wait(400);await put();await get();await ctx.wait(1200);
          prepare({commit:'lostc',to:'verify',trust:false});say('Note','Try again: this time verify by upload_id after the timeout','info');await ctx.wait(700);await put();await get();await ctx.wait(300);
        })},
      {id:'stale',label:'Three copies of new bytes, old object read',
        ask:'The three replicas of O9 and the metadata are all committed, and the PUT has returned success to client A. Only afterward does client B send GET photo.jpg, and the request lands on API node 2, which still caches photo.jpg → O1. Which object does it read?',
        insight:'O1. Although O9 has three complete replicas, this read still returns the old value, violating “a read that starts after a write completes must see that write or a newer value.” After API node 2 is made to check the version with the metadata DB before reading, the same GET reads O9. The replica count answers “how many copies of the data exist”; which version of history a read sees depends on the commit point, the read path, and the cache rules.',
        run:()=>guarded(async()=>{
          prepare({commit:'ok',trust:true});await ctx.wait(400);await put();await get();await ctx.wait(1300);
          trust=false;trustCtl.set(false,true);say('Note','Switched to checking the version with metadata before reading; GET again','info');render();await ctx.wait(700);await get();await ctx.wait(300);
        })},
    ]);
  }
});
})();
