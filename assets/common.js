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
  purchaseGroups: [], workTypes: [],
  settings: {},
  loaded: false, _loading: null
};

/* ===== 角色 =====
 * 唯一事实来源是 roles 表 (/api/roles), 这里只提供代码内引用的常量 key,
 * 以及 roles 表尚未加载时的兜底文案。4 个规范角色 key:
 *   admin(管理员) / lead(工程主管) / foreman(工程班长) / worker(综合维修工)
 * manager / viewer 是历史遗留 key, 仅用于兼容未迁移的老数据, 不要在新代码中使用。 */
var ROLE = {
  ADMIN: 'admin',
  LEAD: 'lead',
  FOREMAN: 'foreman',
  WORKER: 'worker'
};

/* 角色中文名兜底 (roles 表命中时优先用表里的 name) */
var ROLE_TEXT = {
  admin: '管理员',
  lead: '工程主管',
  foreman: '工程班长',
  worker: '综合维修工',
  /* --- 历史遗留 key --- */
  manager: '工程主管',
  viewer: '综合维修工'
};

/* 角色图标 (纯装饰) */
var ROLE_ICON = {
  admin: '🛡️',
  lead: '📋',
  foreman: '🧰',
  worker: '🔧',
  /* --- 历史遗留 key --- */
  manager: '📋',
  viewer: '🔧'
};

/* 角色显示名 / 配色: 全局共享, 供日报表、日计划的人员标签使用
 * (原先在 report.js / daily-plan.js 各自局部声明, 作用域错位导致抛异常) */
var ROLE_DISPLAY = ROLE_TEXT;
var ROLE_COLOR = {
  admin: '#ED4245',
  lead: '#5865F2',
  foreman: '#FAA61A',
  worker: '#35ED7E',
  /* --- 历史遗留 key --- */
  manager: '#5865F2',
  viewer: '#7E84A8'
};
var ROLE_TAG_BG = {
  admin: 'rgba(237,66,69,.15)',
  lead: 'rgba(88,101,242,.15)',
  foreman: 'rgba(250,166,26,.15)',
  worker: 'rgba(53,237,126,.15)',
  /* --- 历史遗留 key --- */
  manager: 'rgba(88,101,242,.15)',
  viewer: 'rgba(126,132,168,.15)'
};

/* 角色中文名: 优先查 roles 表 (W13 用户角色), 没匹配再回落到旧 ROLE_TEXT
 * 替代散落各处的 ROLE_TEXT[m.role] 写法, 兼容老硬编码 */
function roleLabel(key) {
  if (!key) return '未分配';
  try {
    var roles = (typeof DB !== 'undefined' && DB.roles) ? DB.roles : (loadRoles ? loadRoles() : []);
    var hit = (roles || []).filter(function (r) { return r.key === key; })[0];
    if (hit) return hit.name;
  } catch (_) { /* loadRoles 还没就绪 */ }
  return ROLE_TEXT[key] || key;
}
/* 角色图标: 与 roleLabel 同样的回退逻辑 */
function roleIcon(key) {
  var roles = (typeof DB !== 'undefined' && DB.roles) ? DB.roles : (loadRoles ? loadRoles() : []);
  var hit = (roles || []).filter(function (r) { return r.key === key; })[0];
  if (hit && hit.icon) return hit.icon;
  return ROLE_ICON[key] || key;
}

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

/* ===== 工种 =====
 * 实际工种数据走服务端 work_types 表 (DB.workTypes).
 * WORK_TYPE 仅作为离线下拉/老数据回退, 不再被默认业务逻辑引用.
 * 新成员默认无工种 (空串), 由管理员在下拉中手动选择.
 */
