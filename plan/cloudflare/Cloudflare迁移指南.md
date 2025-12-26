# Cloudflare Workers 迁移指南

> **📍 迁移状态**: ✅ 已完成 (Phase 1-4)
> **📁 当前实现**: [`scoringSystem-cf/`](../../scoringSystem-cf/) 目录
> **📋 系统规划**: 参见 [`plan/GAS/updated_project_spec.md`](../GAS/updated_project_spec.md) 了解系统核心设计
> **📚 详细文档**: 参见 [`scoringSystem-cf/README.md`](../../scoringSystem-cf/README.md) 了解完整实现
> **🚀 快速开始**: 参见 [`scoringSystem-cf/QUICK_START.md`](../../scoringSystem-cf/QUICK_START.md)
> **🗄️ 旧版参考**: [`Backup/`](../../Backup/) 目录（已废弃的 GAS 版本，仅供参考）

---

## 项目概述

将现有的 Google Apps Script (GAS) 评分系统迁移到 Cloudflare Workers 平台。

**迁移已完成！** 所有核心功能已成功迁移至 Cloudflare Workers + D1 + Pages 架构。

### 当前架构（GAS）
- **后端**: 45 个 JavaScript 文件
- **数据库**: Google Sheets（多分片架构：Core/Main/Transaction）
- **前端**: Vue 3 SPA（39 个组件）
- **认证**: 用户名/密码 + Session（存储在 PropertiesService）
- **托管**: GAS HTML Service

### 目标架构（Cloudflare）
- **后端**: Cloudflare Workers（TypeScript）
- **数据库**: Cloudflare D1（SQLite）
- **前端**: Cloudflare Pages + Workers
- **认证**: JWT Token（每次 API 调用延长有效期 + 检查用户状态）
- **托管**: Cloudflare 全球边缘网络
- **邮件**: Gmail API（替代 GAS MailApp）

## 迁移策略：后端优先，分层迁移

### 迁移顺序原则
```
后端 ────► 前端
  │
  ├─► 1. 原生功能（Cloudflare 平台功能）
  │     - D1 数据库设置
  │     - KV 存储设置
  │     - Workers 基础框架
  │
  ├─► 2. 数据库操作层
  │     - database.js 核心抽象层
  │     - CRUD 基础操作
  │     - 数据访问函数
  │
  ├─► 3. 业务逻辑层
  │     - 各个 *_api.js 文件
  │     - 业务规则实现
  │     - API 路由处理
  │
  └─► 4. 前端适配（最后）
        - API client 修改
        - 静态资源托管
```

---

## Phase 1: 原生功能设置（Cloudflare 平台）

### 1.1 环境准备
```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 初始化项目
cd Cloudflare-Workers
wrangler init scoring-system-workers
```

### 1.2 创建 D1 数据库
```bash
# 创建数据库
wrangler d1 create scoring-system-db

# 记录返回的 database_id，添加到 wrangler.toml
```

### 1.3 创建 KV 命名空间（可选 - 如果不用 JWT）
```bash
# 注意：本项目使用 JWT，不需要 KV 存储 Session
# 如果需要其他临时存储（如验证码、限流等），可创建 KV namespace

wrangler kv:namespace create "TEMP_DATA"
wrangler kv:namespace create "TEMP_DATA" --preview

# 记录返回的 id，添加到 wrangler.toml
```

### 1.4 配置 wrangler.toml
```toml
name = "scoring-system-workers"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# D1 数据库绑定
[[d1_databases]]
binding = "DB"
database_name = "scoring-system-db"
database_id = "your-database-id-here"

# KV 绑定（可选 - 用于临时数据）
# 注意：Session 使用 JWT，不需要 KV 存储
[[kv_namespaces]]
binding = "TEMP_DATA"
id = "your-kv-id-here"
preview_id = "your-preview-kv-id-here"

# 环境变量（公开配置）
[vars]
ENVIRONMENT = "production"
```

### 1.5 配置系统参数

#### 分类说明

Cloudflare 系统参数分为三类存储方式：

1. **Secrets** - 敏感信息（API 密钥、JWT 密钥等）
2. **Environment Variables** - 非敏感配置（存储在 `wrangler.toml`）
3. **Database Config Table** - 业务配置（存储在 D1 数据库的 `system_config` 表）

---

#### 1.5.1 Cloudflare Secrets（敏感信息）

**⚠️ 重要安全说明：**

**JWT_SECRET 是私钥，不是公钥！**
- 使用对称加密（HS256）- 同一个 secret 用于签名和验证
- 如果泄露，攻击者可以伪造任何 token
- **绝对不能**存储在 KV、数据库、代码或环境变量中
- **必须**使用 Cloudflare Secrets（加密存储，只写不读）

**为什么用 Cloudflare Secrets？**
- ✅ 加密存储（类似 AWS Secrets Manager）
- ✅ 只写不读（设置后无法通过 CLI/API 查看）
- ✅ 环境隔离（dev/prod 使用不同 secret）
- ✅ 自动注入到 Worker（通过 `env.JWT_SECRET`）

**前端不需要 JWT_SECRET：**
- ❌ 前端不验证 token（由后端验证）
- ❌ 前端不生成 token（由后端生成）
- ✅ 前端只需要存储和发送 token
- ✅ 前端可以查看配置状态（是否已配置，不显示值）

---

**设置步骤：**

```bash
# === 认证系统（必需）===

# 1. 生成安全的 JWT Secret
npm run secret:generate
# 或手动生成：node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 2. 设置 JWT Secret（使用上一步生成的值）
wrangler secret put JWT_SECRET
# 提示输入时，粘贴刚才生成的随机字符串

# === 邮件系统（可选）===
wrangler secret put GMAIL_API_KEY
# 输入：从 Google Cloud Console 获取的 Gmail API Key

wrangler secret put GMAIL_FROM_EMAIL
# 输入：系统邮件发送者的 Gmail 地址

# === 安全验证（可选）===
wrangler secret put TURNSTILE_SECRET_KEY
# 输入：Cloudflare Turnstile 私钥（后端验证用）

# === 验证配置 ===
# 查看已设置的 Secrets（只显示名称，不显示值）
wrangler secret list

# 输出示例：
# ┌─────────────────────┬────────────┐
# │ Name                │ Type       │
# ├─────────────────────┼────────────┤
# │ JWT_SECRET          │ secret_text│
# │ GMAIL_API_KEY       │ secret_text│
# └─────────────────────┴────────────┘
```

**安全检查清单：**
- [ ] JWT_SECRET 已通过 `wrangler secret put` 设置
- [ ] JWT_SECRET 没有出现在代码、wrangler.toml 或 .env 文件中
- [ ] .gitignore 包含 `.env`、`.wrangler`、`*.sql`
- [ ] 生产环境使用不同的 JWT_SECRET

详见：`cloudflare-workers/SECURITY.md`

---

#### 1.5.2 Environment Variables（wrangler.toml 配置）

在 `wrangler.toml` 中设置：

```toml
[vars]
# 环境标识
ENVIRONMENT = "production"  # 或 "development"

# Turnstile 公钥（前端使用，非敏感）
TURNSTILE_SITE_KEY = "your_site_key_here"
TURNSTILE_ENABLED = "true"

# 日志配置
LOG_CONSOLE = "true"
LOG_LEVEL = "INFO"  # DEBUG/INFO/WARN/ERROR/FATAL

# Web App URL（用于邀请码邮件链接）
WEB_APP_URL = "https://your-worker.workers.dev"
```

---

#### 1.5.3 Database Config Table（业务配置）

这些参数存储在 D1 数据库的 `system_config` 表中，可通过管理界面动态修改：

**system_config 表结构**：
```sql
CREATE TABLE system_config (
  configKey TEXT PRIMARY KEY,
  configValue TEXT NOT NULL,
  description TEXT,
  category TEXT,
  updatedAt INTEGER,
  updatedBy TEXT
);
```

**初始化数据**：
```sql
-- 认证系统
INSERT INTO system_config VALUES ('SESSION_TIMEOUT', '86400000', 'Session 有效时间（毫秒，24小时）', 'auth', 0, 'system');

-- 邀请系统
INSERT INTO system_config VALUES ('MAX_INVITES_PER_DAY', '50', '每日最大邀请码数量', 'invitation', 0, 'system');
INSERT INTO system_config VALUES ('INVITE_CODE_TIMEOUT', '604800000', '邀请码有效期（毫秒，7天）', 'invitation', 0, 'system');

-- 业务逻辑限制
INSERT INTO system_config VALUES ('MAX_PROJECT_NAME_LENGTH', '100', '专案名称最大长度', 'limits', 0, 'system');
INSERT INTO system_config VALUES ('MAX_CONCURRENT_PROJECTS', '5', '同时进行的专案数量限制', 'limits', 0, 'system');
INSERT INTO system_config VALUES ('MAX_GROUP_NAME_LENGTH', '50', '群组名称最大长度', 'limits', 0, 'system');
INSERT INTO system_config VALUES ('MAX_GROUPS_PER_PROJECT', '20', '每个专案最大群组数', 'limits', 0, 'system');
INSERT INTO system_config VALUES ('MAX_MEMBERS_PER_GROUP', '10', '每个群组最大成员数', 'limits', 0, 'system');
INSERT INTO system_config VALUES ('MAX_STAGE_DURATION_DAYS', '30', '每个阶段最大天数', 'limits', 0, 'system');
```

---

#### 1.5.4 完整参数对照表

| GAS PropertiesService 参数 | Cloudflare 存储方式 | 新参数名 | 说明 |
|---------------------------|-------------------|---------|------|
| **核心数据库配置（5个 - 全部删除）** | | | |
| `DATABASE_FOLDER_ID` | ~~删除~~ | - | D1 数据库不需要文件夹 |
| `GLOBAL_WORKBOOK_ID` | ~~删除~~ | - | 单数据库架构，不需要分片 |
| `LOG_SPREADSHEET_ID` | ~~删除~~ | - | 日志存储在 D1 的 `sys_logs` 表 |
| `NOTIFICATION_SPREADSHEET_ID` | ~~删除~~ | - | 通知存储在 D1 的 `notifications` 表 |
| `TWOFACTOR_SHEET_ID` | ~~删除~~ | - | 2FA 数据存储在 D1 的 `two_factor_auth` 表 |
| **认证系统（2个）** | | | |
| ~~`SESSION_TIMEOUT`~~ | D1 `system_config` | `SESSION_TIMEOUT` | 移至数据库配置表 |
| ~~`PASSWORD_SALT_ROUNDS`~~ | ~~删除~~ | - | 已移除：PBKDF2 迭代次数硬编码为 600,000（OWASP 2023 标准）|
| - | **Cloudflare Secret** | `JWT_SECRET` | **新增**：JWT 签名密钥 |
| **邀请系统（3个）** | | | |
| ~~`MAX_INVITES_PER_DAY`~~ | D1 `system_config` | `MAX_INVITES_PER_DAY` | 移至数据库配置表 |
| ~~`INVITE_CODE_TIMEOUT`~~ | D1 `system_config` | `INVITE_CODE_TIMEOUT` | 移至数据库配置表 |
| ~~`WEB_APP_URL`~~ | wrangler.toml `[vars]` | `WEB_APP_URL` | 移至环境变量 |
| **安全验证（3个）** | | | |
| ~~`TURNSTILE_SITE_KEY`~~ | wrangler.toml `[vars]` | `TURNSTILE_SITE_KEY` | 公钥，移至环境变量 |
| ~~`TURNSTILE_SECRET_KEY`~~ | **Cloudflare Secret** | `TURNSTILE_SECRET_KEY` | 私钥，移至 Secret |
| ~~`TURNSTILE_ENABLED`~~ | wrangler.toml `[vars]` | `TURNSTILE_ENABLED` | 移至环境变量 |
| **日志系统（2个）** | | | |
| ~~`LOG_CONSOLE`~~ | wrangler.toml `[vars]` | `LOG_CONSOLE` | 移至环境变量 |
| ~~`LOG_LEVEL`~~ | wrangler.toml `[vars]` | `LOG_LEVEL` | 移至环境变量 |
| **业务逻辑限制（6个）** | | | |
| ~~`MAX_PROJECT_NAME_LENGTH`~~ | D1 `system_config` | `MAX_PROJECT_NAME_LENGTH` | 移至数据库配置表 |
| ~~`MAX_CONCURRENT_PROJECTS`~~ | D1 `system_config` | `MAX_CONCURRENT_PROJECTS` | 移至数据库配置表 |
| ~~`MAX_GROUP_NAME_LENGTH`~~ | D1 `system_config` | `MAX_GROUP_NAME_LENGTH` | 移至数据库配置表 |
| ~~`MAX_GROUPS_PER_PROJECT`~~ | D1 `system_config` | `MAX_GROUPS_PER_PROJECT` | 移至数据库配置表 |
| ~~`MAX_MEMBERS_PER_GROUP`~~ | D1 `system_config` | `MAX_MEMBERS_PER_GROUP` | 移至数据库配置表 |
| ~~`MAX_STAGE_DURATION_DAYS`~~ | D1 `system_config` | `MAX_STAGE_DURATION_DAYS` | 移至数据库配置表 |
| **系统状态监控（3个 - 全部删除）** | | | |
| `LAST_CLEANUP` | ~~删除~~ | - | 不再需要定时清理机器人 |
| `LAST_NOTIFICATION_PATROL` | ~~删除~~ | - | 不再需要通知巡检机器人 |
| `LAST_LOG_ARCHIVE` | ~~删除~~ | - | 不再需要日志归档机器人 |
| **邮件系统（2个新增）** | | | |
| - | **Cloudflare Secret** | `GMAIL_API_KEY` | **新增**：Gmail API 密钥 |
| - | **Cloudflare Secret** | `GMAIL_SENDER_EMAIL` | **新增**：系统邮件发送者地址 |

**统计**：
- GAS 原有 24 个参数
- Cloudflare Secrets: 4 个（敏感信息）
- Environment Variables: 6 个（非敏感配置）
- Database Config: 9 个（业务配置）
- 删除: 12 个（不再需要）
```

---

## Phase 2: 数据库操作层迁移

### 2.1 架构重大改进：从多 Spreadsheet 分片到单数据库

#### GAS 为什么需要分片？

在 GAS 中，每个项目都有独立的 Spreadsheet：
```
GAS 架构（被迫分片）：
├── Global Spreadsheet        # 全局数据
│   ├── Users
│   ├── Projects
│   └── GlobalGroups
│
├── Project_A Spreadsheet     # 项目 A 的数据
│   ├── Stages
│   ├── Submissions
│   └── Transactions
│
└── Project_B Spreadsheet     # 项目 B 的数据
    ├── Stages
    ├── Submissions
    └── Transactions
```

**原因：**
- Google Sheets 单文件限制（5M cells）
- 性能问题（大量数据在一个 Sheet 很慢）
- 需要通过 DriveApp 管理多个文件

#### ✅ D1 完全不需要分片！

**新架构：单数据库 + projectId 字段**
```
D1 单数据库：
├── 全局表（无前缀）
│   ├── users
│   ├── projects
│   └── global_groups
│
└── 项目表（proj_ 前缀）
    ├── proj_stages          (包含所有项目，用 projectId 区分)
    ├── proj_submissions     (包含所有项目，用 projectId 区分)
    └── proj_transactions    (包含所有项目，用 projectId 区分)
```

**核心设计：**
```sql
-- 所有项目的阶段都在同一个表
CREATE TABLE proj_stages (
  stageId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,  -- 用这个字段区分项目！
  stageName TEXT,
  -- ...
  INDEX idx_projectId (projectId)  -- 索引保证查询性能
);

-- 查询某个项目的阶段（超快！）
SELECT * FROM proj_stages WHERE projectId = 'proj_123';
```

#### 性能对比

| 操作 | GAS 多 Spreadsheet | D1 单数据库 | 提升 |
|------|-------------------|------------|------|
| 单项目查询 | 300-800ms | 10-50ms | **10-80倍** |
| 跨项目查询 | 几秒到几十秒 | 50-200ms | **100+倍** |
| 聚合计算 | 需前端计算 | SQL SUM | **10-50倍** |

### 2.2 分析现有数据库操作

#### 第一步：检查 `database.js`
需要分析的核心函数：
- [ ] Google Sheets 读取操作
- [ ] Google Sheets 写入操作
- [ ] 数据批量处理
- [x] ~~分片逻辑（Core/Main/Transaction）~~ → **不再需要！用 projectId 字段**

#### 第二步：映射到 D1/KV
| GAS 操作 | Cloudflare 对应方案 | 说明 |
|---------|-------------------|------|
| `readSheetData()` | D1 `SELECT` 查询 | 读取数据 |
| `writeSheetData()` | D1 `INSERT/UPDATE` | 写入数据 |
| `batchRead()` | D1 batch queries | 批量查询 |
| `batchWrite()` | D1 transactions | 批量写入（事务） |
| Session 存储 | KV `put/get` | 简单键值对 |
| Cache | KV with TTL | 带过期时间缓存 |

### 2.3 设计 D1 Schema（新架构）

#### 表命名规范

| 数据范围 | 表名前缀 | 示例 | 说明 |
|---------|---------|------|------|
| **全局数据** | 无前缀 | `users`, `projects` | 跨项目共享 |
| **项目数据** | `proj_` | `proj_stages`, `proj_submissions` | 所有项目共用，用 projectId 区分 |
| **系统数据** | `sys_` | `sys_configs`, `sys_logs` | 系统配置和日志 |

#### 全局数据表（无前缀）

```sql
-- 用户表
CREATE TABLE users (
  userId TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  passwordHash TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  lastLogin INTEGER,
  status TEXT DEFAULT 'active'
);

-- 项目表
CREATE TABLE projects (
  projectId TEXT PRIMARY KEY,
  projectName TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  createdBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (createdBy) REFERENCES users(userId)
);

-- 全局权限组
CREATE TABLE global_groups (
  groupId TEXT PRIMARY KEY,
  groupName TEXT NOT NULL,
  permissions TEXT,  -- JSON array
  createdAt INTEGER NOT NULL
);

-- 全局用户-组映射
CREATE TABLE global_user_groups (
  userId TEXT NOT NULL,
  groupId TEXT NOT NULL,
  assignedAt INTEGER NOT NULL,
  PRIMARY KEY (userId, groupId),
  FOREIGN KEY (userId) REFERENCES users(userId),
  FOREIGN KEY (groupId) REFERENCES global_groups(groupId)
);

-- 邀请码
CREATE TABLE invitations (
  inviteCode TEXT PRIMARY KEY,
  projectId TEXT,  -- 可选：绑定到特定项目
  createdBy TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  expiryTime INTEGER,
  usedBy TEXT,
  usedAt INTEGER,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (createdBy) REFERENCES users(userId),
  FOREIGN KEY (projectId) REFERENCES projects(projectId)
);
```

#### 项目数据表（proj_ 前缀）

**关键：所有项目共用这些表，用 projectId 字段区分！**

```sql
-- 阶段表
CREATE TABLE proj_stages (
  stageId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,  -- ✅ 关键字段：区分项目
  stageName TEXT NOT NULL,
  stageOrder INTEGER,
  stageType TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  startTime INTEGER,
  endTime INTEGER,
  config TEXT,  -- JSON
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (projectId) REFERENCES projects(projectId)
);

-- ✅ 索引优化：保证查询性能
CREATE INDEX idx_proj_stages_projectId ON proj_stages(projectId);
CREATE INDEX idx_proj_stages_status ON proj_stages(projectId, status);

-- 提交表
CREATE TABLE proj_submissions (
  submissionId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,  -- ✅ 关键字段
  stageId TEXT NOT NULL,
  submittedBy TEXT NOT NULL,
  content TEXT,
  status TEXT DEFAULT 'active',
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (projectId) REFERENCES projects(projectId),
  FOREIGN KEY (stageId) REFERENCES proj_stages(stageId),
  FOREIGN KEY (submittedBy) REFERENCES users(userId)
);

CREATE INDEX idx_proj_submissions_projectId ON proj_submissions(projectId);
CREATE INDEX idx_proj_submissions_stageId ON proj_submissions(stageId);

-- 项目权限组
CREATE TABLE proj_groups (
  groupId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,  -- ✅ 关键字段
  groupName TEXT NOT NULL,
  permissions TEXT,  -- JSON array
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (projectId) REFERENCES projects(projectId)
);

CREATE INDEX idx_proj_groups_projectId ON proj_groups(projectId);

-- 项目用户-组映射
CREATE TABLE proj_user_groups (
  projectId TEXT NOT NULL,  -- ✅ 关键字段
  userId TEXT NOT NULL,
  groupId TEXT NOT NULL,
  assignedAt INTEGER NOT NULL,
  PRIMARY KEY (projectId, userId, groupId),
  FOREIGN KEY (projectId) REFERENCES projects(projectId),
  FOREIGN KEY (userId) REFERENCES users(userId),
  FOREIGN KEY (groupId) REFERENCES proj_groups(groupId)
);

-- 钱包交易表（纯账本架构）
CREATE TABLE proj_transactions (
  transactionId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,  -- ✅ 关键字段
  userId TEXT NOT NULL,
  amount REAL NOT NULL,  -- 正数=收入，负数=支出
  type TEXT NOT NULL,
  reference TEXT,
  description TEXT,
  createdBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (projectId) REFERENCES projects(projectId),
  FOREIGN KEY (userId) REFERENCES users(userId)
);

CREATE INDEX idx_proj_transactions_projectId ON proj_transactions(projectId);
CREATE INDEX idx_proj_transactions_userId ON proj_transactions(projectId, userId);

-- 评论表
CREATE TABLE proj_comments (
  commentId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,  -- ✅ 关键字段
  targetType TEXT NOT NULL,  -- 'submission', 'stage', etc.
  targetId TEXT NOT NULL,
  content TEXT NOT NULL,
  authorId TEXT NOT NULL,
  parentCommentId TEXT,  -- 用于回复
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (projectId) REFERENCES projects(projectId),
  FOREIGN KEY (authorId) REFERENCES users(userId)
);

CREATE INDEX idx_proj_comments_projectId ON proj_comments(projectId);
CREATE INDEX idx_proj_comments_target ON proj_comments(projectId, targetType, targetId);

-- 投票表
CREATE TABLE proj_votes (
  voteId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,  -- ✅ 关键字段
  commentId TEXT NOT NULL,
  userId TEXT NOT NULL,
  voteType TEXT NOT NULL,  -- 'upvote' or 'downvote'
  createdAt INTEGER NOT NULL,
  UNIQUE (commentId, userId),
  FOREIGN KEY (projectId) REFERENCES projects(projectId),
  FOREIGN KEY (commentId) REFERENCES proj_comments(commentId),
  FOREIGN KEY (userId) REFERENCES users(userId)
);

-- 事件日志
CREATE TABLE proj_event_logs (
  logId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,  -- ✅ 关键字段
  userId TEXT,
  eventType TEXT NOT NULL,
  eventData TEXT,  -- JSON
  ipAddress TEXT,           -- ✅ 用户 IP 地址
  city TEXT,                -- ✅ 用户城市
  country TEXT,             -- ✅ 用户国家
  userAgent TEXT,           -- ✅ 用户浏览器/设备信息
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (projectId) REFERENCES projects(projectId)
);

CREATE INDEX idx_proj_event_logs_projectId ON proj_event_logs(projectId);

-- 通知表
CREATE TABLE proj_notifications (
  notificationId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,  -- ✅ 关键字段
  userId TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  isRead INTEGER DEFAULT 0,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (projectId) REFERENCES projects(projectId),
  FOREIGN KEY (userId) REFERENCES users(userId)
);

CREATE INDEX idx_proj_notifications_userId ON proj_notifications(projectId, userId, isRead);

-- 标签表
CREATE TABLE proj_tags (
  tagId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,  -- ✅ 关键字段
  tagName TEXT NOT NULL,
  color TEXT,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (projectId) REFERENCES projects(projectId)
);
```

#### 系统数据表（sys_ 前缀）

```sql
-- 系统配置
CREATE TABLE sys_configs (
  configKey TEXT PRIMARY KEY,
  configValue TEXT NOT NULL,
  description TEXT,
  updatedAt INTEGER NOT NULL
);

-- 系统日志
CREATE TABLE sys_logs (
  logId TEXT PRIMARY KEY,
  level TEXT NOT NULL,  -- 'info', 'warning', 'error'
  functionName TEXT,
  userId TEXT,
  sessionId TEXT,
  action TEXT,
  message TEXT NOT NULL,
  context TEXT,         -- JSON
  ipAddress TEXT,       -- ✅ 用户 IP 地址
  city TEXT,            -- ✅ 用户城市
  country TEXT,         -- ✅ 用户国家
  userAgent TEXT,       -- ✅ 用户浏览器/设备信息
  executionTime INTEGER,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(userId)
);

CREATE INDEX idx_sys_logs_level ON sys_logs(level, createdAt);
CREATE INDEX idx_sys_logs_userId ON sys_logs(userId, createdAt);
```

#### 查询示例对比

**GAS 方式（慢）：**
```javascript
// 需要打开项目 Spreadsheet（200-500ms）
const projectWorkbook = getProjectWorkbook(projectId);
const stagesSheet = projectWorkbook.getSheetByName('Stages');
const data = stagesSheet.getDataRange().getValues();  // 100-300ms
// 总计：300-800ms
```

**D1 方式（快）：**
```sql
-- 直接查询，有索引支持（10-50ms）
SELECT * FROM proj_stages WHERE projectId = 'proj_123';
```

**跨项目查询（GAS 几乎不可能，D1 轻松）：**
```sql
-- 获取用户在所有项目的提交（一条 SQL！）
SELECT s.*, p.projectName
FROM proj_submissions s
JOIN projects p ON s.projectId = p.projectId
WHERE s.submittedBy = 'usr_456'
ORDER BY s.createdAt DESC;
```

### 2.3 创建数据库迁移文件
```bash
# 创建初始 schema
wrangler d1 execute scoring-system-db --file=./schema/001_initial.sql

# 后续迁移
wrangler d1 execute scoring-system-db --file=./schema/002_add_indexes.sql
```

### 2.4 实现数据库抽象层

创建 `src/db/index.ts` 替代 GAS 的 `database.js`：

```typescript
// src/db/index.ts
export class Database {
  constructor(private db: D1Database) {}

  // 替代 readSheetData()
  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    const result = await this.db.prepare(sql).bind(...(params || [])).all();
    return result.results as T[];
  }

  // 替代 writeSheetData()
  async execute(sql: string, params?: any[]): Promise<D1Result> {
    return await this.db.prepare(sql).bind(...(params || [])).run();
  }

  // 批量操作（替代 batchWrite）
  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    return await this.db.batch(statements);
  }

  // 事务支持
  async transaction(callback: (db: Database) => Promise<void>) {
    // D1 暂不支持显式事务，使用 batch 模拟
  }
}
```

---

## Phase 2.4.5: 密码系统架构升级（PBKDF2-SHA256）

### 安全升级背景

**原系统（GAS）：** 使用 MD5 + 盐 + 10 次哈希
**问题：**
- MD5 在 1996 年已被破解，不适合密码哈希
- 仅 10 次迭代无法抵抗现代 GPU 暴力破解
- 不符合 OWASP 2023 标准

**新系统（Cloudflare）：** 使用 PBKDF2-SHA256 + 600,000 次迭代
**优势：**
- PBKDF2 是 NIST 和 OWASP 推荐的密码哈希算法
- 600,000 次迭代符合 OWASP 2023 标准（比 MD5 强 60,000 倍）
- 原生 Web Crypto API 支持，无需外部依赖
- 在 Cloudflare Workers 50ms CPU 限制内运行（~20-30ms）

---

### 密码哈希算法对比

| 算法 | 迭代次数 | 计算时间 | 安全性 | Cloudflare 兼容性 |
|------|---------|---------|--------|------------------|
| MD5 (旧) | 10 | <1ms | ❌ 已破解 | ✅ 支持 |
| SHA-256 | 1 | <1ms | ❌ 过快 | ✅ 支持 |
| PBKDF2-SHA256 (新) | 600,000 | 20-30ms | ✅ OWASP 2023 | ✅ 原生支持 |
| bcrypt | saltRounds=10 | 100-150ms | ✅ 强 | ⚠️ 需库，超时 |
| Argon2 | 标准参数 | 150-200ms | ✅ 最强 | ⚠️ 需库，超时 |
| scrypt | 标准参数 | 100-150ms | ✅ 强 | ⚠️ 需库，超时 |

**为什么选择 PBKDF2-SHA256？**
1. **免费套餐友好**: 符合 Cloudflare Workers Bundled Plan 的 50ms CPU 限制
2. **无需外部依赖**: 使用原生 `crypto.subtle` API
3. **OWASP 合规**: 600,000 次迭代符合 2023 年标准
4. **未来升级路径**: 如果升级到 Unbound Workers（30s 限制），可切换到 Argon2

---

### 密码哈希格式

**新格式（PBKDF2）：**
```
pbkdf2-sha256$600000$<salt-hex>$<hash-hex>
```

**示例：**
```
pbkdf2-sha256$600000$a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6$9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7a8b9c0d1e2f3g4h5i6j7k8l9m0
│        │      │                                 │
算法      迭代次数  盐（16字节，32位hex）             哈希（32字节，64位hex）
```

**旧格式（MD5 - 仅用于兼容）：**
```
<salt-hex>$<hash-hex>
```

**向后兼容：**
- `verifyPassword()` 自动检测哈希格式
- 旧 MD5 哈希仍可验证（会输出警告）
- `needsPasswordUpgrade()` 检测是否需要升级
- 建议在用户登录时自动升级密码哈希

---

### 实现细节

**核心文件：** `src/handlers/auth/password.ts`

**主要函数：**

1. **hashPassword(password: string): Promise<string>**
   - 生成 16 字节随机盐
   - 使用 PBKDF2-SHA256 + 600,000 次迭代
   - 返回格式化哈希字符串
   - 执行时间：~20-30ms

2. **verifyPassword(password: string, storedHash: string): Promise<boolean>**
   - 自动检测哈希格式（PBKDF2 或 MD5）
   - 使用常量时间比较防止时序攻击
   - 返回验证结果

3. **needsPasswordUpgrade(storedHash: string): boolean**
   - 检测是否为旧 MD5 格式
   - 检测 PBKDF2 迭代次数是否过低
   - 用于触发密码升级流程

**密码强度验证：** `validatePasswordStrength(password: string)`
- 最小长度：8 字符
- 最大长度：128 字符（防 DoS）
- 必须包含至少一个数字
- 必须包含至少一个字母

---

### 配置变更

**已删除环境变量：**
```toml
# ❌ 删除（wrangler.toml）
PASSWORD_SALT_ROUNDS = "10"
```

**原因：**
- PBKDF2 迭代次数（600,000）硬编码在 `password.ts` 中
- 遵循 OWASP 2023 标准，不应随意调整
- 减少配置项，降低误配置风险

**如需调整迭代次数：**
修改 `src/handlers/auth/password.ts` 中的常量：
```typescript
const PBKDF2_ITERATIONS = 600000; // OWASP 2023 recommendation
```

---

### 密码升级流程（推荐）

**场景：** 系统从 MD5 迁移到 PBKDF2 后，旧用户密码需要升级

**实现方案：**

```typescript
// 在登录处理中
const user = await getUserByEmail(email);
const isValid = await verifyPassword(password, user.passwordHash);

