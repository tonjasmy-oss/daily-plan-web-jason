/* ============================================================
 * 登录页:L1 设计 — 账号密码登录通道
 * ============================================================ */

async function initLoginPage() {
  /* 检测是否通过 file:// 打开 */
  if (location.protocol === 'file:') {
    showFileProtocolError();
    return;
  }

  /* 首次访问:服务器自动建库并注入种子数据 */
  try {
    await bootstrapDB();
  } catch (e) {
    if (e && e.message === 'file-protocol') { showFileProtocolError(); return; }
    showServerError();
    return;
  }

  bindTabSwitch();
  bindForm();
  bindActions();
}

/* ========== Tab 切换 ========== */
function bindTabSwitch() {
  document.querySelectorAll('.login-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = btn.dataset.tab;
      document.querySelectorAll('.login-tab').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      document.querySelectorAll('[data-pane]').forEach(function (p) {
        p.hidden = p.dataset.pane !== target;
      });
    });
  });
}

/* ========== 表单提交 ========== */
function bindForm() {
  var form = document.getElementById('loginFormEl');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var account = (document.getElementById('loginAccount').value || '').trim();
    var password = document.getElementById('loginPassword').value || '';
    if (!account) {
      showLoginError('请输入账号');
      return;
    }
    if (!password) {
      showLoginError('请输入密码');
      return;
    }
    /* 账号密码登录:从可登录名单匹配(演示模式,任意密码都通过) */
    var members = loadMembers();
    var target = members.find(function (m) {
      return (m._id === account) || (m.name === account) || (m.email === account);
    });
    if (!target) {
      showLoginError('账号不存在,请检查输入或联系管理员');
      return;
    }
    doLogin(target._id);
  });
}

function showLoginError(msg) {
  var el = document.getElementById('loginError');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(function () { el.classList.remove('show'); }, 3000);
}

/* ========== file:// 错误 ========== */
function showFileProtocolError() {
  var loginHint = document.querySelector('.login-hint');
  if (loginHint) {
    loginHint.innerHTML = '<b style="color:var(--danger);">⚠ 打开方式错误</b><br>请双击 <code>start.bat</code> 启动服务,然后访问 <code>http://localhost:8080</code>';
  }
  var btn = document.getElementById('btnSubmit');
  if (btn) btn.disabled = true;
}

function showServerError() {
  var loginHint = document.querySelector('.login-hint');
  if (loginHint) {
    loginHint.innerHTML = '<b style="color:var(--danger);">⚠ 无法连接服务器</b><br>请先启动后端服务后刷新页面';
  }
  var btn = document.getElementById('btnSubmit');
  if (btn) btn.disabled = true;
}

function doLogin(id) {
  login(id).then(function (u) {
    toast('欢迎,' + u.name);
    var ret = queryParam('return') || 'dashboard.html';
    setTimeout(function () { location.href = ret; }, 400);
  }).catch(function () {
    toast('登录失败', 'error');
  });
}

/* ========== 底部辅助按钮 ========== */
function bindActions() {
  var btnDashboard = document.getElementById('btnGoDashboard');
  if (btnDashboard) {
    btnDashboard.onclick = function () {
      confirmDialog('直接进入', '未登录状态下仪表盘数据有限,建议先选择身份。', function () {
        location.href = 'dashboard.html';
      });
    };
  }
  var btnReset = document.getElementById('btnResetSeed');
  if (btnReset) {
    btnReset.onclick = function () {
      confirmDialog('重置种子', '清空所有数据并重新插入示例项目/任务(管理员、张工、李师傅、王师傅)。', function () {
        fetch('/api/reset', { method: 'POST', credentials: 'same-origin' }).then(function () {
          localStorage.removeItem('eng_ms_current_user_v1');
          toast('已重置,3 秒后刷新…');
          setTimeout(function () { location.reload(); }, 3000);
        });
      });
    };
  }
  /* 微信快捷登录 */
  var btnWx = document.getElementById('btnWxLogin');
  if (btnWx) {
    btnWx.onclick = function () {
      toast('微信登录演示模式:已用 admin 身份进入', 'success');
      var admin = (loadMembers() || []).find(function (m) { return m.role === 'admin'; });
      if (admin) {
        setTimeout(function () { doLogin(admin._id); }, 600);
      }
    };
  }
}

window.initLoginPage = initLoginPage;
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initLoginPage);
} else {
  initLoginPage();
}