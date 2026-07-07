# Options API → `<script setup>` 遷移計畫

> 產出日期：2026-07-02
> 前置條件：**使用者先將工作區 WIP（44 檔）commit 落地**，再開新對話執行
> 現狀：146 個 Vue 組件中 136 個（93%）已是 `<script setup lang="ts">`，殘留 11 檔約 24,000 行

## ✅ 進度（2026-07-07 更新）

- **前置 WIP 落地**：✅ 完成（分 5 個 commit：2FA 改造、同名次排名、強制清票、雙 ESC、config 補落地）
- **第一波**：✅ 完成（TurnstileWidget `fe5b189`、UserEditorDrawer `f552bcf`、ViewerManagementDrawer `6cd17c2`）
- **第二波**：✅ 完成（StageGanttChart `38dcf04`、StageComments `9f7b878`、UserSettings `fd76d60`）
- **第三波**：✅ 完成（ProjectCard `454b75f`（泛型組件）、TopBarUserControls `2fded06`）
- **第四波**：GroupManagement ✅ 完成（`fa19411`）；**`vue/block-lang` 豁免區塊已整段刪除**（完成定義 #2 達成）
- **UserManagement ✅ 完成**（2026-07-07，`2825d17`/`084e390`/`c743b8c` 三 commit）：
  - 先補**首個組件掛載測試**（6 條：列表渲染、空狀態、權限三態、篩選 debounce、開 drawer、confirm 送 mutation），遷移前後不改一字通過
  - 文件寫「TS+Options」已過時——實際跟 GroupManagement 一樣**早已是純 `setup()`**，轉換 = 拆殼 + 刪 200 行 return
  - 檔內 `no-explicit-any` 17 → 0；**型別化又揪出真 bug**：user-global-groups/user-project-groups 請求 body 送 `{ targetEmail }`/`{ email }`，後端 zValidator 要求 `{ userEmail }`，先前一律 400（編輯抽屜的群組清單載不出）。已修並同步 shared 型別
  - 拆殼後 eslint 揭露 53 個被 return 物件掩護的死綁定（邀請碼重複邏輯、頭像編輯殘骸、DISABLED tags），全刪；檔案 5,236 → 約 3,600 行
  - 測試基建備忘：無 Pinia 需求（sudo store 只在 mock 掉的 mutation callback 觸及）；mount 要 `plugins: [ElementPlus]`（main.ts 是全域註冊）；mock 覆寫一律放 spec `beforeEach`（setup.ts 會 clear/restore）；el-* stub 的 props 落在 attrs
- **ProjectManagement ✅ 完成**（2026-07-08，6 commit：`f874421` 測試 → `00f4af3`/`7031280`/`6df9850` 拆三個內嵌 drawer → `cda4617` 拆殼 → `e752ed7` any 歸零）：
  - 先補 8 條掛載測試（列表/空狀態/封存開關/搜尋/route 驅動展開/複製專案/複製階段/封存全流程），設計為**抽離不敏感**（只斷言 mutation payload、drawer 開關、穩定 DOM 錨點），六個 commit 全程一字不改通過
  - 拆出 `project/CloneProjectDrawer.vue`、`CloneStageDrawer.vue`、`ArchiveProjectDrawer.vue`（直接 script setup）＋共用 `utils/projectStatus.ts`；Archive 的違規內嵌 el-alert 順手改 DrawerAlertZone
  - 與 UserManagement 同款劇本重演：文件寫「TS+Options」但實際早已是純 `setup()`，拆殼後 eslint 揭露 **50+ 個被 return 物件掩護的死綁定**（成員管理/階段排序/檢視者排序等先前抽 drawer 的殘骸），全刪；檔案 6,822 → 5,594 行
  - 檔內 `no-explicit-any` 62 → 0：drawer 回傳 payload 直接用子組件 export 的 `ProjectForm`/`StageForm`/`SelectedUser` 型別；結算 handler 收 SettlementConfirmationDrawer 的窄版 Stage（單點 cast）；CSV rowMapper 收 `Record<string, unknown>` 符合 ExportableData 契約
