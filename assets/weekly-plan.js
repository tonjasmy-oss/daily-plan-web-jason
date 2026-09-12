/* 周计划填报 (W6)
 * 数据由 /api/weekly-plans 管理, 内存缓存见 common.js 的 loadWeeklyPlans/createWeeklyPlan/updateWeeklyPlan
 */
function getWeekRange(d) {
  d = d || new Date();
  var dt = new Date(d);
  var day = (dt.getDay() + 6) % 7;
  var mon = new Date(dt); mon.setDate(dt.getDate() - day);
  var sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { start: formatDateStr(mon), end: formatDateStr(sun) };
}

async function initWeeklyPlanPage() {
  var user = await requireLogin();
  if (!user) return;
  var projects = loadProjects();
  var members = loadMembers().filter(function (m) { return m.active !== false; });
  var rng = getWeekRange(new Date());
  var state = { projectId: '', startDate: rng.start, endDate: rng.end, tasks: [], note: '' };

  var content = renderPage({
    active: 'weekly-plan',
    pageHtml:
      '<nav class="breadcrumb"><a href="dashboard.html">工作台</a><span class="sep">/</span><span>周计划填报</span></nav>' +
      '<div class="hero hero-blurple"><h2>本周计划填报</h2>' +
      '<div class="hero-sub">' + rng.start + ' 至 ' + rng.end + ' · 当前用户:' + esc(user.name) + '</div>' +
      '<div class="hero-meta">' +
      '<span>任务数</span><strong id="wpCount">0</strong>' +
      '<span>周期</span><strong>7 天</strong>' +
      '</div></div>' +
      '<div class="section"><h3>基础信息</h3><div class="form-grid">' +
      '<div class="field-row"><label class="field-label"><span class="required">*</span>关联项目</label>' +
      '<select class="input" id="wpProject"><option value="">-- 选择项目 --</option>' +
      projects.map(function (p) { return '<option value="' + esc(p._id) + '">' + esc(p.name) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field-row"><label class="field-label">开始日期</label><input class="input" type="date" id="wpStart" value="' + rng.start + '"></div>' +
      '<div class="field-row"><label class="field-label">结束日期</label><input class="input" type="date" id="wpEnd" value="' + rng.end + '"></div>' +
      '</div></div>' +
      '<div class="section"><h3>任务列表</h3><div id="wpTasks" class="task-list"></div>' +
      '<div class="task-list-add-row"><button class="btn-primary" id="wpAdd">+ 添加任务</button></div></div>'
  });

  function paintTasks() {
    document.getElementById('wpCount').textContent = state.tasks.length;
    var list = document.getElementById('wpTasks');
    if (state.tasks.length === 0) {
      list.innerHTML = '<div class="empty-state" style="padding:20px"><h4>暂无任务</h4><p>点击下方按钮添加本周任务</p></div>';
      return;
    }
    list.innerHTML = state.tasks.map(function (t, i) {
      return '<div class="task-card"><div class="task-card-head"><span class="task-card-num">' + (i + 1) + '</span>' +
        '<button class="task-card-remove" data-rm="' + i + '" aria-label="删除"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>' +
        '<div class="field-row" style="margin-bottom:10px"><label class="field-label">任务内容</label>' +
        '<textarea class="input wp-title" data-i="' + i + '" rows="2" placeholder="例如:完成 5 层混凝土浇筑">' + esc(t.title || '') + '</textarea></div>' +
        '<div class="form-grid">' +
        '<div class="field-row"><label class="field-label">责任人</label>' +
        '<select class="input wp-owner" data-i="' + i + '"><option value="">--</option>' +
        members.map(function (m) { return '<option value="' + esc(m._id) + '"' + (t.ownerId === m._id ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="field-row"><label class="field-label">计划完成时间</label>' +
        '<input class="input wp-due" type="date" data-i="' + i + '" value="' + esc(t.dueDate || '') + '"></div>' +
        '</div></div>';
    }).join('');
    list.querySelectorAll('.wp-title').forEach(function (el) {
      el.addEventListener('input', function () { state.tasks[parseInt(this.dataset.i, 10)].title = this.value; paintTasks(); });
    });
    list.querySelectorAll('.wp-owner').forEach(function (el) {
      el.addEventListener('change', function () { state.tasks[parseInt(this.dataset.i, 10)].ownerId = this.value; });
    });
    list.querySelectorAll('.wp-due').forEach(function (el) {
      el.addEventListener('change', function () { state.tasks[parseInt(this.dataset.i, 10)].dueDate = this.value; });
    });
    list.querySelectorAll('.task-card-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(this.dataset.rm, 10);
        state.tasks.splice(i, 1); paintTasks();
      });
    });
  }

  state.tasks.push({ title: '', ownerId: '', dueDate: '' });
  paintTasks();

  document.getElementById('wpProject').addEventListener('change', function () { state.projectId = this.value; });
  document.getElementById('wpStart').addEventListener('change', function () { state.startDate = this.value; });
  document.getElementById('wpEnd').addEventListener('change', function () { state.endDate = this.value; });
  document.getElementById('wpAdd').addEventListener('click', function () {
    state.tasks.push({ title: '', ownerId: '', dueDate: '' }); paintTasks();
  });

  /* FAB 提交 */
  var fab = document.createElement('button');
  fab.className = 'fab'; fab.title = '提交'; fab.setAttribute('aria-label', '提交填报');
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  fab.addEventListener('click', submit);
  document.body.appendChild(fab);

  function submit() {
    if (!state.projectId) { toast('请选择关联项目', 'warn'); return; }
    var ok = state.tasks.filter(function (t) { return (t.title || '').trim(); });
    if (ok.length === 0) { toast('请至少填写一项任务', 'warn'); return; }
    var rec = {
      _id: 'wp_' + uuid().substring(0, 12), projectId: state.projectId,
      startDate: state.startDate, endDate: state.endDate,
      tasks: state.tasks, createdBy: user._id,
      created_at: new Date().toISOString(), submitted_at: new Date().toISOString()
    };
    createWeeklyPlan(rec);  /* 走 /api/weekly-plans */
    toast('周计划已提交(' + ok.length + ' 项)', 'success');
  }
}
window.initWeeklyPlanPage = initWeeklyPlanPage;
window.addEventListener('DOMContentLoaded', initWeeklyPlanPage);
if (document.readyState !== 'loading') initWeeklyPlanPage();
