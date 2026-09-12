/* ============================================================
 * 报表浏览 — 日计划 / 周计划 / 计划月报 / 日常日报
 *
 * 交互:
 *   - 列表行点「查看」→ 在当前页打开详情弹层(不跳转)
 *   - 同时把记录 id 写入地址栏 (?tab=x&id=y), 可直接分享 / 刷新还原
 *   - Esc / 点空白 / 「关闭」按钮关闭弹层, 浏览器后退键同样有效
 *
 * 依赖: common.js (DB 内存缓存 / loadXxx / esc / getMember / formatDateTime)
 * ============================================================ */

var PB_TABS = [
  { id: 'daily',   label: '日计划' },
  { id: 'weekly',  label: '周计划' },
  { id: 'monthly', label: '计划月报' },
  { id: 'report',  label: '日常日报' }
];

var PB_EMPTY_TEXT = {
  daily:   '尚无日计划填报',
  weekly:  '尚无周计划填报',
  monthly: '尚无计划月报',
  report:  '尚无日报记录'
};

/* 日计划状态 → 文案 / 复用日报状态标签配色 */
var PB_DAILY_STATUS = { draft: '草稿', pending: '待审批', approved: '已通过', rejected: '已驳回' };
/* 状态 → 标签配色 (复用 .report-status-* 类) */
var PB_STATUS_CLASS = {
  draft: 'draft', pending: 'submitted', approved: 'signed', rejected: 'rejected',
  submitted: 'submitted', signed: 'signed'
};

var PB_SVG_CLOSE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
var PB_SVG_PHOTO = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6"/><circle cx="8.5" cy="9.5" r="1.6" stroke="currentColor" stroke-width="1.6"/><path d="M4 17l4.5-4.5L13 17l3-2.5 4 3.5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
var PB_SVG_EXCEL = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.5 12.5l4 5M13.5 12.5l-4 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
var PB_SVG_PDF = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8.5 17v-4h1.6a1.2 1.2 0 0 1 0 2.4H8.5M13 17v-4h1a1.6 1.6 0 0 1 0 4h-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* ------------------------------------------------------------
 * 数据源 (common.js 内存缓存, 登录时随 bootstrap 一起加载)
 * ------------------------------------------------------------ */
function loadReports() {
  return (typeof DB !== 'undefined' && DB.reports) ? DB.reports : [];
}
function pbList(tab) {
  if (tab === 'daily')  return loadDailyPlans()  || [];
  if (tab === 'weekly') return loadWeeklyPlans() || [];
  if (tab === 'report') return loadReports()     || [];
  return [];   /* 计划月报: 暂未接入数据源 */
}

/* ------------------------------------------------------------
 * 小工具
 * ------------------------------------------------------------ */
function pbName(id) {
  if (!id) return '';
  var m = (typeof getMember === 'function') ? getMember(id) : null;
  return (m && m.name) ? m.name : String(id);
}
function pbNames(ids) {
  if (!Array.isArray(ids)) return '';
  return ids.map(pbName).filter(Boolean).join('、');
}
function pbTime(v) {
  if (!v) return '';
  return formatDateTime(v) || '';
}
function pbOrDash(html) {
  return html || '<span class="muted">—</span>';
}
function pbStatusTag(st, textMap) {
  var text = textMap[st] || st || '-';
  var cls = PB_STATUS_CLASS[st] || 'draft';
  return '<span class="report-status-tag report-status-' + cls + '">' + esc(text) + '</span>';
}
function pbProjectName(id) {
  var ps = (typeof loadProjects === 'function') ? (loadProjects() || []) : [];
  var hit = ps.filter(function (p) { return p._id === id; })[0];
  return hit ? hit.name : '';
}
/* 附件: 兼容新数组格式与旧 {before,during,after} 格式 */
function pbAttList(task) {
  var att = task && task.attachments;
  if (Array.isArray(att)) return att.filter(function (a) { return a && a.url; });
  if (att && typeof att === 'object') {
    var out = [];
    ['before', 'during', 'after'].forEach(function (k) {
      if (att[k]) out.push({ url: att[k], filename: k });
    });
    return out;
  }
  return [];
}

/* ------------------------------------------------------------
 * 列表行
 * ------------------------------------------------------------ */
