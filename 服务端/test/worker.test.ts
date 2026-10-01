import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest, type WorkerEnv } from "../src/worker/index.ts";
import { signToken } from "../src/shared/token.ts";
import { makeChain, signJws, basePayload } from "./helpers.ts";

// —— 假 R2 ——
const FILE = new Uint8Array(1000).map((_, i) => i % 251);
const stats = { get: 0, head: 0, put: 0 };
const fakeR2 = {
  async get(key: string, o?: { range?: { offset: number; length: number } }) {
    stats.get++;
    if (key !== "v1/zh/ch02.mp4" && key !== "v1/zh/ch01.mp4" && key !== "v1/zh/manifest.json") return null;
    const data = o?.range ? FILE.slice(o.range.offset, o.range.offset + o.range.length) : FILE;
    return {
      size: FILE.length, httpEtag: '"etag1"', httpMetadata: { contentType: key.endsWith(".json") ? "application/json" : "video/mp4" },
      body: new Blob([data]).stream(),
    };
  },
  async head(key: string) { stats.head++; return key.startsWith("v1/zh/") ? { size: FILE.length, httpEtag: '"etag1"', httpMetadata: {} } : null; },
} as unknown as R2Bucket;

// —— 假 Cache API：put 拒绝 206；match 支持 Range ——
function fakeCache() {
  const store = new Map<string, { body: Uint8Array; headers: Headers }>();
  return {
    store,
    async put(req: Request, res: Response) {
      if (res.status === 206) throw new TypeError("Cannot cache response to a range request (206 Partial Content response)");
      stats.put++;
      store.set(req.url, { body: new Uint8Array(await res.arrayBuffer()), headers: new Headers(res.headers) });
    },
    async match(req: Request) {
      const e = store.get(req.url);
      if (!e) return undefined;
      const r = /^bytes=(\d+)-(\d+)$/.exec(req.headers.get("range") ?? "");
      const h = new Headers(e.headers);
      if (!r) return new Response(e.body, { status: 200, headers: h });
      const [s, en] = [Number(r[1]), Number(r[2])];
      h.set("content-range", `bytes ${s}-${en}/${e.body.length}`);
      h.set("content-length", String(en - s + 1));
      return new Response(e.body.slice(s, en + 1), { status: 206, headers: h });
    },
  };
}

const SECRET = "s".repeat(40);
const env = (over: Partial<WorkerEnv> = {}): WorkerEnv => ({
  VIDEOS: fakeR2, TOKEN_SECRET: SECRET,
  APPLE_BUNDLE_ID: "com.kadaliao.SystemDesignQuest", APPLE_PRODUCT_IDS: "com.kadaliao.SystemDesignQuest.full",
  ...over,
});
const ctx = () => { const p: Promise<unknown>[] = []; return { p, waitUntil: (x: Promise<unknown>) => { p.push(x); } }; };
const call = async (e: WorkerEnv, cache: ReturnType<typeof fakeCache>, path: string, init: RequestInit = {}, vo = {}) => {
  const c = ctx();
  const r = await handleRequest(new Request(`https://video.example.com${path}`, init), e, c, cache as never, vo);
  await Promise.all(c.p);
  return r;
};
const tok = async (prefix = "/v1/zh/", now = Date.now()) => (await signToken(SECRET, { prefix, now })).token;
const bytes = async (r: Response) => new Uint8Array(await r.arrayBuffer());

test("免费章节无需 token；付费章节缺/错 token -> 401，路径越权 -> 403", async () => {
  const cache = fakeCache();
  assert.equal((await call(env(), cache, "/v1/zh/ch01.mp4")).status, 200);
  const r = await call(env(), cache, "/v1/zh/ch02.mp4");
  assert.equal(r.status, 401);
  assert.equal((await call(env(), cache, "/v1/zh/ch02.mp4?token=garbage")).status, 401);
  const enTok = await tok("/v1/en/");
  assert.equal((await call(env(), cache, `/v1/zh/ch02.mp4?token=${enTok}`)).status, 403);
  const expired = (await signToken(SECRET, { prefix: "/v1/zh/", now: Date.now() - 3600_000 })).token;
  assert.equal((await call(env(), cache, `/v1/zh/ch02.mp4?token=${expired}`)).status, 401);
});

