// 节点君 Nodey —— 「架构多巴胺」的吉祥物：一台圆角方块小服务器。
// 纯 ES Module、零依赖：SVG 由 JS 生成并内联注入，动画全部走 CSS keyframes（首次使用时注入一次 <style>）
// 与 Web Animations API。顶层不访问 document/window，可在 Node 中 import 并测试纯逻辑。
//
// 用法：
//   const m = createMascot(el, { skin: 'sakura', stage: 3 });
//   m.setMood('cheer'); m.say('连对 5 题！'); m.lookAt(x, y); m.setMotion(1);

export const INK = '#14123a';
export const ACCENTS = ['#ff5d8f', '#ffb02e', '#3ddc97', '#a78bfa'];

export const MOODS = ['idle', 'happy', 'cheer', 'wow', 'oops', 'think', 'sleep', 'dance'];
export const MAX_STAGE = 8;

// 阶段装饰：第 n 级启用前 n 项（单调叠加）
export const DECORATIONS = ['antenna', 'lights', 'headphones', 'blush', 'shades', 'cape', 'crown', 'aura'];

export const SKINS = [
  { id: 'default', nameZh: '青蓝', nameEn: 'Azure' },
  { id: 'sakura', nameZh: '樱花粉', nameEn: 'Sakura' },
  { id: 'matcha', nameZh: '抹茶绿', nameEn: 'Matcha' },
  { id: 'sunset', nameZh: '日落橙', nameEn: 'Sunset' },
  { id: 'violet', nameZh: '葡萄紫', nameEn: 'Violet' },
  { id: 'gold', nameZh: '流金', nameEn: 'Gold' },
];

const SKIN_PALETTE = {
  default: { main: '#4cc9f0', light: '#a5ecff', shade: '#2aa3cc' },
  sakura: { main: '#ff9ec4', light: '#ffd3e5', shade: '#ee6fa0' },
  matcha: { main: '#8fd694', light: '#cef3cc', shade: '#5cb468' },
  sunset: { main: '#ffa94d', light: '#ffd49c', shade: '#f08024' },
  violet: { main: '#b197fc', light: '#ddd0ff', shade: '#8466e0' },
  gold: { main: '#ffd43b', light: '#ffed9c', shade: '#f0a818' },
};

const REPLAY_MOODS = new Set(['happy', 'cheer', 'wow', 'oops']);
const OOPS_RECOVER_MS = 1800;

// ---------------------------------------------------------------- 纯逻辑

export function clampStage(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(MAX_STAGE, v));
}

export function decorationsForStage(stage) {
  return DECORATIONS.slice(0, clampStage(stage));
}

export function validMood(m) {
  return typeof m === 'string' && MOODS.includes(m);
}

export function skinColors(id) {
  const p = SKIN_PALETTE[id] || SKIN_PALETTE.default;
  return { ...p, screen: '#f4fbff', stroke: INK, accents: [...ACCENTS] };
}

export function clampMotion(level) {
  const v = Math.round(Number(level));
  if (!Number.isFinite(v)) return 2;
  return Math.max(0, Math.min(2, v));
}

/** 亮着的指示灯数量（共 5 盏）：0 阶 2 盏，2 阶起 4 盏，6 阶起全亮 */
export function litLampsForStage(stage) {
  const s = clampStage(stage);
  return s >= 6 ? 5 : s >= 2 ? 4 : 2;
}

/** 瞳孔偏移：dx,dy 为目标相对眼睛的屏幕向量；max 为最大偏移（SVG 单位），range 为达到最大偏移的距离 */
export function lookOffset(dx, dy, max = 4.5, range = 160) {
  const d = Math.hypot(dx, dy);
  if (!Number.isFinite(d) || d < 1e-6) return { x: 0, y: 0 };
  const k = Math.min(1, d / range);
  return { x: (dx / d) * max * k, y: (dy / d) * max * k };
}

/** 手臂默认朝下，返回使其指向 (dx,dy) 的 CSS rotate 角度（度） */
export function pointAngle(dx, dy) {
  return (Math.atan2(-dx, dy) * 180) / Math.PI;
}

// ---------------------------------------------------------------- SVG

// viewBox：左上 (-14,-24)，228 x 250.8（= 1 : 1.1）
const VB = { x: -14, y: -24, w: 228, h: 250.8 };
const SHOULDER_L = { x: 30, y: 120 };
const SHOULDER_R = { x: 170, y: 120 };

