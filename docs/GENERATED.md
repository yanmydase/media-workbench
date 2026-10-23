# 本仓库里哪些是"生成的 / 示例的"

面向二次开发者，说明仓库里哪些文件不是手写的、哪些是模板，改之前先看一眼。

## 手写并能直接改的

| 文件 | 说明 |
| --- | --- |
| `index.html` | 页面骨架。**脚本/样式的 `?v=` 版本号在此** |
| `css/app.css` | 全部样式，颜色走 CSS 变量 |
| `js/modules/*.js`、`js/agents/*.js` | 业务逻辑，每个文件是一个 IIFE 模块 |
| `sw.js` | Service Worker。**`VERSION` 常量在此**，与 `index.html` 的 `?v=` 保持一致 |
| `server.py` | 本地/局域网静态服务 + 受限 AI 代理 + 同步存储 |
| `api/`、`functions/` | Vercel / Cloudflare 的代理入口 |
| `tools/*.js` | 零依赖自检与测试 |
| `docs/*.md` | 文档 |

## 示例 / 模板（不要往里放真实值）

| 文件 | 说明 |
| --- | --- |
| `.env.example` | 环境变量模板；真实值放 `.env`（已被 `.gitignore` 忽略） |
| `icon.png` / `icon-512.png` | 占位图标，可替换成自己的品牌图（保持文件名不变即可） |
| `tools/test-core.js` 里的固定数据 | 测试夹具，用 `sk-EXAMPLE…` 这类占位 Key |

## 运行时生成（不会进仓库）

| 路径 | 说明 |
| --- | --- |
| `data/<空间ID>/data.json` | 同步服务端落盘的真实数据 |
| `data/<空间ID>/token.json` | 同步空间口令 |
| `__pycache__/` | Python 字节码缓存 |
| `.vercel/`、`.wrangler/` | 部署平台本地状态 |

以上都写在 `.gitignore` 里。**如果你已经不小心提交过，请务必撤掉，并吊销相关 Key。**

## 版本号要改两处

发版时同时修改：

1. `index.html` 里所有 `?v=X.Y.Z`
2. `sw.js` 里的 `const VERSION = 'xhsh-vX.Y.Z'`

不一致会导致老用户拿到的 `index.html` 与缓存里的旧 JS 混搭 —— 之前正是这个原因造成过"点动物百科跳回每日计划"。
`node tools/check.js` 会校验两者引用的文件都存在，但**不会**校验版本号一致，请手动确认。
