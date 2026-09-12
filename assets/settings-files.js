/* ============================================================
 * 附件管理 (系统设置) —— 浏览服务端附件目录
 * 能力: 目录导航 / 图片预览 / 单张下载 / 批量 ZIP 下载
 * 权限: 仅管理员 (后端 /api/files* 会二次校验)
 * 依赖: common.js 的 listFiles / downloadFileUrl / downloadZip /
 *       saveBlob / saveUrl / formatBytes
 * ============================================================ */

var FM = {
  path: '',        /* 当前相对附件根目录的路径, '' 表示根 */
  data: null,      /* 最近一次列目录响应 */
  selected: {},    /* path -> true */
  loading: false
};

var FM_SVG_CHECK = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14" aria-hidden="true"><polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var FM_SVG_FOLDER = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';

/* ------------------------------------------------------------ */

function fmSkeleton() {
  return '' +
    '<nav class="breadcrumb"><a href="dashboard.html">工作台</a><span class="sep">/</span>' +
      '<a href="settings.html">系统设置</a><span class="sep">/</span><span>附件管理</span></nav>' +
    '<div class="page-header">' +
      '<div><h2>附件管理</h2><div class="page-sub">浏览服务端附件目录，支持图片预览、单张下载与批量打包下载</div></div>' +
      '<div class="page-actions">' +
        '<button class="btn-secondary" id="fmRefresh">刷新</button>' +
        '<button class="btn-primary" id="fmZip" disabled>批量下载 (ZIP)</button>' +
      '</div>' +
    '</div>' +
    '<div class="fm-pathbar">' +
      '<div class="fm-crumbs" id="fmCrumbs"></div>' +
      '<div class="fm-bar-right">' +
        '<span class="fm-count" id="fmCount"></span>' +
        '<button class="btn-ghost btn-sm" id="fmSelectAll">全选本页</button>' +
        '<button class="btn-ghost btn-sm" id="fmClearSel">清空选择</button>' +
      '</div>' +
    '</div>' +
    '<div class="fm-root-hint" id="fmRootHint"></div>' +
    '<div class="fm-grid" id="fmGrid"></div>';
}

async function initFilesPage() {
  var user = await requireLogin();
  if (!user) return;
  if (!isAdmin()) {
    toast('需要管理员权限', 'warn');
    setTimeout(function () { location.href = 'dashboard.html'; }, 800);
    return;
  }

  renderPage({ active: 'files', pageHtml: fmSkeleton() });
  fmBindToolbar();

  FM.path = queryParam('path') || '';
  fmLoad(FM.path);
}
window.initFilesPage = initFilesPage;
window.addEventListener('DOMContentLoaded', initFilesPage);
if (document.readyState !== 'loading') initFilesPage();

/* ------------------------------------------------------------ */

function fmBindToolbar() {
  document.getElementById('fmRefresh').onclick = function () { fmLoad(FM.path); };

  document.getElementById('fmSelectAll').onclick = function () {
    var items = (FM.data && FM.data.items) || [];
    var files = items.filter(function (x) { return !x.is_dir; });
    var allSel = files.length > 0 && files.every(function (x) { return FM.selected[x.path]; });
    if (allSel) {
      files.forEach(function (x) { delete FM.selected[x.path]; });
    } else {
      files.forEach(function (x) { FM.selected[x.path] = true; });
    }
    fmRenderGrid();
    fmUpdateSelUI();
  };

  document.getElementById('fmClearSel').onclick = function () {
    FM.selected = {};
    fmRenderGrid();
    fmUpdateSelUI();
  };

  document.getElementById('fmZip').onclick = function () {
    var paths = fmSelectedPaths();
    if (!paths.length) return;
    var btn = this;
    btn.disabled = true;
    toast('正在打包 ' + paths.length + ' 个文件…');
    downloadZip(paths).then(function (blob) {
      saveBlob(blob, '附件_' + todayStr() + '.zip');
      toast('已开始下载', 'success');
      btn.disabled = false;
      fmUpdateSelUI();
    }, function (e) {
      toast(e.message || '打包失败', 'error');
      btn.disabled = false;
      fmUpdateSelUI();
    });
  };
}

