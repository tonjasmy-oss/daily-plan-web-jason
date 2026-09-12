/* 审批管理 (W10) - 数据由 /api/approvals 管理
 * 内存缓存见 common.js 的 loadApprovals/createApproval/updateApproval
 */

async function initApprovalPage() {
  var user = await requireLogin();
  if (!user) return;
  if (!isAdmin() && !canManage()) { toast('需要管理员或项目经理权限', 'warn'); setTimeout(function(){ location.href='dashboard.html'; }, 800); return; }

  var tab = queryParam('tab') || 'user';
  var status = queryParam('status') || 'pending';
  var kw = queryParam('q') || '';

  var content = renderPage({
    active: 'approval',
    pageHtml:
      '<nav class="breadcrumb"><a href="dashboard.html">工作台</a><span class="sep">/</span><span>审批管理</span></nav>' +
      '<div class="page-header"><div><h2>审批管理</h2><div class="page-sub">处理用户审批与表单审批</div></div></div>' +
      '<div class="tabs">' +
      '<a class="tab' + (tab === 'user' ? ' active' : '') + '" href="?tab=user&status=' + esc(status) + '&q=' + encodeURIComponent(kw) + '">用户审批</a>' +
      '<a class="tab' + (tab === 'form' ? ' active' : '') + '" href="?tab=form&status=' + esc(status) + '&q=' + encodeURIComponent(kw) + '">表单审批</a></div>' +
      '<div class="filter-bar">' +
      '<input class="input search" id="aprSearch" placeholder="搜索姓名 / 项目 / 备注" value="' + esc(kw) + '">' +
      '<select class="input" id="aprStatus"><option value="all"' + (status === 'all' ? ' selected' : '') + '>全部状态</option>' +
      '<option value="pending"' + (status === 'pending' ? ' selected' : '') + '>待审批</option>' +
      '<option value="approved"' + (status === 'approved' ? ' selected' : '') + '>已通过</option>' +
      '<option value="rejected"' + (status === 'rejected' ? ' selected' : '') + '>已驳回</option></select>' +
      '</div>' +
      '<div id="aprList" class="section" style="padding:18px"></div>'
  });

  function paint() {
    var list = loadApprovals();
    if (tab === 'user') list = list.filter(function (a) { return a.type === 'user'; });
    else list = list.filter(function (a) { return a.type === 'form'; });
    if (status !== 'all') list = list.filter(function (a) { return a.status === status; });
    if (kw) {
      var k = kw.toLowerCase();
      list = list.filter(function (a) {
        return ((a.title || '') + ' ' + (a.applicant || '') + ' ' + (a.remark || '')).toLowerCase().indexOf(k) >= 0;
      });
    }
    var host = document.getElementById('aprList');
    if (list.length === 0) { renderEmpty(host, '暂无审批记录'); return; }
    host.innerHTML = list.map(function (a) {
      var statusColor = a.status === 'approved' ? 'var(--success)' : a.status === 'rejected' ? 'var(--danger)' : 'var(--warning)';
      var statusLabel = { pending: '待审批', approved: '已通过', rejected: '已驳回' }[a.status];
      return '<div class="list-row" style="align-items:flex-start">' +
        '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
        '<strong>' + esc(a.title || a.formType || '申请') + '</strong>' +
        '<span class="chip" style="background:' + statusColor + '22;color:' + statusColor + '">' + statusLabel + '</span></div>' +
        '<div class="muted" style="font-size:13px;margin-top:6px">申请人:' + esc(a.applicant || '-') + ' · 提交时间:' + esc((a.created_at || '').slice(0, 16)) + '</div>' +
        (a.remark ? '<div style="font-size:13px;margin-top:6px;color:var(--text-secondary)">' + esc(a.remark) + '</div>' : '') +
        '</div>' +
        (a.status === 'pending' ?
          '<div style="display:flex;gap:8px;flex-shrink:0">' +
          '<button class="btn-success" data-ok="' + a._id + '">通过</button>' +
          '<button class="btn-danger" data-rj="' + a._id + '">驳回</button></div>'
          : '<span class="muted">' + (a.decidedAt || '').slice(0, 16) + '</span>') +
        '</div>';
    }).join('');
    host.querySelectorAll('[data-ok]').forEach(function (b) {
      b.addEventListener('click', function () {
        decide(this.dataset.ok, 'approved', null);
      });
    });
    host.querySelectorAll('[data-rj]').forEach(function (b) {
      b.addEventListener('click', function () {
        var that = this;
        promptDialog('驳回原因', '请输入驳回理由', '',
          [{ label: '取消', value: '' }, { label: '确定驳回', value: 'rj', primary: true }],
          function (v, t) {
            if (v === 'rj') decide(that.dataset.rj, 'rejected', t);
          });
      });
    });
  }

  function decide(id, to, note) {
    var patch = {
      status: to,
      approver: user.name || '',
      decided_at: new Date().toISOString(),
    };
    if (note) patch.reason = note;
    updateApproval(id, patch);  /* 走 /api/approvals/:id */
    toast(to === 'approved' ? '已通过' : '已驳回', 'success');
    setTimeout(paint, 200);
  }

  /* 首次启动:加入示例审批(可选) - 仅在内存缓存为空时创建 */
  if (loadApprovals().length === 0) {
    createApproval({ type: 'user', title: '新增人员 - 陈工', applicant: '张工', status: 'pending', payload: {}, reason: '电工,需补全入队手续' });
    createApproval({ type: 'form', title: '日常日报 2026-09-10', applicant: '李师傅', status: 'pending', payload: {}, reason: '3 层模板支撑完成 60%,申请验收' });
    createApproval({ type: 'form', title: '周计划 第 37 周', applicant: '张工', status: 'approved', payload: {}, decided_at: new Date(Date.now() - 80000e3).toISOString() });
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
