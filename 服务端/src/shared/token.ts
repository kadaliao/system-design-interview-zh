// 海外源使用的短时效 HMAC token：  base64url(payload JSON) "." base64url(HMAC-SHA256)
// payload = { v:1, exp:<unix 秒>, p:"/v1/zh/", s:<交易短指纹> }
// 校验使用 crypto.subtle.verify（HMAC 校验在 WebCrypto 内部为常量时间比较）。

import { b64urlDecode, b64urlEncode, fromUtf8, utf8 } from "./encoding.ts";

export interface TokenPayload { v: 1; exp: number; p: string; s?: string }
export type TokenError = "MALFORMED" | "BAD_SIGNATURE" | "EXPIRED" | "PATH_DENIED";

export const TOKEN_TTL_SECONDS = 15 * 60;

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function signToken(
  secret: string,
  opts: { prefix: string; now?: number; ttlSeconds?: number; subject?: string },
): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  const exp = now + (opts.ttlSeconds ?? TOKEN_TTL_SECONDS);
  const payload: TokenPayload = { v: 1, exp, p: opts.prefix, ...(opts.subject ? { s: opts.subject } : {}) };
  const body = b64urlEncode(utf8(JSON.stringify(payload)));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), utf8(body)));
  return { token: `${body}.${b64urlEncode(mac)}`, expiresAt: exp };
}

/** secrets 支持轮换：任一密钥验证通过即可（新密钥放第一位用于签发）。 */
export async function verifyToken(
  token: string | null | undefined,
  secrets: string[],
  requestPath: string,
  nowMs: number = Date.now(),
): Promise<{ ok: true; payload: TokenPayload } | { ok: false; error: TokenError }> {
  if (!token || token.length > 1024) return { ok: false, error: "MALFORMED" };
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra !== undefined) return { ok: false, error: "MALFORMED" };
  let macBytes: Uint8Array<ArrayBuffer>;
  let payload: TokenPayload;
  try {
    macBytes = b64urlDecode(mac);
    payload = JSON.parse(fromUtf8(b64urlDecode(body)));
  } catch {
    return { ok: false, error: "MALFORMED" };
  }
  let valid = false;
  for (const s of secrets) {
    if (s && (await crypto.subtle.verify("HMAC", await hmacKey(s, "verify"), macBytes, utf8(body)))) valid = true;
  }
  if (!valid) return { ok: false, error: "BAD_SIGNATURE" };
  if (payload.v !== 1 || typeof payload.exp !== "number" || typeof payload.p !== "string") {
    return { ok: false, error: "MALFORMED" };
  }
  if (Math.floor(nowMs / 1000) >= payload.exp) return { ok: false, error: "EXPIRED" };
  // 路径绑定：prefix 必须以 / 结尾，请求路径必须在其下，且不含 ..
  if (!payload.p.endsWith("/") || !requestPath.startsWith(payload.p) || requestPath.includes("..")) {
    return { ok: false, error: "PATH_DENIED" };
  }
  return { ok: true, payload };
}
