/* 交互实验运行时：注册实验、渲染统一外框、控件库、动画循环、场景播放、自测练习与本地进度。
 * 使用经典脚本（非 ES module），离线双击 index.html（file://）也能加载。
 * 实验文件调用 SDLab.define({...})；阅读页在切换章节时调用 SDLab.activate(article)。 */
(function(){
'use strict';
const specs=new Map();
const order=[];
const live=new Set();
const ABORT={abort:true};
const STORE='sd-labs:v1';
/* ---------- 界面语言：页面在加载本脚本前设 window.LAB_LANG='en' 即切换英文；缺省为中文（行为不变）。
   固定界面文字都经 i18n()：英文字典以中文原文为键，找不到时原样返回。 ---------- */
const LANG=(window.LAB_LANG||(window.SDQ_CONFIG&&window.SDQ_CONFIG.lang))==='en'?'en':'zh';
const LOCALE=LANG==='en'?'en-US':'zh-CN';
const EN={
  '推进一步（至多 1 秒实验时间）':'Advance one step (up to 1 s of lab time)','下一步':'Next step','速度':'Speed','看观察 ↑':'See takeaway ↑',
  '播放控制':'Playback controls','暂停':'Pause','播放':'Play','连续播放':'Play continuously',
  '场景播放中':'Scenario playing','场景结束 · 已暂停':'Scenario finished · paused','播放中':'Playing','已暂停':'Paused',
  '已开始 · 点「下一步」推进':'Started · press “Next step” to advance',
  '重置':'Reset','恢复初始参数与状态':'Restore the initial parameters and state','动手实验':'Hands-on lab','交互实验：':'Interactive lab: ',
  '教学模型：':'Teaching model: ','事件日志':'Event log','实验加载失败：':'Lab failed to load: ',
  '预设场景':'Preset scenarios','预设场景：先预测，再逐步运行':'Preset scenarios: predict first, then step through',
  '预设场景：先预测，再运行':'Preset scenarios: predict first, then run','展开这个场景；再点一次收起':'Open this scenario; click again to close',
  '参数由预设场景设定':'Parameters are set by the scenario','收起场景，手动调整':'Close scenario and adjust manually',
  '观察：':'Takeaway: ','开始后停住，由底部「下一步」逐步推进':'Starts paused; use “Next step” below to advance',
  '逐步开始':'Step through','自动播放':'Autoplay','运行场景':'Run scenario','收起场景，回到手动调整':'Close scenario and return to manual controls',
  '收起':'Close','先猜：':'Predict first: ','从头逐步':'Restart stepping','从头自动播放':'Restart autoplay','运行中…':'Running…',
  '再运行一次':'Run again','场景完成：':'Scenario complete: ','运行出错，请重置后再试':'Something went wrong. Reset and try again.',
  '毫秒':'ms','秒':'s','分钟':'min','小时':'h','天':'d','年':'yr',
};
const i18n=s=>LANG==='en'&&EN[s]!==undefined?EN[s]:s;
const colors={ink:'#23352f',muted:'#66756d',line:'#dbe2da',soft:'#f0f4ed',soft2:'#e6eee2',card:'#fff',paper:'#fcfaf5',accent:'#176b52',accentSoft:'#d4e8d7',ok:'#2f8f5b',okSoft:'#dcefe2',bad:'#c2413b',badSoft:'#f7dedb',warn:'#b7791f',warnSoft:'#f6ead2',info:'#2f6fb3',infoSoft:'#dde9f6',series:['#2f6fb3','#c98a16','#2f8f5b','#b8477a','#1f8a8a','#7b5cb8']};

/* ---------- 本地进度：自测自评与答案草稿（浏览器存储不可用时静默降级） ---------- */
let store=(()=>{try{const v=JSON.parse(localStorage.getItem(STORE));if(v&&typeof v==='object')return {q:v.q||{},draft:v.draft||{}}}catch{}return {q:{},draft:{}}})();
let saveTimer=0;
function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem(STORE,JSON.stringify(store))}catch{}},120)}

/* ---------- DOM 工具 ---------- */
function add(el,kids){for(const k of kids){if(k==null||k===false)continue;if(Array.isArray(k))add(el,k);else el.append(k instanceof Node?k:String(k))}return el}
function h(tag,props,...kids){
  const el=document.createElement(tag);
  if(props)for(const [k,v] of Object.entries(props)){
    if(v==null||v===false)continue;
    if(k==='class')el.className=v;
    else if(k==='text')el.textContent=v;
    else if(k==='html')el.innerHTML=v;
    else if(k==='style'&&typeof v==='object'){for(const [sk,sv] of Object.entries(v)){if(sv==null)continue;if(sk.startsWith('--'))el.style.setProperty(sk,String(sv));else el.style[sk]=sv}}
    else if(k.startsWith('on')&&typeof v==='function')el.addEventListener(k.slice(2),v);
    else if(k==='dataset')Object.assign(el.dataset,v);
    else if(k==='value')el.value=v;
    else if(k in el&&typeof v!=='string')el[k]=v;
    else el.setAttribute(k,v===true?'':v);
  }
  return add(el,kids);
}
const SVGNS='http://www.w3.org/2000/svg';
function s(tag,attrs,...kids){
  const el=document.createElementNS(SVGNS,tag);
  if(attrs)for(const [k,v] of Object.entries(attrs)){
    if(v==null||v===false)continue;
    if(k==='text')el.textContent=v;
    else if(k==='class')el.setAttribute('class',v);
    else if(k.startsWith('on')&&typeof v==='function')el.addEventListener(k.slice(2),v);
    else el.setAttribute(k,v);
  }
  for(const k of kids.flat()){if(k==null||k===false)continue;el.append(k instanceof Node?k:document.createTextNode(String(k)))}
  return el;
}
function attr(el,attrs){for(const [k,v] of Object.entries(attrs)){if(v==null||v===false)el.removeAttribute(k);else if(k==='text')el.textContent=v;else el.setAttribute(k,v)}return el}

