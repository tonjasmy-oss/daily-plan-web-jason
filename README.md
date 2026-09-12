# 工程管理系统 - Web 数据库版

从原小程序模板 `daily-plan-app-template-v5-improved` 升级而来的**数据库驱动**工程管理系统。
覆盖 **项目 → 任务 → 人员 → 日报（v5 全功能）→ 日计划填报** 全流程，支持 PC + 移动端响应式。

## 与上一版（纯前端 localStorage）的区别

| | 旧版 v1 | 本版 v3（当前） |
|---|---|---|
| 数据存储 | 浏览器 localStorage | **服务器 SQLite 数据库**（`server/data.db`） |
| 多端同步 | ✗ 换浏览器丢数据 | ✓ **所有设备访问同一份数据** |
| 日报模块 | ✗ 无 | ✓ **完整移植 v5**（含审批流 + 手写签名 + 工作照片） |
| 日计划填报 | ✗ 无 | ✓ **审批流 + 角色权限 + Excel 导出** |
| 后端 | 无 | ✓ 纯 Python 标准库，**零第三方依赖** |
| **全模块数据库化** | ✗ 8 类仍在 localStorage | ✓ **v3 起全部 12 类走 SQLite** |

## 核心特性

- ✅ **全模块数据库管理**：SQLite 单文件数据库，**所有 12 类业务数据**走 SQLite（members / projects / tasks / reports / daily_plans / weekly_plans / weekly_reports / purchases / approvals / departments / roles / settings）
- ✅ **零依赖后端**：`server/app.py` 仅用 Python 标准库（http.server + sqlite3），无需 pip 安装任何东西
- ✅ **v5 日报全功能移植**：日期 / 标题分类（单选）/ 动态任务列表 / 备注 / 审批人 / 驳回原因 / Canvas 手写签名 / 草稿-提交-签名-驳回状态机 / **附件上传（处理前/中/后）** / 导出 Excel / 历史记录（分页 + 搜索 + 状态筛选）
- ✅ **日计划填报 v3**：填报日期 + 计划日期 + 标题 banner / 任务 4 字段（计划工作内容/计划实施人员/计划完成时间/工作要求）/ 人员安排（夜班/休息/调休，仅显示班长/工人）/ 备注 / 审批流（主管以上→ 班长/工人查看）/ 审批通过后导出 Excel
- ✅ **完整业务模块**：登录 / 仪表盘 / 项目管理 / 任务看板 / 任务详情 / 人员管理 / 部门管理 / 角色权限 / 系统参数 / 个人中心 / 周计划填报 / 计划周报 / 计划浏览 / 历史记录 / 审批管理
- ✅ **角色权限**：管理员 / 班长 / 工人 / 观察者（4 级）
- ✅ **任务状态机**：待办 → 进行中 → 待验收 → 已完成 / 阻塞，支持拖拽 + 快速下拉
- ✅ **数据可视化**：仪表盘环形图、柱状图、7 日趋势线、工作量条
- ✅ **响应式布局**：移动端单列 / ≤1024 hamburger + 侧栏抽屉 + 遮罩 / ≤768 任务行折行 / ≤480 三列压缩；签名板同时支持鼠标和触摸
- ✅ **数据导出/导入**：JSON 备份恢复（直连服务器数据库），Excel 导出（日报 + 日计划）

## 快速启动

### Windows
双击 `start.bat`（或命令行 `python server\app.py`）

### Linux / macOS
```bash
./start.sh            # 或 python3 server/app.py
```

### 指定端口
```bash
python server/app.py 9000
```

启动后：
- 本机访问：http://localhost:8080
- **手机访问**：手机与电脑连同一 WiFi，浏览器打开 `http://<电脑IP>:8080`（电脑 IP 用 `ipconfig` 查看）

> 无需再手动开 http.server——后端同时托管 API 和所有静态页面。

## 目录结构

