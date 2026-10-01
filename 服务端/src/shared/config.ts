// 两个地区共用的环境变量解析。

import type { VerifyOptions } from "./storekit.ts";

export type Env = Record<string, string | undefined>;

export const list = (v: string | undefined, dflt: string[]): string[] =>
  v === undefined || v.trim() === "" ? dflt : v.split(",").map((s) => s.trim()).filter(Boolean);

export const int = (v: string | undefined, dflt: number): number => {
  if (v === undefined || v.trim() === "") return dflt;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`invalid number: ${v}`);
  return n;
};

export function verifyOptionsFromEnv(env: Env): VerifyOptions {
  const bundleId = env.APPLE_BUNDLE_ID;
  const productIds = list(env.APPLE_PRODUCT_IDS, []);
  if (!bundleId || productIds.length === 0) throw new Error("APPLE_BUNDLE_ID / APPLE_PRODUCT_IDS not configured");
  return {
    bundleId,
    productIds,
    allowedEnvironments: list(env.ALLOWED_ENVIRONMENTS, ["Production"]),
    maxSignedAgeSeconds: int(env.MAX_SIGNED_AGE_SECONDS, 7 * 86400),
  };
}

export interface Catalog { langs: string[]; maxChapter: number; freeChapters: number[] }

export function catalogFromEnv(env: Env): Catalog {
  return {
    langs: list(env.ALLOWED_LANGS, ["zh", "en"]),
    maxChapter: int(env.MAX_CHAPTER, 28),
    freeChapters: list(env.FREE_CHAPTERS, ["1"]).map(Number),
  };
}

export const pad2 = (n: number): string => String(n).padStart(2, "0");

export interface AuthRequestBody { signedTransaction?: unknown; lang?: unknown; chapters?: unknown }

/** 错误 → HTTP 状态：400 请求本身坏；401 凭证无效；403 凭证有效但无权益 */
export function statusForVerifyCode(code: string): number {
  switch (code) {
    case "MALFORMED": return 400;
    case "UNSUPPORTED_ALG": case "BAD_CHAIN": case "UNTRUSTED_ROOT": case "CERT_EXPIRED":
    case "BAD_SIGNATURE": case "STALE": return 401;
    default: return 403; // WRONG_BUNDLE / WRONG_PRODUCT / WRONG_ENVIRONMENT / REVOKED / EXPIRED
  }
}
