/* ============================================================
 * 物资管理 (W11) - 物资申购审批独立模块
 *   - 申购提交后的审批在这里处理, 与「审批管理」的其他表单审批分开
 *   - 数据源: purchases 表 (status: submitted/approved/rejected, 草稿不显示)
 *   - 通过/驳回: 同步更新 approvals (type=purchase) 与 purchases 两张表
 *   - 合并批次: 勾选多条申购合并为一个批次, 可重命名/导出 Excel;
 *     批次与「已合并」标记仅对有操作权限的人员 (admin/manager) 显示
 *   - 权限: admin / manager
 * ============================================================ */
async function initPurchaseMgmtPage() {
  var user = await requireLogin();
  if (!user) return;
  if (!requireModule('m_purchase_mgmt')) return;
  if (!isAdmin() && !canManage()) { toast('需要管理员或工程主管权限', 'warn'); setTimeout(function(){ location.href='dashboard.html'; }, 800); return; }

  var status = queryParam('status') || 'pending';
  var kw = queryParam('q') || '';
  var projFilter = queryParam('proj') || 'all';
  var groupFilter = queryParam('group') || '';
  var selected = {};

  var projects = loadProjects();

  var content = renderPage({
    active: 'purchase-mgmt',
    pageHtml:
      '<nav class="breadcrumb"><a href="dashboard.html">工作台</a><span class="sep">/</span><span>物资管理</span></nav>' +
      '<div class="page-header"><div><h2>物资管理</h2>' +
      '<div class="page-sub">物资申购提交与审批统一在此处理, 支持多单合并批次 / 重命名 / 导出 Excel</div></div>' +
      '<a class="btn-ghost" href="purchase.html">＋ 去填报申购</a></div>' +

      '<div id="pmKpi"></div>' +

      '<div class="filter-bar">' +
      '<input class="input search" id="pmSearch" placeholder="搜索申请人 / 明细 / 备注" value="' + esc(kw) + '">' +
      '<select class="input" id="pmProject"><option value="all">全部项目</option>' +
      projects.map(function (p) {
        return '<option value="' + esc(p._id) + '"' + (projFilter === p._id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
      }).join('') +
      '</select>' +
      '<select class="input" id="pmStatus"><option value="all"' + (status === 'all' ? ' selected' : '') + '>全部状态</option>' +
      '<option value="pending"' + (status === 'pending' ? ' selected' : '') + '>待审批</option>' +
      '<option value="approved"' + (status === 'approved' ? ' selected' : '') + '>已通过</option>' +
      '<option value="rejected"' + (status === 'rejected' ? ' selected' : '') + '>已驳回</option></select>' +
      '</div>' +
      '<div id="pmGroups"></div>' +
      '<div id="pmList" class="section" style="padding:18px"></div>'
  });

  var STATUS_MAP = {
    submitted: { label: '待审批', cls: 'submitted', color: 'var(--warning)' },
    approved:  { label: '已通过', cls: 'signed',    color: 'var(--success)' },
    rejected:  { label: '已驳回', cls: 'rejected',  color: 'var(--danger)' }
  };
  var MERGE_COLOR = '#8B5CF6';

  function fmt(n) { return '¥ ' + (Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function projName(id) {
    var hit = projects.filter(function (p) { return p._id === id; })[0];
    return hit ? hit.name : (id ? '未知项目' : '—');
  }

  /* 所有非草稿申购 (submitted/approved/rejected) */
  function allRecords() {
    return (loadPurchases() || []).filter(function (r) { return r.status && r.status !== 'draft'; });
  }
  function groups() { return loadPurchaseGroups() || []; }
  function groupById(gid) { return groups().find(function (g) { return g._id === gid; }) || null; }
  function recordsInGroup(gid) {
    return allRecords().filter(function (r) { return (r.merge_id || '') === gid; })
      .sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
  }
  function selIds() { return Object.keys(selected).filter(function (k) { return selected[k]; }); }
  function buildUrl(withGroup) {
    var s = '?status=' + status + '&proj=' + encodeURIComponent(projFilter) + '&q=' + encodeURIComponent(kw);
    if (withGroup && groupFilter) s += '&group=' + encodeURIComponent(groupFilter);
    return s;
  }

  function paintKpi() {
    var list = allRecords();
    var pending = list.filter(function (r) { return r.status === 'submitted'; });
    var approved = list.filter(function (r) { return r.status === 'approved'; });
    var rejected = list.filter(function (r) { return r.status === 'rejected'; });
    var totalSum = list.reduce(function (s, r) { return s + (Number(r.total) || 0); }, 0);
    var host = document.getElementById('pmKpi');
    if (!host) return;
    host.innerHTML = '<div class="kpi-row">' +
      '<div class="kpi-card kpi-orange"><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div class="kpi-num">' + pending.length + '</div><div class="kpi-label">待审批</div></div>' +
      '<div class="kpi-card kpi-green"><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><div class="kpi-num">' + approved.length + '</div><div class="kpi-label">已通过</div></div>' +
      '<div class="kpi-card kpi-blue"><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg></div><div class="kpi-num">' + rejected.length + '</div><div class="kpi-label">已驳回</div></div>' +
      '<div class="kpi-card kpi-purple"><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.5 12h11L21 8H7"/><circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/></svg></div><div class="kpi-num" style="font-size:22px">' + fmt(totalSum) + '</div><div class="kpi-label">申购总金额</div></div>' +
      '</div>';
  }

  function filtered() {
    var list = allRecords();
    if (groupFilter) {
      /* 批次查看模式: 只看该批次成员 (不受状态筛选影响) */
      list = list.filter(function (r) { return (r.merge_id || '') === groupFilter; });
    } else if (status !== 'all') {
      var st = status === 'pending' ? 'submitted' : status;
      list = list.filter(function (r) { return r.status === st; });
    }
    if (projFilter !== 'all') list = list.filter(function (r) { return (r.projectId || r.project_id || '') === projFilter; });
    if (kw) {
      var k = kw.toLowerCase();
      list = list.filter(function (r) {
        var hay = [r.applicant, r.name, r.reason, (r.items || []).map(function (i) { return i.name; }).join(' '),
          projName(r.projectId || r.project_id)].join(' ').toLowerCase();
        return hay.indexOf(k) >= 0;
      });
    }
    /* 待审批在前, 同状态按创建时间倒序 */
    var order = { submitted: 0, rejected: 1, approved: 2 };
    list.sort(function (a, b) {
      var oa = order[a.status] != null ? order[a.status] : 9;
      var ob = order[b.status] != null ? order[b.status] : 9;
      if (oa !== ob) return oa - ob;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
    return list;
  }

  /* ---------- 合并批次面板 ---------- */
  function paintGroups() {
    var host = document.getElementById('pmGroups');
    if (!host) return;
    var gs = groups();
    if (!gs.length) { host.innerHTML = ''; return; }
    host.innerHTML = '<div style="margin:18px 0 10px;display:flex;align-items:center;justify-content:space-between">' +
      '<div class="page-sub" style="margin:0"><strong style="color:' + MERGE_COLOR + '">合并批次 (' + gs.length + ')</strong> · 已合并的申购归入批次, 支持重命名与导出 Excel; 批次仅管理端可见</div></div>' +
      gs.map(function (g) {
        var members = recordsInGroup(g._id);
        var sum = members.reduce(function (s, r) { return s + (Number(r.total) || 0); }, 0);
        var isCur = groupFilter === g._id;
        return '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 14px;border:1px solid #DDD6FE;border-left:4px solid ' + MERGE_COLOR + ';border-radius:10px;background:rgba(139,92,246,.06);margin-bottom:10px">' +
          '<div style="flex:1;min-width:220px">' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><strong style="font-size:14px">' + esc(g.name) + '</strong>' +
          '<span class="chip" style="background:rgba(139,92,246,.15);color:' + MERGE_COLOR + '">' + members.length + ' 条申购</span>' +
          '<strong style="color:var(--warning)">' + fmt(sum) + '</strong>' +
          (isCur ? '<span class="chip" style="background:var(--warning);color:#fff">当前查看</span>' : '') + '</div>' +
          '<div class="muted" style="font-size:12px;margin-top:4px">创建人:' + esc(g.created_by || '-') +
          (g.created_at ? ' · ' + esc(g.created_at.slice(0, 16).replace('T', ' ')) : '') + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="btn-success btn-sm" data-act="exp" data-id="' + esc(g._id) + '">导出 Excel</button>' +
          '<button class="btn-ghost btn-sm" data-act="ren" data-id="' + esc(g._id) + '">重命名</button>' +
          '<button class="btn-ghost btn-sm" data-act="view" data-id="' + esc(g._id) + '">' + (isCur ? '退出查看' : '查看明细') + '</button>' +
          '<button class="btn-danger btn-sm" data-act="unmerge" data-id="' + esc(g._id) + '">解除合并</button>' +
          '</div></div>';
      }).join('');
  }

  function buildSelBarInner() {
    var n = selIds().length;
    return (groupFilter ? '<span class="chip" style="background:var(--warning);color:#fff">批次查看中</span>' : '') +
      '<strong style="font-size:13px">已选 ' + n + ' 条</strong>' +
      (n >= 2 ? '<button class="btn-success btn-sm" data-selact="merge">' + (groupFilter ? '并入当前批次' : '合并为新批次') + '</button>' : '') +
      (n > 0 ? '<button class="btn-ghost btn-sm" data-selact="clear">取消选择</button>' :
        '<span class="muted" style="font-size:12px">勾选两条及以上申购, 可合并为一个批次 (合并后可重命名、导出 Excel, 并有明显标记)</span>');
  }

  function paintSelBar() {
    var el = document.getElementById('pmSelBar');
    if (el) el.innerHTML = buildSelBarInner();
  }

  /* ---------- 合并 / 重命名 / 解除 ---------- */
  function mergeSelected() {
    var ids = selIds();
    if (ids.length < 2) { toast('至少勾选 2 条申购记录', 'warn'); return; }
    if (groupFilter) {
      var g = groupById(groupFilter);
      if (!g) { toast('批次不存在', 'warn'); return; }
      ids.forEach(function (id) { updatePurchase(id, { merge_id: groupFilter }); });
      toast('已将 ' + ids.length + ' 条申购并入「' + g.name + '」', 'success');
    } else {
      var ng = createPurchaseGroup({
        name: '合并批次 ' + new Date().toISOString().slice(0, 10),
        created_by: user.name || ''
      });
      ids.forEach(function (id) { updatePurchase(id, { merge_id: ng._id }); });
      toast('已合并 ' + ids.length + ' 条申购为「' + ng.name + '」', 'success');
    }
    selected = {};
    setTimeout(paint, 300);
  }

  function renameGroup(gid) {
    var g = groupById(gid);
    if (!g) { toast('批次不存在', 'warn'); return; }
    var bodyHtml =
      '<div class="field-row"><label class="field-label">批次名称</label>' +
      '<input class="input pm-group-name" value="' + esc(g.name) + '" placeholder="例如: 9月上旬办公用品采购">' +
      '<div class="form-hint">重命名只影响批次显示名与导出文件名, 不改变批次内的申购记录</div></div>';
    confirmDialogEx('重命名批次', bodyHtml, function () {
      var v = (document.querySelector('.pm-group-name') || {}).value || '';
      if (!v.trim()) { toast('请输入批次名称', 'warn'); return false; }
      updatePurchaseGroup(gid, { name: v.trim() });
      toast('已重命名', 'success');
      setTimeout(paint, 300);
    });
    var inp = document.querySelector('.pm-group-name');
    if (inp) { inp.focus(); inp.select(); }
  }

  function unmergeGroup(gid) {
    var g = groupById(gid);
    if (!g) { toast('批次不存在', 'warn'); return; }
    var members = recordsInGroup(gid);
    var bodyHtml = '<div>将解除「<strong>' + esc(g.name) + '</strong>」批次, 其中 ' + members.length +
      ' 条申购恢复为未合并状态, 可重新勾选合并。是否继续?</div>';
    confirmDialogEx('解除合并', bodyHtml, function () {
      members.forEach(function (r) { updatePurchase(r._id, { merge_id: '' }); });
      deletePurchaseGroup(gid);
      toast('已解除合并', 'success');
      if (groupFilter === gid) groupFilter = '';
      selected = {};
      setTimeout(paint, 400);
    });
  }

  /* ---------- 导出 Excel (.xls, 可直接用 Excel/WPS 打开) ---------- */
  function downloadXls(filename, tableHtml) {
    var blob = new Blob(['\ufeff' + tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* 导出格式参照实物申购单样例:
   * 标题「项目名 YYYY年M月 工程用品申购单」居中大字 → 第二行 项目名称/申购日期 →
   * 明细列: 序号 品名 规格/型号 单位 数量 单价(元) 金额 备注 → 绿色「本月物资合计」行 */
  function exportGroup(gid) {
    var g = groupById(gid);
    if (!g) { toast('批次不存在', 'warn'); return; }
    var members = recordsInGroup(gid);
    if (!members.length) { toast('批次内暂无申购记录', 'warn'); return; }
    members = members.slice().sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });

    /* 标题要素: 项目名 (多项目用顿号连接) + 年月 */
    var projs = [], dates = [];
    members.forEach(function (r) {
      var pn = projName(r.projectId || r.project_id);
      if (projs.indexOf(pn) < 0) projs.push(pn);
      if (r.date && dates.indexOf(r.date) < 0) dates.push(r.date);
    });
    dates.sort();
    var firstDate = dates[0] || todayStr();
    var ym = (firstDate.match(/^(\d{4})-(\d{1,2})/) || []);
    var title = projs.join('、') + ' ' + (ym[1] || '') + '年' + parseInt(ym[2] || '1', 10) + '月工程用品申购单';
    var projLabel = projs.join('、');
    var dateLabel = dates.length === 1
      ? dates[0].replace(/-/g, '.')
      : (dates[0] + ' ~ ' + dates[dates.length - 1]).replace(/-/g, '.');

    /* 列宽 (px) */
    var W = [36, 150, 170, 48, 56, 68, 80, 130];
    var B = 'border:1px solid #000';
    function cell(v, style) { return '<td style="' + B + ';padding:4px 6px;font-size:11px;' + (style || '') + '">' + esc(String(v == null ? '' : v)) + '</td>'; }
    function num2(n) { return (Number(n) || 0).toFixed(2); }

    var rows = '<tr>' + W.map(function (w) { return '<td style="' + B + '" width="' + w + '" height="22"></td>'; }).join('') + '</tr>';
    /* 标题 + 项目/日期行 */
    rows += '<tr><td colspan="8" style="font-size:18px;font-weight:bold;text-align:center;height:34px">' + esc(title) + '</td></tr>';
    rows += '<tr>' +
      '<td colspan="4" style="font-size:12px;font-weight:bold;text-align:left;height:24px">项目名称：' + esc(projLabel) + '</td>' +
      '<td colspan="4" style="font-size:12px;font-weight:bold;text-align:right">申购日期：' + esc(dateLabel) + '</td></tr>';
    /* 表头 */
    var head = ['序号', '品名', '规格/型号', '单位', '数量', '单价\n(元)', '金额', '备注'];
    rows += '<tr>' + head.map(function (h) {
      return '<td style="' + B + ';font-size:12px;font-weight:bold;text-align:center;height:26px;white-space:pre">' + h + '</td>';
    }).join('') + '</tr>';

    /* 明细: 每笔申购的 items 逐行铺开, 备注取用途说明 */
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
    /* 绿色合计行 */
    rows += '<tr>' +
      '<td colspan="5" style="' + B + ';background:#92D050;font-size:12px;font-weight:bold;text-align:center;height:24px">本月物资合计</td>' +
      '<td style="' + B + ';background:#92D050"></td>' +
      '<td style="' + B + ';background:#92D050;font-size:12px;font-weight:bold;text-align:center">' + esc(num2(grand)) + '</td>' +
      '<td style="' + B + ';background:#92D050"></td>' +
      '</tr>';

    var html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>' +
      '<table style="border-collapse:collapse">' + rows + '</table></body></html>';
    downloadXls(title + '.xls', html);
    toast('已导出「' + title + '」(' + seq + ' 项, 合计 ¥' + num2(grand) + ')', 'success');
  }

  /* 页内切换批次查看, 不做页面跳转 (避免打断在途的防抖同步请求) */
  function toggleGroupView(gid) {
    groupFilter = (groupFilter === gid) ? '' : gid;
    selected = {};
    paint();
  }

  function paint() {
    paintKpi();
    paintGroups();
    var list = filtered();
    var host = document.getElementById('pmList');
    if (!host) return;
    if (list.length === 0) {
      host.innerHTML = '<div id="pmSelBar" style="display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">' + buildSelBarInner() + '</div>' +
        '<div class="empty-state" style="margin-top:14px"><h4>' + (groupFilter ? '该批次内暂无申购记录' : '暂无符合条件的申购记录') + '</h4></div>';
      return;
    }
    host.innerHTML = '<div id="pmSelBar" style="display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">' + buildSelBarInner() + '</div>' +
      list.map(function (r) {
        var sm = STATUS_MAP[r.status] || STATUS_MAP.submitted;
        var items = Array.isArray(r.items) ? r.items : [];
        var first = items[0] || {};
        var sub = items.length > 1
          ? (first.name || '—') + ' 等 ' + items.length + ' 项'
          : (first.name || r.name || '—');
        var reviewInfo = '';
        if (r.status === 'approved') {
          reviewInfo = '<div class="muted" style="font-size:12px;margin-top:6px">审批人:' + esc(r.approver || r.reviewed_by || '-') +
            (r.approved_at ? ' · ' + esc(r.approved_at.slice(0, 16)) : '') + '</div>';
        } else if (r.status === 'rejected') {
          reviewInfo = '<div class="muted" style="font-size:12px;margin-top:6px">驳回人:' + esc(r.reviewed_by || '-') +
            (r.rejected_at ? ' · ' + esc(r.rejected_at.slice(0, 16)) : '') +
            (r.rejected_reason ? ' · 原因:' + esc(r.rejected_reason) : '') + '</div>';
        }
        /* 合并标记: 紫色徽章 + 左侧紫条, 仅管理端本页可见 */
        var gname = '';
        if (r.merge_id) {
          var gg = groupById(r.merge_id);
          gname = gg ? gg.name : '已合并';
        }
        var mergeBadge = r.merge_id
          ? '<span class="chip" style="background:rgba(139,92,246,.15);color:' + MERGE_COLOR + '">已合并 · ' + esc(gname) + '</span>'
          : '';
        var actions = '<a class="btn-ghost btn-sm" href="purchase-detail.html?id=' + encodeURIComponent(r._id) + '">查看明细</a>' +
          (r.status === 'submitted'
            ? '<button class="btn-success btn-sm" data-ok="' + esc(r._id) + '">通过</button>' +
              '<button class="btn-danger btn-sm" data-rj="' + esc(r._id) + '">驳回</button>'
            : '');
        return '<div class="list-row" style="align-items:flex-start;' + (r.merge_id ? 'border-left:3px solid ' + MERGE_COLOR + ';background:rgba(139,92,246,.04)' : '') + '">' +
          '<label style="display:flex;align-items:center;flex-shrink:0;margin-right:2px;cursor:pointer">' +
          '<input type="checkbox" data-sel="' + esc(r._id) + '"' + (selected[r._id] ? ' checked' : '') + '></label>' +
          '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
          '<strong>' + esc(r.date || '(无日期)') + '</strong>' +
          '<span class="chip">' + esc(projName(r.projectId || r.project_id)) + '</span>' +
          '<span class="report-status-tag report-status-' + sm.cls + '">' + sm.label + '</span>' +
          mergeBadge +
          '<strong style="color:var(--warning)">' + fmt(r.total) + '</strong></div>' +
          '<div class="muted" style="font-size:13px;margin-top:6px">申请人:' + esc(r.applicant || '-') + ' · ' + esc(sub) +
          (r.reason ? ' · 备注:' + esc(r.reason) : '') + '</div>' +
          reviewInfo +
          '</div>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-shrink:0">' + actions + '</div>' +
          '</div>';
      }).join('');

    host.querySelectorAll('[data-ok]').forEach(function (b) {
      b.addEventListener('click', function () { decide(this.dataset.ok, 'approved', null); });
    });
    host.querySelectorAll('[data-rj]').forEach(function (b) {
      b.addEventListener('click', function () {
        var that = this;
        var bodyHtml =
          '<div class="field-row"><label class="field-label">驳回原因 <span class="required">*</span></label>' +
          '<textarea class="input pm-reject-reason" rows="3" placeholder="请说明驳回原因, 填报人可据此修改后重新提交"></textarea>' +
          '<div class="form-hint">驳回后该申购转入「已驳回」, 填报人可在物资申购页继续编辑后重新提交</div></div>';
        confirmDialogEx('驳回申购', bodyHtml, function () {
          var txt = (document.querySelector('.pm-reject-reason') || {}).value || '';
          if (!txt.trim()) { toast('请填写驳回原因', 'warn'); return false; }
          decide(that.dataset.rj, 'rejected', txt.trim());
        });
      });
    });
  }

  /* 事件委托: 列表容器只绑一次, 行内容重绘不受影响 */
  (function bindDelegates() {
    var host = document.getElementById('pmList');
    if (host && !host._bound) {
      host._bound = true;
      host.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-selact]') : null;
        if (!b) return;
        if (b.dataset.selact === 'merge') mergeSelected();
        else { selected = {}; paint(); }
      });
      host.addEventListener('change', function (e) {
        if (e.target && e.target.dataset && e.target.dataset.sel) {
          selected[e.target.dataset.sel] = e.target.checked;
          paintSelBar();
        }
      });
    }
    var gHost = document.getElementById('pmGroups');
    if (gHost && !gHost._bound) {
      gHost._bound = true;
      gHost.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-act]') : null;
        if (!b) return;
        var act = b.dataset.act, id = b.dataset.id;
        if (act === 'exp') exportGroup(id);
        else if (act === 'ren') renameGroup(id);
        else if (act === 'view') toggleGroupView(id);
        else if (act === 'unmerge') unmergeGroup(id);
      });
    }
  })();

  paint();

  /* 通过/驳回: 同步 approvals (type=purchase) 与 purchases */
  function decide(id, to, note) {
    var rec = (loadPurchases() || []).find(function (r) { return r._id === id; });
    if (!rec) { toast('申购记录不存在', 'warn'); return; }
    var now = new Date().toISOString();
    /* 1. 更新审批记录 (存在才更) */
    var apv = (loadApprovals() || []).find(function (a) { return a.type === 'purchase' && a.ref_id === id && a.status === 'pending'; });
    if (apv && typeof updateApproval === 'function') {
      var apvPatch = { status: to, approver: user.name || '', decided_at: now };
      if (note) apvPatch.reason = note;
      try { updateApproval(apv._id, apvPatch); } catch (e) { console.warn('sync approval failed', e); }
    }
    /* 2. 写回 purchases */
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
    try { updatePurchase(id, buyPatch); } catch (e) { console.warn('writeback purchase failed', e); }
    toast(to === 'approved' ? '已审批通过' : '已驳回', 'success');
    setTimeout(paint, 200);
  }

  function updateUrl() {
    var k = document.getElementById('pmSearch').value;
    var p = document.getElementById('pmProject').value;
    var s = document.getElementById('pmStatus').value;
    var url = '?status=' + s + '&proj=' + encodeURIComponent(p) + '&q=' + encodeURIComponent(k);
    if (groupFilter) url += '&group=' + encodeURIComponent(groupFilter);
    location.search = url;
  }
  document.getElementById('pmSearch').addEventListener('change', updateUrl);
  document.getElementById('pmProject').addEventListener('change', updateUrl);
  document.getElementById('pmStatus').addEventListener('change', updateUrl);
}
window.initPurchaseMgmtPage = initPurchaseMgmtPage;
window.addEventListener('DOMContentLoaded', initPurchaseMgmtPage);
if (document.readyState !== 'loading') initPurchaseMgmtPage();
