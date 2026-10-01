// 收藏：通过游玩解锁的音乐、吉祥物皮肤和界面配色。
import { metricsOf } from './metrics.js';

// cond: [指标, 数值]；指标同成就用的 metricsOf
export const COLLECTION = [
  { id: 'music:chip', cat: 'music', cond: null },
  { id: 'music:lofi', cat: 'music', cond: ['plays', 3] },
  { id: 'music:wa', cat: 'music', cond: ['playDays', 5] },
  { id: 'music:rock', cat: 'music', cond: ['dopa', 3] },
  { id: 'skin:default', cat: 'skin', cond: null },
  { id: 'skin:sakura', cat: 'skin', cond: ['plays', 2] },
  { id: 'skin:matcha', cat: 'skin', cond: ['cleared', 1] },
  { id: 'skin:sunset', cat: 'skin', cond: ['bestCombo', 20] },
  { id: 'skin:violet', cat: 'skin', cond: ['mastered', 15] },
  { id: 'skin:gold', cat: 'skin', cond: ['trophies', 60] },
  { id: 'theme:night', cat: 'theme', cond: null },
  { id: 'theme:sakura', cat: 'theme', cond: ['answered', 100] },
  { id: 'theme:forest', cat: 'theme', cond: ['playDays', 7] },
  { id: 'theme:sunset', cat: 'theme', cond: ['extraQ', 10] },
  { id: 'theme:ink', cat: 'theme', cond: ['streak', 7] },
];

export const itemById = new Map(COLLECTION.map(i => [i.id, i]));
export const bareId = id => id.split(':')[1];

/** 检查并写入新解锁的收藏项，返回新解锁列表。 */
export function checkUnlocks(state, course, now = Date.now()) {
  const m = metricsOf(state, course, now);
  const gained = [];
  for (const it of COLLECTION) {
    if (state.unlocked[it.id]) continue;
    if (!it.cond || (m[it.cond[0]] || 0) >= it.cond[1]) {
      state.unlocked[it.id] = now;
      gained.push(it);
      m.unlocked++;
    }
  }
  return gained;
}

export const isUnlockedItem = (state, id) => !!state.unlocked[id];

export function progressOfItem(state, course, it, now = Date.now()) {
  if (!it.cond) return { value: 1, target: 1 };
  const m = metricsOf(state, course, now);
  return { value: Math.min(m[it.cond[0]] || 0, it.cond[1]), target: it.cond[1] };
}

/** 设置里选了固定值就用固定值，否则（auto）从已解锁里随机。 */
export function resolveChoice(state, cat, setting, rand = Math.random) {
  const unlocked = COLLECTION.filter(i => i.cat === cat && state.unlocked[i.id]).map(i => bareId(i.id));
  if (setting && setting !== 'auto' && unlocked.includes(setting)) return setting;
  return unlocked.length ? unlocked[Math.floor(rand() * unlocked.length)] : bareId(COLLECTION.find(i => i.cat === cat).id);
}
