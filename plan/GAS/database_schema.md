# 專案管理系統資料庫 Schema

## 架構概述

系統使用 Google Sheets 作為主要資料庫，採用多分片架構設計。分為全域活頁簿（存放跨專案共享資料）和專案活頁簿（每個專案獨立），透過整表讀取配合記憶體篩選的方式提供高效的資料存取。

## 配置管理策略

### PropertiesService vs Google Sheets

**PropertiesService 存儲 (核心系統參數):**
- **DATABASE_FOLDER** - Google Drive 資料庫文件夾 ID (最重要)
- **GLOBAL_WORKBOOK_ID** - 全域活頁簿 ID
- **LOG_SPREADSHEET_ID** - 日誌試算表 ID
- **NOTIFICATION_SPREADSHEET_ID** - 通知試算表 ID
- 快取設定 (Cache timeout, Session timeout)
- 系統限制 (Max file size, Comment length)
- 功能開關 (Feature flags)
- **日誌控制參數 (LOG_CONSOLE)** - 控制前後端console輸出，統一日誌行為
- **優勢**: 毫秒級存取、高安全性、無需網路請求、支援動態日誌控制

**Google Sheets 存儲 (業務可配置參數):**
- 用戶可編輯的業務設定
- 專案範本和階段配置
- 動態實驗功能開關
- 需要版本控制的配置項目
- **優勢**: 便於管理、可視化編輯、版本追蹤

```javascript
// 系統初始化 - 設定資料庫文件夾
PropertiesService.getScriptProperties().setProperty('DATABASE_FOLDER', 'your_drive_folder_id');

// 快速系統參數存取
const cacheTimeout = PropertiesService.getScriptProperties().getProperty('CACHE_TIMEOUT');
const databaseFolder = PropertiesService.getScriptProperties().getProperty('DATABASE_FOLDER');

// 自動分片建立
const globalWorkbook = initializeDatabase(); // 自動在指定文件夾建立
const projectWorkbook = createProjectDatabase('proj_123', '測試專案');

// 業務可配置參數存取
const defaultStageDuration = getBusinessConfig('DEFAULT_STAGE_DURATION');
const walletSettings = getBusinessConfig('WALLET_SETTINGS');

// 統一日誌系統使用
log('一般資訊', { context: 'data' });           // 根據LOG_CONSOLE決定console輸出
logErr('錯誤訊息', error);                       // 自動記錄到日誌表 + 可選console
logWrn('警告訊息', { warning: 'details' });      // 結構化日誌格式
```

## Google Sheets 分片結構

### 全域活頁簿 (ScoringSystem-Global)

#### Projects 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| projectId | String | 專案唯一識別碼 (UUID, proj_xxx) |
| projectName | String | 專案名稱 |
| description | String | 專案說明 |
| totalStages | Number | 總階段數 |
| currentStage | Number | 當前階段 |
| status | String | 專案狀態 (active/completed/archived) |
| createdBy | String | 建立者 Email |
| createdTime | Number | 建立時間戳 |
| lastModified | Number | 最後修改時間 |
| workbookId | String | 專案活頁簿 ID |

**範例資料：**
```
| proj_uuid1 | 測試專案 | 專案描述 | 5 | 1 | active | pm@email.com | 1640000000000 | 1640000000000 | 1BxYz...abc |
```

#### Users 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| userId | String | 用戶唯一識別碼 (UUID, usr_xxx) |
| username | String | 登入帳號（唯一） |
| password | String | 密碼（加密儲存） |
| userEmail | String | 用戶 Email (聯絡用) |
| displayName | String | 顯示名稱 |
| registrationTime | Number | 註冊時間戳 |
| lastLoginTime | Number | 最後登入時間 |
| status | String | 用戶狀態 (active/inactive) |
| preferences | String | 用戶偏好設定 (JSON 字串) |
| avatarSeed | String | 頭像種子值 (用於生成一致的隨機頭像) |
| avatarStyle | String | 頭像風格 (avataaars/bottts/identicon/initials/personas) |
| avatarOptions | String | 頭像參數選項 (JSON 字串，包含顏色等設定) |

**範例資料：**
```
| usr_uuid1 | alice123 | $2a$10$... | alice@email.com | Alice Chen | 1640000000000 | 1640000000000 | active | {"theme":"light","lang":"zh-TW"} | alice@email.com_123456 | avataaars | {"backgroundColor":"b6e3f4","clothesColor":"3c4858","skinColor":"ae5d29"} |
```

#### SystemConfigs 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| configKey | String | 配置鍵值 |
| configValue | String | 配置數值 |
| description | String | 配置說明 |
| category | String | 配置分類 |
| lastModified | Number | 最後修改時間 |

**範例資料：**
```
| default_stage_duration | 7 | 預設階段持續天數 | timing | 1640000000000 |
| scoring_enabled | true | 是否啟用評分功能 | features | 1640000000000 |
```

#### GlobalGroups 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| groupId | String | 全域群組唯一識別碼 (grp_xxx) |
| groupName | String | 群組名稱 |
| groupDescription | String | 群組說明 |
| isActive | Boolean | 是否活躍 |
| allowJoin | Boolean | 是否允許加入 |
| createdBy | String | 建立者 Email |
| createdTime | Number | 建立時間戳 |
| globalPermissions | String | 全域權限列表 (JSON 陣列字串) |

**範例資料：**
```
| grp_global_pm_001 | 總PM群組 | 系統總PM群組，擁有建立專案和系統管理權限 | TRUE | FALSE | system | 1640000000000 | ["create_project","system_admin","manage_users","manage_groups","generate_invites","teacher_privilege"] |
| grp_teacher_001 | 教師群組 | 教師群組，擁有教師投票和教學相關權限 | TRUE | FALSE | system | 1640000000000 | ["teacher_privilege"] |
```

**全域權限定義：**
- `create_project`: 建立專案權限
- `system_admin`: 系統管理權限
- `manage_users`: 用戶管理權限
- `manage_groups`: 群組管理權限
- `generate_invites`: 生成邀請碼權限
- `teacher_privilege`: 教師權限 (投票、成果評審、學術決策)

**權限群組架構：**
- **總PM群組**: 完整系統管理權限 + 教師權限，適用於系統管理員
- **教師群組**: 純教師權限，專注於教學相關功能，與系統管理分離

#### Tags 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| tagId | String | 標籤唯一識別碼 (tag_xxx) |
| tagName | String | 標籤名稱 |
| tagColor | String | 標籤顏色 (Hex 顏色碼) |
| description | String | 標籤描述 |
| category | String | 標籤分類 (project/user/system) |
| isActive | Boolean | 是否為活躍標籤 |
| createdBy | String | 建立者 Email |
| createdTime | Number | 建立時間戳 |
| lastModified | Number | 最後修改時間 |

