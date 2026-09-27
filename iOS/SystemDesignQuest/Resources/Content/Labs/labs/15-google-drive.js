/* 第 15 章：网盘。文件按 4 MB 切块并算哈希：增量同步只传变化块，账户内按哈希去重，base_version 检测冲突并保留冲突副本，上传未完成时版本停在 pending。 */
(function(){
const {el:h,util}=SDLab;

SDLab.define({
  id:'block-sync',chapter:15,
  title:'只传变化的块，冲突留副本',
  summary:'report.pptx 按 4 MB 切成 10 块，每块有自己的哈希。点设备里的块修改它，再同步：看哪些块真的上传、哪些因为云端已有而跳过；两台设备同时改时谁成功、谁得到冲突副本；上传中断时版本为什么停在 pending。',
  caveat:'哈希取 4 位十六进制便于阅读。原文把切块写在块服务器上；要省下客户端上行带宽，客户端得先按同样规则切块算哈希、只发缺失的块，本实验按这种方式演示（压缩与加密仍在块服务器完成）。每块传输时间相同；版本号冲突检测在提交元数据时进行；「引用数」统计所有版本（含 pending）对块的引用，不演示回收。',
  mount(ctx){
    ctx.css('bs',`
.bs-main{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) minmax(0,1fr);gap:12px;align-items:start}
.bs-narrow .bs-main{grid-template-columns:minmax(0,1fr)}
.bs-p{border:1px solid #dbe2da;border-radius:10px;padding:8px 10px;background:#fbfcfa;font-size:12.5px;line-height:1.55;min-width:0}
.bs-p .hd{display:flex;justify-content:space-between;gap:6px;align-items:center;font-weight:700;font-size:13px;margin-bottom:2px}
.bs-p .sub{color:#66756d;font-size:12px;overflow-wrap:anywhere}
.bs-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin:6px 0}
.sdl-frame .bs-cell{border:1px solid #cfd8cc;border-radius:6px;padding:2px 0 1px;text-align:center;font-size:11px;line-height:1.35;background:#fff;color:#66756d;cursor:pointer;min-width:0;white-space:nowrap;overflow:hidden}
.bs-cell .hx{display:block;font-family:ui-monospace,Menlo,monospace;font-size:11.5px;font-weight:650;color:#23352f}
.sdl-frame .bs-cell[data-s=mod]{background:#f6ead2;border-color:#dfbf85}.sdl-frame .bs-cell[data-s=mod] .hx{color:#86561a}
.sdl-frame .bs-cell[data-s=up],.sdl-frame .bs-cell[data-s=down]{background:#dde9f6;border-color:#2f6fb3}.sdl-frame .bs-cell[data-s=up] .hx,.sdl-frame .bs-cell[data-s=down] .hx{color:#24558a}
.sdl-frame .bs-cell[data-s=skip]{background:#fff;border:1px dashed #2f6fb3}
.sdl-frame .bs-cell[data-s=ok]{background:#dcefe2;border-color:#8fc4a2}.sdl-frame .bs-cell[data-s=ok] .hx{color:#1d6a41}
.sdl-frame .bs-cell[data-s=fail]{background:#f7dedb;border-color:#c2413b}.sdl-frame .bs-cell[data-s=fail] .hx{color:#9b2c27}
.sdl-frame .bs-cell:disabled{cursor:default;opacity:1}
.bs-line{margin:2px 0;overflow-wrap:anywhere}
.bs-line.warn{color:#86561a}.bs-line.bad{color:#c2413b;font-weight:650}.bs-line.ok{color:#1d6a41}
.bs-chips{display:flex;flex-wrap:wrap;gap:3px;margin:5px 0 8px;min-height:22px}
.bs-chip{font-family:ui-monospace,Menlo,monospace;font-size:11px;border:1px solid #cfd8cc;border-radius:5px;padding:0 4px;background:#fff;line-height:1.7}
.bs-chip b{color:#2f6fb3;margin-left:3px}
.bs-chip.new{animation:sdl-flash 1s ease-out;border-color:#2f8f5b}
.bs-files{list-style:none;margin:4px 0 0;padding:0}
.bs-files li{margin:3px 0;overflow-wrap:anywhere}
.bs-files .nm{font-weight:650}
.bs-fly{position:absolute;width:16px;height:16px;border-radius:4px;transition:transform .42s ease-in-out;pointer-events:none;z-index:2;box-shadow:0 1px 4px #0003}
.bs-leg{display:flex;flex-wrap:wrap;gap:3px 12px;font-size:11.5px;color:#66756d;margin-top:8px}
.bs-leg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px;border:1px solid #cfd8cc}
`);
    const C=ctx.colors,MB=4,FLY=450;
    const hx=tok=>{let x=util.hash(tok);x^=x>>>16;x=Math.imul(x,0x85ebca6b);x^=x>>>13;x=Math.imul(x,0xc2b2ae35);x^=x>>>16;return (x>>>16).toString(16).padStart(4,'0')};
    const mb=x=>x<0.01&&x>0?'1 KB':(+x.toFixed(1))+' MB';
    let S,storeEl,metaEl;
    function fresh(){
      S={n:0,tick:0,store:new Map(),files:new Map(),up:0,full:0,down:0,skip:0,conflicts:0,interrupt:false,newChips:new Set(),
        dev:{A:{k:'A',name:'设备 A',flash:{},busy:false,resume:null,remote:new Set(),note:null},B:{k:'B',name:'设备 B',flash:{},busy:false,resume:null,remote:new Set(),note:null}}};
      const blocks=util.range(10).map(i=>({tok:'r'+i,size:MB}));
      for(const b of blocks)S.store.set(hx(b.tok),{tok:b.tok,size:b.size,born:S.tick++});
      S.files.set('report.pptx',{versions:[{v:1,blocks:blocks.map(b=>({h:hx(b.tok),size:b.size})),status:'uploaded',by:'初始'}]});
      for(const d of Object.values(S.dev)){d.files={'report.pptx':{base:1,blocks:blocks.map(b=>({...b}))}};d.cur='report.pptx'}
    }
    const lastUp=F=>F?[...F.versions].reverse().find(v=>v.status==='uploaded'):null;
    const baseOf=(F,lf)=>F&&F.versions.find(v=>v.v===lf.base);
    const size=lf=>lf.blocks.reduce((s,b)=>s+b.size,0);
    const changedIdx=(lf,base)=>lf.blocks.map((b,i)=>!base||!base.blocks[i]||base.blocks[i].h!==hx(b.tok)?i:-1).filter(i=>i>=0);
    const hasMods=(d,name)=>{const lf=d.files[name],F=S.files.get(name);return !!lf&&(changedIdx(lf,baseOf(F,lf)).length>0||!baseOf(F,lf))};

    /* ---- 舞台 ---- */
    const main=h('div',{class:'bs-main'}),wrap=h('div',null,main);
    const colA=h('div'),colS=h('div'),colB=h('div');main.append(colA,colS,colB);
    ctx.stage.append(wrap,h('div',{class:'bs-leg'},[['#f6ead2','本地已修改'],['#dde9f6','传输中'],['#fff','云端已有，跳过'],['#dcefe2','已确认'],['#f7dedb','中断']].map(([c,l])=>h('span',null,h('i',{style:{background:c,borderStyle:l.includes('跳过')?'dashed':'solid',borderColor:l.includes('跳过')?C.info:'#cfd8cc'}}),l))));
    ctx.onResize(w=>wrap.classList.toggle('bs-narrow',w<660));
    function flyEl(a,b,color){
      if(!a||!b)return;
      const sr=ctx.stage.getBoundingClientRect(),ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();
      const x0=ra.left-sr.left+ra.width/2-8,y0=ra.top-sr.top+ra.height/2-8;
      const d=h('div',{class:'bs-fly',style:{left:x0+'px',top:y0+'px',background:color}});
      ctx.stage.append(d);
      requestAnimationFrame(()=>requestAnimationFrame(()=>{d.style.transform=`translate(${rb.left-sr.left+rb.width/2-8-x0}px,${rb.top-sr.top+rb.height/2-8-y0}px)`}));
      setTimeout(()=>d.remove(),FLY+80);
    }
    function devPanel(k){
      const d=S.dev[k],lf=d.files[d.cur],F=S.files.get(d.cur),base=baseOf(F,lf),vis=lastUp(F);
      const ch=new Set(changedIdx(lf,base));
      d.cells=lf.blocks.map((b,i)=>{
        const s=d.flash[i]||(ch.has(i)?'mod':'sync');
        return h('button',{type:'button',class:'bs-cell','data-s':s,disabled:d.busy,title:`块 ${i+1}，${mb(b.size)}，哈希 ${hx(b.tok)}（点击修改）`,onclick:()=>edit(k,i)},'块 '+(i+1),h('span',{class:'hx'},hx(b.tok)));
      });
      const others=[...Object.keys(d.files).filter(n=>n!==d.cur).map(n=>n+'（本地）'),...[...d.remote].map(n=>n+'（云端新增，未下载）')];
      const lines=[];
      if(d.note)lines.push(h('div',{class:'bs-line '+d.note[1]},d.note[0]));
      else if(d.busy)lines.push(h('div',{class:'bs-line'},'同步中…'));
      else if(ch.size)lines.push(h('div',{class:'bs-line warn'},`本地改了 ${ch.size} 块，尚未同步`));
      else lines.push(h('div',{class:'bs-line ok'},`与云端一致（v${lf.base}）`));
      if(vis&&vis.v>lf.base&&!d.busy&&!d.note)lines.push(h('div',{class:'bs-line warn'},`云端已有 v${vis.v}`));
      if(others.length)lines.push(h('div',{class:'sub'},'其他文件：'+others.join('、')));
      const el=h('div',{class:'bs-p'},
        h('div',{class:'hd'},h('span',null,d.name),h('span',{class:'sdl-tag '+(d.busy?'info':ch.size?'warn':'ok')},d.busy?'同步中':lf.base?'基于 v'+lf.base:'新文件')),
        h('div',{class:'sub'},`${d.cur} · ${mb(size(lf))} · ${lf.blocks.length} 块`),
        h('div',{class:'bs-grid'},d.cells),...lines);
      d.head=el;return el;
    }
    function render(){
      colA.replaceChildren(devPanel('A'));colB.replaceChildren(devPanel('B'));
      const refs=new Map();
      for(const F of S.files.values())for(const v of F.versions)for(const hh of new Set(v.blocks.map(b=>b.h)))refs.set(hh,(refs.get(hh)||0)+1);
      const chips=[...S.store.entries()].sort((a,b)=>a[1].born-b[1].born).map(([hh,b])=>{const c=h('span',{class:'bs-chip'+(S.newChips.has(hh)?' new':''),title:`块 ${hh}，被 ${refs.get(hh)||0} 个版本引用`},hh,h('b',null,'×'+(refs.get(hh)||0)));b.el=c;return c});
      S.newChips.clear();
      const total=[...S.store.values()].reduce((s,b)=>s+b.size,0);
      storeEl=h('div',{class:'bs-chips'},chips);
      metaEl=h('ul',{class:'bs-files'},[...S.files.entries()].map(([name,F])=>h('li',null,h('span',{class:'nm'},name),'：',F.versions.map((v,i)=>[i?' · ':'',h('span',{class:'sdl-tag '+(v.status==='uploaded'?'ok':'warn')},`v${v.v}${v.status==='pending'?' pending '+v.got+'/'+v.need:''}`),v.by!=='初始'?' '+v.by:'']))));
      colS.replaceChildren(h('div',{class:'bs-p'},
        h('div',{class:'hd'},h('span',null,'块服务器 → 云存储'),h('span',{class:'sdl-tag info'},`${S.store.size} 块 · ${mb(total)}`)),
        h('div',{class:'sub'},'按哈希存块，账户内去重；数字是引用它的版本数'),storeEl,
        h('div',{class:'hd'},h('span',null,'元数据库（API 服务器）')),
        h('div',{class:'sub'},'文件由哪些块组成、版本号与上传状态'),metaEl));
      st.set('up',mb(S.up),S.up?'info':null);st.set('full',mb(S.full));st.set('down',mb(S.down),S.down?'info':null);
      st.set('skip',mb(S.skip),S.skip?'ok':null);st.set('conf',S.conflicts,S.conflicts?'warn':null);
      bResume.disabled=!(S.dev.A.resume||S.dev.B.resume);
    }

    /* ---- 操作 ---- */
    function edit(k,i){
      const d=S.dev[k];if(d.busy)return;const lf=d.files[d.cur];
      lf.blocks[i]={tok:k+i+'-'+(++S.n),size:lf.blocks[i].size};d.note=null;
      ctx.log(`${d.name} 修改了 ${d.cur} 的第 ${i+1} 块，哈希变为 ${hx(lf.blocks[i].tok)}`);render();
    }
    async function sync(k){
      const d=S.dev[k];if(d.busy||d.resume)return;
      const fname=d.cur,lf=d.files[fname],F=S.files.get(fname),base=baseOf(F,lf);
      const idx=changedIdx(lf,base);
      if(!idx.length&&base){ctx.log(`${d.name}：${fname} 没有本地修改，无需上传`);return}
      d.busy=true;d.note=null;render();
      const toks=lf.blocks.map(b=>({...b})),hashes=toks.map(b=>hx(b.tok));
      S.full+=size(lf);
      ctx.log(`${d.name} 按 4 MB 切块算哈希：${base?`${idx.length} 块与 v${base.v} 不同`:`新文件，共 ${idx.length} 块`}，先向 API 服务器提交元数据${base?`（base_version = ${base.v}）`:''}`);
      flyEl(d.head,metaEl,'#7d8b83');await ctx.wait(FLY);
      let target=F,tname=fname,conflict=false;
      const head=F?F.versions[F.versions.length-1].v:0;
      if(F&&base&&head!==base.v){
        conflict=true;tname=fname.replace('.pptx',`（${k} 的冲突副本）.pptx`);
        target={versions:[]};S.files.set(tname,target);S.conflicts++;
        ctx.log(`API 服务器：${fname} 最新已是 v${head}，${d.name} 的 base 是 v${base.v}，条件更新失败 → 同步冲突，改存为「${tname}」`,'bad');
      }else if(!F){target={versions:[]};S.files.set(fname,target)}
      const need=[],seen=new Set();
      for(const i of idx){const hh=hashes[i];if(S.store.has(hh)||seen.has(hh))continue;seen.add(hh);need.push(i)}
      const ver={v:(target.versions.length?target.versions[target.versions.length-1].v:0)+1,blocks:hashes.map((hh,i)=>({h:hh,size:toks[i].size})),status:'pending',by:k,got:0,need:need.length};
      target.versions.push(ver);
      if(!conflict)ctx.log(`API 服务器：${F?`base v${base.v} 就是最新版本，`:''}写入 ${fname} v${ver.v}，状态 pending`,'info');
      const skip=idx.filter(i=>!need.includes(i));
      for(const i of skip){d.flash[i]='skip';S.skip+=toks[i].size}
      ctx.log(`块服务器按哈希比对：需要上传 ${need.length} 块（${mb(need.reduce((s,i)=>s+toks[i].size,0))}），${skip.length} 块云端已有，跳过`,'info');
      render();
      return uploadRest(k,{fname,tname,target,ver,toks,hashes,rest:need,done:0,conflict,lf});
    }
    async function uploadRest(k,job){
      const d=S.dev[k];d.busy=true;d.resume=null;d.note=null;render();
      while(job.rest.length){
        const i=job.rest[0],b=job.toks[i],hh=job.hashes[i];
        d.flash[i]='up';render();
        if(S.interrupt&&job.done===1){
          await ctx.wait(260);S.interrupt=false;tInt.set(false,true);
          d.flash[i]='fail';d.resume=job;d.busy=false;d.note=[`上传中断：已确认 ${job.done} / ${job.ver.need} 块，版本停在 pending`,'bad'];
          ctx.log(`上传第 ${job.done+1} 个变化块（块 ${i+1}）时网络中断。v${job.ver.v} 仍是 pending，其他设备不会拿到这个版本`,'bad');
          render();ctx.announce('上传中断，版本停在 pending');return false;
        }
        flyEl(d.cells[i],storeEl,C.info);await ctx.wait(FLY);
        if(!S.store.has(hh)){S.store.set(hh,{tok:b.tok,size:b.size,born:S.tick++});S.newChips.add(hh)}
        S.up+=b.size;job.done++;job.ver.got++;d.flash[i]='ok';job.rest.shift();render();
      }
      await ctx.wait(250);
      return publish(k,job);
    }
    async function resume(){
      const k=S.dev.A.resume?'A':S.dev.B.resume?'B':null;if(!k)return;
      const job=S.dev[k].resume;
      ctx.log(`${S.dev[k].name} 恢复上传：已确认的 ${job.done} 块不再重传，从块 ${job.rest[0]+1} 继续`,'info');
      return uploadRest(k,job);
    }
    async function publish(k,job){
      const d=S.dev[k];
      job.ver.status='uploaded';
      ctx.log(`块清单核对完毕：${job.tname} v${job.ver.v} 的全部 ${job.hashes.length} 块都在云端 → 状态改为 uploaded，通知相关设备`,'ok');
      if(!job.conflict){job.lf.base=job.ver.v}
      else{d.files[job.tname]={base:job.ver.v,blocks:job.toks.map(b=>({...b}))};d.note=[`冲突：本地修改已保存为「${job.tname}」`,'warn']}
      d.flash={};d.busy=false;render();
      const o=S.dev[k==='A'?'B':'A'];
      if(job.conflict){o.remote.add(job.tname);ctx.log(`${o.name} 收到通知：出现「${job.tname}」，由用户决定合并或覆盖`,'warn');render();await ctx.wait(300);await pull(k,job.fname,true)}
      else if(!o.files[job.tname]){o.remote.add(job.tname);ctx.log(`${o.name} 收到通知：新文件 ${job.tname}（打开时再下载）`,'info');render()}
      else if(o.busy||hasMods(o,job.tname)){ctx.log(`${o.name} 收到通知，但它正有未同步的修改，等它提交时再处理`,'warn');render()}
      else await pull(o.k,job.tname,false);
      return true;
    }
    async function pull(k,fname,force){
      const d=S.dev[k],lf=d.files[fname],F=S.files.get(fname),vis=lastUp(F);
      if(!vis||(!force&&vis.v===lf.base))return;
      const idx=vis.blocks.map((b,i)=>lf.blocks[i]&&hx(lf.blocks[i].tok)===b.h?-1:i).filter(i=>i>=0);
      ctx.log(`${d.name} 拉取 ${fname} v${vis.v} 的元数据，只下载本地没有的 ${idx.length} 块`,'info');
      d.busy=true;lf.blocks.length=vis.blocks.length;render();
      for(const i of idx){
        const b=vis.blocks[i],sb=S.store.get(b.h);
        if(fname===d.cur){d.flash[i]='down';render();flyEl(sb.el,d.cells[i],C.ok);await ctx.wait(FLY)}
        lf.blocks[i]={tok:sb.tok,size:sb.size};S.down+=sb.size;d.flash[i]='ok';render();
      }
      lf.base=vis.v;await ctx.wait(250);d.flash={};d.busy=false;render();
    }
    async function saveCopy(){
      const d=S.dev.A;if(d.busy)return;
      const src=d.files[d.cur],name='report-final.pptx';
      if(d.files[name]){d.cur=name;render();return}
      d.files[name]={base:0,blocks:src.blocks.map(b=>({...b}))};d.cur=name;
      ctx.log(`设备 A 把 ${'report.pptx'} 另存为 ${name}`);render();await ctx.wait(500);
      edit('A',0);
    }
    function insertHead(){
      const d=S.dev.A;if(d.busy)return;const lf=d.files[d.cur];
      lf.blocks=lf.blocks.map((b,i)=>({tok:'A'+i+'-s'+(++S.n),size:b.size}));lf.blocks.push({tok:'Atail-'+(++S.n),size:0.001});
      ctx.log('设备 A 在文件开头插入 1 KB。固定 4 MB 切块时，后面每块的边界都后移 1 KB：10 块哈希全变，还多出一个 1 KB 的尾块，增量同步几乎退化成整份上传。按内容切块（content-defined chunking）能缓解这个问题。','warn');
      render();
    }

    /* ---- 控件 ---- */
    ctx.button('A 同步',()=>{sync('A').catch(()=>{})},{primary:true});
    ctx.button('B 同步',()=>{sync('B').catch(()=>{})});
    ctx.button('A、B 同时同步（A 先到）',()=>{both().catch(()=>{})});
    const bResume=ctx.button('恢复上传',()=>{resume().catch(()=>{})});
    ctx.button('A 另存副本并改封面',()=>{saveCopy().catch(()=>{})});
    ctx.button('A 在开头插入 1 KB',()=>insertHead());
    const tInt=ctx.toggle({label:'下一次上传在第 2 块中断',value:false,onChange:v=>{S.interrupt=v}});
    const st=ctx.stats([{key:'up',label:'累计上传'},{key:'full',label:'若每次整份上传'},{key:'down',label:'累计下载'},{key:'skip',label:'去重跳过'},{key:'conf',label:'冲突副本'}]);
    async function both(){const a=sync('A');await ctx.wait(150);const b=sync('B');await Promise.all([a,b])}

    fresh();render();
    // 首次打开：A 已经改了第 2、5 块（与原图一致），等读者点「A 同步」
    edit('A',1);edit('A',4);ctx.clearLog();

    function prepare(){fresh();tInt.set(false,true);ctx.clearLog();render()}
    const done=async()=>{while(S.dev.A.busy||S.dev.B.busy)await ctx.wait(150);await ctx.wait(300)};
    ctx.scenarios([
      {id:'delta',label:'只改一小段',
        ask:'40 MB 的文件按 4 MB 切成 10 块，A 只改了第 2、5 块里的几个字。增量同步要上传多少？B 要下载多少？',
        insight:'只上传 2 块、8 MB，整份上传要 40 MB；B 收到通知后拉取 v2 的元数据，按块清单比对，也只下载这 2 块。云端从 10 块变成 12 块：v1 仍引用旧的第 2、5 块，所以旧块不能删。大文件只改一小部分时，增量同步最省带宽。',
        async run(){prepare();await ctx.wait(300);edit('A',1);await ctx.wait(300);edit('A',4);await ctx.wait(400);await sync('A');await done()}},
      {id:'dedup',label:'另存一份副本',
        ask:'A 把 report.pptx 另存为 report-final.pptx，只改了封面（第 1 块）再上传。要传几块？云端新增几块？',
        insight:'只传封面这 1 块、4 MB，另外 9 块哈希相同，云端已有，直接跳过（去重跳过 36 MB）。云端只多了 1 块，那 9 块的引用数变成 2。去重不等于可以随便删：删除其中一个文件时，只有不再被任何版本引用、也过了保留期的块才能回收。',
        async run(){prepare();await ctx.wait(300);await saveCopy();await ctx.wait(400);await sync('A');await done()}},
      {id:'conflict',label:'两台设备同时改',
        ask:'A、B 都基于 v1 修改：A 改第 3 块，B 改第 7 块，A 的请求先到。B 的提交会怎样？B 的修改会丢吗？改的是不同块，系统会自动合并吗？',
        insight:'A 的提交先处理，写入 v2；B 带着 base_version = 1 提交时，最新版本已是 v2，条件更新失败，得到同步冲突。B 的块照样上传，内容另存为「report（B 的冲突副本）.pptx」，没有丢；随后 B 把 report.pptx 更新到 v2（下载第 3、7 两块）。即使两人改的是不同块，系统也不自动合并，而是留两个版本让用户决定：这是冲突策略，不是协同编辑算法。',
        async run(){prepare();await ctx.wait(300);edit('A',2);await ctx.wait(250);edit('B',6);await ctx.wait(400);await both();await done()}},
      {id:'resume',label:'上传中断',
        ask:'A 改了块 2、块 6、块 9，传到第二块（块 6）时断网。这时 B 能看到新版本吗？恢复后还要重传几块？',
        insight:'看不到：v2 停在 pending（元数据库里标着「pending 1/3」），B 仍显示与云端一致的 v1，pending 文件不会被当作完整文件下载。恢复上传后，已确认的块 2 不再重传，只补传块 6、块 9；三块都到齐并核对后 v2 才变成 uploaded，B 随即下载这 3 块（12 MB）。',
        async run(){prepare();await ctx.wait(300);for(const i of [1,5,8]){edit('A',i);await ctx.wait(200)}tInt.set(true);await ctx.wait(300);await sync('A');await ctx.wait(1800);await resume();await done()}},
    ]);
  }
});
})();