```
daily-plan-web/
├── start.bat / start.sh   # 一键启动脚本
├── index.html             # 入口：查询 /api/me 会话后跳转
├── login.html             # 登录页（自适应 PC + 移动）
├── dashboard.html         # 仪表盘（KPI + 图表）
├── daily-plan.html        # ★ 日计划填报（v3 审批流 + Excel 导出）
├── weekly-plan.html       # 周计划填报
├── report.html            # ★ 日报填写/审批/签名/附件（v5）
├── reports.html           # ★ 日报历史记录
├── weekly-report.html     # 计划周报
├── plan-browse.html       # 计划浏览
├── approval.html          # 审批管理
├── projects.html          # 项目列表
├── project.html           # 项目详情
├── tasks.html             # 任务看板 + 列表视图
├── task.html              # 任务详情
├── purchase.html          # 物资申购
├── members.html           # 人员管理
├── departments.html       # 部门管理
├── roles.html             # 角色权限
├── settings.html          # 系统参数
├── about.html             # 关于我们
├── me.html                # 个人中心
├── server/
│   ├── app.py             # ★ 后端：REST API + 静态托管 + 建库/种子
│   └── data.db            # SQLite 数据库（运行时生成）
└── assets/
    ├── styles.css         # ★ 响应式样式（深色 Blurple 设计系统 + 附件槽位）
    ├── common.js          # API 数据层 + 常量 + 校验 + 多选弹窗
    ├── layout.js          # ★ 顶栏 + 侧栏 + 抽屉遮罩 + Esc 关闭
    ├── chart.js           # SVG 图表（环形/柱状/趋势线）
    ├── daily-plan.js      # ★ 日计划填报 v3
    ├── report.js          # ★ 日报填写 v6 + 附件上传
    ├── reports.js         # ★ 日报历史逻辑（分页/搜索/筛选）
    ├── signature-pad.js   # Canvas 签名板（鼠标 + 触摸）
    ├── export-excel.js    # ★ Excel 导出（日报 + 日计划）
    ├── xlsx.full.min.js   # SheetJS 库
    └── …（各页面 JS）
```

## 数据库模型（server/data.db）

| 表 | 内容 |
|---|---|
| `members` | 人员（角色/工种/电话/在职） |
| `projects` | 项目（成员/经理/进度/状态，进度随任务自动联动） |
| `tasks` | 任务（评论 JSON + 状态历史 JSON） |
| `reports` | ★ 日报（任务 JSON + 签名 base64 + **附件 base64** + 审批时间戳） |
| `daily_plans` | ★ 日计划（任务 JSON + 人员安排 night/rest/adjust + 审批流） |
| `weekly_plans` | 周计划（content + members + 审批） |
| `weekly_reports` | 计划周报（summary + items + 审批） |
| `purchases` | 物资申购 |
| `approvals` | 审批管理（type / ref_id / payload / 决策时间） |
| `departments` | 部门管理（parent_id 树形结构） |
| `roles` | 角色权限（permissions 数组） |
| `settings` | 系统参数（KV 表，key 主键） |
| `server/uploads/{date}/{task_idx}/` | ★ 附件图片文件存储（每日每任务独立目录，文件名含内容哈希） |

清空数据：系统设置 → 「危险操作」→「清空全部数据」(POST `/api/reset`，**注意：不删 uploads/ 目录里的图片**，需手动清理)。