**範例資料：**
```
| tag_uuid1 | 前端開發 | #409eff | 前端開發相關專案標籤 | project | TRUE | admin@email.com | 1640000000000 | 1640000000000 |
```

#### ProjectTags 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| assignmentId | String | 標籤分配唯一識別碼 (pta_xxx) |
| projectId | String | 專案 ID |
| tagId | String | 標籤 ID |
| assignedBy | String | 分配者 Email |
| assignedTime | Number | 分配時間戳 |
| isActive | Boolean | 是否為活躍分配 |

**範例資料：**
```
| pta_uuid1 | proj_uuid1 | tag_uuid1 | admin@email.com | 1640000000000 | TRUE |
```

#### UserTags 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| assignmentId | String | 標籤分配唯一識別碼 (uta_xxx) |
| userEmail | String | 用戶 Email |
| tagId | String | 標籤 ID |
| assignedBy | String | 分配者 Email |
| assignedTime | Number | 分配時間戳 |
| isActive | Boolean | 是否為活躍分配 |

**範例資料：**
```
| uta_uuid1 | user@email.com | tag_uuid1 | admin@email.com | 1640000000000 | TRUE |
```

#### Sessions 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| sessionId | String | 會話唯一識別碼 (sess_xxx) |
| userId | String | 用戶ID |
| createdTime | Number | 創建時間戳 |
| lastActivity | Number | 最後活動時間戳 |

**範例資料：**
```
| sess_uuid1 | usr_uuid1 | 1640000000000 | 1640010000000 |
```

#### Invitations 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| inviteId | String | 邀請碼唯一識別碼 (inv_xxx) |
| code | String | 邀請碼 (8位英數字) |
| generatedBy | String | 生成者 Email |
| generatedTime | Number | 生成時間戳 |
| expiresAt | Number | 過期時間戳 |
| maxUses | Number | 最大使用次數 |
| currentUses | Number | 目前使用次數 |
| isActive | Boolean | 是否為活躍邀請碼 |
| usedBy | String | 使用者列表 (JSON 陣列字串) |

**範例資料：**
```
| inv_uuid1 | ABC12345 | admin@email.com | 1640000000000 | 1642000000000 | 10 | 3 | TRUE | ["user1@email.com","user2@email.com"] |
```

#### GlobalUserGroups 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| membershipId | String | 成員關係唯一識別碼 (mem_xxx) |
| groupId | String | 全域群組 ID |
| userEmail | String | 用戶 Email |
| role | String | 群組內角色 (admin/member) |
| isActive | Boolean | 是否為活躍成員 |
| joinTime | Number | 加入時間戳 |
| addedBy | String | 添加者 Email |
| removedBy | String | 移除者 Email (若已移除) |
| removedTime | Number | 移除時間戳 (若已移除) |

**範例資料：**
```
| mem_001 | grp_global_pm_001 | admin@company.com | admin | TRUE | 1640000000000 | system |  |  |
| mem_002 | grp_teacher_001 | teacher@university.edu | member | TRUE | 1640000000000 | admin@company.com |  |  |
```


### 專案活頁簿 (ScoringSystem-Project-{ProjectID})

每個專案都有獨立的活頁簿，包含該專案的所有業務資料：

**重要設計決策：工作表結構寫死在代碼中**

所有工作表結構定義都寫在代碼中，不存儲在數據庫中。這樣確保：
- **版本控制**：結構變更有清楚的版本歷史
- **部署一致性**：所有環境使用相同的結構定義
- **維護簡便**：不需要額外的範本管理UI
- **唯讀新增設計**：結構定義屬於系統核心，不需要運行時修改

參考實作：`scripts/database_templates.js`

#### ProjectInfo 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| projectId | String | 專案唯一識別碼 (proj_xxx) |
| projectName | String | 專案名稱 |
| description | String | 專案詳細描述 |
| totalStages | Number | 總階段數 |
| currentStage | Number | 當前階段 |
| status | String | 專案狀態 |
| createdBy | String | 建立者 Email |
| createdTime | Number | 建立時間戳 |
| lastModified | Number | 最後修改時間 |

#### Groups 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| groupId | String | 群組唯一識別碼 (grp_xxx) |
| groupName | String | 群組名稱 |
| description | String | 群組說明 |
| createdBy | String | 建立者 Email |
| createdTime | Number | 建立時間戳 |
| status | String | 群組狀態 (active/archived) |
| allowChange | Boolean | 是否允許成員變更 |

**範例資料：**
```
| grp_uuid1 | A組 | 第一組學生 | pm@email.com | 1640000000000 | active | TRUE |
```

#### UserGroups 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| membershipId | String | 成員關係唯一識別碼 (mbr_xxx) |
| groupId | String | 群組 ID |
| userEmail | String | 用戶 Email |
| role | String | 群組內角色 (member/leader) |
| joinTime | Number | 加入時間戳 |
| isActive | Boolean | 是否為活躍成員 |

**範例資料：**
```
| mbr_uuid1 | grp_uuid1 | user@email.com | member | 1640000000000 | TRUE |
```

#### ProjectGroups 工作表 (群組權限映射)
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| mappingId | String | 映射關係唯一識別碼 (map_xxx) |
| groupId | String | 群組 ID |
| groupRole | String | 專案中的角色 |
| permissions | String | 權限列表 (JSON 陣列字串) |
| assignedTime | Number | 分配時間戳 |

**群組角色定義：**
- `pm`: 專案管理者
- `deliverable_team`: 交成果團隊  
- `reviewer`: 審核者
- `observer`: 觀察者

**權限列表：**
- `submit`: 提交成果
- `vote`: 參與投票
- `rank`: 進行排名
- `comment`: 撰寫評論
- `manage`: 管理權限

**範例資料：**
```
| map_uuid1 | grp_uuid1 | deliverable_team | ["submit","vote","rank","comment"] | 1640000000000 |
```

#### Stages 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| stageId | String | 階段唯一識別碼 (stg_xxx) |
| stageName | String | 階段名稱 |
| stageOrder | Number | 階段順序 |
| startDate | Number | 開始時間戳 |
| endDate | Number | 結束時間戳 |
| consensusDeadline | Number | 共識截止時間戳 |
| status | String | 階段狀態 (pending/active/completed) |
| description | String | 階段說明 |
| createdTime | Number | 建立時間戳 |

**範例資料：**
```
| stg_uuid1 | 階段1 | 1 | 1640000000000 | 1641000000000 | 1640500000000 | active | 第一階段描述 | 1640000000000 |
```

