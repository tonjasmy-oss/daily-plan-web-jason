/* ============================================================
 * 审批管理 — 集中处理所有待审批事项
 *
 * 两个页签:
 *   表单审批 (tab=form)  —— 日计划 / 周计划 / 计划周报 (真实业务数据)
 *                          数据源: DB.dailyPlans / DB.weeklyPlans / DB.weeklyReports
 *                          提交后 status='pending' 即进入本页; 通过/驳回就地写回原记录
 *                          通过前可「追加工作内容」(与报表浏览同一套逻辑, 见 plan-shared.js)
 *   用户审批 (tab=user)  —— approvals 表 type='user' 的记录
 *
 * 与报表浏览的分工:
 *   本页 = 待办收件箱 (所有状态都可查, 默认只看待审批)
 *   报表浏览 = 成果查看 (未通过的记录只有本人和审批人能看到)
 *
 * 依赖: common.js / layout.js / plan-shared.js
 * ============================================================ */

/* 表单审批包含的计划类型 (与 plan-shared.js 的 PB_PLAN_TABS 一致) */
function aprPlanItems() {
  var out = [];
  PB_PLAN_TABS.forEach(function (t) {
    (pbList(t) || []).forEach(function (rec) { out.push({ rec: rec, tab: t }); });
  });
  /* 待审批置顶, 其余按提交时间倒序 */
  out.sort(function (a, b) {
    var ap = a.rec.status === 'pending' ? 0 : 1;
    var bp = b.rec.status === 'pending' ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return String(pbSubmittedAt(b.rec)).localeCompare(String(pbSubmittedAt(a.rec)));
  });
  return out;
}
function aprPendingPlanCount() {
  return aprPlanItems().filter(function (it) { return it.rec.status === 'pending'; }).length;
}
function aprPendingUserCount() {
  return (loadApprovals() || []).filter(function (a) {
    return a.type === 'user' && a.status === 'pending';
  }).length;
}

