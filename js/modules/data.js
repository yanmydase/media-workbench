/*!
 * 小小花狮 · 数据备份 / 恢复 / 重置
 * - 导出：下载一份带版本号的 JSON 全量备份
 * - 导入：合并（保留本机较多数据）或覆盖
 * - 定期本地快照：写入 xhsh.v2.backup（与主导出格式一致），主数据损坏时可一键恢复
 */
(function (XHSH) {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var BACKUP_KEY = XHSH.CONFIG.keyPrefix + 'backup';

    function download(text, filename) {
        var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
    }

    function exportBackup() {
        var name = 'xiaohuashi-backup-' + XHSH.today() + '.json';
        download(XHSH.data.exportJSON(), name);
        XHSH.toast('已导出备份：' + name);
    }

    async function importBackup() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = function () {
            var file = input.files && input.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = async function () {
                var mode = await XHSH.sheet({
                    title: '导入备份',
                    message: '「合并」会保留本机已有记录并补充云端/文件里的数据；「覆盖」会清空本机现有数据。',
                    fields: [{ name: 'mode', label: '导入方式', type: 'select', value: 'merge',
                        options: [{ value: 'merge', label: '合并（推荐）' }, { value: 'replace', label: '覆盖本机数据' }] }]
                });
                if (!mode) return;
                if (mode.mode === 'replace' && !(await XHSH.confirm('覆盖后本机现有数据将被替换，确定继续？', '覆盖'))) return;
                try {
                    XHSH.data.importJSON(String(reader.result), mode.mode);
                    XHSH.toast('导入成功 ✅ 即将刷新');
                    setTimeout(function () { location.reload(); }, 800);
                } catch (e) {
                    XHSH.toast('导入失败：' + e.message, 4000);
                }
            };
            reader.readAsText(file, 'utf-8');
        };
        input.click();
    }

    async function resetAll() {
        var r = await XHSH.sheet({
            title: '⚠️ 清除全部数据',
            message: '这会删除本机所有打卡、运动、单词、复盘、收入、笔记与 AI 配置（API Key 也会被清除）。建议先导出备份。',
            fields: [{ name: 'confirm', label: '输入 DELETE 确认', value: '', placeholder: 'DELETE' }],
            okText: '确认清除'
        });
        if (!r) return;
        if (r.confirm !== 'DELETE') return XHSH.toast('确认文字不正确，未执行');
        XHSH.data.reset();
        XHSH.toast('已清除，即将刷新');
        setTimeout(function () { location.reload(); }, 700);
    }

    function snapshot() {
        try {
            localStorage.setItem(BACKUP_KEY, XHSH.data.exportJSON());
        } catch (e) { /* 配额满时静默跳过，避免打扰 */ }
    }

    function restoreFromSnapshotIfEmpty() {
        var hasData = false;
        try {
            for (var k in XHSH.CONFIG.slices) {
                if (localStorage.getItem(XHSH.CONFIG.keyPrefix + k)) { hasData = true; break; }
            }
        } catch (e) { }
        if (hasData) return false;
        try {
            var raw = localStorage.getItem(BACKUP_KEY);
            if (!raw) return false;
            XHSH.data.importJSON(raw, 'replace');
            XHSH._pendingToast = '📦 已从本地快照恢复数据';
            return true;
        } catch (e) { return false; }
    }

    function startAutoBackup() {
        setInterval(snapshot, XHSH.CONFIG.backupIntervalMs);
        window.addEventListener('pagehide', snapshot);
    }

    function showBackupInfo() {
        var size = 0;
        try { size = (XHSH.data.exportJSON().length / 1024).toFixed(1); } catch (e) { }
        $('backupInfo') && ($('backupInfo').textContent = '当前数据体积约 ' + size + ' KB');
    }

    window.DataModule = {
        export: exportBackup,
        import: importBackup,
        reset: resetAll,
        snapshot: snapshot,
        restoreIfEmpty: restoreFromSnapshotIfEmpty,
        startAutoBackup: startAutoBackup,
        info: showBackupInfo
    };

    XHSH.on('data-export', exportBackup);
    XHSH.on('data-import', importBackup);
    XHSH.on('data-reset', resetAll);

})(window.XHSH);