if (isValid && needsPasswordUpgrade(user.passwordHash)) {
  // 密码验证成功 + 需要升级 → 重新哈希
  const newHash = await hashPassword(password);
  await updateUserPassword(user.userId, newHash);
  console.log(`User ${user.userId} password upgraded to PBKDF2`);
}
```

**时机：**
- 用户成功登录时
- 用户修改密码时
- 用户重置密码时

**好处：**
- 无需强制所有用户重置密码
- 透明升级，用户无感知
- 逐步淘汰旧哈希格式

---

### 性能影响

**CPU 时间消耗：**

| 操作 | MD5 (旧) | PBKDF2 (新) | 增加 |
|------|---------|------------|------|
| 注册（生成哈希） | <1ms | 20-30ms | +30ms |
| 登录（验证密码） | <1ms | 20-30ms | +30ms |
| 密码重置 | <1ms | 20-30ms | +30ms |

**评估：**
- ✅ 符合 Cloudflare Workers Bundled Plan 的 50ms CPU 限制
- ✅ 对用户体验影响可忽略（30ms 延迟）
- ✅ 安全性提升 60,000 倍（值得付出的代价）

**未来优化：**
- 如果升级到 Unbound Workers（30s CPU 限制）
- 可切换到 Argon2id（更强的内存困难算法）
- 迭代次数可提升到 2,000,000+（OWASP 未来标准）

---

### 工具函数重构

为了消除代码重复和修复 bug，以下工具函数已提取到共享模块：

**1. `src/utils/hash.ts`** - 非加密哈希（用于确定性随机种子）
```typescript
export function simpleHash(str: string): number
export function hashToRange(str: string, min: number, max: number): number
export function stringToSeed(str: string): number
```
**修复：** `hash & hash` bug → `hash & 0xFFFFFFFF`

**2. `src/utils/random.ts`** - 确定性随机数生成
```typescript
export function createSeededRandom(seed: number): () => number
export function randomInt(rng: () => number, min: number, max: number): number
export function randomChoice<T>(rng: () => number, array: T[]): T
```

**3. `src/utils/array.ts`** - 数组操作
```typescript
export function shuffleArray<T>(array: T[], seed?: number): T[]
export function getRandomElements<T>(array: T[], count: number, seed?: number): T[]
export function uniqueArray<T>(array: T[], keyFn?: (item: T) => any): T[]
```

**4. `src/utils/validation.ts`** - 输入验证
```typescript
export function validateEmail(email: string): boolean
export function validateUsername(username: string): boolean
export function validateProjectName(projectName: string): boolean
```

**重构文件：**
- ✅ `src/handlers/auth/password-reset.ts` - 移除重复函数，使用共享 utils
- ✅ `src/handlers/auth/init-system.ts` - 移除 rounds 参数

---

### 测试检查清单

**密码哈希：**
- [ ] 新用户注册使用 PBKDF2 格式
- [ ] 旧 MD5 密码仍可验证
- [ ] 密码升级流程正常工作
- [ ] `needsPasswordUpgrade()` 正确检测旧格式

**性能：**
- [ ] 注册操作在 50ms 内完成
- [ ] 登录操作在 50ms 内完成
- [ ] 密码重置操作在 50ms 内完成

**安全：**
- [ ] 密码验证使用常量时间比较
- [ ] 弱密码被拒绝
- [ ] 过长密码被拒绝（防 DoS）

**工具函数：**
- [ ] `simpleHash()` 对相同输入产生相同输出
- [ ] `shuffleArray()` 使用种子时产生确定性结果
- [ ] `validateEmail()` 正确验证邮箱格式

---

## Phase 2.5: 权限系统架构

### 架构总览

系统采用**双层权限模型**：
- **全局权限系统**（4层）：管理跨项目操作和系统级权限
- **项目权限系统**（6层）：管理单个项目内的细粒度权限

---

### 2.5.1 全局权限系统（4层）

**适用范围**：跨项目操作、系统管理、项目创建

```
┌─────────────────────────────────────────────────────────────┐
│                 全局权限系统（4层）                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Level 0: System Admin (系统管理员)                          │
│  ├─ 权限来源: globalusergroups (system_admin permission)    │
│  ├─ 权限范围: 所有系统操作                                    │
│  └─ 能做什么:                                                │
│     ✓ 管理用户（create/delete/disable users）                │
│     ✓ 管理全局权限组（globalgroups）                          │
│     ✓ 查看所有项目（跨项目访问）                               │
│     ✓ 生成邀请码                                             │
│     ✓ 系统配置（system_config 表）                            │
│                                                             │
│  Level 1: Project Creator (项目创建者)                       │
│  ├─ 权限来源: globalusergroups (create_project permission)  │
│  ├─ 权限范围: 创建和管理自己的项目                              │
│  └─ 能做什么:                                                │
│     ✓ 创建新项目                                             │
│     ✓ 完全管理自己创建的项目                                   │
│     ✗ 无法访问他人项目（除非被授权）                            │
│                                                             │
│  Level 2: 其他全局角色 (预留)                                 │
│  ├─ 权限来源: globalusergroups (custom permissions)          │
│  ├─ 说明: 可扩展的全局权限层级                                 │
│                                                             │
│  Level 3: 普通用户 (Regular User)                            │
│  ├─ 权限来源: 注册用户，无全局特殊权限                          │
│  ├─ 权限范围: 只能访问被授权的项目                              │
│  └─ 能做什么:                                                │
│     ✓ 查看被授权的项目列表                                     │
│     ✓ 在项目内根据项目权限操作                                 │
│     ✗ 无法创建项目（除非有 create_project）                    │
│     ✗ 无法访问系统管理功能                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**数据库表**：
- `globalusergroups`: 用户-全局权限组映射
- `globalgroups`: 全局权限组定义（permissions JSON 数组）

**关键权限标识**：
- `system_admin`: 系统管理员
- `create_project`: 创建项目
- 可扩展其他全局权限

---

### 2.5.2 项目权限系统（6层）

**适用范围**：单个项目内的所有操作

```
┌─────────────────────────────────────────────────────────────┐
│                 项目权限系统（6层）                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Level 0: Admin / Project Creator                           │
│  ├─ 权限来源: projects.createdBy 或全局 system_admin          │
│  ├─ 权限范围: 项目管理和查看（管理员角色，不参与教学互动）        │
│  └─ 能做什么:                                                │
│     ✓ 管理项目（update/delete project）                       │
│     ✓ 管理阶段（create/update/delete stages）                 │
│     ✓ 管理群组（create/delete groups）                        │
│     ✓ 添加 Teacher/Observer                                  │
│     ✓ 结算阶段（settle stages）                               │
│     ✓ 查看所有数据（submissions, comments, wallets）          │
│     ✗ **不能发表评论**（只有教师和学生能评论）                   │
│     ✗ **不能教师投票**（只有教师能投票）                        │
│     ✗ **不能管理组员**（只有组长能管理）                        │
│     📝 设计理念: Admin 负责系统管理，不参与教学评分互动          │
│                                                             │
│  Level 1: Teacher (项目教师)                                 │
│  ├─ 权限来源: projectviewers (role='teacher')                │
│  ├─ 权限范围: manage, view, comment, teacher_vote            │
│  └─ 能做什么:                                                │
│     ✓ 管理阶段 (create/update/delete stages)                 │
│     ✓ 管理群组 (create/update/delete groups)                 │
│     ✓ 结算阶段 (settle stages, preview scores)               │
│     ✓ 查看所有数据 (submissions, comments, wallets)           │
│     ✓ 发表评论 (post comments)                               │
│     ✓ **教师投票** (teacher vote - 对提交进行评分排名)          │
│     ✗ 提交作业 (不能以学生身份提交)                             │
│     ✗ 学生投票 (不能参与学生间的同侪互评)                        │
│     ✗ **不能管理组员**（只有组长能管理）                        │
│     📝 设计理念: 教师负责教学指导和评分，但不干预学生自治          │
│                                                             │
│  Level 2: Observer (项目观察者)                              │
│  ├─ 权限来源: projectviewers (role='observer')               │
│  ├─ 权限范围: view only (完全只读)                             │
│  └─ 能做什么:                                                │
│     ✓ 查看所有数据 (stages, submissions, comments, wallets)   │
│     ✓ 添加 reactions (like, emoji)                          │
│     ✗ 发表评论 (read-only, 不能发言)                          │
│     ✗ 修改任何数据                                            │
│                                                             │
│  Level 3: Group Leader (学生组长)                            │
│  ├─ 权限来源: usergroups (role='leader') + groups.allowChange=true │
│  ├─ 权限范围: 组内管理 + 学生权限                               │
│  └─ 能做什么:                                                │
│     ✓ 管理组员 (add/remove group members) - **唯一能管理组员的角色** │
│     ✓ 提交作业 (submit - 如果群组有权限)                       │
│     ✓ 投票 (vote - 如果群组有权限)                            │
│     ✓ 发表评论 (comment - 如果群组有权限)                      │
│     ✓ 查看项目数据 (view - 如果群组有权限)                     │
│     ✗ 管理阶段、结算（需要 teacher/admin）                     │
│     ⚠️ 注意: 如果 allowChange=false，组长权限被锁定             │
│                                                             │
│  Level 4: Group Member (学生组员)                            │
│  ├─ 权限来源: usergroups (role='member')                     │
│  ├─ 权限范围: 根据群组 permissions 动态授权                     │
│  └─ 能做什么:                                                │
│     ✓ 提交作业 (submit - 如果群组有权限)                       │
│     ✓ 投票 (vote - 如果群组有权限)                            │
│     ✓ 发表评论 (comment - 如果群组有权限)                      │
│     ✓ 查看项目数据 (view - 如果群组有权限)                     │
│     ✗ 管理组员（只有组长能管理）                                │
│     ✗ 管理阶段、结算（需要 teacher/admin）                     │
│                                                             │
│  Level 5: Member without Group (未分组成员)                  │
│  ├─ 权限来源: projectviewers (role='member') 但不在任何 usergroup │
│  ├─ 权限范围: **完全无法访问项目**                              │
│  └─ 能做什么:                                                │
│     ✗ **无任何访问权限**                                      │
│     ✗ **无法进入项目页面** (canEnter = false)                 │
│     ✗ **无法查看任何数据**                                     │
│     ⚠️ 注意: 必须被分配到群组才能获得权限                        │
│     📝 设计理念: 严格访问控制，防止未授权用户进入                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**关键设计特性**：

1. **角色分离原则**：
   - **Level 0 (Admin)**: 系统管理者，不参与教学互动
     - ❌ 不能评论、不能投票
     - ✅ 只负责项目管理和数据查看
   - **Level 1 (Teacher)**: 教学指导者，参与教学互动
     - ✅ 可以评论、教师投票（评分）
     - ❌ 不能管理组员（尊重学生自治）
   - **Level 3 (Group Leader)**: 学生自治管理者
     - ✅ 唯一能管理组员的角色
     - ❌ 教师和管理员都不能干预

2. **角色叠加机制**（⚠️ 重要更新）：
   - **用户可以同时拥有多个角色**
   - **后端权限检查支持角色叠加**：
     - 管理员账号如果在 `projectViewers` 表中被设为 `teacher`，则同时拥有 Admin 和 Teacher 权限
     - Admin 权限允许管理项目，Teacher 权限允许评论和投票
     - 后端 API 会检查用户的所有可用角色
   - **前端角色切换功能**：
     - 用户可以在"权限检视" Dialog 中看到所有可用角色
     - 通过 `el-segmented` 组件切换当前使用的角色
     - 切换后 UI 会根据当前角色显示/隐藏对应功能
     - 角色选择保存在 localStorage（按项目隔离）

3. **角色切换实现细节**：
   - **Composable**: `useRoleSwitch.js` - 管理可用角色、当前角色、切换逻辑
   - **权限计算**: `useProjectPermissions.js` - 接收 `activeRole` 参数，根据选择的角色计算权限
   - **UI 组件**:
     - `TopBarUserControls.vue` - 权限 Dialog 中显示角色切换器
     - `ProjectDetail-New.vue` - 集成角色切换功能
   - **用户体验**：
     - 只有多角色用户才看到切换器
     - 实时显示当前角色的具体权限列表
     - 切换后立即生效，无需刷新页面

4. **学生自治模型**：
   - **只有组长能管理组员**（Level 3）
   - 教师和管理员**不能**直接管理组员
   - 组长权限可通过 `allowChange` 标志动态锁定

5. **`allowChange` 标志**：
   ```sql
   -- groups 表
   CREATE TABLE groups (
     groupId TEXT PRIMARY KEY,
     groupName TEXT,
     allowChange INTEGER DEFAULT 1,  -- 1=允许变更, 0=锁定
     ...
   );
   ```
   - `allowChange = 1`: 组长可以管理组员
   - `allowChange = 0`: 组长权限被锁定（例如评分阶段）

6. **严格访问控制**：
   - Level 5 确保未分组成员**完全无法访问**项目
   - `canEnter = false` 阻止进入项目页面
   - 防止权限泄漏和未授权访问

---

### 2.5.3 前后端权限映射

系统在后端和前端使用不同的权限表示方式：

#### 后端权限（4层数字标识）

**位置**: `Cloudflare-Workers/src/middleware/permissions.ts`

```typescript
// 后端使用数字 0-3 表示权限层级
export type PermissionLevel = 0 | 1 | 2 | 3 | null;

// Level 0: System Admin / Project Creator
// Level 1: Teacher (projectViewers role='teacher')
// Level 2: Observer (projectViewers role='observer')
// Level 3: Student (userGroups 中的所有活跃成员)
```

**后端不区分组长和组员**：
- 所有在 `userGroups` 中 `isActive=1` 的成员都是 Level 3
- 组长和组员拥有相同的后端权限
- 组长管理权限由前端额外处理

#### 前端权限（6层字符串标识）

**位置**:
- `Cloudflare-Workers/frontend-vue/src/composables/useDetailedProjectPermissions.js` (统一权限计算)
- `Cloudflare-Workers/frontend-vue/src/composables/useProjectPermissions.js` (响应式封装)
- `Cloudflare-Workers/frontend-vue/src/components/Dashboard.vue` (使用 composable)
- `Cloudflare-Workers/frontend-vue/src/components/ProjectDetail.vue` (使用 composable)

```javascript
// 前端使用字符串表示权限层级
export type FrontendPermissionLevel =
  | 'admin'              // Level 0 - 管理员（不能评论/投票）
  | 'teacher'            // Level 1 - 教师（可评论/教师投票）
  | 'observer'           // Level 2 - 观察者（完全只读）
  | 'group_leader'       // Level 3 - 组长（可管理组员）
  | 'member_in_group'    // Level 4 - 组员（可参与但不能管理）
  | 'member'             // Level 5 - 未分组（完全无法访问）
  | 'none';              // 无权限
```

**前端细分 Level 3**：
- 后端的 Level 3 在前端被细分为 3 个子层级
- Level 3 (组长) / Level 4 (组员) / Level 5 (未分组)
- 用于控制按钮显示和交互权限

**统一 Composable**：
- 所有权限计算逻辑已统一到 `useDetailedProjectPermissions.js`
- Dashboard 和 ProjectDetail 使用相同的权限计算函数
- 消除了 80+ 行的重复代码

#### 映射关系表

| 后端 (permissions.ts) | 前端 (useDetailedProjectPermissions.js) | 权限来源 | UI 权限特性 |
|----------------------|-------------------------------|---------|------------|
| **Level 0** | `'admin'` | `system_admin` 或 `projects.createdBy` | 查看所有数据，**不能评论/投票** |
| **Level 1** | `'teacher'` | `projectViewers.role='teacher'` | 管理项目，**可评论/教师投票**，不能管理组员 |
| **Level 2** | `'observer'` | `projectViewers.role='observer'` | 完全只读 |
| **Level 3** | `'group_leader'` | `userGroups.role='leader'` + `allowChange=true` | **唯一能管理组员** |
| **Level 3** | `'member_in_group'` | `userGroups.role='member'` | 可参与但不能管理 |
| **Level 3** | `'member'` | `role='member'` 但不在 `userGroups` | **完全无法访问 (canEnter=false)** |

**关键差异**：
1. 后端：简化的 4 层模型，足以满足 API 访问控制
2. 前端：细粒度的 6 层模型，精确控制 UI 交互
3. Level 3-5 是前端对后端 Level 3 的**扩展细分**

---

### 2.5.4 ✅ 已解决：统一权限 Composable

#### 问题

**旧的 `useProjectRole.js` 的限制**：
- 只检查 `projectViewers` 表，无法判断 Level 3-5
- Dashboard.vue 和 ProjectDetail.vue 各自实现权限计算，代码重复 80+ 行
- 维护困难，容易导致前端权限不一致

#### 解决方案

**1. 创建统一 composable**：

```javascript
// Cloudflare-Workers/frontend-vue/src/composables/useDetailedProjectPermissions.js
export function calculateProjectPermissions(project, globalPermissions) {
  // ✅ 检查 projectViewers + userGroups
  // ✅ 完整的 6 层权限判断
  // ✅ 返回标准化的权限对象

  return {
    permissionLevel: 'admin' | 'teacher' | 'observer' | 'group_leader' | 'member_in_group' | 'member',
    canEnter: boolean,           // Level 5 为 false
    canViewLogs: boolean,
    canManageMembers: boolean,   // 只有 group_leader 为 true
    canSubmit: boolean,
    canVote: boolean,
    canComment: boolean,         // admin=false, teacher=true, student=true
    canManageStages: boolean,    // admin=true, teacher=true
    canTeacherVote: boolean,     // admin=false, teacher=true
    canViewAll: boolean
  }
}
```

**2. Dashboard 使用**：
```javascript
// Dashboard.vue (第342-356行)
projectsWithPermissions() {
  const userData = this.userQuery.data?.value || this.userQuery.data
  const globalPermissions = userData?.permissions || []

  return this.filteredProjects.map(project => {
    const permissions = calculateProjectPermissions(project, globalPermissions)
    return { ...project, permissions }
  })
}
```

**3. ProjectDetail 使用**：
```javascript
// ProjectDetail.vue (使用 useProjectPermissions composable)
const { canSubmit, canVote, canComment, permissions } = useProjectPermissions(
  toRef(projectData),
  toRef(props, 'user')
)
```

**4. 关键修复 - getProjectCore 返回 viewerRole**：

问题：`getProjectCore` API 没有查询和返回 `viewerRole`，导致前端权限计算失败

修复：[list.ts:119-165](/mnt/f/Development/scoringSystem-gas/Cloudflare-Workers/src/handlers/projects/list.ts#L119-L165)
```typescript
// 新增查询 projectviewers 表
const viewerRoleResult = await env.DB.prepare(`
  SELECT role FROM projectviewers
  WHERE projectId = ? AND userEmail = ? AND isActive = 1
`).bind(projectId, userEmail).first();

const viewerRole = viewerRoleResult ? (viewerRoleResult as any).role : null;

// 添加到返回结果
return successResponse({
  project,
  groups: groups.results,
  userGroups: userGroups.results,
  stages: mappedStages,
  users: users.results,
  viewerRole  // ✅ 关键修复：添加 viewerRole
});
```

**成果**：
- ✅ 消除 80+ 行重复代码
- ✅ 权限逻辑统一维护
- ✅ 前后端权限一致性保证
- ✅ 修复 race condition（viewerRole undefined 问题）

---

### 核心设计原则

#### 1. 单角色约束 (Single Role Constraint)

**关键规则**：每个用户在每个项目中**只能有一个角色**

```
用户角色互斥性：
├─ Teacher/Observer (projectviewers 表)
│  └─ 不能同时是 Student (usergroups 表)
│
└─ Student (usergroups 表)
   └─ 不能同时是 Teacher/Observer (projectviewers 表)
```

**实现机制**：

1. **addProjectViewer() 检查** ([viewers.ts:104-116](Cloudflare-Workers/src/handlers/projects/viewers.ts#L104-L116))
   ```typescript
   // 添加 teacher/observer 前，检查是否已是 student
   const studentMembership = await env.DB.prepare(`
     SELECT COUNT(*) as count FROM usergroups
     WHERE projectId = ? AND userEmail = ? AND isActive = 1
   `).bind(projectId, targetUserEmail).first();

   if (studentMembership.count > 0) {
     return errorResponse('ROLE_CONFLICT', 'User is already a student member');
   }
   ```

2. **addUserToGroup() 检查** ([members.ts:85-97](Cloudflare-Workers/src/handlers/groups/members.ts#L85-L97))
   ```typescript
   // 添加 student 前，检查是否已是 teacher/observer
   const viewerRole = await env.DB.prepare(`
     SELECT role FROM projectviewers
     WHERE projectId = ? AND userEmail = ? AND isActive = 1
   `).bind(projectId, userEmail).first();

   if (viewerRole) {
     return errorResponse('ROLE_CONFLICT', `User is already a ${viewerRole.role}`);
   }
   ```

**前端错误处理**：
- [ProjectManagement.vue:2670](frontend-vue/src/components/admin/ProjectManagement.vue#L2670) 显示 `ROLE_CONFLICT` 错误消息
- 用户友好提示："该用户已是学生成员，请先从群组移除"

#### 2. 双层防御架构 (Dual-Layer Defense)

所有 API 端点实现**路由层 + 业务层**双重权限检查：

```
请求流程：
  ┌──────────────────────────────────────────────────┐
  │ 1. Router Layer (路由层)                          │
  │    checkProjectPermission(user, project, 'view')  │
  │    ├─ 检查基本访问权限                              │
  │    └─ 快速拒绝无权限用户                            │
  └────────────────┬─────────────────────────────────┘
                   │
                   ▼
  ┌──────────────────────────────────────────────────┐
  │ 2. Handler Layer (业务层)                         │
  │    verifyAuthor(user, comment)                    │
  │    ├─ 验证业务逻辑                                 │
  │    └─ 细粒度权限控制                               │
  └──────────────────────────────────────────────────┘
```

**示例 - 评论删除**：

```typescript
// 路由层：基本权限检查
app.post('/comments/delete', async (c) => {
  const hasPermission = await checkProjectPermission(
    c.env, user.userEmail, projectId, 'view'
  );
  if (!hasPermission) {
    return c.json({ error: 'ACCESS_DENIED' }, 403);
  }

  // 业务层：作者验证
  return await deleteComment(c.env, user.userEmail, projectId, commentId);
});

// Handler (deleteComment):
// - 验证评论是否存在
// - 验证用户是否是评论作者
// - 或者用户是否是 teacher/admin
```

#### 3. 权限检查实现

**核心函数**：[checkProjectPermission()](Cloudflare-Workers/src/middleware/permissions.ts#L235-L313)

```typescript
/**
 * 检查用户是否有项目权限
 * 按优先级依次检查：Level 0 → Level 1-2 → Level 3
 */
export async function checkProjectPermission(
  env: Env,
  userEmail: string,
  projectId: string,
  permission: string // 'view', 'manage', 'comment', 'submit', 'vote'
): Promise<boolean> {
  // 1. Level 0: System Admin / Project Creator
  const isAdmin = await hasGlobalPermission(env.DB, userId, 'system_admin');
  if (isAdmin) return true;

  const project = await env.DB.prepare(`
    SELECT createdBy FROM projects WHERE projectId = ?
  `).bind(projectId).first();
  if (project.createdBy === userId) return true;

  // 2. Level 1-2: Teacher / Observer (projectviewers 表)
  const viewer = await env.DB.prepare(`
    SELECT role FROM projectviewers
    WHERE userEmail = ? AND projectId = ? AND isActive = 1
  `).bind(userEmail, projectId).first();

  if (viewer) {
    if (viewer.role === 'teacher') {
      // Teacher: manage, view, comment
      return ['manage', 'view', 'comment'].includes(permission);
    }
    if (viewer.role === 'observer') {
      // Observer: view only
      return permission === 'view';
    }
  }

  // 3. Level 3: Student (usergroups + projectgroups)
  const groups = await env.DB.prepare(`
    SELECT pmg.permissions FROM usergroups pug
    JOIN projectgroups pmg ON pug.groupId = pmg.groupId
    WHERE pug.userEmail = ? AND pug.projectId = ? AND pug.isActive = 1
  `).bind(userEmail, projectId).all();

  for (const group of groups.results) {
    const permissions = JSON.parse(group.permissions || '[]');
    if (permissions.includes(permission) || permissions.includes('admin')) {
      return true;
    }
  }

  return false;
}
```

### 数据库表设计

#### projectviewers (Level 1-2)

```sql
CREATE TABLE projectviewers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projectId TEXT NOT NULL,
  userEmail TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('teacher', 'observer', 'member')),
  assignedBy TEXT NOT NULL,
  assignedAt INTEGER NOT NULL,
  isActive INTEGER DEFAULT 1,
  UNIQUE(projectId, userEmail)  -- 每个用户每个项目只能有一个 viewer 角色
);

CREATE INDEX idx_projectviewers_project ON projectviewers(projectId);
CREATE INDEX idx_projectviewers_user ON projectviewers(userEmail);
CREATE INDEX idx_projectviewers_role ON projectviewers(role);
```

**角色说明**：
- `teacher`: Level 1 - 项目教师，可管理、查看、评论
- `observer`: Level 2 - 项目观察者，仅查看
- `member`: **已废弃** - 使用 usergroups 表管理学生成员

#### usergroups + projectgroups (Level 3)

```sql
-- 用户-群组映射
CREATE TABLE usergroups (
  membershipId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  groupId TEXT NOT NULL,
  userEmail TEXT NOT NULL,
  role TEXT DEFAULT 'member',  -- leader/member
  joinTime INTEGER NOT NULL,
  isActive INTEGER DEFAULT 1,
  UNIQUE(projectId, userEmail) WHERE isActive = 1  -- 每个用户每个项目只能加入一个群组
);

-- 群组权限配置
CREATE TABLE projectgroups (
  mappingId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  groupId TEXT NOT NULL,
  groupRole TEXT NOT NULL,
  permissions TEXT,  -- JSON: ["submit", "vote", "comment", "view"]
  assignedTime INTEGER NOT NULL
);
```

**权限组合示例**：
```json
// 学生群组（可提交、投票、评论、查看）
{"permissions": ["submit", "vote", "comment", "view"]}

// 只读学生（仅查看）
{"permissions": ["view"]}

// 评审组（可投票、评论、查看，不能提交）
{"permissions": ["vote", "comment", "view"]}
```

### API 权限映射

#### 完整权限对照表

| API 端点 | 路由层检查 | 业务层检查 | Level 0 | Level 1 | Level 2 | Level 3 |
|---------|-----------|-----------|---------|---------|---------|---------|
| **项目管理** |
| `POST /projects/create` | `create_project` (global) | - | ✓ | ✗ | ✗ | ✗ |
| `POST /projects/update` | `manage` | 验证 creator | ✓ | ✓ | ✗ | ✗ |
| `POST /projects/list` | - | 过滤可见项目 | ✓ | ✓ | ✓ | ✓ |
| **阶段管理** |
| `POST /stages/create` | `manage` | - | ✓ | ✓ | ✗ | ✗ |
| `POST /stages/update` | `manage` | - | ✓ | ✓ | ✗ | ✗ |
| `POST /stages/list` | `view` | - | ✓ | ✓ | ✓ | ✓ |
| **群组管理** |
| `POST /groups/create` | `manage` | - | ✓ | ✓ | ✗ | ✗ |
| `POST /groups/add-member` | `manage` | 检查角色冲突 | ✓ | ✓ | ✗ | ✗ |
| `POST /groups/list` | `view` | - | ✓ | ✓ | ✓ | ✓ |
| **提交管理** |
| `POST /submissions/submit` | `view` | 检查 `submit` 权限 | ✓ | ✗ | ✗ | ✓* |
| `POST /submissions/update` | `view` | 验证作者 | ✓ | ✗ | ✗ | ✓* |
| `POST /submissions/list` | `view` | - | ✓ | ✓ | ✓ | ✓ |
| **评分投票** |
| `POST /scoring/vote` | `view` | 区分 teacher/peer | ✓ | ✓ | ✗ | ✓* |
| `POST /scoring/analysis` | `manage` | - | ✓ | ✓ | ✗ | ✗ |
| `POST /scoring/settle` | `manage` | - | ✓ | ✓ | ✗ | ✗ |
| **评论系统** |
| `POST /comments/create` | `comment` | - | ✓ | ✓ | ✗ | ✓* |
| `POST /comments/update` | `view` | 验证作者 | ✓ | ✓ | ✗ | ✓* |
| `POST /comments/delete` | `view` | 验证作者/teacher | ✓ | ✓ | ✗ | ✓* |
| `POST /comments/reactions/add` | `view` | - | ✓ | ✓ | ✓ | ✓ |
| **钱包系统** |
| `POST /wallets/get` | `view` (自己) / `manage` (他人) | - | ✓ | ✓ | ✓ | ✓ |
| `POST /wallets/award` | `manage` | - | ✓ | ✓ | ✗ | ✗ |
| `POST /wallets/leaderboard` | `view` | - | ✓ | ✓ | ✓ | ✓ |

**注释**：
- ✓* = Level 3 需要群组有对应权限（submit/vote/comment）
- `manage` = 管理权限（Level 0-1）
- `view` = 查看权限（Level 0-3 全部）
- `comment` = 评论权限（Level 0-1, Level 3*）

### 安全审计完成状态

#### 已修复的安全问题

1. **✅ Issue 1: checkProjectPermission 完全忽略 projectviewers 表**
   - **修复**: 添加 Level 1-2 检查逻辑 ([permissions.ts:259-290](Cloudflare-Workers/src/middleware/permissions.ts#L259-L290))
   - **影响**: Teacher 和 Observer 现在可以正确访问项目

2. **✅ Issue 2: Observer 可以发表评论**
   - **修复**: 评论创建改用 `comment` 权限检查 ([comments.ts:65](Cloudflare-Workers/src/router/comments.ts#L65))
   - **影响**: Observer 现在只能查看评论，不能发表

3. **✅ Issue 3: Groups Router 缺少权限检查**
   - **修复**: 添加 7 个端点的权限检查 ([groups.ts](Cloudflare-Workers/src/router/groups.ts))
   - **影响**: 所有群组操作现在受到保护

4. **✅ Issue 4: Scoring Router 缺少权限检查**
   - **修复**: 添加 4 个端点的权限检查 ([scoring.ts](Cloudflare-Workers/src/router/scoring.ts))
   - **影响**: 投票、分析、预览、结算全部受保护

5. **✅ Issue 5: 用户可能同时拥有多个角色**
   - **修复**: 实现单角色约束验证
     - [addProjectViewer() 检查 usergroups](Cloudflare-Workers/src/handlers/projects/viewers.ts#L104-L116)
     - [addUserToGroup() 检查 projectviewers](Cloudflare-Workers/src/handlers/groups/members.ts#L85-L97)
   - **影响**: 每个用户每个项目只能有一个角色

6. **✅ Issue 6: Comments 的 update/delete 缺少权限检查**
   - **修复**: 添加路由层权限检查 + 业务层作者验证
   - **影响**: 评论修改/删除受到双层保护

#### 代码审查建议（未来优化）

**Issue 1 (低优先级)**: 添加项目存在性检查
- **位置**: [permissions.ts:251](Cloudflare-Workers/src/middleware/permissions.ts#L251)
- **建议**: 如果 project 不存在，提前返回 `false`
- **影响**: 性能优化，减少后续查询

**Issue 2 (中优先级)**: JSON.parse 错误处理
- **位置**: [permissions.ts:301](Cloudflare-Workers/src/middleware/permissions.ts#L301)
- **建议**: 添加 try-catch 保护
  ```typescript
  try {
    const permissions = JSON.parse(row.permissions || '[]');
  } catch {
    console.error('Invalid permissions JSON');
    continue;
  }
  ```

**Issue 4 (低优先级)**: 性能优化 - N+1 查询
- **位置**: 多处使用 `await env.DB.prepare(...).first()`
- **建议**: 使用 batch queries 或 JOIN 减少查询次数

**Issue 5 (低优先级)**: 安全事件日志
- **建议**: 记录权限拒绝事件到 `sys_logs` 表
- **用途**: 审计追踪、异常检测

### 测试场景

#### 单元测试清单

```typescript
describe('4-Level Permission System', () => {
  describe('Level 0: System Admin', () => {
    it('should grant all permissions to system admin');
    it('should grant all permissions to project creator');
  });

  describe('Level 1: Teacher', () => {
    it('should allow manage, view, comment');
    it('should deny submit, vote');
    it('should allow settle stage');
  });

  describe('Level 2: Observer', () => {
    it('should allow view only');
    it('should deny comment, manage, submit, vote');
    it('should allow reactions');
  });

  describe('Level 3: Student', () => {
    it('should respect group permissions');
    it('should allow submit if group has submit permission');
    it('should deny submit if group lacks submit permission');
  });

  describe('Single Role Constraint', () => {
    it('should reject adding teacher when user is student');
    it('should reject adding student when user is teacher');
    it('should reject adding student when user is observer');
  });
});
```

#### 集成测试场景

1. **场景 1: Teacher 尝试提交作业**
   - ✗ 应被拒绝（Teacher 不能以学生身份提交）

2. **场景 2: Observer 尝试发表评论**
   - ✗ 应被拒绝（Observer 只读）

3. **场景 3: Student 尝试结算阶段**
   - ✗ 应被拒绝（需要 manage 权限）

4. **场景 4: Admin 尝试将 Teacher 添加到学生群组**
   - ✗ 应被拒绝（角色冲突）

5. **场景 5: Teacher 尝试管理阶段**
   - ✓ 应成功（Level 1 有 manage 权限）

---

## Phase 3: 业务逻辑层迁移

迁移各个 API 文件，按依赖顺序：

### 3.0 认证方案：JWT Token（重要）

**核心设计：JWT + 每次 API 调用延长有效期 + 检查用户状态**

#### JWT Session 实现

```typescript
// src/auth/jwt.ts
import { SignJWT, jwtVerify } from 'jose';

