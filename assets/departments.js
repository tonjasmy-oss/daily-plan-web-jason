/* ============================================================
 * 部门管理 (W12) - 添加部门 + 部门列表
 * ============================================================ */
var DEPT_KEY = 'engms_departments_v1';
function loadDepts() { try { return JSON.parse(localStorage.getItem(DEPT_KEY) || '[]'); } catch (e) { return []; } }
function saveDepts(l) { localStorage.setItem(DEPT_KEY, JSON.stringify(l)); }

async function initDepartmentsPage() {
  var user = await requireLogin();
  if (!user) return;
  if (!isAdmin()) { toast('需要管理员权限', 'warn'); setTimeout(function(){ location.href='dashboard.html'; }, 800); return; }

  /* 默认种子 */
  if (loadDepts().length === 0) {
    saveDepts([
      { _id: 'd1', name: '工程部', desc: '负责项目现场施工', headcount: 12, created_at: new Date().toISOString() },
      { _id: 'd2', name: '秩序部', desc: '现场秩序与安全', headcount: 4, created_at: new Date().toISOString() },
      { _id: 'd3', name: '管理部', desc: '后勤与综合管理', headcount: 6, created_at: new Date().toISOString() }
    ]);
  }

  var content = renderPage({
    active: 'departments',
    pageHtml:
      '<nav class="breadcrumb"><a href="dashboard.html">工作台</a><span class="sep">/</span><a href="settings.html">系统设置</a><span class="sep">/</span><span>部门管理</span></nav>' +
      '<div class="page-header"><div><h2>部门管理</h2><div class="page-sub">维护工程部门结构与人员编制</div></div>' +
      '<div class="page-actions"><button class="btn-primary" id="dNew">+ 添加部门</button></div></div>' +
      '<div id="dList"></div>'
  });

  function paint() {
    var list = loadDepts();
    var host = document.getElementById('dList');
    if (list.length === 0) { renderEmpty(host, '暂无部门'); return; }
    host.innerHTML = '<div class="section" style="padding:6px"><table class="table" style="width:100%">' +
      '<thead><tr><th style="width:80px">编号</th><th>部门名称</th><th>说明</th><th style="width:120px">编制人数</th><th style="width:160px">创建时间</th><th style="width:160px">操作</th></tr></thead><tbody>' +
      list.map(function (d, i) {
        var members = loadMembers().filter(function (m) { return (m.deptId === d._id || m.department === d.name); }).length;
        return '<tr>' +
          '<td><span class="task-card-num">' + (i + 1) + '</span></td>' +
          '<td><strong>' + esc(d.name) + '</strong></td>' +
          '<td class="muted">' + esc(d.desc || '-') + '</td>' +
          '<td>' + (d.headcount || '-') + ' <span class="muted">(实际 ' + members + ')</span></td>' +
          '<td class="muted">' + esc((d.created_at || '').slice(0, 10)) + '</td>' +
          '<td><button class="btn-ghost" data-edit="' + d._id + '">编辑</button> ' +
          '<button class="btn-danger" data-del="' + d._id + '">删除</button></td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>';
    host.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openForm(loadDepts().find(function (d) { return d._id === this.dataset.edit; }.bind(b))); }.bind(b));
    });
    host.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = this.dataset.del;
        confirmDialog('删除部门', '确认删除该部门?该部门人员不会被删除,但会失去所属部门。', function () {
          var l = loadDepts().filter(function (d) { return d._id !== id; });
          saveDepts(l); paint();
        });
      });
    });
  }

  paint();
  document.getElementById('dNew').addEventListener('click', function () { openForm(null); });

  function openForm(rec) {
    rec = rec || { name: '', desc: '', headcount: 0 };
    var html = '<div class="modal-backdrop" id="dModal"><div class="modal" style="max-width:480px">' +
      '<div class="modal-head"><h3>' + (rec._id ? '编辑部门' : '添加部门') + '</h3>' +
      '<button class="modal-close" id="dCancel">×</button></div>' +
      '<div class="modal-body"><div class="form-grid">' +
      '<div class="field-row full"><label class="field-label"><span class="required">*</span>部门名称</label>' +
      '<input class="input" id="dName" value="' + esc(rec.name) + '"></div>' +
      '<div class="field-row full"><label class="field-label">部门说明</label>' +
      '<textarea class="input" id="dDesc" rows="2">' + esc(rec.desc || '') + '</textarea></div>' +
      '<div class="field-row"><label class="field-label">编制人数</label>' +
      '<input class="input" type="number" min="0" id="dHead" value="' + (rec.headcount || 0) + '"></div>' +
      '</div></div>' +
      '<div class="modal-foot"><button class="btn-ghost" id="dCancel2">取消</button>' +
      '<button class="btn-success" id="dSave">' + (rec._id ? '保存修改' : '确认添加') + '</button></div>' +
      '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('dCancel').onclick = document.getElementById('dCancel2').onclick = closeModal;
    document.getElementById('dSave').onclick = function () {
      var name = document.getElementById('dName').value.trim();
      if (!name) { toast('请填写部门名称', 'warn'); return; }
      var l = loadDepts();
      if (rec._id) {
        var i = l.findIndex(function (x) { return x._id === rec._id; });
        l[i].name = name;
        l[i].desc = document.getElementById('dDesc').value;
        l[i].headcount = parseInt(document.getElementById('dHead').value, 10) || 0;
      } else {
        l.unshift({ _id: 'd_' + uuid().substring(0, 8), name: name,
          desc: document.getElementById('dDesc').value,
          headcount: parseInt(document.getElementById('dHead').value, 10) || 0,
          created_at: new Date().toISOString() });
      }
      saveDepts(l);
      closeModal(); paint();
      toast('已保存', 'success');
    };
  }
  function closeModal() { var m = document.getElementById('dModal'); if (m) m.remove(); }
}
window.initDepartmentsPage = initDepartmentsPage;
window.addEventListener('DOMContentLoaded', initDepartmentsPage);
if (document.readyState !== 'loading') initDepartmentsPage();