#### Submissions 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| submissionId | String | 提交 ID (sub_xxx) |
| stageId | String | 階段 ID |
| groupId | String | 群組 ID |
| contentMarkdown | String | Markdown 內容 |
| actualAuthors | String | 真正作者群 (JSON 陣列字串) |
| participationProposal | String | 參與度分配提案 (JSON 物件字串) |
| version | String | 版本號 |
| submitTime | Number | 提交時間戳 |
| submitterEmail | String | 提交者 Email |
| status | String | 提交狀態 (draft/submitted/approved) |

**範例資料：**
```
| sub_uuid1 | stg_uuid1 | grp_uuid1 | # 內容 | ["user@email.com"] | {"user": 1.0} | v1 | 1640000000000 | user@email.com | submitted |
```

#### RankingProposals 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| proposalId | String | 排名提案 ID (prop_xxx) |
| stageId | String | 階段 ID |
| groupId | String | 提案群組 ID |
| proposerEmail | String | 提案者 Email |
| proposer | String | 提案者顯示名稱 |
| rankingData | String | 排名資料 (JSON 物件字串) |
| version | String | 版本號 (v1, v2, v3...) |
| status | String | 提案狀態 (active/superseded/withdrawn) |
| createdTime | Number | 建立時間戳 |
| supportCount | Number | 支持票數 |
| opposeCount | Number | 反對票數 |
| lastVoteTime | Number | 最後投票時間戳 |

**提案狀態定義：**
- `active`: 當前有效提案
- `superseded`: 被新版本取代
- `withdrawn`: 已撤回

**範例資料：**
```
| prop_uuid1 | stg_uuid1 | grp_uuid1 | user@email.com | Alice Chen | {"grp_A":1,"grp_B":2} | v2 | active | 1640000000000 | 3 | 1 | 1640100000000 |
```

**排名資料格式：**
```json
{
  "grp_uuid1": 1,    // 第1名
  "grp_uuid2": 2,    // 第2名
  "grp_uuid3": 3     // 第3名
}
```

#### ProposalVotes 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| voteId | String | 投票 ID (vote_xxx) |
| proposalId | String | 排名提案 ID |
| voterEmail | String | 投票者 Email |
| voter | String | 投票者顯示名稱 |
| groupId | String | 投票者所屬群組 ID |
| agree | Boolean | 是否同意 (TRUE/FALSE) |
| timestamp | Number | 投票時間戳 |
| comment | String | 投票意見 (選填) |

**投票安全規則：**
- 用戶只能對自己群組的提案投票
- 用戶不能對自己的提案投票
- 每個用戶對每個提案只能投票一次
- 只能對狀態為 `active` 的提案投票

**範例資料：**
```
| vote_uuid1 | prop_uuid1 | user1@email.com | grp_uuid1 | TRUE | 1640000000000 | 同意此排名 |
```

#### FinalRankings 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| rankingId | String | 最終排名 ID (frnk_xxx) |
| stageId | String | 階段 ID |
| groupId | String | 提交排名的群組 ID |
| rankingData | String | 排名資料 (JSON 物件字串) |
| submittedTime | Number | 提交時間戳 |
| submissionType | String | 提交類型 (consensus/majority/auto) |
| metadata | String | 額外資訊 (JSON 字串) |

**範例資料：**
```
| frnk_uuid1 | stg_uuid1 | grp_uuid1 | {"grp_A":1,"grp_B":2} | 1640000000000 | consensus | {} |
```

**提交類型定義：**
- `consensus`: 全體一致同意
- `majority`: 多數同意 (階段結算時)
- `auto`: 系統自動提交 (全體同意時)

#### SystemRankings 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| rankingId | String | 系統排名記錄 ID (srnk_xxx) |
| stageId | String | 階段 ID |
| groupId | String | 被排名的群組 ID |
| finalRank | Number | 最終排名 |
| studentRank | Number | 學生排名 |
| pmRank | Number | 總PM排名 |
| studentWeight | Number | 學生排名權重 (0.7) |
| pmWeight | Number | 總PM排名權重 (0.3) |
| totalScore | Number | 總分 |
| calculatedTime | Number | 計算時間戳 |

**範例資料：**
```
| srnk_uuid1 | stg_uuid1 | grp_uuid1 | 1 | 1.5 | 1 | 0.7 | 0.3 | 1.35 | 1640000000000 |
```

#### Comments 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| commentId | String | 評論 ID (cmt_xxx) |
| stageId | String | 階段 ID |
| authorEmail | String | 評論作者 Email |
| content | String | 評論內容（支援 Markdown 和 @提及） |
| mentionedGroups | String | 被提及的組別ID列表 (JSON 陣列字串) |
| parentCommentId | String | 父評論ID（回覆評論用） |
| isReply | Boolean | 是否為回覆評論 |
| replyLevel | Number | 回覆層級（0=頂級，1=回覆） |
| isAwarded | Boolean | 是否獲得最佳評論獎 |
| awardRank | Number | 獲獎排名 (1/2/3) |
| createdTime | Number | 建立時間戳 |

**範例資料：**
```
| cmt_uuid1 | stg_uuid1 | user@email.com | 我認為@grp_A的報告很棒 | ["grp_A"] | NULL | FALSE | 0 | FALSE | NULL | 1640000000000 |
```

**評論規則說明：**
- **獨立評論**：評論不綁定特定成果，可自由發表
- **el-mention 提及機制**：使用 Element Plus `el-mention` 組件實作群組提及
  - 支援 `@A組`、`@B組` 等友善显示
  - 自動解析群組 ID 存入 mentionedGroups 陣列
  - 與 Markdown 內容無縫整合
- **通知機制**：即時通知系統，支援11種通知類型
- **回覆限制**：被提及組別可回覆評論，但只允許一層回覆（replyLevel ≤ 1）
- **Markdown 支援**：評論內容支援完整 Markdown 語法，包含提及標記

#### CommentRankingProposals 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| proposalId | String | 評論排名提案 ID (crnk_xxx) |
| stageId | String | 階段 ID |
| authorEmail | String | 提案者 Email |
| rankingData | String | 評論排名 (JSON 物件字串) |
| createdTime | Number | 建立時間戳 |
| metadata | String | 額外資訊 (JSON 字串) |

**範例資料：**
```
| crnk_uuid1 | stg_uuid1 | user@email.com | {"cmt_A":1,"cmt_B":2,"cmt_C":3} | 1640000000000 | {} |
```

**評論排名規則：**
- **參與資格**：只有在 Comments 表中有記錄的 authorEmail 可以提交評論排名
- **排名對象**：只能對頂級評論（replyLevel = 0）進行排名，回覆不參與排名
- **前三名制**：每個提案選出心目中的前三名評論
- **統計機制**：系統統計所有提案，計算評論的平均排名，確定最終前三名

### 系統工作簿 (Notification System)

系統通知使用獨立的 Google Sheets 工作簿，由系統自動創建和管理。

