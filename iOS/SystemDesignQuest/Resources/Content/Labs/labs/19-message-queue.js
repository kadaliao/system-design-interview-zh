/* 第 19 章：分布式消息队列。实验一：消费组的分区分配、重平衡与 offset 提交时机；实验二：副本、ISR 与 ACK。 */
(function(){
const {el:h,util}=SDLab;
const DT=0.05;
/* 固定步长推进：结果与帧率无关；暂停时停掉动画循环。 */
function runner(ctx,step,draw){
  let acc=0,da=1;const r={speed:1};
  r.lp=ctx.loop(dt=>{acc+=dt*r.speed;let n=0;while(acc>=DT&&n<80){acc-=DT;step();n++}da+=dt;if(da>=1/30){da=0;draw()}},false);
  r.set=v=>{r.speed=v;if(v)r.lp.start();else{r.lp.stop();draw()}};
  return r;
}
const until=async(ctx,cond)=>{let n=0;while(!cond()&&n<1200){await ctx.wait(50);n++}};

/* ---------------- 实验一：消费组 ---------------- */
SDLab.define({
  id:'mq-consumer-group',chapter:19,
  title:'消费组：分区分配、重平衡与 offset 提交',
  summary:'生产者按 key 把消息写进分区，同一消费组的消费者分摊分区。加入、退出或让消费者崩溃，看重平衡怎样交接分区；切换 offset 的提交时机，看崩溃后是丢消息还是重复处理。',
  caveat:'每个消费者一次拉一批、逐条处理；分区按范围（range）策略分配；崩溃的消费者在 1.5 秒心跳超时后被发现；重平衡时存活成员先做完手头这批再交出分区。offset 指下一条要读的位置。时间为模拟秒。',
  mount(ctx){
    ctx.css('cg',`
.cg-status{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13px;margin-bottom:6px}
.cg-keys{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center;font-size:12px;color:#66756d;margin-bottom:8px}
.cg-keys code{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:#f0f4ed;border-radius:5px;padding:0 5px;color:#23352f}
.cg-rows{display:flex;flex-direction:column;gap:5px}
.cg-row{display:grid;grid-template-columns:28px minmax(0,1fr) 92px;gap:6px;align-items:center}
.cg-pn{font-weight:700;font-size:13px}
.cg-cells{display:flex;gap:2px;overflow:hidden;padding:7px 0 0 4px}
.cg-c{flex:none;width:34px;height:34px;border:1px solid #cfd8cc;border-radius:5px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.15;font-size:11.5px;font-weight:650;position:relative;color:#23352f;letter-spacing:-.2px}
.cg-c small{font-size:11px;font-weight:400;color:#66756d}
.cg-c.e{border-style:dashed;background:transparent;border-color:#dbe2da}
.cg-c.ok{background:#dcefe2;border-color:#9fcfb0;color:#1d6a41}
.cg-c.dup{background:#f6ead2;border-color:#dfbf85;color:#86561a}
.cg-c.lost{background:#f7dedb;border-color:#e3aaa4;color:#9b2c27}
.cg-c.lost b{text-decoration:line-through}
.cg-c.b{border:2px dashed #2f6fb3}
.cg-c.cur{border:2px solid #2f6fb3;background:#dde9f6;color:#24558a}
.cg-c.cm::before{content:'';position:absolute;left:-4px;top:-5px;bottom:-3px;width:3px;border-radius:2px;background:#23352f}
.cg-c .x{position:absolute;top:-7px;right:-4px;font-size:11px;font-style:normal;line-height:1.25;background:#b7791f;color:#fff;border-radius:6px;padding:0 3px;font-weight:700}
.cg-c .x:empty{display:none}
.cg-side{font-size:12px;line-height:1.4;color:#66756d;white-space:nowrap}
.cg-own{display:inline-block;color:#fff;border-radius:5px;padding:0 6px;font-weight:700;margin-right:4px}
.cg-legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:#66756d;margin:8px 0 4px}
.cg-legend i{display:inline-block;width:12px;height:12px;border-radius:3px;border:1px solid #cfd8cc;margin-right:4px;vertical-align:-2px}
.cg-trail{display:flex;flex-wrap:wrap;gap:3px;align-items:center;font-size:12px;margin:6px 0 2px;color:#66756d}
.cg-trail span{font-family:ui-monospace,Menlo,monospace;border-radius:4px;padding:0 4px;background:#dcefe2;color:#1d6a41}
.cg-trail span.o{background:#f7dedb;color:#9b2c27;font-weight:700}
.cg-trail span.d{background:#f6ead2;color:#86561a}
.cg-trail span.s{background:none;color:#66756d;font-family:inherit}
.cg-cons{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:10px}
.cg-card{border:1px solid #dbe2da;border-top:4px solid var(--c);border-radius:10px;padding:6px 9px 8px;background:#fbfcfa;font-size:12px;line-height:1.5;min-width:0}
.cg-card.off{opacity:.55}
.cg-ch{display:flex;justify-content:space-between;gap:6px;align-items:center;font-size:13px}
.cg-bar{height:5px;background:#e6eee2;border-radius:3px;overflow:hidden;margin:3px 0 5px}
.cg-bar i{display:block;height:100%;background:#2f6fb3}
.cg-card .cg-btns{display:flex;gap:5px}
.cg-card .cg-btns button{font-size:12px;padding:1px 9px}
.cg-muted{color:#66756d}
.cg-narrow .cg-row{grid-template-columns:28px minmax(0,1fr);row-gap:0}
.cg-narrow .cg-side{grid-column:2;display:flex;gap:10px;align-items:center}
`);
    const C=ctx.colors,TRACK='A',KEYS='ABCDEFGH'.split(''),TIMEOUT=1.5,SYNC=0.6;
    const CCOL=[C.series[0],C.series[3],C.series[4],C.series[5],'#8a6d3b','#56708f'];
    const P={parts:4,rate:2.5,proc:0.5,batch:3,commit:'after',keyMode:'key',hotA:0};
    let S,K=10,W=600,rows=[],cards={},consKey='',keysKey='',trailVer=-1;
    const L=(t,tone)=>{if(!S.quiet)ctx.log(`[${S.t.toFixed(1)}s] `+t,tone)};
    const live=()=>S.cons.filter(c=>c.st==='live');
    const lag=()=>S.parts.reduce((s,p)=>s+p.log.length-p.committed,0);

    function fresh(nc){
      S={t:0,parts:[],cons:[],phase:'stable',syncAt:0,det:[],acc:0,rr:0,rng:util.rng(19),seq:{},max:{},trail:[],tv:0,nid:1,processed:0,dups:0,lost:0,ooo:0,agenda:[],quiet:false};
      for(let i=0;i<P.parts;i++)S.parts.push({log:[],committed:0,owner:null});
      for(const k of KEYS){S.seq[k]=0;S.max[k]=0}
      for(let i=0;i<nc;i++)newCons();
      assign(true);ctx.clearLog();
    }
    function newCons(){const c={id:'C'+S.nid,color:CCOL[(S.nid-1)%CCOL.length],st:'live',parts:[],batch:null,rr:0,leaving:false};S.nid++;S.cons.push(c);return c}
    /* 范围分配：分区按编号切成连续的段，依次分给按编号排序的成员；成员多于分区时多出来的空闲。 */
    function assign(quiet){
      for(const c of S.cons){if(c.leaving){c.st='left';c.leaving=false}if(c.st==='dead')c.st='gone';c.parts=[]}
      const mem=live();S.parts.forEach(p=>p.owner=null);
      let pi=0;mem.forEach((c,i)=>{const k=Math.floor(P.parts/mem.length)+(i<P.parts%mem.length?1:0);for(let j=0;j<k;j++){c.parts.push(pi);S.parts[pi].owner=c;pi++}});
      S.det=[];
      if(!quiet)L('分配完成：'+mem.map(c=>c.id+' → '+(c.parts.length?c.parts.map(x=>'P'+x).join(','):'无分区')).join('；'),'ok');
    }
    function rebalance(why){L((S.phase==='stable'?'触发重平衡：':'重平衡中又有变化：')+why,'warn');S.phase='wait'}
    function join(){if(live().length>=6)return;const c=newCons();rebalance(c.id+' 请求加入')}
    function leave(c){if(c.st!=='live'||c.leaving)return;c.leaving=true;rebalance(c.id+' 主动退出')}
    function crash(c){
      if(c.st!=='live')return;c.st='dead';const b=c.batch;
      if(b&&b.mode==='before'){const lost=[];for(let i=b.idx;i<b.to;i++){const m=S.parts[b.pi].log[i];if(!m.count){m.lost=true;S.lost++;lost.push('#'+i)}}L(`${c.id} 崩溃。P${b.pi} 的 ${lost.join('、')} 已提交却没处理，之后没人会再读它们`,'bad')}
      else if(b){const done=b.idx-b.from;L(`${c.id} 崩溃。P${b.pi} 这批 #${b.from}–${b.to-1} 还没提交`+(done?`，已处理的 ${done} 条会被接手者重复处理`:''),'bad')}
      else L(c.id+' 崩溃','bad');
      c.batch=null;S.det.push({c,at:S.t+TIMEOUT});
    }
    function produce(key){
      const seq=++S.seq[key],pi=P.keyMode==='key'?util.hash(key)%P.parts:(S.rr++)%P.parts;
      const p=S.parts[pi];p.log.push({key,seq,p:pi,off:p.log.length,count:0});
    }
    function handle(m,c){
      m.count++;
      if(m.count>1){S.dups++;L(`${c.id} 重复处理 P${m.p} #${m.off}（${m.key}${m.seq}）`,'warn')}
      else{S.processed++;if(m.seq<S.max[m.key]){S.ooo++;m.ooo=true}else S.max[m.key]=m.seq}
      if(m.key===TRACK){S.trail.push({t:m.key+m.seq,c:m.count>1?'d':m.ooo?'o':''});if(S.trail.length>24)S.trail.shift();S.tv++}
    }
    function step(){
      S.t+=DT;
      S.acc+=P.rate*DT;while(S.acc>=1){S.acc-=1;produce(P.hotA&&S.rng()<P.hotA?TRACK:S.rng.pick(KEYS))}
      for(const d of S.det.slice())if(S.t>=d.at){S.det.splice(S.det.indexOf(d),1);if(d.c.st==='dead')rebalance(d.c.id+' 心跳超时')}
      if(S.phase==='wait'&&!live().some(c=>c.batch)){S.phase='sync';S.syncAt=S.t+SYNC}
      else if(S.phase==='sync'&&S.t>=S.syncAt){assign();S.phase='stable'}
      for(const c of live()){
        const b=c.batch;
        if(!b){
          if(S.phase!=='stable'||c.leaving)continue;
          for(let k=0;k<c.parts.length;k++){
            const pi=c.parts[(c.rr+k)%c.parts.length],p=S.parts[pi];
            if(p.committed<p.log.length){
              c.rr=(c.rr+k+1)%c.parts.length;
              const to=Math.min(p.log.length,p.committed+P.batch),nb={pi,from:p.committed,to,idx:p.committed,t:0,mode:P.commit};c.batch=nb;
              if(nb.mode==='before'){p.committed=to;L(`${c.id} 拉取 P${pi} #${nb.from}–${to-1}，立即提交 offset=${to}`)}
              else L(`${c.id} 拉取 P${pi} #${nb.from}–${to-1}`);
              break;
            }
          }
          continue;
        }
        b.t+=DT;
        if(b.t>=P.proc-1e-9){
          handle(S.parts[b.pi].log[b.idx],c);b.idx++;b.t=0;
          if(b.idx>=b.to){if(b.mode==='after'){const p=S.parts[b.pi];p.committed=Math.max(p.committed,b.to);L(`${c.id} 处理完 P${b.pi} #${b.from}–${b.to-1}，提交 offset=${b.to}`)}c.batch=null}
        }
      }
      for(const a of S.agenda.slice())if(a.at!=null?S.t>=a.at-1e-9:a.when()){S.agenda.splice(S.agenda.indexOf(a),1);a.fn()}
    }

    /* ---- 舞台 ---- */
    const status=h('div',{class:'cg-status'}),keys=h('div',{class:'cg-keys'}),rowsBox=h('div',{class:'cg-rows'});
    const lg=(cls,txt,style)=>h('span',null,h('i',{class:cls||null,style}),txt);
    const legend=h('div',{class:'cg-legend'},lg('','未处理'),lg('',"当前批次",{border:'2px dashed #2f6fb3'}),lg('','正在处理',{background:'#dde9f6',border:'2px solid #2f6fb3'}),lg('','已处理',{background:'#dcefe2',borderColor:'#9fcfb0'}),lg('','重复处理',{background:'#f6ead2',borderColor:'#dfbf85'}),lg('','丢失',{background:'#f7dedb',borderColor:'#e3aaa4'}),lg('','已提交 offset（下一条要读的位置）',{width:'3px',background:'#23352f',border:0}));
    const trail=h('div',{class:'cg-trail'}),consBox=h('div',{class:'cg-cons'});
    ctx.stage.append(status,keys,rowsBox,legend,trail,consBox);
    const st=ctx.stats([{key:'lag',label:'积压（未提交）'},{key:'done',label:'已处理'},{key:'dup',label:'重复处理'},{key:'lost',label:'丢失'},{key:'ooo',label:'同 key 乱序'}]);

    const calcK=()=>Math.max(5,Math.min(22,Math.floor((W<560?W-28-6-4:W-28-92-12-4)/36)));
    function buildRows(){
      K=calcK();rowsBox.classList.toggle('cg-narrow',W<560);
      rowsBox.replaceChildren();
      rows=S.parts.map((p,i)=>{
        const cells=[],box=h('div',{class:'cg-cells'});
        for(let j=0;j<K;j++){const a=h('b'),b=h('small'),x=h('i',{class:'x'}),el=h('div',{class:'cg-c'},a,b,x);box.append(el);cells.push({el,a,b,x,k:''})}
        const own=h('span',{class:'cg-own'}),s1=h('span'),s2=h('div');
        rowsBox.append(h('div',{class:'cg-row'},h('div',{class:'cg-pn'},'P'+i),box,h('div',{class:'cg-side'},h('div',null,own,s1),s2)));
        return {cells,own,s1,s2};
      });
    }
    function buildCards(){
      consBox.replaceChildren();cards={};
      for(const c of S.cons){
        const tag=h('span',{class:'sdl-tag'}),parts=h('div'),bat=h('div'),cm=h('div',{class:'cg-muted'}),bar=h('i');
        const bx=h('button',{type:'button',onclick:()=>{leave(c);draw()}},'退出'),bc=h('button',{type:'button',class:'danger',onclick:()=>{crash(c);draw()}},'崩溃');
        const el=h('div',{class:'cg-card',style:{'--c':c.color}},h('div',{class:'cg-ch'},h('b',null,c.id),tag),parts,bat,h('div',{class:'cg-bar'},bar),cm,h('div',{class:'cg-btns'},bx,bc));
        consBox.append(el);cards[c.id]={el,tag,parts,bat,cm,bar,bx,bc};
      }
    }
    function draw(){
      if(rows.length!==S.parts.length)buildRows();
      const inb={};for(const c of live())if(c.batch)inb[c.batch.pi]=c.batch;
      S.parts.forEach((p,i)=>{
        const r=rows[i],len=p.log.length,start=Math.max(0,Math.min(p.committed-2,len+1-K)),ib=inb[i];
        for(let j=0;j<K;j++){
          const off=start+j,m=p.log[off],cell=r.cells[j];
          let cls='cg-c',a='',b=off<=len?'#'+off:'',x='';
          if(!m)cls+=' e';
          else{
            a=m.key+m.seq;
            if(m.lost)cls+=' lost';else if(m.count>1){cls+=' dup';x='×'+m.count}else if(m.count)cls+=' ok';
            if(ib&&off>=ib.idx&&off<ib.to)cls+=off===ib.idx?' cur':' b';
          }
          if(off===p.committed)cls+=' cm';
          const key=cls+a+b+x;
          if(key!==cell.k){cell.k=key;cell.el.className=cls;cell.a.textContent=a;cell.b.textContent=b;cell.x.textContent=x;cell.el.title=m?`P${i} offset ${off}：${a}`:''}
        }
        const o=p.owner;
        r.own.textContent=o?o.id+(o.st==='live'?'':'✕'):'无';r.own.style.background=o?(o.st==='live'?o.color:C.bad):'#9aa89f';
        r.s1.textContent='积压 '+(len-p.committed);r.s2.textContent='已提交 #'+p.committed;
      });
      // 状态行
      let tag,txt,tone;
      if(S.phase==='wait'){const busy=live().filter(c=>c.batch).map(c=>c.id);tag='重平衡';tone='warn';txt='等成员做完手头这批再交出分区'+(busy.length?'（'+busy.join('、')+' 还在处理）':'')}
      else if(S.phase==='sync'){tag='重平衡';tone='warn';txt='组 Leader 计算分配方案，协调器下发给所有成员'}
      else{const dead=S.cons.filter(c=>c.st==='dead');if(dead.length){tag='等心跳超时';tone='bad';txt=dead.map(c=>c.id).join('、')+' 已崩溃，协调器还没发现，它的分区没人读'}else{tag='稳定';tone='ok';txt='同组内每个分区同一时刻只归一个消费者'}}
      if(status.k!==tag+txt){status.k=tag+txt;status.replaceChildren(h('span',{class:'sdl-tag '+tone},tag),h('span',null,txt))}
      const kk=P.keyMode+P.parts;
      if(kk!==keysKey){keysKey=kk;keys.replaceChildren(...(P.keyMode==='key'?[h('span',null,`分区 = hash(key) % ${P.parts}：`),...KEYS.map(k=>h('code',null,k+'→P'+util.hash(k)%P.parts))]:[h('span',null,'无 key：依次轮流写入 '+S.parts.map((_,i)=>'P'+i).join(' → '))]))}
      if(S.tv!==trailVer){trailVer=S.tv;trail.replaceChildren(h('span',{class:'s'},'用户 A 的消息完成顺序：'),...(S.trail.length?S.trail.map(x=>h('span',{class:x.c||null},x.t)):[h('span',{class:'s'},'（还没有）')]))}
      const ck=S.cons.map(c=>c.id).join();if(ck!==consKey){consKey=ck;buildCards()}
      for(const c of S.cons){
        const d=cards[c.id],b=c.batch;let t,tone2=null;
        if(c.st==='dead'){t='已崩溃';tone2='bad'}else if(c.st==='gone'){t='崩溃·已移出组';tone2='bad'}else if(c.st==='left'){t='已退出'}
        else if(c.leaving){t='退出中';tone2='warn'}else if(b){t='处理中';tone2='info'}else if(S.phase!=='stable'){t='等待分配';tone2='warn'}else if(!c.parts.length){t='空闲：没分到分区';tone2='warn'}else t='等新消息';
        d.tag.textContent=t;d.tag.className='sdl-tag'+(tone2?' '+tone2:'');
        d.parts.textContent='分区：'+(c.parts.length?c.parts.map(x=>'P'+x).join(' '):'—');
        d.bat.textContent=b?`P${b.pi} #${b.from}${b.to-1>b.from?'–'+(b.to-1):''}，第 ${b.idx-b.from+1}/${b.to-b.from} 条`:'当前批次：—';
        d.cm.textContent=b?(b.mode==='before'?`offset 已提前提交到 #${b.to}`:`offset 仍停在 #${b.from}`):' ';
        d.bar.style.width=b?Math.min(100,(b.idx-b.from+Math.min(1,b.t/P.proc))/(b.to-b.from)*100)+'%':'0%';
        d.el.classList.toggle('off',c.st!=='live');d.bx.disabled=d.bc.disabled=c.st!=='live'||c.leaving;
      }
      st.set('lag',lag(),lag()>12?'warn':null);st.set('done',S.processed,'ok');st.set('dup',S.dups,S.dups?'warn':null);st.set('lost',S.lost,S.lost?'bad':null);st.set('ooo',S.ooo,S.ooo?'bad':null);
    }

    /* ---- 控件 ---- */
    const commitCtl=ctx.segmented({label:'offset 提交时机',value:P.commit,wide:true,options:[['after','整批处理完再提交（至少一次）'],['before','拉到就提交（最多一次）']],onChange:v=>{P.commit=v;draw()}});
    const keyCtl=ctx.segmented({label:'分区方式',value:P.keyMode,options:[['key','按 key 哈希'],['none','无 key 轮询']],onChange:v=>{P.keyMode=v;draw()}});
    const speedCtl=ctx.segmented({label:'播放',value:1,options:[[0,'暂停'],[1,'1×'],[2,'2×']],onChange:v=>run.set(v)});
    const sRate=ctx.slider({label:'生产速度',min:0,max:6,step:0.5,value:P.rate,format:v=>v+' 条/秒',onInput:v=>{P.rate=v}});
    const sProc=ctx.slider({label:'每条处理耗时',min:0.2,max:1.5,step:0.1,value:P.proc,format:v=>v.toFixed(1)+' 秒',onInput:v=>{P.proc=v}});
    const sBatch=ctx.slider({label:'每批拉取条数',min:1,max:5,value:P.batch,onInput:v=>{P.batch=v}});
    const sParts=ctx.slider({label:'分区数（改动后重来）',min:2,max:6,value:P.parts,onChange:v=>{P.parts=v;restart()}});
    ctx.button('加入一个消费者',()=>{join();draw()},{primary:true});
    ctx.button('清空重来',()=>restart());
    const run=runner(ctx,step,draw);

    function restart(nc){fresh(nc||Math.max(1,live().length));S.quiet=true;for(let i=0;i<50;i++)step();S.quiet=false;buildRows();draw()}
    fresh(2);S.quiet=true;for(let i=0;i<60;i++)step();S.quiet=false;
    ctx.onResize(w=>{W=w;if(calcK()!==K||!rows.length||rowsBox.classList.contains('cg-narrow')!==(W<560))buildRows();draw()});
    run.set(1);

    function prepare(o){
      Object.assign(P,{parts:4,rate:0,proc:0.5,batch:3,commit:'after',keyMode:'key',hotA:0},o.P||{});
      commitCtl.set(P.commit,true);keyCtl.set(P.keyMode,true);sRate.set(P.rate,true);sProc.set(P.proc,true);sBatch.set(P.batch,true);sParts.set(P.parts,true);speedCtl.set(1,true);
      fresh(o.cons);if(o.fill)for(let i=0;i<o.fill;i++)produce(KEYS[i%4]);
      buildRows();run.set(1);draw();
    }
    const idle=()=>lag()===0&&!live().some(c=>c.batch)&&S.phase==='stable';
    ctx.scenarios([
      {id:'join',label:'消费者逐个加入',
        ask:'4 个分区，每秒生产 3.5 条，每个消费者每秒只能处理 2 条。消费者从 1 个逐个加到 5 个：第 5 个能分到几个分区？每次有人加入时，积压会怎样变化？',
        insight:'第 5 个消费者分不到分区，只能空闲：同组内一个分区同一时刻只归一个消费者，活跃成员最多等于分区数。只有 C1 时它追不上生产，积压很快涨到 8 以上。每次有人加入都会重平衡：成员先做完手头这批，再停下来等新的分配方案，这段时间整组不拉新消息，积压先抬头（最高约 14）再回落。3 个消费者分 4 个分区时 C1 要管两个，负载并不均匀；到 4 个各管一个，积压才回落到 5 左右。',
        async run(){prepare({P:{rate:3.5,proc:0.5,batch:2},cons:1});for(const at of [4,8,12,15])S.agenda.push({at,fn:join});await until(ctx,()=>S.t>=18.5)}},
      {id:'before',label:'拉到就提交，随后崩溃',
        ask:'两个分区各有 6 条消息，C1 负责 P0。每批拉 3 条，拉到就提交 offset。C1 处理完 #0、正在处理 #1 时崩溃。接手的消费者从 P0 的哪个 offset 开始读？有几条消息永远不会被处理？',
        insight:'offset 在拉取时已提交到 #3。C1 心跳超时后触发重平衡，C2 接手 P0，从 #3 开始读，#1 和 #2 永远没人处理（红色）。这就是最多一次（at-most-once）：不会重复，但可能丢。',
        async run(){prepare({P:{parts:2,proc:0.6,commit:'before'},cons:2,fill:12});S.agenda.push({when:()=>{const b=S.cons[0].batch;return b&&b.idx===b.from+1&&b.t>=0.3},fn:()=>crash(S.cons[0])});await until(ctx,()=>S.t>3&&idle());await ctx.wait(600)}},
      {id:'after',label:'处理完再提交，随后崩溃',
        ask:'同样的数据和崩溃时机，但改成整批处理完才提交 offset。这次 C2 从哪里读？会丢消息吗？有几条会被处理两次？',
        insight:'崩溃时 P0 的 offset 还停在 #0，C2 接手后从 #0 重读这一批：没有丢消息，但 #0 被处理了两次（琥珀色 ×2）。这就是至少一次（at-least-once）：不漏，但会重复，业务要用事件 ID 或唯一约束做幂等。把提交挪到处理之前或之后，只能在丢和重之间选，得不到端到端的恰好一次。',
        async run(){prepare({P:{parts:2,proc:0.6,commit:'after'},cons:2,fill:12});S.agenda.push({when:()=>{const b=S.cons[0].batch;return b&&b.idx===b.from+1&&b.t>=0.3},fn:()=>crash(S.cons[0])});await until(ctx,()=>S.t>3&&idle());await ctx.wait(600)}},
      {id:'order',label:'按 key 保序与无 key',
        ask:'用户 A 很活跃，一半的消息都是它的；两个消费者各管 2 个分区。按 key 哈希时，A 的消息会按发送顺序处理完吗？中途改成无 key 轮询写入后呢？',
        insight:'按 key 哈希时 A 的消息全在 P0，由 C1 按 offset 顺序处理，完成顺序与发送顺序一致；代价是热门 key 让 P0 一度积压 6 条。改成轮询后负载分散了，但 A 的消息落到 4 个分区、由两个消费者并行处理，积压少的分区先处理完，红色就是晚发的消息先完成，「同 key 乱序」开始上涨。顺序只在单个分区内保证，需要保序的消息要用同一个 key。',
        async run(){prepare({P:{rate:4,proc:0.45,hotA:0.5},cons:2});S.agenda.push({at:5.5,fn:()=>{P.keyMode='none';keyCtl.set('none',true);S.trail.push({t:'｜改为无 key｜',c:'s'});S.tv++;L('生产者改为无 key 轮询写入','info')}});await until(ctx,()=>S.t>=12)}},
    ]);
  }
});

/* ---------------- 实验二：副本、ISR 与 ACK ---------------- */
SDLab.define({
  id:'mq-isr-acks',chapter:19,
  title:'副本、ISR 与 ACK：Leader 宕机时丢不丢',
  summary:'一个分区有 3 个副本：生产者只写 Leader，Follower 主动拉取。切换 ACK=0/1/all，让副本卡住或让 Leader 宕机，看哪些消息「确认了」却丢了，确认又要等多久。',
  caveat:'ISR 按原文的「最多落后 N 条」判断（replica.lag.max.messages，新版 Kafka 改为按落后时间）；Follower 每 0.5 秒拉取一次，Leader 在拉取到达时就知道它的进度；Leader 失联 0.8 秒后从存活的 ISR 成员中按编号选新 Leader；min.insync.replicas 只约束 ACK=all 的写入。时间是慢放的模拟秒，只看相对长短。',
  mount(ctx){
    ctx.css('ir',`
.ir-status{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13px;margin-bottom:8px}
.ir-row{display:grid;grid-template-columns:var(--lw,92px) minmax(0,1fr);gap:8px;align-items:center;min-height:34px}
.ir-lab{font-size:13px;font-weight:700;line-height:1.35}
.ir-lab .sdl-tag{font-size:11px;margin:2px 3px 0 0;padding:0 5px}
.ir-cells{display:flex;gap:2px;overflow:hidden}
.ir-c{flex:none;width:30px;height:26px;border:1px solid #cfd8cc;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:650;background:#fff;color:#23352f;letter-spacing:-.2px}
.ir-c.e{border-style:dashed;border-color:#e3e9e1;background:transparent}
.ir-c.c{background:#dcefe2;border-color:#9fcfb0;color:#1d6a41}
.ir-c.u{background:#fff;border-color:#7d8b83}
.ir-c.g{border-style:dashed;border-color:#b9c4bc;color:#9aa89f;background:transparent;font-weight:400}
.ir-c.x{background:#f7dedb;border-color:#e3aaa4;color:#9b2c27;text-decoration:line-through}
.ir-c.p-fly{border:1px dashed #2f6fb3;color:#2f6fb3;background:#fff}
.ir-c.p-pend{border:2px solid #b7791f;color:#86561a;background:#fff}
.ir-c.p-ok{background:#2f8f5b;border-color:#2f8f5b;color:#fff}
.ir-c.p-one{background:#f6ead2;border:2px solid #b7791f;color:#86561a}
.ir-c.p-s0{background:#e6eee2;border-color:#cfd8cc;color:#66756d}
.ir-c.p-rej{border:2px dashed #c2413b;color:#9b2c27;background:#fff}
.ir-c.p-lost{background:#c2413b;border-color:#c2413b;color:#fff;text-decoration:line-through}
.ir-brokers{position:relative;display:flex;flex-direction:column;gap:6px;margin-top:10px;padding-top:16px;border-top:1px solid #e8ede6}
.ir-row.dead .ir-cells{opacity:.6}
.ir-line{position:absolute;top:2px;bottom:-2px;border-left:2px dashed #2f8f5b;pointer-events:none}
.ir-line span{position:absolute;top:-2px;left:3px;font-size:11px;color:#1d6a41;white-space:nowrap;font-weight:650;background:#fff;padding:0 2px;line-height:1.2}
.ir-legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:#66756d;margin:8px 0 0}
.ir-legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:4px;vertical-align:-2px;border:1px solid #cfd8cc}
`);
    const C=ctx.colors;
    const P={ack:'all',minIsr:1,lagMax:3,rate:1.25,unclean:false};
    let S,K=12,Kp=12,W=600,LW=92;
    const L=(t,tone)=>{if(!S.quiet)ctx.log(`[${S.t.toFixed(1)}s] `+t,tone)};
    const has=(b,e)=>b.log[e.off]===e;
    const copies=m=>S.b.filter(b=>b.alive&&m.ents.some(e=>has(b,e))).length;
    const lead=()=>S.leader==null?null:S.b[S.leader];
    function fresh(){
      S={t:0,eid:0,b:[0,1,2].map(i=>({id:i+1,alive:true,stuck:false,log:[],next:0.12+i*0.17,fly:null})),leader:0,last:0,epoch:0,isr:new Set([0,1,2]),committed:0,scan:0,msgs:[],fly:[],n:0,acc:0.6,electAt:null,acked:0,lostOk:0,one:0,rej:0,lat:[],maxLat:0,agenda:[],quiet:false};
    }
    function send(){const m={n:++S.n,ack:P.ack,sent:S.t,st:P.ack==='0'?'s0':'fly',ents:[]};S.msgs.push(m);if(S.msgs.length>300)S.msgs.shift();S.fly.push({m,at:S.t+0.1})}
    function reject(m,msg){m.st='rej';m.retry=S.t+1.2;if(!m.rejd){m.rejd=true;S.rej++;L(msg,'warn')}}
    function ackMsg(m){const cp=copies(m);m.st='ok';const lat=S.t-m.sent+0.1;m.lat=lat;m.cp=cp;S.lat.push(lat);if(S.lat.length>12)S.lat.shift();S.maxLat=Math.max(S.maxLat,lat);S.acked++;if(cp<2)S.one++}
    function arrive(m){
      const Ld=lead();
      if(!Ld||!Ld.alive){if(m.ack==='0'){m.st='lost';S.lostOk++;L(`m${m.n} 发给了已宕机的 Leader，ACK=0 的生产者并不知道`,'bad')}else m.st='wait';return}
      if(m.ack==='all'&&S.isr.size<P.minIsr){reject(m,`m${m.n} 被拒绝：ISR 只剩 ${S.isr.size} 个，少于 min.insync.replicas=${P.minIsr}，生产者稍后重试`);return}
      const e={id:++S.eid,n:m.n,m,off:Ld.log.length};Ld.log.push(e);
      if(m.ents.some(x=>has(Ld,x)))L(`m${m.n} 重试后在日志里出现两次：至少一次会带来重复`,'warn');
      m.ents.push(e);
      if(m.ack==='1')ackMsg(m);else if(m.ack==='all')m.st='pend';
    }
    function truncate(f,Ld){
      let o=0;while(o<f.log.length&&f.log[o]===Ld.log[o])o++;
      if(o<f.log.length){const cut=f.log.splice(o);L(`Broker ${f.id} 截断 ${cut.map(e=>'m'+e.n).join('、')}，与新 Leader 对齐`,'warn')}
      f.fly=null;
    }
    function recount(){const Ld=lead();let c=Ld.log.length;for(const i of S.isr)c=Math.min(c,S.b[i].log.length);S.committed=c;S.scan=c}
    function afterElect(){
      const Ld=lead(),lost=[];
      for(const m of S.msgs)if((m.st==='ok'||m.st==='s0')&&m.ents.length&&!m.ents.some(e=>has(Ld,e))){m.st='lost';S.lostOk++;lost.push('m'+m.n)}
      if(lost.length)L(`生产者以为成功的 ${lost.join('、')} 不在新 Leader 上：永久丢失`,'bad');
      const re=S.msgs.filter(m=>m.st==='pend'||m.st==='wait');
      re.forEach((m,i)=>{m.st='fly';S.fly.push({m,at:S.t+0.1+i*0.04})});
      if(re.length)L(`生产者没收到确认，重试 ${re.map(m=>'m'+m.n).join('、')}`,'info');
    }
    function elect(){
      const old=S.leader;let cand=[...S.isr].filter(i=>S.b[i].alive&&i!==old).sort(),unclean=false;
      if(!cand.length&&P.unclean){cand=[0,1,2].filter(i=>S.b[i].alive).sort((a,b)=>S.b[b].log.length-S.b[a].log.length);unclean=cand.length>0}
      if(!cand.length){S.leader=null;L('ISR 里没有存活的副本。禁止不安全选主，分区暂时不可用，等原 Leader 恢复','bad');return}
      S.leader=cand[0];S.epoch++;const Ld=lead();
      L(unclean?`不安全选主：不在 ISR 里的 Broker ${Ld.id} 当选，它缺的已提交消息会丢`:`Broker ${Ld.id} 从 ISR 中当选新 Leader`,unclean?'bad':'info');
      for(const f of S.b)if(f!==Ld&&f.alive)truncate(f,Ld);
      S.isr=unclean?new Set([S.leader]):new Set([S.leader,...[...S.isr].filter(i=>S.b[i].alive&&i!==S.leader)]);
      recount();afterElect();
    }
    function crashLeader(){const Ld=lead();if(!Ld||!Ld.alive)return;Ld.alive=false;S.last=S.leader;S.isr.delete(S.leader);S.electAt=S.t+0.8;L(`Broker ${Ld.id}（Leader）宕机`,'bad')}
    function restore(){
      let i=S.leader==null&&!S.b[S.last].alive?S.last:S.b.findIndex(b=>!b.alive);if(i<0)return;
      const f=S.b[i];f.alive=true;f.next=S.t+0.3;f.fly=null;
      if(S.leader==null){S.leader=i;S.epoch++;S.isr=new Set([i]);for(const g of S.b)if(g!==f&&g.alive)truncate(g,f);recount();L(`Broker ${f.id} 带着完整日志恢复，重新成为 Leader`,'ok');afterElect();return}
      L(`Broker ${f.id} 重启，作为 Follower 追赶`,'info');truncate(f,lead());
    }
    function toggleStuck(i){const f=S.b[i];f.stuck=!f.stuck;L(f.stuck?`Broker ${f.id} 卡住（例如长时间 GC 或网络抖动），停止拉取`:`Broker ${f.id} 恢复拉取`,f.stuck?'warn':'info')}
    function step(){
      S.t+=DT;const Ld=lead();
      S.acc+=P.rate*DT;while(S.acc>=1){S.acc-=1;send()}
      for(const f of S.fly.slice())if(S.t>=f.at){S.fly.splice(S.fly.indexOf(f),1);arrive(f.m)}
      for(let i=0;i<3;i++){
        const f=S.b[i];if(i===S.leader||!f.alive)continue;
        if(f.fly&&S.t>=f.fly.at){if(f.fly.ep===S.epoch&&Ld&&Ld.alive)f.log=Ld.log.slice(0,Math.max(f.log.length,f.fly.upTo));f.fly=null}
        if(!f.fly&&!f.stuck&&Ld&&Ld.alive&&S.t>=f.next){f.fly={at:S.t+0.2,upTo:Ld.log.length,ep:S.epoch};f.next=S.t+0.5}
      }
      if(Ld&&Ld.alive){
        for(let i=0;i<3;i++){
          if(i===S.leader)continue;const f=S.b[i],lagN=Ld.log.length-f.log.length;
          if(!f.alive){S.isr.delete(i);continue}
          if(S.isr.has(i)&&lagN>P.lagMax){S.isr.delete(i);L(`Broker ${f.id} 落后 ${lagN} 条，超过允许的 ${P.lagMax} 条，移出 ISR`,'warn')}
          else if(!S.isr.has(i)&&lagN===0){S.isr.add(i);L(`Broker ${f.id} 追上 Leader，重新加入 ISR`,'ok')}
        }
        let c=Ld.log.length;for(const i of S.isr)c=Math.min(c,S.b[i].log.length);if(c>S.committed)S.committed=c;
        for(let o=S.scan;o<S.committed;o++){const e=Ld.log[o];if(e&&e.m.st==='pend'&&e.m.ents[e.m.ents.length-1]===e){if(S.isr.size<P.minIsr)reject(e.m,`m${e.m.n} 写入后 ISR 缩到 ${S.isr.size} 个，Leader 返回错误，生产者会重试`);else ackMsg(e.m)}}
        S.scan=Math.max(S.scan,S.committed);
      }
      if(S.electAt!=null&&S.t>=S.electAt){S.electAt=null;elect()}
      for(const m of S.msgs)if(m.st==='rej'&&S.t>=m.retry){m.st='fly';S.fly.push({m,at:S.t+0.1})}
      for(const a of S.agenda.slice())if(a.at!=null?S.t>=a.at-1e-9:a.when()){S.agenda.splice(S.agenda.indexOf(a),1);a.fn()}
    }

    /* ---- 舞台 ---- */
    const status=h('div',{class:'ir-status'});
    const mkRow=(label)=>{const lab=h('div',{class:'ir-lab'}),cells=h('div',{class:'ir-cells'}),row=h('div',{class:'ir-row'},lab,cells);return {row,lab,cells,els:[],label}};
    const prow=mkRow('生产者'),brows=[0,1,2].map(i=>mkRow('Broker '+(i+1)));
    const line=h('div',{class:'ir-line'},h('span',null,'已提交'));
    const bbox=h('div',{class:'ir-brokers'},line,...brows.map(r=>r.row));
    const lg=(style,txt)=>h('span',null,h('i',{style}),txt);
    const legend=h('div',{class:'ir-legend'},
      lg({background:'#dcefe2',borderColor:'#9fcfb0'},'已提交（ISR 都有）'),lg({background:'#fff',borderColor:'#7d8b83'},'已写入未提交'),lg({borderStyle:'dashed',borderColor:'#b9c4bc'},'还没拉到'),lg({background:'#f7dedb',borderColor:'#e3aaa4'},'不在当前 Leader 上'),
      lg({border:'2px solid #b7791f'},'等确认'),lg({background:'#2f8f5b',borderColor:'#2f8f5b'},'已确认'),lg({background:'#f6ead2',border:'2px solid #b7791f'},'已确认但只有 1 份'),lg({background:'#e6eee2'},'ACK=0 不等确认'),lg({border:'2px dashed #c2413b'},'被拒绝，稍后重试'),lg({background:'#c2413b',borderColor:'#c2413b'},'以为成功却丢失'));
    ctx.stage.append(status,prow.row,bbox,legend);
    const st=ctx.stats([{key:'acked',label:'已确认'},{key:'lost',label:'以为成功却丢失'},{key:'one',label:'确认时只有 1 份'},{key:'rej',label:'因 ISR 不足被拒'},{key:'lat',label:'确认等待 平均/最长'},{key:'isr',label:'ISR'}]);
    function build(){
      LW=W<520?70:92;const avail=W-LW-8;K=Math.max(6,Math.min(26,Math.floor(avail/32)));Kp=K;
      for(const r of [prow,...brows]){r.row.style.setProperty('--lw',LW+'px');r.cells.replaceChildren();r.els=[];for(let j=0;j<K;j++){const el=h('div',{class:'ir-c e'});r.cells.append(el);r.els.push({el,k:''})}}
    }
    const ml=n=>n<100?'m'+n:String(n);
    const setCell=(c,cls,txt,title)=>{const k=cls+txt;if(k!==c.k){c.k=k;c.el.className='ir-c '+cls;c.el.textContent=txt;c.el.title=title||''}};
    const PST={fly:['p-fly','在路上'],pend:['p-pend','已写入 Leader，等 ISR 同步'],wait:['p-pend','Leader 不可用，等待重试'],ok:['p-ok','已确认'],s0:['p-s0','ACK=0：发出即当作成功'],rej:['p-rej','被拒绝，稍后重试'],lost:['p-lost','生产者以为成功，但消息已丢失']};
    function draw(){
      const Ld=lead(),Lg=Ld?Ld.log:null;
      // 生产者行
      const ms=S.msgs.slice(-Kp);
      if(prow.k!==P.ack){prow.k=P.ack;prow.lab.replaceChildren('生产者',h('br'),h('span',{class:'sdl-tag info'},'ACK='+P.ack))}
      for(let j=0;j<Kp;j++){const m=ms[j];if(!m){setCell(prow.els[j],'e','');continue}let [cls,tt]=PST[m.st];if(m.st==='ok'&&copies(m)<2){cls='p-one';tt='已确认，但目前只有 1 份副本'}setCell(prow.els[j],cls,ml(m.n),'m'+m.n+'：'+tt)}
      // Broker 行
      const maxLen=Math.max(...S.b.map(b=>b.log.length));const start=Math.max(0,maxLen-K+2);
      S.b.forEach((b,i)=>{
        const r=brows[i],tags=[];
        if(!b.alive)tags.push(['bad','宕机']);else if(i===S.leader)tags.push(['info','Leader']);else if(S.isr.has(i))tags.push(['ok','ISR']);else tags.push(['warn','移出 ISR']);
        if(b.alive&&b.stuck&&i!==S.leader)tags.push(['warn','卡住']);
        const tk=tags.join();if(r.k!==tk){r.k=tk;r.lab.replaceChildren(r.label,h('br'),...tags.map(([t,x])=>h('span',{class:'sdl-tag '+t},x)))}
        r.row.classList.toggle('dead',!b.alive);
        for(let j=0;j<K;j++){
          const o=start+j,e=b.log[o];let cls='e',txt='',tt='';
          if(e){txt=ml(e.n);if(Lg&&Lg[o]!==e){cls='x';tt='不在当前 Leader 的日志里'}else if(o<S.committed){cls='c';tt='已提交'}else{cls='u';tt='已写入，尚未提交'}}
          else if(Lg&&Lg[o]&&b.alive&&i!==S.leader){cls='g';txt=ml(Lg[o].n);tt='Leader 有、这里还没拉到'}
          setCell(r.els[j],cls,txt,`Broker ${b.id} offset ${o}`+(tt?'：'+tt:''));
        }
      });
      const cx=S.committed-start;
      if(Ld&&cx>=0&&cx<=K){line.style.display='';line.style.left=(LW+8+cx*32-2)+'px'}else line.style.display='none';
      // 状态
      let tag,tone,txt;
      if(S.electAt!=null){tag='选主中';tone='warn';txt='Leader 失联，控制器准备从 ISR 中选新 Leader；这期间写入要等待'}
      else if(!Ld){tag='不可用';tone='bad';txt='没有可选的 Leader，写入全部等待重试'}
      else{tag='Leader：Broker '+Ld.id;tone='info';txt=`ISR = {${[...S.isr].sort().map(i=>i+1).join(', ')}}，已提交 ${S.committed} 条`+(P.ack==='all'?`；min.insync.replicas = ${P.minIsr}`:'')}
      if(status.k!==tag+txt){status.k=tag+txt;status.replaceChildren(h('span',{class:'sdl-tag '+tone},tag),h('span',null,txt))}
      const avg=S.lat.length?S.lat.reduce((a,b)=>a+b,0)/S.lat.length:0;
      st.set('acked',S.acked,'ok');st.set('lost',S.lostOk,S.lostOk?'bad':null);st.set('one',S.one,S.one?'warn':null);st.set('rej',S.rej,S.rej?'warn':null);
      st.set('lat',S.lat.length?avg.toFixed(1)+' / '+S.maxLat.toFixed(1)+' 秒':'—');st.set('isr',S.isr.size+' 个',S.isr.size<2?'warn':'ok');
      b2.textContent=S.b[1].stuck?'Broker 2 恢复拉取':'Broker 2 卡住';b3.textContent=S.b[2].stuck?'Broker 3 恢复拉取':'Broker 3 卡住';
      b2.disabled=S.leader===1||!S.b[1].alive;b3.disabled=S.leader===2||!S.b[2].alive;
      bc.disabled=!Ld||!Ld.alive||S.electAt!=null;br.disabled=S.b.every(b=>b.alive);
    }

    /* ---- 控件 ---- */
    const ackCtl=ctx.segmented({label:'生产者的 ACK 设置',value:P.ack,options:[['0','0'],['1','1'],['all','all']],onChange:v=>{P.ack=v;draw()}});
    const speedCtl=ctx.segmented({label:'播放',value:1,options:[[0,'暂停'],[1,'1×'],[2,'2×']],onChange:v=>run.set(v)});
    const sMin=ctx.slider({label:'min.insync.replicas',min:1,max:3,value:P.minIsr,onInput:v=>{P.minIsr=v;draw()},hint:'只约束 ACK=all 的写入'});
    const sLag=ctx.slider({label:'允许落后条数',min:1,max:6,value:P.lagMax,format:v=>v+' 条',onInput:v=>{P.lagMax=v}});
    const sRate=ctx.slider({label:'发送速率',min:0,max:3,step:0.25,value:P.rate,format:v=>v+' 条/秒',onInput:v=>{P.rate=v}});
    const tUnclean=ctx.toggle({label:'允许不安全选主（从 ISR 外选 Leader）',value:P.unclean,onChange:v=>{P.unclean=v}});
    const bc=ctx.button('Leader 宕机',()=>{crashLeader();draw()},{danger:true});
    const b2=ctx.button('Broker 2 卡住',()=>{toggleStuck(1);draw()});
    const b3=ctx.button('Broker 3 卡住',()=>{toggleStuck(2);draw()});
    const br=ctx.button('重启宕机的 Broker',()=>{restore();draw()});
    ctx.button('清空重来',()=>{fresh();warm();draw()});
    const run=runner(ctx,step,draw);
    function warm(){S.quiet=true;for(let i=0;i<60;i++)step();S.quiet=false;ctx.clearLog()}
    fresh();warm();
    ctx.onResize(w=>{W=w;build();draw()});
    run.set(1);

    function prepare(o){
      Object.assign(P,{ack:'all',minIsr:1,lagMax:3,rate:1.25,unclean:false},o);
      ackCtl.set(P.ack,true);sMin.set(P.minIsr,true);sLag.set(P.lagMax,true);sRate.set(P.rate,true);tUnclean.set(P.unclean,true);speedCtl.set(1,true);
      fresh();ctx.clearLog();run.set(1);draw();
    }
    const unrep=()=>{const Ld=lead();if(!Ld||!Ld.alive)return 0;const f=Math.max(...S.b.filter((b,i)=>i!==S.leader&&b.alive).map(b=>b.log.length));return Ld.log.length-f};
    /* 场景动作都挂在模拟时钟上，保证每次运行结果相同。 */
    async function burstCrash(){
      const rate=v=>{P.rate=v;sRate.set(v,true)};
      S.agenda.push({at:3,fn:()=>{rate(0);for(let k=0;k<3;k++)S.agenda.push({at:S.t+0.02+k*0.06,fn:send});
        S.agenda.push({when:()=>unrep()>=2,fn:()=>{crashLeader();S.agenda.push({at:S.t+2.5,fn:()=>rate(1.25)})}})}});
      await until(ctx,()=>S.t>=9);
    }
    ctx.scenarios([
      {id:'ack1',label:'ACK=1 时 Leader 宕机',
        ask:'ACK=1。生产者连发 3 条，Leader 收到就回了确认；两个 Follower 还没来得及拉走其中至少 2 条，Leader 就宕机了。选出新 Leader 后，这几条还在吗？生产者会重发吗？',
        insight:'新 Leader（Broker 2）上没有 m5、m6。它们在生产者看来早已成功，不会重发，就这样永久丢失（红色）。还在路上的 m7 没收到确认，生产者重试后写进了新 Leader。ACK=1 只保证 Leader 自己写进去了，每条确认时都只有 1 份，复制之前的这段时间就是丢失窗口。',
        async run(){prepare({ack:'1',lagMax:5});await burstCrash()}},
      {id:'ackall',label:'ACK=all 时同样宕机',
        ask:'换成 ACK=all，同样在两条以上消息还没复制时让 Leader 宕机。这次会丢已确认的消息吗？每条消息的确认要多等多久？',
        insight:'宕机时 m4–m7 还没被 ISR 全部同步，生产者一直没收到确认；选出新 Leader 后它重试这 4 条，全部写进新 Leader，「以为成功却丢失」为 0。代价是等待：ACK=1 每条确认约 0.2 秒，ACK=all 平时要等 Follower 下一次拉取，约 0.4–1 秒，重试的几条等了约 2 秒。m4 其实已复制到 Broker 2、只是没提交，重试后在日志里出现两次：至少一次允许重复，消费端要能去重。',
        async run(){prepare({ack:'all',lagMax:5});await burstCrash()}},
      {id:'slow',label:'慢副本被移出 ISR',
        ask:'ACK=all，允许落后 3 条。Broker 3 突然停止拉取：生产者的确认会一直卡住吗？之后它恢复了又会怎样？',
        insight:'Broker 3 还在 ISR 里时，新消息凑不齐 ISR 的同步，确认全部卡住；落后 4 条、超过允许的 3 条后，它被移出 ISR，积压的确认一下子完成，最长等了约 2.6 秒。之后 ISR 只剩 2 个副本，持久性变弱。Broker 3 恢复拉取、追平后重新加入 ISR。慢副本会拖住整个分区，所以 ISR 要在延迟与持久性之间取舍。',
        async run(){prepare({ack:'all',lagMax:3});S.agenda.push({at:2,fn:()=>toggleStuck(2)});S.agenda.push({at:9,fn:()=>toggleStuck(2)});await until(ctx,()=>S.t>=13)}},
      {id:'minisr',label:'ISR 只剩 Leader',
        ask:'ACK=all，两个 Follower 都卡住并被移出 ISR。min.insync.replicas=1 时，生产者还会收到确认吗？中途改成 2 呢？',
        insight:'min.insync.replicas=1 时，「all」就是「ISR 里的全部」，而 ISR 只剩 Leader：m3–m7 照样被确认，但确认时只有 1 份（当时显示为琥珀色），Leader 这时坏盘就会丢。改成 2 后，m8–m11 这 4 条被拒绝，生产者知道失败并隔一会儿重试；Broker 2 恢复、追平并重新进入 ISR 后，它们才被确认，最长等了 4.5 秒。这是用可用性换持久性。',
        async run(){prepare({ack:'all',minIsr:1,lagMax:3,rate:1});S.agenda.push({at:1.5,fn:()=>{toggleStuck(1);toggleStuck(2)}});S.agenda.push({at:7,fn:()=>{P.minIsr=2;sMin.set(2,true);L('把 min.insync.replicas 改为 2','info')}});S.agenda.push({at:10.5,fn:()=>toggleStuck(1)});await until(ctx,()=>S.t>=14.5)}},
    ]);
  }
});
})();
