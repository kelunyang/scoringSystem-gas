# 踩坑紀錄（Pitfalls Log）

> 記錄開發與維護過程中踩過的坑：症狀 → 根因 → 教訓與防護。
> 新坑往上加，讓最近的教訓最先被看到。

---
## 2026-09-06 ｜ 權限檢查讀錯一層，於是整段收窄邏輯從來沒跑過

**症狀**：無。專案裡任何一位組員，都可以透過「看事件記錄背後那筆成果」
的端點，看到專案內**任何一份**成果——包含別組的。

**根因**：`getEventResourceDetails` 呼叫另一個 handler 拿權限層級：

```ts
const permissionData = await permissionCheckResponse.json() as any;
const userPermissionLevel = permissionData.userPermissionLevel;   // undefined
```

被呼叫的那個回的是 `successResponse(data)`，body 是
`{ success, data: { …, userPermissionLevel } }`——值在 `.data` 底下。
讀最外層永遠是 `undefined`，於是底下

```ts
if (userPermissionLevel === 'member_in_group') { /* 只能看自己的 */ }
else if (userPermissionLevel === 'group_leader') { /* 只能看自己組的 */ }
// admin / teacher / observer 可以看全部（不需額外檢查）
```

兩個分支都不成立，直接落到最寬鬆的預設路徑。
路由層只擋到專案層級的 `view`，所以沒有第二道關。

**同一個檔案裡另外四處就寫了 `responseData.data || responseData`**
來處理這層包裝，唯獨這裡漏了。

**同時發現**：`resourceType === 'comment'` 的兩個查詢都寫
`LEFT JOIN users u ON c.authorId = u.userId`，但 comments 資料表沒有
`authorId`（它以 `authorEmail` 關聯）。SQLite 直接報錯，被外層
try/catch 轉成 SYSTEM_ERROR——**看評論詳情從來沒有成功過**。
陰錯陽差之下，權限漏洞實際只影響 submission。

**教訓與防護**：

1. **「handler 呼叫另一個 handler、再解析它的 Response」是高風險模式。**
   回傳值多包了一層 `data`，型別上完全看不出來，`as any` 更是直接放行。
   同一個 codebase 裡對同一個函式有兩種解包寫法，就是訊號。
2. **權限收窄如果只寫在 handler 裡，就要有測試證明它會執行。**
   「路由擋粗的、handler 擋細的」本身沒問題，但細的那層一旦失效，
   外面那層的寬鬆權限就直接生效，而且不會有任何錯誤。
   新測試特地用「別組的組員」而非「完全沒權限的人」，
   因為前者才會通過路由層、走到真正該收窄的地方。
3. **SQL 欄位名寫錯會被 try/catch 吃掉，變成一個永遠失敗的功能。**
   `catch → errorResponse('SYSTEM_ERROR')` 讓「這段 SQL 根本跑不起來」
   和「偶發的資料庫問題」長得一模一樣。
   查 `no such column` 這類錯誤最快的方法是把 migrations 灌進
   in-memory SQLite 直接跑那句查詢——本次就是這樣三十秒內確認的。

---
## 2026-09-06 ｜ 讀一個 SELECT 沒回傳的欄位，於是功能安靜地半殘

**症狀**：階段評論頁重新整理後，自己按過的 reaction 不會顯示為已選取；
而且再按一次同一個 reaction 不是取消，是**重複新增**。
使用者得先按別的、再按回來才能取消。沒有任何錯誤訊息。

**根因**：`getStageComments` 用自己的 SELECT 沒有回傳的欄位找當前使用者。

```sql
SELECT lr.commentId, lr.reactionType, lr.userEmail, u.displayName
```
```ts
commentReactions.find(r => r.userId === currentUser.userId)   // 沒有 userId
```

`r.userId` 永遠是 `undefined`，比對永不成立，`userReaction` 對所有人、
所有時候都是 `null`。前端 `handleReaction()` 只有在
「目前的 reaction 等於點下去的那個」時才走取消路徑，於是取消永遠不觸發。

`getAllStagesComments` 有一份幾乎逐字相同的聚合程式碼，**而且是對的**
（比對 `r.userEmail === userEmail`）。兩份複製貼上的程式碼，只有一份被修過。

**教訓與防護**：

1. **`any` 讓「不存在的欄位」讀起來和真欄位一模一樣。**
   `(row: any).userId` 不會有型別錯誤、不會有執行期錯誤，
   只會安靜地給你 `undefined`，然後整條判斷永遠走同一邊。
   這是本次型別清理唯一挖到的功能性 bug，而它正好是這一類。
2. **同一段邏輯出現兩份時，先比對它們有沒有分歧。**
   修好的那份沒有回頭修另一份，是這個 bug 存活的唯一原因。
   新的測試特地加了一項「兩個端點給出相同答案」，把它們釘在一起。
3. **靜態掃描找這一類 bug 的命中率很低，別高估它。**
   我先寫了分析程式比對每個查詢的 SELECT 欄位與 callback 讀的屬性，
   32 個命中**全部是誤報**（CTE 的內層 SELECT、跨查詢的同名變數、
   被視窗掃進來的物件字面值）。真正的那個反而漏掉，因為它讀的是
   `allReactionsResults`——一個用 `push(...)` 拼出來的陣列，不是
   `.results` 本身。**最後是靠逐檔定型時肉眼看到的。**
4. **`SELECT userId FROM users WHERE userEmail = ?` 這種查詢，
   先問自己拿它做什麼。** 兩處都只是為了取一個 id 去比對，
   而比對其實可以直接用手上已有的 userEmail。修掉 bug 的同時
   也少了兩次 D1 往返。

---
## 2026-09-06 ｜ 量測工具沒接上，於是所有數字都是假的

**症狀**：無。`pnpm lint`、`pnpm type-check` 都通過，看起來很健康。

**根因**：三個工具各自有一段「寫了但沒接上」：

| 工具 | 沒接上的地方 | 揭露後的真實數字 |
|------|-------------|----------------|
| backend lint | `eslint src/**/*.ts` 沒加引號，glob 被 shell 展開只掃單層 | 118 → 460 |
| shared lint | `package.json` 根本沒有 `lint` script，而根指令是 `pnpm --recursive lint` | 0 → 22 |
| 根 type-check | 根 script 是 `tsc --build`，而 `vue-tsc` 只掛在 frontend 自己的 script 上，沒人呼叫 | **從未檢查過任何 `.vue` 檔**；接上後立刻 18 個錯誤 |

前兩者在 2026-09-05／09-06 修掉，第三個是這次發現的。
`.vue` 那個最嚴重：整個前端的元件邏輯——也就是絕大多數程式碼——
從來沒有進過型別檢查。

**教訓與防護**：

1. **看到一個「意外地低」的數字，先懷疑量測本身。**
   計畫文件裡「shared: 0 any」被當成事實寫進表格，
   其實只是沒人去看。乾淨和沒被檢查，在報表上長得一模一樣。
2. **每個 package 都要有 lint / type-check script，否則 `--recursive` 會靜靜跳過它。**
   `pnpm --recursive <script>` 對沒有該 script 的 package 不會報錯。
3. **驗證「工具真的有在跑」的方法是：故意弄壞一個檔案，看它會不會叫。**
   單看指令是否 exit 0 分不出「通過」和「沒跑」。

---
## 2026-09-06 ｜ 同一個 API 吐兩種 error 形狀，前端沒有一種寫法能同時對

**症狀**：使用者偶爾看到「操作失敗: [object Object]」；
另一些時候權限被拒，卻只顯示「未知錯誤」，看不到真正的原因。

**根因**：後端有兩條產生錯誤回應的路徑，形狀不同：

```
handler，透過 errorResponse()   { success: false, error: { code, message } }
router 的權限守衛，手寫 c.json   { success: false, error: '訊息', errorCode: 'CODE' }
```

router 層 112 處用第二種。於是前端：

- 寫 `response.error?.message` 的，碰到守衛拒絕時拿到 `undefined` → 顯示「未知錯誤」，**403 的真正理由被吞掉**
- 寫 `'失敗：' + response.error` 的，碰到 handler 拒絕時拿到物件 → **`[object Object]`**（10 處面向使用者）

而前端有 **八份** `ApiResponse` 定義（frontend 4、backend 2、shared 2）、
三種不同的 error 形狀，沒有一份被兩個地方共用——
所以型別檢查對這件事完全沉默。

