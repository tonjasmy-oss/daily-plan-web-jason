/* ============================================================
 * 系统参数 (W14) - 应用名称/版本号等 6 输入 + 2 toggle
 * ============================================================ */
var SETTINGS_KEY = 'engms_settings_v1';
function loadSettings() {
  try {
    var s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    return s || {
      appName: '工程管理系统',
      version: 'v5.0',
      company: '某某建筑工程有限公司',
      phone: '010-12345678',
      email: 'contact@example.com',
      maxUsers: 50,
      autoBackup: true,
      purchasePerm: true
    };
  } catch (e) { return {}; }
}
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

async function initSettingsPage() {
  var user = await requireLogin();
  if (!user) return;
  if (!isAdmin()) { toast('需要管理员权限', 'warn'); setTimeout(function(){ location.href='dashboard.html'; }, 800); return; }

  var s = loadSettings();

  var content = renderPage({
    active: 'settings',
    pageHtml:
      '<nav class="breadcrumb"><a href="dashboard.html">工作台</a><span class="sep">/</span><span>系统设置</span><span class="sep">/</span><span>系统参数</span></nav>' +
      '<div class="page-header"><div><h2>系统参数</h2><div class="page-sub">全局应用配置,影响整个系统的展示与功能</div></div>' +
      '<div class="page-actions"><button class="btn-success" id="stSave">保存设置</button></div></div>' +
      '<div class="section"><h3>基础信息</h3><div class="form-grid">' +
      field('应用名称', 'stAppName', s.appName, 'text') +
      field('版本号', 'stVersion', s.version, 'text') +
      field('公司名称', 'stCompany', s.company, 'text') +
      field('联系电话', 'stPhone', s.phone, 'tel') +
      field('联系邮箱', 'stEmail', s.email, 'email') +
      field('最大用户数', 'stMax', s.maxUsers, 'number') +
      '</div></div>' +
      '<div class="section"><h3>系统行为</h3><div class="form-grid">' +
      toggle('自动备份数据', '启用后每周日凌晨自动备份 SQLite 数据库', s.autoBackup) +
      toggle('物资申购需要审批', '启用后,所有物资申购必须经审批通过才能入库', s.purchasePerm) +
      '</div></div>' +
      '<div class="section"><h3>危险操作</h3><div style="display:flex;gap:12px;flex-wrap:wrap">' +
      '<button class="btn-ghost" id="stExport">导出全部数据</button>' +
      '<button class="btn-ghost" id="stImport">从备份恢复</button>' +
      '<button class="btn-danger" id="stReset">清空全部数据</button>' +
      '</div></div>'
  });

  function field(label, id, value, type) {
    return '<div class="field-row"><label class="field-label">' + esc(label) + '</label>' +
      '<input class="input" type="' + (type || 'text') + '" id="' + id + '" value="' + esc(value) + '"></div>';
  }

  function toggle(title, desc, on) {
    return '<div class="field-row" style="grid-column:1/-1"><div style="display:flex;align-items:center;gap:14px;padding:16px;background:var(--input-bg);border:1px solid var(--border);border-radius:var(--radius-md)">' +
      '<label class="switch"><input type="checkbox" data-toggle ' + (on ? 'checked' : '') + '><span class="switch-slider"></span></label>' +
      '<div><strong>' + esc(title) + '</strong><div class="muted" style="font-size:13px;margin-top:4px">' + esc(desc) + '</div></div>' +
      '</div></div>';
  }

  document.getElementById('stSave').addEventListener('click', function () {
    s.appName = document.getElementById('stAppName').value;
    s.version = document.getElementById('stVersion').value;
    s.company = document.getElementById('stCompany').value;
    s.phone = document.getElementById('stPhone').value;
    s.email = document.getElementById('stEmail').value;
    s.maxUsers = parseInt(document.getElementById('stMax').value, 10) || 50;
    s.autoBackup = document.querySelector('[data-toggle]').checked;
    s.purchasePerm = document.querySelectorAll('[data-toggle]')[1].checked;
    saveSettings(s);
    toast('设置已保存', 'success');
  });

  document.getElementById('stExport').addEventListener('click', function () {
    var data = {
      exported_at: new Date().toISOString(),
      members: loadMembers(), projects: loadProjects(), tasks: loadTasks(),
      departments: loadDepts(), roles: loadRoles(),
      approvals: JSON.parse(localStorage.getItem('engms_approvals_v1') || '[]'),
      purchases: JSON.parse(localStorage.getItem('engms_purchases_v1') || '[]'),
      weeklyPlans: JSON.parse(localStorage.getItem('engms_weekly_plans_v1') || '[]'),
      settings: loadSettings()
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'engms-backup-' + todayStr() + '.json';
    a.click();
    toast('已导出 JSON 备份', 'success');
  });

  document.getElementById('stImport').addEventListener('click', function () {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function (e) {
        try {
          var d = JSON.parse(e.target.result);
          confirmDialog('确认恢复', '恢复将覆盖当前所有数据,是否继续?', function () {
            if (d.members) localStorage.setItem('engms_members_v1', JSON.stringify(d.members));
            if (d.projects) localStorage.setItem('engms_projects_v1', JSON.stringify(d.projects));
            if (d.tasks) localStorage.setItem('engms_tasks_v1', JSON.stringify(d.tasks));
            if (d.departments) localStorage.setItem('engms_departments_v1', JSON.stringify(d.departments));
            if (d.roles) localStorage.setItem('engms_roles_v1', JSON.stringify(d.roles));
            if (d.settings) localStorage.setItem('engms_settings_v1', JSON.stringify(d.settings));
            toast('已恢复,请刷新页面查看', 'success');
          });
        } catch (e) { toast('文件解析失败', 'error'); }
      };
      fr.readAsText(f);
    };
    inp.click();
  });

  document.getElementById('stReset').addEventListener('click', function () {
    confirmDialog('清空全部数据', '此操作不可恢复,所有项目 / 任务 / 审批数据将被清空。继续?', function () {
      ['members', 'projects', 'tasks'].forEach(function (k) {
        localStorage.removeItem('engms_' + k + '_v1');
      });
      ['approvals', 'purchases', 'weeklyPlans', 'dailyPlans', 'departments', 'roles'].forEach(function (k) {
        localStorage.removeItem('engms_' + k + '_v1');
      });
      toast('已清空,刷新页面查看', 'success');
    });
  });
}
window.initSettingsPage = initSettingsPage;
window.addEventListener('DOMContentLoaded', initSettingsPage);
if (document.readyState !== 'loading') initSettingsPage();