- **殘留**：無 — 146/146 組件皆為 `<script setup lang="ts">`。手動冒煙與 production 部署驗證待做（見完成定義 #4）
- **收尾清理**（2026-07-08，`04c9ffe`）：全量複掃確認零 Options API 殘留（150/150，含新增組件；defineComponent/mixins/this.$ 皆零命中）；順手刪除無引用的 `GlobalAuthModal.new.vue`、`StageTimeline.refactored.backup.vue`，並將現役的 `ProjectDetail-New.vue` 更名為 `ProjectDetail.vue`（router import 同步）
- 執行修正註記：
  - StageGanttChart 實際是 npm `d3` + `@types/d3`（非 CDN 全域），且內部原本就是 `setup()` 寫法、無 `this` 逃逸問題
  - GroupManagement 也已是純 `setup()`（文件寫的混合式已被先前重構清掉），轉換 = 搬殼 + 2,200 行型別化
  - 型別化揪出真 bug：GlobalGroupsTable 對 API 回傳的權限陣列 JSON.parse 會 throw 誤報「格式錯誤」（已修）
  - 死碼順手清除：StageComments（handleReply/isCommentEligible/initial* props）、UserSettings（click-outside 指令）、TopBarUserControls（userBadges 相容 computed）、GroupManagement（removingMember/stats/createProjectGroup）

## 目標

1. 全部組件統一為 `<script setup lang="ts">`（Composition API + TS）
2. 逐檔清空 `eslint.config.js` 中 `vue/block-lang` 的 7 檔豁免清單
3. 順手清償轉換檔案內的 `no-explicit-any` 債（轉換時必然要定型別，一魚兩吃）

## 殘留清單與轉換順序

安排原則：由小到大熱身、WIP 檔案殿後、三巨頭補測試後才動。

### 第一波：小檔熱身（單檔單 commit）

| # | 檔案 | 行數 | 現狀 | 特殊注意 |
|---|------|------|------|----------|
| 1 | `components/TurnstileWidget.vue` | 242 | 純 JS | 操作全域 `window.turnstile`（index.html 載入的外部 script）；需宣告 global 型別 |
| 2 | `components/admin/user/UserEditorDrawer.vue` | 845 | TS + Options | CLAUDE.md 引用它當 Drawer 範例，轉換後確認文件仍準確 |
| 3 | `components/admin/project/ViewerManagementDrawer.vue` | 1,082 | 純 JS | Drawer 標準結構，參考 UserEditorDrawer 轉換模式 |

### 第二波：中型檔

| # | 檔案 | 行數 | 現狀 | 特殊注意 |
|---|------|------|------|----------|
| 4 | `components/charts/StageGanttChart.vue` | 1,515 | 純 JS | D3 由 CDN 全域載入（`declare const d3`）；大量 template ref 與命令式 DOM 操作，轉換時 `this.$refs` → `useTemplateRef` |
| 5 | `components/StageComments.vue` | 1,546 | TS + Options | 已有型別，主要是結構搬遷 |
| 6 | `components/UserSettings.vue` | 1,589 | 純 JS | 表單重、含 2FA/passkey 設定入口，轉換後人工驗證各設定流程 |

### 第三波：WIP 檔案（等使用者 WIP commit 後）

| # | 檔案 | 行數 | 現狀 | 特殊注意 |
|---|------|------|------|----------|
| 7 | `components/TopBarUserControls.vue` | 1,007 | 純 JS | 2026-07 已做過 blinkAnimationClass watcher 重構，轉換時保留該模式；徽章輪播、煙火動畫有 `$nextTick`/`$el` 用法要改 `nextTick`/template ref |
| 8 | `components/ProjectCard.vue` | 1,251 | 純 JS | WIP 檔 |

### 第四波：管理後台三巨頭（先補測試再動）

