/**
 * Test factories for admin project-management component tests
 *
 * 注意：此檔案不可放在 __tests__/ 目錄下 —— vitest 的 include pattern
 * 會把 __tests__ 目錄下所有 .ts 當成測試檔收集。
 */

import type { Project, Stage } from '@repo/shared'

/**
 * ProjectManagement 的 ExtendedProject 形狀（Project + 前端擴充欄位）
 */
export type TestProject = Project & {
  createdBy?: string
  lastModified?: number
  scoreRangeMin?: number
  scoreRangeMax?: number
  studentRankingWeight?: number
  teacherRankingWeight?: number
  maxCommentSelections?: number
  commentRewardPercentile?: number
}

/**
 * 產生一筆專案列表資料（useAdminProjects 回傳的 projects 元素形狀）
 */
export function makeProject(overrides: Partial<TestProject> = {}): TestProject {
  return {
    projectId: 'prj_0001',
    projectName: '春季專題',
    description: '春季學期專題評分',
    creatorId: 'usr_admin1',
    creationTime: 1750000000000,
    status: 'active',
    settings: '{}',
    lastActivityTime: null,
    createdBy: 'admin@example.com',
    lastModified: 1750000000000,
    scoreRangeMin: 65,
    scoreRangeMax: 95,
    studentRankingWeight: 0.7,
    teacherRankingWeight: 0.3,
    maxCommentSelections: 3,
    commentRewardPercentile: 0,
    ...overrides
  }
}

/**
 * 產生一筆階段資料（listStagesMutation 回傳的 stages 元素形狀）
 */
export function makeStage(overrides: Partial<Stage> = {}): Stage {
  return {
    stageId: 'stg_0001',
    projectId: 'prj_0001',
    stageName: '期初報告',
    stageOrder: 1,
    description: null,
    startTime: 1750000000000,
    endTime: 1750600000000,
    status: 'active',
    settings: '{}',
    createdTime: 1750000000000,
    lastModifiedTime: null,
    ...overrides
  }
}

/**
 * 組出 listStagesMutation.mutateAsync 的 resolve 形狀
 */
export function makeStagesResult(stages: Stage[]) {
  return { stages }
}
