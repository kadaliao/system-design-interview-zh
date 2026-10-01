// 最小 X.509 / DER 解析器，只覆盖验证 Apple StoreKit JWS 证书链所需：
// 颁发者/主体（原始 DER 比较）、有效期、SPKI、签名算法、BasicConstraints、扩展 OID 是否存在。
// 签名校验走 WebCrypto（ECDSA P-256/P-384/P-521）。不支持 RSA 证书（Apple 链全为 EC）。

import { bytesEqual, type Bytes } from "./encoding.ts";

interface TLV { tag: number; start: number; contentStart: number; end: number }

function readTLV(buf: Uint8Array, off: number, limit = buf.length): TLV {
  if (off + 2 > limit) throw new Error("DER: truncated");
  const tag = buf[off];
  let len = buf[off + 1];
  let p = off + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4 || p + n > limit) throw new Error("DER: bad length");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[p++];
  }
  if (p + len > limit) throw new Error("DER: length overflow");
  return { tag, start: off, contentStart: p, end: p + len };
}

function children(buf: Uint8Array, t: TLV): TLV[] {
  const out: TLV[] = [];
  let p = t.contentStart;
  while (p < t.end) {
    const c = readTLV(buf, p, t.end);
    out.push(c);
    p = c.end;
  }
  return out;
}

function oidToString(buf: Uint8Array, t: TLV): string {
  const b = buf.subarray(t.contentStart, t.end);
  if (b.length === 0) throw new Error("DER: empty OID");
  const parts: number[] = [Math.floor(b[0] / 40), b[0] % 40];
  let v = 0;
  for (let i = 1; i < b.length; i++) {
    v = v * 128 + (b[i] & 0x7f);
    if (!(b[i] & 0x80)) { parts.push(v); v = 0; }
  }
  return parts.join(".");
}

function parseTime(buf: Uint8Array, t: TLV): number {
  const s = new TextDecoder().decode(buf.subarray(t.contentStart, t.end));
  let m: RegExpMatchArray | null;
  if (t.tag === 0x17) {
    m = s.match(/^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)Z$/);
    if (!m) throw new Error("DER: bad UTCTime");
    const yy = Number(m[1]);
    return Date.UTC(yy >= 50 ? 1900 + yy : 2000 + yy, +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  }
  if (t.tag === 0x18) {
    m = s.match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)Z$/);
    if (!m) throw new Error("DER: bad GeneralizedTime");
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  }
  throw new Error("DER: unexpected time tag");
}

const SIG_ALGS: Record<string, "SHA-256" | "SHA-384" | "SHA-512"> = {
  "1.2.840.10045.4.3.2": "SHA-256",
  "1.2.840.10045.4.3.3": "SHA-384",
  "1.2.840.10045.4.3.4": "SHA-512",
};
const CURVES: Record<string, { name: "P-256" | "P-384" | "P-521"; size: number }> = {
  "1.2.840.10045.3.1.7": { name: "P-256", size: 32 },
  "1.3.132.0.34": { name: "P-384", size: 48 },
  "1.3.132.0.35": { name: "P-521", size: 66 },
};
const OID_EC_PUBLIC_KEY = "1.2.840.10045.2.1";
const OID_BASIC_CONSTRAINTS = "2.5.29.19";

export interface ParsedCert {
  der: Bytes;
  tbs: Bytes;
  issuer: Uint8Array;
  subject: Uint8Array;
  notBefore: number; // ms
  notAfter: number; // ms
  spki: Bytes;
  curve: { name: "P-256" | "P-384" | "P-521"; size: number };
  sigHash: "SHA-256" | "SHA-384" | "SHA-512";
  sigDer: Bytes; // DER ECDSA-Sig-Value（转 r||s 需要签发者的曲线大小）
  isCA: boolean;
  extensionOids: Set<string>;
}

