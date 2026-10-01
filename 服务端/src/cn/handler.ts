// 平台无关的签发逻辑：入参/出参都是纯对象，Node http 服务器、阿里云 FC、腾讯云 SCF 的适配层都很薄。

import { verifyStoreKitTransaction, VerifyError, type VerifyOptions } from "../shared/storekit.ts";
import {
  catalogFromEnv, verifyOptionsFromEnv, statusForVerifyCode, int, list, pad2,
  type AuthRequestBody, type Env,
} from "../shared/config.ts";
import { signCdnUrl, CDN_PROVIDERS, type CdnProvider } from "./cdn-sign.ts";

export interface HttpIn { method: string; path: string; headers: Record<string, string | undefined>; body: string }
export interface HttpOut { status: number; headers: Record<string, string>; body: string }

const out = (status: number, body: unknown, headers: Record<string, string> = {}): HttpOut => ({
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  body: JSON.stringify(body),
});
const fail = (status: number, code: string, message: string) => out(status, { ok: false, error: { code, message } });

export interface Deps { env: Env; now?: () => number; verifyOverrides?: Partial<VerifyOptions> /* 仅测试注入 */ }

export async function handle(req: HttpIn, deps: Deps): Promise<HttpOut> {
  const { env } = deps;
  const now = deps.now?.() ?? Date.now();
  const origin = req.headers["origin"];
  const corsAllow = list(env.CORS_ORIGINS, []);
  const cors: Record<string, string> =
    origin && (corsAllow.includes("*") || corsAllow.includes(origin))
      ? {
          "access-control-allow-origin": corsAllow.includes("*") ? "*" : origin,
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          vary: "Origin",
        }
      : {};
  const r = await route(req, env, now, deps.verifyOverrides ?? {});
  return { ...r, headers: { ...r.headers, ...cors } };
}

async function route(req: HttpIn, env: Env, now: number, vo: Partial<VerifyOptions>): Promise<HttpOut> {
  if (req.method === "OPTIONS") return { status: 204, headers: {}, body: "" };
  if (req.path === "/healthz") return out(200, { ok: true });
  if (req.path !== "/v1/auth") return fail(404, "NOT_FOUND", "not found");
  if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "POST only");
  if (req.body.length > 20_000) return fail(413, "TOO_LARGE", "body too large");

  let body: AuthRequestBody;
  try { body = JSON.parse(req.body); } catch { return fail(400, "BAD_REQUEST", "invalid JSON"); }
  const catalog = catalogFromEnv(env);
  if (typeof body.signedTransaction !== "string") return fail(400, "BAD_REQUEST", "signedTransaction required");
  if (typeof body.lang !== "string" || !catalog.langs.includes(body.lang)) return fail(400, "BAD_REQUEST", "unsupported lang");

  let chapters: number[];
  if (body.chapters === undefined) {
    chapters = Array.from({ length: catalog.maxChapter }, (_, i) => i + 1);
  } else if (
    Array.isArray(body.chapters) && body.chapters.length > 0 && body.chapters.length <= catalog.maxChapter &&
    body.chapters.every((c) => Number.isInteger(c) && c >= 1 && c <= catalog.maxChapter)
  ) {
    chapters = [...new Set(body.chapters as number[])];
  } else return fail(400, "BAD_REQUEST", "invalid chapters");

  const provider = env.CDN_PROVIDER as CdnProvider;
  if (!CDN_PROVIDERS.includes(provider) || !env.CDN_BASE_URL || !env.CDN_KEY) return fail(500, "MISCONFIGURED", "CDN not configured");

  try {
    await verifyStoreKitTransaction(body.signedTransaction, { ...verifyOptionsFromEnv(env), ...vo, now });
  } catch (e) {
    if (e instanceof VerifyError) return fail(statusForVerifyCode(e.code), e.code, e.message);
    return fail(500, "INTERNAL", "verification failed");
  }

  const nowSec = Math.floor(now / 1000);
  const ttl = int(env.CDN_VALIDITY_SECONDS, 900);
  const base = env.CDN_BASE_URL.replace(/\/+$/, "");
  const freeBase = env.FREE_BASE_URL?.replace(/\/+$/, "");
  const urls: Record<string, string> = {};
  for (const ch of chapters) {
    const path = `/v1/${body.lang}/ch${pad2(ch)}.mp4`;
    if (catalog.freeChapters.includes(ch) && freeBase) { urls[String(ch)] = `${freeBase}${path}`; continue; }
    urls[String(ch)] = signCdnUrl({ provider, origin: base, path, key: env.CDN_KEY, now: nowSec, ttlSeconds: ttl });
  }
  return out(200, { ok: true, urls, expiresAt: nowSec + ttl, ttlSeconds: ttl });
}
