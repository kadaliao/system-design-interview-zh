import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyStoreKitTransaction, VerifyError } from "../src/shared/storekit.ts";
import { parseCertificate, certSignedBy } from "../src/shared/x509.ts";
import { APPLE_ROOT_CA_G3_BASE64, APPLE_ROOT_CA_G3_SHA256_HEX } from "../src/shared/apple-roots.ts";
import { b64decode, b64urlEncode, hex, sha256, utf8 } from "../src/shared/encoding.ts";
import { makeChain, signJws, basePayload, newParty, issueCert, NOW, OPTS } from "./helpers.ts";

const chainP = makeChain();
const opts = async (extra: object = {}) => ({ ...OPTS, trustedRoots: [(await chainP).rootDer] as never, ...extra });
const code = async (p: Promise<unknown>) => {
  try { await p; return "OK"; } catch (e) { assert.ok(e instanceof VerifyError, String(e)); return e.code; }
};

test("内置 Apple Root CA G3：SHA-256 指纹与官方下载值一致，且自签名可被 WebCrypto 验证", async () => {
  const der = b64decode(APPLE_ROOT_CA_G3_BASE64);
  assert.equal(hex(await sha256(der)), APPLE_ROOT_CA_G3_SHA256_HEX);
  assert.equal(APPLE_ROOT_CA_G3_SHA256_HEX, "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179");
  const c = parseCertificate(der);
  assert.equal(c.curve.name, "P-384");
  assert.ok(c.isCA);
  assert.equal(new Date(c.notAfter).toISOString(), "2039-04-30T18:19:06.000Z");
  assert.ok(await certSignedBy(c, c), "真实 Apple 根证书自签名应通过（验证 DER 解析与 ECDSA 转换）");
});

test("正常：有效 JWS 通过", async () => {
  const c = await chainP;
  const tx = await verifyStoreKitTransaction(await signJws(c, basePayload()), await opts());
  assert.equal(tx.productId, "com.kadaliao.SystemDesignQuest.full");
});

test("正常：x5c 不含根证书时由受信任根补全", async () => {
  const c = await chainP;
  const jws = await signJws(c, basePayload(), { x5c: [c.leafDer, c.interDer] });
  await verifyStoreKitTransaction(jws, await opts());
});

test("expiresDate 已过期 -> EXPIRED；未来 -> 通过", async () => {
  const c = await chainP;
  assert.equal(await code(verifyStoreKitTransaction(await signJws(c, basePayload({ expiresDate: NOW - 1000 })), await opts())), "EXPIRED");
  assert.equal(await code(verifyStoreKitTransaction(await signJws(c, basePayload({ expiresDate: NOW + 1e6 })), await opts())), "OK");
});

test("revocationDate 存在（退款/撤销）-> REVOKED", async () => {
  const c = await chainP;
  const jws = await signJws(c, basePayload({ revocationDate: NOW - 5000, revocationReason: 0 }));
  assert.equal(await code(verifyStoreKitTransaction(jws, await opts())), "REVOKED");
});

test("bundleId / productId 不符", async () => {
  const c = await chainP;
  assert.equal(await code(verifyStoreKitTransaction(await signJws(c, basePayload({ bundleId: "com.evil.app" })), await opts())), "WRONG_BUNDLE");
  assert.equal(await code(verifyStoreKitTransaction(await signJws(c, basePayload({ productId: "other.product" })), await opts())), "WRONG_PRODUCT");
});

test("环境策略：默认只允许 Production；可配置 Sandbox；Xcode 本地环境默认拒绝", async () => {
  const c = await chainP;
  const sb = await signJws(c, basePayload({ environment: "Sandbox" }));
  assert.equal(await code(verifyStoreKitTransaction(sb, await opts())), "WRONG_ENVIRONMENT");
  assert.equal(await code(verifyStoreKitTransaction(sb, await opts({ allowedEnvironments: ["Production", "Sandbox"] }))), "OK");
  const xc = await signJws(c, basePayload({ environment: "Xcode" }));
  assert.equal(await code(verifyStoreKitTransaction(xc, await opts({ allowedEnvironments: ["Production", "Sandbox"] }))), "WRONG_ENVIRONMENT");
});

test("证书链不可信：另一个根签发 / 使用内置 Apple 根", async () => {
  const c = await chainP;
  const jws = await signJws(c, basePayload());
  const other = await makeChain();
  assert.equal(await code(verifyStoreKitTransaction(jws, { ...OPTS, trustedRoots: [other.rootDer] as never })), "UNTRUSTED_ROOT");
  assert.equal(await code(verifyStoreKitTransaction(jws, OPTS)), "UNTRUSTED_ROOT"); // 默认只信 Apple Root CA G3
});