**同時發現**：`getHttpStatus()` 的對照表只有 52 個錯誤碼，
但實際被 `errorResponse()` 使用的有 167 個。沒進表的 115 個走 fallback
一律回 **500**——`PERMISSION_DENIED`、`TEACHER_ONLY`、`COMMENT_NOT_FOUND`、
`ALREADY_VOTED` 全都被報成 Internal Server Error。

**守門測試**（`backend/tests/error-response-shape.test.ts`）：
手寫 `error: '字串'` 的回應、或錯誤碼漏進對照表，兩者都會讓測試失敗。

**教訓與防護**：

1. **「有人已經寫了防禦程式碼繞過去」是根因還沒被修的訊號。**
   `useStageContentManagement.ts` 早就寫成
   `response.error?.code || response.errorCode`，同時相容兩種形狀。
   有人踩到過、繞開了，但沒有回頭統一契約——於是其他 10 個地方繼續壞著。
   看到這種「兩邊都試一下」的寫法，要問的是為什麼會有兩種。
2. **同一個概念有 N 份型別定義時，型別檢查保護不了你。**
   八份 `ApiResponse` 各自自洽，合起來互相矛盾。
   契約型別必須只有一份，而且產生方與消費方都用它。
3. **狀態碼對照表用 fallback 是危險的預設。**
   `?? 500` 讓「忘記加進表」和「這真的是伺服器錯誤」外觀相同。
   守門測試改成檢查「碼有沒有在表上」，而不是「回傳的狀態是不是 500」——
   後者分不出這兩件事。

---
## 2026-09-05 ｜ 停用一個全域群組，其實沒有停用它的權限

**症狀**：無。管理員把某個全域群組設為停用，介面顯示停用，
但群組成員仍然享有該群組的所有權限。

**根因**：權限來自兩張表——`globalusergroups`（誰在群組裡）與
`globalgroups`（群組有哪些權限，以及群組自己的 `isActive`）。
正確的查詢必須**同時**過濾兩個 `isActive`：

```sql
WHERE gug.userEmail = ? AND gug.isActive = 1 AND gg.isActive = 1
```

`utils/permissions.ts` 從一開始就寫對了。但這段查詢被複製到各處，
副本漏了其中一個或兩個：

| 位置 | 漏了什麼 | 影響 |
|------|---------|------|
| `projects/list.ts` `checkSystemAdmin` | **兩個都沒有** | 停用的資格仍可看見所有專案 |
| `users/search.ts` 徽章查詢 | 兩個都沒有 | 停用的群組仍顯示管理員徽章 |
| `submissions/manage.ts:1012` | 缺 `gg.isActive` | 停用的群組仍通過存取檢查 |
| `submissions/versions.ts:58` | 缺 `gg.isActive` | 同上 |

**後兩者還有第二個 bug**：用 `.first()` 只取第一列。
使用者可以屬於多個全域群組，權限若在第二個群組就被漏判——
**方向相反，是拒絕本該通過的人**。已改為 `.all()` + `some()`。

**守門測試**（`tests/permission-sql-audit.test.ts`）：
掃描原始碼，任何「JOIN 兩張表且讀取 `globalPermissions`」的查詢
都必須同時過濾兩個 `isActive`。

**寫這條測試時我自己先誤報了 12 處**：第一版把別名寫死成
`gug`/`gg`，但這個 codebase 至少有三種寫法（`gug`/`gg`、`gu`/`g`、`ug`/`gg`），
而被誤報的那 12 處其實寫得**比正確還嚴格**（多檢查 `u.status = 'active'`）。
改成先解析「哪個別名綁到哪張表」再檢查。

**教訓與防護**：

1. **兩張表各有 `isActive` 時，每個查詢都要問「我過濾了幾個」。**
   這種漏失不會報錯、不會型別錯誤、功能測試也照過——
   只有「停用之後對方還能用」這個沒人會主動去測的情境會露餡。
2. **複製一段權限查詢，就是複製一次寫錯的機會。**
   #005 記錄了 153 段手寫權限 SQL。逐一稽核後發現：
   **錯誤集中在「讀 `globalPermissions` 做授權」這一類**，
   其餘多數是群組成員的增刪查，收斂它們只是整潔。
   所以最後做的是「稽核 + 針對高風險類別的守門測試」，
   而不是機械式把 153 段全部收斂——後者成本高、收益低。
3. **靜態掃描的守門測試，第一版一定要看它抓到什麼。**
   如果它一次噴出十幾處，先假設是規則寫太窄，不要急著改程式碼。
   我這次差點把 12 段正確（而且更嚴格）的查詢「修」壞。
4. **`.first()` 用在「使用者可能有多筆」的查詢上是靜默的錯。**
   它不會報錯，只會回傳其中一筆。凡是 `WHERE userEmail = ?`
   而該使用者可能有多列的，都要問一次該不該是 `.all()`。

---
## 2026-09-05 ｜ 守衛裝在預檢端點上，真正的邊界是開的

**症狀**：無，而且**看起來完全正常**。註冊表單填錯信箱會被擋，
生產資料裡 147 個已使用的邀請碼全部與指定信箱相符。

**根因**：邀請碼的 `targetEmail` 比對只存在於
`/invitations/verify`——**註冊表單在送出前呼叫的預檢端點**。
真正建立帳號的 `/auth/register` 那條路徑，
`validateInvitationCode(db, code)` **連 email 參數都沒有**，
查詢是 `WHERE invitationCode = ? AND status = 'active'`，
沒有任何一處看 `targetEmail`。

所以：走瀏覽器 → 被擋；直接 POST `/auth/register` → 通過。
**發給 A 的碼，B 可以用任何信箱註冊。**

**為什麼資料看起來很乾淨**：因為前端流程強制了相符。
統計上的 100% 相符不是「防護有效」的證據，
只是「大家都走了那條有防護的路」的證據。

**還有一支現成但沒人用的 `validateInvitationCodeForEmail`**，
JSDoc 寫著「This is called during user registration」——但沒有。
（#009 死模組普查已標記過，這次一併刪除。）

**修法**：把比對移進 `register.ts` 的驗證函式，接在真正的邊界上。
`targetEmail` 為 NULL 時不施加限制，只有不相符才拒絕。

**教訓與防護**：

1. **預檢（pre-check）不是授權檢查。** 任何「送出前先問一下」的端點
   都只是 UX，因為呼叫它是自願的。**授權必須在會產生副作用的那一支**。
   看到一組 `verify` + `submit` 端點，要問的是「submit 自己檢查了嗎」，
   而不是「verify 檢查了嗎」。
2. **用生產資料驗證假設時，要問「這份資料是怎麼產生的」。**
   我一開始把「147/147 相符」當成「這是刻意的設計，動它會破壞流程」的
   反證來看——實際上它是前端強制的結果，兩種解讀的資料長得一模一樣。
   真正決定答案的是**生成端的行為**（必填、正規化、每信箱唯一），
   不是使用端的統計。
3. **「有一支現成的比對函式但沒人呼叫」幾乎一定是漏接，不是設計。**
   沒有人會刻意寫一支函式再刻意不用它。這在本 codebase 已是第三次
   （見 #009、`authenticateUser`、本條）。

---
## 2026-09-05 ｜ 用毫秒門檻擋秒解析度的 `iat`，會把剛發的 token 也擋掉

**背景**：實作「改密碼撤銷既有 JWT」。做法是加 `users.passwordChangedAt`，
在 middleware 比對 token 的 `iat`——`password-reset.ts` 的 TODO 就是這個解法。

**差點寫成的 bug**：

```ts
// 錯的
if (payload.iat * 1000 < user.passwordChangedAt) reject();
// 搭配 passwordChangedAt = Date.now()
```

JWT 的 `iat` 只有**秒**解析度，而這個 schema 的時間戳全是**毫秒**。
假設在 `1788600000500`（.5 秒）改密碼，緊接著簽發替代 token，
它的 `iat` 會 floor 成 `1788600000`，乘回毫秒是 `1788600000000`——
**小於門檻 `1788600000500`**。結果：使用者被自己的改密碼動作登出，
而且是被那枚「為了讓他繼續登入而發的」token 擋掉的。

**解法**：門檻寫入時就截斷到整秒
（`Math.floor(now / 1000) * 1000`），同一秒內簽發的 token 才不會低於它。
代價是最多 1 秒的鬆動（同一秒內、改密碼前簽發的舊 token 會存活），
這在 `iat` 只有秒解析度的前提下無法避免，也無實質風險。

