// StoreKit 2 交易 JWS（Transaction.jwsRepresentation）验证。
// 只依赖 WebCrypto（crypto.subtle），Cloudflare Workers 与 Node 20+ 均可运行。

import { type Bytes, utf8, b64decode, b64urlDecode, bytesEqual, fromUtf8, hex, sha256 } from "./encoding.ts";
import { parseCertificate, certSignedBy, importCertKey, type ParsedCert } from "./x509.ts";
import {
  APPLE_ROOT_CA_G3_BASE64,
  OID_APPLE_INTERMEDIATE,
  OID_APPLE_LEAF,
} from "./apple-roots.ts";

export type VerifyErrorCode =
  | "MALFORMED"
  | "UNSUPPORTED_ALG"
  | "BAD_CHAIN"
  | "UNTRUSTED_ROOT"
  | "CERT_EXPIRED"
  | "BAD_SIGNATURE"
  | "WRONG_BUNDLE"
  | "WRONG_PRODUCT"
  | "WRONG_ENVIRONMENT"
  | "REVOKED"
  | "EXPIRED"
  | "STALE";

export class VerifyError extends Error {
  constructor(public code: VerifyErrorCode, message?: string) {
    super(message ?? code);
    this.name = "VerifyError";
  }
}

export interface TransactionPayload {
  bundleId: string;
  productId: string;
  environment: string; // "Production" | "Sandbox" | "Xcode" | "LocalTesting"
  transactionId?: string;
  originalTransactionId?: string;
  type?: string;
  purchaseDate?: number;
  signedDate?: number;
  revocationDate?: number;
  revocationReason?: number;
  expiresDate?: number;
  [k: string]: unknown;
}

export interface VerifyOptions {
  bundleId: string;
  /** 允许的 productId（非消耗型「完整版」） */
  productIds: string[];
  /** 允许的环境。默认只允许 Production；TestFlight/App 审核用 Sandbox。 */
  allowedEnvironments?: string[];
  /** signedDate 距 now 的最大秒数（防重放）。0 表示不检查。默认 7 天。 */
  maxSignedAgeSeconds?: number;
  /** signedDate 允许超前 now 的时钟偏差（秒）。默认 300 */
  clockSkewSeconds?: number;
  /** 信任的根证书（DER）。默认内置 Apple Root CA G3。测试可注入。 */
  trustedRoots?: Bytes[];
  /** 是否要求 Apple 私有 OID 扩展（叶证书 6.11.1 / 中间证书 6.2.1）。默认 true。 */
  requireAppleOids?: boolean;
  /** 证书有效期按什么时间判断：signedDate（与 Apple 官方库一致，默认）或 now */
  certTimeBasis?: "signedDate" | "now";
  /** 当前时间（毫秒），测试用 */
  now?: number;
}

const CERT_SKEW_MS = 60_000;

let defaultRoots: Bytes[] | undefined;
function getDefaultRoots(): Bytes[] {
  return (defaultRoots ??= [b64decode(APPLE_ROOT_CA_G3_BASE64)]);
}

async function verifyChain(
  certs: ParsedCert[],
  roots: ParsedCert[],
  effectiveMs: number,
  requireOids: boolean,
): Promise<void> {
  if (certs.length < 2 || certs.length > 4) throw new VerifyError("BAD_CHAIN", "chain length");
  const full = [...certs];
  // 链的最后一张：若本身就是受信任根（DER 完全一致）则止于此；否则必须由受信任根签发
  const last = full[full.length - 1];
  let anchored = roots.some((r) => bytesEqual(r.der, last.der));
  if (!anchored) {
    for (const r of roots) {
      let ok = false;
      try { ok = await certSignedBy(last, r); } catch { ok = false; }
      if (ok) { full.push(r); anchored = true; break; }
    }
  }
  if (!anchored) throw new VerifyError("UNTRUSTED_ROOT", "chain does not end at a trusted root");

  for (const c of full) {
    if (effectiveMs < c.notBefore - CERT_SKEW_MS || effectiveMs > c.notAfter + CERT_SKEW_MS) {
      throw new VerifyError("CERT_EXPIRED", "certificate not valid at signing time");
    }
  }
  for (let i = 0; i < full.length - 1; i++) {
    let ok = false;
    try { ok = await certSignedBy(full[i], full[i + 1]); } catch { ok = false; }
    if (!ok) throw new VerifyError("BAD_CHAIN", `certificate ${i} not signed by certificate ${i + 1}`);
    if (i + 1 < full.length && !full[i + 1].isCA) throw new VerifyError("BAD_CHAIN", "issuer is not a CA");
  }
  if (requireOids) {
    if (!certs[0].extensionOids.has(OID_APPLE_LEAF)) throw new VerifyError("BAD_CHAIN", "leaf lacks Apple OID");
    if (!certs[1].extensionOids.has(OID_APPLE_INTERMEDIATE)) throw new VerifyError("BAD_CHAIN", "intermediate lacks Apple OID");
  }
}

