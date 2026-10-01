// 向量全部来自官方文档（见 README 的来源链接）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { signCdnUrl, beijingYmdHm } from "../src/cn/cdn-sign.ts";

// 2020-02-27 16:10:32 UTC+8 == 1582791032
test("阿里云 A：官方示例 1444435200 -> 23bf8505...", () => {
  assert.equal(
    signCdnUrl({ provider: "aliyun-a", origin: "http://domain.example.com", path: "/video/standard/test.mp4", key: "aliyuncdnexp1234", now: 1444435200, rand: "0", uid: "0" }),
    "http://domain.example.com/video/standard/test.mp4?auth_key=1444435200-0-0-23bf85053008f5c0e791667a313e28ce",
  );
});
test("阿里云 B：官方示例 201508150800（北京时间 2015-08-15 08:00 = unix 1439596800）", () => {
  assert.equal(beijingYmdHm(1439596800), "201508150800");
  assert.equal(
    signCdnUrl({ provider: "aliyun-b", origin: "http://domain.example.com", path: "/4/44/44c0909bcfc20a01afaf256ca99a8b8b.mp3", key: "aliyuncdnexp1234", now: 1439596800 }),
    "http://domain.example.com/201508150800/9044548ef1527deadafa49a890a377f0/4/44/44c0909bcfc20a01afaf256ca99a8b8b.mp3",
  );
});
test("阿里云 C：官方示例 55CE8100", () => {
  assert.equal(0x55ce8100, 1439596800);
  assert.equal(
    signCdnUrl({ provider: "aliyun-c", origin: "http://domain.example.com", path: "/test.flv", key: "aliyuncdnexp1234", now: 0x55ce8100 }),
    "http://domain.example.com/a37fa50a5fb8f71214b1e7c95ec7a1bd/55CE8100/test.flv",
  );
});
const TKEY = "dimtm5evg50ijsx2hvuwyfoiu65";
test("腾讯云 TypeA 官方示例", () => {
  assert.equal(
    signCdnUrl({ provider: "tencent-a", origin: "http://cloud.tencent.com", path: "/test.jpg", key: TKEY, now: 1582791032, rand: "im1acp76sx9sdqe601v", uid: "0" }),
    "http://cloud.tencent.com/test.jpg?sign=1582791032-im1acp76sx9sdqe601v-0-3fbb88382c9356b6faaf9d68c7b2ae3a",
  );
});
test("腾讯云 TypeB 官方示例（202002271610）", () => {
  assert.equal(beijingYmdHm(1582791032), "202002271610");
  assert.equal(
    signCdnUrl({ provider: "tencent-b", origin: "http://cloud.tencent.com", path: "/test.jpg", key: TKEY, now: 1582791032 }),
    "http://cloud.tencent.com/202002271610/2e03a07cfa55a47768226d3e5ea82a8d/test.jpg",
  );
});
test("腾讯云 TypeC 官方示例（5e577978）", () => {
  assert.equal(
    signCdnUrl({ provider: "tencent-c", origin: "http://cloud.tencent.com", path: "/test.jpg", key: TKEY, now: 1582791032 }),
    "http://cloud.tencent.com/7913fc0c5c9e92dd3633b7895152bbb2/5e577978/test.jpg",
  );
});
test("腾讯云 TypeD 官方示例", () => {
  assert.equal(
    signCdnUrl({ provider: "tencent-d", origin: "http://cloud.tencent.com", path: "/test.jpg", key: TKEY, now: 1582791032 }),
    "http://cloud.tencent.com/test.jpg?sign=900a5049aa8ac1ab144527d9c2be4cea&t=1582791032",
  );
});
test("七牛 时间戳防盗链：官方示例 T=55bb9b80（中文路径按 url_encode 后签名）", () => {
  const path = "/DIR1/%E4%B8%AD%E6%96%87/vodfile.mp4";
  assert.equal(
    signCdnUrl({ provider: "qiniu", origin: "http://xxx.yyy.com", path, key: "9388f4ba63b89bba5b9b84aa70a92eaac099d39b", now: 0x55bb9b80 - 100, ttlSeconds: 100 }),
    `http://xxx.yyy.com${path}?sign=b4b7f94dd7817ce0283b5491861c3936&t=55bb9b80`,
  );
});