/* ---------- 通用小工具 ---------- */
const util={
  clamp:(v,a,b)=>Math.min(b,Math.max(a,v)),
  lerp:(a,b,t)=>a+(b-a)*t,
  /** 可复现的伪随机数（mulberry32），场景每次运行结果相同。 */
  rng(seed=1){let a=seed>>>0;const r=()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296};r.int=(lo,hi)=>lo+Math.floor(r()*(hi-lo+1));r.pick=arr=>arr[Math.floor(r()*arr.length)];r.normal=()=>{let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};return r},
  /** FNV-1a 32 位哈希，返回无符号整数。 */
  hash(str){let x=0x811c9dc5;for(let i=0;i<str.length;i++){x^=str.charCodeAt(i);x=Math.imul(x,0x01000193)}return x>>>0},
  fmt(n,d=0){if(!Number.isFinite(n))return String(n);return n.toLocaleString(LOCALE,{maximumFractionDigits:d,minimumFractionDigits:0})},
  pct(x,d=1){return Number.isFinite(x)?(x*100).toFixed(d).replace(/\.0+$/,'')+'%':'—'},
  bytes(b,d=1){if(!Number.isFinite(b))return '—';const u=['B','KB','MB','GB','TB','PB','EB'];let i=0;while(Math.abs(b)>=1000&&i<u.length-1){b/=1000;i++}return (Math.round(b*10**d)/10**d).toLocaleString(LOCALE)+' '+u[i]},
  duration(sec){if(!Number.isFinite(sec))return '—';const a=Math.abs(sec);if(a<1)return (sec*1000).toFixed(a<0.01?2:0)+' '+i18n('毫秒');if(a<120)return (+sec.toFixed(1))+' '+i18n('秒');if(a<7200)return (+(sec/60).toFixed(1))+' '+i18n('分钟');if(a<172800)return (+(sec/3600).toFixed(1))+' '+i18n('小时');if(a<86400*730)return (+(sec/86400).toFixed(1))+' '+i18n('天');return (+(sec/86400/365).toFixed(1))+' '+i18n('年')},
  range:(n)=>Array.from({length:n},(_,i)=>i),
  sleep:(ms)=>new Promise(r=>setTimeout(r,ms)),
};

/* ---------- 全局动画时钟：只驱动可见实验，离开视口或切走标签页即暂停 ---------- */
let rafId=0,last=0;
function kick(){if(!rafId){last=performance.now();rafId=requestAnimationFrame(tick)}}
function busy(inst){return inst.visible&&inst.mode==='play'&&!inst.stepping&&(inst.loops.size||inst.waits.length)}
function tick(now){
  rafId=0;
  const dt=Math.min(0.1,Math.max(0,(now-last)/1000));last=now;
  if(!document.hidden)for(const inst of live)if(busy(inst))inst.advance(dt*inst.speed);
  for(const inst of live)if(busy(inst)){rafId=requestAnimationFrame(tick);break}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)kick()});
// 按钮等处调用 ctx.wait 时被重置/切换场景中断，属于正常流程，不作为未捕获错误上报。
window.addEventListener('unhandledrejection',e=>{if(e.reason===ABORT)e.preventDefault()});
const io='IntersectionObserver' in window?new IntersectionObserver(entries=>{for(const e of entries){const inst=e.target.__sdl;if(inst){inst.visible=e.isIntersecting;if(inst.visible)kick()}}},{rootMargin:'80px'}):null;