function star(cx, cy, k = 1) {
  return `<path transform="translate(${cx} ${cy}) scale(${k})" d="M0 -10 Q1.6 -1.6 10 0 Q1.6 1.6 0 10 Q-1.6 1.6 -10 0 Q-1.6 -1.6 0 -10Z" fill="#ffd43b" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`;
}

function eye(cx, cy, side) {
  return `<g class="eye ${side}">
  <g class="gz ${side}"><g class="eo ${side}">
    <ellipse cx="${cx}" cy="${cy}" rx="9.5" ry="12" fill="${INK}"/>
    <circle cx="${cx + 3}" cy="${cy - 4.6}" r="3.9" fill="#fff"/>
    <circle cx="${cx - 3.3}" cy="${cy + 4.6}" r="1.8" fill="#fff"/>
  </g></g>
  <path class="eh ln" d="M${cx - 10} ${cy + 4} Q${cx} ${cy - 12} ${cx + 10} ${cy + 4}"/>
  <path class="ec ln" d="M${cx - 10} ${cy - 1} Q${cx} ${cy + 9} ${cx + 10} ${cy - 1}"/>
</g>`;
}

function arm(side, s) {
  const dir = side === 'L' ? 'armL' : 'armR';
  return `<g class="arm ${dir}">
  <line x1="${s.x}" y1="${s.y}" x2="${s.x}" y2="${s.y + 36}" stroke="${INK}" stroke-width="16" stroke-linecap="round"/>
  <line x1="${s.x}" y1="${s.y}" x2="${s.x}" y2="${s.y + 36}" class="s-main" stroke-width="8" stroke-linecap="round"/>
  <circle cx="${s.x}" cy="${s.y + 38}" r="10" fill="#fff" stroke="${INK}" stroke-width="4.6"/>
</g>`;
}

function markup() {
  const lampX = [64, 82, 100, 118, 136];
  const lampC = [ACCENTS[0], ACCENTS[1], ACCENTS[2], ACCENTS[3], ACCENTS[0]];
  const lamps = lampX
    .map((x, i) => `<circle class="lamp" style="--c:${lampC[i]};--i:${i}" cx="${x}" cy="164" r="4.4"/>`)
    .join('');

  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return `<line x1="${(100 + c * 16).toFixed(1)}" y1="${(18 + s * 16).toFixed(1)}" x2="${(100 + c * 23).toFixed(1)}" y2="${(18 + s * 23).toFixed(1)}"/>`;
  }).join('');

  const orbit = [0, 120, 240]
    .map((deg, i) => {
      const a = (deg * Math.PI) / 180;
      return `<circle cx="${(100 + Math.cos(a) * 19).toFixed(1)}" cy="${(18 + Math.sin(a) * 19).toFixed(1)}" r="3.2" fill="${ACCENTS[(i + 1) % 4]}" stroke="${INK}" stroke-width="1.8"/>`;
    })
    .join('');

  const zz = (x, y, k, i) =>
    `<g class="zz" style="--i:${i}"><path d="M${x} ${y} h${10 * k} l${-10 * k} ${12 * k} h${10 * k}" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M${x} ${y} h${10 * k} l${-10 * k} ${12 * k} h${10 * k}" fill="none" stroke="#a78bfa" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>`;

  return `<svg viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
${charMarkup(lamps, rays, orbit, zz)}
</svg>`;
}

