/* ============================================================
 * 任务看板（todo / in_progress / review / done / blocked）
 * 列表/看板两种视图切换，支持筛选
 * ============================================================ */

async function initTasksPage() {
  var user = await requireLogin();
  if (!user) return;

  var projectFilter = queryParam('projectId') || '';
  var assigneeFilter = queryParam('assigneeId') || 'all';

  var content = renderPage({
    active: 'tasks',
    pageHtml:
      '<div class="page-header-row">' +
        '<h2 class="page-title-text">任务看板</h2>' +
        '<div class="page-actions">' +
          '<div class="view-toggle">' +
            '<button class="view-toggle-btn active" data-view="board">看板</button>' +
            '<button class="view-toggle-btn" data-view="list">列表</button>' +
          '</div>' +
          '<button class="btn btn-primary" id="btnAdd">+ 新建任务</button>' +
        '</div>' +
      '</div>' +
      '<div class="filter-bar">' +
        '<select class="input page-filter" id="projectFilter"><option value="">全部项目</option></select>' +
        '<select class="input page-filter" id="assigneeFilter"><option value="all">全部人员</option><option value="">未分配</option><option value="me">仅我负责</option></select>' +
        '<select class="input page-filter" id="statusFilter"><option value="">全部状态</option>' +
          Object.keys(TASK_STATUS_TEXT).map(function (k) { return '<option value="' + k + '">' + TASK_STATUS_TEXT[k] + '</option>'; }).join('') +
        '</select>' +
        '<input type="search" class="input page-search" id="searchInput" placeholder="搜索标题/描述">' +
      '</div>' +
      '<div id="boardView"></div>' +
      '<div id="listView" style="display:none;"></div>'
  });

  var state = {
    view: 'board',
    projectId: projectFilter,
    assigneeId: assigneeFilter,
    status: '',
    keyword: ''
  };

  function getFilteredTasks() {
    var kw = (state.keyword || '').trim().toLowerCase();
    return loadTasks().filter(function (t) {
      if (state.projectId && t.projectId !== state.projectId) return false;
      if (state.assigneeId === 'me') {
        if (t.assigneeId !== user._id) return false;
      } else if (state.assigneeId === '') {
        if (t.assigneeId) return false;
      } else if (state.assigneeId !== 'all') {
        if (t.assigneeId !== state.assigneeId) return false;
      }
      if (state.status && t.status !== state.status) return false;
      if (kw) {
        var hay = (t.title + ' ' + (t.description || '')).toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    });
  }

  function renderBoard() {
    var tasks = getFilteredTasks();
    var view = document.getElementById('boardView');
    view.innerHTML = '<div class="kanban-board">' +
      Object.keys(TASK_STATUS_TEXT).map(function (status) {
        var list = tasks.filter(function (t) { return t.status === status; });
        return '<div class="kanban-col" data-status="' + status + '">' +
          '<div class="kanban-col-header" style="background:' + TASK_STATUS_COLOR[status] + '">' +
            '<span>' + TASK_STATUS_TEXT[status] + '</span>' +
            '<span class="kanban-count">' + list.length + '</span>' +
          '</div>' +
          '<div class="kanban-col-body" data-status="' + status + '">' +
            (list.length === 0 ? '<div class="kanban-empty">无任务</div>' :
              list.map(renderKanbanCard).join('')) +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';

    /* 拖放支持：HTML5 拖放（PC 端） */
    var dragging = null;
    view.querySelectorAll('.kanban-card').forEach(function (card) {
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', function (e) {
        dragging = card.dataset.id;
        e.dataTransfer.setData('text/plain', card.dataset.id);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', function () {
        dragging = null;
        card.classList.remove('dragging');
      });
      card.addEventListener('click', function (e) {
        if (e.target.closest('.quick-status')) return;
        location.href = 'task.html?id=' + encodeURIComponent(card.dataset.id);
      });
    });
    view.querySelectorAll('.kanban-col-body').forEach(function (body) {
      body.addEventListener('dragover', function (e) { e.preventDefault(); body.classList.add('drag-over'); });
      body.addEventListener('dragleave', function () { body.classList.remove('drag-over'); });
      body.addEventListener('drop', function (e) {
        e.preventDefault();
        body.classList.remove('drag-over');
        var id = e.dataTransfer.getData('text/plain') || dragging;
        if (!id) return;
        var newStatus = body.dataset.status;
        var t = getTask(id);
        if (!t || t.status === newStatus) return;
        updateTask(id, { status: newStatus, _changedBy: user._id });
        toast('已移到 ' + TASK_STATUS_TEXT[newStatus]);
        refresh();
      });
    });

    /* 卡片上的快速状态切换（移动端友好） */
    view.querySelectorAll('.quick-status').forEach(function (sel) {
      sel.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = sel.dataset.id;
        var newStatus = sel.value;
        var t = getTask(id);
        if (!t || t.status === newStatus) return;
        updateTask(id, { status: newStatus, _changedBy: user._id });
        toast('已改为 ' + TASK_STATUS_TEXT[newStatus]);
        refresh();
      });
    });
  }

  function renderKanbanCard(t) {
    var assignee = t.assigneeId ? getMember(t.assigneeId) : null;
    var project = getProject(t.projectId);
    var overdue = t.dueDate && t.status !== TASK_STATUS.DONE && t.dueDate < todayStr();
    var options = Object.keys(TASK_STATUS_TEXT).map(function (k) {
      return '<option value="' + k + '"' + (k === t.status ? ' selected' : '') + '>' + TASK_STATUS_TEXT[k] + '</option>';
    }).join('');
    return '<div class="kanban-card" data-id="' + esc(t._id) + '">' +
      '<div class="kanban-card-top">' +
        '<span class="priority-tag" style="background:' + PRIORITY_COLOR[t.priority] + '">' + PRIORITY_TEXT[t.priority] + '</span>' +
        (overdue ? '<span class="badge-overdue">逾期</span>' : '') +
      '</div>' +
      '<div class="kanban-card-title">' + esc(t.title) + '</div>' +
      (t.description ? '<div class="kanban-card-desc">' + esc(t.description.slice(0, 60)) + (t.description.length > 60 ? '…' : '') + '</div>' : '') +
      '<div class="kanban-card-meta">' +
        (project ? '<span class="muted">' + esc(project.name) + '</span>' : '') +
      '</div>' +
      '<div class="kanban-card-bottom">' +
        '<span class="kanban-card-assignee">' + (assignee ? esc(assignee.name) : '<span class="muted">未分配</span>') + '</span>' +
        (t.dueDate ? '<span class="kanban-card-due' + (overdue ? ' overdue' : '') + '">' + esc(t.dueDate) + '</span>' : '') +
      '</div>' +
      (t.progress > 0 ? '<div class="progress-bar-wrap mini"><div class="progress-bar" style="width:' + t.progress + '%; background:' + TASK_STATUS_COLOR[t.status] + '"></div></div>' : '') +
      '<select class="quick-status" data-id="' + esc(t._id) + '">' + options + '</select>' +
    '</div>';
  }

  function renderList() {
    var tasks = getFilteredTasks();
    var view = document.getElementById('listView');
    if (tasks.length === 0) { renderEmpty(view, '暂无任务'); return; }
    var sorted = tasks.slice().sort(function (a, b) {
      if (a.status === b.status) return (b.updated_at || '').localeCompare(a.updated_at || '');
      var order = { in_progress: 0, blocked: 1, todo: 2, review: 3, done: 4 };
      return (order[a.status] || 9) - (order[b.status] || 9);
    });
    view.innerHTML = '<div class="task-table">' +
      '<div class="task-table-header">' +
        '<span style="width:60px">优先级</span>' +
        '<span style="flex:1">标题</span>' +
        '<span style="width:90px">状态</span>' +
        '<span style="width:100px">负责人</span>' +
        '<span style="width:110px">截止</span>' +
        '<span style="width:100px">项目</span>' +
      '</div>' +
      sorted.map(function (t) {
        var a = t.assigneeId ? getMember(t.assigneeId) : null;
        var proj = getProject(t.projectId);
        var overdue = t.dueDate && t.status !== TASK_STATUS.DONE && t.dueDate < todayStr();
        return '<div class="task-table-row" data-id="' + esc(t._id) + '">' +
          '<span style="width:60px"><span class="priority-tag" style="background:' + PRIORITY_COLOR[t.priority] + '">' + PRIORITY_TEXT[t.priority] + '</span></span>' +
          '<span style="flex:1" class="task-table-title">' + esc(t.title) + '</span>' +
          '<span style="width:90px"><span class="task-status-pill" style="background:' + TASK_STATUS_COLOR[t.status] + '">' + TASK_STATUS_TEXT[t.status] + '</span></span>' +
          '<span style="width:100px">' + esc(a ? a.name : '-') + '</span>' +
          '<span style="width:110px' + (overdue ? '; color:#ED4245; font-weight:600' : '') + '">' + esc(t.dueDate || '-') + '</span>' +
          '<span style="width:100px" class="muted">' + esc(proj ? proj.name : '-') + '</span>' +
        '</div>';
      }).join('') +
    '</div>';
    view.querySelectorAll('.task-table-row').forEach(function (row) {
      row.addEventListener('click', function () { location.href = 'task.html?id=' + encodeURIComponent(row.dataset.id); });
    });
  }

  function refresh() {
    if (state.view === 'board') {
      renderBoard();
      document.getElementById('listView').style.display = 'none';
      document.getElementById('boardView').style.display = '';
    } else {
      renderList();
      document.getElementById('boardView').style.display = 'none';
      document.getElementById('listView').style.display = '';
    }
  }

  function refreshFilters() {
    var projects = loadProjects();
    var members = loadMembers();
    document.getElementById('projectFilter').innerHTML =
      '<option value="">全部项目</option>' +
      projects.map(function (p) { return '<option value="' + esc(p._id) + '"' + (p._id === state.projectId ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
    document.getElementById('assigneeFilter').innerHTML =
      '<option value="all"' + (state.assigneeId === 'all' ? ' selected' : '') + '>全部人员</option>' +
      '<option value=""' + (state.assigneeId === '' ? ' selected' : '') + '>未分配</option>' +
      '<option value="me"' + (state.assigneeId === 'me' ? ' selected' : '') + '>仅我负责</option>' +
      members.map(function (m) { return '<option value="' + esc(m._id) + '"' + (m._id === state.assigneeId ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join('');
  }

  refreshFilters();
  refresh();

  document.querySelectorAll('.view-toggle-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.view-toggle-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      state.view = btn.dataset.view;
      refresh();
    });
  });

  document.getElementById('projectFilter').addEventListener('change', function (e) { state.projectId = e.target.value; refresh(); });
  document.getElementById('assigneeFilter').addEventListener('change', function (e) { state.assigneeId = e.target.value; refresh(); });
  document.getElementById('statusFilter').addEventListener('change', function (e) { state.status = e.target.value; refresh(); });
  document.getElementById('searchInput').addEventListener('input', function (e) { state.keyword = e.target.value; refresh(); });
  document.getElementById('btnAdd').onclick = function () { showTaskDialog(null); };

  function showTaskDialog(t) {
    var isEdit = !!t;
    t = t || { projectId: state.projectId || '', title: '', description: '', assigneeId: '', priority: PRIORITY.NORMAL, status: TASK_STATUS.TODO, startDate: todayStr(), dueDate: '', progress: 0 };
    var projects = loadProjects();
    var members = loadMembers();
    var bodyHtml =
      '<div class="form-section"><label class="form-label">任务标题 *</label>' +
        '<input class="input" id="t_title" value="' + esc(t.title) + '" placeholder="任务标题"></div>' +
      '<div class="form-section"><label class="form-label">所属项目 *</label>' +
        '<select class="input" id="t_project">' +
        '<option value="">请选择</option>' +
        projects.map(function (p) { return '<option value="' + esc(p._id) + '"' + (p._id === t.projectId ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') +
        '</select></div>' +
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
        projectId: document.getElementById('t_project').value,
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
      refreshFilters();
      refresh();
      return true;
    });
  }
}
window.initTasksPage = initTasksPage;
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initTasksPage);
} else {
  initTasksPage();
}