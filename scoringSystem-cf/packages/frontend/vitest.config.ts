import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    name: 'frontend',
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.ts', 'src/**/__tests__/**/*.ts'],
    exclude: ['node_modules', 'dist', 'tests/**', '**/e2e/**', '**/*.e2e-spec.ts'],
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/__tests__/**',
        'src/test/**',
        'src/main.ts',
        'src/vite-env.d.ts'
      ]
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@repo/shared': resolve(__dirname, '../shared/src')
    }
  }
})