var WORK_TYPE_FALLBACK = [
  '电工', '综合维修工', '弱电维修工', '工程班长',
  '秩序员', '客服管家', '资料员', '工程主管', '系统管理员'
];
function loadWorkTypes() {
  return (DB.workTypes && DB.workTypes.length)
    ? DB.workTypes.slice().sort(function (a, b) {
        return (a.sort_order - b.sort_order) || (a.name < b.name ? -1 : 1);
      })
    : WORK_TYPE_FALLBACK.map(function (n, i) {
        return { _id: 'fallback_' + i, name: n, sort_order: i };
      });
}
function workTypeNames() {
  return loadWorkTypes().map(function (w) { return w.name; });
}
async function createWorkType(data) {
  var rec = Object.assign({
    _id: 'wt_' + uuid(),
    name: '', sort_order: 0,
    created_at: new Date().toISOString()
  }, data);
  rec.name = (rec.name || '').trim();
  if (!rec.name) throw new Error('工种名称不能为空');
  // 重名不新增
  var existed = DB.workTypes.find(function (w) { return w.name === rec.name; });
  if (existed) return existed;
  DB.workTypes.push(rec);
  var resp = await fetch('/api/work-types', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: rec.name, sort_order: rec.sort_order })
  });
  if (!resp.ok) {
    DB.workTypes = DB.workTypes.filter(function (w) { return w._id !== rec._id; });
    var err = await resp.json().catch(function () { return {}; });
    throw new Error(err.error || ('HTTP ' + resp.status));
  }
  var body = await resp.json();
  if (body && body.record) {
    rec._id = body.record._id; rec.created_at = body.record.created_at;
  }
  return rec;
}
async function updateWorkType(id, patch) {
  var idx = _findIdx(DB.workTypes, id);
  if (idx < 0) return null;
  DB.workTypes[idx] = Object.assign({}, DB.workTypes[idx], patch, { updated_at: new Date().toISOString() });
  var resp = await fetch('/api/work-types/' + id, {
    method: 'PUT', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(DB.workTypes[idx])
  });
  if (!resp.ok) {
    var err = await resp.json().catch(function () { return {}; });
    throw new Error(err.error || ('HTTP ' + resp.status));
  }
  return DB.workTypes[idx];
}
async function deleteWorkType(id) {
  var existed = DB.workTypes.find(function (w) { return w._id === id; });
  if (!existed) return;
  DB.workTypes = DB.workTypes.filter(function (w) { return w._id !== id; });
  var resp = await fetch('/api/work-types/' + id, {
    method: 'DELETE', credentials: 'same-origin'
  });
  if (!resp.ok) {
    DB.workTypes.push(existed);
    var err = await resp.json().catch(function () { return {}; });
    throw new Error(err.error || ('HTTP ' + resp.status));
  }
}
async function resetDefaultWorkTypes() {
  var resp = await fetch('/api/work-types/reset', {
    method: 'POST', credentials: 'same-origin'
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  // 重新拉取
  var r2 = await fetch('/api/work-types', { credentials: 'same-origin' });
  if (r2.ok) {
    var body = await r2.json();
    DB.workTypes = body.items || [];
  }
}

/* 旧常量 WORK_TYPE 保留为空对象, 防止其它旧模块引用时报错 */
var WORK_TYPE = {};

/* ============================================================
 * 数据库同步（fetch + 防抖 + 顺序保证）
 * ============================================================ */

var _syncTimers = {};   /* key -> setTimeout 句柄（PUT 防抖合并） */
var _pendingData = {};  /* key -> 待提交的最新数据 */
var _chains = {};       /* entity(如 projects) -> Promise 链：保证同实体写顺序，不同实体并行 */

/* ============================================================
 * 离线写队列 + 失败自动重试 (P0-1)
 * 原则：不改后端、不改页面调用行为。
 *  - 所有写请求(POST/PUT/DELETE)先落本地 Outbox(localStorage) 再发送，
 *    刷新 / 崩溃 / 断网都不会静默丢写；
 *  - 发送失败按指数退避自动重试(1s→2s→4s…封顶30s)，超出次数转 failed
 *    并等待“网络恢复 / 下次启动”重放；
 *  - 按实体分链，单一慢请求不再阻塞全部写入；
 *  - 401 跳登录页并停止该请求重试；window 'online' / bootstrap 成功后重放。
 * ============================================================ */
var OUTBOX_KEY = 'eng_ms_outbox_v1';
var _outbox = _loadOutbox();
var MAX_ATTEMPTS = 6;        /* 自动重试上限（之后转 failed 等待重放） */
var BASE_BACKOFF = 1000;     /* 初始退避 1s */
var MAX_BACKOFF = 30000;     /* 退避上限 30s */

function _entityOf(url) {
  var m = /\/api\/([^\/\?]+)/.exec(url || '');
  return m ? m[1] : 'misc';
}
function _loadOutbox() {
  try {
    var raw = localStorage.getItem(OUTBOX_KEY);
    var arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function _persistOutbox() {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(_outbox)); }
  catch (e) { console.warn('Outbox 持久化失败（可能超出本地容量）', e); }
}
function _outboxAdd(method, url, body) {
  var item = {
    id: uuid(), method: method, url: url, body: body,
    entity: _entityOf(url), attempt: 0,
    status: 'pending',          /* pending | sending | waiting | done | failed | auth_error */
    nextAt: 0, lastError: '', createdAt: new Date().toISOString()
  };
  _outbox.push(item); _persistOutbox();
  return item;
}
function _outboxRemove(id) {
  var i = _outbox.findIndex(function (x) { return x.id === id; });
  if (i >= 0) { _outbox.splice(i, 1); _persistOutbox(); }
}
function _fetchRaw(method, url, body) {
  return fetch(url, {
    method: method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  }).then(function (r) {
    if (r.status === 401) {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      location.href = 'login.html';
      throw new Error('未登录');
    }
    return r.json();
  });
}
/* 单次 HTTP 尝试；成功移出 Outbox，失败安排退避重试或转终态 */
function _attempt(item) {
  item.status = 'sending'; _persistOutbox();
  return _fetchRaw(item.method, item.url, item.body).then(function (res) {
    item.status = 'done'; item.res = res; _outboxRemove(item.id);
    return res;
  }, function (e) {
    if (e && e.message === '未登录') {
      item.status = 'auth_error'; _persistOutbox(); throw e;
    }
    item.attempt += 1;
    item.lastError = String((e && e.message) || e);
    if (item.attempt >= MAX_ATTEMPTS) {
      item.status = 'failed'; item.nextAt = 0; _persistOutbox();
      console.error('写请求重试超限，转入待重放队列', item.method, item.url, item.lastError);
      throw new Error('重试超限: ' + item.lastError);
    }
    var delay = Math.min(MAX_BACKOFF, BASE_BACKOFF * Math.pow(2, item.attempt - 1));
    item.nextAt = Date.now() + delay;
    item.status = 'waiting'; _persistOutbox();
    return new Promise(function (res) { setTimeout(res, delay); })
      .then(function () { return _attempt(item); });   /* 退避后递归重试 */
  });
}
/* 每个 item 一个稳定 deferred：重试多次也只 resolve/reject 一次（最终态） */
function _sendItem(item) {
  if (!item._deferred) {
    var d = {};
    d.p = new Promise(function (res, rej) { d.res = res; d.rej = rej; });
    item._deferred = d;
    _attempt(item).then(function (res) { d.res(res); }, function (err) { d.rej(err); });
  }
  return item._deferred.p;
}
/* 对外写入口：落 Outbox → 入实体链 → 首发出送；返回该 item 的 done promise */
function _syncNow(method, url, body) {
  var item = _outboxAdd(method, url, body);
  var p = _sendItem(item);                 /* 同步建 deferred 并启动首次发送 */
  var entity = item.entity;
  if (!_chains[entity]) _chains[entity] = Promise.resolve();
  _chains[entity] = _chains[entity].then(function () { return p; }).catch(function () {}); /* 链永远 resolved */
  return p;
}
/* 重放 Outbox 中未完成项（启动 / 网络恢复时触发） */
function _replayOutbox() {
  _outbox.forEach(function (item) {
    if (item.status === 'sending' || item.status === 'waiting') return; /* 已有进行中重试 */
    if (item.status === 'auth_error') return;                          /* 401 待重新登录 */
    if (item.status === 'done') return;
    item.attempt = 0; item.nextAt = 0; delete item._deferred;         /* 重置给一轮新机会 */
    _sendItem(item);
  });
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', function () { _replayOutbox(); });
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
      DB.workTypes = res.work_types || [];
      DB.settings = res.settings || {};
      DB.loaded = true;
      DB._loading = null;
      _replayOutbox();           /* 启动成功：重放离线写队列 */
    })
    .catch(function (e) {
      DB._loading = null;
      if (e && e.message === 'file-protocol') throw e;
      console.error('bootstrapDB 失败', e);
      toast('无法连接服务器，请启动 start.bat 后访问 http://localhost:8080', 'error');
      _replayOutbox();           /* 服务器暂不可达：让 Outbox 自动退避重试自愈 */
      throw e;
    });
  return DB._loading;
}

/* ===== 缓存查找 ===== */
function _findById(arr, id) { return arr.find(function (r) { return r._id === id; }) || null; }
function _findIdx(arr, id) { return arr.findIndex(function (r) { return r._id === id; }); }

/* ============================================================
 * 通用 CRUD 工厂 (P1-2 重构: 消除 11 组重复样板)
 * 返回一个 { load, get, create, update, remove } 对象。
 * 各处再用 createX / loadX / getX / updateX / deleteX 薄包装暴露为全局函数,
 * 保持原函数名与签名不变, 页面调用方无需改动。
 *
 * cfg 字段:
 *   cacheKey : 'projects'          (DB[cacheKey] 数组)
 *   api      : '/api/projects'      (基础路径, 增删改拼在该路径后)
 *   order    : 'push' | 'unshift'  (默认 push; 计划/申购类用 unshift 让新记录置顶)
 *   idGen    : function(){}        生成 _id (缺省 uuid())
 *   defaults : function(){ return {...} }  新建记录默认字段
 *   beforeCreate(rec, data): 合并后、入库/POST 前可改写 rec
 *   afterCreate(rec):        入库后同步回调 (如同步项目进度)
 *   beforeUpdate(rec, patch): 返回加工后的 patch (如任务状态变更写 history)
 *   afterUpdate(rec, patch):  更新后回调
 *   beforeDelete(rec):       返回 false 可中止删除 (如级联清理)
 *   afterDelete(rec):         删除后回调 (如同步项目进度)
 * ============================================================ */
