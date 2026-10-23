# 小小花狮 · 个人效率工作台 | media-workbench

> 一个"能陪你成行"的本地优先工作台：每日计划 / 运动 / CET-6 背单词 / 复盘 / 笔记 / 记账 / 天气，
> 外加两个用 DeepSeek 驱动的 AI 智能体——**🦁 智慧花狮**（学习与写作伙伴）和 **🐾 动物百科**（给孩子的沉浸式博物学习包）。
> **零 npm 依赖、零构建、可离线**；数据默认只存在你自己的浏览器里。

<p>
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue.svg">
  <img alt="deps" src="https://img.shields.io/badge/dependencies-0-brightgreen.svg">
  <img alt="build" src="https://img.shields.io/badge/build-none%20needed-lightgrey.svg">
  <img alt="pwa" src="https://img.shields.io/badge/PWA-offline--first-5a0fc8.svg">
</p>

> 本项目面向**一起学习与改进**而开源：你可以直接用，也可以读代码学"零依赖前端该怎么组织"。
> 欢迎从 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [docs/ROADMAP.md](docs/ROADMAP.md) 开始参与 🙌

---

## 目录

- [它长什么样](#它长什么样)
- [快速开始](#快速开始)
- [功能一览](#功能一览)
- [DeepSeek 配置](#deepseek-配置两种模式)
- [智慧花狮 · 动物百科](#智慧花狮--动物百科)
- [架构与数据模型](#架构与数据模型)
- [目录结构](#目录结构)
- [实时同步（可选）](#实时同步可选)
- [部署](#部署)
- [测试与自检](#测试与自检)
- [常见问题](#常见问题)
- [参与贡献](#参与贡献)
- [开源协议](#开源协议)

---

## 它长什么样

| 每日计划 | 动物百科 · 学习包 |
| --- | --- |
| 日历 + 任务勾选 + 睡觉提醒，记住你上次看的那一天 | 输入动物名 → 基础卡片 / 生存剧本 / 生态位图谱 / 思考题 |

> 截图位：欢迎提 PR 补上 `docs/images/` 下的截图（`plan.png`、`zoo.png`、`wisdom.png`）。

**一个"学习包"里包含什么**

| 部分 | 内容 |
| --- | --- |
| ① 基础卡片 | 分类、栖息地、食性、保护等级（国内名录 + IUCN）、体型、寿命、一句"超能力" |
| ② 易混淆辨析 | 小熊猫 vs 浣熊这类真容易混的物种，两张自动生成的肖像并排对比 |
| ③ 生存剧本 | 第一人称，按 清晨→正午→黄昏→夜 分场景，含觅食 / 避险 / 育幼，适合 10–15 岁 |
| ④ 生态位图谱 | 图形化关系网：猎物（箭头指向主角）、天敌（红色虚线）、共生伙伴（蓝色虚线）+ 食物链 |
| ⑤ 趣味思考题 | 问题 + 三步引导 + 结论，例如"为什么水獭要手拉手睡觉？" |

配图由内置的**纯 SVG 插画引擎**实时绘制：不需要图片服务、不需要额外 Key、断网也能画，
大熊猫黑耳黑肩、小熊猫红褐白脸、企鹅黑面罩橙喙、大象象牙象鼻都能识别出来。

---

## 快速开始

### 方式一：本地 / 局域网运行（推荐）

```bash
git clone https://github.com/OWNER/REPO.git
cd REPO

python server.py        # 默认 http://0.0.0.0:8080
# 或者
npm start               # 等价于 python server.py
```

- 电脑访问 <http://localhost:8080>
- 手机（同一 WiFi）打开终端里打印的 `http://<局域网IP>:8080`，浏览器菜单「安装应用 / 添加到主屏幕」
- 首次使用：打开 **🐾 动物百科** 或 **🦁 智慧花狮**，在页面顶部填一次 DeepSeek API Key

> 需要 Python 3.9+；只用到标准库，不用 `pip install`。

### 方式二：纯静态托管

把 `index.html`、`css/`、`js/`、`manifest.json`、`sw.js`、图标一起丢到任意静态托管（GitHub Pages / Netlify / Vercel）即可。
没有 `/api` 后端时，"浏览器直连 DeepSeek"模式照常可用，同步与代理不可用。

### 方式三：直接双击 `index.html`

本地功能与 AI 直连都能用，但 PWA（离线安装）与代理不可用。

---

## 功能一览

| 模块 | 能力 |
| --- | --- |
| 📅 每日计划 | 月历视图、任务勾选、自定义任务、睡觉提醒；**记住上次查看的日期**，同步也不会跳回今天 |
| 💪 运动健身 | 记录类型/时长/热量，近 7 天柱状图 |
| 📖 英语学习 | CET-6 词库（295 词）、每日新词、间隔复习、发音（TTS）、跟读录音、易错本 |
| 📝 每日复盘 | 心情、感恩事项、草稿自动保存、历史回溯 |
| 🌸 随笔笔记 | 标签、搜索、Markdown 风格文本 |
| 💰 收入记账 | 以"分"存储（无浮点误差）、按年月统计、墓碑删除 |
| 🌤️ 天气 | wttr.in 免费接口、20 分钟缓存、**定位（浏览器定位失败自动回落 IP 定位）** |
| 🦁 智慧花狮 | 多轮对话、流式输出、可停止/复制/清空、调用历史复用；一键画卡通图 |
| 🐾 动物百科 | 输入动物名生成沉浸式博物学习包，可复制文字版、导出 PNG、按模型缓存 |
| 🧩 智能体工作台 | 数据驱动的自定义智能体（人设 + 快捷指令 + 只读数据工具），支持导入/导出 JSON |
| ☁️ 同步（可选） | 同一局域网/同一台服务器下多设备共享一份数据，按字段/按天合并 |

---

## DeepSeek 配置（两种模式）

需要先在 [platform.deepseek.com](https://platform.deepseek.com) 申请 API Key。
默认模型是 **`deepseek-flash`（= DeepSeek V4.1 Flash 1017）**；`deepseek-v4-pro` 更强但更贵更慢。

### 模式 A：浏览器端填 Key（默认，最简单）

1. 打开 **🦁 智慧花狮** 或 **🐾 动物百科**，点右上角 **⚙️ 模型**；
2. 粘贴 `sk-…`（不要带引号/空格，程序会自动清理）；
3. 点 **🔌 测试连接**，通过后自动保存。

Key **只存在这台设备的浏览器里**，不会上传到本项目的任何服务器。

**测试连接失败时，会告诉你具体是哪一种问题：**

| 提示 | 含义 | 处理 |
| --- | --- | --- |
| Key 无效 / 已失效（HTTP 401） | Key 填错、被禁用，或带了空格/引号 | 重新复制 Key |
| 账户余额不足（HTTP 402） | 账户没充值 | 去 DeepSeek 控制台充值 |
| 接口地址不正确（HTTP 404） | 地址填错 | 填回 `https://api.deepseek.com` |
| 无法连接 api.deepseek.com | 网络/防火墙拦截或 HTTPS 被代理解密 | **会自动改用本机代理重试**；仍失败请用模式 B |
| 请求过于频繁（HTTP 429） | 触发限流 | 稍后再试 |

> 旧的 `deepseek-chat` / `deepseek-reasoner` 已于 2026-07-24 停止服务，程序会把老配置自动迁移到 `deepseek-flash`。

### 模式 B：走本项目代理（公司/校园网、多人共用）

```bash
cp .env.example .env
```

```env
DEEPSEEK_API_KEY=sk-你的Key       # 填了的话，浏览器就不用再填 Key
UPSTREAM_BASE=https://api.deepseek.com
PROXY_TOKEN=可选的口令
```

重启 `server.py`，前端模型设置里选「**通过本机服务转发（/api）**」即可。

代理只放行 `/v1/chat/completions` 与 `/v1/models`，限制请求体大小、来源白名单、可选口令；
隐藏文件与 `data/` 目录一律 404。

---

## 智慧花狮 · 动物百科

### 🦁 智慧花狮（`#/ai`）

伴你成行的智慧小伙伴：解释概念、写作修改、学习规划、情绪陪伴、拆解复杂问题。
顶部"模型条"显示当前模型与连接状态（绿=已连接 / 黄=待配置 / 红=连接失败），
点 **⚙️ 模型** 是唯一设置入口；未配置时页内直接出现 Key 输入框，不弹窗干扰。

### 🐾 动物百科（`#/zoo`）

**独立页面 + 独立模型**：默认 `deepseek-flash`，可在它的 **⚙️ 模型** 里切到 `deepseek-v4-pro`；
API Key 与智慧花狮共用同一份（在哪一页填都行）。

生成的流程是"结构化输出 → 结构化渲染"：模型只返回一份 JSON（卡片/剧本/图谱关系/思考题），
前端负责排版与配图，因此每一部分都能稳定地变成图形，而不是一段难以阅读的长文。

### 配图是怎么来的（无外部依赖）

`js/modules/illustrate.js` 是一个纯 SVG 插画引擎：

- **特征识别**：从名字/栖息地推出耳型（长/圆/簇/尖）、角、象鼻、尾巴（蓬松/环纹/鳍）、
  花纹（条纹/斑点/黑白/企鹅面罩）、栖息地（森林/草原/水域/极地/荒漠/高空/夜行）与配色；
- **卡通肖像**：统一的圆脸 + 大眼睛 + 场景背景（树、雪山、水面、沙丘、夜空）；
- **生态位图谱**：关系网自动布局，含图例与箭头方向；
- 全部矢量，缩放不糊，单张只有几 KB。

想换成"AI 生成真实插画"也很容易：把 `XHSH.illustrate.portrait()` 的返回值换成任意图片 URL 即可。

---

## 架构与数据模型

```
index.html
   └─ core.js ──► XHSH.data（分片：meta/plan/fitness/english/review/incomes/notes/ai/settings）
        │              ├─ localStorage: xhsh.v2.<分片>
        │              └─ 首次启动：若存在 v1 的 xhsh_data → 自动迁移（保留原键）
   ├─ router.js ──► 哈希路由 #/plan、#/zoo…；主题；侧边栏
   ├─ data.js   ──► 导出/导入 JSON、快照、清除
   ├─ agents/registry.js ──► 智能体定义 + 只读工具（stats/review/fitness/plan）
   ├─ agents/wisdom.js、zoo.js ──► 两个智能体各自的页面
   ├─ modules/*.js ──► 各页面：mount() 渲染 + XHSH.on('action', …) 处理交互
   ├─ illustrate.js ──► 纯 SVG 插画引擎（肖像 / 生态位图谱）
   └─ ai-client.js ──► fetch → https://api.deepseek.com/v1/chat/completions（SSE 流式）
```

**关键设计**

| 设计 | 说明 |
| --- | --- |
| 分片存储 | 每次保存只写变化的模块，避免单键大对象写满配额 |
| `schemaVersion` | 当前为 2。`core.js` 的 `migrate()` 是唯一的升级入口 |
| 本地时间 | 一律通过 `XHSH.today() / dateStr()`，不用 `toISOString()`（东八区会差一天） |
| 金额 | 以"分"（`amountCents`）存储，展示时格式化，杜绝 `0.1+0.2` 误差 |
| 事件委托 | 交互统一 `data-action` + `XHSH.on()`，无内联 `onclick`，天然免疫引号注入 |
| 删除 | 写入 `deletedAt` 墓碑，同步不会"复活"已删数据 |
| 缓存一致性 | 脚本带 `?v=` 版本号；SW 安装时清旧缓存；启动自检失败自动清缓存重载 |

**数据分片一览**

| 分片 | 内容 |
| --- | --- |
| `plan` | `tasks[]`、`checkins{日期: [任务id]}`、`sleepTime` |
| `fitness` | `exercises[]`（type/minutes/calories/date） |
| `english` | `learned{}`、`dailyNew{}`、`errorWords[]`、`studyDays[]` |
| `review` | `items[]`、`todayMood`、`draft` |
| `incomes` | `items[]`（source/amountCents/date） |
| `notes` | `items[]`（title/content/tags） |
| `ai` | `config`、`threads{}`、`history[]`、`encyclopedia.packs[]`、`quotaUsed/Total` |
| `settings` | `theme`、`weatherCity`、`syncSpace/syncToken/syncAuto`、`planViewDate` |

---

## 目录结构

```
media-workbench/
├── index.html                 # 页面骨架（业务逻辑全在 js/ 里）
├── css/app.css                # 全部样式（浅色/深色主题变量）
├── js/
│   ├── app.js                 # 启动入口：载数据 → 注册模块 → 路由 → 后台任务
│   ├── modules/
│   │   ├── core.js            # 分片存储、迁移、日期/金额/转义、事件委托、弹层
│   │   ├── router.js          # 哈希路由、主题、侧边栏
│   │   ├── data.js            # 导出/导入、本地快照、清除
│   │   ├── plan.js            # 每日计划（日历、任务、睡觉提醒）
│   │   ├── fitness.js         # 运动
│   │   ├── english.js         # 英语（新词/复习/TTS/录音）
│   │   ├── cet6-words.js      # CET-6 词库（独立数据文件）
│   │   ├── review.js          # 复盘
│   │   ├── notes.js           # 随笔笔记
│   │   ├── incomes.js         # 收入记账
│   │   ├── weather.js         # 天气（wttr.in、缓存、定位）
│   │   ├── illustrate.js      # 纯 SVG 插画引擎  ← 配图扩展点
│   │   ├── ai-client.js       # DeepSeek 接入层（流式、错误可读化）
│   │   └── sync.js            # 可选同步（两阶段 push/pull）
│   └── agents/
│       ├── registry.js        # 内置智能体定义 + 数据工具 + 导入导出  ← 智能体扩展点
│       ├── wisdom.js          # 🦁 智慧花狮对话页
│       ├── zoo.js             # 🐾 动物百科学习包
│       └── workbench.js       # 智能体工作台页面
├── manifest.json / sw.js / icon.png / icon-512.png      # PWA
├── server.py                  # 本地/局域网服务器 + 受限代理 + 同步存储
├── api/                       # Vercel Serverless 代理（proxy-core.js 与 Cloudflare 共用）
├── functions/api/[[path]].js  # Cloudflare Pages Function 入口
├── tools/                     # 零依赖自检与测试
├── docs/                      # 路线图、生成物说明
├── CONTRIBUTING.md / CODE_OF_CONDUCT.md / SECURITY.md / CHANGELOG.md
└── LICENSE (MIT)
```

---

## 实时同步（可选）

> 单个设备使用时**完全不需要**这一节。

1. 在电脑上运行 `python server.py`（数据会落到 `data/<空间ID>/`）；
2. 主设备点顶栏的 ☁️，设置「空间 ID + 口令（≥6 位）」；
3. 其他设备用主设备提示的 `?space=空间ID` 链接打开，输入一次口令即可接入。

同步规则（v2.3 起）：

| 阶段 | 规则 |
| --- | --- |
| 推送 | 只发送本机**真正改过的字段/日期**（每项带时间戳） |
| 服务器 | 没有这一天 → 接受；已有且不更旧 → 拒绝该字段（先到先得） |
| 拉取 | 本地还没推送成功的改动一律保留，其余以后写入胜出 |
| 结果 | 同一设备反复同步不会覆盖别人；离线改动联网后补传；删除不会复活 |

---

## 部署

| 平台 | 做法 | 说明 |
| --- | --- | --- |
| 本地 / 局域网 | `python server.py` | 带同步与代理 |
| Vercel | `npm run deploy` | 只有 `/api/*` 走 Serverless 代理，其余是静态文件 |
| Cloudflare Pages | `npm run deploy:cf` | `functions/api/[[path]].js` 作为代理 |
| GitHub Pages | 把静态文件推到 `gh-pages` | 无代理，只能用"浏览器直连"模式 |

安全提示：`server.py` 默认监听 `0.0.0.0` 方便手机访问，**不要直接暴露到公网**；
公网使用请放在反向代理后并开启 HTTPS 与 `PROXY_TOKEN`。

---

## 测试与自检

全部零依赖，只用 Node 内置模块：

```bash
node tools/check.js       # 语法 / 资源引用 / data-action 绑定 / 预缓存清单 / 文档链接
npm test                  # 核心单测（迁移、日期、金额、合并、导入导出）+ 同步集成测试
```

- `tools/test-core.js`：在 `vm` 沙箱里跑 `core.js`，验证 v1 迁移、日期工具、金额精度、墓碑合并等。
- `tools/test-sync.js`：**临时启动真实的 `server.py`**，用 Node 模拟两台浏览器，验证"打卡不被回滚""新设备拿到数据""离线改动补传"等。
- CI（`.github/workflows/ci.yml`）在每次 push / PR 上跑同样三条。

---

## 常见问题

<details>
<summary><b>点了某个页面却跳回「每日计划」/ 页面空白</b></summary>

多半是浏览器缓存里留着旧版本的 JS。请在页面按 **Ctrl+Shift+R** 强制刷新；
仍不行：F12 → Application → Service Workers 点 **Unregister**，再到 Storage 点 **Clear site data**，然后重新打开。

v2.8.0 起已加入"脚本带版本号 + 启动自检自动清缓存"，正常情况下不会再出现。
</details>

<details>
<summary><b>测试连接提示 HTTP 401 / 402 / 404</b></summary>

401 = Key 不对（注意别带引号或空格）；402 = 余额不足；404 = API 地址填错（应为 `https://api.deepseek.com`）。
详见 [DeepSeek 配置](#deepseek-配置两种模式)。
</details>

<details>
<summary><b>公司网络下直连失败</b></summary>

页面会自动改用本机代理重试；若仍失败，按"模式 B"在 `.env` 里配置 `DEEPSEEK_API_KEY`，前端改选 `/api` 转发。
</details>

<details>
<summary><b>换电脑 / 换浏览器数据没了？</b></summary>

数据只存在原设备的浏览器里。可用「设置 → 导出备份」得到 JSON，在新设备导入；
或者开启上文的**实时同步**。
</details>

<details>
<summary><b>天气显示的城市不对</b></summary>

IP 定位会受代理/VPN 影响。点天气页的 📍 用浏览器精确定位，或直接输入城市名（如 `沈丘` / `上海` / `shenqiu`）。
</details>

<details>
<summary><b>能不能不填 Key 就用？</b></summary>

可以。计划/运动/英语/复盘/笔记/记账/天气全部本地可用，只有两个 AI 智能体需要 Key。
</details>

---

## 参与贡献

- 想改代码：先读 [CONTRIBUTING.md](CONTRIBUTING.md)（有扩展点清单与编码约定）；
- 想找活干：[docs/ROADMAP.md](docs/ROADMAP.md) 里标了价值/成本，新手任务在"现在最需要帮忙的"一节；
- 发现问题：用 Issue 模板提交（**请勿粘贴真实 API Key 或私人数据**）；
- 安全漏洞：请按 [SECURITY.md](SECURITY.md) 私密报告；
- 行为准则：[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

如果这个项目对你有帮助，点个 ⭐ 就是最好的鼓励。

---

## 致谢与第三方

- 模型接口：[DeepSeek API](https://api-docs.deepseek.com)（OpenAI 兼容格式）
- 天气数据：[wttr.in](https://wttr.in)
- 词库：CET-6 常用词自建表（`js/modules/cet6-words.js`）
- 图标：仓库内自带占位图，可自行替换为自己的品牌图

项目本身不收集任何用户数据，没有埋点、没有统计脚本。

---

## 开源协议

[MIT](LICENSE) © 2026 小小花狮 · media-workbench contributors
