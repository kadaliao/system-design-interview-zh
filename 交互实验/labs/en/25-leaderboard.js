/* Chapter 25: Real-Time Gaming Leaderboard. Lab 1 uses a sorted set to show the top ten, the players near me, tied ranks, and retry dedup; lab 2 shows Top K merging after sharding, cross-shard rank, and single-key hotspots. */
(function(){
const {el:h,util}=SDLab;
const KEY='board:2026-09',ME='mary1934';
const pl=(n,w)=>n+' '+w+(n===1?'':'s');
/* Initial data for this month's board; ZREVRANGE order: score descending, ties by member string descending */
const BASE=[['alice',131],['bob',128],['amy',128],['carl',125],['dora',121],['fay',118],['eli',118],['gus',115],['hana',112],['ivan',109],['judy',104],['ken',101],['lily',99],['mike',93],['nina',90],['oscar',86],['peggy',81],['quinn',76],['sam',65],['uma',64],['tina',64],[ME,63],['victor',61],['xena',58],['wendy',58],['yuri',55],['zoe',51],['ben',47],['cody',44],['gina',40],['hugo',35],['iris',30],['jack',26],['kate',21],['leo',15],['max',9]];
const cmp=(a,b)=>b[1]-a[1]||(a[0]<b[0]?1:a[0]>b[0]?-1:0);
const sorted=m=>[...m.entries()].sort(cmp);
const comp=(m,s)=>1+[...m.values()].filter(v=>v>s).length;
const dense=(m,s)=>1+new Set([...m.values()].filter(v=>v>s)).size;
const CSS=`
.lb-cmd{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:#23352f;color:#e8f0ea;border-radius:10px;padding:8px 12px;margin:0 0 10px;min-height:5.6em;line-height:1.6;overflow-wrap:anywhere}
:root[data-theme=dark] .lb-cmd{background:#e8f0ea;color:#23352f}
:root[data-theme=dark] .lb-cmd .r{color:#2c7449}:root[data-theme=dark] .lb-cmd .n{color:#8f600c}:root[data-theme=dark] .lb-cmd .c{color:#5b6e64}
.lb-cmd div{white-space:pre-wrap}.lb-cmd .r{color:#9fd3b0}.lb-cmd .n{color:#f0c987}.lb-cmd .c{color:#9ab0a4}
.lb-list{display:flex;flex-direction:column;gap:2px;font-size:13px}
.lb-row{display:grid;grid-template-columns:36px minmax(0,1fr) 40px 80px;gap:6px;align-items:center;padding:2px 8px;border-radius:6px;background:#fff;border:1px solid #edf1eb;font-variant-numeric:tabular-nums;position:relative}
.lb-row.hd{background:none;border:0;color:#66756d;font-size:12px;padding-top:0;padding-bottom:0}
.lb-row .p{color:#66756d;font-family:ui-monospace,Menlo,monospace;font-size:12px}
.lb-row .m{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lb-row .s{text-align:right;font-weight:650}
.lb-row .k{text-align:right;white-space:nowrap}
.lb-row.me{background:#dde9f6;border-color:#9dbbe0;font-weight:650}
.lb-row.hl{box-shadow:0 0 0 2px #2f6fb3 inset}
.lb-row.tie .k{color:#86561a}
`;

/* ---------------- Lab 1: sorted set leaderboard ---------------- */
SDLab.define({
  id:'leaderboard-zset',chapter:25,
  title:'Sorted Set Leaderboard: Position, Rank, and Ties',
  summary:'The monthly board is one sorted set: members are user IDs and scores are win counts. On the left, the top 10 from ZREVRANGE; on the right, the 4 players above and below mary1934. Let her win a game, retry a delivery, or switch the ranking rule, and see when the zero-based position differs from the rank the product wants.',
  caveat:'Virtual data for 36 players; ties follow Redis order (by member string, reversed when reading in reverse). Each win adds 1 point, and each match result event carries a unique match_id; dedup stands for a “processed events” table. Consistent reads across several commands are not simulated.',
  mount(ctx){
    ctx.css('lb',CSS);
    const S={m:new Map(BASE),rule:'comp',dedup:true,done:new Set(),last:null,seq:1000,hl:new Set()};
    const ruleCtl=ctx.segmented({label:'Ranking rule',value:'comp',wide:true,options:[['disp','Display number: position + 1'],['comp','Competition rank: 1,1,3'],['dense','Dense rank: 1,1,2']],onChange:v=>{S.rule=v;render()}});
    const dedupCtl=ctx.toggle({label:'Deduplicate by match_id',value:true,onChange:v=>{S.dedup=v}});
    ctx.button('mary1934 wins a game',()=>win(ME),{primary:true});
    ctx.button('Retry the last delivery',()=>retry());
    ctx.button('One round: 8 players win once each',()=>round());

    const cmdBox=h('div',{class:'lb-cmd','aria-live':'polite'});
    const mkPanel=t=>{const box=h('div',{class:'lb-list'});const head=h('div',{class:'ph'},t);return {el:h('div',{class:'sdl-panel'},head,h('div',{class:'lb-row hd'},h('span',null,'Pos'),h('span',null,'Member'),h('span',{class:'s'},'Score'),h('span',{class:'k rk'},'Rank')),box),box,head,map:new Map()}};
    const pTop=mkPanel('ZREVRANGE '+KEY+' 0 9'),pMe=mkPanel('Near me');
    ctx.stage.append(cmdBox,h('div',{class:'sdl-grid2'},pTop.el,pMe.el));
    const st=ctx.stats([{key:'score',label:'mary1934 score'},{key:'pos',label:'ZREVRANK (zero-based position)'},{key:'disp',label:'Display number'},{key:'comp',label:'Competition rank'},{key:'tie',label:'Tied with her'}]);
    const lines=[];
    function cmd(c,r){lines.push([c,r]);while(lines.length>4)lines.shift();cmdBox.replaceChildren(...lines.map(([c,r])=>h('div',null,h('span',{class:'c'},'> '),c,r!=null?h('span',{class:'r'},'  → '+r):null)))}
    const rankOf=(name,sc,pos)=>S.rule==='disp'?pos+1:S.rule==='comp'?comp(S.m,sc):dense(S.m,sc);
    function fillPanel(p,rows){
      const first=new Map();for(const [n,el] of p.map)first.set(n,el.getBoundingClientRect().top);
      const keep=new Set(rows.map(r=>r[0]));for(const [n,el] of p.map)if(!keep.has(n)){el.remove();p.map.delete(n)}
      const all=sorted(S.m);
      for(const [name,sc,pos] of rows){
        let el=p.map.get(name);const fresh=!el;
        if(!el){el=h('div',{class:'lb-row'},h('span',{class:'p'}),h('span',{class:'m'}),h('span',{class:'s'}),h('span',{class:'k'}));p.map.set(name,el)}
        const tie=all.filter(x=>x[1]===sc).length>1;
        el.className='lb-row'+(name===ME?' me':'')+(S.hl.has(name)?' hl':'')+(tie&&S.rule!=='disp'?' tie':'');
        const [a,b,c,d]=el.children;a.textContent=pos;b.textContent=name;c.textContent=sc;d.textContent='#'+rankOf(name,sc,pos)+(tie&&S.rule!=='disp'?' tied':'');
        p.box.append(el);
        if(fresh&&first.size){el.classList.add('sdl-flash')}
      }
      for(const [name] of rows){const el=p.map.get(name),f=first.get(name);if(f==null)continue;const dy=f-el.getBoundingClientRect().top;
        if(Math.abs(dy)>1){el.style.transition='none';el.style.transform=`translateY(${dy}px)`;void el.offsetHeight;el.style.transition='transform .6s ease';el.style.transform=''}}
    }
    function render(){
      const all=sorted(S.m),idx=new Map(all.map((x,i)=>[x[0],i]));
      const r=idx.get(ME),lo=Math.max(0,r-4),hi=Math.min(all.length-1,r+4);
      fillPanel(pTop,all.slice(0,10).map((x,i)=>[x[0],x[1],i]));
      fillPanel(pMe,all.slice(lo,hi+1).map((x,i)=>[x[0],x[1],lo+i]));
      pMe.head.textContent=`Near me: ZREVRANGE ${KEY} ${lo} ${hi}`;
      const lab={disp:'Display no.',comp:'Comp. rank',dense:'Dense rank'}[S.rule];for(const p of [pTop,pMe])p.el.querySelector('.rk').textContent=lab;
      const sc=S.m.get(ME);st.set('score',sc+' pts');st.set('pos',r,'info');st.set('disp','#'+(r+1));st.set('comp','#'+comp(S.m,sc),'ok');
      const ties=all.filter(x=>x[1]===sc&&x[0]!==ME).map(x=>x[0]);st.set('tie',ties.length?ties.join(', '):'none',ties.length?'warn':null);
    }
    function apply(ev){
      if(S.dedup&&S.done.has(ev.id)){cmd(`Duplicate ${ev.id} (${ev.user})`,'already processed, skipping ZINCRBY');ctx.log(`${ev.id} delivered again; ignored after match_id dedup`,'warn');return false}
      S.done.add(ev.id);const v=S.m.get(ev.user)+1;S.m.set(ev.user,v);cmd(`ZINCRBY ${KEY} 1 ${ev.user}`,`"${v}"`);
      ctx.log(`${ev.id}: ${ev.user} +1 → ${v}`,ev.user===ME?'info':null);return true;
    }
    function win(user){const ev={id:'m-'+(++S.seq),user};S.last=ev;apply(ev);render();announce()}
    function retry(){if(!S.last){cmd('No match event to retry yet');return}apply(S.last);render();announce()}
    function round(){const r=util.rng(S.seq),names=[...S.m.keys()].filter(n=>n!==ME);for(let i=0;i<8;i++){const n=names.splice(Math.floor(r()*names.length),1)[0];const ev={id:'m-'+(++S.seq),user:n};S.last=ev;S.done.add(ev.id);S.m.set(n,S.m.get(n)+1)}cmd(`8 ZINCRBY commands (each winner this round +1)`,'done');render();announce()}
    function announce(){const sc=S.m.get(ME),r=sorted(S.m).findIndex(x=>x[0]===ME);ctx.announce(`mary1934 has ${sc} points, position ${r}, competition rank ${comp(S.m,sc)}`)}
    render();cmd(`ZREVRANGE ${KEY} 0 9 WITHSCORES`,'10 members');

    async function reset(){S.m=new Map(BASE);S.done=new Set();S.last=null;S.hl=new Set();lines.length=0;S.rule='comp';ruleCtl.set('comp',true);render();cmdBox.replaceChildren()}
    const hl=names=>{S.hl=new Set(names);render()};
    ctx.scenarios([
      {id:'window',label:'Top 10 and 4 players around me',
        ask:'ZREVRANK returns zero-based position 21 for mary1934. To fetch the 4 players above and below her, what range do you give ZREVRANGE? What rank should she be shown at?',
        insight:'The range is 17 to 25: both ends are inclusive, exactly 9 players. Zero-based position 21 is displayed as #22; nobody above her is tied with her, so her competition rank is also 22. In the right-hand window, uma and tina both have 64 points, at positions 19 and 20, yet both have competition rank 20. Near the top of the board, the start must be clamped to 0.',
        async run(){await reset();await ctx.wait(500);cmd(`ZREVRANK ${KEY} ${ME}`,'(integer) 21');hl([ME]);await ctx.wait(1600);
          cmd(`ZREVRANGE ${KEY} 17 25 WITHSCORES`,'9 members');hl(['quinn','sam','uma','tina',ME,'victor','xena','wendy','yuri']);await ctx.wait(1800);hl(['uma','tina']);await ctx.wait(1600)}},
      {id:'ties',label:'Ties: position is not a tied rank',
        ask:'bob and amy both have 128, and only alice is higher. What does ZREVRANK return for each? What competition rank do they get? And carl, at 125, just below them?',
        insight:'ZREVRANK returns 1 for bob and 2 for amy: for equal scores, Redis orders by member string, and reading in reverse puts bob before amy, so their display numbers are 2 and 3. Competition rank uses “1 + the number of players strictly higher”: ZCOUNT (128 +inf is 1, so the two tie for 2nd; carl has 3 players above him, so he is 4th. Switch to dense rank and carl becomes 3rd (only distinct higher scores are counted). A position is just a seat number; ask the product which ranking rule it wants.',
        async run(){await reset();ruleCtl.set('disp');hl(['bob','amy']);await ctx.wait(400);cmd(`ZREVRANK ${KEY} bob`,'(integer) 1');await ctx.wait(1000);cmd(`ZREVRANK ${KEY} amy`,'(integer) 2');await ctx.wait(1500);
          ruleCtl.set('comp');cmd(`ZCOUNT ${KEY} (128 +inf`,'(integer) 1  → competition rank 2');await ctx.wait(1600);hl(['carl']);cmd(`ZCOUNT ${KEY} (125 +inf`,'(integer) 3  → competition rank 4');await ctx.wait(1600);
          ruleCtl.set('dense');cmd('Dense rank = 1 + number of distinct higher scores','{131, 128} → 3');await ctx.wait(1600)}},
      {id:'retry',label:'Win a game: score up, move up, retry',
        ask:'mary1934 wins a game, and after a timeout the game service delivers the same match_id 2 more times. Without dedup, what is her final score, and how do her position and competition rank change? And with dedup?',
        insight:'Without dedup: all 3 ZINCRBY calls take effect, 63 → 66, passing uma, tina, and sam; her position goes from 21 to 18 and her competition rank is 19. With dedup: only 1 point is added, to 64, tying uma and tina; ZREVRANK stays 21 (for equal scores she sorts after the two by member string), yet her competition rank rises from 22 to 20. ZINCRBY is not idempotent, so retries must be deduplicated by the match event ID.',
        async run(){await reset();dedupCtl.set(false);hl([ME]);await ctx.wait(500);win(ME);await ctx.wait(1200);retry();await ctx.wait(1000);retry();await ctx.wait(1800);
          S.m.set(ME,63);S.done=new Set();lines.length=0;cmd('(Restored to 63 points, dedup turned on)');dedupCtl.set(true);render();await ctx.wait(1200);win(ME);await ctx.wait(1200);retry();await ctx.wait(1000);retry();await ctx.wait(1500)}},
    ]);
  }
});

/* ---------------- Lab 2: sharding ---------------- */
function crc16(s){let c=0;for(const ch of new TextEncoder().encode(s)){c^=ch<<8;for(let i=0;i<8;i++)c=(c&0x8000)?((c<<1)^0x1021)&0xffff:(c<<1)&0xffff}return c}
const slotOf=k=>{const a=k.indexOf('{'),b=a>=0?k.indexOf('}',a+1):-1;return crc16(a>=0&&b>a+1?k.slice(a+1,b):k)%16384};
const nodeOf=k=>{const s=slotOf(k);return s<=5460?0:s<=10922?1:2};
const NODES=['Node 1 · slots 0–5460','Node 2 · slots 5461–10922','Node 3 · slots 10923–16383'];
const RANGES=[[0,69],[70,99],[100,Infinity]];

SDLab.define({
  id:'leaderboard-shard',chapter:25,
  title:'After Sharding: Top K Merge, Cross-Shard Rank, and Hot Keys',
  summary:'The same monthly board goes into a Redis Cluster with 3 primaries. Change how it is split and see which nodes the writes land on, how many keys a top-K query must visit, how candidates are merged, and how many times you must ask to get one player’s rank.',
  caveat:'Slots are computed with real CRC16, and slot ranges are the default even split across 3 primaries; hash sharding takes the FNV hash of (“id:” + username) modulo 3. Each command counts as one round trip; network latency, concurrent updates, and consistent snapshots are not simulated. For range sharding, the user-to-shard mapping appears only in the log.',
  mount(ctx){
    ctx.css('lb',CSS);
    ctx.css('ls',`
.ls-nodes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
.ls-node{border:1px solid #dbe2da;border-radius:10px;padding:6px 7px;background:#fbfcfa;min-width:0;font-size:12px}
.ls-node .nh{font-weight:700;font-size:12px;line-height:1.4;color:#23352f}
.ls-key{margin-top:6px;border:1px solid #e3e9e1;border-radius:8px;background:#fff;padding:4px 6px}
.ls-key .kn{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#66756d;overflow-wrap:anywhere;line-height:1.35}
.ls-key.q{border-color:#2f6fb3;box-shadow:0 0 0 1px #2f6fb3}
.ls-r{display:flex;justify-content:space-between;gap:4px;font-variant-numeric:tabular-nums;padding:0 3px;border-radius:4px;line-height:1.6}
.ls-r.hl{background:#dde9f6;font-weight:650}.ls-r.pick{background:#dcefe2;font-weight:700}.ls-r.me{color:#1d4f86;font-weight:650}
.ls-r span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ls-more{color:#8a968f;font-size:11px}
.ls-load{height:8px;border-radius:4px;background:#e6eee2;margin-top:6px;overflow:hidden}.ls-load i{display:block;height:100%;background:#b7791f;transition:width .25s}
.ls-lt{font-size:11px;color:#66756d;margin-top:2px}
.ls-empty{color:#b4beb7;font-size:11px;margin-top:6px}
.ls-res{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
`);
    const S={mode:'hash',K:3,m:new Map(BASE),load:[0,0,0],writes:0};
    const MODES={single:'Single key (no split)',hash:'3 keys, split by user hash',tag:'3 keys sharing a hash tag',range:'3 keys, split by score range'};
    const modeCtl=ctx.segmented({label:'Split method',value:S.mode,wide:true,options:Object.entries(MODES),onChange:v=>{S.mode=v;S.load=[0,0,0];S.writes=0;render();clearQ()}});
    const kCtl=ctx.slider({label:'K (how many top ranks)',min:3,max:10,value:S.K,onChange:v=>{S.K=v}});
    ctx.button('Query global Top K',()=>go(topK),{primary:true});
    ctx.button('Query mary1934’s rank',()=>go(myRank));
    ctx.button('One round of writes (12 ZINCRBY)',()=>go(writes));
    const go=f=>{f().catch(()=>{})};

    const cmdBox=h('div',{class:'lb-cmd','aria-live':'polite'});
    const res=h('div',{class:'sdl-panel'},h('div',{class:'ph'},'Coordinator result'),h('div',{class:'ls-res'}));
    const nodesBox=h('div',{class:'ls-nodes'});
    ctx.stage.append(cmdBox,res,nodesBox);
    const st=ctx.stats([{key:'keys',label:'Keys accessed'},{key:'rt',label:'Round trips'},{key:'cand',label:'Candidates received'},{key:'hot',label:'Hottest node’s share of writes'}]);
    const hashShard=n=>util.hash('id:'+n)%3;
    const keyName=(mode,i)=>mode==='single'?KEY:mode==='hash'?`${KEY}:s${i}`:mode==='tag'?`{${KEY}}:s${i}`:`${KEY}:r${i}`;
    const keysOf=mode=>mode==='single'?[KEY]:[0,1,2].map(i=>keyName(mode,i));
    function keyOfUser(n,mode=S.mode){if(mode==='single')return KEY;if(mode==='range'){const s=S.m.get(n);return keyName('range',RANGES.findIndex(([a,b])=>s>=a&&s<=b))}return keyName(mode,hashShard(n))}
    const members=k=>sorted(new Map([...S.m].filter(([n])=>keyOfUser(n)===k)));
    let rowEls=new Map(),keyEls=new Map(),mark={hl:new Set(),pick:new Set(),q:new Set()};
    function render(){
      nodesBox.replaceChildren();rowEls=new Map();keyEls=new Map();
      const tot=S.load.reduce((a,b)=>a+b,0);
      NODES.forEach((lab,ni)=>{
        const box=h('div',{class:'ls-node'},h('div',{class:'nh'},lab));
        const ks=keysOf(S.mode).filter(k=>nodeOf(k)===ni);
        if(!ks.length)box.append(h('div',{class:'ls-empty'},'No key of this board'));
        for(const k of ks){const ms=members(k),show=S.mode==='single'?8:5;
          const kb=h('div',{class:'ls-key'+(mark.q.has(k)?' q':'')},h('div',{class:'kn'},k+' · slot '+slotOf(k)));
          const lim=Math.max(show,ms.findIndex(x=>mark.hl.has(x[0])||mark.pick.has(x[0]))+1);
          ms.slice(0,lim).forEach(([n,s])=>{const r=h('div',{class:'ls-r'+(mark.pick.has(n)?' pick':mark.hl.has(n)?' hl':'')+(n===ME?' me':'')},h('span',null,n),h('span',null,s));rowEls.set(n,r);kb.append(r)});
          if(ms.length>lim)kb.append(h('div',{class:'ls-more'},`… ${ms.length} players in all`));
          keyEls.set(k,kb);box.append(kb)}
        const pct=tot?S.load[ni]/tot:0;
        box.append(h('div',{class:'ls-load'},h('i',{style:{width:pct*100+'%'}})),h('div',{class:'ls-lt'},tot?`${pl(S.load[ni],'write')} (${util.pct(pct,0)})`:'0 writes'));
        nodesBox.append(box);
      });
      const tot2=S.load.reduce((a,b)=>a+b,0);st.set('hot',tot2?util.pct(Math.max(...S.load)/tot2,0):'—',tot2&&Math.max(...S.load)/tot2>0.6?'warn':null);
    }
    const lines=[];
    function cmd(c,r,cls){lines.push([c,r,cls]);while(lines.length>6)lines.shift();cmdBox.replaceChildren(...lines.map(([c,r,cls])=>h('div',{class:cls||null},cls==='n'?null:h('span',{class:'c'},'> '),c,r!=null?h('span',{class:'r'},'  → '+r):null)))}
    function setRes(items,note){const box=res.querySelector('.ls-res');box.replaceChildren(...items.map(([n,s,src])=>h('span',{class:'sdl-tag '+(n===ME?'info':'ok')},`${n} ${s}${src?' · '+src:''}`)));if(note)box.append(h('span',{class:'sdl-note',style:{margin:'0'}},note))}
    function clearQ(){mark={hl:new Set(),pick:new Set(),q:new Set()};lines.length=0;cmdBox.replaceChildren();setRes([]);for(const k of ['keys','rt','cand'])st.set(k,'—');render()}
    const short=k=>k.replace(KEY,'b');
    let seq=0;
    async function topK(){
      const my=++seq;clearQ();const K=S.K;let rt=0,cand=0;const used=[];
      const take=async(k,n)=>{const ms=members(k).slice(0,n);rt++;cand+=ms.length;used.push(k);mark.q.add(k);ms.forEach(x=>mark.hl.add(x[0]));
        cmd(`Node ${nodeOf(k)+1}: ZREVRANGE ${k} 0 ${n-1} WITHSCORES`,pl(ms.length,'player'));render();st.set('keys',String(used.length));st.set('rt',String(rt));st.set('cand',String(cand));await ctx.wait(700);return my===seq?ms.map(x=>[...x,k]):null};
      let out=[];
      if(S.mode==='range'){for(let i=2;i>=0&&out.length<K;i--){const got=await take(keyName('range',i),K-out.length);if(!got)return null;out.push(...got)}
        cmd(`Take from the highest range downward and stop once ${K} players are collected: ${pl(used.length,'key')} accessed`,null,'n')}
      else{const lists=[];for(const k of keysOf(S.mode)){const got=await take(k,K);if(!got)return null;lists.push(got)}
        if(lists.length>1){const cur=lists.map(()=>0);cmd(`Merge ${lists.length} sorted candidate streams (${cand} players in all)`,null,'n');
          while(out.length<K){let bi=-1;for(let i=0;i<lists.length;i++){const x=lists[i][cur[i]];if(x&&(bi<0||cmp(x,lists[bi][cur[bi]])<0))bi=i}if(bi<0)break;
            const x=lists[bi][cur[bi]++];out.push(x);mark.pick.add(x[0]);render();setRes(out.map(([n,s,k])=>[n,s,short(k)]));await ctx.wait(550);if(my!==seq)return null}}
        else out=lists[0]}
      out.forEach(x=>mark.pick.add(x[0]));render();setRes(out.map(([n,s,k])=>[n,s,S.mode==='single'?null:short(k)]),`Accessed ${pl(used.length,'key')}, ${pl(rt,'round trip')}, received ${pl(cand,'candidate')}`);
      ctx.announce(`Top ${K}: `+out.map(x=>x[0]).join(', '));
      return {out,rt,cand,keys:used.length};
    }
    async function myRank(){
      const my=++seq;clearQ();const sc=S.m.get(ME),mine=keyOfUser(ME);let rt=0,higher=0;
      mark.hl.add(ME);
      const step=async(k,c,v,txt)=>{rt++;mark.q.add(k);cmd(`Node ${nodeOf(k)+1}: ${c}`,txt);higher+=v;render();st.set('rt',String(rt));st.set('keys',String(mark.q.size));await ctx.wait(800);return my===seq};
      if(S.mode==='range'){
        const i=+mine.slice(-1),inK=members(mine).filter(x=>x[1]>sc).length;if(!await step(mine,`ZCOUNT ${mine} (${sc} +inf`,inK,`(integer) ${inK}`))return null;
        for(let j=i+1;j<3;j++){const k=keyName('range',j),c=members(k).length;if(!await step(k,`ZCARD ${k}`,c,`(integer) ${c} (the whole range is above her)`))return null}
      }else for(const k of keysOf(S.mode)){const c=members(k).filter(x=>x[1]>sc).length;if(!await step(k,`ZCOUNT ${k} (${sc} +inf`,c,`(integer) ${c}`))return null}
      cmd(`Competition rank = 1 + ${higher} = ${higher+1}`,null,'n');setRes([[ME,sc,'#'+(higher+1)]],`Asked ${pl(rt,'time')}`);st.set('cand','—');
      return {rank:higher+1,rt};
    }
    async function writes(){
      const my=++seq;clearQ();const r=util.rng(25+S.writes),names=[...S.m.keys()];
      for(let i=0;i<12;i++){const n=names[Math.floor(r()*names.length)],before=keyOfUser(n),v=S.m.get(n)+1;S.m.set(n,v);const after=keyOfUser(n),node=nodeOf(after);
        S.load[node]++;S.writes++;mark.hl=new Set([n]);
        if(before!==after){cmd(`${n} ${v-1} → ${v} crosses a range boundary: ZREM ${before} ${n}; ZADD ${after} ${v} ${n}; update the mapping`,null,'n');ctx.log(`${n} migrates across ranges: ${before} → ${after}`,'warn')}
        else cmd(`Node ${node+1}: ZINCRBY ${after} 1 ${n}`,`"${v}"`);
        render();await ctx.wait(260);if(my!==seq)return}
      mark.hl=new Set();render();
    }
    render();

    function prep(mode){S.m=new Map(BASE);S.mode=mode;modeCtl.set(mode,true);S.load=[0,0,0];S.writes=0;S.K=3;kCtl.set(3,true);clearQ()}
    ctx.scenarios([
      {id:'hotkey',label:'One big ZSET lives on one node',
        ask:'The cluster has 3 primaries. When the whole monthly board is one key, how many nodes do the writes spread across? What about splitting it into board:2026-09:s0/s1/s2? And what if the names share a hash tag, like {board:2026-09}:s0?',
        insight:'A single key lands on slot 10877, so all 12 writes (100%) hit node 2. Split into :s0/:s1/:s2, the keys land on slots 12488, 8425, and 4234, and the same 12 writes spread across three nodes (3 / 4 / 5). With a shared hash tag, only board:2026-09 inside the braces is hashed, so all three keys sit in slot 10877 and everything is back on node 2. Cluster divides keys; splitting one logical board into several keys is the application’s job.',
        async run(){prep('single');await writes();await ctx.wait(1000);prep('hash');await writes();await ctx.wait(1000);prep('tag');await writes();await ctx.wait(1200)}},
      {id:'merge',label:'Hash sharding: Top 3 scatter-gather merge',
        ask:'Each of the 3 shards returns only its local top 3. Is the coordinator’s merged result always the global top 3? How many candidates does it receive?',
        insight:'Each shard returns 3 players, 9 candidates in total, and the merge yields alice 131, bob 128, amy 128, the same as without sharding; this time all three happen to be in s2, so the other two shards’ 6 candidates all lose. Proof by contradiction: if someone can’t even make their own shard’s top 3, 3 players in that shard are already ahead of them, so they can’t be in the global top 3. This assumes every shard and the merge use the same ordering rule (score descending, ties by member). The cost is that every query asks all shards, and the candidate count is shards × K.',
        async run(){prep('hash');await topK();await ctx.wait(1500)}},
      {id:'rank',label:'Finding a rank across shards',
        ask:'mary1934 has 63 points. With hash sharding, how many shards must you ask for her competition rank? And with score-range sharding?',
        insight:'Hash sharding runs ZCOUNT (63 +inf on each of the 3 keys and adds up the strictly higher players: 21, so rank 22. Range sharding also asks 3 times: ZCOUNT in her own range r0 gives 3 players, then ZCARD on the two higher ranges gives 6 and 12, for a total of 21. The benefit of range sharding is in Top K: when the highest range has at least K players, you visit only one key. The cost is that when a player’s score crosses a range, the member must be migrated and the mapping updated (the “crosses a range boundary” lines in the log when you write).',
        async run(){prep('hash');await myRank();await ctx.wait(1500);prep('range');await myRank();await ctx.wait(1200);await topK();await ctx.wait(1200)}},
      {id:'tie',label:'Tie at the boundary: top K people ≠ a rank that includes ties',
        ask:'Four players in one shard all have 140 points, and K = 3. How many players come back if each shard returns its top 3 and you merge? What if the product wants “all players tied within the top 3 ranks”?',
        insight:'The merge returns only 3 players, lily, ken, and ivan, and fay, also at 140, sits 4th and is missed: a local Top K guarantees “the top K people,” not “a rank that includes every tied player.” The fix is to first find the score threshold at the Kth position, 140, then fetch from every shard all players at or above the threshold (ZREVRANGEBYSCORE key +inf 140), which this time brings back 4 players. If the product wants the top K distinct score levels, that is yet another threshold algorithm.',
        async run(){prep('hash');const k0=keyName('hash',0),four=members(k0).slice(0,4).map(x=>x[0]);four.forEach(n=>S.m.set(n,140));render();
          cmd(`(${four.join(', ')} all set to 140 points, all in ${k0})`,null,'n');await ctx.wait(1400);const r=await topK();if(!r)return;await ctx.wait(1400);
          const th=r.out[r.out.length-1][1];let all=[];for(const k of keysOf('hash')){const ms=members(k).filter(x=>x[1]>=th);mark.q.add(k);cmd(`Node ${nodeOf(k)+1}: ZREVRANGEBYSCORE ${k} +inf ${th}`,pl(ms.length,'player'));all.push(...ms.map(x=>[...x,k]));all.forEach(x=>mark.pick.add(x[0]));render();await ctx.wait(700)}
          all.sort(cmp);setRes(all.map(([n,s,k])=>[n,s,short(k)]),`Fetched ${pl(all.length,'player')} at or above threshold ${th}`);await ctx.wait(1500)}},
    ]);
  }
});
})();
