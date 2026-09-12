#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
工程管理系统 - 数据库后端服务
纯 Python 标准库实现（http.server + sqlite3），零第三方依赖。
- 数据全部存 SQLite（server/data.db）
- REST API + 静态文件托管，同一端口
- 首次启动自动建库并注入种子数据
- PC / 移动端浏览器均可访问

启动：  python server/app.py  [端口，默认 8080]
"""

import json
import os
import re
import sqlite3
import threading
import uuid as _uuid
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_ROOT = os.path.dirname(BASE_DIR)
DB_PATH = os.path.join(BASE_DIR, 'data.db')
SESSION_FILE = os.path.join(BASE_DIR, 'sessions.json')
COOKIE_NAME = 'engms_session'

_lock = threading.Lock()

# ============================================================
# 数据库
# ============================================================

SCHEMA = """
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  role TEXT DEFAULT 'worker',
  phone TEXT DEFAULT '',
  work_type TEXT DEFAULT '普工',
  avatar TEXT DEFAULT '',
  active INTEGER DEFAULT 1,
  join_date TEXT DEFAULT '',
  created_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  code TEXT DEFAULT '',
  description TEXT DEFAULT '',
  location TEXT DEFAULT '',
  manager_id TEXT DEFAULT '',
  member_ids TEXT DEFAULT '[]',
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  status TEXT DEFAULT 'planning',
  progress INTEGER DEFAULT 0,
  tags TEXT DEFAULT '[]',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT DEFAULT '',
  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  assignee_id TEXT DEFAULT '',
  reporter_id TEXT DEFAULT '',
  priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'todo',
  start_date TEXT DEFAULT '',
  due_date TEXT DEFAULT '',
  progress INTEGER DEFAULT 0,
  tags TEXT DEFAULT '[]',
  comments TEXT DEFAULT '[]',
  history TEXT DEFAULT '[]',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  date TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  remarks TEXT DEFAULT '',
  approver TEXT DEFAULT '',
  rejected_reason TEXT DEFAULT '',
  signature TEXT DEFAULT '',
  tasks_json TEXT DEFAULT '[]',
  created_by TEXT DEFAULT '',
  submitted_at TEXT DEFAULT '',
  signed_at TEXT DEFAULT '',
  rejected_at TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);
