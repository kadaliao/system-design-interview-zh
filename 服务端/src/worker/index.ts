// 海外视频服务：Cloudflare Worker（R2 绑定 + HMAC token）
//   POST /v1/auth                 StoreKit JWS -> 15 分钟 token（绑定 /v1/{lang}/）
//   GET|HEAD /v1/{lang}/chNN.mp4  免费章节直接放行；其余需 ?token=
//   GET|HEAD /v1/{lang}/manifest.json  公开（只含文件名/大小/sha256）

import { verifyStoreKitTransaction, VerifyError, transactionFingerprint, type VerifyOptions } from "../shared/storekit.ts";
import { signToken, verifyToken, TOKEN_TTL_SECONDS } from "../shared/token.ts";
import { parseRange } from "../shared/range.ts";
import {
  catalogFromEnv, verifyOptionsFromEnv, statusForVerifyCode, int, list,
  type AuthRequestBody, type Env as PlainEnv,
} from "../shared/config.ts";

export interface WorkerEnv {
  VIDEOS: R2Bucket;
  TOKEN_SECRET: string; // wrangler secret
  TOKEN_SECRET_PREVIOUS?: string; // 轮换期可选
  APPLE_BUNDLE_ID: string;
  APPLE_PRODUCT_IDS: string;
  ALLOWED_ENVIRONMENTS?: string;
  MAX_SIGNED_AGE_SECONDS?: string;
  ALLOWED_LANGS?: string;
  MAX_CHAPTER?: string;
  FREE_CHAPTERS?: string;
  CORS_ORIGINS?: string;
  TOKEN_TTL_SECONDS?: string;
  AUTH_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };
}

type CacheLike = Pick<Cache, "match" | "put">;
type Ctx = Pick<ExecutionContext, "waitUntil">;

const VIDEO_PATH = /^\/v1\/([a-z]{2,8})\/(ch(\d{2})\.mp4|manifest\.json)$/;
const STORED_CACHE_CONTROL = "public, max-age=604800";

function json(status: number, body: unknown, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}
const fail = (status: number, code: string, message: string, extra?: HeadersInit) =>
  json(status, { ok: false, error: { code, message } }, extra);

