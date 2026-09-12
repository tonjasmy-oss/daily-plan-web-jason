/* ============================================================
 * 计划周报 (W5) - 周报列表 + 新建 + 概览
 * ============================================================ */
var WR_KEY = 'engms_weekly_reports_v1';

function loadWR() { try { return JSON.parse(localStorage.getItem(WR_KEY) || '[]'); } catch (e) { return []; } }
function saveWR(l) { localStorage.setItem(WR_KEY, JSON.stringify(l)); }

async function initWeeklyReportPage() {
  var user = await requireLogin();
  if (!user) return;
  var projects = loadProjects();

  var content = renderPage({
    active: 'weekly-rpt',
    pageHtml:
      '<nav class="breadcrumb"><a href="dashboard.html">工作台</a><span class="sep">/</span><span>计划周报</span></nav>' +
      '<div class="page-header"><div><h2>计划周报</h2><div class="page-sub">每周工作汇总,作为周例会汇报材料</div></div>' +
      '<div class="page-actions"><button class="btn-primary" id="wrNew">+ 新建周报</button></div></div>' +
      '<div class="mini-stat-row">' +
      mini('本周完成', 0, '项任务', 'check') +
      mini('进行中', 0, '个项目', 'inprog') +
      mini('参与人员', loadMembers().length, '人', 'members') +
      mini('累计金额', '0', '元(申购)', 'purchase') +
      '</div>' +
      '<div class="section"><h3>周报列表 <span class="sec-meta">按时间倒序</span></h3><div id="wrList"></div></div>'
  });

  function mini(label, num, meta, type) {
    var icon = '';
    if (type === 'check') icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>';
    else if (type === 'inprog') icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>';
    else if (type === 'members') icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>';
    else if (type === 'purchase') icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 4h2l2.5 12h11L21 8H7"/></svg>';
    return '<div class="mini-stat"><div class="mini-stat-icon">' + icon + '</div>' +
      '<div><div class="mini-stat-num">' + esc(num) + '</div><div class="mini-stat-label">' + esc(label) + ' · ' + esc(meta) + '</div></div></div>';
  }

  /* 计算周报统计 */
  var tasksDone = loadTasks().filter(function (t) { return t.status === TASK_STATUS.DONE; }).length;
  var inProg = loadProjects().filter(function (p) { return p.status === PROJECT_STATUS.ACTIVE; }).length;
  var totalPurchase = (JSON.parse(localStorage.getItem('engms_purchases_v1') || '[]'))
    .reduce(function (s, p) { return s + (p.total || 0); }, 0);
  document.querySelector('.mini-stat-row').innerHTML =
    mini('本周完成', tasksDone, '项任务', 'check') +
    mini('进行中', inProg, '个项目', 'inprog') +
    mini('参与人员', loadMembers().length, '人', 'members') +
    mini('累计金额', totalPurchase.toFixed(0), '元(申购)', 'purchase');

  function paint() {
    var list = loadWR();
    var host = document.getElementById('wrList');
    if (list.length === 0) {
      renderEmpty(host, '尚无周报,点击右上角新建');
      return;
    }
    host.innerHTML = list.map(function (w) {
      return '<a class="list-row" href="dashboard.html">' +
        '<div><strong>' + esc(w.weekStart) + ' ~ ' + esc(w.weekEnd) + '</strong>' +
        '<div class="muted" style="font-size:13px;margin-top:4px">' + esc(w.summary || '-') + '</div></div>' +
        '<span class="chip">查看</span></a>';
    }).join('');
  }
  paint();

  document.getElementById('wrNew').addEventListener('click', function () {
    var rng = getWeekRange ? getWeekRange(new Date()) : { start: todayStr(), end: todayStr() };
    promptDialog('新建周报', '本周摘要(一句话)', '',
      [{ label: '取消', value: '' }, { label: '创建', value: 'ok', primary: true }],
      function (val, text) {
        if (val !== 'ok') return;
        var l = loadWR();
        l.unshift({
          _id: 'wr_' + uuid().substring(0, 12),
          weekStart: rng.start, weekEnd: rng.end,
          summary: text || '',
          createdBy: user._id,
          created_at: new Date().toISOString()
        });
        saveWR(l);
        toast('周报已创建', 'success');
        paint();
      });
  });
}
window.initWeeklyReportPage = initWeeklyReportPage;
window.addEventListener('DOMContentLoaded', initWeeklyReportPage);
if (document.readyState !== 'loading') initWeeklyReportPage();