function pbRowHref(rec, tab) {
  var id = rec && rec._id ? rec._id : '';
  return 'plan-browse.html?tab=' + encodeURIComponent(tab) + (id ? '&id=' + encodeURIComponent(id) : '');
}
function pbTitle(rec, tab) {
  if (tab === 'weekly') {
    var s = rec.startDate || '', e = rec.endDate || '';
    return (s || e) ? (s + ' ~ ' + e) : '周计划';
  }
  /* 日报表: 审批通过后显示「{计划工作日期}年月日计划工作完成情况」 */
  if (tab === 'report') return reportDisplayTitle(rec);
  return rec.date || '(无日期)';
}
function pbSub(rec, tab) {
  if (tab === 'daily') {
    var n = (rec.tasks || []).length;
    var pd = rec.plan_date && rec.plan_date !== rec.date ? ' · 计划 ' + rec.plan_date : '';
    return n + ' 项任务 · ' + (PB_DAILY_STATUS[rec.status] || '草稿') + pd;
  }
  if (tab === 'weekly') {
    var p = pbProjectName(rec.projectId);
    return (p ? p + ' · ' : '') + (rec.tasks || []).length + ' 项任务';
  }
  if (tab === 'report') {
    var cats = [];
    if (rec.categories && rec.categories.plan) cats.push('计划工作');
    if (rec.categories && rec.categories.repair) cats.push('日常维修');
    return (rec.tasks || []).length + ' 项 · ' + (REPORT_STATUS_TEXT[rec.status] || rec.status || '-') +
      (cats.length ? ' · ' + cats.join('/') : '');
  }
  return '';
}
function pbRowTag(rec, tab) {
  if (tab === 'daily') return pbStatusTag(rec.status, PB_DAILY_STATUS);
  if (tab === 'report') return pbStatusTag(rec.status, REPORT_STATUS_TEXT);
  return '';
}

/* ------------------------------------------------------------
 * 详情内容
 * ------------------------------------------------------------ */
function pbMeta(label, html) {
  return '<div class="pb-meta-item"><span class="pb-meta-label">' + esc(label) + '</span>' +
    '<span class="pb-meta-value">' + pbOrDash(html) + '</span></div>';
}
function pbBlock(title, meta, inner) {
  return '<div class="pb-block"><h3>' + esc(title) +
    (meta ? '<span class="sec-meta">' + esc(meta) + '</span>' : '') + '</h3>' + inner + '</div>';
}
function pbTable(headers, rows) {
  if (!rows.length) return '<div class="pb-none">无记录</div>';
  return '<div class="table-wrap"><table class="data-table"><thead><tr>' +
    headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
    '</tr></thead><tbody>' +
    rows.map(function (r) {
      return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
    }).join('') +
    '</tbody></table></div>';
}
/* 现场照片墙 (含旧格式 base64) */
function pbPhotoBlock(tasks) {
  var all = [];
  (tasks || []).forEach(function (t, i) {
    pbAttList(t).forEach(function (a) {
      all.push({ url: a.url, name: a.filename || '', idx: i + 1 });
    });
  });
  if (!all.length) return '';
  return pbBlock('现场照片', all.length + ' 张',
    '<div class="pb-att-grid">' + all.map(function (a) {
      return '<a class="pb-att-thumb" href="' + esc(a.url) + '" target="_blank" rel="noopener" title="' + esc(a.name) + '">' +
        '<img src="' + esc(a.url) + '" alt="' + esc(a.name) + '" loading="lazy">' +
        '<span class="pb-att-tag">任务 ' + a.idx + '</span></a>';
    }).join('') + '</div>');
}

function pbDailyDetail(rec) {
  var st = rec.status || 'draft';
  var meta = '<div class="pb-meta-grid">' +
    pbMeta('填报日期', esc(rec.date)) +
    pbMeta('计划日期', esc(rec.plan_date || rec.date)) +
    pbMeta('状态', pbStatusTag(st, PB_DAILY_STATUS)) +
    pbMeta('提交人', esc(pbName(rec.submitter))) +
    pbMeta('提交时间', esc(pbTime(rec.submitted_at))) +
    pbMeta('审批人', esc(pbName(rec.approver))) +
    (st === 'rejected'
      ? pbMeta('驳回时间', esc(pbTime(rec.rejected_at))) + pbMeta('驳回原因', esc(rec.rejected_reason))
      : pbMeta('审批时间', esc(pbTime(rec.approved_at)))) +
    '</div>';

  var rows = (rec.tasks || []).map(function (t, i) {
    return [
      '<span class="col-num">' + (i + 1) + '</span>',
      esc(t.content),
      esc(t.requirement),
      esc(pbNames(t.members)),
      esc([t.startTime, t.endTime].filter(Boolean).join(' ~ '))
    ];
  });

  var crew = rec.crew || {};
  return meta +
    pbBlock('任务安排', '共 ' + (rec.tasks || []).length + ' 项',
      pbTable(['#', '工作内容', '要求', '实施人员', '计划起止'], rows)) +
    pbBlock('人员安排', '', '<div class="pb-meta-grid">' +
      pbMeta('夜班', esc(pbNames(crew.night))) +
      pbMeta('休息', esc(pbNames(crew.rest))) +
      pbMeta('调整', esc(pbNames(crew.adjust))) +
      '</div>') +
    pbBlock('备注', '', '<div class="pb-remarks">' + (esc(rec.remarks) || '<span class="muted">无</span>') + '</div>');
}

