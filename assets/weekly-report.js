/* ============================================================
 * 计划周报 (W5/W7)
 *   数据由 /api/weekly-reports 管理, 内存缓存见 common.js 的
 *   loadWeeklyReports / createWeeklyReport
 *
 * 规则:
 *   - 周期按自然周自动排定: 已有周报时自动续到"上一期末尾 +1 天"的下一周
 *   - 提交成功后表单清空并自动切到下一个周期(下次填报内容), 不回显已提交内容
 *   - 已提交的周报在下方的"周报列表"中留档
 *
 * 依赖 common.js: getWeekRange / addDaysStr / formatDateTime
 * ============================================================ */

async function initWeeklyReportPage() {
  var user = await requireLogin();
  if (!user) return;

  var state = { start: '', end: '' };

  /* 下一个周报周期: 接着已有周报的末尾往后排, 没有历史则用本周 */
  function nextPeriod() {
    var list = loadWeeklyReports() || [];
    var maxEnd = '';
    list.forEach(function (w) {
      var e = w.week_end || w.endDate || '';
      if (e && e > maxEnd) maxEnd = e;
    });
    if (maxEnd) {
      var s = addDaysStr(maxEnd, 1);
      var e2 = addDaysStr(s, 6);
      if (s && e2) return { start: s, end: e2 };
    }
    return getWeekRange(new Date());
  }
  state = nextPeriod();

  var content = renderPage({
    active: 'weekly-rpt',
    pageHtml:
      '<nav class="breadcrumb"><a href="dashboard.html">工作台</a><span class="sep">/</span><span>计划周报</span></nav>' +
      '<div class="hero hero-blurple"><h2>计划周报填报</h2>' +
      '<div class="hero-sub"><span id="wrRange"></span> · 当前用户:' + esc(user.name) + '</div>' +
      '<div class="hero-meta"><span>周期</span><strong>7 天</strong><span>提交后</span><strong>自动续期</strong></div></div>' +
      '<div class="mini-stat-row" id="wrStats"></div>' +
      '<div class="section"><h3>本周填报 <span class="sec-meta">提交后自动切换到下一个周期</span></h3>' +
      '<div class="form-grid form-grid-2">' +
      '<div class="field-row"><label class="field-label">开始日期</label>' +
      '<input class="input" type="date" id="wrStart" value="' + esc(state.start) + '"></div>' +
      '<div class="field-row"><label class="field-label">结束日期</label>' +
      '<input class="input" type="date" id="wrEnd" value="' + esc(state.end) + '">' +
      '<div class="form-hint">开始日期选定后按 7 天自动补齐, 可手动调整</div></div>' +
      '</div>' +
      '<div class="field-row" style="margin-top:14px"><label class="field-label"><span class="required">*</span>本周工作摘要</label>' +
      '<textarea class="input" id="wrSummary" rows="3" placeholder="例如:完成 3# 楼主体结构验收, 下周进入砌体施工"></textarea></div>' +
      '<div class="report-actions" style="justify-content:flex-start;margin-top:14px">' +
      '<button class="btn btn-primary btn-lg" id="wrSubmit">提交周报</button></div>' +
      '</div>' +
      '<div class="section"><h3>周报列表 <span class="sec-meta">按时间倒序, 仅作留档</span></h3><div id="wrList"></div></div>'
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

  function paintStats() {
    var tasksDone = loadTasks().filter(function (t) { return t.status === TASK_STATUS.DONE; }).length;
    var inProg = loadProjects().filter(function (p) { return p.status === PROJECT_STATUS.ACTIVE; }).length;
    var totalPurchase = loadPurchases().reduce(function (s, p) { return s + (Number(p.total) || 0); }, 0);
    var host = document.getElementById('wrStats');
    if (!host) return;
    host.innerHTML =
      mini('本周完成', tasksDone, '项任务', 'check') +
      mini('进行中', inProg, '个项目', 'inprog') +
      mini('参与人员', loadMembers().length, '人', 'members') +
      mini('累计金额', totalPurchase.toFixed(0), '元(申购)', 'purchase');
  }

  function paintRange() {
    var r = document.getElementById('wrRange');
    if (r) r.textContent = (state.start || '') + ' 至 ' + (state.end || '');
    var s = document.getElementById('wrStart');
    var e = document.getElementById('wrEnd');
    if (s) s.value = state.start || '';
    if (e) e.value = state.end || '';
  }

  function paintList() {
    var list = loadWeeklyReports() || [];
    var host = document.getElementById('wrList');
    if (!host) return;
    if (list.length === 0) {
      renderEmpty(host, '尚无周报, 填写上方表单即可提交本周周报');
      return;
    }
    /* 周报没有独立详情页, 因此这里只作留档展示, 不做跳转 */
    host.innerHTML = list.map(function (w) {
      var head = [w.week_start, w.week_end].filter(Boolean).join(' ~ ') || '(未填写周期)';
      var meta = [w.submitter, w.submitted_at ? formatDateTime(w.submitted_at) : formatDateTime(w.created_at)]
        .filter(Boolean).join(' · ');
      var statusText = { draft: '草稿', submitted: '已提交', approved: '已通过', rejected: '已驳回' }[w.status] || w.status || '';
      return '<div class="list-row wr-row">' +
        '<div><strong>' + esc(head) + '</strong>' +
        '<div class="muted" style="font-size:13px;margin-top:4px">' + (esc(w.summary) || '—') + '</div>' +
        (meta ? '<div class="muted" style="font-size:12px;margin-top:4px">' + esc(meta) + '</div>' : '') +
        '</div>' +
        (statusText ? '<span class="report-status-tag report-status-' +
          esc(w.status === 'approved' ? 'signed' : (w.status || 'draft')) + '">' + esc(statusText) + '</span>' : '') +
        '</div>';
    }).join('');
  }

  /* 提交后: 清空摘要, 周期自动续到下一周 */
  function resetToNextPeriod() {
    state = nextPeriod();
    paintRange();
    var s = document.getElementById('wrSummary');
    if (s) s.value = '';
  }

  function submit() {
    var el = document.getElementById('wrSummary');
    var summary = ((el && el.value) || '').trim();
    if (!state.start || !state.end) { toast('请填写周报周期', 'warn'); return; }
    if (!summary) { toast('请填写本周工作摘要', 'warn'); el && el.focus(); return; }
    var period = state.start + ' ~ ' + state.end;
    createWeeklyReport({
      _id: 'wr_' + uuid().substring(0, 12),
      week_start: state.start,
      week_end: state.end,
      title: period,
      status: 'submitted',
      summary: summary,
      submitter: user.name || '',
      submitted_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });  /* 走 /api/weekly-reports */
    resetToNextPeriod();
    paintList();
    toast('周报已提交(' + period + ') · 已为你准备下一个周期', 'success');
  }

  paintStats();
  paintRange();
  paintList();

  var startEl = document.getElementById('wrStart');
  if (startEl) startEl.onchange = function () {
    state.start = this.value;
    var auto = addDaysStr(this.value, 6);
    if (auto) state.end = auto;
    paintRange();
  };
  var endEl = document.getElementById('wrEnd');
  if (endEl) endEl.onchange = function () { state.end = this.value; paintRange(); };

  var btn = document.getElementById('wrSubmit');
  if (btn) btn.onclick = submit;
}
window.initWeeklyReportPage = initWeeklyReportPage;
window.addEventListener('DOMContentLoaded', initWeeklyReportPage);
if (document.readyState !== 'loading') initWeeklyReportPage();