#### 通知表 (Notifications)
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| notificationId | String | 通知唯一識別碼 (noti_xxx) |
| targetUserEmail | String | 目標用戶 Email |
| type | String | 通知類型 |
| title | String | 通知標題 |
| content | String | 通知內容描述 |
| projectId | String | 相關專案 ID (可選) |
| stageId | String | 相關階段 ID (可選) |
| commentId | String | 相關評論 ID (可選) |
| relatedEntityId | String | 相關實體 ID (可選) |
| isRead | Boolean | 是否已讀 |
| isDeleted | Boolean | 是否已刪除 |
| emailSent | Boolean | 是否已發送郵件 |
| createdTime | Number | 創建時間戳 |
| readTime | Number | 讀取時間戳 (可選) |
| deletedTime | Number | 刪除時間戳 (可選) |
| emailSentTime | Number | 郵件發送時間戳 (可選) |
| metadata | String | 額外元數據 (JSON 字串) |

**範例資料：**
```
| noti_uuid1 | user@email.com | user_mention | 您被提及 | 張同學在專案管理系統-階段一的評論中提及了您 | proj_uuid1 | stg_uuid1 | cmt_uuid1 | NULL | FALSE | FALSE | FALSE | 1640000000000 | NULL | NULL | NULL | {"projectName":"專案管理系統","stageName":"階段一","authorName":"張同學"} |
```

**通知類型定義 (11種)：**

**評論互動類型：**
- `group_mention`: 群組被提及 (@groupname)
- `user_mention`: 用戶被提及 (@username)

**專案管理類型：**
- `project_updated`: 專案資訊更新
- `group_created`: 新群組建立
- `group_updated`: 群組資訊更新

**階段生命週期類型：**
- `stage_created`: 新階段建立
- `stage_start`: 階段開始運行
- `stage_completed`: 階段完成

**成果與評分類型：**
- `submission_created`: 成果提交
- `ranking_proposal`: 排名提案提交

**個人獎勵類型：**
- `wallet_reward`: 點數獎勵 (包含各種獎勵子類型)

**通知系統特點：**
- **獨立存儲**: 使用專門的 Google Sheets 工作簿
- **自動歸檔**: 超過 50,000 筆通知時自動創建新工作簿並歸檔
- **即時觸發**: 所有業務操作自動觸發相應通知
- **郵件整合**: 每日自動巡檢並發送匯總郵件
- **用戶控制**: 支援標記已讀、刪除通知等操作
- **豐富元數據**: 包含項目名稱、階段名稱、作者等上下文資訊

## 系統日誌工作簿 (SystemLogs-*)

### SystemLogs 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| timestamp | String | ISO 8601 時間戳 |
| level | String | 日誌等級 (DEBUG/INFO/WARN/ERROR/FATAL) |
| functionName | String | 函數名稱 |
| userId | String | 用戶 ID (可選) |
| sessionId | String | 會話 ID (可選) |
| action | String | 操作描述 |
| details | String | 詳細訊息 |
| requestData | String | 請求數據 (JSON 字串，可選) |
| responseStatus | String | 回應狀態 (success/error/completed) |
| executionTime | Number | 執行時間 (毫秒，可選) |
| ipAddress | String | IP 地址 (可選) |
| userAgent | String | 用戶代理 (可選) |

**範例資料：**
```
| 2025-09-09T14:30:45.123Z | INFO | authenticateUser | usr_123 | sess_456 | 用戶登入 | 登入成功 |  | success | 145 | 192.168.1.100 | Mozilla/5.0... |
| 2025-09-09T14:31:02.456Z | ERROR | createProject | usr_123 | sess_456 | 建立專案失敗 | 專案名稱過長 | {"projectName":"..."} | error | 89 | 192.168.1.100 | Mozilla/5.0... |
```

**日誌等級說明：**
- **DEBUG**: 開發調試資訊，生產環境通常關閉
- **INFO**: 正常業務操作記錄 (登入、建立專案、提交報告等)
- **WARN**: 警告事件，系統可正常運作 (權限檢查失敗、參數驗證警告等)  
- **ERROR**: 錯誤事件，操作失敗但不影響系統穩定 (API調用失敗、資料驗證錯誤等)
- **FATAL**: 嚴重錯誤，可能影響系統運作 (資料庫連接失敗、系統配置錯誤等)

**日誌系統特點：**
- **統一記錄**: 所有 API 請求和業務操作自動記錄
- **結構化存儲**: 12 欄位的詳細記錄格式，便於查詢分析
- **前後端同步**: LOG_CONSOLE 參數控制前後端 console 輸出行為
- **雙重記錄**: 同時記錄到 Google Sheets 和 console (可控制)
- **自動歸檔**: 超過 50,000 行時自動歸檔舊日誌表並創建新表
- **效能監控**: 記錄 API 執行時間，便於效能分析
- **安全性**: 密碼等敏感資訊自動脫敏，不會記錄到日誌中
- **管理員專用**: 只有具備 system_admin 權限的用戶可存取日誌

**LOG_CONSOLE 同步機制：**
- **後端控制**: PropertiesService.LOG_CONSOLE 參數控制所有日誌輸出
- **前端同步**: 前端啟動時自動調用 `/system/console-logging/status` API
- **統一行為**: LOG_CONSOLE=true 時前後端都輸出到 console，=false 時都不輸出
- **開發友善**: 系統初始化時預設為 true，便於開發除錯
- **生產優化**: 生產環境可設為 false，減少 console 噪音

#### Transactions 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| transactionId | String | 交易 ID (txn_xxx) |
| userEmail | String | 用戶 Email |
| stageId | String | 階段 ID |
| transactionType | String | 交易類型 |
| amount | Number | 金額 |
| source | String | 來源說明 |
| timestamp | Number | 交易時間戳 |
| relatedSubmissionId | String | 相關提交 ID |
| relatedCommentId | String | 相關評論 ID |
| metadata | String | 額外資訊 (JSON 字串) |

**範例資料：**
```
| txn_uuid1 | user@email.com | stg_uuid1 | rank_reward_1st | 100 | 第一名獎勵 | 1640000000000 | sub_uuid1 | NULL | {} |
```

**交易類型定義：**
- `rank_reward_1st`: 第一名獎勵
- `rank_reward_2nd`: 第二名獎勵  
- `rank_reward_3rd`: 第三名獎勵
- `comment_award_1st`: 最佳評論第一名
- `comment_award_2nd`: 最佳評論第二名
- `comment_award_3rd`: 最佳評論第三名
- `participation_bonus`: 參與獎勵
- `manual_adjustment`: 手動調整

#### Votes 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| voteId | String | 投票記錄 ID (vote_xxx) |
| voterGroupId | String | 投票群組 ID |
| voterEmail | String | 投票者 Email |
| stageId | String | 階段 ID |
| voteType | String | 投票類型 |
| targetId | String | 目標 ID |
| voteValue | String | 投票內容 |
| timestamp | Number | 投票時間戳 |
| metadata | String | 額外資訊 (JSON 字串) |