function makeCrud(cfg) {
  function list() { return DB[cfg.cacheKey]; }
  function get(id) { return _findById(DB[cfg.cacheKey], id); }

  function create(data) {
    data = data || {};
    var rec = Object.assign({}, (typeof cfg.defaults === 'function' ? cfg.defaults() : {}), data);
    rec._id = (data && data._id) || (typeof cfg.idGen === 'function' ? cfg.idGen() : uuid());
    rec.created_at = rec.created_at || new Date().toISOString();
    if (typeof cfg.beforeCreate === 'function') cfg.beforeCreate(rec, data);
    if (cfg.order === 'unshift') DB[cfg.cacheKey].unshift(rec);
    else DB[cfg.cacheKey].push(rec);
    /* P0-2: POST 后回写服务端 _id / created_at。
     * 后端当前优先复用客户端 _id (server/app.py: data.get('_id') or gen_id(...)),
     * 此处回写为"防御 + 向前兼容"——若后端未来改为自生成 id, 前端也能正确对齐。
     * 失败不阻塞主流程(沿用原 _syncNow 的 catch)。 */
    _syncNow('POST', cfg.api, rec).then(function (res) {
      if (res && res.record) {
        if (res.record._id && res.record._id !== rec._id) rec._id = res.record._id;
        if (res.record.created_at) rec.created_at = res.record.created_at;
      }
    }).catch(function () {});
    if (typeof cfg.afterCreate === 'function') cfg.afterCreate(rec);
    return rec;
  }

  function update(id, patch) {
    var idx = _findIdx(DB[cfg.cacheKey], id);
    if (idx < 0) return null;
    var p = (typeof cfg.beforeUpdate === 'function') ? cfg.beforeUpdate(DB[cfg.cacheKey][idx], patch) : patch;
    if (p == null) p = patch;
    DB[cfg.cacheKey][idx] = Object.assign({}, DB[cfg.cacheKey][idx], p, { updated_at: new Date().toISOString() });
    _syncRecord('PUT', cfg.api + '/' + id, DB[cfg.cacheKey][idx]);
    if (typeof cfg.afterUpdate === 'function') cfg.afterUpdate(DB[cfg.cacheKey][idx], p);
    return DB[cfg.cacheKey][idx];
  }

  function remove(id) {
    var idx = _findIdx(DB[cfg.cacheKey], id);
    if (idx < 0) return null;
    var rec = DB[cfg.cacheKey][idx];
    if (typeof cfg.beforeDelete === 'function') {
      var go = cfg.beforeDelete(rec);
      if (go === false) return null;
    }
    DB[cfg.cacheKey] = DB[cfg.cacheKey].filter(function (r) { return r._id !== id; });
    _syncNow('DELETE', cfg.api + '/' + id);
    if (typeof cfg.afterDelete === 'function') cfg.afterDelete(rec);
    return rec;
  }

  return { load: list, get: get, create: create, update: update, remove: remove };
}

/* ============================================================
 * 项目 CRUD
 * ============================================================ */
var _crudProjects = makeCrud({
  cacheKey: 'projects', api: '/api/projects', order: 'push',
  idGen: function () { return uuid(); },
  defaults: function () {
    var now = new Date().toISOString();
    return {
      name: '', code: '', description: '', location: '',
      managerId: '', memberIds: [], startDate: '', endDate: '',
      status: PROJECT_STATUS.PLANNING, progress: 0, tags: [],
      created_at: now, updated_at: now
    };
  },
  /* 删除项目时级联清理客户端缓存里的任务 (服务端会联删, 无需逐条同步) */
  beforeDelete: function (rec) {
    DB.tasks = DB.tasks.filter(function (t) { return t.projectId !== rec._id; });
    return true;
  }
});
function loadProjects() { return _crudProjects.load(); }
function getProject(id) { return _crudProjects.get(id); }
function createProject(data) { return _crudProjects.create(data); }
function updateProject(id, patch) { return _crudProjects.update(id, patch); }
function deleteProject(id) { return _crudProjects.remove(id); }

/* ============================================================
 * 人员 CRUD
 * ============================================================ */
var _crudMembers = makeCrud({
  cacheKey: 'members', api: '/api/members', order: 'push',
  idGen: function () { return uuid(); },
  defaults: function () {
    return {
      name: '', role: 'worker', phone: '', workType: '', avatar: '',
      active: true, joinDate: todayStr(), created_at: new Date().toISOString()
    };
  },
  /* 删除人员时解除其在项目/任务里的关联 (缓存 + 逐条同步) */
  beforeDelete: function (rec) {
    DB.projects.forEach(function (p) {
      var changed = false;
      if (p.managerId === rec._id) { p.managerId = ''; changed = true; }
      if ((p.memberIds || []).indexOf(rec._id) >= 0) {
        p.memberIds = p.memberIds.filter(function (x) { return x !== rec._id; });
        changed = true;
      }
      if (changed) _syncRecord('PUT', '/api/projects/' + p._id, p);
    });
    DB.tasks.forEach(function (t) {
      if (t.assigneeId === rec._id) {
        t.assigneeId = '';
        _syncRecord('PUT', '/api/tasks/' + t._id, t);
      }
    });
    return true;
  }
});
function loadMembers() { return _crudMembers.load(); }
function getMember(id) { return _crudMembers.get(id); }
function createMember(data) { return _crudMembers.create(data); }
function updateMember(id, patch) { return _crudMembers.update(id, patch); }
function deleteMember(id) { return _crudMembers.remove(id); }

/* ============================================================
 * 任务 CRUD
 * ============================================================ */
var _crudTasks = makeCrud({
  cacheKey: 'tasks', api: '/api/tasks', order: 'push',
  idGen: function () { return uuid(); },
  defaults: function () {
    var now = new Date().toISOString();
    return {
      projectId: '', title: '', description: '', assigneeId: '', reporterId: '',
      priority: PRIORITY.NORMAL, status: TASK_STATUS.TODO,
      startDate: todayStr(), dueDate: '', progress: 0,
      tags: [], comments: [], history: [], created_at: now, updated_at: now
    };
  },
  /* 创建时写入首条 history (from:null -> 初始状态), 记录填报人 */
  beforeCreate: function (rec, data) {
    rec.history = [{ from: null, to: rec.status || TASK_STATUS.TODO, ts: rec.created_at, userId: (data && data.reporterId) || '' }];
  },
  afterCreate: function (rec) {
    if (rec.projectId) syncProjectProgress(rec.projectId);
  },
  /* 状态变更时追加 history; 消费并移除临时字段 _changedBy */
  beforeUpdate: function (rec, patch) {
    if (patch.status && patch.status !== rec.status) {
      var hist = (rec.history || []).slice();
      hist.push({
        from: rec.status,
        to: patch.status,
        ts: new Date().toISOString(),
        userId: patch._changedBy || ''
      });
      patch = Object.assign({}, patch, { history: hist });
      delete patch._changedBy;
    }
    return patch;
  },
  afterUpdate: function (rec) {
    if (rec.projectId) syncProjectProgress(rec.projectId);
  },
  afterDelete: function (rec) {
    if (rec && rec.projectId) syncProjectProgress(rec.projectId);
  }
});
function loadTasks() { return _crudTasks.load(); }
function getTask(id) { return _crudTasks.get(id); }
function createTask(data) { return _crudTasks.create(data); }
function updateTask(id, patch) { return _crudTasks.update(id, patch); }
function deleteTask(id) { return _crudTasks.remove(id); }
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

