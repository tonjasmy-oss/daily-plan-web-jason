/* ============================================================
 * 系统参数 (W14) - 应用名称/版本号等 6 输入 + 2 toggle
 * 数据由 /api/settings 管理, 内存缓存见 common.js (getSetting/setSetting)
 * ============================================================ */

async function initSettingsPage() {
  var user = await requireLogin();
  if (!user) return;
  if (!requireModule('m_settings')) return;
  if (!isAdmin()) { toast('需要管理员权限', 'warn'); setTimeout(function(){ location.href='dashboard.html'; }, 800); return; }

  var s = Object.assign({
    appName: '工程管理系统',
    version: 'v5.0',
    company: '某某建筑工程有限公司',
    phone: '010-12345678',
    email: 'contact@example.com',
    maxUsers: 50,
    autoBackup: true,
    purchasePerm: true
  }, getSetting('general', {}));

  /* 附件存储路径单独存于 settings.system (后端 get_upload_dir 读取) */
  var sysConf = Object.assign({ upload_path: '' }, getSetting('system', {}));

  var content = renderPage({
    active: 'settings',
    pageHtml:
      '<nav class="breadcrumb"><a href="dashboard.html">工作台</a><span class="sep">/</span><span>系统设置</span><span class="sep">/</span><span>系统参数</span></nav>' +
      '<div class="page-header"><div><h2>系统参数</h2><div class="page-sub">全局应用配置,影响整个系统的展示与功能</div></div>' +
      '<div class="page-actions"><button class="btn-success" id="stSave">保存设置</button></div></div>' +
      '<div class="section"><h3>基础信息</h3><div class="form-grid">' +
      field('应用名称', 'stAppName', s.appName, 'text') +
      field('版本号', 'stVersion', s.version, 'text') +
      field('公司名称', 'stCompany', s.company, 'text') +
      field('联系电话', 'stPhone', s.phone, 'tel') +
      field('联系邮箱', 'stEmail', s.email, 'email') +
      field('最大用户数', 'stMax', s.maxUsers, 'number') +
      '</div></div>' +
      '<div class="section"><h3>系统行为</h3><div class="form-grid">' +
      toggle('自动备份数据', '启用后每周日凌晨自动备份 SQLite 数据库', s.autoBackup) +
      toggle('物资申购需要审批', '启用后,所有物资申购必须经审批通过才能入库', s.purchasePerm) +
      '</div></div>' +
      '<div class="section"><h3>工种管理</h3>' +
      '<div class="muted" style="font-size:13px;line-height:1.6;margin-bottom:12px">' +
      '在此维护成员可选工种。新增成员的工种默认为空,管理员可在下拉中指定。被任一成员使用的工种不允许删除。' +
      '</div>' +
      '<div id="wtToolbar" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">' +
      '<input class="input" id="wtNewName" placeholder="新工种名称, 例: 钢结构焊工" style="max-width:280px">' +
      '<button class="btn-success" id="wtAdd">添加</button>' +
      '<button class="btn-ghost" id="wtReset">恢复默认 9 项</button>' +
      '</div>' +
      '<div id="wtList"></div>' +
      '</div>' +
      '<div class="section"><h3>附件存储</h3><div class="form-grid">' +
      field('附件保存路径', 'stUploadPath', sysConf.upload_path, 'text') +
      '<div class="field-row" style="grid-column:1/-1"><label class="field-label">路径说明</label>' +
      '<div class="muted" style="font-size:13px;line-height:1.7">' +
      '留空则使用默认目录 <code>server/uploads</code>。填写相对路径时以服务端 <code>server</code> 目录为基准（如 <code>uploads</code>），也可直接填写绝对路径（如 <code>D:\\engms\\uploads</code>）。保存后立即生效，新上传的附件将保存到该目录。' +
      '</div></div>' +
      '</div>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:14px">' +
      '<button class="btn-ghost" id="stOpenFiles">打开附件管理</button>' +
      '<button class="btn-ghost" id="stReloadPath">测试连接</button>' +
      '</div></div>' +
      '<div class="section"><h3>危险操作</h3><div style="display:flex;gap:12px;flex-wrap:wrap">' +
      '<button class="btn-ghost" id="stExport">导出全部数据 (服务端)</button>' +
      '<button class="btn-ghost" id="stImport">从备份恢复</button>' +
      '<button class="btn-danger" id="stReset">清空全部数据 (服务端)</button>' +
      '</div></div>'
  });

  function field(label, id, value, type) {
    return '<div class="field-row"><label class="field-label">' + esc(label) + '</label>' +
      '<input class="input" type="' + (type || 'text') + '" id="' + id + '" value="' + esc(value) + '"></div>';
  }

  function toggle(title, desc, on) {
    return '<div class="field-row" style="grid-column:1/-1"><div style="display:flex;align-items:center;gap:14px;padding:16px;background:var(--input-bg);border:1px solid var(--border);border-radius:var(--radius-md)">' +
      '<label class="switch"><input type="checkbox" data-toggle ' + (on ? 'checked' : '') + '><span class="switch-slider"></span></label>' +
      '<div><strong>' + esc(title) + '</strong><div class="muted" style="font-size:13px;margin-top:4px">' + esc(desc) + '</div></div>' +
      '</div></div>';
  }

  document.getElementById('stSave').addEventListener('click', function () {
    var payload = {
      appName: document.getElementById('stAppName').value,
      version: document.getElementById('stVersion').value,
      company: document.getElementById('stCompany').value,
      phone: document.getElementById('stPhone').value,
      email: document.getElementById('stEmail').value,
      maxUsers: parseInt(document.getElementById('stMax').value, 10) || 50,
      autoBackup: document.querySelector('[data-toggle]').checked,
      purchasePerm: document.querySelectorAll('[data-toggle]')[1].checked,
    };
    var uploadPath = (document.getElementById('stUploadPath').value || '').trim();
    setSetting('general', payload);  /* 走 /api/settings */
    setSetting('system', { upload_path: uploadPath });  /* 附件路径: 后端 get_upload_dir 读取 */
    toast('设置已保存', 'success');
  });

  /* ===== 工种管理 (数据走 DB.workTypes + /api/work-types) ===== */
  function renderWorkTypes() {
    var items = loadWorkTypes();
    var html;
    if (!items.length) {
      html = '<div class="empty muted" style="padding:14px;border:1px dashed var(--border);border-radius:var(--radius-md);text-align:center">暂无工种, 点击右上"恢复默认 9 项"快速填充</div>';
    } else {
      html = '<div style="display:grid;gap:8px">' + items.map(function (w) {
        return '<div data-wt-id="' + esc(w._id) + '" style="display:flex;gap:8px;align-items:center;padding:10px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--input-bg)">' +
          '<input class="input wt-name" data-original="' + esc(w.name) + '" value="' + esc(w.name) + '" style="flex:1">' +
          '<button class="btn-ghost wt-save">保存</button>' +
          '<button class="btn-danger wt-del">删除</button>' +
          '</div>';
      }).join('') + '</div>';
    }
    document.getElementById('wtList').innerHTML = html;
    /* 行内编辑/删除事件 */
    document.querySelectorAll('#wtList [data-wt-id]').forEach(function (row) {
      var id = row.getAttribute('data-wt-id');
      row.querySelector('.wt-save').addEventListener('click', function () {
        var inp = row.querySelector('.wt-name');
        var newName = (inp.value || '').trim();
        var oldName = inp.getAttribute('data-original');
        if (!newName) { toast('名称不能为空', 'warn'); return; }
        if (newName === oldName) { toast('未修改', 'info'); return; }
        updateWorkType(id, { name: newName }).then(function () {
          toast('已保存', 'success');
          renderWorkTypes();
        }).catch(function (e) { toast('保存失败: ' + e.message, 'error'); });
      });
      row.querySelector('.wt-del').addEventListener('click', function () {
        confirmDialog('删除工种', '删除后该工种将从成员下拉中消失(已被使用的成员保留原值), 是否继续?', function () {
          deleteWorkType(id).then(function () {
            toast('已删除', 'success');
            renderWorkTypes();
          }).catch(function (e) { toast('删除失败: ' + e.message, 'error'); });
        });
      });
    });
  }
  renderWorkTypes();
  document.getElementById('wtAdd').addEventListener('click', function () {
    var inp = document.getElementById('wtNewName');
    var name = (inp.value || '').trim();
    if (!name) { toast('请输入工种名称', 'warn'); return; }
    createWorkType({ name: name }).then(function () {
      inp.value = '';
      toast('已添加', 'success');
      renderWorkTypes();
    }).catch(function (e) { toast('添加失败: ' + e.message, 'error'); });
  });
  document.getElementById('wtReset').addEventListener('click', function () {
    confirmDialog('恢复默认工种', '将清空现有工种列表, 然后写入荣总指定的 9 项默认工种, 是否继续?', function () {
      resetDefaultWorkTypes().then(function () {
        toast('已恢复默认 9 项', 'success');
        renderWorkTypes();
      }).catch(function (e) { toast('恢复失败: ' + e.message, 'error'); });
    });
  });

  /* 打开附件管理页 */
  document.getElementById('stOpenFiles').addEventListener('click', function () {
    location.href = 'settings-files.html';
  });

  /* 测试连接 - 先保存路径, 再尝试列出该目录 */
  document.getElementById('stReloadPath').addEventListener('click', function () {
    var uploadPath = (document.getElementById('stUploadPath').value || '').trim();
    setSetting('system', { upload_path: uploadPath });
    setTimeout(function () {
      listFiles('').then(function (res) {
        toast('连接正常, 共 ' + res.total + ' 个条目', 'success');
      }).catch(function (e) {
        toast('无法访问: ' + (e.message || '未知错误'), 'error');
      });
    }, 500);  /* 等设置写库后再列目录 */
  });

  /* 导出 - 直接请求服务端 /api/backup 拿到全量 JSON */
  document.getElementById('stExport').addEventListener('click', function () {
    fetch('/api/backup', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'engms-backup-' + todayStr() + '.json';
        a.click();
        toast('已导出全库备份', 'success');
      })
      .catch(function () { toast('导出失败,请确认服务已启动', 'error'); });
  });

  /* 导入 - 解析 JSON 后调用 /api/restore */
  document.getElementById('stImport').onclick = function () {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function (e) {
        try {
          var d = JSON.parse(e.target.result);
          confirmDialog('确认恢复', '将从备份文件覆盖当前数据库,是否继续?', function () {
            fetch('/api/restore', {
              method: 'POST', credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(d)
            })
              .then(function (r) { return r.json(); })
              .then(function (res) {
                if (res.ok) {
                  toast('已恢复,刷新页面查看', 'success');
                  setTimeout(function () { location.reload(); }, 1000);
                } else { toast('恢复失败', 'error'); }
              })
              .catch(function () { toast('恢复失败,请确认服务已启动', 'error'); });
          });
        } catch (e) { toast('文件解析失败', 'error'); }
      };
      fr.readAsText(f);
    };
    inp.click();
  };

  /* 清空 - POST /api/reset */
  document.getElementById('stReset').addEventListener('click', function () {
    confirmDialog('清空全部数据', '此操作不可恢复,所有业务数据将被清空。继续?', function () {
      fetch('/api/reset', { method: 'POST', credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.ok) { toast('已清空,刷新页面查看', 'success'); setTimeout(function () { location.reload(); }, 1000); }
        })
        .catch(function () { toast('清空失败', 'error'); });
    });
  });
}
window.initSettingsPage = initSettingsPage;
window.addEventListener('DOMContentLoaded', initSettingsPage);
if (document.readyState !== 'loading') initSettingsPage();
