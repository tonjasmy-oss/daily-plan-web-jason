# 工程管理系统 (daily-plan-web) — 项目详细介绍

> 适用对象: 项目所有者 / 新加入的工程师 / 业务方
> 适用版本: 当前 `main` 分支（2026-09-13）
> 代码仓库: `F:\work\daily-plan-web`（本地）→ `git@github.com:tonjasmy-oss/daily-plan-web-jason.git`（远端）
> 上一版: `F:\work\daily-plan-app-template-v5-improved`（微信小程序模板，已停止迭代）

---

## 1. 这是什么

**工程管理系统 Web 数据库版** 是一套面向物业工程管理/秩序部门日常工作的内部 Web 应用。
后端走 **Python 标准库 + SQLite**（零第三方依赖，单文件数据库），
前端是 **原生 JS（无框架）+ 全局函数 + 深色 Blurple 主题**，
支持 PC + 移动端响应式，**单机局域网部署即可全员使用**。

它把项目、人员、任务、日计划/周计划/日报/周报、物资申购、审批这条**全工作流**搬上了 Web，
并提供仪表盘、报表浏览、附件管理、分析空间等模块，**支撑秩序部日常填报、审批、复盘、归档**。

不是给业主用的 C 端产品，是给内部工程团队、主管、秩序部、安保员用的协同工具。

---

## 2. 它能做什么

### 2.1 一句话价值
> 让人在手机/Pad 上**快速填一份表**（日计划/日报/申购/隐患），主管**在线审批**，
> 管理员**看全貌、做导出、归档附件**——所有数据一份不丢。

### 2.2 主要场景

| 角色 | 典型一天 |
|---|---|
| **工长** | 早上手机登入→填日计划(任务+人员安排)→提交→收主管反馈→改→重提 |
| **工人** | 当天完工后填日报(任务+照片)→签字提交→看主管的签字反馈 |
| **主管** | PC 端看审批管理→通过/驳回(可追加工单)→看仪表盘看团队产能 |
| **管理员** | 项目/人员/部门/角色设置→物资采购审核合并→附件管理→备份恢复 |
| **秩序部** | 消防演练→日报留痕→附件存档→周报复盘→分析空间看趋势 |

### 2.3 功能矩阵

| 模块 | 端 | 谁用 | 主要产出 |
|---|---|---|---|
| 登录 | 全端 | 所有人 | 会话 |
| 仪表盘 | 全端 | 所有人 | KPI / 图表 / 工作量 / 逾期 |
| 日计划填报 | 全端 | 工长+主管+管理员 | 计划日任务安排(任务/人员/时间)→审批流 |
| 周计划填报 | 全端 | 工长+主管+管理员 | 一周任务安排(项目+7天任务)→审批流 |
| 日报表填报 | 全端 | 工人+工长 | 完成情况汇报+照片附件+签字 |
| 计划周报 | 全端 | 工长+主管+管理员 | 周度总结+下期计划 |
| 报表浏览 | 全端 | 主管+管理员 | 日/周/月报统一查看+三格式导出(xlsx/png/pdf) |
| 物资申购 | 全端 | 工长+主管+管理员 | 申购单→提交→待批→通过 |
| 历史记录 | 全端 | 所有人 | 日报分页/搜索/状态筛选 |
| 审批管理 | PC | 主管+管理员 | 待审队列→通过/驳回(可追加工作内容) |
| 物资管理 | PC | 主管+管理员 | 申购独立审批+合并批次+导出标准申购单 |
| **分析空间** | PC | 主管+管理员 | 跨表只读分析(本轮新增) |
| 任务看板 | PC | 工长+主管 | 拖拽改状态/下拉改负责人/项目进度联动 |
| 项目管理 | PC | 工长+主管+管理员 | 项目CRUD+成员+经理+进度 |
| 人员管理 | PC | 主管+管理员 | 人员CRUD+角色+工种+在职 |
| 部门管理 | PC | 管理员 | 部门树形(父子) |
| 用户角色 | PC | 管理员 | 角色+权限点 |
| 系统参数 | PC | 管理员 | 站点设置+附件路径+危险操作 |
| 附件管理 | PC | 管理员 | 目录树+缩略图+预览灯箱+打包下载 |
| 关于我们 | 全端 | 所有人 | 静态信息 |
| 个人中心 | 全端 | 所有人 | 我的资料+我的提交 |

