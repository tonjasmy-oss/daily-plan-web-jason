/* ============================================================
 * 报表浏览 — 日计划 / 周计划 / 计划月报 / 计划周报 / 日常日报
 *
 * 职责: 只负责「列表渲染 + 页面初始化 + 地址栏状态」。
 *       详情渲染、审批动作、导出全部在 plan-shared.js (两个页面共用)。
 *
 * 可见性规则 (见 plan-shared.js 的 pbCanSee):
 *   - 审批人 (admin/lead)          → 全部状态可见
 *   - 已通过 (日/周计划 approved, 日常日报 signed) → 全员可见
 *   - 未通过 (草稿/待审批/已驳回)  → 仅填报人本人可见
 *   即: 只有通过审批的记录才会公开显示; 自己提交的未通过记录自己仍能看到。
 *
 * 交互:
 *   - 列表行点「查看」→ 在当前页打开详情弹层(不跳转)
 *   - 同时把记录 id 写入地址栏 (?tab=x&id=y), 可直接分享 / 刷新还原
 *   - Esc / 点空白 / 「关闭」按钮关闭弹层, 浏览器后退键同样有效
 *
 * 依赖: common.js / layout.js / plan-shared.js
 *       + 导出组件 (xlsx.full.min.js / export-excel.js /
 *         html2canvas.min.js / jspdf.umd.min.js / export-media.js)
 * ============================================================ */

async function initPlanBrowsePage() {
  var user = await requireLogin();
  if (!user) return;
  if (!requireModule('m_browse')) return;
  var tab = queryParam('tab') || 'daily';
  var validTab = PB_TABS.filter(function (t) { return t.id === tab; }).length > 0;
  if (!validTab) tab = 'daily';

  renderPage({
    active: 'browse',
    pageHtml:
      '<nav class="breadcrumb"><a href="dashboard.html">工作台</a><span class="sep">/</span><span>报表浏览</span></nav>' +
      '<div class="page-header"><div><h2>报表浏览</h2>' +
        '<div class="page-sub">' + (canApprovePlan(user)
          ? '查看全部填报记录（含待审批 / 已驳回），点击右侧「查看」展开详情，可追加工作内容并审批，已通过的记录可导出 Excel / 图片 / PDF'
          : '查看已通过审批的日计划 / 周计划 / 计划周报 / 日常日报，以及本人提交的全部记录；点击右侧「查看」展开详情，已通过的记录可导出 Excel / 图片 / PDF') +
        '</div></div></div>' +
      '<div class="tabs" id="pbTabs">' + pbTabsHtml(tab) + '</div>' +
      '<div id="pbList"></div>'
  });

  var host = document.getElementById('pbList');
  var tabsHost = document.getElementById('pbTabs');

  function paintTabs() {
    if (tabsHost) tabsHost.innerHTML = pbTabsHtml(tab);
  }
  function pbTabsHtml(activeTab) {
    return PB_TABS.map(function (t) {
      var n = pbVisibleList(t.id, user).length;
      return '<a class="tab' + (t.id === activeTab ? ' active' : '') + '" href="?tab=' + t.id + '">' +
        esc(t.label) + (n ? '<span class="tab-count">' + n + '</span>' : '') + '</a>';
    }).join('');
  }

  function paintList() {
    var list = pbVisibleList(tab, user);
    if (!list.length) {
      renderEmpty(host, PB_EMPTY_TEXT[tab] || '暂无数据');
      paintTabs();
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
        var rec = pbVisibleList(tab, user)[parseInt(this.dataset.i, 10)];
        if (!rec) return;
        try { history.pushState({ pbId: rec._id }, '', pbRowHref(rec, tab)); } catch (_) { /* ignore */ }
        pbOpenDetail(rec, tab);
      });
    });
    paintTabs();
  }
  /* 供详情弹层里的审批操作回调, 就地刷新背后的列表 */
  window.pbRefreshList = paintList;
  paintList();

  /* 直接用带 id 的链接进来 → 自动弹出对应详情 */
  var urlId = queryParam('id');
  if (urlId) {
    var hit = pbVisibleList(tab, user).filter(function (r) { return String(r._id) === String(urlId); })[0];
    if (hit) pbOpenDetail(hit, tab, { keepUrl: true });
    else toast('未找到该条记录', 'warn');
  }

  /* 浏览器前进/后退: 有 id 就弹, 没 id 就关 */
  window.addEventListener('popstate', function () {
    var id = queryParam('id');
    if (!id) { pbCloseDetail(); return; }
    var r = pbVisibleList(tab, user).filter(function (x) { return String(x._id) === String(id); })[0];
    if (r) pbOpenDetail(r, tab, { keepUrl: true });
  });
}
window.initPlanBrowsePage = initPlanBrowsePage;
window.addEventListener('DOMContentLoaded', initPlanBrowsePage);
if (document.readyState !== 'loading') initPlanBrowsePage();
