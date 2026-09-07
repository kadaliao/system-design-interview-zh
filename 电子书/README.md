# 电子书下载

- [EPUB 3：系统设计面试笔记-中文版学习版.epub](./系统设计面试笔记-中文版学习版.epub)
- [Kindle AZW3：系统设计面试笔记-中文版学习版.azw3](./系统设计面试笔记-中文版学习版.azw3)

两种格式都包含 28 章中文学习笔记、第 29 章自测题详解、术语速查、延伸阅读、验收附录和全部正文插图。EPUB 适合 Apple Books、Kobo、微信读书导入及多数通用阅读器；AZW3 适合仍支持本地传书的 Kindle 设备或应用。

## 重新构建

需要 Node.js、`marked` 和 Calibre 的 `ebook-convert`。封面栅格化还需要 `rsvg-convert`。

```bash
MARKED_MODULE=/path/to/marked/lib/marked.esm.js \
node 工具/build-ebooks.mjs

python3 工具/verify-ebooks.py --write
```

如果 Calibre 或 `rsvg-convert` 不在常见安装位置，可分别通过 `EBOOK_CONVERT` 和 `RSVG_CONVERT` 指定可执行文件。构建产物的大小和 SHA-256 记录在 [构建信息](./构建信息.json)，结构与回读结果记录在 [电子书检查](../校验/电子书检查.json)。
