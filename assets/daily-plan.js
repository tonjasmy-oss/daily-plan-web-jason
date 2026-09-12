/* ============================================================
 * 日计划填报 — v3 改版
 *
 * 字段模型:
 *   - 填报日期 (date): 实际填报日期
 *   - 计划日期 (plan_date): 计划开始日期 (用于任务完成时间的起始日)
 *   - 标题 banner: "{Y}年{M}月{D}日 工程部计划工作安排" 自动生成
 *   - 任务列表 (tasks): [{ id, content, requirement, members, startTime, endTime }]
 *   - 人员安排 (crew): { night: [], rest: [], adjust: [] } —— 仅显示班长/工人
 *   - 备注 (remarks)
 *
 * 状态机:
 *   draft (草稿) → pending (待审批) → approved (已通过) | rejected (已驳回)
 *   rejected 后填报人可改回 draft 重新提交
 *
 * 权限:
 *   - 填报人 (admin/manager/worker): draft + pending + rejected 状态可编辑
 *   - 审批人 (admin/manager): pending 状态可审批(通过/驳回)
 *   - 班长/工人: 审批通过后只读查看
 *
 * 持久化: 走 /api/daily-plans (server/app.py + SQLite), 内存缓存由 common.js 管理
 * 导出: 审批通过 (approved) 后才能导出 Excel
 * ============================================================ */

var DAILY_PLAN_KEY = 'engms_daily_plans_v1';

/* 仅班长 / 工人才能被选为实施人员或人员安排 */
var DP_ALLOWED_ROLES = ['manager', 'worker'];
/* 主管以上 (admin/manager) 才有审批权 */
var DP_APPROVE_ROLES = ['admin', 'manager'];

/* ---------- 数据持久化 (走 /api/daily-plans, 内存缓存由 common.js 管理) ---------- */
function getDailyPlanByDate(date) {
  return loadDailyPlans().find(function (p) { return p.date === date; });
}
function upsertDailyPlan(rec) {
  var existing = getDailyPlanByDate(rec.date);
  if (existing) {
    updateDailyPlan(existing._id, rec);
  } else {
    createDailyPlan(rec);
  }
}

/* 下一次填报的目标日期
 *   - 草稿 / 已驳回: 仍停留在原日期, 便于继续修改(不丢内容)
 *   - 待审批 / 已通过: 视为已归档, 顺延到"计划日期"(即下一个填报日), 页面给出空白表单
 *   - "计划日期"相对"填报日期"的间隔按最近一次填报的习惯顺延(默认 +1 天) */
function dpNextFillTarget() {
  var d = todayStr();
  var offset = 1;
  for (var i = 0; i < 120; i++) {
    var rec = getDailyPlanByDate(d);
    if (!rec) return { date: d, plan_date: addDaysStr(d, offset) };
    if (rec.status === 'draft' || rec.status === 'rejected') {
      return { date: rec.date || d, plan_date: rec.plan_date || rec.date || d };
    }
    if (rec.date && rec.plan_date && rec.plan_date > rec.date) {
      var gap = Math.round((new Date(rec.plan_date) - new Date(rec.date)) / 86400000);
      if (gap > 0 && gap < 30) offset = gap;
      d = rec.plan_date;
    } else {
      d = addDaysStr(rec.date || d, 1);
    }
    if (!d) break;
  }
  return { date: d || todayStr(), plan_date: addDaysStr(d || todayStr(), offset) };
}

/* ---------- 表单初始化 ---------- */
function newTask() {
  return {
    id: uuid().substring(0, 8),
    content: '',
    requirement: '',
    members: [],
    startTime: '',
    endTime: ''
  };
}
function emptyCrew() {
  return { night: [], rest: [], adjust: [] };
}
function defaultDailyPlan(date) {
  return {
    _id: 'dp_' + date,
    date: date,
    plan_date: date,
    tasks: [newTask()],
    crew: emptyCrew(),
    remarks: '',
    status: 'draft',
    submitter: '',
    submitted_at: '',
    approver: '',
    approved_at: '',
    rejected_at: '',
    rejected_reason: '',
    reviewed_by: ''
  };
}

