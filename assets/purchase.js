/* ============================================================
 * 物资申购填报 (W8) - 橙色 Hero + 申购明细 + 添加下一项
 * 必填校验:名称 / 规格型号 / 单位 / 数量 缺一不可
 * ============================================================ */
var PURCHASE_KEY = 'engms_purchases_v1';

function loadPurchases() { try { return JSON.parse(localStorage.getItem(PURCHASE_KEY) || '[]'); } catch (e) { return []; } }
function savePurchases(l) { localStorage.setItem(PURCHASE_KEY, JSON.stringify(l)); }

async function initPurchasePage() {
  var user = await requireLogin();
  if (!user) return;
  var projects = loadProjects();
  var state = {
    projectId: '', date: todayStr(), remark: '',
    items: [{ name: '', spec: '', unit: '个', qty: '', price: 0, usage: '' }]
  };

  var content = renderPage({
    active: 'purchase',
    pageHtml:
      '<nav class="breadcrumb"><a href="dashboard.html">工作台</a><span class="sep">/</span><span>物资申购填报</span></nav>' +
      '<div class="hero hero-orange"><h2>物资申购填报</h2>' +
      '<div class="hero-sub">用于记录工程现场所需材料、设备、工具等申购明细,提交后将进入审批流程</div>' +
      '<div class="hero-meta"><span>申购日期</span><strong>' + esc(state.date) + '</strong>' +
      '<span>申请人</span><strong>' + esc(user.name) + '</strong>' +
      '<span>合计金额</span><strong id="pcTotal">¥ 0.00</strong>' +
      '</div></div>' +
      '<div class="section"><h3>基础信息</h3><div class="form-grid">' +
      '<div class="field-row"><label class="field-label"><span class="required">*</span>关联项目</label>' +
      '<select class="input" id="pcProject"><option value="">-- 选择项目 --</option>' +
      projects.map(function (p) { return '<option value="' + esc(p._id) + '">' + esc(p.name) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field-row"><label class="field-label">申购日期</label><input class="input" type="date" id="pcDate" value="' + state.date + '"></div>' +
      '<div class="field-row full"><label class="field-label">备注说明</label>' +
      '<textarea class="input" id="pcRemark" rows="2" placeholder="例如:本周需采购一批钢筋用于二次结构"></textarea></div>' +
      '</div></div>' +
      '<div class="section"><h3>申购明细 <span class="sec-meta" style="color:var(--danger)">带 * 号字段为必填</span></h3>' +
      '<div id="pcItems"></div>' +
      '<div class="task-list-add-row" style="margin-top:16px"><button class="btn-primary" id="pcAddItem">+ 添加下一项</button></div>' +
      '<div style="display:flex;gap:12px;justify-content:flex-end;margin-top:20px">' +
      '<button class="btn-ghost" id="pcSaveDraft">保存草稿</button>' +
      '<button class="btn-success" id="pcSubmit">提交申购</button>' +
      '</div></div>'
  });

  function fmt(n) { return '¥ ' + (Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function calcTotal() {
    var sum = state.items.reduce(function (s, it) {
      var q = Number(it.qty) || 0, p = Number(it.price) || 0;
      var hasReq = (it.name || '').trim() && (it.spec || '').trim() && it.unit && q > 0;
      return s + (hasReq ? q * p : 0);
    }, 0);
    document.getElementById('pcTotal').textContent = fmt(sum);
  }

  /* 清除单个字段的红色错误 */
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

  function paint() {
    var host = document.getElementById('pcItems');
    host.innerHTML = state.items.map(function (it, i) {
      var UNITS = ['个', '件', '套', '台', '米', '吨', '千克', '袋', '箱', '根', '块', '升'];
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
        '<div class="field-row"><label class="field-label"><span class="required">*</span>单位</label>' +
        '<select class="input pc-unit" data-required="1" data-i="' + i + '">' +
        UNITS.map(function (u) {
          return '<option value="' + u + '"' + (it.unit === u ? ' selected' : '') + '>' + u + '</option>';
        }).join('') +
        '</select></div>' +
        '<div class="field-row"><label class="field-label"><span class="required">*</span>数量</label>' +
        '<input class="input pc-qty" data-required="1" type="number" min="0.01" step="0.01" data-i="' + i + '" value="' + esc(it.qty) + '" placeholder="≥ 0.01"></div>' +
        '<div class="field-row"><label class="field-label">单价 (元)</label><input class="input pc-price" type="number" min="0" step="0.01" data-i="' + i + '" value="' + esc(it.price) + '"></div>' +
        '<div class="field-row"><label class="field-label">金额</label><input class="input" disabled value="' + fmt((Number(it.qty) || 0) * (Number(it.price) || 0)) + '"></div>' +
        '<div class="field-row full"><label class="field-label">用途说明</label><input class="input pc-usage" data-i="' + i + '" value="' + esc(it.usage) + '" placeholder="用于主体 1 层浇筑..."></div>' +
        '</div></div>';
    }).join('');
    /* 失焦校验:单字段校验 - 必填字段 */
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
    host.querySelectorAll('.pc-unit').forEach(function (el) { el.addEventListener('change', function () { state.items[parseInt(this.dataset.i, 10)].unit = this.value; }); });
    host.querySelectorAll('.pc-qty, .pc-price').forEach(function (el) {
      el.addEventListener('input', function () {
        var i = parseInt(this.dataset.i, 10);
        var key = this.classList.contains('pc-qty') ? 'qty' : 'price';
        state.items[i][key] = this.value;
        paint(); calcTotal();
      });
    });
    host.querySelectorAll('.pc-usage').forEach(function (el) { el.addEventListener('input', function () { state.items[parseInt(this.dataset.i, 10)].usage = this.value; }); });
    host.querySelectorAll('.task-card-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (state.items.length <= 1) { toast('至少保留一项明细'); return; }
        state.items.splice(parseInt(this.dataset.rm, 10), 1);
        paint();
      });
    });
  }

  function fieldFilled(el) {
    if (el.tagName === 'SELECT') return !!el.value;
    var v = (el.value || '').trim();
    if (el.type === 'number') return v !== '' && parseFloat(v) > 0;
    return v !== '';
  }
  function fieldMsg(el) {
    var label = el.closest('.field-row').querySelector('.field-label').textContent.replace('*', '').trim();
    if (el.tagName === 'SELECT') return '请选择' + label;
    if (el.type === 'number') return label + '必须大于 0';
    return '请填写' + label;
  }

  /* 提交前全量校验 */
  function validate(draft) {
    /* 项目 */
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

  paint(); calcTotal();

  document.getElementById('pcProject').addEventListener('change', function () { state.projectId = this.value; clearFieldError(this); });
  document.getElementById('pcDate').addEventListener('change', function () { state.date = this.value; });
  document.getElementById('pcRemark').addEventListener('input', function () { state.remark = this.value; });
  document.getElementById('pcAddItem').addEventListener('click', function () {
    state.items.push({ name: '', spec: '', unit: '个', qty: '', price: 0, usage: '' });
    paint();
  });
  document.getElementById('pcSaveDraft').addEventListener('click', function () { save(true); });
  document.getElementById('pcSubmit').addEventListener('click', function () { save(false); });

  function save(isDraft) {
    if (!validate(isDraft)) return;
    /* 同步最新的数值到 state(items 输入时已经写入,但 qty 在 pc-qty input 里改了 this.value 后没 parseFloat) */
    document.querySelectorAll('#pcItems .pc-qty').forEach(function (el) { state.items[parseInt(el.dataset.i, 10)].qty = el.value === '' ? '' : parseFloat(el.value) || 0; });
    document.querySelectorAll('#pcItems .pc-price').forEach(function (el) { state.items[parseInt(el.dataset.i, 10)].price = parseFloat(el.value) || 0; });

    var valid = state.items.filter(function (it) {
      return (it.name || '').trim() && (it.spec || '').trim() && it.unit && (Number(it.qty) || 0) > 0;
    });
    var sum = valid.reduce(function (s, it) { return s + (Number(it.qty) || 0) * (Number(it.price) || 0); }, 0);
    var rec = {
      _id: 'pc_' + uuid().substring(0, 12),
      projectId: state.projectId, date: state.date, remark: state.remark,
      items: valid, total: sum, status: isDraft ? 'draft' : 'submitted',
      createdBy: user._id, created_at: new Date().toISOString(),
      submitted_at: isDraft ? null : new Date().toISOString()
    };
    var l = loadPurchases(); l.unshift(rec); savePurchases(l);
    toast(isDraft ? '草稿已保存' : ('申购已提交,合计 ' + fmt(sum)), 'success');
    /* 提交成功后清空表单 */
    if (!isDraft) {
      state.items = [{ name: '', spec: '', unit: '个', qty: '', price: 0, usage: '' }];
      paint(); calcTotal();
    }
  }
}
window.initPurchasePage = initPurchasePage;
window.addEventListener('DOMContentLoaded', initPurchasePage);
if (document.readyState !== 'loading') initPurchasePage();
