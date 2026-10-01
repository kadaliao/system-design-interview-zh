/* Chapter 6: Key-value store. Lab 1 quorum reads and writes with counterexamples; lab 2 vector clocks; lab 3 the Bloom filter on the SSTable read path. */
(function(){
const {el:h,util}=SDLab;
const C=SDLab.colors;
const mix=x=>{x^=x>>>16;x=Math.imul(x,0x85ebca6b);x^=x>>>13;x=Math.imul(x,0xc2b2ae35);x^=x>>>16;return x>>>0};
const hash32=s=>mix(util.hash(s));

/* ---------------- Lab 1: Quorum reads and writes ---------------- */
SDLab.define({
  id:'quorum-rw',chapter:6,
  title:'Quorum Reads and Writes: Does Overlap Guarantee the Latest Value?',
  summary:'The coordinator sends writes and reads to the replicas: a write succeeds once W acknowledgements arrive, and a read returns the newest version among the first R replies. Click a replica to cycle “normal → slow → down”, adjust N, W, and R, and watch which version each replica holds and what the read returns.',
  caveat:'Versions are increasing numbers standing in for vector clocks, and a read returns the reply with the highest number. “Slow” means replies arrive late; “down” means the node has crashed or is cut off by a partition. In strict mode a write goes to all N replicas and a read uses the first R replies; sloppy quorum picks the first W / R healthy nodes along the ring, as in the chapter. A failed write does not roll back the replicas it already reached; read repair writes back only to the stale replicas that took part in the read.',
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
    let nodes=[],msgs=[],timers=[],marks=[],clock=0,busy=false,seq=0,latest=0,lastOk=null,lastRead=null,maxRet=0,regress=0,pos={},coordText='Waiting for an operation';
    const node=n=>nodes.find(x=>x.name===n);
    function initNodes(){nodes='ABCDEFG'.slice(0,P.n+2).split('').map((name,i)=>({name,home:i<P.n,state:'up',val:0,ver:i<P.n?0:-1,hints:[]}));seq=0;latest=0;lastOk=null;lastRead=null;maxRet=0;regress=0;msgs=[];timers=[];marks=[];busy=false;coordText='Waiting for an operation'}
    const visible=()=>nodes.filter(n=>n.home||P.sloppy||n.hints.length);
    const wrap=h('div',{class:'qr-svg'});
    ctx.stage.append(wrap);
    const svg=ctx.svg(700,250,{parent:wrap,label:'Read and write messages between the coordinator and the replicas'});
    const S=(t,a,...k)=>ctx.svgEl(t,t==='text'&&a&&a.fill?{...a,style:'fill:'+a.fill}:a,...k);/* runtime CSS sets the fill of all text, so colors must be written as inline styles */
    const linesG=S('g'),nodesG=S('g'),coordG=S('g'),msgG=S('g'),markG=S('g');
    svg.append(linesG,coordG,nodesG,msgG,markG);
    const res=h('div',{class:'qr-res'});
    const opBox=h('div',{class:'sdl-panel'},h('div',{class:'ph'},'Latest operations'));
    const opW=h('p',{class:'qr-line'},'Write: nothing written yet'),opR=h('p',{class:'qr-line'},'Read: nothing read yet');opBox.append(opW,opR);
    const setBox=h('div',{class:'sdl-panel'});
    res.append(opBox,setBox);ctx.stage.append(res);
    let narrow=false,BW=78,BH=62;
    function layout(){
      const vis=visible();
      if(!narrow){const sp=Math.min(96,640/vis.length);svg.setAttribute('viewBox','0 0 700 250');pos['@']=[350,40];vis.forEach((n,i)=>pos[n.name]=[350+(i-(vis.length-1)/2)*sp,180]);BW=Math.min(80,sp-8)}
      else{const rows=Math.ceil(vis.length/4),H=rows>1?330:224;svg.setAttribute('viewBox',`0 0 360 ${H}`);pos['@']=[180,36];vis.forEach((n,i)=>{const r=Math.floor(i/4),inRow=Math.min(4,vis.length-r*4);pos[n.name]=[180+(i%4-(inRow-1)/2)*86,158+r*104]});BW=78}
    }
    function stateTxt(n){return n.state==='slow'?' · slow':n.state==='down'?' · down':''}
    function render(){
      layout();linesG.replaceChildren();nodesG.replaceChildren();coordG.replaceChildren();
      const [cx,cy]=pos['@'];
      for(const n of visible()){const [x,y]=pos[n.name];linesG.append(S('line',{x1:cx,y1:cy+20,x2:x,y2:y-BH/2,stroke:n.state==='down'?C.bad:'#cfd8cc','stroke-width':1.5,'stroke-dasharray':n.state==='down'?'5 4':null,opacity:n.state==='down'?.6:1}))}
      coordG.append(S('rect',{x:cx-100,y:cy-20,width:200,height:44,rx:10,fill:C.soft,stroke:C.accent,'stroke-width':1.5}),S('text',{x:cx,y:cy-2,'text-anchor':'middle','font-size':13.5,'font-weight':750,text:'Coordinator'}),S('text',{x:cx,y:cy+16,'text-anchor':'middle','font-size':12,fill:C.muted,text:coordText}));
      for(const n of visible()){
        const [x,y]=pos[n.name];const fill=n.state==='down'?C.badSoft:n.state==='slow'?C.warnSoft:'#fff';
        const g=S('g',{class:'qr-node',role:'button',tabindex:0,'aria-label':`Replica ${n.name}${stateTxt(n)}, click to change state`,onclick:()=>cycle(n),onkeydown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();cycle(n)}}});
        g.append(S('rect',{x:x-BW/2,y:y-BH/2,width:BW,height:BH,rx:9,fill,stroke:n.home?'#9fb3a6':'#b9c3bc','stroke-width':1.5,'stroke-dasharray':n.home?null:'4 3'}));
        g.append(S('text',{x,y:y-BH/2+17,'text-anchor':'middle','font-size':13,'font-weight':750,fill:n.state==='down'?C.bad:n.state==='slow'?'#86561a':C.ink,text:n.name+stateTxt(n)}));
        let vt,vc,sub;
        if(n.home){vt=`x=${n.val} · v${n.ver}`;vc=n.ver>0&&n.ver===latest?C.ok:C.muted;sub=''}
        else{const hn=n.hints.slice().sort((a,b)=>b.ver-a.ver)[0];vt=hn?`x=${hn.val} · v${hn.ver}`:'no data';vc=hn&&hn.ver===latest?C.ok:C.muted;sub=hn?`for ${n.hints.map(x=>x.for).join(', ')}`:'successor'}
        g.append(S('text',{x,y:y+4,'text-anchor':'middle','font-size':12.5,'font-weight':650,fill:vc,class:'mono',text:vt}));
        if(sub)g.append(S('text',{x,y:y+22,'text-anchor':'middle','font-size':12,fill:n.hints.length?C.warn:C.muted,text:sub}));
        nodesG.append(g);
      }
      drawSets();refresh();
    }
    function cycle(n){n.state=n.state==='up'?'slow':n.state==='slow'?'down':'up';ctx.log(`${n.name} → ${n.state==='up'?'normal':n.state==='slow'?'slow':'down'}`,n.state==='down'?'bad':n.state==='slow'?'warn':'info');render()}
    function setCoord(t){coordText=t;const tx=coordG.querySelectorAll('text')[1];if(tx)tx.textContent=t}
    const setStr=a=>'{'+a.join(', ')+'}';
    function combos(arr,k){const out=[];const rec=(i,cur)=>{if(cur.length===k){out.push(cur.slice());return}for(let j=i;j<arr.length;j++){cur.push(arr[j]);rec(j+1,cur);cur.pop()}};rec(0,[]);return out}
    function drawSets(){
      const kids=[h('div',{class:'ph'},'Read and write sets')];
      if(!lastOk)kids.push(h('p',{class:'qr-line'},'No write has succeeded yet, so there is nothing to intersect.'));
      else{
        kids.push(h('p',{class:'qr-line'},`Latest successful write x=${lastOk.val}: acknowledged by `,h('b',null,setStr(lastOk.set))));
        if(lastRead){const inter=lastRead.set.filter(x=>lastOk.set.includes(x));kids.push(h('p',{class:'qr-line'},`This read set ${setStr(lastRead.set)} ∩ write set = `,h('span',{class:'sdl-tag '+(inter.length?'ok':'bad')},inter.length?setStr(inter):'empty set')))}
        if(!P.sloppy){const home=nodes.filter(n=>n.home).map(n=>n.name);const cs=combos(home,Math.min(P.r,home.length));
          kids.push(h('p',{class:'qr-line',style:{marginTop:'6px'}},`Choosing any ${P.r} of the ${P.n} replicas as the read set gives ${cs.length} possible sets:`),h('div',{class:'qr-combos'},cs.map(c=>h('span',{class:'sdl-tag '+(c.some(x=>lastOk.set.includes(x))?'ok':'bad')},c.join('')))));}
        else kids.push(h('p',{class:'sdl-note'},'In sloppy mode, reads and writes can land outside the original N replicas, so the overlap proof no longer applies directly.'));
      }
      setBox.replaceChildren(...kids);
    }
    /* ---- Message engine: dots move along the lines and call back on arrival ---- */
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
        setCoord(`Write x=${val}: acks 0/${P.w}`);ctx.log(`Write x=${val} (v${ver}) → ${ts.map(t=>t.n.name+(t.hint?` (for ${t.hint})`:'')).join(', ')}`,'info');
        const end=()=>{if(--pending>0)return;if(!decided){decided=true;setCoord(`Write x=${val} failed: ${acks.length}/${P.w}`);
          const kept=nodes.filter(n=>snapshot(n).ver===ver).map(n=>n.name);
          opW.replaceChildren(h('span',{class:'sdl-tag bad'},'Write failed'),` x=${val} got only ${acks.length} acks, fewer than W=${P.w}.`,kept.length?` The x=${val} already written on ${kept.join(', ')} is not rolled back.`:'');
          ctx.log(`Write x=${val} failed: ${acks.length} acks < W=${P.w}`,'bad');}busy=false;refresh();resolve(decided)};
        if(!ts.length){pending=1;end();return}
        for(const t of ts){
          const n=t.n;
          if(n.state==='down'){send('@',n.name,{dur:DROP,drop:true,label:'x='+val,color:C.info});timer(TIMEOUT,()=>{ctx.log(`${n.name} not responding (timeout)`,'warn');end()});continue}
          send('@',n.name,{dur:NORMAL,label:'x='+val,color:C.info,done:()=>{
            store(n,val,ver,t.hint);render();
            send(n.name,'@',{dur:n.state==='slow'?SLOW:NORMAL,label:'ack',color:C.ok,done:()=>{
              acks.push(n.name);
              if(!decided){setCoord(`Write x=${val}: acks ${acks.length}/${P.w}`);if(acks.length>=P.w){decided=true;lastOk={val,ver,set:acks.slice()};
                opW.replaceChildren(h('span',{class:'sdl-tag ok'},'Write succeeded'),` x=${val}: acknowledged by ${setStr(acks)}, reaching W=${P.w}.`);ctx.log(`Write x=${val} succeeded (acked by ${acks.join(', ')})`,'ok');setCoord(`Write x=${val} succeeded`);render();resolve(true)}}
              else ctx.log(`Ack from ${n.name} arrived late (write already returned)`);
              end();
            }});
          }});
        }
      });
    }
    function doRead(){
      return new Promise(resolve=>{
        busy=true;refresh();const ts=targets('r');const got=[];let pending=ts.length,decided=false;
        setCoord(`Read: replies 0/${P.r}`);ctx.log(`Read → ${ts.map(t=>t.n.name).join(', ')}, waiting for ${P.r} replies`,'info');
        const finish=(best,set)=>{
          const stale=lastOk&&best.ver<lastOk.ver,back=best.ver<maxRet;if(back)regress++;maxRet=Math.max(maxRet,best.ver);
          lastRead={set,val:best.val,ver:best.ver};
          opR.replaceChildren(h('span',{class:'sdl-tag '+(back||stale?'bad':'ok')},back?'Read regressed':stale?'Stale read':'Read succeeded'),` ${setStr(set)} replied, returning x=${best.val} (v${best.ver})`,back?`, older than the v${maxRet} read earlier.`:stale?`, but the latest successful write is x=${lastOk.val}.`:'.');
          ctx.log(`Read returned x=${best.val} (v${best.ver})${back?': regression':stale?': stale':''}`,back||stale?'bad':'ok');setCoord(`Read returned x=${best.val}`);busy=false;render();resolve(best);
        };
        const end=()=>{if(--pending>0)return;if(!decided){decided=true;setCoord(`Read failed: ${got.length}/${P.r}`);opR.replaceChildren(h('span',{class:'sdl-tag bad'},'Read failed'),` Got only ${got.length} replies, fewer than R=${P.r}.`);ctx.log('Read failed','bad');busy=false;refresh();resolve(null)}};
        if(!ts.length){pending=1;end();return}
        for(const t of ts){
          const n=t.n;
          if(n.state==='down'){send('@',n.name,{dur:DROP,drop:true,color:C.info});timer(TIMEOUT,()=>end());continue}
          send('@',n.name,{dur:NORMAL,color:C.info,done:()=>{
            const snap=snapshot(n);
            send(n.name,'@',{dur:n.state==='slow'?SLOW:NORMAL,label:snap.ver<0?'none':'v'+snap.ver,color:'#56657a',done:()=>{
              if(decided){ctx.log(`Reply from ${n.name} (v${snap.ver}) arrived late and was ignored`);end();return}
              got.push({n,...snap});setCoord(`Read: replies ${got.length}/${P.r}`);
              if(got.length>=P.r){decided=true;const best=got.reduce((a,b)=>b.ver>a.ver?b:a);const set=got.map(x=>x.n.name);
                const stale=got.filter(x=>x.ver<best.ver&&x.n.home);
                if(P.repair&&stale.length){let left=stale.length;setCoord('Read repair: write-back');ctx.log(`Read repair: writing x=${best.val} back to ${stale.map(x=>x.n.name).join(', ')}`,'info');
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
        if(!jobs.length){ctx.log('No hinted data to hand back (target replicas still down, or no hints)','warn');resolve(0);return}
        busy=true;refresh();let left=jobs.length;setCoord('hinted handoff');
        for(const [s,hn,t] of jobs)send(s.name,t.name,{dur:900,curve:true,label:'x='+hn.val,color:C.warn,done:()=>{store(t,hn.val,hn.ver,null);s.hints=s.hints.filter(x=>x!==hn);ctx.log(`${s.name} handed x=${hn.val} back to ${t.name}`,'ok');render();if(--left===0){busy=false;setCoord('Handoff complete');refresh();resolve(jobs.length)}}});
      });
    }
    const st=ctx.stats([{key:'rule',label:'R + W vs. N'},{key:'w',label:'Latest write'},{key:'r',label:'Latest read'},{key:'back',label:'Read regressions'}]);
    function refresh(){
      const sum=P.r+P.w;st.set('rule',`${P.r}+${P.w}=${sum} ${sum>P.n?'>':'≤'} ${P.n}`,sum>P.n?'ok':'warn');
      st.set('w',lastOk?`x=${lastOk.val} ok`:'—',lastOk?'ok':null);
      st.set('r',lastRead?`x=${lastRead.val}`:'—',lastRead?(lastOk&&lastRead.ver<lastOk.ver?'bad':'ok'):null);
      st.set('back',String(regress),regress?'bad':null);
      wBtn.textContent=`Write x=${seq+1}`;for(const b of [wBtn,rBtn,hBtn])b.disabled=busy;
    }
    function clampWR(){if(P.w>P.n){P.w=P.n;wCtl.set(P.w,true)}if(P.r>P.n){P.r=P.n;rCtl.set(P.r,true)}}
    const nCtl=ctx.slider({label:'Replicas N',min:3,max:5,value:P.n,onChange:v=>{P.n=v;clampWR();initNodes();opW.textContent='Write: nothing written yet';opR.textContent='Read: nothing read yet';render()}});
    const wCtl=ctx.slider({label:'Write acks W',min:1,max:5,value:P.w,onInput:v=>{P.w=Math.min(v,P.n);if(v>P.n)wCtl.set(P.w,true);render()}});
    const rCtl=ctx.slider({label:'Read replies R',min:1,max:5,value:P.r,onInput:v=>{P.r=Math.min(v,P.n);if(v>P.n)rCtl.set(P.r,true);render()}});
    const slCtl=ctx.toggle({label:'Sloppy quorum: borrow healthy nodes along the ring',value:false,onChange:v=>{P.sloppy=v;render()}});
    const rpCtl=ctx.toggle({label:'Write back to stale replicas before returning (read repair)',value:false,onChange:v=>{P.repair=v}});
    const wBtn=ctx.button('Write x=1',()=>doWrite(),{primary:true});
    const rBtn=ctx.button('Read',()=>doRead());
    const hBtn=ctx.button('Hinted handoff: hand back',()=>doHandoff());
    ctx.note('Click a replica to cycle “normal → slow → down”. A green version number means the replica holds the latest version written so far.');
    ctx.onResize(w=>{const n=w<560;if(n!==narrow){narrow=n;render()}});
    initNodes();render();

    async function settle(){while(msgs.length||timers.length)await ctx.wait(80);await ctx.wait(300)}
    async function prepare(o){
      Object.assign(P,{n:3,w:2,r:2,sloppy:false,repair:false},o);nCtl.set(P.n,true);wCtl.set(P.w,true);rCtl.set(P.r,true);slCtl.set(P.sloppy,true);rpCtl.set(P.repair,true);
      msgG.replaceChildren();markG.replaceChildren();initNodes();ctx.clearLog();opW.textContent='Write: nothing written yet';opR.textContent='Read: nothing read yet';render();await ctx.wait(500);
    }
    const setS=async(pairs,ms=1000)=>{for(const [n,s] of pairs){node(n).state=s;ctx.log(`${n} → ${s==='up'?'normal':s==='slow'?'slow':'down'}`,s==='down'?'bad':s==='slow'?'warn':'info')}render();await ctx.wait(ms)};
    async function counter(repair){
      await prepare({repair});await setS([['B','down'],['C','down']]);
      await doWrite();await settle();
      await setS([['B','up'],['C','slow']]);await doRead();await settle();
      await setS([['C','up'],['A','slow']]);await doRead();await settle();
    }
    ctx.scenarios([
      {id:'intersect',label:'R+W>N: every read set overlaps',
        ask:'N=3, W=2, R=2. While x=1 is written, C is down; A and B acknowledge and the write succeeds. After C recovers, you read, and A happens to be slow, so the replies come from B and C. Do you read 1? What if you drop R to 1?',
        insight:'The write set is {A,B}, and all three two-replica read sets contain A or B (all green in the panel); this time {B,C} reads x=1 through B. With R dropped to 1, R+W=3 is no longer greater than N, so the read set {C} doesn’t overlap the write set; C replies first and returns the old value 0, and the panel records one read regression.',
        async run(){await prepare({});await setS([['C','down']]);await doWrite();await settle();await setS([['C','up'],['A','slow']]);await doRead();await settle();
          P.r=1;rCtl.set(1,true);ctx.log('R set to 1','info');await setS([['B','slow']],900);await doRead();await settle()}},
      {id:'counter',label:'Overlap can still read “1, then 0”',
        ask:'N=3, R=W=2. While x=1 is written, B and C are down, so it reaches only A, falls short of W, and the write fails. After B and C recover, read 1 uses replies from A and B, and read 2 uses replies from B and C. What does each read return?',
        insight:'Read 1 gets v1 from A and returns 1, but doesn’t write it back to B; for read 2 the set {B,C} holds only the old value, so it returns 0. Both reads satisfy R=2, yet they see 1 and then fall back to 0 (1 read regression). R+W>N only guarantees overlap with a “completed write”; this write failed, and its partial write on A was not rolled back, so linearizability does not hold.',
        async run(){await counter(false)}},
      {id:'repair',label:'Write-back on read: no regression',
        ask:'Same failure sequence, but with “write back to stale replicas before returning” turned on. Does read 2 still return 0?',
        insight:'Read 1 finds that B is stale, writes x=1 back to B, and returns 1 only after B acknowledges. Now both A and B (a majority) hold v1, so read 2’s set {B,C} must include B and also returns 1, repairing C along the way. Write-back is just one part of a complete protocol; ordering of concurrent writes, membership changes, and so on still need separate handling.',
        async run(){await counter(true)}},
      {id:'sloppy',label:'Sloppy quorum loses the overlap',
        ask:'With sloppy quorum on, N=3, R=W=2. A and B are down when x=1 is written, so it borrows D from the ring. After A and B recover, you read right away. What do you read? And after hinted handoff?',
        insight:'The write lands on {C,D}, with D holding x=1 on behalf of A, and succeeds; after A and B recover, the read picks the first two healthy nodes along the ring, {A,B}, which don’t overlap the write set, so it returns the old value 0. D isn’t one of the original 3 replicas, so the R+W>N overlap proof no longer applies. Only after hinted handoff returns x=1 to A does a read give 1.',
        async run(){await prepare({sloppy:true});await setS([['A','down'],['B','down']]);await doWrite();await settle();await setS([['A','up'],['B','up']]);await doRead();await settle();await ctx.wait(1200);await doHandoff();await settle();await doRead();await settle()}},
    ]);
  }
});

/* ---------------- Lab 2: Vector clocks ---------------- */
SDLab.define({
  id:'vector-clock',chapter:6,
  title:'Vector Clocks: Who Is the Ancestor, Who Conflicts',
  summary:'Each write is handled by one server, which increments its own count in the vector. Click a version as the base for the write, then pick the server that handles it; when two versions don’t dominate each other they become siblings, and the system can only hand both to the client to merge.',
  caveat:'Three servers Sx, Sy, Sz. Selecting a base version is like a client writing with the version context it read. Writing twice on the same server from the same version would produce the same vector, so this lab rejects that (real systems need finer-grained version records to tell them apart). Vector pruning is not demonstrated.',
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
    ctx.stage.append(h('p',{class:'sdl-note',style:{marginTop:0}},'Click a version card to make it the base for the next write (blue outline).'),dag,panels);
    const selA=h('select',{'aria-label':'Compare version X'}),selB=h('select',{'aria-label':'Compare version Y'});
    selA.addEventListener('change',()=>{cmpA=selA.value;drawCmp()});selB.addEventListener('change',()=>{cmpB=selB.value;drawCmp()});
    const verdict=h('div',{class:'vc-verdict'});const cmpTable=h('div',{class:'sdl-scroll'});
    cmpBox.append(h('div',{class:'ph'},'Entry-by-entry comparison'),h('div',{class:'vc-sel'},'X =',selA,'Y =',selB),cmpTable,verdict);
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
            h('span',{class:'t'},h('b',null,v.id),h('span',{class:'by'},v.merged?`merged, by ${v.by}`:v.by?`written by ${v.by}`:'initial')),
            h('span',{class:'v'},vc),v.val!=null?h('span',{class:'val'},v.val):null,
            isF?h('span',{class:'sdl-tag '+(fr.length>1?'warn':'ok')},fr.length>1?'sibling':'latest'):null);
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
      const kids=[h('div',{class:'ph'},'Reading this key returns')];
      if(!fr.length)kids.push(h('p',{class:'vc-verdict'},'No versions yet.'));
      else if(fr.length===1)kids.push(h('p',{class:'vc-verdict'},h('span',{class:'sdl-tag ok'},fr[0].id),' One version, which dominates all the others: no conflict.'));
      else{
        kids.push(h('p',{class:'vc-verdict'},fr.map(v=>h('span',{class:'sdl-tag warn',style:{marginRight:'4px'}},v.id)),`${fr.length} siblings, none dominating another. The system can’t tell which is “right”, so it returns all of them to the client.`));
        kids.push(h('div',{class:'vc-merge'},fr.map(v=>h('button',{type:'button',onclick:()=>merge(v.id)},`Client keeps ${v.val!=null?'“'+v.val+'”':'the content of '+v.id}`))),h('p',{class:'sdl-note'},`The merged version is written by ${server}: take the entry-wise maximum, then add one to ${server}.`));
      }
      readBox.replaceChildren(...kids);
    }
    function syncSel(){for(const [s,cur] of [[selA,cmpA],[selB,cmpB]]){s.replaceChildren(...vs.map(v=>h('option',{value:v.id},v.id)));if(cur&&byId(cur))s.value=cur}}
    function drawCmp(){
      const a=byId(cmpA),b=byId(cmpB);
      if(!a||!b){cmpTable.replaceChildren();verdict.textContent='At least two versions are needed.';return}
      const sym=s=>{const x=a.vc[s]||0,y=b.vc[s]||0;return x===y?'=':x<y?'<':'>'};
      cmpTable.replaceChildren(h('table',{class:'sdl-table'},h('thead',null,h('tr',null,h('th',null,''),SV.map(s=>h('th',null,s)))),h('tbody',null,
        h('tr',null,h('td',null,'X '+a.id),SV.map(s=>h('td',null,String(a.vc[s]||0)))),h('tr',null,h('td',null,'Y '+b.id),SV.map(s=>h('td',null,String(b.vc[s]||0)))),
        h('tr',null,h('td',null,'X ? Y'),SV.map(s=>{const c=sym(s);return h('td',{style:{fontWeight:'700',color:c==='='?C.muted:C.info}},c)})))));
      const r=cmp(a,b);
      const txt={eq:['info','Same vector',`${a.id} and ${b.id} have the same vector.`],lt:['info','X is an ancestor of Y',`Every entry of ${a.id} is ≤ that of ${b.id}, and at least one is smaller: ${b.id} already contains all updates of ${a.id} and can simply replace it.`],gt:['info','Y is an ancestor of X',`Every entry of ${b.id} is ≤ that of ${a.id}, and at least one is smaller: ${a.id} already contains all updates of ${b.id}.`],cc:['warn','Concurrent: siblings',`Some entries are larger in ${a.id}, others in ${b.id}; neither contains the other. This is a conflict for the client or a business rule to merge.`]}[r];
      verdict.replaceChildren(h('span',{class:'sdl-tag '+txt[0]},txt[1]),' '+txt[2]+(SV.some(s=>!a.vc[s]||!b.vc[s])?' (missing entries count as 0)':''));
    }
    function write(baseId,sv,val){
      const b=baseId?byId(baseId):null;const vc=b?{...b.vc}:{};vc[sv]=(vc[sv]||0)+1;
      const dup=vs.find(v=>SV.every(s=>(v.vc[s]||0)===(vc[s]||0)));
      if(dup){ctx.log(`Writing again on ${sv} from ${b?b.id:'nothing'} would give the same vector ${vcStr({vc})} as ${dup.id}; this lab doesn’t allow it. Try another server`,'warn');ctx.announce('Duplicate vector, rejected');return null}
      const v={id:'D'+(++cnt),vc,by:sv,inc:sv,parents:b?[b.id]:[],val:val??null,gen:b?b.gen+1:0};
      vs.push(v);sel=v.id;fresh=v.id;
      if(b){cmpA=b.id;cmpB=v.id}
      ctx.log(`${v.id} = ${vcStr(v)}: ${sv} wrote from ${b?b.id:'nothing'}, ${sv} count +1`,'info');
      draw();refresh();ctx.announce(`${v.id} ${vcStr(v)}`);return v;
    }
    function merge(pickId){
      const fr=frontier();if(fr.length<2)return null;const pick=byId(pickId);
      const vc={};for(const s of SV){const m=Math.max(...fr.map(v=>v.vc[s]||0));if(m)vc[s]=m}vc[server]=(vc[server]||0)+1;
      const v={id:'D'+(++cnt),vc,by:server,inc:server,parents:fr.map(x=>x.id),val:pick.val!=null?pick.val:`content taken from ${pick.id}`,gen:Math.max(...fr.map(x=>x.gen))+1,merged:true};
      vs.push(v);sel=v.id;fresh=v.id;cmpA=fr.find(x=>x!==pick).id;cmpB=v.id;
      ctx.log(`${v.id} = ${vcStr(v)}: client merged ${fr.map(x=>x.id).join(', ')}, written by ${server}`,'ok');
      draw();refresh();ctx.announce(`Merged into ${v.id} ${vcStr(v)}`);return v;
    }
    const st=ctx.stats([{key:'n',label:'Versions'},{key:'sib',label:'Current siblings'},{key:'base',label:'Next write based on'}]);
    function refresh(){const fr=frontier();st.set('n',String(vs.length));st.set('sib',fr.length>1?fr.map(v=>v.id).join(', '):'no conflict',fr.length>1?'warn':'ok');st.set('base',sel?`${sel} · ${server}`:'—','info');wBtn.textContent=sel?`${server} writes from ${sel}`:`${server} writes the first version`}
    const svCtl=ctx.segmented({label:'Server handling the write',value:'Sx',options:SV.map(s=>[s,s]),onChange:v=>{server=v;drawRead(frontier());refresh()}});
    const wBtn=ctx.button('Write',()=>write(sel,server),{primary:true});
    ctx.onResize(()=>drawEdges());
    function reset(){vs=[];cnt=0;sel=null;cmpA=cmpB=null;fresh=null;ctx.clearLog()}
    reset();write(null,'Sx');write('D1','Sx');fresh=null;draw();

    async function step(base,sv,val,ms=1100){if(base){sel=base;draw()}svCtl.set(sv,true);server=sv;refresh();await ctx.wait(600);const v=write(base,sv,val);await ctx.wait(ms);return v}
    async function doMerge(pick,sv){svCtl.set(sv,true);server=sv;drawRead(frontier());refresh();await ctx.wait(1200);merge(pick);await ctx.wait(1400)}
    function compare(a,b){cmpA=a;cmpB=b;syncSel();drawCmp()}
    ctx.scenarios([
      {id:'book',label:'Book example D1 → D5',
        ask:'Sx writes D1 and D2; then Sy and Sz each write once based on D2, giving D3 and D4. Which of D3 and D4 is the ancestor of the other? How do you get D5?',
        insight:'D3=[Sx,2][Sy,1] and D4=[Sx,2][Sz,1]: D3 is larger on Sy and D4 is larger on Sz, so neither dominates and they are siblings. A read returns both; the client merges and hands the result to Sx to write: take the entry-wise maximum [Sx,2][Sy,1][Sz,1], then Sx adds one, giving D5=[Sx,3][Sy,1][Sz,1], which dominates D3 and D4.',
        async run(){reset();draw();await ctx.wait(400);await step(null,'Sx');await step('D1','Sx');await step('D2','Sy');await step('D2','Sz',undefined,600);compare('D3','D4');await ctx.wait(1800);await doMerge('D3','Sx');compare('D4','D5');await ctx.wait(800)}},
      {id:'name',label:'Can a vector clock pick the correct name',
        ask:'The name is originally “Zhang Min” with vector [Sx,1][Sy,1]. While disconnected, Sx changes it to “Zhang Ming” and Sy changes it to “Li Min”. Which does the vector clock pick automatically?',
        insight:'Sx’s version is [Sx,2][Sy,1] and Sy’s is [Sx,1][Sy,2]: one entry larger, one smaller, so neither dominates. A vector clock only knows these are two independent edits; it doesn’t understand names, won’t and shouldn’t pick one, and certainly can’t splice one character from each side into “Li Ming”. After the user confirms “Zhang Ming”, Sx writes the merged version [Sx,3][Sy,2], showing that it has seen both branches.',
        async run(){reset();const d1={id:'D1',vc:{Sx:1,Sy:1},by:null,inc:null,parents:[],val:'Zhang Min',gen:0};vs.push(d1);cnt=1;sel='D1';draw();refresh();ctx.log('D1 = [Sx,1][Sy,1]: name “Zhang Min”','info');await ctx.wait(900);
          await step('D1','Sx','Zhang Ming');await step('D1','Sy','Li Min',600);compare('D2','D3');await ctx.wait(2000);await doMerge('D2','Sx');compare('D3','D4');await ctx.wait(600)}},
      {id:'sum',label:'A larger sum ≠ newer',
        ask:'X=[Sx,1][Sy,3] has sum 4; Y=[Sx,2][Sy,1] has sum 3. Is X newer than Y? And what is the relationship between D1=[Sx,1] and X?',
        insight:'X is larger on Sy and Y is larger on Sx; compared entry by entry neither dominates, so they are concurrent, regardless of the sum. D1=[Sx,1] has no Sy entry, which counts as 0; every entry is ≤ X and Sy is smaller, so D1 is an ancestor of X.',
        async run(){reset();draw();await ctx.wait(400);await step(null,'Sx',undefined,700);await step('D1','Sy',undefined,700);await step('D2','Sx',undefined,700);await step('D2','Sy',undefined,700);await step('D4','Sy',undefined,700);compare('D5','D3');await ctx.wait(2600);compare('D1','D5');await ctx.wait(2000)}},
    ]);
  }
});

/* ---------------- Lab 3: Bloom filter ---------------- */
SDLab.define({
  id:'bloom-filter',chapter:6,
  title:'Bloom Filter: Why Read the Disk After “Possibly Present”',
  summary:'The SSTable read path asks the Bloom filter first. Inserting a key sets k bit positions to 1; on a query, seeing a single 0 lets you skip the file, while all 1s only means “possibly present”, and you must still read the SSTable to know.',
  caveat:'Only one SSTable and its filter are drawn, and the memtable is assumed to miss; positions come from combining two hash values. With m=8 and k=2, alpha, beta, gamma, and delta use the positions from the Q06-04 self-check card. “Disk read” stands for looking up the index and data files, which may actually hit the page cache.',
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
    const bMem=mk('memtable'),bBloom=mk('Bloom Filter'),bSst=mk('SSTable (disk)');
    path.append(bMem,h('span',{class:'ar'},'→'),bBloom,h('span',{class:'ar'},'→'),bSst);
    const bitsBox=h('div',{class:'bf-bits'});
    const sstKeys=h('div',{class:'bf-keys'});
    const probeBox=h('div');
    const msg=h('p',{class:'sdl-note',style:{fontSize:'13.5px'}});
    ctx.stage.append(path,bitsBox,h('div',{class:'sdl-panel',style:{marginTop:'8px'}},h('div',{class:'ph'},'Keys actually stored in the SSTable'),sstKeys),probeBox,msg);
    ctx.onResize(w=>{narrow=w<520;ctx.stage.classList.toggle('bf-narrow',narrow);drawBits()});
    function drawBits(){
      const cols=Math.min(m(),16);bitsBox.style.gridTemplateColumns=`repeat(${cols},minmax(0,1fr))`;
      bitsBox.replaceChildren(...util.range(m()).map(i=>{const t=hl.get(i);return h('div',{class:'bf-bit'+(bits[i]?' one':'')+(t?' '+t.cls:'')},h('i',null,t?t.label:String(i)),h('b',null,String(bits[i])))}));
    }
    function drawKeys(hot){sstKeys.replaceChildren(...(keys.length?keys.slice().sort().map(k=>h('span',{class:k===hot?'hot':null},k)):[h('span',null,'(empty)')]))}
    const setBox=(b,on,txt,tone)=>{b.classList.toggle('on',on);b.s.textContent=txt;b.s.className='s'+(tone?' '+tone:'')};
    const st=ctx.stats([{key:'n',label:'Inserted keys'},{key:'fill',label:'Bits set to 1'},{key:'th',label:'Theoretical false-positive rate'},{key:'probe',label:'Batch-measured false positives'}]);
    function stats(){const ones=bits.reduce((a,b)=>a+b,0);st.set('n',String(keys.length));st.set('fill',`${ones} / ${m()}`,ones/m()>.6?'warn':null);const th=Math.pow(1-Math.exp(-P.k*keys.length/m()),P.k);st.set('th',keys.length?util.pct(th):'—',th>.1?'warn':'ok');st.set('probe',probe?`${probe.fp} / 200`:'—',probe?(probe.fp>20?'bad':probe.fp>4?'warn':'ok'):null)}
    function all(){rebuild();hl.clear();drawBits();drawKeys();stats()}
    let tok=0;
    const input=h('input',{type:'text',value:'gamma','aria-label':'key',maxlength:24,spellcheck:false});
    ctx.controls.append(h('label',{class:'sdl-ctrl'},h('span',{class:'lbl'},h('span',null,'key')),h('div',{class:'bf-in'},input)));
    const mCtl=ctx.slider({label:'Bit array length m',min:0,max:MS.length-1,value:P.mi,format:i=>MS[i]+' bits',onInput:i=>{P.mi=i;probe=null;probeBox.replaceChildren();all()}});
    const kCtl=ctx.slider({label:'Number of hash functions k',min:1,max:4,value:P.k,onInput:v=>{P.k=v;probe=null;probeBox.replaceChildren();all()}});
    const busyGuard=fn=>()=>{fn().catch(()=>{})};
    ctx.button('Insert',busyGuard(()=>insert(input.value.trim())),{primary:true});
    ctx.button('Query',busyGuard(()=>query(input.value.trim())));
    ctx.button('Insert next sample key',busyGuard(()=>{const w=WORDS.find(x=>!keys.includes(x));return w?insert(w):Promise.resolve()}));
    ctx.button('Batch-query 200 keys never inserted',busyGuard(()=>batch()));
    ctx.button('Wrong approach: clear its bits on delete',busyGuard(()=>badDelete(input.value.trim())),{danger:true});
    async function insert(key){
      if(!key)return;const t=++tok;if(keys.includes(key)){msg.textContent=`${key} has already been inserted.`;return}
      const ps=positions(key);hl=new Map(ps.map((p,i)=>[p,{cls:'hit',label:'h'+(i+1)}]));
      keys.push(key);drawKeys(key);setBox(bMem,false,'Flushed to an SSTable after the write');setBox(bBloom,true,`Set bits ${ps.join(', ')}`,'info');setBox(bSst,false,`Write ${key}`);
      for(const p of ps){bits[p]=1}drawBits();stats();
      msg.textContent=`Insert ${key}: with k=${P.k}, the hashes give positions ${ps.join(', ')}, and those bits are set to 1.`;ctx.log(`Insert ${key} → bits ${ps.join(',')}`,'info');
      await ctx.wait(500);if(t===tok)setBox(bBloom,false,`Set bits ${ps.join(', ')}`);
    }
    async function query(key){
      if(!key)return;const t=++tok;const ps=positions(key);hl=new Map();drawBits();drawKeys();
      setBox(bMem,true,'Miss');setBox(bBloom,false,'—');setBox(bSst,false,'—');await ctx.wait(450);if(t!==tok)return;
      setBox(bMem,false,'Miss');setBox(bBloom,true,'Checking…');
      for(let i=0;i<ps.length;i++){
        const p=ps[i];const zero=!bits[p];hl.set(p,{cls:zero?(keys.includes(key)?'fnz':'zero'):'hit',label:'h'+(i+1)});drawBits();await ctx.wait(550);if(t!==tok)return;
        if(zero){
          const inSst=keys.includes(key);
          setBox(bBloom,false,`Bit ${p} is 0: definitely absent`,inSst?'bad':'ok');
          setBox(bSst,false,inSst?`Skipped, but ${key} is actually in the table`:'Skipped: one disk read saved',inSst?'bad':'ok');
          msg.textContent=inSst?`Bit ${p} of ${key} was cleared to 0, so the filter answers “definitely absent”, the read path skips the SSTable and returns “not found”. But ${key} is still in the table: this is a false negative, and the data is lost to readers.`:`Query ${key}: a 0 appears among bits ${ps.slice(0,i+1).join(', ')}, so it was never inserted, and this SSTable is skipped.`;
          ctx.log(`Query ${key}: bit ${p}=0 → ${inSst?'false negative!':'ruled out'}`,inSst?'bad':'ok');ctx.announce(msg.textContent);return inSst?'fn':'skip';
        }
      }
      setBox(bBloom,false,`Bits ${ps.join(', ')} are all 1: possibly present`,'warn');setBox(bSst,true,'Reading disk…');await ctx.wait(750);if(t!==tok)return;
      const found=keys.includes(key);drawKeys(found?key:null);
      setBox(bSst,false,found?`Found ${key}`:`No ${key}: a wasted read`,found?'ok':'bad');
      msg.textContent=found?`Query ${key}: the filter says “possibly present”, and reading the SSTable confirms it is there.`:`Query ${key}: bits ${ps.join(', ')} were all set to 1 by other keys, so the filter can only answer “possibly present”; only reading the SSTable reveals there is no ${key}. This is a false positive.`;
      ctx.log(`Query ${key}: possibly present → disk read ${found?'found it':'found nothing (false positive)'}`,found?'ok':'warn');ctx.announce(msg.textContent);return found?'hit':'fp';
    }
    async function batch(){
      const t=++tok;hl=new Map();drawBits();const cells=util.range(200).map(()=>h('i'));
      const grid=h('div',{class:'bf-probe','aria-hidden':'true'},cells);
      const cap=h('p',{class:'sdl-note'},'Querying 200 keys that were never inserted…');
      probeBox.replaceChildren(h('div',{class:'sdl-panel',style:{marginTop:'8px'}},h('div',{class:'ph'},'Batch query: green = ruled out directly, amber = false positive, one wasted disk read'),grid,cap));
      let fp=0;
      for(let i=0;i<200;i++){const ps=positions('probe:'+(i+1));const f=ps.every(p=>bits[p]);if(f)fp++;cells[i].className=f?'fp':'ex';if(i%10===9){await ctx.wait(50);if(t!==tok)return}}
      probe={fp};stats();
      cap.textContent=`200 keys never inserted: ${200-fp} ruled out directly, ${fp} false positives (${util.pct(fp/200)}), i.e. ${fp} wasted disk reads. Currently m=${m()}, k=${P.k}, ${keys.length} keys inserted.`;
      msg.textContent='';ctx.log(cap.textContent,'info');ctx.announce(cap.textContent);return fp;
    }
    async function badDelete(key){
      if(!keys.includes(key)){msg.textContent=`${key} is not in the table, so there is nothing to delete.`;return}
      const t=++tok;const ps=positions(key);keys=keys.filter(k=>k!==key);
      hl=new Map(ps.map((p,i)=>[p,{cls:'cleared',label:'clear'}]));for(const p of ps)bits[p]=0;drawBits();drawKeys();stats();
      const shared=ps.filter(p=>keys.some(k=>positions(k).includes(p)));
      setBox(bMem,false,'—');setBox(bBloom,true,`Clear bits ${ps.join(', ')}`,'bad');setBox(bSst,false,`Delete ${key}`);
      msg.textContent=`Deleting ${key} clears bits ${ps.join(', ')} to 0. `+(shared.length?`Of these, bits ${shared.join(', ')} are also shared by ${keys.filter(k=>positions(k).some(p=>shared.includes(p))).join(', ')}, which may from now on be wrongly judged “definitely absent”.`:'This time no bits happen to be shared, but that can’t be guaranteed in general.');
      ctx.log(`Wrong delete of ${key}: cleared bits ${ps.join(',')}`,'bad');await ctx.wait(400);if(t===tok)setBox(bBloom,false,`Clear bits ${ps.join(', ')}`,'bad');
    }
    keys=['alpha','beta'];all();setBox(bMem,false,'—');setBox(bBloom,false,'alpha, beta inserted');setBox(bSst,false,'2 keys');
    msg.textContent='This is the Q06-04 example: an 8-bit array and 2 hashes, with alpha (bits 1, 4) and beta (bits 4, 6) inserted. Click “Query” to see what happens to gamma.';

    async function prepare(mi,k,ks){tok++;P.mi=mi;P.k=k;mCtl.set(mi,true);kCtl.set(k,true);keys=[];probe=null;probeBox.replaceChildren();all();for(const b of [bMem,bBloom,bSst])setBox(b,false,'—');ctx.clearLog();await ctx.wait(400);for(const w of ks){await insert(w);await ctx.wait(700)}}
    ctx.scenarios([
      {id:'fp',label:'gamma was never inserted: why “possibly present”',
        ask:'8-bit array, 2 hashes. After inserting alpha (bits 1, 4) and beta (bits 4, 6), what happens when you query gamma (bits 1, 6) and delta (bits 2, 7)?',
        insight:'gamma’s bits 1 and 6 were set to 1 by alpha and beta, so the filter can only answer “possibly present”; only reading the SSTable shows there is no gamma. That is a false positive: one wasted disk read. For delta, bit 2 is 0, so it is ruled out immediately with no disk read. Seeing a 0 rules it out; all 1s only means a suspect.',
        async run(){await prepare(0,2,['alpha','beta']);input.value='gamma';await query('gamma');await ctx.wait(1800);input.value='delta';await query('delta');await ctx.wait(1200)}},
      {id:'size',label:'What if the bit array is too small',
        ask:'With k=3 and 10 keys inserted, how many of 200 never-inserted keys give false positives when m=32? And when you enlarge m to 128?',
        insight:'With m=32, 10 keys set 19 bits to 1, and 200 queries give 33 false positives (16.5%), i.e. 33 wasted disk reads; with m=128 only 23 bits are 1, and false positives drop to 3 (1.5%). The fuller the bit array, the more false positives; m and k should be sized to the number of keys, at the cost of memory.',
        async run(){await prepare(3,3,[]);keys=WORDS.slice(0,10);all();setBox(bBloom,false,'10 keys inserted');msg.textContent='Inserted 10 keys at once.';await ctx.wait(900);await batch();await ctx.wait(2200);P.mi=7;mCtl.set(7,true);rebuild();hl.clear();drawBits();stats();await ctx.wait(900);await batch();await ctx.wait(1200)}},
      {id:'delete',label:'Why you can’t just delete',
        ask:'Still alpha (bits 1, 4) and beta (bits 4, 6). If deleting alpha clears bits 1 and 4, what happens when you then query beta?',
        insight:'Bit 4 is shared by alpha and beta; once it is cleared, one of beta’s checked bits is 0, the filter answers “definitely absent”, and the read path skips the SSTable even though beta is still in the table: deleting this way from an ordinary Bloom filter causes false negatives. Its “no false negatives” guarantee assumes insert-only use and a consistent configuration; for an immutable SSTable, the filter is normally rebuilt when the file is rewritten.',
        async run(){await prepare(0,2,['alpha','beta']);input.value='alpha';await badDelete('alpha');await ctx.wait(2200);input.value='beta';await query('beta');await ctx.wait(1500)}},
    ]);
  }
});
})();