export async function verifyStoreKitTransaction(
  jws: string,
  opts: VerifyOptions,
): Promise<TransactionPayload> {
  const now = opts.now ?? Date.now();
  if (typeof jws !== "string" || jws.length > 16_384) throw new VerifyError("MALFORMED", "bad jws");
  const parts = jws.split(".");
  if (parts.length !== 3) throw new VerifyError("MALFORMED", "jws needs 3 parts");

  let header: { alg?: string; x5c?: unknown };
  let payload: TransactionPayload;
  let sig: Bytes;
  try {
    header = JSON.parse(fromUtf8(b64urlDecode(parts[0])));
    payload = JSON.parse(fromUtf8(b64urlDecode(parts[1])));
    sig = b64urlDecode(parts[2]);
  } catch {
    throw new VerifyError("MALFORMED", "jws not decodable");
  }
  if (header.alg !== "ES256") throw new VerifyError("UNSUPPORTED_ALG", "alg must be ES256");
  if (!Array.isArray(header.x5c) || header.x5c.some((c) => typeof c !== "string")) {
    throw new VerifyError("MALFORMED", "x5c missing");
  }
  if (!payload || typeof payload !== "object") throw new VerifyError("MALFORMED", "payload");

  let certs: ParsedCert[];
  let roots: ParsedCert[];
  try {
    certs = (header.x5c as string[]).map((c) => parseCertificate(b64decode(c)));
    roots = (opts.trustedRoots ?? getDefaultRoots()).map(parseCertificate);
  } catch {
    throw new VerifyError("MALFORMED", "x5c not parseable");
  }

  const effective =
    (opts.certTimeBasis ?? "signedDate") === "signedDate" && typeof payload.signedDate === "number"
      ? payload.signedDate
      : now;
  await verifyChain(certs, roots, effective, opts.requireAppleOids ?? true);

  // ES256：JWS 签名为 raw r||s（64 字节），WebCrypto 同样使用该格式
  if (certs[0].curve.name !== "P-256" || sig.length !== 64) throw new VerifyError("BAD_SIGNATURE", "ES256 needs P-256 leaf");
  const key = await importCertKey(certs[0]);
  const signingInput = utf8(`${parts[0]}.${parts[1]}`);
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig, signingInput);
  if (!ok) throw new VerifyError("BAD_SIGNATURE", "signature mismatch");

  // —— 业务字段 ——
  if (payload.bundleId !== opts.bundleId) throw new VerifyError("WRONG_BUNDLE");
  if (!opts.productIds.includes(payload.productId)) throw new VerifyError("WRONG_PRODUCT");
  const envs = opts.allowedEnvironments ?? ["Production"];
  if (!envs.includes(payload.environment)) throw new VerifyError("WRONG_ENVIRONMENT", `environment ${payload.environment}`);
  if (payload.revocationDate !== undefined && payload.revocationDate !== null) throw new VerifyError("REVOKED");
  if (typeof payload.expiresDate === "number" && payload.expiresDate <= now) throw new VerifyError("EXPIRED");

  const maxAge = opts.maxSignedAgeSeconds ?? 7 * 86400;
  if (maxAge > 0) {
    if (typeof payload.signedDate !== "number") throw new VerifyError("STALE", "signedDate missing");
    const skew = (opts.clockSkewSeconds ?? 300) * 1000;
    if (payload.signedDate > now + skew) throw new VerifyError("STALE", "signedDate in the future");
    if (now - payload.signedDate > maxAge * 1000) throw new VerifyError("STALE", "signedDate too old");
  }
  return payload;
}

/** 不泄露原始 ID 的稳定短标识，用于日志/限流/token 的 sub */
export async function transactionFingerprint(p: TransactionPayload): Promise<string> {
  const id = String(p.originalTransactionId ?? p.transactionId ?? "");
  return hex((await sha256(utf8(id))).subarray(0, 8));
}
