/* ============================================================
 * 项目详情页：基本信息 + 任务列表 + 项目统计
 * ============================================================ */

async function initProjectDetailPage() {
  var user = await requireLogin();
  if (!user) return;
  var projectId = queryParam('id');
  if (!projectId) { toast('缺少项目ID', 'error'); setTimeout(function () { location.href = 'projects.html'; }, 800); return; }
  var p = getProject(projectId);
  if (!p) { toast('项目不存在', 'error'); setTimeout(function () { location.href = 'projects.html'; }, 800); return; }

  var content = renderPage({
    active: 'projects',
    pageHtml: '<div class="detail-loading">加载中...</div>'
  });

  function render() {
    p = getProject(projectId);
    var mgr = p.managerId ? getMember(p.managerId) : null;
    var members = (p.memberIds || []).map(function (id) { return getMember(id); }).filter(Boolean);
    var tasks = loadTasks().filter(function (t) { return t.projectId === p._id; });
    var byStatus = {};
    Object.keys(TASK_STATUS_TEXT).forEach(function (k) { byStatus[k] = 0; });
    tasks.forEach(function (t) { byStatus[t.status] = (byStatus[t.status] || 0) + 1; });
    var daysLeft = p.endDate ? daysBetween(todayStr(), p.endDate) : null;

    content.innerHTML =
      '<div class="detail-back"><a href="projects.html">‹ 返回项目列表</a></div>' +
      '<div class="detail-header">' +
        '<div>' +
          '<h2 class="page-title-text">' + esc(p.name) + (p.code ? ' <span class="muted">(' + esc(p.code) + ')</span>' : '') + '</h2>' +
          '<div class="detail-meta">' +
            '<span class="status-badge" style="background:' + PROJECT_STATUS_COLOR[p.status] + '">' + PROJECT_STATUS_TEXT[p.status] + '</span>' +
            (p.location ? '<span>📍 ' + esc(p.location) + '</span>' : '') +
            (mgr ? '<span>👤 ' + esc(mgr.name) + '</span>' : '') +
            (p.startDate ? '<span>📅 ' + esc(p.startDate) + ' ~ ' + esc(p.endDate || '未定') + '</span>' : '') +
            (daysLeft !== null && p.status !== PROJECT_STATUS.COMPLETED ?
              '<span class="' + (daysLeft < 0 ? 'badge-overdue' : 'muted') + '">' +
              (daysLeft < 0 ? '已逾期 ' + (-daysLeft) + ' 天' : '剩余 ' + daysLeft + ' 天') + '</span>' : '') +
          '</div>' +
        '</div>' +
        (canManage() ? '<div class="detail-actions">' +
          '<button class="btn btn-primary" id="btnAddTask">+ 新建任务</button>' +
          '<button class="btn btn-default" id="btnEdit">编辑项目</button>' +
        '</div>' : '') +
      '</div>' +
      '<div class="project-progress-card">' +
        '<div class="big-progress-circle" id="progressCircle" data-progress="' + (p.progress || 0) + '">' +
          '<span class="big-progress-num">' + (p.progress || 0) + '<small>%</small></span>' +
          '<span class="big-progress-label">总进度</span>' +
        '</div>' +
        '<div class="task-status-summary">' +
          Object.keys(TASK_STATUS_TEXT).map(function (k) {
            return '<div class="status-pill" style="border-left:4px solid ' + TASK_STATUS_COLOR[k] + '">' +
              '<span class="status-pill-num">' + (byStatus[k] || 0) + '</span>' +
              '<span class="status-pill-label">' + TASK_STATUS_TEXT[k] + '</span>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>' +
      (p.description ? '<div class="detail-desc">' + esc(p.description) + '</div>' : '') +
      '<div class="detail-section">' +
        '<div class="detail-section-header">' +
          '<h3>项目成员</h3>' +
          '<span class="muted">' + members.length + ' 人</span>' +
        '</div>' +
        '<div class="member-chips">' +
          (mgr ? '<span class="chip chip-manager">' + esc(mgr.name) + ' (项目经理)</span>' : '<span class="muted">未指定项目经理</span>') +
          members.map(function (m) { return '<span class="chip">' + esc(m.name) + '</span>'; }).join('') +
        '</div>' +
      '</div>' +
      '<div class="detail-section">' +
        '<div class="detail-section-header">' +
          '<h3>任务列表</h3>' +
          '<a class="btn-link" href="tasks.html?projectId=' + esc(p._id) + '">查看全部 →</a>' +
        '</div>' +
        '<div class="task-list-mini" id="taskListMini"></div>' +
      '</div>';

    /* 任务列表（前 8 条） */
    var sortedTasks = tasks.slice().sort(function (a, b) {
      /* 进行中 > 待办 > 待验收 > 阻塞 > 已完成 */
      var order = { in_progress: 0, todo: 1, review: 2, blocked: 3, done: 4 };
      return (order[a.status] || 9) - (order[b.status] || 9);
    });
    var top = sortedTasks.slice(0, 8);
    var listMini = document.getElementById('taskListMini');
    if (top.length === 0) {
      renderEmpty(listMini, '暂无任务');
    } else {
      listMini.innerHTML = top.map(renderTaskItem).join('');
      listMini.addEventListener('click', function (e) {
        var t = e.target.closest('[data-task-id]');
        if (t) location.href = 'task.html?id=' + encodeURIComponent(t.dataset.taskId);
      });
    }

    /* 绑定按钮 */
    var btnAdd = document.getElementById('btnAddTask');
    if (btnAdd) btnAdd.onclick = function () { showTaskDialog(null); };
    var btnEdit = document.getElementById('btnEdit');
    if (btnEdit) btnEdit.onclick = function () { showProjectEditDialog(p); };

    drawProgressCircle();
  }

  function renderTaskItem(t) {
    var assignee = t.assigneeId ? getMember(t.assigneeId) : null;
    var overdue = t.dueDate && t.status !== TASK_STATUS.DONE && t.dueDate < todayStr();
    return '<div class="task-row" data-task-id="' + esc(t._id) + '">' +
      '<span class="priority-dot" style="background:' + PRIORITY_COLOR[t.priority] + '" title="' + PRIORITY_TEXT[t.priority] + '"></span>' +
      '<span class="task-title">' + esc(t.title) + '</span>' +
      '<span class="task-status-pill" style="background:' + TASK_STATUS_COLOR[t.status] + '">' + TASK_STATUS_TEXT[t.status] + '</span>' +
      '<span class="task-assignee">' + (assignee ? esc(assignee.name) : '未分配') + '</span>' +
      '<span class="task-due' + (overdue ? ' overdue' : '') + '">' + (t.dueDate ? '📅 ' + esc(t.dueDate) : '') + '</span>' +
    '</div>';
  }

  function drawProgressCircle() {
    var el = document.getElementById('progressCircle');
    if (!el) return;
    var pct = Number(el.dataset.progress) || 0;
    var size = 140, stroke = 12;
    var r = (size - stroke) / 2;
    var c = 2 * Math.PI * r;
    var dash = c * pct / 100;
    el.innerHTML =
      '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '">' +
        '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="#2E3468" stroke-width="' + stroke + '"/>' +
        '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="#5865F2" stroke-width="' + stroke + '" ' +
        'stroke-linecap="round" stroke-dasharray="' + dash + ' ' + c + '" ' +
        'transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/>' +
      '</svg>' +
      '<div class="progress-overlay">' +
        '<span class="big-progress-num">' + pct + '<small>%</small></span>' +
        '<span class="big-progress-label">总进度</span>' +
      '</div>';
  }

  function showTaskDialog(t) {
    var isEdit = !!t;
    t = t || { projectId: p._id, title: '', description: '', assigneeId: '', priority: PRIORITY.NORMAL, status: TASK_STATUS.TODO, startDate: todayStr(), dueDate: '', progress: 0 };
    var members = loadMembers();
    var bodyHtml =
      '<div class="form-section"><label class="form-label">任务标题 *</label>' +
        '<input class="input" id="t_title" value="' + esc(t.title) + '" placeholder="任务标题"></div>' +
      '<div class="form-row">' +
        '<div class="form-section form-half"><label class="form-label">负责人</label>' +
          '<select class="input" id="t_assignee"><option value="">未分配</option>' +
          members.map(function (m) { return '<option value="' + esc(m._id) + '"' + (m._id === t.assigneeId ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join('') +
          '</select></div>' +
        '<div class="form-section form-half"><label class="form-label">优先级</label>' +
          '<select class="input" id="t_priority">' +
          Object.keys(PRIORITY_TEXT).map(function (k) { return '<option value="' + k + '"' + (k === t.priority ? ' selected' : '') + '>' + PRIORITY_TEXT[k] + '</option>'; }).join('') +
          '</select></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-section form-half"><label class="form-label">开始</label>' +
          '<input class="input" type="date" id="t_startDate" value="' + esc(t.startDate) + '"></div>' +
        '<div class="form-section form-half"><label class="form-label">截止</label>' +
          '<input class="input" type="date" id="t_dueDate" value="' + esc(t.dueDate) + '"></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-section form-half"><label class="form-label">状态</label>' +
          '<select class="input" id="t_status">' +
          Object.keys(TASK_STATUS_TEXT).map(function (k) { return '<option value="' + k + '"' + (k === t.status ? ' selected' : '') + '>' + TASK_STATUS_TEXT[k] + '</option>'; }).join('') +
          '</select></div>' +
        '<div class="form-section form-half"><label class="form-label">进度 %</label>' +
          '<input class="input" type="number" min="0" max="100" id="t_progress" value="' + (t.progress || 0) + '"></div>' +
      '</div>' +
      '<div class="form-section"><label class="form-label">描述</label>' +
        '<textarea class="textarea" id="t_description" placeholder="任务描述">' + esc(t.description) + '</textarea></div>';

    confirmDialogEx(isEdit ? '编辑任务' : '新建任务', bodyHtml, function () {
      var data = {
        projectId: p._id,
        title: document.getElementById('t_title').value.trim(),
        assigneeId: document.getElementById('t_assignee').value,
        priority: document.getElementById('t_priority').value,
        startDate: document.getElementById('t_startDate').value,
        dueDate: document.getElementById('t_dueDate').value,
        status: document.getElementById('t_status').value,
        progress: Math.max(0, Math.min(100, Number(document.getElementById('t_progress').value) || 0)),
        description: document.getElementById('t_description').value.trim()
      };
      var err = validateTask(data);
      if (err) { toast(err, 'error'); return false; }
      if (isEdit) updateTask(t._id, Object.assign({}, data, { _changedBy: user._id }));
      else createTask(Object.assign({}, data, { reporterId: user._id }));
      toast(isEdit ? '已保存' : '已创建');
      render();
      return true;
    });
  }

  function showProjectEditDialog(p) {
    var isEdit = true;
    var members = loadMembers();
    var bodyHtml =
      '<div class="form-section"><label class="form-label">项目名称 *</label>' +
        '<input class="input" id="p_name" value="' + esc(p.name) + '"></div>' +
      '<div class="form-row">' +
        '<div class="form-section form-half"><label class="form-label">状态</label>' +
          '<select class="input" id="p_status">' +
          Object.keys(PROJECT_STATUS_TEXT).map(function (k) { return '<option value="' + k + '"' + (k === p.status ? ' selected' : '') + '>' + PROJECT_STATUS_TEXT[k] + '</option>'; }).join('') +
          '</select></div>' +
        '<div class="form-section form-half"><label class="form-label">编号</label>' +
          '<input class="input" id="p_code" value="' + esc(p.code) + '"></div>' +
      '</div>' +
      '<div class="form-section"><label class="form-label">位置</label>' +
        '<input class="input" id="p_location" value="' + esc(p.location) + '"></div>' +
      '<div class="form-row">' +
        '<div class="form-section form-half"><label class="form-label">开始日期</label>' +
          '<input class="input" type="date" id="p_startDate" value="' + esc(p.startDate) + '"></div>' +
        '<div class="form-section form-half"><label class="form-label">计划完工</label>' +
          '<input class="input" type="date" id="p_endDate" value="' + esc(p.endDate) + '"></div>' +
      '</div>' +
      '<div class="form-section"><label class="form-label">项目经理</label>' +
        '<select class="input" id="p_managerId"><option value="">未指定</option>' +
        members.map(function (m) { return '<option value="' + esc(m._id) + '"' + (m._id === p.managerId ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join('') +
        '</select></div>' +
      '<div class="form-section"><label class="form-label">描述</label>' +
        '<textarea class="textarea" id="p_description">' + esc(p.description) + '</textarea></div>';

    confirmDialogEx('编辑项目', bodyHtml, function () {
      var data = {
        name: document.getElementById('p_name').value.trim(),
        status: document.getElementById('p_status').value,
        code: document.getElementById('p_code').value.trim(),
        location: document.getElementById('p_location').value.trim(),
        startDate: document.getElementById('p_startDate').value,
        endDate: document.getElementById('p_endDate').value,
        managerId: document.getElementById('p_managerId').value,
        description: document.getElementById('p_description').value.trim()
      };
      var err = validateProject(data);
      if (err) { toast(err, 'error'); return false; }
      updateProject(p._id, data);
      toast('已保存');
      render();
      return true;
    });
  }

  render();
}
window.initProjectDetailPage = initProjectDetailPage;
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initProjectDetailPage);
} else {
  initProjectDetailPage();
}