/* ============================================================
 * 物资申购明细 (独立详情页)
 *   入口:
 *     - 物资管理列表行内的"查看明细"        →  purchase-detail.html?id=<id>
 *     - 合并批次面板的"查看明细"           →  purchase-detail.html?group=<gid>
 *     - 审批管理跳转: ?ref=<purchase_id>   (兼容旧路径)
 *
 *   单条视图: 基本信息 + 明细表格 + 审批信息 + 合计 + 通过/驳回/导出
 *   批次视图: 批次信息 + 成员申购清单(每条可点进单条详情) + 总计 + 导出整批
 * ============================================================ */

async function initPurchaseDetailPage() {
  var user = await requireLogin();
  if (!user) return;

  await bootstrapDB();

  var groupId = queryParam('group');
  if (groupId) {
    return renderGroupDetail(user, groupId);
  }

  var id = queryParam('id') || queryParam('ref');
  if (!id) {
    toast('缺少申购记录 id', 'warn');
    setTimeout(function () { history.length > 1 ? history.back() : location.href = 'purchase-mgmt.html'; }, 600);
    return;
  }

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

/* ============================================================
 * 批次详情视图: ?group=<gid>
 *   复用 initPurchaseDetailPage 已加载的 DB, 不再二次 bootstrap
 * ============================================================ */
function renderGroupDetail(user, gid) {
  var gs = loadPurchaseGroups() || [];
  var g = gs.find(function (x) { return x._id === gid; });
  if (!g) {
    renderPage({
      active: 'purchase-mgmt',
      pageHtml:
        '<nav class="breadcrumb"><a href="purchase-mgmt.html">物资管理</a><span class="sep">/</span><span>批次明细</span></nav>' +
        '<div class="page-header"><h2>批次明细</h2></div>' +
        '<div class="empty-state"><div class="empty-icon">⚠</div><h4>未找到该合并批次</h4><p>gid=' + esc(gid) + ' 可能已被解除合并</p>' +
        '<a class="btn btn-primary" href="purchase-mgmt.html">返回物资管理</a></div>'
    });
    return;
  }

  /* 批次成员 (按日期升序) */
  var members = (loadPurchases() || [])
    .filter(function (r) { return (r.merge_id || '') === gid; })
    .sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });

  var projects = loadProjects();
  function projName(id) {
    var hit = projects.find(function (p) { return p._id === id; });
    return hit ? hit.name : (id ? '未知项目' : '—');
  }
  function fmt(n) {
    return '¥ ' + (Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* 汇总 */
  var totalSum = members.reduce(function (s, r) { return s + (Number(r.total) || 0); }, 0);
  var statusBreakdown = { submitted: 0, approved: 0, rejected: 0 };
  members.forEach(function (r) { if (statusBreakdown[r.status] != null) statusBreakdown[r.status]++; });
  var projsSet = {};
  members.forEach(function (r) {
    var pn = projName(r.projectId || r.project_id);
    projsSet[pn] = (projsSet[pn] || 0) + 1;
  });
  var projsList = Object.keys(projsSet);

  /* 成员清单 (每行带状态徽章 + 项目 + 申请人 + 合计 + "查看"链接) */
  var STATUS_MAP = {
    submitted: { label: '待审批', cls: 'submitted' },
    approved:  { label: '已通过', cls: 'signed' },
    rejected:  { label: '已驳回', cls: 'rejected' },
    draft:     { label: '草稿',   cls: 'draft' }
  };
  function rowOf(r) {
    var sm = STATUS_MAP[r.status] || STATUS_MAP.submitted;
    var items = Array.isArray(r.items) ? r.items : [];
    var first = items[0] || {};
    var sub = items.length > 1
      ? (first.name || '—') + ' 等 ' + items.length + ' 项'
      : (first.name || r.name || '—');
    var reviewInfo = '';
    if (r.status === 'approved') {
      reviewInfo = '<div class="muted" style="font-size:12px;margin-top:4px">审批人:' + esc(r.approver || r.reviewed_by || '-') +
        (r.approved_at ? ' · ' + esc(r.approved_at.slice(0, 16).replace('T', ' ')) : '') + '</div>';
    } else if (r.status === 'rejected') {
      reviewInfo = '<div class="muted" style="font-size:12px;margin-top:4px;color:var(--danger)">驳回人:' + esc(r.reviewed_by || '-') +
        (r.rejected_at ? ' · ' + esc(r.rejected_at.slice(0, 16).replace('T', ' ')) : '') +
        (r.rejected_reason ? ' · 原因:' + esc(r.rejected_reason) : '') + '</div>';
    }
    return '<tr>' +
      '<td style="white-space:nowrap"><strong>' + esc(r.date || '(无日期)') + '</strong></td>' +
      '<td><span class="chip">' + esc(projName(r.projectId || r.project_id)) + '</span></td>' +
      '<td>' + esc(r.applicant || '-') + '</td>' +
      '<td style="max-width:280px">' +
        '<div style="font-size:13px">' + esc(sub) + '</div>' +
        reviewInfo +
      '</td>' +
      '<td><span class="report-status-tag report-status-' + sm.cls + '">' + sm.label + '</span></td>' +
      '<td class="col-num" style="text-align:right;color:var(--warning);font-weight:600">' + fmt(r.total) + '</td>' +
      '<td style="text-align:right"><a class="btn-ghost btn-sm" href="purchase-detail.html?id=' + encodeURIComponent(r._id) + '">查看明细</a></td>' +
      '</tr>';
  }

  /* KPI: 复用 kpi-card 样式 (与 purchase-mgmt 一致) */
  function kpiCard(num, label, color) {
    return '<div class="kpi-card" style="' + (color ? 'border-top:3px solid ' + color : '') + '">' +
      '<div class="kpi-num" style="font-size:' + (typeof num === 'string' && num.length > 6 ? '20px' : '24px') + '">' + num + '</div>' +
      '<div class="kpi-label">' + label + '</div></div>';
  }

  var canManage = (user.role === 'admin' || user.role === 'manager' || user.role === 'lead');
  var actionsHtml =
    '<button class="btn-ghost" onclick="history.length>1?history.back():location.href=\'purchase-mgmt.html\'">← 返回</button>' +
    '<button class="btn-success" data-act="export-group">导出整批 Excel</button>' +
    (canManage ? '<button class="btn-ghost" data-act="rename-group">重命名</button>' : '');

  var pageHtml =
    '<nav class="breadcrumb"><a href="purchase-mgmt.html">物资管理</a><span class="sep">/</span><span>批次明细</span></nav>' +
    '<div class="detail-header">' +
      '<div class="page-title-block">' +
        '<h2 class="page-title-text">' + esc(g.name) + '</h2>' +
        '<div class="page-title-sub">' +
          '<span class="chip" style="background:rgba(139,92,246,.15);color:#8B5CF6">合并批次</span>' +
          '<span style="margin-left:8px">' + members.length + ' 条申购</span>' +
          '<span style="margin-left:8px">' + esc(g.created_at ? g.created_at.slice(0, 16).replace('T', ' ') : '') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="detail-actions">' + actionsHtml + '</div>' +
    '</div>' +

    /* 批次基本信息 */
    '<div class="detail-section">' +
      '<h3>批次信息</h3>' +
      '<div class="pb-meta-grid">' +
        detailRow('批次名称', g.name) +
        detailRow('申购总金额', fmt(totalSum)) +
        detailRow('成员数量', members.length + ' 条') +
        detailRow('涉及项目', projsList.join('、') || '—') +
        detailRow('创建人', g.created_by || '-') +
        detailRow('创建时间', (g.created_at || '').slice(0, 16).replace('T', ' ') || '-') +
      '</div>' +
    '</div>' +

    /* KPI 小卡片 */
    '<div class="kpi-row" style="margin-bottom:16px">' +
      kpiCard(members.length, '成员数量') +
      kpiCard(statusBreakdown.submitted, '待审批', 'var(--warning)') +
      kpiCard(statusBreakdown.approved, '已通过', 'var(--success)') +
      kpiCard(statusBreakdown.rejected, '已驳回', 'var(--danger)') +
      kpiCard(fmt(totalSum), '申购总金额', '#8B5CF6') +
    '</div>' +

    /* 成员列表 */
    '<div class="detail-section">' +
      '<div class="detail-section-header">' +
        '<h3>成员申购 <span class="sec-meta">共 ' + members.length + ' 条</span></h3>' +
        '<div class="detail-actions">' +
          '<span class="muted" style="font-size:12px">点击行末"查看明细"进入单条详情页</span>' +
        '</div>' +
      '</div>' +
      (members.length
        ? '<div class="table-wrap">' +
          '<table class="data-table">' +
            '<thead><tr>' +
              '<th style="width:100px">申购日期</th>' +
              '<th style="width:160px">项目</th>' +
              '<th style="width:90px">申请人</th>' +
              '<th>主要内容</th>' +
              '<th style="width:80px">状态</th>' +
              '<th style="width:120px;text-align:right">金额</th>' +
              '<th style="width:90px;text-align:right">操作</th>' +
            '</tr></thead>' +
            '<tbody>' + members.map(rowOf).join('') + '</tbody>' +
            '<tfoot>' +
              '<tr style="background:var(--bg-elevated)">' +
                '<td colspan="5" style="text-align:right;font-weight:700">合计</td>' +
                '<td class="col-num" style="text-align:right;font-weight:700;color:var(--warning)">' + fmt(totalSum) + '</td>' +
                '<td></td>' +
              '</tr>' +
            '</tfoot>' +
          '</table>' +
        '</div>'
        : '<div class="empty-state"><h4>该批次内暂无申购记录</h4></div>') +
    '</div>';

  function detailRow(label, value) {
    return '<div class="pb-meta-item">' +
      '<span class="pb-meta-label">' + esc(label) + '</span>' +
      '<span class="pb-meta-value">' + esc(value) + '</span>' +
      '</div>';
  }

  var content = renderPage({ active: 'purchase-mgmt', pageHtml: pageHtml });

  /* 操作绑定 */
  var btnExport = content.querySelector('[data-act="export-group"]');
  if (btnExport) btnExport.onclick = function () { exportBatch(g); };

  var btnRename = content.querySelector('[data-act="rename-group"]');
  if (btnRename) btnRename.onclick = function () {
    var bodyHtml = '<div class="field-row"><label class="field-label">批次名称</label>' +
      '<input class="input pd-group-name" value="' + esc(g.name) + '" placeholder="例如: 9月上旬办公用品采购">' +
      '<div class="form-hint">重命名只影响批次显示名与导出文件名, 不改变批次内的申购记录</div></div>';
    confirmDialogEx('重命名批次', bodyHtml, function () {
      var v = ((document.querySelector('.pd-group-name') || {}).value || '').trim();
      if (!v) { toast('请输入批次名称', 'warn'); return false; }
      if (typeof updatePurchaseGroup === 'function') {
        updatePurchaseGroup(gid, { name: v });
        toast('已重命名', 'success');
        setTimeout(function () { location.reload(); }, 300);
      }
    });
    var inp = document.querySelector('.pd-group-name');
    if (inp) { inp.focus(); inp.select(); }
  };

  /* 导出整批 Excel: 合并所有成员的明细, 复用 purchase-mgmt 的格式 */
  function exportBatch(g) {
    if (!members.length) { toast('批次内暂无申购记录', 'warn'); return; }
    var projs = [], dates = [];
    members.forEach(function (r) {
      var pn = projName(r.projectId || r.project_id);
      if (projs.indexOf(pn) < 0) projs.push(pn);
      if (r.date && dates.indexOf(r.date) < 0) dates.push(r.date);
    });
    dates.sort();
    var firstDate = dates[0] || new Date().toISOString().slice(0, 10);
    var ym = (firstDate.match(/^(\d{4})-(\d{1,2})/) || []);
    var title = projs.join('、') + ' ' + (ym[1] || '') + '年' + parseInt(ym[2] || '1', 10) + '月工程用品申购单';
    var projLabel = projs.join('、');
    var dateLabel = dates.length === 1
      ? dates[0].replace(/-/g, '.')
      : (dates[0] + ' ~ ' + dates[dates.length - 1]).replace(/-/g, '.');

    var W = [36, 150, 170, 48, 56, 68, 80, 130];
    var B = 'border:1px solid #000';
    function cell(v, style) { return '<td style="' + B + ';padding:4px 6px;font-size:11px;' + (style || '') + '">' + esc(String(v == null ? '' : v)) + '</td>'; }
    function num2(n) { return (Number(n) || 0).toFixed(2); }

    var rows = '<tr>' + W.map(function (w) { return '<td style="' + B + '" width="' + w + '" height="22"></td>'; }).join('') + '</tr>';
    rows += '<tr><td colspan="8" style="font-size:18px;font-weight:bold;text-align:center;height:34px">' + esc(title) + '</td></tr>';
    rows += '<tr>' +
      '<td colspan="4" style="font-size:12px;font-weight:bold;text-align:left;height:24px">项目名称:' + esc(projLabel) + '</td>' +
      '<td colspan="4" style="font-size:12px;font-weight:bold;text-align:right">申购日期:' + esc(dateLabel) + '</td></tr>';
    var head = ['序号', '品名', '规格/型号', '单位', '数量', '单价\n(元)', '金额', '备注'];
    rows += '<tr>' + head.map(function (h) {
      return '<td style="' + B + ';font-size:12px;font-weight:bold;text-align:center;height:26px;white-space:pre">' + h + '</td>';
    }).join('') + '</tr>';

    var seq = 0, grand = 0;
    members.forEach(function (r) {
      grand += Number(r.total) || 0;
      var items = (Array.isArray(r.items) && r.items.length) ? r.items :
        [{ name: r.name || '', spec: r.spec || '', unit: r.unit || '', qty: r.qty || 0, price: 0, usage: r.reason || '' }];
      items.forEach(function (it) {
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
    });
    rows += '<tr>' +
      '<td colspan="5" style="' + B + ';background:#92D050;font-size:12px;font-weight:bold;text-align:center;height:24px">本月物资合计</td>' +
      '<td style="' + B + ';background:#92D050"></td>' +
      '<td style="' + B + ';background:#92D050;font-size:12px;font-weight:bold;text-align:center">' + esc(num2(grand)) + '</td>' +
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
    toast('已导出「' + title + '」(' + seq + ' 项, 合计 ¥' + num2(grand) + ')', 'success');
  }
}

window.initPurchaseDetailPage = initPurchaseDetailPage;
window.addEventListener('DOMContentLoaded', initPurchaseDetailPage);
if (document.readyState !== 'loading') initPurchaseDetailPage();
