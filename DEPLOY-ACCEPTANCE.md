# 云服务器上线验收记录

部署时间：2026-09-13 15:40（CST）
服务器：腾讯云 CVM `VM-0-5-ubuntu` / 公网 `101.35.112.52` / 内网 `10.0.0.5`
系统：Ubuntu 22.04（Python 3.10.12）
访问地址：**http://101.35.112.52:31118**

---

## 一、部署结果

```
[1/6] Project dir : /opt/daily-plan-web-jason
[2/6] Python      : /usr/bin/python3  (Python 3.10.12)
[3/6] Port 31118 is free
[4/6] Writing systemd unit /etc/systemd/system/daily-plan.service
[5/6] Starting service
ufw is inactive -> nothing to open
[6/6] Service status  ->  Active: active (running)   Main PID: 1610012
```

服务以 `ubuntu` 身份运行（非 root），systemd 已 `enable`（开机自启）+ `Restart=always`（崩溃自动重启）。

| 项 | 值 |
|---|---|
| systemd 单元 | `/etc/systemd/system/daily-plan.service` |
| 项目目录 | `/opt/daily-plan-web-jason` |
| 日志 | `/opt/daily-plan-web-jason/server/service.log` |
| 端口 | 31118（公网已通） |

---

## 二、外网验收（从开发机实测，非服务器自测）

| 检查项 | 结果 |
|---|---|
| TCP 31118 从公网连通 | ✅ OPEN（腾讯云安全组已放行） |
| 全量资源爬取 | ✅ **55/55 全部 200**（23 个页面 + 32 个静态资源） |
| 公网登录 | ✅ `13800000000` / `000000` → 管理员 / admin |
| 成员数据 | ✅ 8 人：王利、熊德兵、范承江、李生元、管理员、肖登春、殷卫东、杨正荣 |
| 业务数据 | ✅ 项目 1 / 任务 4 / 周计划 2 / 申购 0 / 日计划 0（与本机库一致） |
| **数据库写入** | ✅ 登录日志成功落库、`last_login_at` 正常更新（**排除只读权限坑**） |
| 静态样式 | ✅ `/assets/styles.css` 正常加载 |

---

## 三、待办：安全加固（建议尽快）

> ⚠️ 现在是 **HTTP 明文** + **默认密码 `000000`** 直接暴露在公网。31118 非标端口只降低被扫描概率，不构成防护。

1. **改管理员密码（最高优先）**
   登录 → 个人中心 → 账号与安全 → 修改密码。
   其余 7 人初始密码为手机号后 6 位，也应尽快各自修改。

2. **配每日自动备份**
   服务器上执行 `crontab -e`（选 ubuntu 用户），加一行：
   ```
   30 2 * * * cp /opt/daily-plan-web-jason/server/data.db /opt/daily-plan-web-jason/server/data.db.bak-$(date +\%Y\%m\%d) && find /opt/daily-plan-web-jason/server -name 'data.db.bak-*' -mtime +30 -delete
   ```
   每天 02:30 备份，保留 30 天。

3. **HTTPS（需要域名）**
   31118 是明文 HTTP，登录密码与会话 Cookie 在传输中不加密。有域名后可套 Caddy 反向代理自动签发 Let's Encrypt 证书；无域名则暂缓。

4. **确认旧服务不抢端口**
   服务器 `/root` 下存在 `wechat_engineering_app-v5.05.zip`，若是同套系统旧版本，确认它没在监听端口：
   ```
   sudo ss -lntp | grep -E '31118|8080'
   ```

---

## 四、⚠️ 数据双份问题（重要）

本机 `J:\biancheng\daily-plan-web-jason\server\data.db` 与服务器 `server/data.db` 现在是**两份独立副本**：

- 服务器上的改动 **不会** 回流到本机
- 本机上的改动 **不会** 同步到服务器
- 本机 8080 服务仍在运行（同一份库）

**必须二选一，否则会出现"两边数据对不上"：**

- **方案 A（推荐）**：以服务器为准 → 停掉本机 8080 服务，所有人访问 `http://101.35.112.52:31118`
- **方案 B**：服务器做演示/外部访问，本机继续做内部生产 → 明确两组人各自用哪个，不要混用

**如需把本机最新数据覆盖到服务器**（服务器管理员密码仍为 `000000` 时可行）：
本机调 `/api/backup` 导出 → 直接 POST 到服务器 `/api/restore`，零文件传输。

---

## 五、运维速查

```bash
sudo systemctl status  daily-plan     # 查看状态
sudo systemctl restart daily-plan     # 重启（改代码后必须执行）
sudo systemctl stop    daily-plan     # 停止
tail -f /opt/daily-plan-web-jason/server/service.log   # 实时日志
curl -I http://127.0.0.1:31118/login.html              # 服务器本地自测
```

**代码更新流程（一行版）**——服务器上执行，仓库为公开库可直接拉：

```bash
cd /tmp && rm -rf dpwj && git clone --depth 1 https://github.com/tonjasmy-oss/daily-plan-web-jason.git dpwj && sudo cp -rf dpwj/assets/. /opt/daily-plan-web-jason/assets/ && sudo cp -f dpwj/*.html /opt/daily-plan-web-jason/ && sudo cp -f dpwj/server/app.py /opt/daily-plan-web-jason/server/app.py && sudo chown -R ubuntu:ubuntu /opt/daily-plan-web-jason && sudo systemctl restart daily-plan && echo "=== UPDATED ===" && curl -sI http://127.0.0.1:31118/login.html | head -1
```

看到 `=== UPDATED ===` 和 `HTTP/1.0 200 OK` 即成功。

> **国内机器拉 GitHub 卡住**时，把 `https://github.com/...` 换成
> `https://ghfast.top/https://github.com/...` 再跑一次。
> 服务器没装 git 时先执行 `sudo apt-get install -y git`。

> ⚠️ 该命令只覆盖 `assets/`、`*.html`、`server/app.py` 三类，
> **绝不触碰 `server/data.db`**（线上数据）。手动操作时务必注意。

**改动生效范围**：

| 类型 | 是否需重启 |
|---|---|
| 前端（`assets/*.js`、`*.html`） | 不需要，静态文件每次请求现读磁盘 |
| 后端（`server/app.py`） | **必须** `sudo systemctl restart daily-plan` |

**线上更新记录**：

| 日期 | 内容 | 对应提交 |
|---|---|---|
| 2026-09-13 | 首次部署（全量） | 包内为 `0f9f222` 版本 |
| 2026-09-13 | 审批管理接真实计划数据 + 报表浏览按审批状态收口（前端 5 个文件） | `dd3a5a1` |

---

## 六、常见排查

| 现象 | 原因 | 处理 |
|---|---|---|
| 外网打不开、服务器本地 `curl` 正常 | 腾讯云安全组未放行 | 控制台加 `TCP:31118` / `0.0.0.0/0` |
| `\r: command not found` | 脚本被转成 CRLF | 仓库已加 `.gitattributes` 锁 LF；重新拉取即可 |
| 后端（app.py）改动不生效 | 代码由进程加载，改动需重启 | `sudo systemctl restart daily-plan` |
| 前端改动不生效 | 浏览器缓存旧 JS | `Ctrl + F5` 强制刷新（静态文件本身每次请求现读磁盘，无需重启） |
| 服务起不来 | 端口被占 | `sudo ss -lntp \| grep 31118` 查占用进程 |
