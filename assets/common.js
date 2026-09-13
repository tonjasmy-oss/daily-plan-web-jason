/* ============================================================
 * 公共工具：数据库 API 数据层 + 状态常量 + 格式化
 * v2.0：数据改由后端 SQLite 数据库管理（server/app.py）
 *       页面加载时经 /api/bootstrap 拉取全量数据到内存缓存，
 *       CRUD 同步写缓存、异步防抖同步回数据库。
 * ============================================================ */

/* ===== 本地登录态键（仅记住"当前用户ID"，数据在服务器） ===== */
var STORAGE_KEYS = {
  CURRENT_USER: 'eng_ms_current_user_v1'
};

/* ===== 内存数据缓存 ===== */
var DB = {
  members: [], projects: [], tasks: [], reports: [],
  dailyPlans: [], weeklyPlans: [], weeklyReports: [],
  purchases: [], approvals: [], departments: [], roles: [],
  purchaseGroups: [],
  settings: {},
  loaded: false, _loading: null
};

/* ===== 角色 (沿用旧名以免破坏现有 JS 调用) ===== */
var ROLE = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  WORKER: 'worker',
  VIEWER: 'viewer'
};

var ROLE_TEXT = {
  admin: '管理员',
  manager: '项目经理',
  worker: '工人',
  viewer: '观察者'
};

var ROLE_ICON = {
  admin: 'admin',
  manager: 'manager',
  worker: 'worker',
  viewer: 'viewer'
};

/* ===== 项目状态 ===== */
var PROJECT_STATUS = {
  PLANNING: 'planning',
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ARCHIVED: 'archived'
};

var PROJECT_STATUS_TEXT = {
  planning: '规划中',
  active: '进行中',
  paused: '暂停',
  completed: '已完工',
  archived: '已归档'
};

/* 与 styles.css 的 --primary/--info/--warning/--accent/--text-muted 对齐 */
var PROJECT_STATUS_COLOR = {
  planning: '#00B0F4',   /* info */
  active: '#35ED7E',     /* success */
  paused: '#F59E0B',     /* warning */
  completed: '#EC48BD',  /* accent */
  archived: '#7E84A8'    /* muted */
};

/* ===== 任务状态 ===== */
var TASK_STATUS = {
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  REVIEW: 'review',
  DONE: 'done',
  BLOCKED: 'blocked'
};

var TASK_STATUS_TEXT = {
  todo: '待办',
  in_progress: '进行中',
  review: '待验收',
  done: '已完成',
  blocked: '阻塞'
};

var TASK_STATUS_COLOR = {
  todo: '#7E84A8',       /* text-muted */
  in_progress: '#00B0F4',/* info */
  review: '#F59E0B',     /* warning */
  done: '#35ED7E',       /* success */
  blocked: '#ED4245'     /* danger */
};

/* ===== 任务优先级 ===== */
var PRIORITY = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent'
};

var PRIORITY_TEXT = {
  low: '低',
  normal: '中',
  high: '高',
  urgent: '紧急'
};

var PRIORITY_COLOR = {
  low: '#35ED7E',
  normal: '#00B0F4',
  high: '#F59E0B',
  urgent: '#ED4245'
};

/* ===== 日报状态 ===== */
var REPORT_STATUS_TEXT = {
  draft: '草稿',
  submitted: '已提交',
  signed: '已签名',
  rejected: '已驳回'
};

var REPORT_STATUS_COLOR = {
  draft: '#7E84A8',
  submitted: '#00B0F4',
  signed: '#35ED7E',
  rejected: '#ED4245'
};

/* ===== 工种 ===== */
var WORK_TYPE = {
  GENERAL: '普工',
  CARPENTER: '木工',
  MASON: '瓦工',
  ELECTRICIAN: '电工',
  PLUMBER: '水工',
  WELDER: '焊工',
  PAINTER: '油漆工',
  STEEL: '钢筋工',
  CRANE: '起重工',
  FOREMAN: '工长',
  OTHER: '其他'
};

/* ============================================================
 * 数据库同步（fetch + 防抖 + 顺序保证）
 * ============================================================ */

var _syncTimers = {};   /* key -> setTimeout 句柄（PUT 防抖合并） */
var _pendingData = {};  /* key -> 待提交的最新数据 */
var _chain = Promise.resolve();  /* 每条记录的请求按序执行 */

function _syncNow(method, url, body) {
  _chain = _chain.then(function () {
    return fetch(url, {
      method: method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 401) {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        location.href = 'login.html';
        throw new Error('未登录');
      }
      return r.json();
    }).catch(function (e) {
      if (e && e.message === '未登录') throw e;
      console.error('数据同步失败', method, url, e);
      toast('数据同步失败，请确认服务已启动', 'error');
    });
  });
  return _chain;
}

