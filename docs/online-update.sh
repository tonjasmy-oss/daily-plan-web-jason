#!/usr/bin/env bash
# =============================================================================
#  online-update.sh - update a deployed daily-plan-web-jason on a cloud host
#
#  RUN THIS ON THE CLOUD SERVER (Ubuntu / Debian), after fetching the repo:
#
#      cd /tmp && rm -rf dpwj && \
#      git clone --depth 1 https://ghfast.top/https://github.com/tonjasmy-oss/daily-plan-web-jason.git dpwj && \
#      sudo bash /tmp/dpwj/docs/online-update.sh
#
#  What it does:
#    1. backs up server/data.db   (NEVER overwritten by this script)
#    2. copies  assets/ , *.html , server/app.py  into the app dir
#    3. syntax-checks server/app.py BEFORE restarting
#    4. restarts the systemd service (runs the DB migration)
#    5. applies docs/roles-config.json to the roles table  (skip: --no-roles)
#    6. prints verification output
#
#  Env overrides:  APP_DIR=/opt/daily-plan-web-jason  PORT=31118  SVC_NAME=daily-plan
#
#  NOTE: pure ASCII + LF only. CRLF makes Linux bash fail with "\r: command not found".
# =============================================================================

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP="${APP_DIR:-/opt/daily-plan-web-jason}"
PORT="${PORT:-31118}"
SVC="${SVC_NAME:-daily-plan}"

SYNC_ROLES=1
if [ "${1:-}" = "--no-roles" ]; then
  SYNC_ROLES=0
fi

echo "======================================================================"
echo "  source : $SRC"
echo "  target : $APP"
echo "  port   : $PORT"
echo "======================================================================"

if [ "$(id -u)" -ne 0 ]; then
  echo "[ERROR] must run as root:   sudo bash $0"
  exit 1
fi

RUN_USER="${SUDO_USER:-}"
if [ -z "$RUN_USER" ] || [ "$RUN_USER" = "root" ]; then
  RUN_USER=""
  for u in ubuntu debian admin centos ec2-user; do
    if id "$u" >/dev/null 2>&1; then
      RUN_USER="$u"
      break
    fi
  done
  [ -z "$RUN_USER" ] && RUN_USER="root"
fi
echo "  run as : $RUN_USER"

if [ ! -f "${SRC}/server/app.py" ]; then
  echo "[ERROR] cannot find ${SRC}/server/app.py"
  echo "        clone the repo first, or pass the repo root as APP_DIR"
  exit 1
fi

if [ ! -d "${APP}" ]; then
  echo "[ERROR] app dir not found: ${APP}"
  echo "        first-time deploy -> use deploy-cloud.sh instead"
  exit 1
fi

TS="$(date +%Y%m%d-%H%M%S)"

echo ""
echo "=== [1/6] backup ==="
cp -a "${APP}/server/data.db" "${APP}/server/data.db.bak-${TS}"
echo "  data.db -> data.db.bak-${TS}"
cp -a "${APP}/server/app.py" "/tmp/app.py.bak-${TS}"
echo "  app.py  -> /tmp/app.py.bak-${TS}"

