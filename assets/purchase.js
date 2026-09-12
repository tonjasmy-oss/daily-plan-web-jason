/* ============================================================
 * 物资申购填报 (W8)
 *   - 关联项目: 系统内仅 1 个项目时自动默认并给出提示
 *   - 单位: 既可下拉选择也支持手动输入 (select + 内嵌 input 组合)
 *   - 添加下一项/数量/单价输入: 不再重绘列表; 只就地同步 state
 *   - 草稿: 保存后落 status='draft'; 已提交: status='submitted'
 *   - 我的申购: 下方列出本人提交记录(草稿 + 已提交 + 已通过 + 已驳回),
 *               点草稿行回到表单继续编辑; 提交后继续入库转入审批流程
 * ============================================================ */
async function initPurchasePage() {
  var user = await requireLogin();
  if (!user) return;
  var projects = loadProjects();

  /* 单位下拉备选; 用户也可以手动键入 */
  var PC_UNITS = ['个', '件', '套', '台', '米', '吨', '千克', '袋', '箱', '根', '块', '升'];

  /* 默认项目: 系统仅 1 个项目时自动默认并提示 */
  var onlyProject = projects.length === 1 ? projects[0] : null;
  var state = {
    projectId: onlyProject ? onlyProject._id : '',
    date: todayStr(), remark: '',
    items: [{ name: '', spec: '', unit: '个', qty: '', price: 0, usage: '' }],
    /* 草稿编辑模式: 有 _id 表示正在编辑既有草稿/驳回记录, 无 _id 表示全新填报 */
    editingId: null,
    editingStatus: ''
  };

  var content = renderPage({
    active: 'purchase',
    pageHtml:
      '<nav class="breadcrumb"><a href="dashboard.html">工作台</a><span class="sep">/</span><span>物资申购填报</span></nav>' +
      '<div class="hero hero-orange"><h2 id="pcHeading">物资申购填报</h2>' +
      '<div class="hero-sub">用于记录工程现场所需材料、设备、工具等申购明细,提交后将进入审批流程</div>' +
      '<div class="hero-meta"><span>申购日期</span><strong id="pcDateShow">' + esc(state.date) + '</strong>' +
      '<span>申请人</span><strong>' + esc(user.name) + '</strong>' +
      '<span>合计金额</span><strong id="pcTotal">¥ 0.00</strong>' +
      '</div></div>' +

      /* 提交后提示块: 提示当前正在编辑某条草稿/驳回记录, 提供「丢弃修改」入口 */
      '<div id="pcEditingBanner" class="pc-editing-banner" hidden></div>' +

      '<div class="section"><h3>基础信息</h3><div class="form-grid">' +
      '<div class="field-row"><label class="field-label"><span class="required">*</span>关联项目</label>' +
      '<select class="input" id="pcProject"><option value="">-- 选择项目 --</option>' +
      projects.map(function (p) {
        return '<option value="' + esc(p._id) + '"' + (state.projectId === p._id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
      }).join('') +
      '</select>' +
      (projects.length === 0
        ? '<div class="form-hint">系统内尚无项目, 请先到「项目管理」新建项目</div>'
        : (onlyProject
          ? '<div class="form-hint">系统内仅一个项目, 已自动选择「' + esc(onlyProject.name) + '」</div>'
          : '<div class="form-hint">系统内有 ' + projects.length + ' 个项目, 请选择本次申购所属项目</div>')) +
      '</div>' +
      '<div class="field-row"><label class="field-label">申购日期</label><input class="input" type="date" id="pcDate" value="' + esc(state.date) + '"></div>' +
      '<div class="field-row full"><label class="field-label">备注说明</label>' +
      '<textarea class="input" id="pcRemark" rows="2" placeholder="例如:本周需采购一批钢筋用于二次结构"></textarea></div>' +
      '</div></div>' +
      '<div class="section"><h3>申购明细 <span class="sec-meta" style="color:var(--danger)">带 * 号字段为必填</span></h3>' +
      '<div id="pcItems"></div>' +
      '<div class="task-list-add-row" style="margin-top:16px"><button class="btn-primary" id="pcAddItem">+ 添加下一项</button></div>' +
      '<div style="display:flex;gap:12px;justify-content:flex-end;margin-top:20px">' +
      '<button class="btn-ghost" id="pcSaveDraft">保存草稿</button>' +
      '<button class="btn-success" id="pcSubmit">提交申购</button>' +
      '</div></div>' +

      '<div class="section"><h3>我的申购 <span class="sec-meta">草稿可点开继续编辑; 提交后转入审批流程</span></h3>' +
      '<div id="pcMyList"></div></div>'
  });

  function fmt(n) { return '¥ ' + (Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function calcTotal() {
    var sum = state.items.reduce(function (s, it) {
      var q = Number(it.qty) || 0, p = Number(it.price) || 0;
      var hasReq = (it.name || '').trim() && (it.spec || '').trim() && (it.unit || '').trim() && q > 0;
      return s + (hasReq ? q * p : 0);
    }, 0);
    document.getElementById('pcTotal').textContent = fmt(sum);
    return sum;
  }

  function clearFieldError(input) {
    input.classList.remove('input-error');
    var row = input.closest('.field-row');
    if (row) {
      row.classList.remove('has-error');
      var errEl = row.querySelector('.field-error');
      if (errEl) errEl.remove();
    }
    var card = input.closest('.task-card');
    if (card && !card.querySelector('.input-error')) card.classList.remove('has-row-error');
  }
  function setFieldError(input, msg) {
    input.classList.add('input-error');
    var row = input.closest('.field-row');
    if (row) {
      row.classList.add('has-error');
      var old = row.querySelector('.field-error');
      if (old) old.remove();
      var e = document.createElement('div');
      e.className = 'field-error';
      e.textContent = msg;
      row.appendChild(e);
    }
    var card = input.closest('.task-card');
    if (card) card.classList.add('has-row-error');
  }

  /* 渲染明细列表 —— 注意: 关键修复
   *   旧版在 pc-qty / pc-price 的 input 事件里调了 paint() 重渲整张表单,
   *   这会把正在输入的 input 元素销毁, 焦点跑回到第一项。
   *   修复: 不再 paint(); 只就地修改 state. (添加下一项时除外) */
  function paint() {
    var host = document.getElementById('pcItems');
    host.innerHTML = state.items.map(function (it, i) {
      return '<div class="task-card" data-i="' + i + '" style="margin-bottom:12px"><div class="task-card-head">' +
        '<div style="display:flex;align-items:center;gap:10px"><span class="task-card-num">' + (i + 1) + '</span>' +
        '<span style="font-size:12px;color:var(--text-muted)">必填:</span>' +
        '<span class="chip" style="background:rgba(237,66,69,0.12);color:var(--danger);font-size:11px;padding:3px 8px">名称</span>' +
        '<span class="chip" style="background:rgba(237,66,69,0.12);color:var(--danger);font-size:11px;padding:3px 8px">规格</span>' +
        '<span class="chip" style="background:rgba(237,66,69,0.12);color:var(--danger);font-size:11px;padding:3px 8px">单位</span>' +
        '<span class="chip" style="background:rgba(237,66,69,0.12);color:var(--danger);font-size:11px;padding:3px 8px">数量</span>' +
        '</div>' +
        '<button class="task-card-remove" data-rm="' + i + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>' +
        '<div class="form-grid">' +
        '<div class="field-row"><label class="field-label"><span class="required">*</span>名称</label>' +
        '<input class="input pc-name" data-required="1" data-i="' + i + '" value="' + esc(it.name) + '" placeholder="钢筋 / 水泥..."></div>' +
        '<div class="field-row"><label class="field-label"><span class="required">*</span>规格型号</label>' +
        '<input class="input pc-spec" data-required="1" data-i="' + i + '" value="' + esc(it.spec) + '" placeholder="HRB400 / φ16..."></div>' +
        /* 单位: 既可选也允许手动输入 —— 单一 input + 备选 datalist; 避免 select 无法输入的痛点 */
        '<div class="field-row"><label class="field-label"><span class="required">*</span>单位</label>' +
        '<input class="input pc-unit" data-required="1" data-i="' + i + '" value="' + esc(it.unit || '') + '" list="pcUnitList" placeholder="选择或手动输入">' +
        '<datalist id="pcUnitList">' +
        PC_UNITS.map(function (u) { return '<option value="' + esc(u) + '"></option>'; }).join('') +
        '</datalist></div>' +
        '<div class="field-row"><label class="field-label"><span class="required">*</span>数量</label>' +
        '<input class="input pc-qty" data-required="1" type="number" min="0.01" step="0.01" data-i="' + i + '" value="' + esc(it.qty) + '" placeholder="≥ 0.01"></div>' +
        '<div class="field-row"><label class="field-label">单价 (元)</label><input class="input pc-price" type="number" min="0" step="0.01" data-i="' + i + '" value="' + esc(it.price) + '"></div>' +
        '<div class="field-row"><label class="field-label">金额</label><input class="input pc-amount" disabled value="' + fmt((Number(it.qty) || 0) * (Number(it.price) || 0)) + '"></div>' +
        '<div class="field-row full"><label class="field-label">用途说明</label><input class="input pc-usage" data-i="' + i + '" value="' + esc(it.usage) + '" placeholder="用于主体 1 层浇筑..."></div>' +
        '</div></div>';
    }).join('');
    /* 把所有"输入事件"都改成只写 state, 不重绘 (焦点抖动从此消失) */
    host.querySelectorAll('[data-required="1"]').forEach(function (el) {
      el.addEventListener('blur', function () {
        if (!fieldFilled(el)) setFieldError(el, fieldMsg(el));
        else clearFieldError(el);
      });
      el.addEventListener('input', function () {
        if (el.classList.contains('input-error') && fieldFilled(el)) clearFieldError(el);
      });
    });
    host.querySelectorAll('.pc-name').forEach(function (el) { el.addEventListener('input', function () { state.items[parseInt(this.dataset.i, 10)].name = this.value; }); });
    host.querySelectorAll('.pc-spec').forEach(function (el) { el.addEventListener('input', function () { state.items[parseInt(this.dataset.i, 10)].spec = this.value; }); });
    host.querySelectorAll('.pc-unit').forEach(function (el) {
      el.addEventListener('input',  function () { state.items[parseInt(this.dataset.i, 10)].unit = this.value; });
      el.addEventListener('change', function () { state.items[parseInt(this.dataset.i, 10)].unit = this.value; });
    });
    /* 关键修复: 数量/单价输入只更新 state + 改单行的金额显示 + 重算合计, 不重绘整张表单 */
    host.querySelectorAll('.pc-qty, .pc-price').forEach(function (el) {
      el.addEventListener('input', function () {
        var i = parseInt(this.dataset.i, 10);
        var key = this.classList.contains('pc-qty') ? 'qty' : 'price';
        state.items[i][key] = this.value;
        var q = Number(state.items[i].qty) || 0, p = Number(state.items[i].price) || 0;
        var amountEl = this.closest('.task-card').querySelector('.pc-amount');
        if (amountEl) amountEl.value = fmt(q * p);
        calcTotal();
      });
    });
    host.querySelectorAll('.pc-usage').forEach(function (el) { el.addEventListener('input', function () { state.items[parseInt(this.dataset.i, 10)].usage = this.value; }); });
    host.querySelectorAll('.task-card-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (state.items.length <= 1) { toast('至少保留一项明细'); return; }
        state.items.splice(parseInt(this.dataset.rm, 10), 1);
        paint();                /* 删除整个明细卡片, 必须重绘 (其他情况下不需要) */
      });
    });
  }

  function fieldFilled(el) {
    var v = (el.value || '').trim();
    if (el.type === 'number') return v !== '' && parseFloat(v) > 0;
    return v !== '';
  }
  function fieldMsg(el) {
    var label = el.closest('.field-row').querySelector('.field-label').textContent.replace('*', '').trim();
    if (el.type === 'number') return label + '必须大于 0';
    return '请填写' + label;
  }

  function validate(draft) {
    var proj = document.getElementById('pcProject');
    if (!proj.value) { setFieldError(proj, '请选择关联项目'); proj.focus(); return false; }
    else clearFieldError(proj);

    var items = document.querySelectorAll('#pcItems .task-card');
    var firstBad = null;
    var missing = 0;
    items.forEach(function (card) {
      var fields = card.querySelectorAll('[data-required="1"]');
      fields.forEach(function (f) {
        if (!fieldFilled(f)) {
          setFieldError(f, fieldMsg(f));
          missing++;
          if (!firstBad) firstBad = f;
        } else clearFieldError(f);
      });
    });

    if (!draft && missing > 0) {
      toast('还有 ' + missing + ' 个必填项未完成,见红色高亮字段', 'warn');
      if (firstBad) {
        firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof firstBad.focus === 'function') {
          try { firstBad.focus({ preventScroll: true }); } catch (e) { firstBad.focus(); }
        }
      }
      return false;
    }
    return true;
  }

  /* 把 state.items 收尾 (清理空行 + 算总额) */
  function packItems() {
    var valid = state.items.filter(function (it) {
      return (it.name || '').trim() && (it.spec || '').trim() &&
        (it.unit || '').trim() && (Number(it.qty) || 0) > 0;
    });
    var total = valid.reduce(function (s, it) { return s + (Number(it.qty) || 0) * (Number(it.price) || 0); }, 0);
    return { valid: valid, total: total };
  }

  /* ---- 草稿/提交保存 ---- */
  function save(isDraft) {
    if (!validate(isDraft)) return;
    var p = packItems();
    if (p.valid.length === 0) { toast('请至少填写一项完整的申购明细', 'warn'); return; }
    var first = p.valid[0];
    var rec = {
      date: state.date,
      name: first.name,
      spec: p.valid.map(function (it) { return it.spec; }).join('; '),
      unit: first.unit,
      qty: p.valid.reduce(function (s, it) { return s + (Number(it.qty) || 0); }, 0).toString(),
      total: p.total,
      items: p.valid.map(function (it) {
        return { name: it.name, spec: it.spec, unit: it.unit, qty: Number(it.qty) || 0, price: Number(it.price) || 0, usage: it.usage || '' };
      }),
      projectId: state.projectId,
      reason: state.remark,
      applicant: user.name || '',
      status: isDraft ? 'draft' : 'submitted',
      approver: '', approved_at: ''
    };
    /* 仅在编辑既有记录时才带 _id, 避免 Object.assign 把 _id 覆盖为 undefined */
    if (state.editingId) rec._id = state.editingId;
    if (state.editingId) {
      updatePurchase(state.editingId, rec);
      /* 驳回后重提交: 把旧审批记录删掉, 重新走 pending */
      if (!isDraft) {
        removePurchaseApproval(state.editingId);
        createPurchaseApproval(state.editingId, rec, user);
      }
      toast(isDraft ? '草稿已更新' : '申购已重新提交', 'success');
    } else {
      var created = createPurchase(rec);
      state.editingId = created._id;
      state.editingStatus = rec.status;
      /* 非草稿(提交) → 自动写入一条 pending 审批记录, 进审批管理 */
      if (!isDraft) {
        createPurchaseApproval(created._id, rec, user);
      }
      toast(isDraft ? '草稿已保存' : ('申购已提交,合计 ' + fmt(p.total)), 'success');
    }
    if (!isDraft) {
      /* 提交后清空表单 (沿用上一版「提交即翻页」风格, 但保留当前项目与日期便于连报) */
      resetToBlank();
    } else {
      /* 草稿: 刷新列表, 不清空表单, 让填报人能继续在本表单补全 */
      paintMyList();
      updateEditingBanner();
    }
  }

  function resetToBlank() {
    state.editingId = null;
    state.editingStatus = '';
    state.items = [{ name: '', spec: '', unit: '个', qty: '', price: 0, usage: '' }];
    state.remark = '';
    var remarkEl = document.getElementById('pcRemark');
    if (remarkEl) remarkEl.value = '';
    var projectSel = document.getElementById('pcProject');
    if (projectSel) projectSel.value = onlyProject ? onlyProject._id : '';
    state.projectId = projectSel ? projectSel.value : '';
    document.getElementById('pcDateShow').textContent = state.date;
    paint();
    calcTotal();
    updateEditingBanner();
    paintMyList();
  }

  /* ---- 我的申购列表 ---- */
  function paintMyList() {
    var host = document.getElementById('pcMyList');
    if (!host) return;
    var all = (loadPurchases() || []).slice();
    /* 仅显示本人提交 */
    var mine = all.filter(function (r) { return (r.applicant || '') === user.name; });
    if (mine.length === 0) {
      renderEmpty(host, '尚无申购记录, 填写上方表单即可提交');
      return;
    }
    /* 草稿优先; 同状态按时间倒序 */
    var order = { draft: 0, submitted: 1, rejected: 2, approved: 3 };
    mine.sort(function (a, b) {
      var oa = order[a.status] != null ? order[a.status] : 9;
      var ob = order[b.status] != null ? order[b.status] : 9;
      if (oa !== ob) return oa - ob;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
    var statusMap = { draft: '草稿', submitted: '已提交(待审批)', approved: '已通过', rejected: '已驳回' };
    var classMap  = { draft: 'draft', submitted: 'submitted', approved: 'signed', rejected: 'rejected' };
    host.innerHTML = mine.map(function (r) {
      var items = Array.isArray(r.items) ? r.items : [];
      var first = items[0] || {};
      var sub = [
        items.length + ' 项明细',
        first.name || r.name || '—',
        r.total ? fmt(r.total) : ''
      ].filter(Boolean).join(' · ');
      var edit = (r.status === 'draft' || r.status === 'rejected');
      var badge = '<span class="report-status-tag report-status-' +
        (classMap[r.status] || 'draft') + '">' + esc(statusMap[r.status] || r.status || '—') + '</span>';
      var action = edit
        ? '<button class="btn-ghost btn-sm pc-edit-draft" data-id="' + esc(r._id) + '" type="button">继续编辑</button>'
        : '<span class="chip">查看</span>';
      return '<div class="list-row pc-my-row">' +
        '<div><strong>' + esc(r.date || '(无日期)') + '</strong>' +
        '<div class="muted" style="font-size:13px;margin-top:4px">' + esc(sub) + '</div>' +
        '</div>' +
        '<span class="pb-row-right">' + badge + ' ' + action + '</span>' +
        '</div>';
    }).join('');
    host.querySelectorAll('.pc-edit-draft').forEach(function (btn) {
      btn.addEventListener('click', function () { loadIntoEditor(btn.dataset.id); });
    });
  }

  /* 把一条已存在申购记录装回表单 (草稿/驳回可编辑; 已通过/已提交只读) */
  function loadIntoEditor(id) {
    var rec = (loadPurchases() || []).find(function (r) { return r._id === id; });
    if (!rec) { toast('未找到该申购记录', 'warn'); return; }
    if (rec.status === 'submitted' || rec.status === 'approved') {
      toast('该记录已提交/通过, 不可修改', 'warn');
      return;
    }
    state.editingId = rec._id;
    state.editingStatus = rec.status;
    state.projectId = rec.projectId || rec.project_id || '';
    state.date = rec.date || todayStr();
    state.remark = rec.reason || '';
    var items = Array.isArray(rec.items) && rec.items.length > 0 ? rec.items : [{
      name: rec.name || '', spec: rec.spec || '', unit: rec.unit || '', qty: rec.qty || '', price: 0, usage: ''
    }];
    state.items = items.map(function (it) {
      return {
        name: it.name || '',
        spec: it.spec || '',
        unit: it.unit || '',
        qty: it.qty === '' || it.qty == null ? '' : String(it.qty),
        price: Number(it.price) || 0,
        usage: it.usage || ''
      };
    });
    var p = document.getElementById('pcProject'); if (p) p.value = state.projectId;
    var d = document.getElementById('pcDate'); if (d) d.value = state.date;
    var ds = document.getElementById('pcDateShow'); if (ds) ds.textContent = state.date;
    var r = document.getElementById('pcRemark'); if (r) r.value = state.remark;
    paint();
    calcTotal();
    updateEditingBanner();
    toast(rec.status === 'rejected' ? '已载入被驳回的申购, 修改后可重新提交' : '已载入草稿, 可继续编辑', 'info');
    /* 滚到顶部 */
    var banner = document.getElementById('pcEditingBanner');
    if (banner) banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* 顶部 "正在编辑某条草稿/驳回" 提示块 */
  function updateEditingBanner() {
    var banner = document.getElementById('pcEditingBanner');
    if (!banner) return;
    if (!state.editingId) { banner.hidden = true; banner.innerHTML = ''; return; }
    var txt = state.editingStatus === 'rejected'
      ? '正在编辑「已驳回」的申购 · 修改后可重新提交'
      : '正在编辑「草稿」 · 修改后点保存草稿继续留档, 或点提交申购直接进入审批流程';
    banner.hidden = false;
    banner.innerHTML = '<div class="pc-editing-inner">' +
      '<span>' + esc(txt) + '</span>' +
      '<button class="btn-ghost btn-sm" id="pcDiscardEdit" type="button">放弃编辑, 新建申购</button>' +
      '</div>';
    var btn = document.getElementById('pcDiscardEdit');
    if (btn) btn.onclick = function () {
      confirmDialog('放弃编辑', '确定要放弃当前编辑吗?表单将重置为空。', function () { resetToBlank(); });
    };
  }

  paint(); calcTotal();
  paintMyList();
  updateEditingBanner();

  /* ---- 物资申购进审批管理: 写/删 approvas 表 (type='purchase') ---- */
  function buildApprovalTitle(rec) {
    /* 标题: 物资申购 2026-09-12 · 项目A · ¥4,500.00 */
    var proj = state.projectId ? pbProjectName(state.projectId) : '';
    return '物资申购 ' + (rec.date || '') +
      (proj ? ' · ' + proj : '') +
      (rec.total ? ' · ¥' + Number(rec.total).toFixed(2) : '');
  }
  function createPurchaseApproval(purchaseId, rec, user) {
    if (typeof createApproval !== 'function') return null;
    return createApproval({
      type: 'purchase',
      ref_id: purchaseId,
      title: buildApprovalTitle(rec),
      applicant: user.name || '',
      reason: rec.reason || '',
      payload: { total: rec.total, items_count: (rec.items || []).length },
      status: 'pending'
    });
  }
  function removePurchaseApproval(purchaseId) {
    if (typeof DB === 'undefined' || !DB.approvals) return;
    var stale = DB.approvals.filter(function (a) { return a && a.type === 'purchase' && a.ref_id === purchaseId; });
    stale.forEach(function (a) {
      if (typeof deleteApproval === 'function') deleteApproval(a._id);
    });
  }
  function pbProjectName(id) {
    var ps = (typeof loadProjects === 'function' ? loadProjects() : []) || [];
    var hit = ps.filter(function (p) { return p._id === id; })[0];
    return hit ? hit.name : '';
  }

  document.getElementById('pcProject').addEventListener('change', function () {
    state.projectId = this.value; clearFieldError(this);
  });
  document.getElementById('pcDate').addEventListener('change', function () {
    state.date = this.value;
    var ds = document.getElementById('pcDateShow'); if (ds) ds.textContent = state.date;
  });
  document.getElementById('pcRemark').addEventListener('input', function () { state.remark = this.value; });
  document.getElementById('pcAddItem').addEventListener('click', function () {
    state.items.push({ name: '', spec: '', unit: '个', qty: '', price: 0, usage: '' });
    paint();
    /* 添加后焦点自动落到新增那项的"名称"输入框, 不用滚就可见 */
    var cards = document.querySelectorAll('#pcItems .task-card');
    var last = cards[cards.length - 1];
    if (last) {
      last.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var firstInput = last.querySelector('.pc-name');
      if (firstInput) {
        try { firstInput.focus({ preventScroll: true }); } catch (_) { firstInput.focus(); }
      }
    }
  });
  document.getElementById('pcSaveDraft').addEventListener('click', function () { save(true); });
  document.getElementById('pcSubmit').addEventListener('click', function () { save(false); });

  /* 来自「审批管理 → 查看明细」的跳转: ?ref=<purchase_id> */
  var refId = queryParam('ref');
  if (refId) {
    setTimeout(function () {
      var rec = (loadPurchases() || []).find(function (r) { return r._id === refId; });
      if (!rec) { toast('未找到该申购记录', 'warn'); return; }
      loadIntoEditor(refId);
      /* 已通过/已提交的记录: 把操作按钮置灰, 只读查看 */
      if (rec.status === 'approved' || rec.status === 'submitted') {
        var btns = document.querySelectorAll('#pcSaveDraft, #pcSubmit, #pcAddItem');
        btns.forEach(function (b) { b.disabled = true; b.title = '该记录已提交/通过, 不可修改'; });
        document.querySelectorAll('.task-card-remove').forEach(function (b) { b.style.display = 'none'; });
        var banner = document.getElementById('pcEditingBanner');
        if (banner) {
          banner.hidden = false;
          banner.innerHTML = '<div class="pc-editing-inner"><span>正在查看 ' +
            (rec.status === 'approved' ? '已通过' : '已提交') + ' 的申购 (只读, 不可修改)</span></div>';
        }
      }
    }, 100);
  }
}
window.initPurchasePage = initPurchasePage;
window.addEventListener('DOMContentLoaded', initPurchasePage);
if (document.readyState !== 'loading') initPurchasePage();