function cors(req: Request, env: WorkerEnv): Record<string, string> {
  const allow = list(env.CORS_ORIGINS, []);
  const origin = req.headers.get("origin");
  if (!origin || allow.length === 0) return {};
  if (!allow.includes("*") && !allow.includes(origin)) return {};
  return {
    "access-control-allow-origin": allow.includes("*") ? "*" : origin,
    "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
    "access-control-allow-headers": "content-type, range, if-range, if-none-match",
    "access-control-expose-headers": "content-length, content-range, accept-ranges, etag",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

export async function handleRequest(
  req: Request,
  env: WorkerEnv,
  ctx: Ctx,
  cache: CacheLike,
  verifyOverrides: Partial<VerifyOptions> = {}, // 仅测试注入（如自建根证书）
): Promise<Response> {
  const res = await route(req, env, ctx, cache, verifyOverrides);
  const c = cors(req, env);
  if (Object.keys(c).length === 0) return res;
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(c)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

async function route(req: Request, env: WorkerEnv, ctx: Ctx, cache: CacheLike, vo: Partial<VerifyOptions>): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  if (url.pathname === "/v1/auth") {
    if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "POST only", { allow: "POST, OPTIONS" });
    return handleAuth(req, env, vo);
  }

  const m = VIDEO_PATH.exec(url.pathname);
  if (m && (req.method === "GET" || req.method === "HEAD")) {
    const catalog = catalogFromEnv(env as unknown as PlainEnv);
    const [, lang, name, chapterStr] = m;
    if (!catalog.langs.includes(lang)) return fail(404, "NOT_FOUND", "unknown language");
    let free = name === "manifest.json";
    if (chapterStr !== undefined) {
      const ch = Number(chapterStr);
      if (ch < 1 || ch > catalog.maxChapter) return fail(404, "NOT_FOUND", "unknown chapter");
      free = catalog.freeChapters.includes(ch);
    }
    if (!free) {
      const secrets = [env.TOKEN_SECRET, env.TOKEN_SECRET_PREVIOUS ?? ""];
      const v = await verifyToken(url.searchParams.get("token"), secrets, url.pathname);
      if (!v.ok) {
        const status = v.error === "PATH_DENIED" ? 403 : 401;
        return fail(status, `TOKEN_${v.error}`, "invalid token", { "www-authenticate": 'Bearer realm="sdq-video"' });
      }
    }
    return serveObject(req, env, ctx, cache, url, name.endsWith(".mp4") ? "video/mp4" : "application/json", free);
  }
  if (m) return fail(405, "METHOD_NOT_ALLOWED", "GET/HEAD only", { allow: "GET, HEAD, OPTIONS" });
  return fail(404, "NOT_FOUND", "not found");
}

async function handleAuth(req: Request, env: WorkerEnv, vo: Partial<VerifyOptions>): Promise<Response> {
  if (!env.TOKEN_SECRET || env.TOKEN_SECRET.length < 32) return fail(500, "MISCONFIGURED", "token secret not set");
  if (env.AUTH_LIMITER) {
    const key = req.headers.get("cf-connecting-ip") ?? "unknown";
    if (!(await env.AUTH_LIMITER.limit({ key })).success) return fail(429, "RATE_LIMITED", "too many requests", { "retry-after": "10" });
  }
  const text = await req.text();
  if (text.length > 20_000) return fail(413, "TOO_LARGE", "body too large");
  let body: AuthRequestBody;
  try { body = JSON.parse(text); } catch { return fail(400, "BAD_REQUEST", "invalid JSON"); }
  const catalog = catalogFromEnv(env as unknown as PlainEnv);
  if (typeof body.signedTransaction !== "string") return fail(400, "BAD_REQUEST", "signedTransaction required");
  if (typeof body.lang !== "string" || !catalog.langs.includes(body.lang)) return fail(400, "BAD_REQUEST", "unsupported lang");

  try {
    const tx = await verifyStoreKitTransaction(body.signedTransaction, { ...verifyOptionsFromEnv(env as unknown as PlainEnv), ...vo });
    const ttl = int(env.TOKEN_TTL_SECONDS, TOKEN_TTL_SECONDS);
    const prefix = `/v1/${body.lang}/`;
    const { token, expiresAt } = await signToken(env.TOKEN_SECRET, { prefix, ttlSeconds: ttl, subject: await transactionFingerprint(tx) });
    return json(200, { ok: true, token, expiresAt, ttlSeconds: ttl, pathPrefix: prefix });
  } catch (e) {
    if (e instanceof VerifyError) return fail(statusForVerifyCode(e.code), e.code, e.message);
    return fail(500, "INTERNAL", "verification failed");
  }
}

// ---------------------------------------------------------------------------
// 对象读取：Cache API + R2 绑定 + Range

interface Meta { size: number; etag: string; contentType: string }

type Decision =
  | { status: 304 }
  | { status: 416 }
  | { status: 200 }
  | { status: 206; start: number; end: number };

function decide(req: Request, m: Meta): Decision {
  const inm = req.headers.get("if-none-match");
  if (inm && inm.split(",").some((t) => t.trim() === m.etag || t.trim() === `W/${m.etag}` || t.trim() === "*")) return { status: 304 };
  let range = req.headers.get("range");
  const ifRange = req.headers.get("if-range");
  if (range && ifRange && ifRange.trim() !== m.etag) range = null; // If-Range 不匹配：忽略 Range，返回完整内容
  const r = parseRange(range, m.size);
  if (r.kind === "unsatisfiable") return { status: 416 };
  if (r.kind === "range") return { status: 206, start: r.start, end: r.end };
  return { status: 200 };
}

function clientHeaders(m: Meta, free: boolean): Headers {
  const h = new Headers();
  h.set("content-type", m.contentType);
  h.set("accept-ranges", "bytes");
  h.set("etag", m.etag);
  // 免费：可被任何缓存长期保存（路径含 v1，改内容必须发 v2，不覆盖）；付费：只允许 App 本地缓存
  h.set("cache-control", free ? "public, max-age=31536000, immutable" : "private, max-age=86400");
  h.set("x-content-type-options", "nosniff");
  return h;
}

function respond(d: Decision, m: Meta, free: boolean, body: BodyInit | null, head: boolean): Response {
  const h = clientHeaders(m, free);
  if (d.status === 304) return new Response(null, { status: 304, headers: h });
  if (d.status === 416) {
    h.set("content-range", `bytes */${m.size}`);
    return new Response(null, { status: 416, headers: h });
  }
  if (d.status === 206) {
    h.set("content-range", `bytes ${d.start}-${d.end}/${m.size}`);
    h.set("content-length", String(d.end - d.start + 1));
    return new Response(head ? null : body, { status: 206, headers: h });
  }
  h.set("content-length", String(m.size));
  return new Response(head ? null : body, { status: 200, headers: h });
}

async function serveObject(
  req: Request, env: WorkerEnv, ctx: Ctx, cache: CacheLike, url: URL, defaultType: string, free: boolean,
): Promise<Response> {
  const head = req.method === "HEAD";
  // 缓存键不含 token，所有用户共享同一份边缘副本；鉴权已在进入这里之前完成
  const cacheKeyUrl = `${url.origin}${url.pathname}`;
  const r2Key = url.pathname.slice(1);

  const hit = await cache.match(new Request(cacheKeyUrl));
  if (hit && hit.status === 200) {
    const m: Meta = {
      size: Number(hit.headers.get("content-length")),
      etag: hit.headers.get("etag") ?? "",
      contentType: hit.headers.get("content-type") ?? defaultType,
    };
    if (Number.isFinite(m.size) && m.etag) {
      const d = decide(req, m);
      if (d.status === 200) return respond(d, m, free, hit.body, head);
      hit.body?.cancel().catch(() => {});
      if (d.status !== 206) return respond(d, m, free, null, head);
      const part = await cache.match(new Request(cacheKeyUrl, { headers: { range: `bytes=${d.start}-${d.end}` } }));
      if (part && part.status === 206) return respond(d, m, free, part.body, head);
      return r2Range(env, r2Key, d, m, free, head);
    }
  }

  if (head) {
    const o = await env.VIDEOS.head(r2Key);
    if (!o) return fail(404, "NOT_FOUND", "object not found");
    const m: Meta = { size: o.size, etag: o.httpEtag, contentType: o.httpMetadata?.contentType ?? defaultType };
    return respond(decide(req, m), m, free, null, true);
  }

  const obj = await env.VIDEOS.get(r2Key);
  if (!obj) return fail(404, "NOT_FOUND", "object not found");
  const m: Meta = { size: obj.size, etag: obj.httpEtag, contentType: obj.httpMetadata?.contentType ?? defaultType };
  const d = decide(req, m);
  const stored = (body: ReadableStream) =>
    new Response(body, {
      headers: {
        "content-type": m.contentType, "content-length": String(m.size), etag: m.etag,
        "accept-ranges": "bytes", "cache-control": STORED_CACHE_CONTROL,
      },
    });

  if (d.status === 200) {
    const [forCache, forClient] = obj.body.tee();
    ctx.waitUntil(cache.put(new Request(cacheKeyUrl), stored(forCache)).catch(() => {}));
    return respond(d, m, free, forClient, false);
  }
  if (d.status === 206) {
    // Cache API 不能 put 206；先把完整对象写入缓存，再让 cache.match 按 Range 切片返回
    try {
      await cache.put(new Request(cacheKeyUrl), stored(obj.body));
      const part = await cache.match(new Request(cacheKeyUrl, { headers: { range: `bytes=${d.start}-${d.end}` } }));
      if (part && part.status === 206) return respond(d, m, free, part.body, false);
    } catch { /* 缓存失败：退回直接读 R2 区间 */ }
    return r2Range(env, r2Key, d, m, free, false);
  }
  obj.body.cancel().catch(() => {});
  return respond(d, m, free, null, false);
}

async function r2Range(env: WorkerEnv, key: string, d: { start: number; end: number }, m: Meta, free: boolean, head: boolean): Promise<Response> {
  const o = await env.VIDEOS.get(key, { range: { offset: d.start, length: d.end - d.start + 1 } });
  if (!o) return fail(404, "NOT_FOUND", "object not found");
  return respond({ status: 206, start: d.start, end: d.end }, m, free, o.body, head);
}

export default {
  async fetch(req: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(req, env, ctx, (caches as unknown as { default: Cache }).default);
  },
} satisfies ExportedHandler<WorkerEnv>;