/* PUT 防抖 400ms 合并（进度滑块等高频操作）；POST/DELETE 立即发送 */
function _syncRecord(method, url, body) {
  if (method === 'PUT') {
    var key = 'PUT ' + url;
    _pendingData[key] = body;
    clearTimeout(_syncTimers[key]);
    _syncTimers[key] = setTimeout(function () {
      var data = _pendingData[key];
      delete _pendingData[key];
      delete _syncTimers[key];
      _syncNow('PUT', url, data);
    }, 400);
  } else {
    _syncNow(method, url, body);
  }
}

/* 启动时从数据库拉取全量数据 */
function bootstrapDB() {
  if (DB.loaded) return Promise.resolve();
  if (DB._loading) return DB._loading;
  if (location.protocol === 'file:') {
    toast('请通过 http://localhost:8080 访问，不要双击 HTML', 'error');
    return Promise.reject(new Error('file-protocol'));
  }
  DB._loading = fetch('/api/bootstrap', { credentials: 'same-origin' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (res) {
      DB.members = res.members || [];
      DB.projects = res.projects || [];
      DB.tasks = res.tasks || [];
      DB.reports = res.reports || [];
      DB.dailyPlans = res.daily_plans || [];
      DB.weeklyPlans = res.weekly_plans || [];
      DB.weeklyReports = res.weekly_reports || [];
      DB.purchases = res.purchases || [];
      DB.purchaseGroups = res.purchase_groups || [];
      DB.approvals = res.approvals || [];
      DB.departments = res.departments || [];
      DB.roles = res.roles || [];
      DB.settings = res.settings || {};
      DB.loaded = true;
      DB._loading = null;
    })
    .catch(function (e) {
      DB._loading = null;
      if (e && e.message === 'file-protocol') throw e;
      console.error('bootstrapDB 失败', e);
      toast('无法连接服务器，请启动 start.bat 后访问 http://localhost:8080', 'error');
      throw e;
    });
  return DB._loading;
}

/* ===== 缓存查找 ===== */
function _findById(arr, id) { return arr.find(function (r) { return r._id === id; }) || null; }
function _findIdx(arr, id) { return arr.findIndex(function (r) { return r._id === id; }); }

/* ============================================================
 * 项目 CRUD
 * ============================================================ */
function loadProjects() { return DB.projects; }
function getProject(id) { return _findById(DB.projects, id); }
function createProject(data) {
  var now = new Date().toISOString();
  var rec = Object.assign({
    _id: uuid(),
    name: '',
    code: '',
    description: '',
    location: '',
    managerId: '',
    memberIds: [],
    startDate: '',
    endDate: '',
    status: PROJECT_STATUS.PLANNING,
    progress: 0,
    tags: [],
    created_at: now,
    updated_at: now
  }, data);
  rec._id = rec._id || uuid();
  DB.projects.push(rec);
  _syncNow('POST', '/api/projects', rec);
  return rec;
}
function updateProject(id, patch) {
  var idx = _findIdx(DB.projects, id);
  if (idx < 0) return null;
  DB.projects[idx] = Object.assign({}, DB.projects[idx], patch, { updated_at: new Date().toISOString() });
  _syncRecord('PUT', '/api/projects/' + id, DB.projects[idx]);
  return DB.projects[idx];
}
function deleteProject(id) {
  var tasks = DB.tasks.filter(function (t) { return t.projectId === id; });
  DB.projects = DB.projects.filter(function (r) { return r._id !== id; });
  DB.tasks = DB.tasks.filter(function (t) { return t.projectId !== id; });
  _syncNow('DELETE', '/api/projects/' + id);
  /* 服务器端联删任务；客户端不再逐个发请求 */
}

/* ============================================================
 * 人员 CRUD
 * ============================================================ */
function loadMembers() { return DB.members; }
function getMember(id) { return _findById(DB.members, id); }
function createMember(data) {
  var now = new Date().toISOString();
  var rec = Object.assign({
    _id: uuid(),
    name: '',
    role: ROLE.WORKER,
    phone: '',
    workType: WORK_TYPE.GENERAL,
    avatar: '',
    active: true,
    joinDate: todayStr(),
    created_at: now
  }, data);
  rec._id = rec._id || uuid();
  DB.members.push(rec);
  _syncNow('POST', '/api/members', rec);
  return rec;
}
function updateMember(id, patch) {
  var idx = _findIdx(DB.members, id);
  if (idx < 0) return null;
  DB.members[idx] = Object.assign({}, DB.members[idx], patch);
  _syncRecord('PUT', '/api/members/' + id, DB.members[idx]);
  return DB.members[idx];
}
function deleteMember(id) {
  DB.members = DB.members.filter(function (r) { return r._id !== id; });
  /* 解除项目/任务关联（缓存 + 逐条同步，量小可直接发） */
  DB.projects.forEach(function (p) {
    var changed = false;
    if (p.managerId === id) { p.managerId = ''; changed = true; }
    if ((p.memberIds || []).indexOf(id) >= 0) {
      p.memberIds = p.memberIds.filter(function (x) { return x !== id; });
      changed = true;
    }
    if (changed) _syncRecord('PUT', '/api/projects/' + p._id, p);
  });
  DB.tasks.forEach(function (t) {
    if (t.assigneeId === id) {
      t.assigneeId = '';
      _syncRecord('PUT', '/api/tasks/' + t._id, t);
    }
  });
  _syncNow('DELETE', '/api/members/' + id);
}

/* ============================================================
 * 任务 CRUD
 * ============================================================ */
function loadTasks() { return DB.tasks; }
function getTask(id) { return _findById(DB.tasks, id); }
function createTask(data) {
  var now = new Date().toISOString();
  var rec = Object.assign({
    _id: uuid(),
    projectId: '',
    title: '',
    description: '',
    assigneeId: '',
    reporterId: '',
    priority: PRIORITY.NORMAL,
    status: TASK_STATUS.TODO,
    startDate: todayStr(),
    dueDate: '',
    progress: 0,
    tags: [],
    comments: [],
    history: [{ from: null, to: TASK_STATUS.TODO, ts: now, userId: data.reporterId || '' }],
    created_at: now,
    updated_at: now
  }, data);
  rec._id = rec._id || uuid();
  DB.tasks.push(rec);
  _syncNow('POST', '/api/tasks', rec);
  if (rec.projectId) syncProjectProgress(rec.projectId);
  return rec;
}
function updateTask(id, patch) {
  var idx = _findIdx(DB.tasks, id);
  if (idx < 0) return null;
  if (patch.status && patch.status !== DB.tasks[idx].status) {
    var hist = (DB.tasks[idx].history || []).slice();
    hist.push({
      from: DB.tasks[idx].status,
      to: patch.status,
      ts: new Date().toISOString(),
      userId: patch._changedBy || ''
    });
    patch.history = hist;
    delete patch._changedBy;
  }
  DB.tasks[idx] = Object.assign({}, DB.tasks[idx], patch, { updated_at: new Date().toISOString() });
  _syncRecord('PUT', '/api/tasks/' + id, DB.tasks[idx]);
  if (DB.tasks[idx].projectId) syncProjectProgress(DB.tasks[idx].projectId);
  return DB.tasks[idx];
}
function deleteTask(id) {
  var t = getTask(id);
  DB.tasks = DB.tasks.filter(function (r) { return r._id !== id; });
  _syncNow('DELETE', '/api/tasks/' + id);
  if (t && t.projectId) syncProjectProgress(t.projectId);
}
function addTaskComment(id, userId, text) {
  var t = getTask(id);
  if (!t) return null;
  var comments = (t.comments || []).slice();
  comments.push({ userId: userId, text: text, ts: new Date().toISOString() });
  return updateTask(id, { comments: comments });
}

function syncProjectProgress(projectId) {
  var tasks = DB.tasks.filter(function (t) { return t.projectId === projectId; });
  var avg = tasks.length === 0 ? 0 :
    Math.round(tasks.reduce(function (s, t) { return s + (Number(t.progress) || 0); }, 0) / tasks.length);
  var p = getProject(projectId);
  if (p && p.progress !== avg) {
    p.progress = avg;
    p.updated_at = new Date().toISOString();
    _syncRecord('PUT', '/api/projects/' + projectId, p);
  }
}

/* ============================================================
 * 当前用户（会话登录，数据在服务器）
 * ============================================================ */
function getCurrentUser() {
  try {
    var raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (!raw) return null;
    var id = JSON.parse(raw);
    return getMember(id) || null;
  } catch (e) {
    return null;
  }
}

/* 异步登录：建立服务器会话 + 记住本地用户ID */
function login(userId) {
  return fetch('/api/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId: userId })
  }).then(function (r) { return r.json(); }).then(function (res) {
    if (!res.user) throw new Error('登录失败');
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(userId));
    return res.user;
  });
}