---

## 3. 技术架构

### 3.1 总体

```
浏览器 (PC/移动)
   │  HTTP/1.1
   ▼
server/app.py
  - http.server.ThreadingHTTPServer
  - sqlite3
  - 内置静态托管
   │
   ▼
server/data.db    (SQLite 单文件)
server/uploads/   (附件图片目录, 可配)
```

**完全没有 Web 框架、没有 ORM、没有前端框架、没有 npm 依赖**。
前端 JS 全部写在 `<script>` 标签里，全局函数式风格（一个 `common.js` 暴露 `DB` 缓存 + CRUD 工具 + `renderPage` + 弹窗/Toast 等）。

### 3.2 后端 (`server/app.py`)

- **单文件** `app.py`（约 2,800+ 行），**只用 `http.server` + `sqlite3` + `json` + `urllib`**
- 路由表 `REST_RULES` 集中管理；统一 JSON 响应；统一异常转 4xx/5xx
- 启动时自动 `migrate_db()` 幂等补列，老库平滑升级
- 自动 `seed_if_empty()` 注入演示账号 + 演示项目
- 附件落盘走 `server/uploads/{date}/{task_idx}/{filename}` 规则，DB 只存路径
- 路径越权校验：`p == base or p.startswith(base + os.sep)`，**避免 `startswith(base)` 兄弟目录绕过**

### 3.3 前端

| 文件 | 作用 |
|---|---|
| `assets/common.js` | **核心**：`DB` 内存缓存、`bootstrapDB` 全量拉取、所有 CRUD 包装、`renderPage` 页面外壳、`esc` XSS 转义、通用弹窗/Toast、多选弹窗 |
| `assets/layout.js` | 顶栏 + 侧栏 + 抽屉遮罩 + 用户菜单；`NAV_ITEMS` 是导航的单一来源 |
| `assets/styles.css` | **深色 Blurple 设计系统**：设计 token 在 `:root`，含响应式断点（1440/1024/768/480） |
| `assets/chart.js` | 纯 SVG 图表：柱/环/线，无依赖 |
| `assets/signature-pad.js` | Canvas 手写签名（鼠标+触摸） |
| `assets/export-excel.js` | SheetJS 封装：日报/日计划/周计划 xlsx 导出 |
| `assets/export-media.js` | html2canvas + jsPDF：浅色 A4 文档导出 PNG/PDF（与深色主题解耦） |
| `assets/{page}.js` | 每个页面的逻辑（init + 渲染 + 事件） |

### 3.4 数据库 (`server/data.db`)

13 张表，全走 SQLite（`TEXT` 存 JSON 序列化字段）：

| 表 | 内容 |
|---|---|
| `members` | 人员(角色/工种/电话/在职) |
| `projects` | 项目(成员/经理/进度/状态) |
| `tasks` | 任务(评论 JSON + 状态历史 JSON) |
| `reports` | ★ 日报(任务 JSON + 计划工作日期 plan_date + 标题分类 + 签名 base64 + 附件路径) |
| `daily_plans` | ★ 日计划(任务 JSON + 人员安排 night/rest/adjust + 审批流) |
| `weekly_plans` | 周计划(start_date/end_date/project_id/tasks_json/created_by) |
| `weekly_reports` | 计划周报(summary+items+审批) |
| `purchases` | 物资申购(支持合并批次 merge_id) |
| `purchase_groups` | 物资合并批次 |
| `approvals` | 审批(type/ref_id/payload/决策时间) |
| `departments` | 部门管理(parent_id 树形) |
| `roles` | 角色权限(permissions 数组) |
| `settings` | 系统参数(KV) |

附件**不入库**，文件落 `server/uploads/{date}/{task_idx}/`，DB 只存路径。

### 3.5 设计系统