/* 异步登录：账号(手机号/姓名) + 密码，建立服务器会话 + 记住本地用户ID
 * 失败时抛出的 Error 带 .code：
 *   missing | no_user | bad_pwd | locked | inactive
 */
function login(account, password) {
  return fetch('/api/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: account, password: password })
  }).then(function (r) {
    return r.json().then(function (res) { res = res || {}; res.__status = r.status; return res; });
  }).then(function (res) {
    if (res.__status !== 200 || !res.user) {
      var e = new Error(res.error || '登录失败');
      e.code = res.code || 'error';
      e.status = res.__status;
      throw e;
    }
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(res.user._id));
    return res.user;
  });
}

/* 修改自己的登录密码：成功后其它设备会话会被服务端注销 */
function changeMyPassword(oldPassword, newPassword) {
  return fetch('/api/me/password', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPassword: oldPassword, newPassword: newPassword })
  }).then(function (r) {
    return r.json().then(function (res) { res = res || {}; res.__status = r.status; return res; });
  }).then(function (res) {
    if (res.__status !== 200 || !res.ok) {
      var e = new Error(res.error || '修改密码失败');
      e.code = res.code || 'error';
      throw e;
    }
    return res;
  });
}

/* 管理员重置某人密码：服务端返回重置后的密码明文(手机号后6位或 123456) */
function resetMemberPassword(memberId) {
  return fetch('/api/members/' + encodeURIComponent(memberId) + '/reset-password', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  }).then(function (r) {
    return r.json().then(function (res) { res = res || {}; res.__status = r.status; return res; });
  }).then(function (res) {
    if (res.__status !== 200 || !res.ok) {
      var e = new Error(res.error || '重置失败');
      e.code = res.code || 'error';
      throw e;
    }
    return res;   /* { ok, password, name, killedSessions } */
  });
}

/* 当前用户的登录账号展示文案 */
function accountLabelOf(user) {
  if (!user) return '';
  return (user.phone || '').trim() || user.name || '';
}

/* ---------- 统一的 JSON 请求小工具（带 HTTP 状态，便于区分 400/401/403/409） ---------- */
function apiJson(method, url, payload) {
  var opt = { method: method, credentials: 'same-origin' };
  if (payload !== undefined && payload !== null) {
    opt.headers = { 'Content-Type': 'application/json' };
    opt.body = JSON.stringify(payload);
  }
  return fetch(url, opt).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (res) {
      res = res || {};
      res.__status = r.status;
      return res;
    });
  });
}

function _apiFail(res, fallback) {
  var e = new Error(res.error || fallback);
  e.code = res.code || 'error';
  e.status = res.__status;
  return e;
}

/* ---------- 修改自己的资料（姓名 / 手机号 / 头像） ---------- */
/* 返回 { ok, record, renamed, synced, syncedTotal }；角色 / 工种 不在可改范围内 */
function updateMyProfile(patch) {
  var body = {};
  if (patch && patch.name !== undefined) body.name = patch.name;
  if (patch && patch.phone !== undefined) body.phone = patch.phone;
  if (patch && patch.avatar !== undefined) body.avatar = patch.avatar;
  return apiJson('PUT', '/api/me/profile', body).then(function (res) {
    if (res.__status !== 200 || !res.ok) throw _apiFail(res, '保存资料失败');
    return res;
  });
}

/* ---------- 我的登录记录 ---------- */
/* 返回 { logs: [...], otherSessions: N } */
function loadMyLogins() {
  return apiJson('GET', '/api/me/logins').then(function (res) {
    if (res.__status !== 200) throw _apiFail(res, '读取登录记录失败');
    return res;
  });
}

/* ---------- 退出其它设备（保留当前这台） ---------- */
function logoutOtherDevices() {
  return apiJson('POST', '/api/me/logout-others', {}).then(function (res) {
    if (res.__status !== 200 || !res.ok) throw _apiFail(res, '操作失败');
    return res;
  });
}

/* ---------- 忘记密码：提交重置申请（无需登录） ---------- */
function requestPasswordReset(account, note) {
  return apiJson('POST', '/api/password-reset-request',
                 { account: account, note: note || '' }).then(function (res) {
    if (res.__status !== 200 || !res.ok) throw _apiFail(res, '提交失败');
    return res;    /* { ok, message } */
  });
}

/* ---------- 管理员：忘记密码申请 ---------- */
function listPasswordResetRequests() {
  return apiJson('GET', '/api/password-reset-requests').then(function (res) {
    if (res.__status !== 200) throw _apiFail(res, '读取申请列表失败');
    return res;    /* { items, pending } */
  });
}

function handlePasswordResetRequest(id, status) {
  return apiJson('POST', '/api/password-reset-requests/' + encodeURIComponent(id),
                 { status: status || 'done' }).then(function (res) {
    if (res.__status !== 200 || !res.ok) throw _apiFail(res, '操作失败');
    return res;
  });
}

/* ---------- 头像 / 设备 展示小工具 ---------- */

/* 头像：有图用图，没图用姓名首字 */
function avatarHtml(user, size) {
  size = size || 44;
  var name = (user && user.name) || '?';
  var av = (user && user.avatar) || '';
  if (av) {
    return '<img class="avatar-img" src="' + esc(av) + '" alt="' + esc(name) +
           '" style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;object-fit:cover;">';
  }
  return '<div class="profile-avatar" style="width:' + size + 'px;height:' + size +
         'px;">' + esc(String(name).charAt(0)) + '</div>';
}

