# 評分系統 API 規格說明書

## 版本資訊
- **版本**: 1.0.0
- **最後更新**: 2025-09-21
- **文檔狀態**: 生產就緒

## 目錄
1. [概述](#概述)
2. [認證機制](#認證機制)
3. [錯誤處理](#錯誤處理)
4. [API端點詳細說明](#api端點詳細說明)
5. [資料模型](#資料模型)

## 概述

評分系統 API 採用 RESTful 設計原則，透過 Google Apps Script 提供後端服務。所有請求都需要攜帶有效的 session ID 進行認證（除了登入和註冊相關端點）。

### 基礎資訊
- **基礎URL**: `https://script.google.com/macros/s/{SCRIPT_ID}/exec`
- **資料格式**: JSON
- **字元編碼**: UTF-8
- **認證方式**: Session-based authentication

## 認證機制

### Session管理
系統使用 session ID 進行身份驗證：
- Session ID 格式: `sess_{UUID}_{timestamp}`
- 有效期限: 24小時（可配置）
- 每次成功登入會生成新的 session ID

### 需要認證的端點
除以下端點外，所有API都需要提供有效的 `sessionId` 參數：
- `/auth/login`
- `/auth/register`
- `/auth/reset-password`
- `/auth/confirm-reset`
- `/auth/check-username`
- `/auth/check-email`
- `/invitations/verify`

## 錯誤處理

### 標準錯誤回應格式
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "錯誤描述",
    "details": {}  // 可選的額外錯誤資訊
  }
}
```

### 錯誤碼列表
| 錯誤碼 | 描述 | HTTP狀態碼 |
|--------|------|-------------|
| `SESSION_INVALID` | 無效或過期的session | 401 |
| `INVALID_INPUT` | 輸入參數錯誤 | 400 |
| `ACCESS_DENIED` | 權限不足 | 403 |
| `NOT_FOUND` | 資源不存在 | 404 |
| `SYSTEM_ERROR` | 系統內部錯誤 | 500 |
| `DUPLICATE_ENTRY` | 重複的資料 | 409 |

## API端點詳細說明

### 認證相關 API

#### 1. 用戶登入
```http
POST /auth/login
```

**請求參數**
```json
{
  "userEmail": "username",
  "password": "password"
}
```

**成功回應**
```json
{
  "success": true,
  "data": {
    "sessionId": "sess_xxxxx",
    "user": {
      "userEmail": "username",
      "displayName": "使用者名稱",
      "permissions": ["create_project", "manage_users"]
    }
  }
}
```

#### 2. 用戶註冊
```http
POST /auth/register
```

**請求參數**
```json
{
  "invitationCode": "ABCD-EFGH-IJKL",
  "username": "newuser",
  "password": "password",
  "confirmPassword": "password",
  "email": "user@example.com",
  "displayName": "新用戶"
}
```

**成功回應**
```json
{
  "success": true,
  "message": "註冊成功"
}
```

#### 3. 請求密碼重設
```http
POST /auth/reset-password
```

**請求參數**
```json
{
  "username": "username",
  "userEmail": "user@example.com"
}
```

**成功回應**
```json
{
  "success": true,
  "message": "重設連結已發送至您的電子郵件"
}
```

#### 4. 確認密碼重設
```http
POST /auth/confirm-reset
```

**請求參數**
```json
{
  "resetToken": "rst_xxxxx",
  "newPassword": "newpassword"
}
```

**成功回應**
```json
{
  "success": true,
  "message": "密碼重設成功"
}
```

### 專案管理 API

#### 1. 建立專案
```http
POST /projects/create
```

**請求參數**
```json
{
  "sessionId": "sess_xxxxx",
  "projectData": {
    "projectTitle": "專案名稱",
    "projectDescription": "專案描述",
    "courseName": "課程名稱",
    "schoolName": "學校名稱"
  }
}
```

**成功回應**
```json
{
  "success": true,
  "data": {
    "projectId": "proj_xxxxx",
    "message": "專案建立成功"
  }
}
```

#### 2. 獲取專案列表
```http
GET /projects/list-with-stages
```

**請求參數**
```json
{
  "sessionId": "sess_xxxxx",
  "filters": {
    "status": "active",  // 可選: active, completed, archived
    "role": "pm"         // 可選: pm, teacher, student
  }
}
```

**成功回應**
```json
{
  "success": true,
  "data": [
    {
      "projectId": "proj_xxxxx",
      "projectTitle": "專案名稱",
      "courseName": "課程名稱",
      "role": "pm",
      "stages": [
        {
          "stageId": "stg_xxxxx",
          "title": "階段一",
          "status": "active"
        }
      ]
    }
  ]
}
```

### 階段管理 API

#### 1. 建立階段
```http
POST /stages/create
```

**請求參數**
```json
{
  "sessionId": "sess_xxxxx",
  "projectId": "proj_xxxxx",
  "stageData": {
    "title": "階段標題",
    "description": "階段描述",
    "duration": 7,
    "reportReward": 100,
    "commentReward": 50
  }
}
```

**成功回應**
```json
{
  "success": true,
  "data": {
    "stageId": "stg_xxxxx",
    "message": "階段建立成功"
  }
}
```

### 評論系統 API

#### 1. 發表評論
```http
POST /comments/create
```

**請求參數**
```json
{
  "sessionId": "sess_xxxxx",
  "projectId": "proj_xxxxx",
  "stageId": "stg_xxxxx",
  "commentData": {
    "content": "評論內容",
    "parentId": null,  // 回覆時提供父評論ID
    "isAnonymous": false
  }
}
```

**成功回應**
```json
{
  "success": true,
  "data": {
    "commentId": "comment_xxxxx",
    "timestamp": "2025-09-21T12:00:00Z"
  }
}
```

#### 2. 獲取階段評論
```http
GET /comments/stage
```

**請求參數**
```json
{
  "sessionId": "sess_xxxxx",
  "projectId": "proj_xxxxx",
  "stageId": "stg_xxxxx"
}
```

**成功回應**
```json
{
  "success": true,
  "data": [
    {
      "id": "comment_xxxxx",
      "content": "評論內容",
      "author": "作者名稱",
      "timestamp": "2025-09-21T12:00:00Z",
      "isAnonymous": false,
      "replies": []
    }
  ]
}
```

### 排名投票 API

#### 1. 提交排名
```http
POST /rankings/submit
```

**請求參數**
```json
{
  "sessionId": "sess_xxxxx",
  "projectId": "proj_xxxxx",
  "stageId": "stg_xxxxx",
  "rankingData": {
    "rankings": [
      {"groupId": "grp_xxx", "rank": 1},
      {"groupId": "grp_yyy", "rank": 2}
    ]
  }
}
```

**成功回應**
```json
{
  "success": true,
  "data": {
    "proposalId": "proposal_xxxxx",
    "message": "排名提案已提交"
  }
}
```

## 資料模型

### User 模型
```json
{
  "userId": "usr_xxxxx",
  "username": "username",
  "email": "user@example.com",
  "displayName": "使用者名稱",
  "avatarSeed": "random_seed",
  "permissions": ["permission1", "permission2"],
  "tags": ["tag1", "tag2"],
  "status": "active",
  "createdAt": "2025-09-21T12:00:00Z",
  "lastLogin": "2025-09-21T12:00:00Z"
}
```

### Project 模型
```json
{
  "projectId": "proj_xxxxx",
  "projectTitle": "專案名稱",
  "projectDescription": "專案描述",
  "courseName": "課程名稱",
  "schoolName": "學校名稱",
  "creator": "usr_xxxxx",
  "status": "active",
  "createdAt": "2025-09-21T12:00:00Z",
  "updatedAt": "2025-09-21T12:00:00Z"
}
```

### Stage 模型
```json
{
  "stageId": "stg_xxxxx",
  "projectId": "proj_xxxxx",
  "title": "階段標題",
  "description": "階段描述",
  "status": "active",
  "duration": 7,
  "reportReward": 100,
  "commentReward": 50,
  "deadline": "2025-09-28T23:59:59Z",
  "createdAt": "2025-09-21T12:00:00Z"
}
```

### Comment 模型
```json
{
  "commentId": "comment_xxxxx",
  "stageId": "stg_xxxxx",
  "projectId": "proj_xxxxx",
  "author": "usr_xxxxx",
  "content": "評論內容",
  "isAnonymous": false,
  "parentId": null,
  "timestamp": "2025-09-21T12:00:00Z",
  "upvotes": 0,
  "downvotes": 0,
  "replies": []
}
```

## 使用範例

### JavaScript (使用 Axios)
```javascript
// 登入
const loginResponse = await axios.post(`${BASE_URL}`, {
  path: '/auth/login',
  method: 'POST',
  params: {
    userEmail: 'username',
    password: 'password'
  }
});

const sessionId = loginResponse.data.data.sessionId;

// 獲取專案列表
const projectsResponse = await axios.post(`${BASE_URL}`, {
  path: '/projects/list-with-stages',
  method: 'GET',
  params: {
    sessionId: sessionId
  }
});
```

### Vue.js (使用內建 API 客戶端)
```javascript
// 登入
const result = await api.login('username', 'password');

// 獲取專案列表
const projects = await api.getProjectListWithStages();

// 發表評論
await api.createComment(projectId, stageId, {
  content: '這是評論內容',
  isAnonymous: false
});
```

## 注意事項

1. **安全性**
   - 所有密碼使用 SHA-256 加密存儲
   - Session ID 有效期為 24 小時
   - 敏感操作需要適當的權限

2. **效能優化**
   - 使用批量操作減少 API 呼叫
   - 實施客戶端快取機制
   - 避免頻繁的輪詢請求

3. **限制**
   - 單一請求大小限制: 50MB
   - 並發請求限制: 30 req/user/minute
   - Session 數量限制: 5 sessions/user

4. **版本控制**
   - 目前為 v1.0.0
   - 後續版本將保持向後兼容
   - 重大更新將提前通知

## 聯絡資訊

如有任何問題或建議，請聯絡系統管理員。