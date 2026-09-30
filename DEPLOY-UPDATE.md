# 工程管理系统 · 部署与更新指南（可分享）

> 适用范围：把 `daily-plan-web-jason` 的代码同步到 **GitHub** 与 **云服务器（101.35.112.52）**，并可选配 **Caddy 反向代理 + 免费 HTTPS**。
> 首次部署请看 `DEPLOY-CLOUD.md`；本文聚焦"日常更新"和"域名 HTTPS"。
>
> 当前线上版本：`ead2365`（移动端响应式修复：详情/审批/采购/分析表格横向滚动、状态栏与任务行手机适配；P2 表格裁剪问题）。

---

## 0. 架构速览

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | 原生 JS（无打包构建） | `assets/*.js` 按序 `<script>` 引入 |
| 后端 | Python 标准库 `http.server` | **无需 Flask / 无依赖安装** |
| 本地 | `python server/app.py 8080` | `http://localhost:8080` |
| 云服务器 | systemd 服务 `daily-plan` | 端口 `31118`，`0.0.0.0` 监听 |
| HTTPS（可选） | Caddy 反代 `localhost:31118` | 自动申请/续期 Let's Encrypt 证书 |

> `.gitignore` 已排除 `*.db`、`.workbuddy/`、`*.log`、临时测试脚本——**代码仓库不含数据库与任何密钥**。

---

## 1. 本地运行（零依赖）

```bash
cd 项目根目录
python server/app.py 8080
```

浏览器打开 `http://localhost:8080/`（必须走 http，不能双击 HTML——`common.js` 会拦截 `file://`）。

---

## 2. 同步到 GitHub

```bash
git add -A
git commit -m "feat: 本次改动说明"
git push origin main
```

> 提交前确认工作区只有预期改动：`git status -s`。数据库/密钥已被 `.gitignore` 挡住，不会进仓库。

---

## 3. 同步到云服务器（标准 SOP）

### 3.1 前置条件（已配置好）

- 本机公钥已加入服务器 `~/.ssh/authorized_keys`（`ubuntu` 用户，**sudo 免密**）。
- 应用目录：`/opt/daily-plan-web-jason`；服务名：`daily-plan`。
- 数据文件：`/opt/daily-plan-web-jason/server/data.db`（**唯一业务数据库，更新时绝不覆盖**）。

### 3.2 一键更新步骤

```bash
# 1) 先把代码推到 GitHub（留痕 + 备份）
git push origin main

# 2) 备份服务器数据库（关键，防覆盖丢失）
ssh ubuntu@101.35.112.52 'sudo cp /opt/daily-plan-web-jason/server/data.db ~/data-backup-$(date +%F-%H%M).db'

# 3) 只同步代码，排除数据/日志/临时/文档
cd 项目根目录
tar czf - \
  --exclude='.git' --exclude='.workbuddy' --exclude='*.db' --exclude='*.log' \
  --exclude='*/uploads' --exclude='*/sessions.json*' --exclude='_*.js' --exclude='docs' \
  . | ssh ubuntu@101.35.112.52 'sudo tar xzf - -C /opt/daily-plan-web-jason --no-same-owner'

# 4) 修正属主（tar 用 --no-same-owner，需统一回 ubuntu）
ssh ubuntu@101.35.112.52 'sudo chown -R ubuntu:ubuntu /opt/daily-plan-web-jason'

# 5) 重启服务并自检
ssh ubuntu@101.35.112.52 'sudo systemctl restart daily-plan; sleep 2; curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:31118/login.html'
```

返回 `200` 即更新成功。外网访问 `http://101.35.112.52:31118/login.html`（需腾讯云防火墙放行 31118）。

### 3.3 回滚

```bash
# 用备份恢复数据 + 重启（代码回滚则用 git revert 后重跑 3.2）
ssh ubuntu@101.35.112.52 'sudo cp ~/data-backup-<时间戳>.db /opt/daily-plan-web-jason/server/data.db; sudo systemctl restart daily-plan'
```

---

## 4. 域名 + 免费 HTTPS（Caddy 反向代理）

### 4.1 前提