function charMarkup(lamps, rays, orbit, zz) {
  return `
<g class="dc dc-aura">
  <circle cx="100" cy="116" r="106" fill="#ffd43b" opacity=".16"/>
  <circle cx="100" cy="116" r="94" fill="#ffd43b" opacity=".22"/>
  <circle cx="100" cy="116" r="82" fill="#ffd43b" opacity=".32"/>
</g>
<ellipse class="shadow" cx="100" cy="208" rx="52" ry="6" fill="${INK}" opacity=".16"/>
<g class="bn"><g class="fx"><g class="bob">
  <path class="dc dc-cape cape" d="M40 76 Q4 150 18 196 Q40 186 62 201 Q82 189 100 201 Q120 189 140 201 Q160 186 182 196 Q196 150 160 76 Z" fill="${ACCENTS[0]}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path class="dc dc-hp" d="M25 94 C21 18 179 18 175 94" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
  <path class="dc dc-hp" d="M25 94 C21 18 179 18 175 94" fill="none" stroke="${ACCENTS[3]}" stroke-width="4.4" stroke-linecap="round"/>

  <g class="antenna">
    <circle class="bglow" cx="100" cy="18" r="20" fill="${ACCENTS[0]}"/>
    <line x1="100" y1="52" x2="100" y2="26" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>
    <line x1="100" y1="52" x2="100" y2="26" class="s-light" stroke-width="3.4" stroke-linecap="round"/>
    <g class="rays" stroke="#ffb02e" stroke-width="3.4" stroke-linecap="round">${rays}</g>
    <circle class="bulb" cx="100" cy="18" r="11" fill="${ACCENTS[0]}" stroke="${INK}" stroke-width="5"/>
    <circle cx="96.5" cy="14.5" r="3" fill="#fff" opacity=".85"/>
    <g class="orbit">${orbit}</g>
  </g>

  <rect class="foot L" x="60" y="176" width="30" height="26" rx="12" stroke="${INK}" stroke-width="6"/>
  <rect class="foot R" x="110" y="176" width="30" height="26" rx="12" stroke="${INK}" stroke-width="6"/>

  <rect class="f-main" x="30" y="50" width="140" height="132" rx="36"/>
  <path class="f-shade" d="M30 146 H170 A36 36 0 0 1 134 182 H66 A36 36 0 0 1 30 146Z"/>
  <path d="M40 90 A26 26 0 0 1 66 62" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/>
  <rect x="30" y="50" width="140" height="132" rx="36" fill="none" stroke="${INK}" stroke-width="6"/>

  <rect class="f-screen" x="50" y="64" width="100" height="84" rx="24" stroke="${INK}" stroke-width="4.6"/>
  <rect x="52" y="155" width="96" height="18" rx="9" fill="${INK}" opacity=".26"/>
  ${lamps}

  <g class="brow ln"><path d="M67 88 L89 82"/><path d="M133 88 L111 82"/></g>
  ${eye(78, 102, 'L')}
  ${eye(122, 102, 'R')}
  <ellipse class="cheek" cx="62" cy="124" rx="8.5" ry="5.2" fill="${ACCENTS[0]}"/>
  <ellipse class="cheek" cx="138" cy="124" rx="8.5" ry="5.2" fill="${ACCENTS[0]}"/>

  <path class="mS ln" d="M91 123 Q100 134 109 123"/>
  <g class="mG"><path d="M87 119 Q100 143 113 119 Z" fill="${INK}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><ellipse cx="100" cy="128.4" rx="6.4" ry="3.2" fill="${ACCENTS[0]}"/></g>
  <g class="mO"><path d="M84 117 Q100 152 116 117 Z" fill="${INK}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><ellipse cx="100" cy="132" rx="8.6" ry="4.2" fill="${ACCENTS[0]}"/></g>
  <g class="mW"><ellipse cx="100" cy="129" rx="8.4" ry="10.4" fill="${INK}"/><ellipse cx="100" cy="134" rx="4.6" ry="3.4" fill="${ACCENTS[0]}"/></g>
  <path class="mY ln" d="M89 128 Q94.5 120 100 127 T111 126"/>
  <path class="mT ln" d="M94 127 Q101 124 109 126.5"/>
  <ellipse class="mZ" cx="100" cy="128" rx="4.6" ry="3.6" fill="${INK}"/>

  <g class="dc dc-shades">
    <rect x="56" y="69" width="38" height="16" rx="7" fill="${INK}"/>
    <rect x="106" y="69" width="38" height="16" rx="7" fill="${INK}"/>
    <path d="M94 75 H106" stroke="${INK}" stroke-width="4.4"/>
    <path d="M62 74 h9 M112 74 h9" stroke="#8be3fb" stroke-width="2.8" stroke-linecap="round"/>
  </g>

  <g class="dc dc-hp">
    <rect x="12" y="78" width="24" height="38" rx="11" fill="${ACCENTS[3]}" stroke="${INK}" stroke-width="5"/>
    <rect x="164" y="78" width="24" height="38" rx="11" fill="${ACCENTS[3]}" stroke="${INK}" stroke-width="5"/>
    <path d="M19 90 v14 M181 90 v14" stroke="#fff" stroke-opacity=".7" stroke-width="3.4" stroke-linecap="round"/>
  </g>
  <g class="dc dc-cape">
    <circle cx="45" cy="73" r="5.2" fill="#ffd43b" stroke="${INK}" stroke-width="3"/>
    <circle cx="155" cy="73" r="5.2" fill="#ffd43b" stroke="${INK}" stroke-width="3"/>
  </g>
  <g class="dc dc-crown"><g transform="translate(64 53) rotate(-14) scale(1.4)">
    <path d="M-18 0 L-19 -17 L-9 -9 L0 -23 L9 -9 L19 -17 L18 0 Z" fill="#ffd43b" stroke="${INK}" stroke-width="4.4" stroke-linejoin="round"/>
    <circle cx="0" cy="-7" r="3" fill="${ACCENTS[0]}" stroke="${INK}" stroke-width="1.8"/>
  </g></g>

  ${arm('L', SHOULDER_L)}
  ${arm('R', SHOULDER_R)}

  <g class="sweat"><path transform="translate(162 80)" d="M0 -10 C5 -3 8 1 8 5 A8 8 0 0 1 -8 5 C-8 1 -5 -3 0 -10Z" fill="#bfefff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/></g>
  <g class="wowl ln" style="stroke:#ffb02e"><path d="M30 40 L22 29 M20 52 L8 47 M42 33 L40 20 M170 40 L178 29 M180 52 L192 47 M158 33 L160 20"/></g>
  ${zz(142, 40, 0.8, 0)}${zz(156, 26, 1, 1)}${zz(170, 8, 1.2, 2)}
</g></g></g>
<g class="dc dc-aura stars">${[25, 115, 205, 295].map((d, i) => { const a = (d * Math.PI) / 180; return star((100 + Math.cos(a) * 102).toFixed(1), (116 + Math.sin(a) * 102).toFixed(1), i % 2 ? 1.2 : 1.7); }).join('')}</g>`;
}

