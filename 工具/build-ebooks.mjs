/** 将中文版 Markdown、图片和交叉链接编译为 EPUB 3 与 Kindle AZW3。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const repo=path.resolve(root,'..');
const outputDir=path.join(root,'电子书');
const buildDir=path.join(root,'.ebook-build');
const title='系统设计面试笔记：中文版学习版';
const stem='系统设计面试笔记-中文版学习版';
const repositoryUrl='https://github.com/kadaliao/system-design-notes/blob/main/';
const commonPaths={
  ebookConvert:[process.env.EBOOK_CONVERT,'/Applications/calibre.app/Contents/MacOS/ebook-convert','/opt/homebrew/bin/ebook-convert','/usr/local/bin/ebook-convert'].filter(Boolean),
  rsvgConvert:[process.env.RSVG_CONVERT,'/opt/homebrew/bin/rsvg-convert','/usr/local/bin/rsvg-convert'].filter(Boolean),
};
const executable=candidates=>candidates.find(p=>path.isAbsolute(p)?fs.existsSync(p):true);
const ebookConvert=executable(commonPaths.ebookConvert);
const rsvgConvert=executable(commonPaths.rsvgConvert);
if(!ebookConvert)throw new Error('找不到 ebook-convert；请安装 Calibre 或设置 EBOOK_CONVERT');
if(!rsvgConvert)throw new Error('找不到 rsvg-convert；请安装 librsvg 或设置 RSVG_CONVERT');
const {marked}=await import(process.env.MARKED_MODULE||'marked');

fs.rmSync(buildDir,{recursive:true,force:true});
fs.mkdirSync(buildDir,{recursive:true});
fs.mkdirSync(outputDir,{recursive:true});

const chapterDirs=fs.readdirSync(root).filter(n=>/^\d{2}\. /.test(n)).sort();
const files=[
  'Readme.md',
  ...chapterDirs.map(d=>path.join(d,fs.readdirSync(path.join(root,d)).find(n=>/^readme\.md$/i.test(n)))),
  '术语速查.md','延伸阅读.md','校验/验收说明.md',
];
const docs=files.map((file,index)=>({id:`book-${index}`,file,source:fs.readFileSync(path.join(root,file),'utf8')}));
const byPath=new Map(docs.map(doc=>[path.resolve(root,doc.file),doc.id]));
const imageSources=new Set();
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const slug=s=>s.replace(/<[^>]*>/g,'').toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu,'').trim().replace(/\s+/g,'-');
const encodePath=p=>p.split(path.sep).map((part,index)=>index===0&&part==='..'?'..':encodeURIComponent(part)).join('/');
const githubLink=target=>repositoryUrl+path.relative(repo,target).split(path.sep).map(encodeURIComponent).join('/');

for(const doc of docs){
  if(doc.file==='Readme.md')doc.source=doc.source.replace(/\[打开离线阅读版\]\(\.\/index\.html\)\s*·\s*/, '');
  const seen=new Map();
  const renderer=new marked.Renderer();
  renderer.heading=function(token){
    const text=this.parser.parseInline(token.tokens);
    let id=slug(text),n=seen.get(id)||0;
    seen.set(id,n+1);
    if(n)id+=`-${n}`;
    return `<h${token.depth} id="${doc.id}-${esc(id)}">${text}</h${token.depth}>\n`;
  };
  let html=marked.parse(doc.source,{renderer});
  html=html.replace(/\bid="([^"]+)"/g,(all,id)=>`id="${id.startsWith(doc.id+'-')?id:doc.id+'-'+id}"`);
  html=html.replace(/(href|src)="([^"]*)"/g,(all,attr,url)=>{
    if(/^(https?:|mailto:|data:|tel:)/i.test(url))return all;
    if(url.startsWith('#'))return `${attr}="#${doc.id}-${esc(url.slice(1))}"`;
    const hashIndex=url.indexOf('#');
    const rawPart=hashIndex===-1?url:url.slice(0,hashIndex);
    const anchor=hashIndex===-1?'':url.slice(hashIndex+1);
    let decoded;
    try{decoded=decodeURIComponent(rawPart)}catch{decoded=rawPart}
    const target=path.resolve(root,path.dirname(doc.file),decoded);
    if(attr==='src'){
      imageSources.add(target);
      return `src="${encodePath(path.relative(root,target))}"`;
    }
    const targetDoc=byPath.get(target);
    if(targetDoc)return `href="#${targetDoc}${anchor?'-'+esc(anchor):''}"`;
    return `href="${esc(githubLink(target))}${anchor?'#'+esc(anchor):''}"`;
  });
  doc.html=html;
}

