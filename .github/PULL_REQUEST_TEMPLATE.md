Thanks for the pull request! 请确认以下几点，CI 也会自动检查：

- [ ] `node tools/check.js` 0 错误 0 警告
- [ ] `node tools/test-core.js` 全部通过（改了同步逻辑请再跑 `node tools/test-sync.js`）
- [ ] 改了 `index.html` 的脚本/样式 → 已同步更新 `?v=` 与 `sw.js` 的 `VERSION`
- [ ] 没有提交真实 API Key、口令或 `data/` 里的个人数据
- [ ] 新功能/行为变化已更新 README 或 CHANGELOG

## 这个 PR 做了什么

（一两句话说清：改了什么、为什么）

## 怎么验证的

（命令输出、截图、复现步骤）

## 关联 Issue

（例如 `Closes #12`）
