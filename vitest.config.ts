import { configDefaults, defineConfig } from 'vitest/config';

// Vitest 4+ replaced vitest.workspace.ts with `test.projects` (D-119).
// `tsc -b` emits compiled tests into dist/, so each project must exclude it.
export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: ['engine', 'content', 'ai', 'sim'].map((name) => ({
      extends: true,
      test: { name: `@vault-duel/${name}`, root: `packages/${name}` },
    })),
    exclude: [...configDefaults.exclude, '**/dist/**'],
  },
});
