# 贡献指南 · 小小花狮

感谢你愿意一起把它做得更好 🌿 这个项目刻意保持"零依赖、零构建"，所以贡献起来非常轻：
**不需要装任何开发依赖，改完文件刷新浏览器就能看到效果。**

---

## 1. 先跑起来

```bash
git clone <你的 fork 地址>
cd media-workbench
python server.py            # 打开 http://localhost:8080
```

改完代码后请先跑自检（只用 Node 内置模块，无需 `npm install`）：

```bash
npm run check               # 语法 / 资源引用 / data-action 绑定 / 预缓存清单 / 文档链接
npm test                    # test-core.js（核心逻辑）+ test-sync.js（多设备同步，会临时起 server.py）
```

> `npm test` 里的同步测试需要本机有 `python` 命令；没有的话只跑 `node tools/check.js` 也可以。

---

## 2. 目录与扩展点

| 想做的事 | 改这里 |
| --- | --- |
| 新增一个页面 / 功能模块 | `js/modules/<name>.js` + `index.html` 里加 `<div class="page" id="page-<name>">` + `js/modules/router.js` 的 `PAGES` + `js/app.js` 注册 |
| 新增一个智能体 | `js/agents/registry.js` 的 `BUILTIN`（提示词 / 快捷指令 / 可用工具 / 跳转页面） |
| 新建带专属界面的智能体 | `js/agents/<name>.js`，参考 `wisdom.js`（对话页）与 `zoo.js`（结构化学习包） |
| 换配图风格 | `js/modules/illustrate.js`（纯 SVG 引擎，默认零依赖） |
| 调整 DeepSeek 接入 | `js/modules/ai-client.js`（地址规范化、流式、错误可读化） |
| 同步协议 | 前端 `js/modules/sync.js`，服务端 `server.py` 的 `_merge_into` |
| 样式 | `css/app.css`（所有颜色走 CSS 变量，浅色/深色主题在 `:root` 与 `[data-theme="dark"]`） |

各模块统一形态：

```js
(function (XHSH) {
  'use strict';
  window.XxxModule = { mount: function () { /* 渲染 */ } };
  XHSH.on('xxx-action', function (el, ev, ds) { /* 交互 */ });
})(window.XHSH);
```

> 注意：`index.html` 里的脚本都带 `?v=` 版本号。**发版时请同时修改** `index.html` 的 `?v=` 与
> `sw.js` 的 `VERSION`，否则老用户可能拿到新旧混搭的缓存。

---

## 3. 编码约定

- **不用框架、不用打包**：原生 JS（ES2019 语法即可）+ CSS 变量。
- **交互一律走 `data-action` + `XHSH.on()`**，不要写内联 `onclick`（`npm run check` 会检查绑定）。
- **日期只用本地时间**：`XHSH.today()` / `XHSH.dateStr()`，不要用 `toISOString().slice(0,10)`（东八区会差一天）。
- **金额用"分"存**（`amountCents`），展示时格式化。
- **删除用墓碑**（`deletedAt`），不要 `splice` 掉，否则同步会"复活"。
- **文案面向中文用户**，术语第一次出现时给一句解释。
- **注释写"为什么"**，不写"是什么"。

---

## 4. 提交与 PR

1. Fork → 建分支：`feat/xxx`、`fix/xxx`、`docs/xxx`；
2. 提交信息建议用约定式前缀：`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`；
3. PR 描述里写清：**改了什么、为什么、怎么验证的**（截图或命令输出最好）；
4. CI 会自动跑 `node tools/check.js` 与 `node tools/test-core.js`，请保证绿色。

单个 PR 尽量只做一件事，方便 review 和回滚。

---

## 5. 提交前检查清单

- [ ] `npm run check` 0 错误 0 警告
- [ ] `node tools/test-core.js` 全部通过
- [ ] 改了同步相关逻辑 → 跑过 `node tools/test-sync.js`
- [ ] 动了 `index.html` 的脚本/样式 → 同步更新 `?v=` 与 `sw.js` 的 `VERSION`
- [ ] 没有提交任何真实 API Key、口令、`data/` 里的个人数据（见下）

---

## 6. 绝对不要提交的内容

| 内容 | 说明 |
| --- | --- |
| `DEEPSEEK_API_KEY` / `sk-…` | 任何人拿到都能花你的钱；泄漏请立刻去控制台吊销 |
| `.env` | 只为示例保留 `.env.example` |
| `data/` | 同步服务器落盘的真实数据（打卡、聊天记录、Key） |
| `.vercel/` `.wrangler/` | 部署平台账号信息 |
| 真实用户数据 | 提 issue / 截图前请清掉个人信息 |

`.gitignore` 已经覆盖了以上全部；如果发现遗漏欢迎提 PR。

---

## 7. 行为准则

参与本项目即表示同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)：
友善、就事论事、不人身攻击、不发布他人的隐私数据。

---

## 8. 适合新手的第一批任务

见 [docs/ROADMAP.md](docs/ROADMAP.md) 里带 `good first issue` 标记的方向，例如：

- 给动物百科补几种常见动物的"特征识别"规则（`illustrate.js` 的 `TRAITS`）
- 新增一个内置智能体（只改 `registry.js` 的 `BUILTIN`）
- 为 `tools/test-core.js` 增加一个边界用例
- 补一个页面的移动端样式问题

有想法但不确定怎么做，直接开 Discussion 聊即可 🙌