/* ---------- 入口 ---------- */
async function initDailyPlanPage() {
  var user = await requireLogin();
  if (!user) return;

  var members = loadMembers().filter(function (m) { return m.active !== false; });
  /* 无 ?date 参数时, 不再回显"已提交/已通过"的记录, 直接给出下一次填报的空白表单 */
  var urlDate = queryParam('date') || '';
  var prePlanDate = '';
  if (!urlDate) {
    var target = dpNextFillTarget();
    urlDate = target.date;
    prePlanDate = target.plan_date;
  }
  var form = null;

  /* 显示给用户的人员: 仅班长/工人 */
  function visibleMembers() {
    return members.filter(function (m) { return DP_ALLOWED_ROLES.indexOf(m.role) >= 0; });
  }

  /* 加载记录 */
  function loadForm() {
    var existing = getDailyPlanByDate(urlDate);
    if (existing) {
      form = {
        _id: existing._id || ('dp_' + urlDate),
        date: existing.date || urlDate,
        plan_date: existing.plan_date || existing.date || urlDate,
        tasks: (existing.tasks && existing.tasks.length > 0)
          ? existing.tasks.map(function (t) {
              var base = {
                id: t.id || uuid().substring(0, 8),
                content: t.content || '',
                requirement: t.requirement || '',
                members: Array.isArray(t.members) ? t.members.slice() : [],
                startTime: t.startTime || '',
                endTime: t.endTime || ''
              };
              /* ⚠️ 审批追加的条目必须原样带回标记。
               * 这里只挑固定字段重建, 若漏掉 appended/appended_by/appended_at,
               * 审批人在本页点「通过」触发一次 persist() 就会把追加标记永久抹掉,
               * 追加内容会退化成普通任务 (内容还在, 但来源/标签全丢)。 */
              if (t.appended) {
                base.appended = true;
                base.appended_by = t.appended_by || '';
                base.appended_at = t.appended_at || '';
                base.title = t.title || base.content;
              }
              return base;
            })
          : [newTask()],
        crew: {
          night:  Array.isArray(existing.crew && existing.crew.night)  ? existing.crew.night.slice()  : [],
          rest:   Array.isArray(existing.crew && existing.crew.rest)   ? existing.crew.rest.slice()   : [],
          adjust: Array.isArray(existing.crew && existing.crew.adjust) ? existing.crew.adjust.slice() : []
        },
        remarks: existing.remarks || '',
        status: existing.status || 'draft',
        submitter: existing.submitter || '',
        submitted_at: existing.submitted_at || '',
        approver: existing.approver || '',
        approved_at: existing.approved_at || '',
        rejected_at: existing.rejected_at || '',
        rejected_reason: existing.rejected_reason || '',
        reviewed_by: existing.reviewed_by || ''
      };
    } else {
      form = defaultDailyPlan(urlDate);
      if (prePlanDate) form.plan_date = prePlanDate;
    }
    render();
  }

  /* 权限判定 */
  function canEdit() {
    var role = user.role;
    var st = form.status;
    /* 只有填报人创建者本人在 draft/pending/rejected 状态能编辑 (approved 锁死) */
    if (st === 'approved') return false;
    if (user.role === 'viewer') return false;
    /* pending 状态: 创建者可"撤回",审批人不能改字段,只可审批 — 简化: 全部走"驳回回 draft"流程 */
    if (st === 'pending') return false;
    return true;
  }
  function canSubmit() {
    return canEdit() && (form.status === 'draft' || form.status === 'rejected');
  }
  function canApprove() {
    return DP_APPROVE_ROLES.indexOf(user.role) >= 0 && form.status === 'pending';
  }
  /* 审批人在"待审批"窗口内可追加工作内容 (复用 common.js 的统一规则) */
  function canAppend() {
    return planAppendable(form, user);
  }

  /* ---------- 校验 ---------- */
  function validateForm() {
    if (!form.date) { toast('请选择填报日期', 'error'); return false; }
    if (!form.plan_date) { toast('请选择计划日期', 'error'); highlightPlanDateError(); return false; }
    var valid = form.tasks.filter(function (t) { return (t.content || '').trim(); });
    if (valid.length === 0) { toast('请至少填写一条计划工作内容', 'error'); return false; }

    for (var i = 0; i < form.tasks.length; i++) {
      var t = form.tasks[i];
      if (!(t.content || '').trim()) continue;
      /* 审批追加的条目只需工作内容, 不参与必填校验(工作要求/人员/时间由原计划承担) */
      if (t.appended) continue;
      if (!(t.requirement || '').trim()) { highlightTaskFieldError(i, 'requirement'); toast('请填写任务"' + (i + 1) + '"的工作要求', 'error'); return false; }
      if (!t.members || t.members.length === 0) { highlightTaskFieldError(i, 'members'); toast('请勾选任务"' + (i + 1) + '"的计划实施人员', 'error'); return false; }
      if (!t.startTime || !t.endTime) { highlightTaskFieldError(i, 'time'); toast('请填写任务"' + (i + 1) + '"的计划完成时间', 'error'); return false; }
    }
    return true;
  }

  function highlightTaskFieldError(idx, type) {
    var row = document.querySelector('.rp-task-row[data-i="' + idx + '"]');
    if (!row) return;
    row.classList.add('has-row-error');
    var map = { members: '.rp-task-members', time: '.rp-task-time', requirement: '.rp-task-requirement' };
    var el = row.querySelector(map[type]);
    if (el) {
      el.classList.add('has-error');
      var input = el.querySelector('input, textarea, select');
      if (input) input.focus();
    }
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function highlightPlanDateError() {
    var el = document.getElementById('dp_plan_date');
    if (el) { el.classList.add('input-error'); el.focus(); }
  }

  /* ---------- 持久化 ---------- */
  function persist(extra) {
    var rec = Object.assign({}, form, extra || {});
    rec.tasks = (rec.tasks || []).filter(function (t) { return (t.content || '').trim(); });
    upsertDailyPlan(rec);
  }

  /* ---------- 状态操作 ---------- */
  function saveDraft() {
    if (!validateForm()) return;
    persist();
    toast('草稿已保存', 'success');
    render();
  }
  function submitForReview() {
    if (!validateForm()) return;
    confirmDialog('提交审批', '提交后日计划将进入审批流程,审批人通过后才会生效。是否继续?', function () {
      form.status = 'pending';
      form.submitter = user.name;
      form.submitted_at = new Date().toISOString();
      form.rejected_reason = '';
      form.rejected_at = '';
      persist();
      /* 提交后不再回显本条内容: 自动顺延到下一次填报日期, 给出一张空白表单 */
      var submittedDate = form.date;
      var next = dpNextFillTarget();
      urlDate = next.date;
      prePlanDate = next.plan_date;
      toast('已提交,等待审批(' + submittedDate + ') · 已为你打开下一次空白表单', 'success');
      loadForm();
    });
  }
  function reopenToEdit() {
    /* 驳回后可重新编辑: 状态切回 draft, 重新走 validateForm */
    confirmDialog('重新编辑', '重新打开后日计划将变为草稿,审批人通过前可以再次修改。是否继续?', function () {
      form.status = 'draft';
      form.rejected_reason = '';
      form.rejected_at = '';
      form.reviewed_by = '';
      persist();
      toast('已重新打开为草稿', 'success');
      render();
    });
  }
  function approveForm() {
    confirmDialog('审批通过', '确认审批通过"' + form.date + '"日计划?通过后所有班长/工人都可查看。', function () {
      form.status = 'approved';
      form.approver = user.name;
      form.approved_at = new Date().toISOString();
      form.reviewed_by = user.name;
      form.rejected_reason = '';
      form.rejected_at = '';
      persist();
      toast('已审批通过', 'success');
      render();
    });
  }
  function rejectForm() {
    confirmDialogEx('驳回', '<div class="form-section"><label class="form-label">驳回原因 <span class="required">*</span></label><textarea class="textarea" id="dp_reject_reason" rows="3" placeholder="请说明驳回原因,填报人会收到提示并可修改后重新提交"></textarea></div>',
      function () {
        var reasonEl = document.getElementById('dp_reject_reason');
        var reason = (reasonEl && reasonEl.value || '').trim();
        if (!reason) { toast('请填写驳回原因', 'error'); return false; }
        form.status = 'rejected';
        form.reviewed_by = user.name;
        form.rejected_at = new Date().toISOString();
        form.rejected_reason = reason;
        persist();
        toast('已驳回', 'warn');
        render();
      }
    );
  }
  /* ---------- 审批追加工作内容 ---------- */
  function appendWork() {
    if (!canAppend()) return;
    confirmDialogEx('追加工作内容',
      '<div class="form-section">' +
        '<label class="form-label">补充的工作内容 <span class="required">*</span></label>' +
        '<textarea class="textarea" id="dp_append_text" rows="4" placeholder="一行一条, 可一次填写多条。例如:&#10;补充检查 3 层临边防护&#10;跟进消防通道清理"></textarea>' +
        '<p class="form-hint">追加内容会排在原计划之后并标记为「审批追加」，通过后随计划一并归档与导出；通过前可逐条移除。</p>' +
      '</div>',
      function () {
        var el = document.getElementById('dp_append_text');
        var n = planAppendTasks(form, el && el.value, user);
        if (n === 0) { toast('请填写要追加的工作内容', 'error'); return false; }
        persist();
        toast('已追加 ' + n + ' 条工作内容', 'success');
        render();
      }
    );
  }
  function deleteRecord() {
    confirmDialog('确认删除', '删除后无法恢复,确定删除此日的日计划?', function () {
      var existing = getDailyPlanByDate(form.date);
      if (existing) deleteDailyPlan(existing._id);
      toast('已删除');
      setTimeout(function () { location.href = 'daily-plan.html'; }, 600);
    });
  }

  /* ---------- 人员选择 (多选, 仅班长/工人) ---------- */
  function openMemberPicker(title, currentIds, onPick) {
    var curSet = Array.isArray(currentIds) ? currentIds : [];
    var available = visibleMembers().filter(function (m) { return curSet.indexOf(m._id) < 0; });
    var items = available.map(function (m) {
      return {
        id: m._id,
        label: m.name,
        sublabel: ROLE_DISPLAY[m.role] || ROLE_TEXT[m.role] || '',
        role: m.role
      };
    });
    if (items.length === 0) { toast('已是全部可分配人员', 'warn'); return; }
    multiSelectDialog(title, '仅显示角色为「班长」「工人」的人员', items, [], function (ids) {
      if (!ids) return;
      onPick(ids);
    });
  }
  function addTaskMembers(taskIndex, ids) {
    var t = form.tasks[taskIndex];
    if (!t.members) t.members = [];
    ids.forEach(function (id) { if (t.members.indexOf(id) < 0) t.members.push(id); });
    render();
  }
  function setCrew(group, ids) {
    form.crew[group] = ids.slice();
    render();
  }

  /* ---------- 工作任务同步 ---------- */
  /* 第一条已填的任务 (即 t.content 已填) 作为 "基准", 把它的"工作内容"和"工作要求" / "计划完成时间" 同步到所有其他已填的任务 */
  function syncTasks(baseIdx) {
    if (form.tasks.length < 2) { toast('至少需要两条任务才能同步', 'warn'); return; }
    var base = form.tasks[baseIdx];
    if (!(base.content || '').trim()) { toast('请先在第' + (baseIdx + 1) + '条任务填写内容', 'warn'); return; }

    confirmDialogEx('工作任务同步',
      '<div class="form-section"><label class="form-label">同步范围</label>' +
        '<label class="form-row"><input type="checkbox" id="sync_content" checked> 工作内容</label>' +
        '<label class="form-row"><input type="checkbox" id="sync_requirement" checked> 工作要求</label>' +
        '<label class="form-row"><input type="checkbox" id="sync_time"> 计划完成时间</label>' +
        '<p class="form-hint">将以第 ' + (baseIdx + 1) + ' 条为基准,把所有已填任务(除基准本身)同步所选字段。人员不会同步。</p>' +
      '</div>',
      function () {
        var doContent = document.getElementById('sync_content').checked;
        var doReq     = document.getElementById('sync_requirement').checked;
        var doTime    = document.getElementById('sync_time').checked;
        var appliedCount = 0;
        form.tasks.forEach(function (t, i) {
          if (i === baseIdx) return;
          if (!(t.content || '').trim()) return;
          if (doContent) t.content = base.content;
          if (doReq)     t.requirement = base.requirement;
          if (doTime) {
            t.startTime = base.startTime;
            t.endTime   = base.endTime;
          }
          appliedCount++;
        });
        toast('已把基准任务字段同步到 ' + appliedCount + ' 条任务', 'success');
        render();
      }
    );
  }

  /* ---------- Excel 导出 ---------- */
  function exportExcel() {
    if (form.status !== 'approved') { toast('仅审批通过的日计划可导出 Excel', 'warn'); return; }
    if (typeof exportDailyPlanToExcel !== 'function') {
      toast('Excel 模块未加载', 'error');
      return;
    }
    exportDailyPlanToExcel(form, members);
  }

  /* ---------- 渲染 ---------- */
  var content = renderPage({
    active: 'daily-plan',
    pageHtml: '<div class="detail-loading">加载中…</div>'
  });

  function render() {
    if (!form) return;
    var st = form.status;
    var editable = canEdit();

    /* 角色/状态显示 */
    var ROLE_DISPLAY = window.ROLE_DISPLAY || { admin: '管理员', manager: '班长', worker: '工人', viewer: '观察者' };

    /* 标题 banner 内容 */
    var planDateObj = parseDate(form.plan_date || form.date);
    var bannerText = planDateObj
      ? planDateObj.y + '年' + planDateObj.m + '月' + planDateObj.d + '日 工程部计划工作安排'
      : '工程部计划工作安排';

    var statusText = {
      draft: '草稿',
      pending: '待审批',
      approved: '已通过',
      rejected: '已驳回'
    }[st] || st;

    var tasksHtml = form.tasks.map(function (t, i) {
      return renderTaskRow(t, i, editable);
    }).join('');

    /* 底部操作按钮 */
    var actions = '';
    if (canSubmit()) {
      actions =
        '<button class="btn btn-primary btn-lg" id="btnSubmit">提交审批</button>' +
        '<button class="btn btn-default btn-lg" id="btnSaveDraft">保存草稿</button>';
    } else if (st === 'pending') {
      if (DP_APPROVE_ROLES.indexOf(user.role) >= 0) {
        actions =
          '<button class="btn btn-default btn-lg" id="btnAppend">+ 追加工作内容</button>' +
          '<button class="btn btn-success btn-lg" id="btnApprove">✓ 通过</button>' +
          '<button class="btn btn-danger btn-lg" id="btnReject">驳回</button>';
      } else {
        actions = '<button class="btn btn-default btn-lg" disabled>等待审批中…</button>';
      }
    } else if (st === 'rejected' && user.role !== 'viewer') {
      actions =
        '<button class="btn btn-primary btn-lg" id="btnReopen">修改并重新提交</button>';
    } else if (st === 'approved') {
      actions = '<span class="approval-info-text">✓ 已审批通过 · 审批人 ' + esc(form.approver || '-') + ' · ' + esc(formatDateTime(form.approved_at)) + '</span>';
    }

    content.innerHTML =
      '<div class="detail-back"><a href="dashboard.html">‹ 工作台</a></div>' +
      '<div class="page-header-row">' +
        '<h2 class="page-title-text">日计划填报' +
          '<span class="report-status-tag report-status-' + esc(st) + '">' + esc(statusText) + '</span>' +
        '</h2>' +
        '<div class="page-actions">' +
          (st === 'approved'
            ? '<button class="btn btn-success" id="btnExportExcel">' + rpIconDownload() + '<span>导出 Excel</span></button>'
            : '<button class="btn btn-default" id="btnExportJSON" title="导出 JSON">' + rpIconDownload() + '<span>导出 JSON</span></button>') +
        '</div>' +
      '</div>' +

      /* 日期栏: 填报日期 + 计划日期 */
      '<div class="section rp-section">' +
        '<div class="form-grid form-grid-2">' +
          '<div class="form-section">' +
            '<label class="form-label">填报日期</label>' +
            '<input class="input" type="date" id="dp_date" value="' + esc(form.date || '') + '"' + (canEdit() ? '' : ' disabled') + '>' +
          '</div>' +
          '<div class="form-section">' +
            '<label class="form-label">计划日期 <span class="required">*</span></label>' +
            '<input class="input" type="date" id="dp_plan_date" value="' + esc(form.plan_date || '') + '"' + (canEdit() ? '' : ' disabled') + '>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* 标题 banner */
      '<div class="dp-plan-banner">' +
        '<div class="dp-plan-banner-icon">' + rpIconClipboard() + '</div>' +
        '<div class="dp-plan-banner-text">' + esc(bannerText) + '</div>' +
      '</div>' +

      /* 任务列表 */
      '<div class="section rp-section">' +
        '<div class="section-header-row">' +
          '<h3 style="margin:0;">计划工作内容 <span class="sec-meta">填写后点击"同步"可一键应用本条字段到所有任务</span></h3>' +
          (editable ? '<div class="dp-section-actions">' +
            '<button class="btn-link" id="btnAddTask">+ 添加任务</button>' +
          '</div>' : (canAppend() ? '<div class="dp-section-actions">' +
            '<button class="btn-link" id="btnAppendInline">+ 追加工作内容</button>' +
          '</div>' : '')) +
        '</div>' +
        '<div class="rp-task-list" id="rpTaskList">' + tasksHtml + '</div>' +
      '</div>' +

      /* 人员安排: 夜班 / 休息 / 调休 */
      '<div class="section rp-section dp-arrange-card">' +
        '<div class="dp-section-head">' +
          '<h3>人员安排 <span class="sec-meta">仅显示角色为「班长」「工人」</span></h3>' +
        '</div>' +
        '<div class="dp-crew-grid">' +
          renderCrewGroup('night', '夜间值班', st, editable, ROLE_DISPLAY) +
          renderCrewGroup('rest', '休息人员', st, editable, ROLE_DISPLAY) +
          renderCrewGroup('adjust', '调休人员', st, editable, ROLE_DISPLAY) +
        '</div>' +
      '</div>' +

      /* 备注 */
      '<div class="section rp-section">' +
        '<label class="form-label">备注</label>' +
        '<textarea class="textarea" id="dp_remarks" placeholder="可填写其他需要说明的事项(选填)"' + (editable ? '' : ' disabled') + '>' + esc(form.remarks) + '</textarea>' +
      '</div>' +

      /* 审批信息卡 */
      renderApprovalCard() +

      /* 操作按钮 */
      '<div class="report-actions">' + actions + '</div>' +
      '<div class="report-actions">' +
        '<button class="btn btn-danger-outline btn-lg" id="btnDelete">' + rpIconTrash() + ' 删除记录</button>' +
      '</div>';

    bindEvents();
  }

  /* 渲染单条任务 */
  function renderTaskRow(t, i, editable) {
    /* 审批追加的条目: 只有工作内容, 单独紧凑渲染 */
    if (t.appended) return renderAppendedRow(t, i);
    var memberChips = (t.members || []).map(function (mid) {
      var m = members.find(function (mm) { return mm._id === mid; });
      if (!m) return '';
      var roleLabel = ROLE_DISPLAY[m.role] || ROLE_TEXT[m.role] || '';
      var roleBg = ROLE_TAG_BG[m.role] || 'rgba(126,132,168,.15)';
      var roleColor = ROLE_COLOR[m.role] || '#7E84A8';
      return '<span class="rp-task-member-chip">' +
              '<span class="rp-role-tag" style="background:' + roleBg + ';color:' + roleColor + ';">' + esc(roleLabel) + '</span>' +
              '<span class="rp-task-member-name">' + esc(m.name) + '</span>' +
              (editable ? '<button class="rp-task-member-x" data-i="' + i + '" data-id="' + esc(mid) + '" type="button" title="移除">×</button>' : '') +
            '</span>';
    }).join('');

    return '<div class="rp-task-row" data-i="' + i + '">' +
      '<div class="rp-task-num">' + (i + 1) + '</div>' +
      '<div class="rp-task-body">' +

        '<div class="rp-task-field rp-task-content">' +
          '<label class="rp-task-label">计划工作内容 <span class="required">*</span></label>' +
          '<textarea class="textarea rp-task-content-input" data-i="' + i + '" data-k="content" rows="2" placeholder="请输入本条计划工作内容"' + (editable ? '' : ' disabled') + '>' + esc(t.content || '') + '</textarea>' +
        '</div>' +

        '<div class="rp-task-field rp-task-requirement">' +
          '<label class="rp-task-label">工作要求 <span class="required">*</span></label>' +
          '<textarea class="textarea rp-task-requirement-input" data-i="' + i + '" data-k="requirement" rows="2" placeholder="本条任务的工作要求 / 验收标准"' + (editable ? '' : ' disabled') + '>' + esc(t.requirement || '') + '</textarea>' +
        '</div>' +

        '<div class="rp-task-field rp-task-members">' +
          '<label class="rp-task-label">计划实施人员 <span class="required">*</span> <span class="rp-task-hint">仅显示班长/工人</span></label>' +
          '<div class="rp-task-members-row">' +
            memberChips +
            (editable ? '<button class="rp-task-add-member" data-i="' + i + '" type="button">' +
              rpIconPlus() + '<span>添加人员</span>' +
            '</button>' : '') +
          '</div>' +
        '</div>' +

        '<div class="rp-task-field rp-task-time">' +
          '<label class="rp-task-label">计划完成时间 <span class="required">*</span> <span class="rp-task-hint">几点几时至几点几分</span></label>' +
          '<div class="rp-task-time-row">' +
            '<input class="input rp-time-input" type="time" data-i="' + i + '" data-k="startTime" value="' + esc(t.startTime || '') + '"' + (editable ? '' : ' disabled') + '>' +
            '<span class="rp-time-sep">至</span>' +
            '<input class="input rp-time-input" type="time" data-i="' + i + '" data-k="endTime" value="' + esc(t.endTime || '') + '"' + (editable ? '' : ' disabled') + '>' +
          '</div>' +
        '</div>' +

      '</div>' +

      /* 右侧操作: 同步 + 删除 */
      '<div class="rp-task-side-actions">' +
        (editable && form.tasks.length > 1 ? '<button class="rp-task-sync" data-i="' + i + '" type="button" title="把本条字段同步到其他任务">↻ 同步</button>' : '') +
        (editable ? '<button class="rp-task-remove" data-i="' + i + '" type="button" title="删除任务">' + rpIconTrash() + '</button>' : '') +
      '</div>' +
    '</div>';
  }

  /* 渲染"审批追加"条目 */
  function renderAppendedRow(t, i) {
    var removable = canAppend();
    return '<div class="rp-task-row rp-task-row-appended" data-i="' + i + '">' +
      '<div class="rp-task-num rp-task-num-appended">补</div>' +
      '<div class="rp-task-body">' +
        '<div class="rp-task-field rp-task-content">' +
          '<label class="rp-task-label">计划工作内容' +
            '<span class="rp-task-appended-tag">审批追加</span>' +
            '<span class="rp-task-hint">' + esc(t.appended_by || '') +
              (t.appended_at ? ' · ' + esc(formatDateTime(t.appended_at)) : '') + '</span>' +
          '</label>' +
          '<div class="rp-task-appended-text">' + esc(t.content || '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="rp-task-side-actions">' +
        (removable ? '<button class="rp-append-remove" data-i="' + i + '" type="button" title="移除这条追加内容">' + rpIconTrash() + '</button>' : '') +
      '</div>' +
    '</div>';
  }

  /* 渲染单个 crew 组 */
  function renderCrewGroup(group, label, st, editable, ROLE_DISPLAY) {
    var listIds = form.crew[group] || [];
    var chips = listIds.map(function (mid) {
      var m = members.find(function (mm) { return mm._id === mid; });
      if (!m) return '';
      var roleLabel = ROLE_DISPLAY[m.role] || ROLE_TEXT[m.role] || '';
      var roleBg = ROLE_TAG_BG[m.role] || 'rgba(126,132,168,.15)';
      var roleColor = ROLE_COLOR[m.role] || '#7E84A8';
      return '<span class="rp-task-member-chip">' +
              '<span class="rp-role-tag" style="background:' + roleBg + ';color:' + roleColor + ';">' + esc(roleLabel) + '</span>' +
              '<span class="rp-task-member-name">' + esc(m.name) + '</span>' +
              (editable ? '<button class="rp-crew-x" data-group="' + group + '" data-id="' + esc(mid) + '" type="button" title="移除">×</button>' : '') +
            '</span>';
    }).join('');

    return '<div class="dp-crew-group">' +
      '<div class="dp-crew-label">' +
        '<span class="dp-crew-bullet dp-crew-bullet-' + group + '"></span>' +
        esc(label) +
        (editable ? ' <button class="rp-task-add-member" data-group="' + group + '" type="button">' + rpIconPlus() + ' 添加</button>' : '') +
      '</div>' +
      '<div class="dp-crew-chips">' +
        (chips || '<span class="dp-crew-empty">暂未安排</span>') +
      '</div>' +
    '</div>';
  }

  /* 审批信息卡 */
  function renderApprovalCard() {
    var st = form.status;
    if (st === 'draft') return '';
    var lines = [];
    if (form.submitter)      lines.push('<div class="dp-approval-row"><span class="dp-approval-key">填报人</span><span>' + esc(form.submitter) + '</span></div>');
    if (form.submitted_at)   lines.push('<div class="dp-approval-row"><span class="dp-approval-key">提交时间</span><span>' + esc(formatDateTime(form.submitted_at)) + '</span></div>');
    if (form.approver)       lines.push('<div class="dp-approval-row"><span class="dp-approval-key">审批人</span><span>' + esc(form.approver) + '</span></div>');
    if (form.approved_at)    lines.push('<div class="dp-approval-row"><span class="dp-approval-key">审批时间</span><span>' + esc(formatDateTime(form.approved_at)) + '</span></div>');
    if (form.rejected_at)    lines.push('<div class="dp-approval-row"><span class="dp-approval-key">驳回时间</span><span>' + esc(formatDateTime(form.rejected_at)) + '</span></div>');
    if (form.rejected_reason) lines.push('<div class="dp-approval-row dp-approval-row-reject"><span class="dp-approval-key">驳回原因</span><span>' + esc(form.rejected_reason) + '</span></div>');
    if (lines.length === 0) return '';
    var headerText = st === 'pending' ? '审批中' : st === 'approved' ? '已审批通过' : '已驳回';
    return '<div class="dp-approval-card">' +
      '<div class="dp-approval-head">' +
        '<span class="dp-approval-bullet"></span>' +
        '<span>' + headerText + '</span>' +
      '</div>' +
      '<div class="dp-approval-body">' + lines.join('') + '</div>' +
    '</div>';
  }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    /* 填报日期 */
    var dateEl = document.getElementById('dp_date');
    if (dateEl) dateEl.onchange = function () {
      var newDate = dateEl.value;
      if (!newDate || newDate === form.date) return;
      var hasContent = form.tasks.some(function (t) { return (t.content || '').trim() || (t.members || []).length > 0; });
      if (hasContent && (form.status === 'draft' || form.status === 'rejected')) {
        confirmDialog('切换日期', '当前日期"' + form.date + '"已有内容,是否保存后切换?', function () {
          persist();
          prePlanDate = '';   /* 手动指定日期时, 计划日期回到默认(= 填报日期) */
          urlDate = newDate;
          loadForm();
        }, function () { dateEl.value = form.date; });
      } else {
        prePlanDate = '';
        urlDate = newDate;
        loadForm();
      }
    };

    /* 计划日期 */
    var pdEl = document.getElementById('dp_plan_date');
    if (pdEl) pdEl.onchange = function () {
      form.plan_date = pdEl.value;
      if (pdEl.classList.contains('input-error')) pdEl.classList.remove('input-error');
      render();
    };

    /* 备注 */
    var remarksEl = document.getElementById('dp_remarks');
    if (remarksEl) remarksEl.oninput = function () { form.remarks = remarksEl.value; };

    /* 任务字段统一代理 */
    var list = document.getElementById('rpTaskList');
    if (list) list.addEventListener('input', function (e) {
      var t = e.target;
      var i = parseInt(t.dataset.i, 10);
      if (isNaN(i)) return;
      var k = t.dataset.k;
      if (!k) return;
      if (k === 'content' || k === 'requirement' || k === 'startTime' || k === 'endTime') {
        form.tasks[i][k] = t.value;
        if (t.classList.contains('input-error')) t.classList.remove('input-error');
        var row = t.closest('.rp-task-row');
        if (row && row.classList.contains('has-row-error')) row.classList.remove('has-row-error');
        var field = t.closest('.rp-task-field');
        if (field && field.classList.contains('has-error')) field.classList.remove('has-error');
      }
    });

    /* 同步按钮 */
    document.querySelectorAll('.rp-task-sync').forEach(function (btn) {
      btn.onclick = function () { syncTasks(parseInt(this.dataset.i, 10)); };
    });

    /* 删除单条任务 */
    document.querySelectorAll('.rp-task-remove').forEach(function (btn) {
      btn.onclick = function () {
        var i = parseInt(this.dataset.i, 10);
        if (form.tasks.length <= 1) {
          form.tasks[0] = newTask();
        } else {
          form.tasks.splice(i, 1);
        }
        render();
      };
    });

    /* 移除"审批追加"条目 (仅审批人, 通过前可撤销) */
    document.querySelectorAll('.rp-append-remove').forEach(function (btn) {
      btn.onclick = function () {
        var i = parseInt(this.dataset.i, 10);
        var t = form.tasks[i];
        if (!t || !t.appended) return;
        form.tasks.splice(i, 1);
        persist();
        toast('已移除该条追加内容');
        render();
      };
    });

    /* 添加任务实施人员 */
    document.querySelectorAll('.rp-task-add-member[data-i]').forEach(function (btn) {
      btn.onclick = function () {
        var i = parseInt(this.dataset.i, 10);
        openMemberPicker('添加实施人员', form.tasks[i].members, function (ids) { addTaskMembers(i, ids); });
      };
    });

    /* 添加 crew 人员 */
    document.querySelectorAll('.rp-task-add-member[data-group]').forEach(function (btn) {
      btn.onclick = function () {
        var g = this.dataset.group;
        var curIds = form.crew[g] || [];
        openMemberPicker('添加' + (g === 'night' ? '夜间值班' : g === 'rest' ? '休息' : '调休') + '人员', curIds, function (ids) { setCrew(g, ids); });
      };
    });

    /* 移除 chip */
    document.querySelectorAll('.rp-task-member-x').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var i = parseInt(this.dataset.i, 10);
        var mid = this.dataset.id;
        var arr = form.tasks[i].members;
        var idx = arr.indexOf(mid);
        if (idx >= 0) arr.splice(idx, 1);
        render();
      };
    });
    document.querySelectorAll('.rp-crew-x').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var g = this.dataset.group;
        var mid = this.dataset.id;
        var arr = form.crew[g] || [];
        var idx = arr.indexOf(mid);
        if (idx >= 0) arr.splice(idx, 1);
        render();
      };
    });

    /* 添加任务 */
    var btnAdd = document.getElementById('btnAddTask');
    if (btnAdd) btnAdd.onclick = function () {
      form.tasks.push(newTask());
      render();
      setTimeout(function () {
        var rows = document.querySelectorAll('.rp-task-row');
        if (rows.length) rows[rows.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    };

    /* 操作按钮 */
    var sBtn = document.getElementById('btnSubmit');       if (sBtn) sBtn.onclick = submitForReview;
    var dBtn = document.getElementById('btnSaveDraft');    if (dBtn) dBtn.onclick = saveDraft;
    var rBtn = document.getElementById('btnReopen');       if (rBtn) rBtn.onclick = reopenToEdit;
    var aBtn = document.getElementById('btnApprove');      if (aBtn) aBtn.onclick = approveForm;
    var apBtn = document.getElementById('btnAppend');        if (apBtn) apBtn.onclick = appendWork;
    var apBtn2 = document.getElementById('btnAppendInline'); if (apBtn2) apBtn2.onclick = appendWork;
    var jBtn = document.getElementById('btnReject');       if (jBtn) jBtn.onclick = rejectForm;
    var xBtn = document.getElementById('btnDelete');       if (xBtn) xBtn.onclick = deleteRecord;
    var eJ = document.getElementById('btnExportJSON');     if (eJ) eJ.onclick = exportJSON;
    var eE = document.getElementById('btnExportExcel');    if (eE) eE.onclick = exportExcel;
  }

  /* ---------- 导出 JSON ---------- */
  function exportJSON() {
    var payload = {
      _export: 'engms-daily-plan-v3',
      exported_at: new Date().toISOString(),
      plan: form
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'daily-plan-' + (form.date || todayStr()) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('已导出 JSON', 'success');
  }

  /* ---------- 日期解析 ---------- */
  function parseDate(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var p = s.split('-');
    return { y: parseInt(p[0], 10), m: parseInt(p[1], 10), d: parseInt(p[2], 10) };
  }

  /* ---------- 图标辅助 ---------- */
  function rpIconCheck()    { return '<svg viewBox="0 0 24 24" fill="none" width="14" height="14"><polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
  function rpIconX()        { return '<svg viewBox="0 0 24 24" fill="none" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>'; }
  function rpIconPlus()     { return '<svg viewBox="0 0 24 24" fill="none" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>'; }
  function rpIconTrash()    { return '<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'; }
  function rpIconDownload() { return '<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'; }
  function rpIconClipboard(){ return '<svg viewBox="0 0 24 24" fill="none" width="22" height="22"><rect x="8" y="3" width="8" height="4" rx="1" stroke="currentColor" stroke-width="2"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'; }

  /* 占位: common.js 未提供 ROLE_DISPLAY 时本地兜底 */
  var ROLE_DISPLAY = window.ROLE_DISPLAY || { admin: '管理员', manager: '班长', worker: '工人', viewer: '观察者' };
  var ROLE_COLOR   = window.ROLE_COLOR   || { admin: '#ED4245', manager: '#5865F2', worker: '#35ED7E', viewer: '#7E84A8' };
  var ROLE_TAG_BG  = window.ROLE_TAG_BG  || { admin: 'rgba(237,66,69,.15)', manager: 'rgba(88,101,242,.15)', worker: 'rgba(53,237,126,.15)', viewer: 'rgba(126,132,168,.15)' };

  loadForm();
}

window.initDailyPlanPage = initDailyPlanPage;

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initDailyPlanPage);
} else {
  initDailyPlanPage();
}
