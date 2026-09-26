# 交互实验总览

每章正文里嵌入了可操作的小实验：拖动参数、运行预设场景，亲眼看到机制在突发、并发和故障下怎样表现。每个实验都有几个「预设场景」，先读题预测结果，再点运行对照。每章末尾还有自测练习卡，第 29 章顶部是跨章节的练习模式。

实验只在[在线阅读版](https://kadaliao.github.io/system-design-interview-zh/)或本地打开的 `index.html` 中可操作；在 GitHub 或电子书里看到的是一行文字说明。实验进度、自测自评和答案草稿只保存在你自己的浏览器里（localStorage），清除站点数据后会丢失。

## 实验清单

<!-- 实验清单在全部实验完成后补全 -->

- 第 4 章：[五种限流算法同场对比](../04.%20Rate%20Limiter/Readme.md#lab-rate-limiter-arena)、[两台网关抢最后一个名额](../04.%20Rate%20Limiter/Readme.md#lab-rate-limiter-race)

## 维护说明

实验源码在 `交互实验/`：`runtime.js` 与 `runtime.css` 提供统一外框、控件、动画时钟、预设场景、自测练习和本地进度；`labs/` 下每章一个脚本，用 `SDLab.define({...})` 注册实验。Markdown 仍是唯一内容源，正文用下面的占位块决定实验出现的位置：

```html
<div class="sd-lab" id="lab-实验ID" data-lab="实验ID">
<p><strong>交互实验：标题</strong>。一句话说明。<a href="https://kadaliao.github.io/system-design-interview-zh/#d4/lab-实验ID">在线阅读版</a>中可直接操作。</p>
</div>
```

`工具/build-reader.mjs` 会自动引入 `labs/` 下的全部脚本。单独开发某个实验时打开 `交互实验/preview.html?file=04-rate-limiter.js`；验收用：

```bash
PLAYWRIGHT_MODULE="$(npm root -g)/playwright" node 工具/check-labs.cjs            # 全部实验：挂载、运行每个预设场景、检查报错/横向溢出/过小文字
PLAYWRIGHT_MODULE="$(npm root -g)/playwright" node 工具/check-labs.cjs --file 04-rate-limiter.js
```

实验是教学模型，不是生产系统的性能仿真。每个实验底部的「教学模型」说明写明了简化假设；场景结论必须与正文、批注和第 29 章答案一致，修改正文结论时要同步检查对应实验。
