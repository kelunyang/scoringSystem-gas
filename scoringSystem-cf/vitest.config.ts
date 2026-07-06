import { defineConfig } from 'vitest/config'

// Vitest 4 projects config (replaces the deprecated vitest.workspace.ts).
// Referencing each package's own vitest.config.ts as a project applies that
// config's resolve.alias during test module resolution — which the deprecated
// defineWorkspace(file-reference) form failed to do, breaking alias imports of
// source modules (e.g. settlement.ts → @utils/*) in the backend project.
export default defineConfig({
  test: {
    projects: [
      'packages/shared/vitest.config.ts',
      'packages/frontend/vitest.config.ts',
      'packages/backend/vitest.config.ts'
    ]
  }
})
