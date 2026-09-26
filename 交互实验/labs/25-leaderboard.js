/* 第 25 章：实时游戏排行榜。实验一用 sorted set 演示前十、我附近、同分名次与重试去重；实验二演示分片后的 Top K 合并、跨片名次与单 key 热点。 */
(function(){
const {el:h,util}=SDLab;
const KEY='board:2026-09',ME='mary1934';
/* 本月榜单初始数据；ZREVRANGE 顺序：分数降序，同分按成员字典序降序 */
const BASE=[['alice',131],['bob',128],['amy',128],['carl',125],['dora',121],['fay',118],['eli',118],['gus',115],['hana',112],['ivan',109],['judy',104],['ken',101],['lily',99],['mike',93],['nina',90],['oscar',86],['peggy',81],['quinn',76],['sam',65],['uma',64],['tina',64],[ME,63],['victor',61],['xena',58],['wendy',58],['yuri',55],['zoe',51],['ben',47],['cody',44],['gina',40],['hugo',35],['iris',30],['jack',26],['kate',21],['leo',15],['max',9]];
const cmp=(a,b)=>b[1]-a[1]||(a[0]<b[0]?1:a[0]>b[0]?-1:0);
const sorted=m=>[...m.entries()].sort(cmp);
const comp=(m,s)=>1+[...m.values()].filter(v=>v>s).length;
const dense=(m,s)=>1+new Set([...m.values()].filter(v=>v>s)).size;
const CSS=`
.lb-cmd{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:#23352f;color:#e8f0ea;border-radius:10px;padding:8px 12px;margin:0 0 10px;min-height:5.6em;line-height:1.6;overflow-wrap:anywhere}
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

/* ---------------- 实验一：sorted set 排行榜 ---------------- */
SDLab.define({
  id:'leaderboard-zset',chapter:25,
  title:'Sorted Set 排行榜：位置、名次与同分',
  summary:'月榜是一个 sorted set，成员是用户 ID、分数是胜场。左边是 ZREVRANGE 取的前 10，右边是 mary1934 上下各 4 名。让她赢一场、重试投递，或切换名次规则，看「零基位置」和产品要的「名次」什么时候不一样。',
  caveat:'36 名玩家的虚拟数据；同分顺序按 Redis 规则（成员字典序，反向读取时倒过来）。每场胜利加 1 分，比赛结果事件带唯一 match_id，去重表示「已处理事件表」。多条命令之间的一致读取在这里不模拟。',
  mount(ctx){
    ctx.css('lb',CSS);
    const S={m:new Map(BASE),rule:'comp',dedup:true,done:new Set(),last:null,seq:1000,hl:new Set()};
    const ruleCtl=ctx.segmented({label:'名次规则',value:'comp',wide:true,options:[['disp','展示序号：位置 + 1'],['comp','竞赛排名：1,1,3'],['dense','密集排名：1,1,2']],onChange:v=>{S.rule=v;render()}});
    const dedupCtl=ctx.toggle({label:'按 match_id 去重',value:true,onChange:v=>{S.dedup=v}});
    ctx.button('mary1934 赢一场',()=>win(ME),{primary:true});
    ctx.button('重试上一场的投递',()=>retry());
    ctx.button('一轮比赛：8 人各赢一场',()=>round());

    const cmdBox=h('div',{class:'lb-cmd','aria-live':'polite'});
    const mkPanel=t=>{const box=h('div',{class:'lb-list'});const head=h('div',{class:'ph'},t);return {el:h('div',{class:'sdl-panel'},head,h('div',{class:'lb-row hd'},h('span',null,'位置'),h('span',null,'成员'),h('span',{class:'s'},'分数'),h('span',{class:'k rk'},'名次')),box),box,head,map:new Map()}};
    const pTop=mkPanel('ZREVRANGE '+KEY+' 0 9'),pMe=mkPanel('我附近');
    ctx.stage.append(cmdBox,h('div',{class:'sdl-grid2'},pTop.el,pMe.el));
    const st=ctx.stats([{key:'score',label:'mary1934 分数'},{key:'pos',label:'ZREVRANK（零基位置）'},{key:'disp',label:'展示序号'},{key:'comp',label:'竞赛名次'},{key:'tie',label:'与她同分的人'}]);
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
        const [a,b,c,d]=el.children;a.textContent=pos;b.textContent=name;c.textContent=sc;d.textContent='第 '+rankOf(name,sc,pos)+(tie&&S.rule!=='disp'?' 并列':'');
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
      pMe.head.textContent=`我附近：ZREVRANGE ${KEY} ${lo} ${hi}`;
      const lab={disp:'展示序号',comp:'竞赛名次',dense:'密集名次'}[S.rule];for(const p of [pTop,pMe])p.el.querySelector('.rk').textContent=lab;
      const sc=S.m.get(ME);st.set('score',sc+' 分');st.set('pos',r,'info');st.set('disp','第 '+(r+1));st.set('comp','第 '+comp(S.m,sc),'ok');
      const ties=all.filter(x=>x[1]===sc&&x[0]!==ME).map(x=>x[0]);st.set('tie',ties.length?ties.join('、'):'无',ties.length?'warn':null);
    }
    function apply(ev){
      if(S.dedup&&S.done.has(ev.id)){cmd(`重复的 ${ev.id}（${ev.user}）`,'已处理过，跳过 ZINCRBY');ctx.log(`${ev.id} 重复投递，按 match_id 去重后忽略`,'warn');return false}
      S.done.add(ev.id);const v=S.m.get(ev.user)+1;S.m.set(ev.user,v);cmd(`ZINCRBY ${KEY} 1 ${ev.user}`,`"${v}"`);
      ctx.log(`${ev.id}：${ev.user} +1 → ${v}`,ev.user===ME?'info':null);return true;
    }
    function win(user){const ev={id:'m-'+(++S.seq),user};S.last=ev;apply(ev);render();announce()}
    function retry(){if(!S.last){cmd('还没有可重试的比赛事件');return}apply(S.last);render();announce()}
    function round(){const r=util.rng(S.seq),names=[...S.m.keys()].filter(n=>n!==ME);for(let i=0;i<8;i++){const n=names.splice(Math.floor(r()*names.length),1)[0];const ev={id:'m-'+(++S.seq),user:n};S.last=ev;S.done.add(ev.id);S.m.set(n,S.m.get(n)+1)}cmd(`8 条 ZINCRBY（本轮胜者各 +1）`,'完成');render();announce()}
    function announce(){const sc=S.m.get(ME),r=sorted(S.m).findIndex(x=>x[0]===ME);ctx.announce(`mary1934 ${sc} 分，位置 ${r}，竞赛名次 ${comp(S.m,sc)}`)}
    render();cmd(`ZREVRANGE ${KEY} 0 9 WITHSCORES`,'10 个成员');

    async function reset(){S.m=new Map(BASE);S.done=new Set();S.last=null;S.hl=new Set();lines.length=0;S.rule='comp';ruleCtl.set('comp',true);render();cmdBox.replaceChildren()}
    const hl=names=>{S.hl=new Set(names);render()};
    ctx.scenarios([
      {id:'window',label:'前 10 与我上下 4 名',
        ask:'ZREVRANK 返回 mary1934 的零基位置 21。要取她前后各 4 名，ZREVRANGE 的区间怎么写？她应展示为第几？',
        insight:'区间是 17 到 25：两端都包含，正好 9 人。零基位置 21 展示为第 22；她上方没有同分者，竞赛名次也是 22。右侧窗口里 uma 和 tina 同为 64 分，位置是 19、20，竞赛名次却都是第 20。若她在榜首附近，起点要截到 0。',
        async run(){await reset();await ctx.wait(500);cmd(`ZREVRANK ${KEY} ${ME}`,'(integer) 21');hl([ME]);await ctx.wait(1600);
          cmd(`ZREVRANGE ${KEY} 17 25 WITHSCORES`,'9 个成员');hl(['quinn','sam','uma','tina',ME,'victor','xena','wendy','yuri']);await ctx.wait(1800);hl(['uma','tina']);await ctx.wait(1600)}},
      {id:'ties',label:'同分：位置不等于并列名次',
        ask:'bob 和 amy 都是 128 分，只有 alice 比他们高。ZREVRANK 分别返回什么？按竞赛排名他们第几？下面 125 分的 carl 呢？',
        insight:'ZREVRANK bob 返回 1、amy 返回 2：同分时 Redis 按成员字典序排，反向读取时 bob 在 amy 前，展示序号是 2、3。竞赛排名用「1 + 严格更高的人数」：ZCOUNT (128 +inf 为 1，两人并列第 2；carl 上方有 3 人，是第 4。切到密集排名，carl 变成第 3（只数更高的不同分数）。位置只是座号，名次规则要先问产品。',
        async run(){await reset();ruleCtl.set('disp');hl(['bob','amy']);await ctx.wait(400);cmd(`ZREVRANK ${KEY} bob`,'(integer) 1');await ctx.wait(1000);cmd(`ZREVRANK ${KEY} amy`,'(integer) 2');await ctx.wait(1500);
          ruleCtl.set('comp');cmd(`ZCOUNT ${KEY} (128 +inf`,'(integer) 1  → 竞赛名次 2');await ctx.wait(1600);hl(['carl']);cmd(`ZCOUNT ${KEY} (125 +inf`,'(integer) 3  → 竞赛名次 4');await ctx.wait(1600);
          ruleCtl.set('dense');cmd('密集名次 = 1 + 更高的不同分数个数','{131, 128} → 3');await ctx.wait(1600)}},
      {id:'retry',label:'赢一场：加分、上升与重试',
        ask:'mary1934 赢一场，游戏服务超时后把同一个 match_id 又投递了 2 次。不去重时她最终多少分？位置和竞赛名次怎么变？去重时呢？',
        insight:'不去重：3 次 ZINCRBY 都生效，63 → 66，越过 uma、tina 和 sam，位置从 21 变成 18，竞赛名次第 19。去重：只加 1 分到 64，与 uma、tina 同分；ZREVRANK 仍是 21（同分时字典序排在两人后面），竞赛名次却从 22 升到 20。ZINCRBY 不是幂等的，重试必须靠比赛事件 ID 去重。',
        async run(){await reset();dedupCtl.set(false);hl([ME]);await ctx.wait(500);win(ME);await ctx.wait(1200);retry();await ctx.wait(1000);retry();await ctx.wait(1800);
          S.m.set(ME,63);S.done=new Set();lines.length=0;cmd('（恢复到 63 分，打开去重）');dedupCtl.set(true);render();await ctx.wait(1200);win(ME);await ctx.wait(1200);retry();await ctx.wait(1000);retry();await ctx.wait(1500)}},
    ]);
  }
});

/* ---------------- 实验二：分片 ---------------- */
function crc16(s){let c=0;for(const ch of new TextEncoder().encode(s)){c^=ch<<8;for(let i=0;i<8;i++)c=(c&0x8000)?((c<<1)^0x1021)&0xffff:(c<<1)&0xffff}return c}
const slotOf=k=>{const a=k.indexOf('{'),b=a>=0?k.indexOf('}',a+1):-1;return crc16(a>=0&&b>a+1?k.slice(a+1,b):k)%16384};
const nodeOf=k=>{const s=slotOf(k);return s<=5460?0:s<=10922?1:2};
const NODES=['节点 1 · 槽 0–5460','节点 2 · 槽 5461–10922','节点 3 · 槽 10923–16383'];
const RANGES=[[0,69],[70,99],[100,Infinity]];

SDLab.define({
  id:'leaderboard-shard',chapter:25,
  title:'分片以后：Top K 合并、跨片名次与单 key 热点',
  summary:'同一张月榜放进 3 主节点的 Redis Cluster。换一种拆法，看写入落在哪些节点、查询前 K 名要访问几个 key、候选怎样合并，以及查某人的名次要问几次。',
  caveat:'槽位按真实 CRC16 计算，槽区间按 3 主节点的默认均分；哈希分片按 FNV 哈希(「id:」+ 用户名) 取模 3。每条命令算一次往返，不模拟网络延迟、并发更新和一致快照；范围分片的「用户 → 分片」映射只以日志表示。',
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
    const MODES={single:'单个 key（不拆）',hash:'按用户哈希拆成 3 个 key',tag:'拆成 3 个 key，但共用 hash tag',range:'按分数范围拆成 3 个 key'};
    const modeCtl=ctx.segmented({label:'拆分方式',value:S.mode,wide:true,options:Object.entries(MODES),onChange:v=>{S.mode=v;S.load=[0,0,0];S.writes=0;render();clearQ()}});
    const kCtl=ctx.slider({label:'K（取前几名）',min:3,max:10,value:S.K,onChange:v=>{S.K=v}});
    ctx.button('查全局 Top K',()=>go(topK),{primary:true});
    ctx.button('查 mary1934 的名次',()=>go(myRank));
    ctx.button('一轮比赛写入（12 次 ZINCRBY）',()=>go(writes));
    const go=f=>{f().catch(()=>{})};

    const cmdBox=h('div',{class:'lb-cmd','aria-live':'polite'});
    const res=h('div',{class:'sdl-panel'},h('div',{class:'ph'},'协调服务的结果'),h('div',{class:'ls-res'}));
    const nodesBox=h('div',{class:'ls-nodes'});
    ctx.stage.append(cmdBox,res,nodesBox);
    const st=ctx.stats([{key:'keys',label:'本次访问的 key'},{key:'rt',label:'往返次数'},{key:'cand',label:'收到的候选'},{key:'hot',label:'写入最热节点占比'}]);
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
        if(!ks.length)box.append(h('div',{class:'ls-empty'},'没有本榜单的 key'));
        for(const k of ks){const ms=members(k),show=S.mode==='single'?8:5;
          const kb=h('div',{class:'ls-key'+(mark.q.has(k)?' q':'')},h('div',{class:'kn'},k+' · 槽 '+slotOf(k)));
          const lim=Math.max(show,ms.findIndex(x=>mark.hl.has(x[0])||mark.pick.has(x[0]))+1);
          ms.slice(0,lim).forEach(([n,s])=>{const r=h('div',{class:'ls-r'+(mark.pick.has(n)?' pick':mark.hl.has(n)?' hl':'')+(n===ME?' me':'')},h('span',null,n),h('span',null,s));rowEls.set(n,r);kb.append(r)});
          if(ms.length>lim)kb.append(h('div',{class:'ls-more'},`… 共 ${ms.length} 人`));
          keyEls.set(k,kb);box.append(kb)}
        const pct=tot?S.load[ni]/tot:0;
        box.append(h('div',{class:'ls-load'},h('i',{style:{width:pct*100+'%'}})),h('div',{class:'ls-lt'},tot?`写入 ${S.load[ni]} 次（${util.pct(pct,0)}）`:'写入 0 次'));
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
        cmd(`节点 ${nodeOf(k)+1}：ZREVRANGE ${k} 0 ${n-1} WITHSCORES`,`${ms.length} 人`);render();st.set('keys',used.length+' 个');st.set('rt',rt+' 次');st.set('cand',cand+' 人');await ctx.wait(700);return my===seq?ms.map(x=>[...x,k]):null};
      let out=[];
      if(S.mode==='range'){for(let i=2;i>=0&&out.length<K;i--){const got=await take(keyName('range',i),K-out.length);if(!got)return null;out.push(...got)}
        cmd(`从最高分段往下取，凑够 ${K} 人就停：访问了 ${used.length} 个 key`,null,'n')}
      else{const lists=[];for(const k of keysOf(S.mode)){const got=await take(k,K);if(!got)return null;lists.push(got)}
        if(lists.length>1){const cur=lists.map(()=>0);cmd(`合并 ${lists.length} 条已排序的候选流（共 ${cand} 人）`,null,'n');
          while(out.length<K){let bi=-1;for(let i=0;i<lists.length;i++){const x=lists[i][cur[i]];if(x&&(bi<0||cmp(x,lists[bi][cur[bi]])<0))bi=i}if(bi<0)break;
            const x=lists[bi][cur[bi]++];out.push(x);mark.pick.add(x[0]);render();setRes(out.map(([n,s,k])=>[n,s,short(k)]));await ctx.wait(550);if(my!==seq)return null}}
        else out=lists[0]}
      out.forEach(x=>mark.pick.add(x[0]));render();setRes(out.map(([n,s,k])=>[n,s,S.mode==='single'?null:short(k)]),`访问 ${used.length} 个 key、${rt} 次往返，收到 ${cand} 个候选`);
      ctx.announce(`Top ${K}：`+out.map(x=>x[0]).join('、'));
      return {out,rt,cand,keys:used.length};
    }
    async function myRank(){
      const my=++seq;clearQ();const sc=S.m.get(ME),mine=keyOfUser(ME);let rt=0,higher=0;
      mark.hl.add(ME);
      const step=async(k,c,v,txt)=>{rt++;mark.q.add(k);cmd(`节点 ${nodeOf(k)+1}：${c}`,txt);higher+=v;render();st.set('rt',rt+' 次');st.set('keys',mark.q.size+' 个');await ctx.wait(800);return my===seq};
      if(S.mode==='range'){
        const i=+mine.slice(-1),inK=members(mine).filter(x=>x[1]>sc).length;if(!await step(mine,`ZCOUNT ${mine} (${sc} +inf`,inK,`(integer) ${inK}`))return null;
        for(let j=i+1;j<3;j++){const k=keyName('range',j),c=members(k).length;if(!await step(k,`ZCARD ${k}`,c,`(integer) ${c}（整段都比她高）`))return null}
      }else for(const k of keysOf(S.mode)){const c=members(k).filter(x=>x[1]>sc).length;if(!await step(k,`ZCOUNT ${k} (${sc} +inf`,c,`(integer) ${c}`))return null}
      cmd(`竞赛名次 = 1 + ${higher} = ${higher+1}`,null,'n');setRes([[ME,sc,'第 '+(higher+1)+' 名']],`问了 ${rt} 次`);st.set('cand','—');
      return {rank:higher+1,rt};
    }
    async function writes(){
      const my=++seq;clearQ();const r=util.rng(25+S.writes),names=[...S.m.keys()];
      for(let i=0;i<12;i++){const n=names[Math.floor(r()*names.length)],before=keyOfUser(n),v=S.m.get(n)+1;S.m.set(n,v);const after=keyOfUser(n),node=nodeOf(after);
        S.load[node]++;S.writes++;mark.hl=new Set([n]);
        if(before!==after){cmd(`${n} ${v-1} → ${v} 跨过分段：ZREM ${before} ${n}；ZADD ${after} ${v} ${n}；更新映射`,null,'n');ctx.log(`${n} 跨分段迁移：${before} → ${after}`,'warn')}
        else cmd(`节点 ${node+1}：ZINCRBY ${after} 1 ${n}`,`"${v}"`);
        render();await ctx.wait(260);if(my!==seq)return}
      mark.hl=new Set();render();
    }
    render();

    function prep(mode){S.m=new Map(BASE);S.mode=mode;modeCtl.set(mode,true);S.load=[0,0,0];S.writes=0;S.K=3;kCtl.set(3,true);clearQ()}
    ctx.scenarios([
      {id:'hotkey',label:'一个大 ZSET 只在一个节点',
        ask:'集群有 3 个主节点。整张月榜是一个 key 时，写入会分到几个节点？拆成 board:2026-09:s0/s1/s2 呢？如果写成 {board:2026-09}:s0 这种共用 hash tag 的名字呢？',
        insight:'单个 key 落在槽 10877，12 次写入 100% 打到节点 2。拆成 :s0/:s1/:s2 后分别落在槽 12488、8425、4234，同样 12 次写入分到三个节点（3 / 4 / 5 次）。共用 hash tag 时只按花括号里的 board:2026-09 算槽，三个 key 全在槽 10877，又回到节点 2 一家。Cluster 分的是 key，把一个逻辑榜单拆成多个 key 是应用的工作',
        async run(){prep('single');await writes();await ctx.wait(1000);prep('hash');await writes();await ctx.wait(1000);prep('tag');await writes();await ctx.wait(1200)}},
      {id:'merge',label:'哈希分片：Top 3 散集-合并',
        ask:'3 个分片各自只返回本片前 3，协调服务合并后一定是全局前 3 吗？要收多少个候选？',
        insight:'每片返回 3 人，共 9 个候选，合并出 alice 131、bob 128、amy 128，与不分片时一致；这次三人恰好都在 s2，另两片的 6 个候选全部落选。反证：若某人连本片前 3 都进不了，本片已有 3 人排在他前面，他不可能进全局前 3。前提是各片与合并用同一套排序规则（分数降序、同分按成员）。代价是每次都要问遍所有分片，候选数是分片数 × K',
        async run(){prep('hash');await topK();await ctx.wait(1500)}},
      {id:'rank',label:'跨片查个人名次',
        ask:'mary1934 有 63 分。哈希分片下，查她的竞赛名次要问几个分片？按分数范围分片呢？',
        insight:'哈希分片要对 3 个 key 各做一次 ZCOUNT (63 +inf，把严格更高的人数加起来：21 人，第 22 名。范围分片同样问了 3 次：在自己的分段 r0 里 ZCOUNT 得 3 人，再对更高的两段 ZCARD 得 6 和 12 人，合计 21。范围分片的好处在 Top K：最高分段够 K 人时只查一个 key；代价是玩家分数跨段时要迁移成员、更新映射（写入时日志里的「跨过分段」）。',
        async run(){prep('hash');await myRank();await ctx.wait(1500);prep('range');await myRank();await ctx.wait(1200);await topK();await ctx.wait(1200)}},
      {id:'tie',label:'边界并列：前 K 人 ≠ 名次含并列',
        ask:'同一片里有 4 人都是 140 分，K = 3。按「各片取前 3 再合并」得到几人？如果产品要「前 3 名里的所有并列者」呢？',
        insight:'合并只返回 lily、ken、ivan 3 人，同为 140 分的 fay 排在第 4 被漏掉：本地 Top K 能保证「前 K 个人」，不保证「名次含所有并列者」。改法是先求第 K 个位置的分数阈值 140，再向各片取所有不低于阈值的人（ZREVRANGEBYSCORE key +inf 140），这次取回 4 人。若产品要前 K 个不同分数档位，又是另一种阈值算法',
        async run(){prep('hash');const k0=keyName('hash',0),four=members(k0).slice(0,4).map(x=>x[0]);four.forEach(n=>S.m.set(n,140));render();
          cmd(`（${four.join('、')} 都设为 140 分，同在 ${k0}）`,null,'n');await ctx.wait(1400);const r=await topK();if(!r)return;await ctx.wait(1400);
          const th=r.out[r.out.length-1][1];let all=[];for(const k of keysOf('hash')){const ms=members(k).filter(x=>x[1]>=th);mark.q.add(k);cmd(`节点 ${nodeOf(k)+1}：ZREVRANGEBYSCORE ${k} +inf ${th}`,`${ms.length} 人`);all.push(...ms.map(x=>[...x,k]));all.forEach(x=>mark.pick.add(x[0]));render();await ctx.wait(700)}
          all.sort(cmp);setRes(all.map(([n,s,k])=>[n,s,short(k)]),`按阈值 ${th} 取回 ${all.length} 人`);await ctx.wait(1500)}},
    ]);
  }
});
})();
