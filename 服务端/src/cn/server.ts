// Node 入口：监听 HTTP，适用于
//  - 阿里云函数计算 FC 3.0「Web 函数」/ 自定义运行时
//  - 腾讯云 SCF「Web 函数」
//  - 任何一台带 Node 20 的国内服务器 / 容器
// 云厂商的 Web 函数要求监听的端口以各自控制台为准（常见为 9000），这里读 PORT，默认 9000。
// 构建：npm run build:cn  → dist/cn/index.js（单文件，无 node_modules 依赖）

import { createServer } from "node:http";
import { handle } from "./handler.ts";

const MAX_BODY = 32 * 1024;

export function createApp(env: Record<string, string | undefined> = process.env) {
  return createServer((req, res) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { res.writeHead(413).end(); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", async () => {
      if (res.writableEnded) return;
      try {
        const headers: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v[0] : v;
        const path = (req.url ?? "/").split("?")[0];
        const r = await handle({ method: req.method ?? "GET", path, headers, body: Buffer.concat(chunks).toString("utf8") }, { env });
        res.writeHead(r.status, r.headers).end(r.body);
      } catch {
        res.writeHead(500, { "content-type": "application/json" }).end('{"ok":false,"error":{"code":"INTERNAL"}}');
      }
    });
  });
}

// 作为入口直接运行时启动（被测试 import 时不启动）
if (process.argv[1] && /(server|index)\.[cm]?[jt]s$/.test(process.argv[1])) {
  const port = Number(process.env.PORT ?? 9000);
  createApp().listen(port, "0.0.0.0", () => console.log(`sdq-video-auth (cn) listening on ${port}`));
}