function logout() {
  localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  return fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
}

/* 异步守卫：先拉取数据，再校验登录态 */
function requireLogin() {
  return bootstrapDB().then(function () {
    var u = getCurrentUser();
    if (!u) {
      var ret = encodeURIComponent(location.pathname + location.search);
      location.href = 'login.html?return=' + ret;
      return null;
    }
    return u;
  }).catch(function () { return null; });
}

/* ============================================================
 * 日计划填报 CRUD (走 /api/daily-plans)
 * ============================================================ */
function loadDailyPlans() { return DB.dailyPlans; }
function getDailyPlan(id) { return _findById(DB.dailyPlans, id); }
function createDailyPlan(data) {
  var rec = Object.assign({
    _id: 'dp_' + uuid(),
    date: todayStr(), plan_date: todayStr(),
    status: 'draft', tasks: [], crew: { night: [], rest: [], adjust: [] },
    remarks: '', submitter: '', approver: '',
    created_at: new Date().toISOString()
  }, data);
  rec._id = rec._id || ('dp_' + uuid());
  DB.dailyPlans.unshift(rec);
  _syncNow('POST', '/api/daily-plans', rec);
  return rec;
}
function updateDailyPlan(id, patch) {
  var idx = _findIdx(DB.dailyPlans, id);
  if (idx < 0) return null;
  DB.dailyPlans[idx] = Object.assign({}, DB.dailyPlans[idx], patch, { updated_at: new Date().toISOString() });
  _syncRecord('PUT', '/api/daily-plans/' + id, DB.dailyPlans[idx]);
  return DB.dailyPlans[idx];
}
function deleteDailyPlan(id) {
  DB.dailyPlans = DB.dailyPlans.filter(function (r) { return r._id !== id; });
  _syncNow('DELETE', '/api/daily-plans/' + id);
}