/** 生成可独立使用的静态 SVG 字符串（用于 favicon / 分享图），无动画 */
export function renderStaticSvg({ mood = 'happy', stage = 0, skin = 'default', crop = true } = {}) {
  const m = validMood(mood) ? mood : 'idle';
  const st = clampStage(stage);
  const c = skinColors(skin);
  const lampsN = litLampsForStage(st);
  const lampX = [64, 82, 100, 118, 136];
  const lampC = [ACCENTS[0], ACCENTS[1], ACCENTS[2], ACCENTS[3], ACCENTS[0]];
  const lamps = lampX
    .map((x, i) => `<circle class="lamp${i < lampsN ? ' on' : ''}" style="--c:${lampC[i]};--i:${i}" cx="${x}" cy="164" r="4.4"/>`)
    .join('');
  const empty = () => '';
  const body = charMarkup(lamps, '', '', empty).replace(/<g class="orbit">[\s\S]*?<\/g>/, '');
  const cls = ['nd', 'm0', 'mood-' + m, 'st-' + st, ...decorationsForStage(st).map((d) => 'has-' + d)].join(' ');
  const vars = `--nd-main:${c.main};--nd-light:${c.light};--nd-shade:${c.shade};--nd-screen:${c.screen};--nd-ink:${INK}`;
  const vb = crop ? '-12 -8 224 224' : `${VB.x} ${VB.y} ${VB.w} ${VB.h}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="224" height="224">
<title>节点君 Nodey</title>
<style>${CHAR_CSS}</style>
<g class="${cls}" style="${vars}">${body}</g>
</svg>
`;
}

// ---------------------------------------------------------------- CSS

