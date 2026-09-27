/* 第 12 章：聊天系统。实验一演示消息投递、写扩散、消息 ID 与多设备游标；实验二演示心跳在线状态与状态扇出。 */
(function(){
const {el:h,util}=SDLab;

/* ---------------- 实验一：一条消息怎样到达每台设备 ---------------- */
SDLab.define({
  id:'chat-delivery',chapter:12,
  title:'一条消息怎样到达每台设备',
  summary:'A、D、C 和 B 的两台设备连在不同聊天服务器上。发一条消息，看它先写入 KV，再经 WebSocket 推给在线设备；离线用户只收到推送提醒，重连后按游标补拉。切换消息 ID 方案和游标方式，看顺序错乱和漏收从哪里来。',
  caveat:'每段连线传输时间相同，动画按 1/10 速度播放，服务器时钟以模拟毫秒计。Snowflake ID 简化为「服务器时钟毫秒·服务器号」；会话内序号在写入 KV 时按会话原子递增分配。在线设备收到的消息视为已确认，游标取已收到消息的最大 ID。「其余成员」只画一条汇总连线，不计入 WebSocket 推送数。',
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
    const NODES={A:['A 手机','dev'],D:['D 手机','dev'],S1:['聊天服务器 1','srv'],S2:['聊天服务器 2','srv'],KV:['KV 存储','kv'],PUSH:['推送服务','push'],BP:['B 手机','dev'],BL:['B 笔记本','dev'],C:['C 手机','dev'],REST:['其余成员','dev']};
    const EDGES=[['S1','S2'],['S1','KV'],['S2','KV'],['S1','PUSH'],['S2','PUSH'],['PUSH','C'],['A','S1'],['D','S2'],['BP','S1'],['BL','S1'],['C','S2'],['REST','S2']];
    const MEMBERS={G:['A','B','C','D'],P:['A','B']};
    const CONV={G:'群',P:'私聊'};
    const DEVS=['BP','BL','C','D'];
    const TXT={AG:['今晚聚餐？','7 点老地方','我先去订位','到了说一声','记得带伞','谁开车','我请奶茶','改到 7 点半','收到','好的'],DG:['好','我晚点到','可以','算我一个'],AP:['文件看了吗','晚上打电话','明天见','好的']};
    const P={scheme:'seq',cursor:'conv',mode:'fan',gi:0,skew:0};
    let S,L,kind='',G={};

    function fresh(){
      if(S)for(const p of S.packets)p.g&&p.g.remove();
      S={now:600,seq:{G:0,P:0},msgs:[],cnt:{body:0,idx:0,ws:0,push:0},packets:[],ti:{AG:0,DG:0,AP:0},
        dev:{BP:{name:'B 手机',user:'B',srv:'S1',on:true},BL:{name:'B 笔记本',user:'B',srv:'S1',on:true},C:{name:'C 手机',user:'C',srv:'S2',on:false},D:{name:'D 手机',user:'D',srv:'S2',on:true}}};
      for(const d of Object.values(S.dev)){d.got=new Set();d.push=0;d.syncQ=-1}
      const seed=[['P','A','在吗',120],['G','A','周末有人爬山吗',150],['P','B','在',220],['G','D','我去',250],['P','A','方案发你了',320],['G','B','+1',350],['P','B','收到',420],['P','A','明天细聊',520]];
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
      ctx.log(`KV 写入${CONV[m.conv]}消息 ${idTxt(m)}：正文 1 份，${P.mode==='fan'?'收件索引 '+fmt(n)+' 份（每个收件人一份）':'会话日志 1 条（按会话索引）'}`,'info');
    }

    /* ---- 拓扑图 ---- */
    const wrap=h('div',{class:'cd-wrap'});
    const legend=h('div',{class:'cd-legend'},
      h('span',null,h('i',{class:'ln'}),'WebSocket 连接'),h('span',null,h('i',{class:'ln dash'}),'未连接'),
      h('span',null,h('i',{style:{background:C.info}}),'消息'),h('span',null,h('i',{style:{background:C.warn}}),'推送提醒'),
      h('span',null,h('i',{style:{background:'#7d8b83'}}),'补拉请求'),h('span',null,h('i',{style:{background:C.ok}}),'补拉结果'));
    const devBox=h('div',{class:'cd-devs'});
    ctx.stage.append(wrap,legend,devBox);
    function build(k){
      kind=k;L=LAY[k];const sz=SZ[k];
      wrap.replaceChildren();
      const svg=ctx.svg(L.w,L.h,{label:'聊天系统拓扑：设备、聊天服务器、KV 存储与推送服务',parent:wrap});
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
      for(const s of ['S1','S2']){const n=G.nodes[s];if(n)n.t2.textContent='时钟 '+Math.round(S.now+(s==='S1'?P.skew:0))+' ms'}
    }
    function refresh(){
      const N=G.nodes;if(!N.KV)return;
      N.KV.t2.textContent='消息正文 '+fmt(S.cnt.body);
      N.KV.t3.textContent='索引写入 '+fmt(S.cnt.idx);
      for(const k of DEVS){const d=S.dev[k],n=N[k];n.t2.textContent=d.on?'在线':'离线';n.t2.setAttribute('fill',d.on?C.ok:C.muted);n.rect.setAttribute('stroke-dasharray',d.on?'':'4 3');n.rect.setAttribute('stroke',d.on?C.ok:'#9fb1a5');G.edges[k+d.srv].setAttribute('stroke-dasharray',d.on?'':'4 4');G.edges[k+d.srv].setAttribute('stroke',d.on?'#8fa396':'#cfd8cc')}
      for(const k of ['A','D']){N[k].t2.textContent=k==='A'?'连服务器 1':'连服务器 2';N[k].rect.setAttribute('stroke',C.ok)}
      const rest=SIZES[P.gi]-4,show=rest>0;
      N.REST.g.style.display=show?'':'none';G.edges.RESTS2.style.display=show?'':'none';
      N.REST.t2.textContent=fmt(rest)+' 人';N.REST.t2.setAttribute('fill',C.muted);
      G.edges.PUSHC.setAttribute('stroke-dasharray','3 4');
    }

    /* ---- 消息包动画 ---- */
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

    /* ---- 业务流程 ---- */
    function sendMsg(from,conv,text){
      const srv=from==='A'?'S1':'S2',key=from+conv;
      text=text||TXT[key][S.ti[key]++%TXT[key].length];
      const m={conv,from,text,t:S.now,srv:srv==='S1'?1:2};
      fly([from,srv],'msg','新消息',()=>{
        m.sfT=Math.round(S.now+(srv==='S1'?P.skew:0));
        ctx.log(`${from} → 聊天服务器 ${m.srv}：「${text}」${P.scheme==='sf'?'，按本机时钟分配 Snowflake '+m.sfT+'·'+m.srv:''}`);
        fly([srv,'KV',srv],'msg',P.scheme==='sf'?m.sfT+'·'+m.srv:'写入',()=>deliver(m,srv),{1:p=>{commit(m);p.label=idTxt(m);refresh();render()}});
      });
    }
    function deliver(m,srv){
      const other=srv==='S1'?'S2':'S1';
      const users=MEMBERS[m.conv].filter(u=>u!==m.from);
      for(const u of users){
        const ds=DEVS.filter(k=>S.dev[k].user===u),online=ds.filter(k=>S.dev[k].on);
        if(!ds.length)continue;
        if(online.length){for(const k of online){const d=S.dev[k];fly(d.srv===srv?[srv,k]:[srv,other,k],'msg',idTxt(m),()=>{d.got.add(m.key);S.cnt.ws++;flash(k);render()})}}
        else{const k=ds[0],d=S.dev[k];fly([srv,'PUSH',k],'push','提醒',()=>{d.push++;S.cnt.push++;flash(k,true);ctx.log(`${d.name} 离线，推送服务发出提醒（不含可同步的消息正文）`,'warn');render()})}
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
      if(!on){ctx.log(`${d.name} 断开 WebSocket`,'warn');refresh();render();return}
      const cur=curTxt(d);
      ctx.log(`${d.name} 重连聊天服务器 ${d.srv.slice(1)}，带上游标补拉：${cur}`,'info');
      refresh();render();
      fly([k,d.srv,'KV'],'req','补拉',()=>{
        d.syncQ=S.now;const res=query(d);
        ctx.log(`KV 按「${P.cursor==='user'?'message_id > 用户级 cur_max':'每个会话 message_id > 该会话游标'}」返回 ${res.length} 条：${res.map(idTxt).join('、')||'无'}`,res.length?'ok':null);
        fly(['KV',d.srv,k],'res','+'+res.length,()=>{
          for(const m of res)d.got.add(m.key);d.push=0;render();
          const miss=missing(d);
          if(miss.length)ctx.log(`${d.name} 补拉后仍缺 ${miss.length} 条：${miss.map(m=>CONV[m.conv]+idTxt(m)).join('、')}（它们的 ID 不大于用户级游标，被跳过）`,'bad');
          ctx.announce(`${d.name} 补拉到 ${res.length} 条${miss.length?'，仍缺 '+miss.length+' 条':''}`);
        });
      });
    }
    const missing=d=>d.syncQ<0?[]:mine(d).filter(m=>!d.got.has(m.key)&&m.commitT<=d.syncQ);
    function flagged(list){
      const bad=new Set();
      for(const m of list)for(const o of list)if(o.conv===m.conv&&idOf(o)>idOf(m)&&o.t<m.t)bad.add(m.key);
      return bad;
    }

    /* ---- 设备面板 ---- */
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
          return [h('div',{class:'more'},(c==='G'?'群聊':'私聊（A–B）')+(list.length>per?' · 更早 '+(list.length-per)+' 条':'')),
            h('ul',null,list.slice(-per).map(m=>h('li',{class:bad.has(m.key)?'bad':null},h('span',{class:'id'},idTxt(m)),m.from+'：'+m.text,bad.has(m.key)?'（顺序颠倒）':'')))];
        });
        devBox.append(h('div',{class:'cd-dev'+(d.on?'':' off')},
          h('div',{class:'hd'},h('span',null,d.name),h('span',{class:'sdl-tag '+(d.on?'ok':'')},d.on?'在线':'离线')),
          h('div',{class:'cur',title:'设备本地保存的同步游标'},curTxt(d)),secs,
          d.push?h('div',{class:'push'},'推送提醒 '+d.push+' 条，正文待补拉'):null,
          miss.length?h('div',{class:'miss'},'漏收 '+miss.length+' 条：'+miss.map(m=>CONV[m.conv]+idTxt(m)).join('、')):null));
      }
      st.set('body',fmt(S.cnt.body));st.set('idx',fmt(S.cnt.idx),S.cnt.idx>1000?'warn':null);
      st.set('ws',fmt(S.cnt.ws),S.cnt.ws?'ok':null);st.set('push',fmt(S.cnt.push),S.cnt.push?'warn':null);
      st.set('miss',missN,missN?'bad':'ok');st.set('order',allBad.size,allBad.size?'bad':'ok');
      bB.textContent=S.dev.BP.on?'B 手机断线':'B 手机重连';bC.textContent=S.dev.C.on?'C 离线':'C 上线';
    }

    /* ---- 控件 ---- */
    const cScheme=ctx.segmented({label:'消息 ID',value:P.scheme,options:[['seq','会话内序号'],['sf','全局 Snowflake']],onChange:v=>{P.scheme=v;refresh();render()}});
    const cCursor=ctx.segmented({label:'设备游标',value:P.cursor,options:[['conv','按会话游标'],['user','用户级 cur_max']],onChange:v=>{P.cursor=v;render()}});
    const cMode=ctx.segmented({label:'群消息同步',value:P.mode,options:[['fan','写扩散：每人一份索引'],['shared','按会话索引']],onChange:v=>{P.mode=v;refresh()}});
    const cSize=ctx.slider({label:'群人数',min:0,max:4,value:P.gi,format:i=>fmt(SIZES[i])+' 人',onInput:v=>{P.gi=v;refresh()}});
    const cSkew=ctx.slider({label:'服务器 1 时钟',min:-100,max:0,step:10,value:P.skew,format:v=>v?'慢 '+(-v)+' 毫秒':'与服务器 2 一致',onInput:v=>{P.skew=v;clocks()}});
    ctx.button('A 发群消息',()=>sendMsg('A','G'),{primary:true});
    ctx.button('D 发群消息',()=>sendMsg('D','G'));
    ctx.button('A 私聊 B',()=>sendMsg('A','P'));
    const bB=ctx.button('B 手机断线',()=>setOnline('BP',!S.dev.BP.on));
    const bC=ctx.button('C 上线',()=>setOnline('C',!S.dev.C.on));
    const st=ctx.stats([{key:'body',label:'消息正文写入'},{key:'idx',label:'索引写入'},{key:'ws',label:'WebSocket 推送'},{key:'push',label:'推送提醒'},{key:'miss',label:'漏收'},{key:'order',label:'顺序颠倒'}]);

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
      {id:'online-offline',label:'在线推送，离线提醒',
        ask:'4 人群（A、B、C、D）里 A 发 1 条消息。B 的手机和笔记本都在线，D 在线，C 离线。KV 要写几份收件索引？几次走 WebSocket，几次走推送？C 上线后从哪里拿到正文？',
        insight:'正文写 1 次，收件索引 3 份（B、C、D 各一份，B 的两台设备共用一份）；WebSocket 推送 3 次（B 手机、B 笔记本、D），C 只收到 1 条推送提醒。C 上线后带着游标向 KV 补拉，才拿到正文：推送只是提醒，持久化历史加补拉才保证不丢。',
        async run(){prepare({});await ctx.wait(400);sendMsg('A','G');await ctx.wait(2700);setOnline('C',true);await ctx.wait(2300)}},
      {id:'big-group',label:'万人群还能写扩散吗',
        ask:'100 人群里一条消息约写 100 份收件索引。换成 1 万人群，A 连发 10 条（热闹群里一两秒的量），写扩散一共要写多少份？改成按会话索引呢？',
        insight:'写扩散下 10 条消息写了 99,990 份收件索引（每条 9,999 份），而正文只有 10 份。改成「正文共享、按会话维护索引」后，后 10 条只追加 10 条会话日志，成员各自按会话游标读取。小群写扩散简单好用；大群要重新估算写放大，把压力从写入转到读取。',
        async run(){prepare({gi:4,cOn:true});await ctx.wait(300);for(let i=0;i<10;i++){sendMsg('A','G');await ctx.wait(150)}await ctx.wait(2600);cMode.set('shared');ctx.log('切换为按会话索引','info');await ctx.wait(300);for(let i=0;i<10;i++){sendMsg('A','G');await ctx.wait(150)}await ctx.wait(2600)}},
      {id:'cursor-mix',label:'会话内 ID 配用户级游标',
        ask:'消息 ID 只在会话内递增：群里已到 #3，私聊已到 #5。B 手机只记一个用户级 cur_max_message_id = 5。离线期间群里来了 #4、#5，私聊来了 #6。手机重连补拉，能拿到几条？',
        insight:'只拿到私聊 #6 这 1 条：群里的 #4、#5 不大于 5，被当成已读跳过，游标随后推进到 6，这两条再也补不回来。改成按会话游标（群 3、私聊 6）再补拉，就拿到了群 #4、#5。会话内序号和用户级游标不能直接混用：要么按会话保存游标，要么给用户 inbox 另设单调同步序号。',
        async run(){prepare({cursor:'user',cOn:true});await ctx.wait(300);setOnline('BP',false);await ctx.wait(500);sendMsg('A','G');await ctx.wait(350);sendMsg('A','G');await ctx.wait(350);sendMsg('A','P');await ctx.wait(2600);setOnline('BP',true);await ctx.wait(2300);await ctx.wait(900);cCursor.set('conv');setOnline('BP',false);await ctx.wait(300);setOnline('BP',true);await ctx.wait(2300)}},
      {id:'snowflake-skew',label:'唯一不等于有序',
        ask:'服务器 1 的时钟比服务器 2 慢 80 毫秒。D（连服务器 2）问「明天几点开会？」，40 毫秒后 A（连服务器 1）回答「下午 3 点」。按 Snowflake ID 排序，B 看到的顺序对吗？',
        insight:'不对：A 的回答拿到的时间戳比提问还早约 40 毫秒，排到了提问前面，被标为「顺序颠倒」。Snowflake 能保证唯一、大致按时间递增，但跨服务器的时钟偏差会让它偏离真实顺序。切到会话内序号后，两条消息按写入会话的先后得到 #4、#5，顺序恢复；全局 ID 仍可留作消息的唯一标识。',
        async run(){prepare({scheme:'sf',skew:-80,cOn:true});await ctx.wait(300);sendMsg('D','G','明天几点开会？');await ctx.wait(400);sendMsg('A','G','下午 3 点');await ctx.wait(2700);await ctx.wait(1200);cScheme.set('seq');ctx.log('切换为会话内序号：同样两条消息按写入会话的顺序编号','info');await ctx.wait(1500)}},
    ]);
  }
});