- **深色 Blurple** 主色 `#5865F2`，品红强调 `#EC48BD`，语义色 绿/蓝/黄/红
- 圆角 12/14/16/18/28，间距 4/8/12/16/20/24/32
- 字体 Noto Sans SC（中文）+ Hanken Grotesk（数字）+ Inter（西文）
- 响应式 4 个断点：1440/1024/960/768/480
- 导出层**刻意走浅色 A4 文档**（`.pbx-doc`），不复用深色主题

---

## 4. 业务约定（铁律，改这些页面时必须守住）

> 这部分是从 7~8 轮迭代里踩坑总结出来的"用户已经确认过"的业务行为。
> 改任一相关模块前先看这里。

### 4.1 四个填报页统一「提交即翻页」
日计划填报 / 周计划填报 / 日报表填报 / 计划周报 提交成功后**立即清空表单 + 顺延到下一期**，
地址栏去掉 `?id=` / `?date=`，刷新也只会看到空白。**草稿与已驳回记录仍停在原日期**。

### 4.2 「计划日期」是导出与标题的唯一依据
不是填报日期：
- 日计划取 `plan_date`，周计划取 `startDate`，日报表取 `plan_date`（老记录回落 `date`）
- 文件名：`日计划工作安排_{计划日期}.xlsx` / `周计划工作安排_{周期起始日}.xlsx` / `日报表_{计划工作日期}.xlsx`
- 日报表审批通过后标题 = `cnDateText(plan_date) + (计划工作|日常维修) + 完成情况`

### 4.3 计划审批流（v8）
```
填报提交 → pending(待审批) → approved(通过, 记录锁定只读) / rejected(驳回, 填报人改后重提)
```
- 审批人 = `admin` / `manager`，规则集中在 `common.js` 的 `PLAN_APPROVE_ROLES` / `canApprovePlan()` / `planAppendable()`
- **周计划提交也进入 pending**（老版本是 draft）
- 审批人可在通过前「追加工作内容」，入口：日计划填报页(任务区标题旁+底部) + 报表浏览详情
- 追加条目 `{appended:true, appended_by, appended_at, content, title}` —— **content 与 title 必须同时写**（日计划字段是 content、周计划是 title）

### 4.4 物资申购（v8.x）
- 关联项目默认：系统内**单项目自动默认并提示**，2+ 项目才需手动选
- 单位：`input + datalist`，可选可手输
- 草稿箱：「我的申购」按 `applicant` 筛选，状态排序 (draft 0 → submitted 1 → rejected 2 → approved 3)
- 驳回可重提：banner 提示「修改后可重新提交」
- **审批流转目前是独立的**（物资管理模块，详情见 §5.5）

### 4.5 弹层内不开通用弹窗
`common.js` 的 `confirmDialog` / `confirmDialogEx` / `promptDialog` / `multiSelectDialog`
第一行都是 `document.querySelectorAll('.modal-overlay').forEach(el => el.remove())`，
在报表浏览详情弹层之上再开会把详情一起销毁。需要二次交互时**内联渲染**。

### 4.6 路径越权校验
任何附件/文件操作必须 `p == base or p.startswith(base + os.sep)`，**不能用 `startswith(base)`**（兄弟目录绕过）。

---

## 5. 主要模块详解

### 5.1 仪表盘 (`dashboard.html`)
- 顶部 KPI：项目数、任务数、已完成、逾期、我的待办
- 任务状态分布(环形) / 项目状态分布(柱) / 7 天完成趋势(线) / 工作量 Top 5
- 全部用 `assets/chart.js` 自绘 SVG

### 5.2 报表填报（v5 全功能）
- **日计划填报** `daily-plan.html`：填报日期 + 计划日期 + 标题 banner / 任务 4 字段 / 人员安排(夜班/休息/调休) / 备注 / 审批流
- **日报表填报** `report.html`：标题分类(单选, 计划工作/日常维修) + 任务列表 + 备注 + 审批人 + 驳回原因 + Canvas 签名 + 附件(每任务最多 6 张) + Excel 导出
- 提交即翻页（§4.1）