/* ---------- 播放控制：倍速偏好全站共用；单步推进到下一个节拍，至少 0.2 秒、至多 1 秒实验时间 ---------- */
const SPEEDS=[0.25,0.5,1,2],STEP_MIN=200,STEP_MAX=1000,CHUNK=1000/60;
const narrow=matchMedia('(max-width: 760px)');
let speedPref=(()=>{try{const v=+localStorage.getItem('sd-lab-speed');return SPEEDS.includes(v)?v:1}catch{return 1}})();
function setSpeedPref(v){speedPref=v;try{localStorage.setItem('sd-lab-speed',String(v))}catch{}for(const i of live){i.speed=v;i.updateTransport()}}
const ICON={play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>',pause:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="1" fill="currentColor"/></svg>',step:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v14l10.5-7z" fill="currentColor"/><rect x="16.5" y="5" width="3" height="14" rx="1" fill="currentColor"/></svg>'};

/* ---------- 实验实例 ---------- */
class Instance{
  constructor(host,spec){this.host=host;this.spec=spec;this.loops=new Set();this.waits=[];this.clock=0;this.token=0;this.visible=!io;this.cleanups=[];this.mode='play';this.speed=speedPref;this.stepping=false;this.scen=null;this.mount()}
  /** 推进实验时钟 dt 秒：到期的等待依次放行，再驱动动画循环；返回放行的等待数。 */
  advance(dt){
    this.clock+=dt*1000;let n=0;
    if(this.waits.length){const due=this.waits.filter(w=>w.due<=this.clock);if(due.length){this.waits=this.waits.filter(w=>w.due>this.clock);n=due.length;for(const w of due)w.resolve()}}
    for(const lp of [...this.loops]){try{lp.fn(dt,this.clock/1000)}catch(e){console.error('[SDLab]',this.spec.id,e);this.loops.delete(lp);lp.running=false}}
    return n;
  }
  /** 时间不动，只让动画循环重画一次（暂停时点了按钮也能看到界面变化）。 */
  renderPass(){for(const lp of [...this.loops]){try{lp.fn(0,this.clock/1000)}catch(e){console.error('[SDLab]',this.spec.id,e)}}}
  hasWork(){return this.loops.size>0||this.waits.length>0}
  setMode(m){if(this.mode===m)return;this.mode=m;if(m==='play')kick();this.updateTransport()}
  /** 单步：推进到下一个节拍（至少 STEP_MIN、至多 STEP_MAX 毫秒）。每放行一次等待就让出一轮事件循环，
   *  让场景脚本排好后续动作，因此逐步运行与连续播放的结果一致。 */
  async stepOnce(){
    if(this.stepping)return;this.setMode('pause');this.stepping=true;this.updateTransport();
    const token=this.token,min=this.clock+STEP_MIN,max=this.clock+STEP_MAX;let resolved=0;
    try{
      while(this.clock<max-1e-6&&token===this.token&&this.hasWork()){
        const next=this.waits.length?Math.min(...this.waits.map(w=>w.due)):Infinity;
        const target=Math.min(max,this.clock+CHUNK,Math.max(next,this.clock+0.001));
        const n=this.advance((target-this.clock)/1000);
        if(n){resolved+=n;await new Promise(r=>setTimeout(r,0))}
        if(resolved&&this.clock>=min)break;
      }
    }finally{this.stepping=false;if(this.scen&&this.scen.running)this.scen.steps++;this.updateTransport()}
  }
  buildTransport(){
    const inst=this;
    const toggle=h('button',{type:'button','data-act':'toggle',onclick:()=>inst.setMode(inst.mode==='play'?'pause':'play')});
    const step=h('button',{type:'button','data-act':'step',title:i18n('推进一步（至多 1 秒实验时间）'),onclick:()=>inst.stepOnce()});step.innerHTML=ICON.step+'<span>'+i18n('下一步')+'</span>';
    const spd=new Map(SPEEDS.map(v=>[v,h('button',{type:'button',onclick:()=>setSpeedPref(v)},v+'×')]));
    const status=h('span',{class:'tst','aria-live':'polite'});
    // 场景结束时「观察」出现在场景卡里；手机上场景卡往往已滚出屏幕，给一个回去看的入口
    const insight=h('button',{type:'button','data-act':'insight',hidden:true,onclick:()=>inst.scen?.insightEl?.scrollIntoView({behavior:'smooth',block:'center'})},i18n('看观察 ↑'));
    const el=h('div',{class:'sdl-transport',role:'group','aria-label':i18n('播放控制')},toggle,step,h('span',{class:'spd'},h('span',{class:'lbl'},i18n('速度')),[...spd.values()]),insight,status);
    this.transport={el,toggle,step,spd,status,insight};
    // 暂停时在实验里点按钮、拖滑块，时间不动，但重画一次界面
    this.frame.addEventListener('input',()=>{if(inst.mode==='pause'&&!inst.stepping)requestAnimationFrame(()=>inst.renderPass())});
    this.frame.addEventListener('click',e=>{if(inst.mode==='pause'&&!inst.stepping&&!el.contains(e.target))requestAnimationFrame(()=>inst.renderPass())});
    return el;
  }
  updateTransport(){
    const t=this.transport;if(!t)return;const S=this.scen;
    const show=this.spec.transport!==false&&(this.loops.size>0||this.waits.length>0||!!(S&&S.active));
    t.el.hidden=!show;if(!show)return;
    const playing=this.mode==='play';
    t.toggle.innerHTML=(playing?ICON.pause:ICON.play)+'<span>'+i18n(playing?'暂停':'播放')+'</span>';
    t.toggle.setAttribute('aria-pressed',String(playing));t.toggle.title=i18n(playing?'暂停':'连续播放');
    t.step.disabled=this.stepping||!this.hasWork();
    for(const [v,b] of t.spd)b.setAttribute('aria-pressed',String(v===this.speed));
    t.insight.hidden=!(S&&S.done&&S.insightEl&&!S.insightEl.hidden);
    t.status.textContent=S&&S.running?(playing?i18n('场景播放中'):(S.steps?(LANG==='en'?`${S.steps} step${S.steps>1?'s':''} done · press “Next step” to continue`:`已推进 ${S.steps} 步 · 点「下一步」继续`):i18n('已开始 · 点「下一步」推进'))):S&&S.done?i18n('场景结束 · 已暂停'):i18n(playing?'播放中':'已暂停');
  }
  abort(){this.token++;const w=this.waits;this.waits=[];for(const x of w)x.reject(ABORT)}
  destroy(){
    this.abort();for(const lp of this.loops)lp.running=false;this.loops.clear();
    for(const fn of this.cleanups.splice(0)){try{fn()}catch(e){console.error(e)}}
    if(io&&this.frame)io.unobserve(this.frame);live.delete(this);
  }
  remount(){this.destroy();this.mount()}
  mount(){
    const spec=this.spec,host=this.host,inst=this;
    this.mode='play';this.stepping=false;this.scen=null;this.clock=0;this.ctrlEls=[];
    host.classList.add('sdl-mounted');host.replaceChildren();
    const resetBtn=h('button',{type:'button',title:i18n('恢复初始参数与状态'),onclick:()=>inst.remount()},i18n('重置'));
    const head=h('header',{class:'sdl-head'},h('div',{class:'sdl-head-text'},
      h('p',{class:'sdl-kicker'},i18n('动手实验')+(spec.chapter?(LANG==='en'?' · Chapter '+spec.chapter:' · 第 '+spec.chapter+' 章'):'')),
      h('div',{class:'sdl-title',role:'heading','aria-level':'3'},spec.title),
      spec.summary?h('p',{class:'sdl-summary'},spec.summary):null),resetBtn);
    const scen=h('div',{class:'sdl-scen',hidden:true});
    const controls=h('div',{class:'sdl-controls'});
    const stage=h('div',{class:'sdl-stage'});
    const body=h('div',{class:'sdl-body'},controls,stage);
    const stats=h('div',{class:'sdl-stats'});
    const sr=h('div',{class:'sdl-sr','aria-live':'polite',style:{position:'absolute',width:'1px',height:'1px',overflow:'hidden',clip:'rect(0 0 0 0)'}});
    const frame=h('section',{class:'sdl-frame','aria-label':i18n('交互实验：')+spec.title},head,scen,body,stats,sr);
    if(spec.caveat)frame.append(h('footer',{class:'sdl-foot'},i18n('教学模型：')+spec.caveat));
    host.append(frame);
    this.frame=frame;frame.__sdl=this;
    frame.append(this.buildTransport());
    if(io)io.observe(frame);
    let logBox=null;
    const ensureLog=()=>{if(!logBox){const ol=h('ol',{reversed:true});logBox=h('details',{class:'sdl-log',open:!!spec.logOpen},h('summary',null,spec.logTitle||i18n('事件日志')),ol);frame.insertBefore(logBox,frame.querySelector('.sdl-foot'));logBox.ol=ol}return logBox};
    // 控件 API 建出的元素都登记下来：选中预设场景时要锁住放在控件区以外的那些
    const place=(el,parent)=>{(parent||controls).append(el);inst.ctrlEls.push(el);return el};
    const ctx={
      id:spec.id,chapter:spec.chapter,frame,stage,controls,colors,util,el:h,svgEl:s,attr,
      get visible(){return inst.visible},
      /** 在舞台（或 parent）中创建按 viewBox 缩放的 SVG。 */
      svg(w,hgt,opt={}){const el=s('svg',{viewBox:`0 0 ${w} ${hgt}`,role:'img','aria-label':opt.label||spec.title,preserveAspectRatio:'xMidYMid meet'});if(opt.maxWidth)el.style.maxWidth=opt.maxWidth+'px';if(opt.style)Object.assign(el.style,opt.style);(opt.parent||stage).append(el);return el},
      slider(o){
        const out=h('output');const input=h('input',{type:'range',min:o.min,max:o.max,step:o.step??1,value:o.value,'aria-label':o.label});
        const fmt=o.format||(v=>String(v));const show=()=>{out.textContent=fmt(+input.value)};show();
        input.addEventListener('input',()=>{show();o.onInput&&o.onInput(+input.value)});
        input.addEventListener('change',()=>{o.onChange&&o.onChange(+input.value)});
        const el=h('label',{class:'sdl-ctrl'+(o.wide?' wide':'')},h('span',{class:'lbl'},h('span',null,o.label),out),input,o.hint?h('span',{class:'sdl-note'},o.hint):null);
        place(el,o.parent);
        return {el,input,get:()=>+input.value,set(v,silent){input.value=v;show();if(!silent){o.onInput&&o.onInput(+input.value);o.onChange&&o.onChange(+input.value)}}};
      },
      select(o){
        const sel=h('select',{'aria-label':o.label});
        for(const opt of o.options){const [v,l]=Array.isArray(opt)?opt:[opt.value,opt.label];sel.append(h('option',{value:v},l))}
        if(o.value!=null)sel.value=o.value;
        sel.addEventListener('change',()=>o.onChange&&o.onChange(sel.value));
        const el=h('label',{class:'sdl-ctrl'+(o.wide?' wide':'')},h('span',{class:'lbl'},h('span',null,o.label)),sel);
        place(el,o.parent);
        return {el,input:sel,get:()=>sel.value,set(v,silent){sel.value=v;if(!silent)o.onChange&&o.onChange(sel.value)}};
      },
      toggle(o){
        const input=h('input',{type:'checkbox',checked:!!o.value});
        input.addEventListener('change',()=>o.onChange&&o.onChange(input.checked));
        const el=h('label',{class:'sdl-ctrl sdl-toggle'+(o.wide?' wide':'')},input,h('span',null,o.label));
        place(el,o.parent);
        return {el,input,get:()=>input.checked,set(v,silent){input.checked=!!v;if(!silent)o.onChange&&o.onChange(input.checked)}};
      },
      /** 分段按钮组：options 为 [值, 文本] 数组。 */
      segmented(o){
        const row=h('div',{class:'sdl-btnrow',role:'group','aria-label':o.label});let value=o.value;const btns=new Map();
        for(const opt of o.options){const [v,l]=Array.isArray(opt)?opt:[opt.value,opt.label];const b=h('button',{type:'button','aria-pressed':String(v===value),onclick:()=>api.set(v)},l);btns.set(v,b);row.append(b)}
        const el=h('div',{class:'sdl-ctrl'+(o.wide?' wide':'')},o.label?h('span',{class:'lbl'},h('span',null,o.label)):null,row);
        place(el,o.parent);
        const api={el,get:()=>value,set(v,silent){value=v;for(const [k,b] of btns)b.setAttribute('aria-pressed',String(k===v));if(!silent)o.onChange&&o.onChange(v)}};
        return api;
      },
      button(label,onclick,o={}){const b=h('button',{type:'button',class:[o.primary?'primary':'',o.danger?'danger':''].join(' ').trim()||null,title:o.title,onclick});b.textContent=label;inst.ctrlEls.push(b);if(o.parent!==null)(o.parent||ctx.buttonRow()).append(b);return b},
      /** 控件区里的一行按钮（重复调用返回同一行，除非传 fresh）。 */
      buttonRow(fresh,parent){if(fresh||!ctx._row){ctx._row=h('div',{class:'sdl-btnrow wide'});(parent||controls).append(ctx._row)}return ctx._row},
      stats(defs){
        const map=new Map();
        for(const d of defs){const v=h('div',{class:'v'},d.value??'—');const el=h('div',{class:'sdl-stat'+(d.tone?' '+d.tone:''),title:d.title||null},h('div',{class:'k'},d.label),v);map.set(d.key,{el,v});stats.append(el)}
        return {set(key,val,tone){const m=map.get(key);if(!m)return;m.v.textContent=val;m.el.className='sdl-stat'+(tone?' '+tone:'')},el:stats};
      },
      log(text,tone){const box=ensureLog();const li=h('li',{class:tone||null},text);box.ol.prepend(li);while(box.ol.children.length>200)box.ol.lastChild.remove();return li},
      clearLog(){if(logBox)logBox.ol.replaceChildren()},
      openLog(open=true){ensureLog().open=open},
      announce(text){sr.textContent=text},
      note(html,parent){const p=h('p',{class:'sdl-note',html});(parent||stage).append(p);return p},
      /** 每帧回调 fn(dt 秒, 实验时钟秒)。只在实验可见时运行。 */
      loop(fn,autostart=true){const lp={fn,running:false,start(){if(!lp.running){lp.running=true;inst.loops.add(lp);kick();inst.updateTransport()}return lp},stop(){lp.running=false;inst.loops.delete(lp);inst.updateTransport();return lp},toggle(){return lp.running?lp.stop():lp.start()}};if(autostart)lp.start();return lp},
      /** 按实验时钟等待（不可见时暂停）；重置或切换场景会中断等待。 */
      wait(ms){const token=inst.token;return new Promise((resolve,reject)=>{if(token!==inst.token)return reject(ABORT);inst.waits.push({due:inst.clock+ms,resolve,reject});kick();if(inst.waits.length===1)inst.updateTransport()})},
      scenarios(list){renderScenarios(inst,scen,list)},
      onCleanup(fn){inst.cleanups.push(fn)},
      /** 注入实验私有样式（按 key 只注入一次）；选择器请以实验前缀开头，避免污染阅读页。 */
      css(key,text){const id='sdl-css-'+key;if(!document.getElementById(id))document.head.append(h('style',{id},text))},
      /** 舞台宽度变化时回调 fn(宽度)，挂载后立即调用一次。 */
      onResize(fn){const call=()=>fn(stage.clientWidth||frame.clientWidth||600);if('ResizeObserver' in window){const ro=new ResizeObserver(call);ro.observe(stage);inst.cleanups.push(()=>ro.disconnect())}else{addEventListener('resize',call);inst.cleanups.push(()=>removeEventListener('resize',call))}call()},
      remount:()=>inst.remount(),
    };
    this.ctx=ctx;
    live.add(this);
    try{const ret=spec.mount(ctx);if(ret&&typeof ret.destroy==='function')this.cleanups.push(ret.destroy)}
    catch(e){console.error('[SDLab]',spec.id,e);frame.append(h('div',{class:'sdl-error'},i18n('实验加载失败：')+(e&&e.message||e)))}
    this.updateTransport();
  }
}

function renderScenarios(inst,box,list){
  box.hidden=false;box.replaceChildren();
  const stepping=inst.spec.transport!==false;
  const controls=inst.ctx.controls;
  const chips=h('div',{class:'sdl-chips',role:'group','aria-label':i18n('预设场景')});
  const card=h('div',{class:'sdl-card',hidden:true});
  box.append(h('p',{class:'sdl-scen-label'},i18n(stepping?'预设场景：先预测，再逐步运行':'预设场景：先预测，再运行')),chips,card);
  const S=inst.scen={active:null,running:false,done:false,steps:0};
  const btns=list.map(sc=>{
    const b=h('button',{type:'button','aria-pressed':'false',title:i18n('展开这个场景；再点一次收起'),onclick:()=>S.active===sc?deselect():select(sc)},sc.label);
    chips.append(b);return b;
  });
  /* 场景自己设定策略和参数：选中场景时收起控件区、锁住放在舞台里的控件，
     免得手动选择与场景互相打架；收起场景后恢复，参数停在场景留下的值。 */
  inst.lockNote?.remove();
  const lockNote=inst.lockNote=h('div',{class:'sdl-lock',hidden:true},h('span',null,i18n('参数由预设场景设定')),h('button',{type:'button',onclick:()=>deselect()},i18n('收起场景，手动调整')));
  controls.before(lockNote);
  function lock(on){
    inst.frame.classList.toggle('sdl-scen-on',on);
    lockNote.hidden=!on||!controls.childElementCount;
    for(const el of inst.ctrlEls)if(!controls.contains(el)){el.inert=on;el.classList.toggle('sdl-locked',on)}
  }
  /** 收起场景卡、回到手动调整；正在运行的场景随之停止，实验保留当前状态。 */
  function deselect(){
    inst.abort();Object.assign(S,{active:null,running:false,done:false,steps:0});
    btns.forEach(b=>b.setAttribute('aria-pressed','false'));
    card.hidden=true;card.replaceChildren();delete card.dataset.state;lock(false);inst.updateTransport();
  }
  function select(sc){
    inst.abort();Object.assign(S,{active:sc,running:false,done:false,steps:0});
    btns.forEach((b,i)=>b.setAttribute('aria-pressed',String(list[i]===sc)));
    lock(true);
    const status=h('span',{class:'status'});
    const insight=S.insightEl=h('p',{class:'insight',hidden:true},h('b',null,i18n('观察：')),sc.insight||'');
    // 默认逐步：开始后停在第一步，由「下一步」推进；「自动播放」按当前倍速连续运行
    const stepBtn=stepping?h('button',{type:'button',class:'primary','data-act':'start',title:i18n('开始后停住，由底部「下一步」逐步推进')},i18n('逐步开始')):null;
    const playBtn=h('button',{type:'button',class:stepping?null:'primary','data-act':'play'},i18n(stepping?'自动播放':'运行场景'));
    card.replaceChildren();delete card.dataset.state;
    add(card,[sc.ask?h('p',{class:'ask'},h('b',null,i18n('先猜：')),sc.ask):null,sc.setup?h('p',null,sc.setup):null,h('div',{class:'row'},stepBtn,playBtn,status,h('button',{type:'button',class:'sdl-card-close',title:i18n('收起场景，回到手动调整'),onclick:deselect},i18n('收起'))),insight]);
    card.hidden=false;inst.updateTransport();
    async function start(mode){
      inst.abort();const token=inst.token;
      Object.assign(S,{running:true,done:false,steps:0});card.dataset.state='running';
      insight.hidden=true;status.textContent='';
      if(stepBtn)stepBtn.textContent=i18n('从头逐步');playBtn.textContent=i18n(stepping?'从头自动播放':'运行中…');
      if(!stepping)playBtn.disabled=true;
      inst.setMode(mode);inst.updateTransport();
      try{
        const p=sc.run();
        // 等场景脚本同步部分和紧随其后的微任务执行完、停在第一个等待点，再重画一次
        setTimeout(()=>{if(token===inst.token)inst.renderPass()},0);
        await p;
        if(token!==inst.token||S.active!==sc)return;
        Object.assign(S,{running:false,done:true});card.dataset.state='done';
        if(stepping)inst.setMode('pause');   // 定格在结束状态，方便对照「观察」
        insight.hidden=!sc.insight;
        inst.ctx.announce(i18n('场景完成：')+sc.label);
      }catch(e){if(e!==ABORT){console.error('[SDLab]',inst.spec.id,sc.id,e);status.textContent=i18n('运行出错，请重置后再试');card.dataset.state='error'}}
      finally{if(token===inst.token){S.running=false;if(!stepping){playBtn.disabled=false;playBtn.textContent=i18n('再运行一次')}inst.updateTransport()}}
    }
    /** 手机上场景卡和舞台隔得远：点了开始就把舞台滚进视野，边点「下一步」边看变化。 */
    function reveal(){const st=inst.ctx.stage;if(narrow.matches&&st.getBoundingClientRect().top>innerHeight*0.4)st.scrollIntoView({behavior:'smooth',block:'start'})}
    if(stepBtn)stepBtn.onclick=()=>{start('pause');reveal()};
    playBtn.onclick=()=>{start('play');reveal()};
    if(sc.autorun)start('play');
  }
}

/* ---------- 注册与挂载 ---------- */
function define(spec){
  if(!spec||!spec.id||typeof spec.mount!=='function')throw new Error('SDLab.define 需要 id 与 mount');
  if(specs.has(spec.id))console.warn('[SDLab] 重复定义',spec.id);
  specs.set(spec.id,spec);order.push(spec.id);
}
/* 按需加载：阅读页只内联「实验 ID → 脚本」清单（window.SDLAB_MANIFEST），切到某章时才加载该章脚本。 */
const loading=new Map();
let lastActivate=0;
function loadScript(src){
  if(!loading.has(src))loading.set(src,new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=src;el.onload=resolve;el.onerror=()=>{loading.delete(src);reject(new Error('无法加载 '+src))};document.head.append(el)}));
  return loading.get(src);
}
function mountEl(el){
  if(el.__sdlInst)return el.__sdlInst;
  const id=el.dataset.lab,spec=specs.get(id);
  if(!spec){
    const src=(window.SDLAB_MANIFEST||{})[id];
    if(!src){console.warn('[SDLab] 未找到实验',id);return null}
    if(!el.__sdlLoading)el.__sdlLoading=loadScript(src).then(()=>{if(specs.has(id)){mountEl(el);reanchor(el)}else console.warn('[SDLab] 脚本中没有实验',id,src)}).catch(e=>console.error('[SDLab]',e)).finally(()=>{el.__sdlLoading=null});
    return null;
  }
  const inst=new Instance(el,spec);el.__sdlInst=inst;return inst;
}
/** 异步挂载会撑高页面：刚切换章节且地址带章内锚点时，重新定位到锚点。 */
function reanchor(el){
  const art=el.closest('article');if(!art||art.hidden||performance.now()-lastActivate>2500)return;
  const [id,...parts]=decodeURIComponent(location.hash.slice(1)).split('/');if(id!==art.id||!parts.length)return;
  const t=document.getElementById(id+'-'+parts.join('/'));if(t)t.scrollIntoView();
}
function mountAll(root){return [...(root||document).querySelectorAll('.sd-lab[data-lab]')].map(mountEl).filter(Boolean)}

