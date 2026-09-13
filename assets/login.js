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
  var btn = document.getElementById('btnSubmit');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var account = (document.getElementById('loginAccount').value || '').trim();
    var password = document.getElementById('loginPassword').value || '';
    if (!account) {
      showLoginError('请输入手机号或姓名');
      return;
    }
    if (!password) {
      showLoginError('请输入密码');
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = '登录中…'; }
    login(account, password).then(function (u) {
      toast('欢迎，' + u.name);
      var ret = queryParam('return') || 'dashboard.html';
      setTimeout(function () { location.href = ret; }, 400);
    }).catch(function (err) {
      if (btn) { btn.disabled = false; btn.textContent = '登 录'; }
      showLoginError(loginErrorText(err));
      if (err && err.code === 'bad_pwd') {
        var p = document.getElementById('loginPassword');
        if (p) { p.value = ''; p.focus(); }
      }
    });
  });
}

/* 把后端返回的错误码翻译成人话 */
function loginErrorText(err) {
  if (!err) return '登录失败，请重试';
  switch (err.code) {
    case 'no_user':  return '账号不存在，请检查手机号或姓名';
    case 'bad_pwd':  return err.message || '密码不正确';
    case 'locked':   return err.message || '账号已锁定，请稍后重试';
    case 'inactive': return '账号已停用，请联系管理员';
    case 'missing':  return '请输入账号和密码';
    default:         return err.message || '登录失败，请重试';
  }
}

function showLoginError(msg) {
  var el = document.getElementById('loginError');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove('show'); }, 5000);
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
  /* 微信快捷登录：尚未接入，避免成为绕过密码的后门 */
  var btnWx = document.getElementById('btnWxLogin');
  if (btnWx) {
    btnWx.onclick = function () {
      toast('微信登录尚未接入，请用手机号或姓名 + 密码登录', 'warn');
    };
  }

  /* 忘记密码：提交重置申请（无需登录，由管理员处理） */
  var btnForgot = document.getElementById('btnForgot');
  if (btnForgot) {
    btnForgot.onclick = function (e) {
      e.preventDefault();
      var accEl = document.getElementById('loginAccount');
      var preset = accEl ? (accEl.value || '').trim() : '';
      confirmDialogEx('忘记密码',
        '<div class="form-section">' +
          '<label class="form-label">你的账号</label>' +
          '<input class="input" id="fpAccount" placeholder="手机号 或 姓名" value="' + esc(preset) + '">' +
        '</div>' +
        '<div class="form-section">' +
          '<label class="form-label">备注（选填）</label>' +
          '<input class="input" id="fpNote" maxlength="60" placeholder="例如：手机号也换了，请联系我">' +
        '</div>' +
        '<div class="muted" style="line-height:1.7;">申请会出现在管理员的「个人中心 → 密码重置申请」里。<br>' +
        '管理员重置后，请用初始密码登录（手机号后 6 位；未登记手机号的同事为 <code>123456</code>），' +
        '登录成功后在「个人中心」立即改成自己的密码。</div>',
        function () {
          var acc = (document.getElementById('fpAccount').value || '').trim();
          var note = (document.getElementById('fpNote').value || '').trim();
          if (!acc) { toast('请输入手机号或姓名', 'warn'); return false; }
          requestPasswordReset(acc, note).then(function () {
            toast('申请已提交，请联系管理员重置');
          }).catch(function (err) {
            toast((err && err.message) || '提交失败，请联系管理员', 'error');
          });
        });
    };
  }
}

window.initLoginPage = initLoginPage;
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initLoginPage);
} else {
  initLoginPage();
}