/* ============================================================
 * 用户角色 (W13) - 角色卡 + 9 个权限小方块
 * ============================================================ */
var PERMS = [
  { id: 'p_view',   label: '查看' },
  { id: 'p_create', label: '新增' },
  { id: 'p_edit',   label: '编辑' },
  { id: 'p_delete', label: '删除' },
  { id: 'p_import', label: '导入' },
  { id: 'p_export', label: '导出' },
  { id: 'p_approve',label: '审批' },
  { id: 'p_sign',   label: '签名' },
  { id: 'p_admin',  label: '管理' }
];

var ROLE_KEY = 'engms_roles_v1';
function loadRoles() { try { return JSON.parse(localStorage.getItem(ROLE_KEY) || '[]'); } catch (e) { return []; } }
function saveRoles(l) { localStorage.setItem(ROLE_KEY, JSON.stringify(l)); }

async function initRolesPage() {
  var user = await requireLogin();
  if (!user) return;
  if (!isAdmin()) { toast('需要管理员权限', 'warn'); setTimeout(function(){ location.href='dashboard.html'; }, 800); return; }

  if (loadRoles().length === 0) {
    saveRoles([
      { _id: 'r_admin', name: '管理员', color: '#5865F2', desc: '系统全部权限', perms: PERMS.map(function (p) { return p.id; }) },
      { _id: 'r_lead',  name: '工程主管', color: '#EC48BD', desc: '项目负责,审批管理', perms: ['p_view','p_create','p_edit','p_export','p_approve'] },
      { _id: 'r_foreman',name: '工程班长', color: '#00B0F4', desc: '施工调度,任务分配', perms: ['p_view','p_create','p_edit','p_export'] },
      { _id: 'r_worker', name: '综合维修工', color: '#35ED7E', desc: '日常报工', perms: ['p_view','p_sign'] }
    ]);
  }

  var content = renderPage({
    active: 'roles',
    pageHtml:
      '<nav class="breadcrumb"><a href="dashboard.html">工作台</a><span class="sep">/</span><a href="settings.html">系统设置</a><span class="sep">/</span><span>用户角色</span></nav>' +
      '<div class="page-header"><div><h2>用户角色</h2><div class="page-sub">配置角色与对应权限,变更后即时生效</div></div>' +
      '<div class="page-actions"><button class="btn-primary" id="rlNew">+ 添加角色</button></div></div>' +
      '<div id="rlList" class="layout-2col"></div>'
  });

  function paintPermGrid(perms) {
    return '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px">' +
      PERMS.map(function (p) {
        var on = perms.indexOf(p.id) >= 0;
        return '<label class="perm-cell" data-id="' + p.id + '" style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:var(--radius-md);border:1px solid ' +
          (on ? 'var(--primary)' : 'var(--border)') + ';background:' + (on ? 'var(--primary-bg)' : 'var(--input-bg)') +
          ';cursor:pointer;color:' + (on ? 'var(--primary-light)' : 'var(--text-secondary)') + ';font-size:13px;font-weight:500">' +
          '<input type="checkbox" ' + (on ? 'checked' : '') + ' style="accent-color:var(--primary)">' + esc(p.label) + '</label>';
      }).join('') + '</div>';
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
          '<div class="muted" style="font-size:13px;margin-top:2px">' + esc(r.desc || '-') + ' · 当前 ' + (r.perms || []).length + ' / ' + PERMS.length + ' 项权限</div></div></div>' +
          '<div style="display:flex;gap:8px">' +
          '<button class="btn-ghost" data-edit="' + r._id + '">编辑</button>' +
          '<button class="btn-danger" data-del="' + r._id + '">删除</button></div></div>' +
          paintPermGrid(r.perms || []) +
          '</div>';
      }).join('') + '</div>';
    host.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openForm(loadRoles().find(function (r) { return r._id === this.dataset.edit; }.bind(b))); }.bind(b));
    });
    host.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = this.dataset.del;
        confirmDialog('删除角色', '确认删除该角色?', function () {
          var l = loadRoles().filter(function (r) { return r._id !== id; });
          saveRoles(l); paint();
        });
      });
    });
  }
  paint();
  document.getElementById('rlNew').addEventListener('click', function () { openForm(null); });

  function openForm(rec) {
    rec = rec || { name: '', desc: '', color: '#5865F2', perms: [] };
    var html = '<div class="modal-backdrop" id="rlModal"><div class="modal" style="max-width:560px">' +
      '<div class="modal-head"><h3>' + (rec._id ? '编辑角色' : '添加角色') + '</h3>' +
      '<button class="modal-close" id="rlCancel">×</button></div>' +
      '<div class="modal-body"><div class="form-grid">' +
      '<div class="field-row"><label class="field-label"><span class="required">*</span>角色名称</label>' +
      '<input class="input" id="rlName" value="' + esc(rec.name) + '"></div>' +
      '<div class="field-row"><label class="field-label">主题色</label>' +
      '<input class="input" type="color" id="rlColor" value="' + esc(rec.color) + '" style="height:40px"></div>' +
      '<div class="field-row full"><label class="field-label">角色说明</label>' +
      '<textarea class="input" id="rlDesc" rows="2">' + esc(rec.desc || '') + '</textarea></div>' +
      '<div class="field-row full"><label class="field-label">权限配置</label>' +
      paintPermGrid(rec.perms || []) + '</div>' +
      '</div></div>' +
      '<div class="modal-foot"><button class="btn-ghost" id="rlCancel2">取消</button>' +
      '<button class="btn-success" id="rlSave">' + (rec._id ? '保存修改' : '添加') + '</button></div>' +
      '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('rlCancel').onclick = document.getElementById('rlCancel2').onclick = closeModal;
    /* 切换权限 */
    document.querySelectorAll('#rlModal .perm-cell').forEach(function (cell) {
      cell.addEventListener('click', function (e) {
        e.preventDefault();
        var cb = this.querySelector('input');
        cb.checked = !cb.checked;
        this.style.borderColor = cb.checked ? 'var(--primary)' : 'var(--border)';
        this.style.background = cb.checked ? 'var(--primary-bg)' : 'var(--input-bg)';
        this.style.color = cb.checked ? 'var(--primary-light)' : 'var(--text-secondary)';
      });
    });
    document.getElementById('rlSave').onclick = function () {
      var name = document.getElementById('rlName').value.trim();
      if (!name) { toast('请填写角色名称', 'warn'); return; }
      var perms = [];
      document.querySelectorAll('#rlModal .perm-cell').forEach(function (c) {
        if (c.querySelector('input').checked) perms.push(c.dataset.id);
      });
      var l = loadRoles();
      if (rec._id) {
        var i = l.findIndex(function (x) { return x._id === rec._id; });
        l[i].name = name;
        l[i].desc = document.getElementById('rlDesc').value;
        l[i].color = document.getElementById('rlColor').value;
        l[i].perms = perms;
      } else {
        l.unshift({ _id: 'r_' + uuid().substring(0, 8), name: name,
          desc: document.getElementById('rlDesc').value,
          color: document.getElementById('rlColor').value,
          perms: perms });
      }
      saveRoles(l);
      closeModal(); paint();
      toast('已保存', 'success');
    };
  }
  function closeModal() { var m = document.getElementById('rlModal'); if (m) m.remove(); }
}
window.initRolesPage = initRolesPage;
window.addEventListener('DOMContentLoaded', initRolesPage);
if (document.readyState !== 'loading') initRolesPage();