### 5.3 报表浏览 (`plan-browse.html`)
- 跨日/周/月报的统一列表
- 行内「查看」开页内详情弹层（不跳转），支持 `?tab=x&id=y` 分享
- 底部三导出**并列可选**：Excel / PNG / PDF
- 文件名一律用「计划日期」

### 5.4 审批管理 (`approval.html`)
- 表单审批 tab 含日计划/周计划/周报/物资申购等所有 type
- 通过/驳回内联按钮，驳回原因必填
- 报表浏览详情里的审批区**内联**在弹层内（避免弹层内开弹层）
- 仅 admin/manager 可见入口

### 5.5 物资管理 (`purchase-mgmt.html`)
- 独立模块（不与其他审批混），仅 admin/manager
- KPI：待审批/已通过/已驳回/申购总金额
- 状态/项目/关键字筛选，URL 同步
- 勾选≥2条合并批次 → 重命名 → 导出标准申购单
- 已合并行紫色徽章「已合并 · 组名」+ 左紫条

### 5.6 附件管理 (`settings-files.html`)
- 仅管理员
- 目录面包屑 + 图片缩略图网格 + 灯箱预览
- 单张下载 / 勾选多张打包 ZIP（保留 `{date}/{task_idx}/` 原层级）
- 存储路径可配（`settings.system.upload_path`），支持绝对路径

### 5.7 分析空间 (`analysis.html`) — **本轮新增**
- 跨表只读分析，仅 admin/manager
- **不新增数据表、不改 server/app.py**
- 12 个分析维度：

  | # | 区块 | 类型 | 数据 |
  |---|---|---|---|
  | 1 | 本月日报提交 | KPI | `reports.plan_date ∈ 本月` |
  | 2 | 本月审批通过率 | KPI | `approvals.status` 本月分布 |
  | 3 | 本月采购金额 | KPI | `purchases.items[].qty*price` 本月累计 |
  | 4 | 在岗人员 | KPI | `members.active !== false` |
  | 5 | 近 30 天日报提交量 | 折线 | 按 `plan_date` 聚合 |
  | 6 | 近 30 天日计划提交量 | 折线 | 按 `plan_date` 聚合 |
  | 7 | 审批状态分布 | 环形 | 全量 `approvals` 状态 |
  | 8 | 近 6 个月采购金额 | 柱 | 按 `date.slice(0,7)` 聚合 |
  | 9 | 人员工作量 Top 8 | 表格 | 本月 `created_by` 计数 |
  | 10 | 驳回原因 Top 5 | 柱 | `rejected_reason` 首行前 12 字 |
  | 11 | 项目维度对比 | 柱 | 各项目日报+计划累计 |
  | 12 | 消防/安全关键词命中 | chip | 全文扫描：消防/灭火器/应急/隐患/整改/演练/检查/烟感/喷淋/疏散/防火/安全 |

- 关键文件：
  - `analysis.html`（17 行壳，引入 common/layout/chart/analysis）
  - `assets/analysis.js`（约 380 行，跨表聚合 + SVG 渲染）
  - `assets/styles.css` 末尾新增 21 节（`analysis-grid-2/3` / `kw-chip` / `data-table`）
  - `assets/layout.js` `NAV_ITEMS` 注册 `'analysis'`，`ICONS` 加 `analytics` 备选

---

## 6. 演示账号（首启自动注入）

| 角色 | 姓名 | 手机 | 工种 | ID |
|---|---|---|---|---|
| 管理员 | 管理员 | 13800000000 | 工长 | `m_a1f3e9398f2c4ad3` |
| 班长 | 张工 | 13811111111 | 工长 | `m_48fb36bf9d0143f5` |
| 工人 | 李师傅 | 13822222222 | 木工 | `m_e478881538d34415` |
| 工人 | 王师傅 | 13833333333 | 电工 | — |

演示模式下密码任意填写。

---

## 7. 启动与部署

### 7.1 本机开发（Windows）
```bash
# 用项目自带的 managed Python
C:\Users\arnoy\.workbuddy\binaries\python\versions\3.13.12\python.exe server/app.py 8080
# 或直接双击 start.bat
```
- 启动后：http://localhost:8080
- 手机访问：电脑 IP + 同一 WiFi → `http://<电脑IP>:8080`

