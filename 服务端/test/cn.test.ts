import { test } from "node:test";
import assert from "node:assert/strict";
import { handle } from "../src/cn/handler.ts";
import { createApp } from "../src/cn/server.ts";
import { makeChain, signJws, basePayload, NOW } from "./helpers.ts";

const ENV = {
  APPLE_BUNDLE_ID: "com.kadaliao.SystemDesignQuest",
  APPLE_PRODUCT_IDS: "com.kadaliao.SystemDesignQuest.full",
  CDN_PROVIDER: "tencent-d",
  CDN_BASE_URL: "https://cdn.example.cn/",
  CDN_KEY: "k".repeat(20),
  FREE_BASE_URL: "https://free.example.cn",
};
const post = (body: unknown, env: Record<string, string> = ENV, now = NOW, verifyOverrides = {}) =>
  handle({ method: "POST", path: "/v1/auth", headers: {}, body: typeof body === "string" ? body : JSON.stringify(body) }, { env, now: () => now, verifyOverrides });

test("未配置信任根时（默认 Apple 根）自建链被拒 -> 401 UNTRUSTED_ROOT", async () => {
  const chain = await makeChain();
  const jws = await signJws(chain, basePayload());
  const r = await post({ signedTransaction: jws, lang: "zh" });
  assert.equal(r.status, 401);
  assert.equal(JSON.parse(r.body).error.code, "UNTRUSTED_ROOT");
});

test("请求校验：坏 JSON、缺字段、不支持语言、章节非法、CDN 未配置", async () => {
  assert.equal((await post("{")).status, 400);
  assert.equal((await post({ lang: "zh" })).status, 400);
  assert.equal((await post({ signedTransaction: "a.b.c", lang: "xx" })).status, 400);
  assert.equal((await post({ signedTransaction: "a.b.c", lang: "zh", chapters: [0] })).status, 400);
  assert.equal((await post({ signedTransaction: "a.b.c", lang: "zh", chapters: [29] })).status, 400);
  assert.equal((await post({ signedTransaction: "a.b.c", lang: "zh", chapters: "all" })).status, 400);
  assert.equal((await post({ signedTransaction: "a.b.c", lang: "zh" }, { ...ENV, CDN_KEY: "" })).status, 500);
  assert.equal((await post({ signedTransaction: "a.b.c", lang: "zh" })).status, 400); // MALFORMED
  assert.equal((await handle({ method: "GET", path: "/v1/auth", headers: {}, body: "" }, { env: ENV })).status, 405);
  assert.equal((await handle({ method: "GET", path: "/nope", headers: {}, body: "" }, { env: ENV })).status, 404);
});

test("成功路径：签名 URL 覆盖请求章节，免费章节走免费域名，其余带签名", async () => {
  const chain = await makeChain();
  const env = ENV;
  const vo = { trustedRoots: [chain.rootDer] as never };
  const jws = await signJws(chain, basePayload());
  const r = await post({ signedTransaction: jws, lang: "zh", chapters: [1, 2, 28] }, env, NOW, vo);
  assert.equal(r.status, 200, r.body);
  const j = JSON.parse(r.body);
  assert.deepEqual(Object.keys(j.urls), ["1", "2", "28"]);
  assert.equal(j.urls["1"], "https://free.example.cn/v1/zh/ch01.mp4");
  const t = Math.floor(NOW / 1000);
  assert.match(j.urls["2"], new RegExp(`^https://cdn\\.example\\.cn/v1/zh/ch02\\.mp4\\?sign=[0-9a-f]{32}&t=${t}$`));
  assert.ok(j.urls["28"].includes("/v1/zh/ch28.mp4?sign="));
  assert.equal(j.expiresAt, t + 900);
  // 缺省 chapters = 全部 28 章
  const all = JSON.parse((await post({ signedTransaction: jws, lang: "en" }, env, NOW, vo)).body);
  assert.equal(Object.keys(all.urls).length, 28);
  // 退款后拿不到 URL
  const rev = await signJws(chain, basePayload({ revocationDate: NOW - 1 }));
  assert.equal((await post({ signedTransaction: rev, lang: "zh" }, env, NOW, vo)).status, 403);
});

test("Node HTTP 服务器：/healthz、POST 路由、超大请求体 413", async () => {
  const server = createApp(ENV);
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
  const port = (server.address() as { port: number }).port;
  try {
    assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status, 200);
    const r = await fetch(`http://127.0.0.1:${port}/v1/auth`, { method: "POST", body: JSON.stringify({ signedTransaction: "x", lang: "zh" }) });
    assert.equal(r.status, 400);
    const big = await fetch(`http://127.0.0.1:${port}/v1/auth`, { method: "POST", body: "x".repeat(100_000) }).catch(() => ({ status: 413 }));
    assert.equal(big.status, 413);
  } finally { server.close(); }
});
