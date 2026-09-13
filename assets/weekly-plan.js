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
  if (!requireModule('m_weekly_plan')) return;
  var projects = loadProjects() || [];
  var members = loadMembers().filter(function (m) { return m.active !== false; });
  var rng = getWeekRange(new Date());
  var state = { projectId: '', startDate: rng.start, endDate: rng.end, tasks: [], existingId: '' };

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
      '<div id="wpApprovalCard"></div>' +
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
      '<div class="task-list-add-row"><button class="btn-primary" id="wpAdd">+ 添加任务</button></div></div>' +
      '<div class="report-actions">' +
        '<button class="btn btn-primary btn-lg" id="wpSubmit">提交审批</button>' +
        '<button class="btn btn-default btn-lg" id="wpSaveDraft">保存草稿</button>' +
      '</div>'
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

  /* 审批信息卡: 当「当前 startDate+projectId」已经存在本人提交的非草稿记录时, 顶部展示状态
   *   pending   → 等待审批, 不可编辑
   *   approved  → 已通过, 只读
   *   rejected  → 已驳回, 可点「修改并重新提交」把表单覆盖为该记录内容
   */
  function paintApprovalCard() {
    var host = document.getElementById('wpApprovalCard');
    if (!host) return;
    if (!state.projectId || !state.startDate) { host.innerHTML = ''; state.existingId = ''; return; }
    var plans = loadWeeklyPlans() || [];
    var hit = plans.filter(function (r) {
      return r.projectId === state.projectId &&
        r.startDate === state.startDate &&
        r.createdBy === user._id &&
        r.status && r.status !== 'draft';
    })[0];
    if (!hit) { host.innerHTML = ''; state.existingId = ''; return; }
    state.existingId = hit._id;
    var st = hit.status;
    var statusText = { pending: '审批中', approved: '已审批通过', rejected: '已驳回' }[st] || st;
    var cardClass = 'dp-approval-card wp-approval-card wp-approval-' + st;
    var rows = [];
    rows.push('<div class="dp-approval-row"><span class="dp-approval-key">状态</span><span>' +
      '<span class="report-status-tag report-status-' +
      (st === 'approved' ? 'signed' : st === 'rejected' ? 'rejected' : 'submitted') +
      '">' + esc(statusText) + '</span></span></div>');
    if (hit.submitter)      rows.push('<div class="dp-approval-row"><span class="dp-approval-key">提交人</span><span>' + esc(hit.submitter) + '</span></div>');
    if (hit.submitted_at)   rows.push('<div class="dp-approval-row"><span class="dp-approval-key">提交时间</span><span>' + esc(formatDateTime(hit.submitted_at)) + '</span></div>');
    if (hit.approver)       rows.push('<div class="dp-approval-row"><span class="dp-approval-key">审批人</span><span>' + esc(hit.approver) + '</span></div>');
    if (hit.approved_at)    rows.push('<div class="dp-approval-row"><span class="dp-approval-key">审批时间</span><span>' + esc(formatDateTime(hit.approved_at)) + '</span></div>');
    if (hit.reviewed_by)    rows.push('<div class="dp-approval-row"><span class="dp-approval-key">处理人</span><span>' + esc(hit.reviewed_by) + '</span></div>');
    if (hit.rejected_at)    rows.push('<div class="dp-approval-row"><span class="dp-approval-key">驳回时间</span><span>' + esc(formatDateTime(hit.rejected_at)) + '</span></div>');
    if (hit.rejected_reason) rows.push('<div class="dp-approval-row dp-approval-row-reject"><span class="dp-approval-key">驳回原因</span><span>' + esc(hit.rejected_reason) + '</span></div>');

    /* 底部动作: 驳回可"修改并重新提交" / 通过只读 / 审批中可查看但不可改 */
    var actions = '';
    if (st === 'rejected') {
      actions = '<div class="dp-approval-actions">' +
        '<button class="btn btn-primary btn-lg" id="wpReopen">修改并重新提交</button>' +
        '<span class="muted" style="font-size:13px;margin-left:8px">修改后将以原 ID 覆盖提交</span>' +
        '</div>';
    } else if (st === 'pending') {
      actions = '<div class="dp-approval-actions">' +
        '<button class="btn btn-default btn-lg" disabled>等待审批中, 不可编辑</button>' +
        '</div>';
    } else if (st === 'approved') {
      actions = '<div class="dp-approval-actions">' +
        '<a class="btn btn-default btn-lg" href="plan-browse.html?tab=weekly&id=' + encodeURIComponent(hit._id) + '">在报表浏览中查看</a>' +
        '</div>';
    }
    host.innerHTML = '<div class="' + cardClass + '">' +
      '<div class="dp-approval-head">' +
        '<span class="dp-approval-bullet"></span>' +
        '<span>本周周计划审批信息</span>' +
      '</div>' +
      '<div class="dp-approval-body">' + rows.join('') + '</div>' +
      actions +
    '</div>';

    /* "修改并重新提交": 把 hit 内容回填到表单, 状态切回 draft 让用户编辑后提交 */
    var reopenBtn = document.getElementById('wpReopen');
    if (reopenBtn) reopenBtn.onclick = function () {
      state.tasks = (hit.tasks || []).map(function (t) {
        return { title: t.title || '', ownerId: t.ownerId || '', dueDate: t.dueDate || '' };
      });
      if (!state.tasks.length) state.tasks.push({ title: '', ownerId: '', dueDate: '' });
      paintTasks();
      /* 滚动到顶部 + 提示 */
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast('已加载驳回记录, 修改后请点底部「提交审批」', 'info');
    };
  }
  paintApprovalCard();

  document.getElementById('wpProject').addEventListener('change', function () { state.projectId = this.value; paintApprovalCard(); });

  /* 开始日期 -> 按周自动补结束日期 (+6 天) */
  document.getElementById('wpStart').addEventListener('change', function () {
    var v = this.value;
    state.startDate = v;
    var auto = addDaysStr(v, 6);
    if (auto) state.endDate = auto;
    syncDates();
    paintApprovalCard();
  });
  document.getElementById('wpEnd').addEventListener('change', function () { state.endDate = this.value; });

  document.getElementById('wpAdd').addEventListener('click', function () {
    state.tasks.push({ title: '', ownerId: '', dueDate: '' }); paintTasks();
  });

  /* 提交后: 清空表单, 自动切到下一周, 不回显已提交内容 */
  function resetToNextWeek() {
    var nextStart = addDaysStr(state.endDate, 1) || addDaysStr(state.startDate, 7) || getWeekRange(new Date()).start;
    state.startDate = nextStart;
    state.endDate = addDaysStr(nextStart, 6);
    state.tasks = [{ title: '', ownerId: '', dueDate: '' }];
    syncDates();
    paintTasks();
  }

  /* 校验基础信息 + 至少一项任务 */
  function validateBeforeSubmit() {
    if (projects.length === 0) { toast('系统内尚无项目, 请先在「项目管理」中新建', 'warn'); return false; }
    if (!state.projectId) { toast('请选择关联项目', 'warn'); return false; }
    var ok = state.tasks.filter(function (t) { return (t.title || '').trim(); });
    if (ok.length === 0) { toast('请至少填写一项任务', 'warn'); return false; }
    return true;
  }

  /* 收集当前表单数据为 upsert 记录 */
  function buildRecord(status) {
    var filledTasks = state.tasks.filter(function (t) { return (t.title || '').trim(); });
    var rec = {
      projectId: state.projectId,
      startDate: state.startDate, endDate: state.endDate,
      tasks: filledTasks,
      status: status,
      createdBy: user._id
    };
    if (status === 'pending') {
      rec.submitter = user.name || '';
      rec.submitted_at = new Date().toISOString();
    }
    if (status === 'draft') {
      /* 草稿不写提交人/提交时间, 保留可改 */
      rec.submitter = '';
      rec.submitted_at = '';
    }
    return rec;
  }

  /* 保存草稿: 状态 = draft, 不切下一周, 留在本表可继续编辑 */
  function saveDraft() {
    if (!validateBeforeSubmit()) return;
    var rec = buildRecord('draft');
    /* 如果当前周期已存在由本人提交的非草稿记录(existingId), 走 update 覆盖(状态回到 draft) */
    if (state.existingId) {
      rec._id = state.existingId;
      updateWeeklyPlan(state.existingId, rec);
      state.existingId = '';
    } else {
      rec._id = 'wp_' + uuid().substring(0, 12);
      rec.created_at = new Date().toISOString();
      createWeeklyPlan(rec);
    }
    var period = rec.startDate + ' ~ ' + rec.endDate;
    paintApprovalCard();
    toast('周计划草稿已保存(' + rec.tasks.length + ' 项 · ' + period + ')，可继续编辑或前往提交', 'success');
  }

  /* 提交审批: confirmDialog 二次确认, 状态 = pending, 切下一周空白表单 */
  function submitForReview() {
    if (!validateBeforeSubmit()) return;
    confirmDialog('提交审批', '提交后周计划将进入审批流程, 审批人通过前可以追加工作内容。审批通过后, 记录将被锁定, 只能在「报表浏览 → 周计划」查看。是否继续?', function () {
      var rec = buildRecord('pending');
      if (state.existingId) {
        /* 驳回后重提: 覆盖原记录, 状态由 rejected → pending, 清除驳回信息 */
        rec._id = state.existingId;
        rec.rejected_reason = '';
        rec.rejected_at = '';
        rec.reviewed_by = '';
        updateWeeklyPlan(state.existingId, rec);
        state.existingId = '';
      } else {
        rec._id = 'wp_' + uuid().substring(0, 12);
        rec.created_at = new Date().toISOString();
        createWeeklyPlan(rec);
      }
      var period = rec.startDate + ' ~ ' + rec.endDate;
      resetToNextWeek();
      toast('周计划已提交审批(' + rec.tasks.length + ' 项 · ' + period + ')，已为你打开下一周空白表单', 'success');
    });
  }

  /* 绑定操作按钮 (沿用日计划的 .report-actions 风格) */
  document.getElementById('wpSubmit').addEventListener('click', submitForReview);
  document.getElementById('wpSaveDraft').addEventListener('click', saveDraft);
}
window.initWeeklyPlanPage = initWeeklyPlanPage;
window.addEventListener('DOMContentLoaded', initWeeklyPlanPage);
if (document.readyState !== 'loading') initWeeklyPlanPage();