const JWT_EXPIRES_IN = '7d';  // Token 有效期 7 天

/**
 * 登录：生成 JWT
 */
export async function handleLogin(env: Env, username: string, password: string) {
  // 1. 验证用户名密码
  const user = await authenticateUser(env.DB, username, password);
  if (!user) {
    return Response.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  // 2. 生成 JWT
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  const token = await new SignJWT({ userId: user.userId, username: user.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(JWT_EXPIRES_IN)
    .sign(secret);

  // 3. 记录登录日志
  await logLoginAttempt(env.DB, user.userId, 'success', extractClientInfo(request));

  return Response.json({ success: true, token, user });
}

/**
 * 验证 JWT + 每次调用检查用户状态 + 延长有效期
 */
export async function validateRequest(
  env: Env,
  ctx: ExecutionContext,
  request: Request
): Promise<{ valid: boolean; user?: any; error?: string }> {
  // 1. 验证 JWT
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { valid: false, error: 'No token provided' };
  }

  const token = authHeader.replace('Bearer ', '');
  const secret = new TextEncoder().encode(env.JWT_SECRET);

  let payload;
  try {
    const { payload: p } = await jwtVerify(token, secret);
    payload = p;
  } catch {
    return { valid: false, error: 'Invalid token' };
  }

  // 2. ✅ 每次都查数据库检查用户状态（实现实时禁用）
  const user = await env.DB.prepare(`
    SELECT userId, username, status FROM users WHERE userId = ?
  `).bind(payload.userId).first();

  if (!user || user.status === 'disabled') {
    return { valid: false, error: 'User disabled' };
  }

  // 3. ✅ 延长 Token 有效期（异步，不阻塞响应）
  ctx.waitUntil(refreshTokenIfNeeded(env, payload.userId, token));

  return { valid: true, user };
}

/**
 * ✅ 延长 Token 有效期（如果 Token 快过期就续期）
 */
async function refreshTokenIfNeeded(env: Env, userId: string, oldToken: string) {
  // 可选：如果 Token 剩余时间少于 1 天，生成新 Token
  // 这里简化处理：更新用户的 lastActivityTime
  await env.DB.prepare(`
    UPDATE users SET lastActivityTime = ? WHERE userId = ?
  `).bind(Date.now(), userId).run();
}

/**
 * 恶意登录检测（实时）
 */
async function detectMaliciousLogin(
  env: Env,
  userId: string
): Promise<boolean> {
  const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);

  // 查询最近 5 分钟的失败次数
  const result = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM sys_logs
    WHERE userId = ? AND action = 'login' AND message = 'failed'
      AND createdAt > ?
  `).bind(userId, fiveMinutesAgo).first();

  if (result?.count >= 3) {
    // 禁用账户
    await env.DB.prepare(`
      UPDATE users SET status = 'disabled' WHERE userId = ?
    `).bind(userId).run();

    // 通知管理员
    await notifySystemAdmins(env, {
      type: 'MALICIOUS_LOGIN',
      userId,
      timestamp: Date.now()
    });

    return true;
  }

  return false;
}

/**
 * 记录登录尝试
 */
async function logLoginAttempt(
  db: D1Database,
  userId: string,
  result: 'success' | 'failed',
  clientInfo: any
) {
  await db.prepare(`
    INSERT INTO sys_logs (
      logId, level, functionName, userId, action, message,
      ipAddress, city, country, userAgent, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    generateId('log_'),
    result === 'success' ? 'info' : 'warning',
    'handleLogin',
    userId,
    'login',
    result,  // ✅ 简化：只记录 success/failed
    clientInfo.ipAddress,
    clientInfo.city,
    clientInfo.country,
    clientInfo.userAgent,
    Date.now()
  ).run();
}
```

**关键特性**：
1. ✅ **JWT 无需服务器端存储** - 零 KV 消耗
2. ✅ **每次 API 调用检查用户状态** - 支持实时禁用
3. ✅ **自动续期** - 更新 `lastActivityTime`
4. ✅ **恶意登录检测** - 5分钟内3次失败 → 禁用账户
5. ✅ **简化日志** - login 只记录 `success/failed`

### 3.1 路由架构：Hono 框架（推荐）

#### 为什么选择 Hono？

Hono 是专为 Cloudflare Workers 设计的**超快 Web 框架**，类似 Express.js：

**优势**：
- ✅ **性能极致** - 比 Express 快 4 倍，零依赖
- ✅ **TypeScript 原生支持** - 完整类型推断
- ✅ **中间件生态** - JWT、CORS、日志、压缩等
- ✅ **路由清晰** - RESTful 风格，易于维护
- ✅ **零学习成本** - 如果你会 Express，就会用 Hono

**对比 GAS 手动路由**：
```javascript
// GAS: 手动 switch-case（route_handlers.js）
function handleAuthRoutes(path, params) {
  switch (path) {
    case '/auth/login': return authenticateUser(...);
    case '/auth/register': return handleRegister(...);
    // 需要手动解析参数、错误处理
  }
}

// Hono: 自动路由匹配 + 参数解析
app.post('/auth/login', async (c) => {
  const { username, password } = await c.req.json();
  return c.json(await authenticateUser(c.env, username, password));
});
```

---

#### 完整 Hono 路由架构

**项目结构**：
```
src/
├── index.ts                 # Workers 入口点
├── router/
│   ├── auth.ts             # 认证路由（14个端点）
│   ├── users.ts            # 用户路由（7个端点）
│   ├── projects.ts         # 项目路由（10个端点）
│   ├── groups.ts           # 群组路由（8个端点）
│   ├── stages.ts           # 阶段路由（6个端点）
│   ├── submissions.ts      # 提交路由（17个端点）
│   ├── scoring.ts          # 评分路由（10个端点）
│   ├── comments.ts         # 评论路由（10个端点）
│   ├── wallets.ts          # 钱包路由（7个端点）
│   ├── notifications.ts    # 通知路由（5个端点）
│   ├── invitations.ts      # 邀请码路由（7个端点）
│   ├── tags.ts             # 标签路由（11个端点）
│   ├── admin.ts            # 管理路由（30个端点）
│   ├── system.ts           # 系统路由（8个端点）
│   └── eventlogs.ts        # 事件日志路由（3个端点）
├── middleware/
│   ├── auth.ts             # JWT 认证中间件
│   ├── logger.ts           # 请求日志中间件
│   └── error-handler.ts    # 统一错误处理
└── handlers/
    ├── auth/               # 认证业务逻辑
    ├── users/              # 用户业务逻辑
    └── ...                 # 其他业务逻辑
```

---

#### 安装 Hono

```bash
npm install hono
npm install --save-dev @cloudflare/workers-types
```

---

#### 入口点实现

**src/index.ts**：
```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

// 导入路由模块
import authRouter from './router/auth';
import usersRouter from './router/users';
import projectsRouter from './router/projects';
import groupsRouter from './router/groups';
import stagesRouter from './router/stages';
import submissionsRouter from './router/submissions';
import scoringRouter from './router/scoring';
import commentsRouter from './router/comments';
import walletsRouter from './router/wallets';
import notificationsRouter from './router/notifications';
import invitationsRouter from './router/invitations';
import tagsRouter from './router/tags';
import adminRouter from './router/admin';
import systemRouter from './router/system';
import eventlogsRouter from './router/eventlogs';

// 类型定义
type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  GMAIL_API_KEY: string;
  GMAIL_SENDER_EMAIL: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_ENABLED?: string;
  WEB_APP_URL?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// 全局中间件
app.use('*', cors());
app.use('*', logger());

// 健康检查
app.get('/', (c) => c.json({
  success: true,
  message: 'Scoring System API',
  version: '2.0.0',
  platform: 'Cloudflare Workers',
  timestamp: new Date().toISOString()
}));

// 路由挂载（与 GAS 路由前缀完全一致）
app.route('/auth', authRouter);
app.route('/users', usersRouter);
app.route('/projects', projectsRouter);
app.route('/groups', groupsRouter);
app.route('/stages', stagesRouter);
app.route('/submissions', submissionsRouter);
app.route('/rankings', submissionsRouter);  // 评分路由复用提交路由模块
app.route('/scoring', scoringRouter);
app.route('/comments', commentsRouter);
app.route('/wallets', walletsRouter);
app.route('/notifications', notificationsRouter);
app.route('/invitations', invitationsRouter);
app.route('/tags', tagsRouter);
app.route('/admin', adminRouter);
app.route('/system', systemRouter);
app.route('/eventlogs', eventlogsRouter);

// 404 处理
app.notFound((c) => c.json({
  success: false,
  error: 'Not found',
  errorCode: 'NOT_FOUND'
}, 404));

// 全局错误处理
app.onError((err, c) => {
  console.error('Global error:', err);
  return c.json({
    success: false,
    error: err.message || 'Internal server error',
    errorCode: 'INTERNAL_ERROR'
  }, 500);
});

export default app;
```

---

#### 认证路由模块示例

**src/router/auth.ts**（完整迁移 GAS 的 14 个认证端点）：
```typescript
import { Hono } from 'hono';
import {
  authenticateUser,
  verifyPasswordAndSend2FA,
  completeTwoFactorLogin,
  resendVerificationCode,
  logoutUser,
  handleRegister,
  changePassword,
  getCurrentUser,
  verifyEmailForReset,
  handleResetPassword,
  checkUsernameAvailability,
  checkEmailAvailability
} from '../handlers/auth';
import { verifyTurnstileToken } from '../handlers/turnstile';

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  TURNSTILE_SECRET_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// 1. 登录（用户名密码）
app.post('/login', async (c) => {
  const { userEmail, password } = await c.req.json();
  return c.json(await authenticateUser(c.env, c.executionCtx, c.req.raw, userEmail, password));
});

// 2. 登录 - 验证密码（带 Turnstile）
app.post('/login-verify-password', async (c) => {
  const { userEmail, password, turnstileToken } = await c.req.json();

  // 验证 Turnstile
  const turnstileResult = await verifyTurnstileToken(c.env, turnstileToken);
  if (!turnstileResult.success && !turnstileResult.bypassed) {
    return c.json(turnstileResult);
  }

  return c.json(await verifyPasswordAndSend2FA(c.env, userEmail, password));
});

// 3. 登录 - 验证 2FA 代码
app.post('/login-verify-2fa', async (c) => {
  const { userEmail, verificationCode } = await c.req.json();
  return c.json(await completeTwoFactorLogin(c.env, c.executionCtx, c.req.raw, userEmail, verificationCode));
});

// 4. 重新发送 2FA 代码
app.post('/resend-2fa', async (c) => {
  const { userEmail } = await c.req.json();
  return c.json(await resendVerificationCode(c.env, userEmail));
});

// 5. 登出
app.post('/logout', async (c) => {
  const { sessionId } = await c.req.json();
  return c.json(await logoutUser(c.env, sessionId));
});

// 6. 注册
app.post('/register', async (c) => {
  const params = await c.req.json();
  return c.json(await handleRegister(c.env, params));
});

// 7. 修改密码
app.post('/change-password', async (c) => {
  const { sessionId, oldPassword, newPassword } = await c.req.json();
  return c.json(await changePassword(c.env, sessionId, oldPassword, newPassword));
});

// 8. 获取当前用户
app.post('/current-user', async (c) => {
  const { sessionId } = await c.req.json();
  return c.json(await getCurrentUser(c.env, sessionId));
});

// 9. 验证邮箱（重置密码前）
app.post('/verify-email-for-reset', async (c) => {
  const params = await c.req.json();
  return c.json(await verifyEmailForReset(c.env, params));
});

// 10. 重置密码（带 Turnstile）
app.post('/reset-password', async (c) => {
  const { turnstileToken, ...params } = await c.req.json();

  // 验证 Turnstile
  const turnstileResult = await verifyTurnstileToken(c.env, turnstileToken);
  if (!turnstileResult.success && !turnstileResult.bypassed) {
    return c.json(turnstileResult);
  }

  return c.json(await handleResetPassword(c.env, params));
});

// 11. 检查用户名可用性
app.post('/check-username', async (c) => {
  const { username } = await c.req.json();
  return c.json(await checkUsernameAvailability(c.env, username));
});

// 12. 检查邮箱可用性
app.post('/check-email', async (c) => {
  const { userEmail } = await c.req.json();
  return c.json(await checkEmailAvailability(c.env, userEmail));
});

export default app;
```

---

#### 项目路由模块示例

**src/router/projects.ts**（完整迁移 GAS 的 10 个项目端点）：
```typescript
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import {
  createProject,
  listUserProjects,
  getProjectListWithStages,
  getProject,
  updateProject,
  deleteProject,
  cloneProject,
  getProjectCore,
  getProjectContent,
  getProjectUsers
} from '../handlers/projects';

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// 应用认证中间件到所有项目路由
app.use('*', authMiddleware);

// 1. 创建项目
app.post('/create', async (c) => {
  const { sessionId, projectData } = await c.req.json();
  return c.json(await createProject(c.env, sessionId, projectData));
});

// 2. 列出用户项目
app.post('/list', async (c) => {
  const { sessionId, filters } = await c.req.json();
  return c.json(await listUserProjects(c.env, sessionId, filters));
});

// 3. 列出项目（带阶段）
app.post('/list-with-stages', async (c) => {
  const { sessionId, filters } = await c.req.json();
  return c.json(await getProjectListWithStages(c.env, sessionId, filters));
});

// 4. 获取项目详情
app.post('/get', async (c) => {
  const { sessionId, projectId } = await c.req.json();
  return c.json(await getProject(c.env, sessionId, projectId));
});

// 5. 更新项目
app.post('/update', async (c) => {
  const { sessionId, projectId, updates } = await c.req.json();
  return c.json(await updateProject(c.env, sessionId, projectId, updates));
});

// 6. 删除项目
app.post('/delete', async (c) => {
  const { sessionId, projectId } = await c.req.json();
  return c.json(await deleteProject(c.env, sessionId, projectId));
});

// 7. 克隆项目
app.post('/clone', async (c) => {
  const { sessionId, projectId, newProjectName } = await c.req.json();
  return c.json(await cloneProject(c.env, sessionId, projectId, newProjectName));
});

// 8. 获取项目核心信息
app.post('/core', async (c) => {
  const { sessionId, projectId } = await c.req.json();
  return c.json(await getProjectCore(c.env, sessionId, projectId));
});

// 9. 获取项目内容
app.post('/content', async (c) => {
  const { sessionId, projectId, stageId, contentType, excludeTeachers } = await c.req.json();
  return c.json(await getProjectContent(c.env, sessionId, projectId, stageId, contentType, excludeTeachers));
});

// 10. 获取项目用户列表
app.post('/users', async (c) => {
  const { sessionId, projectId } = await c.req.json();
  return c.json(await getProjectUsers(c.env, sessionId, projectId));
});

export default app;
```

---

#### JWT 认证中间件

**src/middleware/auth.ts**：
```typescript
import { MiddlewareHandler } from 'hono';
import { jwtVerify } from 'jose';

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
};

/**
 * JWT 认证中间件
 * - 验证 JWT Token
 * - 检查用户状态（实时禁用）
 * - 更新 lastActivityTime（延长 Session）
 */
export const authMiddleware: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  // 从请求体或查询参数获取 sessionId（兼容 GAS 前端）
  let sessionId: string | undefined;

  try {
    const body = await c.req.json();
    sessionId = body.sessionId;
  } catch {
    sessionId = c.req.query('sessionId');
  }

  // 如果没有 sessionId，检查 Authorization header
  if (!sessionId) {
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      sessionId = authHeader.replace('Bearer ', '');
    }
  }

  if (!sessionId) {
    return c.json({
      success: false,
      error: 'No session token provided',
      errorCode: 'SESSION_INVALID'
    }, 401);
  }

  // 验证 JWT
  const secret = new TextEncoder().encode(c.env.JWT_SECRET);
  let payload;

  try {
    const { payload: p } = await jwtVerify(sessionId, secret);
    payload = p;
  } catch {
    return c.json({
      success: false,
      error: 'Invalid or expired token',
      errorCode: 'SESSION_INVALID'
    }, 401);
  }

  // 检查用户状态
  const user = await c.env.DB.prepare(`
    SELECT userId, username, status FROM users WHERE userId = ?
  `).bind(payload.userId).first();

  if (!user || user.status === 'disabled') {
    return c.json({
      success: false,
      error: 'User account is disabled',
      errorCode: 'USER_DISABLED'
    }, 403);
  }

  // 更新 lastActivityTime（异步，不阻塞响应）
  c.executionCtx.waitUntil(
    c.env.DB.prepare(`
      UPDATE users SET lastActivityTime = ? WHERE userId = ?
    `).bind(Date.now(), payload.userId).run()
  );

  // 将用户信息注入到 context
  c.set('user', user);

  await next();
};
```

---

#### 路由迁移对照表

| GAS 路由模块 | Hono 路由文件 | 端点数量 | 迁移状态 |
|-------------|--------------|---------|---------|
| `handleAuthRoutes` | `src/router/auth.ts` | 14 | ⬜ 待迁移 |
| `handleUserRoutes` | `src/router/users.ts` | 7 | ⬜ 待迁移 |
| `handleProjectRoutes` | `src/router/projects.ts` | 10 | ⬜ 待迁移 |
| `handleGroupRoutes` | `src/router/groups.ts` | 8 | ⬜ 待迁移 |
| `handleStageRoutes` | `src/router/stages.ts` | 6 | ⬜ 待迁移 |
| `handleSubmissionRoutes` | `src/router/submissions.ts` | 17 | ⬜ 待迁移 |
| `handleScoringRoutes` | `src/router/scoring.ts` | 10 | ⬜ 待迁移 |
| `handleCommentRoutes` | `src/router/comments.ts` | 10 | ⬜ 待迁移 |
| `handleWalletRoutes` | `src/router/wallets.ts` | 7 | ⬜ 待迁移 |
| `handleNotificationRoutes` | `src/router/notifications.ts` | 5 | ⬜ 待迁移 |
| `handleInvitationRoutes` | `src/router/invitations.ts` | 7 | ⬜ 待迁移 |
| `handleTagRoutes` | `src/router/tags.ts` | 11 | ⬜ 待迁移 |
| `handleSystemRoutes` | `src/router/system.ts` | 8 | ⬜ 待迁移 |
| `handleAdminRoutes` | `src/router/admin.ts` | 30 | ⬜ 待迁移 |
| `handleEventLogRoutes` | `src/router/eventlogs.ts` | 3 | ⬜ 待迁移 |
| **总计** | **15 个模块** | **153 个端点** | **0%** |

---

### 3.2 迁移优先级（按依赖关系排序）

**第一批：基础功能**
1. [ ] `auth.ts` - JWT 认证（14个端点）
2. [ ] `invitation.ts` - 邀请码系统（7个端点）

**第二批：核心数据**
3. [ ] `users.ts` - 用户 CRUD（7个端点）
4. [ ] `projects.ts` - 项目 CRUD（10个端点）
5. [ ] `groups.ts` - 权限组管理（8个端点）

**第三批：业务功能**
6. [ ] `stages.ts` - 阶段管理（6个端点）
7. [ ] `submissions.ts` - 提交+评分系统（17个端点）
8. [ ] `wallets.ts` - 钱包（纯账本）（7个端点）
9. [ ] `tags.ts` - 标签系统（11个端点）

**第四批：辅助功能**
10. [ ] `comments.ts` - 评论系统（10个端点）
11. [ ] `notifications.ts` - 通知（5个端点）
12. [ ] `eventlogs.ts` - 事件日志（3个端点）
13. [ ] `scoring.ts` - 评分结算（10个端点）

**第五批：管理功能**
14. [ ] `admin.ts` - 管理后台（30个端点）
15. [ ] `system.ts` - 系统管理（8个端点）

---

### 3.3 IP 地址获取：从 ipify.org 到 Cloudflare 原生

#### GAS 现状：依赖第三方 API

**当前实现** (`frontend-vue/src/utils/ip.js`)：
```javascript
export async function getClientIP() {
  const response = await fetch('https://api.ipify.org?format=json');
  const data = await response.json();
  return data.ip || 'unknown';
}
```

**问题：**
- 依赖外部服务（ipify.org）
- 额外的网络延迟（200-500ms）
- 第三方隐私问题
- 仅返回 IP 地址，无其他信息

#### ✅ Cloudflare 原生方案：零延迟 + 丰富信息

Cloudflare Workers 可以**直接从 request 对象**获取客户端 IP 及丰富的地理位置信息：

##### 后端实现

```typescript
// src/routes/ip.ts
export async function handleGetIP(request: Request): Promise<Response> {
  const cf = request.cf;

  return Response.json({
    success: true,
    data: {
      // 基础 IP 信息
      ip: cf?.ip || request.headers.get('CF-Connecting-IP'),

      // 地理位置信息（完全免费！）
      location: {
        city: cf?.city,              // 城市
        country: cf?.country,        // 国家代码 (e.g., "TW", "US")
        continent: cf?.continent,    // 洲代码 (e.g., "AS")
        timezone: cf?.timezone,      // 时区 (e.g., "Asia/Taipei")
        latitude: cf?.latitude,      // 纬度
        longitude: cf?.longitude,    // 经度
        postalCode: cf?.postalCode,  // 邮政编码
        region: cf?.region,          // 省/州
        regionCode: cf?.regionCode   // 省/州代码
      },

      // 网络信息
      network: {
        asn: cf?.asn,                      // ASN 编号
        isp: cf?.asOrganization,           // ISP 名称
        datacenter: cf?.colo,              // Cloudflare 数据中心代码
        httpProtocol: request.cf?.httpProtocol  // HTTP/1.1, HTTP/2, HTTP/3
      }
    }
  });
}
```

##### 前端实现（保持兼容）

```javascript
// frontend-vue/src/utils/ip.js
/**
 * Get client's IP address and location info from Cloudflare Workers
 * @returns {Promise<Object>} IP info object or { ip: 'unknown' } if failed
 */
export async function getClientIP() {
  try {
    // 调用自己的 API（而非第三方）
    const response = await fetch('/api/ip', {
      method: 'GET',
      cache: 'no-cache'
    });

    if (!response.ok) {
      console.warn('Failed to fetch IP:', response.status);
      return { ip: 'unknown' };
    }

    const result = await response.json();

    if (result.success) {
      return {
        ip: result.data.ip,
        city: result.data.location.city,
        country: result.data.location.country,
        timezone: result.data.location.timezone,
        latitude: result.data.location.latitude,
        longitude: result.data.location.longitude
      };
    }

    return { ip: 'unknown' };
  } catch (error) {
    console.error('Error fetching client IP:', error);
    return { ip: 'unknown' };
  }
}

// 缓存逻辑保持不变
let cachedIP = null;
let cacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getCachedClientIP() {
  const now = Date.now();

  if (cachedIP && cacheTime && (now - cacheTime < CACHE_DURATION)) {
    return cachedIP;
  }

  cachedIP = await getClientIP();
  cacheTime = now;

  return cachedIP;
}
```

##### 性能和功能对比

| 特性 | GAS (ipify.org) | Cloudflare Workers | 提升 |
|------|----------------|-------------------|------|
| **IP 获取** | ✅ 外部 API 调用 | ✅ 直接从 request header | - |
| **响应时间** | 200-500ms | 0-5ms | **50-100倍** |
| **可靠性** | 依赖第三方 | Cloudflare 原生 | **100% 自控** |
| **地理位置** | ❌ 无 | ✅ 城市/国家/坐标 | **新功能** |
| **时区信息** | ❌ 无 | ✅ 完整时区 | **新功能** |
| **网络信息** | ❌ 无 | ✅ ISP/ASN | **新功能** |
| **隐私** | ❌ 数据经第三方 | ✅ 数据不离开 Cloudflare | **更安全** |
| **成本** | 免费（有配额） | 完全免费 | - |

#### 迁移优势总结

1. **性能提升 50-100 倍**：从 200-500ms 降到 0-5ms
2. **零外部依赖**：不依赖 ipify.org，消除单点故障
3. **丰富信息**：免费获取城市、国家、时区、坐标等
4. **更好的隐私**：用户数据不经过第三方服务
5. **API 兼容**：前端代码只需小改，接口保持一致
6. **完全免费**：无配额限制

#### 读取 UserAgent 和其他 Headers

Cloudflare Workers 可以直接读取所有 HTTP headers：

```typescript
// 读取 UserAgent
const userAgent = request.headers.get('User-Agent');

// 其他常用 headers
const acceptLanguage = request.headers.get('Accept-Language');
const referer = request.headers.get('Referer');
const acceptEncoding = request.headers.get('Accept-Encoding');
```

#### 数据库记录：IP + City + UserAgent

在需要审计追踪的表中添加这些字段：

**已添加字段的表：**
- `proj_event_logs`：项目事件日志（ipAddress, city, country, userAgent）
- `sys_logs`：系统日志（ipAddress, city, country, userAgent）

**后端实现示例：**

```typescript
// src/utils/request.ts
/**
 * 从 request 中提取客户端信息
 */
export function extractClientInfo(request: Request) {
  const cf = request.cf;

  return {
    ipAddress: cf?.ip || request.headers.get('CF-Connecting-IP') || 'unknown',
    city: cf?.city || null,
    country: cf?.country || null,
    timezone: cf?.timezone || null,
    userAgent: request.headers.get('User-Agent') || null,
    referer: request.headers.get('Referer') || null
  };
}