test("非法路径：未知语言/章节/穿越 -> 404", async () => {
  const cache = fakeCache();
  const t = await tok();
  for (const p of ["/v1/fr/ch02.mp4", "/v1/zh/ch29.mp4", "/v1/zh/ch00.mp4", "/v1/zh/ch02.mov", "/other"]) { // 注：URL 解析会把 /../ 规范化掉，穿越由 token 前缀 + 严格正则双重兜底
    assert.equal((await call(env(), cache, `${p}?token=${t}`)).status, 404, p);
  }
});

test("完整 GET：200、Accept-Ranges、Content-Length、ETag、私有缓存头；回填缓存", async () => {
  const cache = fakeCache();
  const r = await call(env(), cache, `/v1/zh/ch02.mp4?token=${await tok()}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("accept-ranges"), "bytes");
  assert.equal(r.headers.get("content-length"), "1000");
  assert.equal(r.headers.get("etag"), '"etag1"');
  assert.equal(r.headers.get("content-type"), "video/mp4");
  assert.match(r.headers.get("cache-control")!, /^private/);
  assert.deepEqual(await bytes(r), FILE);
  assert.ok(cache.store.has("https://video.example.com/v1/zh/ch02.mp4"), "缓存键不含 token");
});

test("免费视频：公开长缓存 immutable", async () => {
  const r = await call(env(), fakeCache(), "/v1/zh/ch01.mp4");
  assert.equal(r.headers.get("cache-control"), "public, max-age=31536000, immutable");
});

test("Range：未命中缓存时先填充再切片；命中后不再访问 R2", async () => {
  const cache = fakeCache();
  const t = await tok();
  stats.get = 0;
  const r1 = await call(env(), cache, `/v1/zh/ch02.mp4?token=${t}`, { headers: { range: "bytes=10-19" } });
  assert.equal(r1.status, 206);
  assert.equal(r1.headers.get("content-range"), "bytes 10-19/1000");
  assert.equal(r1.headers.get("content-length"), "10");
  assert.deepEqual(await bytes(r1), FILE.slice(10, 20));
  assert.equal(stats.get, 1);
  const r2 = await call(env(), cache, `/v1/zh/ch02.mp4?token=${t}`, { headers: { range: "bytes=990-" } });
  assert.equal(r2.status, 206);
  assert.equal(r2.headers.get("content-range"), "bytes 990-999/1000");
  assert.deepEqual(await bytes(r2), FILE.slice(990));
  const r3 = await call(env(), cache, `/v1/zh/ch02.mp4?token=${t}`, { headers: { range: "bytes=-5" } });
  assert.equal(r3.headers.get("content-range"), "bytes 995-999/1000");
  assert.equal(stats.get, 1, "后两次命中缓存，不再读 R2");
});

test("Range 越界 -> 416 且带 Content-Range: bytes */size（命中/未命中均如此）", async () => {
  const cache = fakeCache();
  const t = await tok();
  const miss = await call(env(), cache, `/v1/zh/ch02.mp4?token=${t}`, { headers: { range: "bytes=5000-" } });
  assert.equal(miss.status, 416);
  assert.equal(miss.headers.get("content-range"), "bytes */1000");
  await call(env(), cache, `/v1/zh/ch02.mp4?token=${t}`); // 填充
  const hit = await call(env(), cache, `/v1/zh/ch02.mp4?token=${t}`, { headers: { range: "bytes=1000-1001" } });
  assert.equal(hit.status, 416);
  assert.equal(hit.headers.get("content-range"), "bytes */1000");
});

test("缓存不可用（put 抛错）时 Range 退回直接读 R2 区间", async () => {
  const cache = { async put() { throw new Error("boom"); }, async match() { return undefined; } };
  const c = ctx();
  const r = await handleRequest(new Request(`https://v.example.com/v1/zh/ch02.mp4?token=${await tok()}`, { headers: { range: "bytes=0-9" } }), env(), c, cache as never);
  assert.equal(r.status, 206);
  assert.deepEqual(await bytes(r), FILE.slice(0, 10));
});

test("If-None-Match -> 304；If-Range 不匹配 -> 忽略 Range 返回 200；HEAD 无 body", async () => {
  const cache = fakeCache();
  const t = await tok();
  await call(env(), cache, `/v1/zh/ch02.mp4?token=${t}`);
  assert.equal((await call(env(), cache, `/v1/zh/ch02.mp4?token=${t}`, { headers: { "if-none-match": '"etag1"' } })).status, 304);
  const ir = await call(env(), cache, `/v1/zh/ch02.mp4?token=${t}`, { headers: { range: "bytes=0-9", "if-range": '"other"' } });
  assert.equal(ir.status, 200);
  const h = await call(env(), cache, `/v1/zh/ch02.mp4?token=${t}`, { method: "HEAD" });
  assert.equal(h.status, 200);
  assert.equal(h.headers.get("content-length"), "1000");
  assert.equal((await h.arrayBuffer()).byteLength, 0);
});

test("对象不存在 -> 404；POST 视频路径 -> 405", async () => {
  const cache = fakeCache();
  const t = await tok();
  assert.equal((await call(env(), cache, `/v1/zh/ch03.mp4?token=${t}`)).status, 404);
  assert.equal((await call(env(), cache, `/v1/zh/ch02.mp4?token=${t}`, { method: "POST" })).status, 405);
});

test("CORS：仅对配置的来源回显；预检 204", async () => {
  const cache = fakeCache();
  const e = env({ CORS_ORIGINS: "https://app.example.com" });
  const ok = await call(e, cache, "/v1/zh/ch01.mp4", { headers: { origin: "https://app.example.com" } });
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://app.example.com");
  const no = await call(e, cache, "/v1/zh/ch01.mp4", { headers: { origin: "https://evil.example" } });
  assert.equal(no.headers.get("access-control-allow-origin"), null);
  assert.equal((await call(e, cache, "/v1/auth", { method: "OPTIONS", headers: { origin: "https://app.example.com" } })).status, 204);
});

test("POST /v1/auth：端到端（JWS -> token -> 取视频）", async () => {
  const chain = await makeChain();
  const jws = await signJws(chain, basePayload({ signedDate: Date.now() - 1000 }));
  const cache = fakeCache();
  const post = (body: unknown, e = env()) => call(e, cache, "/v1/auth", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
  const untrusted = await post({ signedTransaction: jws, lang: "zh" });
  assert.equal(untrusted.status, 401);
  assert.equal(((await untrusted.json()) as { error: { code: string } }).error.code, "UNTRUSTED_ROOT");
  assert.equal((await post("not json")).status, 400);
  assert.equal((await post({ lang: "zh" })).status, 400);
  assert.equal((await post({ signedTransaction: jws, lang: "xx" })).status, 400);
  assert.equal((await post({ signedTransaction: "a.b.c", lang: "zh" })).status, 400);
  assert.equal((await call(env(), cache, "/v1/auth")).status, 405);
  assert.equal((await post({ signedTransaction: jws, lang: "zh" }, env({ TOKEN_SECRET: "short" }))).status, 500);

  // 注入测试根证书后走通：auth -> token -> 带 token 取付费视频
  const okRes = await call(env(), cache, "/v1/auth", { method: "POST", body: JSON.stringify({ signedTransaction: jws, lang: "zh" }) }, { trustedRoots: [chain.rootDer] });
  assert.equal(okRes.status, 200);
  const j = (await okRes.json()) as { token: string; pathPrefix: string; ttlSeconds: number };
  assert.equal(j.pathPrefix, "/v1/zh/");
  assert.equal(j.ttlSeconds, 900);
  assert.equal((await call(env(), cache, `/v1/zh/ch02.mp4?token=${j.token}`)).status, 200);
  assert.equal((await call(env(), cache, `/v1/en/ch02.mp4?token=${j.token}`)).status, 403);
  // 被撤销的交易拿不到 token
  const revoked = await signJws(chain, basePayload({ signedDate: Date.now() - 1000, revocationDate: Date.now() - 500 }));
  const rv = await call(env(), cache, "/v1/auth", { method: "POST", body: JSON.stringify({ signedTransaction: revoked, lang: "zh" }) }, { trustedRoots: [chain.rootDer] });
  assert.equal(rv.status, 403);
});

test("POST /v1/auth：速率限制返回 429", async () => {
  const e = env({ AUTH_LIMITER: { limit: async () => ({ success: false }) } });
  const r = await call(e, fakeCache(), "/v1/auth", { method: "POST", body: "{}" });
  assert.equal(r.status, 429);
});