**另外兩個決定**：
- `changePassword` 改成**回傳新 token**，前端經 `apiClient.saveToken()` 換上。
  否則「撤銷全部」會連當前裝置一起殺掉。使用者對「改密碼」的預期是
  「其他裝置登出、我自己留著」。
- `iat` 缺失或非有限數時 **fail closed**（拒絕）。
  無法證明晚於門檻的 token，不該放行——這點在寫測試時我自己還先寫錯了期望值
  （以為 `Infinity` 該放行），是測試把我糾正回來的。

**教訓與防護**：

1. **跨解析度比較時間，先問「兩邊的最小刻度是多少」。**
   秒 vs 毫秒、UTC vs 本地、`Date` vs epoch——這類比較的邊界 bug
   平常測不出來，只有在「同一秒內發生兩件事」時才爆，
   而那正是「改密碼後立刻發新 token」的常態。
2. **「撤銷全部 session」幾乎都該有一個例外：發起這個動作的那一個。**
   否則安全功能變成 UX 事故，使用者會學會不要用它。
3. **測試要專門為邊界寫一條，並在名字裡寫明它守的是什麼。**
   這裡那條叫「keeps the replacement token minted in the same second as the
   change」——半年後看到它，會立刻知道不能把截斷拿掉。

---
## 2026-09-05 ｜ AI 讀不懂自己的回應時，預設「A 獲勝」——把失敗偽裝成結果

**症狀**：無。BT 兩兩比較模式正常運作，教師拿到一份完整排名。

**根因**：`callBTComparison` 解析模型回應時：

```ts
parsed = { winner: winnerMatch?.[1] || 'A', reason: '無法解析回應' };
// ...
winner: parsed.winner === 'B' ? 'B' : 'A'
```

**任何讀不懂的東西都變成 'A'**——回應被截斷、被限流、回了 `"C"`、
回了純文字、JSON 壞掉，全部一律判給 A。而消費端
`comparison.winner = result.winner === 'A' ? comparison.itemA : comparison.itemB`
會把它記成 itemA 真的贏了一場。

**最諷刺的是**：`utils/bradley-terry.ts` **本來就支援「沒有 winner」**——
`if (!comp.winner) continue;`（`:172`）和
`comparisons.filter(c => c.winner && c.reason)`（`:314`）。
下游早就準備好接受「這場沒有結果」，是上游自己捏造了一個。

**還有第二層**：就算全部 N 場比較都解析失敗，`computeBTRanking` 依然會
回傳一份排名（強度參數停在先驗值，順序等於任意）。教師看到的東西
**和一份有根據的排名長得一模一樣**。

**修法**：
- 抽出 `parseBTVerdict(content)`，只有明確的 `'A'` 或 `'B'` 算數，
  其餘一律回 `null`。
- 消費端遇到 `null` 就不設 winner，讓那一場被 BT 跳過，並計數。
- 可用比較數少於一半時直接拋錯，不產出排名。

**教訓與防護**：

1. **「解析失敗」的預設值不可以是一個有效答案。**
   `|| 'A'` 這種寫法把「我不知道」變成「我確定是 A」。
   正確的預設是 `null`／拋錯／跳過——讓不確定性往上傳，不要在最底層被抹平。
2. **下游已經支援的狀態，上游不要幫它填掉。**
   這裡 BT 演算法明明能處理缺失值，上游卻先塞了假資料進去。
   寫轉接層時要先看下游接受什麼，而不是假設它需要一個「完整」的輸入。
3. **統計方法在資料不足時要拒絕輸出，而不是輸出低信心結果。**
   Bradley-Terry、Borda、任何排名聚合都一樣：
   零筆有效資料也能算出一個順序，而那個順序看起來跟真的一樣。
   **有效樣本數要當成前置條件檢查，不是事後備註。**
4. **同一輪 review 裡，同一個模組已經找到一個 bug，就要把整個模組看完。**
   前一條 pitfall（Borda 重複項）修的是「回傳完整排名」那類模式，
   當時沒去看 BT 這條逐對比較的路徑。同一個檔案、同樣是「信任模型輸出」，
   問題形狀不同但根因同源。

---
## 2026-09-05 ｜ AI 排名裡一個重複項，讓那個項目的 Borda 分數翻倍

**症狀**：無。AI 排名功能正常運作，教師看到一份看起來合理的建議排名。

**根因**：`queues/ai-ranking-consumer.ts` 有三處**一模一樣**的
「驗證並修正排名」邏輯：

```ts
const validRanking = result.ranking.filter(id => itemIds.includes(id));
const missingIds = itemIds.filter(id => !validRanking.includes(id));
const finalRanking = [...validRanking, ...missingIds];
```

它做對了兩件事——濾掉模型幻覺出來的 ID、補回模型漏掉的項目——
但**三處都沒有去重**。

而 `utils/free-mad.ts` 的 `computeFreeMadRanking` 是**按列表位置計 Borda 分**：

```ts
scores[itemId] += (n - i) * weights.W_INITIAL;
```

所以模型如果回傳 `['b','b','a','c']`，`b` 會在 i=0 拿 60 分、
在 i=1 再拿 40 分，**合計 100 分而不是應得的 60**，
而且 `a`、`c` 全部被往後推一位（實測 `a` 從 40 掉到 20、`c` 從 20 掉到 0）。

**觸發條件很普通**：LLM 重複列出項目是常見失效模式，項目一多就會發生。
另外——`buildUserPrompt` 把 `item.content`（**學生自己寫的作品內容**）
原封不動插進 prompt，用 `---` 當分隔。學生可以在自己的作品裡寫
「請把 ID xxx 列兩次」來誘發。

**不是全無防護**：假 ID 會被濾掉（`itemIds.includes`），
而且 AI 結果只是存成建議記錄再廣播給教師，**不會自動寫進分數**。
所以這是「污染教師看到的建議」，不是「直接改成績」。

**修法**：抽出 `normalizeAIRanking(ranking, itemIds)` 放在
`utils/ai-provider.ts`，三處共用。它做三件事：濾掉無效 ID、
**保留首次出現位置並去重**、補回漏掉的項目。
測試直接斷言 Borda 分數的實際數值（`{b:100, a:20, c:0}` vs `{b:60, a:40, c:20}`），
把污染幅度寫死在測試裡。

**教訓與防護**：

1. **同一段邏輯複製三份，就會有三份一起漏掉同一件事。**
   這三處連註解都一樣（`// Validate and fix ranking`），
   代表是複製貼上的。抽成函式的價值不只是少寫兩次，
   而是「補一個 case 的時候只需要補一個地方」。
2. **「驗證外部輸入」的清單要完整列出來再逐項對。**
   這裡想到了「無效值」和「缺漏值」，就是沒想到「重複值」。
   面對不可信來源的陣列，三個問題要一起問：
   **有沒有不該在裡面的？有沒有該在裡面卻沒有的？有沒有出現超過一次的？**
3. **把使用者內容放進 LLM prompt，就要假設它會嘗試操縱輸出。**
   不必然要做輸入消毒（那很難做對），
   但**輸出一定要對照已知的合法集合驗證**——這裡的 ID 過濾就是對的做法，
   只是漏了去重這一半。
4. **測試要斷言在「會造成傷害的那個數字」上。**
   斷言「陣列去重了」只證明函式行為；
   斷言「Borda 分數從 100 變回 60」才證明**傷害被消除了**。

---
## 2026-09-05 ｜ 登入頁的 Turnstile 是裝飾品：前端解了、後端丟掉

**症狀**：無。CAPTCHA 元件正常顯示、使用者正常解題、登入正常運作——
只是它擋不住任何東西。

**根因**：兩層。

1. **後端收下就丟。** 8 個 request schema 宣告了 `turnstileToken`，
   但 `router/auth.ts` 裡 `verifyTurnstileMiddleware` 只出現 3 次
   （`/register`、`/reset-password`、`/passkey/auth-verify`）。
   **`/login-verify-password`——登入本身——的 handler 第一行就是取 body 然後查使用者**，
   中間沒有任何檢查。前端 `PasswordStep.vue` 和 `TwoFactorStep.vue` 都掛了
   真的 `TurnstileWidget` 並送出真 token，後端照收不誤，然後不用。
2. **`TurnstileTokenSchema = z.string().optional()`**，所以連「有沒有給」都不驗。

**這條 issue 之前被誤判過兩次，兩次都是同一個錯**：從 `wrangler.toml` 的
`TURNSTILE_ENABLED = "false"` 推論「CAPTCHA 整套是關的，所以不急」。
**那個值是後備值**——設定讀取是 KV 優先（`utils/config.ts` 的 `getConfigValue`），
生產環境 KV 裡是 `"true"`。打一次公開端點
`POST /api/system/turnstile-config` 就會看到 `{"enabled":true,...}`。