**範例資料：**
```
| vote_uuid1 | pm_group | pm@email.com | stg_uuid1 | pm_ranking | grp_uuid2 | 1 | 1640000000000 | {} |
```

#### Wallets 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| walletId | String | 錢包 ID (wlt_xxx) |
| userEmail | String | 用戶 Email |
| currentBalance | Number | 當前餘額 |
| totalEarned | Number | 總收入 |
| totalSpent | Number | 總支出 |
| lastUpdated | Number | 最後更新時間 |
| metadata | String | 額外資訊 (JSON 字串) |

**範例資料：**
```
| wlt_uuid1 | user@email.com | 150 | 200 | 50 | 1640000000000 | {} |
```

**投票類型定義：**
- `pm_ranking`: 總PM對各組的排名投票 (voteValue: 排名數字)
- `approval`: 審核投票 (voteValue: pass/fail)

**Note**: 
- 學生的排名投票已改為使用 RankingProposals + ProposalVotes + FinalRankings 的組內共識機制
- 評論排名已改為使用 CommentRankingProposals 的個人提案機制

#### EventLogs 工作表  
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| logId | String | 日誌 ID (log_xxx) |
| userEmail | String | 操作用戶 Email |
| action | String | 操作類型 |
| resourceType | String | 資源類型 |
| resourceId | String | 資源 ID |
| details | String | 操作詳情 (JSON 字串) |
| timestamp | Number | 操作時間戳 |
| ipAddress | String | IP 位址 |
| userAgent | String | 用戶代理 |

**範例資料：**
```
| log_uuid1 | user@email.com | submission_created | submission | sub_uuid1 | {} | 1640000000000 | IP位址 | User Agent |
```

**操作類型定義：**
- `project_created`: 專案建立
- `stage_started`: 階段開始
- `submission_created`: 成果提交
- `submission_updated`: 成果更新
- `ranking_proposal_created`: 排名提案建立
- `ranking_proposal_voted`: 排名提案投票
- `ranking_proposal_updated`: 排名提案修改
- `ranking_submitted`: 最終排名提交
- `pm_ranking_cast`: 總PM排名投票
- `comment_created`: 評論建立
- `comment_reply_created`: 回覆評論建立
- `comment_ranking_submitted`: 評論排名提案提交
- `comment_notification_sent`: 評論通知發送
- `vote_cast`: 其他投票操作
- `ranking_calculated`: 系統排名計算
- `reward_distributed`: 獎勵分配
- `stage_completed`: 階段完成
- `user_joined_group`: 用戶加入群組
- `user_removed_group`: 用戶離開群組

## 資料庫配置參數

#### StageConfigs 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| configId | String | 配置 ID (cfg_xxx) |
| stageId | String | 階段 ID |
| rank1Reward | Number | 第1名獎金 |
| rank2Reward | Number | 第2名獎金 |
| rank3Reward | Number | 第3名獎金 |
| comment1stReward | Number | 最佳評論第1名獎金 |
| comment2ndReward | Number | 最佳評論第2名獎金 |
| comment3rdReward | Number | 最佳評論第3名獎金 |
| approvalThreshold | Number | 審核通過門檻 (0.67) |
| maxResubmissions | Number | 最大重交次數 |
| evaluationThreshold | Number | 評分參與門檻 (0.5) |
| pmWeight | Number | 總PM排名權重 (0.3) |
| criteria | String | 評分標準 (JSON 字串) |

**範例資料：**
```
| cfg_uuid1 | stg_uuid1 | 100 | 60 | 30 | 20 | 15 | 10 | 0.67 | 3 | 0.5 | 0.3 | {} |
```

## UUID 生成策略

### ID 命名規範
```javascript
// 各實體的 UUID 前綴
proj_: 專案 ID
stg_:  階段 ID  
sub_:  提交 ID
grp_:  群組 ID (包含全域群組和專案群組)
usr_:  用戶 ID
mbr_:  成員關係 ID (專案內群組成員)
mem_:  成員關係 ID (全域群組成員)
map_:  映射關係 ID
rnk_:  排名記錄 ID
cmt_:  評論 ID
txn_:  交易記錄 ID
vote_: 投票記錄 ID
log_:  日誌記錄 ID
cfg_:  配置記錄 ID
tag_:  標籤 ID
pta_:  專案標籤分配 ID
uta_:  用戶標籤分配 ID
```

### UUID 生成函數
```javascript
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generateIdWithType(type) {
  const typeMap = {
    'project': 'proj',
    'stage': 'stg',
    'submission': 'sub',
    'group': 'grp',
    'user': 'usr',
    'member': 'mbr',
    'membership': 'mem',  // 全域群組成員關係
    'mapping': 'map',
    'ranking': 'rnk',
    'comment': 'cmt',
    'notification': 'noti',
    'transaction': 'txn',
    'vote': 'vote',
    'log': 'log',
    'config': 'cfg'
  };
  
  const prefix = typeMap[type] || type;
  return `${prefix}_${generateUUID()}`;
}
```

## Google Sheets 分片架構

### 活頁簿結構
```
Google Sheets 分片架構:
├── ScoringSystem-Global (全域活頁簿)
│   ├── Projects (專案清單)
│   ├── Users (用戶總表)
│   ├── SystemConfigs (系統配置)
│   ├── GlobalGroups (全域權限群組)
│   └── GlobalUserGroups (全域群組成員關係)
├── ScoringSystem-Notifications (系統通知工作簿)
│   └── Notifications (統一通知表)
├── ScoringSystem-Logs (系統日誌工作簿)
│   └── SystemLogs (系統日誌表)
└── ScoringSystem-Project-{ProjectID} (專案活頁簿 x N)
    ├── ProjectInfo (專案資訊)
    ├── Groups (群組資料)
    ├── UserGroups (用戶群組關聯)
    ├── ProjectGroups (群組權限映射)
    ├── Stages (階段資料)
    ├── Submissions (成果提交)
    ├── RankingProposals (排名提案)
    ├── ProposalVotes (提案投票)
    ├── FinalRankings (最終排名)
    ├── SystemRankings (系統排名)
    ├── Comments (評論資料)
    ├── CommentRankingProposals (評論排名提案)
    ├── Votes (投票記錄)
    ├── Wallets (個人錢包)
    ├── Transactions (交易記錄)
    ├── EventLogs (操作日誌)
    └── StageConfigs (階段配置)
```

