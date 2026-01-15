import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    name: 'backend',
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', '.wrangler'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'tests/**',
        'src/index.ts'
      ]
    },
    // Increase timeout for async tests
    testTimeout: 10000,
    hookTimeout: 10000
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@db': resolve(__dirname, 'src/db'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@handlers': resolve(__dirname, 'src/handlers'),
      '@middleware': resolve(__dirname, 'src/middleware'),
      '@router': resolve(__dirname, 'src/router'),
      '@repo/shared': resolve(__dirname, '../shared/src')
    }
  }
})
