/** 本地文件模式验收。需要 playwright，可用 PLAYWRIGHT_MODULE 指定模块路径。 */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const options={headless:true};
 const macChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
 if(process.env.CHROME_EXECUTABLE)options.executablePath=process.env.CHROME_EXECUTABLE;
 else if(fs.existsSync(macChrome))options.executablePath=macChrome;
 const browser=await chromium.launch(options);
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(root,'index.html')).href);
  await page.waitForFunction(()=>[...document.images].every(i=>i.complete));
  const imageReport=await page.evaluate(()=>({total:document.querySelectorAll('article img').length,broken:[...document.querySelectorAll('article img')].filter(i=>!i.naturalWidth).map(i=>i.getAttribute('src'))}));
  await page.screenshot({path:path.join(root,'校验/阅读版-desktop.png')});
  await page.locator('#q').fill('Q25-04');await page.locator('#nav a[href="#d29/q25-04"]').click();
  await page.locator('#d29').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.getElementById('d29-q25-04').getBoundingClientRect().top<200);
  await page.screenshot({path:path.join(root,'校验/阅读版-答案.png')});
  const anchors=await page.evaluate(()=>[...document.querySelectorAll('#d29 a[id]')].filter(a=>/^d29-(?:q\d{2}|p\d{2}|r)-\d{2}$/.test(a.id)).map(a=>a.id));
  const tocTargets=await page.locator('#d29 a[href^="#d29/"]').evaluateAll(links=>links.every(a=>document.getElementById(a.getAttribute('href').slice(1).replace('/','-'))));
  await page.locator('#q').fill('');await page.locator('#nav a[href="#d22"]').click();await page.locator('#d22').waitFor({state:'visible'});
  await page.locator('#d22 a[href="#d29/q22-01"]').click();await page.locator('#d29').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.getElementById('d29-q22-01').getBoundingClientRect().top<200);
  await page.locator('#d29 img').first().click();await page.locator('#zoom').waitFor({state:'visible'});await page.locator('#zoom button').click();
  await page.locator('#q').fill('qwerty-no-such-term-4831');const empty=(await page.locator('#nav a').count())===0;await page.locator('#q').fill('');
  await page.locator('#nav a[href="#d22"]').click();await page.locator('#d22').waitFor({state:'visible'});await page.locator('#next').click();await page.locator('#d23').waitFor({state:'visible'});await page.locator('#prev').click();await page.locator('#d22').waitFor({state:'visible'});
  const desktop=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  await page.setViewportSize({width:390,height:844});await page.locator('#menu').click();await page.locator('#nav a[href="#d29"]').click();await page.locator('#d29').waitFor({state:'visible'});
  await page.screenshot({path:path.join(root,'校验/阅读版-mobile.png')});
  const mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  await page.locator('#d29 img').first().click();await page.locator('#zoom').waitFor({state:'visible'});const mobileZoom=await page.locator('#zoom .zoom-frame').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth}));await page.locator('#zoom button').click();
  const result={documents:await page.locator('article').count(),images:imageReport,answerAnchors:anchors.length,answerTocTargetsValid:tocTargets,sourceAnswerJump:true,questionSearchJump:true,emptySearch:empty,desktop,mobile,mobileZoom,pageErrors:errors};
  fs.writeFileSync(path.join(root,'校验/阅读版检查.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
  if(imageReport.broken.length||errors.length||anchors.length!==58||!tocTargets||!empty||desktop.scrollWidth>desktop.width||mobile.scrollWidth>mobile.width)process.exitCode=1;
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