/* ===== 周计划填报 CRUD ===== */
function loadWeeklyPlans() { return DB.weeklyPlans; }
function createWeeklyPlan(data) {
  var rec = Object.assign({
    _id: 'wp_' + uuid(),
    week_start: '', week_end: '', title: '',
    status: 'draft', content: '', members: [],
    submitter: '', approver: '',
    created_at: new Date().toISOString()
  }, data);
  DB.weeklyPlans.unshift(rec);
  _syncNow('POST', '/api/weekly-plans', rec);
  return rec;
}
function updateWeeklyPlan(id, patch) {
  var idx = _findIdx(DB.weeklyPlans, id);
  if (idx < 0) return null;
  DB.weeklyPlans[idx] = Object.assign({}, DB.weeklyPlans[idx], patch, { updated_at: new Date().toISOString() });
  _syncRecord('PUT', '/api/weekly-plans/' + id, DB.weeklyPlans[idx]);
  return DB.weeklyPlans[idx];
}
function deleteWeeklyPlan(id) {
  DB.weeklyPlans = DB.weeklyPlans.filter(function (r) { return r._id !== id; });
  _syncNow('DELETE', '/api/weekly-plans/' + id);
}

/* ===== 计划周报 CRUD ===== */
function loadWeeklyReports() { return DB.weeklyReports; }
function createWeeklyReport(data) {
  var rec = Object.assign({
    _id: 'wr_' + uuid(),
    week_start: '', week_end: '', title: '',
    status: 'draft', summary: '', items: [],
    submitter: '', approver: '',
    created_at: new Date().toISOString()
  }, data);
  DB.weeklyReports.unshift(rec);
  _syncNow('POST', '/api/weekly-reports', rec);
  return rec;
}
function updateWeeklyReport(id, patch) {
  var idx = _findIdx(DB.weeklyReports, id);
  if (idx < 0) return null;
  DB.weeklyReports[idx] = Object.assign({}, DB.weeklyReports[idx], patch, { updated_at: new Date().toISOString() });
  _syncRecord('PUT', '/api/weekly-reports/' + id, DB.weeklyReports[idx]);
  return DB.weeklyReports[idx];
}
function deleteWeeklyReport(id) {
  DB.weeklyReports = DB.weeklyReports.filter(function (r) { return r._id !== id; });
  _syncNow('DELETE', '/api/weekly-reports/' + id);
}

/* ===== 物资申购 CRUD ===== */
function loadPurchases() { return DB.purchases; }
function createPurchase(data) {
  var rec = Object.assign({
    _id: 'pu_' + uuid(),
    date: todayStr(), name: '', spec: '', unit: '', qty: '',
    total: 0, items: [], projectId: '',
    reason: '', status: 'draft',
    applicant: '', approver: '',
    created_at: new Date().toISOString()
  }, data);
  DB.purchases.unshift(rec);
  _syncNow('POST', '/api/purchases', rec);
  return rec;
}
function updatePurchase(id, patch) {
  var idx = _findIdx(DB.purchases, id);
  if (idx < 0) return null;
  DB.purchases[idx] = Object.assign({}, DB.purchases[idx], patch, { updated_at: new Date().toISOString() });
  _syncRecord('PUT', '/api/purchases/' + id, DB.purchases[idx]);
  return DB.purchases[idx];
}
function deletePurchase(id) {
  DB.purchases = DB.purchases.filter(function (r) { return r._id !== id; });
  _syncNow('DELETE', '/api/purchases/' + id);
}

/* ===== 审批管理 CRUD ===== */
function loadApprovals() { return DB.approvals; }
function createApproval(data) {
  var rec = Object.assign({
    _id: 'ap_' + uuid(),
    type: 'generic', ref_id: '', title: '',
    status: 'pending', applicant: '', approver: '',
    reason: '', payload: {},
    created_at: new Date().toISOString()
  }, data);
  DB.approvals.unshift(rec);
  _syncNow('POST', '/api/approvals', rec);
  return rec;
}
function updateApproval(id, patch) {
  var idx = _findIdx(DB.approvals, id);
  if (idx < 0) return null;
  DB.approvals[idx] = Object.assign({}, DB.approvals[idx], patch, { updated_at: new Date().toISOString() });
  _syncRecord('PUT', '/api/approvals/' + id, DB.approvals[idx]);
  return DB.approvals[idx];
}
function deleteApproval(id) {
  DB.approvals = DB.approvals.filter(function (r) { return r._id !== id; });
  _syncNow('DELETE', '/api/approvals/' + id);
}

