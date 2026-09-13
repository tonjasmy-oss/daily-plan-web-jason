/* ============================================================
 * 报表导出为「图片 / PDF」
 *   依赖 assets/html2canvas.min.js + assets/jspdf.umd.min.js
 *
 * 思路:
 *   1. 按记录数据拼一份「浅色 A4 文档」节点(.pbx-doc), 样式全部内联,
 *      不复用深色主题 —— 导出/打印/转发给他人看的都需要白底黑字
 *   2. 等图片加载完 -> html2canvas 渲染成 2x 画布
 *   3. 图片: canvas -> PNG 下载
 *      PDF : 画布按 A4 内容高度切条 -> jsPDF 逐页贴图 (JPEG 0.92)
 *
 * 文件名一律取「计划日期」而非填报日期:
 *   日计划 -> plan_date  周计划 -> startDate  日报表 -> plan_date
 * ============================================================ */

/* ---------------- 浅色文档样式 ---------------- */
var PBX_CSS = '' +
  '.pbx-doc{width:794px;box-sizing:border-box;padding:38px 42px;background:#ffffff;color:#1a1a1a;' +
    'font-family:"Microsoft YaHei","PingFang SC","Hiragino Sans GB","Source Han Sans SC",sans-serif;' +
    'font-size:13px;line-height:1.6}' +
  '.pbx-doc *{box-sizing:border-box}' +
  '.pbx-title{font-size:20px;font-weight:700;text-align:center;margin:0 0 6px;letter-spacing:.5px}' +
  '.pbx-sub{text-align:center;font-size:12px;color:#666666;margin:0 0 16px}' +
  '.pbx-meta{width:100%;border-collapse:collapse;margin:0 0 16px;font-size:12px}' +
  '.pbx-meta th,.pbx-meta td{border:1px solid #dddddd;padding:6px 9px;vertical-align:top;text-align:left}' +
  '.pbx-meta th{width:92px;background:#f5f6f8;color:#555555;font-weight:600;white-space:nowrap}' +
  '.pbx-meta td{color:#1a1a1a;word-break:break-all}' +
  '.pbx-h{font-size:14px;font-weight:700;margin:18px 0 8px;padding-left:8px;border-left:3px solid #5865F2}' +
  '.pbx-table{width:100%;border-collapse:collapse;font-size:12px}' +
  '.pbx-table th,.pbx-table td{border:1px solid #dddddd;padding:6px 8px;vertical-align:top;text-align:left}' +
  '.pbx-table th{background:#f5f6f8;font-weight:600;color:#333333}' +
  '.pbx-num{width:34px;text-align:center;color:#666666}' +
  /* 人员安排: 「类型」列定宽且不换行(否则会被挤成一字一行);
     提高选择器权重以压过 .pbx-table td 的默认左对齐/颜色 */
  '.pbx-table th.pbx-crew-key,.pbx-table td.pbx-crew-key{' +
    'width:88px;white-space:nowrap;text-align:left;color:#1a1a1a}' +
  '.pbx-table th.pbx-crew-num,.pbx-table td.pbx-crew-num{' +
    'width:64px;white-space:nowrap;text-align:left;color:#1a1a1a}' +
  '.pbx-photos{width:100%;border-collapse:collapse;margin-top:2px}' +
  '.pbx-photos td.pbx-photo{width:33.33%;border:1px solid #dddddd;padding:5px;vertical-align:top}' +
  '.pbx-photos td.pbx-photo img{width:100%;display:block;background:#f5f6f8}' +
  '.pbx-photos td.pbx-photo span{display:block;font-size:11px;color:#666666;margin-top:4px;word-break:break-all}' +
  '.pbx-remarks{white-space:pre-wrap;padding:8px 10px;border:1px solid #dddddd;background:#fafbfc;' +
    'min-height:36px;word-break:break-all}' +
  '.pbx-sign{text-align:left}' +
  '.pbx-sign img{max-height:90px;max-width:260px;border:1px solid #dddddd;background:#ffffff}' +
  '.pbx-foot{margin-top:20px;padding-top:8px;border-top:1px solid #dddddd;font-size:11px;color:#888888;' +
    'overflow:hidden}' +
  '.pbx-foot-l{float:left}.pbx-foot-r{float:right}' +
  '.pbx-empty{color:#999999;padding:4px 0}';