### Google Sheets 存取函數
```javascript
// 活頁簿管理
function getGlobalWorkbook() {
  const globalWorkbookId = PropertiesService.getScriptProperties().getProperty('GLOBAL_WORKBOOK_ID');
  return SpreadsheetApp.openById(globalWorkbookId);
}

function getProjectWorkbook(projectId) {
  const globalData = readGlobalData();
  const projectInfo = globalData.projects.find(p => p.projectId === projectId);
  if (!projectInfo) {
    throw new Error(`專案不存在: ${projectId}`);
  }
  return SpreadsheetApp.openById(projectInfo.workbookId);
}

// 整表讀取操作
function readFullSheet(workbook, sheetName) {
  const sheet = workbook.getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

// 新增資料
function addRowToSheet(projectId, sheetName, data) {
  const workbook = projectId ? getProjectWorkbook(projectId) : getGlobalWorkbook();
  const sheet = workbook.getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const newRow = headers.map(header => data[header] || '');
  sheet.appendRow(newRow);
  invalidateCache(projectId || 'global');
}

// 更新資料
function updateSheetRow(projectId, sheetName, idField, idValue, updates) {
  const workbook = projectId ? getProjectWorkbook(projectId) : getGlobalWorkbook();
  const sheet = workbook.getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const idColIndex = headers.indexOf(idField);
  const rowIndex = data.findIndex((row, index) => 
    index > 0 && row[idColIndex] === idValue
  );
  
  if (rowIndex === -1) {
    throw new Error(`找不到 ${idField}: ${idValue}`);
  }
  
  Object.keys(updates).forEach(field => {
    const colIndex = headers.indexOf(field);
    if (colIndex !== -1) {
      sheet.getRange(rowIndex + 1, colIndex + 1).setValue(updates[field]);
    }
  });
  
  invalidateCache(projectId || 'global');
}
```

## Google Sheets 使用最佳化

### Google Sheets 限制與優勢
**限制：**
- 單一試算表最大 500 萬個儲存格
- 同時編輯者限制 100 人
- 單一工作表最大 40,000 行
- API 呼叫配額限制

**優勢：**
- 完全免費使用
- 無資料量限制（可建立無限活頁簿）
- 自動備份和版本控制
- 直觀的資料檢視和管理

### 資料量估計（適用於教育環境）
```javascript
// 全域活頁簿預估資料量
Projects: ~10-50 行
Users: ~100-1000 行  
SystemConfigs: ~20-50 行
Templates: ~5-20 行

// 單一專案活頁簿預估資料量
Groups: ~5-30 行
UserGroups: ~50-500 行
Stages: ~3-10 行
Submissions: ~50-300 行
Rankings: ~50-300 行
Comments: ~100-1000 行
Transactions: ~500-5000 行
Votes: ~500-3000 行
EventLogs: ~1000-10000 行

// 多專案總資料量
// 20個專案 x 10000行/專案 = 200,000行
// 遠低於 Google Sheets 的 40,000行/工作表限制
// 透過分片架構輕鬆支援 100+ 專案
```

### 批次操作策略
```javascript
// 整表批次讀取專案資料
function batchLoadProjectData(projectId) {
  const projectWorkbook = getProjectWorkbook(projectId);
  
  // 一次讀取所有工作表
  const sheetNames = [
    'ProjectInfo', 'Groups', 'UserGroups', 'ProjectGroups',
    'Stages', 'Submissions', 'RankingProposals', 'ProposalVotes',
    'FinalRankings', 'SystemRankings', 'Comments', 'CommentRankingProposals',
    'Votes', 'Wallets', 'Transactions', 
    'EventLogs', 'StageConfigs'
  ];
  
  const projectData = {};
  sheetNames.forEach(sheetName => {
    try {
      projectData[sheetName.toLowerCase()] = readFullSheet(projectWorkbook, sheetName);
    } catch (error) {
      console.log(`工作表 ${sheetName} 不存在或讀取失敗: ${error.message}`);
      projectData[sheetName.toLowerCase()] = [];
    }
  });
  
  return projectData;
}

// 快取機制整合
const sheetsCache = new Map();
const CACHE_TIMEOUT = 5 * 60 * 1000; // 5分鐘

function getCachedProjectData(projectId) {
  const cacheKey = `project_${projectId}`;
  
  if (sheetsCache.has(cacheKey)) {
    const cached = sheetsCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TIMEOUT) {
      return cached.data;
    }
  }
  
  const data = batchLoadProjectData(projectId);
  sheetsCache.set(cacheKey, {
    data: data,
    timestamp: Date.now()
  });
  
  return data;
}

// 批次寫入操作
function batchWriteOperations(projectId, operations) {
  operations.forEach(operation => {
    switch (operation.type) {
      case 'add':
        addRowToSheet(projectId, operation.sheetName, operation.data);
        break;
      case 'update':
        updateSheetRow(
          projectId, 
          operation.sheetName, 
          operation.idField, 
          operation.idValue, 
          operation.updates
        );
        break;
      case 'batchAdd':
        batchAddRows(projectId, operation.sheetName, operation.dataArray);
        break;
    }
  });
  
  // 使快取失效
  invalidateCache(projectId);
}

// 批次新增多筆資料
function batchAddRows(projectId, sheetName, dataArray) {
  if (dataArray.length === 0) return;
  
  const workbook = projectId ? getProjectWorkbook(projectId) : getGlobalWorkbook();
  const sheet = workbook.getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  const newRows = dataArray.map(data => 
    headers.map(header => data[header] || '')
  );
  
  // 一次性寫入所有新行
  if (newRows.length > 0) {
    sheet.getRange(
      sheet.getLastRow() + 1, 
      1, 
      newRows.length, 
      headers.length
    ).setValues(newRows);
  }
}
```

## 時間戳記標準

### 統一時間格式
系統設計決策：**所有時間欄位統一使用毫秒級 Unix timestamp 儲存**

```javascript
// 系統時間標準
const currentTime = Date.now(); // 1640995200000 (毫秒)
const futureTime = currentTime + (7 * 24 * 60 * 60 * 1000); // 7天後

// 時間計算範例
function addDaysToTimestamp(timestamp, days) {
  return timestamp + (days * 24 * 60 * 60 * 1000);
}

// 前端顯示格式化 (Vue 3 composable)
function useTimeFormat() {
  const formatTime = (timestamp) => {
    return new Intl.DateTimeFormat('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(timestamp));
  };
  
  const formatRelativeTime = (timestamp) => {
    const rtf = new Intl.RelativeTimeFormat('zh-TW', { numeric: 'auto' });
    const diff = timestamp - Date.now();
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    
    if (Math.abs(days) >= 1) {
      return rtf.format(days, 'day');
    }
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return rtf.format(hours, 'hour');
  };
  
  return { formatTime, formatRelativeTime };
}
```

### 時間欄位命名規範
- **創建時間**: `createdTime` (Number)
- **修改時間**: `lastModified` (Number)
- **登入時間**: `loginTime`, `lastLoginTime` (Number)
- **截止時間**: `deadline`, `expiryTime` (Number)
- **計算時間**: `calculatedTime` (Number)

