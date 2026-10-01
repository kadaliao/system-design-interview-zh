/* Chapter 12: Chat System. Lab 1 shows message delivery, fan-out on write, message IDs, and multi-device cursors; lab 2 shows heartbeat-based presence and status fan-out. */
(function(){
const {el:h,util}=SDLab;

/* ---------------- Lab 1: how one message reaches every device ---------------- */
SDLab.define({
  id:'chat-delivery',chapter:12,
  title:'How a Message Reaches Every Device',
  summary:'Phones A, D, and C plus B’s two devices are connected to different chat servers. Send a message and watch it get written to KV first, then pushed over WebSocket to online devices; an offline user gets only a push alert and catches up by cursor after reconnecting. Switch the message ID scheme and the cursor style to see where misordering and missed messages come from.',
  caveat:'Every link takes the same transit time; the animation plays at 1/10 speed and server clocks count simulated milliseconds. A Snowflake ID is simplified to “server clock ms·server number”; the per-conversation sequence number is assigned by atomic increment per conversation when the message is written to KV. A message that reaches an online device counts as acknowledged, and the cursor is the largest ID received. “Others” is drawn as one summary link and is not counted in WebSocket pushes.',
  mount(ctx){
    ctx.css('cd',`
.cd-wrap svg{max-width:820px;margin:0 auto}
.cd-wrap .cd-fl{animation:cd-fl .9s ease-out}
.cd-wrap .cd-flw{animation:cd-flw 1.1s ease-out}
@keyframes cd-fl{from{fill:#cfe0f3}to{fill:#fff}}
@keyframes cd-flw{from{fill:#f6ead2}to{fill:#fff}}
.cd-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:#66756d;margin:6px 0 10px}
.cd-legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:-1px}
.cd-legend i.ln{border-radius:0;height:0;width:16px;border-top:2px solid #8fa396;vertical-align:3px}
.cd-legend i.dash{border-top-style:dashed}
.cd-devs{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.cd-dev{border:1px solid #dbe2da;border-radius:10px;padding:7px 9px;background:#fbfcfa;font-size:12.5px;line-height:1.5;min-width:0}
.cd-dev.off{background:#f3f4f1;border-style:dashed}
.cd-dev .hd{display:flex;justify-content:space-between;gap:6px;align-items:center;font-weight:700;font-size:13px}
.cd-dev .cur{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:#2f6fb3;margin:2px 0 4px;overflow-wrap:anywhere}
.cd-dev ul{list-style:none;margin:0;padding:0}
.cd-dev li{margin:1px 0;overflow-wrap:anywhere}
.cd-dev li .id{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:#66756d;margin-right:4px}
.cd-dev li.bad,.cd-dev li.bad .id{color:#c2413b}
.cd-dev .miss{color:#c2413b;font-weight:650;margin-top:3px}
.cd-dev .push{color:#86561a;margin-top:3px}
.cd-dev .more{color:#66756d;font-size:11.5px;margin-top:2px}
`);
    const C=ctx.colors,fmt=util.fmt;
    const SIZES=[4,10,100,1000,10000];
    const LAY={
      wide:{w:760,h:300,n:{A:[70,70],D:[70,232],S1:[250,70],S2:[250,232],KV:[440,150],PUSH:[440,270],BP:[668,34],BL:[668,104],C:[668,184],REST:[668,262]}},
      narrow:{w:340,h:348,n:{A:[62,28],D:[278,28],S1:[62,106],S2:[278,106],KV:[170,180],PUSH:[170,250],BP:[44,318],BL:[126,318],C:[212,318],REST:[294,318]}},
    };
    const SZ={wide:{dev:[104,44],srv:[124,48],kv:[150,64],push:[100,32]},narrow:{dev:[76,44],srv:[106,46],kv:[126,58],push:[96,30]}};
    const NODES={A:['A phone','dev'],D:['D phone','dev'],S1:['Chat server 1','srv'],S2:['Chat server 2','srv'],KV:['KV store','kv'],PUSH:['Push service','push'],BP:['B phone','dev'],BL:['B laptop','dev'],C:['C phone','dev'],REST:['Others','dev']};
    const EDGES=[['S1','S2'],['S1','KV'],['S2','KV'],['S1','PUSH'],['S2','PUSH'],['PUSH','C'],['A','S1'],['D','S2'],['BP','S1'],['BL','S1'],['C','S2'],['REST','S2']];
    const MEMBERS={G:['A','B','C','D'],P:['A','B']};
    const CONV={G:'Group',P:'DM'};
    const DEVS=['BP','BL','C','D'];
    const TXT={AG:['Dinner tonight?','7 at the usual place','I’ll book a table','Text me when you arrive','Bring an umbrella','Who’s driving?','My treat, bubble tea','Moving it to 7:30','Got it','OK'],DG:['Sure','I’ll be a bit late','Works for me','Count me in'],AP:['Did you read the file?','Call tonight','See you tomorrow','OK']};
    const P={scheme:'seq',cursor:'conv',mode:'fan',gi:0,skew:0};
    let S,L,kind='',G={};

    function fresh(){
      if(S)for(const p of S.packets)p.g&&p.g.remove();
      S={now:600,seq:{G:0,P:0},msgs:[],cnt:{body:0,idx:0,ws:0,push:0},packets:[],ti:{AG:0,DG:0,AP:0},
        dev:{BP:{name:'B phone',user:'B',srv:'S1',on:true},BL:{name:'B laptop',user:'B',srv:'S1',on:true},C:{name:'C phone',user:'C',srv:'S2',on:false},D:{name:'D phone',user:'D',srv:'S2',on:true}}};
      for(const d of Object.values(S.dev)){d.got=new Set();d.push=0;d.syncQ=-1}
      const seed=[['P','A','Are you there?',120],['G','A','Anyone hiking this weekend?',150],['P','B','Here',220],['G','D','I’m in',250],['P','A','Sent you the plan',320],['G','B','+1',350],['P','B','Got it',420],['P','A','Let’s talk tomorrow',520]];
      for(const [conv,from,text,t] of seed){const m={conv,from,text,t,sfT:t,srv:from==='D'?2:1};commit(m,true);for(const k of DEVS)if(MEMBERS[conv].includes(S.dev[k].user))S.dev[k].got.add(m.key)}
    }
    const idOf=m=>P.scheme==='sf'?m.sfT*10+m.srv:m.seq;
    const idTxt=m=>P.scheme==='sf'?m.sfT+'·'+m.srv:'#'+m.seq;
    const recips=m=>m.conv==='G'?SIZES[P.gi]-1:1;
    const mine=d=>S.msgs.filter(m=>MEMBERS[m.conv].includes(d.user));
    function commit(m,seed){
      m.seq=++S.seq[m.conv];m.key=m.conv+m.seq;m.commitT=S.now;S.msgs.push(m);
      if(seed)return;
      const n=P.mode==='fan'?recips(m):1;
      S.cnt.body++;S.cnt.idx+=n;
      for(const k of DEVS)if(S.dev[k].user===m.from)S.dev[k].got.add(m.key);
      flash('KV');
      ctx.log(`KV write, ${CONV[m.conv]} message ${idTxt(m)}: 1 body copy, ${P.mode==='fan'?'inbox index entries: '+fmt(n)+' (one per recipient)':'1 conversation-log entry (indexed by conversation)'}`,'info');
    }

    /* ---- Topology ---- */
    const wrap=h('div',{class:'cd-wrap'});
    const legend=h('div',{class:'cd-legend'},
      h('span',null,h('i',{class:'ln'}),'WebSocket connection'),h('span',null,h('i',{class:'ln dash'}),'Not connected'),
      h('span',null,h('i',{style:{background:C.info}}),'Message'),h('span',null,h('i',{style:{background:C.warn}}),'Push alert'),
      h('span',null,h('i',{style:{background:'#7d8b83'}}),'Catch-up request'),h('span',null,h('i',{style:{background:C.ok}}),'Catch-up result'));
    const devBox=h('div',{class:'cd-devs'});
    ctx.stage.append(wrap,legend,devBox);
    function build(k){
      kind=k;L=LAY[k];const sz=SZ[k];
      wrap.replaceChildren();
      const svg=ctx.svg(L.w,L.h,{label:'Chat system topology: devices, chat servers, KV store, and push service',parent:wrap});
      const ge=ctx.svgEl('g'),gn=ctx.svgEl('g'),gp=ctx.svgEl('g');svg.append(ge,gn,gp);
      G={edges:{},nodes:{},pk:gp};
      for(const [a,b] of EDGES){const [x1,y1]=L.n[a],[x2,y2]=L.n[b];const ln=ctx.svgEl('line',{x1,y1,x2,y2,stroke:'#b3c2b8','stroke-width':1.5});ge.append(ln);G.edges[a+b]=ln}
      for(const [id,[label,type]] of Object.entries(NODES)){
        const [cx,cy]=L.n[id],[w,hh]=sz[type];
        const rect=ctx.svgEl('rect',{x:cx-w/2,y:cy-hh/2,width:w,height:hh,rx:type==='kv'?10:8,fill:'#fff',stroke:type==='srv'?C.series[5]:type==='kv'?C.accent:'#9fb1a5','stroke-width':1.5});
        const lines=type==='kv'?3:type==='push'?1:2;
        const t1=ctx.svgEl('text',{x:cx,y:cy+(lines===1?4.5:lines===2?-3:-11),'text-anchor':'middle','font-size':12.5,'font-weight':650,text:label});
        const t2=lines>1?ctx.svgEl('text',{x:cx,y:cy+(lines===2?13:6),'text-anchor':'middle','font-size':11.5,fill:C.muted}):null;
        const t3=lines>2?ctx.svgEl('text',{x:cx,y:cy+21,'text-anchor':'middle','font-size':11.5,fill:C.muted}):null;
        const g=ctx.svgEl('g',null,rect,t1,t2,t3);gn.append(g);
        G.nodes[id]={g,rect,t1,t2,t3};
      }
      for(const p of S.packets)p.g=null;
      refresh();drawPackets();clocks();
    }
    function flash(id,warn){const n=G.nodes[id];if(!n)return;const r=n.rect;r.classList.remove('cd-fl','cd-flw');void r.getBoundingClientRect();r.classList.add(warn?'cd-flw':'cd-fl')}
    function clocks(){
      for(const s of ['S1','S2']){const n=G.nodes[s];if(n)n.t2.textContent='Clock '+Math.round(S.now+(s==='S1'?P.skew:0))+' ms'}
    }
    function refresh(){
      const N=G.nodes;if(!N.KV)return;
      N.KV.t2.textContent='Message bodies '+fmt(S.cnt.body);
      N.KV.t3.textContent='Index writes '+fmt(S.cnt.idx);
      for(const k of DEVS){const d=S.dev[k],n=N[k];n.t2.textContent=d.on?'Online':'Offline';n.t2.setAttribute('fill',d.on?C.ok:C.muted);n.rect.setAttribute('stroke-dasharray',d.on?'':'4 3');n.rect.setAttribute('stroke',d.on?C.ok:'#9fb1a5');G.edges[k+d.srv].setAttribute('stroke-dasharray',d.on?'':'4 4');G.edges[k+d.srv].setAttribute('stroke',d.on?'#8fa396':'#cfd8cc')}
      for(const k of ['A','D']){N[k].t2.textContent=k==='A'?'On server 1':'On server 2';N[k].rect.setAttribute('stroke',C.ok)}
      const rest=SIZES[P.gi]-4,show=rest>0;
      N.REST.g.style.display=show?'':'none';G.edges.RESTS2.style.display=show?'':'none';
      N.REST.t2.textContent=fmt(rest)+' more';N.REST.t2.setAttribute('fill',C.muted);
      G.edges.PUSHC.setAttribute('stroke-dasharray','3 4');
    }

    /* ---- Packet animation ---- */
    const SEG=420;
    function fly(path,type,label,done,onNode){const p={path,type,label,seg:0,t:0,done,onNode:onNode||{},g:null};S.packets.push(p);lp.start();return p}
    function drawPackets(){
      for(const p of S.packets){
        if(!p.g){const col=p.type==='msg'?C.info:p.type==='push'?C.warn:p.type==='req'?'#7d8b83':C.ok;
          p.circle=ctx.svgEl('circle',{r:6.5,fill:col,stroke:'#fff','stroke-width':1.5});
          p.text=ctx.svgEl('text',{x:9,y:4,'font-size':11.5,'font-weight':650,fill:col,stroke:'#fff','stroke-width':3,'paint-order':'stroke'});
          p.g=ctx.svgEl('g',null,p.circle,p.text);G.pk.append(p.g)}
        if(p.text.textContent!==p.label)p.text.textContent=p.label;
        const a=L.n[p.path[p.seg]],b=L.n[p.path[Math.min(p.seg+1,p.path.length-1)]];
        p.g.setAttribute('transform',`translate(${util.lerp(a[0],b[0],p.t).toFixed(1)},${util.lerp(a[1],b[1],p.t).toFixed(1)})`);
      }
    }
    const lp=ctx.loop(dt=>{
      if(!S.packets.length){lp.stop();return}
      S.now+=dt*100;
      for(const p of [...S.packets]){
        p.t+=dt*1000/SEG;
        while(p.t>=1){p.t-=1;p.seg++;const cb=p.onNode[p.seg];if(cb)cb(p);
          if(p.seg>=p.path.length-1){S.packets.splice(S.packets.indexOf(p),1);p.g&&p.g.remove();p.done&&p.done(p);break}}
      }
      drawPackets();clocks();
    },false);

    /* ---- Message flow ---- */
    function sendMsg(from,conv,text){
      const srv=from==='A'?'S1':'S2',key=from+conv;
      text=text||TXT[key][S.ti[key]++%TXT[key].length];
      const m={conv,from,text,t:S.now,srv:srv==='S1'?1:2};
      fly([from,srv],'msg','New message',()=>{
        m.sfT=Math.round(S.now+(srv==='S1'?P.skew:0));
        ctx.log(`${from} → chat server ${m.srv}: “${text}”${P.scheme==='sf'?', Snowflake assigned from its own clock: '+m.sfT+'·'+m.srv:''}`);
        fly([srv,'KV',srv],'msg',P.scheme==='sf'?m.sfT+'·'+m.srv:'Write',()=>deliver(m,srv),{1:p=>{commit(m);p.label=idTxt(m);refresh();render()}});
      });
    }
    function deliver(m,srv){
      const other=srv==='S1'?'S2':'S1';
      const users=MEMBERS[m.conv].filter(u=>u!==m.from);
      for(const u of users){
        const ds=DEVS.filter(k=>S.dev[k].user===u),online=ds.filter(k=>S.dev[k].on);
        if(!ds.length)continue;
        if(online.length){for(const k of online){const d=S.dev[k];fly(d.srv===srv?[srv,k]:[srv,other,k],'msg',idTxt(m),()=>{d.got.add(m.key);S.cnt.ws++;flash(k);render()})}}
        else{const k=ds[0],d=S.dev[k];fly([srv,'PUSH',k],'push','Alert',()=>{d.push++;S.cnt.push++;flash(k,true);ctx.log(`${d.name} is offline; the push service sends an alert (no syncable message body)`,'warn');render()})}
      }
      if(m.conv==='G'&&SIZES[P.gi]>4)fly(srv==='S2'?[srv,'REST']:[srv,'S2','REST'],'msg','×'+fmt(SIZES[P.gi]-4),null);
    }
    function curTxt(d){
      const got=mine(d).filter(m=>d.got.has(m.key));
      if(P.cursor==='user'){const mx=got.reduce((a,m)=>idOf(m)>idOf(a)?m:a,got[0]);return 'cur_max_message_id = '+(mx?idTxt(mx).replace('#',''):'0')}
      return Object.keys(MEMBERS).filter(c=>MEMBERS[c].includes(d.user)).map(c=>{const g=got.filter(m=>m.conv===c);const mx=g.reduce((a,m)=>idOf(m)>idOf(a)?m:a,g[0]);return CONV[c]+' '+(mx?idTxt(mx).replace('#',''):'0')}).join(' · ');
    }
    function query(d){
      const all=mine(d),got=all.filter(m=>d.got.has(m.key));
      if(P.cursor==='user'){const cur=got.length?Math.max(...got.map(idOf)):0;return all.filter(m=>idOf(m)>cur)}
      const res=[];
      for(const c of Object.keys(MEMBERS)){if(!MEMBERS[c].includes(d.user))continue;const g=got.filter(m=>m.conv===c);const cur=g.length?Math.max(...g.map(idOf)):0;res.push(...all.filter(m=>m.conv===c&&idOf(m)>cur))}
      return res;
    }
    function setOnline(k,on){
      const d=S.dev[k];if(d.on===on)return;d.on=on;
      if(!on){ctx.log(`${d.name} disconnected from WebSocket`,'warn');refresh();render();return}
      const cur=curTxt(d);
      ctx.log(`${d.name} reconnects to chat server ${d.srv.slice(1)} and catches up with its cursor: ${cur}`,'info');
      refresh();render();
      fly([k,d.srv,'KV'],'req','Catch-up',()=>{
        d.syncQ=S.now;const res=query(d);
        ctx.log(`KV returns ${res.length} for “${P.cursor==='user'?'message_id > user-level cur_max':'message_id > that conversation’s cursor, per conversation'}”: ${res.map(idTxt).join(', ')||'none'}`,res.length?'ok':null);
        fly(['KV',d.srv,k],'res','+'+res.length,()=>{
          for(const m of res)d.got.add(m.key);d.push=0;render();
          const miss=missing(d);
          if(miss.length)ctx.log(`${d.name} is still missing ${miss.length} after catching up: ${miss.map(m=>CONV[m.conv]+' '+idTxt(m)).join(', ')} (their IDs are not above the user-level cursor, so they were skipped)`,'bad');
          ctx.announce(`${d.name} fetched ${res.length}${miss.length?', still missing '+miss.length:''}`);
        });
      });
    }
    const missing=d=>d.syncQ<0?[]:mine(d).filter(m=>!d.got.has(m.key)&&m.commitT<=d.syncQ);
    function flagged(list){
      const bad=new Set();
      for(const m of list)for(const o of list)if(o.conv===m.conv&&idOf(o)>idOf(m)&&o.t<m.t)bad.add(m.key);
      return bad;
    }

    /* ---- Device panels ---- */
    function render(){
      devBox.replaceChildren();
      const allBad=new Set();let missN=0;
      for(const k of DEVS){
        const d=S.dev[k];
        const convs=Object.keys(MEMBERS).filter(c=>MEMBERS[c].includes(d.user)),per=convs.length>1?3:4;
        const miss=missing(d);missN+=miss.length;
        const secs=convs.map(c=>{
          const list=mine(d).filter(m=>m.conv===c&&d.got.has(m.key)).sort((a,b)=>idOf(a)-idOf(b));
          const bad=flagged(list);bad.forEach(x=>allBad.add(x));
          return [h('div',{class:'more'},(c==='G'?'Group chat':'DM (A–B)')+(list.length>per?' · '+(list.length-per)+' earlier':'')),
            h('ul',null,list.slice(-per).map(m=>h('li',{class:bad.has(m.key)?'bad':null},h('span',{class:'id'},idTxt(m)),m.from+': '+m.text,bad.has(m.key)?' (out of order)':'')))];
        });
        devBox.append(h('div',{class:'cd-dev'+(d.on?'':' off')},
          h('div',{class:'hd'},h('span',null,d.name),h('span',{class:'sdl-tag '+(d.on?'ok':'')},d.on?'Online':'Offline')),
          h('div',{class:'cur',title:'Sync cursor stored on the device'},curTxt(d)),secs,
          d.push?h('div',{class:'push'},'Push alerts: '+d.push+', bodies still to fetch'):null,
          miss.length?h('div',{class:'miss'},'Missed '+miss.length+': '+miss.map(m=>CONV[m.conv]+' '+idTxt(m)).join(', ')):null));
      }
      st.set('body',fmt(S.cnt.body));st.set('idx',fmt(S.cnt.idx),S.cnt.idx>1000?'warn':null);
      st.set('ws',fmt(S.cnt.ws),S.cnt.ws?'ok':null);st.set('push',fmt(S.cnt.push),S.cnt.push?'warn':null);
      st.set('miss',missN,missN?'bad':'ok');st.set('order',allBad.size,allBad.size?'bad':'ok');
      bB.textContent=S.dev.BP.on?'B phone drops':'B phone reconnects';bC.textContent=S.dev.C.on?'C goes offline':'C comes online';
    }

    /* ---- Controls ---- */
    const cScheme=ctx.segmented({label:'Message ID',value:P.scheme,options:[['seq','Per-chat sequence'],['sf','Global Snowflake']],onChange:v=>{P.scheme=v;refresh();render()}});
    const cCursor=ctx.segmented({label:'Device cursor',value:P.cursor,options:[['conv','Per-chat cursor'],['user','User-level cur_max']],onChange:v=>{P.cursor=v;render()}});
    const cMode=ctx.segmented({label:'Group sync',value:P.mode,options:[['fan','Index per member'],['shared','Per-chat index']],onChange:v=>{P.mode=v;refresh()}});
    const cSize=ctx.slider({label:'Group size',min:0,max:4,value:P.gi,format:i=>fmt(SIZES[i])+' members',onInput:v=>{P.gi=v;refresh()}});
    const cSkew=ctx.slider({label:'Server 1 clock',min:-100,max:0,step:10,value:P.skew,format:v=>v?(-v)+' ms slow':'Same as server 2',onInput:v=>{P.skew=v;clocks()}});
    ctx.button('A posts to group',()=>sendMsg('A','G'),{primary:true});
    ctx.button('D posts to group',()=>sendMsg('D','G'));
    ctx.button('A messages B',()=>sendMsg('A','P'));
    const bB=ctx.button('B phone drops',()=>setOnline('BP',!S.dev.BP.on));
    const bC=ctx.button('C comes online',()=>setOnline('C',!S.dev.C.on));
    const st=ctx.stats([{key:'body',label:'Message bodies written'},{key:'idx',label:'Index writes'},{key:'ws',label:'WebSocket pushes'},{key:'push',label:'Push alerts'},{key:'miss',label:'Missed'},{key:'order',label:'Out of order'}]);

    fresh();
    ctx.onResize(w=>{const k=w<600?'narrow':'wide';if(k!==kind)build(k)});
    render();
    ctx.wait(900).then(()=>{if(!S.cnt.body&&!S.packets.length)sendMsg('A','G')}).catch(()=>{});

    function prepare(o){
      Object.assign(P,{scheme:'seq',cursor:'conv',mode:'fan',gi:0,skew:0},o);
      cScheme.set(P.scheme,true);cCursor.set(P.cursor,true);cMode.set(P.mode,true);cSize.set(P.gi,true);cSkew.set(P.skew,true);
      fresh();if(o.cOn)S.dev.C.on=true;
      ctx.clearLog();refresh();render();drawPackets();clocks();
    }
    ctx.scenarios([
      {id:'online-offline',label:'Push online, alert offline',
        ask:'In a 4-member group (A, B, C, D), A sends 1 message. B’s phone and laptop are both online, D is online, and C is offline. How many inbox index entries does KV write? How many go over WebSocket, and how many via push? Where does C get the body after coming online?',
        insight:'The body is written once, with 3 inbox index entries (one each for B, C, and D; B’s two devices share one). WebSocket pushes happen 3 times (B’s phone, B’s laptop, D), and C gets just 1 push alert. Only after coming online does C catch up from KV with its cursor and get the body: a push is only an alert, and persisted history plus catch-up is what guarantees nothing is lost.',
        async run(){prepare({});await ctx.wait(400);sendMsg('A','G');await ctx.wait(2700);setOnline('C',true);await ctx.wait(2300)}},
      {id:'big-group',label:'Fan-out on write for 10,000?',
        ask:'In a 100-member group one message writes about 100 inbox index entries. Switch to a 10,000-member group where A sends 10 messages in a row (a second or two of traffic in a busy group). How many entries does fan-out on write produce in total? And with a per-conversation index?',
        insight:'With fan-out on write, 10 messages wrote 99,990 inbox index entries (9,999 each), against only 10 bodies. With “shared body, per-conversation index,” the next 10 messages just append 10 conversation-log entries, and each member reads by its own per-conversation cursor. Fan-out on write is simple and works well for small groups; for large ones, re-estimate the write amplification and shift the load from writes to reads.',
        async run(){prepare({gi:4,cOn:true});await ctx.wait(300);for(let i=0;i<10;i++){sendMsg('A','G');await ctx.wait(150)}await ctx.wait(2600);cMode.set('shared');ctx.log('Switched to per-chat index','info');await ctx.wait(300);for(let i=0;i<10;i++){sendMsg('A','G');await ctx.wait(150)}await ctx.wait(2600)}},
      {id:'cursor-mix',label:'Per-chat IDs, user-level cursor',
        ask:'Message IDs increase only within each conversation: the group is at #3 and the DM is at #5. B’s phone keeps a single user-level cur_max_message_id = 5. While it is offline, the group gets #4 and #5 and the DM gets #6. When the phone reconnects and catches up, how many messages does it get?',
        insight:'It gets only DM #6, 1 message: group #4 and #5 are not above 5, so they are treated as already read and skipped, the cursor then advances to 6, and those two can never be fetched again. Switch to per-conversation cursors (group 3, DM 6) and catch up again, and group #4 and #5 arrive. Per-conversation sequence numbers cannot be mixed with a user-level cursor: either keep a cursor per conversation, or give the user inbox its own monotonic sync sequence.',
        async run(){prepare({cursor:'user',cOn:true});await ctx.wait(300);setOnline('BP',false);await ctx.wait(500);sendMsg('A','G');await ctx.wait(350);sendMsg('A','G');await ctx.wait(350);sendMsg('A','P');await ctx.wait(2600);setOnline('BP',true);await ctx.wait(2300);await ctx.wait(900);cCursor.set('conv');setOnline('BP',false);await ctx.wait(300);setOnline('BP',true);await ctx.wait(2300)}},
      {id:'snowflake-skew',label:'Unique does not mean ordered',
        ask:'Server 1’s clock is 80 ms slower than server 2’s. D (on server 2) asks “What time is tomorrow’s meeting?” and 40 ms later A (on server 1) answers “3 pm.” Sorted by Snowflake ID, does B see them in the right order?',
        insight:'No: A’s answer gets a timestamp about 40 ms earlier than the question, so it sorts ahead of it and is flagged “out of order.” Snowflake guarantees uniqueness and roughly increasing time, but clock skew across servers pulls it away from the true order. After switching to per-chat sequence numbers, the two messages get #4 and #5 in the order they were written to the conversation and the order is restored; the global ID can still serve as the message’s unique identifier.',
        async run(){prepare({scheme:'sf',skew:-80,cOn:true});await ctx.wait(300);sendMsg('D','G','What time is tomorrow’s meeting?');await ctx.wait(400);sendMsg('A','G','3 pm');await ctx.wait(2700);await ctx.wait(1200);cScheme.set('seq');ctx.log('Switched to per-chat sequence: the same two messages are numbered in the order they were written to the conversation','info');await ctx.wait(1500)}},
    ]);
  }
});

/* ---------------- Lab 2: heartbeat-based presence ---------------- */
SDLab.define({
  id:'presence-heartbeat',chapter:12,
  title:'Does a Network Blip Count as Offline?',
  summary:'The phone sends a heartbeat to the presence server every few seconds and is marked offline only when none arrives within the threshold. Cut the network a few times and compare “heartbeat timeout” with “disconnect = offline,” and how many friends each status change fans out to.',
  caveat:'Time advances in simulated seconds (at 1× speed, 1 second of animation is about 10 simulated seconds). Heartbeats during an outage are simply lost, and the next scheduled heartbeat is sent after recovery. “Disconnect = offline” assumes the server notices a drop instantly; in reality a silent network loss is also usually found only through heartbeats or a TCP timeout. Every status change is published to all friend channels, with no merging or debouncing.',
  mount(ctx){
    ctx.css('ph',`
.ph-rows{display:flex;flex-direction:column;gap:6px}
.ph-row{display:grid;grid-template-columns:118px minmax(0,1fr) 132px;gap:10px;align-items:center}
.ph-row[hidden]{display:none}
.ph-name{font-size:13px;font-weight:650;line-height:1.3}
.ph-name small{display:block;font-weight:400;color:#66756d;font-size:11px}
.ph-track{position:relative;height:30px;background:#f6f8f4;border:1px solid #e3e9e1;border-radius:7px;overflow:hidden}
.ph-track svg{position:absolute;inset:0;width:100%;height:100%}
.ph-gauge{font-size:12px;color:#66756d;font-variant-numeric:tabular-nums;line-height:1.35}
.ph-gauge b{color:#23352f}
.ph-gauge .bar{height:6px;border-radius:3px;background:#e6eee2;margin-top:3px;overflow:hidden}
.ph-gauge .bar i{display:block;height:100%;border-radius:3px;background:#2f6fb3}
.ph-axis{position:relative;height:18px;font-size:11px;color:#66756d}
.ph-axis span{position:absolute;transform:translateX(-50%);white-space:nowrap}
.ph-fan{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;margin-top:10px}
.ph-fan .sdl-panel{font-size:12.5px}
.ph-dots{display:flex;flex-wrap:wrap;gap:4px;margin:5px 0 2px}
.ph-dots i{width:11px;height:11px;border-radius:50%;background:#e6eee2}
.ph-dots.pub-bad i{animation:ph-bad 1.2s ease-out}
.ph-dots.pub-ok i{animation:ph-ok 1.2s ease-out}
@keyframes ph-bad{from{background:#c2413b}to{background:#e6eee2}}
@keyframes ph-ok{from{background:#2f8f5b}to{background:#e6eee2}}
.ph-narrow .ph-row{grid-template-columns:1fr auto}
.ph-narrow .ph-track{grid-column:1/-1;order:3}
.ph-narrow .ph-gauge{text-align:right;min-width:112px}
.ph-narrow .ph-axisrow .ph-name,.ph-narrow .ph-axisrow .ph-gauge{display:none}
.ph-narrow .ph-axisrow .ph-axis{grid-column:1/-1}
`);
    const C=ctx.colors,fmt=util.fmt,SPAN=90,VW=900;
    const P={H:5,X:30,F:50,laptop:false,speed:1};
    let T,outs,hbs,nextP,nextL,lastP,lastL,ch,stat,msg,leaveT,delay,stopAt=Infinity;
    function reset(){T=0;outs=[];hbs=[];nextP=1;nextL=3.5;lastP=0;lastL=P.laptop?0:-Infinity;ch={H:[{t:0,on:true}],D:[{t:0,on:true}],P:[{t:0,on:true}]};stat={H:true,D:true,P:true};msg={H:0,D:0};leaveT=null;delay=null}
    const up=t=>!outs.some(o=>t>=o[0]&&t<o[1]);
    const lastAll=()=>Math.max(lastP,P.laptop?lastL:-Infinity);
    function change(k,on,at){
      stat[k]=on;ch[k].push({t:at,on});
      if(k==='P')return;
      msg[k]+=P.F;
      const name=k==='H'?'Heartbeat timeout':'Disconnect = offline';
      ctx.log(`${at.toFixed(1)} s: ${name} → ${on?'online':'offline'}, published to ${fmt(P.F)} friend channels`,on?'ok':'bad');
      const dots=fanDots[k];dots.classList.remove('pub-bad','pub-ok');void dots.offsetWidth;dots.classList.add(on?'pub-ok':'pub-bad');
      if(k==='H'&&!on&&leaveT!=null&&delay==null)delay=at-leaveT;
    }
    function stepTo(t1){
      while(T<t1-1e-9){
        const t=Math.min(t1,T+0.05);
        while(nextP<=t+1e-9){const ok=up(nextP);hbs.push({t:nextP,ok,d:'P'});if(ok)lastP=nextP;nextP+=P.H}
        while(nextL<=t+1e-9){if(P.laptop){hbs.push({t:nextL,ok:true,d:'L'});lastL=nextL}nextL+=P.H}
        T=t;
        const la=lastAll(),onH=T-la<=P.X+1e-9;
        if(onH!==stat.H)change('H',onH,onH?la:la+P.X);
        const onP=T-lastP<=P.X+1e-9;
        if(onP!==stat.P)change('P',onP,onP?lastP:lastP+P.X);
        const onD=up(T)||P.laptop;
        if(onD!==stat.D){let at=T;if(!onD){const o=outs.find(o=>T>=o[0]&&T<o[1]);if(o)at=o[0]}else{const e=outs.filter(o=>o[1]<=T).map(o=>o[1]);if(e.length)at=Math.max(...e)}change('D',onD,at)}
      }
      const cut=T-SPAN-P.X-20;if(hbs.length>400)hbs=hbs.filter(x=>x.t>cut);
    }

    /* ---- Stage: timeline ---- */
    const rowsBox=h('div',{class:'ph-rows'});
    const ROWS=[['net','Phone network','Red = offline'],['hbP','Phone heartbeat','Green = delivered, red = lost'],['hbL','Laptop heartbeat','Stable network'],['stH','Heartbeat timeout','Offline only after the threshold passes with no heartbeat'],['stD','Disconnect = offline','Offline as soon as the connection drops']];
    const R={};
    for(const [key,name,sub] of ROWS){
      const svg=ctx.svgEl('svg',{viewBox:`0 0 ${VW} 30`,preserveAspectRatio:'none','aria-hidden':'true'});
      const bg=ctx.svgEl('g'),fg=ctx.svgEl('g'),now=ctx.svgEl('line',{y1:0,y2:30,stroke:C.info,'stroke-width':2,'vector-effect':'non-scaling-stroke'});
      svg.append(bg,fg,now);
      const gauge=h('div',{class:'ph-gauge'});
      const row=h('div',{class:'ph-row'},h('div',{class:'ph-name'},name,h('small',null,sub)),h('div',{class:'ph-track'},svg),gauge);
      rowsBox.append(row);
      R[key]={row,bg,fg,now,gauge,pool:[],bgPool:[]};
    }
    const axis=h('div',{class:'ph-axis'});
    rowsBox.append(h('div',{class:'ph-row ph-axisrow'},h('div',{class:'ph-name'}),axis,h('div',{class:'ph-gauge'})));
    const fanDots={},fanTxt={};
    const fan=h('div',{class:'ph-fan'});
    for(const [k,name] of [['H','Heartbeat timeout'],['D','Disconnect = offline']]){
      fanDots[k]=h('div',{class:'ph-dots','aria-hidden':'true'},util.range(24).map(()=>h('i')));fanTxt[k]=h('div',{class:'sdl-note',style:{margin:0}});
      fan.append(h('div',{class:'sdl-panel'},h('div',{class:'ph'},name+': status change fanned out to friends'),fanDots[k],fanTxt[k]));
    }
    ctx.stage.append(rowsBox,fan);
    ctx.onResize(w=>rowsBox.classList.toggle('ph-narrow',w<600));

    function rect(r,i,bgLayer,attrs){const pool=bgLayer?r.bgPool:r.pool;let el=pool[i];if(!el){el=ctx.svgEl('rect');(bgLayer?r.bg:r.fg).append(el);pool[i]=el}ctx.attr(el,{...attrs,display:null});return el}
    function hideFrom(r,i,bgLayer){const pool=bgLayer?r.bgPool:r.pool;for(let j=i;j<pool.length;j++)pool[j].setAttribute('display','none')}
    function segs(list,w0){const out=[];for(let i=0;i<list.length;i++){const a=list[i].t,b=i+1<list.length?list[i+1].t:T;if(b>w0&&b>a)out.push([Math.max(a,w0),b,list[i].on])}return out}
    let acc=0;
    function draw(){
      const w0=Math.max(0,T-SPAN*0.9),X=t=>(t-w0)/SPAN*VW,nx=X(T);
      // Network
      let i=0;const rn=R.net;
      rect(rn,i++,false,{x:0,y:8,width:nx,height:14,fill:C.okSoft});
      for(const o of outs){const a=Math.max(o[0],w0),b=Math.min(o[1],T);if(b>a)rect(rn,i++,false,{x:X(a),y:4,width:X(b)-X(a),height:22,fill:C.bad,rx:2})}
      hideFrom(rn,i,false);
      // Heartbeat
      for(const [key,d,last] of [['hbP','P',lastP],['hbL','L',lastL]]){
        const r=R[key];let j=0,b=0;
        if(d==='P')for(const [a,e,on] of segs(ch.P,w0))if(!on)rect(r,b++,true,{x:X(a),y:0,width:X(e)-X(a),height:30,fill:C.badSoft});
        hideFrom(r,b,true);
        for(const x of hbs)if(x.d===d&&x.t>=w0&&x.t<=T)rect(r,j++,false,x.ok?{x:X(x.t)-2,y:5,width:4,height:20,fill:C.ok,rx:1}:{x:X(x.t)-2,y:10,width:4,height:10,fill:C.bad,rx:1});
        hideFrom(r,j,false);
        const gap=T-last,off=gap>P.X;
        r.gauge.replaceChildren(h('span',null,'Since last ',h('b',null,(Number.isFinite(gap)?gap:0).toFixed(1)+' s'),off?h('span',{style:{color:C.bad}},' · device timed out'):null),h('div',{class:'bar'},h('i',{style:{width:util.clamp(gap/P.X,0,1)*100+'%',background:off?C.bad:gap>P.X*0.6?C.warn:C.info}})));
      }
      // Decision
      for(const [key,k] of [['stH','H'],['stD','D']]){
        const r=R[key];let j=0;
        for(const [a,b,on] of segs(ch[k],w0))rect(r,j++,false,{x:X(a),y:6,width:Math.max(0,X(b)-X(a)),height:18,fill:on?C.ok:C.bad,rx:2});
        hideFrom(r,j,false);
        const n=ch[k].length-1;
        r.gauge.replaceChildren(...[h('span',null,h('b',{style:{color:stat[k]?C.ok:C.bad}},stat[k]?'Online':'Offline'),` · ${n} changes`),k==='H'?h('div',{class:'sdl-note',style:{margin:0,fontSize:'11px'}},`Threshold ${P.X} s`):null].filter(Boolean));
      }
      const o=outs.find(o=>T>=o[0]&&T<o[1]);
      R.net.gauge.replaceChildren(o?h('b',{style:{color:C.bad}},o[1]===Infinity?'App closed':'Offline '+(T-o[0]).toFixed(0)+' s'):h('b',{style:{color:C.ok}},'Connected'));
      for(const r of Object.values(R))ctx.attr(r.now,{x1:nx,x2:nx});
      axis.replaceChildren();
      for(let s=Math.ceil(w0/10)*10;s<=w0+SPAN;s+=10){const pct=(s-w0)/SPAN*100;if(pct>1&&pct<99&&Math.abs(s-T)>4)axis.append(h('span',{style:{left:pct+'%'}},s+'s'))}
      axis.append(h('span',{style:{left:nx/VW*100+'%',color:C.info,fontWeight:'650'}},T.toFixed(0)+'s'));
      R.hbL.row.hidden=!P.laptop;
      for(const k of ['H','D'])fanTxt[k].textContent=`Each change is published to ${fmt(P.F)} friend channels · ${fmt(msg[k])} total`;
      st.set('hc',''+(ch.H.length-1),ch.H.length>1?'warn':'ok');st.set('dc',''+(ch.D.length-1),ch.D.length>1?'warn':'ok');
      st.set('hm',fmt(msg.H),msg.H?'warn':null);st.set('dm',fmt(msg.D),msg.D?'warn':null);
      st.set('lat',delay!=null?delay.toFixed(0)+' s':leaveT!=null?'Waiting for timeout…':'—',delay!=null?'info':null);
    }

    /* ---- Controls ---- */
    const speed=ctx.segmented({label:'Playback',value:1,options:[[0,'Pause'],[1,'1×'],[2,'2×']],onChange:v=>{P.speed=v}});
    const sH=ctx.slider({label:'Heartbeat interval',min:1,max:15,value:P.H,format:v=>v+' s',onInput:v=>{P.H=v;nextP=Math.max(T,Math.min(nextP,lastP+v))}});
    const sX=ctx.slider({label:'Timeout threshold',min:5,max:60,step:5,value:P.X,format:v=>v+' s',onInput:v=>{P.X=v;draw()}});
    const sF=ctx.slider({label:'Friends',min:10,max:1000,step:10,value:P.F,format:v=>fmt(v),onInput:v=>{P.F=v;draw()}});
    const tL=ctx.toggle({label:'Laptop also online (stable network)',value:P.laptop,onChange:v=>{P.laptop=v;lastL=v?T:-Infinity;nextL=T+0.5;draw()}});
    ctx.button('Drop network 12 s',()=>{outs.push([T,T+12]);ctx.log(`${T.toFixed(0)} s: phone loses network for 12 s`,'warn')},{primary:true});
    ctx.button('Drop network 45 s',()=>{outs.push([T,T+45]);ctx.log(`${T.toFixed(0)} s: phone loses network for 45 s`,'warn')});
    const bLeave=ctx.button('Quit app',()=>{
      const o=outs.find(o=>o[1]===Infinity);
      if(o){o[1]=T;leaveT=null;delay=null;bLeave.textContent='Quit app';ctx.log(`${T.toFixed(0)} s: app reopened`,'ok')}
      else{outs.push([T,Infinity]);leaveT=T;delay=null;bLeave.textContent='Reopen app';ctx.log(`${T.toFixed(0)} s: user quits the app, no more heartbeats`,'warn')}
    });
    const st=ctx.stats([{key:'hc',label:'Heartbeat timeout: status changes'},{key:'dc',label:'Disconnect = offline: status changes'},{key:'hm',label:'Heartbeat timeout: friend updates'},{key:'dm',label:'Disconnect = offline: friend updates'},{key:'lat',label:'Quit app → marked offline'}]);

    ctx.loop(dt=>{
      if(!P.speed)return;
      let t1=T+dt*10*P.speed;
      if(t1>=stopAt){t1=stopAt;stopAt=Infinity;P.speed=0;speed.set(0,true)}
      stepTo(t1);
      acc+=dt;if(acc>1/30||!P.speed){acc=0;draw()}
    });
    reset();draw();

    function prepare(o){
      Object.assign(P,{H:5,X:30,F:50,laptop:false,speed:1},o.p||{});
      sH.set(P.H,true);sX.set(P.X,true);sF.set(P.F,true);tL.set(P.laptop,true);
      reset();outs=o.outs||[];leaveT=o.leave??null;bLeave.textContent=leaveT!=null?'Reopen app':'Quit app';
      ctx.clearLog();speed.set(P.speed,true);stopAt=Infinity;draw();
    }
    async function runTo(t){stopAt=t;while(T<t-1e-6)await ctx.wait(100);draw()}
    ctx.scenarios([
      {id:'elevator',label:'Elevator: 12 s outage',
        ask:'Heartbeat every 5 s, timeout threshold 30 s, 50 friends. The phone loses its network for 12 s in an elevator (seconds 20 to 32). How many status updates do friends receive under each of the two approaches?',
        insight:'Heartbeat timeout: 0 updates. 3 heartbeats were lost during the outage, but the longest gap since the last heartbeat was 20 s, under the 30 s threshold, so the user always shows online. Disconnect = offline: 1 offline and 1 online change, so 50 friends receive 100 updates in total. The threshold leaves room for weak networks.',
        async run(){prepare({outs:[[20,32]]});await runTo(60)}},
      {id:'really-gone',label:'Really gone',
        ask:'The user quits the app completely at second 18; the last heartbeat was at second 16. With the heartbeat approach, at what second do friends see them go offline?',
        insight:'At second 46, 28 s after they left: the server can only confirm at “last heartbeat + 30 s.” The larger the threshold, the fewer false offline marks on weak networks, and the slower a real departure shows. “Disconnect = offline” changes at second 18, but only if the server notices the drop instantly; with a silent network loss it has to wait for a timeout too.',
        async run(){prepare({outs:[[18,Infinity]],leave:18});await runTo(56)}},
      {id:'short-timeout',label:'Threshold down to 10 s',
        ask:'To detect departures faster, the threshold is lowered from 30 s to 10 s. On a subway the network drops for 12 s every 40 s (3 times in 2 minutes), and the user has 200 friends. How many false offline marks does the heartbeat timeout produce? How many updates do friends receive in total?',
        insight:'3 false offline marks. Each time, heartbeats resume after about 10 s and the status flips back to online, so there are 6 status changes and 200 friends receive 1,200 updates in total, as many as with “disconnect = offline.” Lowering the threshold exposes network jitter directly to friends; drag it back to 30 s and run again, and none of the three outages is noticed. With many friends, push only to those currently viewing the contact list.',
        async run(){prepare({p:{X:10,F:200,speed:2},outs:[[15,27],[55,67],[95,107]]});await runTo(120)}},
      {id:'multi-device',label:'Phone offline, laptop online',
        ask:'B’s phone loses its network for 45 s starting at second 15, while the laptop stays online throughout. The heartbeat threshold is 30 s. Do friends see B go offline?',
        insight:'No: both approaches show 0 changes. The phone itself timed out at second 41 (the red shading in the heartbeat row), but the laptop’s heartbeats keep arriving, and the user-level status takes any device. So online means “this person was recently reachable,” not the exact state of one device.',
        async run(){prepare({p:{laptop:true},outs:[[15,60]]});await runTo(80)}},
    ]);
  }
});
})();