/* ===== 列目录 ===== */
function fmLoad(path) {
  FM.loading = true;
  FM.path = path || '';
  var grid = document.getElementById('fmGrid');
  if (grid) grid.innerHTML = '<div class="loading">正在读取目录…</div>';

  listFiles(FM.path).then(function (res) {
    FM.loading = false;
    FM.data = res;
    fmRenderCrumbs();
    fmRenderGrid();
    fmUpdateSelUI();
    var hint = document.getElementById('fmRootHint');
    if (hint) hint.textContent = '存储目录：' + (res.upload_dir || '');
  }, function (e) {
    FM.loading = false;
    FM.data = null;
    fmRenderCrumbs();
    var msg = (e && e.message) || '读取失败';
    var tip = /404/.test(msg)
      ? '该目录当前不存在或还没有上传过附件'
      : msg;
    if (grid) {
      grid.innerHTML = '<div class="empty-state">' +
        '<div class="empty-icon">' + FM_SVG_FOLDER + '</div>' +
        '<h4>' + esc(tip) + '</h4>' +
        '<div class="muted">可在「系统参数 → 附件存储」中检查保存路径设置</div>' +
        '</div>';
    }
    fmUpdateSelUI();
  });
}

/* ===== 面包屑 ===== */
function fmRenderCrumbs() {
  var box = document.getElementById('fmCrumbs');
  if (!box) return;
  var segs = FM.path ? FM.path.split('/') : [];
  var html = '<a href="#" class="fm-crumb" data-path="">附件根目录</a>';
  var acc = '';
  segs.forEach(function (s) {
    if (!s) return;
    acc = acc ? (acc + '/' + s) : s;
    html += '<span class="sep">/</span><a href="#" class="fm-crumb" data-path="' + esc(acc) + '">' + esc(s) + '</a>';
  });
  box.innerHTML = html;
  box.querySelectorAll('.fm-crumb').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      FM.selected = {};
      fmLoad(a.dataset.path || '');
    });
  });
}

/* ===== 网格 ===== */
function fmRenderGrid() {
  var grid = document.getElementById('fmGrid');
  if (!grid) return;
  var items = (FM.data && FM.data.items) || [];
  if (!items.length) {
    var noDir = !!(FM.data && FM.data.exists === false);
    grid.innerHTML = '<div class="empty-state">' +
      '<div class="empty-icon">' + FM_SVG_FOLDER + '</div>' +
      '<h4>' + (noDir ? '该目录尚未创建' : '此目录为空') + '</h4>' +
      '<div class="muted">' + (noDir
        ? '上传日报表附件后会自动创建；也可在「系统参数 → 附件存储」中核对保存路径'
        : '上传日报表附件后，这里会显示对应图片') + '</div>' +
      '</div>';
    return;
  }
  grid.innerHTML = items.map(fmCard).join('');
  fmBindGrid(grid);
}

function fmCard(it) {
  var sel = !!FM.selected[it.path];
  var cls = 'fm-card' + (sel ? ' is-selected' : '') + (it.is_dir ? ' is-dir' : '');
  var thumb;
  if (it.is_dir) {
    thumb = '<div class="fm-thumb fm-thumb-dir">' + FM_SVG_FOLDER + '</div>';
  } else if (it.is_image) {
    thumb = '<div class="fm-thumb"><img loading="lazy" src="' + esc(it.url) + '" alt="' + esc(it.name) + '"></div>';
  } else {
    var ext = (it.ext || '').replace('.', '').toUpperCase() || 'FILE';
    thumb = '<div class="fm-thumb fm-thumb-file"><span>' + esc(ext) + '</span></div>';
  }
  var meta = it.is_dir
    ? '文件夹'
    : (formatBytes(it.size) + ' · ' + String(it.mtime || '').replace('T', ' '));

  return '<div class="' + cls + '" data-path="' + esc(it.path) + '" data-dir="' + (it.is_dir ? '1' : '') + '">' +
      (it.is_dir ? '' : '<span class="fm-check" data-check="' + esc(it.path) + '" title="选择">' + FM_SVG_CHECK + '</span>') +
      (it.is_dir ? '' : '<button class="fm-dl" data-dl="' + esc(it.path) + '" title="下载">' +
        '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>') +
      thumb +
      '<div class="fm-meta">' +
        '<div class="fm-name" title="' + esc(it.name) + '">' + esc(it.name) + '</div>' +
        '<div class="fm-sub">' + esc(meta) + '</div>' +
      '</div>' +
    '</div>';
}

