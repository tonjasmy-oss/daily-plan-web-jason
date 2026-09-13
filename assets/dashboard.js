/* ============================================================
 * 仪表盘：项目进度/任务分布/工作量/逾期/趋势
 * ============================================================ */

async function initDashboardPage() {
  var user = await requireLogin();
  if (!user) return;
  if (!requireModule('m_dashboard')) return;
  var content = renderPage({
    active: 'dashboard',
    pageHtml: '<div class="dashboard-loading">加载中...</div>'
  });

  function render() {
    var projects = loadProjects();
    var tasks = loadTasks();
    var members = loadMembers().filter(function (m) { return m.active !== false; });
    var myTasks = tasks.filter(function (t) { return t.assigneeId === user._id; });

    /* 全局统计 */
    var totalProjects = projects.length;
    var activeProjects = projects.filter(function (p) { return p.status === PROJECT_STATUS.ACTIVE; }).length;
    var totalTasks = tasks.length;
    var doneTasks = tasks.filter(function (t) { return t.status === TASK_STATUS.DONE; }).length;
    var overdueTasks = tasks.filter(function (t) {
      return t.dueDate && t.status !== TASK_STATUS.DONE && t.dueDate < todayStr();
    });
    var myTodoCount = myTasks.filter(function (t) { return t.status === TASK_STATUS.TODO || t.status === TASK_STATUS.IN_PROGRESS; }).length;

    /* 任务状态分布（环形） */
    var statusData = Object.keys(TASK_STATUS_TEXT).map(function (k) {
      return { label: TASK_STATUS_TEXT[k], value: tasks.filter(function (t) { return t.status === k; }).length, color: TASK_STATUS_COLOR[k] };
    });

    /* 项目状态分布（柱状） */
    var projData = Object.keys(PROJECT_STATUS_TEXT).map(function (k) {
      return { label: PROJECT_STATUS_TEXT[k], value: projects.filter(function (p) { return p.status === k; }).length, color: PROJECT_STATUS_COLOR[k] };
    });

    /* 7 天完成趋势 */
    var days7 = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var ds = formatDateStr(d);
      var cnt = tasks.filter(function (t) {
        return t.status === TASK_STATUS.DONE && (t.updated_at || '').indexOf(ds) === 0;
      }).length;
      var c2 = tasks.filter(function (t) {
        return t.created_at && t.created_at.indexOf(ds) === 0;
      }).length;
      days7.push({ label: ds.slice(5), value: cnt, created: c2 });
    }

    /* 工作量（按人员 Top 5） */
    var workload = members.map(function (m) {
      var mTasks = tasks.filter(function (t) { return t.assigneeId === m._id; });
      var done = mTasks.filter(function (t) { return t.status === TASK_STATUS.DONE; }).length;
      return { name: m.name, total: mTasks.length, done: done, rate: mTasks.length > 0 ? Math.round(done / mTasks.length * 100) : 0 };
    }).sort(function (a, b) { return b.total - a.total; }).slice(0, 5);

    /* 项目进度 Top 5 */
    var projTop = projects.slice().sort(function (a, b) { return (b.progress || 0) - (a.progress || 0); }).slice(0, 5);

    content.innerHTML =
      /* 欢迎 + 关键指标 */
      '<div class="hero">' +
        '<h2>' + greeting() + '，' + esc(user.name) + '！</h2>' +
        '<div class="hero-sub">' + formatDateStr(new Date()) + ' · ' + esc(roleLabel(user.role)) + ' · 今日有 ' + myTodoCount + ' 项待办</div>' +
      '</div>' +
      '<div class="kpi-row">' +
        '<div class="kpi-card kpi-blue"><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg></div><div class="kpi-num">' + activeProjects + '/' + totalProjects + '</div><div class="kpi-label">进行中项目</div></div>' +
        '<div class="kpi-card kpi-green"><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><div class="kpi-num">' + doneTasks + '/' + totalTasks + '</div><div class="kpi-label">已完成任务</div></div>' +
        '<div class="kpi-card kpi-orange"><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div class="kpi-num">' + overdueTasks.length + '</div><div class="kpi-label">逾期任务</div></div>' +
        '<div class="kpi-card kpi-purple"><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg></div><div class="kpi-num">' + myTodoCount + '</div><div class="kpi-label">我的待办</div></div>' +
      '</div>' +
      /* 图表区 */
      '<div class="chart-row">' +
        '<div class="chart-card"><h3>任务状态分布 <span class="muted">总计 ' + totalTasks + '</span></h3><div id="taskStatusChart"></div></div>' +
        '<div class="chart-card"><h3>项目状态分布 <span class="muted">总计 ' + totalProjects + '</span></h3><div id="projStatusChart"></div></div>' +
      '</div>' +
      '<div class="chart-row">' +
        '<div class="chart-card chart-wide"><h3>近 7 天完成趋势 <span class="muted">单位:项</span></h3><div id="trendChart"></div></div>' +
      '</div>' +
      '<div class="chart-row">' +
        '<div class="chart-card chart-half"><h3>工作量 Top 5</h3><div id="workloadList"></div></div>' +
        '<div class="chart-card chart-half"><h3>项目进度 Top 5</h3><div id="projectProgressList"></div></div>' +
      '</div>' +
      (overdueTasks.length > 0 ?
        '<div class="overdue-section">' +
          '<h3>⚠ 逾期任务 (' + overdueTasks.length + ')</h3>' +
          '<div class="overdue-list">' +
            overdueTasks.slice(0, 8).map(function (t) {
              var p = getProject(t.projectId);
              var a = t.assigneeId ? getMember(t.assigneeId) : null;
              var delay = daysBetween(t.dueDate, todayStr());
              return '<a class="overdue-item" href="task.html?id=' + esc(t._id) + '">' +
                '<span class="priority-dot" style="background:' + PRIORITY_COLOR[t.priority] + '"></span>' +
                '<span class="overdue-title">' + esc(t.title) + '</span>' +
                '<span class="muted">' + esc(p ? p.name : '-') + '</span>' +
                '<span class="muted">' + esc(a ? a.name : '未分配') + '</span>' +
                '<span class="badge-overdue">逾期 ' + delay + ' 天</span>' +
              '</a>';
            }).join('') +
          '</div>' +
        '</div>' : '');

    /* 渲染图表 */
    drawDonutChart(document.getElementById('taskStatusChart'), statusData, { centerLabel: '任务总数' });
    drawBarChart(document.getElementById('projStatusChart'), projData);

    var series = [
      { color: '#35ED7E', label: '完成', data: days7.map(function (d) { return { label: d.label, value: d.value }; }) }
    ];
    drawLineChart(document.getElementById('trendChart'), series);

    /* 工作量列表 */
    var wlList = document.getElementById('workloadList');
    if (workload.length === 0 || workload[0].total === 0) {
      wlList.innerHTML = '<div class="muted" style="padding:24px;text-align:center;">暂无任务分配</div>';
    } else {
      wlList.innerHTML = workload.map(function (w) {
        var color = w.rate >= 80 ? '#35ED7E' : w.rate >= 50 ? '#00B0F4' : '#F59E0B';
        return '<div class="workload-row">' +
          '<span class="workload-name">' + esc(w.name) + '</span>' +
          '<div class="workload-bar-wrap"><div class="workload-bar" style="width:' + w.rate + '%; background:' + color + '"></div></div>' +
          '<span class="workload-meta">' + w.done + '/' + w.total + ' · ' + w.rate + '%</span>' +
        '</div>';
      }).join('');
    }

    /* 项目进度列表 */
    var ppList = document.getElementById('projectProgressList');
    if (projTop.length === 0) {
      ppList.innerHTML = '<div class="muted" style="padding:24px;text-align:center;">暂无项目</div>';
    } else {
      ppList.innerHTML = projTop.map(function (p) {
        return '<a class="project-progress-row" href="project.html?id=' + esc(p._id) + '">' +
          '<span class="project-progress-name">' + esc(p.name) + '</span>' +
          '<div class="progress-bar-wrap"><div class="progress-bar" style="width:' + p.progress + '%; background:' + PROJECT_STATUS_COLOR[p.status] + '"></div></div>' +
          '<span class="project-progress-pct">' + (p.progress || 0) + '%</span>' +
        '</a>';
      }).join('');
    }
  }

  function greeting() {
    var h = new Date().getHours();
    if (h < 6) return '夜深了';
    if (h < 9) return '早上好';
    if (h < 12) return '上午好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  render();
}
window.initDashboardPage = initDashboardPage;
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initDashboardPage);
} else {
  initDashboardPage();
}