async function initApprovalPage() {
  var user = await requireLogin();
  if (!user) return;
  if (!requireModule('m_approval')) return;
  if (!isAdmin() && !canManage()) { toast('需要管理员或工程主管权限', 'warn'); setTimeout(function(){ location.href='dashboard.html'; }, 800); return; }

  var tab = queryParam('tab') || 'form';
  if (tab !== 'user' && tab !== 'form') tab = 'form';
  /* 默认「全部状态」—— 待审批置顶, 已通过/已驳回也在同一列表里可查 */
  var status = queryParam('status') || 'all';
  var kw = queryParam('q') || '';

  renderPage({
    active: 'approval',
    pageHtml:
      '<nav class="breadcrumb"><a href="dashboard.html">工作台</a><span class="sep">/</span><span>审批管理</span></nav>' +
      '<div class="page-header"><div><h2>审批管理</h2>' +
        '<div class="page-sub">待审批的日计划 / 周计划 / 计划周报集中在此处理；通过后才会在「报表浏览」公开展示</div></div></div>' +
      '<div class="tabs" id="aprTabs">' +
      aprTabHtml('form', '表单审批', aprPendingPlanCount(), tab, status, kw) +
      aprTabHtml('user', '用户审批', aprPendingUserCount(), tab, status, kw) +
      '</div>' +
      '<div class="filter-bar">' +
      '<input class="input search" id="aprSearch" placeholder="搜索提交人 / 周期 / 摘要" value="' + esc(kw) + '">' +
      '<select class="input" id="aprStatus"><option value="all"' + (status === 'all' ? ' selected' : '') + '>全部状态</option>' +
      '<option value="pending"' + (status === 'pending' ? ' selected' : '') + '>待审批</option>' +
      '<option value="approved"' + (status === 'approved' ? ' selected' : '') + '>已通过</option>' +
      '<option value="rejected"' + (status === 'rejected' ? ' selected' : '') + '>已驳回</option></select>' +
      '</div>' +
      '<div id="aprList" class="section" style="padding:18px"></div>'
  });

  function aprTabHtml(id, label, badge, cur, st, k) {
    return '<a class="tab' + (id === cur ? ' active' : '') +
      '" href="?tab=' + id + '&status=' + esc(st) + '&q=' + encodeURIComponent(k) + '">' +
      esc(label) + (badge ? '<span class="tab-count">' + badge + '</span>' : '') + '</a>';
  }

  /* ---------- 表单审批: 计划类待办 ---------- */
  /* 过滤逻辑收口在这一处, 列表渲染与行点击取下标都调它, 保证下标一致 */
  function formFiltered() {
    var list = aprPlanItems();
    if (status !== 'all') list = list.filter(function (it) { return (it.rec.status || 'draft') === status; });
    if (kw) {
      var k = kw.toLowerCase();
      list = list.filter(function (it) {
        var r = it.rec;
        var hay = [pbTitle(r, it.tab), pbSubmitter(r), r.remarks, r.summary, r.content,
                   PB_TAB_LABEL[it.tab]].join(' ');
        return hay.toLowerCase().indexOf(k) >= 0;
      });
    }
    return list;
  }
  function formListHtml(list) {
    if (!list.length) return '';
    return list.map(function (it, i) {
      var r = it.rec, t = it.tab;
      return '<div class="list-row" style="align-items:flex-start">' +
        '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
        '<span class="chip">' + esc(PB_TAB_LABEL[t] || t) + '</span>' +
        '<strong>' + esc(pbTitle(r, t)) + '</strong>' +
        pbRowTag(r, t) +
        '</div>' +
        '<div class="muted" style="font-size:13px;margin-top:6px">' +
        '提交人：' + esc(pbSubmitter(r) || '-') +
        ' · 提交时间：' + esc(pbSubmittedAt(r) || '-') +
        ' · ' + esc(pbSub(r, t)) +
        '</div>' +
        (r.status === 'rejected' && r.rejected_reason
          ? '<div style="font-size:13px;margin-top:6px;color:var(--danger)">驳回原因：' + esc(r.rejected_reason) + '</div>'
          : '') +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-shrink:0">' +
        (r.status === 'pending'
          ? '<button class="btn btn-primary" data-plan-open="' + i + '">审批</button>'
          : '<button class="btn btn-default" data-plan-open="' + i + '">查看</button>') +
        '</div>' +
        '</div>';
    }).join('');
  }

  /* ---------- 用户审批: approvals 表 ---------- */
  function userListHtml() {
    var list = (loadApprovals() || []).filter(function (a) { return a.type === 'user'; });
    if (status !== 'all') list = list.filter(function (a) { return a.status === status; });
    if (kw) {
      var k = kw.toLowerCase();
      list = list.filter(function (a) {
        return ((a.title || '') + ' ' + (a.applicant || '') + ' ' + (a.reason || '')).toLowerCase().indexOf(k) >= 0;
      });
    }
    if (!list.length) return '';

    return list.map(function (a) {
      var statusColor = a.status === 'approved' ? 'var(--success)' : a.status === 'rejected' ? 'var(--danger)' : 'var(--warning)';
      var statusLabel = { pending: '待审批', approved: '已通过', rejected: '已驳回' }[a.status] || a.status;
      return '<div class="list-row" style="align-items:flex-start">' +
        '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
        '<span class="chip">用户审批</span>' +
        '<strong>' + esc(a.title || '申请') + '</strong>' +
        '<span class="chip" style="background:' + statusColor + '22;color:' + statusColor + '">' + statusLabel + '</span></div>' +
        '<div class="muted" style="font-size:13px;margin-top:6px">申请人：' + esc(a.applicant || '-') + ' · 提交时间：' + esc((a.created_at || '').slice(0, 16)) + '</div>' +
        (a.reason ? '<div style="font-size:13px;margin-top:6px;color:var(--text-secondary)">' + esc(a.reason) + '</div>' : '') +
        (a.status === 'rejected' && a.reason && a.decided_at
          ? '<div style="font-size:13px;margin-top:6px;color:var(--danger)">处理意见：' + esc(a.reason) + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-shrink:0">' +
        (a.status === 'pending' ?
          '<button class="btn-success" data-ok="' + a._id + '">通过</button>' +
          '<button class="btn-danger" data-rj="' + a._id + '">驳回</button>'
          : '<span class="muted">' + (a.decided_at || '').slice(0, 16) + '</span>') +
        '</div>' +
        '</div>';
    }).join('');
  }

  function paint() {
    var host = document.getElementById('aprList');
    if (!host) return;
    /* 待办数字实时反映在页签上 */
    var tabWrap = document.getElementById('aprTabs');
    if (tabWrap) {
      tabWrap.innerHTML = aprTabHtml('form', '表单审批', aprPendingPlanCount(), tab, status, kw) +
                          aprTabHtml('user', '用户审批', aprPendingUserCount(), tab, status, kw);
    }
    var html = (tab === 'form') ? formListHtml(formFiltered()) : userListHtml();
    if (!html) {
      renderEmpty(host, tab === 'form'
        ? (status === 'pending' ? '没有待审批的计划，全部处理完了' : '暂无符合条件的计划记录')
        : '暂无审批记录');
      return;
    }
    host.innerHTML = html;
    bindFormRows();
    bindUserRows();
  }

  /* 表单审批: 点「审批 / 查看」打开与报表浏览完全一致的详情弹层
   *   - 待审批 → 弹层内出现「追加工作内容 + 通过 + 驳回」操作区
   *   - 其它状态 → 只读查看
   * 通过/驳回后关闭弹层并就地刷新列表 (覆写 window.pbAfterDecide) */
  function bindFormRows() {
    var host = document.getElementById('aprList');
    host.querySelectorAll('[data-plan-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var it = formFiltered()[parseInt(this.dataset.planOpen, 10)];
        if (!it) return;
        window.pbRefreshList = paint;
        window.pbAfterDecide = function () { pbCloseDetail(); paint(); };
        pbOpenDetail(it.rec, it.tab, { noExport: true, keepUrl: true });
      });
    });
  }

  function bindUserRows() {
    var host = document.getElementById('aprList');
    host.querySelectorAll('[data-ok]').forEach(function (b) {
      b.addEventListener('click', function () {
        decide(this.dataset.ok, 'approved', null);
      });
    });
    host.querySelectorAll('[data-rj]').forEach(function (b) {
      b.addEventListener('click', function () {
        var that = this;
        /* 弹一个内联「驳回原因」输入框 + 两个按钮 (取消/确定驳回)
         * 不用通用 promptDialog (签名/用法不匹配), 自己拼 confirmDialogEx */
        var bodyHtml =
          '<div class="field-row"><label class="field-label">驳回原因 <span class="required">*</span></label>' +
          '<textarea class="input apr-reject-reason" rows="3" placeholder="请说明驳回原因"></textarea>' +
          '<div class="form-hint">驳回后申请人可修改后重新提交</div></div>';
        confirmDialogEx('驳回申请', bodyHtml, function () {
          var txt = (document.querySelector('.apr-reject-reason') || {}).value || '';
          if (!txt.trim()) { toast('请填写驳回原因', 'warn'); return false; }
          decide(that.dataset.rj, 'rejected', txt.trim());
        });
      });
    });
  }

  /* 用户审批: 通过/驳回 (物资申购已独立到「物资管理」模块, 不在此处理) */
  function decide(id, to, note) {
    var rec = (loadApprovals() || []).find(function (a) { return a._id === id; });
    if (!rec) { toast('审批记录不存在', 'warn'); return; }
    var patch = { status: to, approver: user.name || '', decided_at: new Date().toISOString() };
    if (note) patch.reason = note;
    updateApproval(id, patch);
    toast(to === 'approved' ? '已审批通过' : '已驳回', 'success');
    setTimeout(paint, 200);
  }

  paint();

  function updateUrl() {
    var k = document.getElementById('aprSearch').value;
    var s = document.getElementById('aprStatus').value;
    location.search = '?tab=' + tab + '&status=' + s + '&q=' + encodeURIComponent(k);
  }
  document.getElementById('aprSearch').addEventListener('change', updateUrl);
  document.getElementById('aprStatus').addEventListener('change', updateUrl);
}
window.initApprovalPage = initApprovalPage;
window.addEventListener('DOMContentLoaded', initApprovalPage);
if (document.readyState !== 'loading') initApprovalPage();
