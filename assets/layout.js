/* ============================================================
 * 布局:Top Nav + Sidebar + Main 容器外壳（深色 Blurple 主题）
 * 配合新的 styles.css 使用
 * ============================================================ */

/* 内置 SVG icons (currentColor) */
var ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5" stroke="currentColor" stroke-width="2"/><rect x="14" y="3" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="2"/><rect x="14" y="12" width="7" height="9" rx="1.5" stroke="currentColor" stroke-width="2"/><rect x="3" y="16" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="2"/></svg>',
  projects:  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 7l9-4 9 4M5 8v10a1 1 0 0 0 .5.87l6.5 3.25 6.5-3.25A1 1 0 0 0 19 18V8" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 5.5v11M15 5.5v11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  tasks:     '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  report:    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 4h12l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 12h8M8 16h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  reports:   '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M7 11h10M7 14h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  members:   '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="9" cy="8" r="3.5" stroke="currentColor" stroke-width="2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="9" r="2.5" stroke="currentColor" stroke-width="2"/><path d="M15 14c2.5 0 5 1.7 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  me:        '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  search:    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  bell:      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 3a6 6 0 0 0-6 6v3.5L4 16h16l-2-3.5V9a6 6 0 0 0-6-6Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  menu:      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  logout:    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  brand:     '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V9.5Z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>',
  back:      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  dailyPlan: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 15l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  weeklyPlan:'<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4M9 14h2v2H9zM13 14h2v2h-2z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  weeklyRpt: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 4h12l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 12h8M8 16h6M9 7h6M14 7v4l3-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  browse:    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 9h18M7 14h4M7 17h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="14" r="1.5" fill="currentColor"/></svg>',
  purchase:  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 4h2l2.5 12h11L21 8H7" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="9" cy="20" r="1.5" fill="currentColor"/><circle cx="17" cy="20" r="1.5" fill="currentColor"/><path d="M11 11h6M11 14h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  approval:  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 8h8M8 12h8M9 16l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  dept:      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 21h18M5 21V8l7-5 7 5v13" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 21v-6h6v6M9 11h.01M15 11h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  role:      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M19 5l1.5 1.5L22 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  settings:  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.4 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8L4.2 7.2A2 2 0 1 1 7 4.4l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 19.6 7l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  about:     '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 8h.01M11 12h1v5h1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
};

var NAV_ITEMS = [
  { id: 'dashboard',  label: '仪表盘',     icon: 'dashboard',  href: 'dashboard.html',  roles: null,                  group: '工作台' },
  { id: 'daily-plan', label: '日计划填报', icon: 'dailyPlan',  href: 'daily-plan.html', roles: null,                  group: '填报' },
  { id: 'weekly-plan',label: '周计划填报', icon: 'weeklyPlan', href: 'weekly-plan.html',roles: null,                  group: '填报' },
  { id: 'report',     label: '日报表填报', icon: 'report',     href: 'report.html',     roles: null,                  group: '填报' },
  { id: 'weekly-rpt', label: '计划周报',   icon: 'weeklyRpt',  href: 'weekly-report.html', roles: null,                group: '填报' },
  { id: 'browse',     label: '计划浏览',   icon: 'browse',     href: 'plan-browse.html',roles: null,                  group: '填报' },
  { id: 'purchase',   label: '物资申购',   icon: 'purchase',   href: 'purchase.html',   roles: null,                  group: '填报' },
  { id: 'reports',    label: '历史记录',   icon: 'reports',    href: 'reports.html',    roles: null,                  group: '管理' },
  { id: 'approval',   label: '审批管理',   icon: 'approval',   href: 'approval.html',   roles: ['admin','manager'],   group: '管理' },
  { id: 'tasks',      label: '任务看板',   icon: 'tasks',      href: 'tasks.html',      roles: null,                  group: '管理' },
  { id: 'projects',   label: '项目管理',   icon: 'projects',   href: 'projects.html',   roles: null,                  group: '管理' },
  { id: 'members',    label: '人员管理',   icon: 'members',    href: 'members.html',    roles: ['admin','manager'],   group: '系统设置' },
  { id: 'departments',label: '部门管理',   icon: 'dept',       href: 'departments.html',roles: ['admin'],             group: '系统设置' },
  { id: 'roles',      label: '用户角色',   icon: 'role',       href: 'roles.html',      roles: ['admin'],             group: '系统设置' },
  { id: 'settings',   label: '系统参数',   icon: 'settings',   href: 'settings.html',   roles: ['admin'],             group: '系统设置' },
  { id: 'about',      label: '关于我们',   icon: 'about',      href: 'about.html',      roles: null,                  group: '系统设置' },
  { id: 'me',         label: '个人中心',   icon: 'me',         href: 'me.html',         roles: null,                  group: '系统设置' }
];

/* ===== Top Nav HTML ===== */
function renderTopBar(user) {
  return '<header class="topbar">' +
    '<button class="hamburger" id="hamburger" aria-label="菜单">' + ICONS.menu + '</button>' +
    '<a class="topbar-brand" href="dashboard.html">' +
      '<span class="topbar-brand-logo">' + ICONS.brand + '</span>' +
      '<span class="topbar-brand-text">' +
        '<b>工程管理系统</b>' +
        '<small>ENGINEERING OPS SUITE</small>' +
      '</span>' +
    '</a>' +
    '<div class="topbar-search">' +
      '<span class="topbar-search-icon">' + ICONS.search + '</span>' +
      '<input type="search" placeholder="搜索项目、任务、人员…" />' +
    '</div>' +
    '<div class="topbar-actions">' +
      '<button class="topbar-icon-btn" id="btnBell" aria-label="通知" title="通知">' +
        ICONS.bell + '<span class="topbar-icon-dot"></span>' +
      '</button>' +
      '<div class="topbar-user" id="btnUserMenu" role="button" tabindex="0" title="切换身份">' +
        '<span class="topbar-avatar">' + esc((user.name || '?').charAt(0)) + '</span>' +
        '<span class="topbar-user-name">' +
          '<b>' + esc(user.name) + '</b> <small>· ' + esc(ROLE_TEXT[user.role] || '') + '</small>' +
        '</span>' +
      '</div>' +
    '</div>' +
  '</header>';
}

