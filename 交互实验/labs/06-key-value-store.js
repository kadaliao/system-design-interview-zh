/* 第 6 章：键值存储。实验一 Quorum 读写与反例；实验二向量时钟；实验三 SSTable 读路径上的 Bloom Filter。 */
(function(){
const {el:h,util}=SDLab;
const C=SDLab.colors;
const mix=x=>{x^=x>>>16;x=Math.imul(x,0x85ebca6b);x^=x>>>13;x=Math.imul(x,0xc2b2ae35);x^=x>>>16;return x>>>0};
const hash32=s=>mix(util.hash(s));

/* ---------------- 实验一：Quorum 读写 ---------------- */
SDLab.define({
  id:'quorum-rw',chapter:6,
  title:'Quorum 读写：集合相交，就一定读到新值吗',
  summary:'协调节点把写和读发给副本：等够 W 个确认才算写成功，等够 R 个回复就返回其中版本最新的值。点击副本切换「正常 → 慢 → 失联」，调 N、W、R，看每个副本存着哪个版本、读到了什么。',
  caveat:'版本用递增编号代替向量时钟，读取取回复中编号最大的值。「慢」表示回复晚到，「失联」表示宕机或被网络分区隔开。严格模式下写发给全部 N 个副本、读取用最先到的 R 个回复；sloppy quorum 按原文沿环挑前 W / R 个健康节点。失败的写不会回滚已写入的副本；读修复只写回参与本次读取的旧副本。',
  mount(ctx){
    ctx.css('qr',`
.qr-svg svg{max-width:760px;margin:0 auto}
.qr-node{cursor:pointer}
.qr-node:focus-visible rect{stroke:#2f6fb3;stroke-width:3}
.qr-res{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px;margin-top:10px}
.qr-res .sdl-panel{font-size:13.5px;line-height:1.6}
.qr-line{margin:2px 0}
.qr-combos{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.qr-combos .sdl-tag{font-family:ui-monospace,Menlo,monospace}
`);
    const NORMAL=450,SLOW=1600,DROP=260,TIMEOUT=1800;
    const P={n:3,w:2,r:2,sloppy:false,repair:false};
    let nodes=[],msgs=[],timers=[],marks=[],clock=0,busy=false,seq=0,latest=0,lastOk=null,lastRead=null,maxRet=0,regress=0,pos={},coordText='等待操作';
    const node=n=>nodes.find(x=>x.name===n);
    function initNodes(){nodes='ABCDEFG'.slice(0,P.n+2).split('').map((name,i)=>({name,home:i<P.n,state:'up',val:0,ver:i<P.n?0:-1,hints:[]}));seq=0;latest=0;lastOk=null;lastRead=null;maxRet=0;regress=0;msgs=[];timers=[];marks=[];busy=false;coordText='等待操作'}
    const visible=()=>nodes.filter(n=>n.home||P.sloppy||n.hints.length);
    const wrap=h('div',{class:'qr-svg'});
    ctx.stage.append(wrap);
    const svg=ctx.svg(700,250,{parent:wrap,label:'协调节点与副本之间的读写消息'});
    const S=(t,a,...k)=>ctx.svgEl(t,t==='text'&&a&&a.fill?{...a,style:'fill:'+a.fill}:a,...k);/* 运行时 CSS 统一设置了 text 的 fill，着色要写成内联样式 */
    const linesG=S('g'),nodesG=S('g'),coordG=S('g'),msgG=S('g'),markG=S('g');
    svg.append(linesG,coordG,nodesG,msgG,markG);
    const res=h('div',{class:'qr-res'});
    const opBox=h('div',{class:'sdl-panel'},h('div',{class:'ph'},'最近的操作'));
    const opW=h('p',{class:'qr-line'},'写：还没有写入'),opR=h('p',{class:'qr-line'},'读：还没有读取');opBox.append(opW,opR);
    const setBox=h('div',{class:'sdl-panel'});
    res.append(opBox,setBox);ctx.stage.append(res);
    let narrow=false,BW=78,BH=62;
    function layout(){
      const vis=visible();
      if(!narrow){const sp=Math.min(96,640/vis.length);svg.setAttribute('viewBox','0 0 700 250');pos['@']=[350,40];vis.forEach((n,i)=>pos[n.name]=[350+(i-(vis.length-1)/2)*sp,180]);BW=Math.min(80,sp-8)}
      else{const rows=Math.ceil(vis.length/4),H=rows>1?330:224;svg.setAttribute('viewBox',`0 0 360 ${H}`);pos['@']=[180,36];vis.forEach((n,i)=>{const r=Math.floor(i/4),inRow=Math.min(4,vis.length-r*4);pos[n.name]=[180+(i%4-(inRow-1)/2)*86,158+r*104]});BW=78}
    }
    function stateTxt(n){return n.state==='slow'?' · 慢':n.state==='down'?' · 失联':''}
    function render(){
      layout();linesG.replaceChildren();nodesG.replaceChildren();coordG.replaceChildren();
      const [cx,cy]=pos['@'];
      for(const n of visible()){const [x,y]=pos[n.name];linesG.append(S('line',{x1:cx,y1:cy+20,x2:x,y2:y-BH/2,stroke:n.state==='down'?C.bad:'#cfd8cc','stroke-width':1.5,'stroke-dasharray':n.state==='down'?'5 4':null,opacity:n.state==='down'?.6:1}))}
      coordG.append(S('rect',{x:cx-100,y:cy-20,width:200,height:44,rx:10,fill:C.soft,stroke:C.accent,'stroke-width':1.5}),S('text',{x:cx,y:cy-2,'text-anchor':'middle','font-size':13.5,'font-weight':750,text:'协调节点'}),S('text',{x:cx,y:cy+16,'text-anchor':'middle','font-size':12,fill:C.muted,text:coordText}));
      for(const n of visible()){
        const [x,y]=pos[n.name];const fill=n.state==='down'?C.badSoft:n.state==='slow'?C.warnSoft:'#fff';
        const g=S('g',{class:'qr-node',role:'button',tabindex:0,'aria-label':`副本 ${n.name}${stateTxt(n)}，点击切换状态`,onclick:()=>cycle(n),onkeydown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();cycle(n)}}});
        g.append(S('rect',{x:x-BW/2,y:y-BH/2,width:BW,height:BH,rx:9,fill,stroke:n.home?'#9fb3a6':'#b9c3bc','stroke-width':1.5,'stroke-dasharray':n.home?null:'4 3'}));
        g.append(S('text',{x,y:y-BH/2+17,'text-anchor':'middle','font-size':13,'font-weight':750,fill:n.state==='down'?C.bad:n.state==='slow'?'#86561a':C.ink,text:n.name+stateTxt(n)}));
        let vt,vc,sub;
        if(n.home){vt=`x=${n.val} · v${n.ver}`;vc=n.ver>0&&n.ver===latest?C.ok:C.muted;sub=''}
        else{const hn=n.hints.slice().sort((a,b)=>b.ver-a.ver)[0];vt=hn?`x=${hn.val} · v${hn.ver}`:'无数据';vc=hn&&hn.ver===latest?C.ok:C.muted;sub=hn?`替 ${n.hints.map(x=>x.for).join('、')} 保管`:'环上后继'}
        g.append(S('text',{x,y:y+4,'text-anchor':'middle','font-size':12.5,'font-weight':650,fill:vc,class:'mono',text:vt}));
        if(sub)g.append(S('text',{x,y:y+22,'text-anchor':'middle','font-size':12,fill:n.hints.length?C.warn:C.muted,text:sub}));
        nodesG.append(g);
      }
      drawSets();refresh();
    }
    function cycle(n){n.state=n.state==='up'?'slow':n.state==='slow'?'down':'up';ctx.log(`${n.name} → ${n.state==='up'?'正常':n.state==='slow'?'慢':'失联'}`,n.state==='down'?'bad':n.state==='slow'?'warn':'info');render()}
    function setCoord(t){coordText=t;const tx=coordG.querySelectorAll('text')[1];if(tx)tx.textContent=t}
    const setStr=a=>'{'+a.join(', ')+'}';
    function combos(arr,k){const out=[];const rec=(i,cur)=>{if(cur.length===k){out.push(cur.slice());return}for(let j=i;j<arr.length;j++){cur.push(arr[j]);rec(j+1,cur);cur.pop()}};rec(0,[]);return out}
    function drawSets(){
      const kids=[h('div',{class:'ph'},'读写集合')];
      if(!lastOk)kids.push(h('p',{class:'qr-line'},'还没有成功的写，谈不上相交。'));
      else{
        kids.push(h('p',{class:'qr-line'},`最近成功的写 x=${lastOk.val}：确认来自 `,h('b',null,setStr(lastOk.set))));
        if(lastRead){const inter=lastRead.set.filter(x=>lastOk.set.includes(x));kids.push(h('p',{class:'qr-line'},`本次读集合 ${setStr(lastRead.set)} ∩ 写集合 = `,h('span',{class:'sdl-tag '+(inter.length?'ok':'bad')},inter.length?setStr(inter):'空集')))}
        if(!P.sloppy){const home=nodes.filter(n=>n.home).map(n=>n.name);const cs=combos(home,Math.min(P.r,home.length));
          kids.push(h('p',{class:'qr-line',style:{marginTop:'6px'}},`从 ${P.n} 个副本任取 ${P.r} 个作读集合，共 ${cs.length} 种：`),h('div',{class:'qr-combos'},cs.map(c=>h('span',{class:'sdl-tag '+(c.some(x=>lastOk.set.includes(x))?'ok':'bad')},c.join('')))));}
        else kids.push(h('p',{class:'sdl-note'},'Sloppy 模式下读写都可能落到原 N 个副本之外，相交证明不再直接适用。'));
      }
      setBox.replaceChildren(...kids);
    }
    /* ---- 消息引擎：点在连线上移动，到达后回调 ---- */
    const lp=ctx.loop(dt=>{
      clock+=dt*1000;
      for(const t of timers.filter(t=>t.at<=clock)){timers.splice(timers.indexOf(t),1);t.fn()}
      for(const m of msgs.slice()){
        const k=Math.min(1,(clock-m.t0)/m.dur);const a=pos[m.from],b=pos[m.to];if(!a||!b){msgs.splice(msgs.indexOf(m),1);m.g.remove();continue}
        const end=m.drop?[a[0]+(b[0]-a[0])*.55,a[1]+(b[1]-a[1])*.55]:b;
        let x,y;if(m.curve){const c=[(a[0]+b[0])/2,Math.max(a[1],b[1])+78];x=(1-k)*(1-k)*a[0]+2*(1-k)*k*c[0]+k*k*end[0];y=(1-k)*(1-k)*a[1]+2*(1-k)*k*c[1]+k*k*end[1]}
        else{x=a[0]+(end[0]-a[0])*k;y=a[1]+(end[1]-a[1])*k}
        m.g.setAttribute('transform',`translate(${x.toFixed(1)},${y.toFixed(1)})`);
        if(k>=1){msgs.splice(msgs.indexOf(m),1);m.g.remove();if(m.drop){const mk=S('text',{x:end[0],y:end[1]+6,'text-anchor':'middle','font-size':18,'font-weight':800,fill:C.bad,text:'✕'});markG.append(mk);marks.push({el:mk,until:clock+700})}else m.done&&m.done()}
      }
      for(const mk of marks.filter(x=>x.until<=clock)){marks.splice(marks.indexOf(mk),1);mk.el.remove()}
      if(!msgs.length&&!timers.length&&!marks.length)lp.stop();
    },false);
    function send(from,to,o){
      const g=S('g',null,S('circle',{r:6.5,fill:o.color,stroke:'#fff','stroke-width':1.5}),o.label?S('text',{x:9,y:4,'font-size':12,'font-weight':700,fill:o.color,text:o.label}):null);
      msgG.append(g);msgs.push({from,to,t0:clock,dur:o.dur,drop:!!o.drop,curve:!!o.curve,done:o.done,g});lp.start();
    }
    function timer(ms,fn){timers.push({at:clock+ms,fn});lp.start()}
    function targets(kind){
      if(!P.sloppy)return nodes.filter(n=>n.home).map(n=>({n,hint:null}));
      const need=kind==='w'?P.w:P.r;const pick=nodes.filter(n=>n.state!=='down').slice(0,need);
      const downHome=nodes.filter(n=>n.home&&n.state==='down');let i=0;
      return pick.map(n=>({n,hint:n.home?null:(downHome[i++]||{name:'?'}).name}));
    }
    function store(n,val,ver,hint){
      if(n.home){if(ver>n.ver){n.val=val;n.ver=ver}}
      else{const x=n.hints.find(y=>y.for===hint);if(x){if(ver>x.ver){x.val=val;x.ver=ver}}else n.hints.push({for:hint,val,ver})}
      latest=Math.max(latest,ver);
    }
    function snapshot(n){if(n.home)return {val:n.val,ver:n.ver};const x=n.hints.slice().sort((a,b)=>b.ver-a.ver)[0];return x?{val:x.val,ver:x.ver}:{val:null,ver:-1}}
    function doWrite(){
      return new Promise(resolve=>{
        busy=true;refresh();const ver=++seq,val=ver;const ts=targets('w');let acks=[],pending=ts.length,decided=false;
        setCoord(`写 x=${val}：确认 0/${P.w}`);ctx.log(`写 x=${val}（v${ver}）→ ${ts.map(t=>t.n.name+(t.hint?`（替 ${t.hint}）`:'')).join('、')}`,'info');
        const end=()=>{if(--pending>0)return;if(!decided){decided=true;setCoord(`写 x=${val} 失败：${acks.length}/${P.w}`);
          const kept=nodes.filter(n=>snapshot(n).ver===ver).map(n=>n.name);
          opW.replaceChildren(h('span',{class:'sdl-tag bad'},'写失败'),` x=${val} 只收到 ${acks.length} 个确认，少于 W=${P.w}。`,kept.length?`${kept.join('、')} 上已写入的 x=${val} 不会回滚。`:'');
          ctx.log(`写 x=${val} 失败：确认 ${acks.length} < W=${P.w}`,'bad');}busy=false;refresh();resolve(decided)};
        if(!ts.length){pending=1;end();return}
        for(const t of ts){
          const n=t.n;
          if(n.state==='down'){send('@',n.name,{dur:DROP,drop:true,label:'x='+val,color:C.info});timer(TIMEOUT,()=>{ctx.log(`${n.name} 无响应（超时）`,'warn');end()});continue}
          send('@',n.name,{dur:NORMAL,label:'x='+val,color:C.info,done:()=>{
            store(n,val,ver,t.hint);render();
            send(n.name,'@',{dur:n.state==='slow'?SLOW:NORMAL,label:'ack',color:C.ok,done:()=>{
              acks.push(n.name);
              if(!decided){setCoord(`写 x=${val}：确认 ${acks.length}/${P.w}`);if(acks.length>=P.w){decided=true;lastOk={val,ver,set:acks.slice()};
                opW.replaceChildren(h('span',{class:'sdl-tag ok'},'写成功'),` x=${val}：${setStr(acks)} 确认，达到 W=${P.w}。`);ctx.log(`写 x=${val} 成功（${acks.join('、')} 确认）`,'ok');setCoord(`写 x=${val} 成功`);render();resolve(true)}}
              else ctx.log(`${n.name} 的确认晚到（写已返回）`);
              end();
            }});
          }});
        }
      });
    }
    function doRead(){
      return new Promise(resolve=>{
        busy=true;refresh();const ts=targets('r');const got=[];let pending=ts.length,decided=false;
        setCoord(`读：回复 0/${P.r}`);ctx.log(`读 → ${ts.map(t=>t.n.name).join('、')}，等 ${P.r} 个回复`,'info');
        const finish=(best,set)=>{
          const stale=lastOk&&best.ver<lastOk.ver,back=best.ver<maxRet;if(back)regress++;maxRet=Math.max(maxRet,best.ver);
          lastRead={set,val:best.val,ver:best.ver};
          opR.replaceChildren(h('span',{class:'sdl-tag '+(back||stale?'bad':'ok')},back?'读倒退':stale?'读到旧值':'读成功'),` ${setStr(set)} 回复，返回 x=${best.val}（v${best.ver}）`,back?`，比之前读到的 v${maxRet} 还旧。`:stale?`，但最近成功的写是 x=${lastOk.val}。`:'。');
          ctx.log(`读返回 x=${best.val}（v${best.ver}）${back?'：倒退':stale?'：旧值':''}`,back||stale?'bad':'ok');setCoord(`读返回 x=${best.val}`);busy=false;render();resolve(best);
        };
        const end=()=>{if(--pending>0)return;if(!decided){decided=true;setCoord(`读失败：${got.length}/${P.r}`);opR.replaceChildren(h('span',{class:'sdl-tag bad'},'读失败'),` 只收到 ${got.length} 个回复，少于 R=${P.r}。`);ctx.log('读失败','bad');busy=false;refresh();resolve(null)}};
        if(!ts.length){pending=1;end();return}
        for(const t of ts){
          const n=t.n;
          if(n.state==='down'){send('@',n.name,{dur:DROP,drop:true,color:C.info});timer(TIMEOUT,()=>end());continue}
          send('@',n.name,{dur:NORMAL,color:C.info,done:()=>{
            const snap=snapshot(n);
            send(n.name,'@',{dur:n.state==='slow'?SLOW:NORMAL,label:snap.ver<0?'无':'v'+snap.ver,color:'#56657a',done:()=>{
              if(decided){ctx.log(`${n.name} 的回复（v${snap.ver}）晚到，被忽略`);end();return}
              got.push({n,...snap});setCoord(`读：回复 ${got.length}/${P.r}`);
              if(got.length>=P.r){decided=true;const best=got.reduce((a,b)=>b.ver>a.ver?b:a);const set=got.map(x=>x.n.name);
                const stale=got.filter(x=>x.ver<best.ver&&x.n.home);
                if(P.repair&&stale.length){let left=stale.length;setCoord('读修复：写回旧副本');ctx.log(`读修复：把 x=${best.val} 写回 ${stale.map(x=>x.n.name).join('、')}`,'info');
                  for(const x of stale)send('@',x.n.name,{dur:NORMAL,label:'x='+best.val,color:C.info,done:()=>{store(x.n,best.val,best.ver,null);render();send(x.n.name,'@',{dur:x.n.state==='slow'?SLOW:NORMAL,label:'ack',color:C.ok,done:()=>{if(--left===0)finish(best,set)}})}});}
                else finish(best,set);}
              end();
            }});
          }});
        }
      });
    }
    function doHandoff(){
      return new Promise(resolve=>{
        const jobs=[];for(const s of nodes.filter(n=>!n.home))for(const hn of s.hints){const t=node(hn.for);if(t&&t.state!=='down')jobs.push([s,hn,t])}
        if(!jobs.length){ctx.log('没有可交还的提示数据（目标副本仍失联或没有提示）','warn');resolve(0);return}
        busy=true;refresh();let left=jobs.length;setCoord('hinted handoff');
        for(const [s,hn,t] of jobs)send(s.name,t.name,{dur:900,curve:true,label:'x='+hn.val,color:C.warn,done:()=>{store(t,hn.val,hn.ver,null);s.hints=s.hints.filter(x=>x!==hn);ctx.log(`${s.name} 把 x=${hn.val} 交还给 ${t.name}`,'ok');render();if(--left===0){busy=false;setCoord('交还完成');refresh();resolve(jobs.length)}}});
      });
    }
    const st=ctx.stats([{key:'rule',label:'R + W 与 N'},{key:'w',label:'最近的写'},{key:'r',label:'最近读到'},{key:'back',label:'读倒退次数'}]);
    function refresh(){
      const sum=P.r+P.w;st.set('rule',`${P.r}+${P.w}=${sum} ${sum>P.n?'>':'≤'} ${P.n}`,sum>P.n?'ok':'warn');
      st.set('w',lastOk?`x=${lastOk.val} 成功`:'—',lastOk?'ok':null);
      st.set('r',lastRead?`x=${lastRead.val}`:'—',lastRead?(lastOk&&lastRead.ver<lastOk.ver?'bad':'ok'):null);
      st.set('back',String(regress),regress?'bad':null);
      wBtn.textContent=`写入 x=${seq+1}`;for(const b of [wBtn,rBtn,hBtn])b.disabled=busy;
    }
    function clampWR(){if(P.w>P.n){P.w=P.n;wCtl.set(P.w,true)}if(P.r>P.n){P.r=P.n;rCtl.set(P.r,true)}}
    const nCtl=ctx.slider({label:'副本数 N',min:3,max:5,value:P.n,onChange:v=>{P.n=v;clampWR();initNodes();opW.textContent='写：还没有写入';opR.textContent='读：还没有读取';render()}});
    const wCtl=ctx.slider({label:'写确认数 W',min:1,max:5,value:P.w,onInput:v=>{P.w=Math.min(v,P.n);if(v>P.n)wCtl.set(P.w,true);render()}});
    const rCtl=ctx.slider({label:'读回复数 R',min:1,max:5,value:P.r,onInput:v=>{P.r=Math.min(v,P.n);if(v>P.n)rCtl.set(P.r,true);render()}});
    const slCtl=ctx.toggle({label:'Sloppy quorum：沿环借用健康节点',value:false,onChange:v=>{P.sloppy=v;render()}});
    const rpCtl=ctx.toggle({label:'读返回前写回旧副本（read repair）',value:false,onChange:v=>{P.repair=v}});
    const wBtn=ctx.button('写入 x=1',()=>doWrite(),{primary:true});
    const rBtn=ctx.button('读取',()=>doRead());
    const hBtn=ctx.button('hinted handoff：交还',()=>doHandoff());
    ctx.note('点击副本可切换「正常 → 慢 → 失联」。绿色版本号表示持有目前写过的最新版本。');
    ctx.onResize(w=>{const n=w<560;if(n!==narrow){narrow=n;render()}});
    initNodes();render();

    async function settle(){while(msgs.length||timers.length)await ctx.wait(80);await ctx.wait(300)}
    async function prepare(o){
      Object.assign(P,{n:3,w:2,r:2,sloppy:false,repair:false},o);nCtl.set(P.n,true);wCtl.set(P.w,true);rCtl.set(P.r,true);slCtl.set(P.sloppy,true);rpCtl.set(P.repair,true);
      msgG.replaceChildren();markG.replaceChildren();initNodes();ctx.clearLog();opW.textContent='写：还没有写入';opR.textContent='读：还没有读取';render();await ctx.wait(500);
    }
    const setS=async(pairs,ms=1000)=>{for(const [n,s] of pairs){node(n).state=s;ctx.log(`${n} → ${s==='up'?'正常':s==='slow'?'慢':'失联'}`,s==='down'?'bad':s==='slow'?'warn':'info')}render();await ctx.wait(ms)};
    async function counter(repair){
      await prepare({repair});await setS([['B','down'],['C','down']]);
      await doWrite();await settle();
      await setS([['B','up'],['C','slow']]);await doRead();await settle();
      await setS([['C','up'],['A','slow']]);await doRead();await settle();
    }
    ctx.scenarios([
      {id:'intersect',label:'R+W>N：任意读集合都相交',
        ask:'N=3、W=2、R=2。写 x=1 时 C 失联，A、B 确认后写成功；C 恢复后读取，恰好 A 慢，读到的是 B、C。会读到 1 吗？再把 R 降到 1 呢？',
        insight:'写集合是 {A,B}，三种两两组合的读集合都至少含 A 或 B（面板里全绿），这次 {B,C} 通过 B 读到 x=1。R 降到 1 后 R+W=3 不再大于 N，读集合 {C} 与写集合不相交，C 最先回复，于是返回旧值 0，面板记下一次读倒退。',
        async run(){await prepare({});await setS([['C','down']]);await doWrite();await settle();await setS([['C','up'],['A','slow']]);await doRead();await settle();
          P.r=1;rCtl.set(1,true);ctx.log('R 改为 1','info');await setS([['B','slow']],900);await doRead();await settle()}},
      {id:'counter',label:'相交仍会读到「1 后又 0」',
        ask:'N=3、R=W=2。写 x=1 时 B、C 失联，只写到 A，没凑够 W，写失败。B、C 恢复后，读 1 用 A、B 的回复，读 2 用 B、C 的回复。两次读各返回什么？',
        insight:'读 1 从 A 拿到 v1，返回 1，但没有把它写回 B；读 2 的集合 {B,C} 都只有旧值，返回 0。两次读都满足 R=2，却观察到 1 之后又退回 0（读倒退 1 次）。R+W>N 只保证与「已完成的写」相交，这次写失败了，而且 A 上的部分写没有回滚，不满足线性一致。',
        async run(){await counter(false)}},
      {id:'repair',label:'读前写回：不再倒退',
        ask:'同样的故障顺序，但打开「读返回前写回旧副本」。读 2 还会返回 0 吗？',
        insight:'读 1 发现 B 是旧版本，先把 x=1 写回 B，确认后才返回 1。此时 A、B 两个副本（多数派）都有 v1，读 2 的集合 {B,C} 必然碰到 B，于是也返回 1，并顺手修复 C。写回只是完整协议的一部分，并发写的排序、成员变化等还要另行处理。',
        async run(){await counter(true)}},
      {id:'sloppy',label:'Sloppy quorum 不再相交',
        ask:'打开 sloppy quorum，N=3、R=W=2。A、B 失联时写 x=1，会借用环上的 D。A、B 恢复后立刻读，读到几？执行 hinted handoff 之后呢？',
        insight:'写落在 {C,D}，D 替 A 保管 x=1，写成功；A、B 恢复后，读取沿环挑前两个健康节点 {A,B}，与写集合没有交集，返回旧值 0。D 不在原来的 3 个副本里，R+W>N 的相交证明不再适用。hinted handoff 把 x=1 交还 A 后再读，才得到 1。',
        async run(){await prepare({sloppy:true});await setS([['A','down'],['B','down']]);await doWrite();await settle();await setS([['A','up'],['B','up']]);await doRead();await settle();await ctx.wait(1200);await doHandoff();await settle();await doRead();await settle()}},
    ]);
  }
});

