// 测试辅助：在测试里自建「假 Apple」证书链并签发 StoreKit 风格的 JWS。
import { b64encode, b64urlEncode, utf8 } from "../src/shared/encoding.ts";
import { OID_APPLE_INTERMEDIATE, OID_APPLE_LEAF } from "../src/shared/apple-roots.ts";

const cat = (...a: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of a) { out.set(x, o); o += x.length; }
  return out;
};
function tlv(tag: number, content: Uint8Array): Uint8Array {
  const n = content.length;
  const len = n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255];
  return cat(new Uint8Array([tag, ...len]), content);
}
const seq = (...c: Uint8Array[]) => tlv(0x30, cat(...c));
const set = (...c: Uint8Array[]) => tlv(0x31, cat(...c));
const intg = (bytes: Uint8Array) => tlv(0x02, bytes[0] & 0x80 ? cat(new Uint8Array([0]), bytes) : bytes);
function oid(s: string): Uint8Array {
  const p = s.split(".").map(Number);
  const out = [p[0] * 40 + p[1]];
  for (const v of p.slice(2)) {
    const stack = [v & 0x7f];
    let x = v >> 7;
    while (x > 0) { stack.unshift((x & 0x7f) | 0x80); x >>= 7; }
    out.push(...stack);
  }
  return tlv(0x06, new Uint8Array(out));
}
const name = (cn: string) => seq(set(seq(oid("2.5.4.3"), tlv(0x0c, utf8(cn)))));
function utc(ms: number): Uint8Array {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return tlv(0x17, utf8(`${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`));
}
function rawToDer(raw: Uint8Array): Uint8Array {
  const h = raw.length / 2;
  const trim = (b: Uint8Array) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; return b.subarray(i); };
  return seq(intg(trim(raw.subarray(0, h))), intg(trim(raw.subarray(h))));
}

export interface Party {
  name: string;
  curve: "P-256" | "P-384";
  keys: CryptoKeyPair;
  der?: Uint8Array;
}
const HASH_OID = { "SHA-256": "1.2.840.10045.4.3.2", "SHA-384": "1.2.840.10045.4.3.3" } as const;
const CURVE_OID = { "P-256": "1.2.840.10045.3.1.7", "P-384": "1.3.132.0.34" } as const;

export async function newParty(nm: string, curve: "P-256" | "P-384"): Promise<Party> {
  const keys = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: curve }, true, ["sign", "verify"])) as CryptoKeyPair;
  return { name: nm, curve, keys };
}

export async function issueCert(
  subject: Party,
  issuer: Party,
  o: { isCA?: boolean; oids?: string[]; notBefore?: number; notAfter?: number; hash?: "SHA-256" | "SHA-384"; serial?: number } = {},
): Promise<Uint8Array> {
  const hash = o.hash ?? "SHA-384";
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", subject.keys.publicKey));
  const sigAlg = seq(oid(HASH_OID[hash]));
  const exts: Uint8Array[] = [];
  if (o.isCA) exts.push(seq(oid("2.5.29.19"), tlv(0x01, new Uint8Array([0xff])), tlv(0x04, seq(tlv(0x01, new Uint8Array([0xff]))))));
  for (const x of o.oids ?? []) exts.push(seq(oid(x), tlv(0x04, tlv(0x05, new Uint8Array()))));
  const tbs = seq(
    tlv(0xa0, intg(new Uint8Array([2]))),
    intg(new Uint8Array([o.serial ?? 1])),
    sigAlg,
    name(issuer.name),
    seq(utc(o.notBefore ?? Date.UTC(2020, 0, 1)), utc(o.notAfter ?? Date.UTC(2040, 0, 1))),
    name(subject.name),
    spki,
    ...(exts.length ? [tlv(0xa3, seq(...exts))] : []),
  );
  const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash }, issuer.keys.privateKey, tbs));
  return seq(tbs, sigAlg, tlv(0x03, cat(new Uint8Array([0]), rawToDer(raw))));
}

export interface Chain { root: Party; inter: Party; leaf: Party; rootDer: Uint8Array; interDer: Uint8Array; leafDer: Uint8Array }

export async function makeChain(o: { skipLeafOid?: boolean; leafNotAfter?: number; interHash?: "SHA-256" | "SHA-384" } = {}): Promise<Chain> {
  const root = await newParty("Test Root CA", "P-384");
  const inter = await newParty("Test Intermediate", "P-384");
  const leaf = await newParty("Test Leaf", "P-256");
  const rootDer = await issueCert(root, root, { isCA: true, serial: 1 });
  const interDer = await issueCert(inter, root, { isCA: true, oids: [OID_APPLE_INTERMEDIATE], serial: 2, hash: o.interHash });
  const leafDer = await issueCert(leaf, inter, {
    oids: o.skipLeafOid ? [] : [OID_APPLE_LEAF], serial: 3, hash: "SHA-256", notAfter: o.leafNotAfter,
  });
  return { root, inter, leaf, rootDer, interDer, leafDer };
}

export const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);

export function basePayload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    transactionId: "2000000111111111",
    originalTransactionId: "2000000111111111",
    bundleId: "com.kadaliao.SystemDesignQuest",
    productId: "com.kadaliao.SystemDesignQuest.full",
    purchaseDate: NOW - 86_400_000,
    signedDate: NOW - 60_000,
    type: "Non-Consumable",
    environment: "Production",
    ...over,
  };
}

export async function signJws(
  chain: Chain, payload: Record<string, unknown>,
  o: { x5c?: Uint8Array[]; alg?: string; signWith?: CryptoKey } = {},
): Promise<string> {
  const x5c = (o.x5c ?? [chain.leafDer, chain.interDer, chain.rootDer]).map((c) => b64encode(c));
  const h = b64urlEncode(utf8(JSON.stringify({ alg: o.alg ?? "ES256", x5c })));
  const p = b64urlEncode(utf8(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, o.signWith ?? chain.leaf.keys.privateKey, utf8(`${h}.${p}`)));
  return `${h}.${p}.${b64urlEncode(sig)}`;
}

export const OPTS = {
  bundleId: "com.kadaliao.SystemDesignQuest",
  productIds: ["com.kadaliao.SystemDesignQuest.full"],
  now: NOW,
};
