/* ============================================================
 * 关于我们 (W15) - Blurple 渐变 Hero + Logo + 应用信息列表
 * ============================================================ */
async function initAboutPage() {
  var user = await requireLogin();
  if (!user) return;
  var s = loadSettings();

  var content = renderPage({
    active: 'about',
    pageHtml:
      '<nav class="breadcrumb"><a href="dashboard.html">工作台</a><span class="sep">/</span><a href="settings.html">系统设置</a><span class="sep">/</span><span>关于我们</span></nav>' +
      '<div class="about-hero">' +
        '<div class="about-logo">' + ICONS.brand + '</div>' +
        '<div>' +
          '<h2>' + esc(s.appName || '工程管理系统') + '</h2>' +
          '<p>专为建筑工程团队设计的一体化移动 + Web 工作平台</p>' +
        '</div>' +
      '</div>' +
      '<div class="layout-2col">' +
        '<div class="section"><h3>应用信息</h3><div class="about-list">' +
          infoRow('应用名称', s.appName || '-') +
          infoRow('当前版本', s.version || '-') +
          infoRow('开发公司', s.company || '-') +
          infoRow('联系电话', s.phone || '-') +
          infoRow('联系邮箱', s.email || '-') +
          infoRow('最大用户数', (s.maxUsers || '-') + ' 人') +
          infoRow('上线时间', '2025-01-01') +
          infoRow('最近更新', '2026-09-11') +
        '</div></div>' +
        '<div class="section"><h3>核心特性</h3><div class="about-list">' +
          infoRow('日 / 周 / 月计划填报', '全员覆盖') +
          infoRow('日常日报与签名', '4 状态流转') +
          infoRow('物资申购审批流', '财务透明') +
          infoRow('项目 / 任务看板', '实时同步') +
          infoRow('角色权限体系', '9 项细粒度') +
          infoRow('数据备份 / 恢复', 'JSON 一键导出') +
        '</div></div>' +
      '</div>' +
      '<div class="section"><h3>产品介绍</h3>' +
        '<p style="line-height:1.85;color:var(--text-secondary)">' +
          '本系统服务于建筑工程团队的日常管理工作,从项目立项、任务分派、现场填报到审批归档,提供端到端的数字化工作流。' +
          '支持 PC / 移动多端访问,数据本地 SQLite 存储,零运维成本,适合中小型工程公司快速上手使用。' +
        '</p></div>' +
      '<div class="section" style="text-align:center;padding:32px">' +
        '<h3 style="margin-bottom:12px">需要帮助?</h3>' +
        '<p class="muted" style="margin-bottom:20px">如有使用问题或改进建议,欢迎联系我们</p>' +
        '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">' +
          '<button class="btn-primary" id="abContact">联系我们</button>' +
          '<button class="btn-ghost" id="abUpdateLog">查看更新日志</button>' +
        '</div>' +
      '</div>'
  });

  function infoRow(label, value) {
    return '<div class="about-list-item"><span class="label">' + esc(label) + '</span><span class="value">' + esc(value) + '</span></div>';
  }

  document.getElementById('abContact').addEventListener('click', function () {
    toast('客服电话:' + (s.phone || '010-12345678'), 'info');
  });
  document.getElementById('abUpdateLog').addEventListener('click', function () {
    alert(
      'v5.0 (2026-09-11)\n' +
      '- 新增 W2/W5/W6/W7/W8/W10/W12/W13/W14/W15 等 10 个核心页面\n' +
      '- 深色 Blurple 设计系统重制\n' +
      '- 顶栏 + 侧栏三栏布局\n' +
      '- 完善角色权限体系(9 项细粒度)\n' +
      '- 物资申购审批流程\n' +
      '\nv4.0 (2026-06-01)\n' +
      '- 数据库版后端(SQLite)\n' +
      '- 多用户登录与会话管理\n' +
      '\nv3.0 (2025-12-01)\n' +
      '- 完善日报 / 审批流\n'
    );
  });
}
window.initAboutPage = initAboutPage;
window.addEventListener('DOMContentLoaded', initAboutPage);
if (document.readyState !== 'loading') initAboutPage();