const css=`
html{font-family:"Noto Serif CJK SC","Source Han Serif SC","Songti SC",serif;color:#23352f;line-height:1.7}
body{margin:0;padding:0}div.sd-lab{border:1px dashed #9fbca9;border-radius:.5em;padding:0 1em;margin:1em 0;background:#f3f7f0}section.chapter{page-break-before:always}section.chapter:first-child{page-break-before:auto}
h1{font-family:"Noto Sans CJK SC","PingFang SC",sans-serif;color:#183f35;font-size:2em;line-height:1.35;margin:0 0 1em}
h2{font-family:"Noto Sans CJK SC","PingFang SC",sans-serif;color:#245447;font-size:1.55em;border-bottom:1px solid #b8c8c0;padding-bottom:.25em;margin-top:2.1em}
h3,h4{font-family:"Noto Sans CJK SC","PingFang SC",sans-serif;color:#2d554a;line-height:1.45;margin-top:1.7em}
p,li{orphans:2;widows:2}a{color:#176b52;text-decoration:none}blockquote{border-left:4px solid #6f9b83;background:#eef4ea;margin:1.2em 0;padding:.3em 1em;color:#344e45}
pre{background:#eef2ec;border:1px solid #d7dfd8;padding:1em;white-space:pre-wrap;word-break:break-word;font-size:.82em}
code{font-family:monospace;background:#eef2ec;padding:.08em .22em}pre code{padding:0}
img{display:block;max-width:100%;height:auto;margin:1.3em auto;page-break-inside:avoid}table{border-collapse:collapse;width:100%;font-size:.86em;margin:1.2em 0;page-break-inside:avoid}
th,td{border:1px solid #aebdb5;padding:.45em;vertical-align:top}th{background:#eaf0e5}hr{border:0;border-top:1px solid #bdc9c2;margin:2em 0}.edition-note{color:#61736b;font-size:.88em}
`;
const bookHtml=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><style>${css}</style></head><body>
${docs.map((doc,index)=>`<section class="chapter" id="${doc.id}" data-source="${esc(doc.file)}">${index===0?'<p class="edition-note">电子书版 · 2026-09-07</p>':''}${doc.html}</section>`).join('\n')}
</body></html>`;
// Calibre 只允许收集入口 HTML 所在目录及其子目录中的资源。入口放在中文版根目录，
// 才能安全打包各章图片；该临时文件由 .gitignore 排除。
const htmlPath=path.join(root,'.ebook-book.html');
fs.writeFileSync(htmlPath,bookHtml);

const coverSvg=path.join(outputDir,'cover.svg');
const coverPng=path.join(buildDir,'cover.png');
const run=(command,args,label)=>{
  const result=spawnSync(command,args,{stdio:'inherit'});
  if(result.error||result.status!==0)throw new Error(`${label}失败（退出码 ${result.status}）${result.error?': '+result.error.message:''}`);
};
run(rsvgConvert,['-w','1600','-h','2560','-o',coverPng,coverSvg],'生成封面');

const epub=path.join(outputDir,`${stem}.epub`);
const azw3=path.join(outputDir,`${stem}.azw3`);
const metadata=[
  '--title',title,
  '--authors','system-design-notes 社区贡献者',
  '--publisher','system-design-notes',
  '--language','zh',
  '--pubdate','2026-09-07',
  '--comments','面向会写 CRUD、正在学习系统设计的工程师：28 章中文学习笔记，第 29 章自测题详解，配有批注、算例、故障边界和机制图解。',
  '--tags','系统设计,分布式系统,中文学习笔记',
  '--cover',coverPng,
];
run(ebookConvert,[htmlPath,epub,...metadata,'--output-profile','tablet','--epub-version','3','--chapter','//h:h1','--page-breaks-before','//h:h1','--level1-toc','//h:h1','--level2-toc','//h:h2','--max-toc-links','500'],'生成 EPUB');
run(ebookConvert,[epub,azw3,...metadata,'--output-profile','kindle_pw3'],'生成 AZW3');

const sha256=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const info={
  title,
  generated_at:'2026-09-07',
  source_documents:docs.length,
  translated_chapters:28,
  supplementary_chapters:1,
  answer_entries:58,
  source_image_files_referenced:imageSources.size,
  files:[epub,azw3].map(file=>({name:path.basename(file),bytes:fs.statSync(file).size,sha256:sha256(file)})),
};
fs.writeFileSync(path.join(outputDir,'构建信息.json'),JSON.stringify(info,null,2)+'\n');
console.log(JSON.stringify(info,null,2));
