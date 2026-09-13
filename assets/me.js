/* ============================================================
 * 个人中心
 *   1. 我的概览（资料卡 + 任务 KPI）
 *   2. 账号与安全（修改登录密码 / 账号信息）
 *   3. 我的任务
 *   4. 我的物资申购
 *   5. 待办审批（仅 admin / lead）
 *   6. 数据管理（仅管理员：导出 / 导入 / 清空）
 *   7. 退出登录
 * ============================================================ */

/* 申购状态展示映射（purchases.status 存在 submitted / pending 两种历史写法） */
var ME_PU_STATUS = {
  draft:     { text: '草稿',   color: 'var(--text-secondary)' },
  pending:   { text: '待审批', color: 'var(--warning)' },
  submitted: { text: '待审批', color: 'var(--warning)' },
  approved:  { text: '已通过', color: 'var(--success)' },
  rejected:  { text: '已驳回', color: 'var(--danger)' }
};

function meStatusChip(status) {
  var s = ME_PU_STATUS[status] || { text: status || '—', color: 'var(--text-secondary)' };
  return '<span class="chip" style="background:' + s.color + '22;color:' + s.color +
         ';border:none;padding:1px 8px;border-radius:999px;font-size:12px;">' + esc(s.text) + '</span>';
}

function meDateTime(v) {
  if (!v) return '—';
  return String(v).replace('T', ' ').slice(0, 16);
}

/* 把选中的图片裁剪压缩成正方形 data URI（默认 160×160 JPEG）
 * 前端先压缩再上传，避免把几 MB 的原图塞进数据库 */