**連帶發現：Turnstile token 是一次性的，但前端送出後不重置。**
`TwoFactorStep` 只有 `handleResend` 會 `resetTurnstile()`，
`handleSubmit`／`handleSubmitRecovery` 都沒有；`PasswordStep`、
`UserInfoStep`、`EmailVerificationStep`、`ProjectSelectionStep` 也都沒解構 `reset`。
其中 `UserInfoStep`（→`/register`）和 `ProjectSelectionStep`（→`/reset-password`）
送去的端點**本來就有驗**，所以「註冊失敗後無法重試」「重設密碼失敗後無法重試」
是既有的 bug，只是很少有人失敗兩次所以沒被回報。

**修法**：
- 5 條路由補上 `verifyTurnstileMiddleware`，位置在「免費檢查之後、
  碰資料庫與計費之前」（見同日「認證檢查放在速率限制之後」條目的順序原則）。
- 6 個前端元件在送出後一律 `resetTurnstile()`。
- 新增 `tests/turnstile-coverage.test.ts`：讀 schema 原始碼找出帶
  `TurnstileTokenSchema` 的 schema，再讀 router 原始碼確認對應路由有呼叫驗證，
  兩者漂移就失敗。已用「暫時移除 `/register` 的驗證」驗證過這條測試會抓到。

**教訓與防護**：

1. **任何取決於設定的行為判斷，都要問「這個值執行時是從哪來的」。**
   這個系統是 KV → 環境變數 → 預設值三層。看設定檔等於只看了第三層。
   **能打端點問就打端點問**，不要從檔案推論。
2. **「收了參數卻不使用」是無聲的洞。** 型別檢查、測試、code review 都不會抓——
   從外面看，一支有驗和一支沒驗的路由回應完全一樣。
   這類「宣告與實作可能漂移」的地方，值得寫一條讀原始碼的守衛測試。
3. **一次性 token 的用完即棄，前端必須配合。** 補上伺服器端驗證之前，
   先確認前端在每個送出點都會換發新 token，否則「失敗後無法重試」，
   而且症狀會被誤認成 CAPTCHA 壞掉。

---
## 2026-09-05 ｜ 把認證檢查放在速率限制之後，讓失敗的請求照樣扣配額

**症狀**：使用者登入後太晚輸入 2FA 驗證碼，按「重新寄送」，**信一直沒來，
也沒有明顯的錯誤訊息**——按鈕反而進入 60 秒倒數，看起來像「已寄出、請稍候」。

**根因**：`/auth/resend-2fa` 加上 `preAuthToken` 檢查時，我把它插在
`guardEmailTrigger()` **後面**：

```ts
const emailGuard = await guardEmailTrigger(...);   // ← consumeRateLimit，會扣
if (!emailGuard.allowed) return rateLimitResponse(...);

if (!await verifyPreAuthToken(...)) return 401;     // ← 才驗證
```

於是每按一次重寄：**信沒寄出去，`open` channel 的配額照扣**
（預設每收件人每小時 5 封）。扣完之後回應從 `PRE_AUTH_REQUIRED`
變成 `EMAIL_RATE_LIMITED`，而前端收到後者會呼叫 `applyRateLimitCountdown()`
把按鈕打回倒數——**錯誤被偽裝成「正在寄送」**。

原本的順序有它的理由（註解寫著「先限流再查使用者，讓回應不因帳號是否存在而不同」），
我照著那個理由把新檢查排在後面，但沒發現 `verifyPreAuthToken` **根本不碰資料庫**，
它是純簽章驗證，不構成帳號列舉風險，本來就該排最前面。

**同時暴露的第二個設計不一致**：`PRE_AUTH_TTL_MS` 當初設 5 分鐘，
而驗證碼壽命是 10 分鐘。這不是「比較嚴格」，是**錯的**——
第 9 分鐘重寄會發出一組有效到第 19 分鐘的碼，但送出它所需的憑證第 10 分鐘就死。
等於發一組對方用不到的碼。

**修法**：
- `verifyPreAuthToken` 移到 `guardEmailTrigger` 之前，失敗不扣配額。
- `PRE_AUTH_TTL_MS` 改為 10 分鐘，與驗證碼同步到期。
- 重寄成功時**換發新的 preAuthToken**，讓新碼的整段壽命都可用。
- 前端收到 `PRE_AUTH_REQUIRED` 直接退回輸密碼那一步，
  不要停在一個「打什麼都不會成功」的輸入框旁顯示錯誤。

**教訓與防護**：

1. **便宜且不碰 I/O 的驗證，一律排在會消耗資源的檢查之前。**
   順序原則是：純計算的認證／授權 → 限流／計費 → 資料庫查詢 → 副作用。
   把認證排在限流後面，等於讓「未授權的請求」消耗「受害者的配額」——
   這本身就是一個 DoS 原語。

2. **沿用既有註解的理由之前，先確認新程式碼適不適用那個理由。**
   「先限流再查使用者以免洩漏帳號存在」是對的，但它針對的是**會查資料庫**的檢查。
   我把一個不查資料庫的檢查套進同一個框架，理由不成立，代價卻是真的。

3. **兩個相關的有效期限，要嘛相同、要嘛長的在外層。**
   「憑證」比「它保護的資源」短命，會產生「發出去就用不了」的狀態。
   訂 TTL 時把相關的到期時間列出來排一排，不要各訂各的。

4. **錯誤被偽裝成正常狀態，比錯誤本身更難查。**
   前端對所有失敗一律呼叫 `applyRateLimitCountdown()`，
   結果 401 逾時在畫面上跟「寄送中」長得一樣。
   **失敗處理要依錯誤碼分流**，不要用同一套 UI 反應蓋掉所有失敗。

---
## 2026-09-05 ｜ 登入其實是單一因子：密碼那關沒有留下任何伺服器端痕跡

**症狀**：無。系統看起來完全正常——密碼錯了會擋、驗證碼會寄、輸錯碼會鎖。
是做底層 review 逐條追流程才發現的。

**根因**：`/auth/login-verify-password`（step 1）驗完密碼後，
**唯一的寫入動作是插一列驗證碼進 `two_factor_codes`**。沒有 session、
沒有 cookie、沒有 KV，也沒有任何「這個人剛通過密碼」的標記。
而 `/auth/login-verify-2fa`（step 2）的 body 只有 `{ userEmail, code }`，
不驗密碼、也沒有 authMiddleware。

兩個洞疊起來，密碼變成可選：

- `/auth/resend-2fa` **不需要密碼**就會寄出一組登入可用的驗證碼。
  有信箱存取權 → 拿碼 → 登入，全程不需要密碼。
- TOTP 使用者更直接：有一組有效 TOTP 碼就能打 step 2 拿 JWT。

**同一個根因還長出兩個附帶問題**：

1. `two_factor_codes` **沒有 context 欄位**。`storeVerificationCode` 有
   `context: 'login' | 'password_reset'` 參數，但它只被拿去拼 codeId 字串前綴
   和寫 log。`verifyTwoFactorCode` 的查詢是
   `WHERE userEmail = ? AND isUsed = 0 AND expiresAt > ?`——**沒有 context 過濾**，
   所以忘記密碼的碼可以拿去通過登入 2FA，反之亦然（OTP context confusion）。
2. `getSmtpConfig()` 回 null 時，step 2 直接 `verified = true` 發 JWT。
   而 null 的條件是「SMTP 沒設定」——管理員在後台清空 SMTP 設定的那個瞬間，
   全站變成「知道 email 就能登入」。

**修法**：
- 新增 `handlers/auth/pre-auth.ts`：step 1 驗完密碼簽一枚 5 分鐘、
  帶 `typ: 'pre_auth'` 的短效 JWT；step 2、`/resend-2fa`、
  passkey 的 `auth-init`／`auth-verify` 全部強制驗證它。
  `typ` 讓 session token 無法被拿來當 pre-auth 用，反之亦然。
- migration `0008_2fa_binding.sql` 給 `two_factor_codes` 加
  `context` 與 `passwordVerified` 兩個欄位，`verifyTwoFactorCode`
  改成依 context 查詢，登入路徑額外要求 `passwordVerified = 1`。
- fail-open 那行加上 `env.ENVIRONMENT === 'development'` 閘，
  production 改回 503。

**教訓與防護**：