/* 从 User-Agent 粗略识别设备，只用于显示 */
function deviceLabel(ua) {
  ua = String(ua || '');
  if (!ua) return '未知设备';
  var os = '电脑';
  if (/Android/i.test(ua)) os = '安卓';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  var br = '浏览器';
  if (/MicroMessenger/i.test(ua)) br = '微信';
  else if (/Edg\//i.test(ua)) br = 'Edge';
  else if (/Chrome\//i.test(ua)) br = 'Chrome';
  else if (/Firefox\//i.test(ua)) br = 'Firefox';
  else if (/Safari\//i.test(ua)) br = 'Safari';
  return os + ' · ' + br;
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
 * 模块访问权限 (用户角色.modules)
 *   - 每个 role 记录携带 modules: ['m_dashboard','m_daily_plan',...]
 *   - NAV_ITEMS 每项带 mod 字段 ('m_xxx')
 *   - 管理员 (isAdmin) 默认全部放行, 兼容老系统管理员不被锁
 *   - 老角色无 modules 字段时, 默认全部放行 (向前兼容)
 * ============================================================ */
/* 解析用户的模块访问状态 (导航过滤 + 页面拦截共用的唯一入口)
 * 三态语义:
 *   { mode:'all',    roleKey }  管理员 / 模块含 __ALL__  → 全放行
 *   { mode:'list',   roleKey, mods:[...] }  角色已配置 modules → 严格按勾选项 (空数组 = 全部禁止)
 *   { mode:'legacy', roleKey }  角色记录缺失 / 未配置 modules / 角色缓存未就绪 → 向前兼容, 放行
 * 注意: 管理员永远放行, 避免「把管理员的 m_roles 取消勾选」后无人能进角色页自救。
 */
function resolveRoleModules(user) {
  if (!user) return { mode: 'list', mods: [] };
  var roleKey = user.roleKey || user.role || '';
  if (roleKey === 'admin') return { mode: 'all', roleKey: roleKey };
  if (typeof loadRoles !== 'function') return { mode: 'legacy', roleKey: roleKey };
  var roles = loadRoles() || [];
  if (!roles.length) return { mode: 'legacy', roleKey: roleKey };  /* roles 尚未拉到, 不拦 */
  /* 双路匹配 key / _id; 两侧都必须有值才比较,
   * 否则会退化成 undefined === undefined 而误命中第一条角色 */
  var roleId = user.roleId || user.role_id || '';
  var r = roles.filter(function (x) {
    return (roleKey && x.key === roleKey) || (roleId && x._id === roleId);
  })[0];
  if (!r || !Array.isArray(r.modules)) return { mode: 'legacy', roleKey: roleKey };
  if (r.modules.indexOf('__ALL__') >= 0) return { mode: 'all', roleKey: roleKey };
  return { mode: 'list', roleKey: roleKey, mods: r.modules };
}
function userModules(user) {
  var st = resolveRoleModules(user);
  if (st.mode === 'list') return st.mods || [];
  return '__ALL__';   /* all / legacy 都视为全放行 */
}
function canAccessModule(user, mod) {
  if (!mod) return true;
  if (!user) return false;
  var st = resolveRoleModules(user);
  if (st.mode !== 'list') return true;            /* all / legacy 放行 */
  return (st.mods || []).indexOf(mod) >= 0;
}
/* 拦截函数: requireLogin 之后调用. 未授权 -> toast + 跳 dashboard */
function requireModule(mod) {
  var u = getCurrentUser();
  if (u && !canAccessModule(u, mod)) {
    toast('该页面您没有访问权限', 'warn');
    setTimeout(function () { location.href = 'dashboard.html'; }, 600);
    return false;
  }
  return true;
}

/* ============================================================
 * 日计划填报 CRUD (走 /api/daily-plans)
 * ============================================================ */
var _crudDailyPlans = makeCrud({
  cacheKey: 'dailyPlans', api: '/api/daily-plans', order: 'unshift',
  idGen: function () { return 'dp_' + uuid(); },
  defaults: function () {
    return {
      date: todayStr(), plan_date: todayStr(),
      status: 'draft', tasks: [], crew: { night: [], rest: [], adjust: [] },
      remarks: '', submitter: '', approver: '',
      created_at: new Date().toISOString()
    };
  }
});
function loadDailyPlans() { return _crudDailyPlans.load(); }
function getDailyPlan(id) { return _crudDailyPlans.get(id); }
function createDailyPlan(data) { return _crudDailyPlans.create(data); }
function updateDailyPlan(id, patch) { return _crudDailyPlans.update(id, patch); }
function deleteDailyPlan(id) { return _crudDailyPlans.remove(id); }

/* ===== 周计划填报 CRUD ===== */
var _crudWeeklyPlans = makeCrud({
  cacheKey: 'weeklyPlans', api: '/api/weekly-plans', order: 'unshift',
  idGen: function () { return 'wp_' + uuid(); },
  defaults: function () {
    return {
      week_start: '', week_end: '', title: '',
      status: 'draft', content: '', members: [],
      submitter: '', approver: '',
      created_at: new Date().toISOString()
    };
  }
});
function loadWeeklyPlans() { return _crudWeeklyPlans.load(); }
function createWeeklyPlan(data) { return _crudWeeklyPlans.create(data); }
function updateWeeklyPlan(id, patch) { return _crudWeeklyPlans.update(id, patch); }
function deleteWeeklyPlan(id) { return _crudWeeklyPlans.remove(id); }

/* ===== 计划周报 CRUD ===== */
var _crudWeeklyReports = makeCrud({
  cacheKey: 'weeklyReports', api: '/api/weekly-reports', order: 'unshift',
  idGen: function () { return 'wr_' + uuid(); },
  defaults: function () {
    return {
      week_start: '', week_end: '', title: '',
      status: 'draft', summary: '', items: [],
      submitter: '', approver: '',
      created_at: new Date().toISOString()
    };
  }
});
function loadWeeklyReports() { return _crudWeeklyReports.load(); }
function createWeeklyReport(data) { return _crudWeeklyReports.create(data); }
function updateWeeklyReport(id, patch) { return _crudWeeklyReports.update(id, patch); }
function deleteWeeklyReport(id) { return _crudWeeklyReports.remove(id); }

/* ===== 物资申购 CRUD ===== */
var _crudPurchases = makeCrud({
  cacheKey: 'purchases', api: '/api/purchases', order: 'unshift',
  idGen: function () { return 'pu_' + uuid(); },
  defaults: function () {
    return {
      date: todayStr(), name: '', spec: '', unit: '', qty: '',
      total: 0, items: [], projectId: '',
      reason: '', status: 'draft',
      applicant: '', approver: '',
      created_at: new Date().toISOString()
    };
  }
});
function loadPurchases() { return _crudPurchases.load(); }
function createPurchase(data) { return _crudPurchases.create(data); }
function updatePurchase(id, patch) { return _crudPurchases.update(id, patch); }
function deletePurchase(id) { return _crudPurchases.remove(id); }

/* ===== 审批管理 CRUD ===== */
var _crudApprovals = makeCrud({
  cacheKey: 'approvals', api: '/api/approvals', order: 'unshift',
  idGen: function () { return 'ap_' + uuid(); },
  defaults: function () {
    return {
      type: 'generic', ref_id: '', title: '',
      status: 'pending', applicant: '', approver: '',
      reason: '', payload: {},
      created_at: new Date().toISOString()
    };
  }
});
function loadApprovals() { return _crudApprovals.load(); }
function createApproval(data) { return _crudApprovals.create(data); }
function updateApproval(id, patch) { return _crudApprovals.update(id, patch); }
function deleteApproval(id) { return _crudApprovals.remove(id); }

/* ===== 物资申购合并批次 CRUD (仅管理端使用) ===== */
var _crudPurchaseGroups = makeCrud({
  cacheKey: 'purchaseGroups', api: '/api/purchase-groups', order: 'unshift',
  idGen: function () { return 'pg_' + uuid(); },
  defaults: function () {
    return {
      name: '', created_by: '',
      created_at: new Date().toISOString()
    };
  }
});
function loadPurchaseGroups() { return _crudPurchaseGroups.load(); }
function createPurchaseGroup(data) { return _crudPurchaseGroups.create(data); }
function updatePurchaseGroup(id, patch) { return _crudPurchaseGroups.update(id, patch); }
function deletePurchaseGroup(id) { return _crudPurchaseGroups.remove(id); }

/* ===== 部门管理 CRUD ===== */
var _crudDepartments = makeCrud({
  cacheKey: 'departments', api: '/api/departments', order: 'push',
  idGen: function () { return 'd_' + uuid(); },
  defaults: function () {
    return {
      name: '', code: '', parent_id: '', manager_id: '',
      description: '', sort_order: 0,
      created_at: new Date().toISOString()
    };
  }
});
function loadDepartments() { return _crudDepartments.load(); }
function createDepartment(data) { return _crudDepartments.create(data); }
function updateDepartment(id, patch) { return _crudDepartments.update(id, patch); }
function deleteDepartment(id) { return _crudDepartments.remove(id); }

/* ===== 角色权限 CRUD ===== */
var _crudRoles = makeCrud({
  cacheKey: 'roles', api: '/api/roles', order: 'push',
  idGen: function () { return 'r_' + uuid(); },
  defaults: function () {
    return {
      key: '', name: '', description: '',
      permissions: [], modules: [], sort_order: 0,
      created_at: new Date().toISOString()
    };
  }
});
function loadRoles() { return _crudRoles.load(); }
function createRole(data) { return _crudRoles.create(data); }
function updateRole(id, patch) { return _crudRoles.update(id, patch); }
function deleteRole(id) { return _crudRoles.remove(id); }

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
  return !!(u && u.role === 'admin');
}

/* ============================================================
 * 动作级权限 (roles.permissions)
 *   模块级(modules) 管"能不能进这个页面"
 *   动作级(permissions) 管"进了页面能不能改数据"
 *   - 管理员 (role==='admin') 永远放行, 防止把自己锁死
 *   - 角色记录缺失 / 未配置 permissions → 向前兼容放行(legacy)
 *   - 判定入口 hasPerm(); 标记入口 给元素加 data-perm="p_create"
 *     (可写多个, 空格分隔, 满足任一即保留)
 * ============================================================ */
function resolveRolePerms(user) {
  var u = user || getCurrentUser();
  if (!u) return { mode: 'none', perms: [] };
  if (u.role === 'admin') return { mode: 'all', perms: null };
  var roles = (typeof loadRoles === 'function') ? (loadRoles() || []) : [];
  if (!roles.length) return { mode: 'legacy', perms: null };
  var roleKey = u.roleKey || u.role || '';
  var roleId = u.roleId || u.role_id || '';
  /* 两侧都要有值才比较, 避免 undefined === undefined 误命中第一条角色 */
  var r = roles.filter(function (x) {
    return (roleKey && x.key === roleKey) || (roleId && x._id === roleId);
  })[0];
  if (!r || !Array.isArray(r.permissions)) return { mode: 'legacy', perms: null };
  return { mode: 'list', perms: r.permissions };
}
function hasPerm(p) {
  if (!p) return true;
  var st = resolveRolePerms();
  if (st.mode === 'all' || st.mode === 'legacy') return true;
  if (st.mode === 'none') return false;
  return (st.perms || []).indexOf(p) >= 0;
}
/* 扫描所有带 data-perm 的节点: 无权限则隐藏。
 * 幂等 —— 反复调用结果一致(有权限的会恢复显示), 因此可在
 * 角色数据加载完成前后各执行一次而不出错。 */
function applyPermGuard(root) {
  root = root || document;
  if (!root.querySelectorAll) return;
  var list = root.querySelectorAll('[data-perm]');
  Array.prototype.forEach.call(list, function (el) {
    var need = String(el.getAttribute('data-perm') || '').split(/\s+/).filter(Boolean);
    if (!need.length) return;
    var ok = need.some(function (p) { return hasPerm(p); });
    /* 隐藏而非移除: 页面脚本仍能 getElementById 拿到它并绑事件, 不会报错 */
    el.style.display = ok ? '' : 'none';
    if ('disabled' in el) el.disabled = !ok;
  });
}
/* 启动守卫: 当前 DOM 扫一遍 + 监听后续动态渲染的按钮 (只挂一次) */
var _permGuardObserver = null;
function initPermGuard() {
  applyPermGuard(document);
  if (_permGuardObserver || typeof MutationObserver === 'undefined') return;
  try {
    _permGuardObserver = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes || [];
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) applyPermGuard(added[j]);
        }
      }
    });
    /* 注意: observe() 返回 undefined, 必须与赋值分开写, 否则标志会被冲掉 */
    _permGuardObserver.observe(document.body, { childList: true, subtree: true });
  } catch (_) { /* 环境不支持则退化为仅首屏扫描 */ }
}