function fmBindGrid(grid) {
  grid.querySelectorAll('.fm-card').forEach(function (card) {
    card.addEventListener('click', function (e) {
      /* 勾选框 */
      var chk = e.target.closest('[data-check]');
      if (chk) {
        e.stopPropagation();
        var p = chk.dataset.check;
        if (FM.selected[p]) delete FM.selected[p]; else FM.selected[p] = true;
        card.classList.toggle('is-selected', !!FM.selected[p]);
        fmUpdateSelUI();
        return;
      }
      /* 单张下载 */
      var dl = e.target.closest('[data-dl]');
      if (dl) {
        e.stopPropagation();
        fmDownloadByPath(dl.dataset.dl);
        return;
      }
      /* 点卡片主体 */
      if (card.dataset.dir === '1') {
        FM.selected = {};
        fmLoad(card.dataset.path);
        return;
      }
      var item = fmFindItem(card.dataset.path);
      if (item && item.is_image) fmPreview(item);
    });
  });
}

function fmFindItem(path) {
  var items = (FM.data && FM.data.items) || [];
  return items.find(function (x) { return x.path === path; }) || null;
}

function fmDownloadByPath(path) {
  var it = fmFindItem(path);
  saveUrl(downloadFileUrl(path), it ? it.name : '');
}

/* ===== 选择状态 ===== */
function fmSelectedPaths() {
  return Object.keys(FM.selected).filter(function (p) { return FM.selected[p]; });
}

function fmUpdateSelUI() {
  var n = fmSelectedPaths().length;
  var btn = document.getElementById('fmZip');
  if (btn) {
    btn.disabled = n === 0;
    btn.textContent = n ? ('批量下载 (ZIP) · ' + n) : '批量下载 (ZIP)';
  }
  var cnt = document.getElementById('fmCount');
  if (cnt) {
    var d = (FM.data && FM.data.dirs) || 0;
    var f = (FM.data && FM.data.files) || 0;
    cnt.textContent = '目录 ' + d + ' · 文件 ' + f + (n ? (' · 已选 ' + n) : '');
  }
}

/* ===== 图片预览 ===== */
function fmPreview(it) {
  var ov = document.createElement('div');
  ov.className = 'fm-lightbox';
  ov.innerHTML =
    '<div class="fm-lb-inner">' +
      '<div class="fm-lb-bar">' +
        '<span class="fm-lb-name">' + esc(it.name) + '</span>' +
        '<span class="fm-lb-actions">' +
          '<button class="btn-secondary btn-sm" data-lb-dl>下载</button>' +
          '<button class="btn-ghost btn-sm" data-lb-close>关闭</button>' +
        '</span>' +
      '</div>' +
      '<img src="' + esc(it.url) + '" alt="' + esc(it.name) + '">' +
    '</div>';
  document.body.appendChild(ov);

  function close() {
    ov.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  ov.addEventListener('click', function (e) {
    if (e.target === ov || e.target.closest('[data-lb-close]')) { close(); return; }
    if (e.target.closest('[data-lb-dl]')) fmDownloadByPath(it.path);
  });
  document.addEventListener('keydown', onKey);
}