const CHAR_CSS = `
.nd{--nd-ink:#14123a;--nd-main:#4cc9f0;--nd-light:#a5ecff;--nd-shade:#2aa3cc;--nd-screen:#f4fbff}
.nd .f-main{fill:var(--nd-main)}.nd .f-shade{fill:var(--nd-shade)}.nd .f-screen{fill:var(--nd-screen)}
.nd .foot{fill:var(--nd-shade)}
.nd .s-main{stroke:var(--nd-main)}.nd .s-light{stroke:var(--nd-light)}
.nd .ln{fill:none;stroke:${INK};stroke-width:5;stroke-linecap:round;stroke-linejoin:round}
.nd .brow{stroke-width:4.6}
.nd .lamp{fill:${INK};opacity:.34}.nd .lamp.on{fill:var(--c);opacity:1}
.nd .dc,.nd .eh,.nd .ec,.nd .mG,.nd .mO,.nd .mW,.nd .mY,.nd .mT,.nd .mZ,.nd .brow,.nd .sweat,.nd .zz,.nd .orbit,.nd .rays,.nd .wowl{display:none}
.nd.has-aura .dc-aura,.nd.has-headphones .dc-hp,.nd.has-shades .dc-shades,.nd.has-cape .dc-cape,.nd.has-crown .dc-crown{display:inline}
.nd .arm,.nd .gz,.nd .eo,.nd .bn,.nd .fx,.nd .bob,.nd .stars,.nd .cape,.nd .orbit,.nd .bglow,.nd .rays,.nd .zz,.nd .sweat,.nd .wowl,.nd .foot{transform-box:view-box}
.nd .zz,.nd .sweat,.nd .wowl{transform-box:fill-box;transform-origin:center}
.nd .bn,.nd .fx{transform-origin:100px 202px}
.nd .bob{transform-origin:100px 190px}
.nd .stars{transform-origin:100px 116px}
.nd .cape{transform-origin:100px 76px}
.nd .orbit,.nd .bglow,.nd .rays{transform-origin:100px 18px}
.nd .eo.L,.nd .gz.L{transform-origin:78px 102px}
.nd .eo.R,.nd .gz.R{transform-origin:122px 102px}
.nd .gz{transform:translate(calc(var(--lx,0px) + var(--gx,0px)),calc(var(--ly,0px) + var(--gy,0px))) scale(var(--gs,1))}
.nd .armL{transform-origin:30px 120px;transform:rotate(16deg)}
.nd .armR{transform-origin:170px 120px;transform:rotate(-16deg)}
.nd .cheek{opacity:0}
.nd.has-blush .cheek{opacity:.72}
.nd.mood-happy .cheek,.nd.mood-cheer .cheek,.nd.mood-dance .cheek,.nd.mood-oops .cheek,.nd.mood-wow .cheek{opacity:.5}
.nd .bglow{opacity:.1}
.nd.has-antenna .bglow{opacity:.5}
.nd.has-antenna .bulb{stroke-width:5.6}

/* 表情：纯显示切换 */
.nd.mood-happy .eo,.nd.mood-cheer .eo,.nd.mood-dance .eo,.nd.mood-sleep .eo{display:none}
.nd.mood-happy .eh,.nd.mood-cheer .eh,.nd.mood-dance .eh{display:inline}
.nd.mood-sleep .ec{display:inline}
.nd:not(.mood-idle) .mS{display:none}
.nd.mood-happy .mG,.nd.mood-dance .mG,.nd.mood-cheer .mO,.nd.mood-wow .mW,.nd.mood-oops .mY,.nd.mood-think .mT,.nd.mood-sleep .mZ{display:inline}
.nd.mood-oops .brow,.nd.mood-oops .sweat,.nd.mood-think .orbit,.nd.mood-cheer .rays,.nd.mood-wow .wowl,.nd.mood-sleep .zz{display:inline}
.nd.has-shades .brow{display:none}
.nd.mood-wow{--gs:1.22}
.nd.mood-oops{--gs:.9;--gx:-1.5px;--gy:2px}
.nd.mood-think{--gx:2.5px;--gy:-5px}
.nd.mood-think .fx{transform:rotate(2deg)}
.nd.mood-happy .armL{transform:rotate(38deg)}.nd.mood-happy .armR{transform:rotate(-38deg)}
.nd.mood-cheer .armL{transform:rotate(160deg)}.nd.mood-cheer .armR{transform:rotate(-160deg)}
.nd.mood-wow .armL{transform:rotate(62deg)}.nd.mood-wow .armR{transform:rotate(-62deg)}
.nd.mood-oops .armL{transform:rotate(138deg)}
.nd.mood-think .armR{transform:rotate(36deg)}
.nd.mood-sleep .armL{transform:rotate(8deg)}.nd.mood-sleep .armR{transform:rotate(-8deg)}
.nd.mood-dance .armL{transform:rotate(130deg)}.nd.mood-dance .armR{transform:rotate(-40deg)}
.nd .zz{opacity:.95}
.nd .arm.pt{transform:rotate(var(--pt,0deg)) !important;animation:none !important}

/* 弱：眨眼 + 呼吸 */
.nd.m1 .eo,.nd.m2 .eo{animation:nd-blink 4.6s infinite}
.nd.m1 .eo.R,.nd.m2 .eo.R{animation-delay:0s}
.nd.m1 .bob,.nd.m2 .bob{animation:nd-breathe 3.4s ease-in-out infinite}
.nd.m1.mood-sleep .bob,.nd.m2.mood-sleep .bob{animation-duration:5s}
@keyframes nd-blink{0%,93%,100%{transform:scaleY(1)}96.5%{transform:scaleY(.1)}}
@keyframes nd-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.014,.985)}}

/* 标准：其余动画 */
.nd.m2 .arm,.nd.m2 .fx{transition:transform .28s cubic-bezier(.3,1.35,.5,1)}
.nd.m2.has-antenna .bglow{animation:nd-glow 2.2s ease-in-out infinite}
.nd.m2.has-cape .cape{animation:nd-cape 1.8s ease-in-out infinite alternate}
.nd.m2.has-aura .stars{animation:nd-spin 14s linear infinite}
.nd.m2.mood-happy .fx{animation:nd-hop .55s ease-out 2}
.nd.m2.mood-cheer .fx{animation:nd-hop .5s ease-out 3}
.nd.m2.mood-cheer .armL{animation:nd-cheerL .32s ease-in-out infinite alternate}
.nd.m2.mood-cheer .armR{animation:nd-cheerR .32s ease-in-out infinite alternate}
.nd.m2.mood-cheer .bglow{opacity:.85;animation:nd-flash .24s ease-in-out infinite alternate}
.nd.m2.mood-cheer .bulb{animation:nd-bulb 1s steps(1) infinite}
.nd.m2.mood-cheer .rays{animation:nd-rays .24s ease-in-out infinite alternate}
.nd.m2.mood-wow .fx{animation:nd-pop .8s cubic-bezier(.2,1.5,.4,1) 1}
.nd.m2.mood-wow .wowl{animation:nd-burst .5s ease-out 1}
.nd.m2.mood-oops .fx{animation:nd-wobble .7s ease-in-out 1}
.nd.m2.mood-oops .sweat{animation:nd-drip 1.3s ease-in 1 both}
.nd.m2.mood-oops .armL{animation:nd-scratch .3s ease-in-out 5 alternate}
.nd.m2.mood-think .orbit{animation:nd-spin 1.1s linear infinite}
.nd.m2.mood-sleep .zz{animation:nd-z 2.7s ease-in-out infinite;animation-delay:calc(var(--i) * .9s)}
.nd.m2.mood-dance .fx{animation:nd-sway .72s ease-in-out infinite alternate}
.nd.m2.mood-dance .armL{animation:nd-danceL .72s ease-in-out infinite alternate}
.nd.m2.mood-dance .armR{animation:nd-danceR .72s ease-in-out infinite alternate}
.nd.m2.mood-dance .foot.L{animation:nd-step .36s ease-in-out infinite alternate}
.nd.m2.mood-dance .foot.R{animation:nd-step .36s ease-in-out infinite alternate-reverse}
.nd.m2.mood-dance .lamp{animation:nd-lamp .36s steps(1) infinite;animation-delay:calc(var(--i) * -.07s)}
.nd.m2.mood-cheer .lamp{animation:nd-lamp .3s steps(1) infinite;animation-delay:calc(var(--i) * -.06s)}
@keyframes nd-hop{0%{transform:translateY(0) scale(1,1)}22%{transform:translateY(-13px) scale(.97,1.04)}48%{transform:translateY(0) scale(1.05,.94)}68%{transform:translateY(-4px) scale(1,1)}100%{transform:translateY(0) scale(1,1)}}
@keyframes nd-pop{0%{transform:scale(1)}35%{transform:scale(1.2,1.16)}60%{transform:scale(.95,.97)}80%{transform:scale(1.03)}100%{transform:scale(1)}}
@keyframes nd-wobble{0%,100%{transform:rotate(0)}18%{transform:rotate(-5deg)}40%{transform:rotate(4deg)}60%{transform:rotate(-2.5deg)}80%{transform:rotate(1.2deg)}}
@keyframes nd-sway{0%{transform:translateX(-4px) rotate(-6deg)}100%{transform:translateX(4px) rotate(6deg)}}
@keyframes nd-step{0%{transform:translateY(0)}100%{transform:translateY(-5px)}}
@keyframes nd-cheerL{0%{transform:rotate(148deg)}100%{transform:rotate(174deg)}}
@keyframes nd-cheerR{0%{transform:rotate(-148deg)}100%{transform:rotate(-174deg)}}
@keyframes nd-danceL{0%{transform:rotate(30deg)}100%{transform:rotate(150deg)}}
@keyframes nd-danceR{0%{transform:rotate(-150deg)}100%{transform:rotate(-30deg)}}
@keyframes nd-scratch{0%{transform:rotate(126deg)}100%{transform:rotate(148deg)}}
@keyframes nd-spin{to{transform:rotate(360deg)}}
@keyframes nd-glow{0%,100%{opacity:.34;transform:scale(1)}50%{opacity:.7;transform:scale(1.25)}}
@keyframes nd-flash{0%{opacity:.3;transform:scale(1)}100%{opacity:.95;transform:scale(1.6)}}
@keyframes nd-rays{0%{opacity:.35;transform:scale(.9)}100%{opacity:1;transform:scale(1.18)}}
@keyframes nd-bulb{0%{fill:${ACCENTS[0]}}25%{fill:${ACCENTS[1]}}50%{fill:${ACCENTS[2]}}75%{fill:${ACCENTS[3]}}}
@keyframes nd-lamp{0%{fill:var(--c);opacity:1}50%{fill:${INK};opacity:.34}}
@keyframes nd-cape{0%{transform:skewX(-3deg) scaleY(1)}100%{transform:skewX(3deg) scaleY(1.03)}}
@keyframes nd-burst{0%{opacity:0;transform:scale(.4)}40%{opacity:1}100%{opacity:1;transform:scale(1)}}
@keyframes nd-drip{0%{opacity:0;transform:translateY(-4px) scale(.6)}20%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:1;transform:translateY(9px) scale(1)}}
@keyframes nd-z{0%{opacity:0;transform:translate(-3px,6px) scale(.6)}25%{opacity:1}100%{opacity:0;transform:translate(8px,-12px) scale(1.15)}}
`;