/* ---------------- 数据小工具(自带, 不依赖 plan-browse.js) ---------------- */
function pbxName(id) {
  if (!id) return '';
  var m = (typeof getMember === 'function') ? getMember(id) : null;
  return (m && m.name) ? m.name : String(id);
}
function pbxNames(ids) {
  if (!Array.isArray(ids)) return '';
  return ids.map(pbxName).filter(Boolean).join('、');
}
function pbxAttList(task) {
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
function pbxProjectName(id) {
  var ps = (typeof loadProjects === 'function') ? (loadProjects() || []) : [];
  var hit = ps.filter(function (p) { return p._id === id; })[0];
  return hit ? hit.name : '';
}
function pbxText(v) { return (v === undefined || v === null || v === '') ? '—' : String(v); }

/* 计划日期: 导出文件名与标题都用它, 而不是填报日期 */
function pbxPlanDate(rec, tab) {
  if (!rec) return '';
  if (tab === 'weekly') return rec.startDate || '';
  if (tab === 'daily') return rec.plan_date || rec.date || '';
  return rec.plan_date || rec.date || '';
}
function pbxDocTitle(rec, tab) {
  if (tab === 'daily') {
    var pd = pbxPlanDate(rec, tab);
    return (pd ? cnDateText(pd) + ' ' : '') + '工程部计划工作安排';
  }
  if (tab === 'weekly') {
    var s = rec.startDate || '', e = rec.endDate || '';
    return '工程部周计划工作安排' + ((s || e) ? '（' + s + ' ~ ' + e + '）' : '');
  }
  if (tab === 'report') return reportDisplayTitle(rec);
  return '报表';
}
/* kind: 'image' | 'pdf' | 'xlsx' */
function pbxDocFilename(rec, tab, kind) {
  var ext = kind === 'pdf' ? 'pdf' : (kind === 'xlsx' ? 'xlsx' : 'png');
  var base = tab === 'weekly' ? '周计划工作安排' : (tab === 'report' ? '日报表' : '日计划工作安排');
  var d = pbxPlanDate(rec, tab) || formatDateStr(new Date());
  return base + '_' + d + '.' + ext;
}

/* ---------------- 文档内容 ---------------- */
function pbxMetaTable(rows) {
  var body = rows.filter(function (r) { return r && r[0]; })
    .map(function (r) {
      return '<tr><th>' + esc(r[0]) + '</th><td>' + (r[1] || '—') + '</td></tr>';
    }).join('');
  return '<table class="pbx-meta">' + body + '</table>';
}
/* opts.firstClass 首列类(默认 pbx-num 序号列, 传 '' 表示不加)
   opts.lastClass  末列类(默认不加) */
function pbxDataTable(headers, rows, opts) {
  if (!rows.length) return '<div class="pbx-empty">无记录</div>';
  opts = opts || {};
  var firstCls = (opts.firstClass === undefined) ? 'pbx-num' : opts.firstClass;
  var attr = function (i, n) {
    var cls = i === 0 ? firstCls : (i === n - 1 ? (opts.lastClass || '') : '');
    return cls ? ' class="' + cls + '"' : '';
  };
  return '<table class="pbx-table"><thead><tr>' +
    headers.map(function (h, i) {
      return '<th' + attr(i, headers.length) + '>' + esc(h) + '</th>';
    }).join('') +
    '</tr></thead><tbody>' +
    rows.map(function (r) {
      return '<tr>' + r.map(function (c, i) {
        return '<td' + attr(i, r.length) + '>' + c + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody></table>';
}
function pbxHeading(text) { return '<div class="pbx-h">' + esc(text) + '</div>'; }

/* 现场照片: 三列一行的表格(表格在渲染器里最稳) */
function pbxPhotoTable(items) {
  if (!items.length) return '';
  var cells = items.map(function (it) {
    return '<td class="pbx-photo"><img src="' + esc(it.url) + '" alt="">' +
      '<span>任务 ' + it.idx + (it.name ? ' · ' + esc(it.name) : '') + '</span></td>';
  });
  var html = '';
  for (var i = 0; i < cells.length; i += 3) {
    var row = cells.slice(i, i + 3);
    while (row.length < 3) row.push('<td class="pbx-photo"></td>');
    html += '<tr>' + row.join('') + '</tr>';
  }
  return '<table class="pbx-photos">' + html + '</table>';
}

var PBX_DAILY_STATUS = { draft: '草稿', pending: '待审批', approved: '已通过', rejected: '已驳回' };
var PBX_REPORT_KIND = { repair: '日常维修每日完成情况', plan: '计划工作每日完成情况' };

function pbxBodyDaily(rec) {
  var st = rec.status || 'draft';
  var meta = pbxMetaTable([
    ['填报日期', esc(rec.date)],
    ['计划日期', esc(rec.plan_date || rec.date)],
    ['状态', esc(PBX_DAILY_STATUS[st] || st)],
    ['填报人', esc(rec.submitter)],
    ['提交时间', esc(rec.submitted_at ? formatDateTime(rec.submitted_at) : '')],
    ['审批人', esc(rec.approver)],
    [st === 'rejected' ? '驳回时间' : '审批时间',
      esc(formatDateTime(st === 'rejected' ? rec.rejected_at : rec.approved_at))],
    st === 'rejected' ? ['驳回原因', esc(rec.rejected_reason)] : null
  ]);

  var rows = (rec.tasks || []).filter(function (t) { return (t.content || '').trim(); })
    .map(function (t, i) {
      return [
        String(i + 1),
        esc((t.content || '') + (t.appended ? '（审批追加）' : '')),
        esc(t.requirement),
        esc(pbxNames(t.members)),
        esc([t.startTime, t.endTime].filter(Boolean).join(' ~ '))
      ];
    });

  var crew = rec.crew || {};
  var crewRows = [
    ['夜间值班', esc(pbxNames(crew.night)), ((crew.night || []).length) + ' 人'],
    ['休息人员', esc(pbxNames(crew.rest)), ((crew.rest || []).length) + ' 人'],
    ['调休人员', esc(pbxNames(crew.adjust)), ((crew.adjust || []).length) + ' 人']
  ];

  return meta +
    pbxHeading('计划工作内容（共 ' + rows.length + ' 项）') +
    pbxDataTable(['#', '计划工作内容', '工作要求', '计划实施人员', '计划完成时间'], rows) +
    pbxHeading('人员安排') +
    pbxDataTable(['类型', '人员名单', '人数'], crewRows,
      { firstClass: 'pbx-crew-key', lastClass: 'pbx-crew-num' }) +
    pbxHeading('备注') +
    '<div class="pbx-remarks">' + (esc(rec.remarks) || '无') + '</div>';
}

function pbxBodyWeekly(rec) {
  var meta = pbxMetaTable([
    ['计划周期', esc((rec.startDate || '') + ' ~ ' + (rec.endDate || ''))],
    ['关联项目', esc(pbxProjectName(rec.projectId))],
    ['填报人', esc(pbxName(rec.createdBy))],
    ['提交时间', esc(formatDateTime(rec.submitted_at || rec.created_at))]
  ]);
  var rows = (rec.tasks || []).filter(function (t) { return !t.appended && (t.title || '').trim(); })
    .map(function (t, i) {
      return [String(i + 1), esc(t.title), esc(pbxName(t.ownerId)), esc(t.dueDate)];
    });
  /* 审批追加的工作内容单独成块 —— 带工作要求 / 实施人员, 塞进 4 列表格会丢字段 */
  var apRows = (rec.tasks || []).filter(function (t) {
    return t.appended && ((t.title || t.content || '').trim());
  }).map(function (t, i) {
    var time = [t.startTime, t.endTime].filter(Boolean).join(' ~ ');
    return [String(i + 1), esc(t.content || t.title || ''), esc(t.requirement),
            esc(pbxNames(t.members)), esc(time)];
  });
  return meta +
    pbxHeading('周任务清单（共 ' + rows.length + ' 项）') +
    pbxDataTable(['#', '计划工作内容', '责任人', '计划完成时间'], rows) +
    (apRows.length
      ? pbxHeading('审批追加工作内容（共 ' + apRows.length + ' 条）') +
        pbxDataTable(['#', '工作内容', '工作要求', '实施人员', '计划完成时间'], apRows)
      : '');
}

function pbxBodyReport(rec) {
  var cats = [];
  if (rec.categories && rec.categories.plan) cats.push(PBX_REPORT_KIND.plan);
  if (rec.categories && rec.categories.repair) cats.push(PBX_REPORT_KIND.repair);
  var meta = pbxMetaTable([
    ['填报日期', esc(rec.date)],
    ['计划工作日期', esc(rec.plan_date || rec.date)],
    ['状态', esc(REPORT_STATUS_TEXT[rec.status] || rec.status || '')],
    ['报表类别', esc(cats.join('、'))],
    ['审批人', esc(rec.approver)],
    ['提交时间', esc(rec.submitted_at ? formatDateTime(rec.submitted_at) : '')],
    ['签名时间', esc(rec.signed_at ? formatDateTime(rec.signed_at) : '')],
    (rec.status === 'rejected' && rec.rejected_reason) ? ['驳回原因', esc(rec.rejected_reason)] : null
  ]);

  var tasks = (rec.tasks || []).filter(function (t) { return (t.content || '').trim(); });
  var rows = tasks.map(function (t, i) {
    var done = t.status !== 'undone';
    var attN = pbxAttList(t).length;
    return [
      String(i + 1),
      esc(t.content),
      esc(pbxNames(t.members)),
      esc([t.startTime, t.endTime].filter(Boolean).join(' ~ ')),
      done ? '已完成' : '未完成' + (attN ? '（附 ' + attN + ' 张照片）' : ''),
      done ? '—' : esc(t.reason)
    ];
  });

  var photos = [];
  tasks.forEach(function (t, i) {
    pbxAttList(t).forEach(function (a) { photos.push({ url: a.url, name: a.filename || '', idx: i + 1 }); });
  });

  return meta +
    pbxHeading('工作明细（共 ' + rows.length + ' 项）') +
    pbxDataTable(['#', '工作内容', '实施人员', '完成时间', '完成状态', '未完成原因'], rows) +
    (photos.length ? pbxHeading('现场照片（' + photos.length + ' 张）') + pbxPhotoTable(photos) : '') +
    pbxHeading('备注') +
    '<div class="pbx-remarks">' + (esc(rec.remarks) || '无') + '</div>' +
    pbxHeading('签名') +
    '<div class="pbx-sign">' +
      (rec.signature
        ? '<img src="' + esc(rec.signature) + '" alt="签名">'
        : '<div class="pbx-empty">未签名</div>') +
    '</div>';
}

function pbxDocHtml(rec, tab) {
  var body = tab === 'weekly' ? pbxBodyWeekly(rec)
    : tab === 'report' ? pbxBodyReport(rec)
    : pbxBodyDaily(rec);
  return '<style>' + PBX_CSS + '</style>' +
    '<div class="pbx-doc">' +
      '<div class="pbx-title">' + esc(pbxDocTitle(rec, tab)) + '</div>' +
      '<div class="pbx-sub">工程管理系统 · 报表浏览导出</div>' +
      body +
      '<div class="pbx-foot">' +
        '<span class="pbx-foot-l">导出时间：' + esc(formatDateTime(new Date())) + '</span>' +
        '<span class="pbx-foot-r">工程管理系统</span>' +
      '</div>' +
    '</div>';
}

/* ---------------- 渲染与下载 ---------------- */
function pbxBuildNode(rec, tab) {
  var wrap = document.createElement('div');
  wrap.setAttribute('data-pbx-export', '1');
  /* 放到视口外渲染, 避免闪现; 用 absolute 而非 fixed, html2canvas 对前者更稳 */
  wrap.style.position = 'absolute';
  wrap.style.left = '-100000px';
  wrap.style.top = '0';
  wrap.style.width = '794px';
  wrap.style.background = '#ffffff';
  wrap.innerHTML = pbxDocHtml(rec, tab);
  return wrap;
}

/* 等所有图片就绪(带 6s 兜底), 否则截图会丢图 */
function pbxWaitImages(node) {
  var imgs = Array.prototype.slice.call(node.querySelectorAll('img'));
  return Promise.all(imgs.map(function (img) {
    if (img.complete && img.naturalWidth) return Promise.resolve();
    return new Promise(function (resolve) {
      var done = false;
      function fin() { if (!done) { done = true; resolve(); } }
      img.addEventListener('load', fin);
      img.addEventListener('error', fin);
      setTimeout(fin, 6000);
    });
  }));
}

function pbxRenderCanvas(rec, tab, cb) {
  if (typeof html2canvas === 'undefined') { toast('导出组件未加载(html2canvas)', 'error'); cb(null); return; }
  var node = pbxBuildNode(rec, tab);
  document.body.appendChild(node);
  var cleanup = function () { if (node.parentNode) node.parentNode.removeChild(node); };
  pbxWaitImages(node)
    .then(function () {
      return html2canvas(node, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        width: node.scrollWidth,
        height: node.scrollHeight
      });
    })
    .then(function (canvas) { cleanup(); cb(canvas); })
    .catch(function (e) {
      cleanup();
      console.error('导出渲染失败', e);
      toast('导出失败: ' + ((e && e.message) ? e.message : '渲染异常'), 'error');
      cb(null);
    });
}

function pbxDownloadPng(canvas, filename) {
  if (canvas.toBlob) {
    canvas.toBlob(function (blob) {
      if (!blob) { toast('生成图片失败', 'error'); return; }
      saveBlob(blob, filename);
      toast('图片已导出');
    }, 'image/png');
  } else {
    /* 兜底: 老浏览器走 dataURL */
    var a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    toast('图片已导出');
  }
}

function pbxDownloadPdf(canvas, filename) {
  var Ctor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!Ctor) { toast('PDF 组件未加载(jsPDF)', 'error'); return; }
  var pdf = new Ctor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  var pageW = pdf.internal.pageSize.getWidth();
  var pageH = pdf.internal.pageSize.getHeight();
  var margin = 8;
  var contentW = pageW - margin * 2;
  var scale = contentW / canvas.width;                 /* 画布 px -> mm */
  var slicePx = Math.max(1, Math.floor((pageH - margin * 2) / scale));
  var y = 0, page = 0;
  while (y < canvas.height && page < 60) {             /* 60 页上限, 防意外死循环 */
    var h = Math.min(slicePx, canvas.height - y);
    var c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = h;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (page > 0) pdf.addPage();
    pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, contentW, h * scale);
    y += h;
    page++;
  }
  pdf.save(filename);
  toast('PDF 已导出');
}

/* 对外入口: kind = 'image' | 'pdf' */
function pbExportMedia(rec, tab, kind) {
  toast(kind === 'pdf' ? '正在生成 PDF…' : '正在生成图片…');
  pbxRenderCanvas(rec, tab, function (canvas) {
    if (!canvas) return;
    if (kind === 'pdf') pbxDownloadPdf(canvas, pbxDocFilename(rec, tab, 'pdf'));
    else pbxDownloadPng(canvas, pbxDocFilename(rec, tab, 'image'));
  });
}

window.pbExportMedia = pbExportMedia;
window.pbxDocHtml = pbxDocHtml;
window.pbxDocFilename = pbxDocFilename;
window.pbxDocTitle = pbxDocTitle;
