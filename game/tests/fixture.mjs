import { readFileSync } from 'node:fs';
import { buildCourse } from '../js/course.js';
import { defaultState } from '../js/store.js';

export const loadZh = () => buildCourse(JSON.parse(readFileSync(new URL('../data/course.zh.json', import.meta.url), 'utf8')));
export const freshState = () => defaultState();
