/* Chapter 17: Nearby Friends. One Redis Pub/Sub channel per user; the servers hosting their friends subscribe, then filter by distance before pushing to the phone. */
(function(){
const {el:h,util}=SDLab;

SDLab.define({
  id:'nearby-pubsub',chapter:17,
  title:'Nearby friends: one channel per user, filtered by distance on the subscriber',
  summary:'Each online user periodically publishes their location to their own Redis channel, and the subscribers are the WebSocket servers hosting their online friends. A server that receives it computes the distance: within 5 miles it pushes to the phone (green), beyond that it drops the update (gray). Adjust the update interval and the scale parameters to see how push volume changes.',
  caveat:'12 users, fixed friendships, straight-line distance on a flat plane. The simulated clock runs 6 times faster and user movement is exaggerated. Messages are drawn straight to the friend, but the actual subscriber is the WebSocket server hosting that friend, and one server can share a subscription on behalf of several local clients. The scale conversion follows the chapter’s estimates (about 100,000 pushes per second per server, about 200 GB of channels) and needs load testing to verify.',
  mount(ctx){
    ctx.css('nf',`
.nf-svg{border:1px solid #e3e9e1;border-radius:10px;background:#f7f9f5}
.nf-panels{margin-top:10px}
.nf-list{list-style:none;margin:0;padding:0;font-size:13px}
.nf-list li{display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-top:1px solid #e8ede6;font-variant-numeric:tabular-nums}
.nf-list li:first-child{border-top:0}
.nf-muted{color:#66756d;font-size:12px;margin:6px 0 0;line-height:1.55}
.nf-sub{font-size:13px;line-height:1.65;margin:0}
.nf-sub b{font-family:ui-monospace,Menlo,monospace}
.nf-calc{margin-top:10px;font-size:13px}
.nf-calc .row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:5px 10px;border-top:1px solid #e8ede6;align-items:baseline}
.nf-calc .row:first-of-type{border-top:0}
.nf-calc .row b{font-variant-numeric:tabular-nums;font-size:15px;white-space:nowrap}
.nf-calc .row.hot{background:#fff7dd}
.nf-calc .row .ex{color:#66756d;font-size:12px}
`);
    const SPEEDUP=6,RADIUS=5,MW=24,MH=15;
    const NAMES='ABCDEFGHIJKL'.split('');
    const HOME={A:[9,7.5],B:[11.5,9.2],C:[6.3,5.4],D:[6.8,11.8],E:[17.2,4.2],F:[2.2,13],G:[11.8,5.3],H:[3.8,2.4],I:[20.2,10.8],J:[21.8,2.8],K:[15.2,12.2],L:[18.2,7.6]};
    const EDGES=[['A','B'],['A','C'],['A','D'],['A','E'],['A','F'],['B','C'],['B','G'],['C','H'],['D','H'],['E','I'],['F','J'],['G','K'],['H','L'],['I','J'],['K','L']];
    let U,F,S;
    function init(){
      const r=util.rng(17);
      U={};for(const n of NAMES){const a=r()*Math.PI*2,sp=0.004+r()*0.006;U[n]={n,x:HOME[n][0],y:HOME[n][1],vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,online:!['D','L'].includes(n),next:1+r()*29,flash:0,fcol:null}}
      F={};for(const n of NAMES)F[n]=new Set();for(const [a,b] of EDGES){F[a].add(b);F[b].add(a)}
      S={t:0,interval:30,auto:true,move:true,play:1,cnt:{pub:0,push:0,deliver:0,drop:0},seen:{},nOnline:1e7,nFriends:40,rng:r};
    }
    init();
    const d2=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
    const subscribers=n=>[...F[n]].filter(m=>U[m].online);

    /* ---- Controls ---- */
    const intCtl=ctx.segmented({label:'Location update interval',value:30,options:[[5,'5 s'],[10,'10 s'],[15,'15 s'],[30,'30 s'],[60,'60 s']],onChange:v=>{S.interval=v;for(const n of NAMES)U[n].next=Math.min(U[n].next,v);calc()}});
    const playCtl=ctx.segmented({label:'Auto demo',value:1,options:[[0,'Pause'],[1,'1×'],[2,'2×']],onChange:v=>{S.play=v}});
    const sOn=ctx.slider({label:'Scale: concurrent online users',min:1,max:20,value:10,format:v=>v+' million',onInput:v=>{S.nOnline=v*1e6;calc()}});
    const sFr=ctx.slider({label:'Scale: online friends per user',min:10,max:100,step:5,value:40,format:v=>v+' friends',onInput:v=>{S.nFriends=v;calc()}});
    const btnAG=ctx.button('Make A and G friends',()=>{F.A.has('G')?unfriend('A','G'):befriend('A','G')},{primary:true});
    const btnD=ctx.button('Bring D online',()=>setOnline('D',!U.D.online));
    ctx.button('A reports now',()=>publish('A'));

    /* ---- Stage: map + Redis channel bar ---- */
    let W=640,MAPH=320,H=370,sc=1,ox=0,oy=0;
    const svg=ctx.svg(W,H,{label:'User locations, Redis channels, and message flow'});svg.classList.add('nf-svg');
    const gBase=ctx.svgEl('g'),gEdge=ctx.svgEl('g'),gChip=ctx.svgEl('g'),gUser=ctx.svgEl('g'),gPart=ctx.svgEl('g');
    svg.append(gBase,gEdge,gChip,gUser,gPart);
    const circle=ctx.svgEl('circle',{fill:'#2f6fb30d',stroke:ctx.colors.info,'stroke-dasharray':'5 4','stroke-width':1.4});
    const circleLab=ctx.svgEl('text',{'font-size':11,fill:ctx.colors.info,text:'A’s 5-mile range'});
    const barLab=ctx.svgEl('text',{'font-size':12,'font-weight':650,fill:'#23352f'});
    gBase.append(circle,circleLab);
    const UE={};
    for(const n of NAMES){
      const ring=ctx.svgEl('circle',{fill:'none','stroke-width':3,opacity:0});
      const dot=ctx.svgEl('circle',{r:n==='A'?11:9,'stroke-width':1.5});
      const lab=ctx.svgEl('text',{'text-anchor':'middle','font-size':n==='A'?12:11,'font-weight':700,text:n});
      const g=ctx.svgEl('g',null,ring,dot,lab);gUser.append(g);
      const chip=ctx.svgEl('rect',{rx:5,height:22,'stroke-width':1});const ct=ctx.svgEl('text',{'text-anchor':'middle','font-size':12,'font-weight':650,class:'mono',text:n});
      gChip.append(chip,ct);UE[n]={ring,dot,lab,chip,ct,cflash:0,cdrop:0};
    }
    gChip.append(barLab);
    const X=x=>ox+x*sc,Y=y=>oy+(MH-y)*sc;
    let chipX={},chipY=0;
    function layout(){
      MAPH=Math.round(util.clamp(W*0.46,210,340));H=MAPH+52;
      svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
      sc=Math.min((W-16)/MW,(MAPH-12)/MH);ox=(W-MW*sc)/2;oy=6+(MAPH-12-MH*sc)/2;
      gBase.querySelectorAll('.nf-bg').forEach(e=>e.remove());
      gBase.prepend(ctx.svgEl('rect',{class:'nf-bg',x:0,y:MAPH,width:W,height:H-MAPH,fill:'#eef2ec'}),ctx.svgEl('line',{class:'nf-bg',x1:0,x2:W,y1:MAPH,y2:MAPH,stroke:'#dbe2da'}));
      const cw=Math.min(40,(W-16)/12-4),gap=((W-16)-cw*12)/11;chipY=MAPH+24;
      NAMES.forEach((n,i)=>{const x=8+i*(cw+gap);chipX[n]=x+cw/2;ctx.attr(UE[n].chip,{x,y:chipY,width:cw});ctx.attr(UE[n].ct,{x:x+cw/2,y:chipY+15.5})});
      ctx.attr(barLab,{x:8,y:MAPH+17,text:W<540?'Redis Pub/Sub: one channel per user':'Redis Pub/Sub: one location channel per user (names agreed in advance)'});
      drawEdges();
    }
    function drawEdges(){
      gEdge.replaceChildren();
      for(const m of F.A)gEdge.append(ctx.svgEl('line',{'data-f':m,stroke:'#9fb0c7','stroke-width':1.2,'stroke-dasharray':'2 4'}));
    }
    /* ---- Message particles (reused elements) ---- */
    const parts=[],pool=[],lpool=[];
    function spawn(o){const el=pool.pop()||ctx.svgEl('circle');if(o.trail){o.ln=lpool.pop()||ctx.svgEl('line',{stroke:ctx.colors.info,'stroke-width':1.2,opacity:.35});gPart.append(o.ln)}gPart.append(el);o.el=el;o.t=0;parts.push(o)}
    function stepParts(dt){
      for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.t+=dt;
        if(p.t>=p.dur){parts.splice(i,1);p.el.remove();pool.push(p.el);if(p.ln){p.ln.remove();lpool.push(p.ln)}p.end&&p.end();continue}}
    }
    function drawParts(){
      for(const p of parts){const k=util.clamp(p.t/p.dur,0,1),e=k<.5?2*k*k:1-(-2*k+2)**2/2;
        const x0=typeof p.from==='function'?p.from():p.from,x1=typeof p.to==='function'?p.to():p.to;
        const x=util.lerp(x0[0],x1[0],e),y=util.lerp(x0[1],x1[1],e);
        ctx.attr(p.el,{cx:x.toFixed(1),cy:y.toFixed(1),r:p.fade?4*(1-k)+1:4,fill:p.color,opacity:p.fade?1-k:1});if(p.ln)ctx.attr(p.ln,{x1:x0[0],y1:x0[1],x2:x.toFixed(1),y2:y.toFixed(1)})}
    }
    const upos=n=>()=>[X(U[n].x),Y(U[n].y)],cpos=n=>[chipX[n],chipY+11];

    /* ---- Publish and subscribe ---- */
    function publish(n){
      const u=U[n];if(!u.online)return;
      S.cnt.pub++;const at={x:u.x,y:u.y};u.flash=1;u.fcol=ctx.colors.info;
      spawn({from:[X(u.x),Y(u.y)],to:cpos(n),dur:0.45,color:ctx.colors.info,end:()=>{
        const subs=subscribers(n);UE[n].cflash=1;
        if(!subs.length){UE[n].cdrop=1;ctx.log(`Channel ${n} has no subscribers: the message is simply dropped, not retained like in a queue`,'warn');return}
        if(!S.auto)ctx.log(`${n} publishes to channel ${n}: delivered to the servers hosting ${subs.join(', ')}, ${subs.length} ${subs.length===1?'copy':'copies'} in all`,'info');
        for(const m of subs){S.cnt.push++;
          spawn({from:cpos(n),to:upos(m),dur:0.6,color:ctx.colors.info,trail:true,end:()=>{
            const d=d2(at,U[m]),ok=d<=RADIUS;
            if(ok){S.cnt.deliver++;U[m].flash=1;U[m].fcol=ctx.colors.ok;if(m==='A')S.seen[n]={d,t:S.t}}
            else{S.cnt.drop++;spawn({from:upos(m),to:upos(m),dur:0.5,color:'#98a39c',fade:true})}
            if(m==='A'||n==='A')ctx.log(`${n} → ${m}: ${d.toFixed(1)} miles apart, ${ok?'pushed to '+m+'’s phone':'beyond 5 miles, the server drops it'}`,ok?'ok':null);
            refresh();
          }})}
        refresh();
      }});
      refresh();
    }
    function befriend(a,b){
      F[a].add(b);F[b].add(a);
      ctx.log(`${a} and ${b} become friends: the server first verifies the friendship and sharing permission, then the server hosting ${a} subscribes to channel ${b} and the server hosting ${b} subscribes to channel ${a}`,'info');
      drawEdges();btnAG.textContent='Unfriend A and G';refresh(true);
    }
    function unfriend(a,b){
      F[a].delete(b);F[b].delete(a);delete S.seen[a==='A'?b:a];
      ctx.log(`${a} and ${b} are no longer friends: both servers unsubscribe from each other’s channel`,'warn');
      drawEdges();if(a==='A'&&b==='G')btnAG.textContent='Make A and G friends';refresh(true);
    }
    function setOnline(n,on){
      U[n].online=on;if(!on){for(const k of Object.keys(S.seen))if(k===n)delete S.seen[k]}
      ctx.log(on?`${n} comes online: its server subscribes to the channels of ${[...F[n]].join(', ')}, and ${n} becomes a new subscriber on its online friends’ channels`:`${n} goes offline: its server unsubscribes from all friend channels, and channel ${n} gets no new messages`,on?'info':'warn');
      btnD.textContent=U.D.online?'Take D offline':'Bring D online';refresh(true);
    }

    /* ---- Panels ---- */
    const listBox=h('ul',{class:'nf-list'}),hidden=h('p',{class:'nf-muted'}),clock=h('span',{class:'nf-muted',style:{margin:0}});
    const subBox=h('div');
    const pA=h('div',{class:'sdl-panel'},h('div',{class:'ph',style:{display:'flex',justifyContent:'space-between',gap:'8px'}},h('span',null,'A’s phone: nearby friends'),clock),listBox,hidden);
    const pS=h('div',{class:'sdl-panel'},h('div',{class:'ph'},'Subscriptions (involving A)'),subBox);
    const calcBox=h('div',{class:'sdl-panel nf-calc'},h('div',{class:'ph'},'At the book’s scale (per second)'));
    const rows={};
    for(const k of ['qps','push','nodes','mem']){rows[k]={el:h('div',{class:'row'}),l:h('span'),v:h('b')};rows[k].el.append(rows[k].l,rows[k].v);calcBox.append(rows[k].el)}
    ctx.stage.append(h('div',{class:'sdl-grid2 nf-panels'},pA,pS),calcBox);
    const st=ctx.stats([{key:'pub',label:'Updates sent'},{key:'push',label:'Redis pushes'},{key:'deliver',label:'Delivered to phones'},{key:'drop',label:'Dropped by distance filter'},{key:'fan',label:'Avg. fan-out per update'}]);
    const wan=v=>v>=1e9?util.fmt(v/1e9,2)+' billion':v>=1e6?util.fmt(v/1e6,v>=1e8?0:1)+' million':util.fmt(Math.round(v));
    function calc(){
      const qps=S.nOnline/S.interval,push=qps*S.nFriends,nodes=Math.ceil(push/1e5);
      rows.qps.l.innerHTML=`${wan(S.nOnline)} online ÷ one update every ${S.interval} s = location updates`;rows.qps.v.textContent=wan(qps)+' updates';
      rows.push.l.innerHTML=`× average ${S.nFriends} online friends = Redis pushes`;rows.push.v.textContent=wan(push)+' pushes';
      rows.nodes.l.innerHTML=`÷ about 100,000 pushes/s per server = Pub/Sub servers needed, at least${S.nOnline===1e7&&S.interval===30&&S.nFriends===40?' <span class="ex">(the chapter rounds to about 14 million pushes, 140 servers)</span>':''}`;rows.nodes.v.textContent=nodes+(nodes===1?' server':' servers');
      rows.mem.l.innerHTML='For comparison: channels take about 200 GB of memory (original estimate)<span class="ex">, so at 100 GB per server, this many would hold them</span>';rows.mem.v.textContent='2 servers';
    }
    function refresh(flashSub){
      st.set('pub',S.cnt.pub);st.set('push',S.cnt.push,'info');st.set('deliver',S.cnt.deliver,'ok');st.set('drop',S.cnt.drop,S.cnt.drop?'warn':null);
      st.set('fan',S.cnt.pub?(S.cnt.push/S.cnt.pub).toFixed(1):'—');
      const near=Object.entries(S.seen).filter(([n,v])=>F.A.has(n)&&U[n].online&&S.t-v.t<600).sort((a,b)=>a[1].d-b[1].d);
      listBox.replaceChildren(...(near.length?near.map(([n,v])=>h('li',null,h('span',null,h('b',null,n),' · ',v.d.toFixed(1)+' mi'),h('span',{class:'sdl-tag '+(S.t-v.t>2*S.interval?'warn':'ok')},Math.round(S.t-v.t)+' s ago'))):[h('li',{class:'nf-muted'},'No nearby friend locations received yet')]));
      const far=[...F.A].filter(n=>U[n].online&&!near.find(x=>x[0]===n)),off=[...F.A].filter(n=>!U[n].online);
      hidden.textContent=(far.length?`Not shown: ${far.join(', ')} (no update received from within 5 miles). `:'')+(off.length?`${off.join(', ')} ${off.length>1?'are':'is'} offline: no connection means no subscription.`:'');
      const chA=subscribers('A'),mine=[...F.A];
      subBox.replaceChildren(h('p',{class:'nf-sub'},'Channel ',h('b',null,'A'),' is subscribed by the servers hosting: ',chA.length?chA.join(', '):'nobody',' (',chA.length,')'),
        h('p',{class:'nf-sub'},'The server hosting A subscribes to the channels of: ',mine.map(n=>U[n].online?n:n+' (offline)').join(', ')),
        h('p',{class:'nf-muted'},'Subscribers of channel G: '+(subscribers('G').join(', ')||'none')+'. The number of copies one update fans out to equals the user’s online friend count, regardless of who is nearby.'));
      if(flashSub){subBox.classList.remove('sdl-flash');void subBox.offsetWidth;subBox.classList.add('sdl-flash')}
      const m=Math.floor(S.t/60),s=Math.floor(S.t%60);clock.textContent=`Simulated time ${m}:${String(s).padStart(2,'0')}`;
    }
    function draw(){
      ctx.attr(circle,{cx:X(U.A.x),cy:Y(U.A.y),r:RADIUS*sc});ctx.attr(circleLab,{x:X(U.A.x),y:Y(U.A.y)+RADIUS*sc-8,'text-anchor':'middle'});
      for(const l of gEdge.children){const m=l.dataset.f;ctx.attr(l,{x1:X(U.A.x),y1:Y(U.A.y),x2:X(U[m].x),y2:Y(U[m].y)})}
      for(const n of NAMES){const u=U[n],e=UE[n],x=X(u.x),y=Y(u.y);
        ctx.attr(e.dot,{cx:x,cy:y,fill:u.online?(n==='A'?ctx.colors.info:'#5f7268'):'#fff',stroke:u.online?'#fff':'#9aa69f','stroke-dasharray':u.online?null:'3 2'});
        ctx.attr(e.lab,{x,y:y+4,fill:u.online?'#fff':'#8a968f'});
        ctx.attr(e.ring,{cx:x,cy:y,r:(n==='A'?12:10)+8*(1-u.flash),stroke:u.fcol||'#fff',opacity:u.flash});
        const cf=e.cflash;ctx.attr(e.chip,{fill:e.cdrop>0?'#f6ead2':cf>0?'#dde9f6':'#fff',stroke:cf>0?ctx.colors.info:'#c9d4cb'});
      }
      drawParts();
    }
    let acc=0,lastRefresh=0;
    ctx.loop(dt=>{
      const sdt=dt*SPEEDUP*S.play;
      if(S.play){S.t+=sdt;
        if(S.move)for(const n of NAMES){const u=U[n];if(!u.online)continue;const a=(S.rng()-.5)*0.3*dt;const c=Math.cos(a),s=Math.sin(a);[u.vx,u.vy]=[u.vx*c-u.vy*s,u.vx*s+u.vy*c];
          u.x+=u.vx*sdt;u.y+=u.vy*sdt;if(u.x<0.6||u.x>MW-0.6){u.vx*=-1;u.x=util.clamp(u.x,0.6,MW-0.6)}if(u.y<0.6||u.y>MH-0.6){u.vy*=-1;u.y=util.clamp(u.y,0.6,MH-0.6)}}
        if(S.auto)for(const n of NAMES){const u=U[n];if(!u.online)continue;u.next-=sdt;if(u.next<=0){u.next+=S.interval;publish(n)}}
      }
      stepParts(dt);
      for(const n of NAMES){const u=U[n],e=UE[n];u.flash=Math.max(0,u.flash-dt*1.6);e.cflash=Math.max(0,e.cflash-dt*1.5);e.cdrop=Math.max(0,e.cdrop-dt*0.8)}
      acc+=dt;if(acc>1/30){acc=0;draw()}
      lastRefresh+=sdt;if(lastRefresh>1){lastRefresh=0;refresh()}
    });
    ctx.onResize(w=>{W=Math.round(w);layout();draw()});
    calc();refresh();

    /* ---- Scenarios ---- */
    function prepare(){
      init();parts.splice(0).forEach(p=>{p.el.remove();pool.push(p.el);if(p.ln){p.ln.remove();lpool.push(p.ln)}});
      S.auto=false;S.move=false;S.play=1;playCtl.set(1,true);intCtl.set(30,true);sOn.set(10,true);sFr.set(40,true);
      btnAG.textContent='Make A and G friends';btnD.textContent='Bring D online';drawEdges();ctx.clearLog();ctx.openLog(true);calc();refresh();draw();
    }
    const hot=async(k,ms)=>{for(const r of Object.values(rows))r.el.classList.remove('hot');rows[k].el.classList.add('hot');await ctx.wait(ms)};
    ctx.scenarios([
      {id:'fanout',label:'Fan-out per update',
        ask:'A has 5 friends: B and C are within 5 miles, E and F are online but far away, and D is offline. When A reports a location once, how many copies does Redis push, and how many phones end up receiving it?',
        insight:'Redis pushes 4 copies: the subscribers of channel A are the servers hosting the 4 online friends, and offline D has no connection and so no subscription. After computing distances, the subscribers push only to B and C, and the 2 copies sent for E and F are dropped. Push volume depends on the number of online friends, not nearby friends, which is why the chapter estimates fan-out as 400 friends × 10% online = 40 copies. Then B reports, pushing 3 copies in all to A, C, and G, and B appears in A’s phone list with a “few seconds ago” timestamp. Totals: 2 updates, 7 pushes.',
        async run(){prepare();await ctx.wait(400);publish('A');await ctx.wait(2200);publish('B');await ctx.wait(2400)}},
      {id:'scale',label:'Original scale: pushes per second',
        ask:'10 million people are online at once, each reporting every 30 seconds, with an average of 40 online friends. How many messages per second must Redis Pub/Sub push? At 100,000 per second per server, how many servers is that? What if people report every 10 seconds instead?',
        insight:'333,000 updates per second × 40 ≈ 13.33 million pushes per second (the chapter rounds to about 14 million), which at 100,000 per second per server needs at least about 134 servers (about 140 in the chapter). The channel memory estimate is only about 200 GB, which two 100 GB machines can hold: memory and throughput are separate budgets, and the bottleneck is push volume. With a 10-second interval, push volume triples to about 40 million per second and 400 servers; the messages in the auto demo above also get 3 times denser.',
        async run(){prepare();S.auto=true;S.move=true;await hot('qps',1600);await hot('push',1600);await hot('nodes',1600);await hot('mem',1800);
          intCtl.set(10);await hot('push',1600);await hot('nodes',2600);for(const r of Object.values(rows))r.el.classList.remove('hot')}},
      {id:'friend',label:'Adding and removing friends',
        ask:'G is about 3.6 miles from A but is not a friend yet. When G reports a location, does A receive it? What about after they become friends? Then remove the A–C friendship: does C’s update still reach A?',
        insight:'Before the friendship, the subscribers of channel G are only B and K, so A never receives G’s location. Once the friendship changes, each side’s server subscribes to the other’s channel, and G’s next update is pushed to A. After C is removed and unsubscribed, C’s update goes only to B and H (B is beyond 5 miles and drops it) and no longer reaches A. Channel names are agreed in advance and always exist; only the subscriptions change, and before subscribing the server must verify the real friendship and sharing permission.',
        async run(){prepare();await ctx.wait(300);publish('G');await ctx.wait(2200);befriend('A','G');await ctx.wait(1400);publish('G');await ctx.wait(2200);unfriend('A','C');await ctx.wait(1200);publish('C');await ctx.wait(2300)}},
    ]);
  }
});
})();
