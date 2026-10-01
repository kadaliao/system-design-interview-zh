// RFC 9110 §14 单区间 Range 解析。多区间/非法语法按规范忽略 Range，返回完整 200。

export type RangeResult =
  | { kind: "none" }
  | { kind: "range"; start: number; end: number } // end 含
  | { kind: "unsatisfiable" };

export function parseRange(header: string | null | undefined, size: number): RangeResult {
  if (!header) return { kind: "none" };
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return { kind: "none" }; // 多区间、单位不是 bytes、语法错：忽略
  const [, a, b] = m;
  if (a === "" && b === "") return { kind: "none" };
  if (a === "") {
    // 后缀：最后 n 字节
    const n = Number(b);
    if (n === 0 || size === 0) return { kind: "unsatisfiable" };
    return { kind: "range", start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(a);
  if (start >= size) return { kind: "unsatisfiable" };
  let end = b === "" ? size - 1 : Number(b);
  if (end < start) return { kind: "none" }; // 语法无效，忽略
  end = Math.min(end, size - 1);
  return { kind: "range", start, end };
}