echo ""
echo "=== [2/6] copy files ==="
mkdir -p "${APP}/assets"
cp -rf "${SRC}/assets/." "${APP}/assets/" || { echo "[ERROR] copy assets failed"; exit 1; }
cp -f  "${SRC}"/*.html      "${APP}/"      || { echo "[ERROR] copy html failed"; exit 1; }
cp -f  "${SRC}/server/app.py" "${APP}/server/app.py" || { echo "[ERROR] copy app.py failed"; exit 1; }
echo "  assets/ + *.html + server/app.py copied"
echo "  (server/data.db untouched)"

echo ""
echo "=== [3/6] syntax check ==="
if python3 -m py_compile "${APP}/server/app.py"; then
  echo "  compile OK"
else
  echo "  compile FAILED - rolling back app.py, service NOT restarted"
  cp -f "/tmp/app.py.bak-${TS}" "${APP}/server/app.py"
  exit 1
fi

echo ""
echo "=== [4/6] ownership + restart ==="
chown -R "${RUN_USER}:${RUN_USER}" "${APP}"
chmod 644 "${APP}/server/data.db"
systemctl restart "${SVC}"
sleep 3
echo "  is-active: $(systemctl is-active "${SVC}")"

echo ""
echo "=== [5/6] sync roles config ==="
if [ "$SYNC_ROLES" = "1" ] && [ -f "${SCRIPT_DIR}/roles-config.json" ]; then
  python3 - "${SCRIPT_DIR}/roles-config.json" "${APP}/server/data.db" <<'PYEOF'
import datetime
import json
import sqlite3
import sys

cfg_path, db = sys.argv[1], sys.argv[2]
with open(cfg_path, encoding='utf-8') as fh:
    cfg = json.load(fh)
roles = cfg.get('roles', {})

c = sqlite3.connect(db)
cur = c.cursor()
now = datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:%S')
changed = 0
for key in roles:
    v = roles[key]
    row = cur.execute(
        'SELECT id, modules_json, permissions_json FROM roles WHERE key=?', (key,)).fetchone()
    if not row:
        print('  %-8s SKIP (role not present on server)' % key)
        continue
    new_m = json.dumps(v['modules'], ensure_ascii=False)
    new_p = json.dumps(v['permissions'], ensure_ascii=False)
    if (row[1] or '[]') == new_m and (row[2] or '[]') == new_p:
        print('  %-8s unchanged (%d modules / %d perms)'
              % (key, len(v['modules']), len(v['permissions'])))
        continue
    cur.execute(
        'UPDATE roles SET modules_json=?, permissions_json=?, updated_at=? WHERE id=?',
        (new_m, new_p, now, row[0]))
    changed += 1
    print('  %-8s updated -> %d modules / %d perms'
          % (key, len(v['modules']), len(v['permissions'])))
c.commit()

print('  --- verify ---')
for key, m, p in cur.execute(
        'SELECT key, modules_json, permissions_json FROM roles ORDER BY sort_order'):
    print('  %-8s modules=%2d  perms=%2d'
          % (key, len(json.loads(m or '[]')), len(json.loads(p or '[]'))))
c.close()
print('  roles changed: %d' % changed)
PYEOF
else
  echo "  skipped (--no-roles or roles-config.json missing)"
fi

echo ""
echo "=== [6/6] verify ==="
python3 - "${APP}/server/data.db" <<'PYEOF'
import sqlite3
import sys

c = sqlite3.connect(sys.argv[1])
cols = [r[1] for r in c.execute('PRAGMA table_info(reports)')]
for n in ('fill_signature', 'fill_signed_at'):
    print('  reports.%-16s %s' % (n, 'OK' if n in cols else 'MISSING'))
c.close()
PYEOF

for k in MODULES_LIST resolveRoleModules data-perm fill_signature; do
  n=$(grep -rl "$k" "${APP}/assets/" 2>/dev/null | wc -l)
  echo "  code marker $k -> $n file(s)"
done

curl -s -o /dev/null -w "  GET /login.html      -> %{http_code}\n" "http://127.0.0.1:${PORT}/login.html"
curl -s -o /dev/null -w "  GET /assets/roles.js -> %{http_code}\n" "http://127.0.0.1:${PORT}/assets/roles.js"

echo ""
echo "======================================================================"
echo "  UPDATED."
echo "  rollback :  sudo cp -a ${APP}/server/data.db.bak-${TS} ${APP}/server/data.db"
echo "              sudo cp -a /tmp/app.py.bak-${TS} ${APP}/server/app.py"
echo "              sudo systemctl restart ${SVC}"
echo "  frontend :  tell users to press Ctrl + F5 once (browser cache)"
echo "======================================================================"
