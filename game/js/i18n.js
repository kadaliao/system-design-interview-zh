// 界面文字（题库内容另有中英两份数据）。t('key', {n: 3}) 里的 {n} 会被替换。

import { zh } from './strings.zh.js';
import { en } from './strings.en.js';

const DICT = { zh, en };
let lang = 'zh';

export const detectLang = () => {
  const nav = (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || [];
  return String(nav[0] || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en';
};

export const setLang = l => { lang = l === 'en' ? 'en' : 'zh'; if (typeof document !== 'undefined') document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'; };
export const getLang = () => lang;

export function t(key, params) {
  let s = DICT[lang][key] ?? DICT.zh[key] ?? key;
  if (typeof s === 'function') return s(params || {});
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m));
  return s;
}

export const has = key => key in DICT.zh;

export const fmtDate = (ts, opts) => new Date(ts).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', opts || { month: 'numeric', day: 'numeric' });