function canManage() {
  /* 管理员 + 主管 (对应 roles 表的 key: admin/lead) */
  var u = getCurrentUser();
  return !!(u && (u.role === 'admin' || u.role === 'lead'));
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
/* 姓名规则：与后端 server/app.py 的 validate_name 保持一致
 * 姓名同时是登录账号，且在业务表里以文本形式冗余存放，所以规则必须收口 */
var MEMBER_NAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9·・\-_. ]+$/;
function validateName(name) {
  name = (name || '').trim();
  if (!name) return '请输入姓名';
  if (name.length < 2) return '姓名至少 2 个字符';
  if (name.length > 20) return '姓名最多 20 个字符';
  if (/^\d+$/.test(name)) return '姓名不能是纯数字（会和手机号登录混淆）';
  if (!MEMBER_NAME_RE.test(name)) return '姓名含有不支持的字符，请只用中文、字母、数字或 · - 等符号';
  return null;
}
function validateMember(m) {
  return validateName(m.name);
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
/* 审批人角色集合 (对应 roles.key): 管理员 + 工程主管
 * 角色定义见 roles 表 (W13 用户角色); 与代码约定的 key 保持一致 */
var PLAN_APPROVE_ROLES = ['admin', 'lead'];
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
 * 两种记录(以及各自的导出/详情渲染)才能通用
 * extra: { requirement, members[], startTime, endTime } —— 与填报页的任务字段同口径 */
function makeAppendedTask(content, user, extra) {
  var text = String(content || '').trim();
  var ex = extra || {};
  return {
    id: 'ap' + Math.random().toString(36).slice(2, 9),
    content: text, title: text,
    requirement: String(ex.requirement || '').trim(),
    members: Array.isArray(ex.members) ? ex.members.slice() : [],
    startTime: ex.startTime || '', endTime: ex.endTime || '',
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

/* 追加一条"审批追加"条目到记录, 成功返回 true
 * field 省略时按 tasks 处理 (计划周报用 items) */
function planAppendItem(rec, item, field) {
  if (!rec || !item) return false;
  var key = field || 'tasks';
  if (!Array.isArray(rec[key])) rec[key] = [];
  rec[key].push(item);
  return true;
}

/* 修改记录里某条"审批追加"条目的字段 (审批人修订自己追加的内容) */
function planUpdateAppended(rec, itemId, patch, field) {
  var key = field || 'tasks';
  var list = (rec && rec[key]) || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].id === itemId) {
      Object.assign(list[i], patch || {});
      return true;
    }
  }
  return false;
}

/* 移除记录里某条"审批追加"条目 */
function planRemoveAppended(rec, itemId, field) {
  var key = field || 'tasks';
  if (!rec || !Array.isArray(rec[key])) return false;
  var before = rec[key].length;
  rec[key] = rec[key].filter(function (t) { return !(t && t.appended && t.id === itemId); });
  return rec[key].length < before;
}

/* 记录里被审批追加的条目数 (field 省略时按 tasks 处理) */
function planAppendedCount(rec, field) {
  var key = field || 'tasks';
  return ((rec && rec[key]) || []).filter(function (t) { return t && t.appended; }).length;
}

/* ============================================================
 * 审批人表单组件: 追加工作内容 / 修改填报内容
 *
 * 两个入口共用同一套表单:
 *   1) 填报页 (daily-plan.js)     待审批窗口内点「追加工作内容」
 *   2) 详情弹层 (plan-shared.js)  审批管理页 / 报表浏览页的审批操作区
 *
 * 字段与填报页的任务完全同口径:
 *   工作内容 / 工作要求 / 计划实施人员 / 计划完成时间 (四项必填)
 *
 * ⚠️ 人员选择必须内联实现, 不能用 multiSelectDialog —— 后者一打开就
 *    清空页面里所有 .modal-overlay, 会把所在弹层一起销毁。
 * ============================================================ */
