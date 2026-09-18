/* ============================================================
 * 用户角色 (W13) - 角色卡 + 9 个权限小方块
 * 数据由 /api/roles 管理, 内存缓存见 common.js
 * ============================================================ */
/* 动作级权限。write:true 表示"会改动数据"的操作,
 * 用于「权限 ↔ 模块」联动校验: 没有「查看」却勾了写权限属于矛盾配置。 */
var PERMS = [
  { id: 'p_view',   label: '查看' },
  { id: 'p_create', label: '新增', write: true },
  { id: 'p_edit',   label: '编辑', write: true },
  { id: 'p_delete', label: '删除', write: true },
  { id: 'p_import', label: '导入', write: true },
  { id: 'p_export', label: '导出' },
  { id: 'p_approve',label: '审批', write: true },
  { id: 'p_sign',   label: '签名', write: true },
  { id: 'p_admin',  label: '管理', write: true }
];

/* 缺省「可访问模块」配置
 * 只在两种情况下使用: ① 系统首次初始化角色; ② 老角色还没有 modules 字段。
 * 之后一切以本页勾选的结果为准。
 * ⚠ 需与后端 server/app.py 的 DEFAULT_ROLE_MODULES 保持一致 */
var DEFAULT_ROLE_MODS = (function () {
  var all = (typeof MODULES_LIST !== 'undefined' ? MODULES_LIST : []).map(function (m) { return m.id; });
  var worker = ['m_dashboard', 'm_daily_plan', 'm_report', 'm_reports', 'm_about', 'm_me'];
  var foreman = worker.concat(['m_tasks', 'm_projects', 'm_browse']);
  var lead = foreman.concat(['m_approval', 'm_purchase_mgmt', 'm_purchase', 'm_analysis',
                             'm_members', 'm_weekly_plan', 'm_weekly_rpt', 'm_departments']);
  return { '__ALL__': all, 'lead': lead, 'foreman': foreman, 'worker': worker, 'admin': all };
})();

