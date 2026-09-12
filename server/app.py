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

import hashlib
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
UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')  # 附件图片存放根目录
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
CREATE TABLE IF NOT EXISTS daily_plans (
  id TEXT PRIMARY KEY,
  date TEXT DEFAULT '',
  plan_date TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  tasks_json TEXT DEFAULT '[]',
  crew_json TEXT DEFAULT '{"night":[],"rest":[],"adjust":[]}',
  remarks TEXT DEFAULT '',
  submitter TEXT DEFAULT '',
  submitted_at TEXT DEFAULT '',
  approver TEXT DEFAULT '',
  approved_at TEXT DEFAULT '',
  rejected_at TEXT DEFAULT '',
  rejected_reason TEXT DEFAULT '',
  reviewed_by TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS weekly_plans (
  id TEXT PRIMARY KEY,
  week_start TEXT DEFAULT '',
  week_end TEXT DEFAULT '',
  title TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  content TEXT DEFAULT '',
  members_json TEXT DEFAULT '[]',
  submitter TEXT DEFAULT '',
  submitted_at TEXT DEFAULT '',
  approver TEXT DEFAULT '',
  approved_at TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS weekly_reports (
  id TEXT PRIMARY KEY,
  week_start TEXT DEFAULT '',
  week_end TEXT DEFAULT '',
  title TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  summary TEXT DEFAULT '',
  items_json TEXT DEFAULT '[]',
  submitter TEXT DEFAULT '',
  submitted_at TEXT DEFAULT '',
  approver TEXT DEFAULT '',
  approved_at TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  date TEXT DEFAULT '',
  name TEXT DEFAULT '',
  spec TEXT DEFAULT '',
  unit TEXT DEFAULT '',
  qty TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  applicant TEXT DEFAULT '',
  approver TEXT DEFAULT '',
  approved_at TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  type TEXT DEFAULT 'generic',
  ref_id TEXT DEFAULT '',
  title TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  applicant TEXT DEFAULT '',
  approver TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  payload_json TEXT DEFAULT '{}',
  decided_at TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  code TEXT DEFAULT '',
  parent_id TEXT DEFAULT '',
  manager_id TEXT DEFAULT '',
  description TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  key TEXT DEFAULT '',
  name TEXT DEFAULT '',
  description TEXT DEFAULT '',
  permissions_json TEXT DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT DEFAULT '{}',
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


def row_to_daily_plan(r):
    return {
        '_id': r['id'], 'date': r['date'], 'plan_date': r['plan_date'],
        'status': r['status'],
        'tasks': json.loads(r['tasks_json'] or '[]'),
        'crew': json.loads(r['crew_json'] or '{"night":[],"rest":[],"adjust":[]}'),
        'remarks': r['remarks'], 'submitter': r['submitter'],
        'submitted_at': r['submitted_at'], 'approver': r['approver'],
        'approved_at': r['approved_at'], 'rejected_at': r['rejected_at'],
        'rejected_reason': r['rejected_reason'], 'reviewed_by': r['reviewed_by'],
        'created_at': r['created_at'], 'updated_at': r['updated_at'],
    }


def row_to_weekly_plan(r):
    return {
        '_id': r['id'], 'week_start': r['week_start'], 'week_end': r['week_end'],
        'title': r['title'], 'status': r['status'],
        'content': r['content'],
        'members': json.loads(r['members_json'] or '[]'),
        'submitter': r['submitter'], 'submitted_at': r['submitted_at'],
        'approver': r['approver'], 'approved_at': r['approved_at'],
        'created_at': r['created_at'], 'updated_at': r['updated_at'],
    }


def row_to_weekly_report(r):
    return {
        '_id': r['id'], 'week_start': r['week_start'], 'week_end': r['week_end'],
        'title': r['title'], 'status': r['status'],
        'summary': r['summary'],
        'items': json.loads(r['items_json'] or '[]'),
        'submitter': r['submitter'], 'submitted_at': r['submitted_at'],
        'approver': r['approver'], 'approved_at': r['approved_at'],
        'created_at': r['created_at'], 'updated_at': r['updated_at'],
    }


def row_to_purchase(r):
    return {
        '_id': r['id'], 'date': r['date'], 'name': r['name'],
        'spec': r['spec'], 'unit': r['unit'], 'qty': r['qty'],
        'reason': r['reason'], 'status': r['status'],
        'applicant': r['applicant'], 'approver': r['approver'],
        'approved_at': r['approved_at'],
        'created_at': r['created_at'], 'updated_at': r['updated_at'],
    }


def row_to_approval(r):
    return {
        '_id': r['id'], 'type': r['type'], 'ref_id': r['ref_id'],
        'title': r['title'], 'status': r['status'],
        'applicant': r['applicant'], 'approver': r['approver'],
        'reason': r['reason'],
        'payload': json.loads(r['payload_json'] or '{}'),
        'decided_at': r['decided_at'],
        'created_at': r['created_at'], 'updated_at': r['updated_at'],
    }


def row_to_department(r):
    return {
        '_id': r['id'], 'name': r['name'], 'code': r['code'],
        'parent_id': r['parent_id'], 'manager_id': r['manager_id'],
        'description': r['description'], 'sort_order': r['sort_order'],
        'created_at': r['created_at'], 'updated_at': r['updated_at'],
    }


def row_to_role(r):
    return {
        '_id': r['id'], 'key': r['key'], 'name': r['name'],
        'description': r['description'],
        'permissions': json.loads(r['permissions_json'] or '[]'),
        'sort_order': r['sort_order'],
        'created_at': r['created_at'], 'updated_at': r['updated_at'],
    }


def row_to_setting(r):
    return {
        'key': r['key'],
        'value': json.loads(r['value_json'] or '{}'),
        'updated_at': r['updated_at'],
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


def list_daily_plans(conn):
    return [row_to_daily_plan(r) for r in conn.execute('SELECT * FROM daily_plans ORDER BY date DESC, created_at DESC').fetchall()]


def list_weekly_plans(conn):
    return [row_to_weekly_plan(r) for r in conn.execute('SELECT * FROM weekly_plans ORDER BY week_start DESC, created_at DESC').fetchall()]


def list_weekly_reports(conn):
    return [row_to_weekly_report(r) for r in conn.execute('SELECT * FROM weekly_reports ORDER BY week_start DESC, created_at DESC').fetchall()]


def list_purchases(conn):
    return [row_to_purchase(r) for r in conn.execute('SELECT * FROM purchases ORDER BY date DESC, created_at DESC').fetchall()]


def list_approvals(conn):
    return [row_to_approval(r) for r in conn.execute('SELECT * FROM approvals ORDER BY created_at DESC').fetchall()]


def list_departments(conn):
    return [row_to_department(r) for r in conn.execute('SELECT * FROM departments ORDER BY sort_order, name').fetchall()]


def list_roles(conn):
    return [row_to_role(r) for r in conn.execute('SELECT * FROM roles ORDER BY sort_order, name').fetchall()]


def list_settings(conn):
    return {r['key']: json.loads(r['value_json'] or '{}') for r in conn.execute('SELECT * FROM settings').fetchall()}


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


# ---- daily_plans ----
def upsert_daily_plan(conn, data):
    did = data.get('_id') or gen_id('dp')
    now = now_iso()
    fields = (data.get('date', ''), data.get('plan_date', '') or data.get('date', ''),
              data.get('status', 'draft'),
              json.dumps(data.get('tasks', []), ensure_ascii=False),
              json.dumps(data.get('crew', {'night':[], 'rest':[], 'adjust':[]}), ensure_ascii=False),
              data.get('remarks', ''), data.get('submitter', ''),
              data.get('submitted_at', ''), data.get('approver', ''),
              data.get('approved_at', ''), data.get('rejected_at', ''),
              data.get('rejected_reason', ''), data.get('reviewed_by', ''))
    old = conn.execute('SELECT id FROM daily_plans WHERE id=?', (did,)).fetchone()
    if old:
        conn.execute(
            'UPDATE daily_plans SET date=?,plan_date=?,status=?,tasks_json=?,crew_json=?,remarks=?,submitter=?,submitted_at=?,approver=?,approved_at=?,rejected_at=?,rejected_reason=?,reviewed_by=?,updated_at=? WHERE id=?',
            fields + (now, did))
    else:
        conn.execute(
            'INSERT INTO daily_plans (id,date,plan_date,status,tasks_json,crew_json,remarks,submitter,submitted_at,approver,approved_at,rejected_at,rejected_reason,reviewed_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (did,) + fields + (data.get('created_at') or now, now))
    conn.commit()
    return did


# ---- weekly_plans ----
def upsert_weekly_plan(conn, data):
    wid = data.get('_id') or gen_id('wp')
    now = now_iso()
    fields = (data.get('week_start', ''), data.get('week_end', ''),
              data.get('title', ''), data.get('status', 'draft'),
              data.get('content', ''),
              json.dumps(data.get('members', []), ensure_ascii=False),
              data.get('submitter', ''), data.get('submitted_at', ''),
              data.get('approver', ''), data.get('approved_at', ''))
    old = conn.execute('SELECT id FROM weekly_plans WHERE id=?', (wid,)).fetchone()
    if old:
        conn.execute(
            'UPDATE weekly_plans SET week_start=?,week_end=?,title=?,status=?,content=?,members_json=?,submitter=?,submitted_at=?,approver=?,approved_at=?,updated_at=? WHERE id=?',
            fields + (now, wid))
    else:
        conn.execute(
            'INSERT INTO weekly_plans (id,week_start,week_end,title,status,content,members_json,submitter,submitted_at,approver,approved_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (wid,) + fields + (data.get('created_at') or now, now))
    conn.commit()
    return wid


# ---- weekly_reports ----
def upsert_weekly_report(conn, data):
    wid = data.get('_id') or gen_id('wr')
    now = now_iso()
    fields = (data.get('week_start', ''), data.get('week_end', ''),
              data.get('title', ''), data.get('status', 'draft'),
              data.get('summary', ''),
              json.dumps(data.get('items', []), ensure_ascii=False),
              data.get('submitter', ''), data.get('submitted_at', ''),
              data.get('approver', ''), data.get('approved_at', ''))
    old = conn.execute('SELECT id FROM weekly_reports WHERE id=?', (wid,)).fetchone()
    if old:
        conn.execute(
            'UPDATE weekly_reports SET week_start=?,week_end=?,title=?,status=?,summary=?,items_json=?,submitter=?,submitted_at=?,approver=?,approved_at=?,updated_at=? WHERE id=?',
            fields + (now, wid))
    else:
        conn.execute(
            'INSERT INTO weekly_reports (id,week_start,week_end,title,status,summary,items_json,submitter,submitted_at,approver,approved_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (wid,) + fields + (data.get('created_at') or now, now))
    conn.commit()
    return wid


# ---- purchases ----
def upsert_purchase(conn, data):
    pid = data.get('_id') or gen_id('pu')
    now = now_iso()
    fields = (data.get('date', ''), data.get('name', ''),
              data.get('spec', ''), data.get('unit', ''),
              data.get('qty', ''), data.get('reason', ''),
              data.get('status', 'draft'),
              data.get('applicant', ''), data.get('approver', ''),
              data.get('approved_at', ''))
    old = conn.execute('SELECT id FROM purchases WHERE id=?', (pid,)).fetchone()
    if old:
        conn.execute(
            'UPDATE purchases SET date=?,name=?,spec=?,unit=?,qty=?,reason=?,status=?,applicant=?,approver=?,approved_at=?,updated_at=? WHERE id=?',
            fields + (now, pid))
    else:
        conn.execute(
            'INSERT INTO purchases (id,date,name,spec,unit,qty,reason,status,applicant,approver,approved_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (pid,) + fields + (data.get('created_at') or now, now))
    conn.commit()
    return pid


# ---- approvals ----
def upsert_approval(conn, data):
    aid = data.get('_id') or gen_id('ap')
    now = now_iso()
    fields = (data.get('type', 'generic'), data.get('ref_id', ''),
              data.get('title', ''), data.get('status', 'pending'),
              data.get('applicant', ''), data.get('approver', ''),
              data.get('reason', ''),
              json.dumps(data.get('payload', {}), ensure_ascii=False),
              data.get('decided_at', ''))
    old = conn.execute('SELECT id FROM approvals WHERE id=?', (aid,)).fetchone()
    if old:
        conn.execute(
            'UPDATE approvals SET type=?,ref_id=?,title=?,status=?,applicant=?,approver=?,reason=?,payload_json=?,decided_at=?,updated_at=? WHERE id=?',
            fields + (now, aid))
    else:
        conn.execute(
            'INSERT INTO approvals (id,type,ref_id,title,status,applicant,approver,reason,payload_json,decided_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            (aid,) + fields + (data.get('created_at') or now, now))
    conn.commit()
    return aid


# ---- departments ----
def upsert_department(conn, data):
    did = data.get('_id') or gen_id('d')
    now = now_iso()
    fields = (data.get('name', ''), data.get('code', ''),
              data.get('parent_id', ''), data.get('manager_id', ''),
              data.get('description', ''), int(data.get('sort_order', 0) or 0))
    old = conn.execute('SELECT id FROM departments WHERE id=?', (did,)).fetchone()
    if old:
        conn.execute(
            'UPDATE departments SET name=?,code=?,parent_id=?,manager_id=?,description=?,sort_order=?,updated_at=? WHERE id=?',
            fields + (now, did))
    else:
        conn.execute(
            'INSERT INTO departments (id,name,code,parent_id,manager_id,description,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
            (did,) + fields + (data.get('created_at') or now, now))
    conn.commit()
    return did


# ---- roles ----
def upsert_role(conn, data):
    rid = data.get('_id') or gen_id('r')
    now = now_iso()
    fields = (data.get('key', ''), data.get('name', ''),
              data.get('description', ''),
              json.dumps(data.get('permissions', []), ensure_ascii=False),
              int(data.get('sort_order', 0) or 0))
    old = conn.execute('SELECT id FROM roles WHERE id=?', (rid,)).fetchone()
    if old:
        conn.execute(
            'UPDATE roles SET key=?,name=?,description=?,permissions_json=?,sort_order=?,updated_at=? WHERE id=?',
            fields + (now, rid))
    else:
        conn.execute(
            'INSERT INTO roles (id,key,name,description,permissions_json,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
            (rid,) + fields + (data.get('created_at') or now, now))
    conn.commit()
    return rid


# ---- settings (KV) ----
def upsert_setting(conn, key, value):
    now = now_iso()
    json_val = json.dumps(value, ensure_ascii=False)
    old = conn.execute('SELECT key FROM settings WHERE key=?', (key,)).fetchone()
    if old:
        conn.execute('UPDATE settings SET value_json=?,updated_at=? WHERE key=?', (json_val, now, key))
    else:
        conn.execute('INSERT INTO settings (key,value_json,updated_at) VALUES (?,?,?)', (key, json_val, now))
    conn.commit()


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

    def _multipart(self):
        """手写 multipart/form-data 解析 (Python 3.13 移除了 cgi 模块)
        返回 {fields:{}, files:{}, error:str}
        - 限制总大小 50MB, 单文件 8MB
        - 字段名按 boundary 切, 解析 Content-Disposition 拿 filename
        """
        try:
            ctype = self.headers.get('Content-Type', '')
            if 'multipart/form-data' not in ctype:
                return {'fields': {}, 'files': {}, 'error': '不是 multipart'}
            # 提取 boundary
            import re as _re
            m = _re.search(r'boundary=(?:"([^"]+)"|([^;\s]+))', ctype)
            if not m:
                return {'fields': {}, 'files': {}, 'error': '缺少 boundary'}
            boundary = '--' + (m.group(1) or m.group(2))
            n = int(self.headers.get('Content-Length') or 0)
            if n <= 0:
                return {'fields': {}, 'files': {}, 'error': '空 body'}
            if n > 50 * 1024 * 1024:
                return {'fields': {}, 'files': {}, 'error': '总大小超 50MB'}
            raw = self.rfile.read(n)
            fields, files = {}, {}
            # 切分各 part
            parts = raw.split(boundary.encode('utf-8'))
            for part in parts[1:-1]:  # 跳过首尾空段
                if not part or part.strip() == b'':
                    continue
                # 切 headers 与 body
                sep = b'\r\n\r\n'
                idx = part.find(sep)
                if idx < 0:
                    continue
                head_raw = part[:idx].decode('utf-8', errors='ignore')
                body = part[idx + 4:]
                # 去掉尾部 \r\n
                if body.endswith(b'\r\n'):
                    body = body[:-2]
                # 解析 Content-Disposition
                cd_m = _re.search(r'Content-Disposition:\s*form-data;\s*(.*?)(?:\r\n\r\n|$)', head_raw, _re.DOTALL | _re.IGNORECASE)
                if not cd_m:
                    continue
                cd = cd_m.group(1)
                name_m = _re.search(r'name="([^"]+)"', cd)
                if not name_m:
                    continue
                name = name_m.group(1)
                file_m = _re.search(r'filename="([^"]*)"', cd)
                if file_m and file_m.group(1):
                    filename = file_m.group(1)
                    ctype_m = _re.search(r'Content-Type:\s*([^\r\n]+)', head_raw, _re.IGNORECASE)
                    ftype = (ctype_m.group(1).strip() if ctype_m else 'application/octet-stream')
                    if len(body) > 8 * 1024 * 1024:
                        return {'fields': {}, 'files': {}, 'error': '单文件超 8MB'}
                    files[name] = {'filename': filename, 'content': body, 'type': ftype}
                else:
                    fields[name] = body.decode('utf-8', errors='replace')
            return {'fields': fields, 'files': files}
        except Exception as e:
            return {'fields': {}, 'files': {}, 'error': str(e)}

    def _delete_file(self, rel_path):
        """删除 uploads/{rel} 路径下的文件, 防止越权"""
        if not rel_path: return False
        full = os.path.normpath(os.path.join(UPLOAD_DIR, rel_path))
        if not full.startswith(UPLOAD_DIR): return False
        if os.path.isfile(full):
            try: os.remove(full); return True
            except Exception: return False
        return False

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
        # uploads 目录走专门路径(URL 形如 /uploads/2026-09-15/t1/abc.jpg)
        if path.startswith('/uploads/'):
            rel = path[len('/uploads/'):].lstrip('/')
            fp = os.path.normpath(os.path.join(UPLOAD_DIR, rel))
            if not fp.startswith(UPLOAD_DIR):
                self._error('Forbidden', 403); return
        else:
            fp = os.path.normpath(os.path.join(WEB_ROOT, path.lstrip('/')))
            if not fp.startswith(WEB_ROOT):
                self._error('Forbidden', 403); return
        if not os.path.isfile(fp):
            self._error('Not Found', 404); return
        ext = os.path.splitext(fp)[1].lower()
        ctype = MIME.get(ext, 'application/octet-stream')
        try:
            with open(fp, 'rb') as f:
                data = f.read()
        except Exception:
            self._error('Read Error', 500); return
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(data)

    # ---------- API ----------
    def route_api(self, method, path, qs):
        ctype = self.headers.get('Content-Type', '') or ''
        is_multipart = 'multipart/form-data' in ctype
        body = self._body() if (method in ('POST', 'PUT') and not is_multipart) else {}
        uid = current_user_id(self)

        # ---- 附件上传 (multipart) ----
        if path == '/api/uploads' and method == 'POST' and is_multipart:
            try:
                self.handle_upload(uid)
            except BrokenPipeError:
                pass
            except Exception as e:
                import traceback; traceback.print_exc()
                try: self._error('上传失败: %s' % e, 500)
                except Exception: pass
            return

        # ---- 附件删除 ----
        if path == '/api/uploads' and method == 'DELETE':
            try:
                self.handle_upload_delete(uid, qs)
            except BrokenPipeError:
                pass
            except Exception as e:
                try: self._error('删除失败: %s' % e, 500)
                except Exception: pass
            return

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

    def handle_upload(self, uid):
        if not uid:
            self._error('未登录', 401); return
        mp = self._multipart()
        if mp.get('error'):
            self._error('multipart 解析失败: ' + mp['error'], 400); return
        f = mp['files'].get('file')
        if not f:
            self._error('缺少 file 字段', 400); return
        if 'image/' not in (f['type'] or ''):
            self._error('只支持图片文件', 400); return

        date = (mp['fields'].get('date') or today_str()).strip()
        task_idx = (mp['fields'].get('task_idx') or '0').strip()
        task_content = (mp['fields'].get('task_content') or '').strip()

        # 校验日期 + task_idx 防止路径越权
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', date):
            self._error('date 格式错误', 400); return
        if not re.match(r'^\d{1,3}$', task_idx):
            self._error('task_idx 格式错误', 400); return

        # 文件名: {date}_{task_idx}_{hash(content)}_{ts}.jpg
        content_hash = hashlib.md5(task_content.encode('utf-8')).hexdigest()[:6] if task_content else 'nohash'
        ts = datetime.now().strftime('%H%M%S%f')[:12]
        filename = '{}_{}_{}_{}.jpg'.format(date, task_idx, content_hash, ts)

        rel_dir = os.path.join(date, task_idx)
        full_dir = os.path.join(UPLOAD_DIR, rel_dir)
        os.makedirs(full_dir, exist_ok=True)
        full_path = os.path.join(full_dir, filename)

        try:
            with open(full_path, 'wb') as f_out:
                f_out.write(f['content'])
        except Exception as e:
            self._error('写文件失败: %s' % e, 500); return

        size = len(f['content'])
        rel_path = '{}/{}/{}'.format(date, task_idx, filename)
        url = '/uploads/' + rel_path
        self._json({
            'ok': True,
            'attachment': {
                'filename': filename,
                'url': url,
                'rel_path': rel_path,
                'size': size,
                'uploaded_at': now_iso(),
                'task_idx': int(task_idx),
            }
        })

    def handle_upload_delete(self, uid, qs):
        if not uid:
            self._error('未登录', 401); return
        rel = (qs.get('path') or [''])[0]
        if not rel:
            self._error('缺少 path 参数', 400); return
        if self._delete_file(rel):
            self._json({'ok': True})
        else:
            self._error('文件不存在或删除失败', 404)

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
                    'reports': [row_to_report(r) for r in conn.execute('SELECT * FROM reports').fetchall()],
                    'daily_plans': list_daily_plans(conn),
                    'weekly_plans': list_weekly_plans(conn),
                    'weekly_reports': list_weekly_reports(conn),
                    'purchases': list_purchases(conn),
                    'approvals': list_approvals(conn),
                    'departments': list_departments(conn),
                    'roles': list_roles(conn),
                    'settings': list_settings(conn),
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

        # ---- 通用 CRUD 路由工厂 (8 类业务数据) ----
        # 路径 -> (表名, row_to_X, upsert_X, list_X, gen_prefix)
        REST_RULES = {
            '/api/daily-plans':   ('daily_plans',   row_to_daily_plan,   upsert_daily_plan,   list_daily_plans,   'dp'),
            '/api/weekly-plans':  ('weekly_plans',  row_to_weekly_plan,  upsert_weekly_plan,  list_weekly_plans,  'wp'),
            '/api/weekly-reports':('weekly_reports',row_to_weekly_report,upsert_weekly_report,list_weekly_reports,'wr'),
            '/api/purchases':     ('purchases',     row_to_purchase,     upsert_purchase,     list_purchases,     'pu'),
            '/api/approvals':     ('approvals',     row_to_approval,     upsert_approval,     list_approvals,     'ap'),
            '/api/departments':   ('departments',   row_to_department,   upsert_department,   list_departments,   'd'),
            '/api/roles':         ('roles',         row_to_role,         upsert_role,         list_roles,         'r'),
        }

        # 列表 / 创建
        for list_path, (table, to_row, upsert_fn, list_fn, prefix) in REST_RULES.items():
            if path == list_path:
                if method == 'GET':
                    page = max(1, int((qs.get('page') or ['1'])[0]))
                    page_size = max(1, min(100, int((qs.get('pageSize') or ['100'])[0])))
                    status_q = (qs.get('status') or [''])[0]
                    kw = (qs.get('q') or [''])[0].strip()
                    where, args = [], []
                    if status_q:
                        where.append('status=?'); args.append(status_q)
                    if kw:
                        # 跨文本字段搜索
                        text_cols = {'daily_plans':'remarks','weekly_plans':'title||content','weekly_reports':'title||summary','purchases':'name||spec||reason','approvals':'title||reason','departments':'name||code||description','roles':'key||name||description'}
                        col = text_cols.get(table, 'name')
                        where.append('(' + col + ' LIKE ?)'); args.append('%' + kw + '%')
                    wsql = ('WHERE ' + ' AND '.join(where)) if where else ''
                    total = conn.execute('SELECT COUNT(*) c FROM ' + table + ' ' + wsql, args).fetchone()['c']
                    rows = conn.execute(
                        'SELECT * FROM ' + table + ' ' + wsql + ' LIMIT ? OFFSET ?',
                        args + [page_size, (page - 1) * page_size]).fetchall()
                    conn.close()
                    return self._json({
                        'items': [to_row(r) for r in rows],
                        'total': total, 'page': page, 'pageSize': page_size,
                    })
                if method == 'POST':
                    rid = upsert_fn(conn, body or {})
                    r = conn.execute('SELECT * FROM ' + table + ' WHERE id=?', (rid,)).fetchone()
                    conn.close()
                    return self._json({'record': to_row(r)})

        # 单条读 / 更新 / 删除
        for list_path, (table, to_row, upsert_fn, list_fn, prefix) in REST_RULES.items():
            m = re.match(r'^' + re.escape(list_path) + r'/([\w-]+)$', path)
            if m:
                rid = m.group(1)
                if method == 'GET':
                    r = conn.execute('SELECT * FROM ' + table + ' WHERE id=?', (rid,)).fetchone()
                    conn.close()
                    if not r: return self._error('记录不存在', 404)
                    return self._json({'record': to_row(r)})
                if method == 'PUT':
                    r0 = conn.execute('SELECT * FROM ' + table + ' WHERE id=?', (rid,)).fetchone()
                    if not r0:
                        conn.close(); return self._error('记录不存在', 404)
                    data = dict(to_row(r0))
                    data.update(body or {})
                    data['_id'] = rid
                    upsert_fn(conn, data)
                    r = conn.execute('SELECT * FROM ' + table + ' WHERE id=?', (rid,)).fetchone()
                    conn.close()
                    return self._json({'record': to_row(r)})
                if method == 'DELETE':
                    conn.execute('DELETE FROM ' + table + ' WHERE id=?', (rid,))
                    conn.commit()
                    conn.close()
                    return self._json({'ok': True})

        # ---- settings (KV) ----
        if path == '/api/settings' and method == 'GET':
            data = list_settings(conn)
            conn.close()
            return self._json({'items': data, 'keys': list(data.keys())})
        if path == '/api/settings' and method == 'POST':
            body = body or {}
            key = body.get('key')
            value = body.get('value', {})
            if not key:
                conn.close(); return self._error('缺少 key', 400)
            upsert_setting(conn, key, value)
            conn.close()
            return self._json({'ok': True, 'key': key})
        m = re.match(r'^/api/settings/([\w.-]+)$', path)
        if m:
            key = m.group(1)
            if method == 'GET':
                r = conn.execute('SELECT * FROM settings WHERE key=?', (key,)).fetchone()
                conn.close()
                if not r: return self._error('设置不存在', 404)
                return self._json({'record': row_to_setting(r)})
            if method == 'DELETE':
                conn.execute('DELETE FROM settings WHERE key=?', (key,))
                conn.commit()
                conn.close()
                return self._json({'ok': True})

        # ---- 一键迁移 (localStorage -> DB) ----
        if path == '/api/migrate' and method == 'POST':
            with _lock:
                body = body or {}
                inserted = {}
                for rec in body.get('daily_plans', []):
                    upsert_daily_plan(conn, rec)
                for rec in body.get('weekly_plans', []):
                    upsert_weekly_plan(conn, rec)
                for rec in body.get('weekly_reports', []):
                    upsert_weekly_report(conn, rec)
                for rec in body.get('purchases', []):
                    upsert_purchase(conn, rec)
                for rec in body.get('approvals', []):
                    upsert_approval(conn, rec)
                for rec in body.get('departments', []):
                    upsert_department(conn, rec)
                for rec in body.get('roles', []):
                    upsert_role(conn, rec)
                for k, v in (body.get('settings') or {}).items():
                    upsert_setting(conn, k, v)
                inserted = {
                    'daily_plans': list_daily_plans(conn),
                    'weekly_plans': list_weekly_plans(conn),
                    'weekly_reports': list_weekly_reports(conn),
                    'purchases': list_purchases(conn),
                    'approvals': list_approvals(conn),
                    'departments': list_departments(conn),
                    'roles': list_roles(conn),
                }
            conn.close()
            return self._json({'ok': True, 'inserted': {k: len(v) for k, v in inserted.items()}})

        # ---- 备份 / 恢复 / 清空 ----
        if path == '/api/backup' and method == 'GET':
            with _lock:
                data = {
                    'members': list_members(conn),
                    'projects': list_projects(conn),
                    'tasks': list_tasks(conn),
                    'reports': [row_to_report(r) for r in conn.execute('SELECT * FROM reports').fetchall()],
                    'daily_plans': list_daily_plans(conn),
                    'weekly_plans': list_weekly_plans(conn),
                    'weekly_reports': list_weekly_reports(conn),
                    'purchases': list_purchases(conn),
                    'approvals': list_approvals(conn),
                    'departments': list_departments(conn),
                    'roles': list_roles(conn),
                    'settings': list_settings(conn),
                    'exported_at': now_iso(),
                    'version': 'eng_ms_v3_db',
                }
            conn.close()
            return self._json(data)

        if path == '/api/restore' and method == 'POST':
            with _lock:
                for t in ('members', 'projects', 'tasks', 'reports',
                          'daily_plans', 'weekly_plans', 'weekly_reports',
                          'purchases', 'approvals', 'departments', 'roles', 'settings'):
                    conn.execute('DELETE FROM ' + t)
                for rec in body.get('members', []):
                    upsert_member(conn, rec)
                for rec in body.get('projects', []):
                    upsert_project(conn, rec)
                for rec in body.get('tasks', []):
                    upsert_task(conn, rec)
                for rec in body.get('reports', []):
                    upsert_report(conn, rec, uid)
                for rec in body.get('daily_plans', []):
                    upsert_daily_plan(conn, rec)
                for rec in body.get('weekly_plans', []):
                    upsert_weekly_plan(conn, rec)
                for rec in body.get('weekly_reports', []):
                    upsert_weekly_report(conn, rec)
                for rec in body.get('purchases', []):
                    upsert_purchase(conn, rec)
                for rec in body.get('approvals', []):
                    upsert_approval(conn, rec)
                for rec in body.get('departments', []):
                    upsert_department(conn, rec)
                for rec in body.get('roles', []):
                    upsert_role(conn, rec)
                for k, v in (body.get('settings') or {}).items():
                    upsert_setting(conn, k, v)
            conn.close()
            return self._json({'ok': True})

        if path == '/api/reset' and method == 'POST':
            with _lock:
                for t in ('members', 'projects', 'tasks', 'reports',
                          'daily_plans', 'weekly_plans', 'weekly_reports',
                          'purchases', 'approvals', 'departments', 'roles', 'settings'):
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