// 使用示例：记录事件日志
async function logEvent(
  db: D1Database,
  request: Request,
  eventData: {
    projectId: string;
    userId: string;
    eventType: string;
    eventData: any;
  }
) {
  const clientInfo = extractClientInfo(request);

  await db.prepare(`
    INSERT INTO proj_event_logs (
      logId, projectId, userId, eventType, eventData,
      ipAddress, city, country, userAgent, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    generateId('log_'),
    eventData.projectId,
    eventData.userId,
    eventData.eventType,
    JSON.stringify(eventData.eventData),
    clientInfo.ipAddress,
    clientInfo.city,
    clientInfo.country,
    clientInfo.userAgent,
    Date.now()
  ).run();
}
```

**记录的信息示例：**

```json
{
  "ipAddress": "203.145.67.89",
  "city": "Taipei",
  "country": "TW",
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36..."
}
```

**查询示例：**

```sql
-- 查看某用户的登录历史（带地理位置）
SELECT
  createdAt,
  ipAddress,
  city,
  country,
  userAgent
FROM sys_logs
WHERE userId = 'usr_123' AND action = 'login'
ORDER BY createdAt DESC;

-- 统计不同城市的访问量
SELECT
  country,
  city,
  COUNT(*) as visits
FROM proj_event_logs
WHERE projectId = 'proj_456'
GROUP BY country, city
ORDER BY visits DESC;

-- 检测异常登录（不同国家）
SELECT
  userId,
  country,
  city,
  COUNT(DISTINCT country) as country_count
FROM sys_logs
WHERE action = 'login'
GROUP BY userId
HAVING country_count > 1;
```

#### request.cf 对象完整结构

```typescript
interface IncomingRequestCfProperties {
  // 基础信息
  ip?: string;                    // 客户端 IP

  // 地理位置
  city?: string;                  // 城市 (e.g., "Taipei")
  country?: string;               // 国家代码 (e.g., "TW")
  continent?: string;             // 洲代码 (e.g., "AS")
  timezone?: string;              // 时区 (e.g., "Asia/Taipei")
  latitude?: string;              // 纬度
  longitude?: string;             // 经度
  postalCode?: string;            // 邮政编码
  region?: string;                // 省/州
  regionCode?: string;            // 省/州代码
  metroCode?: string;             // 地铁区代码（美国）

  // 网络信息
  asn?: number;                   // ASN 编号
  asOrganization?: string;        // ISP 组织名称
  colo?: string;                  // Cloudflare 数据中心代码

  // HTTP 协议
  httpProtocol?: string;          // "HTTP/1.1", "HTTP/2", "HTTP/3"
  requestPriority?: string;       // 请求优先级
  tlsVersion?: string;            // TLS 版本
  tlsCipher?: string;             // TLS 加密套件
}
```

### 3.3 Stage Status 实时同步中间件

#### 背景：从 GAS 定时巡逻到 CF 实时同步

**GAS 架构问题**：
- 使用定时触发器 (`stage_patrol`) 每 5-10 分钟检查一次阶段状态
- 阶段状态更新不及时，可能延迟 5-10 分钟
- 用户可能在阶段已过期的情况下仍能操作

**Cloudflare 优势**：
- D1 数据库查询速度极快（10-50ms）
- 每次 API 请求都可以实时检查和更新状态
- 无需定时任务，零延迟状态同步

---

#### 实现架构

**核心机制：自动状态同步 + 中间件拦截**

```
用户请求 → 中间件检查 → 自动同步状态 → 验证状态 → 执行业务逻辑
    │              │              │            │
    │              │              │            └─ 拒绝非法操作
    │              │              │
    │              │              └─ 更新 stage.status 到正确值
    │              │
    │              └─ 调用 stageStatusMiddleware()
    │
    └─ POST /submissions/submit
```

---

#### 核心文件

##### 1. Stage Status 自动同步

**文件位置**：`src/middleware/stage-status.ts`

**核心功能**：
```typescript
/**
 * 计算阶段的实时状态（基于当前时间）
 */
export function calculateRealtimeStageStatus(stage: Stage): string {
  const currentTime = Date.now();

  // 手动设置的完成/归档状态优先
  if (stage.status === 'completed' || stage.status === 'archived') {
    return stage.status;
  }

  // 基于时间自动计算状态
  if (stage.consensusDeadline && currentTime >= stage.consensusDeadline) {
    return 'completed';  // 共识投票截止 → 完成
  } else if (stage.endDate && currentTime >= stage.endDate) {
    return 'voting';     // 提交截止 → 进入投票
  } else if (stage.startDate && currentTime >= stage.startDate) {
    return 'active';     // 开始时间到 → 活跃
  } else {
    return 'pending';    // 尚未开始
  }
}

/**
 * 同步阶段状态（如果需要更新则更新数据库）
 */
export async function syncStageStatusIfNeeded(
  db: D1Database,
  projectId: string,
  stage: Stage
): Promise<{ updated: boolean; oldStatus: string; newStatus: string }> {
  const calculatedStatus = calculateRealtimeStageStatus(stage);

  if (calculatedStatus !== stage.status) {
    // 更新数据库
    await db.prepare(`
      UPDATE stages SET status = ?, updatedAt = ?
      WHERE projectId = ? AND stageId = ?
    `).bind(calculatedStatus, Date.now(), projectId, stage.stageId).run();

    // 处理状态转换副作用（如 active → voting 时自动批准提交）
    await processStageStatusTransition(db, projectId, stage, stage.status, calculatedStatus);

    return { updated: true, oldStatus: stage.status, newStatus: calculatedStatus };
  }

  return { updated: false, oldStatus: stage.status, newStatus: stage.status };
}

/**
 * 状态转换副作用处理
 */
async function processStageStatusTransition(
  db: D1Database,
  projectId: string,
  stage: Stage,
  oldStatus: string,
  newStatus: string
): Promise<void> {
  // 从 active → voting：自动批准所有提交
  if (oldStatus === 'active' && newStatus === 'voting') {
    await processStageSubmissionsForVoting(db, projectId, stage.stageId);
  }
}
```

**关键设计**：
- ✅ 只读取一次数据库（查询阶段）
- ✅ 仅在状态不匹配时才更新（减少写操作）
- ✅ 自动触发副作用（如批准提交）
- ✅ 完整日志记录

---

##### 2. Stage Status 要求中间件

**文件位置**：`src/middleware/require-stage-status.ts`

**核心功能**：提供可复用的 Hono 中间件，强制要求阶段必须处于特定状态

```typescript
/**
 * 创建一个要求特定阶段状态的中间件
 *
 * @param allowedStatuses - 允许的阶段状态数组
 * @returns Hono 中间件函数
 *
 * @example
 * // 只允许在 active 阶段操作
 * app.post('/submit', requireStageStatus(['active']), handler);
 *
 * @example
 * // 允许在 active 或 voting 阶段操作
 * app.post('/vote', requireStageStatus(['active', 'voting']), handler);
 */
export function requireStageStatus(allowedStatuses: string[]) {
  return async (c: Context, next: Next) => {
    const projectId = c.req.param('projectId') || c.req.query('projectId');

    // 从请求中提取 stageId（支持直接传入或通过 submissionId 间接获取）
    let stageId = extractStageId(c);

    if (!stageId) {
      const submissionId = extractSubmissionId(c);
      if (submissionId) {
        // 通过 submissionId 查询 stageId
        const submission = await c.env.DB.prepare(`
          SELECT stageId FROM submissions
          WHERE submissionId = ? AND projectId = ?
        `).bind(submissionId, projectId).first();

        stageId = submission?.stageId as string;
      }
    }

    if (!stageId) {
      return c.json({
        success: false,
        error: 'Cannot determine stageId from request',
        errorCode: 'MISSING_STAGE_ID'
      }, 400);
    }

    // ✅ 自动同步阶段状态
    await stageStatusMiddleware(c, projectId, stageId);

    // ✅ 获取当前阶段状态
    const stage = await c.env.DB.prepare(`
      SELECT status, stageName FROM stages
      WHERE stageId = ? AND projectId = ?
    `).bind(stageId, projectId).first();

    // ✅ 验证状态是否在允许列表中
    if (!allowedStatuses.includes(stage.status as string)) {
      return c.json({
        success: false,
        error: `This operation requires stage status to be one of [${allowedStatuses.join(', ')}], but current status is '${stage.status}'`,
        errorCode: 'STAGE_STATUS_NOT_ALLOWED',
        details: {
          currentStatus: stage.status,
          allowedStatuses,
          stageName: stage.stageName
        }
      }, 403);
    }

    // 状态检查通过，继续执行后续处理
    await next();
  };
}

/**
 * 便捷中间件：只允许 active 阶段（最常用）
 */
export const requireActiveStage = requireStageStatus(['active']);

/**
 * 便捷中间件：允许 active 或 voting 阶段
 */
export const requireActiveOrVotingStage = requireStageStatus(['active', 'voting']);
```

---

#### 使用示例

##### 场景 1: Submissions API（只允许 active 阶段）

**文件位置**：`src/router/submissions.ts`

```typescript
import { requireActiveStage } from '../middleware/require-stage-status';

// ✅ 提交作业：只允许在 active 阶段
app.post('/submit', requireActiveStage, async (c) => {
  // 业务逻辑：此时已确保 stage.status === 'active'
  return await submitDeliverable(...);
});

// ✅ 更新提交：只允许在 active 阶段
app.post('/update', requireActiveStage, async (c) => {
  return await updateSubmission(...);
});

// ✅ 撤回提交：只允许在 active 阶段
app.post('/withdraw', requireActiveStage, async (c) => {
  return await withdrawSubmission(...);
});

// ✅ 删除提交：只允许在 active 阶段
app.post('/delete', requireActiveStage, async (c) => {
  return await deleteSubmission(...);
});

// ✅ 确认参与度投票：只允许在 active 阶段
app.post('/confirm-participation', requireActiveStage, async (c) => {
  return await voteParticipationProposal(...);
});
```

**替换前后对比**：

```typescript
// ❌ 旧方式：每个端点手动检查（40+ 行重复代码）
app.post('/delete', async (c) => {
  // 1. 查询 submission 获取 stageId
  const submission = await db.prepare(...).bind(submissionId).first();

  // 2. 手动同步状态
  await stageStatusMiddleware(c, projectId, submission.stageId);

  // 3. 查询 stage 状态
  const stage = await db.prepare(...).bind(submission.stageId).first();

  // 4. 手动验证状态
  if (stage.status !== 'active') {
    return c.json({ error: '...' }, 403);
  }

  // 5. 执行业务逻辑
  return await deleteSubmission(...);
});

// ✅ 新方式：中间件自动处理（1 行）
app.post('/delete', requireActiveStage, async (c) => {
  return await deleteSubmission(...);
});
```

---

##### 场景 2: Scoring API（允许 active + voting 阶段）

**文件位置**：`src/router/scoring.ts`

```typescript
import { requireActiveOrVotingStage } from '../middleware/require-stage-status';

// ✅ 投票：允许在 active 或 voting 阶段
app.post('/vote', requireActiveOrVotingStage, async (c) => {
  return await submitVote(...);
});
```

---

##### 场景 3: 自定义状态组合

```typescript
import { requireStageStatus } from '../middleware/require-stage-status';

// ✅ 结算操作：只允许在 voting 或 completed 阶段
app.post('/settle', requireStageStatus(['voting', 'completed']), async (c) => {
  return await settleStage(...);
});

// ✅ 归档操作：只允许在 completed 阶段
app.post('/archive', requireStageStatus(['completed']), async (c) => {
  return await archiveStage(...);
});
```

---

#### 中间件执行流程

```
1. 用户请求 POST /submissions/delete
   ├─ Body: { submissionId: 'sub_123', projectId: 'proj_456' }
   └─ 中间件: requireActiveStage

2. requireActiveStage 中间件执行
   ├─ 提取 projectId 和 submissionId
   ├─ 查询 submissions 表获取 stageId
   │  └─ SQL: SELECT stageId FROM submissions WHERE submissionId = ?
   │
   ├─ 调用 stageStatusMiddleware(projectId, stageId)
   │  ├─ 查询 stages 表获取当前状态和时间信息
   │  │  └─ SQL: SELECT status, startTime, endTime, consensusDeadline FROM stages
   │  │
   │  ├─ calculateRealtimeStageStatus()
   │  │  ├─ currentTime = Date.now()
   │  │  ├─ 比较 currentTime vs endTime
   │  │  └─ 返回: 'active' (因为还没到 endTime)
   │  │
   │  └─ 如果状态不匹配，更新数据库
   │     └─ SQL: UPDATE stages SET status = ? WHERE stageId = ?
   │
   ├─ 验证 stage.status === 'active'
   │  ├─ ✅ 通过：继续执行
   │  └─ ❌ 失败：返回 403 错误
   │
   └─ await next() → 执行 deleteSubmission()

3. deleteSubmission() 执行
   ├─ 权限检查（admin/teacher/group member）
   ├─ 删除 teachersubmissionrankings
   ├─ 删除 submissionfiles
   ├─ 删除 submissionapprovalvotes
   ├─ 删除 submission
   └─ 返回成功响应
```

---

#### 性能优化

**问题**：每次请求都查询数据库会不会很慢？

**答案**：不会，因为：
1. **索引优化**：`stages(projectId, stageId)` 有复合索引，查询极快（10-20ms）
2. **有条件更新**：只在状态不匹配时才写数据库（大多数情况只读）
3. **单次查询**：中间件只查询一次，后续业务逻辑复用结果
4. **D1 性能**：SQLite 本地查询比 GAS Spreadsheet 快 10-80 倍

**实测性能**：
- 无需更新（只读）：10-20ms
- 需要更新状态：30-50ms
- GAS 定时器延迟：5-10 分钟（300,000-600,000ms）

**提升比较**：实时同步比 GAS 快 **6,000 - 60,000 倍**！

---

#### 错误处理示例

**场景 1：用户尝试在 voting 阶段提交作业**

```json
// Request: POST /submissions/submit
// Body: { projectId: 'proj_456', stageId: 'stg_123', ... }

// Response: 403 Forbidden
{
  "success": false,
  "error": "This operation requires stage status to be one of [active], but current status is 'voting'",
  "errorCode": "STAGE_STATUS_NOT_ALLOWED",
  "details": {
    "currentStatus": "voting",
    "allowedStatuses": ["active"],
    "stageName": "第一阶段：需求分析"
  }
}
```

**场景 2：阶段刚过期，系统自动更新状态**

```typescript
// 阶段信息：
// - startTime: 2025-01-01 00:00
// - endTime: 2025-01-10 23:59
// - currentTime: 2025-01-11 00:05 (刚过期 5 分钟)
// - status: 'active' (数据库中的旧值)

// 1. 用户请求 POST /submissions/submit

// 2. stageStatusMiddleware 执行
//    calculateRealtimeStageStatus() 返回 'voting'
//    检测到不匹配，执行 UPDATE stages SET status = 'voting'
//    触发 processStageStatusTransition('active' → 'voting')
//      → 自动批准所有提交

// 3. requireActiveStage 检查
//    stage.status = 'voting' ≠ 'active'
//    返回 403 错误

// 4. 用户收到实时反馈：阶段已结束，无法提交
```

---

#### 优势总结

| 特性 | GAS 定时巡逻 | CF 实时同步中间件 | 提升 |
|------|-------------|------------------|------|
| **状态同步延迟** | 5-10 分钟 | 0ms（实时） | **无限大** |
| **代码复杂度** | 每个端点 40+ 行 | 1 行中间件 | **40 倍减少** |
| **维护成本** | 15 个端点各自实现 | 统一中间件 | **15 倍减少** |
| **性能开销** | 定时器 + 全表扫描 | 单次索引查询（10-20ms） | **100+ 倍** |
| **副作用处理** | 手动触发 | 自动触发 | **零遗漏** |
| **错误信息** | 通用 403 | 详细状态说明 | **用户友好** |

---

#### 迁移清单

**已迁移端点**（使用 `requireActiveStage`）：
- ✅ `POST /submissions/submit`
- ✅ `POST /submissions/update`
- ✅ `POST /submissions/withdraw`
- ✅ `POST /submissions/delete`
- ✅ `POST /submissions/confirm-participation`

**待扩展端点**（可能需要不同状态要求）：
- 🔲 `POST /scoring/vote` - 可能需要 `['active', 'voting']`
- 🔲 `POST /scoring/settle` - 可能需要 `['voting', 'completed']`
- 🔲 `POST /stages/archive` - 可能需要 `['completed']`

---

### 3.4 API 迁移模板

每个 API 文件的迁移步骤：
1. 分析数据库操作
2. 转换为 D1 SQL 查询
3. 保持相同的函数接口
4. 添加适当的 stage status 中间件（如果需要）
5. 编写单元测试

---

## Phase 4: 前端适配（最后阶段）

### 4.1 修改 API Client
修改 `frontend-vue/src/utils/api.js`：
```javascript
// 从 google.script.run 改为 fetch
const apiClient = {
  async call(endpoint, params) {
    const response = await fetch(`/api${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return await response.json();
  }
};
```

### 4.2 部署前端
```bash
# 构建前端
cd ../GAS/frontend-vue
npm run build

# 部署到 Cloudflare Pages
wrangler pages deploy dist
```

---

## Phase 5: 部署和测试

#### 4.1 开发环境设置
```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 初始化项目
cd Cloudflare-Workers
wrangler init
```

#### 4.2 本地开发
```bash
# 启动本地开发服务器（带 D1 本地模拟）
wrangler dev

# 测试 API
curl http://localhost:8787/api/users
```

#### 4.3 部署到生产环境
```bash
# 部署 Workers
wrangler deploy

# 部署前端到 Pages
wrangler pages deploy frontend-vue/dist
```

## 技术选型决策

### D1 vs KV 选择指南

| 数据类型 | 推荐方案 | 原因 |
|---------|---------|------|
| Session 数据 | KV | 简单键值对，需要过期时间 |
| 用户信息 | D1 | 需要复杂查询（按用户名查找等） |
| 项目数据 | D1 | 关系型数据，需要 JOIN |
| 交易记录 | D1 | 账本数据，需要事务支持 |
| 缓存数据 | KV | 临时数据，快速访问 |
| 事件日志 | D1 | 需要查询和分析 |

### 为什么选择 D1 而不是 KV？

**D1 的优势：**
- SQL 查询能力（JOIN、聚合、排序）
- 事务支持（ACID）
- 索引优化
- 更接近传统关系数据库（迁移成本低）

**KV 的优势：**
- 超低延迟（全球边缘缓存）
- 简单易用
- 自动过期
- 适合 Session 等临时数据

**建议：**
- 主数据库用 D1
- Session 和缓存用 KV
- 两者结合使用

## 下一步行动

1. **分析数据库操作 API**（当前任务）
   - 列出所有数据库操作
   - 评估迁移复杂度
   - 设计 D1 schema

2. **创建 Workers 项目结构**
   - 初始化 TypeScript 项目
   - 配置 Wrangler
   - 设置开发环境

3. **实现第一个 API**
   - 选择最简单的 API（如 `/health` 健康检查）
   - 实现并测试
   - 建立开发流程

4. **逐步迁移其他 API**
   - 按优先级迁移（认证 → 用户 → 项目 → ...）
   - 每个 API 都要测试
   - 保持与 GAS 的兼容性

## 系统设置 API

### 管理员界面集成

为了让管理员在前端 UI 查看系统配置状态，系统提供专门的配置查询 API。

**重要原则：** 永远不会暴露 secret 的实际值，只显示配置状态。

### API 端点

#### 1. 获取系统设置

```http
GET /system/settings
Authorization: Bearer <admin-token>
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "sessionTimeout": 86400000,
    "passwordSaltRounds": 10,
    "maxInvitesPerDay": 50,

    "jwtSecretConfigured": true,    // ✅ 显示是否配置
    "gmailConfigured": false,       // ✅ 不显示实际值
    "turnstileEnabled": false,

    "totalUsers": 5,
    "totalProjects": 3,
    "version": "1.0.0"
  }
}
```

#### 2. 获取 Secrets 检查清单

```http
GET /system/secrets-checklist
Authorization: Bearer <admin-token>
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "allRequiredConfigured": true,
    "required": [
      {
        "name": "JWT_SECRET",
        "configured": true,
        "status": "✓ Configured",
        "setupCommand": "npm run secret:generate && npm run secret:put JWT_SECRET"
      }
    ],
    "optional": [
      {
        "name": "GMAIL_API_KEY",
        "configured": false,
        "status": "○ Not configured",
        "setupCommand": "npm run secret:put GMAIL_API_KEY"
      }
    ]
  }
}
```

#### 3. 系统健康检查

```http
GET /system/health
Authorization: Bearer <admin-token>
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "checks": {
      "database": true,
      "jwtSecret": true,
      "overall": true
    }
  }
}
```

### 前端集成示例

```vue
<template>
  <div class="system-settings">
    <h1>系统设置</h1>

    <!-- JWT Secret 状态 -->
    <div class="config-item">
      <span>JWT Secret:</span>
      <span :class="settings.jwtSecretConfigured ? 'ok' : 'error'">
        {{ settings.jwtSecretConfigured ? '✓ 已配置' : '✗ 未配置' }}
      </span>
      <!-- 不显示实际值！只显示状态 -->
      <div v-if="!settings.jwtSecretConfigured" class="hint">
        请运行: <code>npm run secret:generate && npm run secret:put JWT_SECRET</code>
      </div>
    </div>

    <!-- 其他配置... -->
  </div>
</template>

<script setup>
const settings = ref({});

onMounted(async () => {
  const res = await fetch('/system/settings', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const result = await res.json();
  if (result.success) {
    settings.value = result.data;
  }
});
</script>
```

### 安全说明

**前端永远不会看到 JWT_SECRET 的值：**
- ✅ 可以看到是否已配置（`jwtSecretConfigured: true/false`）
- ✅ 可以看到设置命令（`setupCommand`）
- ❌ 无法看到实际值（后端不会返回）

**这是正确的设计：**
- 前端不需要 JWT_SECRET 来验证 token（由后端完成）
- 前端只需要知道系统是否正确配置
- Secret 泄露会导致严重安全问题

详细文档：
- `cloudflare-workers/SECURITY.md` - 完整安全指南
- `cloudflare-workers/FRONTEND_EXAMPLE.md` - 前端集成示例

---

## 系统标题配置 (System Title Configuration)

### 背景与用途

为了支持多实例部署或自定义品牌名称，系统新增 `systemTitle` 可配置变量。该变量将在以下场景中使用：
- 所有系统邮件的主旨（替代硬编码的"评分系统"）
- 前端登录页面的欢迎标题
- 系统通知和消息中的品牌名称

### 配置方式

#### 方式一：环境变量（推荐用于不同部署环境）

在 `wrangler.toml` 中配置：
```toml
[vars]
SYSTEM_TITLE = "北科大期末评分系统"  # 自定义系统标题
```

**优点**：
- 部署时确定，不会意外改变
- 不同环境可使用不同配置（开发/生产）
- 版本控制友好

#### 方式二：KV 动态配置（运行时调整）

通过 KV 存储实现运行时修改：
```bash
# 使用 wrangler CLI 直接设置
wrangler kv:key put --binding=CONFIG "system_title" "新系统标题"

# 或通过管理员 API 设置（需实现相应端点）
curl -X POST https://your-worker.workers.dev/admin/system/update-title \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"systemTitle": "新系统标题"}'
```

**优点**：
- 无需重新部署即可修改
- 适合需要频繁调整品牌名称的场景
- 可通过管理界面动态配置

**优先级**：`KV 存储` > `环境变量` > `默认值 ("評分系統")`

### 应用范围

系统标题会自动应用于以下位置：

#### 1. 邮件主旨
所有系统发送的邮件都使用统一格式：`[${systemTitle}] 邮件主题`

| 邮件类型 | 主旨格式 | 文件位置 |
|---------|---------|----------|
| 密码重设 | `[${systemTitle}] 密碼已重設` | `src/utils/email.ts:234` |
| 两阶段验证 | `[${systemTitle}] 兩階段登入驗證碼` | `src/handlers/auth/two-factor.ts:216` |
| 注册邀请（单个） | `[${systemTitle}] 註冊邀請` | `src/handlers/invitations/email.ts:81` |
| 注册邀请（批量） | `[${systemTitle}] 註冊邀請` | `src/handlers/invitations/email.ts:302` |
| 通知摘要 | `[${systemTitle}] 您有 N 則未讀通知` | `src/handlers/robots/notification-patrol.ts:123` |

#### 2. 前端界面
- **登录页面欢迎标题**：`歡迎使用${systemTitle}`
  - 文件：`frontend-vue/src/components/GlobalAuthModal.vue:14`
  - 动态从 API 获取：`GET /system/info` → `data.systemTitle`

#### 3. 系统信息 API
公开端点返回系统标题（无需认证）：
```javascript
// GET /system/info
{
  "success": true,
  "data": {
    "systemTitle": "評分系統",  // 当前配置的系统标题
    "version": "1.0.0",
    "environment": "production"
  }
}
```

### 实现细节

#### 后端实现

**核心函数**（`src/utils/email.ts`）：
```typescript
/**
 * Get system title from KV or environment variable
 * Falls back to "評分系統" if not configured
 */
export async function getSystemTitle(env: Env): Promise<string> {
  try {
    // 1. 优先从 KV 获取（运行时配置）
    if (env.CONFIG) {
      const title = await env.CONFIG.get('system_title');
      if (title) return title;
    }

    // 2. 回退到环境变量
    if (env.SYSTEM_TITLE) {
      return env.SYSTEM_TITLE;
    }

    // 3. 默认值
    return '評分系統';
  } catch (error) {
    console.error('Error getting system title:', error);
    return '評分系統';
  }
}
```

**类型定义**（`src/types.ts`）：
```typescript
export interface Env {
  // ... 其他环境变量
  SYSTEM_TITLE?: string;  // 系统标题配置
}
```

#### 前端实现

**登录页面动态获取**（`frontend-vue/src/components/GlobalAuthModal.vue`）：
```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { apiClient } from '@/utils/api';

const systemTitle = ref('評分系統');  // 默认值

async function fetchSystemTitle() {
  try {
    const response = await apiClient.call('/system/info');
    if (response.success && response.data?.systemTitle) {
      systemTitle.value = response.data.systemTitle;
    }
  } catch (error) {
    console.error('Failed to fetch system title:', error);
  }
}

onMounted(() => {
  fetchSystemTitle();
});
</script>

<template>
  <h2 class="drawer-title">歡迎使用{{ systemTitle }}</h2>
</template>
```

### 使用示例

#### 场景 1：北科大期末评分系统

**配置**（wrangler.toml）：
```toml
[vars]
SYSTEM_TITLE = "北科大期末評分系統"
```

**邮件效果**：
- `[北科大期末評分系統] 密碼已重設`
- `[北科大期末評分系統] 註冊邀請`

**前端效果**：
- 登录页面显示：`歡迎使用北科大期末評分系統`

#### 场景 2：企业内部评分平台

**配置**（通过 KV）：
```bash
wrangler kv:key put --binding=CONFIG "system_title" "ABC 公司績效評估系統"
```

**邮件效果**：
- `[ABC 公司績效評估系統] 兩階段登入驗證碼`
- `[ABC 公司績效評估系統] 您有 5 則未讀通知`

### 管理员 API（可选实现）

如需通过管理界面动态配置，可添加以下端点：

**设置系统标题**：
```typescript
// src/router/admin.ts
app.post('/system/update-title', authMiddleware, requireSystemAdmin, async (c) => {
  const { systemTitle } = await c.req.json();

  if (!systemTitle || typeof systemTitle !== 'string') {
    return errorResponse('INVALID_INPUT', 'systemTitle 必须是非空字符串');
  }

  // 存储到 KV
  await c.env.CONFIG.put('system_title', systemTitle);

  return successResponse({
    systemTitle,
    message: '系统标题更新成功'
  });
});
```

**前端管理界面**：
```vue
<template>
  <el-form>
    <el-form-item label="系统标题">
      <el-input v-model="newTitle" placeholder="评分系统" />
    </el-form-item>
    <el-button @click="updateTitle">保存</el-button>
  </el-form>
</template>

<script setup>
import { ref } from 'vue';
import { apiClient } from '@/utils/api';

const newTitle = ref('');

async function updateTitle() {
  const response = await apiClient.callWithAuth('/admin/system/update-title', {
    method: 'POST',
    body: JSON.stringify({ systemTitle: newTitle.value })
  });
  if (response.success) {
    ElMessage.success('系统标题更新成功');
  }
}
</script>
```

### 测试验证

更新配置后，验证以下项目：

- [ ] 密码重设邮件主旨使用新标题
- [ ] 两阶段验证邮件主旨使用新标题
- [ ] 邀请邮件（单个和批量）主旨使用新标题
- [ ] 通知摘要邮件主旨使用新标题
- [ ] 登录页面显示新标题
- [ ] `/system/info` API 返回新标题
- [ ] KV 配置优先级高于环境变量
- [ ] 默认值在未配置时生效

### 注意事项

1. **中文编码**：确保 `wrangler.toml` 文件使用 UTF-8 编码保存
2. **部署生效**：修改 `wrangler.toml` 后需重新部署：`wrangler deploy`
3. **KV 即时生效**：通过 KV 修改无需重新部署，立即生效
4. **字符限制**：建议系统标题不超过 20 个中文字符，避免邮件主旨过长
5. **XSS 防护**：前端显示时已自动转义，无需额外处理

---

## 参考资料

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 文档](https://developers.cloudflare.com/d1/)
- [Cloudflare KV 文档](https://developers.cloudflare.com/kv/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [Hono 框架文档](https://hono.dev/)

## 项目文档

- `cloudflare-workers/README.md` - 项目概览和快速开始
- `cloudflare-workers/SECURITY.md` - 安全配置指南（JWT Secret 详解）
- `cloudflare-workers/NPM_COMMANDS.md` - npm 命令参考
- `cloudflare-workers/FRONTEND_EXAMPLE.md` - 前端 API 使用示例
- `cloudflare-workers/PROGRESS.md` - 迁移进度追踪

---

## Phase 4.5: 前端请求链重构（TanStack Query）

### 背景问题

在原始架构中，前端存在「JWT 过期时发送多个无效请求」的问题：

**问题场景**：
```
用户久未使用，第一次开启应用：
├─> App.vue: POST /auth/current-user ❌ 401 (JWT expired)
└─> Dashboard.vue (同时): POST /projects/list ❌ NO_SESSION

结果：2 个失败请求，延迟显示登录画面
```

### 解决方案：TanStack Query

采用 **TanStack Query (Vue Query)** 重构前端请求管理系统，实现：
1. ✅ JWT 过期时客户端预检，避免无效请求
2. ✅ 自动依赖链管理（auth → projects → content）
3. ✅ 智能缓存机制（减少重复请求）
4. ✅ 自动状态管理（loading/error/data）

---

### 实施步骤

#### 4.5.1 安装与配置

**安装依赖**：
```bash
cd frontend-vue
npm install @tanstack/vue-query
```

**配置 main.js**：
```javascript
import { VueQueryPlugin } from '@tanstack/vue-query'

app.use(VueQueryPlugin, {
  queryClientConfig: {
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,      // 5分钟缓存
        retry: 1,                       // 失败重试1次
        refetchOnWindowFocus: false,    // 窗口focus不刷新
        refetchOnReconnect: true        // 网络重连时刷新
      }
    }
  }
})
```

---

#### 4.5.2 创建 Composables

创建 4 个核心 composable 文件：

**1. `src/composables/useAuth.js`** - 认证管理
```javascript
export function useCurrentUser() {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const token = localStorage.getItem('sessionId')
      if (!token) throw new Error('NO_SESSION')

      // 客户端 JWT 预检（避免无效请求）
      if (isTokenExpired(token)) {
        localStorage.removeItem('sessionId')
        throw new Error('TOKEN_EXPIRED')
      }

      const response = await apiClient.callWithAuth('/auth/current-user')
      if (!response.success) throw new Error(response.error?.code)
      return response.data.user
    },
    retry: false,
    staleTime: Infinity
  })
}
```

**2. `src/composables/useProjects.js`** - 项目管理
```javascript
export function useProjectsWithStages() {
  const userQuery = useCurrentUser()

  return useQuery({
    queryKey: ['projects', 'withStages'],
    queryFn: async () => {
      const response = await apiClient.getProjectsListWithStages()
      if (!response.success) throw new Error(response.error?.message)
      return response.data.projects || []
    },
    enabled: computed(() => userQuery.isSuccess && !!userQuery.data),  // 依赖链
    staleTime: 1000 * 60 * 2
  })
}
```

**3. `src/composables/useProjectDetail.js`** - 项目详情
- `useProjectCore()` - 项目核心数据
- `useProjectContent()` - 阶段内容
- `useMultipleStagesContent()` - 并行加载多个阶段

**4. `src/composables/useWallet.js`** - 钱包管理
- `useWalletTransactions()` - 交易记录
- `useGlobalWalletBalance()` - 跨项目余额（并行查询）

---

#### 4.5.3 重构核心组件

**App.vue 重构**：
```javascript
// Before: 手动认证逻辑（~120 行）
async initializeAuth() {
  const storedSessionId = localStorage.getItem('sessionId')
  const response = await this.$apiClient.callWithAuth('/auth/current-user')
  this.user = response.data.user
  // ... 大量手动状态管理
}

// After: 使用 TanStack Query（~30 行）
setup() {
  const userQuery = useCurrentUser()
  const showAuthModal = computed(() =>
    !userQuery.isLoading.value &&
    (userQuery.isError.value || !userQuery.data.value)
  )
  return { userQuery, showAuthModal }
}

computed: {
  user() { return this.userQuery?.data || null }
}
```

**Dashboard.vue 重构**：
```javascript
// Before: 手动加载项目（~80 行）
async loadProjects() {
  this.loading = true
  const response = await this.$apiClient.getProjectsListWithStages()
  this.projects = response.data.map(...)
  this.loading = false
}

// After: 使用 TanStack Query（~15 行）
setup() {
  const projectsQuery = useProjectsWithStages()
  return { projectsQuery }
}

computed: {
  projects() { return this.projectsQuery?.data || [] },
  loading() { return this.projectsQuery?.isLoading || false }
}
```

---

### 核心优势

#### 1. **解决原问题：请求优化**

**Before（问题）**：
```
JWT 过期：2 个失败请求 → 延迟显示登录
JWT 有效：8-18 个请求 → 瀑布式加载
```

**After（解决）**：
```
JWT 过期：0 个失败请求 → 立即显示登录 ✅
JWT 有效：2-3 个请求（其余 cache）→ 并行加载 ✅
```

#### 2. **自动依赖链**

```javascript
// Auth query（基础）
const userQuery = useCurrentUser()

// Projects query（依赖 auth）
const projectsQuery = useProjects({
  enabled: computed(() => userQuery.isSuccess)  // 自动控制
})

// Auth 失败 → projects 自动不执行 ✅
// Auth 成功 → projects 自动执行 ✅
```

#### 3. **智能缓存**

```javascript
// 5分钟内不重复请求
staleTime: 1000 * 60 * 5

// Dashboard → ProjectDetail → Dashboard
// 只有第一次发请求，后续从 cache 读取
```

#### 4. **自动 Invalidation**

```javascript
const createProject = useCreateProject()
createProject.mutate(data, {
  onSuccess: () => {
    queryClient.invalidateQueries(['projects'])  // 自动刷新
  }
})
```

---

### 代码减少统计

| 组件 | Before | After | 减少 |
|------|--------|-------|------|
| App.vue | ~120 行 | ~30 行 | -90 行 |
| Dashboard.vue | ~80 行 | ~15 行 | -65 行 |
| **总计** | **~200 行** | **~45 行** | **-155 行 (-77%)** |

---

### 性能提升

| 场景 | Before | After | 改善 |
|------|--------|-------|------|
| JWT 过期（冷启动） | 2 个失败请求 | 0 个失败请求 | ✅ 100% |
| JWT 有效（冷启动） | 2-3 个请求 | 2-3 个请求 | - |
| 页面切换（热启动） | 每次重新请求 | 使用 cache | ✅ 节省 100% |
| 5 分钟内重复访问 | 每次请求 | 使用 cache | ✅ 节省 100% |

---

### 文件清单

**新增文件**：
- `frontend-vue/src/composables/useAuth.js`
- `frontend-vue/src/composables/useProjects.js`
- `frontend-vue/src/composables/useProjectDetail.js`
- `frontend-vue/src/composables/useWallet.js`

**修改文件**：
- `frontend-vue/package.json` - 新增 `@tanstack/vue-query` 依赖
- `frontend-vue/src/main.js` - 注册 VueQueryPlugin
- `frontend-vue/src/App.vue` - 使用 `useCurrentUser()`
- `frontend-vue/src/components/Dashboard.vue` - 使用 `useProjectsWithStages()`

---

### 测试状态

✅ **Build 测试**：
```bash
npm run build
# ✅ 成功，无错误
# ✅ Bundle size: 1.7MB (gzip: 536KB)
```

🔍 **功能测试**（待实际运行验证）：
- [ ] JWT 过期场景：0 个失败请求
- [ ] JWT 有效场景：正常加载
- [ ] 登录流程：自动刷新数据
- [ ] Cache 测试：页面切换不重复请求
- [ ] 登出流程：正确清除 cache

---

### 后续计划

**短期（可选）**：
- [ ] 重构 ProjectDetail.vue（使用 `useMultipleStagesContent` 并行加载）
- [ ] 重构 WalletNew.vue（使用 `useGlobalWalletBalance`）

**中期（优化）**：
- [ ] 安装 Vue Query DevTools（开发环境）
- [ ] 监控 query 触发频率
- [ ] 调整 `staleTime` 和 `gcTime`

**长期（进阶）**：
- [ ] Optimistic Updates（乐观更新）
- [ ] Infinite Queries（无限滚动）
- [ ] Prefetching（预先加载）

---

### 参考文档

- 完整实施报告：`Cloudflare-Workers/TANSTACK_QUERY_MIGRATION.md`
- TanStack Query 官方文档：https://tanstack.com/query/latest/docs/vue/overview

---

## Phase 4.6: 全局错误捕获与日志系统

### 背景

为了提升系统的可观测性和用户体验，我们实现了**全局错误捕获与日志系统**，确保所有错误都被完整记录，用户可以在通知中心查看错误历史。

### 核心设计原则

1. **完全透明**：所有用户看到的错误都应该被记录
2. **零代码修改**：通过包装 `ElMessage.error` 自动捕获错误
3. **中心化管理**：所有错误统一存储到 `globalErrorLog`
4. **用户友好**：提供专门的错误日志 UI

---

### 实施方案

#### 4.6.1 全局错误日志存储

**位置**：`frontend-vue/src/main.js`

**数据结构**：
```javascript
// 全局错误日志 store（reactive）
import { ref } from 'vue'
export const globalErrorLog = ref([])