var TASK_MEMBER_ROLES = ['lead', 'foreman', 'worker'];   /* 与填报页 DP_ALLOWED_ROLES 一致 */

function taskMemberList() {
  return (loadMembers() || []).filter(function (m) {
    return m.active !== false && TASK_MEMBER_ROLES.indexOf(m.role) >= 0;
  });
}
function taskMemberName(id) {
  var m = (typeof getMember === 'function') ? getMember(id) : null;
  return (m && m.name) ? m.name : String(id || '');
}
function taskMemberNames(ids) {
  return (ids || []).map(taskMemberName).filter(Boolean).join('、');
}
function taskRoleText(role) {
  if (typeof ROLE_DISPLAY !== 'undefined' && ROLE_DISPLAY && ROLE_DISPLAY[role]) return ROLE_DISPLAY[role];
  return (typeof roleLabel === 'function' && roleLabel(role)) || role || '';
}

/* 内联人员选择: 已选 chips + 可展开的勾选面板
 * 读取时直接收集 .pp-chip 的 data-id, 不维护额外的 JS 状态 */
function peoplePickerHtml(ids) {
  var sel = (ids || []).slice();
  var list = taskMemberList();
  return '<div class="pp">' +
    '<div class="pp-chips">' +
      (sel.length ? peopleChipsHtml(sel) : '<span class="pp-placeholder">尚未选择人员</span>') +
    '</div>' +
    '<button class="pp-add" type="button">+ 选择人员</button>' +
    '<div class="pp-panel" hidden>' +
      (list.length
        ? list.map(function (m) {
            var on = sel.indexOf(m._id) >= 0;
            return '<label class="pp-row' + (on ? ' is-selected' : '') + '" data-id="' + esc(m._id) + '">' +
              '<input type="checkbox"' + (on ? ' checked' : '') + '>' +
              '<span class="pp-name">' + esc(m.name) + '</span>' +
              '<span class="pp-role">' + esc(taskRoleText(m.role)) + '</span>' +
            '</label>';
          }).join('')
        : '<div class="pp-none">暂无可选人员</div>') +
    '</div>' +
  '</div>';
}
function peopleChipsHtml(ids) {
  return (ids || []).map(function (id) {
    return '<span class="pp-chip" data-id="' + esc(id) + '">' +
      '<span class="pp-chip-name">' + esc(taskMemberName(id)) + '</span>' +
      '<button class="pp-chip-x" type="button" title="移除">×</button>' +
    '</span>';
  }).join('');
}
/* 取某容器内已选人员 id */
function ppChipIds(el) {
  if (!el) return [];
  return Array.prototype.map.call(el.querySelectorAll('.pp-chip'), function (c) { return c.dataset.id; });
}
/* 绑定作用域内所有人员选择器 (事件委托, 可重复调用) */
function bindPeoplePickers(scope) {
  (scope || document).querySelectorAll('.pp').forEach(function (pp) {
    if (pp.dataset.ppBound) return;
    pp.dataset.ppBound = '1';
    var panel = pp.querySelector('.pp-panel');
    var chips = pp.querySelector('.pp-chips');
    var addBtn = pp.querySelector('.pp-add');

    function sync() {
      var ids = Array.prototype.map.call(pp.querySelectorAll('.pp-row input:checked'), function (cb) {
        return cb.closest('.pp-row').dataset.id;
      });
      chips.innerHTML = ids.length ? peopleChipsHtml(ids) : '<span class="pp-placeholder">尚未选择人员</span>';
      pp.querySelectorAll('.pp-row').forEach(function (row) {
        row.classList.toggle('is-selected', !!row.querySelector('input:checked'));
      });
    }
    if (addBtn && panel) {
      addBtn.addEventListener('click', function () {
        panel.hidden = !panel.hidden;
        addBtn.textContent = panel.hidden ? '+ 选择人员' : '收起';
      });
    }
    pp.addEventListener('change', function (e) {
      if (e.target && e.target.matches && e.target.matches('input[type=checkbox]')) sync();
    });
    /* chips 上的 × : 反查并取消对应勾选 */
    pp.addEventListener('click', function (e) {
      var x = (e.target && e.target.closest) ? e.target.closest('.pp-chip-x') : null;
      if (!x) return;
      e.preventDefault();
      var chip = x.closest('.pp-chip');
      var id = chip && chip.dataset.id;
      var row = id ? pp.querySelector('.pp-row[data-id="' + id + '"]') : null;
      if (row) {
        var cb = row.querySelector('input');
        if (cb) cb.checked = false;
      }
      if (chip) chip.remove();
      if (!chips.querySelector('.pp-chip')) chips.innerHTML = '<span class="pp-placeholder">尚未选择人员</span>';
      if (row) row.classList.remove('is-selected');
    });
  });
}

/* ---------- 追加工作内容表单 (四件套) ---------- */
function appendTaskFormHtml() {
  return '<div class="appt-form">' +
    '<div class="appt-field appt-full">' +
      '<label class="form-label">工作内容 <span class="required">*</span></label>' +
      '<textarea class="textarea appt-content" rows="2" placeholder="例如：补充检查 3 层临边防护"></textarea>' +
    '</div>' +
    '<div class="appt-field appt-full">' +
      '<label class="form-label">工作要求 <span class="required">*</span></label>' +
      '<textarea class="textarea appt-requirement" rows="2" placeholder="本条追加内容的工作要求 / 验收标准"></textarea>' +
    '</div>' +
    '<div class="appt-field">' +
      '<label class="form-label">计划实施人员 <span class="required">*</span></label>' +
      peoplePickerHtml([]) +
    '</div>' +
    '<div class="appt-field">' +
      '<label class="form-label">计划完成时间 <span class="required">*</span></label>' +
      '<div class="appt-time">' +
        '<input class="input appt-start" type="time">' +
        '<span class="appt-time-sep">至</span>' +
        '<input class="input appt-end" type="time">' +
      '</div>' +
    '</div>' +
  '</div>';
}
/* 读取 + 校验追加表单, 返回 { task } 或 { error, sel } */
function readAppendTaskForm(scope) {
  var f = (scope || document).querySelector('.appt-form');
  if (!f) return { error: '表单未就绪', sel: '' };
  var task = {
    content: (f.querySelector('.appt-content').value || '').trim(),
    requirement: (f.querySelector('.appt-requirement').value || '').trim(),
    members: ppChipIds(f),
    startTime: (f.querySelector('.appt-start').value || ''),
    endTime: (f.querySelector('.appt-end').value || '')
  };
  if (!task.content) return { error: '请填写追加的工作内容', sel: '.appt-content' };
  if (!task.requirement) return { error: '请填写工作要求', sel: '.appt-requirement' };
  if (!task.members.length) return { error: '请选择计划实施人员', sel: '.pp-add' };
  if (!task.startTime || !task.endTime) return { error: '请填写计划完成时间', sel: '.appt-start' };
  return { task: task };
}