async function initRolesPage() {
  var user = await requireLogin();
  if (!user) return;
  if (!requireModule('m_roles')) return;
  /* 管理员 = 可编辑; 其他人(如工程主管) = 只读查看。
   * 写操作由后端 /api/roles 二次校验, 前端仅控制入口显隐。 */
  var canEdit = isAdmin();

if (loadRoles().length === 0) {
    createRole({ key: 'admin',   name: '管理员',     description: '系统全部权限', permissions: PERMS.map(function (p) { return p.id; }), modules: DEFAULT_ROLE_MODS['admin'], sort_order: 1 });
    createRole({ key: 'lead',    name: '工程主管',   description: '项目负责,审批管理', permissions: ['p_view','p_create','p_edit','p_export','p_approve'], modules: DEFAULT_ROLE_MODS['lead'], sort_order: 2 });
    createRole({ key: 'foreman', name: '工程班长',   description: '施工调度,任务分配', permissions: ['p_view','p_create','p_edit','p_export','p_sign'], modules: DEFAULT_ROLE_MODS['foreman'], sort_order: 3 });
    createRole({ key: 'worker',  name: '综合维修工', description: '日常报工',             permissions: ['p_view','p_create','p_edit','p_sign'], modules: DEFAULT_ROLE_MODS['worker'], sort_order: 4 });
  } else {
    /* 老角色没 modules 字段 → 静默回填默认, 避免全员被锁在外面 */
    (loadRoles() || []).forEach(function (r) {
      if (r && !Array.isArray(r.modules)) {
        r.modules = DEFAULT_ROLE_MODS[r.key] || DEFAULT_ROLE_MODS['worker'];
        updateRole(r._id, { modules: r.modules });
      }
    });
  }

  var content = renderPage({
    active: 'roles',
    pageHtml:
      '<nav class="breadcrumb"><a href="dashboard.html">工作台</a><span class="sep">/</span><a href="settings.html">系统设置</a><span class="sep">/</span><span>用户角色</span></nav>' +
      '<div class="page-header"><div><h2>用户角色</h2><div class="page-sub">' +
        (canEdit ? '配置角色与对应权限,变更后即时生效'
                 : '只读查看 · 修改角色配置需管理员权限') +
      '</div></div>' +
      '<div class="page-actions">' +
        (canEdit ? '<button class="btn-primary" id="rlNew">+ 添加角色</button>' : '') +
      '</div></div>' +
      '<div id="rlList" class="layout-2col"></div>'
  });

  /* 权限网格 + 全选按钮
 * 返回的 HTML 里所有交互元素都加上 data-perm-scope 属性, 方便外部按角色卡区分事件
 * scopeId 用于在 paint() 与 openForm() 间区分同一页面里多个角色卡的 DOM
 */
function paintPermGrid(perms, scopeId) {
    scopeId = scopeId || ('pg_' + Math.random().toString(36).slice(2, 9));
    var cells = PERMS.map(function (p) {
      var on = perms.indexOf(p.id) >= 0;
      return '<label class="perm-cell" data-id="' + p.id + '" style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:var(--radius-md);border:1px solid ' +
        (on ? 'var(--primary)' : 'var(--border)') + ';background:' + (on ? 'var(--primary-bg)' : 'var(--input-bg)') +
        ';cursor:pointer;color:' + (on ? 'var(--primary-light)' : 'var(--text-secondary)') + ';font-size:13px;font-weight:500">' +
        '<input type="checkbox" ' + (on ? 'checked' : '') + ' style="accent-color:var(--primary)">' + esc(p.label) + '</label>';
    }).join('');
    var allOn = PERMS.every(function (p) { return perms.indexOf(p.id) >= 0; });
    return '<div data-perm-scope="' + scopeId + '">' +
      '<div class="perm-all-row" style="display:flex;justify-content:flex-end;margin-top:14px">' +
        '<button type="button" class="btn-ghost btn-sm perm-toggle-all" data-state="' + (allOn ? 'on' : 'off') + '">' +
          (allOn ? '取消全选' : '一键全选') +
        '</button>' +
      '</div>' +
      '<div class="perm-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px">' +
        cells +
      '</div>' +
    '</div>';
  }

  /* 同步单个 cell 的样式 + 全选按钮文案 */
  function _syncCellStyle(cb) {
    var cell = cb.closest('.perm-cell');
    if (!cell) return;
    cell.style.borderColor = cb.checked ? 'var(--primary)' : 'var(--border)';
    cell.style.background = cb.checked ? 'var(--primary-bg)' : 'var(--input-bg)';
    cell.style.color = cb.checked ? 'var(--primary-light)' : 'var(--text-secondary)';
  }
  function _syncToggleAll(scopeEl) {
    var btn = scopeEl.querySelector('.perm-toggle-all');
    if (!btn) return;
    var cbs = scopeEl.querySelectorAll('.perm-cell input[type=checkbox]');
    var allOn = cbs.length > 0 && Array.prototype.every.call(cbs, function (c) { return c.checked; });
    btn.dataset.state = allOn ? 'on' : 'off';
    btn.textContent = allOn ? '取消全选' : '一键全选';
  }
  /* 给指定容器(scopeSelector)内挂载权限单元点击 + 全选按钮事件 */
  function bindPermGrid(scopeSelector) {
    var scope = document.querySelector(scopeSelector);
    if (!scope) return;
    scope.querySelectorAll('.perm-cell').forEach(function (cell) {
      cell.addEventListener('click', function (e) {
        e.preventDefault();
        var cb = this.querySelector('input');
        cb.checked = !cb.checked;
        _syncCellStyle(cb);
        _syncToggleAll(scope);
      });
    });
    var allBtn = scope.querySelector('.perm-toggle-all');
    if (allBtn) allBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var turningOn = allBtn.dataset.state !== 'on';
      scope.querySelectorAll('.perm-cell input[type=checkbox]').forEach(function (cb) {
        cb.checked = turningOn;
        _syncCellStyle(cb);
      });
      _syncToggleAll(scope);
    });
  }

  /* ============================================================
   * 模块访问权限网格 (按 NAV_ITEMS 分组渲染, 全选 + 计数同步)
   * 模块清单唯一来源 = layout.js 的 MODULES_LIST (由 NAV_ITEMS[].mod 派生),
   * 与各页面 requireModule('m_xxx') 及后端 DEFAULT_ROLE_MODULES 一一对应。
   * ============================================================ */
  function _modulesSource() {
    if (typeof MODULES_LIST !== 'undefined' && MODULES_LIST && MODULES_LIST.length) return MODULES_LIST;
    /* 兜底: MODULES_LIST 未加载时, 现场从 NAV_ITEMS 派生, 避免再出现空白面板 */
    if (typeof NAV_ITEMS !== 'undefined' && NAV_ITEMS && NAV_ITEMS.length) {
      return NAV_ITEMS.filter(function (it) { return !!it.mod; }).map(function (it) {
        return { id: it.mod, label: it.label, group: it.group };
      });
    }
    return [];
  }
  function paintModulesGrid(modules, scopeId) {
    scopeId = scopeId || ('mg_' + Math.random().toString(36).slice(2, 9));
    modules = Array.isArray(modules) ? modules : [];
    var list = _modulesSource();
    if (!list.length) {
      return '<div class="muted" style="font-size:12px;padding:8px 0">暂无可配置模块 (导航配置未加载)</div>';
    }
    /* 按 group 分组, 分组顺序优先跟随 NAV_GROUP_ORDER */
    var groups = {};
    var order = [];
    list.forEach(function (m) {
      if (!groups[m.group]) { groups[m.group] = []; order.push(m.group); }
      groups[m.group].push(m);
    });
    if (typeof NAV_GROUP_ORDER !== 'undefined' && NAV_GROUP_ORDER.length) {
      order.sort(function (a, b) {
        var ia = NAV_GROUP_ORDER.indexOf(a), ib = NAV_GROUP_ORDER.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
    }
    var allOn = list.every(function (m) { return modules.indexOf(m.id) >= 0; });
    var body = order.map(function (g) {
      return '<div class="mod-group" style="margin-top:10px">' +
        '<div class="muted" style="font-size:12px;margin-bottom:6px;font-weight:500">' + esc(g) + '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">' +
        groups[g].map(function (m) {
          var on = modules.indexOf(m.id) >= 0;
          return '<label class="mod-cell" data-id="' + esc(m.id) + '" title="' + esc(m.id) + '" style="display:flex;align-items:center;gap:6px;padding:7px 9px;border-radius:var(--radius-sm);border:1px solid ' +
            (on ? 'var(--primary)' : 'var(--border)') + ';background:' + (on ? 'var(--primary-bg)' : 'var(--input-bg)') +
            ';cursor:pointer;color:' + (on ? 'var(--primary-light)' : 'var(--text-secondary)') + ';font-size:12px;font-weight:500">' +
            '<input type="checkbox" ' + (on ? 'checked' : '') + ' style="accent-color:var(--primary)">' + esc(m.label) + '</label>';
        }).join('') +
        '</div></div>';
    }).join('');
    return '<div data-mod-scope="' + scopeId + '">' +
      '<div class="mod-all-row" style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">' +
        '<span class="muted mod-count" style="font-size:12px">已选 ' + modules.filter(function (id) {
          return list.some(function (m) { return m.id === id; });
        }).length + '/' + list.length + '</span>' +
        '<button type="button" class="btn-ghost btn-sm mod-toggle-all" data-state="' + (allOn ? 'on' : 'off') + '">' +
          (allOn ? '取消全选' : '一键全选') +
        '</button>' +
      '</div>' +
      body +
    '</div>';
  }
  function _syncModCell(cb) {
    var cell = cb.closest('.mod-cell');
    if (!cell) return;
    cell.style.borderColor = cb.checked ? 'var(--primary)' : 'var(--border)';
    cell.style.background = cb.checked ? 'var(--primary-bg)' : 'var(--input-bg)';
    cell.style.color = cb.checked ? 'var(--primary-light)' : 'var(--text-secondary)';
  }
  function _syncModAll(scopeEl) {
    var cbs = scopeEl.querySelectorAll('.mod-cell input[type=checkbox]');
    var btn = scopeEl.querySelector('.mod-toggle-all');
    var cnt = scopeEl.querySelector('.mod-count');
    var on = 0;
    Array.prototype.forEach.call(cbs, function (c) { if (c.checked) on++; });
    if (cnt) cnt.textContent = '已选 ' + on + '/' + cbs.length;
    if (!btn) return;
    var allOn = cbs.length > 0 && on === cbs.length;
    btn.dataset.state = allOn ? 'on' : 'off';
    btn.textContent = allOn ? '取消全选' : '一键全选';
  }
  function bindModulesGrid(scopeSelector) {
    var scope = document.querySelector(scopeSelector);
    if (!scope) return;
    _syncModAll(scope);
    scope.querySelectorAll('.mod-cell').forEach(function (cell) {
      cell.addEventListener('click', function (e) {
        e.preventDefault();
        var cb = this.querySelector('input');
        cb.checked = !cb.checked;
        _syncModCell(cb);
        _syncModAll(scope);
      });
    });
    var allBtn = scope.querySelector('.mod-toggle-all');
    if (allBtn) allBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var turningOn = allBtn.dataset.state !== 'on';
      scope.querySelectorAll('.mod-cell input[type=checkbox]').forEach(function (cb) {
        cb.checked = turningOn;
        _syncModCell(cb);
      });
      _syncModAll(scope);
    });
  }

  /* ============================================================
   * 权限 ↔ 模块 联动校验
   * 「查看」是所有模块的基础能力: 能进页面 ≠ 能看到内容。
   * 只勾模块不给「查看」, 角色进去只会看到空壳; 只给写权限不给「查看」,
   * 则是"能改却看不见"。这类矛盾配置在保存前提示并可一键修好。
   * ============================================================ */
  function _collectChecked(scope, cellSel) {
    var out = [];
    (scope || document).querySelectorAll(cellSel).forEach(function (c) {
      var cb = c.querySelector('input');
      if (cb && cb.checked) out.push(c.dataset.id);
    });
    return out;
  }
  function _conflicts(perms, mods) {
    var out = [];
    if (perms.indexOf('p_view') >= 0) return out;
    var writes = PERMS.filter(function (p) { return p.write && perms.indexOf(p.id) >= 0; });
    if (!mods.length && !writes.length) return out;
    var parts = [];
    if (mods.length) parts.push(mods.length + ' 个模块');
    if (writes.length) parts.push(writes.length + ' 项写操作权限(' + writes.map(function (p) { return p.label; }).join('/') + ')');
    out.push('已勾选 ' + parts.join(' 和 ') + ', 但没有「查看」权限 —— 该角色能看到菜单却看不到内容');
    return out;
  }
  /* 渲染矛盾提示条; 返回矛盾文案数组 (空数组 = 配置无矛盾) */
  function renderConflictBar(scope) {
    var host = scope.querySelector('.mod-conflict');
    if (!host) return [];
    var list = _conflicts(_collectChecked(scope, '.perm-cell'), _collectChecked(scope, '.mod-cell'));
    if (!list.length) { host.innerHTML = ''; host.hidden = true; return list; }
    host.hidden = false;
    host.innerHTML = list.map(function (t) {
      return '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;margin-top:10px;' +
        'border-radius:var(--radius-md);border:1px solid var(--warning);background:var(--warning-bg);' +
        'color:var(--warning);font-size:12px;line-height:1.5">' +
        '<span style="flex:1">' + esc(t) + '</span>' +
        '<button type="button" class="btn-ghost btn-sm rl-fix-view" style="white-space:nowrap;color:var(--warning);border-color:var(--warning)">补上「查看」</button>' +
        '</div>';
    }).join('');
    var fix = host.querySelector('.rl-fix-view');
    if (fix) fix.addEventListener('click', function () {
      var cb = scope.querySelector('.perm-cell[data-id="p_view"] input');
      if (cb && !cb.checked) {
        cb.checked = true;
        _syncCellStyle(cb);
        _syncToggleAll(scope);
      }
      renderConflictBar(scope);
    });
    return list;
  }

  function paint() {
    var list = loadRoles();
    var host = document.getElementById('rlList');
    if (list.length === 0) { renderEmpty(host, '暂无角色'); return; }
    host.innerHTML = '<div style="display:flex;flex-direction:column;gap:18px">' +
      list.map(function (r) {
        return '<div class="section"><div style="display:flex;align-items:center;gap:14px;justify-content:space-between;flex-wrap:wrap">' +
          '<div style="display:flex;align-items:center;gap:12px">' +
          '<div style="width:46px;height:46px;border-radius:14px;background:' + esc(r.color) + '22;color:' + esc(r.color) + ';display:flex;align-items:center;justify-content:center">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg></div>' +
          '<div><strong style="font-size:17px">' + esc(r.name) + '</strong>' +
          '<div class="muted" style="font-size:13px;margin-top:2px">' + esc(r.desc || '-') +
          ' · 权限 ' + (r.perms || []).length + '/' + PERMS.length +
          ' · 模块 ' + (r.modules || []).length + '/' + (typeof MODULES_LIST !== 'undefined' ? MODULES_LIST.length : 0) +
          '</div></div></div>' +
          '<div style="display:flex;gap:8px">' +
          (canEdit
            ? '<button class="btn-ghost" data-edit="' + r._id + '">编辑</button>' +
              '<button class="btn-danger" data-del="' + r._id + '">删除</button>'
            : '<span class="muted" style="font-size:12px;align-self:center">只读</span>') +
          '</div></div>' +
          paintPermGrid(r.perms || [], 'list-' + r._id) +
          '</div>';
      }).join('') + '</div>';
    /* 给每个角色卡的权限网格挂载交互 (只读模式不挂, 并禁用勾选入口) */
    if (canEdit) {
      list.forEach(function (r) { bindPermGrid('[data-perm-scope="list-' + r._id + '"]'); });
    } else {
      host.querySelectorAll('.perm-cell input[type=checkbox], .perm-toggle-all')
        .forEach(function (el) { el.disabled = true; });
    }
    host.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openForm(loadRoles().find(function (r) { return r._id === this.dataset.edit; }.bind(b))); }.bind(b));
    });
    host.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = this.dataset.del;
        confirmDialog('删除角色', '确认删除该角色?', function () {
          deleteRole(id);
          setTimeout(paint, 200);
        });
      });
    });
  }
  paint();
  var _newBtn = document.getElementById('rlNew');
  if (_newBtn) _newBtn.addEventListener('click', function () { openForm(null); });

  function openForm(rec) {
    var isNew = !(rec && rec._id);
    rec = rec || { name: '', description: '', permissions: [], modules: [] };
    /* 新建角色: 默认勾选一组基线模块 (与 worker 一致), 避免"全不勾 = 该角色任何页面都进不去" */
    var initMods = isNew ? (DEFAULT_ROLE_MODS['worker'] || []).slice() : (rec.modules || []);
    var html = '<div class="modal-backdrop" id="rlModal"><div class="modal" style="max-width:760px">' +
      '<div class="modal-head"><h3>' + (rec._id ? '编辑角色' : '添加角色') + '</h3>' +
      '<button class="modal-close" id="rlCancel">×</button></div>' +
      '<div class="modal-body"><div class="form-grid">' +
      '<div class="field-row"><label class="field-label"><span class="required">*</span>角色名称</label>' +
      '<input class="input" id="rlName" value="' + esc(rec.name) + '"></div>' +
      '<div class="field-row"><label class="field-label">标识键</label>' +
      '<input class="input" id="rlKey" value="' + esc(rec.key || '') + '" placeholder="英文唯一键"></div>' +
      '<div class="field-row full"><label class="field-label">角色说明</label>' +
      '<textarea class="input" id="rlDesc" rows="2">' + esc(rec.description || '') + '</textarea></div>' +
      '<div class="field-row full"><label class="field-label">权限配置 <span class="muted" style="font-weight:400">(动作级, 控制按钮是否显示)</span></label>' +
      paintPermGrid(rec.permissions || [], 'modal-form') + '</div>' +
      '<div class="field-row full"><label class="field-label">可访问模块 <span class="muted" style="font-weight:400">(导航模块, 未勾选则在左侧导航隐藏且直接访问会被拦截)</span></label>' +
      paintModulesGrid(initMods, 'modal-form-mods') +
      '<div class="mod-conflict" hidden></div></div>' +
      '</div></div>' +
      '<div class="modal-foot"><button class="btn-ghost" id="rlCancel2">取消</button>' +
      '<button class="btn-success" id="rlSave">' + (rec._id ? '保存修改' : '添加') + '</button></div>' +
      '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('rlCancel').onclick = document.getElementById('rlCancel2').onclick = closeModal;
    /* 切换权限 + 全选按钮 */
    bindPermGrid('#rlModal [data-perm-scope="modal-form"]');
    bindModulesGrid('#rlModal [data-mod-scope="modal-form-mods"]');
    /* 权限或模块任一改动都重算矛盾提示 (委托到弹窗根节点, 兜住单元格与全选按钮两条路径) */
    var modalEl = document.getElementById('rlModal');
    modalEl.addEventListener('click', function (e) {
      if (!e.target.closest('.perm-cell, .mod-cell, .perm-toggle-all, .mod-toggle-all')) return;
      setTimeout(function () { renderConflictBar(modalEl); }, 0);   /* 等原有 handler 改完 checked */
    });
    renderConflictBar(modalEl);
    document.getElementById('rlSave').onclick = function () {
      var name = document.getElementById('rlName').value.trim();
      if (!name) { toast('请填写角色名称', 'warn'); return; }
      var perms = _collectChecked(modalEl, '.perm-cell');
      var mods = _collectChecked(modalEl, '.mod-cell');
      var key = document.getElementById('rlKey').value.trim();
      var doSave = function () {
        var patch = {
          name: name,
          key: key,
          description: document.getElementById('rlDesc').value,
          permissions: perms,
          modules: mods,
        };
        if (rec._id) {
          updateRole(rec._id, patch);
        } else {
          createRole(patch);
        }
        closeModal();
        setTimeout(paint, 200);
        toast('已保存', 'success');
      };
      /* 保存前统一收口: 空模块、权限与模块矛盾都要用户点头 */
      var warns = renderConflictBar(modalEl).slice();
      if (mods.length === 0) warns.unshift('未勾选任何模块, 该角色将无法访问任何页面(含工作台)');
      if (warns.length) {
        confirmDialog('配置需要确认', warns.join('；') + '。是否继续保存?', doSave);
        return;
      }
      doSave();
    };
  }
  function closeModal() { var m = document.getElementById('rlModal'); if (m) m.remove(); }
}
window.initRolesPage = initRolesPage;
window.addEventListener('DOMContentLoaded', initRolesPage);
if (document.readyState !== 'loading') initRolesPage();
