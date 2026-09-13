/* ============================================================
 * 分析空间 - 跨表只读分析（admin / manager）
 *
 * 数据来源：DB.* 内存缓存（来自 /api/bootstrap）
 * - 不新增数据表、不修改 server/app.py
 * - 当前实现覆盖 8 个分析维度，后续可按需扩展
 * ============================================================ */

var ANALYSIS_HELPERS = {
  /** yyyy-mm-dd in Asia/Shanghai-equivalent (本地时区) */
  todayStr: function () {
    var d = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  },
  /** 距今 N 天前的 yyyy-mm-dd */
  daysAgoStr: function (n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    var pad = function (m) { return m < 10 ? '0' + m : '' + m; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  },
  /** 当月起止 yyyy-mm-01 ~ yyyy-mm-dd */
  thisMonthRange: function () {
    var d = new Date();
    var pad = function (m) { return m < 10 ? '0' + m : '' + m; };
    var start = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-01';
    var end = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    return { start: start, end: end };
  },
  /** 取记录中的"业务日期"字段, 兼容 plan_date / start_date / date / created_at */
  pickDate: function (rec) {
    if (!rec) return '';
    return rec.plan_date || rec.start_date || rec.date || (rec.created_at || '').slice(0, 10);
  },
  /** 在两个 yyyy-mm-dd 之间 (含端点) */
  inRange: function (ds, start, end) {
    return !!ds && ds >= start && ds <= end;
  },
  /** 计数: 数组按指定 key 出现的频次, 返回 [{label, value, ...meta}] 已按 value desc */
  countBy: function (arr, getKey, getLabel) {
    var map = {};
    arr.forEach(function (it) {
      var k = getKey(it);
      if (!k) return;
      if (!map[k]) map[k] = { label: getLabel ? getLabel(it) : k, value: 0, _key: k };
      map[k].value += 1;
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.value - a.value; });
  },
  /** 金额合计 */
  sumMoney: function (arr) {
    return arr.reduce(function (s, it) { return s + (Number(it.total) || Number(it.amount) || 0); }, 0);
  },
  /** 从 items 数组中累计金额 (兼容 purchases) */
  sumPurchaseItems: function (purchase) {
    var items = purchase.items || [];
    return items.reduce(function (s, it) {
      return s + (Number(it.qty) || 0) * (Number(it.price) || 0);
    }, 0);
  },
  /** 关键词频次扫描, 用于秩序部/消防场景 */
  scanKeywords: function (arr, textFn, keywords) {
    var out = {};
    keywords.forEach(function (k) { out[k] = 0; });
    arr.forEach(function (it) {
      var t = textFn(it) || '';
      keywords.forEach(function (k) {
        if (t.indexOf(k) >= 0) out[k] += 1;
      });
    });
    return keywords.map(function (k) { return { label: k, value: out[k] }; });
  },
  /** 数字千分位 */
  fmtNum: function (n) {
    if (n == null || isNaN(n)) return '0';
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  },
  /** 人民币 */
  fmtCNY: function (n) {
    return '¥' + this.fmtNum(n);
  }
};

/* 状态常量(局部,避免依赖 common 还未加载的顺序) */
var A_STATUS_LABEL = {
  draft: '草稿', pending: '待审批', submitted: '待审批',
  approved: '已通过', signed: '已通过', rejected: '已驳回'
};

/* ============================================================
 * 入口
 * ============================================================ */
async function initAnalysisPage() {
  var user = await requireLogin();
  if (!user) return;

  /* 仅管理员 / 主管可进 */
  if (user.role !== 'admin' && user.role !== 'manager') {
    document.getElementById('app').innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-icon">🔒</div>' +
        '<p>分析空间仅对管理员与主管开放</p>' +
        '<a class="btn btn-primary" href="dashboard.html">返回工作台</a>' +
      '</div>';
    return;
  }

  /* 容器壳 */
  var content = renderPage({
    active: 'analysis',
    pageHtml:
      '<div class="page-header">' +
        '<h2>分析空间</h2>' +
        '<p class="page-sub">跨表只读分析 · 数据范围：当前月 / 近 30 天 / 全量聚合</p>' +
      '</div>' +
      '<div class="analysis-loading">加载中...</div>'
  });

  await bootstrapDB();
  renderAnalysis(user);
}

/* ============================================================
 * 主渲染
 * ============================================================ */
function renderAnalysis(user) {
  var H = ANALYSIS_HELPERS;
  var range = H.thisMonthRange();

  /* ---- 拉数据 ---- */
  var reports = DB.reports || [];
  var dailyPlans = DB.dailyPlans || [];
  var weeklyPlans = DB.weeklyPlans || [];
  var weeklyReports = DB.weeklyReports || [];
  var purchases = DB.purchases || [];
  var approvals = DB.approvals || [];
  var members = DB.members || [];
  var projects = DB.projects || [];
  var tasks = DB.tasks || [];

  var activeMembers = members.filter(function (m) { return m.active !== false; });

  /* ---- 1. KPI ---- */
  var monthReports = reports.filter(function (r) {
    var d = H.pickDate(r);
    return H.inRange(d, range.start, range.end);
  });
  var monthDailyPlans = dailyPlans.filter(function (r) {
    var d = H.pickDate(r);
    return H.inRange(d, range.start, range.end);
  });
  var monthApprovals = approvals.filter(function (a) {
    var d = (a.created_at || '').slice(0, 10);
    return H.inRange(d, range.start, range.end);
  });
  var monthPurchases = purchases.filter(function (p) {
    var d = (p.date || (p.created_at || '').slice(0, 10));
    return H.inRange(d, range.start, range.end);
  });
  var monthPurchaseTotal = monthPurchases.reduce(function (s, p) { return s + H.sumPurchaseItems(p); }, 0);

  var approvedCnt = monthApprovals.filter(function (a) { return a.status === 'approved'; }).length;
  var rejectedCnt = monthApprovals.filter(function (a) { return a.status === 'rejected'; }).length;
  var totalDecided = approvedCnt + rejectedCnt;
  var passRate = totalDecided > 0 ? Math.round(approvedCnt / totalDecided * 100) : null;

  /* ---- 2. 近 30 天日报提交趋势 ---- */
  var daily = [];
  for (var i = 29; i >= 0; i--) {
    var ds = H.daysAgoStr(i);
    daily.push({
      label: ds.slice(5),
      value: reports.filter(function (r) { return H.pickDate(r) === ds; }).length,
      _date: ds
    });
  }
  var dailyPlanSeries = [];
  for (var j = 29; j >= 0; j--) {
    var ds2 = H.daysAgoStr(j);
    dailyPlanSeries.push({
      label: ds2.slice(5),
      value: dailyPlans.filter(function (r) { return H.pickDate(r) === ds2; }).length,
      _date: ds2
    });
  }

  /* ---- 3. 审批状态分布 ---- */
  var statusGroups = {};
  approvals.forEach(function (a) {
    var s = A_STATUS_LABEL[a.status] || '其他';
    statusGroups[s] = (statusGroups[s] || 0) + 1;
  });
  var statusData = Object.keys(statusGroups).map(function (k) {
    return { label: k, value: statusGroups[k], color:
      k === '已通过' ? '#35ED7E' :
      k === '已驳回' ? '#ED4245' :
      k === '待审批' ? '#F59E0B' :
      k === '草稿'   ? '#7E84A8' : '#5865F2'
    };
  });

  /* ---- 4. 近 6 个月采购金额 ---- */
  var purchaseMonths = [];
  for (var m = 5; m >= 0; m--) {
    var dd = new Date(); dd.setMonth(dd.getMonth() - m);
    var ymKey = dd.getFullYear() + '-' + ('0' + (dd.getMonth() + 1)).slice(-2);
    var total = purchases.reduce(function (s, p) {
      var d = (p.date || (p.created_at || '').slice(0, 10)) || '';
      if (d.slice(0, 7) !== ymKey) return s;
      return s + H.sumPurchaseItems(p);
    }, 0);
    purchaseMonths.push({ label: ymKey.slice(2), value: total });
  }

  /* ---- 5. 人员工作量 Top 8 (按本月日报+计划提交量) ---- */
  var workload = activeMembers.map(function (m) {
    var repCnt = monthReports.filter(function (r) { return r.created_by === m._id; }).length;
    var planCnt = monthDailyPlans.filter(function (r) { return r.created_by === m._id; }).length;
    return { name: m.name || m.phone || m._id, total: repCnt + planCnt, rep: repCnt, plan: planCnt };
  }).filter(function (x) { return x.total > 0; })
    .sort(function (a, b) { return b.total - a.total; })
    .slice(0, 8);

  /* ---- 6. 驳回原因 Top 5 ---- */
  var rejectReasons = approvals
    .filter(function (a) { return a.status === 'rejected' && a.rejected_reason; })
    .map(function (a) { return (a.rejected_reason || '').trim(); })
    .filter(Boolean);
  var reasonMap = {};
  rejectReasons.forEach(function (txt) {
    /* 简化归并: 取首行 / 前 12 字 */
    var k = txt.split(/\r?\n/)[0].slice(0, 12);
    if (!k) return;
    reasonMap[k] = (reasonMap[k] || 0) + 1;
  });
  var reasonTop = Object.keys(reasonMap).map(function (k) { return { label: k, value: reasonMap[k] }; })
    .sort(function (a, b) { return b.value - a.value; })
    .slice(0, 5);

  /* ---- 7. 项目维度对比 ---- */
  var projBars = projects.map(function (p) {
    var repCnt = reports.filter(function (r) { return r.project_id === p._id || r.projectId === p._id; }).length;
    var planCnt = dailyPlans.filter(function (r) { return r.project_id === p._id || r.projectId === p._id; }).length;
    return { label: p.name || ('项目 ' + p._id.slice(0, 6)), value: repCnt + planCnt };
  }).sort(function (a, b) { return b.value - a.value; }).slice(0, 8);

  /* ---- 8. 安全/消防关键词扫描 (日报+日计划备注与任务内容) ---- */
  var KEYWORDS = ['消防', '灭火器', '应急', '隐患', '整改', '演练', '检查', '烟感', '喷淋', '疏散', '防火', '安全'];
  function gatherText(rec) {
    var parts = [];
    if (rec.remarks) parts.push(rec.remarks);
    if (rec.tasks) parts.push(JSON.stringify(rec.tasks));
    if (rec.note) parts.push(rec.note);
    return parts.join('\n');
  }
  var keywordStats = H.scanKeywords(reports.concat(dailyPlans), gatherText, KEYWORDS);

  /* ============ 组装 HTML ============ */
  var html =
    renderKPIs([
      { label: '本月日报提交', value: H.fmtNum(monthReports.length), hint: '截至今日' },
      { label: '本月审批通过率', value: passRate == null ? '—' : passRate + '%', hint: approvedCnt + ' 通过 / ' + rejectedCnt + ' 驳回' },
      { label: '本月采购金额', value: H.fmtCNY(monthPurchaseTotal), hint: monthPurchases.length + ' 单申购' },
      { label: '在岗人员', value: H.fmtNum(activeMembers.length), hint: '全量 ' + members.length + ' 人' }
    ]) +

    '<div class="analysis-grid-2">' +
      '<div class="card">' +
        '<div class="card-head"><h3>近 30 天日报提交量</h3><span class="card-sub">单位: 条 / 日</span></div>' +
        '<div id="chart-reports-trend"></div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-head"><h3>近 30 天日计划提交量</h3><span class="card-sub">单位: 条 / 日</span></div>' +
        '<div id="chart-plans-trend"></div>' +
      '</div>' +
    '</div>' +

    '<div class="analysis-grid-2">' +
      '<div class="card">' +
        '<div class="card-head"><h3>审批状态分布</h3><span class="card-sub">全量 ' + approvals.length + ' 条</span></div>' +
        '<div id="chart-approval-status"></div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-head"><h3>近 6 个月采购金额</h3><span class="card-sub">单位: 元</span></div>' +
        '<div id="chart-purchase-monthly"></div>' +
      '</div>' +
    '</div>' +

    '<div class="analysis-grid-3">' +
      '<div class="card">' +
        '<div class="card-head"><h3>人员工作量 Top 8</h3><span class="card-sub">本月日报+计划</span></div>' +
        '<div class="table-wrap">' +
          (workload.length === 0 ? '<div class="empty-mini">本月暂无数据</div>' :
            '<table class="data-table">' +
              '<thead><tr><th>人员</th><th>日报</th><th>计划</th><th>合计</th></tr></thead>' +
              '<tbody>' + workload.map(function (w) {
                return '<tr><td>' + esc(w.name) + '</td><td>' + w.rep + '</td><td>' + w.plan + '</td><td><b>' + w.total + '</b></td></tr>';
              }).join('') + '</tbody></table>'
          ) +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-head"><h3>驳回原因 Top 5</h3><span class="card-sub">取首行前 12 字</span></div>' +
        '<div id="chart-reject-reasons"></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-head"><h3>项目维度对比</h3><span class="card-sub">日报+计划累计</span></div>' +
        '<div id="chart-project-bars"></div>' +
      '</div>' +
    '</div>' +

    '<div class="card analysis-keywords">' +
      '<div class="card-head"><h3>消防/安全关键词命中</h3>' +
        '<span class="card-sub">扫描日报与日计划全文 · 用于秩序部复盘</span></div>' +
      '<div id="chart-keywords" class="kw-grid"></div>' +
    '</div>';

  /* 把 pageHtml 之后的内容整段替换: 找 .page-header, 把它的父节点里所有后续兄弟清掉再插入 */
  var mainEl = document.querySelector('.main-content') || document.getElementById('app');
  if (mainEl) {
    var ph = mainEl.querySelector('.page-header');
    if (ph && ph.parentNode) {
      var parent = ph.parentNode;
      /* 收集 page-header 之后的所有 element 兄弟(跳过 text node) */
      var toRemove = [];
      var sib = ph.nextElementSibling;
      while (sib) { toRemove.push(sib); sib = sib.nextElementSibling; }
      toRemove.forEach(function (n) { parent.removeChild(n); });
      /* 用临时 div 解析 html 串, 然后把它的所有子节点搬到 parent */
      var tmp = document.createElement('div');
      tmp.innerHTML = html;
      while (tmp.firstChild) parent.appendChild(tmp.firstChild);
    } else {
      /* 兜底: 没有 page-header 就直接覆盖 */
      mainEl.innerHTML = html;
    }
  }

  /* ---- 渲染图表 ---- */
  if (typeof drawLineChart === 'function') {
    drawLineChart(document.getElementById('chart-reports-trend'),
      [{ label: '日报', color: '#5865F2', data: daily.map(function (p) { return { label: p.label, value: p.value }; }) }],
      { width: 640, height: 200 });
    drawLineChart(document.getElementById('chart-plans-trend'),
      [{ label: '日计划', color: '#00B0F4', data: dailyPlanSeries.map(function (p) { return { label: p.label, value: p.value }; }) }],
      { width: 640, height: 200 });
  }
  if (typeof drawBarChart === 'function') {
    drawBarChart(document.getElementById('chart-purchase-monthly'), purchaseMonths, { width: 640, height: 200 });
    drawBarChart(document.getElementById('chart-reject-reasons'),
      reasonTop.length > 0 ? reasonTop : [{ label: '暂无驳回', value: 1 }],
      { width: 360, height: 200 });
    drawBarChart(document.getElementById('chart-project-bars'),
      projBars.length > 0 ? projBars : [{ label: '暂无项目', value: 1 }],
      { width: 360, height: 220 });
  }
  if (typeof drawDonutChart === 'function') {
    drawDonutChart(document.getElementById('chart-approval-status'),
      statusData.length > 0 ? statusData : [{ label: '无审批数据', value: 1, color: '#4D5278' }],
      { width: 220, height: 200, centerLabel: '审批总数' });
  }

  /* 关键词块 (HTML chip 形式) */
  var kwEl = document.getElementById('chart-keywords');
  if (kwEl) {
    var max = Math.max.apply(null, keywordStats.map(function (k) { return k.value; }).concat([1]));
    kwEl.innerHTML = keywordStats.map(function (k) {
      var pct = Math.round(k.value / max * 100);
      return '<div class="kw-chip">' +
        '<span class="kw-name">' + esc(k.label) + '</span>' +
        '<span class="kw-bar"><span class="kw-bar-fill" style="width:' + pct + '%"></span></span>' +
        '<span class="kw-count">' + k.value + '</span>' +
      '</div>';
    }).join('');
  }
}

function renderKPIs(items) {
  return '<div class="kpi-row">' + items.map(function (it) {
    return '<div class="kpi-card">' +
      '<div class="kpi-label">' + esc(it.label) + '</div>' +
      '<div class="kpi-value">' + it.value + '</div>' +
      '<div class="kpi-hint">' + esc(it.hint || '') + '</div>' +
    '</div>';
  }).join('') + '</div>';
}

/* 暴露到全局 + 自动初始化(与本项目其它页保持一致) */
window.initAnalysisPage = initAnalysisPage;
window.addEventListener('DOMContentLoaded', initAnalysisPage);
if (document.readyState !== 'loading') initAnalysisPage();