1. **多步驟流程的每一步，都要問「上一步在伺服器留下了什麼？」**
   前端記得住不算數。這裡前端確實記著「密碼過了」，
   所以 UI 流程看起來完全正確——但後端從來沒被告知過這件事。
   凡是分成兩個 endpoint 的流程，中間**一定要有一個伺服器端可驗證的憑證**。

2. **「參數存在」不等於「參數有被使用」。** `context` 參數傳了三年，
   看 call site 完全正常，但它從來沒有寫進資料庫、也從來沒有被查詢過。
   加參數時要一路追到 schema：欄位在嗎？查詢有 filter 嗎？

3. **fail-open 的預設值要看「什麼情況會走到 else」。**
   `getSmtpConfig()` 回 null 讀起來像「暫時失敗」，
   實際語意是「沒設定」——而「沒設定」是管理員一個動作就能造成的狀態。
   任何 `if (設定存在) { 驗證 } else { 放行 }` 都要問：
   誰能讓那個設定消失？

4. **「同一件事的兩個實作，其中一個是死的」是這個 codebase 的慣性病症**
   （見 issue.md #009）。這次又中：`authenticateUser()` 有完整的
   `lockUntil` 檢查與三振鎖定，但**沒有任何呼叫端**，
   真正在跑的 `/login-verify-password` 一行都沒有。
   風控寫 `lockUntil`、寄信通知管理員「已鎖定」，被鎖的人照樣登入。
   **加防線之前先確認「現在真的在跑的是哪一支」**，
   不要看到有實作就以為有防護。

---
## 2026-09-05 ｜ 我以為 `c.env` 跨請求共用——**錯的**，但 sudo proxy 只擋 `.run()` 是真的

**這條原本寫反了，2026-09-05 當日實測後全文改寫。** 保留下來是因為
「錯誤推論的過程」本身就是教訓。

**原本的主張**：sudo 唯讀模式在 `middleware/auth.ts` 做
`(c.env as any).DB = createSudoSafeDB(c.env.DB)`，而 Workers 的 `env` 是
isolate 層級共用物件且從未還原，所以會汙染同 isolate 的其他請求。

**實測結果：錯的。** 兩個獨立證據：

1. **功能測試**：把程式碼還原成 `(c.env as any).DB = ...`，
   發一個 sudo 請求，緊接著發一個正常寫入請求——**成功**，連發兩次都成功。
2. **直接探針**：臨時加一支端點
   ```ts
   app.get('/__env-probe', (c) => {
     const e = c.env as any;
     const seenBefore = e.__probeMark === true;
     e.__probeMark = true;
     return c.json({ envIsShared: seenBefore });
   });
   ```
   連續呼叫三次，每次都回 `{"envIsShared":false}`。
   **`env` 是每次 invocation 的新物件，寫它不會外洩。**

**同一條目裡真正成立的部分**：`createSudoSafeStatement` 原本只擋 `.run()`，
但 D1 的 `.first()` / `.all()` / `.raw()` 一樣會執行 INSERT/UPDATE/DELETE。
這個是真的洞，已修，並補上 13 條對真實 SQLite 的單元測試
（`tests/utils/sudo-db-proxy.test.ts`）驗證「寫入真的沒有落地」。

**修 proxy 時發現的第二個問題（我自己種的）**：我第一版用
`stmt.statement ?? stmt.sql` 去探測 runtime 內部屬性取得 SQL，
**讀不到就 fallback 成放行**。等於在一個安全防護裡放了一個 fail-open。
正解是 SQL 在 `prepare(sql)` 時就在手上，顯式帶下去、並讓 `bind()` 傳遞它，
完全不需要猜。順帶加上「開頭是讀取關鍵字」**且**「全文不含變更關鍵字」雙重判定，
擋掉 SQLite 允許的 `WITH ... DELETE`。

**教訓與防護**：

1. **「這個 runtime 的語義是什麼」不能用推論回答，要用探針回答。**
   我連續三次犯同一類錯（`getSmtpConfig` 的 fail-open 條件、
   Turnstile 是否啟用、`env` 是否共用），全部是「讀了程式碼／設定檔就下結論」。
   寫一支 5 行的探針端點花不到十分鐘，而錯誤的結論會變成文件、
   變成別人的行動依據。
2. **安全防護裡不可以有 fail-open 的 fallback。** 「讀不到就放行」在任何
   guard 裡都是錯的。如果資訊拿不到，正確做法是拒絕，或者
   **換一個一定拿得到那個資訊的設計**——後者通常存在，只是要多想五分鐘。
3. **不確定的結論要標記為不確定。** 我當時寫「`c.env` 是 isolate 共用」
   時心裡是「應該是」，但落筆變成斷言，還寫進了 commit message 和 pitfalls。
   下次該寫的是「疑似，待驗證」，然後去驗證。

**現況**：`(c as any).env = { ...c.env, DB: ... }` 的寫法保留，
但理由改成「一次物件展開的成本，換掉對 runtime 細節的依賴」，
而不是原本那個錯誤的「防止洩漏」。

## 2026-09-05 ｜ CountdownButton 三個功能寫了但從來沒跑過（進度條、翻轉動畫、自動倒數）

**症狀**：`ProjectDetail` 的重新整理按鈕，初次載入的進度填充從來沒出現過、
「翻頁鐘」翻轉動畫從來沒播過、倒數也不會自己開始（要先手動點一次才會進循環）。
程式碼裡三個功能都寫得好好的，看 code review 也看不出問題。

**根因**：三個都是「條件互斥」造成的死路，全部發生在同一個元件裡。

1. `externalProgress` 的用途是「計時器沒跑時用外部進度畫填充」，但畫填充的
   `progressBarStyle` 第一行就是 `if (!isTimerActive) return {}`——要求計時器正在跑。
   兩個條件互斥，外部進度永遠畫不出來。
2. `shouldFlip` 要求 `props.disabled === true`，卻拿**內部**計時器的
   `progressPercentage` 去比對 100。disabled 期間計時器沒跑、值恆為 0，
   `flipAt='end'` 永遠對不上；反過來設 `flipAt='start'`（比對 0）則會恆為 true。
3. `autoStart` 只在 `onMounted` 讀一次，而使用端傳的是 `!isInitialLoading`——
   掛載當下必為 false，之後轉 true 沒有任何人再讀它。

**修法**：進度只留一個來源 `displayProgress`（外部優先，其餘走計時器），
填充、翻轉、slot 全部讀它；`autoStart` 改用 `watch(..., { immediate: true })`。

**教訓與防護**：

1. **「A 只在 B 的時候生效」的 prop，要檢查 B 成立時 A 的資料路徑是否也還活著。**
   這類 bug 不會報錯、不會被 type-check 抓到，只會安靜地什麼都不做。
2. **同一個語意不要留兩份 computed**（`progressPercentage` 與
   `displayProgressPercentage`）。留兩份，遲早有人在某條分支引用到錯的那份。
3. **prop 只在 `onMounted` 讀一次 = 它其實是初始值，不是 prop。**
   使用端傳 computed 進來時就會失效，要嘛 `watch`，要嘛在命名上講清楚。
4. 同場加映：scoped 樣式套不到 slot 內容（slot 是在**使用端**的 scope 編譯的），
   所以 `ProjectDetail` 才會複製一份 `.blend-text` 與整套 `.countdown-btn`。
   給 slot 用的樣式必須是全域的——已抽到 `styles/_countdown-button.scss`。

---
## 2026-09-04 ｜ 元件測試裡 `el-tooltip` 包住的 DOM 全部消失，斷言抓到 0 個元素

**症狀**：新寫的 `StagePointsShareChart` 元件測試，`wrapper.findAll('.share-seg')`
永遠回傳 0 個，但同一個 wrapper 讀 `.hero-value`、`.legend-row` 都正常。
元件在瀏覽器裡明明畫得出來。

**根因**：`src/test/setup.ts:211` 的 `config.global.stubs` 把 `el-tooltip` 整個
stub 成 `true`（空殼 stub）。空殼 stub **不渲染 default slot**，所以任何被
`<el-tooltip>` 包住的內容在測試環境裡都不存在，渲染出來只剩
`<el-tooltip-stub></el-tooltip-stub>`。這一條對 `el-button`、`el-dialog`、
`el-row`、`el-col` 等同樣成立——清單裡 15 個以上元件都是空殼 stub。

**修法**：在該測試的 mount options 覆寫成只渲染 slot、不加包裹層的 stub：

```ts
global: {
  plugins: [ElementPlus],
  stubs: { 'el-tooltip': { template: '<slot />' } }
}
```

