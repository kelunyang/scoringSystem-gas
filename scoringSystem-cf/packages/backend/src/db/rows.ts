/**
 * @fileoverview D1 資料列的形狀。
 *
 * 這些型別描述的是**資料表實際的欄位**，給 `.first<T>()` / `.all<T>()` 用，
 * 不是回給前端的 API 形狀（那些在 `@repo/shared`）。兩者刻意分開：
 *
 * - SQLite 沒有 boolean，`allowChange` 這類欄位在這裡是 `number`（0/1），
 *   由 handler 決定要不要轉成 boolean 再送出去。
 * - JSON 欄位在這裡是 `string | null`，解析後才會變成結構。
 *
 * 只有「同一段 SELECT 在多個檔案裡重複出現」的資料列才放進來；
 * 單一查詢自己的形狀就寫在該查詢的 `.all<{...}>()` 上，離 SQL 近一點。
 */

/**
 * `groups` 資料表的一列（專案內的分組）。
 *
 * `SELECT * FROM groups WHERE projectId = ? AND status = 'active'`
 * 這段查詢散落在 handlers/groups/members.ts 與 handlers/projects/list.ts。
 */
export interface GroupRow {
  groupId: string;
  projectId: string;
  groupName: string;
  description: string | null;
  createdBy: string;
  createdTime: number;
  status: string;
  /** SQLite 存 0/1，不是 boolean。回給前端前多半會 `Boolean()` 一次。 */
  allowChange: number;
}

/**
 * `usergroups` 資料表的一列（誰在哪一組、擔任什麼角色）。
 *
 * 業務規則：一位使用者在一個專案裡只會屬於一組。
 */
export interface UserGroupRow {
  membershipId: string;
  projectId: string;
  groupId: string;
  userEmail: string;
  role: string;
  joinTime: number;
  isActive: number;
}

/**
 * `projectviewers` 資料表的一列（專案層級角色）。
 *
 * role 是 6 層權限模型的第 2 層：teacher / observer / member。
 */
export interface ProjectViewerRow {
  projectId: string;
  userEmail: string;
  role: string;
  isActive: number;
}

/**
 * 使用者的公開欄位，用於顯示（頭像、名稱）。
 *
 * 刻意不含 password、lockUntil 這類欄位——會用到這個型別的查詢
 * 都是為了拼出顯示用的資料。
 */
export interface UserDisplayRow {
  userId: string;
  userEmail: string;
  displayName: string;
  avatarSeed: string | null;
  avatarStyle: string | null;
  avatarOptions: string | null;
}