/* ===== 物资申购合并批次 CRUD (仅管理端使用) ===== */
function loadPurchaseGroups() { return DB.purchaseGroups; }
function createPurchaseGroup(data) {
  var rec = Object.assign({
    _id: 'pg_' + uuid(),
    name: '', created_by: '',
    created_at: new Date().toISOString()
  }, data);
  DB.purchaseGroups.unshift(rec);
  _syncNow('POST', '/api/purchase-groups', rec);
  return rec;
}
function updatePurchaseGroup(id, patch) {
  var idx = _findIdx(DB.purchaseGroups, id);
  if (idx < 0) return null;
  DB.purchaseGroups[idx] = Object.assign({}, DB.purchaseGroups[idx], patch, { updated_at: new Date().toISOString() });
  _syncRecord('PUT', '/api/purchase-groups/' + id, DB.purchaseGroups[idx]);
  return DB.purchaseGroups[idx];
}
function deletePurchaseGroup(id) {
  DB.purchaseGroups = DB.purchaseGroups.filter(function (r) { return r._id !== id; });
  _syncNow('DELETE', '/api/purchase-groups/' + id);
}

/* ===== 部门管理 CRUD ===== */
function loadDepartments() { return DB.departments; }
function createDepartment(data) {
  var rec = Object.assign({
    _id: 'd_' + uuid(),
    name: '', code: '', parent_id: '', manager_id: '',
    description: '', sort_order: 0,
    created_at: new Date().toISOString()
  }, data);
  DB.departments.push(rec);
  _syncNow('POST', '/api/departments', rec);
  return rec;
}
function updateDepartment(id, patch) {
  var idx = _findIdx(DB.departments, id);
  if (idx < 0) return null;
  DB.departments[idx] = Object.assign({}, DB.departments[idx], patch, { updated_at: new Date().toISOString() });
  _syncRecord('PUT', '/api/departments/' + id, DB.departments[idx]);
  return DB.departments[idx];
}
function deleteDepartment(id) {
  DB.departments = DB.departments.filter(function (r) { return r._id !== id; });
  _syncNow('DELETE', '/api/departments/' + id);
}

/* ===== 角色权限 CRUD ===== */
function loadRoles() { return DB.roles; }
function createRole(data) {
  var rec = Object.assign({
    _id: 'r_' + uuid(),
    key: '', name: '', description: '',
    permissions: [], sort_order: 0,
    created_at: new Date().toISOString()
  }, data);
  DB.roles.push(rec);
  _syncNow('POST', '/api/roles', rec);
  return rec;
}
function updateRole(id, patch) {
  var idx = _findIdx(DB.roles, id);
  if (idx < 0) return null;
  DB.roles[idx] = Object.assign({}, DB.roles[idx], patch, { updated_at: new Date().toISOString() });
  _syncRecord('PUT', '/api/roles/' + id, DB.roles[idx]);
  return DB.roles[idx];
}
function deleteRole(id) {
  DB.roles = DB.roles.filter(function (r) { return r._id !== id; });
  _syncNow('DELETE', '/api/roles/' + id);
}

/* ===== 系统参数 (KV) ===== */
function getSetting(key, defaultValue) {
  return DB.settings[key] !== undefined ? DB.settings[key] : defaultValue;
}
function setSetting(key, value) {
  DB.settings[key] = value;
  _syncNow('POST', '/api/settings', { key: key, value: value });
}

/* ============================================================
 * 附件文件管理 (仅管理员) —— 系统参数里可配置存储路径
 * ============================================================ */
/* 列出某相对路径下的文件/子目录(相对附件根目录) */
function listFiles(path) {
  var q = path ? ('?path=' + encodeURIComponent(path)) : '';
  return fetch('/api/files' + q, { credentials: 'same-origin' }).then(function (r) {
    if (r.status === 401) { localStorage.removeItem(STORAGE_KEYS.CURRENT_USER); location.href = 'login.html'; throw new Error('未登录'); }
    if (r.status === 403) throw new Error('需要管理员权限');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}
/* 单张下载直链(交给浏览器处理 disposition) */
function downloadFileUrl(path) {
  return '/api/files/download?path=' + encodeURIComponent(path);
}
/* 批量下载: 返回 zip Blob */
function downloadZip(paths) {
  return fetch('/api/files/zip', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: paths || [] })
  }).then(function (r) {
    if (r.status === 401) { localStorage.removeItem(STORAGE_KEYS.CURRENT_USER); location.href = 'login.html'; throw new Error('未登录'); }
    if (r.status === 403) throw new Error('需要管理员权限');
    if (!r.ok) throw new Error('打包失败 HTTP ' + r.status);
    return r.blob();
  });
}
/* 触发浏览器下载一个 Blob */
function saveBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}
/* 触发浏览器下载一个 URL */
function saveUrl(url, filename) {
  var a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}
/* 人类可读字节 */
function formatBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}