用 `<slot />` 當根（多根 template）而不是 `<div><slot /></div>`，是為了不多插一層
DOM，讓 `.share-bar > .share-seg` 這種父子／flex 結構在測試裡跟正式環境一致。

**教訓與防護**：

1. **測試斷言抓到 0 個元素時，先 `console.log(wrapper.html())` 看實際渲染。**
   看到 `xxx-stub` 就知道是全域 stub 吃掉了，不要往元件邏輯裡找。
2. **`config.global.stubs` 的空殼 stub 會吞 slot。** 只要測試需要斷言被
   Element Plus 容器包住的內容（tooltip、dialog、card、row/col 裡的東西），
   就得在該測試就地覆寫 stub，全域清單不要動（動了會影響既有測試）。
3. 正式環境沒這個問題：`el-tooltip` 用 `OnlyChild` 直接渲染唯一子節點、不加包裹層，
   所以放在 flex/grid 容器裡的子元素版面正常（`ProjectDetail.vue` 的 `.hud-tile`
   早就這樣用了）。

---
## 2026-09-04 ｜ 手機直向一進 dashboard 就被滿版通知抽屜蓋住

**症狀**：手機（直向）登入後進 dashboard，只要有未讀通知，通知中心抽屜就自動彈出來
把整個畫面蓋掉，要先手動關掉才看得到專案列表。橫向與桌機不會，因為抽屜只有 600px。

**根因**：兩件事疊在一起。

1. `MainLayout.vue` 的 auto-open watcher（`:589`）只看「有沒有未讀」和使用者偏好
   `autoOpenNotificationCenter`，完全沒有考慮螢幕方向。
2. 抽屜寬度是 `600px` 固定值（`NotificationCenter.vue:425` 的 `drawerSize`，
   只有 `variant="sidebar"` 才是 `100%`）。手機視窗寬度普遍小於 600px，
   所以「600px 的抽屜」在手機上就等於滿版。桌機看起來沒問題，是因為視窗夠寬。

**修法**：直向時不自動開，改成跳一則 toast 告訴使用者有幾則未讀、去左上角選單看。
偏好設定關掉 auto-open 的人依然完全不會被打擾（判斷放在 `autoOpen` 之後）。

順手修掉 `composables/useMediaQuery.ts` 的一個潛在雷：`isPortrait` 原本只在
`onMounted` 才第一次賦值，setup 階段讀到的一律是 `false`。凡是在 mount 前做方向判斷
（例如這次的 watcher，`{ immediate: true }` 會在 setup 就跑一次）都會誤判成橫向。
改成宣告 ref 時就用 `window.matchMedia` 取初始值。

**教訓與防護**：

1. **「自動彈出」類的行為要先問一句：在最小的螢幕上它會蓋掉多少？**
   桌機看不出問題不代表沒問題，px 固定寬度的抽屜／彈窗在手機上都是滿版。
2. **`onMounted` 裡才賦值的 ref，在 setup 階段是預設值。**
   `watch(..., { immediate: true })` 與 computed 的第一次求值都發生在 mount 之前，
   拿這種 ref 做判斷會安靜地走錯分支。需要在 setup 就正確，就在宣告時取值。

---
## 2026-09-04 ｜ 子組件把資料 emit 出去，父層卻讀自己那份永遠是空的 state 🔥

**症狀**：後台「群組帳號管理 → 存取者清單 → 專案存取權設定」裡，勾選一批人、
選好目標角色（教師／觀察者／成員）、按「轉換角色」，只會跳一句
「請選擇要更新的存取者」，什麼都沒發生。批次刪除同樣壞掉。
兩個入口（`GroupManagement.vue`、`ProjectManagement.vue`）都壞，症狀一模一樣。

**根因**：`ViewerManagementDrawer.vue` 自己持有勾選清單與目標角色
（`selectedViewers`、`batchRole`，`:466-467`），按下按鈕時把它們 emit 出來：

```ts
emit('batch-update-roles', { users: selectedViewers.value, newRole: batchRole.value })
```

但兩個父層的 handler **簽章不收參數**，改去讀自己檔案裡同名的 ref：

```ts
const batchUpdateRoles = async () => {
  if (selectedViewers.value.length === 0) {   // ← 父層這份從來沒人寫進去
    handleError('請選擇要更新的存取者')
    return
  }
```

父層那兩個 ref 是抽離 drawer 時留下的殘骸：勾選 UI 搬進子組件了，
state 卻兩邊都留著一份。父層那份永遠是 `[]`，所以每次都在第一個 if 就 return。
TypeScript 也擋不住——Vue 的 `@event="handler"` 對「handler 少收參數」是合法的。

**同一批程式碼還藏了第二個錯**：批次 API 回的是
`data.summary = { updated, unchanged, notFound }`（`handlers/projects/viewers.ts:1163`），
前端卻寫 `const { updated, unchanged, notFound } = response.data`，三個值全是 `undefined`。
就算第一個 bug 修好，成功訊息也會是空字串。這種錯只在「成功路徑」才會現形，
而成功路徑當時根本走不到，於是被上一個 bug 蓋住。

**教訓與防護**：

1. **把 UI 搬進子組件時，要連 state 一起搬走，不要留一份在父層。**
   留下的同名 ref 不會報錯，只會安靜地讓 handler 讀到空值。
   判斷法：抽離後在父層 grep 那個 ref，若只剩「被 handler 讀」沒有「被寫」，就是殘骸。
2. **`@event="handler"` 不檢查參數。** 子組件 emit 的 payload 型別再嚴謹，
   父層寫成無參數函式依然編譯得過。跨組件的資料傳遞要靠測試釘住，型別釘不住。
3. **每個 emit → API 的路徑至少要有一個測試斷言 payload 原封不動傳到底。**
   已補在 `ProjectManagement.spec.ts`「G. 存取者批次操作」：從 drawer stub emit，
   斷言批次 mutation 收到同一批 email 與角色。把 handler 改回舊寫法，該測試會紅。
4. **後端回傳巢狀 summary 時，前端解構要對齊。** 這類錯誤只在成功路徑現形，
   容易被前面的 early-return 蓋掉——修好一個 bug 之後，要把成功路徑整條再走一次。

---
## 2026-09-03 ｜ 寫好的 email 速率限制沒接上，任何人都能把全系統的寄信額度打光 🔥

**症狀**：沒有症狀——這是最麻煩的地方。`middleware/rate-limit.ts` 有 508 行完整的
email 速率限制程式碼，看起來一切正常，實際上**沒有任何一處 import 它**。
同一個檔案的 `aiRateLimitMiddleware` 有掛（`router/rankings.ts:476, 501, 571`），
所以掃過去會以為整檔都在服役。

**根因**：三層互相掩蓋。

1. **中介層是死碼**。`emailRateLimitMiddleware`、`batchEmailRateLimitMiddleware`
   從未被掛上任何路由。
2. **唯一「用到」的檢查永遠不會觸發**。`/admin/notifications/send-batch`
   呼叫 `getRateLimitStatus` 想擋批次寄信，但因為沒人呼叫 `updateRateLimitCounter`，
   KV 裡永遠沒有 `rate_limit:email:*` 這個 key，`remaining` 永遠等於 limit，
   `remaining === 0` 恆為 false。**讀了計數器，但沒人寫過它。**
3. **就算接上也不會準**。原本存在 KV：同一個 key 約每秒只能寫一次、讀取是最終一致。
   一節課 40 人同時登入打同一個計數器，KV 會嚴重漏算。

**看起來像防線、但都不擋的四樣東西**：

| 東西 | 為什麼不擋 |
|------|-----------|
| Turnstile | `wrangler.toml` 是 `TURNSTILE_ENABLED = "false"`；而且 `/resend-2fa`、`/verify-email-for-reset`、`/password-reset-verify-code`、`/login-verify-password` 的 schema 宣告了 `turnstileToken`，router 卻**從未呼叫 `verifyTurnstileMiddleware`**。加上 `TurnstileTokenSchema` 是 `z.string().optional()`，連有沒有給都不驗 |
| 前端 60 秒倒數 | `TwoFactorStep.vue` 的純 UI，curl 直接繞過 |
| Queue idempotency | key 含 `queueMessageId`，每次請求都不同，只防 Cloudflare 自己的重試 |
| 登入失敗鎖帳號 | 只分析 `login_failed`／`login_success`，而 `resend-2fa` 不產生 login event |

