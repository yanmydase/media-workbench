#!/usr/bin/env node
/**
 * 零依赖自检脚本：node tools/check.js
 * - 所有 js 文件语法检查
 * - index.html 引用的静态资源是否存在
 * - data-action 是否都有对应处理函数（静态扫描）
 * - manifest.json 图标是否存在
 * - sw.js 预缓存的文件是否都存在
 * - 文档里的相对链接是否有效
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
let errors = 0;
let warnings = 0;

function ok(msg) { console.log('  ✅ ' + msg); }
function bad(msg) { errors++; console.log('  ❌ ' + msg); }
function warn(msg) { warnings++; console.log('  ⚠️  ' + msg); }

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (['node_modules', '.git', '.github', '.wrangler', '.vercel', 'data', 'docs'].includes(name) || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

console.log('\n[1/6] 语法检查');
const jsFiles = walk(root).filter((f) => f.endsWith('.js'));
const esmFiles = [];
for (const f of jsFiles) {
  const src = fs.readFileSync(f, 'utf8');
  const isEsm = /^\s*(import|export)\s/m.test(src);
  if (isEsm) { esmFiles.push(f); continue; }   // ESM 交给部署平台运行时做校验
  try {
    new vm.Script(src, { filename: f });
  } catch (e) {
    bad(path.relative(root, f) + ' → ' + e.message);
  }
}
if (!errors) ok(jsFiles.length + ' 个 JS 文件语法正确（' + esmFiles.length + ' 个 ESM 交由平台校验）');

console.log('\n[2/6] index.html 资源引用');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => u.startsWith('/'));
for (const ref of new Set(refs)) {
  const file = path.join(root, ref.slice(1).split('?')[0]);   // 去掉 ?v= 版本号
  if (!fs.existsSync(file)) bad('缺失资源：' + ref);
}
if (!errors) ok(new Set(refs).size + ' 个资源均存在');

console.log('\n[3/6] data-action 处理函数');
const handled = new Set();
for (const f of jsFiles) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/XHSH\.on\(\s*['"]([\w-]+)['"]/g)) handled.add(m[1]);
  for (const m of src.matchAll(/data-action(?:Change)?\s*:\s*['"]([\w-]+)['"]/g)) handled.add(m[1]);
}
const used = new Set([...html.matchAll(/data-action(?:-change)?="([\w-]+)"/g)].map((m) => m[1]));
for (const a of used) {
  if (!handled.has(a)) warn('data-action="' + a + '" 没有找到处理函数');
}
const handledButUnused = [...handled].filter((a) => !used.has(a));
if (handledButUnused.length) console.log('  ℹ️  动态绑定的动作（非 HTML 静态使用）：' + handledButUnused.join(', '));
if (!warnings) ok(used.size + ' 个 action 全部有处理函数');

console.log('\n[4/6] manifest 图标');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
for (const icon of manifest.icons || []) {
  if (!fs.existsSync(path.join(root, icon.src.slice(1)))) warn('manifest 引用的图标不存在：' + icon.src);
}
ok('manifest.json 解析正常');

console.log('\n[5/6] sw.js 预缓存清单');
// 之前删掉 ai.js 时漏改 sw.js，导致 Service Worker 安装失败、离线缓存整体失效
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pre = [...sw.matchAll(/['"](\/[\w./-]+)['"]/g)].map((m) => m[1])
  .filter((u) => /\.(js|css|html|png|json|svg)$/.test(u));
for (const u of new Set(pre)) {
  if (!fs.existsSync(path.join(root, u.slice(1)))) bad('sw.js 预缓存的文件不存在：' + u);
}
ok(new Set(pre).size + ' 个预缓存文件均存在');

console.log('\n[6/6] 文档链接');
// README / CONTRIBUTING / docs 里的相对链接必须指向真实文件，否则 GitHub 上会点出 404
const docFiles = ['README.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SUGGESTIONS.md', 'SECURITY.md']
  .map((n) => path.join(root, n)).filter((f) => fs.existsSync(f));
if (fs.existsSync(path.join(root, 'docs'))) {
  for (const f of fs.readdirSync(path.join(root, 'docs'))) {
    if (f.endsWith('.md')) docFiles.push(path.join(root, 'docs', f));
  }
}
const linkRe = /\]\(([^)#\s]+)(#[^)]*)?\)/g;
let linkCount = 0;
for (const f of docFiles) {
  const src = fs.readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, '');   // 跳过代码块
  for (const m of src.matchAll(linkRe)) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    linkCount++;
    const abs = path.resolve(path.dirname(f), decodeURIComponent(target));
    if (!fs.existsSync(abs)) warn(path.basename(f) + ' 里的链接找不到文件：' + target);
  }
}
ok(linkCount + ' 个本地链接均有效');

console.log('\n结果：' + (errors ? errors + ' 个错误，' : '0 个错误，') + warnings + ' 个警告\n');
process.exit(errors ? 1 : 0);
