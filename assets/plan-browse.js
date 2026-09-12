/* ============================================================
 * 计划浏览 (W7) - 4 tabs: 日/周/月报/日报
 * ============================================================ */
async function initPlanBrowsePage() {
  var user = await requireLogin();
  if (!user) return;
  var tab = queryParam('tab') || 'daily';

  var content = renderPage({
    active: 'browse',
    pageHtml:
      '<nav class="breadcrumb"><a href="dashboard.html">工作台</a><span class="sep">/</span><span>计划浏览</span></nav>' +
      '<div class="page-header"><div><h2>计划浏览</h2><div class="page-sub">查看已填报的计划</div></div></div>' +
      '<div class="tabs"><a class="tab' + (tab === 'daily' ? ' active' : '') + '" href="?tab=daily">日计划</a>' +
      '<a class="tab' + (tab === 'weekly' ? ' active' : '') + '" href="?tab=weekly">周计划</a>' +
      '<a class="tab' + (tab === 'monthly' ? ' active' : '') + '" href="?tab=monthly">计划月报</a>' +
      '<a class="tab' + (tab === 'report' ? ' active' : '') + '" href="?tab=report">日常日报</a></div>' +
      '<div id="pbList"></div>'
  });

  var list = [];
  var emptyText = '';
  if (tab === 'daily') {
    list = (JSON.parse(localStorage.getItem('engms_daily_plans_v1') || '[]'));
    emptyText = '尚无日计划填报';
  } else if (tab === 'weekly') {
    list = (JSON.parse(localStorage.getItem('engms_weekly_plans_v1') || '[]'));
    emptyText = '尚无周计划填报';
  } else if (tab === 'monthly') {
    emptyText = '尚无计划月报';
  } else {
    var reports = loadReports ? loadReports() : [];
    list = reports;
    emptyText = '尚无日报记录';
  }

  var host = document.getElementById('pbList');
  if (!list || list.length === 0) {
    renderEmpty(host, emptyText);
    return;
  }
  host.innerHTML = list.map(function (rec) {
    var title = rec.date || (rec.startDate || '');
    var sub = '';
    if (tab === 'daily') sub = (rec.tasks || []).length + ' 项任务';
    else if (tab === 'weekly') sub = (rec.tasks || []).length + ' 项 · ' + (rec.startDate || '') + ' ~ ' + (rec.endDate || '');
    else if (tab === 'report') sub = (rec.tasks || []).length + ' 项 · 状态 ' + (REPORT_STATUS_TEXT[rec.status] || rec.status || '-');
    return '<a class="list-row" href="dashboard.html">' +
      '<div><strong>' + esc(title) + '</strong><div class="muted" style="font-size:13px;margin-top:4px">' + esc(sub) + '</div></div>' +
      '<span class="chip">查看</span></a>';
  }).join('');
}
function loadReports() {
  /* 用 server API 缓存(目前仅前端 localStorage 简单支持) */
  try { return JSON.parse(localStorage.getItem('engms_reports_v1') || '[]'); } catch (e) { return []; }
}
window.initPlanBrowsePage = initPlanBrowsePage;
window.addEventListener('DOMContentLoaded', initPlanBrowsePage);
if (document.readyState !== 'loading') initPlanBrowsePage();