"""


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def now_iso():
    return datetime.now().strftime('%Y-%m-%dT%H:%M:%S')


def today_str():
    return datetime.now().strftime('%Y-%m-%d')


def gen_id(prefix='r'):
    return prefix + '_' + _uuid.uuid4().hex[:16]


# ---------- 行 -> 前端字典（camelCase） ----------

def row_to_member(r):
    return {
        '_id': r['id'], 'name': r['name'], 'role': r['role'],
        'phone': r['phone'], 'workType': r['work_type'],
        'avatar': r['avatar'], 'active': bool(r['active']),
        'joinDate': r['join_date'], 'created_at': r['created_at'],
    }


def row_to_project(r):
    return {
        '_id': r['id'], 'name': r['name'], 'code': r['code'],
        'description': r['description'], 'location': r['location'],
        'managerId': r['manager_id'],
        'memberIds': json.loads(r['member_ids'] or '[]'),
        'startDate': r['start_date'], 'endDate': r['end_date'],
        'status': r['status'], 'progress': r['progress'],
        'tags': json.loads(r['tags'] or '[]'),
        'created_at': r['created_at'], 'updated_at': r['updated_at'],
    }


def row_to_task(r):
    return {
        '_id': r['id'], 'projectId': r['project_id'], 'title': r['title'],
        'description': r['description'],
        'assigneeId': r['assignee_id'], 'reporterId': r['reporter_id'],
        'priority': r['priority'], 'status': r['status'],
        'startDate': r['start_date'], 'dueDate': r['due_date'],
        'progress': r['progress'],
        'tags': json.loads(r['tags'] or '[]'),
        'comments': json.loads(r['comments'] or '[]'),
        'history': json.loads(r['history'] or '[]'),
        'created_at': r['created_at'], 'updated_at': r['updated_at'],
    }


def row_to_report(r):
    return {
        '_id': r['id'], 'date': r['date'], 'status': r['status'],
        'remarks': r['remarks'], 'approver': r['approver'],
        'rejected_reason': r['rejected_reason'],
        'signature': r['signature'],
        'tasks': json.loads(r['tasks_json'] or '[]'),
        'created_by': r['created_by'],
        'submitted_at': r['submitted_at'], 'signed_at': r['signed_at'],
        'rejected_at': r['rejected_at'],
        'created_at': r['created_at'], 'updated_at': r['updated_at'],
    }


def init_db():
    conn = get_db()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


# ---------- 种子数据（与原前端 seedIfEmpty 一致） ----------

def seed_if_empty():
    with _lock:
        conn = get_db()
        n = conn.execute('SELECT COUNT(*) c FROM members').fetchone()['c']
        if n > 0:
            conn.close()
            return
        now = now_iso()
        def add_member(name, role, phone, work_type):
            mid = gen_id('m')
            conn.execute(
                'INSERT INTO members (id,name,role,phone,work_type,active,join_date,created_at) VALUES (?,?,?,?,?,1,?,?)',
                (mid, name, role, phone, work_type, today_str(), now))
            return mid
        admin = add_member('管理员', 'admin', '13800000000', '工长')
        m1 = add_member('张工', 'manager', '13811111111', '工长')
        m2 = add_member('李师傅', 'worker', '13822222222', '木工')
        m3 = add_member('王师傅', 'worker', '13833333333', '电工')

        end = (datetime.now() + timedelta(days=180)).strftime('%Y-%m-%d')
        pid = gen_id('p')
        conn.execute(
            'INSERT INTO projects (id,name,code,description,location,manager_id,member_ids,start_date,end_date,status,progress,tags,created_at,updated_at) '
            'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (pid, '阳光花园 1# 楼', 'YG-001', '高层住宅，地上 28 层，地下 2 层', '北京市朝阳区',
             m1, json.dumps([m2, m3]), today_str(), end, 'active', 0,
             json.dumps(['住宅', '主体施工']), now, now))

        def add_task(title, desc, assignee, prio, status, start, due, prog):
            tid = gen_id('t')
            hist = json.dumps([{'from': None, 'to': status, 'ts': now, 'userId': admin}])
            conn.execute(
                'INSERT INTO tasks (id,project_id,title,description,assignee_id,reporter_id,priority,status,start_date,due_date,progress,comments,history,created_at,updated_at) '
                'VALUES (?,?,?,?,?,?,?,?,?,?,?,\'[]\',?,?,?)',
                (tid, pid, title, desc, assignee, admin, prio, status, start, due, prog, hist, now, now))
        d1 = (datetime.now() + timedelta(days=3)).strftime('%Y-%m-%d')
        d2 = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
        d3 = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        add_task('3 层模板支撑', '完成 3 层顶板模板支撑体系搭设', m2, 'high', 'in_progress', today_str(), d1, 60)
        add_task('强电桥架安装', '地下室强电桥架安装及接地', m3, 'normal', 'todo', d3, d2, 0)
        add_task('塔吊拆除', '主体封顶后拆除', m2, 'urgent', 'blocked', today_str(), '', 0)
        add_task('基础验收', '基础分部验收', m1, 'high', 'done', today_str(), '', 100)
        conn.commit()
        conn.close()


# ============================================================
# 会话
# ============================================================

_sessions = {}


def load_sessions():
    global _sessions
    try:
        with open(SESSION_FILE, 'r', encoding='utf-8') as f:
            _sessions = json.load(f)
    except Exception:
        _sessions = {}


def save_sessions():
    try:
        with open(SESSION_FILE, 'w', encoding='utf-8') as f:
            json.dump(_sessions, f)
    except Exception:
        pass


def current_user_id(handler):
    cookies = handler.headers.get('Cookie', '') or ''
    m = re.search(COOKIE_NAME + '=([A-Za-z0-9]+)', cookies)
    if not m:
        return None
    return _sessions.get(m.group(1))


# ============================================================
# 业务逻辑
# ============================================================

def sync_project_progress(conn, project_id):
    if not project_id:
        return
    rows = conn.execute('SELECT progress FROM tasks WHERE project_id=?', (project_id,)).fetchall()
    avg = round(sum(r['progress'] for r in rows) / len(rows)) if rows else 0
    conn.execute('UPDATE projects SET progress=?, updated_at=? WHERE id=?', (avg, now_iso(), project_id))
    conn.commit()


def list_members(conn):
    return [row_to_member(r) for r in conn.execute('SELECT * FROM members ORDER BY created_at').fetchall()]


def list_projects(conn):
    return [row_to_project(r) for r in conn.execute('SELECT * FROM projects ORDER BY created_at').fetchall()]


def list_tasks(conn):
    return [row_to_task(r) for r in conn.execute('SELECT * FROM tasks ORDER BY created_at').fetchall()]


def upsert_member(conn, data):
    mid = data.get('_id') or gen_id('m')
    old = conn.execute('SELECT id FROM members WHERE id=?', (mid,)).fetchone()
    if old:
        conn.execute(
            'UPDATE members SET name=?,role=?,phone=?,work_type=?,avatar=?,active=?,join_date=?,created_at=? WHERE id=?',
            (data.get('name', ''), data.get('role', 'worker'), data.get('phone', ''),
             data.get('workType', '普工'), data.get('avatar', ''),
             1 if data.get('active', True) else 0, data.get('joinDate', ''),
             data.get('created_at') or now_iso(), mid))
    else:
        conn.execute(
            'INSERT INTO members (id,name,role,phone,work_type,avatar,active,join_date,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
            (mid, data.get('name', ''), data.get('role', 'worker'), data.get('phone', ''),
             data.get('workType', '普工'), data.get('avatar', ''),
             1 if data.get('active', True) else 0, data.get('joinDate', ''),
             data.get('created_at') or now_iso()))
    conn.commit()
    return mid


def upsert_project(conn, data):
    pid = data.get('_id') or gen_id('p')
    old = conn.execute('SELECT id FROM projects WHERE id=?', (pid,)).fetchone()
    fields = (data.get('name', ''), data.get('code', ''), data.get('description', ''),
              data.get('location', ''), data.get('managerId', ''),
              json.dumps(data.get('memberIds', []), ensure_ascii=False),
              data.get('startDate', ''), data.get('endDate', ''), data.get('status', 'planning'),
              int(data.get('progress', 0) or 0),
              json.dumps(data.get('tags', []), ensure_ascii=False))
    if old:
        conn.execute(
            'UPDATE projects SET name=?,code=?,description=?,location=?,manager_id=?,member_ids=?,start_date=?,end_date=?,status=?,progress=?,tags=?,updated_at=? WHERE id=?',
            fields + (now_iso(), pid))
    else:
        conn.execute(
            'INSERT INTO projects (id,name,code,description,location,manager_id,member_ids,start_date,end_date,status,progress,tags,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (pid,) + fields + (data.get('created_at') or now_iso(), now_iso()))
    conn.commit()
    return pid


def upsert_task(conn, data):
    tid = data.get('_id') or gen_id('t')
    old = conn.execute('SELECT * FROM tasks WHERE id=?', (tid,)).fetchone()
    status = data.get('status', 'todo')
    history = data.get('history')
    if old is not None and history is None and old['status'] != status:
        hist = json.loads(old['history'] or '[]')
        hist.append({'from': old['status'], 'to': status, 'ts': now_iso(),
                     'userId': data.get('_changedBy', '')})
        history = hist
    if old is None and history is None:
        history = [{'from': None, 'to': status, 'ts': now_iso(), 'userId': data.get('_changedBy', '')}]
    fields = (data.get('projectId', ''), data.get('title', ''), data.get('description', ''),
              data.get('assigneeId', ''), data.get('reporterId', ''),
              data.get('priority', 'normal'), status, data.get('startDate', ''),
              data.get('dueDate', ''), int(data.get('progress', 0) or 0),
              json.dumps(data.get('tags', []), ensure_ascii=False),
              json.dumps(data.get('comments', []), ensure_ascii=False),
              json.dumps(history if history is not None else (json.loads(old['history']) if old else []), ensure_ascii=False))
    if old:
        conn.execute(
            'UPDATE tasks SET project_id=?,title=?,description=?,assignee_id=?,reporter_id=?,priority=?,status=?,start_date=?,due_date=?,progress=?,tags=?,comments=?,history=?,updated_at=? WHERE id=?',
            fields + (now_iso(), tid))
    else:
        conn.execute(
            'INSERT INTO tasks (id,project_id,title,description,assignee_id,reporter_id,priority,status,start_date,due_date,progress,tags,comments,history,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (tid,) + fields + (data.get('created_at') or now_iso(), now_iso()))
    conn.commit()
    sync_project_progress(conn, data.get('projectId', ''))
    return tid


def delete_member(conn, mid):
    conn.execute('DELETE FROM members WHERE id=?', (mid,))
    for r in conn.execute('SELECT * FROM projects').fetchall():
        p = row_to_project(r)
        changed = False
        if p['managerId'] == mid:
            p['managerId'] = ''
            changed = True
        if mid in p['memberIds']:
            p['memberIds'] = [x for x in p['memberIds'] if x != mid]
            changed = True
        if changed:
            upsert_project(conn, p)
    for r in conn.execute('SELECT * FROM tasks WHERE assignee_id=?', (mid,)).fetchall():
        t = row_to_task(r)
        t['assigneeId'] = ''
        upsert_task(conn, t)
    conn.commit()


def delete_project(conn, pid):
    conn.execute('DELETE FROM tasks WHERE project_id=?', (pid,))
    conn.execute('DELETE FROM projects WHERE id=?', (pid,))
    conn.commit()


def delete_task(conn, tid):
    row = conn.execute('SELECT * FROM tasks WHERE id=?', (tid,)).fetchone()
    conn.execute('DELETE FROM tasks WHERE id=?', (tid,))
    conn.commit()
    if row:
        sync_project_progress(conn, row['project_id'])


def upsert_report(conn, data, uid):
    rid = data.get('_id') or gen_id('rp')
    now = now_iso()
    old = conn.execute('SELECT * FROM reports WHERE id=?', (rid,)).fetchone()
    status = data.get('status', 'draft')

    def prev(field, default=''):
        return data.get(field) if data.get(field) else (old[field] if old else default)

    submitted = prev('submitted_at')
    signed = prev('signed_at')
    rejected = prev('rejected_at')
    if old is None:
        if status in ('submitted', 'signed', 'rejected'):
            submitted = submitted or now
        if status == 'signed':
            signed = now
        if status == 'rejected':
            rejected = now
    else:
        if old['status'] != status:
            if status == 'submitted':
                submitted = now
            elif status == 'signed':
                signed = now
            elif status == 'rejected':
                rejected = now
    fields = (data.get('date', ''), status, data.get('remarks', ''),
              data.get('approver', ''), data.get('rejected_reason', ''),
              data.get('signature', ''),
              json.dumps(data.get('tasks', []), ensure_ascii=False),
              uid if old is None else (old['created_by'] or uid),
              submitted, signed, rejected)
    if old:
        conn.execute(
            'UPDATE reports SET date=?,status=?,remarks=?,approver=?,rejected_reason=?,signature=?,tasks_json=?,created_by=?,submitted_at=?,signed_at=?,rejected_at=?,updated_at=? WHERE id=?',
            fields + (now, rid))
    else:
        conn.execute(
            'INSERT INTO reports (id,date,status,remarks,approver,rejected_reason,signature,tasks_json,created_by,submitted_at,signed_at,rejected_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (rid,) + fields + (data.get('created_at') or now, now))
    conn.commit()
    return rid


# ============================================================
# HTTP 服务
# ============================================================

MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'EngMS/2.0'

    # ---------- 基础输出 ----------
    def _json(self, obj, code=200, set_cookie=None):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        if set_cookie:
            self.send_header('Set-Cookie', set_cookie)
        self.end_headers()
        self.wfile.write(body)

    def _error(self, msg, code=400):
        self._json({'error': msg}, code)

    def _body(self):
        try:
            n = int(self.headers.get('Content-Length') or 0)
            if n <= 0:
                return {}
            raw = self.rfile.read(n)
            return json.loads(raw.decode('utf-8'))
        except Exception:
            return {}

    def log_message(self, fmt, *args):
        pass  # 静默访问日志

    # ---------- 路由 ----------
    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        qs = parse_qs(parsed.query)
        if path.startswith('/api/'):
            self.route_api('GET', path, qs)
        else:
            self.serve_static(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path.startswith('/api/'):
            self.route_api('POST', path, parse_qs(parsed.query))
        else:
            self._error('Not Found', 404)

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path.startswith('/api/'):
            self.route_api('PUT', path, parse_qs(parsed.query))
        else:
            self._error('Not Found', 404)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path.startswith('/api/'):
            self.route_api('DELETE', path, parse_qs(parsed.query))
        else:
            self._error('Not Found', 404)

    # ---------- 静态文件 ----------
    def serve_static(self, path):
        if path in ('/', ''):
            path = '/index.html'
        fp = os.path.normpath(os.path.join(WEB_ROOT, path.lstrip('/')))
        if not fp.startswith(WEB_ROOT):
            self._error('Forbidden', 403)
            return
        if not os.path.isfile(fp):
            self._error('Not Found', 404)
            return
        ext = os.path.splitext(fp)[1].lower()
        ctype = MIME.get(ext, 'application/octet-stream')
        try:
            with open(fp, 'rb') as f:
                data = f.read()
        except Exception:
            self._error('Read Error', 500)
            return
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(data)

    # ---------- API ----------
    def route_api(self, method, path, qs):
        body = self._body() if method in ('POST', 'PUT') else {}
        uid = current_user_id(self)
        try:
            self.handle_api(method, path, qs, body, uid)
        except BrokenPipeError:
            pass
        except Exception as e:
            import traceback
            traceback.print_exc()
            try:
                self._error('服务器错误: %s' % e, 500)
            except Exception:
                pass

    def handle_api(self, method, path, qs, body, uid):
        conn = get_db()

        # ---- 引导 / 登录 ----
        if method == 'GET' and path == '/api/bootstrap':
            seed_if_empty()
            with _lock:
                user = None
                if uid:
                    r = conn.execute('SELECT * FROM members WHERE id=?', (uid,)).fetchone()
                    user = row_to_member(r) if r else None
                data = {
                    'user': user,
                    'members': list_members(conn),
                    'projects': list_projects(conn),
                    'tasks': list_tasks(conn),
                }
            conn.close()
            return self._json(data)

        if method == 'POST' and path == '/api/login':
            mid = (body or {}).get('memberId', '')
            r = conn.execute('SELECT * FROM members WHERE id=?', (mid,)).fetchone()
            conn.close()
            if not r:
                return self._error('人员不存在', 404)
            token = _uuid.uuid4().hex
            _sessions[token] = mid
            save_sessions()
            cookie = '%s=%s; Path=/; Max-Age=2592000; SameSite=Lax' % (COOKIE_NAME, token)
            return self._json({'user': row_to_member(r)}, set_cookie=cookie)

        if method == 'POST' and path == '/api/logout':
            cookies = self.headers.get('Cookie', '') or ''
            m = re.search(COOKIE_NAME + '=([A-Za-z0-9]+)', cookies)
            if m and m.group(1) in _sessions:
                del _sessions[m.group(1)]
                save_sessions()
            conn.close()
            cookie = '%s=; Path=/; Max-Age=0' % COOKIE_NAME
            return self._json({'ok': True}, set_cookie=cookie)

        if method == 'GET' and path == '/api/me':
            user = None
            if uid:
                r = conn.execute('SELECT * FROM members WHERE id=?', (uid,)).fetchone()
                user = row_to_member(r) if r else None
            conn.close()
            return self._json({'user': user})

        # ---- 以下接口需要登录 ----
        if not uid:
            conn.close()
            return self._error('未登录', 401)

        # ---- 人员 ----
        if path == '/api/members' and method == 'POST':
            mid = upsert_member(conn, body)
            r = conn.execute('SELECT * FROM members WHERE id=?', (mid,)).fetchone()
            conn.close()
            return self._json({'record': row_to_member(r)})

        m = re.match(r'^/api/members/([\w-]+)$', path)
        if m:
            mid = m.group(1)
            if method == 'PUT':
                r0 = conn.execute('SELECT * FROM members WHERE id=?', (mid,)).fetchone()
                if not r0:
                    conn.close()
                    return self._error('人员不存在', 404)
                data = dict(row_to_member(r0))
                data.update(body or {})
                data['_id'] = mid
                upsert_member(conn, data)
                r = conn.execute('SELECT * FROM members WHERE id=?', (mid,)).fetchone()
                conn.close()
                return self._json({'record': row_to_member(r)})
            if method == 'DELETE':
                delete_member(conn, mid)
                conn.close()
                return self._json({'ok': True})

        # ---- 项目 ----
        if path == '/api/projects' and method == 'POST':
            pid = upsert_project(conn, body)
            r = conn.execute('SELECT * FROM projects WHERE id=?', (pid,)).fetchone()
            conn.close()
            return self._json({'record': row_to_project(r)})

        m = re.match(r'^/api/projects/([\w-]+)$', path)
        if m:
            pid = m.group(1)
            if method == 'PUT':
                r0 = conn.execute('SELECT * FROM projects WHERE id=?', (pid,)).fetchone()
                if not r0:
                    conn.close()
                    return self._error('项目不存在', 404)
                data = dict(row_to_project(r0))
                data.update(body or {})
                data['_id'] = pid
                upsert_project(conn, data)
                r = conn.execute('SELECT * FROM projects WHERE id=?', (pid,)).fetchone()
                conn.close()
                return self._json({'record': row_to_project(r)})
            if method == 'DELETE':
                delete_project(conn, pid)
                conn.close()
                return self._json({'ok': True})

        # ---- 任务 ----
        if path == '/api/tasks' and method == 'POST':
            tid = upsert_task(conn, body)
            r = conn.execute('SELECT * FROM tasks WHERE id=?', (tid,)).fetchone()
            out = row_to_task(r)
            conn.close()
            return self._json({'record': out})

        m = re.match(r'^/api/tasks/([\w-]+)$', path)
        if m:
            tid = m.group(1)
            if method == 'PUT':
                r0 = conn.execute('SELECT * FROM tasks WHERE id=?', (tid,)).fetchone()
                if not r0:
                    conn.close()
                    return self._error('任务不存在', 404)
                data = dict(row_to_task(r0))
                data.update(body or {})
                data['_id'] = tid
                if 'history' not in (body or {}):
                    data['history'] = None  # 交由 upsert_task 追加状态变更记录
                upsert_task(conn, data)
                r = conn.execute('SELECT * FROM tasks WHERE id=?', (tid,)).fetchone()
                out = row_to_task(r)
                conn.close()
                return self._json({'record': out})
            if method == 'DELETE':
                delete_task(conn, tid)
                conn.close()
                return self._json({'ok': True})

        # ---- 日报 ----
        if path == '/api/reports' and method == 'GET':
            page = max(1, int((qs.get('page') or ['1'])[0]))
            page_size = max(1, min(50, int((qs.get('pageSize') or ['10'])[0])))
            status = (qs.get('status') or ['all'])[0]
            kw = (qs.get('q') or [''])[0].strip()
            where, args = [], []
            if status and status != 'all':
                where.append('status=?')
                args.append(status)
            if kw:
                where.append('(remarks LIKE ? OR tasks_json LIKE ?)')
                args += ['%' + kw + '%', '%' + kw + '%']
            wsql = ('WHERE ' + ' AND '.join(where)) if where else ''
            total = conn.execute('SELECT COUNT(*) c FROM reports ' + wsql, args).fetchone()['c']
            rows = conn.execute(
                'SELECT * FROM reports ' + wsql + ' ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?',
                args + [page_size, (page - 1) * page_size]).fetchall()
            conn.close()
            return self._json({
                'items': [row_to_report(r) for r in rows],
                'total': total, 'page': page, 'pageSize': page_size,
            })

        if path == '/api/reports' and method == 'POST':
            rid = upsert_report(conn, body, uid)
            r = conn.execute('SELECT * FROM reports WHERE id=?', (rid,)).fetchone()
            conn.close()
            return self._json({'record': row_to_report(r)})

        m = re.match(r'^/api/reports/([\w-]+)$', path)
        if m:
            rid = m.group(1)
            if method == 'GET':
                r = conn.execute('SELECT * FROM reports WHERE id=?', (rid,)).fetchone()
                conn.close()
                if not r:
                    return self._error('记录不存在', 404)
                return self._json({'record': row_to_report(r)})
            if method == 'DELETE':
                conn.execute('DELETE FROM reports WHERE id=?', (rid,))
                conn.commit()
                conn.close()
                return self._json({'ok': True})

        # ---- 备份 / 恢复 / 清空 ----
        if path == '/api/backup' and method == 'GET':
            with _lock:
                data = {
                    'members': list_members(conn),
                    'projects': list_projects(conn),
                    'tasks': list_tasks(conn),
                    'reports': [row_to_report(r) for r in conn.execute('SELECT * FROM reports').fetchall()],
                    'exported_at': now_iso(),
                    'version': 'eng_ms_v2_db',
                }
            conn.close()
            return self._json(data)

        if path == '/api/restore' and method == 'POST':
            with _lock:
                for t in ('members', 'projects', 'tasks', 'reports'):
                    conn.execute('DELETE FROM ' + t)
                for rec in body.get('members', []):
                    upsert_member(conn, rec)
                for rec in body.get('projects', []):
                    upsert_project(conn, rec)
                for rec in body.get('tasks', []):
                    upsert_task(conn, rec)
                for rec in body.get('reports', []):
                    upsert_report(conn, rec, uid)
            conn.close()
            return self._json({'ok': True})

        if path == '/api/reset' and method == 'POST':
            with _lock:
                for t in ('members', 'projects', 'tasks', 'reports'):
                    conn.execute('DELETE FROM ' + t)
            conn.commit()
            conn.close()
            return self._json({'ok': True})

        conn.close()
        self._error('接口不存在: %s %s' % (method, path), 404)


def main():
    port = 8080
    if len(os.sys.argv) > 1:
        try:
            port = int(os.sys.argv[1])
        except ValueError:
            pass
    init_db()
    seed_if_empty()
    load_sessions()
    server = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    print('=' * 52)
    print('  Engineering Management System (DB edition) started')
    print('  Local       : http://localhost:%d' % port)
    print('  LAN         : http://<host-ip>:%d (mobile on same WiFi)' % port)
    print('  Database    : %s' % DB_PATH)
    print('  Press Ctrl+C to stop.')
    print('=' * 52)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n[server stopped]')


if __name__ == '__main__':
    main()
