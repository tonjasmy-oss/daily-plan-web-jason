#!/usr/bin/env bash
# 工程管理系统（数据库版）启动脚本 - Linux / macOS
cd "$(dirname "$0")"
PORT="${1:-8080}"
if command -v python3 >/dev/null 2>&1; then
  python3 server/app.py "$PORT"
elif command -v python >/dev/null 2>&1; then
  python server/app.py "$PORT"
else
  echo "[错误] 未找到 Python3，请先安装。"
  exit 1
fi