/* ---------------- 实验二：向量时钟 ---------------- */
SDLab.define({
  id:'vector-clock',chapter:6,
  title:'向量时钟：谁是祖先，谁在冲突',
  summary:'每次写入由一台服务器处理，它把向量里自己的计数加一。点一个版本作为写入的基础，再选处理写入的服务器；两个版本互不支配时就成了 siblings，系统只能把它们都交给客户端合并。',
  caveat:'三台服务器 Sx、Sy、Sz。点选基础版本相当于客户端带着读到的版本上下文来写。同一台服务器基于同一版本写两次会得到相同的向量，本实验直接拒绝这种操作（真实系统需要更细的版本记录来区分）。不演示向量裁剪。',
  mount(ctx){
    ctx.css('vc',`
.vc-dag{position:relative;padding:4px 0 2px}
.vc-dag>svg{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.vc-row{display:flex;justify-content:center;gap:8px;margin-bottom:26px;position:relative}
.vc-row:last-child{margin-bottom:6px}
.sdl-frame button.vc-card{display:block;flex:0 1 190px;min-width:0;text-align:left;padding:6px 10px;border-radius:10px;border:1.5px solid #cfd8cc;background:#fff;line-height:1.45;position:relative;z-index:1}
.sdl-frame button.vc-card.sel{border-color:#2f6fb3;box-shadow:0 0 0 2px #dde9f6}
.sdl-frame button.vc-card.sib{border-color:#b7791f;background:#fffaf0}
.sdl-frame button.vc-card.head{border-color:#2f8f5b}
.vc-card .t{display:flex;flex-wrap:wrap;justify-content:space-between;gap:0 6px;font-size:13px}
.vc-card .v,.vc-card .val{display:block}
.vc-card .t b{font-size:14px}
.vc-card .by{color:#66756d;font-size:12px}
.vc-card .v{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;overflow-wrap:anywhere}
.vc-card .v em{font-style:normal;color:#2f6fb3;font-weight:800}
.vc-card .val{font-size:12.5px}
.vc-card .sdl-tag{margin-top:2px}
@keyframes vc-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
.vc-new{animation:vc-in .5s ease-out}
.vc-panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-top:6px}
.vc-panels .sdl-panel{font-size:13.5px}
.vc-sel{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px}
.vc-sel select{font:inherit;font-size:13px;padding:3px 6px;border:1px solid #bacdbf;border-radius:7px;background:#fff;color:#23352f}
.vc-verdict{margin:6px 0 0;line-height:1.6}
.vc-merge{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
`);
    const SV=['Sx','Sy','Sz'];
    let vs=[],cnt=0,sel=null,server='Sx',cmpA=null,cmpB=null;
    const byId=id=>vs.find(v=>v.id===id);
    const vcStr=v=>SV.filter(s=>v.vc[s]).map(s=>`[${s},${v.vc[s]}]`).join('');
    function cmp(a,b){let le=true,ge=true;for(const s of SV){const x=a.vc[s]||0,y=b.vc[s]||0;if(x>y)le=false;if(x<y)ge=false}return le&&ge?'eq':le?'lt':ge?'gt':'cc'}
    const frontier=()=>vs.filter(v=>!vs.some(w=>w!==v&&cmp(v,w)==='lt'));
    const dag=h('div',{class:'vc-dag'});
    const edgeSvg=ctx.svgEl('svg',{'aria-hidden':'true'});
    const panels=h('div',{class:'vc-panels'});
    const readBox=h('div',{class:'sdl-panel'}),cmpBox=h('div',{class:'sdl-panel'});
    panels.append(readBox,cmpBox);
    ctx.stage.append(h('p',{class:'sdl-note',style:{marginTop:0}},'点版本卡片，选中它作为下一次写入的基础（蓝框）。'),dag,panels);
    const selA=h('select',{'aria-label':'比较版本 X'}),selB=h('select',{'aria-label':'比较版本 Y'});
    selA.addEventListener('change',()=>{cmpA=selA.value;drawCmp()});selB.addEventListener('change',()=>{cmpB=selB.value;drawCmp()});
    const verdict=h('div',{class:'vc-verdict'});const cmpTable=h('div',{class:'sdl-scroll'});
    cmpBox.append(h('div',{class:'ph'},'逐项比较两个版本'),h('div',{class:'vc-sel'},'X =',selA,'Y =',selB),cmpTable,verdict);
    let fresh=null;
    function draw(){
      const fr=frontier();const gens=[...new Set(vs.map(v=>v.gen))].sort((a,b)=>a-b);
      dag.replaceChildren(edgeSvg);
      for(const g of gens){
        const row=h('div',{class:'vc-row'});
        for(const v of vs.filter(x=>x.gen===g)){
          const isF=fr.includes(v);
          const vc=SV.filter(s=>v.vc[s]).map((s,i)=>[i?' ':'',s===v.inc?h('em',null,`[${s},${v.vc[s]}]`):`[${s},${v.vc[s]}]`]);
          const b=h('button',{type:'button',class:'vc-card'+(v.id===sel?' sel':'')+(isF&&fr.length>1?' sib':isF?' head':'')+(v.id===fresh?' vc-new':''),dataset:{id:v.id},'aria-pressed':String(v.id===sel),onclick:()=>{sel=v.id;draw();refresh()}},
            h('span',{class:'t'},h('b',null,v.id),h('span',{class:'by'},v.merged?`${v.by} 写入合并版`:v.by?`${v.by} 写入`:'初始')),
            h('span',{class:'v'},vc),v.val!=null?h('span',{class:'val'},v.val):null,
            isF?h('span',{class:'sdl-tag '+(fr.length>1?'warn':'ok')},fr.length>1?'sibling':'最新'):null);
          row.append(b);
        }
        dag.append(row);
      }
      drawEdges();drawRead(fr);syncSel();drawCmp();
    }
    function drawEdges(){
      const box=dag.getBoundingClientRect();if(!box.width)return;
      const cards=new Map([...dag.querySelectorAll('.vc-card')].map(c=>[c.dataset.id,c.getBoundingClientRect()]));
      edgeSvg.setAttribute('viewBox',`0 0 ${box.width.toFixed(0)} ${box.height.toFixed(0)}`);edgeSvg.replaceChildren();
      for(const v of vs)for(const p of v.parents){const a=cards.get(p),b=cards.get(v.id);if(!a||!b)continue;
        const x1=a.left+a.width/2-box.left,y1=a.bottom-box.top,x2=b.left+b.width/2-box.left,y2=b.top-box.top,my=(y1+y2)/2;
        edgeSvg.append(ctx.svgEl('path',{d:`M${x1.toFixed(1)} ${y1.toFixed(1)}C${x1.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${(y2-2).toFixed(1)}`,fill:'none',stroke:v.merged?C.ok:'#9aa89f','stroke-width':1.8,'marker-end':'url(#vc-arrow)'}))}
      edgeSvg.prepend(ctx.svgEl('defs',null,ctx.svgEl('marker',{id:'vc-arrow',viewBox:'0 0 8 8',refX:7,refY:4,markerWidth:7,markerHeight:7,orient:'auto'},ctx.svgEl('path',{d:'M0 0L8 4L0 8z',fill:'#9aa89f'}))));
    }
    function drawRead(fr){
      const kids=[h('div',{class:'ph'},'读取这个 key 会得到')];
      if(!fr.length)kids.push(h('p',{class:'vc-verdict'},'还没有版本。'));
      else if(fr.length===1)kids.push(h('p',{class:'vc-verdict'},h('span',{class:'sdl-tag ok'},fr[0].id),' 一个版本，它支配其余所有版本，没有冲突。'));
      else{
        kids.push(h('p',{class:'vc-verdict'},fr.map(v=>h('span',{class:'sdl-tag warn',style:{marginRight:'4px'}},v.id)),`${fr.length} 个 siblings，互不支配。系统无法判断哪个「对」，只能都返回给客户端。`));
        kids.push(h('div',{class:'vc-merge'},fr.map(v=>h('button',{type:'button',onclick:()=>merge(v.id)},`客户端采用 ${v.val!=null?'「'+v.val+'」':v.id+' 的内容'}`))),h('p',{class:'sdl-note'},`合并版由 ${server} 写入：各项取最大值，再给 ${server} 加一。`));
      }
      readBox.replaceChildren(...kids);
    }
    function syncSel(){for(const [s,cur] of [[selA,cmpA],[selB,cmpB]]){s.replaceChildren(...vs.map(v=>h('option',{value:v.id},v.id)));if(cur&&byId(cur))s.value=cur}}
    function drawCmp(){
      const a=byId(cmpA),b=byId(cmpB);
      if(!a||!b){cmpTable.replaceChildren();verdict.textContent='至少需要两个版本。';return}
      const sym=s=>{const x=a.vc[s]||0,y=b.vc[s]||0;return x===y?'=':x<y?'<':'>'};
      cmpTable.replaceChildren(h('table',{class:'sdl-table'},h('thead',null,h('tr',null,h('th',null,''),SV.map(s=>h('th',null,s)))),h('tbody',null,
        h('tr',null,h('td',null,'X '+a.id),SV.map(s=>h('td',null,String(a.vc[s]||0)))),h('tr',null,h('td',null,'Y '+b.id),SV.map(s=>h('td',null,String(b.vc[s]||0)))),
        h('tr',null,h('td',null,'X ? Y'),SV.map(s=>{const c=sym(s);return h('td',{style:{fontWeight:'700',color:c==='='?C.muted:C.info}},c)})))));
      const r=cmp(a,b);
      const txt={eq:['info','向量相同',`${a.id} 与 ${b.id} 是同一个向量。`],lt:['info','X 是 Y 的祖先',`${a.id} 每一项都 ≤ ${b.id}，且至少一项更小：${b.id} 已包含 ${a.id} 的全部更新，可以直接覆盖它。`],gt:['info','Y 是 X 的祖先',`${b.id} 每一项都 ≤ ${a.id}，且至少一项更小：${a.id} 已包含 ${b.id} 的全部更新。`],cc:['warn','并发：siblings',`有的分量 ${a.id} 大，有的分量 ${b.id} 大，谁也不包含谁，这是冲突，要由客户端或业务规则合并。`]}[r];
      verdict.replaceChildren(h('span',{class:'sdl-tag '+txt[0]},txt[1]),' '+txt[2]+(SV.some(s=>!a.vc[s]||!b.vc[s])?'（缺失项按 0 计）':''));
    }
    function write(baseId,sv,val){
      const b=baseId?byId(baseId):null;const vc=b?{...b.vc}:{};vc[sv]=(vc[sv]||0)+1;
      const dup=vs.find(v=>SV.every(s=>(v.vc[s]||0)===(vc[s]||0)));
      if(dup){ctx.log(`${sv} 基于 ${b?b.id:'空'} 再写会得到和 ${dup.id} 相同的向量 ${vcStr({vc})}，本实验不允许；换一台服务器`,'warn');ctx.announce('向量重复，已拒绝');return null}
      const v={id:'D'+(++cnt),vc,by:sv,inc:sv,parents:b?[b.id]:[],val:val??null,gen:b?b.gen+1:0};
      vs.push(v);sel=v.id;fresh=v.id;
      if(b){cmpA=b.id;cmpB=v.id}
      ctx.log(`${v.id} = ${vcStr(v)}：${sv} 基于 ${b?b.id:'空'} 写入，${sv} 计数 +1`,'info');
      draw();refresh();ctx.announce(`${v.id} ${vcStr(v)}`);return v;
    }
    function merge(pickId){
      const fr=frontier();if(fr.length<2)return null;const pick=byId(pickId);
      const vc={};for(const s of SV){const m=Math.max(...fr.map(v=>v.vc[s]||0));if(m)vc[s]=m}vc[server]=(vc[server]||0)+1;
      const v={id:'D'+(++cnt),vc,by:server,inc:server,parents:fr.map(x=>x.id),val:pick.val!=null?pick.val:`内容取自 ${pick.id}`,gen:Math.max(...fr.map(x=>x.gen))+1,merged:true};
      vs.push(v);sel=v.id;fresh=v.id;cmpA=fr.find(x=>x!==pick).id;cmpB=v.id;
      ctx.log(`${v.id} = ${vcStr(v)}：客户端合并 ${fr.map(x=>x.id).join('、')}，由 ${server} 写入`,'ok');
      draw();refresh();ctx.announce(`合并为 ${v.id} ${vcStr(v)}`);return v;
    }
    const st=ctx.stats([{key:'n',label:'版本数'},{key:'sib',label:'当前 siblings'},{key:'base',label:'下一次写入基于'}]);
    function refresh(){const fr=frontier();st.set('n',String(vs.length));st.set('sib',fr.length>1?fr.map(v=>v.id).join('、'):'无冲突',fr.length>1?'warn':'ok');st.set('base',sel?`${sel} · ${server}`:'—','info');wBtn.textContent=sel?`${server} 基于 ${sel} 写入`:`${server} 写入第一个版本`}
    const svCtl=ctx.segmented({label:'处理写入的服务器',value:'Sx',options:SV.map(s=>[s,s]),onChange:v=>{server=v;drawRead(frontier());refresh()}});
    const wBtn=ctx.button('写入',()=>write(sel,server),{primary:true});
    ctx.onResize(()=>drawEdges());
    function reset(){vs=[];cnt=0;sel=null;cmpA=cmpB=null;fresh=null;ctx.clearLog()}
    reset();write(null,'Sx');write('D1','Sx');fresh=null;draw();

    async function step(base,sv,val,ms=1100){if(base){sel=base;draw()}svCtl.set(sv,true);server=sv;refresh();await ctx.wait(600);const v=write(base,sv,val);await ctx.wait(ms);return v}
    async function doMerge(pick,sv){svCtl.set(sv,true);server=sv;drawRead(frontier());refresh();await ctx.wait(1200);merge(pick);await ctx.wait(1400)}
    function compare(a,b){cmpA=a;cmpB=b;syncSel();drawCmp()}
    ctx.scenarios([
      {id:'book',label:'原书 D1 → D5',
        ask:'Sx 写出 D1、D2；随后 Sy 和 Sz 都基于 D2 各写一次，得到 D3、D4。D3 和 D4 谁是谁的祖先？怎样得到 D5？',
        insight:'D3=[Sx,2][Sy,1]，D4=[Sx,2][Sz,1]：Sy 分量 D3 大，Sz 分量 D4 大，互不支配，是 siblings。读取时两个都返回，客户端合并后交给 Sx 写入：各项取最大值 [Sx,2][Sy,1][Sz,1]，Sx 再加一，得到 D5=[Sx,3][Sy,1][Sz,1]，它支配 D3 和 D4。',
        async run(){reset();draw();await ctx.wait(400);await step(null,'Sx');await step('D1','Sx');await step('D2','Sy');await step('D2','Sz',undefined,600);compare('D3','D4');await ctx.wait(1800);await doMerge('D3','Sx');compare('D4','D5');await ctx.wait(800)}},
      {id:'name',label:'向量时钟能选出正确姓名吗',
        ask:'姓名原本是「张敏」，向量 [Sx,1][Sy,1]。断网期间 Sx 把它改成「张明」，Sy 把它改成「李敏」。向量时钟会自动选哪个？',
        insight:'Sx 的版本是 [Sx,2][Sy,1]，Sy 的是 [Sx,1][Sy,2]，一项大一项小，互不支配。向量时钟只知道这是两条独立的修改，不懂姓名，不会也不该挑一个，更不能从两边各取一个字拼成「李明」。用户确认「张明」后由 Sx 写入合并版 [Sx,3][Sy,2]，表示它已经看过两个分支。',
        async run(){reset();const d1={id:'D1',vc:{Sx:1,Sy:1},by:null,inc:null,parents:[],val:'张敏',gen:0};vs.push(d1);cnt=1;sel='D1';draw();refresh();ctx.log('D1 = [Sx,1][Sy,1]：姓名「张敏」','info');await ctx.wait(900);
          await step('D1','Sx','张明');await step('D1','Sy','李敏',600);compare('D2','D3');await ctx.wait(2000);await doMerge('D2','Sx');compare('D3','D4');await ctx.wait(600)}},
      {id:'sum',label:'计数总和大≠更新',
        ask:'X=[Sx,1][Sy,3]，总和 4；Y=[Sx,2][Sy,1]，总和 3。X 比 Y 新吗？D1=[Sx,1] 与 X 又是什么关系？',
        insight:'X 的 Sy 分量大，Y 的 Sx 分量大，逐项比较互不支配，所以是并发，与总和无关。D1=[Sx,1] 缺 Sy 项按 0 计，每一项都 ≤ X，且 Sy 更小，因此 D1 是 X 的祖先。',
        async run(){reset();draw();await ctx.wait(400);await step(null,'Sx',undefined,700);await step('D1','Sy',undefined,700);await step('D2','Sx',undefined,700);await step('D2','Sy',undefined,700);await step('D4','Sy',undefined,700);compare('D5','D3');await ctx.wait(2600);compare('D1','D5');await ctx.wait(2000)}},
    ]);
  }
});