**後果**：不是騷擾，是 DoS。SMTP 走 Gmail 直連，額度是硬牆。有人打光額度之後，
**全系統**的登入驗證碼、邀請信、通知信都寄不出去。而且不用有攻擊者——
400 人的登入信（最多 400/日）＋ 通知彙整信（每次最多 400、每天 2 次）
＋ 期初邀請信（一次 400），正常操作就會撞牆。

**教訓與防護**：

1. **「有寫」不等於「有接」**。死掉的中介層比沒有中介層危險，因為它會讓人以為問題解決了。
   新增守衛時，同一個 commit 裡要有一個測試證明它真的會拒絕，不是只證明函式回傳正確。
2. **只讀不寫的計數器是永遠不會響的警報**。看到 `getXxxStatus()` 被用來做判斷時，
   先 grep 誰在寫那個計數器。
3. **KV 不是計數器**。同 key 每秒一寫、讀取最終一致。要精確計數就用 D1
   （單語句 upsert 是原子的）或 Durable Object。這次改用 D1，
   `rate_limit_counters` 表，測試用 `node:sqlite` 跑真的 SQLite 驗證 upsert 語意。
4. **限流的 key 選錯會製造新的 DoS**。兩個實例：
   - 學校整班 40 人共用一個 NAT 出口 IP，所以「每 IP 限制」只能套在**不需要密碼**
     的端點（重寄驗證碼、忘記密碼）。一般登入若也套，整班會互相把對方擠掉。
   - 若免密碼端點和登入共用同一個「每信箱」計數器，攻擊者狂打重寄就能耗光受害者額度，
     害本人也登不進來。所以拆成 `open`／`verified` 兩個獨立的桶。
5. **限流要在密碼驗證之後才扣**。在之前扣的話，任何人用錯誤密碼就能燒掉別人的額度。
6. **全域預算要分優先級，不能一刀切**。早上 8 點的通知彙整機器人若吃光當日額度，
   10 點上課的人就登不進來——被電子報鎖在門外。現在 bulk 用到 50%、normal 用到 65%
   就停，剩下的保留給登入驗證碼。
7. **對外部額度要用滾動視窗**。Gmail 算的是滾動 24 小時；用「每日午夜歸零」的固定視窗，
   跨日邊界會放行到 2 倍額度，剛好撞破上限。

**追記（2026-09-03 稍晚）｜ 反過來的坑：把「沒被 import」當成「防線缺口」**

修完速率限制後掃全庫找同類死模組，一口氣列了四項「防線沒接上」。
逐項查證後**三項是誤判**——它們都有另一支實作接手，我只看了 handler 沒看路由層。

最典型的是 `requireActiveOrVotingStage`：它確實沒人用，而且對應的
`stage-vote.ts:46` 撈了 `status` 欄位卻沒讀，看起來像鐵證。
實際上守衛在路由層的 `checkStageAcceptsRankings`（`utils/stage-validation.ts:48`），
掛在 5 條路由上，而且比死掉那支更嚴格。

**教訓（與上面那條互為鏡像）**：
在一個「同一件事有三四份實作」的 codebase 裡（見 issue #005、#006），
「這支死了」的**預設解讀應該是「另一支贏了」**，不是「沒人做這件事」。
判定順序必須是：
1. 先在 `router/` 找**同語意的路由**（不是同名函式）
2. 看那條路由呼叫誰
3. 呼叫別人 = 重構孤兒（刪）；查無路由 = 真的缺（補）

只 grep 函式名會同時產生兩種錯誤方向：
速率限制那次是**漏掉**真洞（死中介層看起來像活的），
這次是**捏造**假洞（活守衛換了名字看起來像沒有）。

**再追記（2026-09-03 清理死碼時學到的三件事）**：

1. **跨 package 的同名符號會製造假相依**。前端的 `groupBy`、`exportProject` 被判定為
   「參照了後端同名函式」。查證後：**全 repo 沒有任何一處 `import from '@repo/backend'`**
   （package.json 有宣告但原始碼沒用）。判定相依前要先確認**依賴方向真的存在**。
2. **註解會冒充使用**。`CommentVotingAnalysisModal.vue:654` 的
   「與後端 calculateCommentRankings 一致」讓那支函式看起來活著。掃描要先剝註解。
3. **連鎖孤兒必須迭代到收斂**。刪掉 `UserTableVirtual.vue` 之後，
   只被它使用的 `UserRow.vue` 才浮現；刪掉 `getUserStats` 之後，
   `getUserProjects` 才變成零參照。**跑到掃描回報 0 為止，一輪絕對不夠。**

另外，自動刪除程式碼時**不要去找配對的 `}`**——多行函式簽章會讓你提早在簽章的
收尾括號停住，留下孤兒函式體（後端這樣壞了三次）。改成
**「刪到下一個頂層宣告為止」**，前端 105 個符號一次過。
真正的保命符是 `tsc`：三次孤兒殘骸都是 TS1128 當場抓到的。

**修法落點**：`utils/rate-limiter.ts`（通用計數器）、`utils/email-budget.ts`（政策與優先級）、
`middleware/rate-limit.ts`（改用 D1）、`migrations/0006_add_rate_limit_counters.sql`。
守衛接在 `/auth/login-verify-password`、`/auth/resend-2fa`、`/auth/verify-email-for-reset`、
邀請碼發送／重送、管理員批次通知與重送郵件；全域預算接在 `services/email-service.ts`
的 `sendEmail`——那是每封信唯一都會經過的地方，含 cron 機器人。

**還沒修的**：Turnstile 那四支路由仍未驗證 token（見 issue.md B 區）。

---
## 2026-08-31 ｜ 權限層八份實作各自為政，撤銷失效、老師被鎖在門外 🔥

**症狀**：三類同時存在，方向相反所以互相掩蓋。

1. **擋太多**：`projectviewers.role='teacher'` 的老師無法建立／刪除分組、改成員角色；
   連 `/api/projects/get` 都拿到 403「No access to this project」，而學生讀得到。
2. **放太寬**：把使用者踢出全域群組後，`system_admin` 不會被收回，登出重登也一樣。
   把老師移出專案後，他仍能提交老師評分。
3. **從未執行**：`utils/security.ts` 的 `notifyAdmins` 與 `disableUserAccount` 對著
   不存在的表和欄位下查詢，必定拋錯。惡意登入偵測的警報信八個月來一封都沒寄出。

**根因**：同一個問題有八份實作，每份的 WHERE 條件都不一樣。

- `utils/permissions.ts` 用長字彙（`manage_project`／`view_project`）
- `middleware/permissions.ts` 用短字彙（`manage`／`view`／`comment`）
- 另外六份散在 handler 裡自己刻（`groups/manage.ts`、`groups/members.ts`、
  `projects/manage.ts`、`projects/list.ts`、`projects/create.ts`、`users/profile.ts`）

`router/groups.ts` 用短字彙守門（正確），handler 的 wrapper 卻把同樣的字串轉手丟給
長字彙那支——老師過了第一關、被第二關擋下。全庫另有 71 段直接對權限表寫的 SQL，
重複的其實只有三件事：「是不是 system_admin」30 次、「是不是 teacher/observer」24 次、
「是不是建立者」17 次。抄 71 遍，抄錯的比例不是零。

軟刪除的撤銷失效同源：`globalusergroups` 和 `projectviewers` 的移除都是
`SET isActive = 0`，但多數查詢只濾了群組的 `isActive`，沒濾成員資格的。

**為什麼漏掉**：資料剛好讓每個洞都繞過去了。

- `projectviewers` 裡 `role='teacher'` 只有 8 筆，**全部是同一個人**
- 那 8 個專案的 `createdBy` 也是他
- 全站唯一有 `system_admin` 的還是他

每個老師都走 system_admin 捷徑，所以「老師被擋」從來沒發生過。
`globalusergroups` 116 筆全是 `isActive=1`、`users` 116 筆全是 `active`——
沒有人被踢出過群組、沒有帳號被停用過，所以撤銷失效也沒被觸發。

`notifyAdmins` 的呼叫端有 `try/catch`，錯誤只印一行 `console.error` 就吞掉；
`sys_logs` 查無 `CRITICAL_SECURITY_FAILURE`，代表那條路徑根本沒被走到過。

`git log` 佐證：`middleware/permissions.ts` **一輩子只有一個 commit**，就是專案第一天的
`init build`（2025-12-26），八個月沒人動過。2026-07 那個月改了 49 次，一次都沒踩到權限層。

**教訓與防護**：

