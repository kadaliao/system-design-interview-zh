import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRange } from "../src/shared/range.ts";

const N = 1000;
test("单区间", () => {
  assert.deepEqual(parseRange("bytes=0-99", N), { kind: "range", start: 0, end: 99 });
  assert.deepEqual(parseRange("bytes=900-999", N), { kind: "range", start: 900, end: 999 });
});
test("开区间与后缀区间", () => {
  assert.deepEqual(parseRange("bytes=500-", N), { kind: "range", start: 500, end: 999 });
  assert.deepEqual(parseRange("bytes=-100", N), { kind: "range", start: 900, end: 999 });
  assert.deepEqual(parseRange("bytes=-5000", N), { kind: "range", start: 0, end: 999 }); // 后缀超长取全部
});
test("end 超出则截断", () => {
  assert.deepEqual(parseRange("bytes=990-5000", N), { kind: "range", start: 990, end: 999 });
});
test("越界 -> 416", () => {
  assert.deepEqual(parseRange("bytes=1000-", N), { kind: "unsatisfiable" });
  assert.deepEqual(parseRange("bytes=2000-3000", N), { kind: "unsatisfiable" });
  assert.deepEqual(parseRange("bytes=-0", N), { kind: "unsatisfiable" });
});
test("无 Range / 非法 / 多区间 / 非 bytes 单位：忽略返回完整内容", () => {
  for (const h of [null, undefined, "", "bytes=", "bytes=-", "bytes=5-2", "bytes=0-1,5-6", "items=0-1", "bytes=a-b"]) {
    assert.deepEqual(parseRange(h, N), { kind: "none" }, String(h));
  }
});