## REST API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/bootstrap` | 全量数据 + 当前用户（首启自动建库/种子） |
| POST | `/api/login` `/api/logout` | 会话登录/登出（Cookie） |
| GET | `/api/me` | 当前会话用户 |
| POST/PUT/DELETE | `/api/members[/:id]` | 人员 CRUD（删除自动解除关联） |
| POST/PUT/DELETE | `/api/projects[/:id]` | 项目 CRUD（删除级联任务） |
| POST/PUT/DELETE | `/api/tasks[/:id]` | 任务 CRUD（状态变更自动记历史、项目进度联动） |
| GET | `/api/reports?page&status&q` | 日报列表：分页 + 状态筛选 + 关键词搜索 |
| POST | `/api/reports` | 日报新增/更新（tasks 含 attachments 附件 base64） |
| DELETE | `/api/reports/:id` | 删除日报 |
| GET/POST | `/api/daily-plans[/:id]` | 日计划列表/详情/创建/更新/删除（支持分页/状态筛选/搜索） |
| GET/POST | `/api/weekly-plans[/:id]` | 周计划 CRUD |
| GET/POST | `/api/weekly-reports[/:id]` | 计划周报 CRUD |
| GET/POST | `/api/purchases[/:id]` | 物资申购 CRUD |
| GET/POST | `/api/approvals[/:id]` | 审批管理 CRUD |
| GET/POST | `/api/departments[/:id]` | 部门 CRUD |
| GET/POST | `/api/roles[/:id]` | 角色 CRUD |
| GET/POST/DELETE | `/api/settings[/:key]` | 系统参数 KV |
| POST | `/api/migrate` | **从 localStorage 一键迁移到 SQLite**（首启自动触发） |
| POST | `/api/uploads` | **附件图片 multipart 上传**（保存到 `server/uploads/{date}/{task_idx}/`，数据库只存路径） |
| DELETE | `/api/uploads?path=` | 删除上传的图片文件 |
| GET/POST | `/api/backup` `/api/restore` `/api/reset` | 备份 / 恢复 / 清空（12 类全量） |

## 附件上传 (v3 重构)

- **不区分阶段**：每条任务的附件字段是数组 `attachments: [{filename, url, rel_path, size, uploaded_at}]`，**最多 6 张**
- **服务端落盘**：上传走 multipart/form-data → `/api/uploads` → 文件存到 `server/uploads/{date}/{task_idx}/{filename}.jpg`
- **文件命名**：`{YYYY-MM-DD}_{task_idx}_{hash(content)[:6]}_{HHMMSSmmm}.jpg`
  - 日期：所属日报填报日期
  - task_idx：所属任务在日报里的序号（0/1/2...）
  - 内容哈希：任务工作内容前 80 字符的 MD5 前 6 位（同一工作内容上多次传同名前缀，便于检索）
  - 时间戳：12 位（HHMMSSmmm），防重名覆盖
- **数据库只存路径**：不再 base64 内嵌，reports.tasks_json 体积大幅缩小
- **GET 静态**：浏览器访问 `/uploads/{date}/{task_idx}/{filename}` 直接返回图片
- **兼容旧数据**：从 localStorage 迁来的 `{before,during,after}` 自动转为数组 `[{filename:'legacy-xxx', url:'data:...'}]`，UI 仍可显示

## 响应式断点

| 断点 | 行为 |
|---|---|
| **1440px ↑** | project-grid 4 列 / member-list 3 列 / KPI 4 列 |
| **1024px ↓** | hamburger 显示 / sidebar 抽屉 + 遮罩 / 顶部搜索框隐藏 |
| **960px ↓** | 登录页 logo 64px / `.layout-2col` 单列 |
| **768px ↓** | topbar 收缩 / form-row 单列 / kanban 列 84vw / **task-row 5→4 列** |
| **480px ↓** | 权限方块 3→2 列 / **task-row 4→3 列** |

## 演示账号（首启自动注入）

| 角色 | 姓名 | 手机 | 工种 |
|---|---|---|---|
| 管理员 | 管理员 | 13800000000 | 工长 |
| 班长 | 张工 | 13811111111 | 工长 |
| 工人 | 李师傅 | 13822222222 | 木工 |
| 工人 | 王师傅 | 13833333333 | 电工 |

演示模式下密码任意填写。

## Git 仓库

```bash
# 首次推送（如已配置 SSH key）
git push -u origin main

# 日常
git add -A
git commit -m "feat: ..."
git push
```

远程：`git@github.com:arnoy/daily-plan-web.git`
