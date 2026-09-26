/** 交互实验验收：逐个实验文件在桌面与手机宽度下挂载、运行全部预设场景，检查脚本错误、横向溢出和过小文字。
 * 用法：node 工具/check-labs.cjs [--file 04-rate-limiter.js[,05-...]] [--jobs 并行数] [--theme dark] [--out 截图目录] [--write]
 * 需要 playwright 或 playwright-core（PLAYWRIGHT_MODULE 指定路径）；默认使用本机 Chrome。 */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{pathToFileURL}=require('node:url');
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:d};
const root=path.resolve(__dirname,'..');
const labDir=path.join(root,'交互实验','labs');
const files=(arg('--file')||fs.readdirSync(labDir).filter(f=>f.endsWith('.js')).sort().join(',')).split(',').filter(Boolean);
const out=arg('--out',path.join(os.tmpdir(),'sd-labs-check'));
const scenarioTimeout=+arg('--timeout',60000);
const theme=arg('--theme','');  // --theme dark：在夜间模式下检查与截图
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const options={headless:true};
  const macChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if(process.env.CHROME_EXECUTABLE)options.executablePath=process.env.CHROME_EXECUTABLE;else if(fs.existsSync(macChrome))options.executablePath=macChrome;
  const browser=await chromium.launch(options);
  const report=[];let failed=false;
  try{
    const jobs=[];
    for(const file of files)for(const vp of [{name:'desktop',width:1180,height:900},{name:'mobile',width:390,height:844}])jobs.push({file,vp});
    const workers=Math.max(1,+arg('--jobs',1));
    const runJob=async({file,vp})=>{
      {
        const page=await browser.newPage({viewport:{width:vp.width,height:vp.height},deviceScaleFactor:vp.name==='mobile'?2:1});
        const errors=[];
        page.on('pageerror',e=>errors.push('pageerror: '+e.message));
        page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.type()+': '+m.text())});
        const url=pathToFileURL(path.join(root,'交互实验','preview.html')).href+'?file='+encodeURIComponent(file)+(theme?'&theme='+theme:'');
        await page.goto(url);
        await page.waitForFunction(()=>window.__labsReady===true,null,{timeout:15000});
        await page.waitForTimeout(400);
        const labs=await page.$$eval('.sd-lab',els=>els.map(e=>({id:e.dataset.lab,mounted:!!e.querySelector('.sdl-frame'),error:e.querySelector('.sdl-error')?.textContent||null,scenarios:[...e.querySelectorAll('.sdl-chips button')].map(b=>b.textContent.replace('✓','').trim())})));
        const scenarioResults=[];
        // 场景只在桌面宽度完整运行一遍；手机宽度运行第一个场景，检查布局在运行中不溢出。
        for(let li=0;li<labs.length;li++){
          const lab=labs[li];
          const n=vp.name==='desktop'?lab.scenarios.length:Math.min(1,lab.scenarios.length);
          for(let si=0;si<n;si++){
            const frame=page.locator('.sd-lab').nth(li);
            await frame.locator('.sdl-chips button').nth(si).click();
            const run=frame.locator('.sdl-card button.primary');
            await run.scrollIntoViewIfNeeded();
            await run.click();
            const t0=Date.now();
            let status='timeout';
            try{
              await page.waitForFunction(([i])=>{const f=document.querySelectorAll('.sd-lab')[i];const st=f.querySelector('.sdl-card .status')?.textContent||'';const b=f.querySelector('.sdl-card button.primary');return st.includes('出错')||(b&&!b.disabled&&b.textContent.includes('再运行'))},[li],{timeout:scenarioTimeout,polling:250});
              status=await frame.locator('.sdl-card .status').textContent().then(t=>t.includes('出错')?'error':'ok');
            }catch{}
            scenarioResults.push({lab:lab.id,scenario:lab.scenarios[si],status,ms:Date.now()-t0});
            if(status!=='ok')failed=true;
          }
        }
        const layout=await page.evaluate(()=>{
          const frames=[...document.querySelectorAll('.sdl-frame')];
          const overflow=frames.filter(f=>f.scrollWidth>f.clientWidth+1).map(f=>f.closest('.sd-lab').dataset.lab);
          let tiny=0;const tinySamples=[];
          for(const f of frames){for(const t of f.querySelectorAll('text,span,div,p,li,td,th,label,button,output')){
            if(!t.childNodes.length||![...t.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;
            const r=t.getBoundingClientRect();if(!r.width||!r.height)continue;
            const fs=t instanceof SVGElement?r.height:parseFloat(getComputedStyle(t).fontSize);
            if(fs<9.5){tiny++;if(tinySamples.length<5)tinySamples.push((t.textContent||'').trim().slice(0,20)+' @'+fs.toFixed(1)+'px')}
          }}
          return {pageScroll:document.documentElement.scrollWidth>innerWidth,overflow,tiny,tinySamples};
        });
        const shots=[];
        for(let li=0;li<labs.length;li++){const shot=path.join(out,labs[li].id+'-'+vp.name+(theme?'-'+theme:'')+'.png');await page.locator('.sd-lab').nth(li).screenshot({path:shot});shots.push(shot)}
        const shot=shots.join(',');
        const bad=errors.length||labs.some(l=>!l.mounted||l.error)||layout.pageScroll||layout.overflow.length;
        if(bad)failed=true;
        report.push({file,viewport:vp.name,labs,scenarios:scenarioResults,layout,errors,screenshot:shot});
        console.log(`${bad?'✗':'✓'} ${file} [${vp.name}] 实验 ${labs.length}，场景 ${scenarioResults.filter(s=>s.status==='ok').length}/${scenarioResults.length}，错误 ${errors.length}，溢出 ${layout.pageScroll||layout.overflow.length?'有':'无'}，小字 ${layout.tiny}`);
        for(const e of errors.slice(0,5))console.log('   ',e);
        for(const s of scenarioResults.filter(s=>s.status!=='ok'))console.log('    场景未完成：',s.lab,s.scenario,s.status);
        if(layout.tiny)console.log('    小字样例：',layout.tinySamples.join(' | '));
        await page.close();
      }
    };
    let next=0;
    await Promise.all(Array.from({length:workers},async()=>{while(next<jobs.length){const j=jobs[next++];try{await runJob(j)}catch(e){failed=true;report.push({file:j.file,viewport:j.vp.name,crash:String(e)});console.log(`✗ ${j.file} [${j.vp.name}] 检查中断：${e.message}`)}}}));
    report.sort((a,b)=>a.file.localeCompare(b.file)||a.viewport.localeCompare(b.viewport));
  }finally{await browser.close()}
  if(process.argv.includes('--write')){
    const slim=report.map(r=>({...r,screenshot:r.screenshot.split(',').map(x=>path.basename(x))}));
    fs.writeFileSync(path.join(root,'校验','交互实验检查.json'),JSON.stringify(slim,null,2)+'\n');
  }
  console.log('截图目录：'+out);
  if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
