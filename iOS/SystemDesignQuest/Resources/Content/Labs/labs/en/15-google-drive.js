/* Chapter 15: cloud drive. Files are split into 4 MB blocks and hashed: delta sync uploads only changed blocks, blocks are deduplicated by hash within an account, base_version detects conflicts and keeps a conflicted copy, and an unfinished upload leaves the version in pending. */
(function(){
const {el:h,util}=SDLab;

SDLab.define({
  id:'block-sync',chapter:15,
  title:'Upload Only Changed Blocks, Keep Conflicted Copies',
  summary:'report.pptx is split into ten 4 MB blocks, each with its own hash. Click a block on a device to edit it, then sync: see which blocks are really uploaded and which are skipped because the cloud already has them, who wins and who gets a conflicted copy when two devices edit at once, and why the version stays pending when an upload is interrupted.',
  caveat:'Hashes are shortened to 4 hex digits for readability. The chapter puts chunking on the block server; to save client upstream bandwidth, the client has to chunk and hash by the same rules first and send only the missing blocks. This lab demonstrates that approach (compression and encryption still happen on the block server). Every block takes the same time to transfer, version conflict detection happens when metadata is submitted, and the reference count includes every version (pending ones too); reclamation is not shown.',
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
        dev:{A:{k:'A',name:'Device A',flash:{},busy:false,resume:null,remote:new Set(),note:null},B:{k:'B',name:'Device B',flash:{},busy:false,resume:null,remote:new Set(),note:null}}};
      const blocks=util.range(10).map(i=>({tok:'r'+i,size:MB}));
      for(const b of blocks)S.store.set(hx(b.tok),{tok:b.tok,size:b.size,born:S.tick++});
      S.files.set('report.pptx',{versions:[{v:1,blocks:blocks.map(b=>({h:hx(b.tok),size:b.size})),status:'uploaded',by:'initial'}]});
      for(const d of Object.values(S.dev)){d.files={'report.pptx':{base:1,blocks:blocks.map(b=>({...b}))}};d.cur='report.pptx'}
    }
    const lastUp=F=>F?[...F.versions].reverse().find(v=>v.status==='uploaded'):null;
    const baseOf=(F,lf)=>F&&F.versions.find(v=>v.v===lf.base);
    const size=lf=>lf.blocks.reduce((s,b)=>s+b.size,0);
    const changedIdx=(lf,base)=>lf.blocks.map((b,i)=>!base||!base.blocks[i]||base.blocks[i].h!==hx(b.tok)?i:-1).filter(i=>i>=0);
    const hasMods=(d,name)=>{const lf=d.files[name],F=S.files.get(name);return !!lf&&(changedIdx(lf,baseOf(F,lf)).length>0||!baseOf(F,lf))};

    /* ---- stage ---- */
    const main=h('div',{class:'bs-main'}),wrap=h('div',null,main);
    const colA=h('div'),colS=h('div'),colB=h('div');main.append(colA,colS,colB);
    ctx.stage.append(wrap,h('div',{class:'bs-leg'},[['#f6ead2','Edited locally'],['#dde9f6','In transit'],['#fff','Already in cloud, skipped'],['#dcefe2','Confirmed'],['#f7dedb','Interrupted']].map(([c,l])=>h('span',null,h('i',{style:{background:c,borderStyle:l.includes('skipped')?'dashed':'solid',borderColor:l.includes('skipped')?C.info:'#cfd8cc'}}),l))));
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
        return h('button',{type:'button',class:'bs-cell','data-s':s,disabled:d.busy,title:`Block ${i+1}, ${mb(b.size)}, hash ${hx(b.tok)} (click to edit)`,onclick:()=>edit(k,i)},'#'+(i+1),h('span',{class:'hx'},hx(b.tok)));
      });
      const others=[...Object.keys(d.files).filter(n=>n!==d.cur).map(n=>n+' (local)'),...[...d.remote].map(n=>n+' (new in cloud, not downloaded)')];
      const lines=[];
      if(d.note)lines.push(h('div',{class:'bs-line '+d.note[1]},d.note[0]));
      else if(d.busy)lines.push(h('div',{class:'bs-line'},'Syncing…'));
      else if(ch.size)lines.push(h('div',{class:'bs-line warn'},`${ch.size} ${ch.size===1?'block':'blocks'} edited locally, not synced yet`));
      else lines.push(h('div',{class:'bs-line ok'},`Matches the cloud (v${lf.base})`));
      if(vis&&vis.v>lf.base&&!d.busy&&!d.note)lines.push(h('div',{class:'bs-line warn'},`Cloud already has v${vis.v}`));
      if(others.length)lines.push(h('div',{class:'sub'},'Other files: '+others.join(', ')));
      const el=h('div',{class:'bs-p'},
        h('div',{class:'hd'},h('span',null,d.name),h('span',{class:'sdl-tag '+(d.busy?'info':ch.size?'warn':'ok')},d.busy?'Syncing':lf.base?'Based on v'+lf.base:'New file')),
        h('div',{class:'sub'},`${d.cur} · ${mb(size(lf))} · ${lf.blocks.length} blocks`),
        h('div',{class:'bs-grid'},d.cells),...lines);
      d.head=el;return el;
    }
    function render(){
      colA.replaceChildren(devPanel('A'));colB.replaceChildren(devPanel('B'));
      const refs=new Map();
      for(const F of S.files.values())for(const v of F.versions)for(const hh of new Set(v.blocks.map(b=>b.h)))refs.set(hh,(refs.get(hh)||0)+1);
      const chips=[...S.store.entries()].sort((a,b)=>a[1].born-b[1].born).map(([hh,b])=>{const c=h('span',{class:'bs-chip'+(S.newChips.has(hh)?' new':''),title:`Block ${hh}, referenced by ${refs.get(hh)||0} ${(refs.get(hh)||0)===1?'version':'versions'}`},hh,h('b',null,'×'+(refs.get(hh)||0)));b.el=c;return c});
      S.newChips.clear();
      const total=[...S.store.values()].reduce((s,b)=>s+b.size,0);
      storeEl=h('div',{class:'bs-chips'},chips);
      metaEl=h('ul',{class:'bs-files'},[...S.files.entries()].map(([name,F])=>h('li',null,h('span',{class:'nm'},name),': ',F.versions.map((v,i)=>[i?' · ':'',h('span',{class:'sdl-tag '+(v.status==='uploaded'?'ok':'warn')},`v${v.v}${v.status==='pending'?' pending '+v.got+'/'+v.need:''}`),v.by!=='initial'?' '+v.by:'']))));
      colS.replaceChildren(h('div',{class:'bs-p'},
        h('div',{class:'hd'},h('span',null,'Block server → cloud storage'),h('span',{class:'sdl-tag info'},`${S.store.size} blocks · ${mb(total)}`)),
        h('div',{class:'sub'},'Blocks are stored by hash and deduplicated within the account; the number is how many versions reference a block'),storeEl,
        h('div',{class:'hd'},h('span',null,'Metadata database (API server)')),
        h('div',{class:'sub'},'Which blocks make up each file, plus version numbers and upload status'),metaEl));
      st.set('up',mb(S.up),S.up?'info':null);st.set('full',mb(S.full));st.set('down',mb(S.down),S.down?'info':null);
      st.set('skip',mb(S.skip),S.skip?'ok':null);st.set('conf',S.conflicts,S.conflicts?'warn':null);
      bResume.disabled=!(S.dev.A.resume||S.dev.B.resume);
    }

    /* ---- actions ---- */
    function edit(k,i){
      const d=S.dev[k];if(d.busy)return;const lf=d.files[d.cur];
      lf.blocks[i]={tok:k+i+'-'+(++S.n),size:lf.blocks[i].size};d.note=null;
      ctx.log(`${d.name} edited block ${i+1} of ${d.cur}; its hash is now ${hx(lf.blocks[i].tok)}`);render();
    }
    async function sync(k){
      const d=S.dev[k];if(d.busy||d.resume)return;
      const fname=d.cur,lf=d.files[fname],F=S.files.get(fname),base=baseOf(F,lf);
      const idx=changedIdx(lf,base);
      if(!idx.length&&base){ctx.log(`${d.name}: ${fname} has no local edits, nothing to upload`);return}
      d.busy=true;d.note=null;render();
      const toks=lf.blocks.map(b=>({...b})),hashes=toks.map(b=>hx(b.tok));
      S.full+=size(lf);
      ctx.log(`${d.name} chunks the file into 4 MB blocks and hashes them: ${base?`${idx.length} ${idx.length===1?'block differs':'blocks differ'} from v${base.v}`:`new file, ${idx.length} blocks in total`}. It submits the metadata to the API server first${base?` (base_version = ${base.v})`:''}`);
      flyEl(d.head,metaEl,'#7d8b83');await ctx.wait(FLY);
      let target=F,tname=fname,conflict=false;
      const head=F?F.versions[F.versions.length-1].v:0;
      if(F&&base&&head!==base.v){
        conflict=true;tname=fname.replace('.pptx',` (${k}’s conflicted copy).pptx`);
        target={versions:[]};S.files.set(tname,target);S.conflicts++;
        ctx.log(`API server: ${fname} is already at v${head}, but the base of ${d.name} is v${base.v}. The conditional update fails → sync conflict, saved as “${tname}” instead`,'bad');
      }else if(!F){target={versions:[]};S.files.set(fname,target)}
      const need=[],seen=new Set();
      for(const i of idx){const hh=hashes[i];if(S.store.has(hh)||seen.has(hh))continue;seen.add(hh);need.push(i)}
      const ver={v:(target.versions.length?target.versions[target.versions.length-1].v:0)+1,blocks:hashes.map((hh,i)=>({h:hh,size:toks[i].size})),status:'pending',by:k,got:0,need:need.length};
      target.versions.push(ver);
      if(!conflict)ctx.log(`API server: ${F?`base v${base.v} is the latest version, so it`:'It'} writes ${fname} v${ver.v} with status pending`,'info');
      const skip=idx.filter(i=>!need.includes(i));
      for(const i of skip){d.flash[i]='skip';S.skip+=toks[i].size}
      ctx.log(`The block server compares hashes: ${need.length} ${need.length===1?'block needs':'blocks need'} uploading (${mb(need.reduce((s,i)=>s+toks[i].size,0))}), and ${skip.length} already ${skip.length===1?'exists':'exist'} in the cloud, so ${skip.length===1?'it is':'they are'} skipped`,'info');
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
          d.flash[i]='fail';d.resume=job;d.busy=false;d.note=[`Upload interrupted: ${job.done} / ${job.ver.need} blocks confirmed, version stays pending`,'bad'];
          ctx.log(`The network dropped while uploading changed block ${job.done+1} (block ${i+1}). v${job.ver.v} is still pending, so other devices will not get this version`,'bad');
          render();ctx.announce('Upload interrupted, version stays pending');return false;
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
      ctx.log(`${S.dev[k].name} resumes the upload: the ${job.done} confirmed ${job.done===1?'block is':'blocks are'} not resent, continuing from block ${job.rest[0]+1}`,'info');
      return uploadRest(k,job);
    }
    async function publish(k,job){
      const d=S.dev[k];
      job.ver.status='uploaded';
      ctx.log(`Block list verified: all ${job.hashes.length} blocks of ${job.tname} v${job.ver.v} are in the cloud → status becomes uploaded, and the relevant devices are notified`,'ok');
      if(!job.conflict){job.lf.base=job.ver.v}
      else{d.files[job.tname]={base:job.ver.v,blocks:job.toks.map(b=>({...b}))};d.note=[`Conflict: your local edits were saved as “${job.tname}”`,'warn']}
      d.flash={};d.busy=false;render();
      const o=S.dev[k==='A'?'B':'A'];
      if(job.conflict){o.remote.add(job.tname);ctx.log(`${o.name} gets a notification: “${job.tname}” appeared, and the user decides whether to merge or overwrite`,'warn');render();await ctx.wait(300);await pull(k,job.fname,true)}
      else if(!o.files[job.tname]){o.remote.add(job.tname);ctx.log(`${o.name} gets a notification: new file ${job.tname} (downloaded when opened)`,'info');render()}
      else if(o.busy||hasMods(o,job.tname)){ctx.log(`${o.name} gets a notification, but it has unsynced edits, so this is handled when it submits`,'warn');render()}
      else await pull(o.k,job.tname,false);
      return true;
    }
    async function pull(k,fname,force){
      const d=S.dev[k],lf=d.files[fname],F=S.files.get(fname),vis=lastUp(F);
      if(!vis||(!force&&vis.v===lf.base))return;
      const idx=vis.blocks.map((b,i)=>lf.blocks[i]&&hx(lf.blocks[i].tok)===b.h?-1:i).filter(i=>i>=0);
      ctx.log(`${d.name} fetches the metadata of ${fname} v${vis.v} and downloads only the ${idx.length} ${idx.length===1?'block':'blocks'} it does not have locally`,'info');
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
      ctx.log(`Device A saves ${'report.pptx'} as ${name}`);render();await ctx.wait(500);
      edit('A',0);
    }
    function insertHead(){
      const d=S.dev.A;if(d.busy)return;const lf=d.files[d.cur];
      lf.blocks=lf.blocks.map((b,i)=>({tok:'A'+i+'-s'+(++S.n),size:b.size}));lf.blocks.push({tok:'Atail-'+(++S.n),size:0.001});
      ctx.log('Device A inserts 1 KB at the start of the file. With fixed 4 MB chunking, every later block boundary shifts by 1 KB: all 10 hashes change and an extra 1 KB tail block appears, so delta sync degrades to almost a full upload. Content-defined chunking mitigates this.','warn');
      render();
    }

    /* ---- controls ---- */
    ctx.button('Sync A',()=>{sync('A').catch(()=>{})},{primary:true});
    ctx.button('Sync B',()=>{sync('B').catch(()=>{})});
    ctx.button('Sync A and B together (A arrives first)',()=>{both().catch(()=>{})});
    const bResume=ctx.button('Resume upload',()=>{resume().catch(()=>{})});
    ctx.button('A: save a copy and edit the cover',()=>{saveCopy().catch(()=>{})});
    ctx.button('A: insert 1 KB at the start',()=>insertHead());
    const tInt=ctx.toggle({label:'Interrupt the next upload at the 2nd block',value:false,onChange:v=>{S.interrupt=v}});
    const st=ctx.stats([{key:'up',label:'Uploaded so far'},{key:'full',label:'If whole file each time'},{key:'down',label:'Downloaded so far'},{key:'skip',label:'Dedup skipped'},{key:'conf',label:'Conflicted copies'}]);
    async function both(){const a=sync('A');await ctx.wait(150);const b=sync('B');await Promise.all([a,b])}

    fresh();render();
    // On first open, A has already edited blocks 2 and 5 (as in the figure); wait for the reader to click “Sync A”
    edit('A',1);edit('A',4);ctx.clearLog();

    function prepare(){fresh();tInt.set(false,true);ctx.clearLog();render()}
    const done=async()=>{while(S.dev.A.busy||S.dev.B.busy)await ctx.wait(150);await ctx.wait(300)};
    ctx.scenarios([
      {id:'delta',label:'A small edit',
        ask:'A 40 MB file is split into ten 4 MB blocks, and A changes just a few words in blocks 2 and 5. How much does delta sync upload? How much does B download?',
        insight:'Only 2 blocks, 8 MB, are uploaded, versus 40 MB for a full upload. After the notification, B fetches the metadata of v2, compares it with its block list, and downloads just those 2 blocks. The cloud goes from 10 blocks to 12: v1 still references the old blocks 2 and 5, so they cannot be deleted. Delta sync saves the most bandwidth when a large file changes only a little.',
        async run(){prepare();await ctx.wait(300);edit('A',1);await ctx.wait(300);edit('A',4);await ctx.wait(400);await sync('A');await done()}},
      {id:'dedup',label:'Save a copy',
        ask:'A saves report.pptx as report-final.pptx, changes only the cover (block 1), and uploads. How many blocks are sent? How many new blocks does the cloud gain?',
        insight:'Only the cover block is sent, 4 MB. The other 9 blocks have identical hashes and already exist in the cloud, so they are skipped (36 MB of dedup skipped). The cloud gains just 1 block, and the reference count of those 9 becomes 2. Deduplication does not mean blocks can be deleted freely: when one file is deleted, only blocks that no version references and that are past the retention period can be reclaimed.',
        async run(){prepare();await ctx.wait(300);await saveCopy();await ctx.wait(400);await sync('A');await done()}},
      {id:'conflict',label:'Two devices edit at once',
        ask:'A and B both edit from v1: A changes block 3, B changes block 7, and A’s request arrives first. What happens to B’s submission? Is B’s edit lost? They changed different blocks, so does the system merge them automatically?',
        insight:'A’s submission is processed first and writes v2. When B submits with base_version = 1, the latest version is already v2, so the conditional update fails and B gets a sync conflict. B’s blocks are still uploaded and saved as “report (B’s conflicted copy).pptx”, so nothing is lost; B then updates report.pptx to v2 (downloading blocks 3 and 7). Even though the two people changed different blocks, the system does not merge automatically. It keeps both versions and lets the user decide: this is a conflict policy, not a collaborative-editing algorithm.',
        async run(){prepare();await ctx.wait(300);edit('A',2);await ctx.wait(250);edit('B',6);await ctx.wait(400);await both();await done()}},
      {id:'resume',label:'Interrupted upload',
        ask:'A edits blocks 2, 6, and 9, and the network drops while the second one (block 6) is uploading. Can B see the new version now? After recovery, how many blocks must be resent?',
        insight:'No. v2 stays pending (the metadata database shows “pending 1/3”), B still shows v1, which matches the cloud, and a pending file is never downloaded as a complete file. After the upload resumes, the confirmed block 2 is not resent; only blocks 6 and 9 are uploaded. Once all three blocks have arrived and been verified, v2 becomes uploaded and B downloads those 3 blocks (12 MB).',
        async run(){prepare();await ctx.wait(300);for(const i of [1,5,8]){edit('A',i);await ctx.wait(200)}tInt.set(true);await ctx.wait(300);await sync('A');await ctx.wait(1800);await resume();await done()}},
    ]);
  }
});
})();