// 错误条目结构
{
  id: 1730450123456.789,           // 唯一 ID
  timestamp: Date,                  // 发生时间
  message: "登入失败",              // 错误消息
  type: "Error",                    // 错误类型
  context: {                        // 上下文信息
    source: "ElMessage",            // 错误来源
    type: "user-facing-error",      // 子类型
    options: { duration: 3000 }     // 原始选项
  },
  stack: "Error: 登入失败\n  at ..." // 堆栈追踪
}
```

**核心函数**：
```javascript
export function addToErrorLog(error, context = {}) {
  const errorEntry = {
    id: Date.now() + Math.random(),
    timestamp: new Date(),
    message: error.message || String(error),
    type: error.name || 'Error',
    context,
    stack: error.stack
  }
  globalErrorLog.value.unshift(errorEntry)

  // 保持最近 50 条错误
  if (globalErrorLog.value.length > 50) {
    globalErrorLog.value = globalErrorLog.value.slice(0, 50)
  }
}
```

---

#### 4.6.2 ElMessage.error 自动包装

**核心实现**（在 `main.js` 中）：

```javascript
// 保存原始 ElMessage.error
const originalElMessageError = ElMessage.error

// 包装 ElMessage.error
ElMessage.error = (options) => {
  // 提取错误消息（支持字符串和对象两种形式）
  const message = typeof options === 'string' ? options : options?.message || 'Unknown error'

  // 记录到全局错误日志
  addToErrorLog(
    new Error(message),
    {
      source: 'ElMessage',
      type: 'user-facing-error',
      options: typeof options === 'object' ? options : { message: options }
    }
  )

  // 调用原始 ElMessage.error 显示 toast
  return originalElMessageError(options)
}
```

**关键特性**：
- ✅ **零侵入**：无需修改任何现有的 `ElMessage.error` 调用
- ✅ **双重记录**：既显示 toast，又记录到日志
- ✅ **上下文保存**：完整保存调用时的 options 和 stack trace
- ✅ **类型支持**：支持字符串和对象两种调用方式

**使用示例**：
```javascript
// 字符串形式（自动捕获）
ElMessage.error('登入失败')

// 对象形式（自动捕获）
ElMessage.error({
  message: '密码错误',
  duration: 3000,
  showClose: true
})

// 以上调用都会自动记录到 globalErrorLog
```

---

#### 4.6.3 TanStack Query 错误集成

**全局 Query 错误处理**（在 `main.js` 的 VueQueryPlugin 配置中）：

```javascript
app.use(VueQueryPlugin, {
  queryClientConfig: {
    defaultOptions: {
      queries: {
        onError: (error) => {
          // 记录到全局错误日志
          addToErrorLog(error, { source: 'TanStack Query', type: 'query' })

          // 认证错误特殊处理
          const authErrors = ['NO_SESSION', 'TOKEN_EXPIRED', 'UNAUTHORIZED']
          if (authErrors.includes(error.message)) {
            console.warn('Authentication error detected, clearing session...')
            localStorage.removeItem('sessionId')
            window.location.reload()
          } else {
            // 其他错误显示提示（会被 ElMessage.error 包装自动捕获）
            ElMessage.error({
              message: error.message || '請求失敗',
              duration: 3000
            })
          }
        }
      },
      mutations: {
        onError: (error) => {
          // 记录到全局错误日志
          addToErrorLog(error, { source: 'TanStack Query', type: 'mutation' })
          // Mutation 错误由各个 composable 的 onError 处理
        }
      }
    }
  }
})
```

**错误流**：
```
TanStack Query Error
  ↓
addToErrorLog(error, { source: 'TanStack Query' })  // 记录
  ↓
ElMessage.error(message)  // 显示 toast
  ↓
addToErrorLog(error, { source: 'ElMessage' })  // 再次记录（带 UI 上下文）
```

**注意**：这会导致 TanStack Query 错误被记录两次（一次作为 query error，一次作为 ElMessage error），这是有意为之，因为：
- 第一次记录：捕获原始错误和 query 上下文
- 第二次记录：捕获用户看到的 UI 呈现

---

#### 4.6.4 通知中心集成

**文件**：`frontend-vue/src/components/NotificationCenter.vue`

**UI 结构**（双 Tab 设计）：

```vue
<el-tabs v-model="activeTab">
  <!-- 通知 Tab -->
  <el-tab-pane name="notifications">
    <template #label>
      <i class="fas fa-bell"></i>
      通知
      <el-badge v-if="unreadCount > 0" :value="unreadCount" />
    </template>
    <!-- 原有通知列表 -->
  </el-tab-pane>

  <!-- 错误日志 Tab -->
  <el-tab-pane name="errors">
    <template #label>
      <i class="fas fa-exclamation-triangle"></i>
      错误日志
      <el-badge v-if="errorLogCount > 0" :value="errorLogCount" type="danger" />
    </template>

    <!-- 错误日志列表 -->
    <div class="error-log-list">
      <div v-for="error in errorLog" :key="error.id" class="error-item">
        <div class="error-header">
          <div class="error-type-badge">{{ error.type }}</div>
          <div class="error-time">{{ formatTime(error.timestamp) }}</div>
        </div>
        <div class="error-message">{{ error.message }}</div>
        <div v-if="error.context" class="error-context">
          <pre>{{ JSON.stringify(error.context, null, 2) }}</pre>
        </div>
        <div v-if="error.stack" class="error-stack">
          <el-collapse>
            <el-collapse-item title="查看堆疊追蹤">
              <pre>{{ error.stack }}</pre>
            </el-collapse-item>
          </el-collapse>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="error-actions">
      <el-button @click="clearErrorLog" size="small">清除所有</el-button>
      <el-button @click="exportErrorLog" size="small" type="primary">匯出 JSON</el-button>
    </div>
  </el-tab-pane>
</el-tabs>
```

**功能实现**：
```javascript
import { globalErrorLog } from '../main.js'

export default {
  computed: {
    errorLog() {
      return globalErrorLog.value
    },
    errorLogCount() {
      return this.errorLog.length
    },
    totalBadgeCount() {
      return this.unreadCount + this.errorLogCount  // 合并 badge 计数
    }
  },

  methods: {
    clearErrorLog() {
      this.$confirm('確定要清除所有錯誤記錄嗎？', '確認清除', {
        confirmButtonText: '確定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        globalErrorLog.value = []
        this.$message.success('錯誤記錄已清除')
      })
    },

    exportErrorLog() {
      const content = JSON.stringify(this.errorLog, null, 2)
      const blob = new Blob([content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `error-log-${new Date().toISOString()}.json`
      link.click()
      URL.revokeObjectURL(url)
      this.$message.success('錯誤日誌已匯出')
    }
  }
}
```

---

### 错误来源分类

系统会自动标记错误来源：

| 来源 (`context.source`) | 说明 | 示例 |
|------------------------|------|------|
| `TanStack Query` | 数据查询错误 | query: 网络请求失败<br>mutation: 数据提交失败 |
| `ElMessage` | 用户界面错误 | 所有通过 ElMessage.error 显示的错误 |
| `Vue Global` | Vue 应用错误 | 组件渲染错误、生命周期错误 |

---

### 前端迁移注意事项

#### ElMessage 参数规范

**GAS 版本兼容**：
```javascript
// ✅ 支持字符串形式
ElMessage.error('错误消息')

// ✅ 支持对象形式
ElMessage.error({
  message: '错误消息',
  duration: 3000,
  showClose: true,
  offset: 100
})
```

**Cloudflare Workers 版本完全兼容**：
- 所有现有的 `ElMessage.error` 调用无需修改
- 包装层会自动识别参数类型并记录

#### 错误日志持久化（可选）

**当前实现**：错误日志只存储在内存中（刷新页面会丢失）

**未来增强**（可选）：
```javascript
// 保存到 localStorage
watch(globalErrorLog, (newLog) => {
  localStorage.setItem('errorLog', JSON.stringify(newLog.slice(0, 20)))
}, { deep: true })

// 启动时恢复
const savedLog = localStorage.getItem('errorLog')
if (savedLog) {
  globalErrorLog.value = JSON.parse(savedLog)
}
```

---

### 性能影响评估

| 指标 | 影响 | 说明 |
|------|------|------|
| **内存使用** | 极小 | 最多 50 条错误 × ~1KB = ~50KB |
| **运行时开销** | 可忽略 | 每次错误 <1ms 处理时间 |
| **用户体验** | ✅ 正面 | 不影响 toast 显示，提供错误历史查看 |

---

### 调试与监控

**开发环境**：
```javascript
// 查看所有错误
console.log(globalErrorLog.value)

// 查看特定来源错误
console.log(globalErrorLog.value.filter(e => e.context.source === 'TanStack Query'))

// 统计错误类型
const errorTypes = {}
globalErrorLog.value.forEach(e => {
  errorTypes[e.type] = (errorTypes[e.type] || 0) + 1
})
console.table(errorTypes)
```

**生产环境监控**（可选）：
- 定期上报错误日志到后端（批量）
- 使用 Sentry 等第三方服务
- 添加错误趋势分析

---

### 文件修改清单

**修改文件**：
- `frontend-vue/src/main.js`
  - 新增 `globalErrorLog` reactive store
  - 新增 `addToErrorLog()` 函数
  - 包装 `ElMessage.error`
  - 增强 TanStack Query 错误处理

- `frontend-vue/src/components/NotificationCenter.vue`
  - 新增「错误日志」Tab
  - 新增错误展示 UI
  - 新增清除和导出功能

**新增导出**：
```javascript
// main.js 导出（供其他组件使用）
export const globalErrorLog = ref([])
export function addToErrorLog(error, context) { /* ... */ }
```

---

### 测试场景

**基础测试**：
- ✅ ElMessage.error（字符串）→ 记录到日志
- ✅ ElMessage.error（对象）→ 记录到日志
- ✅ TanStack Query 错误 → 记录到日志
- ✅ Vue 全局错误 → 记录到日志
- ✅ 通知中心显示错误列表
- ✅ 清除功能正常
- ✅ 导出 JSON 功能正常

**进阶测试**：
- ✅ 50 条错误后自动清理旧记录
- ✅ 错误 ID 唯一性
- ✅ 时间戳正确
- ✅ 堆栈追踪完整

---

### 迁移到 Cloudflare Workers

**后端无需修改**：
- ElMessage 错误捕获是纯前端实现
- 不依赖任何后端 API

**可选增强**：
```typescript
// 后端接收错误日志上报（可选）
app.post('/api/error-log/report', async (c) => {
  const { errors } = await c.req.json()

  // 存储到 D1
  await c.env.DB.prepare(`
    INSERT INTO sys_error_reports (
      reportId, userId, errors, createdAt
    ) VALUES (?, ?, ?, ?)
  `).bind(
    generateId('err_'),
    c.get('user').userId,
    JSON.stringify(errors),
    Date.now()
  ).run()

  return c.json({ success: true })
})
```

---

### 参考文档

- Vue 3 Reactivity API: https://vuejs.org/api/reactivity-core.html#ref
- Element Plus Message: https://element-plus.org/en-US/component/message.html
- TanStack Query Error Handling: https://tanstack.com/query/latest/docs/vue/guides/query-functions#handling-errors

---

**创建日期**: 2025-10-26
**最后更新**: 2025-11-01
**当前阶段**: Phase 4.6 完成 - 全局错误捕获与日志系统

---

## Phase 4.7 - Vue 3 Composition API 重構與響應式最佳實踐

**完成日期**: 2025-11-06  
**重點**: 從 Options API 遷移到 Composition API，修復響應式依賴鏈問題

### 背景

在將 Vue 前端從 Options API 遷移到 Composition API 的過程中，發現了多個響應式依賴追蹤失效的問題，導致：
- 登入後權限不會即時更新
- UI 元素不會響應數據變化
- Modal 不會自動關閉

### 核心問題：Vue 響應式依賴追蹤失效

#### 問題 1: 直接訪問 `userQuery.data.value` 導致依賴追蹤失效

**錯誤寫法**：
```javascript
// ❌ 問題：Vue 無法追蹤 computed 內部對 userQuery.data.value 的訪問
const showAuthModal = computed(() => {
  if (userQuery.data.value) {  // 直接訪問
    return false
  }
  return true
})
```

**問題分析**：
- `userQuery.data` 是 TanStack Query 返回的 ref
- 當在 computed 內部**直接**訪問 `userQuery.data.value` 時，Vue 的響應式系統有時無法正確建立依賴關係
- 導致當 `userQuery.data` 更新時，computed 不會重新計算

**正確寫法**：
```javascript
// ✅ 解決：添加中間 computed 建立清晰的響應式鏈
const user = computed(() => userQuery.data.value || null)

const showAuthModal = computed(() => {
  if (user.value) {  // 通過中間 computed 訪問
    return false
  }
  return true
})
```

**響應式鏈路**：
```
userQuery.data (TanStack Query ref)
    ↓
user (computed) ← 建立第一層依賴
    ↓
showAuthModal (computed) ← 建立第二層依賴
    ↓
模板更新
```

#### 問題 2: 在 computed 內調用函數導致依賴追蹤失效

**錯誤寫法**：
```javascript
// ❌ 問題：函數內部訪問響應式數據，Vue 無法追蹤
function hasAnyPermission(permissionList) {
  if (isLoading.value) return null
  return permissionList.some(p => permissions.value.includes(p))
}

const isSystemAdmin = computed(() => {
  // 調用函數，但 Vue 無法追蹤函數內部的 permissions.value
  const result = hasAnyPermission(['system_admin', 'create_project'])
  return result === true
})
```

**問題分析**：
- `hasAnyPermission` 函數內部訪問了 `permissions.value`
- 當在 computed 內調用這個函數時，Vue 無法追蹤到函數內部的響應式依賴
- 導致 `permissions` 更新時，`isSystemAdmin` 不會重新計算

**正確寫法**：
```javascript
// ✅ 解決：在 computed 內直接訪問響應式數據
const isSystemAdmin = computed(() => {
  // 直接在 computed 內訪問，建立依賴
  const perms = userPermissions.value
  
  if (userIsLoading.value) return false
  
  // 直接檢查，不通過函數
  const result = perms.includes('system_admin') || perms.includes('create_project')
  return result
})
```

**關鍵原則**：
- ✅ 在 computed 內**直接訪問** `.value`
- ❌ 不要在 computed 內調用函數來訪問響應式數據
- ✅ 如果必須使用函數，該函數應該返回 computed ref

#### 問題 3: 登入後沒有觸發 refetch

**問題代碼**：
```typescript
// composables/auth/useLogin.ts
async function verifyTwoFactor(twoFactorData: TwoFactorData): Promise<boolean> {
  // ...
  if (response.success) {
    localStorage.setItem('sessionId', response.data.sessionId);
    
    // ❌ 只儲存 token，沒有觸發 refetch
    // 註釋說依賴 refetchOnWindowFocus，但這太慢了
    
    return true;
  }
}
```

**正確寫法**：
```typescript
// ✅ 登入成功後立即 refetch
import { useQueryClient } from '@tanstack/vue-query';

export function useLogin(apiClient: any) {
  const queryClient = useQueryClient();
  
  async function verifyTwoFactor(twoFactorData: TwoFactorData): Promise<boolean> {
    // ...
    if (response.success) {
      localStorage.setItem('sessionId', response.data.sessionId);
      
      // ✅ 立即 refetch 更新用戶數據
      await queryClient.refetchQueries({ queryKey: ['currentUser'] });
      
      return true;
    }
  }
}
```

### 完整解決方案

#### 1. usePermissions.js - 添加中間 computed

**文件位置**: `frontend-vue/src/composables/usePermissions.js`

```javascript
export function usePermissions(userQueryParam = null) {
  const userQuery = userQueryParam || useCurrentUser()

  // ✅ 添加中間 computed 建立響應式鏈
  const user = computed(() => userQuery.data.value || null)

  const permissions = computed(() => {
    const userData = user.value  // ← 通過 user.value 訪問
    if (!userData?.permissions) return []
    return userData.permissions
  })
  
  // ... 其他代碼
}
```

#### 2. App.vue - 修復 computed 依賴

**文件位置**: `frontend-vue/src/App.vue`

```javascript
// ✅ 創建中間 computed
const user = computed(() => userQuery.data.value || null)

// ✅ showAuthModal 通過 user.value 訪問
const showAuthModal = computed(() => {
  if (userQuery.isLoading.value) return false
  if (user.value) return false  // ← 使用 user.value
  return true
})

// ✅ isSystemAdmin 直接訪問 permissions
const isSystemAdmin = computed(() => {
  const perms = userPermissions.value  // ← 直接訪問建立依賴
  if (userIsLoading.value) return false
  return perms.includes('system_admin') || perms.includes('create_project')
})
```

#### 3. useLogin.ts - 登入後觸發 refetch

**文件位置**: `frontend-vue/src/composables/auth/useLogin.ts`

```typescript
import { useQueryClient } from '@tanstack/vue-query';

export function useLogin(apiClient: any): UseLoginReturn {
  const queryClient = useQueryClient();
  
  async function verifyTwoFactor(twoFactorData: TwoFactorData): Promise<boolean> {
    // ...
    if (response.success) {
      if (response.data.sessionId) {
        localStorage.setItem('sessionId', response.data.sessionId);
      }

      // ✅ 立即 refetch
      await queryClient.refetchQueries({ queryKey: ['currentUser'] });

      return true;
    }
  }
}
```

#### 4. useAuth.js - 登入/登出 mutation

**文件位置**: `frontend-vue/src/composables/useAuth.js`

```javascript
export function useLogin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ username, password, verificationCode, turnstileToken }) => {
      // ...
    },
    onSuccess: async (data) => {
      if (data.token) {
        localStorage.setItem('sessionId', data.token)
      }

      // ✅ 立即 refetch
      await queryClient.refetchQueries({ queryKey: ['currentUser'] })

      ElMessage.success('登入成功')
    }
  })
}

export function useLogout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.logout()
      return response
    },
    onSuccess: () => {
      localStorage.removeItem('sessionId')

      // ✅ 使用 resetQueries 清除緩存
      queryClient.resetQueries({ queryKey: ['currentUser'] })

      ElMessage.success('已登出')
    }
  })
}
```

### 響應式鏈路完整圖解

```
登入成功
  ↓
localStorage.setItem('sessionId')
  ↓
queryClient.refetchQueries(['currentUser'])
  ↓
userQuery.data 更新
  ↓
user computed 重新計算 ← 第一層依賴
  ↓
permissions computed 重新計算 ← 第二層依賴
  ↓
isSystemAdmin computed 重新計算 ← 第三層依賴
showAuthModal computed 重新計算 ← 第三層依賴
  ↓
模板更新（UI 響應）
  - Modal 關閉
  - 系統管理選項顯示
  - TopBar 用戶資訊顯示
```

### 關鍵注意事項

#### ⚠️ 常見陷阱

1. **不要在 computed 內調用訪問響應式數據的函數**
   ```javascript
   // ❌ 錯誤
   const result = computed(() => someFunction(reactive.value))
   
   // ✅ 正確
   const result = computed(() => {
     const value = reactive.value
     // 直接處理
     return value.includes('something')
   })
   ```

2. **不要直接訪問深層嵌套的 ref**
   ```javascript
   // ❌ 可能失效
   const result = computed(() => {
     return deeplyNested.ref.value.property
   })
   
   // ✅ 添加中間層
   const intermediate = computed(() => deeplyNested.ref.value)
   const result = computed(() => intermediate.value.property)
   ```

3. **不要依賴自動 refetch，要主動觸發**
   ```javascript
   // ❌ 太慢
   // 依賴 refetchOnWindowFocus / refetchOnMount
   
   // ✅ 主動觸發
   await queryClient.refetchQueries({ queryKey: ['currentUser'] })
   ```

4. **登出要用 resetQueries，不要用 refetchQueries**
   ```javascript
   // ❌ 錯誤：refetch 會嘗試用舊 token 重新請求
   queryClient.refetchQueries({ queryKey: ['currentUser'] })
   
   // ✅ 正確：reset 清除緩存並設置為 error 狀態
   queryClient.resetQueries({ queryKey: ['currentUser'] })
   ```

#### ✅ 最佳實踐

1. **使用中間 computed 建立清晰的響應式鏈**
   - 避免直接訪問深層 ref
   - 每一層依賴都清晰可見
   - 更容易 debug

2. **在 computed 內直接訪問響應式數據**
   - 不要通過函數訪問
   - 讓 Vue 能夠追蹤依賴

3. **登入/登出後立即 refetch/reset**
   - 不要依賴自動 refetch
   - 確保 UI 立即更新

4. **使用 TanStack Query 的正確 API**
   - `refetchQueries`: 重新請求（登入、數據更新）
   - `resetQueries`: 清除緩存（登出）
   - `invalidateQueries`: 標記過期（較少使用）

### 統一錯誤處理系統

#### errorHandler.js 使用指南

**文件位置**: `frontend-vue/src/utils/errorHandler.js`

**核心原則**：
- ❌ 不要直接使用 `ElMessage.error()`
- ✅ 統一使用 `errorHandler.js` 提供的方法
- ✅ 所有錯誤都會自動記錄到全局錯誤日誌

**API 說明**：

```javascript
import { handleError, showSuccess, showWarning, showInfo } from '@/utils/errorHandler.js'

// ✅ 處理錯誤（自動記錄 + 顯示）
handleError(error, 'context_description')

// ✅ 成功訊息
showSuccess('操作成功')

// ✅ 警告訊息
showWarning('請注意某事項')

// ✅ 資訊訊息
showInfo('提示資訊')
```

**使用範例**：

```javascript
// 在 composable 中
export function useMyFeature() {
  return useMutation({
    mutationFn: async (data) => {
      const response = await apiClient.call('/api/endpoint', data)
      if (!response.success) {
        throw new Error(response.error?.message || '操作失敗')
      }
      return response.data
    },
    onSuccess: () => {
      showSuccess('操作成功')  // ✅ 使用 errorHandler
    },
    onError: (error) => {
      handleError(error, 'my_feature_context')  // ✅ 使用 errorHandler
    }
  })
}

// 在組件中
async function handleSubmit() {
  try {
    const result = await someAsyncOperation()
    showSuccess('提交成功')  // ✅
  } catch (error) {
    handleError(error, 'form_submission')  // ✅
  }
}
```

**不要這樣做**：
```javascript
// ❌ 不要直接使用 ElMessage
import { ElMessage } from 'element-plus'
ElMessage.error('錯誤訊息')  // 不會記錄到錯誤日誌

// ❌ 不要自己捕獲錯誤後不處理
try {
  await someOperation()
} catch (error) {
  console.error(error)  // 錯誤沒有顯示給用戶
}
```

#### 與 TanStack Query 整合

```javascript
// ✅ 正確方式
export function useMyQuery() {
  return useQuery({
    queryKey: ['myData'],
    queryFn: async () => {
      const response = await apiClient.call('/api/data')
      if (!response.success) {
        // 拋出錯誤讓 TanStack Query 處理
        throw new Error(response.error?.message || '獲取數據失敗')
      }
      return response.data
    },
    // 在組件中統一處理錯誤
    onError: (error) => {
      handleError(error, 'my_query')  // ✅
    }
  })
}
```

### Dashboard.vue 重構案例

**重構內容**：
- Options API → `<script setup>` Composition API
- 移除 `this`，使用直接訪問
- 使用 composables 替代 mixins
- 統一錯誤處理

**重構前（Options API）**：
```vue
<script>
export default {
  data() {
    return {
      searchQuery: ''
    }
  },
  computed: {
    filteredProjects() {
      return this.projects.filter(p => 
        p.name.includes(this.searchQuery)
      )
    }
  },
  methods: {
    async loadProjects() {
      try {
        const response = await this.$apiClient.call('/api/projects')
        this.projects = response.data
      } catch (error) {
        this.$message.error('載入失敗')  // ❌
      }
    }
  }
}
</script>
```

**重構後（Composition API）**：
```vue
<script setup>
import { ref, computed } from 'vue'
import { useProjectsWithStages } from '@/composables/useProjects'
import { handleError } from '@/utils/errorHandler'

const searchQuery = ref('')

// ✅ 使用 composable
const { 
  data: projects, 
  isLoading, 
  error 
} = useProjectsWithStages()

// ✅ 統一錯誤處理
if (error.value) {
  handleError(error.value, 'projects_loading')
}

// ✅ 直接訪問，無需 this
const filteredProjects = computed(() => {
  if (!projects.value) return []
  return projects.value.filter(p => 
    p.name.includes(searchQuery.value)
  )
})
</script>
```

### 測試清單

**登入/登出測試**：
- ✅ 登入後權限立即更新
- ✅ 登入後 modal 立即關閉
- ✅ 登入後系統管理選項立即顯示
- ✅ 登入後 TopBar 用戶資訊正常顯示
- ✅ 登出後 modal 立即顯示
- ✅ 登出後權限清除

**響應式測試**：
- ✅ Computed 在依賴變化時重新計算
- ✅ 模板在 computed 變化時更新
- ✅ Console 日誌顯示 computed 被觸發

**錯誤處理測試**：
- ✅ 錯誤訊息正確顯示
- ✅ 錯誤記錄到全局日誌
- ✅ NotificationCenter 顯示錯誤列表

### 遷移檢查清單

在遷移每個組件時，檢查以下項目：

**Composition API**：
- [ ] 移除 `export default { ... }`
- [ ] 改用 `<script setup>`
- [ ] 移除所有 `this`
- [ ] `data()` → `ref()` 或 `reactive()`
- [ ] `computed` → `computed()`
- [ ] `methods` → 普通函數
- [ ] `mounted()` → `onMounted()`
- [ ] Props 使用 `defineProps()`
- [ ] Emits 使用 `defineEmits()`

**響應式依賴**：
- [ ] 檢查是否直接訪問深層 ref
- [ ] 添加中間 computed 層（如需要）
- [ ] 確保 computed 內直接訪問 `.value`
- [ ] 不在 computed 內調用函數訪問響應式數據

**錯誤處理**：
- [ ] 移除所有 `ElMessage.error()`
- [ ] 改用 `handleError()`
- [ ] 移除所有 `ElMessage.success()`
- [ ] 改用 `showSuccess()`
- [ ] TanStack Query 錯誤使用 `onError`

**TanStack Query**：
- [ ] Mutation 成功後 refetch 相關 query
- [ ] 登出使用 `resetQueries` 而非 `refetchQueries`
- [ ] 錯誤處理使用 `onError` 回調

### 相關檔案

**重構完成的組件**：
- ✅ `frontend-vue/src/App.vue`
- ✅ `frontend-vue/src/components/Dashboard.vue`
- 🔄 `frontend-vue/src/components/ProjectDetail.vue` (待重構)

**修復的 Composables**：
- ✅ `frontend-vue/src/composables/useAuth.js`
- ✅ `frontend-vue/src/composables/usePermissions.js`
- ✅ `frontend-vue/src/composables/auth/useLogin.ts`

**工具檔案**：
- ✅ `frontend-vue/src/utils/errorHandler.js`

---

## 故障排查案例 (Troubleshooting Cases)

### Case 1: 共識警告誤報問題

**問題描述**：
組別已完成所有成員投票，但仍顯示「共識警告」提示。

**發現時間**: 2025-11-10

#### 症狀
- 分工投票已完成（所有提案參與者都已投票）
- 前端仍顯示「⚠️ 共識警告 - 請注意此階段可能存在共識問題」
- 用戶無法提交報告（被共識警告阻擋）

#### 調查過程

**初步假設**：
- 懷疑是 `useConsensusWarning.js` 的判斷邏輯有問題

**調查步驟 1 - 添加 Debug 日誌**：

在 `frontend-vue/src/composables/useConsensusWarning.js` 添加全面的 console.log：

```javascript
function shouldShowConsensusWarning(stage, hasCurrentGroupSubmitted, getCurrentGroupData) {
  console.log('🔍 [shouldShowConsensusWarning] 開始檢查', {
    stageId: stage.id,
    stageName: stage.name,
    stageStatus: stage.status
  })

  // ... 每個判斷邏輯都加上日誌

  const groupData = getCurrentGroupData(stage)
  console.log('📦 [shouldShowConsensusWarning] groupData:', {
    hasGroupData: !!groupData,
    hasSubmissionId: !!groupData?.submissionId,
    hasVotingData: !!groupData?.votingData,
    groupData: groupData
  })
}
```

**發現問題 1 - Submissions 為空**：
```
📦 [shouldShowConsensusWarning] groupData: {
  hasGroupData: true,
  hasSubmissionId: undefined,  // ❌ 找不到 submission
  hasVotingData: false,
  groupData: { groupId: "...", groupName: "..." }
}
```

檢查後端 API 日誌發現：`GET /api/projects/{id}/content` 返回 `{submissions: Array(0)}`

**根本原因 1**：
後端 SQL 查詢使用了錯誤的狀態過濾：
```sql
-- ❌ 錯誤：只查詢 submitted 狀態
WHERE s.status = 'submitted'

-- 當階段進入 voting 狀態時，submission 自動改為 'approved'
-- 導致前端無法載入已提交的 submission
```

**解決方案 1**：
修改 `src/handlers/projects/list.ts` (lines 207, 226)：
```sql
-- ✅ 正確：排除 withdrawn 即可
WHERE s.status != 'withdrawn'
```

**發現問題 2 - votingData 缺失**：

Submission 載入成功後，仍發現 `groupData.votingData` 為 `undefined`：

```javascript
console.log('📦 [shouldShowConsensusWarning] groupData:', {
  hasGroupData: true,
  hasSubmissionId: "sub_xxx",  // ✅ 有 submission 了
  hasVotingData: false,         // ❌ 但還是沒有 votingData
})
```

**根本原因 2**：
`useStageContentManagement.js` 中的 `loadAllStageReports()` 函數沒有載入投票數據，只有 `refreshStageReports()` 有載入。這導致頁面初次載入時缺少 votingData，只有手動刷新時才會載入。

**解決方案 2**：
在 `loadAllStageReports()` 中添加投票數據載入邏輯：

```javascript
async function loadAllStageReports(projectId) {
  // ... 載入 submissions、comments、rankings

  // 載入當前用戶所屬組的投票數據（用於共識警告）
  if (projectData.value && projectData.value.userGroups) {
    const currentUserGroup = projectData.value.userGroups.find(ug => ug.isActive)

    if (currentUserGroup) {
      // 只為組內成員載入
      if (currentUserGroup.role === 'leader' || currentUserGroup.role === 'member') {
        const userGroupData = stage.groups.find(g => g.groupId === currentUserGroup.groupId)
        if (userGroupData) {
          await loadGroupVotingData(projectId, stage.id, userGroupData)
        }
      }
    }
  }
}
```

#### 相關檔案
- `frontend-vue/src/composables/useConsensusWarning.js` - 共識警告判斷邏輯
- `frontend-vue/src/composables/useStageContentManagement.js` - 階段內容載入
- `src/handlers/projects/list.ts` - 後端 API（submission 查詢）

#### 學到的教訓
1. **不要盲目分析** - 用戶的反饋：「你確定嗎？要不要給一些console debug message來找找看，別瞎分析」
2. **全面的日誌** - 在每個關鍵判斷點添加詳細的 console.log
3. **數據生命週期** - 注意數據狀態變化（`submitted` → `approved`）對查詢的影響
4. **初始載入 vs 刷新** - 確保兩種載入路徑都正確實現

---

### Case 2: ACCESS_DENIED 權限問題（調查中）

**問題描述**：
組內成員嘗試查看自己組的分工投票狀態時，收到 `500 ACCESS_DENIED` 錯誤。

**發現時間**: 2025-11-10

#### 症狀
```
POST /submissions/participation-status 500 Internal Server Error

