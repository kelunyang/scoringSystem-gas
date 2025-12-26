/**
 * 首次使用教學內容配置
 * Tutorial content configuration for first-time users
 *
 * 重點：如何賺點數
 */

export interface TutorialStep {
  icon: string;
  title: string;
  content: string;
}

export interface TutorialConfig {
  title: string;
  description: string;
  steps: TutorialStep[];
}

/**
 * Dashboard 教學內容
 */
export const dashboardTutorial: TutorialConfig = {
  title: '歡迎使用計分系統！',
  description: '這裡是您的專案總覽，快速了解如何開始賺取點數：',
  steps: [
    {
      icon: 'fas fa-folder-open',
      title: '參與專案',
      content: '加入專案後，即可開始在各階段中提交作品、評論和投票'
    },
    {
      icon: 'fas fa-tasks',
      title: '完成階段任務',
      content: '在進行中的階段提交作品、發表評論，獲得其他成員的投票'
    },
    {
      icon: 'fas fa-coins',
      title: '獲得點數',
      content: '階段結束後，系統會根據投票結果自動分配點數到您的錢包'
    }
  ]
};

/**
 * Wallet 教學內容
 */
export const walletTutorial: TutorialConfig = {
  title: '錢包系統說明',
  description: '查看您的點數餘額與交易記錄：',
  steps: [
    {
      icon: 'fas fa-wallet',
      title: '點數餘額',
      content: '顯示您在各專案中累積的總點數'
    },
    {
      icon: 'fas fa-exchange-alt',
      title: '交易記錄',
      content: '查看所有獲得點數的詳細記錄，包括來源專案與階段'
    },
    {
      icon: 'fas fa-trophy',
      title: '財富排行',
      content: '查看全站點數排行榜，了解您的排名位置'
    }
  ]
};

/**
 * ProjectDetail 教學內容
 */
export const projectDetailTutorial: TutorialConfig = {
  title: '專案詳情說明',
  description: '在專案階段中賺取點數的方法：',
  steps: [
    {
      icon: 'fas fa-upload',
      title: '提交成果',
      content: '在進行中的階段點擊「發成果」提交您的作品'
    },
    {
      icon: 'fas fa-comments',
      title: '發表評論',
      content: '評論其他人的作品，獲得評論投票點數'
    },
    {
      icon: 'fas fa-vote-yea',
      title: '投票共識',
      content: '參與投票決定成果與評論的點數分配，投票本身也有獎勵'
    },
    {
      icon: 'fas fa-chart-line',
      title: '查看分析',
      content: '階段結束後可查看點數分配分析與個人獲得的點數'
    }
  ]
};

/**
 * 教學內容映射
 */
export const tutorialContentMap = {
  dashboard: dashboardTutorial,
  wallet: walletTutorial,
  projectDetail: projectDetailTutorial
} as const;

export type TutorialPage = keyof typeof tutorialContentMap;
