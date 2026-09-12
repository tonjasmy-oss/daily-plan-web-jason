/* ============================================================
 * 人员管理页
 * ============================================================ */

async function initMembersPage() {
  var user = await requireLogin();
  if (!user) return;
  if (user.role !== ROLE.ADMIN && user.role !== ROLE.MANAGER) {
    toast('无权访问人员管理', 'error');
    setTimeout(function () { location.href = 'dashboard.html'; }, 800);
    return;
  }

  var content = renderPage({
    active: 'members',
    pageHtml: '<div class="page-header-row">' +
      '<h2 class="page-title-text">人员管理</h2>' +
      '<div class="page-actions">' +
        '<input type="search" class="input page-search" id="searchInput" placeholder="搜索姓名/工种/电话">' +
        '<button class="btn btn-primary" id="btnAdd">+ 新增人员</button>' +
      '</div>' +
    '</div>' +
    '<div class="member-stats" id="memberStats"></div>' +
    '<div class="member-list" id="memberList"></div>'
  });

  var state = { keyword: '', roleFilter: 'all' };

  function refreshStats() {
    var all = loadMembers();
    var active = all.filter(function (m) { return m.active !== false; });
    var byRole = {};
    ROLE_TEXT && Object.keys(ROLE_TEXT).forEach(function (r) { byRole[r] = 0; });
    all.forEach(function (m) {
      byRole[m.role] = (byRole[m.role] || 0) + 1;
    });
    var stats = document.getElementById('memberStats');
    stats.innerHTML =
      '<div class="stat-card"><div class="stat-value">' + all.length + '</div><div class="stat-label">总人数</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + active.length + '</div><div class="stat-label">在职</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + (byRole[ROLE.ADMIN] || 0) + '</div><div class="stat-label">' + ROLE_ICON[ROLE.ADMIN] + ' 管理员</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + (byRole[ROLE.MANAGER] || 0) + '</div><div class="stat-label">' + ROLE_ICON[ROLE.MANAGER] + ' 项目经理</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + (byRole[ROLE.WORKER] || 0) + '</div><div class="stat-label">' + ROLE_ICON[ROLE.WORKER] + ' 工人</div></div>';
  }

  function renderList() {
    var all = loadMembers();
    var kw = (state.keyword || '').trim().toLowerCase();
    var filtered = all.filter(function (m) {
      if (state.roleFilter !== 'all' && m.role !== state.roleFilter) return false;
      if (!kw) return true;
      return (m.name && m.name.toLowerCase().indexOf(kw) >= 0) ||
             (m.workType && m.workType.indexOf(kw) >= 0) ||
             (m.phone && m.phone.indexOf(kw) >= 0);
    });
    var list = document.getElementById('memberList');
    if (filtered.length === 0) {
      renderEmpty(list, '无匹配人员');
      return;
    }
    list.innerHTML = filtered.map(function (m) {
      var avatar = m.avatar
        ? '<img class="member-avatar" src="' + esc(m.avatar) + '" alt="">'
        : '<div class="member-avatar avatar-text">' + esc(m.name.charAt(0)) + '</div>';
      var tasks = loadTasks().filter(function (t) { return t.assigneeId === m._id; });
      var todo = tasks.filter(function (t) { return t.status !== TASK_STATUS.DONE; }).length;
      var done = tasks.filter(function (t) { return t.status === TASK_STATUS.DONE; }).length;
      return '<div class="member-card">' +
        '<div class="member-row1">' + avatar +
          '<div class="member-meta">' +
            '<div class="member-name">' + esc(m.name) +
              '<span class="role-tag role-' + esc(m.role) + '">' + esc(ROLE_ICON[m.role] + ' ' + ROLE_TEXT[m.role]) + '</span>' +
              (m.active === false ? '<span class="badge-disabled">已停用</span>' : '') +
            '</div>' +
            '<div class="member-sub">' + esc(m.workType || '未指定工种') + (m.phone ? ' · 📞 ' + esc(m.phone) : '') + '</div>' +
          '</div>' +
          '<div class="member-actions">' +
            '<button class="btn-icon" data-act="edit" data-id="' + esc(m._id) + '" title="编辑">✎</button>' +
            (m._id === user._id ? '' :
              '<button class="btn-icon danger" data-act="delete" data-id="' + esc(m._id) + '" title="删除">🗑</button>') +
          '</div>' +
        '</div>' +
        '<div class="member-row2">' +
          '<span>📋 待办 <strong>' + todo + '</strong></span>' +
          '<span>✅ 完成 <strong>' + done + '</strong></span>' +
          '<span>📅 入职 ' + esc(m.joinDate || '-') + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function refresh() { refreshStats(); renderList(); }
  refresh();

  document.getElementById('searchInput').addEventListener('input', function (e) {
    state.keyword = e.target.value;
    renderList();
  });

  document.getElementById('btnAdd').onclick = function () { showMemberDialog(null); };
  document.getElementById('memberList').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var id = btn.dataset.id;
    var m = getMember(id);
    if (!m) return;
    if (btn.dataset.act === 'edit') showMemberDialog(m);
    if (btn.dataset.act === 'delete') {
      confirmDialog('删除人员', '确定删除 ' + m.name + '？相关项目和任务关联会一并解除。', function () {
        deleteMember(id);
        toast('已删除');
        refresh();
      });
    }
  });

  function showMemberDialog(m) {
    var isEdit = !!m;
    m = m || { name: '', role: ROLE.WORKER, workType: WORK_TYPE.GENERAL, phone: '', joinDate: todayStr(), active: true };
    var html =
      '<div class="form-section">' +
        '<label class="form-label">姓名 *</label>' +
        '<input class="input" id="m_name" value="' + esc(m.name) + '" placeholder="必填">' +
      '</div>' +
      '<div class="form-section">' +
        '<label class="form-label">角色</label>' +
        '<select class="input" id="m_role">' +
          Object.keys(ROLE_TEXT).map(function (r) {
            return '<option value="' + r + '"' + (r === m.role ? ' selected' : '') + '>' + ROLE_ICON[r] + ' ' + ROLE_TEXT[r] + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<div class="form-section">' +
        '<label class="form-label">工种</label>' +
        '<select class="input" id="m_workType">' +
          Object.keys(WORK_TYPE).map(function (k) {
            return '<option value="' + WORK_TYPE[k] + '"' + (WORK_TYPE[k] === m.workType ? ' selected' : '') + '>' + esc(WORK_TYPE[k]) + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<div class="form-section">' +
        '<label class="form-label">联系电话</label>' +
        '<input class="input" id="m_phone" value="' + esc(m.phone) + '" placeholder="选填">' +
      '</div>' +
      '<div class="form-section">' +
        '<label class="form-label">入职日期</label>' +
        '<input class="input" type="date" id="m_joinDate" value="' + esc(m.joinDate) + '">' +
      '</div>' +
      (isEdit ?
        '<div class="form-section">' +
          '<label class="form-label"><input type="checkbox" id="m_active"' + (m.active !== false ? ' checked' : '') + '> 在职</label>' +
        '</div>' : '');

    confirmDialogEx(isEdit ? '编辑人员' : '新增人员', html, function () {
      var data = {
        name: document.getElementById('m_name').value.trim(),
        role: document.getElementById('m_role').value,
        workType: document.getElementById('m_workType').value,
        phone: document.getElementById('m_phone').value.trim(),
        joinDate: document.getElementById('m_joinDate').value
      };
      if (isEdit) {
        data.active = document.getElementById('m_active').checked;
      }
      var err = validateMember(data);
      if (err) { toast(err, 'error'); return false; }  /* 返回 false 不关闭 */
      if (isEdit) updateMember(m._id, data);
      else createMember(data);
      toast(isEdit ? '已保存' : '已新增');
      refresh();
      return true;
    });
  }
}
window.initMembersPage = initMembersPage;
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initMembersPage);
} else {
  initMembersPage();
}

/* confirmDialogEx 已迁移到 common.js,这里不再重复定义 */