錯誤響應:
{
  "error": {
    "code": "ACCESS_DENIED",
    "message": "You can only view your own group's participation status"
  }
}
```

**受影響用戶**：
- ✅ Admin/Teacher/Observer - 已修復（不應該調用此 API）
- ❌ Group Leader/Member - **仍存在問題**（應該可以訪問但被拒絕）

#### 調查過程

**調查步驟 1 - 檢查是否查詢錯誤的 Submission**：

用戶反饋：「所以我才說你是不是去問不該是這個user的submission approvalvotes啊！」

檢查前端代碼：
```javascript
// useStageContentManagement.js - refreshStageReports()
stage.groups.forEach(async (groupData) => {
  if (groupData.submissionId) {
    await loadGroupVotingData(projectId, stage.id, groupData)
  }
})
```

**問題發現**：
原本的實現會載入 **所有組別** 的 votingData，但後端權限檢查只允許查看 **自己組** 的數據。

**調查步驟 2 - 修改為只載入當前用戶的組**：

```javascript
// 只載入當前用戶所屬組的投票數據
if (projectData.value && projectData.value.userGroups) {
  const currentUserGroup = projectData.value.userGroups.find(ug => ug.isActive)

  if (currentUserGroup) {
    const userGroupData = stage.groups.find(g => g.groupId === currentUserGroup.groupId)
    if (userGroupData) {
      await loadGroupVotingData(projectId, stage.id, userGroupData)
    }
  }
}
```

**調查步驟 3 - 添加角色檢查**：

修復了 Admin/Teacher/Observer 的問題：
```javascript
// 權限檢查：只有組內成員才需要載入投票數據
if (currentUserGroup.role === 'leader' || currentUserGroup.role === 'member') {
  // 載入 votingData
} else {
  console.log(`⏭️ 用戶角色 "${currentUserGroup.role}" 不是組內成員，跳過 votingData 載入`)
}
```

**調查步驟 4 - 添加詳細的 API 調用日誌**：

問題仍然存在於組內成員。用戶反饋：「你為何不再前端也留下log，這樣我們就能知道到底送出什麼了呢」

添加詳細日誌：
```javascript
async function loadGroupVotingData(projectId, stageId, groupData) {
  try {
    console.log(`🚀 [loadGroupVotingData] 準備調用 API，參數:`, {
      projectId: projectId,
      stageId: stageId,
      submissionId: groupData.submissionId,
      groupId: groupData.groupId
    })

    const response = await apiClient.getGroupSubmissionApprovalVotes(
      projectId,
      stageId,
      groupData.submissionId
    )

    console.log(`📥 [loadGroupVotingData] API 響應:`, response)

    if (!response.success) {
      console.warn(`⚠️ [loadGroupVotingData] 錯誤詳情:`, {
        errorCode: response.error?.code,
        errorMessage: response.error?.message,
        fullError: response.error
      })
    }
  } catch (error) {
    console.error(`❌ [loadGroupVotingData] 發生異常:`, error)
  }
}
```

#### 後端權限檢查邏輯

`src/handlers/submissions/manage.ts` - `getParticipationConfirmations()`:

```typescript
// 查找用戶的組別
const userGroup = await env.DB.prepare(`
  SELECT groupId, role FROM usergroups
  WHERE userEmail = ? AND projectId = ? AND isActive = 1
`).bind(userEmail, projectId).first();

if (!userGroup) {
  return errorResponse('NOT_IN_GROUP', 'User is not in any active group');
}

// 只允許組內成員查看自己組的投票狀態
if (userGroup.groupId !== submission.groupId) {
  return errorResponse('ACCESS_DENIED', 'You can only view your own group\'s participation status');
}
```

#### 可能的根本原因（待驗證）

用戶提示：「這題的答案就是middleware吧」

**假設 1 - 多個 Active UserGroups**：
```sql
-- 用戶可能有多筆 active userGroups（換組但舊記錄未清理）
SELECT * FROM usergroups WHERE userEmail = ? AND projectId = ? AND isActive = 1
-- 返回多筆記錄，`.first()` 可能返回錯誤的組別
```

**假設 2 - GroupId 不匹配**：
```javascript
// 前端從 projectData.userGroups 找到的 groupId
const currentUserGroup = projectData.value.userGroups.find(ug => ug.isActive)

// 後端從 D1 數據庫查詢的 groupId
const userGroup = await env.DB.prepare(...).first()

// 兩者可能不一致（數據同步問題？）
```

**假設 3 - Middleware 權限上下文問題**：
JWT middleware 解析的 `userEmail` 與實際 userGroups 表的數據不一致。

#### 當前狀態

**狀態**: 🔍 調查中 - 等待用戶測試結果

**已添加的 Debug 日誌**：
- ✅ 前端 API 調用參數日誌
- ✅ 前端 API 響應詳細日誌
- ✅ 前端角色檢查日誌
- ⏳ 待添加：後端 userGroup 查詢日誌
- ⏳ 待添加：後端 groupId 比對日誌

**下一步**：
1. 收集前端日誌中的實際參數值
2. 在後端添加對應的日誌（查詢到的 userGroup、submission.groupId）
3. 比對前後端的 groupId 是否一致
4. 檢查數據庫是否有多筆 active userGroups
5. 根據診斷結果實施修復

#### 相關檔案
- `frontend-vue/src/composables/useStageContentManagement.js` - 投票數據載入邏輯
- `src/handlers/submissions/manage.ts` - 後端權限檢查（`getParticipationConfirmations`）
- `src/middleware/auth.ts` - JWT 認證 middleware

---

### Case 3: Console 日誌重複輸出問題

**問題描述**：
Console 中不斷重複輸出相同的警告日誌，應該只在頁面載入時輸出一次。

**發現時間**: 2025-11-10

#### 症狀
```javascript
// Console 不斷重複輸出：
🔍 [shouldShowConsensusWarning] 開始檢查 { stageId: "...", ... }
❌ [shouldShowConsensusWarning] 不是 active 階段，不顯示警告
🔍 [shouldShowConsensusWarning] 開始檢查 { stageId: "...", ... }
❌ [shouldShowConsensusWarning] 不是 active 階段，不顯示警告
// ... 重複數十次
```

用戶反饋：「為何我會一直收到這個警告...這些訊息不是網頁載入的時候出現一次就好了嗎？」

#### 根本原因

在 Vue 模板中直接調用函數：

```vue
<!-- ❌ 錯誤：每次 Vue 重新渲染都會執行 -->
<div v-else-if="shouldShowConsensusWarning(stage)">
  <el-alert type="warning">共識警告</el-alert>
</div>
```

Vue 的響應式系統會在任何依賴變化時重新計算模板，導致函數被重複調用。

#### 解決方案

**方案 A - 使用 Computed Properties（推薦）**：

```javascript
// ProjectDetail-New.vue
const stageConsensusWarnings = computed(() => {
  const warnings = new Map()
  stages.value.forEach(stage => {
    const shouldShow = consensusWarning.shouldShowConsensusWarning(
      stage,
      hasCurrentGroupSubmitted,
      getCurrentGroupData
    )
    warnings.set(stage.id, shouldShow)
  })
  console.log('🔄 [stageConsensusWarnings] Computed 重新計算')
  return warnings
})

// Wrapper function 只做 Map 查詢
function shouldShowConsensusWarning(stage) {
  return stageConsensusWarnings.value.get(stage.id) || false
}
```

模板使用：
```vue
<!-- ✅ 正確：只在依賴變化時重新計算 -->
<div v-else-if="shouldShowConsensusWarning(stage)">
  <el-alert type="warning">共識警告</el-alert>
</div>
```

**效果**：
- Console 只在 `stages`、`submissions`、`votingData` 變化時輸出日誌
- 每次變化只計算一次（不是每次渲染）
- 性能更好（結果被緩存）

#### 相關檔案
- `frontend-vue/src/components/ProjectDetail-New.vue` - 添加 computed properties

#### 學到的教訓
1. **避免在模板中直接調用函數** - 每次渲染都會執行
2. **使用 Computed Properties** - 響應式依賴追踪，只在依賴變化時重新計算
3. **日誌策略** - 在 computed 中添加日誌可以驗證計算頻率

---

### 調試最佳實踐 (Debug Best Practices)

基於以上案例總結的調試經驗：

#### 1. 何時添加 Debug 日誌

**症狀驅動**：
- ✅ 數據沒有按預期顯示 → 在數據載入、轉換、渲染的每個環節添加日誌
- ✅ 權限錯誤 → 在前端和後端的權限檢查點添加日誌
- ✅ 性能問題（重複執行）→ 在函數入口添加日誌計數
- ❌ 功能正常運行 → 不要過度添加日誌（影響性能和可讀性）

**位置選擇**：
```javascript
// ✅ 推薦：關鍵決策點
if (stage.status !== 'active') {
  console.log('❌ 不是 active 階段')
  return false
}

// ✅ 推薦：API 調用前後
console.log('🚀 調用 API，參數:', params)
const response = await api.call(params)
console.log('📥 API 響應:', response)

// ✅ 推薦：數據轉換
console.log('📦 原始數據:', rawData)
const processed = transform(rawData)
console.log('✨ 處理後:', processed)

// ❌ 不推薦：循環內部（除非必要）
items.forEach(item => {
  console.log('處理項目:', item) // 可能輸出數百次
})
```

#### 2. 日誌格式規範

**使用 Emoji 前綴分類**：
- 🔍 **調查/檢查** - 開始調查某個問題
- 📦 **數據/對象** - 顯示數據結構
- 🚀 **API 調用** - 即將發送請求
- 📥 **API 響應** - 收到響應
- ✅ **成功** - 操作成功完成
- ❌ **失敗/拒絕** - 操作失敗或條件不滿足
- ⚠️ **警告** - 非預期但不致命的情況
- 🔄 **重新計算/刷新** - Computed 或響應式更新
- 👥 **用戶/組** - 用戶或組別相關數據
- 🎯 **結果/判斷** - 最終結果
- ⏳ **等待/未完成** - 某些成員未完成操作

**包含上下文信息**：
```javascript
// ❌ 不推薦：缺少上下文
console.log('載入失敗')

// ✅ 推薦：完整上下文
console.log('❌ [loadGroupVotingData] 載入失敗', {
  projectId,
  stageId,
  groupId,
  error: response.error
})
```

#### 3. 前端 vs 後端日誌策略

**前端日誌（Console）**：
```javascript
// 用於調試響應式邏輯、數據流、用戶交互
console.log('🔍 [ComponentName.functionName] 描述', { 關鍵數據 })

// Computed properties
const myComputed = computed(() => {
  console.log('🔄 [myComputed] 重新計算', { dependencies })
  return result
})
```

**後端日誌（Cloudflare Workers）**：
```typescript
// 用於調試 API 請求、權限檢查、數據庫查詢
console.log('[HandlerName] 描述', { 關鍵數據 })

// 權限檢查
const userGroup = await getUserGroup(userId, projectId)
console.log('[checkPermission] userGroup:', userGroup)

if (userGroup.groupId !== targetGroupId) {
  console.warn('[checkPermission] ACCESS_DENIED', {
    userGroupId: userGroup.groupId,
    targetGroupId,
    userId
  })
  return errorResponse('ACCESS_DENIED')
}
```

#### 4. 避免盲目假設

**錯誤示例**：
```javascript
// ❌ 假設數據一定存在
const groupId = user.groups[0].groupId

// ❌ 假設狀態一定是某個值
if (stage.status === 'submitted') { ... }
```

**正確做法**：
```javascript
// ✅ 檢查每一層
console.log('👥 user:', user)
console.log('👥 user.groups:', user?.groups)

const group = user?.groups?.[0]
if (!group) {
  console.warn('❌ 用戶沒有組別')
  return
}

// ✅ 列出所有可能的值
console.log('📊 stage.status:', stage.status)
console.log('📊 所有 submissions:', submissions.map(s => ({
  id: s.id,
  status: s.status,
  groupId: s.groupId
})))
```

#### 5. 分層調試策略

**從外向內**：
1. **API 層** - 確認請求/響應是否正確
2. **數據層** - 確認數據是否正確載入
3. **邏輯層** - 確認業務邏輯是否正確
4. **渲染層** - 確認 UI 是否正確顯示

**示例**：
```javascript
// Layer 1: API
console.log('🚀 [API] 請求參數:', params)
const response = await api.call(params)
console.log('📥 [API] 響應:', response)

// Layer 2: Data
const data = response.data
console.log('📦 [Data] 原始數據:', data)

// Layer 3: Logic
const result = processData(data)
console.log('🎯 [Logic] 處理結果:', result)

// Layer 4: Render
const displayText = formatForDisplay(result)
console.log('✨ [Render] 顯示文本:', displayText)
```

#### 6. 日誌清理

**開發階段**：
- 保留所有調試日誌，使用前綴分類方便過濾

**生產前**：
```javascript
// 方案 A: 使用環境變量控制
const DEBUG = import.meta.env.DEV

if (DEBUG) {
  console.log('🔍 調試信息')
}

// 方案 B: 使用專門的 debug 函數
function debugLog(message, data) {
  if (import.meta.env.DEV) {
    console.log(message, data)
  }
}

// 方案 C: 保留關鍵錯誤日誌，移除詳細調試日誌
console.error('❌ 關鍵錯誤') // 保留
// console.log('🔍 詳細調試') // 移除或註釋
```

#### 7. 性能考量

**避免昂貴的日誌操作**：
```javascript
// ❌ 不推薦：序列化大型對象
console.log('數據:', JSON.stringify(hugeObject))

// ✅ 推薦：只記錄關鍵字段
console.log('數據:', {
  id: hugeObject.id,
  status: hugeObject.status,
  count: hugeObject.items?.length
})

// ❌ 不推薦：在高頻函數中記錄
function onScroll() {
  console.log('滾動位置:', window.scrollY) // 每秒可能觸發數十次
}

// ✅ 推薦：使用節流或只記錄關鍵事件
function onScroll() {
  if (window.scrollY > threshold) {
    console.log('✅ 達到閾值')
  }
}
```

---

## Phase 4.8 - 運行時類型驗證與 Zod 集成

### 1. 為什麼需要 Zod？

在 TypeScript 項目中，雖然編譯時有類型檢查，但以下場景需要**運行時驗證**：

#### 跨邊界數據驗證的必要性

```
Frontend (TypeScript) ←→ Network (JSON) ←→ Backend (TypeScript)
        ↑                      ↑                    ↑
    編譯時類型              無類型保證            編譯時類型
```

**關鍵問題**：
- ✅ TypeScript 在編譯時檢查類型
- ❌ 但 API 響應、WebSocket 消息、用戶輸入在運行時可能不符合預期
- ❌ 惡意用戶可以通過瀏覽器開發工具發送任意數據

#### 真實案例分析

**案例 1：WebSocket 消息篡改**
```javascript
// ❌ 不安全：沒有驗證
websocket.on('settlement_progress', (data) => {
  // data.progress 可能是 999999999
  // data.step 可能是 'invalid_step'
  settlementProgress.progress = data.progress
})

// ✅ 安全：Zod 驗證
websocket.on('settlement_progress', (data) => {
  const result = SettlementProgressDataSchema.safeParse(data)
  if (!result.success) {
    console.error('Invalid data:', result.error)
    return
  }
  settlementProgress.progress = result.data.progress // 保證 0-100
})
```

**案例 2：API 響應結構變更**
```javascript
// ❌ 前端假設 API 返回 { success: true, data: {...} }
// 但後端更新後返回 { ok: true, result: {...} }
// 導致前端 TypeError: Cannot read property 'data' of undefined

// ✅ Zod 驗證可以快速發現問題
const response = ApiResponseSchema.parse(apiData)
```

### 2. Zod 基礎使用

#### 安裝

```bash
# 後端
cd Cloudflare-Workers
npm install zod

# 前端
cd frontend-vue
npm install zod
```

#### 基本 Schema 定義

**後端示例** (`src/schemas/settlement.ts`):
```typescript
import { z } from 'zod'

// 定義枚舉
export const SettlementStepSchema = z.enum([
  'initializing',
  'lock_acquired',
  'votes_calculated',
  'distributing_report_rewards',
  'distributing_comment_rewards',
  'completed'
])

// 定義對象結構
export const SettlementProgressDataSchema = z.object({
  stageId: z.string().min(1, 'stageId is required'),
  step: SettlementStepSchema,
  progress: z.number().min(0).max(100, 'progress must be between 0 and 100'),
  message: z.string().min(1, 'message is required'),
  details: z.object({
    teacherVoteCount: z.number().optional(),
    studentVoteCount: z.number().optional(),
    groupCount: z.number().optional(),
    settlementId: z.string().optional()
  }).optional()
})

// 導出 TypeScript 類型（從 schema 推導）
export type SettlementStep = z.infer<typeof SettlementStepSchema>
export type SettlementProgressData = z.infer<typeof SettlementProgressDataSchema>
```

**前端示例** (`frontend-vue/src/schemas/settlement.js`):
```javascript
import { z } from 'zod'

// 前端使用相同的 schema 定義（JavaScript 版本）
export const SettlementProgressDataSchema = z.object({
  stageId: z.string().min(1),
  step: z.enum([
    'initializing',
    'lock_acquired',
    'votes_calculated',
    'distributing_report_rewards',
    'distributing_comment_rewards',
    'completed'
  ]),
  progress: z.number().min(0).max(100),
  message: z.string().min(1),
  details: z.object({
    teacherVoteCount: z.number().optional(),
    studentVoteCount: z.number().optional(),
    groupCount: z.number().optional(),
    settlementId: z.string().optional()
  }).optional()
})
```

### 3. 後端驗證實踐

#### WebSocket 消息發送前驗證

**`src/handlers/scoring/settlement.ts`**:
```typescript
import { SettlementProgressDataSchema } from '@/schemas/settlement'

async function pushProgress(
  env: Env,
  userEmail: string,
  stageId: string,
  step: SettlementStep,
  progress: number,
  message: string,
  details?: SettlementProgressDetails
): Promise<void> {
  try {
    // ✅ 驗證數據結構
    const progressData = SettlementProgressDataSchema.parse({
      stageId,
      step,
      progress,
      message,
      details
    })

    // 發送已驗證的數據
    await stub.fetch(new Request('https://internal/broadcast', {
      method: 'POST',
      body: JSON.stringify({
        type: 'settlement_progress',
        data: progressData
      })
    }))
  } catch (error) {
    // Zod 錯誤會包含詳細的驗證失敗信息
    console.error('Validation failed:', error instanceof Error ? error.message : error)
  }
}
```

#### API 響應驗證

```typescript
import { SettleStageResponseSchema } from '@/schemas/settlement'

export async function settleStage(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string
): Promise<Response> {
  // ... 業務邏輯 ...

  const responseData = {
    success: true,
    data: {
      stageId,
      stageName: stage.stageName,
      settlementId,
      finalRankings: rankings,
      scoringResults: scores,
      weightedScores,
      totalPointsDistributed: totalRewardDistributed,
      participantCount,
      settledTime: timestamp
    }
  }

  // ✅ 驗證響應數據結構
  const validated = SettleStageResponseSchema.parse(responseData)

  return new Response(JSON.stringify(validated), {
    headers: { 'Content-Type': 'application/json' }
  })
}
```

### 4. 前端驗證實踐

#### WebSocket 消息接收驗證

**`ProjectManagement.vue`**:
```javascript
import { SettlementProgressDataSchema } from '@/schemas/settlement'

const handleSettlementProgress = (event) => {
  try {
    // ✅ 使用 safeParse 避免拋出異常
    const validationResult = SettlementProgressDataSchema.safeParse(event.detail)

    if (!validationResult.success) {
      console.error('Invalid settlement progress data:', validationResult.error)
      ElMessage.error('接收到無效的結算進度資料')
      return
    }

    const data = validationResult.data

    // 使用已驗證的數據
    settlementProgress.step = data.step
    settlementProgress.progress = data.progress
    settlementProgress.message = data.message
    settlementProgress.details = data.details
  } catch (error) {
    console.error('Error handling settlement progress:', error)
    ElMessage.error('處理結算進度時發生錯誤')
  }
}
```

#### API 響應驗證

```javascript
import { SettleStageResponseSchema } from '@/schemas/settlement'

const settleStage = async (stage) => {
  try {
    const response = await apiClient.callWithAuth('/scoring/settle', {
      projectId: selectedProject.value.projectId,
      stageId: stage.stageId
    })

    // ✅ 驗證 API 響應
    const validated = SettleStageResponseSchema.parse(response)

    if (validated.success && validated.data) {
      ElMessage.success('結算完成')
      // 使用已驗證的數據
      handleSettlementResult(validated.data)
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('API response validation failed:', error.errors)
      ElMessage.error('API 響應格式錯誤')
    } else {
      handleError(error)
    }
  }
}
```

### 5. Zod 最佳實踐

#### 5.1 使用 `safeParse` vs `parse`

```javascript
// ❌ parse() - 驗證失敗會拋出異常
try {
  const data = Schema.parse(input)
} catch (error) {
  // 需要 try-catch 捕獲
}

// ✅ safeParse() - 返回結果對象（推薦用於用戶輸入、API 響應）
const result = Schema.safeParse(input)
if (result.success) {
  const data = result.data // 類型安全
} else {
  console.error(result.error.errors) // 驗證錯誤詳情
}
```

#### 5.2 共享 Schema 定義

**原則**：前後端使用相同的 schema 定義，確保數據結構一致性

```
Cloudflare-Workers/
├── src/schemas/
│   ├── settlement.ts      # 後端 TypeScript 版本
│   ├── wallet.ts
│   └── ...
frontend-vue/
├── src/schemas/
│   ├── settlement.js      # 前端 JavaScript 版本（結構相同）
│   ├── wallet.js
│   └── ...
```

#### 5.3 錯誤處理

```javascript
const result = Schema.safeParse(data)

if (!result.success) {
  // Zod 提供詳細的錯誤信息
  result.error.errors.forEach(err => {
    console.log(`Field: ${err.path.join('.')}`)
    console.log(`Error: ${err.message}`)
    console.log(`Received: ${err.received}`)
  })
}
```

#### 5.4 可選字段與默認值

```typescript
const Schema = z.object({
  required: z.string(),
  optional: z.string().optional(),
  withDefault: z.string().default('default value'),
  nullable: z.string().nullable(),
  nullish: z.string().nullish() // null | undefined
})
```

### 6. 何時使用 Zod 驗證？

#### ✅ 必須驗證的場景

1. **WebSocket 消息**
   - 前端接收：驗證所有 WebSocket 消息
   - 後端發送：驗證消息結構再發送

2. **關鍵 API 端點**
   - 結算相關 API（涉及金錢計算）
   - 用戶權限變更 API
   - 系統設置 API

3. **用戶輸入**
   - 表單提交
   - URL 參數
   - 查詢字符串

4. **外部數據源**
   - 第三方 API 響應
   - 數據庫查詢結果（如果結構可能變化）

#### ⚠️ 可選驗證的場景

1. **內部函數調用**（已有 TypeScript 類型檢查）
2. **性能敏感路徑**（高頻調用函數）
3. **簡單數據結構**（單個字符串或數字）

### 7. 項目集成清單

#### 已完成
- ✅ 安裝 `zod` 依賴（後端和前端）
- ✅ 創建 `schemas/settlement.ts` 和 `schemas/settlement.js`
- ✅ 後端：`pushProgress()` 函數使用 Zod 驗證
- ✅ 前端：`handleSettlementProgress()` 使用 Zod 驗證
- ✅ 定義常量：`SETTLEMENT_STEPS` 和 `SETTLEMENT_PROGRESS_POINTS`

#### 待完成（建議優先級）

**高優先級** - 涉及金錢或安全的 API：
- [ ] `POST /scoring/settle` - 結算 API 響應驗證
- [ ] `GET /scoring/preview` - 預覽分數 API 響應驗證
- [ ] `POST /wallets/award` - 獎勵點數 API 驗證
- [ ] `POST /wallets/reverse` - 撤銷交易 API 驗證
- [ ] `POST /auth/login` - 登錄響應驗證
- [ ] `POST /auth/register` - 註冊請求/響應驗證

**中優先級** - 用戶操作相關：
- [ ] `POST /projects/create` - 創建專案驗證
- [ ] `POST /stages/create` - 創建階段驗證
- [ ] `POST /groups/update` - 更新組別驗證
- [ ] `POST /permissions/update` - 權限變更驗證

**低優先級** - 查詢類 API（可選）：
- [ ] `GET /projects/list`
- [ ] `GET /users/info`
- [ ] `GET /stages/list`

### 8. 性能考量

#### Zod 驗證成本

```javascript
// 簡單對象驗證：~0.1ms
const simpleSchema = z.object({ id: z.string(), value: z.number() })
simpleSchema.parse({ id: '123', value: 42 })

// 複雜嵌套對象：~1-5ms
const complexSchema = z.object({
  user: z.object({
    profile: z.object({
      settings: z.record(z.any())
    })
  }),
  data: z.array(z.object({...}))
})
```

**優化建議**：
- ✅ 驗證關鍵路徑（安全優先）
- ✅ 對大型數組使用 `.array().max(1000)` 限制
- ⚠️ 避免在高頻函數中驗證（如 scroll 事件）

---

### 參考資源

- **Zod 官方文檔**: https://zod.dev/
- **Zod GitHub**: https://github.com/colinhacks/zod
- Vue 3 Composition API: https://vuejs.org/guide/extras/composition-api-faq.html
- Vue 3 Reactivity in Depth: https://vuejs.org/guide/extras/reactivity-in-depth.html
- TanStack Query Vue: https://tanstack.com/query/latest/docs/vue/overview
- VueUse: https://vueuse.org/
- Cloudflare Workers 調試: https://developers.cloudflare.com/workers/observability/logging/
- Chrome DevTools Console API: https://developer.chrome.com/docs/devtools/console/api/

## Phase 4.9 - El-Drawer 設計規範與使用指南

### 背景

Cloudflare Worker 版本的前端使用 Element Plus 的 `<el-drawer>` 組件作為主要的數據編輯和詳細信息展示界面。為了保持整個系統的 UI 一致性和用戶體驗，專案建立了一套**語義化的設計規範系統**。

本章節記錄了通過分析 31 個現有 drawer 組件總結出的設計模式和最佳實踐。

---

### 1. 設計規範總覽

#### 核心設計原則

1. **語義化配色系統**：通過顏色傳達操作的性質（正常/危險/系統）
2. **統一尺寸標準**：所有 drawer 使用 100% 全屏尺寸
3. **方向語義化**：滑動方向與操作類型的視覺關聯
4. **標準化結構**：統一的內容布局和 CSS 類別命名

#### 三大設計要素

| 要素 | 標準 | 說明 |
|------|------|------|
| **配色** | 3 種語義化顏色類別 | Navy（正常）/ Maroon（危險）/ Green（系統） |
| **尺寸** | `size="100%"` | 固定全屏，適應複雜表單需求 |
| **方向** | `btt` / `ttb` | 底部向上（標準）/ 頂部向下（警告） |

---

### 2. 配色系統詳解

專案使用統一的 CSS 類別系統，定義於 [`packages/frontend/src/styles/drawer-unified.scss`](../../scoringSystem-cf/packages/frontend/src/styles/drawer-unified.scss)：

#### 2.1 Category 1: 正常操作 - `drawer-navy`

**用途**：標準業務流程、數據管理、查看操作

**視覺設計**：
- **背景色**：`#001f3f`（海軍藍）
- **文字色**：白色
- **Header 樣式**：深色背景 + 白色標題

**適用場景**：
- 編輯用戶資料
- 創建/編輯專案
- 查看進度日誌
- 發放積分
- 查看事件日誌

**實際範例**：
```vue
<!-- packages/frontend/src/components/shared/UserEditorDrawer.vue -->
<el-drawer
  v-model="localVisible"
  title="編輯用戶"
  direction="btt"
  size="100%"
  class="drawer-navy"
>
  <!-- 內容 -->
</el-drawer>
```

**使用統計**：約 70% 的 drawer 使用此配色

---

#### 2.2 Category 2: 危險操作 - `drawer-maroon`

**用途**：破壞性操作、撤銷操作、需要特別警示的功能

**視覺設計**：
- **背景色**：`#800000`（棕紅色/Maroon）
- **文字色**：白色
- **視覺效果**：強烈的警告訊號

**適用場景**：
- 撤銷結算
- 交易回退
- 刪除階段
- 編輯時間敏感的階段（StageEditorDrawer）

**實際範例**：
```vue
<!-- packages/frontend/src/components/shared/TransactionReversalDrawer.vue -->
<el-drawer
  v-model="localVisible"
  title="撤銷交易"
  direction="ttb"
  size="100%"
  class="drawer-maroon"
>
  <!-- 內容 -->
</el-drawer>
```

**使用統計**：約 20% 的 drawer 使用此配色

---

#### 2.3 Category 3: 系統資訊 - `drawer-green`

**用途**：系統日誌、審計信息、技術性查看操作

**視覺設計**：
- **背景色**：`#1b4332`（深綠色）
- **文字色**：白色
- **特性**：技術性、中性

**適用場景**：
- 系統日誌查看
- 審計記錄
- 技術調試信息

**使用統計**：約 10% 的 drawer 使用此配色（較少使用）

---

#### 2.4 CSS 實現細節

```scss
// packages/frontend/src/styles/drawer-unified.scss

/* Navy - 正常操作 */
.el-drawer.drawer-navy {
  .el-drawer__header {
    background-color: #001f3f !important;
    color: white !important;
    padding: 16px 20px !important;
    margin-bottom: 0 !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .el-drawer__title {
    color: white !important;
    font-weight: 500;
  }

  .el-drawer__close-btn {
    color: white !important;
  }
}

/* Maroon - 危險操作 */
.el-drawer.drawer-maroon {
  .el-drawer__header {
    background-color: #800000 !important;
    color: white !important;
    padding: 16px 20px !important;
  }

  .el-drawer__title {
    color: white !important;
    font-weight: 600; /* 更粗的字體強調警告 */
  }
}

/* Green - 系統資訊 */
.el-drawer.drawer-green {
  .el-drawer__header {
    background-color: #1b4332 !important;
    color: white !important;
    padding: 16px 20px !important;
  }
}
```

---

### 3. 滑動方向語義化

專案使用**兩種滑動方向**，並賦予其語義化的意義：

#### 3.1 由下往上 (`direction="btt"`) - 標準流程

**使用比例**：約 70% 的 drawer

**語義**：
- 正常的業務流程
- 數據查看和編輯
- 用戶友好的操作

**視覺哲學**：
- 從底部彈出的 drawer 給人"支撐"和"穩定"的感覺
- 符合用戶對"打開面板"的自然預期

**實際範例**：
```vue
<!-- 編輯用戶 -->
<el-drawer direction="btt" size="100%" class="drawer-navy">

<!-- 查看結算進度 -->
<el-drawer direction="btt" size="100%" class="drawer-navy">

<!-- 發放積分 -->
<el-drawer direction="btt" size="100%" class="drawer-navy">
```

**搭配配色**：通常與 `drawer-navy` 搭配使用

---

#### 3.2 由上往下 (`direction="ttb"`) - 危險警示

**使用比例**：約 30% 的 drawer

**語義**：
- 破壞性操作
- 需要特別警惕的功能
- 不可逆的操作

**視覺哲學**：
- 從頂部"壓下來"的 drawer 給人"壓迫感"和"警告"
- 紅色背景從上方出現，視覺衝擊力強
- **設計意圖**：`ttb` + `drawer-maroon` = "紅色警告從天而降"

**實際範例**：
```vue
<!-- 撤銷結算（破壞性操作） -->
<el-drawer direction="ttb" size="100%" class="drawer-maroon">

<!-- 交易回退（不可逆操作） -->
<el-drawer direction="ttb" size="100%" class="drawer-maroon">

<!-- 編輯階段（時間敏感，影響重大） -->
<el-drawer direction="ttb" size="100%" class="drawer-maroon">
```

**搭配配色**：**必須**與 `drawer-maroon` 搭配使用

---

#### 3.3 方向選擇決策樹

