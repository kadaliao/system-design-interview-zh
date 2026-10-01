// 本机存档：全部记录只存在浏览器的 localStorage 里，不上传。

export const STORE_KEY = 'archdopa.v1';
export const HISTORY_MAX = 3000;
export const REVIEW_MAX = 40;

export function defaultState() {
  return {
    v: 1,
    settings: {
      lang: null,          // null = 跟随浏览器
      count: 10,           // 每次基本题数：6 / 10 / 14
      sound: true, volume: 0.7,
      motion: 2,           // 0 关 / 1 弱 / 2 标准
      pace: 'normal',      // 连击计时：normal / relaxed / off
      music: 'auto',       // 'auto'（随机已解锁）或某个风格 id
      skin: 'default',
      fx: 'auto', theme: 'auto',
      autoNext: false,     // 一题完成后自动进入下一题（答对且首次就对时）
    },
    seen: {},              // 引导、提示等一次性标记
    placementDone: false,
    skills: {},            // lessonId → {hist:[{t,ft,r}], mastered, stars, starAt, lastFt, placed}
    q: {},                 // exId → {n 作答次数, ft 首次即对次数, last, lastFt}
    history: [],           // 每次游玩一条
    review: [],            // 复习本 [{id, t}]
    days: {},              // 'YYYY-MM-DD' → {plays, best, answered}
    nocount: [],           // 已用「补签锤」的日期
    hammers: 1,
    hammerLog: [],
    hammerDeclined: null,
    login: { last: null, cycle: 0, total: 0, crowns: 0, seals: {} },
    quests: null,          // 今日任务 {day, list:[...], rewarded}
    questLog: { done: 0, days: 0, hard: 0 },
    stats: {
      plays: 0, answered: 0, ft: 0, cells: 0, miss: 0, seconds: 0, bestCombo: 0, bestScore: 0, bestL: 0,
      extraPlays: 0, extraQ: 0, maxExtraQ: 0, perfect: 0, reviewSolved: 0, polished: 0, capsules: 0,
      modes: {}, chapterPlays: {}, comboBreaks: 0, hammersUsed: 0, reads: 0, perfect14: 0, perfectExtra5: 0,
      lateNight: 0, newYear: 0, comeback: 0, fast: 0,
    },
    trophies: {},          // id → ts
    unlocked: {},          // 收藏项 id → ts
    previewed: {},
    growthBase: null,
    created: Date.now(),
  };
}

/** 深合并默认值，保证新增字段在旧存档里也有。 */
function mergeDefaults(base, saved) {
  if (Array.isArray(base) || base === null || typeof base !== 'object') return saved === undefined ? base : saved;
  const out = { ...base };
  if (saved && typeof saved === 'object') {
    for (const k of Object.keys(saved)) {
      out[k] = k in base && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])
        ? mergeDefaults(base[k], saved[k]) : saved[k];
    }
  }
  return out;
}

export function normalize(saved) {
  return mergeDefaults(defaultState(), saved);
}

export function createStore(storage = (typeof localStorage !== 'undefined' ? safeStorage() : null)) {
  let state;
  try {
    const raw = storage && storage.getItem(STORE_KEY);
    state = raw ? normalize(JSON.parse(raw)) : defaultState();
  } catch {
    state = defaultState();
  }
  let timer = null;
  const listeners = new Set();

  const flush = () => {
    timer = null;
    try { storage && storage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* 存储满或被禁用时静默 */ }
  };
  return {
    get state() { return state; },
    save() { if (!timer) timer = setTimeout(flush, 200); listeners.forEach(f => f(state)); },
    flush,
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },
    reset() { state = defaultState(); flush(); },
    export() { return JSON.stringify(state); },
    import(text) {
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || data.v !== 1 || typeof data.skills !== 'object') throw new Error('bad-backup');
      state = normalize(data);
      flush();
    },
  };
}

function safeStorage() {
  try {
    const s = localStorage;
    s.getItem('x');
    return s;
  } catch {
    return null;
  }
}
