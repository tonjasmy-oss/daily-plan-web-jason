/* ============================================================
 * 人员管理页
 * ============================================================ */

async function initMembersPage() {
  var user = await requireLogin();
  if (!user) return;
  /* 工具: 角色中文名 —— 优先 roles 表, 回落到 common.js 的 ROLE_TEXT */
  function _roleLabel(key) { return roleLabel(key) || key || '未分配'; }
  if (!requireModule('m_members')) return;
  /* 管理员/主管才能进人员管理 */
  if (user.role !== 'admin' && user.role !== 'lead') {
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

  /* 统计卡片: 顶部"总人数/在职"固定 + 每个角色动态生成一张 */
  function refreshStats() {
    var all = loadMembers();
    var active = all.filter(function (m) { return m.active !== false; });
    var roles = (typeof loadRoles === 'function') ? (loadRoles() || []) : [];
    var byRole = {};
    roles.forEach(function (r) { byRole[r.key] = 0; });
    all.forEach(function (m) { byRole[m.role] = (byRole[m.role] || 0) + 1; });
    var stats = document.getElementById('memberStats');
    var html =
      '<div class="stat-card"><div class="stat-value">' + all.length + '</div><div class="stat-label">总人数</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + active.length + '</div><div class="stat-label">在职</div></div>';
    roles.forEach(function (r) {
      html += '<div class="stat-card"><div class="stat-value">' + (byRole[r.key] || 0) +
        '</div><div class="stat-label">' + esc(r.name) + '</div></div>';
    });
    stats.innerHTML = html;
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
              '<span class="role-tag role-' + esc(m.role) + '">' + esc(_roleLabel(m.role)) + '</span>' +
              (m.active === false ? '<span class="badge-disabled">已停用</span>' : '') +
            '</div>' +
            '<div class="member-sub">' + esc(m.workType || '未指定工种') + (m.phone ? ' · 📞 ' + esc(m.phone) : '') + '</div>' +
          '</div>' +
          '<div class="member-actions">' +
            '<button class="btn-icon" data-act="edit" data-id="' + esc(m._id) + '" title="编辑">✎</button>' +
            (user.role === 'admin'
              ? '<button class="btn-icon" data-act="resetpwd" data-id="' + esc(m._id) + '" title="重置登录密码">🔑</button>'
              : '') +
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
    if (btn.dataset.act === 'resetpwd') {
      if (user.role !== 'admin') { toast('只有管理员可以重置密码', 'warn'); return; }
      var phone = (m.phone || '').trim();
      var target = phone.length >= 6 ? '手机号后 6 位（' + phone.slice(-6) + '）' : '默认密码 123456';
      confirmDialogEx(
        '重置登录密码',
        '<div class="form-section">' +
          '<div>确定重置「<b>' + esc(m.name) + '</b>」的登录密码？</div>' +
          '<div class="form-hint" style="margin-top:10px;">' +
            '将重置为：<b>' + esc(target) + '</b><br>' +
            '该成员在所有设备上的登录会被立即注销，需要用新密码重新登录。' +
          '</div>' +
        '</div>',
        function () {
          resetMemberPassword(id).then(function (res) {
            confirmDialogEx(
              '密码已重置',
              '<div class="form-section">' +
                '<div class="muted">请把下面这串新密码告知「' + esc(m.name) + '」：</div>' +
                '<input class="input" readonly value="' + esc(res.password) + '" ' +
                  'onclick="this.select()" style="margin-top:8px;font-size:16px;letter-spacing:2px;text-align:center;">' +
                '<div class="form-hint">点击可全选复制。已注销其 ' + (res.killedSessions || 0) + ' 个设备会话。</div>' +
              '</div>',
              null
            );
          }).catch(function (err) {
            toast((err && err.message) || '重置失败', 'error');
          });
        });
    }
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
    m = m || { name: '', role: 'worker', workType: '', phone: '', joinDate: todayStr(), active: true };
    var workTypes = loadWorkTypes();
    /* 角色下拉数据来自 roles 表 (与用户角色页同步) */
    var rolesList = (typeof loadRoles === 'function') ? (loadRoles() || []) : [];
    var roleOptions = rolesList.map(function (r) {
      return '<option value="' + esc(r.key) + '"' + (r.key === m.role ? ' selected' : '') + '>' + esc(r.name) + '</option>';
    }).join('');
    var html =
      '<div class="form-section">' +
        '<label class="form-label">姓名 *</label>' +
        '<input class="input" id="m_name" value="' + esc(m.name) + '" placeholder="必填">' +
      '</div>' +
      '<div class="form-section">' +
        '<label class="form-label">角色</label>' +
        '<select class="input" id="m_role">' +
          (roleOptions || '<option value="worker">综合维修工</option>') +
        '</select>' +
        '<div class="form-hint">角色列表与「系统设置 → 用户角色」保持一致</div>' +
      '</div>' +
      '<div class="form-section">' +
        '<label class="form-label">工种</label>' +
        '<select class="input" id="m_workType">' +
          '<option value=""' + (!m.workType ? ' selected' : '') + '>未指定工种</option>' +
          workTypes.map(function (w) {
            return '<option value="' + esc(w.name) + '"' + (w.name === m.workType ? ' selected' : '') + '>' + esc(w.name) + '</option>';
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