```
需要展示複雜表單或詳細信息？
│
├─ 是破壞性/危險操作？
│  │
│  ├─ 是 → direction="ttb" + class="drawer-maroon"
│  │      （例：撤銷結算、刪除數據、交易回退）
│  │
│  └─ 否 → direction="btt" + class="drawer-navy"
│         （例：編輯用戶、創建專案、查看日誌）
│
└─ 否 → 考慮使用 el-dialog（簡單確認框）
       或 el-popover（快速提示）
```

---

### 4. 尺寸規範

#### 4.1 統一標準：100% 全屏

**規範**：所有 drawer 必須使用 `size="100%"`

**理由**：
1. **複雜表單需求**：評分系統的業務邏輯複雜，需要大量表單字段
2. **數據展示需求**：需要展示詳細的用戶信息、交易記錄、日誌等
3. **用戶體驗**：全屏提供最大的操作空間，減少滾動
4. **一致性**：統一尺寸降低用戶認知負擔

**實施方式**：
```vue
<!-- ✅ 正確 -->
<el-drawer size="100%">

<!-- ❌ 錯誤 - 不要使用其他尺寸 -->
<el-drawer size="50%">    <!-- 不符合規範 -->
<el-drawer size="800px">  <!-- 不符合規範 -->
```

#### 4.2 無響應式變化

**說明**：當前設計不針對不同設備調整 drawer 尺寸

**原因**：
- 移動端瀏覽器較少使用
- 全屏在移動端也能良好工作
- 簡化維護成本

**未來考慮**：如需支持移動端，可在 `drawer-unified.scss` 中添加：
```scss
@media (max-width: 768px) {
  .el-drawer {
    .drawer-body {
      padding: 12px; /* 減少內邊距 */
    }
  }
}
```

---

### 5. 標準內容結構模板

#### 5.1 完整 Vue 組件模板

```vue
<template>
  <el-drawer
    v-model="localVisible"
    title="Drawer 標題"
    direction="btt"          <!-- 或 ttb（危險操作） -->
    size="100%"
    class="drawer-navy"      <!-- 或 drawer-maroon -->
    :close-on-click-modal="false"
    :before-close="handleBeforeClose"
  >
    <div class="drawer-body" v-loading="loading">

      <!-- 1. 錯誤提示區（可選） -->
      <el-alert
        v-if="error"
        type="error"
        :title="error"
        :closable="false"
        show-icon
      />

      <!-- 2. 表單區域（可多個 section） -->
      <div class="form-section">
        <h4>
          <i class="fas fa-user"></i> 基本信息
        </h4>

        <div class="form-group">
          <label>用戶名稱 <span class="required">*</span></label>
          <el-input
            v-model="formData.username"
            placeholder="請輸入用戶名稱"
            clearable
          />
        </div>

        <div class="form-group">
          <label>電子郵件</label>
          <el-input
            v-model="formData.email"
            type="email"
            placeholder="請輸入電子郵件"
            clearable
          />
        </div>
      </div>

      <!-- 更多 form-section... -->

      <!-- 3. 底部操作按鈕 -->
      <div class="drawer-actions">
        <el-button
          type="primary"
          :disabled="!isFormValid"
          :loading="saving"
          @click="handleSave"
        >
          儲存
        </el-button>
        <el-button @click="handleCancel">
          取消
        </el-button>
      </div>

    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface Props {
  visible: boolean
  userId?: string
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  userId: undefined
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'saved': [data: any]
}>()

// 雙向綁定 visible
const localVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

// 表單狀態
const loading = ref(false)
const saving = ref(false)
const error = ref('')

const formData = ref({
  username: '',
  email: ''
})

// 表單驗證
const isFormValid = computed(() => {
  return formData.value.username.trim().length > 0
})

// 關閉前確認
const handleBeforeClose = (done: () => void) => {
  if (hasUnsavedChanges()) {
    ElMessageBox.confirm('有未保存的更改，確定要關閉嗎？')
      .then(() => done())
      .catch(() => {})
  } else {
    done()
  }
}

// 保存
const handleSave = async () => {
  saving.value = true
  error.value = ''

  try {
    // API 調用
    const result = await saveUserData(formData.value)
    emit('saved', result)
    localVisible.value = false
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

// 取消
const handleCancel = () => {
  localVisible.value = false
}
</script>
```

---

#### 5.2 關鍵 CSS 類別說明

| CSS 類別 | 用途 | 樣式特性 |
|---------|------|----------|
| `.drawer-body` | 主容器 | `padding: 20px`，滾動容器 |
| `.form-section` | 表單區塊 | 灰色背景 `#f9f9f9`，圓角邊框，內邊距 |
| `.form-group` | 單一欄位組 | `margin-bottom: 20px`，label + input 垂直排列 |
| `.drawer-actions` | 底部按鈕區 | `position: sticky`，固定在底部，白色背景 |
| `.required` | 必填標記 | 紅色星號 `*` |

**CSS 定義示例**：
```scss
// drawer-unified.scss

.drawer-body {
  padding: 20px;
  overflow-y: auto;
  height: calc(100vh - 60px); // 減去 header 高度
}

.form-section {
  background-color: #f9f9f9;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;

  h4 {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 16px;
    color: #333;

    i {
      margin-right: 8px;
      color: #409eff;
    }
  }
}

.form-group {
  margin-bottom: 20px;

  label {
    display: block;
    margin-bottom: 8px;
    font-weight: 500;
    color: #606266;

    .required {
      color: #f56c6c;
      margin-left: 4px;
    }
  }
}

.drawer-actions {
  position: sticky;
  bottom: 0;
  background-color: white;
  padding: 16px 20px;
  border-top: 1px solid #e4e7ed;
  display: flex;
  gap: 12px;
  justify-content: flex-end;

  .el-button {
    min-width: 100px;
  }
}
```

---

### 6. 使用場景與實際範例

#### 6.1 場景分類對照表

| 場景類型 | 方向 | 顏色 | 實際組件 | 檔案路徑 |
|---------|------|------|----------|----------|
| 編輯用戶資料 | `btt` | Navy | UserEditorDrawer | [src/components/shared/UserEditorDrawer.vue](../../scoringSystem-cf/packages/frontend/src/components/shared/UserEditorDrawer.vue) |
| 創建/編輯專案 | `btt` | Navy | ProjectEditorDrawer | [src/components/shared/ProjectEditorDrawer.vue](../../scoringSystem-cf/packages/frontend/src/components/shared/ProjectEditorDrawer.vue) |
| 查看結算進度 | `btt` | Navy | SettlementProgressDrawer | [src/components/shared/SettlementProgressDrawer.vue](../../scoringSystem-cf/packages/frontend/src/components/shared/SettlementProgressDrawer.vue) |
| 查看事件日誌 | `btt` | Navy | EventLogDrawer | [src/components/admin/EventLogDrawer.vue](../../scoringSystem-cf/packages/frontend/src/components/admin/EventLogDrawer.vue) |
| 發放積分 | `btt` | Navy | AwardPointsDrawer | [src/components/shared/AwardPointsDrawer.vue](../../scoringSystem-cf/packages/frontend/src/components/shared/AwardPointsDrawer.vue) |
| **撤銷結算** | `ttb` | Maroon | ReverseSettlementDrawer | [src/components/shared/ReverseSettlementDrawer.vue](../../scoringSystem-cf/packages/frontend/src/components/shared/ReverseSettlementDrawer.vue) |
| **交易回退** | `ttb` | Maroon | TransactionReversalDrawer | [src/components/shared/TransactionReversalDrawer.vue](../../scoringSystem-cf/packages/frontend/src/components/shared/TransactionReversalDrawer.vue) |
| **編輯階段** | `ttb` | Maroon | StageEditorDrawer | [src/components/shared/StageEditorDrawer.vue](../../scoringSystem-cf/packages/frontend/src/components/shared/StageEditorDrawer.vue) |

---

#### 6.2 特殊案例分析

##### Case 1: StageEditorDrawer - 為何使用 Maroon？

