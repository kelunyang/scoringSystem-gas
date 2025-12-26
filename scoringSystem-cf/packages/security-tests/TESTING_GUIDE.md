# API 安全測試執行指南

完整的安全測試執行方法和常見問題排查。

## 📋 目錄
- [快速開始](#快速開始)
- [測試執行方式](#測試執行方式)
- [測試分類與標記](#測試分類與標記)
- [報告生成](#報告生成)
- [常見問題](#常見問題)
- [CI/CD 整合](#cicd-整合)

---

## 🚀 快速開始

### 前置條件檢查

```bash
# 1. 確認 Python 已安裝
python3 --version
# 應顯示: Python 3.11+

# 2. 確認虛擬環境已建立
ls venv/
# 應該看到 bin/, lib/, 等目錄

# 3. 確認依賴已安裝
source venv/bin/activate
pip list | grep pytest
# 應該看到 pytest 7.4.3
```

### 第一次執行測試

```bash
# Step 1: 啟動 Backend Dev Server
cd /path/to/scoringSystem-cf
pnpm dev:backend
# 等待顯示 "Listening on http://localhost:8787"

# Step 2: 開啟新終端，執行測試
cd /path/to/scoringSystem-cf
pnpm test:security

# 或者直接在 security-tests 目錄
cd packages/security-tests
source venv/bin/activate
pytest -v
```

---

## 🎯 測試執行方式

### 方式 1: 從專案根目錄執行（推薦）

```bash
# 回到專案根目錄
cd /path/to/scoringSystem-cf

# 執行所有測試
pnpm test:security

# 僅執行關鍵測試（快速驗證）
pnpm test:security:critical

# 生成 HTML 報告
pnpm test:security:report
```

**優點：**
- 不需要手動啟動虛擬環境
- 命令簡單易記
- 與其他測試命令一致 (`test:e2e`, `test:security`)

---

### 方式 2: 在 security-tests 目錄執行

```bash
cd packages/security-tests

# 啟動虛擬環境（每次開新終端都要做）
source venv/bin/activate

# ============ 基本執行 ============

# 執行所有測試
pytest

# 詳細輸出
pytest -v

# 更詳細的輸出（包含完整錯誤訊息）
pytest -vv

# ============ 選擇性執行 ============

# 執行單一測試文件
pytest tests/test_smoke.py

# 執行單一測試類別
pytest tests/test_smoke.py::TestAuthentication

# 執行單一測試函數
pytest tests/test_smoke.py::TestAuthentication::test_admin_login_succeeds

# ============ 按標記執行 ============

# 僅執行關鍵測試
pytest -m critical

# 僅執行認證測試
pytest -m auth

# 執行關鍵或高優先級測試
pytest -m "critical or high"

# 排除慢速測試
pytest -m "not slow"

# ============ 失敗處理 ============

# 遇到第一個失敗就停止
pytest -x

# 遇到 3 個失敗就停止
pytest --maxfail=3

# 只重跑上次失敗的測試
pytest --lf

# 先跑上次失敗的，再跑其他的
pytest --ff

# ============ 調試模式 ============

# 顯示完整錯誤堆疊
pytest --tb=long

# 失敗時進入 Python debugger
pytest --pdb

# 顯示 print 輸出
pytest -s

# ============ 報告生成 ============

# HTML 報告
pytest --html=reports/security_report.html --self-contained-html

# JSON 報告
pytest --json-report --json-report-file=reports/findings.json

# 同時生成兩種報告
pytest --html=reports/security_report.html --self-contained-html \
       --json-report --json-report-file=reports/findings.json
```

---

### 方式 3: 使用 pytest.ini 配置

已配置的默認行為（在 `pytest.ini` 中）：
- 最多失敗 5 個測試就停止 (`--maxfail=5`)
- 顯示詳細輸出 (`-v`)
- 30 秒測試超時 (`timeout=30`)
- 自動發現 `tests/` 目錄下的測試

---

## 🏷️ 測試分類與標記

### 優先級標記

```bash
# 關鍵測試（必須通過）
pytest -m critical

# 高優先級測試
pytest -m high

# 中等優先級測試
pytest -m medium

# 低優先級測試
pytest -m low
```

### OWASP 分類標記

```bash
# API1: Broken Object Level Authorization
pytest -m bola

# API2: Broken Authentication
pytest -m auth

# API3: Broken Object Property Level Authorization
pytest -m properties

# API4: Unrestricted Resource Consumption
pytest -m resources

# API5: Broken Function Level Authorization
pytest -m functions

# API6: Unrestricted Access to Sensitive Business Flows
pytest -m business

# API8: Security Misconfiguration
pytest -m misconfig

# API9: Improper Inventory Management
pytest -m inventory

# API10: Unsafe Consumption of APIs
pytest -m external
```

### 特殊標記

```bash
# 破壞性測試（會修改/刪除數據）
pytest -m destructive
# 注意：默認會被跳過（SKIP_DESTRUCTIVE_TESTS=true）

# 慢速測試（超過 5 秒）
pytest -m slow

# 需要 API 運行的測試
pytest -m requires_api
```

---

## 📊 報告生成

### HTML 報告

```bash
# 生成 HTML 報告
pytest --html=reports/security_report.html --self-contained-html

# 執行後打開報告
# Windows WSL
explorer.exe reports/security_report.html

# Linux with GUI
xdg-open reports/security_report.html
```

**報告內容包括：**
- ✅ 測試通過/失敗統計
- 📝 每個測試的詳細結果
- ⏱️ 執行時間
- 📋 測試環境信息
- 🐛 失敗測試的完整錯誤訊息

---

### JSON 報告

```bash
# 生成 JSON 報告
pytest --json-report --json-report-file=reports/findings.json

# 美化輸出 JSON
cat reports/findings.json | python3 -m json.tool

# 提取失敗的測試
cat reports/findings.json | python3 -c "
import sys, json
data = json.load(sys.stdin)
for test in data['tests']:
    if test['outcome'] == 'failed':
        print(f\"❌ {test['nodeid']}\")
        print(f\"   {test['call']['longrepr']}\")
"
```

---

### 持續報告（實時更新）

```bash
# 使用 pytest-watch（需要額外安裝）
pip install pytest-watch

# 監控文件變化並自動重跑測試
ptw -- -v
```

---

## 🐛 常見問題排查

### 1. API 無法連接

**症狀：**
```
requests.exceptions.ConnectionError: Failed to establish a new connection
```

**解決方法：**
```bash
# 檢查 backend 是否運行
curl http://localhost:8787/

# 如果沒有回應，啟動 backend
cd /path/to/scoringSystem-cf
pnpm dev:backend

# 檢查 .env 配置
cat .env | grep API_BASE_URL
# 應該是: API_BASE_URL=http://localhost:8787
```

---

### 2. Admin 登入失敗

**症狀：**
```
Exception: Admin login failed: Password verification failed
```

**解決方法：**
```bash
# 檢查 .env 的管理員憑證
cat .env | grep ADMIN

# 確認 backend 的管理員帳號
# 查看 backend 初始化腳本或資料庫

# 如果憑證錯誤，更新 .env
nano .env
# 修改:
# ADMIN_EMAIL=正確的郵箱
# ADMIN_PASSWORD=正確的密碼
```

---

### 3. 虛擬環境問題

**症狀：**
```
ModuleNotFoundError: No module named 'pytest'
```

**解決方法：**
```bash
# 確認虛擬環境已啟動
which python
# 應該顯示: /path/to/venv/bin/python

# 如果沒有啟動虛擬環境
source venv/bin/activate

# 如果虛擬環境損壞，重建
rm -rf venv
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

---

### 4. JWT 解碼錯誤

**症狀：**
```
jwt.exceptions.DecodeError: Invalid token
```

**解決方法：**
```bash
# 檢查 JWT token 格式
pytest -vv tests/test_smoke.py::TestAuthentication::test_admin_login_succeeds

# 如果 token 格式有問題，檢查 backend JWT 實現
# 確認 auth_helper.py 的 decode 設置：
# jwt.decode(token, options={"verify_signature": False})
```

---

### 5. 測試超時

**症狀：**
```
pytest_timeout.TimeoutError: test exceeded timeout of 30 seconds
```

**解決方法：**
```bash
# 增加超時時間
pytest --timeout=60

# 或修改 .env
echo "TEST_TIMEOUT=60" >> .env

# 或修改 pytest.ini
nano pytest.ini
# 修改: timeout = 60
```

---

### 6. 測試被跳過

**症狀：**
```
SKIPPED [1] tests/conftest.py:123: No test invitation code available
```

**解決方法：**
```bash
# 某些測試需要邀請碼創建測試用戶
# 方法 1: 跳過這些測試（默認行為）
pytest -v  # 會顯示被跳過的測試

# 方法 2: 提供邀請碼
# 在 backend 生成邀請碼，然後：
echo "TEST_INVITATION_CODE=your-code-here" >> .env
```

---

## 🔄 CI/CD 整合

### GitHub Actions

```yaml
# .github/workflows/security-tests.yml
name: Security Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  security-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          cd packages/security-tests
          python -m venv venv
          source venv/bin/activate
          pip install -r requirements.txt

      - name: Start backend
        run: |
          pnpm install
          pnpm dev:backend &
          sleep 10  # Wait for server to start

      - name: Run security tests
        run: |
          cd packages/security-tests
          source venv/bin/activate
          pytest -v -m "critical or high"

      - name: Upload test reports
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: security-test-reports
          path: packages/security-tests/reports/
```

---

### GitLab CI

```yaml
# .gitlab-ci.yml
security-tests:
  stage: test
  image: python:3.11

  before_script:
    - cd packages/security-tests
    - python -m venv venv
    - source venv/bin/activate
    - pip install -r requirements.txt

  script:
    - pnpm dev:backend &
    - sleep 10
    - pytest -v -m "critical or high"

  artifacts:
    when: always
    paths:
      - packages/security-tests/reports/
    expire_in: 1 week
```

---

## 📝 測試結果解讀

### 成功輸出範例

```
========================= test session starts ==========================
collected 13 items

tests/test_smoke.py::TestAPIConnectivity::test_api_is_reachable PASSED [ 7%]
tests/test_smoke.py::TestAPIConnectivity::test_api_returns_json PASSED [15%]
tests/test_smoke.py::TestAuthentication::test_admin_login_succeeds PASSED [23%]
...

========================== 13 passed in 2.45s ==========================
```

✅ **解讀：** 所有測試通過，API 安全性良好

---

### 失敗輸出範例

```
FAILED tests/test_smoke.py::TestAuthentication::test_invalid_jwt_rejected - AssertionError: Invalid JWT not rejected (status: 200)
```

❌ **解讀：** 發現安全漏洞！無效的 JWT token 沒有被拒絕

**下一步：**
1. 查看完整錯誤訊息 (`pytest -vv`)
2. 檢查 backend 的 JWT 驗證邏輯
3. 修復漏洞
4. 重跑測試確認修復

---

## 🎓 最佳實踐

### 1. 測試前檢查

```bash
# 清單
✓ Backend 正在運行 (localhost:8787)
✓ 虛擬環境已啟動
✓ .env 配置正確
✓ 管理員憑證有效
```

### 2. 定期執行

```bash
# 開發階段：每次修改 API 後執行
pnpm test:security:critical

# 提交前：執行完整測試
pnpm test:security

# 部署前：生成報告
pnpm test:security:report
```

### 3. 測試優先級

```
Phase 1: 每天執行 critical 測試
Phase 2: 每週執行所有測試
Phase 3: 每月生成完整報告
```

---

## 📚 相關文檔

- [README.md](README.md) - 完整項目文檔
- [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) - 測試開發規劃
- [OWASP API Security Top 10](https://owasp.org/API-Security/)

---

## 💬 需要幫助？

遇到問題？檢查：
1. 本文檔的[常見問題](#常見問題)章節
2. pytest 官方文檔: https://docs.pytest.org/
3. 專案 Issue tracker

---

**最後更新：** 2025-12-10