const BOX_CSS = `
.nd-box{position:relative;display:block;width:100%;aspect-ratio:1/1.1;container-type:inline-size;line-height:0;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.nd-box>svg{width:100%;height:100%;display:block;overflow:visible}
.nd-box .say{position:absolute;left:50%;top:0;width:max-content;max-width:94%;box-sizing:border-box;transform:translateX(-50%) scale(.85);transform-origin:50% 100%;padding:.3em .7em;background:#fff;color:${INK};border:2.5px solid ${INK};border-radius:.9em;font:800 clamp(9px,7.5cqw,16px)/1.25 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;text-align:center;opacity:0;visibility:hidden;pointer-events:none;z-index:2}
.nd-box .say>span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;word-break:break-word}
.nd-box .say::after{content:"";position:absolute;left:50%;bottom:-.4em;width:.55em;height:.55em;margin-left:-.28em;background:#fff;border-right:2.5px solid ${INK};border-bottom:2.5px solid ${INK};transform:rotate(45deg)}
.nd-box .say.on{opacity:1;visibility:visible;transform:translateX(-50%) scale(1)}
.nd-box.m2 .say{transition:opacity .16s,transform .24s cubic-bezier(.3,1.6,.5,1),visibility 0s .2s}
.nd-box.m2 .say.on{transition:opacity .16s,transform .24s cubic-bezier(.3,1.6,.5,1),visibility 0s 0s}
`;