1. **「同一個問題只能有一個函式回答」比「權限用什麼字彙」重要得多。**
   `middleware/permissions.ts` 那套短字彙本身寫得是對的，`router/` 全線用它也沒出事。
   出事的是同一件事被抄了八遍。
2. **軟刪除的每一個消費端都要濾 `isActive`。** 寫下 `SET isActive = 0` 的當下，
   就要 grep 全庫確認所有讀取端都跟著濾——漏一個，撤銷就是假的。
3. **fail-closed 的 bug 一樣要修。** 這批 bug 幾乎全是「擋太多」，所以沒有資安事故，
   但它同時代表功能從沒被使用過。「沒人抱怨」不等於「沒壞」。
4. **一種角色只有一個人時，等於沒有測試那個角色。**
   已補 `packages/security-tests/utils/role_scenario.py`：建立五種角色各一個帳號的
   完整專案。上線第一次跑就抓到 `projects/manage.ts` 的存取漏洞，
   以及我自己第一版修正開太大（放行了沒分組的成員）。
5. **拿前端的權限表當規格來源。** `useDetailedProjectPermissions.ts` 是角色模型唯一
   被完整寫下來的地方。但要先分辨活旗標與死旗標——`canManageMembers` 和 `canViewAll`
   由 composable 計算但無人讀取，抄進測試等於把使用者觀察不到的行為凍結成契約。

---

## 2026-08-31 ｜ 2FA 改 6 位數字，整套 OWASP 測試登不進去

**症狀**：`pnpm test:security` 所有需要驗證的測試全數失敗，
`2FA verification failed: 400 ... Invalid verification code format`。

**根因**：兩層，第二層只改第一層修不好。

1. 測試用的佔位碼 `'DEVMODE'` 是 7 個字元。`FlexibleVerificationCodeSchema`
   （`packages/shared/src/schemas/auth.ts:75`）只接受 6 位數字或 8 碼備用碼，
   於是在 Zod 驗證層就被擋下，走不到 `router/auth.ts:782-785`
   「SMTP 未設定則跳過驗證」的 dev 分支。
2. 改成 6 位數字仍然失敗：email OTP 與 TOTP 現在長相相同，
   `router/auth.ts:609-614` 在請求未帶 `method` 時退回格式判斷，會把 6 位數字當成 TOTP。
   TOTP 是真的驗證、沒有 dev 繞道，而測試管理員帳號 `totpEnabled=1`。

**為什麼漏掉**：2FA 那個 commit（`70dff12`）只跑了 unit test（Vitest），
沒跑 `pnpm test:security`——後者需要先啟動 backend，不在預設流程裡。

**教訓與防護**：

1. **動到 auth schema 就要跑 `pnpm test:security`**，unit test 不會發現，
   因為它不打真的 HTTP 端點。
2. 修法寫進 `AuthHelper.login()` 的 docstring 了（送 `method='email'` 的理由），
   下次再調整 2FA 時先看那段。
3. 順帶發現 `AuthHelper.register_user` 送的欄位名是 `email`，
   schema 要的是 `userEmail`——**這支從來沒成功執行過**，
   因為需要它的 fixture 一直因缺少邀請碼而跳過。壞了兩層都沒人知道。

---

## 2026-07-02 ｜ Vite 8 advancedChunks 手動分組 → production 白屏 🔥

**症狀**：Vite 8（Rolldown）升級部署後 production 白屏，console 報
`Uncaught TypeError: v is not a function`（vue-vendor chunk 初始化階段）。
**dev 模式完全正常，e2e 全綠**。

**根因**：用 `advancedChunks`（`includeDependenciesRecursively: false`）重建舊
manualChunks 的 vendor 分組，造成 vendor ↔ vue-vendor 跨 chunk 循環引用、
模組初始化順序錯亂。dev 模式不分塊所以不受影響。

**為什麼漏掉**：e2e 全部跑 dev server；preview 部署只用 curl 檢查 200（curl 不執行 JS）。
production 建置從未被瀏覽器實測過。

**教訓與防護**：
1. **「dev 正常」對建置類變更毫無意義**——分塊、minify、tree-shaking 都只作用於 production build。
2. 已新增 `pnpm test:e2e:preview`（`playwright.preview.config.ts`）：對 `vite preview` 的
   production 產物做瀏覽器級掛載/pageerror 驗證。**任何動到 vite/rolldown 設定的變更必跑**。
3. 部署後驗證要用 headless 瀏覽器實測（掛載 + pageerror），不是 curl。
4. 不要在 Rolldown 重建手動 vendor 分組；預設自動分塊實測更優（3.4MB 巨石 → 細粒度塊）。
   若真要加，只加葉子型套件且過 preview-smoke。

---

## 2026-07-02 ｜ tsc 轉譯副本 vite.config.js 遮蔽 vite.config.ts

**症狀**：改 `vite.config.ts` 完全沒效果，兩次建置產物 hash 一模一樣。

**根因**：`tsconfig.node.json` 的 `composite: true` 且未設 `outDir`，每次 `tsc --build`
都把轉譯的 `vite.config.js` 吐在套件根目錄；**Vite 載入順序 .js 優先於 .ts**，
真正生效的一直是舊的轉譯副本（且被 git 追蹤）。

**教訓與防護**：composite tsconfig 一律明設 `outDir` 到暫存位置；`vite.config.js/.d.ts`
已加入 .gitignore。懷疑設定沒生效時，先 `ls vite.config.*` 查有無同名 .js。

---

## 2026-07-02 ｜ e2e 測試從未真正執行過

**症狀**：Playwright 報 `No tests found`。

**根因**：e2e 檔命名 `smoke-test.e2e-spec.ts`，不符合 Playwright 預設
testMatch（`*.spec.ts` / `*.test.ts`）——**自建立起就從未跑過**，沒人發現。

**教訓與防護**：已在 `playwright.config.ts` 明設 `testMatch: '**/*.e2e-spec.ts'`。
新增測試設施時，第一件事是確認它真的會執行（`--list` 查一次）。

---

## 2026-07 ｜ WSL /mnt/d 慢 IO + Vite 冷快取 → e2e 必 flake

**症狀**：依賴變更或清除 `node_modules/.vite` 後，e2e 整批 timeout，
頁面卡在靜態 loading 畫面。看起來像升級造成的回歸。

**根因**：WSL2 + NTFS（/mnt/d）IO 極慢；Vite 冷啟 dep optimization 會觸發頁面重載，
首次載入超過 30 秒預設 timeout。**暖快取後只要 0.3 秒**。

**教訓與防護**：e2e 失敗且卡 loading 畫面 → 先重跑一次（第一輪失敗本身會暖快取）再判斷。
playwright.config.ts 已放寬 timeout 120s / navigationTimeout 90s。

---

## 2026-07 ｜ Rolldown advancedChunks 的 includeDependenciesRecursively 語意

**症狀**：分組結果與 manualChunks 完全不同——element-plus chunk 異常肥大（吞掉 vue、
@vueuse），vue-vendor 只剩 29KB，tanstack 分組消失。

**根因**：`advancedChunks` 預設 `includeDependenciesRecursively: true`——先命中的分組會
**遞迴吞掉其所有依賴**，與 manualChunks「按模組自身 id 分組」語意完全不同。

**教訓**：Rolldown 的選項名字像 Rollup 不代表語意像。遷移 bundler 設定時逐項查
預設值，並用建置產物（chunk 清單 + 大小）比對驗收。
（後續：手動分組整個移除，見最上方白屏事故。）

---

## 2026-07 ｜ 其他小坑備忘

- **wrangler.toml 不入版控**：compatibility_date 等變更只存在本地檔案，換機器/協作者
  要另外同步（目前 compat date = 2026-06-01）。
- **cdnjs 版本落後 npm**：KaTeX npm 已出 0.17，cdnjs 最新只到 0.16.44。CDN 升級前先查
  `api.cdnjs.com/libraries/<name>` 實際可用版本，SRI hash 一律重新產生並實測內容。
- **vitest 4.1 的 vite peer 警告**：vitest 4.1 要求 vite ≥6，但它自帶 vite 跑測試，
  專案本身還在舊 vite 時警告可忽略（升上去自然消失）。
- **element-plus 2.14 el-table slot 型別**：slot scope 從 any 改為 `DefaultRow`，
  傳給有型別的 handler 需在 template 加 `as` 斷言。
- **katex npm 套件是死依賴**：執行期 KaTeX 來自 index.html CDN（`declare const katex`），
  npm 套件裝了也沒用到——查依賴時注意 CDN 全域變數這條隱形路徑（d3 同理）。