/* ===== Sidebar HTML ===== */
function renderSidebar(user, activeId) {
  /* 按 group 分组 */
  var groups = {};
  NAV_ITEMS.forEach(function (it) {
    if (it.roles && it.roles.indexOf(user.role) < 0) return;
    if (!groups[it.group]) groups[it.group] = [];
    groups[it.group].push(it);
  });

  var groupOrder = ['工作台', '填报', '管理', '系统设置'];
  var html = groupOrder.map(function (g) {
    if (!groups[g] || groups[g].length === 0) return '';
    var items = groups[g].map(function (it) {
      var activeCls = it.id === activeId ? ' active' : '';
      return '<a class="nav-item' + activeCls + '" href="' + it.href + '" data-id="' + esc(it.id) + '">' +
        '<span class="nav-icon">' + ICONS[it.icon] + '</span>' +
        '<span class="nav-label">' + esc(it.label) + '</span>' +
      '</a>';
    }).join('');
    return '<div class="sidebar-group">' +
      '<div class="sidebar-group-title">' + esc(g) + '</div>' +
      items +
    '</div>';
  }).join('');

  html += '<div class="sidebar-foot">' +
    '<button class="sidebar-foot-btn" id="btnLogout">' +
      ICONS.logout + '<span>退出登录</span>' +
    '</button>' +
  '</div>';

  return '<aside class="sidebar" id="sidebar">' + html + '</aside>';
}

/* ===== 主渲染函数 ===== */
function renderLayout(opts) {
  opts = opts || {};
  var active = opts.active || '';
  var user = getCurrentUser();
  if (!user) return null;
  var mount = opts.mount || document.getElementById('app');

  mount.innerHTML =
    renderTopBar(user) +
    '<div class="main-wrap">' +
      renderSidebar(user, active) +
      '<main class="page-content" id="pageContent">' + (opts.pageHtml || '') + '</main>' +
    '</div>' +
    /* 移动端 sidebar 弹出时的半透遮罩 - 只在 ≤1024px 通过 CSS 生效 */
    '<div class="sidebar-backdrop" id="sidebarBackdrop" aria-hidden="true"></div>';

  /* sidebar 切换逻辑：PC 端永远不调用（hamburger 已隐藏） */
  function toggleSidebar(forceClose) {
    var sidebar = document.getElementById('sidebar');
    var backdrop = document.getElementById('sidebarBackdrop');
    if (!sidebar) return;
    var willOpen = (typeof forceClose === 'boolean')
      ? !forceClose
      : !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', willOpen);
    if (backdrop) backdrop.classList.toggle('open', willOpen);
    document.body.classList.toggle('sidebar-open', willOpen);
  }

  /* 绑定事件 */
  var hb = document.getElementById('hamburger');
  if (hb) hb.onclick = function () { toggleSidebar(); };

  var backdrop = document.getElementById('sidebarBackdrop');
  if (backdrop) backdrop.onclick = function () { toggleSidebar(true); };

  /* 路由切换时自动收起（只对同源 hash 变化监听足够；这里通过点击 nav-item 自处理） */
  mount.querySelectorAll('.nav-item').forEach(function (a) {
    a.addEventListener('click', function () {
      if (window.matchMedia && window.matchMedia('(max-width: 1024px)').matches) {
        toggleSidebar(true);
      }
    });
  });

  /* Esc 关闭移动端 sidebar */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var s = document.getElementById('sidebar');
      if (s && s.classList.contains('open')) toggleSidebar(true);
    }
  });

  var btnUser = document.getElementById('btnUserMenu');
  if (btnUser) {
    btnUser.onclick = function () {
      confirmDialog('切换身份', '将退出当前账号并返回登录页,是否继续?', function () {
        logout().then(function () { location.href = 'login.html'; });
      });
    };
  }

  var btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.onclick = function () {
      confirmDialog('退出登录', '确定要退出当前账号吗?', function () {
        logout().then(function () { location.href = 'login.html'; });
      });
    };
  }

  var btnBell = document.getElementById('btnBell');
  if (btnBell) {
    btnBell.onclick = function () { toast('当前没有新的通知'); };
  }

  /* 内容区引用 */
  return mount.querySelector('.page-content');
}

/* ===== 简单不依赖布局的页面渲染 ===== */
function renderPage(opts) {
  var mount = document.getElementById('app');
  if (!mount) return null;
  var content = renderLayout(Object.assign({}, opts, { mount: mount }));
  if (opts.afterRender) opts.afterRender(content);
  return content;
}

/* ===== 显示一个空的居中提示 ===== */
function renderEmpty(content, text) {
  content.innerHTML =
    '<div class="empty-state">' +
      '<div class="empty-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z M3 10h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
      '<h4>' + esc(text || '暂无数据') + '</h4>' +
      '<p>你可以从右侧的操作按钮开始添加内容</p>' +
    '</div>';
}
