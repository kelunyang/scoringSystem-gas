# Teacher Privilege 權限細化規格書

## 背景

原本的系統設計中，教師投票權限(`teacher_privilege`)與系統管理權限混合在總PM群組中。為了實現更清晰的權限分離和角色劃分，我們將`teacher_privilege`從系統管理權限中分離出來，形成獨立的教師群組架構。

## 權限架構重新設計

### 權限分離原則

**之前的設計問題：**
- 總PM群組包含所有權限，包括`teacher_privilege`
- 無法給予教師純教學權限而不給予系統管理權限
- 權限職責不清，混合了系統管理和教學功能

**新的設計：**
- **總PM群組**：保留完整系統管理權限 + 教師權限
- **教師群組**：純教師權限，專注教學功能
- **權限分離**：教師投票與系統管理功能解耦

### 群組權限對照表

| 群組類型 | 群組名稱 | 群組ID | 全域權限 | 適用對象 |
|---------|---------|---------|---------|---------|
| 總PM群組 | 總PM群組 | `grp_global_pm_001` | `create_project`, `system_admin`, `manage_users`, `manage_groups`, `generate_invites`, `teacher_privilege` | 系統管理員 |
| 教師群組 | 教師群組 | `grp_teacher_001` | `teacher_privilege` | 純教師角色 |

### 權限功能對照

| 權限代碼 | 權限名稱 | 功能範圍 | 實際用途 |
|---------|---------|---------|---------|
| `create_project` | 建立專案權限 | 系統管理 | 建立新的專案 |
| `system_admin` | 系統管理權限 | 系統管理 | 存取系統管理介面 |
| `manage_users` | 用戶管理權限 | 系統管理 | 管理用戶帳號和資料 |
| `manage_groups` | 群組管理權限 | 系統管理 | 管理群組和權限分配 |
| `generate_invites` | 生成邀請碼權限 | 系統管理 | 產生用戶邀請碼 |
| `teacher_privilege` | 教師權限 | 教學功能 | 教師投票、成果評審、學術決策 |

## Teacher Privilege 功能範圍

### 包含的功能
1. **教師投票權限**
   - 參與教師專屬的投票機制
   - 對學生成果進行學術評分
   - 參與排名決策投票

2. **成果評審權限**
   - 評審學生提交的成果
   - 提供學術指導和評論
   - 進行品質把關

3. **學術決策權限**
   - 參與學術相關的決策流程
   - 對教學內容和標準進行決策
   - 學術爭議的仲裁權限

### 不包含的功能
1. **系統管理**：不能管理系統設定、用戶帳號
2. **群組管理**：不能建立或管理群組
3. **專案管理**：不能建立專案（除非同時具有create_project權限）
4. **邀請碼管理**：不能生成或管理邀請碼

## 實作變更

### 1. 初始化系統變更

**檔案**：`/scripts/init_system.js`

**變更內容**：
- 在`initSystem()`函數中新增教師群組的建立
- 更新`checkSystemStatus()`函數來檢查教師群組狀態

```javascript
// 新增教師群組建立邏輯
const teacherGroupId = 'grp_teacher_001';
const teacherGroupData = {
  groupId: teacherGroupId,
  groupName: '教師群組',
  groupDescription: '教師群組，擁有教師投票和教學相關權限',
  isActive: true,
  allowJoin: false,
  createdBy: 'system',
  createdTime: timestamp,
  globalPermissions: JSON.stringify(['teacher_privilege'])
};
```

### 2. 權限檢查邏輯

**檔案**：`/scripts/permissions.js`

**現有功能**：
- `hasTeacherPrivilege(userEmail)` - 檢查用戶是否具有教師權限
- `isGlobalPM(userEmail)` - 已更新為檢查teacher_privilege而非create_project

**使用方式**：
```javascript
// 檢查教師權限
if (hasTeacherPrivilege(userEmail)) {
  // 允許教師投票功能
}

// 檢查是否為Global PM（具有完整管理權限）
if (hasGlobalPermission(userEmail, 'system_admin')) {
  // 允許系統管理功能
}
```

### 3. 前端管理介面

**檔案**：`/frontend-vue/src/components/admin/GroupManagement.vue`

**權限管理**：
- 在群組權限的el-transfer組件中包含`teacher_privilege`
- 可以將用戶分配到教師群組或總PM群組
- 權限顯示清楚區分系統管理權限和教師權限

## 移轉策略

### 對現有系統的影響

1. **現有用戶不受影響**
   - 總PM群組仍然保留所有原有權限，包括`teacher_privilege`
   - 現有的系統管理員可以繼續使用所有功能

2. **新用戶分配策略**
   - **系統管理員**：加入總PM群組（完整權限）
   - **純教師角色**：加入教師群組（僅教師權限）
   - **教師兼管理員**：可同時加入兩個群組

3. **權限檢查向後相容**
   - 所有現有的權限檢查函數保持不變
   - `hasTeacherPrivilege()`函數檢查兩個群組中的任何一個

### 移轉步驟

1. **系統更新**
   ```bash
   # 更新系統代碼
   npm run push
   
   # 如果是新系統，執行初始化
   initSystem()
   
   # 如果是現有系統，教師群組會在下次系統重建時自動建立
   ```

2. **權限調整**（可選）
   - 識別純教師角色的用戶
   - 將其從總PM群組移除，加入教師群組
   - 確保系統管理員保留在總PM群組

## 好處

### 1. 職責分離
- **教師**：專注於教學和學術評審
- **系統管理員**：專注於系統維護和用戶管理
- **教師兼管理員**：具有兩種角色的完整權限

### 2. 安全性提升
- 純教師角色無法意外修改系統設定
- 降低系統管理功能的誤用風險
- 更精確的權限控制

### 3. 可擴展性
- 未來可以輕鬆新增其他專業角色群組
- 權限管理更加靈活
- 符合最小權限原則

### 4. 用戶體驗
- 純教師用戶看到更簡潔的介面
- 權限與職責更加明確
- 降低使用者的認知負擔

## 未來擴展

基於這個權限分離架構，未來可以考慮新增：

1. **助教群組**：協助教師但權限更少
2. **觀察員群組**：只能查看不能操作
3. **專案經理群組**：專案管理權限但無系統管理權限
4. **評審委員群組**：特定評審權限

這個權限架構為系統的未來發展提供了良好的基礎。