test("证书链被替换：叶证书不是由中间证书签发 -> BAD_CHAIN", async () => {
  const c = await chainP;
  const rogue = await newParty("Rogue", "P-256");
  const rogueDer = await issueCert(rogue, rogue, { hash: "SHA-256", oids: ["1.2.840.113635.100.6.11.1"] });
  const jws = await signJws(c, basePayload(), { x5c: [rogueDer, c.interDer, c.rootDer], signWith: rogue.keys.privateKey });
  assert.equal(await code(verifyStoreKitTransaction(jws, await opts())), "BAD_CHAIN");
});

test("缺少 Apple 私有 OID -> BAD_CHAIN（可关闭）", async () => {
  const c = await makeChain({ skipLeafOid: true });
  const jws = await signJws(c, basePayload());
  assert.equal(await code(verifyStoreKitTransaction(jws, { ...OPTS, trustedRoots: [c.rootDer] as never })), "BAD_CHAIN");
  assert.equal(await code(verifyStoreKitTransaction(jws, { ...OPTS, trustedRoots: [c.rootDer] as never, requireAppleOids: false })), "OK");
});

test("叶证书已过期（按 signedDate 判断）-> CERT_EXPIRED", async () => {
  const c = await makeChain({ leafNotAfter: NOW - 10 * 86_400_000 });
  const jws = await signJws(c, basePayload());
  assert.equal(await code(verifyStoreKitTransaction(jws, { ...OPTS, trustedRoots: [c.rootDer] as never })), "CERT_EXPIRED");
});

test("签名/载荷被篡改 -> BAD_SIGNATURE", async () => {
  const c = await chainP;
  const jws = await signJws(c, basePayload());
  const [h, p, s] = jws.split(".");
  const forged = b64urlEncode(utf8(JSON.stringify(basePayload({ productId: "com.kadaliao.SystemDesignQuest.full", expiresDate: NOW + 9e9 }))));
  assert.equal(await code(verifyStoreKitTransaction(`${h}.${forged}.${s}`, await opts())), "BAD_SIGNATURE");
  const bad = s.slice(0, -2) + (s.endsWith("AA") ? "BB" : "AA");
  assert.equal(await code(verifyStoreKitTransaction(`${h}.${p}.${bad}`, await opts())), "BAD_SIGNATURE");
});

test("签名由别的密钥签 -> BAD_SIGNATURE", async () => {
  const c = await chainP;
  const other = await newParty("x", "P-256");
  const jws = await signJws(c, basePayload(), { signWith: other.keys.privateKey });
  assert.equal(await code(verifyStoreKitTransaction(jws, await opts())), "BAD_SIGNATURE");
});

test("重放：signedDate 过旧 / 在未来 / 缺失 -> STALE；窗口可配置、可关闭", async () => {
  const c = await chainP;
  const old = await signJws(c, basePayload({ signedDate: NOW - 8 * 86_400_000 }));
  assert.equal(await code(verifyStoreKitTransaction(old, await opts())), "STALE");
  assert.equal(await code(verifyStoreKitTransaction(old, await opts({ maxSignedAgeSeconds: 30 * 86400 }))), "OK");
  assert.equal(await code(verifyStoreKitTransaction(old, await opts({ maxSignedAgeSeconds: 0 }))), "OK");
  const recent = await signJws(c, basePayload({ signedDate: NOW - 120_000 }));
  assert.equal(await code(verifyStoreKitTransaction(recent, await opts({ maxSignedAgeSeconds: 60 }))), "STALE");
  const fut = await signJws(c, basePayload({ signedDate: NOW + 3_600_000 }));
  assert.equal(await code(verifyStoreKitTransaction(fut, await opts())), "STALE");
  const none = await signJws(c, (() => { const p = basePayload(); delete p.signedDate; return p; })());
  assert.equal(await code(verifyStoreKitTransaction(none, await opts())), "STALE");
});

test("畸形输入 / alg 非 ES256（含 none）", async () => {
  const c = await chainP;
  for (const bad of ["", "a.b", "a.b.c.d", "!!!.@@@.###"]) {
    assert.equal(await code(verifyStoreKitTransaction(bad, await opts())), "MALFORMED");
  }
  assert.equal(await code(verifyStoreKitTransaction(await signJws(c, basePayload(), { alg: "none" }), await opts())), "UNSUPPORTED_ALG");
  assert.equal(await code(verifyStoreKitTransaction(await signJws(c, basePayload(), { alg: "HS256" }), await opts())), "UNSUPPORTED_ALG");
});
