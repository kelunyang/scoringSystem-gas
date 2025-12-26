module.exports = {
  // 測試環境
  testEnvironment: 'node',
  
  // 測試文件位置
  roots: ['<rootDir>/tests'],
  
  // 測試文件匹配模式
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  
  // 覆蓋率收集
  collectCoverageFrom: [
    'scripts/**/*.js',
    '!scripts/**/*.test.js',
    '!scripts/__tests__/**'
  ],
  
  // 覆蓋率報告
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // 設置文件
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // 模組路徑映射
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/scripts/$1'
  },
  
  // 全域變數
  globals: {
    // GAS 全域變數將在 setup.js 中模擬
  },
  
  // 測試超時時間
  testTimeout: 10000,
  
  // 詳細輸出
  verbose: true
};