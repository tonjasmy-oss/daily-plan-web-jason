# 部署到云服务器（Ubuntu）

> 目标：把工程管理系统部署到 **101.35.112.52**，服务端口 **31118**。
> 全程 4 步，照抄命令即可。

---

## 第 0 步：拿到部署包

已生成在你的**桌面**：`daily-plan-web-jason.tar.gz`（674 KB，**已包含现有数据库** `data.db`，8 名成员和现有业务记录都在里面）。

包内已含一键部署脚本 `deploy-cloud.sh`，不需要额外准备。

---

## 第 1 步：上传到服务器

**部署包已包含全部内容**：代码 + 数据库 `server/data.db` + 一键部署脚本。
桌面上只有 `daily-plan-web-jason.tar.gz` 这一个文件就够了，**不需要再单独找 `data.db`**。

### 方式一：用 Xshell（推荐 Xshell 用户）

两种传法，任选：

**1a. Xftp 传输（不用在服务器上装任何东西）**

- Xshell 工具栏点 **Xftp** 图标，或菜单「工具 → Xftp」，或快捷键 `Ctrl+Alt+F`
- 左边切到本机**桌面**，右边切到服务器 **`/tmp`**
- 把 `daily-plan-web-jason.tar.gz` 拖到右边

**1b. ZMODEM 上传（`rz`）**

```bash
sudo apt update && sudo apt install -y lrzsz
```
```bash
cd /tmp && rz -be
```
执行 `rz -be` 后 **Xshell 会自动弹出文件选择框**，选中桌面的
`daily-plan-web-jason.tar.gz`，等进度跑完即可。

> 也可以直接把文件从桌面**拖进 Xshell 窗口**（Xshell 7 支持）。

### 方式二：用 PowerShell + scp

打开 **PowerShell**（开始菜单搜索 "PowerShell"），粘贴执行：

```powershell
cd $env:USERPROFILE\Desktop
scp daily-plan-web-jason.tar.gz ubuntu@101.35.112.52:/tmp/
```

会依次出现：

1. `Are you sure you want to continue connecting (yes/no)?` → 输 `yes` 回车
2. `ubuntu@101.35.112.52's password:` → 输服务器密码
   （**输入时屏幕不会有任何显示，连星号都没有，这是正常的**，盲打后直接回车）
3. 看到进度条跑到 `daily-plan-web-jason.tar.gz   100%` → 成功

> 如果登录用户名不是 `ubuntu`（比如是 `root`），把上面命令里的 `ubuntu` 替换掉。

---

## 第 2 步：登录服务器

- **Xshell 用户**：你已经登录了，**直接跳到第 3 步**
- **PowerShell / 终端用户**：

```bash
ssh ubuntu@101.35.112.52
```

也可以用腾讯云控制台自带的「登录」按钮开网页终端，效果一样。

---

## 第 3 步：解压 + 一键部署

连上服务器后，**逐条**粘贴执行（一条一条来，别整段粘）：

```bash
sudo mkdir -p /opt/daily-plan-web-jason
```
```bash
sudo tar -xzf /tmp/daily-plan-web-jason.tar.gz -C /opt/daily-plan-web-jason
```
```bash
ls /opt/daily-plan-web-jason
```
> 这条应看到 `assets`、`server`、`deploy-cloud.sh`、`login.html` 等。看不到就是解压有问题，先别继续。

```bash
sudo bash /opt/daily-plan-web-jason/deploy-cloud.sh 31118
```

脚本会自动完成：检查 Python → 检查端口 → 安装成系统服务（**开机自启 + 崩溃自动重启**）→ 放行 ufw 防火墙 → 启动服务 → 打印状态。

看到下面这些就算成功：

```
[6/6] Service status
   Active: active (running)
Deployed.
Local check : curl -I http://127.0.0.1:31118/login.html
```

---

## 第 4 步：放行云服务器端口（⚠️ 不做这步外网绝对打不开）

这是最常见的"部署成功了但访问不了"的原因 —— **腾讯云默认只放行 22/80/443**，31118 必须手动放行。

### 腾讯云轻量应用服务器
控制台 → 找到这台服务器 → **「防火墙」** → 添加规则：

| 配置项 | 填什么 |
|---|---|
| 应用类型 | 自定义 |
| 协议 | TCP |
| 端口 | `31118` |
| 来源 | `0.0.0.0/0` |
| 策略 | 允许 |

### 腾讯云 CVM（云服务器）
控制台 → 实例列表 → 这台机器 → **「安全组」** → 配置规则 → **入站规则** → 添加：

