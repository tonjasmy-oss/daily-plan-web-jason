#!/usr/bin/env bash
# ============================================================================
#  Engineering Management System  (daily-plan-web-jason)
#  One-key deploy script for Ubuntu / Debian cloud servers
#
#  Usage:
#      sudo bash deploy-cloud.sh              # default port 31118
#      sudo bash deploy-cloud.sh 8080         # custom port
#
#  What it does:
#      1. locates the project directory
#      2. verifies python3
#      3. refuses to start if the port is already taken
#      4. installs a systemd service (start on boot + auto restart on crash)
#      5. opens the port in ufw when ufw is active
#      6. starts the service and prints the result
#
#  NOTE: this file MUST stay pure ASCII + LF line endings.
#        CRLF makes Linux bash fail with  "\r: command not found".
# ============================================================================

set -e

PORT="${1:-31118}"
SVC="daily-plan"
SVC_FILE="/etc/systemd/system/${SVC}.service"

if [ "$(id -u)" -ne 0 ]; then
  echo "[ERROR] Please run as root:   sudo bash deploy-cloud.sh ${PORT}"
  exit 1
fi

REAL_USER="${SUDO_USER:-}"
if [ -z "${REAL_USER}" ] || [ "${REAL_USER}" = "root" ]; then
  # When invoked as root directly (e.g. after "sudo -i"), pick a normal
  # user to run the service, so the web app never runs as root.
  REAL_USER=""
  for u in ubuntu debian admin centos ec2-user; do
    if id "${u}" >/dev/null 2>&1; then
      REAL_USER="${u}"
      break
    fi
  done
  [ -z "${REAL_USER}" ] && REAL_USER="root"
fi
REAL_HOME="$(getent passwd "${REAL_USER}" | cut -d: -f6)"
[ -z "${REAL_HOME}" ] && REAL_HOME="/root"

echo "      Service will run as user: ${REAL_USER}  (home: ${REAL_HOME})"

APP_DIR=""
for d in "/opt/daily-plan-web-jason" "${REAL_HOME}/daily-plan-web-jason" "/root/daily-plan-web-jason"; do
  if [ -f "${d}/server/app.py" ]; then
    APP_DIR="${d}"
    break
  fi
done

if [ -z "${APP_DIR}" ]; then
  echo "[ERROR] Cannot find server/app.py"
  echo "        Looked in:"
  echo "          /opt/daily-plan-web-jason"
  echo "          ${REAL_HOME}/daily-plan-web-jason"
  echo "          /root/daily-plan-web-jason"
  echo ""
  echo "        Extract the package first, for example:"
  echo "          sudo mkdir -p /opt/daily-plan-web-jason"
  echo "          sudo tar -xzf daily-plan-web-jason.tar.gz -C /opt/daily-plan-web-jason"
  exit 1
fi

echo "[1/6] Project dir : ${APP_DIR}"

PY="$(command -v python3 || true)"
if [ -z "${PY}" ]; then
  echo "[ERROR] python3 not found. Install it first:"
  echo "        sudo apt-get update && sudo apt-get install -y python3"
  exit 1
fi
echo "[2/6] Python      : ${PY}  ($(${PY} --version 2>&1))"

if command -v ss >/dev/null 2>&1; then
  if ss -lnt 2>/dev/null | grep -q ":${PORT} "; then
    echo "[ERROR] Port ${PORT} is already in use:"
    ss -lntp 2>/dev/null | grep ":${PORT} " || true
    echo "        Stop that process first, or pick another port."
    exit 1
  fi
  echo "[3/6] Port ${PORT} is free"
else
  echo "[3/6] ss not found, skipped port check"
fi

mkdir -p "${APP_DIR}/server"
chown -R "${REAL_USER}:${REAL_USER}" "${APP_DIR}" 2>/dev/null || true

echo "[4/6] Writing systemd unit ${SVC_FILE}"
cat > "${SVC_FILE}" <<UNIT
[Unit]
Description=Engineering Management System (daily-plan-web-jason)
After=network.target

[Service]
Type=simple
User=${REAL_USER}
WorkingDirectory=${APP_DIR}
ExecStart=${PY} ${APP_DIR}/server/app.py ${PORT}
Restart=always
RestartSec=5
StandardOutput=append:${APP_DIR}/server/service.log
StandardError=append:${APP_DIR}/server/service.log

[Install]
WantedBy=multi-user.target
UNIT

echo "[5/6] Starting service"
systemctl daemon-reload
systemctl enable "${SVC}" >/dev/null 2>&1 || true
systemctl restart "${SVC}"
sleep 2

if command -v ufw >/dev/null 2>&1; then
  if ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow "${PORT}/tcp" >/dev/null 2>&1 || true
    echo "      ufw is active -> allowed ${PORT}/tcp"
  else
    echo "      ufw is inactive -> nothing to open"
  fi
else
  echo "      ufw not installed -> nothing to open"
fi

echo "[6/6] Service status"
systemctl --no-pager --full status "${SVC}" 2>/dev/null | head -14 || true

PRIV_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
echo "======================================================================"
echo "  Deployed."
echo "  Local check : curl -I http://127.0.0.1:${PORT}/login.html"
echo "  Local URL   : http://127.0.0.1:${PORT}"
echo "  Private IP  : ${PRIV_IP}"
echo "  Public URL  : http://<YOUR-PUBLIC-IP>:${PORT}"
echo ""
echo "  !! REQUIRED !! open TCP ${PORT} in the cloud console security group,"
echo "                 otherwise the public URL will time out."
echo ""
echo "  Service commands:"
echo "    sudo systemctl status  ${SVC}"
echo "    sudo systemctl restart ${SVC}"
echo "    sudo systemctl stop    ${SVC}"
echo "    tail -f ${APP_DIR}/server/service.log"
echo "======================================================================"
