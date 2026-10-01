import { test } from "node:test";
import assert from "node:assert/strict";
import { signToken, verifyToken } from "../src/shared/token.ts";

const S = "a".repeat(40);
const T0 = Date.UTC(2026, 9, 1);

test("签发后可校验；默认 15 分钟", async () => {
  const { token, expiresAt } = await signToken(S, { prefix: "/v1/zh/", now: T0 });
  assert.equal(expiresAt, T0 / 1000 + 900);
  const r = await verifyToken(token, [S], "/v1/zh/ch02.mp4", T0 + 1000);
  assert.ok(r.ok);
});

test("过期（边界：恰好到期即拒绝）", async () => {
  const { token } = await signToken(S, { prefix: "/v1/zh/", now: T0 });
  assert.ok((await verifyToken(token, [S], "/v1/zh/ch02.mp4", T0 + 899_000)).ok);
  const r = await verifyToken(token, [S], "/v1/zh/ch02.mp4", T0 + 900_000);
  assert.deepEqual(r, { ok: false, error: "EXPIRED" });
});

test("篡改：改 payload、改 MAC、换密钥、残缺", async () => {
  const { token } = await signToken(S, { prefix: "/v1/zh/", now: T0 });
  const [b, m] = token.split(".");
  const evil = Buffer.from(JSON.stringify({ v: 1, exp: T0 / 1000 + 99999, p: "/v1/" })).toString("base64url");
  assert.equal((await verifyToken(`${evil}.${m}`, [S], "/v1/zh/ch02.mp4", T0)).ok, false);
  const flipped = m.slice(0, -1) + (m.endsWith("A") ? "B" : "A");
  assert.deepEqual(await verifyToken(`${b}.${flipped}`, [S], "/v1/zh/ch02.mp4", T0), { ok: false, error: "BAD_SIGNATURE" });
  assert.equal((await verifyToken(token, ["b".repeat(40)], "/v1/zh/ch02.mp4", T0)).ok, false);
  for (const bad of [null, "", "abc", "a.b.c", `${b}.`]) assert.equal((await verifyToken(bad, [S], "/v1/zh/x", T0)).ok, false);
});

test("路径越权：其他语言、前缀伪造、.. 穿越均拒绝", async () => {
  const { token } = await signToken(S, { prefix: "/v1/zh/", now: T0 });
  for (const p of ["/v1/en/ch02.mp4", "/v1/zhx/ch02.mp4", "/v1/zh/../en/ch02.mp4", "/v2/zh/ch02.mp4"]) {
    assert.deepEqual(await verifyToken(token, [S], p, T0), { ok: false, error: "PATH_DENIED" }, p);
  }
});

test("密钥轮换：旧密钥签发的 token 在轮换期内仍有效", async () => {
  const OLD = "o".repeat(40);
  const { token } = await signToken(OLD, { prefix: "/v1/zh/", now: T0 });
  assert.ok((await verifyToken(token, [S, OLD], "/v1/zh/ch02.mp4", T0)).ok);
  assert.equal((await verifyToken(token, [S, ""], "/v1/zh/ch02.mp4", T0)).ok, false);
});