**優勢說明：**
- 精確度高：毫秒級精度滿足所有時間計算需求
- 跨時區一致：UTC 時間戳避免時區轉換問題
- 排序友善：數值比較直接高效
- 計算便利：時間差異計算簡單直觀
- JavaScript 相容：與 `Date.now()` 完全一致

## 資料完整性

### 外鍵關係
- `Stages.projectId` → `Projects.projectId`
- `Submissions.projectId` → `Projects.projectId`
- `Submissions.stageId` → `Stages.stageId`
- `Submissions.groupId` → `Groups.groupId`
- `UserGroups.groupId` → `Groups.groupId`
- `ProjectGroups.projectId` → `Projects.projectId`
- `ProjectGroups.groupId` → `Groups.groupId`
- `Transactions.userEmail` → `Users.userEmail`
- `Votes.voterEmail` → `Users.userEmail`

### 資料驗證規則
```javascript
// 基本驗證函數
function validateProjectId(projectId) {
  return projectId && projectId.startsWith('proj_') && projectId.length === 41;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateUUID(uuid) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

// 業務邏輯驗證
function validateSubmission(submissionData) {
  return validateProjectId(submissionData.projectId) &&
         validateUUID(submissionData.stageId) &&
         validateUUID(submissionData.groupId) &&
         submissionData.contentMarkdown &&
         Array.isArray(JSON.parse(submissionData.actualAuthors));
}
```

## 資料備份與匯出機制

### Google Sheets 資料匯出
```javascript
// 匯出專案資料到 JSON
function exportProjectToJSON(projectId) {
  const projectData = getCachedProjectData(projectId);
  const globalData = readGlobalData();
  const projectInfo = globalData.projects.find(p => p.projectId === projectId);
  
  return {
    exportDate: new Date().toISOString(),
    version: '1.0',
    projectId: projectId,
    projectInfo: projectInfo,
    data: projectData
  };
}

// 匯出全域資料
function exportGlobalData() {
  const globalData = readGlobalData();
  
  return {
    exportDate: new Date().toISOString(),
    version: '1.0',
    type: 'global',
    data: globalData
  };
}

// 匯出活頁簿為 CSV
function exportSheetToCSV(workbook, sheetName) {
  const sheet = workbook.getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  
  return data.map(row => 
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');
}
```

### 資料備份策略
```javascript
// 創建專案備份
function backupProject(projectId) {
  const projectWorkbook = getProjectWorkbook(projectId);
  const backupName = `Backup-${projectId}-${new Date().toISOString().slice(0, 10)}`;
  
  // 複製整個活頁簿
  const backupWorkbook = SpreadsheetApp.open(projectWorkbook.copy(backupName));
  
  // 移動到備份文件夾
  const backupFolder = DriveApp.getFolderById(
    PropertiesService.getScriptProperties().getProperty('BACKUP_FOLDER')
  );
  
  DriveApp.getFileById(backupWorkbook.getId()).moveTo(backupFolder);
  
  return backupWorkbook.getId();
}
```

## 系統日誌與監控架構

### 獨立日誌試算表 (SystemLogs-{Date})

為了實現完整的系統監控和審計，系統使用**獨立的日誌試算表**來記錄所有操作：

#### SystemLogs 工作表
| 欄位 | 資料類型 | 說明 |
|------|----------|------|
| 時間戳 | String | ISO 8601 格式時間戳 |
| 等級 | String | 日誌等級 (DEBUG/INFO/WARN/ERROR/FATAL) |
| 函數名稱 | String | 觸發日誌的函數名稱 |
| 用戶ID | String | 操作用戶ID (如適用) |
| 會話ID | String | 會話ID (如適用) |
| 操作描述 | String | 人類可讀的操作說明 |
| 詳細訊息 | String | 詳細的執行資訊或錯誤訊息 |
| 請求數據 | String | 請求參數 (JSON 字串，敏感資料已遮蔽) |
| 響應狀態 | String | API 響應狀態 (success/error) |
| 執行時間(ms) | Number | 函數執行時間 |
| IP地址 | String | 用戶IP位址 |
| 用戶代理 | String | 瀏覽器用戶代理字串 |

**範例資料：**
```
| 2025-09-09T14:30:45.123Z | INFO | authenticateUser | usr_123 | sess_456 | 用戶登入 | 登入成功 | {} | success | 145 | 192.168.1.100 | Mozilla/5.0... |
| 2025-09-09T14:31:12.456Z | ERROR | createProject | usr_123 | sess_456 | 建立專案失敗 | 專案名稱已存在 | {"projectName":"測試專案"} | error | 89 | 192.168.1.100 | Mozilla/5.0... |
```

### 日誌等級定義

- **DEBUG**: 調試資訊，僅在開發環境啟用
- **INFO**: 一般業務操作記錄 (登入、建立、更新等)
- **WARN**: 警告事件，系統仍可正常運作 (權限不足、參數錯誤等)
- **ERROR**: 錯誤事件，操作失敗但不影響系統穩定性
- **FATAL**: 嚴重錯誤，可能影響系統運作

### 自動日誌歸檔機制

#### 歸檔策略
- **觸發條件**: 日誌表超過 50,000 行時自動歸檔
- **歸檔方式**: 重命名當前試算表並創建新的日誌表
- **命名規則**: `SystemLogs_{YYYY-MM-DD}_歷史檔案_{YYYY-MM-DD}`
- **執行時機**: 每日凌晨 2-3 點自動檢查執行

#### PropertiesService 配置更新
```javascript
// 歸檔時自動更新的配置
LOG_SPREADSHEET_ID: "新日誌表的試算表ID"
LOG_ARCHIVE_COUNT: "已歸檔的檔案數量"
LAST_ARCHIVE_DATE: "最後歸檔日期"
```

#### 歸檔流程
```javascript
function dailyLogMaintenance() {
  // 1. 檢查當前日誌表行數
  const currentRows = getLogSpreadsheet().getActiveSheet().getLastRow();
  
  // 2. 超過限制時執行歸檔
  if (currentRows > 50000) {
    // 3. 重命名當前試算表
    const oldName = logSpreadsheet.rename(`${oldName}_歷史檔案_${timestamp}`);
    
    // 4. 創建新的日誌表
    const newLogSpreadsheet = SpreadsheetApp.create(`系統日誌_${timestamp}`);
    
    // 5. 更新 PropertiesService
    properties.setProperty('LOG_SPREADSHEET_ID', newLogSpreadsheet.getId());
    
    // 6. 發送歧檔通知給管理員
    sendMaintenanceNotification({...});
  }
  
  // 7. 執行其他維護任務 (清理過期會話、邀請碼等)
  performAdditionalMaintenance();
}
```