### 7.2 文件托管与后端
- `server/app.py` 同时托管 API（`/api/*`）和所有静态页面（`/*.html`、`/assets/*`）
- 不需要单独 `python -m http.server`
- 数据库首次启动自动建库 + 注入种子数据

### 7.3 数据备份/恢复
- 系统设置 → 「危险操作」→「清空全部数据」(POST `/api/reset`，**注意：不删 uploads/** 目录里的图片)
- `/api/backup` / `/api/restore` JSON 全量备份恢复

### 7.4 Git
- 远程：`git@github.com:tonjasmy-oss/daily-plan-web-jason.git`（分支 `main`）
- 推送 GitHub 必须 `dangerouslyDisableSandbox: true`（沙箱拦截 SSH）

---

## 8. 验证与质量

| 层级 | 工具 | 范围 |
|---|---|---|
| 前端逻辑 | Node + DOM 桩 + `vm.runInContext` | 真实页面 JS + 真实 `/api/bootstrap` 数据 |
| 真实浏览器 | `playwright-core` + 本机 Edge | 排版/视觉/点击/端到端 |
| 真实产物 | SheetJS 写盘 + `zipfile` 解包 | 导出文件落盘断言 |
| 后端 | `engms_api_test.py` | REST 落库字段 |

**坑记录（重要）**：
- DOM 桩必须做到：`querySelectorAll` **按选择器多槽缓存**、`getElementById` 按 id 复用同一对象、兼容 `el.onchange/onclick` 属性赋值、canvas 有 `toBlob`、元素有 `click()`。漏任一条都会让"输入/提交/导出"类断言假失败
- 同一文件并行多个 Edit 会**静默丢失部分编辑**——必须串行
- 含中文/反引号的脚本必须**写成 `.py`/`.js` 文件再执行**，不能 `python -c "..."`
- **Playwright headless + Edge 下 `page.click(selector)` 偶尔不触发 click 事件** —— 用 `page.$eval(sel, el => el.click())` 或 `page.mouse.click(x, y)` 兜底
- Bootstrap 主键是 `_id` 不是 `id`
- Cookie 名是 `engms_session`，localStorage 键是 `eng_ms_current_user_v1`（两步缺一不可）

---

## 9. 当前在做的事 / 下一阶段

| 优先级 | 项 | 备注 |
|---|---|---|
| 高 | 物资申购审批并入 `approval.js` 的 `type='purchase'` 通判 | 已经在 `purchase-mgmt` 走独立流 |
| 中 | 分析空间增加筛选维度（按项目/按人员/按时间段） | 当前是单页面只读分析 |
| 中 | 日报导出 PDF 在 60 页以上的稳定性 | jsPDF 切片逻辑需压测 |
| 低 | 推送自动化（解决 SSH 沙箱问题） | 当前每次都要用户授权 |
| 低 | 把 localStorage 里的旧数据一键迁移 | 已有 `/api/migrate` |

---

## 10. 改代码前的清单

- [ ] 业务约定 §4 是不是仍然成立？（特别是审批流 / 翻页 / 计划日期）
- [ ] 我加的字段是不是在 5 处同步了？（CREATE / migrate / row_to / upsert / 前端 DB）
- [ ] 我删的变量是不是在引用点也删了？（`approval.js` Phase 38 删 purchase 分支时漏过引用导致 `typeTag`/`detailBtn` ReferenceError）
- [ ] 我加的弹窗是不是在父弹层里？（用内联，不用通用 confirm）
- [ ] 我改的导出函数是不是用了「计划日期」而不是填报日期？
- [ ] 我提交的 Edit 是不是同一文件串行而不是并行？
- [ ] 我写的中文是不是放在 `.py`/`.js` 文件里而不是 `python -c "..."`？
- [ ] 推送是不是带了 `dangerouslyDisableSandbox: true`？

---

_维护者：荣总（秩序部负责人） · 助手：WorkBuddy_
_最近更新：2026-09-13 — 新增「分析空间」模块_
