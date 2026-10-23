/* 在 Node 里用极简 DOM 桩跑一遍前端核心逻辑（迁移 / 合并 / 日期 / 金额） */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.resolve(__dirname, '..');
const store = new Map();
let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✅ ' + name);
  else { failures++; console.log('  ❌ ' + name + (extra ? ' → ' + extra : '')); }
}

const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
const fakeEl = () => ({ textContent: '', value: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, querySelectorAll: () => [], querySelector: () => null, remove() {}, dataset: {} });
const documentStub = {
  getElementById: () => fakeEl(),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => fakeEl(),
  addEventListener() {},
  documentElement: { setAttribute() {} },
  body: { appendChild() {} },
  readyState: 'complete'
};
const sandbox = {
  window: null, document: documentStub, localStorage, console,
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  fetch: () => Promise.reject(new Error('no network in test')),
  location: { hash: '', protocol: 'http:' },
  navigator: {}, SpeechSynthesisUtterance: null, matchMedia: () => ({ matches: false, addEventListener() {} }),
  requestAnimationFrame: (fn) => fn(), Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL() {} },
  FileReader: function () {}, Notification: undefined, history: { replaceState() {} }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function load(f) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  vm.runInContext(src, sandbox, { filename: f });
}

console.log('\n[1] v1 数据迁移');
const v1 = {
  todos: [], exercises: [{ id: '1', type: '跑步', minutes: 30, calories: 300, date: '2026-10-20' }],
  vocab: [], freeyanNotes: [{ id: 'n1', title: 't', content: 'c' }], aiHistory: [{ mode: 'outline', prompt: 'p', response: 'r', time: 'x' }],
  aiMode: 'outline', theme: 'dark', todayMood: '😄', gratitude: ['', '', ''],
  planTasks: [{ id: 'fitness', name: '健身', icon: '💪', time: '', builtin: true }],
  planCheckins: { '2026-10-20': ['fitness'] }, sleepTime: '23:00',
  apiConfig: { baseUrl: 'https://chat.ecnu.edu.cn/open/api/v1', apiKey: 'sk-EXAMPLE0000000000000000000000', model: 'ecnu-max', systemPrompt: 'x', streamMode: true },
  cetLearned: { 1: { assigned: true, firstDate: '2026-10-19', reviewCount: 1 } }, cetDailyNew: { '2026-10-19': [1] },
  cetErrorWords: [2], cetStudyDays: ['2026-10-19'], weatherCity: 'shenqiu',
  incomes: [{ id: 'i1', source: '写稿', amount: 0.1, date: '2026-10-20' }, { id: 'i2', source: '设计', amount: 0.2, date: '2026-10-20' }],
  apiQuotaUsed: 3, apiQuotaTotal: 500, apiKeyExpiry: '', syncUserId: 'abc'
};
store.set('xhsh_data', JSON.stringify(v1));
load('js/modules/core.js');
const X = sandbox.XHSH;
const D = X.data.load();
check('迁移后 schemaVersion = 2', D.meta.schemaVersion === 2);
check('旧计划任务迁移', D.plan.tasks.length === 1 && D.plan.checkins['2026-10-20'][0] === 'fitness');
check('运动记录迁移', D.fitness.exercises.length === 1);
check('单词进度迁移', D.english.learned[1].reviewCount === 1 && D.english.errorWords[0] === 2);
check('笔记迁移', D.notes.items.length === 1);
check('收入转分为整数（0.1+0.2 无误差）', D.incomes.items[0].amountCents === 10 && D.incomes.items[1].amountCents === 20, JSON.stringify(D.incomes.items.map(i => i.amountCents)));
check('设置迁移（theme/dark）', D.settings.theme === 'dark' && D.settings.syncUserId === 'abc');
check('AI 配置不再指向 ChatECNU，并升级到最新模型', D.ai.config.baseUrl === 'https://api.deepseek.com' && D.ai.config.model === 'deepseek-flash', D.ai.config.model);
X.data.save();
check('保存为分片键', store.has('xhsh.v2.plan') && store.has('xhsh.v2.ai') && !store.has('xhsh.v2.data'));
X.data.all.ai.config.model = 'deepseek-chat';
X.data.save('ai');
check('旧模型名自动迁移为 deepseek-flash', X.data.load().ai.config.model === 'deepseek-flash');

console.log('\n[2] 日期工具');
check('dateStr 使用本地时间', X.dateStr(new Date(2026, 9, 22, 0, 30)) === '2026-10-22');
check('dateOffset(-1)', X.dateOffset(-1, '2026-10-22') === '2026-10-21');
check('跨月 offset', X.dateOffset(1, '2026-10-31') === '2026-11-01');
check('daysBetween', X.daysBetween('2026-10-20', '2026-10-22') === 2);

console.log('\n[3] 金额与转义');
check('money.format(10)', X.money.format(10) === '¥0.10', X.money.format(10));
check('money.format(100000)', X.money.format(100000) === '¥1,000');
check('esc 转义单引号', X.esc("a'b<c>") === 'a&#39;b&lt;c&gt;');
check('escAttr 转义反斜杠', X.escAttr('a\\b') === 'a&#92;b');

console.log('\n[4] 同步合并（最后写入胜出 + 墓碑）');
const local = X.clone(D);
const cloud = X.clone(D);
cloud.incomes.items.push({ id: 'i1', source: '写稿（云端改名）', amountCents: 99, date: '2026-10-20', updatedAt: '2000-01-01T00:00:00Z' });
cloud.incomes.items.push({ id: 'i3', source: '云端新增', amountCents: 500, date: '2026-10-21', updatedAt: '2026-10-21T00:00:00Z' });
cloud.notes.items[0].deletedAt = '2026-10-21T00:00:00Z';
const merged = X.mergeData(local, cloud);
check('本地较新的记录不被旧云端覆盖', merged.incomes.items.find(i => i.id === 'i1').source === '写稿');
check('云端新增被合并', !!merged.incomes.items.find(i => i.id === 'i3'));
check('墓碑删除生效（不复活）', !merged.notes.items.find(i => i.id === 'n1'));

console.log('\n[5] 导出 / 导入');
const exported = X.data.exportJSON();
check('导出包含版本号', JSON.parse(exported).schemaVersion === 2);
X.data.importJSON(exported, 'replace');
check('导入后数据一致', X.data.all.incomes.items.length === D.incomes.items.length);

console.log('\n[6] 错误处理');
store.set('xhsh.v2.plan', '{损坏的 JSON');
let survived = true;
try { X.data.load(); } catch (e) { survived = false; }
check('损坏的分片不会让启动崩溃', survived);

console.log('\n结果：' + (failures ? failures + ' 个失败' : '全部通过') + '\n');
process.exit(failures ? 1 : 0);