/* ---------- 自测练习：从第 29 章 DOM 读取题目与答案 ---------- */
let qCache=null;
function questions(){
  if(qCache)return qCache;
  const art=document.getElementById('d29');if(!art)return qCache=[];
  const re=/^d29-((?:q\d{2}|p\d{2}|r)-\d{2})$/;
  const anchors=[...art.querySelectorAll('a[id]')].filter(a=>re.test(a.id));
  const blocks=new Set(anchors.map(a=>topBlock(a,art)));
  qCache=anchors.map(a=>{
    const key=a.id.match(re)[1];const block=topBlock(a,art);
    let title=block.nextElementSibling;const nodes=[];
    let el=title&&title.tagName==='H3'?title.nextElementSibling:block.nextElementSibling;
    while(el&&el.tagName!=='H2'&&!blocks.has(el)&&!el.classList.contains('source')&&!el.classList.contains('sdp')){nodes.push(el);el=el.nextElementSibling}
    const text=(title&&title.tagName==='H3'?title.textContent:key).trim();
    const [qid,...rest]=text.split('｜');
    const kind=key[0];const chapter=kind==='r'?0:parseInt(key.slice(1,3),10);
    return {key,qid:rest.length?qid:key.toUpperCase(),title:rest.length?rest.join('｜'):text,chapter,kind,nodes};
  });
  return qCache;
}
function topBlock(node,art){let n=node;while(n.parentElement&&n.parentElement!==art)n=n.parentElement;return n}
function cloneAnswer(q){
  const box=document.createDocumentFragment();
  for(const n of q.nodes){const c=n.cloneNode(true);c.removeAttribute&&c.removeAttribute('id');c.querySelectorAll&&c.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));box.append(c)}
  box.querySelectorAll('img').forEach(img=>{img.tabIndex=0;img.addEventListener('click',()=>{const z=document.getElementById('zoom');if(!z||!z.showModal)return;z.querySelector('img').src=img.src;z.querySelector('img').alt=img.alt;const o=document.getElementById('original-image');if(o)o.href=img.src;z.showModal()})});
  return box;
}
const RATES=[['good','掌握'],['fuzzy','模糊'],['bad','不会']];
function rateButtons(q,onRate){
  const wrap=h('div',{class:'sdp-rate sdp-actions',role:'group','aria-label':'自评'},h('span',{class:'sdp-hint'},'自评：'));
  const bs=RATES.map(([v,l])=>h('button',{type:'button',class:v,'aria-pressed':String(store.q[q.key]===v),onclick:()=>{store.q[q.key]=store.q[q.key]===v?undefined:v;if(!store.q[q.key])delete store.q[q.key];save();bs.forEach((b,i)=>b.setAttribute('aria-pressed',String(store.q[q.key]===RATES[i][0])));onRate&&onRate(store.q[q.key]);refreshBadges()}},l));
  wrap.append(...bs);return wrap;
}
function draftBox(q){
  const ta=h('textarea',{class:'sdp-draft',placeholder:'先写下你的答案要点（只保存在本机浏览器）',value:store.draft[q.key]||''});
  ta.addEventListener('input',()=>{if(ta.value.trim())store.draft[q.key]=ta.value;else delete store.draft[q.key];save()});
  return ta;
}
function meter(list){const m=h('div',{class:'sdp-meter','aria-hidden':'true'});for(const q of list)m.append(h('i',{class:store.q[q.key]||''}));return m}
function chapterPractice(article,chapter){
  if(article.querySelector('.sdp'))return;
  const list=questions().filter(q=>q.chapter===chapter);
  if(!list.length)return;
  const sub=h('p',{class:'sdp-sub'});
  const mt=h('div');
  const update=()=>{const good=list.filter(q=>store.q[q.key]==='good').length;sub.textContent=`${list.length} 题 · 已掌握 ${good} · 先独立作答，再展开答案对照并自评`;mt.replaceChildren(meter(list))};
  const ul=h('ul',{class:'sdp-list'});
  for(const q of list){
    const ans=h('div',{class:'sdp-answer',hidden:true});let draft=null;
    const toggleAns=h('button',{type:'button',class:'primary',onclick:()=>{if(ans.hidden&&!ans.childNodes.length){ans.append(cloneAnswer(q),h('div',{class:'sdp-actions',style:{margin:'8px 0'}},rateButtons(q,update),h('a',{href:'#d29/'+q.key,class:'sdp-hint'},'在详解页打开')))}ans.hidden=!ans.hidden;toggleAns.textContent=ans.hidden?'看答案':'收起答案'}},'看答案');
    const writeBtn=h('button',{type:'button',onclick:()=>{if(!draft){draft=draftBox(q);item.insertBefore(draft,ans);draft.focus()}else{draft.remove();draft=null}}},'作答');
    const item=h('li',{class:'sdp-item'},h('div',{class:'sdp-q'},h('div',{class:'qt'},h('span',{class:'qid'},q.qid),q.title),h('div',{class:'sdp-actions'},writeBtn,toggleAns)),ans);
    if(store.draft[q.key]){draft=draftBox(q);item.insertBefore(draft,ans)}
    ul.append(item);
  }
  const panel=h('section',{class:'sdp','aria-label':'本章自测练习'},h('div',{class:'sdp-head'},h('div',null,h('p',{class:'sdp-title'},'本章自测练习'),sub),mt),ul);
  update();
  const src=article.querySelector('p.source');article.insertBefore(panel,src||null);
}
function reviewMode(article){
  if(article.querySelector('.sdp'))return;
  const all=questions();if(!all.length)return;
  const chapters=[...new Set(all.map(q=>q.chapter))].sort((a,b)=>a-b);
  let chap='all',filter='todo',idx=0,list=[];
  const sel=h('select',{'aria-label':'选择章节'},h('option',{value:'all'},'全部章节'),chapters.map(c=>h('option',{value:String(c)},c?`第 ${c} 章`:'通用复盘')));
  const FILTERS=[['todo','未掌握'],['unrated','未自评'],['bad','不会'],['fuzzy','模糊'],['good','已掌握'],['all','全部']];
  const chipBtns=FILTERS.map(([v,l])=>h('button',{type:'button','aria-pressed':String(v===filter),onclick:()=>{filter=v;chipBtns.forEach((b,i)=>b.setAttribute('aria-pressed',String(FILTERS[i][0]===v)));rebuild()}},l));
  const counts=h('div',{class:'sdp-counts'});
  const card=h('div');
  sel.addEventListener('change',()=>{chap=sel.value;rebuild()});
  function pass(q){const r=store.q[q.key];return filter==='all'||(filter==='todo'&&r!=='good')||(filter==='unrated'&&!r)||r===filter}
  function rebuild(){list=all.filter(q=>(chap==='all'||String(q.chapter)===chap)&&pass(q));idx=0;draw()}
  function drawCounts(){const c={good:0,fuzzy:0,bad:0};for(const q of all)if(store.q[q.key])c[store.q[q.key]]++;counts.replaceChildren(h('span',null,'共 ',h('b',null,all.length),' 题'),h('span',null,'掌握 ',h('b',null,c.good)),h('span',null,'模糊 ',h('b',null,c.fuzzy)),h('span',null,'不会 ',h('b',null,c.bad)),h('span',null,'未自评 ',h('b',null,all.length-c.good-c.fuzzy-c.bad)))}
  function draw(){
    drawCounts();
    if(!list.length){card.replaceChildren(h('p',{class:'sdp-empty'},filter==='todo'?'这个范围内的题都已标为掌握。可以切到「全部」再过一遍。':'这个范围内没有题目。'));return}
    idx=(idx+list.length)%list.length;const q=list[idx];
    const ans=h('div',{class:'sdp-answer',hidden:true});
    const show=h('button',{type:'button',class:'primary',onclick:()=>{if(!ans.childNodes.length)ans.append(cloneAnswer(q));ans.hidden=false;show.hidden=true;rate.hidden=false}},'看答案');
    const rate=h('div',{hidden:true,style:{marginTop:'10px'}},rateButtons(q,()=>{drawCounts()}));
    const nav=h('div',{class:'sdp-actions',style:{marginTop:'12px'}},
      h('button',{type:'button',onclick:()=>{idx--;draw()}},'上一题'),
      h('button',{type:'button',onclick:()=>{idx++;draw()}},'下一题'),
      h('a',{class:'sdp-hint',href:'#d29/'+q.key},'定位到详解'),
      q.chapter?h('a',{class:'sdp-hint',href:'#d'+q.chapter},'回到第 '+q.chapter+' 章'):null);
    card.replaceChildren(h('div',{class:'sdp-card'},h('div',{class:'pos'},`第 ${idx+1} / ${list.length} 题 · ${q.qid}`),h('div',{class:'big'},q.title),draftBox(q),h('div',{class:'sdp-actions',style:{marginTop:'8px'}},show),ans,rate,nav));
  }
  const panel=h('section',{class:'sdp','aria-label':'练习模式'},
    h('div',{class:'sdp-head'},h('div',null,h('p',{class:'sdp-title'},'练习模式'),h('p',{class:'sdp-sub'},'按章节或掌握程度筛题：先作答，再看答案，最后自评。自评与草稿只保存在本机浏览器。'))),
    h('div',{class:'sdp-bar'},sel,h('div',{class:'chips',role:'group','aria-label':'按掌握程度筛选'},chipBtns),counts),card);
  const firstH2=article.querySelector(':scope > h2');
  article.insertBefore(panel,firstH2||article.firstElementChild?.nextElementSibling||null);
  rebuild();
}