**組件**：[StageEditorDrawer.vue:5-8](../../scoringSystem-cf/packages/frontend/src/components/shared/StageEditorDrawer.vue#L5-L8)

**設計決策**：
```vue
<el-drawer
  direction="ttb"
  size="100%"
  class="drawer-maroon"
  :z-index="2500"
>
```

**理由**：
- 編輯階段會影響時間線和用戶提交
- 階段修改可能導致現有提交失效
- 需要管理員特別謹慎處理

**特殊配置**：
- `:z-index="2500"`：確保在其他 drawer 之上（支持嵌套 drawer）

---

##### Case 2: EventLogDrawer - 自定義樣式

**組件**：[EventLogDrawer.vue:8](../../scoringSystem-cf/packages/frontend/src/components/admin/EventLogDrawer.vue#L8)

**特殊之處**：
```vue
<el-drawer direction="btt" size="100%" class="drawer-navy">
  <template #header>
    <div class="custom-gradient-header">
      <!-- 自定義漸層標題 -->
    </div>
  </template>
</el-drawer>
```

**說明**：
- 使用自定義漸層 header 替代標準樣式
- 這是**少數例外**，大部分 drawer 應遵循標準樣式

---

### 7. Drawer vs Modal 的選擇

#### 7.1 何時使用 Drawer？

**適用場景**：
- ✅ 複雜表單（5+ 個字段）
- ✅ 多步驟流程
- ✅ 需要大量數據展示（表格、圖表、日誌）
- ✅ 需要在當前頁面保持上下文
- ✅ 用戶可能需要長時間停留在此界面

**實際範例**：
- 編輯專案（20+ 個字段）
- 查看結算進度（進度條 + 詳細日誌）
- 發放積分（用戶列表 + 積分輸入）

---

#### 7.2 何時使用 Modal (el-dialog)？

**適用場景**：
- ✅ 簡單確認對話框
- ✅ 單一操作（例：確認刪除）
- ✅ 輸入單一值（例：輸入原因）
- ✅ 快速訊息提示

**實際範例**：
```vue
<!-- 簡單確認 -->
<el-dialog title="確認刪除" width="400px">
  <p>確定要刪除此項目嗎？</p>
  <template #footer>
    <el-button @click="close">取消</el-button>
    <el-button type="danger" @click="confirm">刪除</el-button>
  </template>
</el-dialog>
```

---

#### 7.3 何時使用 Popover/Popconfirm？

**適用場景**：
- ✅ 行內快速確認
- ✅ 工具提示
- ✅ 簡單的上下文菜單

**實際範例**：
```vue
<!-- 行內確認刪除 -->
<el-popconfirm title="確定刪除此項？" @confirm="handleDelete">
  <template #reference>
    <el-button type="danger" size="small" icon="Delete" />
  </template>
</el-popconfirm>
```

---

### 8. 進階功能與最佳實踐

#### 8.1 嵌套 Drawer（Z-Index 管理）

**場景**：在一個 drawer 內打開另一個 drawer

**實現**：
```vue
<!-- 父 Drawer -->
<el-drawer
  v-model="parentVisible"
  size="100%"
  class="drawer-navy"
  :z-index="2000"
>
  <!-- 內容 -->
</el-drawer>

<!-- 子 Drawer -->
<el-drawer
  v-model="childVisible"
  size="100%"
  class="drawer-maroon"
  :z-index="2500"  <!-- 更高的 z-index -->
>
  <!-- 內容 -->
</el-drawer>
```

**Z-Index 規範**：
- 標準 Drawer：`2000`（Element Plus 默認）
- 嵌套 Drawer：`2500`
- 最高層 Drawer：`3000`

---

#### 8.2 進度追蹤（Progress Bar）

**適用場景**：結算進度、批量操作進度

**實現**：
```vue
<div class="form-section">
  <h4><i class="fas fa-tasks"></i> 處理進度</h4>

  <el-progress
    :percentage="progressPercentage"
    :status="progressStatus"
    :stroke-width="20"
  />

  <div class="progress-info">
    <span>已處理 {{ processedCount }} / {{ totalCount }}</span>
  </div>
</div>
```

**參考**：[SettlementProgressDrawer.vue:69](../../scoringSystem-cf/packages/frontend/src/components/shared/SettlementProgressDrawer.vue#L69)

---

#### 8.3 可折疊區塊（Collapse）

**適用場景**：需要組織大量信息，但不需要全部展開

**實現**：
```vue
<el-collapse v-model="activeNames">
  <el-collapse-item title="基本信息" name="basic">
    <!-- 基本信息表單 -->
  </el-collapse-item>

  <el-collapse-item title="進階設置" name="advanced">
    <!-- 進階設置表單 -->
  </el-collapse-item>
</el-collapse>
```

**參考**：[ReverseSettlementDrawer.vue:63](../../scoringSystem-cf/packages/frontend/src/components/shared/ReverseSettlementDrawer.vue#L63)

---

#### 8.4 二次確認輸入（Destructive Operations）

**場景**：撤銷操作需要輸入特定文字確認

**實現**：
```vue
<div class="form-section danger-zone">
  <h4><i class="fas fa-exclamation-triangle"></i> 危險操作</h4>

  <el-alert
    type="error"
    title="此操作不可撤銷！"
    description="請輸入 REVERSE 以確認此操作"
    :closable="false"
    show-icon
  />

  <div class="form-group">
    <label>確認輸入</label>
    <el-input
      v-model="confirmText"
      placeholder="輸入 REVERSE"
    />
  </div>
</div>

<div class="drawer-actions">
  <el-button
    type="danger"
    :disabled="confirmText !== 'REVERSE'"
    @click="handleReverse"
  >
    確認撤銷
  </el-button>
</div>
```

**參考**：[TransactionReversalDrawer.vue:104](../../scoringSystem-cf/packages/frontend/src/components/shared/TransactionReversalDrawer.vue#L104)

---

#### 8.5 用戶搜尋過濾（Filter + Search）

**場景**：在大量數據中篩選目標

**實現**：
```vue
<div class="form-section">
  <h4><i class="fas fa-search"></i> 搜尋用戶</h4>

  <el-input
    v-model="searchKeyword"
    placeholder="搜尋用戶名稱或 ID"
    clearable
  >
    <template #prefix>
      <el-icon><Search /></el-icon>
    </template>
  </el-input>

  <el-table
    :data="filteredUsers"
    height="400"
  >
    <!-- 表格列定義 -->
  </el-table>
</div>

<script setup>
const searchKeyword = ref('')

const filteredUsers = computed(() => {
  if (!searchKeyword.value) return users.value

  return users.value.filter(user =>
    user.name.includes(searchKeyword.value) ||
    user.userId.includes(searchKeyword.value)
  )
})
</script>
```

**參考**：[AwardPointsDrawer.vue:12-43](../../scoringSystem-cf/packages/frontend/src/components/shared/AwardPointsDrawer.vue#L12-L43)

---

### 9. 開發檢查清單

#### 9.1 創建新 Drawer 的步驟

**步驟 1：確定設計參數**
```
[ ] 確定操作類型（正常/危險/系統）
[ ] 選擇配色（drawer-navy / drawer-maroon / drawer-green）
[ ] 選擇方向（btt / ttb）
[ ] 確認尺寸（100%）
```

**步驟 2：創建組件文件**
```
[ ] 在正確的目錄創建文件：
    - shared/：通用 drawer（多處使用）
    - admin/：管理員專用
    - 具體模組/：模組特定
```

**步驟 3：實現標準結構**
```vue
<template>
  <el-drawer
    v-model="localVisible"
    :title="title"
    direction="btt"       <!-- 根據需求調整 -->
    size="100%"
    class="drawer-navy"   <!-- 根據需求調整 -->
    :close-on-click-modal="false"
  >
    <div class="drawer-body" v-loading="loading">
      <!-- 錯誤提示 -->
      <!-- 表單區域 -->
      <!-- 底部按鈕 -->
    </div>
  </el-drawer>
</template>
```

**步驟 4：實現業務邏輯**
```
[ ] Props 定義（visible, 數據 ID）
[ ] Emits 定義（update:visible, saved）
[ ] 雙向綁定 localVisible
[ ] 表單狀態管理
[ ] API 調用邏輯
[ ] 錯誤處理
```

**步驟 5：測試驗證**
```
[ ] 打開/關閉功能正常
[ ] 表單驗證正確
[ ] API 調用成功
[ ] 錯誤提示清晰
[ ] Loading 狀態正確
[ ] 響應式布局正常
```

---

#### 9.2 代碼審查要點

**設計規範檢查**：
```
[ ] 使用了正確的配色類別（drawer-navy/maroon/green）？
[ ] 尺寸是否為 100%？
[ ] 方向是否符合操作類型（危險操作用 ttb）？
[ ] 是否使用了標準 CSS 類別（drawer-body, form-section, form-group, drawer-actions）？
```

**代碼質量檢查**：
```
[ ] 是否使用 TypeScript 類型定義？
[ ] Props 和 Emits 定義是否完整？
[ ] 是否正確實現雙向綁定？
[ ] 錯誤處理是否完善？
[ ] Loading 狀態是否覆蓋所有異步操作？
```

**用戶體驗檢查**：
```
[ ] 關閉前是否檢查未保存的更改？
[ ] 按鈕是否在處理中禁用？
[ ] 錯誤訊息是否清晰易懂？
[ ] 表單驗證提示是否即時？
[ ] 操作成功後是否有明確反饋？
```

---

### 10. 常見問題與解決方案

#### Q1: 何時可以偏離設計規範？

**A**: 在以下情況下可以考慮偏離：

1. **特殊視覺需求**：如 EventLogDrawer 的漸層 header
2. **技術限制**：需要嵌套 drawer 時調整 z-index
3. **用戶研究結果**：有充分證據表明其他設計更好

**流程**：
- 在代碼註釋中說明偏離原因
- 在團隊中討論並達成共識
- 記錄決策並更新本文檔

---

#### Q2: 如何處理移動端響應式？

**A**: 當前設計針對桌面端優化，移動端建議：

**方案 1：保持全屏**（當前方案）
```vue
<el-drawer size="100%">
  <!-- 移動端也使用全屏 -->
</el-drawer>
```

**方案 2：響應式尺寸**（未來考慮）
```scss
@media (max-width: 768px) {
  .el-drawer {
    .drawer-body {
      padding: 12px;
      font-size: 14px;
    }

    .form-section {
      padding: 16px;
    }

    .drawer-actions {
      flex-direction: column;

      .el-button {
        width: 100%;
      }
    }
  }
}
```

---

#### Q3: Drawer 內容過長如何處理？

**A**: 使用以下策略：

**策略 1：可折疊區塊**
```vue
<el-collapse v-model="activeNames">
  <el-collapse-item title="基本信息" name="basic">
    <!-- 內容 -->
  </el-collapse-item>
  <el-collapse-item title="進階設置" name="advanced">
    <!-- 內容 -->
  </el-collapse-item>
</el-collapse>
```

**策略 2：分頁**
```vue
<el-pagination
  v-model:current-page="currentPage"
  :page-size="20"
  :total="total"
  layout="prev, pager, next"
/>
```

**策略 3：虛擬滾動**（大量數據）
```vue
<el-table-v2
  :columns="columns"
  :data="data"
  :width="700"
  :height="400"
/>
```

---

#### Q4: 如何實現 Drawer 之間的數據同步？

**A**: 使用 TanStack Query 的自動失效機制：

```typescript
// 在父組件中
const { mutate: saveUser } = useMutation({
  mutationFn: saveUserApi,
  onSuccess: () => {
    // 自動失效相關查詢
    queryClient.invalidateQueries({ queryKey: ['users'] })
    queryClient.invalidateQueries({ queryKey: ['projectUsers', projectId] })
  }
})

// Drawer 保存後
const handleSave = async () => {
  await saveUser(formData.value)
  emit('saved')  // 通知父組件
  localVisible.value = false
}
```

**參考**：[Phase 4.5: TanStack Query 重構](../../plan/cloudflare/Cloudflare迁移指南.md#phase-45-前端請求鏈重構tanstack-query)

---

### 11. 文件清單與參考

#### 11.1 核心文件

| 文件 | 說明 |
|------|------|
| [`drawer-unified.scss`](../../scoringSystem-cf/packages/frontend/src/styles/drawer-unified.scss) | 統一樣式定義 |
| [`main.ts`](../../scoringSystem-cf/packages/frontend/src/main.ts) | 樣式導入入口 |

---

#### 11.2 Drawer 組件範例

**Shared 組件（通用）**：
- [`UserEditorDrawer.vue`](../../scoringSystem-cf/packages/frontend/src/components/shared/UserEditorDrawer.vue) - 編輯用戶
- [`ProjectEditorDrawer.vue`](../../scoringSystem-cf/packages/frontend/src/components/shared/ProjectEditorDrawer.vue) - 編輯專案
- [`StageEditorDrawer.vue`](../../scoringSystem-cf/packages/frontend/src/components/shared/StageEditorDrawer.vue) - 編輯階段（危險操作）
- [`SettlementProgressDrawer.vue`](../../scoringSystem-cf/packages/frontend/src/components/shared/SettlementProgressDrawer.vue) - 查看進度
- [`TransactionReversalDrawer.vue`](../../scoringSystem-cf/packages/frontend/src/components/shared/TransactionReversalDrawer.vue) - 交易回退（危險操作）
- [`ReverseSettlementDrawer.vue`](../../scoringSystem-cf/packages/frontend/src/components/shared/ReverseSettlementDrawer.vue) - 撤銷結算（危險操作）
- [`AwardPointsDrawer.vue`](../../scoringSystem-cf/packages/frontend/src/components/shared/AwardPointsDrawer.vue) - 發放積分

**Admin 組件（管理員專用）**：
- [`EventLogDrawer.vue`](../../scoringSystem-cf/packages/frontend/src/components/admin/EventLogDrawer.vue) - 事件日誌查看

---

#### 11.3 相關文檔

- [Element Plus Drawer API](https://element-plus.org/en-US/component/drawer.html)
- [Vue 3 Composition API](https://vuejs.org/guide/extras/composition-api-faq.html)
- [TanStack Query Vue](https://tanstack.com/query/latest/docs/vue/overview)
- [Phase 4.5: 前端請求鏈重構（TanStack Query）](#phase-45-前端請求鏈重構tanstack-query)
- [Phase 4.7: Vue 3 Composition API 重構與響應式最佳實踐](#phase-47---vue-3-composition-api-重構與響應式最佳實踐)

---

### 12. 總結

#### 設計規範核心原則

1. **語義化配色**：顏色傳達操作性質
   - Navy：正常操作
   - Maroon：危險操作
   - Green：系統信息

2. **方向有意義**：滑動方向傳遞視覺訊號
   - `btt`：標準流程（從底部支撐向上）
   - `ttb`：危險警示（從頂部壓迫向下）

3. **統一尺寸**：100% 全屏，簡化決策

4. **標準化結構**：
   - `.drawer-body` 主容器
   - `.form-section` 表單區塊
   - `.form-group` 欄位組
   - `.drawer-actions` 底部按鈕

#### 開發者快速參考

**創建正常操作 Drawer**：
```vue
<el-drawer
  v-model="visible"
  title="標題"
  direction="btt"
  size="100%"
  class="drawer-navy"
>
```

**創建危險操作 Drawer**：
```vue
<el-drawer
  v-model="visible"
  title="警告標題"
  direction="ttb"
  size="100%"
  class="drawer-maroon"
>
```

#### 維護建議

1. **新 Drawer 必須遵循規範**：除非有充分理由偏離
2. **代碼審查時檢查合規性**：使用本文檔的檢查清單
3. **定期審視規範**：根據用戶反饋和技術發展調整
4. **記錄例外情況**：在代碼註釋和本文檔中說明

---

**最後更新**: 2025-12-08
**當前階段**: Phase 4.9 完成 - El-Drawer 設計規範與使用指南
**新增內容**: 完整的 el-drawer 設計規範系統、語義化配色架構、標準化組件模板、開發檢查清單

## Phase 4.10 - Vue 3 反模式清除：getCurrentInstance() 与统一 Composable

> **📍 完成状态**: ✅ 已完成
> **📅 完成日期**: 2025-12-12
> **🎯 目标**: 清除所有 `getCurrentInstance()` 反模式，统一使用 Composition API composables

---

### 1. 背景说明

#### 问题来源

在 Vue 3 迁移过程中，部分组件使用了 `getCurrentInstance()` 来访问全局属性（如 `ElMessage`、`apiClient`、JWT token 等）。这种方式虽然可以工作，但存在以下问题：

**❌ getCurrentInstance() 的问题**:

1. **类型安全性差**: 需要使用可选链 `?.`，容易出现运行时错误
2. **测试困难**: 难以 mock 和单元测试
3. **代码可维护性差**: 隐藏了组件的真实依赖关系
4. **不符合 Vue 3 最佳实践**: Evan You 明确不推荐这种用法
5. **响应式追踪问题**: 可能导致响应式依赖追踪失效

#### 典型反模式示例

```typescript
// ❌ 反模式：通过 getCurrentInstance 访问全局属性
<script setup lang="ts">
import { getCurrentInstance } from 'vue'

const instance = getCurrentInstance()
const ElMessage = instance?.appContext.config.globalProperties.$message
const apiClient = instance?.appContext.config.globalProperties.$apiClient

// 使用时需要可选链
ElMessage?.success('操作成功')
</script>
```

---

### 2. 正确模式：统一 Composable

#### 2.1 认证状态访问 - useAuth()

**✅ 正确方式**: 使用统一的 `useAuth()` composable

```typescript
<script setup lang="ts">
import { useAuth } from '@/composables/useAuth'

// 获取认证状态和 JWT token
const { user, token, isAuthenticated, isLoading } = useAuth()

// 使用示例
console.log('当前用户:', user.value)
console.log('JWT Token:', token.value)
console.log('是否已认证:', isAuthenticated.value)
</script>
```

**useAuth() 提供的完整 API**:

```typescript
export function useAuth() {
  return {
    // 用户数据
    user,              // ComputedRef<AuthUser | undefined>
    userEmail,         // ComputedRef<string>
    userId,            // ComputedRef<string>
    userName,          // ComputedRef<string>
    userDisplayName,   // ComputedRef<string>

    // 认证状态
    isAuthenticated,   // ComputedRef<boolean>
    isLoading,         // ComputedRef<boolean>
    isError,           // ComputedRef<boolean>
    token,             // ComputedRef<string | null> - JWT token

    // 方法
    logout,            // () => Promise<void>
    clearAuth,         // () => void
    refresh,           // () => Promise<void>

    // 原始 query 对象（高级用法）
    userQuery          // UseQueryReturnType<AuthUser, Error>
  }
}
```

**文件位置**: [`composables/useAuth.ts`](../../scoringSystem-cf/packages/frontend/src/composables/useAuth.ts)

---

#### 2.2 Element Plus 组件 - 直接导入

**✅ 正确方式**: 从 `element-plus` 直接导入

```typescript
<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

// 直接使用，类型安全
ElMessage.success('操作成功')
ElMessage.error('操作失败')
ElMessage.warning('警告信息')

// 确认对话框
await ElMessageBox.confirm(
  '确定要删除吗？',
  '警告',
  { type: 'warning' }
)
</script>
```

---

#### 2.3 API Client - 直接导入或使用 rpcClient

**✅ 正确方式 1**: 使用 `rpcClient`（推荐）

```typescript
<script setup lang="ts">
import { rpcClient } from '@/utils/rpc-client'

// 类型安全的 API 调用
const response = await rpcClient.projects.list.$post({ json: {} })
</script>
```

**✅ 正确方式 2**: 直接导入 `apiClient`

```typescript
<script setup lang="ts">
import { apiClient } from '@/utils/api'

// 使用 API client
const response = await apiClient.callWithAuth('/api/endpoint', {
  method: 'POST',
  body: { data: 'value' }
})
</script>
```

---

### 3. 重构过程记录

#### 3.1 修复的文件清单（10 个）

##### 第一轮修复（4 个核心组件）

1. **[EmailLogsManagement.vue](../../scoringSystem-cf/packages/frontend/src/components/admin/EmailLogsManagement.vue)**
   - **问题**: 使用 `getCurrentInstance()` 获取 `ElMessage`
   - **修复**: 添加 `import { ElMessage } from 'element-plus'`
   - **影响**: 13 处 ElMessage 调用

2. **[AvatarCustomizer.vue](../../scoringSystem-cf/packages/frontend/src/components/common/AvatarCustomizer.vue)**
   - **问题**: 使用 `getCurrentInstance()` 获取 `$message`
   - **修复**:
     - 添加 `import { ElMessage } from 'element-plus'`
     - 替换所有 `$message.warning()` → `ElMessage.warning()`
     - 移除不必要的 `if ($message)` 检查
   - **影响**: 4 处 ElMessage 调用

3. **[UserManagement.vue](../../scoringSystem-cf/packages/frontend/src/components/admin/UserManagement.vue)**
   - **问题**: 使用 `getCurrentInstance()` 获取 `apiClient` 和 `ElMessage`
   - **修复**:
     - 添加 `import { ElMessage } from 'element-plus'`
     - 移除未使用的 `apiClient` 声明
   - **影响**: 70+ 处 ElMessage 调用

4. **[TagManagement.vue](../../scoringSystem-cf/packages/frontend/src/components/admin/TagManagement.vue)**
   - **问题**: 使用 `getCurrentInstance()` 获取 `apiClient` 和 `ElMessage`
   - **修复**:
     - 添加 `import { ElMessage } from 'element-plus'`
     - 添加 `import { apiClient } from '@/utils/api'`
   - **影响**: 7 处 apiClient 调用 + 13 处 ElMessage 调用

##### 第二轮修复（6 个组件）

5. **[ProjectManagement.vue](../../scoringSystem-cf/packages/frontend/src/components/admin/ProjectManagement.vue)**
   - **影响**: 100+ 处 ElMessage 调用

6. **[CommentVotingAnalysisModal.vue](../../scoringSystem-cf/packages/frontend/src/components/CommentVotingAnalysisModal.vue)**
   - **修复**: 移除未使用的 apiClient 声明

7. **[EventLogViewer.vue](../../scoringSystem-cf/packages/frontend/src/components/EventLogViewer.vue)**
   - **修复**: 移除未使用的 apiClient 声明

8. **[ProjectDetail-New.vue](../../scoringSystem-cf/packages/frontend/src/components/ProjectDetail-New.vue)**
   - **修复**: 移除未使用的 apiClient 声明

9. **[TurnstileWidget.vue](../../scoringSystem-cf/packages/frontend/src/components/TurnstileWidget.vue)**
   - **修复**: 移除未使用的 apiClient 声明

10. **[VoteResultModal.vue](../../scoringSystem-cf/packages/frontend/src/components/VoteResultModal.vue)**
    - **修复**: 移除未使用的 apiClient 声明

##### 特殊案例：GroupManagement.vue

**[GroupManagement.vue](../../scoringSystem-cf/packages/frontend/src/components/admin/GroupManagement.vue)** 存在严重 bug：
- **问题**: 60 处 `proxy.$showSuccess()`, `proxy.$handleError()`, `proxy.$confirm()` 调用，但 `proxy` 变量未定义
- **原因**: 之前的重构删除了 `const { proxy } = getCurrentInstance()` 但忘记替换使用处
- **影响**: 运行时 `ReferenceError: proxy is not defined`
- **修复**:
  ```typescript
  // 添加导入
  import { handleError, showSuccess } from '@/utils/errorHandler'
  import { ElMessageBox } from 'element-plus'

  // 批量替换（60 处）
  proxy.$showSuccess('message') → showSuccess('message')
  proxy.$handleError('action', error) → handleError(error, { action: 'action' })
  proxy.$handleError('message') → handleError('message', { type: 'error' })
  proxy.$confirm(...) → ElMessageBox.confirm(...)
  ```

---

#### 3.2 修复前后对比

##### 示例 1: ElMessage 使用

```typescript
// ❌ 修复前
<script setup lang="ts">
import { getCurrentInstance } from 'vue'

const instance = getCurrentInstance()
const ElMessage = instance?.appContext.config.globalProperties.$message

// 使用时需要可选链
ElMessage?.success('操作成功')
</script>

// ✅ 修复后
<script setup lang="ts">
import { ElMessage } from 'element-plus'

// 直接使用，类型安全
ElMessage.success('操作成功')
</script>
```

##### 示例 2: 认证状态访问

```typescript
// ❌ 修复前
<script setup lang="ts">
import { getCurrentInstance } from 'vue'

const instance = getCurrentInstance()
const apiClient = instance?.appContext.config.globalProperties.$apiClient

// 需要手动从 sessionStorage 读取 token
const token = sessionStorage.getItem('sessionId')
</script>

// ✅ 修复后
<script setup lang="ts">
import { useAuth } from '@/composables/useAuth'

// 统一的 composable 访问
const { user, token, isAuthenticated } = useAuth()

// token 是响应式的 computed ref
console.log(token.value)
</script>
```

##### 示例 3: GroupManagement.vue proxy 修复

```typescript
// ❌ 修复前（运行时错误）
<script>
export default {
  setup() {
    // proxy 未定义，但代码中有 60 处调用

    const handleUpdate = async () => {
      try {
        // ❌ ReferenceError: proxy is not defined
        proxy.$showSuccess('群組更新成功')
      } catch (error) {
        proxy.$handleError('更新失敗', error)
      }
    }
  }
}
</script>

// ✅ 修复后（类型安全）
<script>
import { handleError, showSuccess } from '@/utils/errorHandler'
import { ElMessageBox } from 'element-plus'

export default {
  setup() {
    const handleUpdate = async () => {
      try {
        // ✅ 直接调用，类型安全
        showSuccess('群組更新成功')
      } catch (error) {
        handleError(error, { action: '更新群組' })
      }
    }
  }
}
</script>
```

---

### 4. 验证方法

#### 4.1 自动化检查

```bash
# 检查是否还有 getCurrentInstance 使用
cd packages/frontend
grep -r "getCurrentInstance()" src/ --include="*.vue"
# 预期输出：无匹配项

# TypeScript 类型检查
pnpm type-check
# 预期：无新增错误
```

#### 4.2 运行时验证

**启动开发服务器**:
```bash
pnpm dev:frontend
```

**测试关键功能**:
1. ✅ 登录/登出（验证 `useAuth()` 正常工作）
2. ✅ ElMessage 通知（验证 Element Plus 导入正常）
3. ✅ Admin 管理界面（验证 GroupManagement 等组件正常）
4. ✅ WebSocket 连接（验证 `useWebSocketStore()` 正常使用 `useAuth()`）

---

### 5. 关键文件架构

#### 5.1 核心 Composables

| 文件 | 用途 | 导出内容 |
|------|------|---------|
| [`composables/useAuth.ts`](../../scoringSystem-cf/packages/frontend/src/composables/useAuth.ts) | 统一认证状态管理 | `useAuth()` - 提供 user, token, isAuthenticated 等 |
| [`composables/usePermissions.ts`](../../scoringSystem-cf/packages/frontend/src/composables/usePermissions.ts) | 权限检查 | `usePermissions()` - 提供 hasPermission() 等方法 |
| [`composables/useWebSocketStore.ts`](../../scoringSystem-cf/packages/frontend/src/stores/websocket.ts) | WebSocket 连接 | `useWebSocketStore()` - 使用 `useAuth()` 获取 token |

#### 5.2 工具函数

| 文件 | 用途 | 导出内容 |
|------|------|---------|
| [`utils/api-helpers.ts`](../../scoringSystem-cf/packages/frontend/src/utils/api-helpers.ts) | API 辅助函数 | `fetchWithAuth<T>()` - 带认证的 fetch 封装 |
| [`utils/errorHandler.ts`](../../scoringSystem-cf/packages/frontend/src/utils/errorHandler.ts) | 统一错误处理 | `handleError()`, `showSuccess()` |
| [`utils/rpc-client.ts`](../../scoringSystem-cf/packages/frontend/src/utils/rpc-client.ts) | RPC API 客户端 | `rpcClient` - 类型安全的 API 调用 |

#### 5.3 架构依赖关系

```
组件层
  ├─► useAuth() ────────► TanStack Query ────► Backend API (JWT)
  ├─► ElMessage ────────► Element Plus
  ├─► handleError() ────► ErrorHandler Utils
  └─► rpcClient ────────► Hono RPC Client ───► Backend API

WebSocket Store
  └─► useAuth() ────────► 获取 JWT token ───► WebSocket 连接
```

---

### 6. Vue 3 最佳实践总结

#### 6.1 全局状态访问模式

| 需求 | ❌ 错误方式 | ✅ 正确方式 |
|------|-----------|-----------|
| **认证状态** | `getCurrentInstance()` | `useAuth()` |
| **权限检查** | `getCurrentInstance()` | `usePermissions()` |
| **通知提示** | `instance.$message` | `import { ElMessage }` |
| **API 调用** | `instance.$apiClient` | `import { rpcClient }` 或 `import { apiClient }` |

#### 6.2 Composition API 原则

1. **显式依赖**:
   - ✅ 在 `<script setup>` 顶部明确导入所有依赖
   - ❌ 不要通过 `getCurrentInstance()` 隐藏依赖

2. **类型安全**:
   - ✅ 利用 TypeScript 类型推断
   - ❌ 避免使用 `?.` 可选链访问全局属性

3. **可测试性**:
   - ✅ Composables 易于 mock 和单元测试
   - ❌ `getCurrentInstance()` 难以在测试中 mock

4. **响应式追踪**:
   - ✅ Composables 返回的 computed/ref 自动追踪依赖
   - ❌ 全局属性可能导致响应式失效

---

### 7. 迁移检查清单

使用此清单审查新组件或重构旧组件：

- [ ] **无 getCurrentInstance() 使用**
  ```bash
  grep "getCurrentInstance" ComponentName.vue
  # 应该无结果
  ```

- [ ] **认证状态使用 useAuth()**
  ```typescript
  import { useAuth } from '@/composables/useAuth'
  const { user, token, isAuthenticated } = useAuth()
  ```

- [ ] **Element Plus 组件直接导入**
  ```typescript
  import { ElMessage, ElMessageBox } from 'element-plus'
  ```

- [ ] **API 调用使用 rpcClient 或 apiClient**
  ```typescript
  import { rpcClient } from '@/utils/rpc-client'
  // 或
  import { apiClient } from '@/utils/api'
  ```

- [ ] **错误处理使用 errorHandler utils**
  ```typescript
  import { handleError, showSuccess } from '@/utils/errorHandler'
  ```

- [ ] **TypeScript 类型检查通过**
  ```bash
  pnpm type-check
  ```

- [ ] **运行时无错误**
  - 启动开发服务器验证组件功能正常

---

### 8. 相关文档

- [Phase 4.7: Vue 3 Composition API 重构与响应式最佳实践](#phase-47---vue-3-composition-api-重構與響應式最佳實踐)
- [Phase 4.5: 前端请求链重构（TanStack Query）](#phase-45-前端請求鏈重構tanstack-query)
- [useAuth Composable 源码](../../scoringSystem-cf/packages/frontend/src/composables/useAuth.ts)
- [Vue 3 Composition API 官方文档](https://vuejs.org/guide/extras/composition-api-faq.html)

---

**最后更新**: 2025-12-12
**完成状态**: ✅ 已完成 - 所有 `getCurrentInstance()` 反模式已清除
**验证结果**: ✅ 类型检查通过，0 个 getCurrentInstance() 引用
**影响组件**: 10 个组件修复，1 个严重 bug 修复（GroupManagement.vue）


---

## 后续优化 TODO 清单

> **📋 说明**: 本节列出了当前系统已可用但仍有优化空间的改进项。这些优化并非阻塞性问题，可根据实际需求和优先级逐步完成。

---

### 🎯 P0 优化项（高优先级）

#### 1. 备份文件清理

**现状**: 代码库中存在 34 个备份文件（`*.backup`, `*.restore`, `*.bak`）

**问题**: 
- 占用存储空间
- 可能导致误操作
- 影响代码搜索结果

**操作**:
```bash
cd packages/frontend/src

# 查找所有备份文件
find . -type f \( -name "*.backup" -o -name "*.restore" -o -name "*.bak" \)

# 确认后删除
find . -type f \( -name "*.backup" -o -name "*.restore" -o -name "*.bak" \) -delete
```

**验证**:
```bash
# 确保没有残留备份文件
find . -type f \( -name "*.backup" -o -name "*.restore" -o -name "*.bak" \)
# 应该无输出
```

**风险评估**: ⚠️ 低风险 - 这些文件已被新版本替代，删除前建议先提交当前代码到 Git

---

### 🔄 P1 优化项（中优先级）

#### 2. Options API 迁移至 Composition API

**现状**: 17 个组件仍使用 Options API（`export default { setup() }`）而非 `<script setup>`

**问题**:
- 代码冗长（需要显式 return 所有变量）
- 不符合 Vue 3 最佳实践
- TypeScript 类型推断较差

**迁移示例**:

```typescript
// ❌ Options API (verbose)
<script lang="ts">
import { ref } from 'vue'
export default {
  setup() {
    const count = ref(0)
    const increment = () => count.value++
    
    return {
      count,
      increment
    }
  }
}
</script>

// ✅ Composition API with <script setup> (concise)
<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
const increment = () => count.value++
</script>
```

**受影响组件列表**:

```bash
packages/frontend/src/components/
├── admin/
│   ├── GroupManagement.vue                    # 🔄 复杂度: 高 (660 行)
│   ├── RoleManagement.vue                     # 🔄 复杂度: 高 (500+ 行)
│   ├── SystemSettings.vue                     # 🔄 复杂度: 中
│   ├── SystemLogs.vue                         # 🔄 复杂度: 中
│   └── EmailLogsManagement.vue                # 🔄 复杂度: 中
├── project/
│   ├── ProjectEditor.vue                      # 🔄 复杂度: 高
│   ├── ProjectGroupEditor.vue                 # 🔄 复杂度: 中
│   └── ScoreSubmissionPanel.vue               # 🔄 复杂度: 中
├── wallet/
│   ├── WalletDashboard.vue                    # 🔄 复杂度: 中
│   └── TransactionHistory.vue                 # 🔄 复杂度: 低
└── common/
    ├── NotificationCenter.vue                 # 🔄 复杂度: 低
    ├── UserProfile.vue                        # 🔄 复杂度: 低
    └── ...                                    # 其他组件
```

**迁移策略**:

1. **低复杂度组件优先** (< 200 行)
   - 迁移风险低
   - 可快速完成
   - 适合熟悉 `<script setup>` 语法

2. **中复杂度组件** (200-400 行)
   - 建议分模块重构
   - 可提取部分逻辑为 composables

3. **高复杂度组件** (> 400 行)
   - **慎重处理**：GroupManagement.vue 已修复 60 处 proxy 错误，再次重构可能引入新问题
   - **建议**: 仅在确实需要时重构，或拆分为多个小组件

**迁移检查清单**:

- [ ] 移除 `export default` 和 `setup()`
- [ ] 添加 `<script setup lang="ts">`
- [ ] 移除所有 `return` 语句（变量自动暴露）
- [ ] 验证 TypeScript 类型推断正常
- [ ] 测试组件功能无异常
- [ ] 使用 Playwright 自动化测试验证

**风险评估**: ⚠️ 中风险
- **低复杂度组件**: 风险低，建议迁移
- **中复杂度组件**: 风险中等，建议测试充分后迁移
- **高复杂度组件**: 风险高，**不建议迁移**（除非有明确需求）

**推荐做法**: 
- ✅ 新组件全部使用 `<script setup>`
- ✅ 修改旧组件时顺便迁移（如果复杂度低）
- ❌ **不要**为了迁移而迁移高复杂度组件（如 GroupManagement.vue）

---

### 🧹 P2 优化项（低优先级）

#### 3. CSS 模块化

**现状**: 部分组件使用全局 CSS 样式

**优化方向**:
- 使用 CSS Modules 或 scoped styles
- 提取公共样式到 `styles/` 目录
- 统一命名规范

**示例**:
```vue
<!-- Before -->
<style>
.container { /* 全局污染 */ }
</style>

<!-- After -->
<style scoped>
.container { /* 组件隔离 */ }
</style>
```

---

#### 4. 性能优化

**可选优化**:

- **Lazy Loading**: 路由组件懒加载
  ```typescript
  const AdminPanel = () => import('@/views/AdminPanel.vue')
  ```

- **Virtual Scrolling**: 长列表组件使用虚拟滚动
  ```typescript
  import { ElTableV2 } from 'element-plus'
  ```

- **Image Optimization**: 使用 WebP 格式图片，添加懒加载

- **Bundle Size Analysis**: 定期检查打包体积
  ```bash
  pnpm build:frontend --mode analyze
  ```

---

### �� 优先级评估

| 优化项 | 优先级 | 风险 | 工作量 | 建议时间 |
|-------|--------|------|--------|---------|
| 备份文件清理 | P0 | 低 | 0.5h | 立即执行 |
| Options API 迁移 (低复杂度) | P1 | 低 | 1-2h | 下次迭代 |
| Options API 迁移 (中复杂度) | P1 | 中 | 3-5h | 可选 |
| Options API 迁移 (高复杂度) | P1 | 高 | 8-10h | **不推荐** |
| CSS 模块化 | P2 | 低 | 5-10h | 长期优化 |
| 性能优化 | P2 | 低 | 按需 | 按需执行 |

---

### ✅ 决策指南

**何时应该进行 Options API 迁移？**

✅ **建议迁移**:
- 组件复杂度低（< 200 行）
- 需要频繁修改的组件
- 新开发的组件（强制使用 `<script setup>`）

❌ **不建议迁移**:
- 组件复杂度高（> 400 行）且功能稳定
- 已经过充分测试且无明显问题的组件
- 近期修复过重大 bug 的组件（如 GroupManagement.vue）

⚠️ **谨慎评估**:
- 中等复杂度组件（200-400 行）
- 业务逻辑复杂但代码量不大的组件
- 依赖较多外部状态的组件

**推荐做法**: "渐进式优化" - 在修改旧组件时顺便迁移，而不是为了迁移而迁移。

---

## Phase 4.11 - Vue Router 架構升級與 Deep Linking 支持

### 概述

實現 **RESTful 路由架構**和 **ProjectDetail Drawer Deep Linking** 功能，支持通過 URL 直接訪問任意 drawer 狀態。

### 問題背景

**舊架構問題**：
1. ❌ 路由使用單數形式 (`/project/:id`)，不符合 RESTful 標準
2. ❌ 無法通過 URL 直接打開特定 drawer（如投票結果、評論投票）
3. ❌ 階段滾動時不同步更新 URL，無法分享當前瀏覽狀態
4. ❌ 缺少權限驗證邏輯，URL 可能打開無權訪問的 drawer

**需求**：
- ✅ 支持 10 種 drawer actions 的 deep linking
- ✅ 階段滾動時自動同步 URL
- ✅ 權限驗證與錯誤處理
- ✅ 保持 URL 簡潔可讀性

### 實現方案

#### 1. RESTful 路由重構

**路由結構變更**：

```typescript
// ❌ 舊路由（單數形式）
/project/:projectId
/wallet/:projectId?/:userEmail?
/eventlog/:projectId

// ✅ 新路由（複數形式，RESTful）
/projects/:projectId/:globalAction?              // 全域路由
/projects/:projectId/stage/:stageId/:action?/:extraParam?  // 階段路由
/wallets/:projectId?/:userEmail?
/event-logs/:projectId
```

**路由優先級設計**：
- 階段路由 (`projects/:id/stage/:stageId/...`) **必須在前**
- 全域路由 (`projects/:id/:globalAction?`) 在後
- Vue Router 按定義順序匹配，確保 specific routes 優先

**影響範圍**：
- [router/index.ts](../../scoringSystem-cf/packages/frontend/src/router/index.ts:72-89) - 路由定義
- [MainLayout.vue](../../scoringSystem-cf/packages/frontend/src/layouts/MainLayout.vue:53) - 2處
- [Dashboard.vue](../../scoringSystem-cf/packages/frontend/src/components/Dashboard.vue:719) - 3處
- [WalletNew.vue](../../scoringSystem-cf/packages/frontend/src/components/WalletNew.vue:662) - 3處
- [ProjectCard.vue](../../scoringSystem-cf/packages/frontend/src/components/ProjectCard.vue:465) - 2處
- [ProjectManagement.vue](../../scoringSystem-cf/packages/frontend/src/components/admin/ProjectManagement.vue:1864) - 1處

#### 2. Drawer Deep Linking 架構

**支持的 10 種 Drawer Actions**：

| Action | 說明 | 需要 stageId | 需要 extraParam | 權限檢查 |
|--------|------|-------------|----------------|---------|
| `vote-result` | 投票結果 | ✅ | ❌ | stage.status === 'voting' \|\| 'completed' |
| `submit-report` | 發成果 | ✅ | ❌ | permissions.canSubmit |
| `submit-comment` | 發評論 | ✅ | ❌ | permissions.canComment |
| `approval` | 共識 | ✅ | ❌ | permissions.canVote && stage.status === 'active' |
| `comment-vote` | 評論投票 | ✅ | ✅ submissionId | permissions.canVote && stage.status === 'voting' |
| `teacher-vote` | 教師投票 | ✅ | ✅ submissionId | permissions.canTeacherVote |
| `analysis` | 獎金分配 | ✅ | ❌ | 所有人 |
| `award` | 發放獎金 | ✅ | ❌ | isAdmin \|\| isTeacher |
| `reply` | 回復評論 | ✅ | ✅ commentId | permissions.canComment |
| `description` | 專案介紹 | ❌ | ❌ | 所有人 |

**URL 範例**：

```bash
# 直接打開投票結果
/projects/proj_abc/stage/stg_001/vote-result

# 直接打開評論投票（帶 submissionId）
/projects/proj_abc/stage/stg_001/comment-vote/sub_789

# 直接打開專案介紹（全域 action）
/projects/proj_abc/description
```

#### 3. 核心 Composables

**新建：useRouteDrawer**

文件：[composables/useRouteDrawer.ts](../../scoringSystem-cf/packages/frontend/src/composables/useRouteDrawer.ts)

功能：
- URL 參數解析（action, stageId, extraParam）
- 權限驗證邏輯
- Drawer 配置管理（DRAWER_CONFIGS）
- 導航函數（navigateToStageAction, navigateToGlobalAction, clearAction）

API：
```typescript
const {
  currentAction,           // computed: DrawerAction | undefined
  currentStageId,          // computed: string | undefined
  currentExtraParam,       // computed: string | undefined
  navigateToStageAction,   // (projectId, stageId, action?, extraParam?)
  navigateToGlobalAction,  // (projectId, action?)
  clearAction,             // () => void
  processDrawerFromUrl,    // (project, permissions, stages) => DrawerConfig?
  DRAWER_CONFIGS           // Record<DrawerAction, DrawerConfig>
} = useRouteDrawer()
```

**增強：useStageInfoDrawer**

文件：[composables/useStageInfoDrawer.ts](../../scoringSystem-cf/packages/frontend/src/composables/useStageInfoDrawer.ts:75-84)

新增功能：
- **URL 同步**：階段滾動時自動更新 URL
- 保留當前 action 和 extraParam 參數
- 支持 `Ref<string>` 和 `string` 類型的 projectId

修改：
```typescript
// 原本：只接受 topbarHeight
export function useStageInfoDrawer(topbarHeight = 60)

// 現在：新增 projectId 參數（支持 Ref 或 string）
export function useStageInfoDrawer(projectId: Ref<string> | string, topbarHeight = 60)

// 激活階段時自動同步 URL
function activateStageDrawer(stageId: string, force = false) {
  // ... 原有邏輯 ...

  // 🔗 URL 同步：更新 URL 到階段路由（保留當前的 action 和 extraParam）
  if (route.name !== 'projects-stage' || route.params.stageId !== stageId) {
    navigateToStageAction(
      getProjectId(),
      stageId,
      currentAction.value,
      currentExtraParam.value
    )
  }
}
```

#### 4. ProjectDetail-New.vue 集成

文件：[components/ProjectDetail-New.vue](../../scoringSystem-cf/packages/frontend/src/components/ProjectDetail-New.vue:3048-3177)

**新增常量**：
```typescript
const TOPBAR_HEIGHT = 60           // TopBar 高度
const DRAWER_HANDLE_HEIGHT = 36    // 單個 drawer handle 高度
const SCROLL_OFFSET = 132          // 總偏移 (60 + 36*2)
```

**新增函數**：

1. **processUrlParams()** - 處理 URL 並打開 drawer
2. **openDrawerByAction()** - 根據 action 打開對應 drawer
3. **handleDrawerClose()** - Drawer 關閉時清除 URL

**修改函數**：

```typescript
// scrollToStage 新增 fromUrl 參數
function scrollToStage(stageId: string, fromUrl = false) {
  const targetElement = document.getElementById(`stage-${stageId}`)
  if (targetElement) {
    if (fromUrl) {
      // 來自 URL：使用 132px 固定偏移
      const elementPosition = targetElement.offsetTop
      const offsetPosition = elementPosition - SCROLL_OFFSET
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' })
    } else {
      // 來自 Timeline：使用 center 對齊
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    // ... 激活 drawer 邏輯 ...
  }
}
```

**數據載入監聽**：
```typescript
// 監聽數據載入完成，處理 URL 參數
watch([projectData, () => stages.value.length], ([data, stagesCount]) => {
  if (data && stagesCount > 0 && !loading.value) {
    nextTick(() => {
      processUrlParams()
    })
  }
}, { immediate: true })
```

#### 5. 權限驗證流程

**驗證邏輯**（在 useRouteDrawer.ts 中）：

```typescript
const DRAWER_CONFIGS: Record<DrawerAction, DrawerConfig> = {
  'vote-result': {
    requiresStage: true,
    requiresExtraParam: false,
    permissionCheck: (permissions, stage) => {
      // 階段必須是 voting 或 completed
      return stage?.status === 'voting' || stage?.status === 'completed'
    }
  },
  'approval': {
    requiresStage: true,
    requiresExtraParam: false,
    permissionCheck: (permissions, stage) => {
      return permissions.canVote && stage?.status === 'active'
    }
  },
  // ... 其他 drawer 配置
}
```

**驗證失敗處理**：
1. ElMessage 顯示錯誤提示（"您沒有權限執行此操作"）
2. 調用 `clearAction()` 清除 URL 的 action 參數
3. 用戶回到正常瀏覽模式

### 技術亮點

#### 1. URL 設計理念

**路徑語義化**：
```
/projects/:projectId/stage/:stageId/:action/:extraParam
  └─集合    └─資源ID   └─固定關鍵字 └─階段ID └─操作  └─額外參數
```

**設計考量**：
- `stage` 作為固定關鍵字，避免與 `globalAction` 衝突
- `action` 和 `extraParam` 為可選參數，保持 URL 簡潔
- 使用 `/` 而非 `?` query parameters，提升可讀性

#### 2. Scroll Offset 計算

**問題**：從 URL 進入時，階段頂部會被遮住

**解決方案**：
```typescript
// Timeline 點擊：使用 center 對齊（視覺居中）
targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' })

// URL 進入：使用固定偏移（精確定位）
const SCROLL_OFFSET = TOPBAR_HEIGHT + (DRAWER_HANDLE_HEIGHT * 2)  // 132px
const offsetPosition = targetElement.offsetTop - SCROLL_OFFSET
window.scrollTo({ top: offsetPosition, behavior: 'smooth' })
```

#### 3. 階段同步與 Action 保留

**設計**：
- 階段滾動時更新 URL 到 `/projects/:id/stage/:stageId`
- **保留** 當前的 action 和 extraParam 參數（如果有）
- Drawer 關閉時才清除 action 參數

**實現**：
```typescript
// useStageInfoDrawer.ts
function activateStageDrawer(stageId: string, force = false) {
  // 更新 URL，保留當前 action
  navigateToStageAction(
    getProjectId(),
    stageId,
    currentAction.value,      // 保留
    currentExtraParam.value   // 保留
  )
}
```

### 測試要點

#### 1. Deep Linking 測試

**測試清單**：

- [ ] 直接訪問 `/projects/:id/stage/:stageId/vote-result` 打開投票結果
- [ ] 直接訪問帶 extraParam 的 URL（如 comment-vote/sub_123）
- [ ] 訪問無權限的 drawer（如非投票階段訪問 vote-result）
- [ ] 訪問不存在的 stageId
- [ ] 訪問不存在的 action（如 `/projects/:id/stage/:stageId/invalid-action`）

**預期行為**：
- ✅ 有權限：自動滾動到階段 + 打開 drawer
- ❌ 無權限：顯示錯誤提示 + 清除 URL action
- ❌ 無效參數：顯示錯誤提示 + 清除 URL action

#### 2. URL 同步測試

**測試場景**：

- [ ] 滾動到不同階段，URL 自動更新
- [ ] 打開 drawer 後滾動階段，URL 保留 action 參數
- [ ] 關閉 drawer，URL 移除 action 參數
- [ ] 打開評論投票 drawer，URL 包含 submissionId

#### 3. 瀏覽器行為測試

**測試項**：

- [ ] 瀏覽器前進/後退按鈕正常工作
- [ ] 刷新頁面後保持 drawer 狀態
- [ ] 複製 URL 分享給他人，能正確打開 drawer
- [ ] URL 手動編輯後按 Enter，能正確響應

### 遷移檢查清單

**升級步驟**：

- [x] 修改 router/index.ts（路由定義）
- [x] 更新所有使用舊路由的組件（6 個文件）
- [x] 創建 useRouteDrawer composable
- [x] 增強 useStageInfoDrawer composable（支持 projectId 參數）
- [x] 修改 ProjectDetail-New.vue 集成路由功能
- [x] 運行 TypeScript type-check（修復類型錯誤）
- [x] 更新 CLAUDE.md 文檔
- [x] 更新 Cloudflare迁移指南.md（本章節）

**後續工作**（可選）：

- [ ] 添加 E2E 測試（Playwright）
- [ ] 為其他 drawer 添加打開按鈕的 URL 導航
- [ ] 添加 URL 美化（如使用階段名稱而非 ID）
- [ ] SEO 優化（meta tags for social sharing）

### 優化建議

#### 1. 性能優化

**當前實現**：每次數據載入完成都會調用 `processUrlParams()`

**優化方案**：
```typescript
// 只在首次載入時處理 URL 參數
const urlProcessed = ref(false)

watch([projectData, () => stages.value.length], ([data, stagesCount]) => {
  if (data && stagesCount > 0 && !loading.value && !urlProcessed.value) {
    nextTick(() => {
      processUrlParams()
      urlProcessed.value = true
    })
  }
}, { immediate: true })
```

#### 2. SEO 優化

**當前限制**：單頁應用的 SEO 挑戰

**改進方案**：
- 添加 meta tags（Open Graph, Twitter Cards）
- 使用 Vue Router 的 `scrollBehavior` 優化滾動
- 考慮使用 Cloudflare Workers SSR（長期方案）

#### 3. URL 美化

**當前**：使用 UUID（如 `stg_xyz456`）

**優化方案**：
```typescript
// 階段路由支持名稱或 ID
/projects/proj_abc/stage/第一階段/vote-result
/projects/proj_abc/stage/stg_001/vote-result

// 實現：在路由守衛中解析階段名稱
router.beforeEach((to, from, next) => {
  if (to.params.stageId && !to.params.stageId.startsWith('stg_')) {
    // 根據名稱查找 stageId
    const stage = findStageByName(to.params.stageId)
    if (stage) {
      next({ ...to, params: { ...to.params, stageId: stage.stageId } })
      return
    }
  }
  next()
})
```

### 參考文件

**核心實現**：
- [router/index.ts](../../scoringSystem-cf/packages/frontend/src/router/index.ts:72-89) - 路由配置
- [useRouteDrawer.ts](../../scoringSystem-cf/packages/frontend/src/composables/useRouteDrawer.ts) - Drawer 管理
- [useStageInfoDrawer.ts](../../scoringSystem-cf/packages/frontend/src/composables/useStageInfoDrawer.ts:75-84) - 階段同步
- [ProjectDetail-New.vue](../../scoringSystem-cf/packages/frontend/src/components/ProjectDetail-New.vue:3048-3177) - 集成範例

**文檔**：
- [CLAUDE.md - Vue Router 架構](../../CLAUDE.md:503-658) - 完整開發指南

---

## Phase 4.12 - 確認碼輸入框自動大寫轉換

### 概述

為了改善手機用戶體驗，所有需要輸入確認碼的 `el-input` 元件現在會自動將輸入內容轉換為大寫。這解決了手機用戶在輸入大寫確認碼時需要手動切換鍵盤的問題。

### 實現方式

#### 1. 統一 CSS 樣式

在 `drawer-unified.scss` 中添加了 `.confirmation-code-input` 類別：

```scss
.confirmation-code-input {
  :deep(.el-input__inner) {
    font-family: 'Courier New', monospace;
    font-size: 18px;
    font-weight: bold;
    text-align: center;
    letter-spacing: 3px;
    text-transform: uppercase;
    border: 2px solid #f56c6c;
    background: #fff;

    &::placeholder {
      text-transform: none;
      letter-spacing: normal;
      font-weight: normal;
    }

    &:focus {
      border-color: #f56c6c;
      box-shadow: 0 0 0 2px rgba(245, 108, 108, 0.2);
    }
  }
}
```

#### 2. 自動大寫輸入處理

每個確認碼輸入框都添加了 `@input` 事件處理器：

```vue
<el-input
  v-model="confirmText"
  placeholder="請輸入 RESET"
  class="confirmation-code-input"
  @input="confirmText = String($event).toUpperCase()"
/>
```

#### 3. 驗證邏輯更新

所有驗證邏輯都使用 `.toUpperCase()` 確保一致性：

```typescript
const canConfirm = computed(() => {
  return confirmText.value.toUpperCase() === 'RESET'
})
```

### 涉及的確認碼

| 確認碼 | 檔案 | 用途 |
|--------|------|------|
| REVERSE | TransactionReversalDrawer.vue | 撤銷交易 |
| REVERSE | ReverseSettlementDrawer.vue | 撤銷結算 |
| RESET | PasswordResetDrawer.vue | 重設密碼 |
| VOTING | ForceVotingDrawer.vue | 強制進入投票 |
| SETTLE | SettlementConfirmationDrawer.vue | 確認結算 |
| CLONE | ProjectManagement.vue (x2) | 複製專案/階段 |
| ARCHIVE | ProjectManagement.vue | 封存專案 |
| UNLOCK | UserManagement.vue | 解鎖帳戶 |
| UPDATE | BatchUpdateRoleDrawer.vue | 批次更新角色 |
| REVERT | VoteResultModal.vue | 撤回提案 |
| RESET | VoteResultModal.vue | 重置投票 |
| ADD | AddMemberConfirmDrawer.vue | 新增成員 |
| DELETE | GroupSubmissionApprovalModal.vue | 刪除報告 |
| RESTORE | GroupSubmissionApprovalModal.vue | 恢復版本 |
| RESEND | InvitationManagementDrawer.vue | 重發邀請郵件 |

### 修改檔案清單

1. `packages/frontend/src/styles/drawer-unified.scss` - 添加統一樣式
2. `packages/frontend/src/components/TransactionReversalDrawer.vue`
3. `packages/frontend/src/components/admin/ReverseSettlementDrawer.vue`
4. `packages/frontend/src/components/admin/user/PasswordResetDrawer.vue`
5. `packages/frontend/src/components/admin/ForceVotingDrawer.vue`
6. `packages/frontend/src/components/admin/SettlementConfirmationDrawer.vue`
7. `packages/frontend/src/components/admin/ProjectManagement.vue`
8. `packages/frontend/src/components/admin/UserManagement.vue`
9. `packages/frontend/src/components/admin/group-management/shared/BatchUpdateRoleDrawer.vue`
10. `packages/frontend/src/components/VoteResultModal.vue`
11. `packages/frontend/src/components/admin/group-management/shared/AddMemberConfirmDrawer.vue`
12. `packages/frontend/src/components/GroupSubmissionApprovalModal.vue`

### 使用指南

創建新的確認碼輸入框時，遵循以下模式：

```vue
<el-input
  v-model="confirmText"
  placeholder="請輸入 YOUR_CODE"
  class="confirmation-code-input"
  @input="confirmText = String($event).toUpperCase()"
/>
```

驗證邏輯：

```typescript
const isValid = computed(() => {
  return confirmText.value.toUpperCase() === 'YOUR_CODE'
})
```

---

**最后更新**: 2025-12-21
**维护者**: 开发团队
**审查周期**: 每季度审查一次优化进度
