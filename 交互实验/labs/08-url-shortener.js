/* 第 8 章：短网址服务。实验一对比两种生成短码的方法；实验二看 301/302 与缓存头怎样影响点击统计。 */
(function(){
const {el:h,util}=SDLab;
const B62='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/* MD5：原书列举的哈希之一。只用来生成与书中示例一致的短码候选，不作安全用途。 */
const MK=Array.from({length:64},(_,i)=>Math.floor(Math.abs(Math.sin(i+1))*2**32)>>>0),MS=[7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];
function md5(str){
  const by=new TextEncoder().encode(str),n=by.length,w=new Uint32Array(((n+8>>6)+1)*16);
  for(let i=0;i<n;i++)w[i>>2]|=by[i]<<(i%4*8);
  w[n>>2]|=0x80<<(n%4*8);w[w.length-2]=n*8;
  let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
  for(let o=0;o<w.length;o+=16){let A=a0,B=b0,C=c0,D=d0;
    for(let i=0;i<64;i++){const r=i>>4;let F,g;
      if(r===0){F=B&C|~B&D;g=i}else if(r===1){F=D&B|~D&C;g=(5*i+1)%16}else if(r===2){F=B^C^D;g=(3*i+5)%16}else{F=C^(B|~D);g=7*i%16}
      F=F+A+MK[i]+w[o+g]>>>0;A=D;D=C;C=B;const s=MS[r*4+i%4];B=B+(F<<s|F>>>32-s)>>>0}
    a0=a0+A>>>0;b0=b0+B>>>0;c0=c0+C>>>0;d0=d0+D>>>0}
  return [a0,b0,c0,d0].map(x=>{let s='';for(let i=0;i<4;i++)s+=(x>>>i*8&255).toString(16).padStart(2,'0');return s}).join('');
}
function b62(id){const steps=[];let n=id;while(n>0){const q=Math.floor(n/62),r=n%62;steps.push([n,q,r,B62[r]]);n=q}return {code:steps.map(s=>s[3]).reverse().join('')||'0',steps}}
const trim3=x=>String(+x.toPrecision(3));
function cn(n){if(n>=1e12)return trim3(n/1e12)+' 万亿';if(n>=1e8)return trim3(n/1e8)+' 亿';if(n>=1e4)return trim3(n/1e4)+' 万';return util.fmt(n)}
function short(u,max=34){u=u.replace(/^https?:\/\//,'');return u.length>max?u.slice(0,14)+'…'+u.slice(-(max-15)):u}
const SITES=[['shop.example.com','item'],['blog.example.org','posts'],['docs.example.dev','guide'],['news.example.cn','2026/09'],['video.example.tv','watch'],['maps.example.com','place'],['wiki.example.org','wiki']];
const WORDS='system-design rate-limiter consistent-hashing key-value-store unique-id url-shortener web-crawler notification news-feed chat-system autocomplete youtube google-drive proximity nearby-friends maps queue metrics ad-click hotel email s3 leaderboard payment wallet exchange'.split(' ');
function makePool(seed,n){const r=util.rng(seed),out=[],seen=new Set();while(out.length<n){const [host,p]=r.pick(SITES);const u=`https://${host}/${p}/${r.pick(WORDS)}-${r.int(10,999)}?ref=${r.pick(['mail','feed','share','ad'])}`;if(!seen.has(u)){seen.add(u);out.push(u)}}return out}
const WIKI='https://en.wikipedia.org/wiki/Systems_design';

/* ---------------- 实验一：哈希截取 vs 唯一 ID + Base62 ---------------- */
SDLab.define({
  id:'url-shortener',chapter:8,
  title:'哈希截取与 Base62 两种短码方案',
  summary:'同一个长网址同时交给两种方案：左边截取 MD5 结果的前几位，撞上已有短码就追加字符重算；右边向 ID 生成器要一个唯一 ID 再转 Base62。把短码空间调得很小，碰撞就看得见。',
  caveat:'哈希方案把短码空间缩小到 16 或 256 个，只为让碰撞肉眼可见；碰撞后追加的预设字符串用 #1、#2 表示。「查库」指按短码做一次精确查询；并发创建仍要靠数据库唯一约束兜底。Bloom Filter 设为 128 位、2 个哈希函数。',
  mount(ctx){
    ctx.css('us',`
.us-steps{list-style:none;margin:0 0 8px;padding:0;display:flex;flex-direction:column;gap:4px;font-size:13px;min-height:96px}
.us-steps li{border-left:3px solid #dbe2da;padding:3px 8px;background:#fff;border-radius:0 6px 6px 0;line-height:1.5;overflow-wrap:anywhere;margin:0}
.us-steps li.ok{border-color:#2f8f5b}.us-steps li.bad{border-color:#c2413b}.us-steps li.warn{border-color:#b7791f}.us-steps li.info{border-color:#2f6fb3}.us-steps li.fold{color:#66756d;font-size:12px}
.us-hx{font-size:12px;color:#66756d;word-break:break-all}.us-hx b{color:#24558a;background:#dde9f6;border-radius:3px;padding:0 2px}
.us-res{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}
.us-div{font-size:12px;color:#44544b}
.us-grid{display:grid;gap:2px;margin:6px 0 2px}
.sdl-frame .us-c{aspect-ratio:1;border-radius:3px;background:#eef2ec;border:1px solid #e1e7df;cursor:pointer;display:flex;align-items:center;justify-content:center;font:13px/1 ui-monospace,Menlo,monospace;color:#66756d;padding:0;min-width:0;width:100%;transition:background .15s}
.sdl-frame .us-c:hover:not(:disabled){background:#dde9f6;border-color:#9dbbe0}
.sdl-frame .us-c.on{background:#a9d3b9;border-color:#86bf9c;color:#1d4a33}
.sdl-frame .us-c.new{background:#2f8f5b;border-color:#2f8f5b;color:#fff}
.sdl-frame .us-c.hit{background:#c2413b;border-color:#c2413b;color:#fff}
.sdl-frame .us-c.cur{outline:2px solid #2f6fb3;outline-offset:1px;position:relative;z-index:1}
.us-hd{font:11px ui-monospace,Menlo,monospace;color:#66756d;display:flex;align-items:center;justify-content:center;min-width:0}
.us-bits{display:grid;grid-template-columns:repeat(32,1fr);gap:1px;margin:4px 0 2px}
.us-bits i{display:block;aspect-ratio:1;background:#eef2ec;border-radius:1px}
.us-bits i.on{background:#7b5cb8}.us-bits i.cur{outline:2px solid #b7791f;position:relative;z-index:1}
.us-next{font-size:13px;margin:4px 0 0;padding:6px 9px;border-radius:8px;background:#f6ead2;color:#6b4513}
.us-look{font-size:13px;margin:6px 0 0;color:#44544b;overflow-wrap:anywhere}
.us-tbl th,.us-tbl td{white-space:nowrap}
.us-cap-row{display:grid;grid-template-columns:120px minmax(0,1fr) 84px;gap:8px;align-items:center;font-size:13px;margin:6px 0}
.us-cap-row .v{text-align:right;font-variant-numeric:tabular-nums;font-weight:650}
.us-bar{position:relative;height:14px;background:#eef2ec;border-radius:7px}
.us-bar i{display:block;height:100%;border-radius:7px;transition:width .25s}
.us-need{position:absolute;top:-5px;bottom:-5px;width:2px;background:#c2413b;border-radius:1px}
.us-verdict{font-size:13px;margin:8px 0 0;line-height:1.6}
.us-narrow .us-tbl th,.us-tbl td{white-space:nowrap}
.us-cap-row{grid-template-columns:78px minmax(0,1fr) 70px;gap:6px}
`);
    const START=2009215674930;
    const P={k:2,bf:false,fast:false};
    const POOL=makePool(4,80);
    let db,byUrl,rows,nextId,bits,S,poolIdx=0,busy=false,lastCode=null;
    function clear(){db=new Map();byUrl=new Map();rows=[];nextId=START;bits=new Uint8Array(128);S={ins:0,tries:0,col:0,q:0,skip:0,fp:0};lastCode=null}
    clear();
    const bfPos=c=>[util.hash('a:'+c)%128,util.hash('b:'+c)%128];

    /* ---- 控件 ---- */
    const urlIn=h('input',{type:'text',value:WIKI,'aria-label':'长网址',spellcheck:false});
    ctx.controls.append(h('label',{class:'sdl-ctrl wide'},h('span',{class:'lbl'},h('span',null,'长网址（可以改成任意文本）')),urlIn));
    const goBtn=ctx.button('生成短码',()=>guard(()=>insert(urlIn.value.trim()||WIKI)),{primary:true});
    ctx.button('换一个网址再生成',()=>guard(()=>{const u=POOL[poolIdx++%POOL.length];urlIn.value=u;return insert(u)}));
    ctx.button('连续插入 10 条',()=>guard(async()=>{const f=P.fast;P.fast=true;try{for(let i=0;i<10;i++){const u=POOL[poolIdx++%POOL.length];urlIn.value=u;await insert(u)}}finally{P.fast=f}}));
    ctx.button('清空数据库',()=>{if(!busy){clear();buildGrid();paint();stepsH.replaceChildren();stepsB.replaceChildren();nextLine.textContent='';look.textContent=lookHint}});
    const spaceCtl=ctx.segmented({label:'哈希短码空间',value:2,options:[[1,'16 个'],[2,'256 个']],onChange:v=>{if(busy){spaceCtl.set(P.k,true);return}P.k=v;rebuildHash();paint()}});
    const bfCtl=ctx.toggle({label:'查库前先问 Bloom Filter',value:false,onChange:v=>{P.bf=v;bfBox.hidden=!v;paint()}});
    const speedCtl=ctx.segmented({label:'播放',value:'slow',options:[['slow','逐步'],['fast','快速']],onChange:v=>{P.fast=v==='fast'}});

    /* ---- 舞台 ---- */
    const stepsH=h('ol',{class:'us-steps','aria-live':'polite'}),stepsB=h('ol',{class:'us-steps'});
    const grid=h('div',{class:'us-grid',role:'group','aria-label':'短码空间：每格一个短码'});
    const gridCap=h('p',{class:'sdl-note',style:{margin:'2px 0 0'}});
    const bitsBox=h('div',{class:'us-bits','aria-hidden':'true'});
    const bfBox=h('div',{hidden:true},h('div',{class:'sdl-note',style:{margin:'6px 0 0'}},'Bloom Filter 位数组（紫色为 1）'),bitsBox);
    const bitEls=util.range(128).map(()=>{const i=h('i');bitsBox.append(i);return i});
    const nextLine=h('p',{class:'us-next'});
    const lookHint='点左边任意格子，看跳转时怎样把短码映射回长网址。';
    const look=h('p',{class:'us-look'},lookHint);
    const table=h('table',{class:'sdl-table us-tbl'});
    const capPanel=h('div',{class:'sdl-panel'},h('div',{class:'ph'},'短码长度与可容纳数量（需求：每天 1 亿条 × 10 年 = 3650 亿条）'));
    ctx.stage.append(
      h('div',{class:'sdl-grid2'},
        h('div',{class:'sdl-panel'},h('div',{class:'ph'},'方案一：哈希 + 碰撞处理'),stepsH,h('div',{class:'sdl-note',style:{margin:'0'}},'短码空间（绿色＝已占用，蓝框＝当前候选，红色＝碰撞）'),grid,gridCap,bfBox),
        h('div',{class:'sdl-panel'},h('div',{class:'ph'},'方案二：唯一 ID + Base62'),stepsB,nextLine)),
      h('div',{class:'sdl-panel',style:{marginTop:'12px'}},h('div',{class:'ph'},'映射表（数据库，最新 5 条）'),h('div',{class:'sdl-scroll'},table),look),
      h('div',{style:{height:'12px'}}),capPanel);
    const stats=ctx.stats([{key:'n',label:'已存映射'},{key:'col',label:'哈希：碰撞次数'},{key:'avg',label:'哈希：平均每条尝试'},{key:'q',label:'哈希：精确查库'},{key:'bf',label:'Bloom：省掉 / 误判'},{key:'b62',label:'Base62：碰撞'}]);
    
    let cells=[],narrow=false;
    ctx.onResize(w=>{const n=w<560;capPanel.classList.toggle('us-narrow',n);if(n!==narrow){narrow=n;if(cells.length)paint()}});
    function buildGrid(){
      const n=16**P.k,cols=P.k===1?4:16;grid.replaceChildren();cells=[];
      grid.style.gridTemplateColumns=P.k===1?`repeat(4,minmax(0,1fr))`:`16px repeat(16,minmax(0,1fr))`;
      grid.style.maxWidth=P.k===1?'200px':'320px';
      if(P.k===2){grid.append(h('span',{class:'us-hd'}));for(let c=0;c<16;c++)grid.append(h('span',{class:'us-hd'},c.toString(16)))}
      for(let i=0;i<n;i++){
        if(P.k===2&&i%cols===0)grid.append(h('span',{class:'us-hd'},(i/16).toString(16)));
        const code=i.toString(16).padStart(P.k,'0');
        const c=h('button',{type:'button',class:'us-c','aria-label':'短码 '+code,onclick:()=>lookup(code)},P.k===1?code:'');
        cells.push(c);grid.append(c);
      }
      gridCap.textContent=P.k===1?'取 MD5 十六进制结果的第 1 位：只有 0–f 共 16 个短码。':'行＝第 1 位，列＝第 2 位，共 16 × 16 = 256 个短码。';
    }
    const cellOf=code=>cells[parseInt(code,16)];
    function rebuildHash(){
      // 换短码空间时，按新规则重新计算已有记录的哈希短码（Base62 一侧不受影响）
      const urls=rows.slice().reverse().map(r=>r.url);db=new Map();bits=new Uint8Array(128);S.tries=0;S.col=0;S.q=0;S.skip=0;S.fp=0;
      for(const u of urls){let a=0,c;while(a<200){c=md5(a?u+'#'+a:u).slice(0,P.k);S.tries++;if(!db.has(c))break;S.col++;a++}const r=rows.find(x=>x.url===u);if(db.size>=16**P.k||db.has(c)){r.hc=null;continue}db.set(c,u);r.hc=c;for(const b of bfPos(c))bits[b]=1}
      S.q=S.tries;S.ins=db.size;buildGrid();stepsH.replaceChildren();look.textContent=lookHint;
    }
    function paint(){
      cells.forEach((c,i)=>{const code=i.toString(16).padStart(P.k,'0');const u=db.get(code);c.className='us-c'+(u?' on':'')+(code===lastCode?' new':'');c.title=u?code+' → '+u:code+'（空闲）'});
      bitEls.forEach((b,i)=>b.className=bits[i]?'on':'');
      table.replaceChildren(h('thead',null,h('tr',null,h('th',null,'哈希短码'),h('th',null,'Base62 短码'),h('th',null,'长网址'))),
        h('tbody',null,rows.slice(0,5).map(r=>h('tr',null,h('td',{class:'sdl-mono'},r.hc||'—'),h('td',{class:'sdl-mono'},r.bc),h('td',null,short(r.url,narrow?26:34))))));
      if(!rows.length)table.querySelector('tbody').append(h('tr',null,h('td',{colspan:3,style:{color:'#66756d'}},'还没有记录')));
      stats.set('n',util.fmt(rows.length));
      stats.set('col',util.fmt(S.col),S.col?'bad':'ok');
      stats.set('avg',S.ins?(S.tries/S.ins).toFixed(2)+' 次':'—',S.ins&&S.tries/S.ins>1.5?'warn':null);
      stats.set('q',util.fmt(S.q));
      stats.set('bf',P.bf?`${S.skip} / ${S.fp}`:'未启用',P.bf?'info':null);
      stats.set('b62','0','ok');
    }
    function lookup(code){
      const u=db.get(code);
      look.replaceChildren(h('b',null,'跳转查询：'),'GET /',h('span',{class:'sdl-mono'},code),' → ',u?['查映射表得到 ',h('span',{class:'sdl-mono'},short(u,40)),' → 返回重定向。哈希值本身推不回长网址，靠的是这张表。']:'表里没有这个短码 → 404。');
    }
    const tag=(tone,text)=>h('span',{class:'sdl-tag '+tone},text);
    function step(list,kids,tone){const li=h('li',{class:tone||null},kids);list.append(li);return li}
    async function guard(fn){if(busy)return;busy=true;goBtn.disabled=true;try{await fn()}catch(e){if(!(e&&e.abort))console.error(e)}finally{busy=false;goBtn.disabled=false}}

    async function hashSide(url,d){
      stepsH.replaceChildren();
      if(byUrl.has(url)){const r=byUrl.get(url);step(stepsH,['同一长网址已有记录 → 直接返回 ',h('b',{class:'sdl-mono'},r.hc||'—')],'info');if(r.hc){lastCode=r.hc;cellOf(r.hc).classList.add('cur');await ctx.wait(d);cellOf(r.hc).classList.remove('cur')}return null}
      const cap=16**P.k;
      if(db.size>=cap){step(stepsH,`短码空间已满：${cap} 个短码全被占用，再怎么重算也找不到空位，只能加长短码。`,'bad');return null}
      let a=0;const shown=[];let fold=null;
      while(true){
        const hx=md5(a?url+'#'+a:url),c=hx.slice(0,P.k);S.tries++;
        const li=step(stepsH,[h('div',null,`第 ${a+1} 次：MD5(长网址${a?' + "#'+a+'"':''})，取前 ${P.k} 位`),h('div',{class:'sdl-mono us-hx'},h('b',null,c),hx.slice(P.k))],'info');
        shown.push(li);
        if(shown.length>4){shown.shift().remove();if(!fold){fold=h('li',{class:'fold'});stepsH.prepend(fold)}fold.textContent=`…前面 ${a-3} 次尝试都撞上了已占用的短码`}
        const cell=cellOf(c);cell.classList.add('cur');await ctx.wait(d);
        const res=h('div',{class:'us-res'});li.append(res);
        let ask=true;
        if(P.bf){const [b1,b2]=bfPos(c),maybe=bits[b1]&&bits[b2];bitEls[b1].classList.add('cur');bitEls[b2].classList.add('cur');
          res.append(maybe?tag('warn',`Bloom：位 ${b1}、${b2} 都是 1 → 可能存在`):tag('ok',`Bloom：位 ${bits[b1]?b2:b1} 是 0 → 一定不存在，跳过查库`));
          ask=maybe;if(!maybe)S.skip++;await ctx.wait(d*.6);bitEls[b1].classList.remove('cur');bitEls[b2].classList.remove('cur')}
        if(ask){
          S.q++;
          if(db.has(c)){S.col++;res.append(tag('bad',`查库：${c} 已被占用 → 碰撞`));li.className='bad';cell.classList.add('hit');paint();await ctx.wait(d);cell.classList.remove('hit','cur');
            a++;if(a>=80){step(stepsH,'连续 80 次都碰撞，放弃。','bad');return null}continue}
          if(P.bf){S.fp++;res.append(tag('warn',`查库：${c} 其实空闲（Bloom 误判）`))}else res.append(tag('ok',`查库：${c} 空闲`));
        }
        cell.classList.remove('cur');
        db.set(c,url);for(const b of bfPos(c))bits[b]=1;lastCode=c;S.ins++;
        step(stepsH,['写入 <',h('b',{class:'sdl-mono'},c),', 长网址>，唯一约束兜底'],'ok');
        return c;
      }
    }
    async function b62Side(url,d){
      stepsB.replaceChildren();
      if(byUrl.has(url)){const r=byUrl.get(url);step(stepsB,['同一长网址已有记录 → 直接返回 ',h('b',{class:'sdl-mono'},r.bc)],'info');await ctx.wait(d);return null}
      const id=nextId++;const {code,steps}=b62(id);
      step(stepsB,['ID 生成器分配 → ',h('b',{class:'sdl-mono'},String(id))],'info');await ctx.wait(d);
      if(P.fast)step(stepsB,h('div',{class:'sdl-mono us-div'},`${id} 反复除以 62，余数查表 0-9a-zA-Z`),null);
      else{const li=step(stepsB,null,null);for(const [n,q,r,ch] of steps){li.append(h('div',{class:'sdl-mono us-div'},`${n} ÷ 62 = ${q} 余 ${r} → ${ch}`));await ctx.wait(d*.45)}}
      step(stepsB,['余数倒序拼接 → ',h('b',{class:'sdl-mono'},code)],'ok');await ctx.wait(d*.5);
      step(stepsB,['写入 <',h('b',{class:'sdl-mono'},code),', 长网址>，不用查碰撞'],'ok');
      nextLine.replaceChildren('下一个 ID ',h('span',{class:'sdl-mono'},String(id+1)),' → ',h('b',{class:'sdl-mono'},b62(id+1).code),'：相邻短码只差末位，容易被顺序枚举。');
      return code;
    }
    async function insert(url){
      const d=P.fast?120:520;
      const known=byUrl.has(url);
      const [hc,bc]=await Promise.all([hashSide(url,d),b62Side(url,d)]);
      if(!known){const r={url,hc,bc};rows.unshift(r);byUrl.set(url,r)}
      paint();
      if(hc)ctx.announce(`哈希短码 ${hc}，Base62 短码 ${bc}`);
    }

    /* ---- 容量面板 ---- */
    const NEED=365e9,LO=4,HI=14.6;
    const posOf=v=>util.clamp((Math.log10(v)-LO)/(HI-LO),0,1)*100;
    const barB=h('i',{style:{background:ctx.colors.series[0]}}),barH=h('i',{style:{background:ctx.colors.series[1]}});
    const vB=h('span',{class:'v'}),vH=h('span',{class:'v'}),verdict=h('p',{class:'us-verdict'});
    const need=()=>h('span',{class:'us-need',style:{left:posOf(NEED)+'%'},title:'需求 3650 亿'});
    const lenLbl=h('span'),lenLbl2=h('span');
    const lenCtl=ctx.slider({label:'短码长度 n',min:4,max:8,value:7,format:v=>v+' 位',parent:capPanel,onInput:v=>drawCap(v)});
    capPanel.append(
      h('div',{class:'us-cap-row'},h('span',null,'Base62 ',lenLbl),h('div',{class:'us-bar'},barB,need()),vB),
      h('div',{class:'us-cap-row'},h('span',null,'十六进制 ',lenLbl2),h('div',{class:'us-bar'},barH,need()),vH),
      h('div',{class:'us-cap-row',style:{color:'#c2413b'}},h('span',null,'十年需求'),h('div',{style:{position:'relative',height:'14px'}},h('span',{class:'us-need',style:{left:posOf(NEED)+'%',top:'0',bottom:'0'}})),h('span',{class:'v'},'3650 亿')),
      h('p',{class:'sdl-note',style:{margin:'0'}},'条形按对数刻度画：每向右一格代表数量乘以 10 倍。'),verdict);
    function drawCap(n){
      const vb=62**n,vx=16**n;lenLbl.textContent=n+' 位';lenLbl2.textContent=n+' 位';
      barB.style.width=posOf(vb)+'%';barH.style.width=posOf(vx)+'%';vB.textContent=cn(vb);vH.textContent=cn(vx);
      vB.style.color=vb>=NEED?ctx.colors.ok:ctx.colors.bad;vH.style.color=vx>=NEED?ctx.colors.ok:ctx.colors.bad;
      const fill=NEED/vb;
      const parts=vb>=NEED
        ?[h('b',{style:{color:ctx.colors.ok}},`Base62 ${n} 位够用：`),`约 ${cn(vb)} 个，是需求的 ${trim3(vb/NEED)} 倍。存满十年时占用率约 ${util.pct(fill)}，哈希方案（把结果转成 Base62 再截取）平均每条约尝试 ${(1/(1-fill)).toFixed(2)} 次。`]
        :[h('b',{style:{color:ctx.colors.bad}},`Base62 ${n} 位不够：`),`只有约 ${cn(vb)} 个，按每天 1 亿条约 ${trim3(vb/1e8/365)} 年用完。`];
      if(vx<NEED)parts.push(` 直接截取十六进制哈希的 ${n} 位只有 ${cn(vx)} 个，也不够。`);
      verdict.replaceChildren(...parts);
    }
    drawCap(7);

    /* ---- 初始状态：先放 8 条，再完整演示书中的示例网址 ---- */
    buildGrid();
    for(let i=0;i<8;i++){const u=POOL[i];let a=0,c;do{c=md5(a?u+'#'+a:u).slice(0,2);S.tries++;if(db.has(c))S.col++;a++}while(db.has(c));db.set(c,u);for(const b of bfPos(c))bits[b]=1;S.ins++;S.q+=a;const r={url:u,hc:c,bc:b62(nextId++).code};rows.unshift(r);byUrl.set(u,r)}
    poolIdx=8;paint();
    guard(()=>insert(WIKI));

    async function prepare(o){
      while(busy)await ctx.wait(50);
      P.k=o.k;P.bf=!!o.bf;P.fast=!!o.fast;spaceCtl.set(P.k,true);bfCtl.set(P.bf,true);bfBox.hidden=!P.bf;speedCtl.set(P.fast?'fast':'slow',true);
      clear();if(o.start)nextId=o.start;buildGrid();paint();stepsH.replaceChildren();stepsB.replaceChildren();nextLine.textContent='';look.textContent=lookHint;poolIdx=0;
    }
    async function exec(fn){busy=true;goBtn.disabled=true;try{await fn()}finally{busy=false;goBtn.disabled=false}}
    const feed=async n=>{for(let i=0;i<n;i++){const u=POOL[poolIdx++];urlIn.value=u;await insert(u)}};
    ctx.scenarios([
      {id:'birthday',label:'256 个码放 20 条',
        ask:'哈希短码只取 2 位十六进制，共 256 个。依次插入 20 个不同的长网址，只占 8% 的空间。你猜会不会碰撞？',
        insight:'这次撞了 2 次：第 7 条和第 12 条的首选短码都已被占用，各追加一次「#1」后重算成功。空间只用了 8%，碰撞却不罕见：按生日问题估算，20 条里至少撞一次的概率约 52%。右边 Base62 的 20 个短码由不重复的 ID 转来，不需要查碰撞。',
        async run(){await prepare({k:2,fast:true});await exec(()=>feed(20));await ctx.wait(600)}},
      {id:'crowded',label:'空间越满越难找',
        ask:'只有 16 个短码。依次插入 12 条，前几条大多一次成功。到第 11 条时已占用 10 个，平均要试几次才能找到空位？',
        insight:'前 6 条都是一次成功；第 7 条开始出现碰撞，第 11 条（已占 10/16）试了 9 次，12 条共碰撞 12 次。空闲比例为 p 时平均要试 1/p 次，第 11 条的期望约 2.7 次，这次运气差些。短码空间越满，创建越慢；真实系统靠更长的短码把占用率压低。',
        async run(){await prepare({k:1,fast:true});await exec(()=>feed(12));await ctx.wait(600)}},
      {id:'bloom',label:'Bloom Filter 帮了什么',
        ask:'打开 Bloom Filter，在 256 个码里插入 40 条。它能省掉一部分查库吗？它说「可能存在」时，短码一定被占用了吗？',
        insight:'Bloom 回答「一定不存在」35 次，这些候选直接跳过查库；回答「可能存在」10 次，查库后 5 次确实被占用（真碰撞），另外 5 次其实空闲（误判）。它省掉了大部分查询，但「可能存在」仍要精确查一次，也不能证明短码唯一；并发写入还得靠数据库唯一约束。',
        async run(){await prepare({k:2,bf:true,fast:true});await exec(()=>feed(40));await ctx.wait(600)}},
      {id:'base62',label:'Base62 的下一个短码',
        ask:'按 0-9a-zA-Z 的字符顺序，ID 2009215674938 编码为 zn9edcu。下一个 ID 的短码是什么？十年 3650 亿条，Base62 至少要几位？',
        insight:'下一个是 zn9edcv，再下一个是 zn9edcw：Base62 是可逆的进制编码，相邻 ID 的短码只差末位，拿到一个就能顺着枚举，这就是方案比较表里的「枚举风险」。6 位只有约 568 亿个，7 位约 3.52 万亿个，才覆盖 3650 亿条。',
        async run(){
          await prepare({k:2,fast:false,start:2009215674938});lenCtl.set(5);
          await exec(async()=>{urlIn.value=WIKI;await insert(WIKI);P.fast=true;speedCtl.set('fast',true);await feed(2)});
          for(const n of [6,7]){await ctx.wait(900);lenCtl.set(n)}await ctx.wait(800)}},
    ]);
  }
});

/* ---------------- 实验二：301 还是 302 ---------------- */
SDLab.define({
  id:'url-redirect',chapter:8,
  title:'301 还是 302，服务端能数到几次点击',
  summary:'两位用户点击同一个短链，预览机器人也会来抓。换状态码和缓存头，看浏览器缓存怎样让请求绕过短链服务，以及服务端的请求数为什么不等于点击数。',
  caveat:'301 按「浏览器缓存后一直直接跳转」简化；实际是否缓存、缓存多久取决于浏览器和 Cache-Control 等响应头。时间只在点击「过了 1 分钟」时推进。',
  mount(ctx){
    ctx.css('ur',`
.ur-map{position:relative;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) minmax(0,.9fr);gap:12px 28px;align-items:center}
.ur-col{display:flex;flex-direction:column;gap:8px;min-width:0;position:relative;z-index:1}
.ur-map .ur-wires{position:absolute;left:0;top:0;width:100%;height:100%;z-index:0;pointer-events:none}
.ur-node{border:1px solid #dbe2da;border-radius:10px;padding:7px 10px;background:#fbfcfa;font-size:13px;line-height:1.5;min-width:0;transition:box-shadow .2s,background .2s}
.ur-node b{display:block;font-size:14px}
.ur-node .sub{color:#66756d;font-size:12px}
.ur-node .big{font-size:22px;font-weight:750;font-variant-numeric:tabular-nums;line-height:1.3}
.ur-node.pulse{box-shadow:0 0 0 3px #d4e8d7;background:#f3faf5}
.ur-node.cached{box-shadow:0 0 0 3px #dde9f6}
.ur-cache{display:inline-block;margin-top:2px;font-size:12px;border-radius:6px;padding:0 6px;background:#eef2ec;color:#44544b}
.ur-cache.on{background:#dde9f6;color:#24558a}
.ur-dot{position:absolute;left:0;top:0;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;pointer-events:none;z-index:2;box-shadow:0 0 0 2px #fff}
.ur-lbl{position:absolute;left:0;top:0;transform:translate(-50%,-150%);font-size:11px;font-weight:700;padding:0 5px;border-radius:5px;background:#fff;border:1px solid currentColor;pointer-events:none;z-index:3;white-space:nowrap}
.ur-narrow{grid-template-columns:minmax(0,1fr);gap:22px}
.ur-narrow .ur-col.clients{flex-direction:row}
.ur-narrow .ur-col.clients .ur-node{flex:1}
`);
    const M={mode:'301'};
    const MODES={'301':'301 永久重定向','302n':'302 + Cache-Control: no-store','302m':'302 + Cache-Control: max-age=60'};
    let now=0,S,clients;
    function clear(){now=0;S={clicks:0,svc:0,bot:0,target:0};clients={A:{cache:null},B:{cache:null},R:{cache:null}}}
    clear();
    const modeCtl=ctx.segmented({label:'短链服务的响应',wide:true,value:M.mode,options:Object.entries(MODES),onChange:v=>{M.mode=v}});
    const bA=ctx.button('用户 A 点击',()=>guard(()=>click('A')),{primary:true});
    ctx.button('用户 B 点击',()=>guard(()=>click('B')));
    ctx.button('分享到群聊（机器人预取）',()=>guard(()=>click('R')));
    ctx.button('过了 1 分钟',()=>{now+=60;draw();ctx.log(`时间 +60 秒（现在 t=${now}s）`,'info')});
    ctx.button('A 清空浏览器缓存',()=>{clients.A.cache=null;draw();ctx.log('用户 A 清空了浏览器缓存','info')});

    const node=(title,sub,extra)=>{const n=h('div',{class:'ur-node'},h('b',null,title),sub?h('span',{class:'sub'},sub):null,extra||null);return n};
    const cacheEl={A:h('span',{class:'ur-cache'}),B:h('span',{class:'ur-cache'}),R:h('span',{class:'ur-cache'})};
    const nA=node('用户 A','浏览器',h('div',null,cacheEl.A)),nB=node('用户 B','浏览器',h('div',null,cacheEl.B)),nR=node('预览机器人','聊天软件抓取链接预览',h('div',null,cacheEl.R));
    const svcBig=h('div',{class:'big'}),svcLast=h('div',{class:'sub'}),tgtBig=h('div',{class:'big'});
    const nS=node('短链服务','GET /zn9edcu',h('div',null,h('span',{class:'sub'},'收到请求 '),svcBig,svcLast));
    const nT=node('目标网站','长网址',h('div',null,h('span',{class:'sub'},'被访问 '),tgtBig));
    const map=h('div',{class:'ur-map',role:'img','aria-label':'浏览器、短链服务与目标网站之间的请求'},h('div',{class:'ur-col clients'},nA,nB,nR),h('div',{class:'ur-col'},nS),h('div',{class:'ur-col'},nT));
    const wires=ctx.svgEl('svg',{class:'ur-wires','aria-hidden':'true'});map.prepend(wires);
    ctx.stage.append(map,h('p',{class:'sdl-note'},'实线：经过短链服务的路径；虚线：浏览器缓存命中时直接去目标网站。'));
    function drawWires(){
      const m=map.getBoundingClientRect();if(!m.width)return;ctx.attr(wires,{viewBox:`0 0 ${m.width} ${m.height}`});wires.replaceChildren();
      const ln=(a,b)=>{const [x0,y0]=center(a),[x1,y1]=center(b);wires.append(ctx.svgEl('line',{x1:x0,y1:y0,x2:x1,y2:y1,stroke:'#c9d3c6','stroke-width':2}))};
      // 缓存直达的虚线绕开短链服务：宽屏从上下两侧绕，窄屏从左右两侧绕
      const arc=(a,side)=>{const [x0,y0,cx,cy,x1,y1]=arcOf(a,side);
        wires.append(ctx.svgEl('path',{d:`M${x0} ${y0} Q${cx} ${cy} ${x1} ${y1}`,fill:'none',stroke:'#9dbbe0','stroke-width':2,'stroke-dasharray':'5 5'}))};
      arc(nA,-1);arc(nB,1);for(const n of [nA,nB,nR])ln(n,nS);ln(nS,nT);
    }
    ctx.onResize(w=>{map.classList.toggle('ur-narrow',w<560);drawWires()});
    const NODES={A:nA,B:nB,R:nR};
    const stats=ctx.stats([{key:'clicks',label:'用户真实点击'},{key:'svc',label:'短链服务收到请求'},{key:'bot',label:'其中机器人预取'},{key:'gap',label:'按请求数统计的偏差'}]);

    function cacheText(c){if(!c)return '缓存：无';if(c.until===Infinity)return '缓存：301 → 目标';const left=c.until-now;return left>0?`缓存：302，还剩 ${left} 秒`:'缓存：已过期'}
    function live(c){return c&&c.until>now}
    function draw(){
      for(const k of ['A','B','R']){const c=clients[k].cache;cacheEl[k].textContent=cacheText(c);cacheEl[k].className='ur-cache'+(live(c)?' on':'')}
      svcBig.textContent=S.svc;tgtBig.textContent=S.target;drawWires();
      stats.set('clicks',S.clicks);stats.set('svc',S.svc,'info');stats.set('bot',S.bot,S.bot?'warn':null);
      const gap=S.svc-S.clicks;stats.set('gap',(gap>0?'+':'')+gap,gap===0?'ok':'bad');
    }
    function arcOf(a,side){const m=map.getBoundingClientRect(),[x0,y0]=center(a),[x1,y1]=center(nT),nar=map.classList.contains('ur-narrow');
      return [x0,y0,nar?(side<0?2:m.width-2):(x0+x1)/2,nar?(y0+y1)/2:(side<0?2:m.height-2),x1,y1]}
    function center(el){const m=map.getBoundingClientRect(),r=el.getBoundingClientRect();return [r.left-m.left+r.width/2,r.top-m.top+r.height/2]}
    async function fly(from,to,color,label,ms=460,side=0){
      let pts=[center(from),center(to)];
      if(side){const [x0,y0,cx,cy,x1,y1]=arcOf(from,side);pts=util.range(9).map(i=>{const t=i/8,u=1-t;return [u*u*x0+2*u*t*cx+t*t*x1,u*u*y0+2*u*t*cy+t*t*y1]})}
      const [x0,y0]=pts[0];
      const dot=h('span',{class:'ur-dot',style:{background:color}});map.append(dot);
      const lb=label?h('span',{class:'ur-lbl',style:{color}},label):null;if(lb)map.append(lb);
      dot.animate(pts.map(([x,y])=>({transform:`translate(${x}px,${y}px)`})),{duration:ms,easing:'ease-in-out',fill:'forwards'});
      if(lb)lb.animate(pts.map(([x,y])=>({transform:`translate(${x}px,${y}px) translate(-50%,-150%)`})),{duration:ms,easing:'ease-in-out',fill:'forwards'});
      try{await ctx.wait(ms)}finally{dot.remove();lb&&lb.remove()}
    }
    const pulse=(n,cls='pulse')=>{n.classList.add(cls);const off=()=>n.classList.remove(cls);ctx.wait(180).then(off,off)};
    let busy=false;
    async function guard(fn){if(busy)return;busy=true;try{await fn()}catch(e){if(!(e&&e.abort))console.error(e)}finally{busy=false}}
    async function click(who){
      const n=NODES[who],c=clients[who],bot=who==='R';
      if(bot)S.bot++;else S.clicks++;
      const name=bot?'机器人':'用户 '+who;
      if(!bot&&live(c.cache)){
        pulse(n,'cached');ctx.log(`${name} 点击 → 浏览器缓存命中（${c.cache.until===Infinity?'301':'302 max-age'}），直接去目标网站；短链服务看不到这次点击`,'warn');
        draw();await fly(n,nT,ctx.colors.ok,'直达',560,who==='A'?-1:1);S.target++;draw();pulse(nT);return;
      }
      draw();await fly(n,nS,ctx.colors.info,'GET');S.svc++;draw();pulse(nS);
      const code=M.mode==='301'?301:302;svcLast.textContent=`上次响应：${code}${M.mode==='302n'?' no-store':M.mode==='302m'?' max-age=60':''}`;
      await fly(nS,n,ctx.colors.warn,String(code));
      if(!bot){if(M.mode==='301')c.cache={until:Infinity};else if(M.mode==='302m')c.cache={until:now+60};else c.cache=null}
      draw();
      ctx.log(`${name}${bot?' 抓取预览':' 点击'} → 短链服务记 1 次，返回 ${code}${!bot&&M.mode!=='302n'?'，浏览器缓存了这个跳转':''}`,bot?'warn':'info');
      await fly(n,nT,ctx.colors.ok,'访问');S.target++;draw();pulse(nT);
    }
    draw();
    ctx.log('每次点击的路径都会记在这里；打开日志看服务端到底收到了什么。','info');

    async function prepare(mode){while(busy)await ctx.wait(50);M.mode=mode;modeCtl.set(mode,true);clear();draw();ctx.clearLog();ctx.openLog(true)}
    const seq=async list=>{busy=true;try{for(const x of list){if(x==='T'){now+=60;draw();ctx.log(`时间 +60 秒（现在 t=${now}s）`,'info');await ctx.wait(500)}else{await click(x);await ctx.wait(250)}}}finally{busy=false}};
    ctx.scenarios([
      {id:'r301',label:'301：只数到第一次',
        ask:'返回 301。用户 A 连点 3 次，用户 B 点 1 次，共 4 次点击。短链服务收到几次请求？',
        insight:'只收到 2 次：A 和 B 各自的第一次。301 被浏览器缓存后，A 的后两次点击直接去了目标网站，服务端完全看不到。用 301 时，服务端数到的更接近「有多少个浏览器来过」，而不是点击次数。',
        async run(){await prepare('301');await seq(['A','A','A','B'])}},
      {id:'r302',label:'302 + no-store：逐次经过',
        ask:'改成 302，并加上 Cache-Control: no-store。同样是 A 点 3 次、B 点 1 次，服务端收到几次？',
        insight:'收到 4 次，与点击数一致：每次点击都要先经过短链服务拿跳转地址。代价是每次多一次往返，短链服务要承受全部跳转流量。',
        async run(){await prepare('302n');await seq(['A','A','A','B'])}},
      {id:'r302m',label:'302 也会被缓存',
        ask:'还是 302，但响应头写了 max-age=60。A 连点 3 次，过 1 分钟再点 1 次。服务端收到几次？',
        insight:'收到 2 次：第一次，以及缓存过期后的那一次；中间两次被浏览器缓存挡住了。状态码不是全部，302 带上可缓存的响应头也会让点击绕过服务端。需要逐次观测时，要连缓存头一起设计。',
        async run(){await prepare('302m');await seq(['A','A','A','T','A'])}},
      {id:'bots',label:'请求数 ≠ 点击数',
        ask:'302 + no-store。链接被分享到两个群，聊天软件各抓了一次预览；之后只有用户 A 真正点了 1 次。服务端收到几次请求？',
        insight:'收到 3 次，真实点击只有 1 次：两次是预览机器人。即使每次请求都经过服务端，请求数也不能直接当点击数，统计时要识别机器人、预取和重复请求。',
        async run(){await prepare('302n');await seq(['R','R','A'])}},
    ]);
  }
});
})();