function pbWeeklyDetail(rec) {
  var meta = '<div class="pb-meta-grid">' +
    pbMeta('计划周期', esc((rec.startDate || '') + ' ~ ' + (rec.endDate || ''))) +
    pbMeta('关联项目', esc(pbProjectName(rec.projectId))) +
    pbMeta('提交人', esc(pbName(rec.createdBy))) +
    pbMeta('提交时间', esc(pbTime(rec.submitted_at || rec.created_at))) +
    '</div>';

  var rows = (rec.tasks || []).filter(function (t) { return (t.title || '').trim(); })
    .map(function (t, i) {
      return [
        '<span class="col-num">' + (i + 1) + '</span>',
        esc(t.title),
        esc(pbName(t.ownerId)),
        esc(t.dueDate)
      ];
    });

  return meta +
    pbBlock('周任务清单', '共 ' + rows.length + ' 项',
      pbTable(['#', '任务内容', '责任人', '计划完成时间'], rows));
}

function pbReportDetail(rec) {
  var meta = '<div class="pb-meta-grid">' +
    pbMeta('填报日期', esc(rec.date)) +
    pbMeta('计划工作日期', esc(rec.plan_date || rec.date)) +
    pbMeta('状态', pbStatusTag(rec.status, REPORT_STATUS_TEXT)) +
    pbMeta('报表类别', [rec.categories && rec.categories.plan ? '计划工作每日完成情况' : '',
                       rec.categories && rec.categories.repair ? '日常维修每日完成情况' : '']
      .filter(Boolean).join('、')) +
    pbMeta('提交时间', esc(pbTime(rec.submitted_at))) +
    pbMeta('签名时间', esc(pbTime(rec.signed_at))) +
    (rec.status === 'rejected' ? pbMeta('驳回原因', esc(rec.rejected_reason)) : '') +
    '</div>';

  var rows = (rec.tasks || []).map(function (t, i) {
    var done = t.status !== 'undone';
    var stTag = '<span class="report-status-tag report-status-' + (done ? 'signed' : 'rejected') + '">' +
      (done ? '已完成' : '未完成') + '</span>';
    var attN = pbAttList(t).length;
    return [
      '<span class="col-num">' + (i + 1) + '</span>',
      esc(t.content),
      esc(pbNames(t.members)),
      esc([t.startTime, t.endTime].filter(Boolean).join(' ~ ')),
      stTag + (attN ? ' <span class="chip">' + attN + ' 图</span>' : ''),
      done ? '<span class="muted">—</span>' : esc(t.reason)
    ];
  });

  var sign = rec.signature
    ? '<div class="pb-sign"><img src="' + esc(rec.signature) + '" alt="签名"></div>'
    : '<div class="pb-remarks"><span class="muted">未签名</span></div>';

  return meta +
    pbBlock('工作明细', '共 ' + (rec.tasks || []).length + ' 项',
      pbTable(['#', '工作内容', '实施人员', '完成时间', '状态', '未完成原因'], rows)) +
    pbPhotoBlock(rec.tasks) +
    pbBlock('备注', '', '<div class="pb-remarks">' + (esc(rec.remarks) || '<span class="muted">无</span>') + '</div>') +
    pbBlock('签名', '', sign);
}

function pbDetailHtml(rec, tab) {
  if (tab === 'daily')  return pbDailyDetail(rec);
  if (tab === 'weekly') return pbWeeklyDetail(rec);
  if (tab === 'report') return pbReportDetail(rec);
  return '<div class="pb-none">计划月报暂未开放浏览</div>';
}

/* 有独立填报页的 tab, 提供「打开填报页」入口 */
function pbFullHref(rec, tab) {
  if (tab === 'daily' && rec.date) return 'daily-plan.html?date=' + encodeURIComponent(rec.date);
  if (tab === 'report' && rec._id) return 'report.html?id=' + encodeURIComponent(rec._id);
  return '';
}

