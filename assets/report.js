/* ============================================================
 * 日报表填报页 (W3/W4) — v6 升级
 * 标题可勾选: 日常维修每日完成情况 / 计划工作每日完成情况
 * 任务字段: 工作内容 / 实施人员(多选 chip) / 完成时间 / 完成·未完成 + 未完成原因
 * 状态机: draft → submitted → signed / rejected
 * ============================================================ */

/* 可作为「实施人员」被选择的角色 (对应 roles 表 key, admin 不参与施工排班)
 * 注意: 必须声明在模块作用域 —— 原先写在 openImageViewer() 内部, 导致
 *       renderTaskRow() / openMemberPickerForTask() 访问不到而抛异常 */
var TASK_ALLOWED_ROLES = ['lead', 'foreman', 'worker'];

async function initReportPage() {
  var user = await requireLogin();
  if (!user) return;
  if (!requireModule('m_report')) return;
  var recordId = queryParam('id');
  var isEdit = !!recordId;
  var members = loadMembers().filter(function (m) { return m.active !== false; });

  var content = renderPage({
    active: 'report',
    pageHtml: '<div class="detail-loading">加载中…</div>'
  });

  var form = null;

  /* ===== 类别定义(可勾选标题) ===== */
  /* 顺序: 计划工作在前(默认勾选), 日常维修在后 */
  var CATEGORIES = [
    { id: 'plan',   label: '计划工作每日完成情况' },
    { id: 'repair', label: '日常维修每日完成情况' }
  ];

  function defaultTask() {
    return {
      id: uuid().substring(0, 8),
      content: '',
      members: [],
      startTime: '',
      endTime: '',
      status: 'done',
      reason: '',
      /* 附件上传: 数组格式, 最多 6 张, 每项 {filename,url,rel_path,size,uploaded_at,task_idx}
         服务端落盘到 server/uploads/{date}/{task_idx}/{filename}.jpg, 数据库只存路径 */
      attachments: []
    };
  }

  function defaultForm() {
    return {
      date: todayStr(),
      /* 计划工作日期: 该日报表所对应的"计划工作"日期, 审批通过后作为标题日期 */
      plan_date: todayStr(),
      /* 默认勾选「计划工作每日完成情况」 */
      categories: { repair: false, plan: true },
      tasks: [defaultTask()],
      remarks: '',
      status: 'draft',
      approver: '',
      rejected_reason: '',
      signatureImg: '',
      submitted_at: '',
      signed_at: '',
      rejected_at: ''
    };
  }

  /* 兼容旧 base64 格式 {before,during,after} 与新格式 [arr] */
  function normalizeAttachments(att) {
    if (!att) return [];
    if (Array.isArray(att)) return att.filter(function (a) { return a && a.url; });
    if (typeof att === 'object') {
      var arr = [];
      ['before', 'during', 'after'].forEach(function (k) {
        if (att[k]) arr.push({ filename: 'legacy-' + k, url: att[k], legacy: true });
      });
      return arr;
    }
    return [];
  }

  /* ---------- 数据加载 ---------- */
  function loadForm() {
    if (!isEdit) { form = defaultForm(); render(); return; }
    fetch('/api/reports/' + encodeURIComponent(recordId), { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.record) {
          toast('记录不存在', 'error');
          setTimeout(function () { location.href = 'reports.html'; }, 800);
          return;
        }
        var r = res.record;
        var cats = (r.categories && typeof r.categories === 'object') ? r.categories : {};
        /* 旧记录没有分类时, 默认落到「计划工作每日完成情况」 */
        var catRepair = !!cats.repair, catPlan = !!cats.plan;
        if (!catRepair && !catPlan) catPlan = true;
        form = {
          _id: r._id,
          date: r.date || todayStr(),
          plan_date: r.plan_date || r.date || todayStr(),
          categories: {
            repair: catRepair,
            plan: catPlan
          },
          tasks: (r.tasks && r.tasks.length > 0)
            ? r.tasks.map(function (t) {
                return {
                  id: t.id || uuid().substring(0, 8),
                  content: t.content || '',
                  members: Array.isArray(t.members) ? t.members.slice() : [],
                  startTime: t.startTime || '',
                  endTime: t.endTime || '',
                  status: t.status === 'undone' ? 'undone' : 'done',
                  reason: t.reason || '',
                  /* 兼容旧 base64 格式 {before,during,after} -> 转为 [{filename:'legacy',url:'data:...'}] */
                  attachments: normalizeAttachments(t.attachments)
                };
              })
            : [defaultTask()],
          remarks: r.remarks || '',
          status: r.status || 'draft',
          approver: r.approver || '',
          rejected_reason: r.rejected_reason || '',
          signatureImg: r.signature || '',
          submitted_at: r.submitted_at || '',
          signed_at: r.signed_at || '',
          rejected_at: r.rejected_at || '',
          created_at: r.created_at
        };
        render();
      })
      .catch(function () {
        toast('加载失败', 'error');
        setTimeout(function () { location.href = 'reports.html'; }, 800);
      });
  }

  /* ---------- 校验 ---------- */
  function validateForm(forSubmit) {
    if (!form.date) { toast('请选择日期', 'error'); return false; }

    /* 至少勾选一个标题分类 */
    if (!form.categories.repair && !form.categories.plan) {
      toast('请至少勾选一个标题分类', 'error');
      return false;
    }

    var validTasks = form.tasks.filter(function (t) { return t.content && t.content.trim(); });
    if (validTasks.length === 0) { toast('请至少填写一条工作内容', 'error'); return false; }

    /* 校验每条任务的必填项 */
    var errIdx = -1, errType = '';
    for (var i = 0; i < form.tasks.length; i++) {
      var t = form.tasks[i];
      if (!t.content || !t.content.trim()) continue;
      /* 实施人员: 至少 1 人 */
      if (!t.members || t.members.length === 0) {
        errIdx = i; errType = 'members'; break;
      }
      /* 完成时间: 起止都必填 */
      if (!t.startTime || !t.endTime) {
        errIdx = i; errType = 'time'; break;
      }
      /* 未完成时,原因必填 */
      if (t.status === 'undone' && !(t.reason || '').trim()) {
        errIdx = i; errType = 'reason'; break;
      }
    }
    if (errIdx >= 0) {
      var msgs = {
        members: '请勾选任务"' + (errIdx + 1) + '"的实施人员',
        time:    '请填写任务"' + (errIdx + 1) + '"的完成时间',
        reason:  '请填写任务"' + (errIdx + 1) + '"的未完成原因'
      };
      toast(msgs[errType] || '请完整填写任务信息', 'error');
      highlightTaskError(errIdx, errType);
      return false;
    }

    if (forSubmit && form.status === 'submitted' && !form.approver) {
      toast('请填写审批人', 'error'); return false;
    }
    return true;
  }

  function highlightTaskError(idx, type) {
    var row = document.querySelector('.rp-task-row[data-i="' + idx + '"]');
    if (!row) return;
    row.classList.add('has-row-error');
    var map = {
      members: '.rp-task-members',
      time:    '.rp-task-time',
      reason:  '.rp-task-reason'
    };
    var el = row.querySelector(map[type]);
    if (el) {
      el.classList.add('has-error');
      var input = el.querySelector('input, textarea, select');
      if (input) input.focus();
    }
  }

  /* ---------- 保存 ---------- */
  function saveForm(done, showMsg, afterSuccess) {
    var payload = {
      _id: isEdit ? recordId : (form._id || null),
      date: form.date,
      plan_date: form.plan_date || form.date,
      categories: form.categories,
      status: form.status,
      remarks: form.remarks,
      approver: form.approver,
      rejected_reason: form.rejected_reason,
      signature: form.signatureImg,
      tasks: form.tasks.filter(function (t) { return t.content && t.content.trim(); })
        .map(function (t) {
          return Object.assign({}, t, {
            /* 只保存有效附件 (有 url) - 数组格式 [{filename,url,size,...}] */
            attachments: Array.isArray(t.attachments)
              ? t.attachments.filter(function (a) { return a && a.url; })
              : []
          });
        })
    };
    fetch('/api/reports', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res.record) {
        form._id = res.record._id;
        recordId = res.record._id;
        isEdit = true;
        form.submitted_at = res.record.submitted_at || form.submitted_at;
        form.signed_at = res.record.signed_at || form.signed_at;
        form.rejected_at = res.record.rejected_at || form.rejected_at;
      }
      if (afterSuccess) { afterSuccess(); return; }
      if (showMsg) {
        toast('操作成功');
        setTimeout(function () { location.href = 'reports.html'; }, 900);
      } else if (done) {
        done();
      } else {
        toast('保存成功');
        render();
      }
    }).catch(function () {
      toast('保存失败', 'error');
    });
  }

  /* 提交完成后: 清空当前表单, 打开一张新的空白日报表(不回显已提交内容) */
  function resetToBlank() {
    recordId = null;
    isEdit = false;
    form = defaultForm();
    /* 地址栏里的 ?id= 一并清掉, 避免刷新后又加载回刚刚提交的那条 */
    try { history.replaceState(null, '', 'report.html'); } catch (_) { /* ignore */ }
    render();
  }

  /* ---------- 状态操作 ---------- */
  function submitForm() {
    if (!validateForm(true)) return;
    confirmDialog('确认提交', '提交后将进入待审批状态，是否继续？', function () {
      form.status = 'submitted';
      var submittedOn = form.plan_date || form.date;
      saveForm(null, false, function () {
        /* 提交后不再回显本条内容, 直接打开下一张空白日报表 */
        resetToBlank();
        toast('已提交,等待审批(' + submittedOn + ') · 已为你打开新的空白日报表', 'success');
      });
    });
  }

  function signForm() {
    if (!form.approver) { toast('请先填写审批人', 'error'); return; }
    confirmDialog('确认签名', '签名后将表示审批通过，是否继续？', function () {
      openSignaturePad({
        onConfirm: function (dataURL) {
          form.signatureImg = dataURL;
          form.status = 'signed';
          saveForm(null, true);
        }
      });
    });
  }

  function rejectForm() {
    var reason = (document.getElementById('r_rejectReason') || {}).value || '';
    if (!reason.trim()) { toast('请填写驳回原因', 'error'); return; }
    form.rejected_reason = reason.trim();
    confirmDialog('确认驳回', '确定要驳回此申请吗？', function () {
      form.status = 'rejected';
      saveForm(null, true);
    });
  }

  function deleteRecord() {
    confirmDialog('确认删除', '删除后无法恢复，确定要删除吗？', function () {
      fetch('/api/reports/' + encodeURIComponent(recordId), { method: 'DELETE', credentials: 'same-origin' })
        .then(function () {
          toast('删除成功');
          setTimeout(function () { location.href = 'reports.html'; }, 700);
        });
    });
  }

  /* ---------- 渲染 ---------- */
  function render() {
    if (!form) return;
    var st = form.status;
    var editable = (st === 'draft');
    /* 审批通过后标题为「{计划工作日期}年月日计划工作完成情况」 */
    var pageTitle = (st === 'signed')
      ? reportDisplayTitle({ status: st, plan_date: form.plan_date, date: form.date, categories: form.categories })
      : (isEdit ? '编辑记录' : '新建日报表');

    /* 标题分类单选区(只能勾选其一) */
    var categoriesHtml =
      '<div class="section rp-section">' +
        '<h3>标题分类 <span class="sec-meta">请选择填报类别(单选,只能勾选其一)</span></h3>' +
        '<div class="rp-categories">' +
          CATEGORIES.map(function (c) {
            var checked = !!form.categories[c.id];
            return '<label class="rp-category-chip' + (checked ? ' active' : '') + (editable ? '' : ' disabled') + '">' +
              '<input type="radio" name="rp_category" data-cat="' + c.id + '" ' + (checked ? 'checked' : '') + (editable ? '' : 'disabled') + '>' +
              '<span class="rp-category-check">' + rpIconCheck() + '</span>' +
              '<span class="rp-category-label">' + esc(c.label) + '</span>' +
            '</label>';
          }).join('') +
        '</div>' +
      '</div>';

    /* 任务列表 */
    var tasksHtml = form.tasks.map(function (t, i) {
      return renderTaskRow(t, i, editable);
    }).join('');

    /* 审批人 / 驳回 */
    var approverSection = '';
    if (st === 'submitted' || st === 'rejected' || st === 'signed') {
      approverSection =
        '<div class="detail-section">' +
          '<h3>审批人</h3>' +
          (st === 'submitted'
            ? '<input class="input" id="r_approver" value="' + esc(form.approver) + '" placeholder="请输入审批人姓名">'
            : '<div class="approver-display">' + esc(form.approver || '未填写') + '</div>') +
        '</div>';
      if (st === 'rejected') {
        approverSection +=
          '<div class="detail-section">' +
            '<h3>驳回原因</h3>' +
            '<textarea class="textarea" id="r_rejectReason" placeholder="请输入驳回原因">' + esc(form.rejected_reason) + '</textarea>' +
          '</div>';
      }
    }

    /* 签名 */
    var signatureSection = '';
    if (st === 'submitted' && !form.signatureImg) {
      signatureSection =
        '<div class="detail-section">' +
          '<h3>签名</h3>' +
          '<button class="btn btn-primary" id="btnOpenSign">✍ 点击签名</button>' +
        '</div>';
    }
    if (form.signatureImg) {
      signatureSection =
        '<div class="detail-section">' +
          '<h3>签名</h3>' +
          '<img class="signature-image" src="' + form.signatureImg + '" alt="签名">' +
        '</div>';
    }

    /* 底部操作 */
    var actionButtons = '';
    if (st === 'draft') {
      actionButtons =
        '<button class="btn btn-primary btn-lg" id="btnSubmit">提交</button>' +
        (isEdit ? '<button class="btn btn-default btn-lg" id="btnSaveDraft">保存草稿</button>' : '');
    } else if (st === 'submitted') {
      actionButtons =
        '<button class="btn btn-success btn-lg" id="btnSign">✓ 批准签名</button>' +
        '<button class="btn btn-danger btn-lg" id="btnReject">驳回</button>';
    } else if (st === 'rejected') {
      actionButtons =
        '<button class="btn btn-primary btn-lg" id="btnResubmit">重新提交</button>';
    }

    content.innerHTML =
      '<div class="detail-back"><a href="reports.html">‹ 日报记录</a></div>' +
      '<div class="page-header-row">' +
        '<h2 class="page-title-text">' + esc(pageTitle) +
          '<span class="report-status-tag report-status-' + esc(st) + '">' + (REPORT_STATUS_TEXT[st] || st) + '</span>' +
        '</h2>' +
        '<div class="page-actions">' +
          '<button class="btn btn-default" id="btnExportExcel">导出 Excel</button>' +
        '</div>' +
      '</div>' +

      categoriesHtml +

      '<div class="section rp-section">' +
        '<div class="form-grid form-grid-2">' +
          '<div class="form-section">' +
            '<label class="form-label">填报日期</label>' +
            '<input class="input" type="date" id="r_date" value="' + esc(form.date) + '"' + (editable ? '' : ' disabled') + '>' +
          '</div>' +
          '<div class="form-section">' +
            '<label class="form-label">计划工作日期 <span class="sec-meta">审批通过后作为标题日期</span></label>' +
            '<input class="input" type="date" id="r_plan_date" value="' + esc(form.plan_date || form.date) + '"' + (editable ? '' : ' disabled') + '>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="section rp-section">' +
        '<div class="section-header-row"><h3 style="margin:0;">工作内容 <span class="sec-meta">每条任务填写工作内容 / 实施人员 / 完成时间 / 完成状态</span></h3>' +
          (editable ? '<button class="btn-link" id="btnAddTask">+ 添加任务</button>' : '') +
        '</div>' +
        '<div class="rp-task-list" id="rpTaskList">' + tasksHtml + '</div>' +
      '</div>' +

      '<div class="section rp-section">' +
        '<label class="form-label">备注</label>' +
        '<textarea class="textarea" id="r_remarks" placeholder="请输入备注信息(选填)"' + (editable ? '' : ' disabled') + '>' + esc(form.remarks) + '</textarea>' +
      '</div>' +

      approverSection +
      signatureSection +
      (actionButtons ? '<div class="report-actions">' + actionButtons + '</div>' : '') +
      (isEdit && st === 'draft' ?
        '<div class="report-actions"><button class="btn btn-danger-outline btn-lg" id="btnDelete">删除记录</button></div>' : '');

    bindEvents();
  }

  /* 渲染单个任务行 */
  function renderTaskRow(t, i, editable) {
    var undone = t.status === 'undone';
    /* 兜底: 新格式统一为数组(旧 base64 格式已在 loadForm 里由 normalizeAttachments 转换) */
    if (!Array.isArray(t.attachments)) t.attachments = [];

    var memberChips = (t.members || []).map(function (mid) {
      var m = members.find(function (mm) { return mm._id === mid; });
      if (!m) return '';
      var roleLabelText = ROLE_DISPLAY[m.role] || roleLabel(m.role) || '';
      var roleBg = ROLE_TAG_BG[m.role] || 'rgba(126,132,168,.15)';
      var roleColor = ROLE_COLOR[m.role] || '#7E84A8';
      return '<span class="rp-task-member-chip">' +
              '<span class="rp-role-tag" style="background:' + roleBg + ';color:' + roleColor + ';">' + esc(roleLabelText) + '</span>' +
              '<span class="rp-task-member-name">' + esc(m.name) + '</span>' +
              (editable ? '<button class="rp-task-member-x" data-i="' + i + '" data-id="' + esc(mid) + '" type="button">×</button>' : '') +
            '</span>';
    }).join('');

    return '<div class="rp-task-row" data-i="' + i + '">' +
      '<div class="rp-task-num">' + (i + 1) + '</div>' +
      '<div class="rp-task-body">' +

        /* 工作内容 */
        '<div class="rp-task-field rp-task-content">' +
          '<label class="rp-task-label">工作内容 <span class="required">*</span></label>' +
          '<input class="input rp-task-content-input" data-i="' + i + '" data-k="content" value="' + esc(t.content || '') + '" placeholder="请输入本条工作内容"' + (editable ? '' : ' disabled') + '>' +
        '</div>' +

        /* 实施人员 */
        '<div class="rp-task-field rp-task-members">' +
          '<label class="rp-task-label">实施人员 <span class="required">*</span> <span class="rp-task-hint">点击 + 添加预设人员</span></label>' +
          '<div class="rp-task-members-row">' +
            memberChips +
            (editable ? '<button class="rp-task-add-member" data-i="' + i + '" type="button">' +
              rpIconPlus() + '<span>添加人员</span>' +
            '</button>' : '') +
          '</div>' +
        '</div>' +

        /* 完成时间 */
        '<div class="rp-task-field rp-task-time">' +
          '<label class="rp-task-label">完成时间 <span class="required">*</span> <span class="rp-task-hint">几点几时至几点几分</span></label>' +
          '<div class="rp-task-time-row">' +
            '<input class="input rp-time-input" type="time" data-i="' + i + '" data-k="startTime" value="' + esc(t.startTime || '') + '"' + (editable ? '' : ' disabled') + '>' +
            '<span class="rp-time-sep">至</span>' +
            '<input class="input rp-time-input" type="time" data-i="' + i + '" data-k="endTime" value="' + esc(t.endTime || '') + '"' + (editable ? '' : ' disabled') + '>' +
          '</div>' +
        '</div>' +

        /* 完成状态 */
        '<div class="rp-task-field rp-task-status">' +
          '<label class="rp-task-label">完成状态 <span class="required">*</span></label>' +
          '<div class="rp-task-status-row">' +
            '<label class="rp-status-radio' + (t.status === 'done' ? ' active' : '') + ' rp-status-done' + (editable ? '' : ' disabled') + '">' +
              '<input type="radio" name="rp_status_' + i + '" data-i="' + i + '" data-k="status" value="done"' + (t.status === 'done' ? ' checked' : '') + (editable ? '' : ' disabled') + '>' +
              '<span class="rp-status-icon">' + rpIconCheck() + '</span>' +
              '<span>完成</span>' +
            '</label>' +
            '<label class="rp-status-radio' + (undone ? ' active' : '') + ' rp-status-undone' + (editable ? '' : ' disabled') + '">' +
              '<input type="radio" name="rp_status_' + i + '" data-i="' + i + '" data-k="status" value="undone"' + (undone ? ' checked' : '') + (editable ? '' : ' disabled') + '>' +
              '<span class="rp-status-icon">' + rpIconX() + '</span>' +
              '<span>未完成</span>' +
            '</label>' +
          '</div>' +
        '</div>' +

        /* 附件上传 - 非必填 (处理前/处理中/处理后) */
        renderAttachmentField(i, t, editable) +

        /* 未完成原因(条件显示+必填) */
        '<div class="rp-task-field rp-task-reason' + (undone ? '' : ' hidden') + '">' +
          '<label class="rp-task-label rp-task-reason-label">未完成原因 <span class="required">*</span></label>' +
          '<textarea class="textarea rp-task-reason-input" data-i="' + i + '" data-k="reason" rows="2" placeholder="请说明未完成的原因"' + (editable ? '' : ' disabled') + '>' + esc(t.reason || '') + '</textarea>' +
        '</div>' +

      '</div>' +

      /* 顶部删除按钮 */
      (editable ? '<button class="rp-task-remove" data-i="' + i + '" type="button" title="删除任务">' + rpIconTrash() + '</button>' : '') +
    '</div>';
  }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    var dateInput = document.getElementById('r_date');
    if (dateInput) dateInput.onchange = function () { form.date = dateInput.value; };

    var planDateInput = document.getElementById('r_plan_date');
    if (planDateInput) planDateInput.onchange = function () { form.plan_date = planDateInput.value; };

    var remarksEl = document.getElementById('r_remarks');
    if (remarksEl) remarksEl.oninput = function () { form.remarks = remarksEl.value; };

    /* 分类单选切换 */
    document.querySelectorAll('.rp-category-chip input[type="radio"]').forEach(function (r) {
      r.onchange = function () {
        if (!this.checked) return;
        /* 单选: 清除全部,只保留当前 */
        CATEGORIES.forEach(function (c) { form.categories[c.id] = false; });
        form.categories[this.dataset.cat] = true;
        render();
      };
    });

    /* 任务字段统一代理(内容 / 时间 / 状态 / 原因) */
    document.getElementById('rpTaskList').addEventListener('input', function (e) {
      var t = e.target;
      var i = parseInt(t.dataset.i, 10);
      if (isNaN(i)) return;
      var k = t.dataset.k;
      if (!k) return;
      if (k === 'content' || k === 'startTime' || k === 'endTime' || k === 'reason') {
        form.tasks[i][k] = t.value;
        /* 清除错误态 */
        if (t.classList.contains('input-error')) t.classList.remove('input-error');
        var row = t.closest('.rp-task-row');
        if (row && row.classList.contains('has-row-error')) row.classList.remove('has-row-error');
        var field = t.closest('.rp-task-field');
        if (field && field.classList.contains('has-error')) field.classList.remove('has-error');
      }
    });

    /* 任务状态切换 */
    document.querySelectorAll('.rp-task-status input[type="radio"]').forEach(function (r) {
      r.onchange = function () {
        var i = parseInt(this.dataset.i, 10);
        form.tasks[i].status = this.value;
        render();
      };
    });

    /* 删除单条任务 */
    document.querySelectorAll('.rp-task-remove').forEach(function (btn) {
      btn.onclick = function () {
        var i = parseInt(this.dataset.i, 10);
        if (form.tasks.length <= 1) {
          form.tasks[0] = defaultTask();
        } else {
          form.tasks.splice(i, 1);
        }
        render();
      };
    });

    /* 实施人员 chip 移除 */
    document.querySelectorAll('.rp-task-member-x').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var i = parseInt(this.dataset.i, 10);
        var mid = this.dataset.id;
        var arr = form.tasks[i].members;
        var idx = arr.indexOf(mid);
        if (idx >= 0) arr.splice(idx, 1);
        render();
      };
    });

    /* 添加人员 */
    document.querySelectorAll('.rp-task-add-member').forEach(function (btn) {
      btn.onclick = function () {
        var i = parseInt(this.dataset.i, 10);
        openMemberPickerForTask(i);
      };
    });

    /* 附件上传 - file change (走 /api/uploads, 不区分阶段) */
    document.querySelectorAll('.rp-attach-file').forEach(function (inp) {
      inp.onchange = function () {
        var i = parseInt(this.dataset.taskI, 10);
        var f = this.files && this.files[0];
        if (!f) return;
        addAttachment(i, f);
        this.value = '';
      };
    });

    /* 附件删除 - × 按钮 (阻止冒泡,避免触发 input) */
    document.querySelectorAll('.rp-attach-remove').forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault(); e.stopPropagation();
        var i = parseInt(this.dataset.taskI, 10);
        var idx = parseInt(this.dataset.idx, 10);
        removeAttachmentByIdx(i, idx);
      };
    });

    /* 附件缩略图查看大图 */
    document.querySelectorAll('.rp-attach-thumb[data-viewer="1"]').forEach(function (img) {
      img.onclick = function () {
        openImageViewer(this.src);
      };
    });

    /* 添加任务 */
    var btnAdd = document.getElementById('btnAddTask');
    if (btnAdd) btnAdd.onclick = function () {
      form.tasks.push(defaultTask());
      render();
      setTimeout(function () {
        var rows = document.querySelectorAll('.rp-task-row');
        if (rows.length) rows[rows.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    };

    var approverInput = document.getElementById('r_approver');
    if (approverInput) approverInput.oninput = function () { form.approver = approverInput.value; };

    var btnSubmit = document.getElementById('btnSubmit');
    if (btnSubmit) btnSubmit.onclick = submitForm;

    var btnSaveDraft = document.getElementById('btnSaveDraft');
    if (btnSaveDraft) btnSaveDraft.onclick = function () { saveForm(); };

    var btnSign = document.getElementById('btnSign');
    if (btnSign) btnSign.onclick = signForm;

    var btnReject = document.getElementById('btnReject');
    if (btnReject) btnReject.onclick = rejectForm;

    var btnResubmit = document.getElementById('btnResubmit');
    if (btnResubmit) btnResubmit.onclick = submitForm;

    var btnDelete = document.getElementById('btnDelete');
    if (btnDelete) btnDelete.onclick = deleteRecord;

    var btnOpenSign = document.getElementById('btnOpenSign');
    if (btnOpenSign) btnOpenSign.onclick = function () {
      if (!form.approver) { toast('请先填写审批人', 'error'); return; }
      openSignaturePad({
        onConfirm: function (dataURL) {
          form.signatureImg = dataURL;
          toast('签名已记录');
          form.status = 'signed';
          saveForm(null, true);
        }
      });
    };

    var btnExport = document.getElementById('btnExportExcel');
    if (btnExport) btnExport.onclick = function () {
      var payload = {
        date: form.date, status: form.status, remarks: form.remarks,
        plan_date: form.plan_date || form.date,
        categories: form.categories,
        approver: form.approver, rejected_reason: form.rejected_reason,
        signature: form.signatureImg,
        tasks: form.tasks.filter(function (t) { return t.content && t.content.trim(); })
          .map(function (t) {
            return Object.assign({}, t, {
              attachments: Array.isArray(t.attachments)
                ? t.attachments.filter(function (a) { return a && a.url; })
                : []
            });
          })
      };
      exportReportToExcel(payload);
    };
  }

  /* ===== 附件上传 (数组格式, 最多 6 张, 不区分处理前/中/后) ===== */
  var ATTACH_MAX = 6;

  /* 单张图片项 HTML (有 url 即可显示) */
  function attachItemHtml(taskIdx, att, idx) {
    var isLegacy = !!att.legacy;
    return '<div class="rp-attach-item" data-task-i="' + taskIdx + '" data-idx="' + idx + '" data-rel="' + esc(att.rel_path || '') + '">' +
      '<img class="rp-attach-thumb" src="' + esc(att.url) + '" alt="工作照片" data-viewer="1" />' +
      '<div class="rp-attach-meta">' +
        '<span class="rp-attach-fname" title="' + esc(att.filename) + '">' + esc(att.filename) + '</span>' +
        '<span class="rp-attach-size">' + formatSize(att.size) + (isLegacy ? ' · 旧格式' : '') + '</span>' +
      '</div>' +
      '<button class="rp-attach-remove" data-task-i="' + taskIdx + '" data-idx="' + idx + '" type="button" title="删除">×</button>' +
    '</div>';
  }

  /* "+" 槽位 HTML (仅当未达上限时显示) */
  function attachAddHtml(taskIdx) {
    return '<label class="rp-attach-add" data-task-i="' + taskIdx + '">' +
      '<span class="rp-attach-plus">+</span>' +
      '<span class="rp-attach-add-label">上传图片</span>' +
      '<input type="file" accept="image/*" class="rp-attach-file" data-task-i="' + taskIdx + '" />' +
    '</label>';
  }

  function renderAttachmentField(taskIdx, t, editable) {
    var arr = Array.isArray(t.attachments) ? t.attachments : [];
    var itemsHtml = arr.map(function (a, i) { return attachItemHtml(taskIdx, a, i); }).join('');
    var addHtml = (editable && arr.length < ATTACH_MAX) ? attachAddHtml(taskIdx) : '';
    var countText = arr.length > 0 ? '已上传 ' + arr.length + ' / ' + ATTACH_MAX + ' 张' : '最多 ' + ATTACH_MAX + ' 张';
    return '<div class="rp-task-field rp-task-attachments">' +
      '<label class="rp-task-label">工作照片 <span class="rp-task-hint">(' + countText + ', 不区分阶段)</span></label>' +
      '<div class="rp-attach-grid">' + itemsHtml + addHtml + '</div>' +
    '</div>';
  }

  function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / 1024 / 1024).toFixed(1) + 'MB';
  }

  /* 读取 File -> dataURL -> canvas 压缩 (1200px JPEG 0.82) */
  function readImageFile(file, onDone, onError) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) {
      if (onError) onError('请选择图片文件'); return;
    }
    if (file.size > 8 * 1024 * 1024) {
      if (onError) onError('单张照片请控制在 8MB 以内'); return;
    }
    var reader = new FileReader();
    reader.onload = function (ev) {
      var dataURL = ev.target.result;
      compressImage(dataURL, 1200, function (out) { onDone(out, file.size); },
        function () { onDone(dataURL, file.size); });
    };
    reader.onerror = function () { if (onError) onError('读取图片失败'); };
    reader.readAsDataURL(file);
  }

  function compressImage(dataURL, maxWidth, onOk, onFail) {
    var img = new Image();
    img.onload = function () {
      try {
        var w = img.width, h = img.height;
        if (w <= maxWidth) { onOk(dataURL); return; }
        var ratio = maxWidth / w;
        var cw = maxWidth, ch = Math.round(h * ratio);
        var c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, cw, ch);
        onOk(c.toDataURL('image/jpeg', 0.82));
      } catch (e) { onFail(e); }
    };
    img.onerror = function () { onFail(new Error('图片解码失败')); };
    img.src = dataURL;
  }

  /* 上传一张图: multipart/form-data -> /api/uploads -> 返回 {url, filename, rel_path, size}
     更新 form.tasks[taskIdx].attachments 数组, 局部刷新整段 */
  function addAttachment(taskIdx, file) {
    var t = form.tasks[taskIdx];
    if (!t) return;
    if (!Array.isArray(t.attachments)) t.attachments = [];
    if (t.attachments.length >= ATTACH_MAX) {
      toast('最多上传 ' + ATTACH_MAX + ' 张照片', 'warn');
      return;
    }
    readImageFile(file,
      function (dataURL, origSize) {
        /* 先压缩上传, 用 FormData */
        var fd = new FormData();
        /* 关键: 把压缩后的 dataURL 转成 Blob 后 append, 这样服务端拿到的是真实二进制 */
        dataURLtoBlob(dataURL, function (blob) {
          fd.append('file', blob, file.name || 'photo.jpg');
          fd.append('date', form.date || todayStr());
          fd.append('task_idx', String(taskIdx));
          fd.append('task_content', (t.content || '').substring(0, 80));
          fetch('/api/uploads', { method: 'POST', credentials: 'same-origin', body: fd })
            .then(function (r) { return r.json(); })
            .then(function (res) {
              if (!res || !res.attachment) { toast('上传失败', 'error'); return; }
              t.attachments.push(res.attachment);
              refreshAttachmentField(taskIdx);
              toast('已上传 ' + (t.attachments.length) + ' / ' + ATTACH_MAX);
            })
            .catch(function () { toast('上传失败,请确认服务已启动', 'error'); });
        });
      },
      function (msg) { toast(msg, 'error'); }
    );
  }

  /* dataURL -> Blob (用于 FormData 二进制上传) */
  function dataURLtoBlob(dataURL, onDone) {
    try {
      var arr = dataURL.split(',');
      var mime = (arr[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
      var bin = atob(arr[1]);
      var buf = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      onDone(new Blob([buf], { type: mime }));
    } catch (e) { onDone(null); }
  }

  /* 删除一张附件 (DOM 局部刷新) */
  function removeAttachmentByIdx(taskIdx, idx) {
    var t = form.tasks[taskIdx];
    if (!t || !Array.isArray(t.attachments)) return;
    var att = t.attachments[idx];
    if (!att) return;
    var rel = att.rel_path;
    t.attachments.splice(idx, 1);
    refreshAttachmentField(taskIdx);
    toast('附件已删除');
    /* 异步删文件 */
    if (rel) {
      fetch('/api/uploads?path=' + encodeURIComponent(rel), { method: 'DELETE', credentials: 'same-origin' })
        .catch(function () {});
    }
  }

  /* 整段局部刷新附件区 (不重渲整行, 避免输入失焦) */
  function refreshAttachmentField(taskIdx) {
    var t = form.tasks[taskIdx];
    if (!t) return;
    var row = document.querySelector('.rp-task-row[data-i="' + taskIdx + '"]');
    if (!row) return;
    var oldField = row.querySelector('.rp-task-attachments');
    if (!oldField) return;
    /* 原先误用了不存在的全局 canEdit(), 上传第 2 张起会抛错导致缩略图不刷新 */
    var editable = (form.status === 'draft');
    var newField = parseFragment(renderAttachmentField(taskIdx, t, editable));
    oldField.parentNode.replaceChild(newField, oldField);
    /* 重新绑定事件 */
    rebindAttachmentEvents(taskIdx);
  }

  function rebindAttachmentEvents(taskIdx) {
    var field = document.querySelector('.rp-task-row[data-i="' + taskIdx + '"] .rp-task-attachments');
    if (!field) return;
    var fileInput = field.querySelector('.rp-attach-file');
    if (fileInput) {
      fileInput.onchange = function () {
        var f = this.files && this.files[0];
        if (!f) return;
        addAttachment(taskIdx, f);
        this.value = '';
      };
    }
    field.querySelectorAll('.rp-attach-remove').forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault(); e.stopPropagation();
        var idx = parseInt(this.dataset.idx, 10);
        removeAttachmentByIdx(taskIdx, idx);
      };
    });
    field.querySelectorAll('.rp-attach-thumb[data-viewer="1"]').forEach(function (img) {
      img.onclick = function () { openImageViewer(this.src); };
    });
  }

  function parseFragment(html) {
    var tmpl = document.createElement('template');
    tmpl.innerHTML = html.trim();
    return tmpl.content.firstChild;
  }

  /* 缩略图查看大图 */
  function openImageViewer(src) {
    if (document.getElementById('rpImgViewer')) document.getElementById('rpImgViewer').remove();
    var back = document.createElement('div');
    back.className = 'modal-backdrop rp-img-viewer-back';
    back.id = 'rpImgViewer';
    back.innerHTML =
      '<div class="rp-img-viewer">' +
        '<button class="rp-img-viewer-close" type="button" aria-label="关闭">×</button>' +
        '<img src="' + src + '" alt="" />' +
      '</div>';
    document.body.appendChild(back);
    back.onclick = function (e) {
      if (e.target === back || e.target.classList.contains('rp-img-viewer-close')) {
        back.remove();
      }
    };
    document.addEventListener('keydown', function escClose(ev) {
      if (ev.key === 'Escape') {
        back.remove();
        document.removeEventListener('keydown', escClose);
      }
    });
  }

  /* ===== 实施人员多选(仅显示"主管/班长/工人",以勾选方式添加) =====
   * ROLE_DISPLAY / ROLE_COLOR / ROLE_TAG_BG / TASK_ALLOWED_ROLES 均取自
   * common.js 或本文件顶部, 此处不再重复声明 */
  function openMemberPickerForTask(taskIndex) {
    var t = form.tasks[taskIndex];
    var available = members.filter(function (m) {
      return TASK_ALLOWED_ROLES.indexOf(m.role) >= 0 && t.members.indexOf(m._id) < 0;
    });
    if (available.length === 0) {
      toast('已是全部可分配人员（主管/班长/工人）', 'warn');
      return;
    }
    var items = available.map(function (m) {
      return {
        id: m._id,
        label: m.name,
        sublabel: ROLE_DISPLAY[m.role] || roleLabel(m.role) || '',
        role: m.role
      };
    });
    multiSelectDialog(
      '添加实施人员',
      '仅显示角色为「工程主管」「工程班长」「综合维修工」的人员，勾选后点击确定',
      items,
      [],
      function (ids) {
        if (!ids || ids.length === 0) return;
        ids.forEach(function (id) {
          if (t.members.indexOf(id) < 0) t.members.push(id);
        });
        render();
      }
    );
  }

  /* ===== 图标辅助 ===== */
  function rpIconCheck() {
    return '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14"><polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function rpIconX() {
    return '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
  }
  function rpIconPlus() {
    return '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
  }
  function rpIconTrash() {
    return '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16"><polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  }

  loadForm();
}

window.initReportPage = initReportPage;
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initReportPage);
} else {
  initReportPage();
}