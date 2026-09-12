/* ============================================================
 * Excel 导出（移植自小程序 utils/exportExcel.js）
 * 依赖 assets/xlsx.full.min.js（SheetJS 浏览器版）
 *
 * 三个入口:
 *   exportReportToExcel(report, onDone)              日报表填报
 *   exportDailyPlanToExcel(plan, members, onDone)    日计划填报 (审批通过后)
 *   exportWeeklyPlanToExcel(plan, members, onDone)   周计划填报
 * ============================================================ */

/* 附件文件名清单: 兼容旧 {before,during,after} 与新数组格式 */
function attachNames(att) {
  if (Array.isArray(att)) {
    return att.filter(function (a) { return a && a.url; })
      .map(function (a) { return a.filename || a.rel_path || '附件'; });
  }
  if (att && typeof att === 'object') {
    var label = { before: '处理前', during: '处理中', after: '处理后' };
    return ['before', 'during', 'after']
      .filter(function (k) { return att[k]; })
      .map(function (k) { return label[k]; });
  }
  return [];
}

function exportReportToExcel(report, onDone) {
  if (typeof XLSX === 'undefined') {
    toast('Excel 组件未加载', 'error');
    if (onDone) onDone();
    return;
  }
  var wsData = [];
  wsData.push([reportDisplayTitle(report)]);
  wsData.push(['']);
  wsData.push(['填报日期', report.date || '']);
  wsData.push(['计划工作日期', report.plan_date || report.date || '']);
  wsData.push(['状态', REPORT_STATUS_TEXT[report.status] || report.status || '未知']);
  wsData.push(['备注', report.remarks || '']);
  wsData.push(['审批人', report.approver || '']);
  if (report.status === 'rejected' && report.rejected_reason) {
    wsData.push(['驳回原因', report.rejected_reason]);
  }
  wsData.push(['']);
  wsData.push(['序号', '工作内容']);
  var tasks = report.tasks || [];
  var hasTask = false;
  tasks.forEach(function (t, index) {
    if (t.content && t.content.trim()) {
      hasTask = true;
      wsData.push([index + 1, t.content.trim()]);
    }
  });
  if (!hasTask) wsData.push(['无任务记录']);
  wsData.push(['']);
  if (report.signature) wsData.push(['签名', '已签名']);
  wsData.push(['']);

  /* 附件汇总（只列文件名与数量, 不嵌图片）
   * 兼容两代数据结构: 新数组 [{filename,url,...}] 与旧 {before,during,after} */
  var attachRows = [];
  tasks.forEach(function (t) {
    if (!t.content || !t.content.trim()) return;
    var names = attachNames(t.attachments);
    if (names.length) attachRows.push([attachRows.length + 1, names.join('、'), names.length + ' 张']);
  });
  if (attachRows.length) {
    wsData.push(['任务附件']);
    wsData.push(['#', '附件文件名', '数量']);
    attachRows.forEach(function (r) { wsData.push(r); });
  }

  wsData.push(['']);
  wsData.push(['导出时间', formatDateTime(new Date())]);

  var ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 10 }, { wch: 50 }, { wch: 10 }];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '工作安排');

  var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
  var blob = new Blob([wbout], { type: 'application/octet-stream' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  /* 文件名使用「计划日期」而非填报日期 */
  a.download = '日报表_' + (report.plan_date || report.date || formatDateStr(new Date())) + '.xlsx';
  a.click();
  URL.revokeObjectURL(url);
  toast('Excel 已导出');
  if (onDone) onDone();
}

/* ---------- 日计划填报导出 ---------- */
function exportDailyPlanToExcel(plan, members, onDone) {
  if (typeof XLSX === 'undefined') {
    toast('Excel 组件未加载', 'error');
    if (onDone) onDone();
    return;
  }

  /* 任务里的人员名 → 用 members 数组查找 */
  function memberName(id) {
    if (!members) return '-';
    var m = members.find(function (mm) { return mm._id === id; });
    return m ? m.name : '-';
  }
  function memberListText(ids) {
    if (!ids || ids.length === 0) return '-';
    return ids.map(memberName).join('、');
  }
  function statusText() {
    return ({ draft: '草稿', pending: '待审批', approved: '已通过', rejected: '已驳回' })[plan.status] || plan.status;
  }
  /* 标题 banner 文本 */
  function planDateText() {
    var d = plan.plan_date || plan.date || formatDateStr(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    var p = d.split('-');
    return p[0] + '年' + parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日 工程部计划工作安排';
  }

  /* 1. 主表: 计划工作内容 */
  var wsMain = [];
  wsMain.push(['工程部日计划工作安排']);
  wsMain.push(['']);
  wsMain.push(['标题',  planDateText()]);
  wsMain.push(['填报日期', plan.date || '']);
  wsMain.push(['计划日期', plan.plan_date || '']);
  wsMain.push(['状态',  statusText()]);
  if (plan.submitter)    wsMain.push(['填报人', plan.submitter]);
  if (plan.submitted_at) wsMain.push(['提交时间', formatDateTime(plan.submitted_at)]);
  if (plan.approver)     wsMain.push(['审批人', plan.approver]);
  if (plan.approved_at)  wsMain.push(['审批时间', formatDateTime(plan.approved_at)]);
  wsMain.push(['']);
  wsMain.push(['#', '计划工作内容', '工作要求', '计划实施人员', '计划完成时间']);
  var tasks = (plan.tasks || []).filter(function (t) { return (t.content || '').trim(); });
  if (tasks.length === 0) {
    wsMain.push(['-', '无任务记录', '', '', '']);
  } else {
    tasks.forEach(function (t, idx) {
      var time = (t.startTime || t.endTime) ? (t.startTime + ' ~ ' + t.endTime) : '-';
      wsMain.push([
        idx + 1,
        t.content || '',
        t.requirement || '',
        memberListText(t.members),
        time
      ]);
    });
  }
  wsMain.push(['']);
  if ((plan.remarks || '').trim()) wsMain.push(['备注', plan.remarks]);
  wsMain.push(['']);
  wsMain.push(['导出时间', formatDateTime(new Date())]);

  var wsMainSheet = XLSX.utils.aoa_to_sheet(wsMain);
  wsMainSheet['!cols'] = [
    { wch: 4  },   // #
    { wch: 40 },   // 计划工作内容
    { wch: 40 },   // 工作要求
    { wch: 24 },   // 计划实施人员
    { wch: 22 }    // 计划完成时间
  ];

  /* 2. 人员安排 sheet (夜班/休息/调休) */
  var wsCrew = [];
  wsCrew.push(['人员安排 — 仅显示角色为「班长」「工人」']);
  wsCrew.push(['']);
  wsCrew.push(['类型', '人员名单', '人数']);
  var crew = plan.crew || {};
  var crewGroupMeta = [
    { key: 'night',  label: '夜间值班' },
    { key: 'rest',   label: '休息人员' },
    { key: 'adjust', label: '调休人员' }
  ];
  var anyCrew = false;
  crewGroupMeta.forEach(function (g) {
    var ids = crew[g.key] || [];
    if (ids.length > 0) anyCrew = true;
    wsCrew.push([g.label, memberListText(ids), ids.length + ' 人']);
  });
  if (!anyCrew) wsCrew.push(['-', '无人员安排', '0 人']);

  var wsCrewSheet = XLSX.utils.aoa_to_sheet(wsCrew);
  wsCrewSheet['!cols'] = [{ wch: 14 }, { wch: 50 }, { wch: 10 }];

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsMainSheet, '日计划工作');
  XLSX.utils.book_append_sheet(wb, wsCrewSheet, '人员安排');

  var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
  var blob = new Blob([wbout], { type: 'application/octet-stream' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  /* 文件名使用「计划日期」而非填报日期 */
  a.download = '日计划工作安排_' + (plan.plan_date || plan.date || formatDateStr(new Date())) + '.xlsx';
  a.click();
  URL.revokeObjectURL(url);
  toast('Excel 已导出');
  if (onDone) onDone();
}

/* ---------- 周计划填报导出 ---------- */
function exportWeeklyPlanToExcel(plan, members, onDone) {
  if (typeof XLSX === 'undefined') {
    toast('Excel 组件未加载', 'error');
    if (onDone) onDone();
    return;
  }

  function memberName(id) {
    if (!members) return '-';
    var m = members.find(function (mm) { return mm._id === id; });
    return m ? m.name : '-';
  }
  /* 关联项目名 (loadProjects 来自 common.js) */
  function projectName() {
    if (!plan.projectId) return '';
    var ps = (typeof loadProjects === 'function') ? (loadProjects() || []) : [];
    var hit = ps.filter(function (p) { return p._id === plan.projectId; })[0];
    return hit ? hit.name : '';
  }

  var wsData = [];
  wsData.push(['工程部周计划工作安排']);
  wsData.push(['']);
  wsData.push(['计划周期', (plan.startDate || '') + ' ~ ' + (plan.endDate || '')]);
  if (projectName()) wsData.push(['关联项目', projectName()]);
  if (plan.createdBy) wsData.push(['填报人', memberName(plan.createdBy)]);
  var submittedAt = plan.submitted_at || plan.created_at;
  if (submittedAt) wsData.push(['提交时间', formatDateTime(submittedAt)]);
  wsData.push(['']);
  wsData.push(['#', '计划工作内容', '责任人', '计划完成时间']);

  var tasks = (plan.tasks || []).filter(function (t) { return (t.title || '').trim(); });
  if (tasks.length === 0) {
    wsData.push(['-', '无任务记录', '', '']);
  } else {
    tasks.forEach(function (t, idx) {
      wsData.push([idx + 1, t.title || '', memberName(t.ownerId), t.dueDate || '-']);
    });
  }
  wsData.push(['']);
  wsData.push(['导出时间', formatDateTime(new Date())]);

  var ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 4 }, { wch: 44 }, { wch: 16 }, { wch: 22 }];

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '周计划工作');

  var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
  var blob = new Blob([wbout], { type: 'application/octet-stream' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = '周计划工作安排_' + (plan.startDate || formatDateStr(new Date())) + '.xlsx';
  a.click();
  URL.revokeObjectURL(url);
  toast('Excel 已导出');
  if (onDone) onDone();
}

window.exportReportToExcel = exportReportToExcel;
window.exportDailyPlanToExcel = exportDailyPlanToExcel;
window.exportWeeklyPlanToExcel = exportWeeklyPlanToExcel;