/* ===== 一键迁移 localStorage -> 服务端 ===== */
function migrateLocalStorageToServer() {
  var payload = {};
  ['daily_plans', 'weekly_plans', 'weekly_reports', 'purchases',
   'approvals', 'departments', 'roles'].forEach(function (k) {
    try {
      var raw = localStorage.getItem('engms_' + k + '_v1');
      if (raw) payload[k] = JSON.parse(raw);
    } catch (e) {}
  });
  try {
    var settingsRaw = localStorage.getItem('engms_settings_v1');
    if (settingsRaw) payload.settings = JSON.parse(settingsRaw);
  } catch (e) {}

  if (Object.keys(payload).length === 0) return Promise.resolve({ ok: true, migrated: 0 });
  return fetch('/api/migrate', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(function (r) { return r.json(); });
}

function isAdmin() {
  var u = getCurrentUser();
  return u && u.role === ROLE.ADMIN;
}
function canManage() {
  var u = getCurrentUser();
  return u && (u.role === ROLE.ADMIN || u.role === ROLE.MANAGER);
}

/* ===== ID 生成 ===== */
function uuid() {
  return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/* ===== 校验 ===== */
function validateProject(p) {
  if (!p.name || !p.name.trim()) return '请输入项目名称';
  if (!p.startDate) return '请选择开始日期';
  if (p.endDate && p.startDate && p.endDate < p.startDate) return '结束日期不能早于开始日期';
  return null;
}
function validateMember(m) {
  if (!m.name || !m.name.trim()) return '请输入姓名';
  return null;
}
function validateTask(t) {
  if (!t.title || !t.title.trim()) return '请输入任务标题';
  if (!t.projectId) return '请选择所属项目';
  return null;
}

/* ===== 格式化 ===== */
function todayStr() { return formatDateStr(new Date()); }
function formatDateStr(d) {
  d = (d instanceof Date) ? d : new Date(d);
  if (isNaN(d.getTime())) return '';
  var pad = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function formatDateTime(d) {
  d = (d instanceof Date) ? d : new Date(d);
  if (isNaN(d.getTime())) return '';
  var pad = function (n) { return String(n).padStart(2, '0'); };
  return formatDateStr(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function formatRelative(d) {
  d = (d instanceof Date) ? d : new Date(d);
  var now = new Date();
  var diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  if (diff < 604800) return Math.floor(diff / 86400) + ' 天前';
  return formatDateStr(d);
}
function daysBetween(d1, d2) {
  d1 = new Date(d1); d2 = new Date(d2);
  return Math.round((d2 - d1) / 86400000);
}

/* 'YYYY-MM-DD' -> 'YYYY年M月D日' (非法输入原样返回) */
function cnDateText(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  if (!m) return s || '';
  return m[1] + '年' + parseInt(m[2], 10) + '月' + parseInt(m[3], 10) + '日';
}

/* 日期加减天数 -> 'YYYY-MM-DD' */
function addDaysStr(dateStr, n) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  if (!m) return '';
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + Number(n || 0));
  return formatDateStr(d);
}

/* 自然周(周一~周日) */
function getWeekRange(d) {
  d = d || new Date();
  var dt = new Date(d);
  var day = (dt.getDay() + 6) % 7;
  var mon = new Date(dt); mon.setDate(dt.getDate() - day);
  var sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { start: formatDateStr(mon), end: formatDateStr(sun) };
}

/* 日报表的"计划日期": 优先取计划工作日期, 旧记录回落到填报日期 */
function reportPlanDate(rec) {
  if (!rec) return '';
  return rec.plan_date || rec.date || '';
}

/* 日报表标题
 *   审批通过(signed) -> 「{计划工作日期}年M月D日 计划工作完成情况 / 日常维修完成情况」
 *   其它状态         -> 「{计划日期} 日报表」
 * 类别取该记录勾选的标题分类(计划工作优先), 未分类时按「计划工作」处理 */
function reportDisplayTitle(rec) {
  if (!rec) return '';
  var pd = reportPlanDate(rec);
  var cats = rec.categories || {};
  var kind = cats.plan || !cats.repair ? '计划工作' : '日常维修';
  if (rec.status === 'signed' && pd) return cnDateText(pd) + kind + '完成情况';
  return pd ? (pd + ' 日报表') : '日报表';
}

/* ============================================================
 * 计划审批 (日计划 / 周计划 / 计划周报共用)
 *
 * 流程:
 *   填报人提交 -> status='pending'(待审批)
 *   审批人在通过前可「追加工作内容」(追加条目带 appended 标记)
 *   审批人通过 -> status='approved', 记录锁定, 只能在报表浏览页只读查看
 *   审批人驳回 -> status='rejected', 填报人可修改后重新提交
 *
 * 审批人 = 主管以上 (admin / manager), 与日计划填报页原有规则保持一致
 *
 * 追加条目存放位置随记录类型不同 (见 planAppendField):
 *   日计划 / 周计划 -> tasks[]   计划周报 -> items[] (周报没有任务列表)
 * ============================================================ */
var PLAN_APPROVE_ROLES = ['admin', 'manager'];
/* submitted 是计划周报改版前的旧状态值, 保留映射只为让老数据仍能正常显示 */
var PLAN_STATUS_TEXT = { draft: '草稿', pending: '待审批', approved: '已通过', rejected: '已驳回', submitted: '已提交' };

/* 当前用户是否具备计划类表单的审批权 */
function canApprovePlan(user) {
  return !!(user && PLAN_APPROVE_ROLES.indexOf(user.role) >= 0);
}

/* 是否处于"可追加工作内容"的窗口: 待审批 + 审批人 */
function planAppendable(rec, user) {
  return !!(rec && rec.status === 'pending' && canApprovePlan(user));
}

/* 生成一条"审批追加"的工作内容
 * 注意: 日计划任务字段名是 content, 周计划是 title —— 两个都写,
 * 两种记录(以及各自的导出/详情渲染)才能通用 */
function makeAppendedTask(content, user) {
  var text = String(content || '').trim();
  return {
    id: 'ap' + Math.random().toString(36).slice(2, 9),
    content: text, title: text,
    requirement: '', members: [], startTime: '', endTime: '',
    appended: true,
    appended_by: (user && user.name) || '',
    appended_at: new Date().toISOString()
  };
}

/* 审批追加条目挂在记录的哪个数组字段上
 *   日计划 / 周计划 -> tasks; 计划周报没有任务列表, 用一直空置的 items */
function planAppendField(tab) {
  return tab === 'wr' ? 'items' : 'tasks';
}

/* 逐行追加工作内容到记录, 返回成功追加的条数 (空行忽略)
 * field 省略时按 tasks 处理, 保持既有调用不变 */
function planAppendTasks(rec, text, user, field) {
  if (!rec) return 0;
  var key = field || 'tasks';
  var lines = String(text || '').split(/\r?\n/).map(function (s) { return s.trim(); })
    .filter(function (s) { return !!s; });
  if (lines.length === 0) return 0;
  if (!Array.isArray(rec[key])) rec[key] = [];
  lines.forEach(function (line) { rec[key].push(makeAppendedTask(line, user)); });
  return lines.length;
}

/* 记录里被审批追加的条目数 (field 省略时按 tasks 处理) */
function planAppendedCount(rec, field) {
  var key = field || 'tasks';
  return ((rec && rec[key]) || []).filter(function (t) { return t && t.appended; }).length;
}

/* ===== HTML 转义 ===== */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ===== URL 参数 ===== */
function queryParam(name) {
  var m = location.search.match(new RegExp('[?&]' + name + '=([^&]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

/* ===== Toast 提示 ===== */
function toast(msg, type) {
  type = type || '';
  document.querySelectorAll('.toast').forEach(function (el) { el.remove(); });
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, 2200);
}

/* ===== 确认弹窗 ===== */
function confirmDialog(title, content, onConfirm, onCancel) {
  document.querySelectorAll('.modal-overlay').forEach(function (el) { el.remove(); });
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="modal">' +
      '<div class="modal-header">' + esc(title) + '</div>' +
      '<div class="modal-body">' + esc(content) + '</div>' +
      '<div class="modal-footer">' +
        '<button class="btn btn-secondary modal-cancel">取消</button>' +
        '<button class="btn btn-primary modal-confirm">确定</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  var close = function () { overlay.remove(); };
  overlay.querySelector('.modal-cancel').onclick = function () {
    close();
    if (onCancel) onCancel();
  };
  overlay.querySelector('.modal-confirm').onclick = function () {
    close();
    if (onConfirm) onConfirm();
  };
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) {
      close();
      if (onCancel) onCancel();
    }
  });
}

/* ===== 输入弹窗 ===== */
function promptDialog(title, placeholder, defaultValue, onConfirm) {
  document.querySelectorAll('.modal-overlay').forEach(function (el) { el.remove(); });
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="modal">' +
      '<div class="modal-header">' + esc(title) + '</div>' +
      '<div class="modal-body"><input type="text" class="input prompt-input" value="' + esc(defaultValue || '') + '" placeholder="' + esc(placeholder || '') + '"></div>' +
      '<div class="modal-footer">' +
        '<button class="btn btn-secondary modal-cancel">取消</button>' +
        '<button class="btn btn-primary modal-confirm">确定</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  var input = overlay.querySelector('.prompt-input');
  input.focus();
  input.select();
  var close = function () { overlay.remove(); };
  overlay.querySelector('.modal-cancel').onclick = close;
  overlay.querySelector('.modal-confirm').onclick = function () {
    var val = input.value.trim();
    close();
    if (onConfirm) onConfirm(val);
  };
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') overlay.querySelector('.modal-confirm').click();
    if (e.key === 'Escape') close();
  });
}

