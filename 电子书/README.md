# 电子书下载

- [EPUB 3（约 79 MB）](https://github.com/kadaliao/system-design-interview-zh/releases/latest/download/system-design-interview-zh.epub)
- [Kindle AZW3（约 85 MB）](https://github.com/kadaliao/system-design-interview-zh/releases/latest/download/system-design-interview-zh.azw3)

文件发布在 [GitHub Releases](https://github.com/kadaliao/system-design-interview-zh/releases)，不进 Git。

两种格式都包含 28 章中文学习笔记、第 29 章自测题详解、术语速查、延伸阅读、验收附录和全部正文插图。EPUB 适合 Apple Books、Kobo、微信读书导入及多数通用阅读器；AZW3 适合仍支持本地传书的 Kindle 设备或应用。

## 重新构建

需要 Node.js、`marked` 和 Calibre 的 `ebook-convert`。封面栅格化还需要 `rsvg-convert`。

```bash
MARKED_MODULE=/path/to/marked/lib/marked.esm.js \
node 工具/build-ebooks.mjs

python3 工具/verify-ebooks.py --write
```

如果 Calibre 或 `rsvg-convert` 不在常见安装位置，可分别通过 `EBOOK_CONVERT` 和 `RSVG_CONVERT` 指定可执行文件。构建产物的大小和 SHA-256 记录在 [构建信息](./构建信息.json)，结构与回读结果记录在 [电子书检查](../校验/电子书检查.json)。

构建产物在本目录下，文件名是 `系统设计面试笔记-中文版学习版.epub/.azw3`，已被 `.gitignore` 忽略。GitHub 会丢掉资源名里的中文，所以发布时改用英文文件名、中文作为显示标签：

```bash
tag=ebook-$(date +%F)
git tag -a "$tag" -m "电子书 $(date +%F)" && git push origin "$tag"
gh release create "$tag" --title "电子书 $(date +%F)" --notes "见 电子书/构建信息.json" \
  "电子书/系统设计面试笔记-中文版学习版.epub#系统设计面试笔记-中文版学习版.epub" \
  "电子书/系统设计面试笔记-中文版学习版.azw3#系统设计面试笔记-中文版学习版.azw3"
# 上传后把资源名改成 system-design-interview-zh.epub / .azw3，下载链接指向 releases/latest 才能保持不变
for a in $(gh api repos/kadaliao/system-design-interview-zh/releases/tags/$tag --jq '.assets[]|"\(.id):\(.name)"'); do
  gh api -X PATCH repos/kadaliao/system-design-interview-zh/releases/assets/${a%%:*} -f name="system-design-interview-zh.${a##*.}"
done
```
