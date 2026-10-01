// 时间轴：每段 = 前导 + 旁白时长 + 尾留白。画面、音频、渲染都读这一份。
export const FPS = 30;
export const LEAD = 0.7, TAIL = 1.0;
export function buildTimeline(script, dur) {
  let t = 0;
  const scenes = script.map((s, i) => {
    const lead = i === 0 ? 1.4 : LEAD, tail = i === script.length - 1 ? 3 : TAIL;
    const d = lead + dur[s.id] + tail;
    const sc = { ...s, start: t, lead, dur: d, voiceDur: dur[s.id] };
    t += d; return sc;
  });
  return { scenes, total: t };
}