export function parseCertificate(der: Bytes): ParsedCert {
  const cert = readTLV(der, 0);
  if (cert.tag !== 0x30 || cert.end !== der.length) throw new Error("x509: not a single certificate");
  const [tbsT, sigAlgT, sigT] = children(der, cert);
  if (!tbsT || !sigAlgT || !sigT || tbsT.tag !== 0x30 || sigT.tag !== 0x03) throw new Error("x509: bad structure");
  const algOid = oidToString(der, children(der, sigAlgT)[0]);
  const sigHash = SIG_ALGS[algOid];
  if (!sigHash) throw new Error(`x509: unsupported signature algorithm ${algOid}`);

  const f = children(der, tbsT);
  let i = 0;
  if (f[i].tag === 0xa0) i++; // version
  i++; // serial
  i++; // inner signature alg
  const issuerT = f[i++];
  const validity = children(der, f[i++]);
  const subjectT = f[i++];
  const spkiT = f[i++];
  if (!issuerT || !validity[1] || !subjectT || !spkiT) throw new Error("x509: bad tbs");

  const spkiParts = children(der, spkiT);
  const algParts = children(der, spkiParts[0]);
  if (oidToString(der, algParts[0]) !== OID_EC_PUBLIC_KEY) throw new Error("x509: only EC keys supported");
  const curve = CURVES[oidToString(der, algParts[1])];
  if (!curve) throw new Error("x509: unsupported curve");

  let isCA = false;
  const extensionOids = new Set<string>();
  for (; i < f.length; i++) {
    if (f[i].tag !== 0xa3) continue;
    const extSeq = children(der, children(der, f[i])[0]);
    for (const e of extSeq) {
      const parts = children(der, e);
      const oid = oidToString(der, parts[0]);
      extensionOids.add(oid);
      if (oid === OID_BASIC_CONSTRAINTS) {
        const octet = parts[parts.length - 1];
        const inner = readTLV(der, octet.contentStart, octet.end);
        const bc = children(der, inner);
        isCA = bc.length > 0 && bc[0].tag === 0x01 && der[bc[0].contentStart] !== 0;
      }
    }
  }

  // BIT STRING: 第一个字节是 unused-bits，其后为 DER 编码的 ECDSA-Sig-Value
  const sigDer = der.subarray(sigT.contentStart + 1, sigT.end);
  return {
    der,
    tbs: der.subarray(tbsT.start, tbsT.end),
    issuer: der.subarray(issuerT.start, issuerT.end),
    subject: der.subarray(subjectT.start, subjectT.end),
    notBefore: parseTime(der, validity[0]),
    notAfter: parseTime(der, validity[1]),
    spki: der.subarray(spkiT.start, spkiT.end),
    curve,
    sigHash,
    sigDer,
    isCA,
    extensionOids,
  };
}

function derSigToRaw(der: Bytes, size: number): Bytes {
  const seq = readTLV(der, 0);
  if (seq.tag !== 0x30) throw new Error("ecdsa: bad signature");
  const [r, s] = children(der, seq);
  const out: Bytes = new Uint8Array(size * 2);
  for (const [t, off] of [[r, 0], [s, size]] as const) {
    if (t.tag !== 0x02) throw new Error("ecdsa: bad integer");
    let v = der.subarray(t.contentStart, t.end);
    while (v.length > 0 && v[0] === 0) v = v.subarray(1);
    if (v.length > size) throw new Error("ecdsa: integer too large");
    out.set(v, off + size - v.length);
  }
  return out;
}

export async function importCertKey(cert: ParsedCert, usage: "verify" = "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("spki", cert.spki, { name: "ECDSA", namedCurve: cert.curve.name }, false, [usage]);
}

/** 用 issuer 的公钥校验 cert 的签名（ECDSA）。 */
export async function certSignedBy(cert: ParsedCert, issuer: ParsedCert): Promise<boolean> {
  if (!bytesEqual(cert.issuer, issuer.subject)) return false;
  const key = await importCertKey(issuer);
  const raw = derSigToRaw(cert.sigDer, issuer.curve.size);
  return crypto.subtle.verify({ name: "ECDSA", hash: cert.sigHash }, key, raw, cert.tbs);
}
