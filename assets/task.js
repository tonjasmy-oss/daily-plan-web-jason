/* ============================================================
 * 任务详情页：完整信息 + 评论 + 状态流转 + 历史
 * ============================================================ */

async function initTaskDetailPage() {
  var user = await requireLogin();
  if (!user) return;
  var id = queryParam('id');
  if (!id) { toast('缺少任务ID', 'error'); setTimeout(function () { location.href = 'tasks.html'; }, 800); return; }
  var t = getTask(id);
  if (!t) { toast('任务不存在', 'error'); setTimeout(function () { location.href = 'tasks.html'; }, 800); return; }

  var content = renderPage({
    active: 'tasks',
    pageHtml: '<div class="detail-loading">加载中...</div>'
  });

  function render() {
    t = getTask(id);
    if (!t) return;
    var p = getProject(t.projectId);
    var assignee = t.assigneeId ? getMember(t.assigneeId) : null;
    var reporter = t.reporterId ? getMember(t.reporterId) : null;
    var overdue = t.dueDate && t.status !== TASK_STATUS.DONE && t.dueDate < todayStr();
    var myComments = (t.comments || []).slice().reverse();

    content.innerHTML =
      '<div class="detail-back"><a href="javascript:history.back()">‹ 返回</a></div>' +
      '<div class="detail-header">' +
        '<div>' +
          '<h2 class="page-title-text">' + esc(t.title) +
            '<span class="task-status-pill" style="background:' + TASK_STATUS_COLOR[t.status] + ';margin-left:10px;">' + TASK_STATUS_TEXT[t.status] + '</span>' +
            '<span class="priority-tag" style="background:' + PRIORITY_COLOR[t.priority] + ';margin-left:6px;">' + PRIORITY_TEXT[t.priority] + '</span>' +
            (overdue ? '<span class="badge-overdue" style="margin-left:6px;">已逾期</span>' : '') +
          '</h2>' +
          '<div class="detail-meta">' +
            (p ? '<span>📁 <a href="project.html?id=' + esc(p._id) + '">' + esc(p.name) + '</a></span>' : '') +
            (assignee ? '<span>👤 负责人 ' + esc(assignee.name) + '</span>' : '<span class="muted">未分配</span>') +
            (reporter ? '<span>📝 报告人 ' + esc(reporter.name) + '</span>' : '') +
            (t.dueDate ? '<span>📅 截止 ' + esc(t.dueDate) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="detail-actions">' +
          '<select class="input" id="quickStatus"><option value="">切换状态</option>' +
            Object.keys(TASK_STATUS_TEXT).map(function (k) { return '<option value="' + k + '">' + TASK_STATUS_TEXT[k] + '</option>'; }).join('') +
          '</select>' +
          '<button class="btn btn-default" id="btnEdit">编辑</button>' +
          '<button class="btn btn-danger" id="btnDelete">删除</button>' +
        '</div>' +
      '</div>' +
      '<div class="detail-section">' +
        '<div class="progress-large">' +
          '<span>进度</span>' +
          '<div class="progress-bar-wrap"><div class="progress-bar" style="width:' + t.progress + '%; background:' + TASK_STATUS_COLOR[t.status] + '"></div></div>' +
          '<span class="progress-label">' + t.progress + '%</span>' +
          '<input type="range" min="0" max="100" step="5" id="progressRange" value="' + t.progress + '">' +
        '</div>' +
      '</div>' +
      '<div class="detail-section">' +
        '<h3>任务描述</h3>' +
        (t.description ? '<div class="detail-desc">' + esc(t.description) + '</div>' : '<div class="muted">无描述</div>') +
      '</div>' +
      '<div class="detail-section">' +
        '<h3>评论 (' + myComments.length + ')</h3>' +
        '<div class="comment-input">' +
          '<textarea class="textarea" id="commentText" placeholder="添加评论…"></textarea>' +
          '<button class="btn btn-primary" id="btnComment">发送</button>' +
        '</div>' +
        '<div class="comment-list">' +
          (myComments.length === 0 ? '<div class="muted">还没有评论</div>' :
            myComments.map(function (c) {
              var u = getMember(c.userId);
              return '<div class="comment-item">' +
                '<div class="comment-author">' + esc(u ? u.name : '?') + ' <span class="muted">' + esc(formatRelative(c.ts)) + '</span></div>' +
                '<div class="comment-text">' + esc(c.text) + '</div>' +
              '</div>';
            }).join('')) +
        '</div>' +
      '</div>' +
      '<div class="detail-section">' +
        '<h3>状态历史 (' + (t.history || []).length + ')</h3>' +
        '<div class="history-list">' +
          (t.history || []).slice().reverse().map(function (h) {
            var u = getMember(h.userId);
            return '<div class="history-item">' +
              '<span class="muted">' + esc(formatRelative(h.ts)) + '</span> ' +
              (h.from ? TASK_STATUS_TEXT[h.from] + ' → ' : '') +
              '<strong>' + TASK_STATUS_TEXT[h.to] + '</strong>' +
              (u ? ' by ' + esc(u.name) : '') +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>';

    var qs = document.getElementById('quickStatus');
    qs.value = '';
    qs.onchange = function () {
      if (qs.value) {
        updateTask(id, { status: qs.value, _changedBy: user._id });
        toast('状态已更新');
        render();
      }
    };
    document.getElementById('progressRange').oninput = function (e) {
      updateTask(id, { progress: Number(e.target.value), _changedBy: user._id });
    };
    document.getElementById('progressRange').onchange = function () {
      toast('进度已保存');
      render();
    };
    document.getElementById('btnEdit').onclick = function () { showEditDialog(t); };
    document.getElementById('btnDelete').onclick = function () {
      confirmDialog('删除任务', '确定要删除任务 "' + t.title + '"？', function () {
        deleteTask(id);
        toast('已删除');
        setTimeout(function () { history.back(); }, 400);
      });
    };
    document.getElementById('btnComment').onclick = function () {
      var text = document.getElementById('commentText').value.trim();
      if (!text) { toast('请输入评论内容', 'error'); return; }
      addTaskComment(id, user._id, text);
      toast('已发送');
      render();
    };
  }

  function showEditDialog(t) {
    var projects = loadProjects();
    var members = loadMembers();
    var bodyHtml =
      '<div class="form-section"><label class="form-label">任务标题 *</label>' +
        '<input class="input" id="t_title" value="' + esc(t.title) + '"></div>' +
      '<div class="form-section"><label class="form-label">所属项目</label>' +
        '<select class="input" id="t_project">' +
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
      '<div class="form-section"><label class="form-label">进度 %</label>' +
        '<input class="input" type="number" min="0" max="100" id="t_progress" value="' + (t.progress || 0) + '"></div>' +
      '<div class="form-section"><label class="form-label">描述</label>' +
        '<textarea class="textarea" id="t_description">' + esc(t.description) + '</textarea></div>';
    confirmDialogEx('编辑任务', bodyHtml, function () {
      var data = {
        projectId: document.getElementById('t_project').value,
        title: document.getElementById('t_title').value.trim(),
        assigneeId: document.getElementById('t_assignee').value,
        priority: document.getElementById('t_priority').value,
        startDate: document.getElementById('t_startDate').value,
        dueDate: document.getElementById('t_dueDate').value,
        progress: Math.max(0, Math.min(100, Number(document.getElementById('t_progress').value) || 0)),
        description: document.getElementById('t_description').value.trim()
      };
      var err = validateTask(data);
      if (err) { toast(err, 'error'); return false; }
      updateTask(t._id, Object.assign({}, data, { _changedBy: user._id }));
      toast('已保存');
      render();
      return true;
    });
  }

  render();
}
window.initTaskDetailPage = initTaskDetailPage;
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initTaskDetailPage);
} else {
  initTaskDetailPage();
}