/* ------------------------------------------------------------
 * 导出
 *   Excel: assets/export-excel.js (SheetJS)
 *   图片 / PDF: assets/export-media.js (html2canvas + jsPDF)
 *   日计划: 沿用填报页的业务规则 —— 仅「已通过」可导出
 *   三种导出的文件名与文档标题均取「计划日期」而非填报日期
 * ------------------------------------------------------------ */
function pbExportable(tab) {
  return tab === 'daily' || tab === 'weekly' || tab === 'report';
}
function pbExportBlockedReason(rec, tab) {
  if (tab === 'daily' && (rec.status || 'draft') !== 'approved') return '仅审批通过的日计划可导出';
  return '';
}
function pbExport(rec, tab) {
  var blocked = pbExportBlockedReason(rec, tab);
  if (blocked) { toast(blocked, 'warn'); return; }
  if (tab === 'daily') {
    if (typeof exportDailyPlanToExcel !== 'function') { toast('Excel 模块未加载', 'error'); return; }
    exportDailyPlanToExcel(rec, loadMembers() || []);
    return;
  }
  if (tab === 'weekly') {
    if (typeof exportWeeklyPlanToExcel !== 'function') { toast('Excel 模块未加载', 'error'); return; }
    exportWeeklyPlanToExcel(rec, loadMembers() || []);
    return;
  }
  if (tab === 'report') {
    if (typeof exportReportToExcel !== 'function') { toast('Excel 模块未加载', 'error'); return; }
    exportReportToExcel(rec);
  }
}

/* ------------------------------------------------------------
 * 详情弹层
 * ------------------------------------------------------------ */
function pbCloseDetail() {
  document.querySelectorAll('.modal-overlay.pb-overlay').forEach(function (el) { el.remove(); });
}
function pbOpenDetail(rec, tab, opts) {
  opts = opts || {};
  pbCloseDetail();

  var full = pbFullHref(rec, tab);
  var blocked = pbExportBlockedReason(rec, tab);
  var dis = blocked ? ' disabled title="' + esc(blocked) + '"' : '';
  /* 导出 Excel / 图片 / PDF 并列可选 */
  var exportGroup = !pbExportable(tab) ? '' :
    '<span class="pb-export-group">' +
      '<button class="btn btn-success pb-export" type="button"' + dis + '>' +
        PB_SVG_EXCEL + '<span>Excel</span>' +
      '</button>' +
      '<button class="btn btn-default pb-export-img" type="button"' + dis + '>' +
        PB_SVG_PHOTO + '<span>图片</span>' +
      '</button>' +
      '<button class="btn btn-default pb-export-pdf" type="button"' + dis + '>' +
        PB_SVG_PDF + '<span>PDF</span>' +
      '</button>' +
    '</span>';

  var ov = document.createElement('div');
  ov.className = 'modal-overlay pb-overlay';
  ov.setAttribute('tabindex', '-1');
  ov.innerHTML =
    '<div class="modal modal-large" role="dialog" aria-modal="true">' +
      '<div class="modal-header">' +
        '<span>' + esc(pbTitle(rec, tab)) + '</span>' +
        '<span class="pb-head-actions">' +
          (full ? '<a class="btn-secondary btn-sm" href="' + esc(full) + '">打开填报页</a>' : '') +
          '<button class="modal-close" type="button" aria-label="关闭">' + PB_SVG_CLOSE + '</button>' +
        '</span>' +
      '</div>' +
      '<div class="modal-body">' + pbDetailHtml(rec, tab) + '</div>' +
      '<div class="modal-footer">' +
        exportGroup +
        '<button class="btn-secondary pb-close" type="button">关闭</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ov);

  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  function close() {
    ov.remove();
    document.removeEventListener('keydown', onKey);
    if (!opts.keepUrl) pbCleanUrl(tab);
  }
  ov.querySelector('.modal-close').onclick = close;
  ov.querySelector('.pb-close').onclick = close;
  function guard(btn, fn) {
    return function () {
      if (btn.disabled) { toast(pbExportBlockedReason(rec, tab) || '当前记录不可导出', 'warn'); return; }
      fn();
    };
  }
  var expBtn = ov.querySelector('.pb-export');
  if (expBtn) expBtn.onclick = guard(expBtn, function () { pbExport(rec, tab); });
  var imgBtn = ov.querySelector('.pb-export-img');
  if (imgBtn) imgBtn.onclick = guard(imgBtn, function () {
    if (typeof pbExportMedia !== 'function') { toast('导出组件未加载', 'error'); return; }
    pbExportMedia(rec, tab, 'image');
  });
  var pdfBtn = ov.querySelector('.pb-export-pdf');
  if (pdfBtn) pdfBtn.onclick = guard(pdfBtn, function () {
    if (typeof pbExportMedia !== 'function') { toast('导出组件未加载', 'error'); return; }
    pbExportMedia(rec, tab, 'pdf');
  });
  ov.addEventListener('mousedown', function (e) { if (e.target === ov) ov._bg = true; });
  ov.addEventListener('click', function (e) {
    if (e.target === ov && ov._bg) { ov._bg = false; close(); }
  });
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(function () {
    try { ov.focus({ preventScroll: true }); } catch (_) { ov.focus(); }
  });
}
/* 关掉弹层时把 id 参数从地址栏摘掉, 避免刷新又弹出来 */
function pbCleanUrl(tab) {
  if (!queryParam('id')) return;
  var url = 'plan-browse.html?tab=' + encodeURIComponent(tab);
  try { history.replaceState(null, '', url); } catch (_) { /* ignore */ }
}