/* ===== 多选勾选弹窗 =====
 * items: [{id, label, sublabel, color?}]
 * defaultSelectedIds: string[]
 * onConfirm: (ids: string[]) => void
 */
function multiSelectDialog(title, subTitle, items, defaultSelectedIds, onConfirm) {
  document.querySelectorAll('.modal-overlay').forEach(function (el) { el.remove(); });
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  var selected = (defaultSelectedIds || []).slice();

  function rowHtml(it) {
    var isSel = selected.indexOf(it.id) >= 0;
    return '<label class="msd-row' + (isSel ? ' is-selected' : '') + '" data-id="' + esc(it.id) + '">' +
      '<span class="msd-check">' +
        '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14"><polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</span>' +
      '<span class="msd-row-body">' +
        '<span class="msd-row-name">' + esc(it.label) + '</span>' +
        (it.sublabel ? '<span class="msd-row-sub">' + esc(it.sublabel) + '</span>' : '') +
      '</span>' +
    '</label>';
  }

  overlay.innerHTML =
    '<div class="modal modal-large msd">' +
      '<div class="modal-header">' +
        '<span>' + esc(title) + '</span>' +
        '<span class="msd-count" id="msdCount">已选 0 人</span>' +
      '</div>' +
      (subTitle ? '<div class="msd-subtitle">' + esc(subTitle) + '</div>' : '') +
      '<div class="modal-body msd-body">' +
        (items.length === 0
          ? '<div class="msd-empty">暂无可选人员</div>'
          : items.map(rowHtml).join('')) +
      '</div>' +
      '<div class="modal-footer">' +
        '<button class="btn btn-secondary modal-cancel">取消</button>' +
        '<button class="btn btn-primary modal-confirm">确定</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  function updateCount() {
    var c = overlay.querySelector('#msdCount');
    if (c) c.textContent = '已选 ' + selected.length + ' 人';
  }
  updateCount();

  var close = function () { overlay.remove(); };
  overlay.querySelectorAll('.msd-row').forEach(function (row) {
    row.addEventListener('click', function (e) {
      e.preventDefault();
      var id = row.dataset.id;
      var idx = selected.indexOf(id);
      if (idx >= 0) { selected.splice(idx, 1); row.classList.remove('is-selected'); }
      else { selected.push(id); row.classList.add('is-selected'); }
      updateCount();
    });
  });
  overlay.querySelector('.modal-cancel').onclick = close;
  overlay.querySelector('.modal-confirm').onclick = function () {
    close();
    if (onConfirm) onConfirm(selected.slice());
  };
  overlay.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
}