| 配置项 | 填什么 |
|---|---|
| 类型 | 自定义 |
| 来源 | `0.0.0.0/0` |
| 协议端口 | `TCP:31118` |
| 策略 | 允许 |

---

## 验证

浏览器打开：

### 🔗 http://101.35.112.52:31118

登录页：http://101.35.112.52:31118/login.html

**默认管理员账号：**

| 账号（手机号） | 密码 |
|---|---|
| 13800000000 | 000000 |

> 登录后请立刻去「个人中心 → 账号与安全」把密码改掉，`000000` 太弱。

想在服务器上先自测（不依赖安全组，能排除"是服务问题还是网络问题"）：

```bash
curl -I http://127.0.0.1:31118/login.html
```
返回 `HTTP/1.0 200 OK` → 服务本身正常，问题一定在安全组。

---

## 日常运维命令

```bash
sudo systemctl status  daily-plan     # 看运行状态
sudo systemctl restart daily-plan     # 重启
sudo systemctl stop    daily-plan     # 停止
sudo systemctl start   daily-plan     # 启动
sudo systemctl disable daily-plan     # 取消开机自启

tail -f /opt/daily-plan-web-jason/server/service.log   # 实时看日志（Ctrl+C 退出）
```

---

## 以后改了代码怎么更新

```powershell
# 1) 本机 PowerShell 重新上传（覆盖）
cd $env:USERPROFILE\Desktop
scp daily-plan-web-jason.tar.gz ubuntu@101.35.112.52:/tmp/
```
```bash
# 2) 服务器上：停服务 → 备份数据库 → 覆盖 → 起服务
sudo systemctl stop daily-plan
sudo cp /opt/daily-plan-web-jason/server/data.db ~/data-backup-$(date +%F-%H%M).db
sudo tar -xzf /tmp/daily-plan-web-jason.tar.gz -C /opt/daily-plan-web-jason
sudo systemctl start daily-plan
```

> ⚠️ `tar -xzf` 会覆盖同名文件。**务必先备份 `data.db`**，它装着全部业务数据。

---

## 数据备份（建议马上配上）

数据库就一个文件：`/opt/daily-plan-web-jason/server/data.db`

```bash
# 手动备份
sudo cp /opt/daily-plan-web-jason/server/data.db ~/data-$(date +%F).db
```

配每天自动备份：

```bash
sudo mkdir -p /opt/backup
sudo crontab -e
```
在打开的文件末尾加一行（选 nano 编辑器的话 `Ctrl+O` 保存、`Ctrl+X` 退出）：
```
0 3 * * * cp /opt/daily-plan-web-jason/server/data.db /opt/backup/data-$(date +\%F).db
```
以后每天凌晨 3 点自动存一份到 `/opt/backup/`。

---

## 常见问题排查

| 现象 | 原因 / 处理 |
|---|---|
| 浏览器一直转圈、超时 | ① 安全组没放行 31118（第 4 步）② 服务没起来，跑 `sudo systemctl status daily-plan` 看 |
| `Permission denied (publickey,password)` | 用户名或密码不对。腾讯云若在控制台点过「重置密码」，**必须重启实例**新密码才生效 |
| 脚本报 `\r: command not found` | 脚本被 Windows 编辑器改过换行符。服务器上执行 `sed -i 's/\r$//' /opt/daily-plan-web-jason/deploy-cloud.sh` 再重跑 |
| `python3: command not found` | `sudo apt-get update && sudo apt-get install -y python3` |
| 端口被占用 | `sudo ss -lntp \| grep 31118` 看是谁占的，或换端口：`sudo bash deploy-cloud.sh 31200` |
| 能访问但页面样式错乱 | 静态文件没解压全，检查 `/opt/daily-plan-web-jason/assets/` 是否有 32 个文件 |
| 服务器重启后打不开 | 正常不会——脚本已设开机自启。查 `systemctl is-enabled daily-plan` 应返回 `enabled` |

---

## ⚠️ 安全提醒（务必看一眼）

1. **现在是 HTTP 明文** —— 登录密码在网络上不加密传输。31118 不是常用端口，被扫描到的概率低，但**不等于安全**。
   → 如果你有域名，我可以帮你配 Caddy 反向代理 + 免费 HTTPS 证书，变成 `https://你的域名`
2. **默认管理员密码 `000000` 必须改** —— 部署到公网后这是最大的风险点
3. **数据库在公网机器上** —— 按上面配好每日自动备份
4. **本机 8080 那套还要不要留** —— 建议留作测试环境，但要注意两边数据库会各自独立变化，不会自动同步
