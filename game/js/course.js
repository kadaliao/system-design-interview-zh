// 课程结构：28 章 → 111 课（每课就是技能树上的一个技能）。负责前提关系、层级深度和题目索引。

// 章与章的前提：前提章的最后一课掌握后，本章第一课才解锁。
export const CHAPTER_PREREQ = {
  1: [], 2: [1], 3: [2],
  4: [3], 5: [3], 6: [5], 7: [3],
  8: [7], 9: [3], 10: [4], 11: [10], 12: [10], 13: [6], 14: [9], 15: [14],
  16: [5], 17: [16], 18: [16],
  19: [6], 20: [19], 21: [19],
  22: [6], 23: [19], 24: [15], 25: [6],
  26: [22], 27: [26], 28: [27],
};

/** 把 build_game_data.py 产出的 JSON 整理成游戏用的结构。 */
export function buildCourse(raw) {
  const chapters = new Map();
  const lessons = [];
  const lessonById = new Map();
  const exById = new Map();
  const lastOfChapter = new Map();

  for (const ch of raw.chapters) {
    chapters.set(ch.n, ch);
    ch.lessonIds = [];
    ch.lessons.forEach((l, idx) => {
      const lesson = {
        id: l.id, ch: ch.n, idx, title: l.title, summary: l.summary,
        exercises: l.exercises, prereqs: [], depth: 0, order: 0,
      };
      lessons.push(lesson);
      lessonById.set(l.id, lesson);
      ch.lessonIds.push(l.id);
      for (const ex of l.exercises) {
        ex.lesson = l.id;
        ex.ch = ch.n;
        exById.set(ex.id, ex);
      }
    });
    lastOfChapter.set(ch.n, ch.lessonIds[ch.lessonIds.length - 1]);
  }

  for (const l of lessons) {
    if (l.idx > 0) l.prereqs = [chapters.get(l.ch).lessonIds[l.idx - 1]];
    else l.prereqs = (CHAPTER_PREREQ[l.ch] || []).filter(c => lastOfChapter.has(c)).map(c => lastOfChapter.get(c));
  }

  // 前提总在更靠前的章，一遍扫描即可得到最长路径深度
  for (const l of lessons) {
    l.depth = l.prereqs.length ? 1 + Math.max(...l.prereqs.map(p => lessonById.get(p).depth)) : 0;
  }
  const ordered = lessons.slice().sort((a, b) => a.depth - b.depth || a.ch - b.ch || a.idx - b.idx);
  ordered.forEach((l, i) => { l.order = i; });

  const dependents = new Map(lessons.map(l => [l.id, []]));
  for (const l of lessons) for (const p of l.prereqs) dependents.get(p).push(l.id);

  const course = {
    raw, chapters, lessons, lessonById, exById, ordered, dependents,
    sections: raw.sections,
    readerURL: raw.readerURL,
    lesson: id => lessonById.get(id),
    ex: id => exById.get(id),
    /** 某课的全部祖先课（不含自己）。 */
    ancestors(id) {
      const out = new Set();
      const walk = x => { for (const p of lessonById.get(x).prereqs) if (!out.has(p)) { out.add(p); walk(p); } };
      walk(id);
      return [...out];
    },
    /** 所有后代课。 */
    descendants(id) {
      const out = new Set();
      const walk = x => { for (const d of dependents.get(x)) if (!out.has(d)) { out.add(d); walk(d); } };
      walk(id);
      return [...out];
    },
    /** 阅读版链接：章节或具体小节。 */
    readerLink(chNum, anchor) {
      const ch = chapters.get(chNum);
      return `${raw.readerURL}#${anchor || ch.doc}`;
    },
    labLink(chNum, labId) {
      return `${raw.readerURL}#${chapters.get(chNum).doc}/lab-${labId}`;
    },
  };
  return course;
}

export async function loadCourse(lang, base = './data/') {
  const res = await fetch(`${base}course.${lang === 'en' ? 'en' : 'zh'}.json`);
  if (!res.ok) throw new Error('题库加载失败：' + res.status);
  return buildCourse(await res.json());
}