/* ===== 自定义表单弹窗 =====
 * bodyHtml: 任意 HTML(包含 input / select / textarea)
 * onSubmit(): 返回 false 时弹窗保持打开(用于表单校验不通过)
 * onCancel(): 点取消 / 关闭按钮时触发
 */
function confirmDialogEx(title, bodyHtml, onSubmit, onCancel) {
  document.querySelectorAll('.modal-overlay').forEach(function (el) { el.remove(); });
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  /* 让 overlay 能接收键盘事件 */
  overlay.setAttribute('tabindex', '-1');
  overlay.innerHTML =
    '<div class="modal modal-large" role="dialog" aria-modal="true">' +
      '<div class="modal-header">' + esc(title) + '</div>' +
      '<div class="modal-body">' + bodyHtml + '</div>' +
      '<div class="modal-footer">' +
        '<button class="btn btn-secondary modal-cancel">取消</button>' +
        '<button class="btn btn-primary modal-confirm">确定</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  var modal = overlay.querySelector('.modal');
  var close = function () {
    /* 仅在弹窗仍存在时移除 */
    if (overlay.parentNode) overlay.remove();
  };

  /* 第一个 input 自动 focus（防滚动 + 让浏览器完成布局后再 focus） */
  var firstInput = overlay.querySelector('input, select, textarea');
  if (firstInput && typeof firstInput.focus === 'function') {
    requestAnimationFrame(function () {
      try { firstInput.focus({ preventScroll: true }); } catch (_) { firstInput.focus(); }
    });
  }

  overlay.querySelector('.modal-cancel').onclick = function () {
    close();
    if (onCancel) onCancel();
  };
  overlay.querySelector('.modal-confirm').onclick = function () {
    if (onSubmit && onSubmit() === false) return;
    close();
  };

  /* 点击 overlay 空白处关闭 — 用 mousedown 比对,
   * 避免 click 与 mousedown 焦点切换的时序问题.
   * 关键: 只有 mousedown 的 target 是 overlay 本身时才视为"点空白处". */
  overlay.addEventListener('mousedown', function (e) {
    if (e.target === overlay) {
      overlay._bgMousedown = true;
    }
  });
  overlay.addEventListener('click', function (e) {
    /* 仅当 mousedown 也落在 overlay 上时才关闭（避免 input 内文字选区拖动时关闭） */
    if (e.target === overlay && overlay._bgMousedown) {
      overlay._bgMousedown = false;
      close();
      if (onCancel) onCancel();
    } else {
      overlay._bgMousedown = false;
    }
  });

  /* 阻止 modal 内文本选中拖出到 overlay 时的 click 误触 */
  modal.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  modal.addEventListener('click', function (e) { e.stopPropagation(); });

  /* Esc 关闭 + Tab 焦点陷阱 + 保护组合键(Ctrl+A / Ctrl+C / Shift+Tab 等) */
  overlay.addEventListener('keydown', function (e) {
    /* 带修饰键( Ctrl/Meta/Alt )的组合键一律不响应,避免误关 */
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      if (onCancel) onCancel();
    }
  });
}
window.confirmDialogEx = confirmDialogEx;
