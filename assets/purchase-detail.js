/* ============================================================
 * 物资申购明细 (独立详情页)
 *   入口:
 *     - 物资管理列表行内的"查看明细"
 *     - 合并批次面板的"查看明细"
 *     - 审批管理跳转: ?ref=<purchase_id>(兼容旧路径)
 *   URL: purchase-detail.html?id=<purchase_id>
 *
 *   只读视图 (不再走 purchase.html 的编辑表单), 展示完整
 *   基本信息 + 明细表格 + 审批信息 + 合计 + 返回操作。
 * ============================================================ */

async function initPurchaseDetailPage() {
  var user = await requireLogin();
  if (!user) return;

  var id = queryParam('id') || queryParam('ref');
  if (!id) {
    toast('缺少申购记录 id', 'warn');
    setTimeout(function () { history.length > 1 ? history.back() : location.href = 'purchase-mgmt.html'; }, 600);
    return;
  }

  await bootstrapDB();
  var rec = (loadPurchases() || []).find(function (r) { return r._id === id; });
  if (!rec) {
    renderPage({
      active: 'purchase-mgmt',
      pageHtml:
        '<nav class="breadcrumb"><a href="purchase-mgmt.html">物资管理</a><span class="sep">/</span><span>明细</span></nav>' +
        '<div class="page-header"><h2>申购明细</h2></div>' +
        '<div class="empty-state"><div class="empty-icon">⚠</div><h4>未找到该申购记录</h4><p>id=' + esc(id) + ' 可能已被删除</p>' +
        '<a class="btn btn-primary" href="purchase-mgmt.html">返回物资管理</a></div>'
    });
    return;
  }

  var projects = loadProjects();
  var projName = (function () {
    var ps = projects || [];
    var hit = ps.find(function (p) { return p._id === (rec.projectId || rec.project_id); });
    return hit ? hit.name : '—';
  })();

  /* 状态映射 (与 purchase-mgmt / approval 一致) */
  var STATUS_MAP = {
    draft:     { label: '草稿',       cls: 'draft' },
    submitted: { label: '待审批',     cls: 'submitted' },
    approved:  { label: '已通过',     cls: 'signed' },
    rejected:  { label: '已驳回',     cls: 'rejected' }
  };
  var sm = STATUS_MAP[rec.status] || STATUS_MAP.submitted;

  /* 合并批次名 */
  var mergeName = '';
  if (rec.merge_id) {
    var gs = loadPurchaseGroups() || [];
    var g = gs.find(function (x) { return x._id === rec.merge_id; });
    mergeName = g ? g.name : '已合并';
  }

  /* 明细: 优先 items[]; 兼容老格式 (顶层 name/spec/unit/qty) */
  var items = [];
  if (Array.isArray(rec.items) && rec.items.length) {
    items = rec.items;
  } else {
    items = [{ name: rec.name || '', spec: rec.spec || '', unit: rec.unit || '',
               qty: rec.qty || 0, price: 0, usage: rec.reason || '' }];
  }
  var seq = 0;
  var rows = items.map(function (it) {
    seq++;
    var q = Number(it.qty) || 0, p = Number(it.price) || 0;
    return '<tr>' +
      '<td class="col-num" style="text-align:center">' + seq + '</td>' +
      '<td>' + esc(it.name || '') + '</td>' +
      '<td>' + esc(it.spec || '') + '</td>' +
      '<td style="text-align:center">' + esc(it.unit || '') + '</td>' +
      '<td class="col-num" style="text-align:right">' + q.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '</td>' +
      '<td class="col-num" style="text-align:right">' + p.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '</td>' +
      '<td class="col-num" style="text-align:right">' + (q * p).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '</td>' +
      '<td>' + esc(it.usage || '') + '</td>' +
      '</tr>';
  }).join('');

  /* 审批信息块 */
  var reviewHtml = '';
  if (rec.status === 'approved') {
    reviewHtml =
      '<div class="detail-meta">' +
        '<span>审批人</span><b>' + esc(rec.approver || rec.reviewed_by || '-') + '</b>' +
        '<span>·</span>' +
        '<span>通过时间</span><b>' + esc((rec.approved_at || '').slice(0, 16).replace('T', ' ')) + '</b>' +
      '</div>';
  } else if (rec.status === 'rejected') {
    reviewHtml =
      '<div class="detail-meta" style="color:var(--danger)">' +
        '<span>驳回人</span><b>' + esc(rec.reviewed_by || '-') + '</b>' +
        '<span>·</span>' +
        '<span>驳回时间</span><b>' + esc((rec.rejected_at || '').slice(0, 16).replace('T', ' ')) + '</b>' +
      '</div>' +
      (rec.rejected_reason
        ? '<div class="detail-desc" style="margin-top:10px;color:var(--danger)"><b>驳回原因:</b>' + esc(rec.rejected_reason) + '</div>'
        : '');
  } else if (rec.status === 'submitted') {
    reviewHtml = '<div class="detail-meta"><span>已提交</span><b>等待管理员/主管审批</b></div>';
  }

  /* 操作按钮 */
  var canManage = (user.role === 'admin' || user.role === 'manager' || user.role === 'lead');
  var actionsHtml = '<button class="btn-ghost" onclick="history.length>1?history.back():location.href=\'purchase-mgmt.html\'">← 返回</button>';
  if (rec.status === 'submitted' && canManage) {
    actionsHtml += '<button class="btn-success" data-act="approve">通过</button>' +
                   '<button class="btn-danger" data-act="reject">驳回</button>';
  }

  /* 行内 helper: 基本信息卡片的一行 */
  function row(label, value) {
    return '<div class="pb-meta-item">' +
      '<span class="pb-meta-label">' + esc(label) + '</span>' +
      '<span class="pb-meta-value">' + esc(value) + '</span>' +
      '</div>';
  }

  function fmt(n) {
    return '¥ ' + (Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* 组合整页 */
  var pageHtml =
    '<nav class="breadcrumb"><a href="purchase-mgmt.html">物资管理</a><span class="sep">/</span><span>申购明细</span></nav>' +
    '<div class="detail-header">' +
      '<div class="page-title-block">' +
        '<h2 class="page-title-text">申购明细</h2>' +
        '<div class="page-title-sub">' +
          '<span class="report-status-tag report-status-' + sm.cls + '">' + sm.label + '</span>' +
          '<span style="margin-left:8px">' + esc(rec.date || '(无日期)') + '</span>' +
          (mergeName ? '<span class="chip" style="margin-left:8px;background:rgba(139,92,246,.15);color:#8B5CF6">已合并 · ' + esc(mergeName) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="detail-actions">' + actionsHtml + '</div>' +
    '</div>' +

    '<div class="detail-section">' +
      '<h3>基本信息</h3>' +
      '<div class="pb-meta-grid">' +
        row('申购日期', rec.date || '-') +
        row('关联项目', projName) +
        row('申请人', rec.applicant || '-') +
        row('备注说明', rec.reason || '—') +
        row('提交时间', (rec.created_at || '').slice(0, 16).replace('T', ' ') || '-') +
        row('记录 ID', rec._id) +
      '</div>' +
      (reviewHtml ? '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--divider)">' + reviewHtml + '</div>' : '') +
    '</div>' +

    '<div class="detail-section">' +
      '<div class="detail-section-header">' +
        '<h3>申购明细 <span class="sec-meta">共 ' + items.length + ' 项</span></h3>' +
        '<div class="detail-actions">' +
          '<button class="btn-ghost btn-sm" data-act="export-row">导出此单 Excel</button>' +
        '</div>' +
      '</div>' +
      '<div class="table-wrap">' +
        '<table class="data-table">' +
          '<thead><tr>' +
            '<th style="width:48px;text-align:center">序号</th>' +
            '<th>品名</th>' +
            '<th>规格/型号</th>' +
            '<th style="width:60px;text-align:center">单位</th>' +
            '<th style="width:80px;text-align:right">数量</th>' +
            '<th style="width:90px;text-align:right">单价(元)</th>' +
            '<th style="width:100px;text-align:right">金额</th>' +
            '<th>备注/用途</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
          '<tfoot>' +
            '<tr style="background:var(--bg-elevated)">' +
              '<td colspan="6" style="text-align:right;font-weight:700">合计</td>' +
              '<td class="col-num" style="text-align:right;font-weight:700;color:var(--warning)">' +
                esc(fmt(rec.total)) +
              '</td>' +
              '<td></td>' +
            '</tr>' +
          '</tfoot>' +
        '</table>' +
      '</div>' +
    '</div>';

  var content = renderPage({ active: 'purchase-mgmt', pageHtml: pageHtml });

  var actApprove = content.querySelector('[data-act="approve"]');
  if (actApprove) actApprove.onclick = function () {
    confirmDialog('通过申购', '确定要通过这条申购记录吗?', function () { doDecide('approved', null); });
  };
  var actReject = content.querySelector('[data-act="reject"]');
  if (actReject) actReject.onclick = function () {
    var body = '<div class="field-row"><label class="field-label">驳回原因 <span class="required">*</span></label>' +
      '<textarea class="input pd-reject-reason" rows="3" placeholder="请说明驳回原因, 填报人可据此修改后重新提交"></textarea></div>';
    confirmDialogEx('驳回申购', body, function () {
      var txt = ((document.querySelector('.pd-reject-reason') || {}).value || '').trim();
      if (!txt) { toast('请填写驳回原因', 'warn'); return false; }
      doDecide('rejected', txt);
    });
  };
  var actExport = content.querySelector('[data-act="export-row"]');
  if (actExport) actExport.onclick = function () { exportSingle(rec); };

  function doDecide(to, note) {
    var now = new Date().toISOString();
    if (typeof DB !== 'undefined' && DB.approvals) {
      var apv = DB.approvals.find(function (a) { return a.type === 'purchase' && a.ref_id === rec._id && a.status === 'pending'; });
      if (apv && typeof updateApproval === 'function') {
        var patch = { status: to, approver: user.name || '', decided_at: now };
        if (note) patch.reason = note;
        try { updateApproval(apv._id, patch); } catch (e) { console.warn('sync approval failed', e); }
      }
    }
    var buyPatch = { status: to, reviewed_by: user.name || '' };
    if (to === 'approved') {
      buyPatch.approver = user.name || '';
      buyPatch.approved_at = now;
      buyPatch.rejected_at = '';
      buyPatch.rejected_reason = '';
    } else {
      buyPatch.rejected_at = now;
      buyPatch.rejected_reason = note || '审批驳回';
      buyPatch.approver = '';
      buyPatch.approved_at = '';
    }
    if (typeof updatePurchase === 'function') {
      try { updatePurchase(rec._id, buyPatch); } catch (e) { console.warn('writeback failed', e); }
    }
    toast(to === 'approved' ? '已审批通过' : '已驳回', 'success');
    setTimeout(function () { location.reload(); }, 500);
  }

  function exportSingle(r) {
    var W = [36, 150, 170, 48, 56, 68, 80, 130];
    var B = 'border:1px solid #000';
    function cell(v, style) { return '<td style="' + B + ';padding:4px 6px;font-size:11px;' + (style || '') + '">' + esc(String(v == null ? '' : v)) + '</td>'; }
    function num2(n) { return (Number(n) || 0).toFixed(2); }

    var single = (Array.isArray(r.items) && r.items.length) ? r.items :
      [{ name: r.name || '', spec: r.spec || '', unit: r.unit || '', qty: r.qty || 0, price: 0, usage: r.reason || '' }];
    var ym = (r.date || '').match(/^(\d{4})-(\d{1,2})/) || [];
    var title = projName + ' ' + (ym[1] || '') + '年' + parseInt(ym[2] || '1', 10) + '月工程用品申购单';
    var dateLabel = (r.date || '').replace(/-/g, '.') || '-';

    var rows = '<tr>' + W.map(function (w) { return '<td style="' + B + '" width="' + w + '" height="22"></td>'; }).join('') + '</tr>';
    rows += '<tr><td colspan="8" style="font-size:18px;font-weight:bold;text-align:center;height:34px">' + esc(title) + '</td></tr>';
    rows += '<tr>' +
      '<td colspan="4" style="font-size:12px;font-weight:bold;text-align:left;height:24px">项目名称:' + esc(projName) + '</td>' +
      '<td colspan="4" style="font-size:12px;font-weight:bold;text-align:right">申购日期:' + esc(dateLabel) + '</td></tr>';
    var head = ['序号', '品名', '规格/型号', '单位', '数量', '单价\n(元)', '金额', '备注'];
    rows += '<tr>' + head.map(function (h) {
      return '<td style="' + B + ';font-size:12px;font-weight:bold;text-align:center;height:26px;white-space:pre">' + h + '</td>';
    }).join('') + '</tr>';

    var seq = 0;
    single.forEach(function (it) {
      seq++;
      var q = Number(it.qty) || 0, p = Number(it.price) || 0;
      rows += '<tr>' +
        cell(seq, 'text-align:center') +
        cell(it.name || '', 'text-align:center') +
        cell(it.spec || '', 'text-align:center') +
        cell(it.unit || '', 'text-align:center') +
        cell(q, 'text-align:center') +
        cell(num2(p), 'text-align:center') +
        cell(num2(q * p), 'text-align:center') +
        cell(it.usage || '', 'text-align:center') +
        '</tr>';
    });
    rows += '<tr>' +
      '<td colspan="5" style="' + B + ';background:#92D050;font-size:12px;font-weight:bold;text-align:center;height:24px">本月物资合计</td>' +
      '<td style="' + B + ';background:#92D050"></td>' +
      '<td style="' + B + ';background:#92D050;font-size:12px;font-weight:bold;text-align:center">' + esc(num2(r.total || 0)) + '</td>' +
      '<td style="' + B + ';background:#92D050"></td>' +
      '</tr>';

    var html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>' +
      '<table style="border-collapse:collapse">' + rows + '</table></body></html>';
    var blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = title + '.xls';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('已导出「' + title + '」', 'success');
  }
}

window.initPurchaseDetailPage = initPurchaseDetailPage;
window.addEventListener('DOMContentLoaded', initPurchaseDetailPage);
if (document.readyState !== 'loading') initPurchaseDetailPage();