function compressImage(file, size) {
  size = size || 160;
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onerror = function () { reject(new Error('图片读取失败')); };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { reject(new Error('不是有效的图片文件')); };
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          var ctx = canvas.getContext('2d');
          var side = Math.min(img.width || size, img.height || size);
          var sx = ((img.width || side) - side) / 2;
          var sy = ((img.height || side) - side) / 2;
          ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch (e) { reject(e); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function initMePage() {
  var user = await requireLogin();
  if (!user) return;
  if (!requireModule('m_me')) return;
  var content = renderPage({
    active: 'me',
    pageHtml: '<div class="loading">加载中...</div>'
  });

  function render() {
    user = getCurrentUser();
    if (!user) { location.href = 'login.html'; return; }

    /* null = 头像未改动；'' = 明确要移除；data URI = 换成新头像 */
    var pendingAvatar = null;

    var tasks = loadTasks();
    var myTasks = tasks.filter(function (t) { return t.assigneeId === user._id; });
    var myTodo = myTasks.filter(function (t) { return t.status === TASK_STATUS.TODO || t.status === TASK_STATUS.IN_PROGRESS; });
    var myDone = myTasks.filter(function (t) { return t.status === TASK_STATUS.DONE; });
    var myOverdue = myTasks.filter(function (t) {
      return t.dueDate && t.status !== TASK_STATUS.DONE && t.dueDate < todayStr();
    });

    /* ---- 我的物资申购 ---- */
    var myPurchases = (loadPurchases() || []).filter(function (p) {
      return (p.applicant || '') === user.name;
    }).sort(function (a, b) {
      return String(b.date || b.created_at || '').localeCompare(String(a.date || a.created_at || ''));
    });

    /* ---- 待办审批（有审批权的人） ---- */
    var canApprove = (PLAN_APPROVE_ROLES || []).indexOf(user.role) >= 0;
    var pendingDaily = (loadDailyPlans() || []).filter(function (r) { return r.status === 'pending'; });
    var pendingWeekly = (loadWeeklyPlans() || []).filter(function (r) { return r.status === 'pending'; });
    var pendingWR = (loadWeeklyReports() || []).filter(function (r) { return r.status === 'pending'; });
    var pendingPur = (loadPurchases() || []).filter(function (r) {
      return r.status === 'submitted' || r.status === 'pending';
    });
    var pendingAll = [];
    pendingDaily.forEach(function (r) {
      pendingAll.push({ type: '日计划', date: r.date || '', by: r.createdBy || r.author || '', href: 'plan-browse.html?tab=daily' });
    });
    pendingWeekly.forEach(function (r) {
      pendingAll.push({ type: '周计划', date: (r.startDate || '') + ' ~ ' + (r.endDate || ''), by: r.createdBy || '', href: 'plan-browse.html?tab=weekly' });
    });
    pendingWR.forEach(function (r) {
      pendingAll.push({ type: '计划周报', date: (r.startDate || '') + ' ~ ' + (r.endDate || ''), by: r.createdBy || '', href: 'plan-browse.html?tab=wr' });
    });
    pendingPur.forEach(function (r) {
      pendingAll.push({ type: '物资申购', date: r.date || '', by: r.applicant || '', name: r.name || '', href: 'purchase-mgmt.html?status=pending' });
    });

    var html =
      '<h2 class="page-title-text">个人中心</h2>' +

      /* ---------- 资料卡 ---------- */
      '<div class="profile-card">' +
        avatarHtml(user, 56) +
        '<div class="profile-info">' +
          '<div class="profile-name">' + esc(user.name) +
            '<span class="role-tag role-' + esc(user.role) + '">' + esc(roleIcon(user.role) + ' ' + roleLabel(user.role)) + '</span>' +
          '</div>' +
          '<div class="profile-meta">' +
            '<span>📞 ' + esc(user.phone || '未填写') + '</span>' +
            '<span>🔧 ' + esc(user.workType || '未指定') + '</span>' +
            '<span>📅 入职 ' + esc(user.joinDate || '-') + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* ---------- KPI ---------- */
      '<div class="kpi-row">' +
        '<div class="kpi-card kpi-blue"><div class="kpi-num">' + myTodo.length + '</div><div class="kpi-label">进行中</div></div>' +
        '<div class="kpi-card kpi-green"><div class="kpi-num">' + myDone.length + '</div><div class="kpi-label">已完成</div></div>' +
        '<div class="kpi-card kpi-orange"><div class="kpi-num">' + myOverdue.length + '</div><div class="kpi-label">已逾期</div></div>' +
      '</div>' +

      /* ---------- 账号与安全 ---------- */
      '<div class="detail-section">' +
        '<div class="detail-section-header"><h3>账号与安全</h3></div>' +
        '<div class="form-section">' +
          '<label class="form-label">登录账号</label>' +
          '<div class="muted" style="line-height:1.9;">' +
            '账号：<b>' + esc(accountLabelOf(user)) + '</b>' +
            (user.phone ? '' : '　<span style="color:var(--warning);">（尚未登记手机号，请让管理员在「人员管理」补录）</span>') +
            '<br>上次登录：' + esc(meDateTime(user.lastLoginAt)) +
            (user.lastLoginIp ? '（' + esc(user.lastLoginIp) + '）' : '') +
            '<br>密码更新时间：' + esc(meDateTime(user.pwdUpdatedAt)) +
          '</div>' +
        '</div>' +
        '<div class="form-section">' +
          '<label class="form-label">原密码</label>' +
          '<input class="input" type="password" id="meOldPwd" autocomplete="current-password" placeholder="请输入当前登录密码">' +
        '</div>' +
        '<div class="form-section">' +
          '<label class="form-label">新密码</label>' +
          '<input class="input" type="password" id="meNewPwd" autocomplete="new-password" placeholder="至少 6 位">' +
        '</div>' +
        '<div class="form-section">' +
          '<label class="form-label">确认新密码</label>' +
          '<input class="input" type="password" id="meNewPwd2" autocomplete="new-password" placeholder="再输入一次">' +
          '<div class="form-hint">修改成功后，你在其它设备上的登录会被自动注销，当前这台保持登录。</div>' +
        '</div>' +
        '<button class="btn btn-primary" id="btnChangePwd" type="button">修改密码</button>' +
      '</div>' +

      /* ---------- 个人资料 ---------- */
      '<div class="detail-section">' +
        '<div class="detail-section-header"><h3>个人资料</h3></div>' +
        '<div class="form-section">' +
          '<label class="form-label">头像</label>' +
          '<div style="display:flex;align-items:center;gap:12px;">' +
            '<span id="meAvatarBox">' + avatarHtml(user, 56) + '</span>' +
            '<span style="display:flex;gap:8px;flex-wrap:wrap;">' +
              '<button class="btn btn-default" id="btnPickAvatar" type="button">上传头像</button>' +
              (user.avatar ? '<button class="btn btn-default" id="btnClearAvatar" type="button">移除头像</button>' : '') +
            '</span>' +
            '<input type="file" id="meAvatarFile" accept="image/*" style="display:none;">' +
          '</div>' +
          '<div class="form-hint">支持 jpg / png，会在浏览器里自动压缩为 160×160 再上传。</div>' +
        '</div>' +
        '<div class="form-section">' +
          '<label class="form-label">手机号（同时是登录账号）</label>' +
          '<input class="input" id="mePhone" type="tel" inputmode="numeric" maxlength="11" ' +
                 'placeholder="11 位手机号" value="' + esc(user.phone || '') + '">' +
          '<div class="form-hint">改手机号不会自动改密码，当前密码继续有效。</div>' +
        '</div>' +
        '<button class="btn btn-primary" id="btnSaveProfile" type="button">保存资料</button>' +
        '<div class="muted" style="margin-top:8px;">姓名、角色、工种由管理员在「人员管理」维护，此处只读。</div>' +
      '</div>' +

      /* ---------- 登录记录 ---------- */
      '<div class="detail-section">' +
        '<div class="detail-section-header"><h3>登录记录</h3>' +
          '<button class="btn-link" id="btnKillOthers" type="button">退出其它设备</button></div>' +
        '<div class="task-list-mini" id="meLoginList"><div class="muted" style="padding:10px 0;">加载中…</div></div>' +
      '</div>' +

      /* ---------- 我的任务 ---------- */
      '<div class="detail-section">' +
        '<div class="detail-section-header"><h3>我的任务</h3>' +
          '<a class="btn-link" href="tasks.html?assigneeId=me">查看全部 →</a></div>' +
        '<div class="task-list-mini" id="myTaskList"></div>' +
      '</div>' +

      /* ---------- 我的物资申购 ---------- */
      '<div class="detail-section">' +
        '<div class="detail-section-header"><h3>我的物资申购</h3>' +
          '<a class="btn-link" href="purchase.html">去申购 →</a></div>' +
        '<div class="task-list-mini" id="myPurchaseList"></div>' +
      '</div>' +

      /* ---------- 待办审批（仅审批角色） ---------- */
      (canApprove ?
        '<div class="detail-section">' +
          '<div class="detail-section-header"><h3>待办审批 (' + pendingAll.length + ')</h3>' +
            '<a class="btn-link" href="approval.html?status=pending">前往审批管理 →</a></div>' +
          '<div class="task-list-mini" id="pendingList"></div>' +
        '</div>' : '') +

      /* ---------- 密码重置申请（仅管理员） ---------- */
      (isAdmin() ?
        '<div class="detail-section">' +
          '<div class="detail-section-header"><h3>密码重置申请</h3>' +
            '<span class="muted">同事在登录页点「忘记密码」后出现在这里</span></div>' +
          '<div class="task-list-mini" id="meResetList"><div class="muted" style="padding:10px 0;">加载中…</div></div>' +
        '</div>' : '') +

      /* ---------- 数据管理（仅管理员） ---------- */
      (isAdmin() ?
        '<div class="detail-section">' +
          '<h3>数据管理（服务器数据库）</h3>' +
          '<div class="data-actions">' +
            '<button class="btn btn-primary" id="btnExport">📥 导出全部数据 (JSON)</button>' +
            '<button class="btn btn-default" id="btnImport">📤 导入数据 (JSON)</button>' +
            '<input type="file" id="importFile" accept="application/json" style="display:none;">' +
            '<button class="btn btn-danger" id="btnClear">🗑 清空所有数据</button>' +
          '</div>' +
          '<div class="muted" style="margin-top:8px;">' +
            '仅管理员可见。数据保存在服务器 SQLite 数据库（server/data.db），多端共用同一份；建议定期导出 JSON 备份。' +
            '备份文件里含登录凭据，导入后各人密码保持不变。</div>' +
        '</div>' : '') +

      /* ---------- 退出 ---------- */
      '<div class="detail-section">' +
        '<button class="btn btn-danger-outline" id="btnLogout">退出登录</button>' +
      '</div>';

    content.innerHTML = html;

    /* ---------- 我的任务列表 ---------- */
    var list = document.getElementById('myTaskList');
    if (myTasks.length === 0) { renderEmpty(list, '暂无任务'); }
    else {
      var top = myTasks.slice().sort(function (a, b) {
        if (a.status === TASK_STATUS.DONE && b.status !== TASK_STATUS.DONE) return 1;
        if (a.status !== TASK_STATUS.DONE && b.status === TASK_STATUS.DONE) return -1;
        return (b.updated_at || '').localeCompare(a.updated_at || '');
      }).slice(0, 10);
      list.innerHTML = top.map(function (t) {
        var proj = getProject(t.projectId);
        var overdue = t.dueDate && t.status !== TASK_STATUS.DONE && t.dueDate < todayStr();
        return '<div class="task-row" data-task-id="' + esc(t._id) + '">' +
          '<span class="priority-dot" style="background:' + PRIORITY_COLOR[t.priority] + '"></span>' +
          '<span class="task-title">' + esc(t.title) + '</span>' +
          '<span class="task-status-pill" style="background:' + TASK_STATUS_COLOR[t.status] + '">' + TASK_STATUS_TEXT[t.status] + '</span>' +
          '<span class="muted">' + esc(proj ? proj.name : '-') + '</span>' +
          '<span class="task-due' + (overdue ? ' overdue' : '') + '">' + (t.dueDate ? '📅 ' + esc(t.dueDate) : '') + '</span>' +
        '</div>';
      }).join('');
      list.addEventListener('click', function (e) {
        var r = e.target.closest('[data-task-id]');
        if (r) location.href = 'task.html?id=' + encodeURIComponent(r.dataset.taskId);
      });
    }

    /* ---------- 我的申购列表 ---------- */
    var pl = document.getElementById('myPurchaseList');
    if (myPurchases.length === 0) { renderEmpty(pl, '暂无申购记录'); }
    else {
      pl.innerHTML = myPurchases.slice(0, 10).map(function (p) {
        var items = 0;
        try { items = (JSON.parse(p.itemsJson || p.items_json || '[]') || []).length; } catch (e) { items = 0; }
        var sub = [p.date || '', p.projectId || p.project_id ? '项目' : '', items ? items + ' 项' : '']
          .filter(Boolean).join(' · ');
        return '<div class="task-row" data-pu-id="' + esc(p._id) + '">' +
          '<span class="task-title">' + esc(p.name || '(未命名申购)') + '</span>' +
          meStatusChip(p.status) +
          '<span class="muted">' + esc(sub) + '</span>' +
          (p.rejectedReason || p.rejected_reason
            ? '<span class="task-due overdue" title="驳回原因">✖ ' + esc(p.rejectedReason || p.rejected_reason) + '</span>' : '') +
          '<span class="muted">¥' + esc(String(p.total || 0)) + '</span>' +
        '</div>';
      }).join('');
      pl.addEventListener('click', function () {
        location.href = 'purchase.html';
      });
    }

    /* ---------- 待办审批列表 ---------- */
    var pend = document.getElementById('pendingList');
    if (pend) {
      if (pendingAll.length === 0) { renderEmpty(pend, '暂无待审批事项'); }
      else {
        pend.innerHTML = pendingAll.slice(0, 10).map(function (x) {
          return '<div class="task-row" data-pend-href="' + esc(x.href) + '">' +
            '<span class="chip" style="border:none;padding:1px 8px;border-radius:999px;font-size:12px;background:var(--info)22;color:var(--info);">' + esc(x.type) + '</span>' +
            '<span class="task-title">' + esc(x.name || x.date || '-') + '</span>' +
            '<span class="muted">' + esc(x.by || '') + '</span>' +
            '<span class="task-due">' + esc(x.date || '') + '</span>' +
          '</div>';
        }).join('');
        pend.addEventListener('click', function (e) {
          var r = e.target.closest('[data-pend-href]');
          if (r) location.href = r.dataset.pendHref;
        });
      }
    }

    /* ---------- 修改密码 ---------- */
    document.getElementById('btnChangePwd').onclick = function () {
      var oldPwd = document.getElementById('meOldPwd').value;
      var newPwd = document.getElementById('meNewPwd').value;
      var newPwd2 = document.getElementById('meNewPwd2').value;
      if (!oldPwd) { toast('请输入原密码', 'warn'); return; }
      if (!newPwd || newPwd.length < 6) { toast('新密码至少 6 位', 'warn'); return; }
      if (newPwd !== newPwd2) { toast('两次输入的新密码不一致', 'warn'); return; }
      var btn = this;
      btn.disabled = true;

      function fail(msg) { toast(msg, 'error'); btn.disabled = false; }

      changeMyPassword(oldPwd, newPwd).then(function (res) {
        var extra = res.killedSessions ? '，已注销 ' + res.killedSessions + ' 个其它设备' : '';
        toast('密码修改成功' + extra);
        ['meOldPwd', 'meNewPwd', 'meNewPwd2'].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.value = '';
        });
        btn.disabled = false;
        DB.loaded = false;
        bootstrapDB().then(render);
      }).catch(function (err) {
        var map = {
          bad_old: '原密码不正确',
          weak: err && err.message,
          same: '新密码不能与原密码相同'
        };
        fail((err && map[err.code]) || (err && err.message) || '修改失败');
      });
    };

    /* ---------- 个人资料：头像 ---------- */
    var meAvatarBox = document.getElementById('meAvatarBox');
    var meAvatarFile = document.getElementById('meAvatarFile');
    var btnPickAvatar = document.getElementById('btnPickAvatar');
    if (btnPickAvatar && meAvatarFile) {
      btnPickAvatar.onclick = function () { meAvatarFile.click(); };
      meAvatarFile.onchange = function (e) {
        var f = e.target.files && e.target.files[0];
        meAvatarFile.value = '';
        if (!f) return;
        if (!/^image\//.test(f.type || '')) { toast('请选择图片文件', 'warn'); return; }
        compressImage(f, 160).then(function (dataUri) {
          pendingAvatar = dataUri;
          meAvatarBox.innerHTML = '<img src="' + esc(dataUri) + '" alt="头像" ' +
            'style="width:56px;height:56px;border-radius:50%;object-fit:cover;">';
          toast('头像已选择，点「保存资料」后生效');
        }).catch(function (err) {
          toast((err && err.message) || '图片处理失败', 'error');
        });
      };
      var btnClearAvatar = document.getElementById('btnClearAvatar');
      if (btnClearAvatar) {
        btnClearAvatar.onclick = function () {
          pendingAvatar = '';
          meAvatarBox.innerHTML = avatarHtml({ name: user.name, avatar: '' }, 56);
          toast('头像已移除，点「保存资料」后生效');
        };
      }
    }

    /* ---------- 个人资料：手机号 + 保存 ---------- */
    document.getElementById('btnSaveProfile').onclick = function () {
      var phone = (document.getElementById('mePhone').value || '').trim();
      if (phone && !/^1\d{10}$/.test(phone)) {
        toast('手机号应为 11 位数字且以 1 开头', 'warn');
        return;
      }
      if (pendingAvatar === null && phone === (user.phone || '')) {
        toast('没有需要保存的改动', 'warn');
        return;
      }
      var patch = { phone: phone };
      if (pendingAvatar !== null) patch.avatar = pendingAvatar;
      var btn = this;
      btn.disabled = true;
      updateMyProfile(patch).then(function () {
        toast('资料已保存');
        DB.loaded = false;
        return bootstrapDB();
      }).then(function () {
        render();
      }).catch(function (err) {
        btn.disabled = false;
        toast((err && err.message) || '保存失败', 'error');
      });
    };

    /* ---------- 登录记录 ---------- */
    var loginList = document.getElementById('meLoginList');
    if (loginList) {
      loadMyLogins().then(function (res) {
        var logs = res.logs || [];
        var others = res.otherSessions || 0;
        var kb = document.getElementById('btnKillOthers');
        if (kb) kb.textContent = others > 0 ? '退出其它设备（' + others + '）' : '退出其它设备';
        if (!logs.length) { renderEmpty(loginList, '暂无登录记录'); return; }
        loginList.innerHTML = logs.map(function (g) {
          var chip = g.ok
            ? '<span class="chip" style="border:none;padding:1px 8px;border-radius:999px;font-size:12px;background:var(--success)22;color:var(--success);">成功</span>'
            : '<span class="chip" style="border:none;padding:1px 8px;border-radius:999px;font-size:12px;background:var(--danger)22;color:var(--danger);">失败</span>';
          return '<div class="task-row">' + chip +
            '<span class="task-title">' + esc(meDateTime(g.at)) + '</span>' +
            '<span class="muted">' + esc(deviceLabel(g.ua)) + '</span>' +
            '<span class="muted">' + esc(g.ip || '-') + '</span>' +
            (g.ok ? '' : '<span class="muted">' + esc(g.reason || '') + '</span>') +
          '</div>';
        }).join('');
      }).catch(function (err) {
        renderEmpty(loginList, (err && err.message) || '读取失败');
      });
    }
    var btnKillOthers = document.getElementById('btnKillOthers');
    if (btnKillOthers) {
      btnKillOthers.onclick = function () {
        confirmDialog('退出其它设备', '将注销你在其它设备上的登录，本机保持登录。确定继续？', function () {
          logoutOtherDevices().then(function (res) {
            toast(res.killedSessions ? '已注销 ' + res.killedSessions + ' 个设备' : '没有其它在线设备');
            render();
          }).catch(function (err) { toast((err && err.message) || '操作失败', 'error'); });
        });
      };
    }

    /* ---------- 密码重置申请（仅管理员） ---------- */
    var resetList = document.getElementById('meResetList');
    if (resetList) {
      loadPasswordResetRequests().then(function (res) {
        var items = res.items || [];
        if (!items.length) { renderEmpty(resetList, '暂无重置申请'); return; }
        resetList.innerHTML = items.map(function (x) {
          var isPending = x.status === 'pending';
          return '<div class="task-row">' +
            meStatusChip(isPending ? 'pending' : (x.status === 'done' ? 'approved' : 'rejected')) +
            '<span class="task-title">' + esc(x.name || x.account || '') + '</span>' +
            '<span class="muted">' + esc(meDateTime(x.created_at)) + '</span>' +
            (x.note ? '<span class="muted">' + esc(x.note) + '</span>' : '') +
            (isPending
              ? '<button class="btn btn-default" data-act="reset" data-id="' + esc(x.memberId) +
                  '" data-prr="' + esc(x._id) + '" type="button">一键重置</button>' +
                '<button class="btn btn-default" data-act="ignore" data-prr="' + esc(x._id) +
                  '" type="button">忽略</button>'
              : '<span class="muted">已处理</span>') +
          '</div>';
        }).join('');

        resetList.addEventListener('click', function (e) {
          var b = e.target.closest('button[data-act]');
          if (!b) return;
          if (b.dataset.act === 'ignore') {
            handlePasswordResetRequest(b.dataset.prr, 'rejected')
              .then(function () { toast('已忽略该申请'); render(); })
              .catch(function (err) { toast((err && err.message) || '操作失败', 'error'); });
            return;
          }
          var mid = b.dataset.id;
          var rid = b.dataset.prr;
          b.disabled = true;
          resetMemberPassword(mid)
            .then(function (r) {
              return handlePasswordResetRequest(rid, 'done').then(function () { return r; });
            })
            .then(function (r) {
              confirmDialogEx('重置成功',
                '「' + esc(r.name) + '」的登录密码已重置为：' +
                '<b style="font-size:20px;letter-spacing:1px;">' + esc(r.password) + '</b><br>' +
                '<span class="muted">请转告本人；该成员在其它设备上的登录已注销。</span>' +
                '<br><button class="btn btn-default" type="button" id="btnCopyPwd" ' +
                'style="margin-top:10px;">复制密码</button>',
                function () { render(); });
              var cp = document.getElementById('btnCopyPwd');
              if (cp) {
                cp.onclick = function () {
                  try { navigator.clipboard.writeText(r.password); toast('已复制'); }
                  catch (err) { toast('复制失败，请手动选中', 'warn'); }
                };
              }
            })
            .catch(function (err) {
              b.disabled = false;
              toast((err && err.message) || '重置失败', 'error');
            });
        });
      }).catch(function (err) {
        renderEmpty(resetList, (err && err.message) || '读取失败');
      });
    }

    /* ---------- 数据管理（仅管理员） ---------- */
    var btnExport = document.getElementById('btnExport');
    if (btnExport) {
      btnExport.onclick = function () {
        fetch('/api/backup', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (data) {
          var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = '工程管理系统备份_' + formatDateStr(new Date()) + '.json';
          a.click();
          URL.revokeObjectURL(url);
          toast('已下载备份文件');
        }).catch(function () { toast('导出失败', 'error'); });
      };

      document.getElementById('btnImport').onclick = function () {
        document.getElementById('importFile').click();
      };
      document.getElementById('importFile').onchange = function (e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
          try {
            var data = JSON.parse(ev.target.result);
            confirmDialog('确认导入', '导入将覆盖服务器数据库中当前所有数据，是否继续？', function () {
              fetch('/api/restore', {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
              }).then(function (r) { return r.json(); }).then(function (res) {
                if (res.ok) { toast('导入成功，正在刷新…'); DB.loaded = false; setTimeout(function () { location.reload(); }, 800); }
                else { toast((res && res.error) || '数据格式错误', 'error'); }
              }).catch(function () { toast('导入失败', 'error'); });
            });
          } catch (err) {
            toast('JSON 解析失败', 'error');
          }
        };
        reader.readAsText(file);
      };

      document.getElementById('btnClear').onclick = function () {
        confirmDialog('清空数据', '此操作将清空服务器数据库中所有项目、人员、任务、日报数据，且无法恢复！', function () {
          fetch('/api/reset', { method: 'POST', credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (res) {
              if (res && res.error) { toast(res.error, 'error'); return; }
              toast('已清空');
              localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
              setTimeout(function () { location.href = 'login.html'; }, 800);
            })
            .catch(function () { toast('清空失败', 'error'); });
        });
      };
    }

    /* ---------- 退出登录 ---------- */
    document.getElementById('btnLogout').onclick = function () {
      confirmDialog('退出登录', '确认退出？', function () {
        logout().then(function () { location.href = 'login.html'; });
      });
    };
  }

  render();
}
window.initMePage = initMePage;
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initMePage);
} else {
  initMePage();
}
