/* ============================================================
 * 个人中心：我的任务 + 数据备份/恢复（服务器数据库）
 * ============================================================ */

async function initMePage() {
  var user = await requireLogin();
  if (!user) return;
  if (!requireModule('m_me')) return;
  var content = renderPage({
    active: 'me',
    pageHtml: '<div class="loading">加载中...</div>'
  });

  function render() {
    user = getCurrentUser();
    var tasks = loadTasks();
    var myTasks = tasks.filter(function (t) { return t.assigneeId === user._id; });
    var myTodo = myTasks.filter(function (t) { return t.status === TASK_STATUS.TODO || t.status === TASK_STATUS.IN_PROGRESS; });
    var myDone = myTasks.filter(function (t) { return t.status === TASK_STATUS.DONE; });
    var myOverdue = myTasks.filter(function (t) {
      return t.dueDate && t.status !== TASK_STATUS.DONE && t.dueDate < todayStr();
    });

    content.innerHTML =
      '<h2 class="page-title-text">个人中心</h2>' +
      '<div class="profile-card">' +
        '<div class="profile-avatar">' + esc(user.name.charAt(0)) + '</div>' +
        '<div class="profile-info">' +
          '<div class="profile-name">' + esc(user.name) +
            '<span class="role-tag role-' + esc(user.role) + '">' + esc(roleIcon(user.role) + ' ' + roleLabel(user.role)) + '</span>' +
          '</div>' +
          '<div class="profile-meta">' +
            '<span>📞 ' + esc(user.phone || '未填写') + '</span>' +
            '<span>🔧 ' + esc(user.workType || '未指定') + '</span>' +
            '<span>📅 入职 ' + esc(user.joinDate || '-') + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="kpi-row">' +
        '<div class="kpi-card kpi-blue"><div class="kpi-num">' + myTodo.length + '</div><div class="kpi-label">进行中</div></div>' +
        '<div class="kpi-card kpi-green"><div class="kpi-num">' + myDone.length + '</div><div class="kpi-label">已完成</div></div>' +
        '<div class="kpi-card kpi-orange"><div class="kpi-num">' + myOverdue.length + '</div><div class="kpi-label">已逾期</div></div>' +
      '</div>' +
      '<div class="detail-section">' +
        '<div class="detail-section-header"><h3>我的任务</h3>' +
          '<a class="btn-link" href="tasks.html?assigneeId=me">查看全部 →</a></div>' +
        '<div class="task-list-mini" id="myTaskList"></div>' +
      '</div>' +
      '<div class="detail-section">' +
        '<h3>数据管理（服务器数据库）</h3>' +
        '<div class="data-actions">' +
          '<button class="btn btn-primary" id="btnExport">📥 导出全部数据 (JSON)</button>' +
          '<button class="btn btn-default" id="btnImport">📤 导入数据 (JSON)</button>' +
          '<input type="file" id="importFile" accept="application/json" style="display:none;">' +
          '<button class="btn btn-danger" id="btnClear">🗑 清空所有数据</button>' +
        '</div>' +
        '<div class="muted" style="margin-top:8px;">数据保存在服务器 SQLite 数据库（server/data.db），多端访问同一份数据；建议定期导出 JSON 备份。</div>' +
      '</div>' +
      '<div class="detail-section">' +
        '<button class="btn btn-danger-outline" id="btnLogout">退出登录</button>' +
      '</div>';

    var list = document.getElementById('myTaskList');
    if (myTasks.length === 0) { renderEmpty(list, '暂无任务'); }
    else {
      var top = myTasks.slice().sort(function (a, b) {
        if (a.status === TASK_STATUS.DONE && b.status !== TASK_STATUS.DONE) return 1;
        if (a.status !== TASK_STATUS.DONE && b.status === TASK_STATUS.DONE) return -1;
        return (b.updated_at || '').localeCompare(a.updated_at || '');
      }).slice(0, 10);
      list.innerHTML = top.map(function (t) {
        var proj = getProject(t.projectId);
        var overdue = t.dueDate && t.status !== TASK_STATUS.DONE && t.dueDate < todayStr();
        return '<div class="task-row" data-task-id="' + esc(t._id) + '">' +
          '<span class="priority-dot" style="background:' + PRIORITY_COLOR[t.priority] + '"></span>' +
          '<span class="task-title">' + esc(t.title) + '</span>' +
          '<span class="task-status-pill" style="background:' + TASK_STATUS_COLOR[t.status] + '">' + TASK_STATUS_TEXT[t.status] + '</span>' +
          '<span class="muted">' + esc(proj ? proj.name : '-') + '</span>' +
          '<span class="task-due' + (overdue ? ' overdue' : '') + '">' + (t.dueDate ? '📅 ' + esc(t.dueDate) : '') + '</span>' +
        '</div>';
      }).join('');
      list.addEventListener('click', function (e) {
        var r = e.target.closest('[data-task-id]');
        if (r) location.href = 'task.html?id=' + encodeURIComponent(r.dataset.taskId);
      });
    }

    /* 导出：直接从服务器数据库下载全量 JSON */
    document.getElementById('btnExport').onclick = function () {
      fetch('/api/backup', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (data) {
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = '工程管理系统备份_' + formatDateStr(new Date()) + '.json';
        a.click();
        URL.revokeObjectURL(url);
        toast('已下载备份文件');
      }).catch(function () { toast('导出失败', 'error'); });
    };

    document.getElementById('btnImport').onclick = function () {
      document.getElementById('importFile').click();
    };
    document.getElementById('importFile').onchange = function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var data = JSON.parse(ev.target.result);
          confirmDialog('确认导入', '导入将覆盖服务器数据库中当前所有数据，是否继续？', function () {
            fetch('/api/restore', {
              method: 'POST', credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            }).then(function (r) { return r.json(); }).then(function (res) {
              if (res.ok) { toast('导入成功，正在刷新…'); DB.loaded = false; setTimeout(function () { location.reload(); }, 800); }
              else { toast('数据格式错误', 'error'); }
            }).catch(function () { toast('导入失败', 'error'); });
          });
        } catch (err) {
          toast('JSON 解析失败', 'error');
        }
      };
      reader.readAsText(file);
    };

    document.getElementById('btnClear').onclick = function () {
      confirmDialog('清空数据', '此操作将清空服务器数据库中所有项目、人员、任务、日报数据，且无法恢复！', function () {
        fetch('/api/reset', { method: 'POST', credentials: 'same-origin' }).then(function () {
          toast('已清空');
          localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
          setTimeout(function () { location.href = 'login.html'; }, 800);
        });
      });
    };

    document.getElementById('btnLogout').onclick = function () {
      confirmDialog('退出登录', '确认退出？', function () {
        logout().then(function () { location.href = 'login.html'; });
      });
    };
  }

  render();
}
window.initMePage = initMePage;
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initMePage);
} else {
  initMePage();
}