/* ---------------- 实验二：心跳判定在线状态 ---------------- */
SDLab.define({
  id:'presence-heartbeat',chapter:12,
  title:'网络抖一下，算不算离线',
  summary:'手机每隔几秒给 presence server 发一次心跳，超过阈值没收到才判为离线。制造几次断网，对比「心跳超时」和「断开即离线」两种判定，以及每次状态变化要扇出给多少好友。',
  caveat:'时间按模拟秒推进（1 倍速下 1 秒动画约等于 10 模拟秒）。断网期间的心跳直接丢失，恢复后等下一次定时心跳；「断开即离线」假设服务器能立刻感知断线，现实中静默断网往往也要靠心跳或 TCP 超时才能发现。每次状态变化都发布到全部好友频道，不做合并或去抖。',
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
      const name=k==='H'?'心跳超时判定':'断开即离线';
      ctx.log(`${at.toFixed(1)} 秒：${name} → ${on?'在线':'离线'}，发布到 ${fmt(P.F)} 个好友频道`,on?'ok':'bad');
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

    /* ---- 舞台：时间轴 ---- */
    const rowsBox=h('div',{class:'ph-rows'});
    const ROWS=[['net','手机网络','红色为断网'],['hbP','手机心跳','绿=送达 红=丢失'],['hbL','笔记本心跳','网络稳定'],['stH','心跳超时判定','超过阈值无心跳才离线'],['stD','断开即离线','连接一断就离线']];
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
    for(const [k,name] of [['H','心跳超时判定'],['D','断开即离线']]){
      fanDots[k]=h('div',{class:'ph-dots','aria-hidden':'true'},util.range(24).map(()=>h('i')));fanTxt[k]=h('div',{class:'sdl-note',style:{margin:0}});
      fan.append(h('div',{class:'sdl-panel'},h('div',{class:'ph'},name+'：状态变化扇出给好友'),fanDots[k],fanTxt[k]));
    }
    ctx.stage.append(rowsBox,fan);
    ctx.onResize(w=>rowsBox.classList.toggle('ph-narrow',w<600));

    function rect(r,i,bgLayer,attrs){const pool=bgLayer?r.bgPool:r.pool;let el=pool[i];if(!el){el=ctx.svgEl('rect');(bgLayer?r.bg:r.fg).append(el);pool[i]=el}ctx.attr(el,{...attrs,display:null});return el}
    function hideFrom(r,i,bgLayer){const pool=bgLayer?r.bgPool:r.pool;for(let j=i;j<pool.length;j++)pool[j].setAttribute('display','none')}
    function segs(list,w0){const out=[];for(let i=0;i<list.length;i++){const a=list[i].t,b=i+1<list.length?list[i+1].t:T;if(b>w0&&b>a)out.push([Math.max(a,w0),b,list[i].on])}return out}
    let acc=0;
    function draw(){
      const w0=Math.max(0,T-SPAN*0.9),X=t=>(t-w0)/SPAN*VW,nx=X(T);
      // 网络
      let i=0;const rn=R.net;
      rect(rn,i++,false,{x:0,y:8,width:nx,height:14,fill:C.okSoft});
      for(const o of outs){const a=Math.max(o[0],w0),b=Math.min(o[1],T);if(b>a)rect(rn,i++,false,{x:X(a),y:4,width:X(b)-X(a),height:22,fill:C.bad,rx:2})}
      hideFrom(rn,i,false);
      // 心跳
      for(const [key,d,last] of [['hbP','P',lastP],['hbL','L',lastL]]){
        const r=R[key];let j=0,b=0;
        if(d==='P')for(const [a,e,on] of segs(ch.P,w0))if(!on)rect(r,b++,true,{x:X(a),y:0,width:X(e)-X(a),height:30,fill:C.badSoft});
        hideFrom(r,b,true);
        for(const x of hbs)if(x.d===d&&x.t>=w0&&x.t<=T)rect(r,j++,false,x.ok?{x:X(x.t)-2,y:5,width:4,height:20,fill:C.ok,rx:1}:{x:X(x.t)-2,y:10,width:4,height:10,fill:C.bad,rx:1});
        hideFrom(r,j,false);
        const gap=T-last,off=gap>P.X;
        r.gauge.replaceChildren(h('span',null,'距上次 ',h('b',null,(Number.isFinite(gap)?gap:0).toFixed(1)+' 秒'),off?h('span',{style:{color:C.bad}},' · 设备超时'):null),h('div',{class:'bar'},h('i',{style:{width:util.clamp(gap/P.X,0,1)*100+'%',background:off?C.bad:gap>P.X*0.6?C.warn:C.info}})));
      }
      // 判定
      for(const [key,k] of [['stH','H'],['stD','D']]){
        const r=R[key];let j=0;
        for(const [a,b,on] of segs(ch[k],w0))rect(r,j++,false,{x:X(a),y:6,width:Math.max(0,X(b)-X(a)),height:18,fill:on?C.ok:C.bad,rx:2});
        hideFrom(r,j,false);
        const n=ch[k].length-1;
        r.gauge.replaceChildren(...[h('span',null,h('b',{style:{color:stat[k]?C.ok:C.bad}},stat[k]?'在线':'离线'),` · 变化 ${n} 次`),k==='H'?h('div',{class:'sdl-note',style:{margin:0,fontSize:'11px'}},`阈值 ${P.X} 秒`):null].filter(Boolean));
      }
      const o=outs.find(o=>T>=o[0]&&T<o[1]);
      R.net.gauge.replaceChildren(o?h('b',{style:{color:C.bad}},o[1]===Infinity?'已关闭 App':'断网 '+(T-o[0]).toFixed(0)+' 秒'):h('b',{style:{color:C.ok}},'已连接'));
      for(const r of Object.values(R))ctx.attr(r.now,{x1:nx,x2:nx});
      axis.replaceChildren();
      for(let s=Math.ceil(w0/10)*10;s<=w0+SPAN;s+=10){const pct=(s-w0)/SPAN*100;if(pct>1&&pct<99&&Math.abs(s-T)>4)axis.append(h('span',{style:{left:pct+'%'}},s+'s'))}
      axis.append(h('span',{style:{left:nx/VW*100+'%',color:C.info,fontWeight:'650'}},T.toFixed(0)+'s'));
      R.hbL.row.hidden=!P.laptop;
      for(const k of ['H','D'])fanTxt[k].textContent=`每次变化发布到 ${fmt(P.F)} 个好友频道 · 累计 ${fmt(msg[k])} 条`;
      st.set('hc',(ch.H.length-1)+' 次',ch.H.length>1?'warn':'ok');st.set('dc',(ch.D.length-1)+' 次',ch.D.length>1?'warn':'ok');
      st.set('hm',fmt(msg.H),msg.H?'warn':null);st.set('dm',fmt(msg.D),msg.D?'warn':null);
      st.set('lat',delay!=null?delay.toFixed(0)+' 秒':leaveT!=null?'等待超时…':'—',delay!=null?'info':null);
    }

    /* ---- 控件 ---- */
    const speed=ctx.segmented({label:'播放',value:1,options:[[0,'暂停'],[1,'1×'],[2,'2×']],onChange:v=>{P.speed=v}});
    const sH=ctx.slider({label:'心跳间隔',min:1,max:15,value:P.H,format:v=>v+' 秒',onInput:v=>{P.H=v;nextP=Math.max(T,Math.min(nextP,lastP+v))}});
    const sX=ctx.slider({label:'超时阈值',min:5,max:60,step:5,value:P.X,format:v=>v+' 秒',onInput:v=>{P.X=v;draw()}});
    const sF=ctx.slider({label:'好友数',min:10,max:1000,step:10,value:P.F,format:v=>fmt(v)+' 人',onInput:v=>{P.F=v;draw()}});
    const tL=ctx.toggle({label:'笔记本同时在线（网络稳定）',value:P.laptop,onChange:v=>{P.laptop=v;lastL=v?T:-Infinity;nextL=T+0.5;draw()}});
    ctx.button('断网 12 秒',()=>{outs.push([T,T+12]);ctx.log(`${T.toFixed(0)} 秒：手机断网 12 秒`,'warn')},{primary:true});
    ctx.button('断网 45 秒',()=>{outs.push([T,T+45]);ctx.log(`${T.toFixed(0)} 秒：手机断网 45 秒`,'warn')});
    const bLeave=ctx.button('彻底关闭 App',()=>{
      const o=outs.find(o=>o[1]===Infinity);
      if(o){o[1]=T;leaveT=null;delay=null;bLeave.textContent='彻底关闭 App';ctx.log(`${T.toFixed(0)} 秒：重新打开 App`,'ok')}
      else{outs.push([T,Infinity]);leaveT=T;delay=null;bLeave.textContent='重新打开 App';ctx.log(`${T.toFixed(0)} 秒：用户关闭 App，不再发心跳`,'warn')}
    });
    const st=ctx.stats([{key:'hc',label:'心跳超时：状态变化'},{key:'dc',label:'断开即离线：状态变化'},{key:'hm',label:'心跳超时：好友收到更新'},{key:'dm',label:'断开即离线：好友收到更新'},{key:'lat',label:'关闭 App → 判为离线'}]);

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
      reset();outs=o.outs||[];leaveT=o.leave??null;bLeave.textContent=leaveT!=null?'重新打开 App':'彻底关闭 App';
      ctx.clearLog();speed.set(P.speed,true);stopAt=Infinity;draw();
    }
    async function runTo(t){stopAt=t;while(T<t-1e-6)await ctx.wait(100);draw()}
    ctx.scenarios([
      {id:'elevator',label:'电梯里断网 12 秒',
        ask:'心跳每 5 秒一次、超时阈值 30 秒、50 个好友。手机在电梯里断网 12 秒（第 20–32 秒）。两种判定方式各让好友收到多少条状态更新？',
        insight:'心跳超时：0 条。断网期间丢了 3 次心跳，但距上次心跳最长 20 秒，没超过 30 秒阈值，用户始终显示在线。断开即离线：离线、上线各 1 次，50 个好友共收到 100 条更新。阈值给弱网留出了余量。',
        async run(){prepare({outs:[[20,32]]});await runTo(60)}},
      {id:'really-gone',label:'真的下线了',
        ask:'用户在第 18 秒彻底关掉 App，上一次心跳在第 16 秒。心跳方案下，好友要到第几秒才看到他离线？',
        insight:'第 46 秒，也就是离开后 28 秒：服务器只能在「上次心跳 + 30 秒」时确认。阈值越大，弱网误判越少，真实下线显示得也越慢。「断开即离线」在第 18 秒就变了，但前提是服务器立刻感知断线；静默断网时它同样要等超时。',
        async run(){prepare({outs:[[18,Infinity]],leave:18});await runTo(56)}},
      {id:'short-timeout',label:'阈值降到 10 秒',
        ask:'为了更快发现下线，把阈值从 30 秒降到 10 秒。地铁上每 40 秒断网 12 秒（2 分钟内 3 次），用户有 200 个好友。心跳超时判定会误判几次离线？好友共收到多少条更新？',
        insight:'误判 3 次，每次约 10 秒后心跳恢复又变回在线，状态变化 6 次，200 个好友共收到 1,200 条更新，和「断开即离线」一样多。阈值调小等于把网络抖动直接暴露给好友；把阈值拖回 30 秒再跑一次，这三次断网都不会被察觉。好友多时，可以只推给正在看联系人列表的人。',
        async run(){prepare({p:{X:10,F:200,speed:2},outs:[[15,27],[55,67],[95,107]]});await runTo(120)}},
      {id:'multi-device',label:'手机断网，笔记本在线',
        ask:'B 的手机在第 15 秒断网 45 秒，笔记本一直在线。心跳阈值 30 秒。好友看到的 B 会变成离线吗？',
        insight:'不会，两种判定都是 0 次变化。手机这台设备在第 41 秒已经超时（心跳行里的红色底纹），但笔记本的心跳一直在，用户级状态取任一设备。所以在线表达的是「最近还能联系上这个人」，不是某台设备的精确状态。',
        async run(){prepare({p:{laptop:true},outs:[[15,60]]});await runTo(80)}},
    ]);
  }
});
})();
