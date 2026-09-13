/* ============================================================
 * 项目管理页（列表 + 新建/编辑/归档）
 * ============================================================ */

async function initProjectsPage() {
  var user = await requireLogin();
  if (!user) return;
  if (!requireModule('m_projects')) return;
  var content = renderPage({
    active: 'projects',
    pageHtml:
      '<div class="page-header-row">' +
        '<h2 class="page-title-text">项目管理</h2>' +
        '<div class="page-actions">' +
          '<select class="input page-filter" id="statusFilter">' +
            '<option value="all">全部状态</option>' +
            Object.keys(PROJECT_STATUS_TEXT).map(function (k) {
              return '<option value="' + k + '">' + PROJECT_STATUS_TEXT[k] + '</option>';
            }).join('') +
          '</select>' +
          (canManage() ? '<button class="btn btn-primary" id="btnAdd">+ 新建项目</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="project-grid" id="projectGrid"></div>'
  });

  var state = { statusFilter: 'all' };

  function render() {
    var all = loadProjects();
    var filtered = all.filter(function (p) {
      if (state.statusFilter !== 'all' && p.status !== state.statusFilter) return false;
      return true;
    });
    var grid = document.getElementById('projectGrid');
    if (filtered.length === 0) {
      renderEmpty(grid, canManage() ? '暂无项目，点击右上角新建' : '暂无项目');
      return;
    }
    grid.innerHTML = filtered.map(function (p) {
      var mgr = p.managerId ? getMember(p.managerId) : null;
      var memberCount = (p.memberIds || []).length;
      var tasks = loadTasks().filter(function (t) { return t.projectId === p._id; });
      var doneCount = tasks.filter(function (t) { return t.status === TASK_STATUS.DONE; }).length;
      var daysLeft = p.endDate ? daysBetween(todayStr(), p.endDate) : null;
      var overdue = daysLeft !== null && daysLeft < 0 && p.status !== PROJECT_STATUS.COMPLETED;
      return '<div class="project-card" data-id="' + esc(p._id) + '">' +
        '<div class="project-card-top">' +
          '<span class="status-badge" style="background:' + PROJECT_STATUS_COLOR[p.status] + '">' + PROJECT_STATUS_TEXT[p.status] + '</span>' +
          (overdue ? '<span class="badge-overdue">已逾期 ' + (-daysLeft) + ' 天</span>' : '') +
        '</div>' +
        '<h3 class="project-card-name">' + esc(p.name) + '</h3>' +
        (p.code ? '<div class="project-card-code">' + esc(p.code) + '</div>' : '') +
        (p.location ? '<div class="project-card-loc">📍 ' + esc(p.location) + '</div>' : '') +
        '<div class="progress-bar-wrap">' +
          '<div class="progress-bar" style="width:' + (p.progress || 0) + '%; background:' + PROJECT_STATUS_COLOR[p.status] + '"></div>' +
          '<span class="progress-label">' + (p.progress || 0) + '%</span>' +
        '</div>' +
        '<div class="project-card-meta">' +
          '<span>👤 ' + esc(mgr ? mgr.name : '未指定') + '</span>' +
          '<span>👥 ' + memberCount + ' 人</span>' +
          '<span>📋 ' + doneCount + '/' + tasks.length + ' 任务</span>' +
        '</div>' +
        (canManage() ? '<div class="project-card-actions">' +
          '<button class="btn-link" data-act="edit" data-id="' + esc(p._id) + '">编辑</button>' +
          '<button class="btn-link" data-act="archive" data-id="' + esc(p._id) + '">' + (p.status === PROJECT_STATUS.ARCHIVED ? '取消归档' : '归档') + '</button>' +
          '<button class="btn-link danger" data-act="delete" data-id="' + esc(p._id) + '">删除</button>' +
        '</div>' : '') +
      '</div>';
    }).join('');

    grid.querySelectorAll('.project-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('.project-card-actions')) return;
        location.href = 'project.html?id=' + encodeURIComponent(card.dataset.id);
      });
    });
  }
  render();

  document.getElementById('statusFilter').addEventListener('change', function (e) {
    state.statusFilter = e.target.value;
    render();
  });

  if (canManage()) {
    document.getElementById('btnAdd').onclick = function () { showProjectDialog(null); };
  }
  document.getElementById('projectGrid').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var id = btn.dataset.id;
    var p = getProject(id);
    if (!p) return;
    if (btn.dataset.act === 'edit') showProjectDialog(p);
    else if (btn.dataset.act === 'archive') {
      var newStatus = p.status === PROJECT_STATUS.ARCHIVED ? PROJECT_STATUS.PLANNING : PROJECT_STATUS.ARCHIVED;
      updateProject(id, { status: newStatus });
      toast(newStatus === PROJECT_STATUS.ARCHIVED ? '已归档' : '已恢复');
      render();
    }
    else if (btn.dataset.act === 'delete') {
      confirmDialog('删除项目', '删除 "' + p.name + '" 将同时删除其下所有任务，确定？', function () {
        deleteProject(id);
        toast('已删除');
        render();
      });
    }
  });

  function showProjectDialog(p) {
    var isEdit = !!p;
    p = p || { name: '', code: '', description: '', location: '', managerId: '', memberIds: [], startDate: todayStr(), endDate: '', status: PROJECT_STATUS.PLANNING, tags: [] };
    var members = loadMembers();

    var bodyHtml =
      '<div class="form-section">' +
        '<label class="form-label">项目名称 *</label>' +
        '<input class="input" id="p_name" value="' + esc(p.name) + '" placeholder="必填">' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-section form-half">' +
          '<label class="form-label">项目编号</label>' +
          '<input class="input" id="p_code" value="' + esc(p.code) + '" placeholder="如 YG-001">' +
        '</div>' +
        '<div class="form-section form-half">' +
          '<label class="form-label">状态</label>' +
          '<select class="input" id="p_status">' +
            Object.keys(PROJECT_STATUS_TEXT).map(function (k) {
              return '<option value="' + k + '"' + (k === p.status ? ' selected' : '') + '>' + PROJECT_STATUS_TEXT[k] + '</option>';
            }).join('') +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div class="form-section">' +
        '<label class="form-label">位置</label>' +
        '<input class="input" id="p_location" value="' + esc(p.location) + '" placeholder="项目所在地">' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-section form-half">' +
          '<label class="form-label">开始日期 *</label>' +
          '<input class="input" type="date" id="p_startDate" value="' + esc(p.startDate) + '">' +
        '</div>' +
        '<div class="form-section form-half">' +
          '<label class="form-label">计划完工</label>' +
          '<input class="input" type="date" id="p_endDate" value="' + esc(p.endDate) + '">' +
        '</div>' +
      '</div>' +
      '<div class="form-section">' +
        '<label class="form-label">项目经理</label>' +
        '<select class="input" id="p_managerId">' +
          '<option value="">未指定</option>' +
          members.map(function (m) {
            return '<option value="' + esc(m._id) + '"' + (m._id === p.managerId ? ' selected' : '') + '>' + esc(m.name) + ' (' + esc(roleLabel(m.role)) + ')</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<div class="form-section">' +
        '<label class="form-label">项目成员（可多选）</label>' +
        '<div class="member-picker" id="p_members">' +
          members.map(function (m) {
            var checked = (p.memberIds || []).indexOf(m._id) >= 0;
            return '<label class="member-pick">' +
              '<input type="checkbox" value="' + esc(m._id) + '"' + (checked ? ' checked' : '') + '>' +
              esc(m.name) +
            '</label>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="form-section">' +
        '<label class="form-label">描述</label>' +
        '<textarea class="textarea" id="p_description" placeholder="项目说明">' + esc(p.description) + '</textarea>' +
      '</div>';

    confirmDialogEx(isEdit ? '编辑项目' : '新建项目', bodyHtml, function () {
      var data = {
        name: document.getElementById('p_name').value.trim(),
        code: document.getElementById('p_code').value.trim(),
        status: document.getElementById('p_status').value,
        location: document.getElementById('p_location').value.trim(),
        startDate: document.getElementById('p_startDate').value,
        endDate: document.getElementById('p_endDate').value,
        managerId: document.getElementById('p_managerId').value,
        memberIds: Array.from(document.querySelectorAll('#p_members input:checked')).map(function (i) { return i.value; }),
        description: document.getElementById('p_description').value.trim()
      };
      var err = validateProject(data);
      if (err) { toast(err, 'error'); return false; }
      if (isEdit) updateProject(p._id, data);
      else createProject(data);
      toast(isEdit ? '已保存' : '已创建');
      render();
      return true;
    });
  }
}
window.initProjectsPage = initProjectsPage;
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initProjectsPage);
} else {
  initProjectsPage();
}