1. 一个**已把 A 记录解析到 `101.35.112.52`** 的域名（例如 `plan.example.com`）。
2. 腾讯云控制台**安全组放行 TCP 80 与 443**（Caddy 申请证书和对外访问都走这两个端口）。

> 没有域名则无法申请免费证书（Let's Encrypt 基于域名，不支持纯 IP）。

### 4.2 在服务器安装 Caddy

```bash
sudo apt-get update
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy
```

### 4.3 写 Caddyfile

把下面文件写入 `/etc/caddy/Caddyfile`（**把 `your.domain.example` 换成你的真实域名**）：

```caddy
your.domain.example {
    reverse_proxy localhost:31118
}
```

Caddy 会自动为该域名申请 Let's Encrypt 证书，并**每 90 天自动续期**，无需手动干预。

### 4.4 生效并验证

```bash
sudo systemctl enable --now caddy
sudo systemctl reload caddy
curl -I https://your.domain.example/login.html
```

> ✅ **当前进度（2026-09-28）**：Caddy v2.11.4 已在服务器安装完成，`/etc/caddy/Caddyfile` 已写好（占位域名 `your.domain.example` → `reverse_proxy localhost:31118`），服务暂设为 `disabled`。
> **你只需做两件事即可启用 HTTPS**：
> 1. 把域名 A 记录解析到 `101.35.112.52`；
> 2. 执行（把域名换掉）：
>    ```bash
>    sudo sed -i 's/your.domain.example/你的真实域名/' /etc/caddy/Caddyfile
>    sudo systemctl enable --now caddy && sudo systemctl reload caddy
>    ```
> 腾讯云安全组放行 80/443 后访问 `https://你的域名/login.html` 即可看到🔒。

返回 `HTTP/2 200` 且浏览器地址栏出现🔒即成功。此时业务仍由 `daily-plan` 服务在 31118 提供，Caddy 只做 443→31118 的加密转发；31118 端口可继续保留（或在安全组只放行 443 更稳妥）。

### 4.5 HTTPS 运维

| 操作 | 命令 |
|---|---|
| 看 Caddy 状态 | `sudo systemctl status caddy` |
| 看访问/错误日志 | `journalctl -u caddy -f` |
| 证书存放位置 | `/var/lib/caddy/` |
| 改域名后 | 改 Caddyfile → `sudo systemctl reload caddy` |
| 证书申请失败排查 | 多半是域名没解析到本机 / 80 端口被安全组挡住 |

---

## 5. 默认账号与安全

| 账号（手机号） | 密码 | 建议 |
|---|---|---|
| 13800000000 | 000000 | 登录后到「个人中心 → 账号与安全」**立即改密** |

- **上线 HTTPS 前，密码是明文 HTTP 传输**；配好 Caddy HTTPS 后才加密。
- 数据库在公网机器上，按 `DEPLOY-CLOUD.md` 配好每日自动备份。

---

## 6. 故障排查

| 现象 | 原因 / 处理 |
|---|---|
| 更新后页面还是旧的 | 没重启 / Caddy 缓存；`sudo systemctl restart daily-plan`，Caddy 侧 `reload` |
| HTTPS 打不开，提示证书无效 | 域名未解析到 101.35.112.52，或 80 端口被安全组拦截（ACME 校验失败） |
| Caddy 启动失败 | `journalctl -u caddy` 看日志；最常见是 Caddyfile 域名写成占位符没替换 |
| 外网 `31118` 连不上 | 腾讯云防火墙没放行 31118（第 3 步自检 `127.0.0.1` 能通说明服务本身正常） |
| 数据库被覆盖、数据丢失 | 严格按 3.2 第 2 步先备份；用 3.3 回滚 |

---

## 7. 完整更新清单（照抄）

```
☐ 本地改完代码，自测通过
☐ git add / commit / push origin main
☐ ssh 备份服务器 data.db
☐ tar | ssh 同步代码（排除数据）
☐ chown -R ubuntu:ubuntu
☐ systemctl restart daily-plan；自检 200
☐ （若有域名）Caddyfile 域名就位 → enable --now caddy → reload → 验 HTTPS
☐ 改默认管理员密码
```
