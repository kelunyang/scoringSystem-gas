# API 安全測試開發規劃

完整的安全測試開發路線圖與優先級規劃。

## 📋 目錄
- [當前狀態](#當前狀態)
- [測試優先級總覽](#測試優先級總覽)
- [Phase 1: REST API 基礎測試](#phase-1-rest-api-基礎測試)
- [Phase 2: OWASP Top 10 完整覆蓋](#phase-2-owasp-top-10-完整覆蓋)
- [Phase 3: WebSocket/Durable Objects 測試](#phase-3-websocketdurable-objects-測試)
- [Phase 4: 高級測試場景](#phase-4-高級測試場景)
- [DO 和 Queue 測試建議](#do-和-queue-測試建議)
- [測試擴展指南](#測試擴展指南)

---

## 🎯 當前狀態

### ✅ 已完成
- 測試框架基礎設施建立
- Python 環境配置 (pytest, requests, pyjwt, websocket-client)
- 核心工具類實現 (APIClient, AuthHelper)
- 13 個煙霧測試 (Smoke Tests)
- 配置管理系統
- pnpm 腳本整合
- **BOLA 測試 (API1)** - ~23 測試案例
- **認證測試擴充 (API2)** - ~25 測試案例
- **屬性級授權測試 (API3)** - ~15 測試案例
- **資源耗盡測試 (API4)** - ~20 測試案例
- **函數級授權測試 (API5)** - ~20 測試案例
- **業務邏輯安全測試 (API6)** - ~20 測試案例
- **安全配置測試 (API8)** - ~15 測試案例
- **WebSocket/DO 測試** - ~15 測試案例
- **注入攻擊測試** - ~25 測試案例
- **API 清單管理測試 (API9/10)** - ~15 測試案例

### 🔄 進行中
- 測試執行與驗證
- 測試報告生成

### 📅 待完成
- CI/CD 整合
- 定期掃描排程

---

## 🏆 測試優先級總覽

| 優先級 | 測試類別 | 測試檔案 | 測試數量 | 當前狀態 |
|--------|---------|----------|---------|---------|
| 🔴 **P0** | REST API 認證/授權 | test_api2_auth.py | ~25 | ✅ 已完成 |
| 🔴 **P0** | BOLA (跨用戶訪問) | test_api1_bola.py | ~23 | ✅ 已完成 |
| 🟠 **P1** | 輸入驗證 & 注入 | test_injection.py | ~25 | ✅ 已完成 |
| 🟠 **P1** | 資源耗盡 & 速率限制 | test_api4_resources.py | ~20 | ✅ 已完成 |
| 🟠 **P1** | 屬性級授權 | test_api3_properties.py | ~15 | ✅ 已完成 |
| 🟡 **P2** | 權限升級測試 | test_api5_functions.py | ~20 | ✅ 已完成 |
| 🟡 **P2** | 業務邏輯安全 | test_api6_business.py | ~20 | ✅ 已完成 |
| 🟢 **P3** | WebSocket/DO 測試 | test_websocket.py | ~15 | ✅ 已完成 |
| 🟢 **P3** | 配置安全檢查 | test_api8_misconfig.py | ~15 | ✅ 已完成 |
| 🟢 **P3** | API 清單管理 | test_api9_10.py | ~15 | ✅ 已完成 |
| ⚪ **P4** | Queue 測試 | - | - | ⏭️ 非必要 |

**總計測試案例：約 206 個（含煙霧測試 13 個）**

---

## Phase 1: REST API 基礎測試

**目標：** 建立核心安全測試，覆蓋最關鍵的 API 端點

**狀態：** ✅ 完成 20% → 目標 100%

### 1.1 認證測試擴充 (test_api2_auth.py)

**優先級：** 🔴 P0 - 立即執行

**測試場景：**

```python
# ============ 基礎認證 ============
✅ test_admin_login_succeeds                  # 已完成
✅ test_invalid_credentials_rejected          # 已完成
✅ test_jwt_token_validation                  # 已完成
✅ test_invalid_jwt_rejected                  # 已完成

# ============ 待新增 ============
☐ test_jwt_expiration_enforcement             # JWT 過期強制驗證
☐ test_disabled_user_token_rejected           # 已停用用戶 token 拒絕
☐ test_password_reset_flow_security           # 密碼重置流程安全性
☐ test_2fa_bypass_attempts                    # 2FA 繞過嘗試
☐ test_2fa_code_reuse_prevention              # 2FA 驗證碼重複使用防護
☐ test_login_rate_limiting                    # 登入速率限制
☐ test_brute_force_protection                 # 暴力破解防護
☐ test_session_fixation                       # Session 固定攻擊
☐ test_concurrent_sessions                    # 並發 session 處理
```

**預計工作量：** 1-2 天

**檢查清單：**
- [ ] 實作 JWT 過期測試
- [ ] 實作帳號停用測試
- [ ] 實作速率限制測試
- [ ] 實作 2FA 安全測試
- [ ] 文檔化測試覆蓋率

---

### 1.2 BOLA 測試 (test_api1_bola.py)

**優先級：** 🔴 P0 - 立即執行

**BOLA (Broken Object Level Authorization)** = 跨用戶訪問漏洞

**測試場景：**

```python
# ============ 專案訪問控制 ============
☐ test_user_cannot_access_other_project      # 跨用戶專案訪問
☐ test_project_member_access_control         # 專案成員權限
☐ test_project_listing_isolation             # 專案列表隔離

# ============ 錢包訪問控制 ============
☐ test_user_cannot_access_other_wallet       # 跨用戶錢包訪問
☐ test_transaction_access_control            # 交易記錄訪問控制
☐ test_wallet_balance_privacy                # 餘額隱私保護

# ============ 提交訪問控制 ============
☐ test_submission_access_control             # 提交內容訪問控制
☐ test_evaluation_access_control             # 評分結果訪問控制

# ============ 群組訪問控制 ============
☐ test_group_membership_enforcement          # 群組成員強制驗證
☐ test_cross_group_data_isolation            # 跨群組資料隔離

# ============ ID 枚舉防護 ============
☐ test_project_id_enumeration                # 專案 ID 枚舉攻擊
☐ test_user_id_enumeration                   # 用戶 ID 枚舉攻擊
```

**測試策略：**
1. 創建兩個測試用戶 (User1, User2)
2. User1 創建資源 (專案/提交/etc)
3. User2 嘗試訪問 User1 的資源
4. 驗證返回 403 Forbidden 或 404 Not Found

**預計工作量：** 2-3 天

**檢查清單：**
- [ ] 創建測試用戶工廠
- [ ] 實作專案訪問測試
- [ ] 實作錢包訪問測試
- [ ] 實作提交訪問測試
- [ ] 實作群組訪問測試
- [ ] ID 枚舉攻擊測試

---

### 1.3 基礎安全控制驗證

**優先級：** 🟠 P1

**測試場景：**

```python
☐ test_https_enforced                        # HTTPS 強制使用
☐ test_cors_configuration                    # CORS 配置檢查
☐ test_security_headers                      # 安全標頭檢查
☐ test_error_information_disclosure          # 錯誤訊息洩漏
☐ test_sensitive_data_in_logs                # 日誌敏感資料
```

**預計工作量：** 0.5-1 天

---

## Phase 2: OWASP Top 10 完整覆蓋

**目標：** 覆蓋 OWASP API Security Top 10 (2023) 所有項目

**狀態：** 📋 待開始 → 目標 80% 覆蓋率

### 2.1 API3 - Property Level Authorization (test_api3_properties.py)

**優先級：** 🟠 P1

**測試場景：**

```python
# ============ Mass Assignment ============
☐ test_mass_assignment_prevention            # 批量賦值防護
☐ test_role_modification_blocked             # 角色修改阻擋
☐ test_permission_modification_blocked       # 權限修改阻擋

# ============ 過度資料暴露 ============
☐ test_password_hash_not_exposed             # 密碼 hash 不外洩
☐ test_sensitive_user_data_filtering         # 敏感用戶資料過濾
☐ test_api_response_data_minimization        # API 回應資料最小化
```

**預計工作量：** 1-2 天

---

### 2.2 API4 - Resource Consumption (test_api4_resources.py)

**優先級：** 🟠 P1

**測試場景：**

```python
# ============ 速率限制 ============
☐ test_api_rate_limiting                     # API 速率限制
☐ test_email_rate_limiting                   # 郵件發送限制
☐ test_login_rate_limiting                   # 登入嘗試限制

# ============ 分頁與批次限制 ============
☐ test_pagination_limits                     # 分頁大小限制
☐ test_batch_operation_limits                # 批次操作限制
☐ test_query_result_limits                   # 查詢結果限制

# ============ 資源耗盡 ============
☐ test_large_payload_rejection               # 大型 payload 拒絕
☐ test_expensive_query_timeout               # 昂貴查詢超時
☐ test_file_upload_size_limits               # 文件上傳限制
```

**預計工作量：** 1-2 天

---

### 2.3 API5 - Function Level Authorization (test_api5_functions.py)

**優先級：** 🟡 P2

**測試場景：**

```python
# ============ 管理功能訪問 ============
☐ test_admin_endpoints_require_admin         # 管理端點權限
☐ test_user_management_authorization         # 用戶管理授權
☐ test_system_config_authorization           # 系統配置授權

# ============ 角色權限測試 ============
☐ test_teacher_cannot_access_admin           # 教師無法訪問管理功能
☐ test_student_cannot_access_teacher         # 學生無法訪問教師功能
☐ test_observer_read_only_enforcement        # 觀察者只讀強制

# ============ 權限升級測試 ============
☐ test_permission_escalation_blocked         # 權限升級阻擋
☐ test_role_switching_validation             # 角色切換驗證
```

**預計工作量：** 2 天

---

### 2.4 API6 - Business Flow Security (test_api6_business.py)

**優先級：** 🟡 P2

**測試場景：**

```python
# ============ 業務邏輯漏洞 ============
☐ test_invitation_code_abuse                 # 邀請碼濫用
☐ test_scoring_manipulation                  # 評分操縱
☐ test_wallet_balance_manipulation           # 錢包餘額操縱
☐ test_project_workflow_bypass               # 專案工作流程繞過
☐ test_stage_timing_enforcement              # 階段時間強制

# ============ 交易安全 ============
☐ test_duplicate_transaction_prevention      # 重複交易防護
☐ test_transaction_reversal_authorization    # 交易撤銷授權
☐ test_negative_amount_rejection             # 負數金額拒絕
```

**預計工作量：** 2-3 天

---

### 2.5 API8 - Security Misconfiguration (test_api8_misconfig.py)

**優先級：** 🟢 P3

**測試場景：**

```python
☐ test_default_credentials_disabled          # 默認憑證禁用
☐ test_debug_mode_disabled                   # Debug 模式禁用
☐ test_cors_properly_configured              # CORS 正確配置
☐ test_stack_traces_not_exposed              # 堆疊追蹤不外洩
☐ test_sensitive_endpoints_protected         # 敏感端點保護
```

**預計工作量：** 1 天

---

### 2.6 API9/10 - Inventory & External APIs

**優先級：** 🟢 P3

**測試場景：**

```python
☐ test_api_endpoint_documentation            # API 端點文檔
☐ test_deprecated_endpoints_disabled         # 廢棄端點禁用
☐ test_external_api_timeout_handling         # 外部 API 超時處理
☐ test_gmail_api_failure_handling            # Gmail API 失敗處理
```

**預計工作量：** 1 天

---

## Phase 3: WebSocket/Durable Objects 測試

**目標：** 測試實時通訊功能的安全性

**優先級：** 🟢 P3 - 可選（取決於 DO 使用情況）

**狀態：** ⏭️ 待評估 → 取決於業務需求

### 3.1 WebSocket 安全測試 (test_websocket.py)

**前置條件：**
```bash
# 需要額外安裝 WebSocket 客戶端
pip install websocket-client
```

**測試場景：**

```python
# ============ 連接授權 ============
☐ test_websocket_requires_authentication     # WebSocket 需要認證
☐ test_invalid_token_connection_rejected     # 無效 token 拒絕連接
☐ test_expired_token_disconnection           # 過期 token 斷線

# ============ 消息隔離 ============
☐ test_user_only_receives_own_notifications  # 用戶只收到自己的通知
☐ test_cross_user_message_isolation          # 跨用戶消息隔離
☐ test_project_notification_access_control   # 專案通知訪問控制

# ============ 注入攻擊 ============
☐ test_websocket_injection_prevention        # WebSocket 注入防護
☐ test_malformed_message_handling            # 異常訊息處理
```

**預計工作量：** 2-3 天

**技術挑戰：**
- WebSocket 測試比 REST API 複雜
- 需要處理異步事件
- 需要模擬多用戶連接

---

### 3.2 Durable Objects 測試 (test_durable_objects.py)

**測試場景：**

```python
# ============ DO 隔離測試 ============
☐ test_do_instance_isolation                 # DO 實例隔離
☐ test_do_state_persistence                  # DO 狀態持久化
☐ test_do_unauthorized_access                # DO 未授權訪問

# ============ 性能與限制 ============
☐ test_do_connection_limits                  # DO 連接限制
☐ test_do_resource_cleanup                   # DO 資源清理
```

**預計工作量：** 1-2 天

---

### 3.3 WebSocket/DO 測試決策樹

```
問題 1: DO 是否處理敏感資料？
├─ 是 (例如：用戶私密訊息、交易資訊)
│  └─ ✅ 必須測試 (優先級升至 P1)
└─ 否 (例如：一般通知、公開資訊)
   └─ 問題 2: DO 功能是否已在生產環境使用？
      ├─ 是 → ✅ 應該測試 (優先級 P2)
      └─ 否 → ⏭️ 可延後 (優先級 P3)
```

**評估標準：**

| 評估項目 | 是 | 否 | 建議 |
|---------|----|----|------|
| DO 處理敏感資料 | ✅ | ❌ | 是→必測 |
| DO 已上線使用 | ✅ | ❌ | 是→應測 |
| 有 WebSocket 相關漏洞歷史 | ✅ | ❌ | 是→必測 |
| 團隊有 WebSocket 測試經驗 | ✅ | ❌ | 否→延後 |

**建議：**
- 如果 DO 只用於非關鍵通知 → **暫時跳過**
- 如果 DO 處理用戶私密資料 → **立即測試**
- 如果不確定 → **先做 Phase 1/2，再評估**

---

## Phase 4: 高級測試場景

**優先級：** 🟢 P3-P4

### 4.1 注入攻擊測試

```python
☐ test_sql_injection_prevention              # SQL 注入防護
☐ test_xss_prevention                        # XSS 防護
☐ test_command_injection_prevention          # 命令注入防護
☐ test_nosql_injection_prevention            # NoSQL 注入防護
```

### 4.2 加密與資料保護

```python
☐ test_password_storage_security             # 密碼存儲安全
☐ test_sensitive_data_encryption             # 敏感資料加密
☐ test_token_encryption                      # Token 加密
```

### 4.3 進階業務邏輯

```python
☐ test_race_condition_handling               # 競態條件處理
☐ test_idempotency_enforcement               # 冪等性強制
☐ test_distributed_lock_mechanism            # 分散式鎖機制
```

---

## DO 和 Queue 測試建議

### Durable Objects (WebSocket) 測試建議

#### 🎯 應該測試的情況

**1. DO 處理敏感資料**
- 用戶私密訊息
- 金融交易資訊
- 個人身份資料
- 評分/成績資訊

→ **優先級：🔴 P0-P1（必須測試）**

**2. DO 已在生產環境**
- 功能已上線
- 有真實用戶使用
- 關鍵業務流程

→ **優先級：🟠 P1-P2（應該測試）**

**3. 有安全合規要求**
- GDPR 資料保護
- 金融監管要求
- 教育資料隱私

→ **優先級：🔴 P0（必須測試）**

---

#### ⏭️ 可以延後測試的情況

**1. DO 只處理公開資訊**
- 系統公告
- 一般通知
- 非敏感狀態更新

→ **優先級：🟢 P3（可延後）**

**2. DO 功能尚未啟用**
- 仍在開發中
- 未部署到生產環境
- 無用戶使用

→ **優先級：⚪ P4（暫不測試）**

**3. 有其他防護機制**
- 前端已做嚴格驗證
- 後端有完整日誌
- 有實時監控告警

→ **優先級：🟢 P3（降低優先級）**

---

### Queue 測試建議

#### ❌ 通常不需要測試的原因

**1. Queue 是內部機制**
```
User → API → Backend Logic → Queue → Worker
                ↑ 測試這裡就夠了
```
- 用戶無法直接訪問 Queue
- Queue 的數據來自你的後端代碼
- 測試後端邏輯即可覆蓋

**2. 測試價值有限**
- Queue 是 Cloudflare 的基礎設施
- 測試 Queue = 測試 Cloudflare 的可靠性
- 不是你的代碼責任範圍

**3. 間接測試已足夠**
```python
# 這樣的測試已經覆蓋 Queue 流程
def test_email_sending():
    # 觸發發送郵件
    response = api.post('/password-reset', json={'email': 'test@example.com'})

    # 驗證郵件已發送（即使透過 Queue）
    assert response.status_code == 200
```

---

#### ✅ 少數需要測試的情況

**1. Queue 處理用戶輸入**
```python
# 如果用戶提交的資料直接進入 Queue
user_comment = "<script>alert('XSS')</script>"
queue.send({'comment': user_comment})  # ← 這裡需要驗證

# 測試：
☐ test_queue_input_sanitization              # Queue 輸入清理
☐ test_queue_payload_validation              # Queue payload 驗證
```

**2. Queue 的安全配置**
```python
☐ test_queue_authentication                  # Queue 認證配置
☐ test_queue_encryption                      # Queue 加密配置
☐ test_queue_access_control                  # Queue 訪問控制
```

→ **優先級：🟡 P2-P3（配置檢查）**

---

### 快速決策表

| 測試項目 | 優先級 | 工作量 | 建議 |
|---------|-------|--------|------|
| **REST API 認證** | 🔴 P0 | 2-3天 | ✅ 立即執行 |
| **BOLA 測試** | 🔴 P0 | 2-3天 | ✅ 立即執行 |
| **輸入驗證** | 🟠 P1 | 2天 | ✅ 優先執行 |
| **資源限制** | 🟠 P1 | 1-2天 | ✅ 優先執行 |
| **權限升級** | 🟡 P2 | 2天 | ⏳ API 穩定後 |
| **業務邏輯** | 🟡 P2 | 2-3天 | ⏳ API 穩定後 |
| **WebSocket/DO** | 🟢 P3 | 3-4天 | ⚠️ 視情況決定 |
| **Queue 測試** | ⚪ P4 | 1-2天 | ❌ 通常不需要 |

---

## 測試擴展指南

### 如何新增測試文件

**1. 創建測試文件**
```bash
cd tests/
touch test_api1_bola.py
```

**2. 基本測試模板**
```python
"""
API1: Broken Object Level Authorization Tests

測試跨用戶資源訪問控制
"""

import pytest
from utils import APIClient, AuthHelper, AuthToken

class TestProjectBOLA:
    """專案訪問控制測試"""

    @pytest.mark.critical
    @pytest.mark.bola
    def test_user_cannot_access_other_project(
        self,
        api_client: APIClient,
        test_users: dict
    ):
        """驗證用戶無法訪問其他用戶的專案"""
        user1 = test_users['user1']
        user2 = test_users['user2']

        # User1 創建專案
        response = api_client.post('/projects/create',
            auth=user1.token,
            json={'projectData': {'projectName': 'Secret Project'}}
        )
        assert response.status_code == 200
        project_id = response.json()['data']['projectId']

        # User2 嘗試訪問
        response = api_client.post('/projects/get',
            auth=user2.token,
            json={'projectId': project_id}
        )

        # 應該被拒絕
        assert response.status_code in [403, 404], \
            f"BOLA vulnerability: User2 accessed User1's project"
```

**3. 添加適當的 markers**
```python
@pytest.mark.critical      # 關鍵測試
@pytest.mark.high          # 高優先級
@pytest.mark.bola          # OWASP 分類
@pytest.mark.slow          # 慢速測試
@pytest.mark.destructive   # 破壞性測試
```

---

### 測試覆蓋率追蹤

**創建測試追蹤表格：**

```markdown
## Phase 1 進度追蹤

| 測試類別 | 計劃測試數 | 已完成 | 完成率 | 狀態 |
|---------|-----------|--------|--------|------|
| 認證測試 | 12 | 5 | 42% | 🔄 進行中 |
| BOLA 測試 | 10 | 0 | 0% | 📋 待開始 |
| 輸入驗證 | 8 | 0 | 0% | 📋 待開始 |
| 總計 | 30 | 5 | 17% | 🔄 進行中 |
```

---

### 持續改進

**每週檢查清單：**
- [ ] 執行所有 critical 測試
- [ ] 檢查是否有新的 API 端點需要測試
- [ ] 更新測試覆蓋率統計
- [ ] 審查失敗的測試
- [ ] 記錄新發現的漏洞

**每月檢查清單：**
- [ ] 執行完整測試套件
- [ ] 生成測試報告
- [ ] 審查測試優先級
- [ ] 評估是否需要新的測試類別
- [ ] 更新開發計畫

---

## 📊 預期時間線

### 短期目標（1-2 週）
- ✅ Phase 1 完成 80%
- ✅ 關鍵 BOLA 測試完成
- ✅ 認證測試完整覆蓋

### 中期目標（1 個月）
- ✅ Phase 2 完成 60%
- ✅ OWASP Top 5 完整測試
- ✅ 自動化報告生成

### 長期目標（2-3 個月）
- ✅ Phase 2 完成 90%
- ✅ WebSocket/DO 測試（如需要）
- ✅ CI/CD 完整整合
- ✅ 定期安全掃描

---

## 📚 參考資源

### OWASP 資源
- [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [OWASP ZAP](https://www.zaproxy.org/)

### 測試框架
- [pytest Documentation](https://docs.pytest.org/)
- [requests Documentation](https://requests.readthedocs.io/)
- [PyJWT Documentation](https://pyjwt.readthedocs.io/)

### Cloudflare 相關
- [Cloudflare Workers Security](https://developers.cloudflare.com/workers/platform/security/)
- [Durable Objects Best Practices](https://developers.cloudflare.com/durable-objects/best-practices/)

---

## 💬 維護與更新

**文檔維護：**
- 每次完成新測試時更新進度
- 每月審查優先級
- 每季度重新評估測試策略

**聯絡方式：**
- 問題回報：專案 Issue tracker
- 文檔更新：Pull Request

---

**最後更新：** 2025-12-23
**下次審查：** 2026-01-06
