/* Chapter 8: URL shortener. Lab 1 compares two ways to generate short codes; Lab 2 shows how 301/302 and cache headers affect click counting. */
(function(){
const {el:h,util}=SDLab;
const B62='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/* MD5: one of the hashes the book lists. Used only to produce short-code candidates that match the book’s example, not for security. */
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
function cn(n){if(n>=1e12)return trim3(n/1e12)+' trillion';if(n>=1e9)return trim3(n/1e9)+' billion';if(n>=1e6)return trim3(n/1e6)+' million';return util.fmt(n)}
function cs(n){if(n>=1e12)return trim3(n/1e12)+'T';if(n>=1e9)return trim3(n/1e9)+'B';if(n>=1e6)return trim3(n/1e6)+'M';return util.fmt(n)}
function short(u,max=34){u=u.replace(/^https?:\/\//,'');return u.length>max?u.slice(0,14)+'…'+u.slice(-(max-15)):u}
const SITES=[['shop.example.com','item'],['blog.example.org','posts'],['docs.example.dev','guide'],['news.example.cn','2026/09'],['video.example.tv','watch'],['maps.example.com','place'],['wiki.example.org','wiki']];
const WORDS='system-design rate-limiter consistent-hashing key-value-store unique-id url-shortener web-crawler notification news-feed chat-system autocomplete youtube google-drive proximity nearby-friends maps queue metrics ad-click hotel email s3 leaderboard payment wallet exchange'.split(' ');
function makePool(seed,n){const r=util.rng(seed),out=[],seen=new Set();while(out.length<n){const [host,p]=r.pick(SITES);const u=`https://${host}/${p}/${r.pick(WORDS)}-${r.int(10,999)}?ref=${r.pick(['mail','feed','share','ad'])}`;if(!seen.has(u)){seen.add(u);out.push(u)}}return out}
const WIKI='https://en.wikipedia.org/wiki/Systems_design';

/* ---------------- Lab 1: truncated hash vs. unique ID + Base62 ---------------- */
SDLab.define({
  id:'url-shortener',chapter:8,
  title:'Truncated Hash vs. Base62 for Short Codes',
  summary:'The same long URL goes to both schemes at once. On the left, take the first few characters of the MD5 result and, if the code is taken, append a suffix and rehash. On the right, get a unique ID from the ID generator and convert it to Base62. Shrink the code space and collisions become visible.',
  caveat:'The hash scheme’s code space is shrunk to 16 or 256 codes only so collisions are easy to see; the preset suffixes appended after a collision are written #1, #2. “Lookup” means one exact query by short code; concurrent creation still relies on the database unique constraint as the backstop. The Bloom filter uses 128 bits and 2 hash functions.',
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
@media(hover:hover){.sdl-frame .us-c:hover:not(:disabled){background:#dde9f6;border-color:#9dbbe0}}
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

    /* ---- controls ---- */
    const urlIn=h('input',{type:'text',value:WIKI,'aria-label':'Long URL',spellcheck:false});
    ctx.controls.append(h('label',{class:'sdl-ctrl wide'},h('span',{class:'lbl'},h('span',null,'Long URL (edit it to any text)')),urlIn));
    const goBtn=ctx.button('Generate short code',()=>guard(()=>insert(urlIn.value.trim()||WIKI)),{primary:true});
    ctx.button('Try another URL',()=>guard(()=>{const u=POOL[poolIdx++%POOL.length];urlIn.value=u;return insert(u)}));
    ctx.button('Insert 10 in a row',()=>guard(async()=>{const f=P.fast;P.fast=true;try{for(let i=0;i<10;i++){const u=POOL[poolIdx++%POOL.length];urlIn.value=u;await insert(u)}}finally{P.fast=f}}));
    ctx.button('Clear database',()=>{if(!busy){clear();buildGrid();paint();stepsH.replaceChildren();stepsB.replaceChildren();nextLine.textContent='';look.textContent=lookHint}});
    const spaceCtl=ctx.segmented({label:'Hash code space',value:2,options:[[1,'16 codes'],[2,'256 codes']],onChange:v=>{if(busy){spaceCtl.set(P.k,true);return}P.k=v;rebuildHash();paint()}});
    const bfCtl=ctx.toggle({label:'Ask the Bloom filter before querying the DB',value:false,onChange:v=>{P.bf=v;bfBox.hidden=!v;paint()}});
    const speedCtl=ctx.segmented({label:'Playback',value:'slow',options:[['slow','Step by step'],['fast','Fast']],onChange:v=>{P.fast=v==='fast'}});

    /* ---- stage ---- */
    const stepsH=h('ol',{class:'us-steps','aria-live':'polite'}),stepsB=h('ol',{class:'us-steps'});
    const grid=h('div',{class:'us-grid',role:'group','aria-label':'Short code space: one cell per code'});
    const gridCap=h('p',{class:'sdl-note',style:{margin:'2px 0 0'}});
    const bitsBox=h('div',{class:'us-bits','aria-hidden':'true'});
    const bfBox=h('div',{hidden:true},h('div',{class:'sdl-note',style:{margin:'6px 0 0'}},'Bloom filter bit array (purple = 1)'),bitsBox);
    const bitEls=util.range(128).map(()=>{const i=h('i');bitsBox.append(i);return i});
    const nextLine=h('p',{class:'us-next'});
    const lookHint='Click any cell on the left to see how a redirect maps the short code back to the long URL.';
    const look=h('p',{class:'us-look'},lookHint);
    const table=h('table',{class:'sdl-table us-tbl'});
    const capPanel=h('div',{class:'sdl-panel'},h('div',{class:'ph'},'Code length vs. capacity (requirement: 100 million per day × 10 years = 365 billion records)'));
    ctx.stage.append(
      h('div',{class:'sdl-grid2'},
        h('div',{class:'sdl-panel'},h('div',{class:'ph'},'Scheme 1: hash + collision handling'),stepsH,h('div',{class:'sdl-note',style:{margin:'0'}},'Code space (green = occupied, blue outline = current candidate, red = collision)'),grid,gridCap,bfBox),
        h('div',{class:'sdl-panel'},h('div',{class:'ph'},'Scheme 2: unique ID + Base62'),stepsB,nextLine)),
      h('div',{class:'sdl-panel',style:{marginTop:'12px'}},h('div',{class:'ph'},'Mapping table (database, latest 5)'),h('div',{class:'sdl-scroll'},table),look),
      h('div',{style:{height:'12px'}}),capPanel);
    const stats=ctx.stats([{key:'n',label:'Mappings stored'},{key:'col',label:'Hash: collisions'},{key:'avg',label:'Hash: avg. tries per record'},{key:'q',label:'Hash: exact lookups'},{key:'bf',label:'Bloom: skipped / false positives'},{key:'b62',label:'Base62: collisions'}]);
    
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
        const c=h('button',{type:'button',class:'us-c','aria-label':'Short code '+code,onclick:()=>lookup(code)},P.k===1?code:'');
        cells.push(c);grid.append(c);
      }
      gridCap.textContent=P.k===1?'First hex character of the MD5 result: only 16 codes, 0–f.':'Rows = 1st character, columns = 2nd; 16 × 16 = 256 codes.';
    }
    const cellOf=code=>cells[parseInt(code,16)];
    function rebuildHash(){
      // When the code space changes, recompute the hash codes of existing records under the new rule (the Base62 side is unaffected)
      const urls=rows.slice().reverse().map(r=>r.url);db=new Map();bits=new Uint8Array(128);S.tries=0;S.col=0;S.q=0;S.skip=0;S.fp=0;
      for(const u of urls){let a=0,c;while(a<200){c=md5(a?u+'#'+a:u).slice(0,P.k);S.tries++;if(!db.has(c))break;S.col++;a++}const r=rows.find(x=>x.url===u);if(db.size>=16**P.k||db.has(c)){r.hc=null;continue}db.set(c,u);r.hc=c;for(const b of bfPos(c))bits[b]=1}
      S.q=S.tries;S.ins=db.size;buildGrid();stepsH.replaceChildren();look.textContent=lookHint;
    }
    function paint(){
      cells.forEach((c,i)=>{const code=i.toString(16).padStart(P.k,'0');const u=db.get(code);c.className='us-c'+(u?' on':'')+(code===lastCode?' new':'');c.title=u?code+' → '+u:code+' (free)'});
      bitEls.forEach((b,i)=>b.className=bits[i]?'on':'');
      table.replaceChildren(h('thead',null,h('tr',null,h('th',null,'Hash code'),h('th',null,'Base62 code'),h('th',null,'Long URL'))),
        h('tbody',null,rows.slice(0,5).map(r=>h('tr',null,h('td',{class:'sdl-mono'},r.hc||'—'),h('td',{class:'sdl-mono'},r.bc),h('td',null,short(r.url,narrow?26:34))))));
      if(!rows.length)table.querySelector('tbody').append(h('tr',null,h('td',{colspan:3,style:{color:'#66756d'}},'No records yet')));
      stats.set('n',util.fmt(rows.length));
      stats.set('col',util.fmt(S.col),S.col?'bad':'ok');
      stats.set('avg',S.ins?(S.tries/S.ins).toFixed(2)+' tries':'—',S.ins&&S.tries/S.ins>1.5?'warn':null);
      stats.set('q',util.fmt(S.q));
      stats.set('bf',P.bf?`${S.skip} / ${S.fp}`:'Off',P.bf?'info':null);
      stats.set('b62','0','ok');
    }
    function lookup(code){
      const u=db.get(code);
      look.replaceChildren(h('b',null,'Redirect lookup: '),'GET /',h('span',{class:'sdl-mono'},code),' → ',u?['the mapping table gives ',h('span',{class:'sdl-mono'},short(u,40)),' → return a redirect. The hash value alone cannot be inverted to the long URL; this table does the mapping.']:'This code is not in the table → 404.');
    }
    const tag=(tone,text)=>h('span',{class:'sdl-tag '+tone},text);
    function step(list,kids,tone){const li=h('li',{class:tone||null},kids);list.append(li);return li}
    async function guard(fn){if(busy)return;busy=true;goBtn.disabled=true;try{await fn()}catch(e){if(!(e&&e.abort))console.error(e)}finally{busy=false;goBtn.disabled=false}}

    async function hashSide(url,d){
      stepsH.replaceChildren();
      if(byUrl.has(url)){const r=byUrl.get(url);step(stepsH,['This long URL already has a record → returning ',h('b',{class:'sdl-mono'},r.hc||'—')],'info');if(r.hc){lastCode=r.hc;cellOf(r.hc).classList.add('cur');await ctx.wait(d);cellOf(r.hc).classList.remove('cur')}return null}
      const cap=16**P.k;
      if(db.size>=cap){step(stepsH,`Code space full: all ${cap} codes are taken, so no amount of rehashing finds a free slot; the only fix is a longer code.`,'bad');return null}
      let a=0;const shown=[];let fold=null;
      while(true){
        const hx=md5(a?url+'#'+a:url),c=hx.slice(0,P.k);S.tries++;
        const li=step(stepsH,[h('div',null,`Try ${a+1}: MD5(long URL${a?' + "#'+a+'"':''}), first ${P.k===1?'hex character':P.k+' hex characters'}`),h('div',{class:'sdl-mono us-hx'},h('b',null,c),hx.slice(P.k))],'info');
        shown.push(li);
        if(shown.length>4){shown.shift().remove();if(!fold){fold=h('li',{class:'fold'});stepsH.prepend(fold)}fold.textContent=`…the first ${a-3} tries all hit occupied codes`}
        const cell=cellOf(c);cell.classList.add('cur');await ctx.wait(d);
        const res=h('div',{class:'us-res'});li.append(res);
        let ask=true;
        if(P.bf){const [b1,b2]=bfPos(c),maybe=bits[b1]&&bits[b2];bitEls[b1].classList.add('cur');bitEls[b2].classList.add('cur');
          res.append(maybe?tag('warn',`Bloom: bits ${b1} and ${b2} are both 1 → maybe present`):tag('ok',`Bloom: bit ${bits[b1]?b2:b1} is 0 → definitely absent, skip the lookup`));
          ask=maybe;if(!maybe)S.skip++;await ctx.wait(d*.6);bitEls[b1].classList.remove('cur');bitEls[b2].classList.remove('cur')}
        if(ask){
          S.q++;
          if(db.has(c)){S.col++;res.append(tag('bad',`Lookup: ${c} is taken → collision`));li.className='bad';cell.classList.add('hit');paint();await ctx.wait(d);cell.classList.remove('hit','cur');
            a++;if(a>=80){step(stepsH,'Collided 80 times in a row; giving up.','bad');return null}continue}
          if(P.bf){S.fp++;res.append(tag('warn',`Lookup: ${c} is actually free (Bloom false positive)`))}else res.append(tag('ok',`Lookup: ${c} is free`));
        }
        cell.classList.remove('cur');
        db.set(c,url);for(const b of bfPos(c))bits[b]=1;lastCode=c;S.ins++;
        step(stepsH,['Write <',h('b',{class:'sdl-mono'},c),', long URL>; the unique constraint is the backstop'],'ok');
        return c;
      }
    }
    async function b62Side(url,d){
      stepsB.replaceChildren();
      if(byUrl.has(url)){const r=byUrl.get(url);step(stepsB,['This long URL already has a record → returning ',h('b',{class:'sdl-mono'},r.bc)],'info');await ctx.wait(d);return null}
      const id=nextId++;const {code,steps}=b62(id);
      step(stepsB,['ID generator issues → ',h('b',{class:'sdl-mono'},String(id))],'info');await ctx.wait(d);
      if(P.fast)step(stepsB,h('div',{class:'sdl-mono us-div'},`${id} divided by 62 repeatedly; look up each remainder in 0-9a-zA-Z`),null);
      else{const li=step(stepsB,null,null);for(const [n,q,r,ch] of steps){li.append(h('div',{class:'sdl-mono us-div'},`${n} ÷ 62 = ${q} remainder ${r} → ${ch}`));await ctx.wait(d*.45)}}
      step(stepsB,['Remainders in reverse order → ',h('b',{class:'sdl-mono'},code)],'ok');await ctx.wait(d*.5);
      step(stepsB,['Write <',h('b',{class:'sdl-mono'},code),', long URL>; no collision check needed'],'ok');
      nextLine.replaceChildren('Next ID ',h('span',{class:'sdl-mono'},String(id+1)),' → ',h('b',{class:'sdl-mono'},b62(id+1).code),': adjacent codes differ only in the last character, so they are easy to enumerate in order.');
      return code;
    }
    async function insert(url){
      const d=P.fast?120:520;
      const known=byUrl.has(url);
      const [hc,bc]=await Promise.all([hashSide(url,d),b62Side(url,d)]);
      if(!known){const r={url,hc,bc};rows.unshift(r);byUrl.set(url,r)}
      paint();
      if(hc)ctx.announce(`Hash code ${hc}, Base62 code ${bc}`);
    }

    /* ---- capacity panel ---- */
    const NEED=365e9,LO=4,HI=14.6;
    const posOf=v=>util.clamp((Math.log10(v)-LO)/(HI-LO),0,1)*100;
    const barB=h('i',{style:{background:ctx.colors.series[0]}}),barH=h('i',{style:{background:ctx.colors.series[1]}});
    const vB=h('span',{class:'v'}),vH=h('span',{class:'v'}),verdict=h('p',{class:'us-verdict'});
    const need=()=>h('span',{class:'us-need',style:{left:posOf(NEED)+'%'},title:'Requirement: 365 billion'});
    const lenLbl=h('span'),lenLbl2=h('span');
    const lenCtl=ctx.slider({label:'Code length n',min:4,max:8,value:7,format:v=>v+' chars',parent:capPanel,onInput:v=>drawCap(v)});
    capPanel.append(
      h('div',{class:'us-cap-row'},h('span',null,'Base62 ',lenLbl),h('div',{class:'us-bar'},barB,need()),vB),
      h('div',{class:'us-cap-row'},h('span',null,'Hex ',lenLbl2),h('div',{class:'us-bar'},barH,need()),vH),
      h('div',{class:'us-cap-row',style:{color:'#c2413b'}},h('span',null,'10-yr need'),h('div',{style:{position:'relative',height:'14px'}},h('span',{class:'us-need',style:{left:posOf(NEED)+'%',top:'0',bottom:'0'}})),h('span',{class:'v'},'365B')),
      h('p',{class:'sdl-note',style:{margin:'0'}},'Bars use a logarithmic scale: each step to the right means 10 times as many.'),verdict);
    function drawCap(n){
      const vb=62**n,vx=16**n;lenLbl.textContent='n='+n;lenLbl2.textContent='n='+n;
      barB.style.width=posOf(vb)+'%';barH.style.width=posOf(vx)+'%';vB.textContent=cs(vb);vH.textContent=cs(vx);
      vB.style.color=vb>=NEED?ctx.colors.ok:ctx.colors.bad;vH.style.color=vx>=NEED?ctx.colors.ok:ctx.colors.bad;
      const fill=NEED/vb;
      const parts=vb>=NEED
        ?[h('b',{style:{color:ctx.colors.ok}},`${n} Base62 characters are enough: `),`about ${cn(vb)} codes, ${trim3(vb/NEED)} times the requirement. After 10 years of data the code space is about ${util.pct(fill)} full, so a hash scheme (convert the hash to Base62 and truncate) needs about ${(1/(1-fill)).toFixed(2)} tries per record on average.`]
        :[h('b',{style:{color:ctx.colors.bad}},`${n} Base62 characters are not enough: `),`only about ${cn(vb)} codes, which run out in about ${trim3(vb/1e8/365)} years at 100 million per day.`];
      if(vx<NEED)parts.push(` Truncating a hex hash to ${n} characters gives only ${cn(vx)} codes, which is also not enough.`);
      verdict.replaceChildren(...parts);
    }
    drawCap(7);

    /* ---- initial state: seed 8 records, then run the book’s example URL through in full ---- */
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
      {id:'birthday',label:'20 records in 256 codes',
        ask:'The hash code uses only 2 hex characters, 256 codes in all. Insert 20 different long URLs one by one, filling just 8% of the space. Do you think there will be a collision?',
        insight:'This run hit 2 collisions: the first-choice codes of the 7th and 12th records were already taken, and each succeeded after one appended “#1” and a rehash. Only 8% of the space was used, yet collisions are not rare: by the birthday problem, the chance of at least one collision among 20 records is about 52%. The 20 Base62 codes on the right come from distinct IDs, so no collision check is needed.',
        async run(){await prepare({k:2,fast:true});await exec(()=>feed(20));await ctx.wait(600)}},
      {id:'crowded',label:'The fuller, the harder',
        ask:'There are only 16 codes. Insert 12 records one by one; the first few mostly succeed on the first try. By the 11th, 10 are taken. How many tries does it take on average to find a free one?',
        insight:'The first 6 records all succeeded on the first try; collisions start at the 7th; the 11th (10 of 16 taken) took 9 tries; the 12 records had 12 collisions in total. With a free fraction p you need 1/p tries on average, about 2.7 for the 11th, so this run was unlucky. The fuller the code space, the slower creation gets; real systems keep utilization low with longer codes.',
        async run(){await prepare({k:1,fast:true});await exec(()=>feed(12));await ctx.wait(600)}},
      {id:'bloom',label:'What the Bloom filter buys',
        ask:'Turn on the Bloom filter and insert 40 records into 256 codes. Can it save some lookups? When it says “maybe present”, is the code definitely taken?',
        insight:'The Bloom filter answered “definitely absent” 35 times, and those candidates skipped the lookup; it answered “maybe present” 10 times, and after the lookup 5 were really taken (true collisions) while the other 5 were actually free (false positives). It saves most lookups, but “maybe present” still needs one exact query, and it cannot prove a code is unique; concurrent writes still rely on the database unique constraint.',
        async run(){await prepare({k:2,bf:true,fast:true});await exec(()=>feed(40));await ctx.wait(600)}},
      {id:'base62',label:'The next Base62 code',
        ask:'In the character order 0-9a-zA-Z, ID 2009215674938 encodes to zn9edcu. What is the short code for the next ID? For 365 billion records over 10 years, how many Base62 characters do you need at least?',
        insight:'The next is zn9edcv, then zn9edcw: Base62 is a reversible base encoding, so adjacent IDs give codes that differ only in the last character, and one code lets you enumerate onward. This is the “enumeration risk” in the comparison table. 6 characters give only about 56.8 billion codes; 7 give about 3.52 trillion, which is what covers 365 billion records.',
        async run(){
          await prepare({k:2,fast:false,start:2009215674938});lenCtl.set(5);
          await exec(async()=>{urlIn.value=WIKI;await insert(WIKI);P.fast=true;speedCtl.set('fast',true);await feed(2)});
          for(const n of [6,7]){await ctx.wait(900);lenCtl.set(n)}await ctx.wait(800)}},
    ]);
  }
});

/* ---------------- Lab 2: 301 or 302 ---------------- */
SDLab.define({
  id:'url-redirect',chapter:8,
  title:'301 or 302: How Many Clicks Can the Server Count',
  summary:'Two users click the same short URL, and a preview bot fetches it too. Change the status code and cache headers to see how the browser cache lets requests bypass the service, and why the server’s request count is not the click count.',
  caveat:'A 301 is simplified to “once cached, the browser always redirects directly”; in reality whether and how long it is cached depends on the browser and response headers such as Cache-Control. Time advances only when you click “1 minute passes”.',
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
    const MODES={'301':'301 permanent redirect','302n':'302 + Cache-Control: no-store','302m':'302 + Cache-Control: max-age=60'};
    let now=0,S,clients;
    function clear(){now=0;S={clicks:0,svc:0,bot:0,target:0};clients={A:{cache:null},B:{cache:null},R:{cache:null}}}
    clear();
    const modeCtl=ctx.segmented({label:'Short URL service response',wide:true,value:M.mode,options:Object.entries(MODES),onChange:v=>{M.mode=v}});
    const bA=ctx.button('User A clicks',()=>guard(()=>click('A')),{primary:true});
    ctx.button('User B clicks',()=>guard(()=>click('B')));
    ctx.button('Share to group chat (bot prefetch)',()=>guard(()=>click('R')));
    ctx.button('1 minute passes',()=>{now+=60;draw();ctx.log(`Time +60 s (now t=${now}s)`,'info')});
    ctx.button('A clears browser cache',()=>{clients.A.cache=null;draw();ctx.log('User A cleared the browser cache','info')});

    const node=(title,sub,extra)=>{const n=h('div',{class:'ur-node'},h('b',null,title),sub?h('span',{class:'sub'},sub):null,extra||null);return n};
    const cacheEl={A:h('span',{class:'ur-cache'}),B:h('span',{class:'ur-cache'}),R:h('span',{class:'ur-cache'})};
    const nA=node('User A','Browser',h('div',null,cacheEl.A)),nB=node('User B','Browser',h('div',null,cacheEl.B)),nR=node('Preview bot','Chat app fetching link previews',h('div',null,cacheEl.R));
    const svcBig=h('div',{class:'big'}),svcLast=h('div',{class:'sub'}),tgtBig=h('div',{class:'big'});
    const nS=node('Short URL service','GET /zn9edcu',h('div',null,h('span',{class:'sub'},'Requests received '),svcBig,svcLast));
    const nT=node('Target site','Long URL',h('div',null,h('span',{class:'sub'},'Visited '),tgtBig));
    const map=h('div',{class:'ur-map',role:'img','aria-label':'Requests between browsers, the short URL service, and the target site'},h('div',{class:'ur-col clients'},nA,nB,nR),h('div',{class:'ur-col'},nS),h('div',{class:'ur-col'},nT));
    const wires=ctx.svgEl('svg',{class:'ur-wires','aria-hidden':'true'});map.prepend(wires);
    ctx.stage.append(map,h('p',{class:'sdl-note'},'Solid lines: the path through the short URL service. Dashed lines: on a browser cache hit, go straight to the target site.'));
    function drawWires(){
      const m=map.getBoundingClientRect();if(!m.width)return;ctx.attr(wires,{viewBox:`0 0 ${m.width} ${m.height}`});wires.replaceChildren();
      const ln=(a,b)=>{const [x0,y0]=center(a),[x1,y1]=center(b);wires.append(ctx.svgEl('line',{x1:x0,y1:y0,x2:x1,y2:y1,stroke:'#c9d3c6','stroke-width':2}))};
      // The dashed cache-hit lines bypass the service: they arc over the top and bottom on wide screens, and around the left and right on narrow ones
      const arc=(a,side)=>{const [x0,y0,cx,cy,x1,y1]=arcOf(a,side);
        wires.append(ctx.svgEl('path',{d:`M${x0} ${y0} Q${cx} ${cy} ${x1} ${y1}`,fill:'none',stroke:'#9dbbe0','stroke-width':2,'stroke-dasharray':'5 5'}))};
      arc(nA,-1);arc(nB,1);for(const n of [nA,nB,nR])ln(n,nS);ln(nS,nT);
    }
    ctx.onResize(w=>{map.classList.toggle('ur-narrow',w<560);drawWires()});
    const NODES={A:nA,B:nB,R:nR};
    const stats=ctx.stats([{key:'clicks',label:'Real user clicks'},{key:'svc',label:'Requests at the service'},{key:'bot',label:'Of which bot prefetches'},{key:'gap',label:'Error if counting requests'}]);

    function cacheText(c){if(!c)return 'Cache: none';if(c.until===Infinity)return 'Cache: 301 → target';const left=c.until-now;return left>0?`Cache: 302, ${left} s left`:'Cache: expired'}
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
      const name=bot?'Bot':'User '+who;
      if(!bot&&live(c.cache)){
        pulse(n,'cached');ctx.log(`${name} clicked → browser cache hit (${c.cache.until===Infinity?'301':'302 max-age'}), goes straight to the target site; the short URL service never sees this click`,'warn');
        draw();await fly(n,nT,ctx.colors.ok,'Direct',560,who==='A'?-1:1);S.target++;draw();pulse(nT);return;
      }
      draw();await fly(n,nS,ctx.colors.info,'GET');S.svc++;draw();pulse(nS);
      const code=M.mode==='301'?301:302;svcLast.textContent=`Last response: ${code}${M.mode==='302n'?' no-store':M.mode==='302m'?' max-age=60':''}`;
      await fly(nS,n,ctx.colors.warn,String(code));
      if(!bot){if(M.mode==='301')c.cache={until:Infinity};else if(M.mode==='302m')c.cache={until:now+60};else c.cache=null}
      draw();
      ctx.log(`${name}${bot?' fetched a preview':' clicked'} → the service counts 1 request and returns ${code}${!bot&&M.mode!=='302n'?'; the browser cached this redirect':''}`,bot?'warn':'info');
      await fly(n,nT,ctx.colors.ok,'Visit');S.target++;draw();pulse(nT);
    }
    draw();
    ctx.log('The path of every click is logged here; open the log to see what the server actually received.','info');

    async function prepare(mode){while(busy)await ctx.wait(50);M.mode=mode;modeCtl.set(mode,true);clear();draw();ctx.clearLog();ctx.openLog(true)}
    const seq=async list=>{busy=true;try{for(const x of list){if(x==='T'){now+=60;draw();ctx.log(`Time +60 s (now t=${now}s)`,'info');await ctx.wait(500)}else{await click(x);await ctx.wait(250)}}}finally{busy=false}};
    ctx.scenarios([
      {id:'r301',label:'301: only the first click counted',
        ask:'The service returns 301. User A clicks 3 times and user B once, 4 clicks in all. How many requests does the short URL service receive?',
        insight:'Only 2: the first click from each of A and B. Once the browser cached the 301, A’s last two clicks went straight to the target site, and the server never saw them. With 301, the server’s count is closer to “how many browsers have come by” than to the number of clicks.',
        async run(){await prepare('301');await seq(['A','A','A','B'])}},
      {id:'r302',label:'302 + no-store: every click passes through',
        ask:'Switch to 302 and add Cache-Control: no-store. With the same 3 clicks from A and 1 from B, how many requests does the server receive?',
        insight:'4, matching the click count: every click first goes through the service to get the redirect target. The cost is an extra round trip each time, and the service must carry all the redirect traffic.',
        async run(){await prepare('302n');await seq(['A','A','A','B'])}},
      {id:'r302m',label:'A 302 can be cached too',
        ask:'Still 302, but the response header says max-age=60. A clicks 3 times, then clicks once more after 1 minute. How many requests does the server receive?',
        insight:'2: the first click and the one after the cache expired; the two in between were absorbed by the browser cache. The status code is not everything: a 302 with a cacheable header also lets clicks bypass the server. To observe every click, design the cache headers along with the status code.',
        async run(){await prepare('302m');await seq(['A','A','A','T','A'])}},
      {id:'bots',label:'Requests ≠ clicks',
        ask:'302 + no-store. The link is shared to two groups and the chat app fetches a preview for each; afterwards only user A really clicks, once. How many requests does the server receive?',
        insight:'3, but there was only 1 real click: two were preview bots. Even when every request passes through the server, the request count cannot be used directly as the click count; counting must identify bots, prefetches, and repeated requests.',
        async run(){await prepare('302n');await seq(['R','R','A'])}},
    ]);
  }
});
})();