/* ---------- 修改填报内容表单 (仅审批人 + 待审批窗口) ---------- */
function crewEditHtml(key, label, ids) {
  return '<div class="edt-crew-item" data-crew="' + esc(key) + '">' +
    '<label class="form-label">' + esc(label) + '</label>' +
    peoplePickerHtml(ids || []) +
  '</div>';
}
function editPlanFormHtml(rec, tab) {
  if (tab === 'wr') {
    return '<div class="edt-form">' +
      '<div class="edt-field edt-full">' +
        '<label class="form-label">本周工作摘要</label>' +
        '<textarea class="textarea edt-summary" rows="6">' + esc(rec.summary || '') + '</textarea>' +
      '</div>' +
    '</div>';
  }
  if (tab === 'weekly') {
    var opts = (loadProjects() || []).map(function (p) {
      return '<option value="' + esc(p._id) + '"' + (rec.projectId === p._id ? ' selected' : '') + '>' +
        esc(p.name) + '</option>';
    }).join('');
    var wrows = (rec.tasks || []).map(function (t, i) {
      if (t.appended) return '';
      var owners = '<option value="">未指定</option>' + taskMemberList().map(function (m) {
        return '<option value="' + esc(m._id) + '"' + (t.ownerId === m._id ? ' selected' : '') + '>' +
          esc(m.name) + '</option>';
      }).join('');
      return '<div class="edt-task" data-i="' + i + '">' +
        '<div class="edt-task-num">' + (i + 1) + '</div>' +
        '<div class="edt-task-body">' +
          '<div class="edt-field edt-full"><label class="edt-label">计划工作内容</label>' +
            '<textarea class="textarea edt-title" rows="2">' + esc(t.title || '') + '</textarea></div>' +
          '<div class="edt-field"><label class="edt-label">责任人</label>' +
            '<select class="input edt-owner">' + owners + '</select></div>' +
          '<div class="edt-field"><label class="edt-label">计划完成时间</label>' +
            '<input class="input edt-due" type="date" value="' + esc(t.dueDate || '') + '"></div>' +
        '</div>' +
      '</div>';
    }).join('');
    return '<div class="edt-form">' +
      '<div class="edt-field edt-full"><label class="form-label">关联项目</label>' +
        '<select class="input edt-project"><option value="">未关联</option>' + opts + '</select></div>' +
      (wrows || '<div class="pb-none">无可修改的任务</div>') +
      (planAppendedCount(rec, 'tasks')
        ? '<div class="edt-note">审批追加的条目不在修改范围内，如需调整请用下方「追加工作内容」。</div>' : '') +
    '</div>';
  }
  var drows = (rec.tasks || []).map(function (t, i) {
    if (t.appended) return '';
    return '<div class="edt-task" data-i="' + i + '">' +
      '<div class="edt-task-num">' + (i + 1) + '</div>' +
      '<div class="edt-task-body">' +
        '<div class="edt-field edt-full"><label class="edt-label">计划工作内容</label>' +
          '<textarea class="textarea edt-content" rows="2">' + esc(t.content || '') + '</textarea></div>' +
        '<div class="edt-field edt-full"><label class="edt-label">工作要求</label>' +
          '<textarea class="textarea edt-requirement" rows="2">' + esc(t.requirement || '') + '</textarea></div>' +
        '<div class="edt-field"><label class="edt-label">计划实施人员</label>' +
          peoplePickerHtml(t.members || []) + '</div>' +
        '<div class="edt-field"><label class="edt-label">计划完成时间</label>' +
          '<div class="appt-time">' +
            '<input class="input edt-start" type="time" value="' + esc(t.startTime || '') + '">' +
            '<span class="appt-time-sep">至</span>' +
            '<input class="input edt-end" type="time" value="' + esc(t.endTime || '') + '">' +
          '</div></div>' +
      '</div>' +
    '</div>';
  }).join('');
  var crew = rec.crew || {};
  return '<div class="edt-form">' +
    (drows || '<div class="pb-none">无可修改的任务</div>') +
    '<div class="edt-field edt-full"><label class="form-label">备注</label>' +
      '<textarea class="textarea edt-remarks" rows="2">' + esc(rec.remarks || '') + '</textarea></div>' +
    '<div class="edt-crew">' +
      crewEditHtml('night', '夜间值班', crew.night) +
      crewEditHtml('rest', '休息人员', crew.rest) +
      crewEditHtml('adjust', '调休人员', crew.adjust) +
    '</div>' +
    (planAppendedCount(rec, 'tasks')
      ? '<div class="edt-note">审批追加的条目不在修改范围内，如需调整请用下方「追加工作内容」。</div>' : '') +
  '</div>';
}
/* 读取 + 校验修改表单, 返回 { patch } 或 { error, sel }
 * 规则与填报页对齐: 内容清空 = 删除该任务; 保留的任务必须四项齐全 */
function readEditPlanForm(scope, rec, tab) {
  var f = (scope || document).querySelector('.edt-form');
  if (!f) return { error: '表单未就绪', sel: '' };
  if (tab === 'wr') {
    var sum = (f.querySelector('.edt-summary').value || '').trim();
    if (!sum) return { error: '本周工作摘要不能为空', sel: '.edt-summary' };
    return { patch: { summary: sum } };
  }
  var list = [];
  var err = '';
  var isDaily = (tab !== 'weekly');
  (rec.tasks || []).forEach(function (t, i) {
    if (t.appended) { list.push(t); return; }
    var row = f.querySelector('.edt-task[data-i="' + i + '"]');
    if (!row) { list.push(t); return; }
    var nt = Object.assign({}, t);
    if (isDaily) {
      nt.content = (row.querySelector('.edt-content').value || '').trim();
      nt.requirement = (row.querySelector('.edt-requirement').value || '').trim();
      nt.members = ppChipIds(row);
      nt.startTime = (row.querySelector('.edt-start').value || '');
      nt.endTime = (row.querySelector('.edt-end').value || '');
      if (!nt.content) return;
      if (!err && !nt.requirement) err = '第 ' + (i + 1) + ' 项任务未填写工作要求';
      if (!err && !nt.members.length) err = '第 ' + (i + 1) + ' 项任务未选择计划实施人员';
      if (!err && (!nt.startTime || !nt.endTime)) err = '第 ' + (i + 1) + ' 项任务未填写计划完成时间';
    } else {
      nt.title = (row.querySelector('.edt-title').value || '').trim();
      nt.ownerId = (row.querySelector('.edt-owner').value || '');
      nt.dueDate = (row.querySelector('.edt-due').value || '');
      if (!nt.title) return;
      if (!err && !nt.ownerId) err = '第 ' + (i + 1) + ' 项任务未选择责任人';
      if (!err && !nt.dueDate) err = '第 ' + (i + 1) + ' 项任务未填写计划完成时间';
    }
    list.push(nt);
  });
  if (err) return { error: err, sel: '' };
  if (!list.filter(function (t) { return !t.appended; }).length) {
    return { error: '至少保留一项任务内容', sel: '' };
  }
  if (isDaily) {
    var crew = {};
    f.querySelectorAll('.edt-crew [data-crew]').forEach(function (el) {
      crew[el.dataset.crew] = ppChipIds(el);
    });
    return {
      patch: {
        tasks: list,
        remarks: (f.querySelector('.edt-remarks').value || '').trim(),
        crew: crew
      }
    };
  }
  return { patch: { tasks: list, projectId: (f.querySelector('.edt-project').value || '') } };
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