/* ------------------------------------------------------------
 * 页面入口
 * ------------------------------------------------------------ */
async function initPlanBrowsePage() {
  var user = await requireLogin();
  if (!user) return;

  var tab = queryParam('tab') || 'daily';
  var validTab = PB_TABS.filter(function (t) { return t.id === tab; }).length > 0;
  if (!validTab) tab = 'daily';

  var list = pbList(tab);

  renderPage({
    active: 'browse',
    pageHtml:
      '<nav class="breadcrumb"><a href="dashboard.html">工作台</a><span class="sep">/</span><span>报表浏览</span></nav>' +
      '<div class="page-header"><div><h2>报表浏览</h2>' +
        '<div class="page-sub">查看已填报的日计划 / 周计划 / 日常日报，点击右侧「查看」展开详情，并可按需导出 Excel / 图片 / PDF</div></div></div>' +
      '<div class="tabs">' + PB_TABS.map(function (t) {
        var n = pbList(t.id).length;
        return '<a class="tab' + (t.id === tab ? ' active' : '') + '" href="?tab=' + t.id + '">' +
          esc(t.label) + (n ? '<span class="tab-count">' + n + '</span>' : '') + '</a>';
      }).join('') + '</div>' +
      '<div id="pbList"></div>'
  });

  var host = document.getElementById('pbList');

  if (!list.length) {
    renderEmpty(host, PB_EMPTY_TEXT[tab] || '暂无数据');
    return;
  }

  host.innerHTML = list.map(function (rec, i) {
    var tag = pbRowTag(rec, tab);
    return '<a class="list-row pb-row" href="' + esc(pbRowHref(rec, tab)) + '" data-i="' + i + '">' +
      '<div><strong>' + esc(pbTitle(rec, tab)) + '</strong>' +
      '<div class="muted" style="font-size:13px;margin-top:4px">' + esc(pbSub(rec, tab)) + '</div></div>' +
      '<span class="pb-row-right">' + tag + '<span class="chip">查看</span></span>' +
      '</a>';
  }).join('');

  host.querySelectorAll('.pb-row').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var rec = list[parseInt(this.dataset.i, 10)];
      if (!rec) return;
      try { history.pushState({ pbId: rec._id }, '', pbRowHref(rec, tab)); } catch (_) { /* ignore */ }
      pbOpenDetail(rec, tab);
    });
  });

  /* 直接用带 id 的链接进来 → 自动弹出对应详情 */
  var urlId = queryParam('id');
  if (urlId) {
    var hit = list.filter(function (r) { return String(r._id) === String(urlId); })[0];
    if (hit) pbOpenDetail(hit, tab, { keepUrl: true });
    else toast('未找到该条记录', 'warn');
  }

  /* 浏览器前进/后退: 有 id 就弹, 没 id 就关 */
  window.addEventListener('popstate', function () {
    var id = queryParam('id');
    if (!id) { pbCloseDetail(); return; }
    var r = list.filter(function (x) { return String(x._id) === String(id); })[0];
    if (r) pbOpenDetail(r, tab, { keepUrl: true });
  });
}
window.initPlanBrowsePage = initPlanBrowsePage;
window.addEventListener('DOMContentLoaded', initPlanBrowsePage);
if (document.readyState !== 'loading') initPlanBrowsePage();