/* ---------- 目录徽标 ---------- */
function badge(docId){
  const m=/^d(\d+)$/.exec(docId||'');if(!m)return null;const n=+m[1];
  const art=document.getElementById(docId);if(!art)return null;
  const labsN=art.querySelectorAll('.sd-lab[data-lab]').length;
  let qs=[];
  if(n>=1&&n<=28)qs=questions().filter(q=>q.chapter===n);
  else if(docId==='d29')qs=questions();
  if(!labsN&&!qs.length)return null;
  const good=qs.filter(q=>store.q[q.key]==='good').length;
  const b=h('span',{class:'sdl-badge'});
  if(labsN)b.append(h('span',null,`实验 ${labsN}`));
  if(labsN&&qs.length)b.append(' · ');
  if(qs.length)b.append(h('span',{class:good?'on':null},`自测 ${good}/${qs.length}`));
  return b;
}
let refreshTimer=0;
function refreshBadges(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{for(const a of document.querySelectorAll('nav a[href^="#d"]')){const id=a.getAttribute('href').slice(1);if(id.includes('/'))continue;a.querySelector('.sdl-badge')?.remove();const b=badge(id);if(b)a.append(b)}},50)}

/** 阅读页切换章节后调用：挂载实验、插入练习卡。 */
function activate(article){
  if(!article)return;
  lastActivate=performance.now();
  mountAll(article);
  const m=/^d(\d+)$/.exec(article.id||'');
  if(m){const n=+m[1];if(n>=1&&n<=28)chapterPractice(article,n);else if(n===29)reviewMode(article)}
}

window.SDLab={lang:LANG,t:i18n,define,mountAll,mountEl,activate,badge,refreshBadges,questions,colors,util,el:h,svgEl:s,
  /** ctx.wait 被重置/切换场景中断时抛出的信号；自己 catch 异步流程时用它区分真正的错误。 */
  isAbort:e=>e===ABORT,
  get specs(){return order.map(id=>specs.get(id))},progress:()=>JSON.parse(JSON.stringify(store))};
})();
