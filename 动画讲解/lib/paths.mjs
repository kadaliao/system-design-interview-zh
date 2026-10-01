// 各章按语言区分的文件路径。zh 沿用旧路径；其他语言（如 en）带后缀，构建产物放 build/<lang>/、成片放 out/<lang>/。
import { ROOT } from './serve.mjs';
export const VOICES = { zh: 'zh-CN-XiaoxiaoNeural', en: 'en-US-AvaNeural' };
/** 从 argv 里取出 --lang（并从数组移除），默认 zh */
export function takeLang(args) { const i = args.indexOf('--lang'); return i >= 0 ? args.splice(i, 2)[1] : 'zh'; }
export function chapterPaths(ch, lang = 'zh') {
  const sfx = lang === 'zh' ? '' : `.${lang}`, base = `${ROOT}/${ch}`;
  return {
    script: `${base}/script${sfx}.json`, scenes: `${base}/scenes${sfx}.js`, durations: `${base}/durations${sfx}.json`,
    build: lang === 'zh' ? `${base}/build` : `${base}/build/${lang}`, out: lang === 'zh' ? `${base}/out` : `${base}/out/${lang}`,
    voice: VOICES[lang] || VOICES.en,
  };
}
export const metaOf = (scenesFile, readFileSync) => {
  const m = readFileSync(scenesFile, 'utf8').match(/export const meta\s*=\s*\{([^}]*)\}/)?.[1] || '';
  return { title: (m.match(/title:\s*'([^']+)'/) || [])[1], en: (m.match(/en:\s*'([^']+)'/) || [])[1] || '' };
};