let styleReady = false;
function ensureStyle() {
  if (styleReady && document.getElementById('nd-mascot-style')) return;
  if (!document.getElementById('nd-mascot-style')) {
    const st = document.createElement('style');
    st.id = 'nd-mascot-style';
    st.textContent = BOX_CSS + CHAR_CSS;
    document.head.appendChild(st);
  }
  styleReady = true;
}

// ---------------------------------------------------------------- 组件

export function createMascot(container, opts = {}) {
  if (!container || typeof document === 'undefined') throw new Error('createMascot: 需要浏览器环境与容器元素');
  ensureStyle();

  const root = document.createElement('div');
  root.className = 'nd nd-box';
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', opts.label || '节点君');
  root.innerHTML = markup() + '<div class="say" aria-live="polite"><span></span></div>';
  container.appendChild(root);

  const $ = (s) => root.querySelector(s);
  const svg = $('svg');
  const bn = $('.bn');
  const eyes = [...root.querySelectorAll('.eo')];
  const lamps = [...root.querySelectorAll('.lamp')];
  const arms = { L: $('.armL'), R: $('.armR') };
  const sayBox = $('.say');
  const sayTxt = $('.say > span');

  let mood = 'idle';
  let stage = 0;
  let skin = 'default';
  let motion = 2;
  let pointing = null;
  let recoverT = 0;
  let sayT = 0;
  let destroyed = false;

  function setMotion(level) {
    motion = clampMotion(level);
    root.classList.remove('m0', 'm1', 'm2');
    root.classList.add('m' + motion);
    return motion;
  }

  function setMood(next) {
    if (destroyed) return mood;
    const m = validMood(next) ? next : 'idle';
    clearTimeout(recoverT);
    const replay = m === mood && REPLAY_MOODS.has(m);
    if (m !== mood || replay) {
      root.classList.remove('mood-' + mood);
      if (replay) void root.offsetWidth; // 重启一次性动画
      root.classList.add('mood-' + m);
      mood = m;
    }
    if (m === 'oops') recoverT = setTimeout(() => setMood('idle'), OOPS_RECOVER_MS);
    return mood;
  }

  function setStage(n) {
    if (destroyed) return stage;
    const prev = stage;
    stage = clampStage(n);
    root.classList.remove('st-' + prev);
    root.classList.add('st-' + stage);
    const on = decorationsForStage(stage);
    for (const d of DECORATIONS) root.classList.toggle('has-' + d, on.includes(d));
    const lit = litLampsForStage(stage);
    lamps.forEach((l, i) => l.classList.toggle('on', i < lit));
    return stage;
  }

  function setSkin(id) {
    if (destroyed) return skin;
    skin = SKINS.some((s) => s.id === id) ? id : 'default';
    const c = skinColors(skin);
    const st = root.style;
    st.setProperty('--nd-main', c.main);
    st.setProperty('--nd-light', c.light);
    st.setProperty('--nd-shade', c.shade);
    st.setProperty('--nd-screen', c.screen);
    st.setProperty('--nd-ink', c.stroke);
    return skin;
  }

  function blink() {
    if (destroyed || motion < 1 || typeof eyes[0].animate !== 'function') return;
    for (const e of eyes) e.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(.08)' }, { transform: 'scaleY(1)' }], { duration: 190, easing: 'ease-in-out' });
  }

  function bounce() {
    if (destroyed || motion < 2 || typeof bn.animate !== 'function') return;
    bn.animate(
      [
        { transform: 'translateY(0) scale(1,1)' },
        { transform: 'translateY(-16px) scale(.96,1.06)', offset: 0.38 },
        { transform: 'translateY(0) scale(1.06,.92)', offset: 0.7 },
        { transform: 'translateY(-3px) scale(1,1)', offset: 0.86 },
        { transform: 'translateY(0) scale(1,1)' },
      ],
      { duration: 560, easing: 'ease-out' },
    );
  }

  function faceCenter() {
    const r = svg.getBoundingClientRect();
    return { r, cx: r.left + r.width * 0.5, cy: r.top + r.height * 0.5 };
  }

  function lookAt(x, y) {
    if (destroyed) return;
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) {
      root.style.setProperty('--lx', '0px');
      root.style.setProperty('--ly', '0px');
      return;
    }
    const { r, cx, cy } = faceCenter();
    const o = lookOffset(x - cx, y - cy, 4.6, Math.max(120, r.width * 1.2));
    root.style.setProperty('--lx', o.x.toFixed(2) + 'px');
    root.style.setProperty('--ly', o.y.toFixed(2) + 'px');
  }

  function pointAt(x, y) {
    if (destroyed) return;
    if (pointing) {
      pointing.classList.remove('pt');
      pointing = null;
    }
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const { r, cx } = faceCenter();
    const k = r.width / VB.w;
    const side = x >= cx ? 'R' : 'L';
    const s = side === 'R' ? SHOULDER_R : SHOULDER_L;
    const sx = r.left + (s.x - VB.x) * k;
    const sy = r.top + (s.y - VB.y) * k;
    const ang = pointAngle(x - sx, y - sy);
    const el = arms[side];
    el.style.setProperty('--pt', ang.toFixed(1) + 'deg');
    el.classList.add('pt');
    pointing = el;
    lookAt(x, y);
  }

  function say(text, ms = 2200) {
    if (destroyed) return;
    clearTimeout(sayT);
    if (text == null || text === '') {
      sayBox.classList.remove('on');
      return;
    }
    sayTxt.textContent = String(text).slice(0, 40);
    sayBox.classList.add('on');
    sayT = setTimeout(() => sayBox.classList.remove('on'), Math.max(300, Number(ms) || 2200));
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    clearTimeout(recoverT);
    clearTimeout(sayT);
    root.remove();
  }

  // 初始状态
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  setMotion(opts.motion != null ? opts.motion : reduce ? 0 : 2);
  setSkin(opts.skin);
  setStage(opts.stage || 0);
  root.classList.add('mood-idle');
  if (opts.mood && validMood(opts.mood) && opts.mood !== 'idle') setMood(opts.mood);

  return {
    el: root,
    setMood,
    setStage,
    setSkin,
    setMotion,
    blink,
    lookAt,
    pointAt,
    say,
    bounce,
    destroy,
    getMood: () => mood,
    getStage: () => stage,
    getSkin: () => skin,
    getMotion: () => motion,
  };
}
