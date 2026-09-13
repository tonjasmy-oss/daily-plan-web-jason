/* ============================================================
 * 日报记录页（移植自小程序 pages/history/history.js，v5 全功能）
 * 分页加载 / 关键词搜索 / 状态筛选 / 查看 / 删除
 * ============================================================ */

var REPORT_PAGE_SIZE = 10;

async function initReportsPage() {
  var user = await requireLogin();
  if (!user) return;
  if (!requireModule('m_reports')) return;
  var content = renderPage({
    active: 'reports',
    pageHtml:
      '<div class="page-header-row">' +
        '<h2 class="page-title-text">日报记录</h2>' +
        '<div class="page-actions">' +
          '<button class="btn btn-primary" id="btnNew">+ 新建日报</button>' +
        '</div>' +
      '</div>' +
      '<div class="report-filter-tabs" id="statusTabs"></div>' +
      '<div class="filter-bar">' +
        '<input type="search" class="input page-search" id="searchInput" placeholder="搜索备注 / 工作内容">' +
        '<button class="btn btn-default" id="btnSearch">搜索</button>' +
      '</div>' +
      '<div class="report-list" id="reportList"><div class="detail-loading">加载中...</div></div>' +
      '<div class="report-load-more" id="loadMoreWrap"></div>'
  });

  var state = { page: 1, status: 'all', keyword: '', total: 0, records: [], loading: false, hasMore: true };

  function statusTabsHtml() {
    var tabs = [
      { k: 'all', label: '全部' },
      { k: 'draft', label: '📝 草稿' },
      { k: 'submitted', label: '📤 已提交' },
      { k: 'signed', label: '✅ 已签名' },
      { k: 'rejected', label: '❌ 已驳回' }
    ];
    return tabs.map(function (t) {
      return '<button class="report-tab' + (state.status === t.k ? ' active' : '') + '" data-status="' + t.k + '">' + t.label + '</button>';
    }).join('');
  }

  function fetchPage(page, reset) {
    state.loading = true;
    var qs = '?page=' + page + '&pageSize=' + REPORT_PAGE_SIZE +
      '&status=' + encodeURIComponent(state.status) +
      '&q=' + encodeURIComponent(state.keyword || '');
    return fetch('/api/reports' + qs, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        state.total = res.total || 0;
        state.page = res.page || page;
        state.records = reset ? (res.items || []) : state.records.concat(res.items || []);
        state.hasMore = state.records.length < state.total;
        state.loading = false;
        renderList();
      })
      .catch(function () {
        state.loading = false;
        toast('加载失败', 'error');
      });
  }

  function renderCard(r) {
    var tasks = r.tasks || [];
    var preview = tasks.slice(0, 2).map(function (t) { return esc(t.content); }).filter(Boolean).join('；');
    var st = r.status;
    var timeMeta = r.signed_at ? '签名于 ' + formatRelative(r.signed_at)
      : r.rejected_at ? '驳回于 ' + formatRelative(r.rejected_at)
      : r.submitted_at ? '提交于 ' + formatRelative(r.submitted_at)
      : '创建于 ' + formatRelative(r.created_at);
    return '<div class="report-card" data-id="' + esc(r._id) + '">' +
      '<div class="report-card-top">' +
        '<span class="report-card-date">📅 ' + esc(r.date || '-') + '</span>' +
        '<span class="report-status-tag report-status-' + esc(st) + '">' + (REPORT_STATUS_TEXT[st] || st) + '</span>' +
      '</div>' +
      (preview ? '<div class="report-card-preview">' + preview + (tasks.length > 2 ? ' 等 ' + tasks.length + ' 项' : '') + '</div>' : '<div class="report-card-preview muted">无任务记录</div>') +
      (r.remarks ? '<div class="report-card-remarks">💬 ' + esc(r.remarks.slice(0, 60)) + (r.remarks.length > 60 ? '…' : '') + '</div>' : '') +
      '<div class="report-card-meta">' +
        '<span class="muted">' + esc(timeMeta) + '</span>' +
        '<span class="report-card-actions">' +
          '<button class="btn-link" data-act="view">查看</button>' +
          '<button class="btn-link danger" data-act="delete">删除</button>' +
        '</span>' +
      '</div>' +
    '</div>';
  }

  function renderList() {
    var list = document.getElementById('reportList');
    document.getElementById('statusTabs').innerHTML = statusTabsHtml();
    if (state.records.length === 0 && !state.loading) {
      list.innerHTML = '<div class="empty-state">暂无记录，点击右上角"新建日报"开始</div>';
    } else {
      list.innerHTML = state.records.map(renderCard).join('');
    }
    var more = document.getElementById('loadMoreWrap');
    if (state.hasMore && !state.loading) {
      more.innerHTML = '<button class="btn btn-default" id="btnMore">加载更多（' + state.records.length + '/' + state.total + '）</button>';
      document.getElementById('btnMore').onclick = function () { fetchPage(state.page + 1, false); };
    } else {
      more.innerHTML = (state.records.length > 0 ? '<div class="muted" style="text-align:center;">共 ' + state.total + ' 条</div>' : '');
    }
  }

  /* ---------- 事件 ---------- */
  document.getElementById('statusTabs').addEventListener('click', function (e) {
    var tab = e.target.closest('.report-tab');
    if (!tab) return;
    state.status = tab.dataset.status;
    fetchPage(1, true);
  });

  document.getElementById('btnSearch').onclick = function () {
    state.keyword = document.getElementById('searchInput').value.trim();
    fetchPage(1, true);
  };
  document.getElementById('searchInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('btnSearch').click();
  });

  document.getElementById('btnNew').onclick = function () {
    location.href = 'report.html';
  };

  document.getElementById('reportList').addEventListener('click', function (e) {
    var act = e.target.closest('[data-act]');
    var card = e.target.closest('.report-card');
    if (!card) return;
    var id = card.dataset.id;
    var rec = state.records.find(function (r) { return r._id === id; });
    if (act && act.dataset.act === 'delete' && rec) {
      confirmDialog('确认删除', '删除后无法恢复，确定要删除 ' + (rec.date || '该记录') + ' 的日报吗？', function () {
        fetch('/api/reports/' + encodeURIComponent(id), { method: 'DELETE', credentials: 'same-origin' })
          .then(function () {
            toast('删除成功');
            fetchPage(1, true);
          });
      });
      return;
    }
    if (act && act.dataset.act !== 'view') return;
    location.href = 'report.html?id=' + encodeURIComponent(id);
  });

  fetchPage(1, true);
}
window.initReportsPage = initReportsPage;
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initReportsPage);
} else {
  initReportsPage();
}