### 前端日誌查看介面

#### SystemSettings.vue 日誌管理功能
- **日誌統計顯示**: 總數、等級分布、最新/最舊日誌時間
- **靈活過濾器**:
  - 數量滑桿: 10-100 筆 (預設20)
  - 等級篩選: DEBUG/INFO/WARN/ERROR/FATAL
  - 文字搜尋: 函數名稱、操作、詳情
- **操作功能**:
  - 即時刷新
  - CSV 匯出 
  - 手動歸檔觸發
  - 載入更多 (分頁)

#### 日誌表格設計
```vue
<table>
  <tr v-for="log in logs" :class="`log-level-${log.level.toLowerCase()}`">
    <td>{{ formatLogTime(log.timestamp) }}</td>
    <td><span class="level-badge" :class="log.level.toLowerCase()">{{ log.level }}</span></td>
    <td>{{ log.functionName }}</td>
    <td>{{ log.action }}</td>
    <td>{{ log.userId || '-' }}</td>
    <td>{{ truncateText(log.details, 50) }}</td>
    <td>{{ log.executionTime ? log.executionTime + 'ms' : '-' }}</td>
  </tr>
</table>
```

### 日誌記錄範圍

#### 自動記錄的操作
- **用戶認證**: 登入/登出/密碼變更/註冊
- **專案管理**: 建立/更新/刪除專案
- **群組操作**: 建立/加入/離開群組
- **內容提交**: 報告提交/評論發表/投票操作
- **系統管理**: 邀請碼生成/用戶狀態變更/系統設定修改
- **錯誤追蹤**: API 錯誤/驗證失敗/系統異常

#### 日誌記錄最佳實踐
```javascript
// 在每個 API 函數中添加日誌記錄
function createProject(sessionId, projectData) {
  const startTime = Date.now();
  
  try {
    logInfo('createProject', '開始建立專案', {
      userId: sessionData.userId,
      sessionId: sessionId,
      details: `專案名稱: ${projectData.projectName}`,
      requestData: { projectName: projectData.projectName } // 不記錄敏感資料
    });
    
    // 執行業務邏輯
    const result = doCreateProject(projectData);
    
    logInfo('createProject', '專案建立成功', {
      userId: sessionData.userId,
      sessionId: sessionId,
      details: `專案ID: ${result.projectId}`,
      responseStatus: 'success',
      executionTime: Date.now() - startTime
    });
    
    return result;
    
  } catch (error) {
    logError('createProject', '專案建立失敗', {
      userId: sessionData.userId,
      sessionId: sessionId,
      details: error.message,
      responseStatus: 'error',
      executionTime: Date.now() - startTime
    });
    
    throw error;
  }
}
```

### 日誌安全與隱私

#### 資料脫敏處理
- **密碼**: 完全不記錄
- **敏感個資**: 僅記錄識別碼，不記錄實際內容
- **大型資料**: 僅記錄摘要或統計資訊
- **會話資訊**: 僅記錄會話ID，不記錄會話內容

#### 存取控制
- **管理員權限**: 只有具備 `system_admin` 權限的用戶可查看日誌
- **日誌保護**: 日誌試算表僅系統帳號可寫入
- **定期清理**: 超過 6 個月的歸檔日誌建議定期備份並刪除

## 全域權限系統

### 權限架構設計

系統採用**群組式權限管理**，透過 GlobalGroups 和 GlobalUserGroups 兩個表實現全域權限控制：

```
User Email → GlobalUserGroups → GlobalGroups → globalPermissions (JSON Array)
```

### 權限系統特點

1. **角色分離**：全域權限（如建立專案）與專案內權限（如提交成果）完全分離
2. **群組管理**：透過群組方式管理權限，易於批量操作和擴展
3. **JSON 權限**：權限以 JSON 陣列形式存儲，便於動態檢查和擴展
4. **向後相容**：自動資料庫遷移確保既有系統無痛升級

### 總PM權限模型

**總PM群組**具備以下核心權限：
- `create_project`: 建立新專案
- `system_admin`: 訪問系統設置頁面
- `manage_users`: 管理用戶狀態和資訊
- `manage_groups`: 管理權限群組
- `generate_invites`: 生成邀請碼

### 權限檢查流程

```javascript
// 檢查用戶是否具備特定權限
function hasGlobalPermission(userEmail, permission) {
  // 1. 查找用戶所屬的全域群組
  const userGroups = globalData.globalusergroups.filter(ug => 
    ug.userEmail === userEmail && ug.isActive
  );
  
  // 2. 檢查每個群組的權限列表
  for (const userGroup of userGroups) {
    const group = globalData.globalgroups.find(g => g.groupId === userGroup.groupId);
    if (group && group.globalPermissions) {
      const permissions = JSON.parse(group.globalPermissions);
      if (permissions.includes(permission)) {
        return true;
      }
    }
  }
  
  return false;
}
```

### 資料庫遷移機制

系統包含自動遷移功能，確保現有資料庫能無縫升級：

```javascript
// 自動遷移檢查
function autoMigrateIfNeeded() {
  const globalWorkbook = getGlobalWorkbook();
  
  // 檢查是否需要建立新表
  if (!globalWorkbook.getSheetByName('GlobalGroups')) {
    createSheetWithHeaders(globalWorkbook, 'GlobalGroups', GLOBAL_WORKBOOK_TEMPLATES.GlobalGroups);
  }
  
  if (!globalWorkbook.getSheetByName('GlobalUserGroups')) {
    createSheetWithHeaders(globalWorkbook, 'GlobalUserGroups', GLOBAL_WORKBOOK_TEMPLATES.GlobalUserGroups);
  }
  
  // 建立預設的總PM群組
  ensureGlobalPMGroup();
}
```

### 管理員設置流程

1. **執行生成腳本**：`npm run generate:admin`
2. **建立資料表**：系統自動建立 GlobalGroups 和 GlobalUserGroups 表
3. **匯入資料**：將生成的三行資料分別貼到對應工作表
4. **權限驗證**：登入後自動驗證總PM權限

### 權限擴展設計

未來可輕易擴展新的全域權限：
- `manage_projects`: 管理所有專案
- `view_analytics`: 查看系統分析
- `system_backup`: 執行系統備份
- `audit_logs`: 查看審計日誌

只需在 GlobalGroups 表的 globalPermissions 欄位中新增權限字串，即可實現新的權限控制。

---

這個資料庫 schema 設計採用 Google Sheets 多分片架構，完全免費且提供直觀的資料管理體驗。透過整表讀取和記憶體處理的策略，在零成本的前提下實現高效的資料存取性能，同時保持良好的資料可見性和維護便利性。分片設計確保每個專案的資料隔離和無限的擴展能力，配合全域權限系統提供完整的存取控制，適合教育環境的長期使用需求。