/* ---------------- 实验三：Bloom Filter ---------------- */
SDLab.define({
  id:'bloom-filter',chapter:6,
  title:'Bloom Filter：「可能存在」为什么还要读盘',
  summary:'SSTable 读路径先问 Bloom Filter。插入 key 会把 k 个位置 1；查询时只要看到一个 0 就能跳过这个文件，全是 1 只能说「可能存在」，还得读 SSTable 才知道有没有。',
  caveat:'只画一个 SSTable 和它的过滤器，memtable 假设未命中；各位置由两个哈希值组合得出。m=8、k=2 时 alpha、beta、gamma、delta 沿用第 29 章 Q06-04 示例中的位置。「读盘」泛指查索引和数据文件，实际可能命中页缓存。',
  mount(ctx){
    ctx.css('bf',`
.bf-path{display:grid;grid-template-columns:minmax(0,1fr) 18px minmax(0,1fr) 18px minmax(0,1fr);align-items:stretch;gap:4px}
.bf-path .ar{align-self:center;text-align:center;color:#9aa89f;font-weight:700}
.bf-box{border:1.5px solid #dbe2da;border-radius:10px;padding:6px 8px;background:#fff;font-size:12.5px;line-height:1.45;min-width:0;transition:border-color .2s,background .2s}
.bf-box b{display:block;font-size:13px}
.bf-box.on{border-color:#2f6fb3;background:#f3f8fd}
.bf-box .s{color:#66756d}
.bf-box .s.ok{color:#1d6a41;font-weight:650}.bf-box .s.bad{color:#9b2c27;font-weight:650}.bf-box .s.warn{color:#86561a;font-weight:650}
.bf-bits{display:grid;gap:3px;margin:12px 0 4px}
.bf-bit{border:1px solid #dbe2da;border-radius:6px;text-align:center;background:#fbfcfa;padding:1px 0 2px;min-width:0;transition:background .2s}
.bf-bit i{display:block;font-style:normal;font-size:11px;color:#66756d;line-height:1.3}
.bf-bit b{display:block;font-size:15px;line-height:1.3;font-variant-numeric:tabular-nums}
.bf-bit.one{background:#dde9f6;border-color:#9dbde0}.bf-bit.one b{color:#24558a}
.bf-bit.hit{outline:2.5px solid #2f6fb3;outline-offset:0}
.bf-bit.hit i{color:#2f6fb3;font-weight:800}
.bf-bit.zero{outline:2.5px solid #2f8f5b}.bf-bit.zero i{color:#1d6a41;font-weight:800}
.bf-bit.cleared{outline:2.5px dashed #c2413b}
.bf-bit.fnz{outline:2.5px solid #c2413b}.bf-bit.fnz i,.bf-bit.cleared i{color:#9b2c27;font-weight:800}
.bf-keys{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.bf-keys span{font-family:ui-monospace,Menlo,monospace;font-size:12px;padding:0 6px;border-radius:5px;background:#eef2ec}
.bf-keys span.hot{background:#dcefe2;color:#1d6a41}
.bf-probe{display:grid;grid-template-columns:repeat(25,minmax(0,1fr));gap:2px;margin-top:8px;max-width:420px}
.bf-probe i{display:block;aspect-ratio:1;border-radius:2px;background:#e6eee2}
.bf-probe i.ex{background:#2f8f5b}.bf-probe i.fp{background:#b7791f}
.bf-in{display:flex;gap:6px}
.bf-in input{flex:1}
.bf-narrow .bf-path{grid-template-columns:minmax(0,1fr)}
.bf-narrow .bf-path .ar{transform:rotate(90deg);line-height:1}
`);
    const MS=[8,16,24,32,48,64,96,128];
    const WORDS=['alpha','beta','epsilon','zeta','eta','theta','iota','kappa','lambda','mu','nu','xi','omicron','pi','rho','sigma','tau','upsilon','phi','chi'];
    const PRE={alpha:[1,4],beta:[4,6],gamma:[1,6],delta:[2,7]};
    const P={mi:0,k:2};let keys=[],bits=new Uint8Array(8),hl=new Map(),probe=null,narrow=false;
    const m=()=>MS[P.mi];
    function positions(key){if(m()===8&&P.k===2&&PRE[key])return PRE[key];const a=hash32(key),b=hash32(key+'#')|1;return util.range(P.k).map(i=>(a+i*b)%m())}
    function rebuild(){bits=new Uint8Array(m());for(const key of keys)for(const p of positions(key))bits[p]=1}
    const path=h('div',{class:'bf-path'});
    const mk=(title)=>{const s=h('span',{class:'s'},'—');const b=h('div',{class:'bf-box'},h('b',null,title),s);b.s=s;return b};
    const bMem=mk('memtable'),bBloom=mk('Bloom Filter'),bSst=mk('SSTable（磁盘）');
    path.append(bMem,h('span',{class:'ar'},'→'),bBloom,h('span',{class:'ar'},'→'),bSst);
    const bitsBox=h('div',{class:'bf-bits'});
    const sstKeys=h('div',{class:'bf-keys'});
    const probeBox=h('div');
    const msg=h('p',{class:'sdl-note',style:{fontSize:'13.5px'}});
    ctx.stage.append(path,bitsBox,h('div',{class:'sdl-panel',style:{marginTop:'8px'}},h('div',{class:'ph'},'SSTable 里真正存着的 key'),sstKeys),probeBox,msg);
    ctx.onResize(w=>{narrow=w<520;ctx.stage.classList.toggle('bf-narrow',narrow);drawBits()});
    function drawBits(){
      const cols=Math.min(m(),16);bitsBox.style.gridTemplateColumns=`repeat(${cols},minmax(0,1fr))`;
      bitsBox.replaceChildren(...util.range(m()).map(i=>{const t=hl.get(i);return h('div',{class:'bf-bit'+(bits[i]?' one':'')+(t?' '+t.cls:'')},h('i',null,t?t.label:String(i)),h('b',null,String(bits[i])))}));
    }
    function drawKeys(hot){sstKeys.replaceChildren(...(keys.length?keys.slice().sort().map(k=>h('span',{class:k===hot?'hot':null},k)):[h('span',null,'（空）')]))}
    const setBox=(b,on,txt,tone)=>{b.classList.toggle('on',on);b.s.textContent=txt;b.s.className='s'+(tone?' '+tone:'')};
    const st=ctx.stats([{key:'n',label:'已插入 key'},{key:'fill',label:'为 1 的位'},{key:'th',label:'理论误报率'},{key:'probe',label:'批量实测误报'}]);
    function stats(){const ones=bits.reduce((a,b)=>a+b,0);st.set('n',String(keys.length));st.set('fill',`${ones} / ${m()}`,ones/m()>.6?'warn':null);const th=Math.pow(1-Math.exp(-P.k*keys.length/m()),P.k);st.set('th',keys.length?util.pct(th):'—',th>.1?'warn':'ok');st.set('probe',probe?`${probe.fp} / 200`:'—',probe?(probe.fp>20?'bad':probe.fp>4?'warn':'ok'):null)}
    function all(){rebuild();hl.clear();drawBits();drawKeys();stats()}
    let tok=0;
    const input=h('input',{type:'text',value:'gamma','aria-label':'key',maxlength:24,spellcheck:false});
    ctx.controls.append(h('label',{class:'sdl-ctrl'},h('span',{class:'lbl'},h('span',null,'key')),h('div',{class:'bf-in'},input)));
    const mCtl=ctx.slider({label:'位数组长度 m',min:0,max:MS.length-1,value:P.mi,format:i=>MS[i]+' 位',onInput:i=>{P.mi=i;probe=null;probeBox.replaceChildren();all()}});
    const kCtl=ctx.slider({label:'哈希函数个数 k',min:1,max:4,value:P.k,onInput:v=>{P.k=v;probe=null;probeBox.replaceChildren();all()}});
    const busyGuard=fn=>()=>{fn().catch(()=>{})};
    ctx.button('插入',busyGuard(()=>insert(input.value.trim())),{primary:true});
    ctx.button('查询',busyGuard(()=>query(input.value.trim())));
    ctx.button('插入下一个示例 key',busyGuard(()=>{const w=WORDS.find(x=>!keys.includes(x));return w?insert(w):Promise.resolve()}));
    ctx.button('批量查询 200 个未插入的 key',busyGuard(()=>batch()));
    ctx.button('错误示范：删除时清零它的位',busyGuard(()=>badDelete(input.value.trim())),{danger:true});
    async function insert(key){
      if(!key)return;const t=++tok;if(keys.includes(key)){msg.textContent=`${key} 已经插入过。`;return}
      const ps=positions(key);hl=new Map(ps.map((p,i)=>[p,{cls:'hit',label:'h'+(i+1)}]));
      keys.push(key);drawKeys(key);setBox(bMem,false,'写入后刷成 SSTable');setBox(bBloom,true,`置位 ${ps.join('、')}`,'info');setBox(bSst,false,`写入 ${key}`);
      for(const p of ps){bits[p]=1}drawBits();stats();
      msg.textContent=`插入 ${key}：k=${P.k} 个哈希算出位置 ${ps.join('、')}，把它们置为 1。`;ctx.log(`插入 ${key} → 位 ${ps.join(',')}`,'info');
      await ctx.wait(500);if(t===tok)setBox(bBloom,false,`置位 ${ps.join('、')}`);
    }
    async function query(key){
      if(!key)return;const t=++tok;const ps=positions(key);hl=new Map();drawBits();drawKeys();
      setBox(bMem,true,'未命中');setBox(bBloom,false,'—');setBox(bSst,false,'—');await ctx.wait(450);if(t!==tok)return;
      setBox(bMem,false,'未命中');setBox(bBloom,true,'检查中…');
      for(let i=0;i<ps.length;i++){
        const p=ps[i];const zero=!bits[p];hl.set(p,{cls:zero?(keys.includes(key)?'fnz':'zero'):'hit',label:'h'+(i+1)});drawBits();await ctx.wait(550);if(t!==tok)return;
        if(zero){
          const inSst=keys.includes(key);
          setBox(bBloom,false,`位 ${p} 是 0：一定不存在`,inSst?'bad':'ok');
          setBox(bSst,false,inSst?`跳过——但 ${key} 其实在表里`:'跳过，省一次读盘',inSst?'bad':'ok');
          msg.textContent=inSst?`${key} 的位 ${p} 被清成了 0，过滤器回答「一定不存在」，读路径直接跳过 SSTable，返回「找不到」。可 ${key} 其实还在表里：这是漏报，数据读丢了。`:`查询 ${key}：位 ${ps.slice(0,i+1).join('、')} 中出现 0，说明它从没插入过，直接跳过这个 SSTable。`;
          ctx.log(`查询 ${key}：位 ${p}=0 → ${inSst?'漏报！':'排除'}`,inSst?'bad':'ok');ctx.announce(msg.textContent);return inSst?'fn':'skip';
        }
      }
      setBox(bBloom,false,`位 ${ps.join('、')} 全是 1：可能存在`,'warn');setBox(bSst,true,'读盘查找…');await ctx.wait(750);if(t!==tok)return;
      const found=keys.includes(key);drawKeys(found?key:null);
      setBox(bSst,false,found?`找到 ${key}`:`没有 ${key}：白读一次`,found?'ok':'bad');
      msg.textContent=found?`查询 ${key}：过滤器说「可能存在」，读 SSTable 确认确实有。`:`查询 ${key}：位 ${ps.join('、')} 都被别的 key 置成了 1，过滤器只能回答「可能存在」；读了 SSTable 才发现没有 ${key}。这就是假阳性。`;
      ctx.log(`查询 ${key}：可能存在 → 读盘${found?'找到':'没有（假阳性）'}`,found?'ok':'warn');ctx.announce(msg.textContent);return found?'hit':'fp';
    }
    async function batch(){
      const t=++tok;hl=new Map();drawBits();const cells=util.range(200).map(()=>h('i'));
      const grid=h('div',{class:'bf-probe','aria-hidden':'true'},cells);
      const cap=h('p',{class:'sdl-note'},'200 个从未插入的 key 逐个查询中…');
      probeBox.replaceChildren(h('div',{class:'sdl-panel',style:{marginTop:'8px'}},h('div',{class:'ph'},'批量查询：绿色 = 直接排除，琥珀 = 误报后白读一次盘'),grid,cap));
      let fp=0;
      for(let i=0;i<200;i++){const ps=positions('probe:'+(i+1));const f=ps.every(p=>bits[p]);if(f)fp++;cells[i].className=f?'fp':'ex';if(i%10===9){await ctx.wait(50);if(t!==tok)return}}
      probe={fp};stats();
      cap.textContent=`200 个未插入的 key：${200-fp} 个被直接排除，${fp} 个误报（${util.pct(fp/200)}），也就是白读 ${fp} 次盘。当前 m=${m()}、k=${P.k}、已插入 ${keys.length} 个。`;
      msg.textContent='';ctx.log(cap.textContent,'info');ctx.announce(cap.textContent);return fp;
    }
    async function badDelete(key){
      if(!keys.includes(key)){msg.textContent=`${key} 不在表里，没有可删除的。`;return}
      const t=++tok;const ps=positions(key);keys=keys.filter(k=>k!==key);
      hl=new Map(ps.map((p,i)=>[p,{cls:'cleared',label:'清零'}]));for(const p of ps)bits[p]=0;drawBits();drawKeys();stats();
      const shared=ps.filter(p=>keys.some(k=>positions(k).includes(p)));
      setBox(bMem,false,'—');setBox(bBloom,true,`清零 ${ps.join('、')}`,'bad');setBox(bSst,false,`删除 ${key}`);
      msg.textContent=`删除 ${key} 时把位 ${ps.join('、')} 清零。`+(shared.length?`其中位 ${shared.join('、')} 还被 ${keys.filter(k=>positions(k).some(p=>shared.includes(p))).join('、')} 共用，它们从此可能被误判为「一定不存在」。`:'这次恰好没有共用位，但一般无法保证。');
      ctx.log(`错误删除 ${key}：清零位 ${ps.join(',')}`,'bad');await ctx.wait(400);if(t===tok)setBox(bBloom,false,`清零 ${ps.join('、')}`,'bad');
    }
    keys=['alpha','beta'];all();setBox(bMem,false,'—');setBox(bBloom,false,'已插入 alpha、beta');setBox(bSst,false,'2 个 key');
    msg.textContent='这是 Q06-04 的例子：8 位数组、2 个哈希，已插入 alpha（位 1、4）和 beta（位 4、6）。点「查询」看 gamma 会怎样。';

    async function prepare(mi,k,ks){tok++;P.mi=mi;P.k=k;mCtl.set(mi,true);kCtl.set(k,true);keys=[];probe=null;probeBox.replaceChildren();all();for(const b of [bMem,bBloom,bSst])setBox(b,false,'—');ctx.clearLog();await ctx.wait(400);for(const w of ks){await insert(w);await ctx.wait(700)}}
    ctx.scenarios([
      {id:'fp',label:'gamma 从没插入，为何「可能存在」',
        ask:'8 位数组、2 个哈希。插入 alpha（位 1、4）和 beta（位 4、6）后，查询 gamma（位 1、6）和 delta（位 2、7），各会怎样？',
        insight:'gamma 的位 1 和 6 分别被 alpha、beta 置成 1，过滤器只能回答「可能存在」，读了 SSTable 才发现没有 gamma：这是假阳性，白读一次盘。delta 查到位 2 是 0，立即排除，不必读盘。看到 0 可以排除，全是 1 只代表有嫌疑。',
        async run(){await prepare(0,2,['alpha','beta']);input.value='gamma';await query('gamma');await ctx.wait(1800);input.value='delta';await query('delta');await ctx.wait(1200)}},
      {id:'size',label:'位数组小了会怎样',
        ask:'k=3，插入 10 个 key。位数组 m=32 时，200 个从没插入过的 key 会误报多少个？把 m 放大到 128 呢？',
        insight:'m=32 时 10 个 key 把 19 位置成 1，200 次查询误报 33 个（16.5%），就是白读 33 次盘；m=128 时只有 23 位是 1，误报降到 3 个（1.5%）。位数组越满，误报越多；m、k 要按 key 数量来配，代价是内存。',
        async run(){await prepare(3,3,[]);keys=WORDS.slice(0,10);all();setBox(bBloom,false,'已插入 10 个 key');msg.textContent='一次插入 10 个 key。';await ctx.wait(900);await batch();await ctx.wait(2200);P.mi=7;mCtl.set(7,true);rebuild();hl.clear();drawBits();stats();await ctx.wait(900);await batch();await ctx.wait(1200)}},
      {id:'delete',label:'为什么不能直接删',
        ask:'还是 alpha（位 1、4）和 beta（位 4、6）。如果删除 alpha 时把位 1、4 清零，再查询 beta 会怎样？',
        insight:'位 4 是 alpha 和 beta 共用的，清零后 beta 的检查位出现 0，过滤器回答「一定不存在」，读路径直接跳过 SSTable，可 beta 其实还在表里：普通 Bloom Filter 这样删除会造成漏报。它的「没有假阴性」以只增不删、配置一致为前提；对不可变的 SSTable，通常在重写文件时重建过滤器。',
        async run(){await prepare(0,2,['alpha','beta']);input.value='alpha';await badDelete('alpha');await ctx.wait(2200);input.value='beta';await query('beta');await ctx.wait(1500)}},
    ]);
  }
});
})();
