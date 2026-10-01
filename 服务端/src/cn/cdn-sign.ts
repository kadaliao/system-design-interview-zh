// 国内 CDN URL 鉴权签名。算法与示例向量均取自官方文档（见 README「CDN 鉴权来源」）：
//  - 阿里云 CDN 鉴权方式 A/B/C  https://help.aliyun.com/zh/cdn/user-guide/type-a-signing (type-b-signing / type-c-signing)
//  - 腾讯云 CDN TypeA/B/C/D     https://cloud.tencent.com/document/product/228/41623 (41871 / 41624 / 41625)
//  - 七牛 时间戳防盗链          https://developer.qiniu.com/fusion/kb/1670/timestamp-hotlinking-prevention
//
// 注意：阿里云/腾讯云的 timestamp 是「签发时间」，过期时间 = timestamp + 在 CDN 控制台配置的「有效时长」；
// 七牛的 t 是「过期时间」本身。所以前两家的实际有效期取决于控制台配置。

import { createHash, randomBytes, randomUUID } from "node:crypto";

export type CdnProvider =
  | "aliyun-a" | "aliyun-b" | "aliyun-c"
  | "tencent-a" | "tencent-b" | "tencent-c" | "tencent-d"
  | "qiniu";

export interface SignInput {
  provider: CdnProvider;
  /** 例如 https://cdn.example.cn（不带结尾斜杠） */
  origin: string;
  /** 以 / 开头、已按 URL 规则编码的路径，如 /v1/zh/ch02.mp4 */
  path: string;
  key: string;
  /** 当前 unix 秒 */
  now: number;
  /** 仅七牛使用：链接有效秒数（t = now + ttl） */
  ttlSeconds?: number;
  /** 测试注入 */
  rand?: string;
  uid?: string;
  /** 腾讯 TypeA/D、阿里 C 的 query 参数名（可按控制台设置覆盖） */
  paramNames?: { aliyunA?: string; tencentA?: string; tencentD?: { sign: string; time: string }; qiniu?: { sign: string; time: string } };
}

const md5 = (s: string): string => createHash("md5").update(s, "utf8").digest("hex");

/** UTC+8 的 YYYYMMDDHHMM（阿里云 B、腾讯云 B 要求的北京时间格式） */
export function beijingYmdHm(unixSeconds: number): string {
  const d = new Date((unixSeconds + 8 * 3600) * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

export function signCdnUrl(i: SignInput): string {
  const { origin, path, key, now } = i;
  if (!path.startsWith("/")) throw new Error("path must start with /");
  const ts = String(now);
  switch (i.provider) {
    case "aliyun-a": {
      const rand = i.rand ?? randomUUID().replace(/-/g, ""); // 官方：建议 UUID，不能含中划线
      const uid = i.uid ?? "0";
      const hash = md5(`${path}-${ts}-${rand}-${uid}-${key}`);
      return `${origin}${path}?${i.paramNames?.aliyunA ?? "auth_key"}=${ts}-${rand}-${uid}-${hash}`;
    }
    case "aliyun-b": {
      const t = beijingYmdHm(now);
      return `${origin}/${t}/${md5(`${key}${t}${path}`)}${path}`;
    }
    case "aliyun-c": {
      const t = now.toString(16).toUpperCase(); // 官方示例为大写十六进制 55CE8100
      return `${origin}/${md5(`${key}${path}${t}`)}/${t}${path}`;
    }
    case "tencent-a": {
      const rand = i.rand ?? randomBytes(8).toString("hex");
      const uid = i.uid ?? "0";
      const hash = md5(`${path}-${ts}-${rand}-${uid}-${key}`);
      return `${origin}${path}?${i.paramNames?.tencentA ?? "sign"}=${ts}-${rand}-${uid}-${hash}`;
    }
    case "tencent-b": {
      const t = beijingYmdHm(now);
      return `${origin}/${t}/${md5(`${key}${t}${path}`)}${path}`;
    }
    case "tencent-c": {
      const t = now.toString(16); // 官方示例为小写十六进制 5e577978
      return `${origin}/${md5(`${key}${path}${t}`)}/${t}${path}`;
    }
    case "tencent-d": {
      const names = i.paramNames?.tencentD ?? { sign: "sign", time: "t" };
      return `${origin}${path}?${names.sign}=${md5(`${key}${path}${ts}`)}&${names.time}=${ts}`;
    }
    case "qiniu": {
      const expire = (now + (i.ttlSeconds ?? 900)).toString(16).toLowerCase();
      const names = i.paramNames?.qiniu ?? { sign: "sign", time: "t" };
      // 官方：S = key + url_encode(path) + T。path 已是编码后的形式
      return `${origin}${path}?${names.sign}=${md5(`${key}${path}${expire}`)}&${names.time}=${expire}`;
    }
  }
}

export const CDN_PROVIDERS: CdnProvider[] = [
  "aliyun-a", "aliyun-b", "aliyun-c", "tencent-a", "tencent-b", "tencent-c", "tencent-d", "qiniu",
];
