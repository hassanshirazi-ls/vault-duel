import { defineConfig } from 'vitest/config';

// Vitest 4+ replaced vitest.workspace.ts with `test.projects` (D-119).
export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: ['packages/*'],
  },
});
