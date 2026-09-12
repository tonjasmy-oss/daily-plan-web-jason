/* 周计划填报 (W6)
 * 数据由 /api/weekly-plans 管理, 内存缓存见 common.js 的 loadWeeklyPlans/createWeeklyPlan/updateWeeklyPlan
 *
 * 规则:
 *   - 标题: 「周计划工作填报」
 *   - 关联项目: 系统内仅一个项目时自动默认, 多项目时才需手动选择
 *   - 开始日期录入后, 按周(7 天)自动补齐结束日期
 *   - 提交成功后表单清空并自动切到下一周(下次填报内容), 不回显已提交记录
 *
 * 审批:
 *   - 提交即进入审批流(status='pending'), 审批人可在通过前追加工作内容
 *   - 审批通过后记录锁定, 只能在「报表浏览」页只读查看
 *
 * 依赖 common.js: getWeekRange / addDaysStr
 */
async function initWeeklyPlanPage() {
  var user = await requireLogin();
  if (!user) return;
  var projects = loadProjects() || [];
  var members = loadMembers().filter(function (m) { return m.active !== false; });
  var rng = getWeekRange(new Date());
  var state = { projectId: '', startDate: rng.start, endDate: rng.end, tasks: [] };

  /* 仅有一个项目时自动默认选中 */
  var onlyProject = projects.length === 1 ? projects[0] : null;
  if (onlyProject) state.projectId = onlyProject._id;

  var projectOptions = projects.map(function (p) {
    return '<option value="' + esc(p._id) + '"' +
      (state.projectId === p._id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
  }).join('');

  var content = renderPage({
    active: 'weekly-plan',
    pageHtml:
      '<nav class="breadcrumb"><a href="dashboard.html">工作台</a><span class="sep">/</span><span>周计划填报</span></nav>' +
      '<div class="hero hero-blurple"><h2>周计划工作填报</h2>' +
      '<div class="hero-sub"><span id="wpRange">' + rng.start + ' 至 ' + rng.end + '</span> · 当前用户:' + esc(user.name) + '</div>' +
      '<div class="hero-meta">' +
      '<span>任务数</span><strong id="wpCount">0</strong>' +
      '<span>周期</span><strong>7 天</strong>' +
      '</div></div>' +
      '<div class="plan-approve-note">提交后进入审批流程，审批人可在通过前追加工作内容；审批通过后可在「报表浏览 → 周计划」查看，不可修改。</div>' +
      '<div class="section"><h3>基础信息</h3><div class="form-grid">' +
      '<div class="field-row"><label class="field-label"><span class="required">*</span>关联项目</label>' +
      '<select class="input" id="wpProject"><option value="">-- 选择项目 --</option>' + projectOptions + '</select>' +
      (projects.length === 0
        ? '<div class="form-hint">系统内尚无项目, 请先到「项目管理」新建项目</div>'
        : (onlyProject
          ? '<div class="form-hint">系统内仅一个项目, 已自动选择「' + esc(onlyProject.name) + '」</div>'
          : '<div class="form-hint">系统内有 ' + projects.length + ' 个项目, 请选择本次周计划所属项目</div>')) +
      '</div>' +
      '<div class="field-row"><label class="field-label">开始日期</label><input class="input" type="date" id="wpStart" value="' + rng.start + '"></div>' +
      '<div class="field-row"><label class="field-label">结束日期</label><input class="input" type="date" id="wpEnd" value="' + rng.end + '">' +
      '<div class="form-hint">开始日期选定后按 7 天自动补齐, 可手动调整</div></div>' +
      '</div></div>' +
      '<div class="section"><h3>任务列表</h3><div id="wpTasks" class="task-list"></div>' +
      '<div class="task-list-add-row"><button class="btn-primary" id="wpAdd">+ 添加任务</button></div></div>'
  });

  function syncDates() {
    var s = document.getElementById('wpStart');
    var e = document.getElementById('wpEnd');
    if (s) s.value = state.startDate || '';
    if (e) e.value = state.endDate || '';
    var r = document.getElementById('wpRange');
    if (r) r.textContent = (state.startDate || '') + ' 至 ' + (state.endDate || '');
  }

  function paintTasks() {
    var cnt = document.getElementById('wpCount');
    if (cnt) cnt.textContent = state.tasks.length;
    var list = document.getElementById('wpTasks');
    if (!list) return;
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
    /* 输入只更新状态, 不重绘 —— 重绘会销毁正在编辑的节点导致"无法输入文字" */
    list.querySelectorAll('.wp-title').forEach(function (el) {
      el.addEventListener('input', function () { state.tasks[parseInt(this.dataset.i, 10)].title = this.value; });
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
        state.tasks.splice(i, 1);
        paintTasks();
      });
    });
  }

  state.tasks.push({ title: '', ownerId: '', dueDate: '' });
  paintTasks();

  document.getElementById('wpProject').addEventListener('change', function () { state.projectId = this.value; });

  /* 开始日期 -> 按周自动补结束日期 (+6 天) */
  document.getElementById('wpStart').addEventListener('change', function () {
    var v = this.value;
    state.startDate = v;
    var auto = addDaysStr(v, 6);
    if (auto) state.endDate = auto;
    syncDates();
  });
  document.getElementById('wpEnd').addEventListener('change', function () { state.endDate = this.value; });

  document.getElementById('wpAdd').addEventListener('click', function () {
    state.tasks.push({ title: '', ownerId: '', dueDate: '' }); paintTasks();
  });

  /* FAB 提交 */
  var fab = document.createElement('button');
  fab.className = 'fab'; fab.title = '提交审批'; fab.setAttribute('aria-label', '提交审批');
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  fab.addEventListener('click', submit);
  document.body.appendChild(fab);

  /* 提交后: 清空表单, 自动切到下一周, 不回显已提交内容 */
  function resetToNextWeek() {
    var nextStart = addDaysStr(state.endDate, 1) || addDaysStr(state.startDate, 7) || getWeekRange(new Date()).start;
    state.startDate = nextStart;
    state.endDate = addDaysStr(nextStart, 6);
    state.tasks = [{ title: '', ownerId: '', dueDate: '' }];
    syncDates();
    paintTasks();
  }

  function submit() {
    if (projects.length === 0) { toast('系统内尚无项目, 请先在「项目管理」中新建', 'warn'); return; }
    if (!state.projectId) { toast('请选择关联项目', 'warn'); return; }
    var ok = state.tasks.filter(function (t) { return (t.title || '').trim(); });
    if (ok.length === 0) { toast('请至少填写一项任务', 'warn'); return; }
    var rec = {
      _id: 'wp_' + uuid().substring(0, 12), projectId: state.projectId,
      startDate: state.startDate, endDate: state.endDate,
      tasks: state.tasks.filter(function (t) { return (t.title || '').trim(); }),
      /* 提交即进入审批流: 审批人可在通过前追加工作内容 */
      status: 'pending',
      createdBy: user._id,
      submitter: user.name || '',
      created_at: new Date().toISOString(), submitted_at: new Date().toISOString()
    };
    createWeeklyPlan(rec);  /* 走 /api/weekly-plans */
    var period = rec.startDate + ' ~ ' + rec.endDate;
    resetToNextWeek();
    toast('周计划已提交审批(' + ok.length + ' 项 · ' + period + ')，已为你打开下一周空白表单', 'success');
  }
}
window.initWeeklyPlanPage = initWeeklyPlanPage;
window.addEventListener('DOMContentLoaded', initWeeklyPlanPage);
if (document.readyState !== 'loading') initWeeklyPlanPage();
