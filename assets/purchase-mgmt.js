/* ============================================================
 * 物资管理 (W11) - 物资申购审批独立模块
 *   - 申购提交后的审批在这里处理, 与「审批管理」的其他表单审批分开
 *   - 数据源: purchases 表 (status: submitted/approved/rejected, 草稿不显示)
 *   - 通过/驳回: 同步更新 approvals (type=purchase) 与 purchases 两张表
 *   - 权限: admin / manager
 * ============================================================ */
async function initPurchaseMgmtPage() {
  var user = await requireLogin();
  if (!user) return;
  if (!isAdmin() && !canManage()) { toast('需要管理员或项目经理权限', 'warn'); setTimeout(function(){ location.href='dashboard.html'; }, 800); return; }

  var status = queryParam('status') || 'pending';
  var kw = queryParam('q') || '';
  var projFilter = queryParam('proj') || 'all';

  var projects = loadProjects();

  var content = renderPage({
    active: 'purchase-mgmt',
    pageHtml:
      '<nav class="breadcrumb"><a href="dashboard.html">工作台</a><span class="sep">/</span><span>物资管理</span></nav>' +
      '<div class="page-header"><div><h2>物资管理</h2>' +
      '<div class="page-sub">物资申购提交与审批统一在此处理, 与其他表单审批分开</div></div>' +
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
      '<div id="pmList" class="section" style="padding:18px"></div>'
  });

  var STATUS_MAP = {
    submitted: { label: '待审批', cls: 'submitted', color: 'var(--warning)' },
    approved:  { label: '已通过', cls: 'signed',    color: 'var(--success)' },
    rejected:  { label: '已驳回', cls: 'rejected',  color: 'var(--danger)' }
  };

  function fmt(n) { return '¥ ' + (Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function projName(id) {
    var hit = projects.filter(function (p) { return p._id === id; })[0];
    return hit ? hit.name : (id ? '未知项目' : '—');
  }

  /* 所有非草稿申购 (submitted/approved/rejected) */
  function allRecords() {
    return (loadPurchases() || []).filter(function (r) { return r.status && r.status !== 'draft'; });
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
    if (status !== 'all') {
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

  function paint() {
    paintKpi();
    var list = filtered();
    var host = document.getElementById('pmList');
    if (!host) return;
    if (list.length === 0) { renderEmpty(host, '暂无符合条件的申购记录'); return; }
    host.innerHTML = list.map(function (r) {
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
      var actions = '<a class="btn-ghost btn-sm" href="purchase.html?ref=' + encodeURIComponent(r._id) + '">查看明细</a>' +
        (r.status === 'submitted'
          ? '<button class="btn-success btn-sm" data-ok="' + esc(r._id) + '">通过</button>' +
            '<button class="btn-danger btn-sm" data-rj="' + esc(r._id) + '">驳回</button>'
          : '');
      return '<div class="list-row" style="align-items:flex-start">' +
        '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
        '<strong>' + esc(r.date || '(无日期)') + '</strong>' +
        '<span class="chip">' + esc(projName(r.projectId || r.project_id)) + '</span>' +
        '<span class="report-status-tag report-status-' + sm.cls + '">' + sm.label + '</span>' +
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

  paint();

  function updateUrl() {
    var k = document.getElementById('pmSearch').value;
    var p = document.getElementById('pmProject').value;
    var s = document.getElementById('pmStatus').value;
    location.search = '?status=' + s + '&proj=' + encodeURIComponent(p) + '&q=' + encodeURIComponent(k);
  }
  document.getElementById('pmSearch').addEventListener('change', updateUrl);
  document.getElementById('pmProject').addEventListener('change', updateUrl);
  document.getElementById('pmStatus').addEventListener('change', updateUrl);
}
window.initPurchaseMgmtPage = initPurchaseMgmtPage;
window.addEventListener('DOMContentLoaded', initPurchaseMgmtPage);
if (document.readyState !== 'loading') initPurchaseMgmtPage();