| # | 檔案 | 行數 | 現狀 | 特殊注意 |
|---|------|------|------|----------|
| 9 | `components/admin/GroupManagement.vue` | 2,783 | 純 JS（options + `setup()` 混合） | 已有 `setup()` 區塊，轉換相對機械：把 options 區塊（data/computed/methods）併入 setup 再改 script setup |
| 10 | `components/admin/UserManagement.vue` | 5,235 | TS + Options | **先補組件測試**（見驗證策略） |
| 11 | `components/admin/ProjectManagement.vue` | 6,822 | TS + Options | 最大最核心；**先補組件測試**；建議轉換前先拆分子組件（stages 面板、gantt 區、settlement 區各自抽離），拆完每塊 <2000 行再轉 |

## 每檔轉換模式（標準步驟）

1. `git commit` 前置：確認該檔工作區乾淨
2. 結構搬遷：
   - `data()` → `ref()` / `reactive()`（單值用 ref，整包表單物件用 reactive）
   - `computed: {}` → `computed(() => ...)`
   - `methods: {}` → 普通函式
   - `watch: {}` → `watch()` / `watchEffect()`
   - 生命週期：`mounted` → `onMounted`，`beforeUnmount` → `onBeforeUnmount`
   - `props` → `defineProps<Props>()`（withDefaults 補預設值）；`emits` → `defineEmits<...>()`
   - `this.$refs.x` → `useTemplateRef('x')`；`this.$nextTick` → `nextTick`
   - `this.$emit` → emit；`inject/provide` options → 函式版
3. 補型別：轉換過程中順手把該檔的 `any` 清掉（`no-explicit-any` 債）
4. 若在 block-lang 豁免清單 → 從 `eslint.config.js` 移除該檔
5. 驗證（見下）→ 單檔 commit：`refactor(vue): <檔名> Options API → script setup`

### 常見地雷

- **模板隱式暴露**：Options API 的 data/methods 全部自動暴露給模板；script setup 只暴露頂層綁定。轉完 `vue-tsc` 會抓漏，但**動態存取**（`$options`、字串索引）抓不到，需 grep 檢查
- **`this` 逃逸**：傳給第三方 callback 的 method 若依賴 `this`，轉換後閉包行為改變——D3 圖表（StageGanttChart）最容易踩
- **mixin**：若遇到 mixins 要先內聯成 composable
- **`expose`**：父組件透過 ref 呼叫子組件方法的情況，script setup 需明確 `defineExpose`——轉換前先 grep 父層有無 `.value.someMethod()` 呼叫

## 驗證策略

每檔 gate（缺一不可）：
```bash
pnpm type-check && pnpm lint   # vue-tsc + eslint 0 error
pnpm test && pnpm build
pnpm test:e2e                  # 5 個 smoke
```
加上該檔功能的手動冒煙（dev server 操作一輪）。

**三巨頭前置**：現有測試防護只有 smoke e2e，不足以保護 5000+ 行的轉換。動 UserManagement/ProjectManagement 前，先用 @vue/test-utils + happy-dom 補「渲染 + 關鍵互動」層級的組件測試（列表渲染、篩選、開啟 drawer、送出表單各一條），再開始轉換。

## 建議的對話切分

- 對話 A：第一波 3 檔（熱身、確立模式）
- 對話 B：第二波 3 檔
- 對話 C：第三波 2 檔（WIP 落地後）
- 對話 D：GroupManagement + UserManagement 補測試與轉換
- 對話 E：ProjectManagement 拆分子組件 → 轉換（必要時再拆多個對話）

每個對話開頭引用本文件即可接手。

## 完成定義

- [x] 146/146 組件皆為 `<script setup lang="ts">`（2026-07-08 達成）
- [x] `eslint.config.js` 的 `vue/block-lang` 豁免區塊整段刪除
- [x] 轉換檔案內 `no-explicit-any` 歸零（全域歸零另見 2026-summer-todo；全 monorepo warnings 1141 → 1028）
- [ ] 全 gate 綠燈 ✅（每 commit 皆過 type-check/lint/test/build/e2e）+ **手動冒煙與 production 部署驗證待做**（/admin/projects：列表/篩選/展開 deep link/複製專案/複製階段/封存解封/抽查其他 drawer）
