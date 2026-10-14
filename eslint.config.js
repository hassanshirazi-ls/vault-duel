import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import { builtinModules } from 'node:module';

// Determinism bans (ARCHITECTURE.md §1.2, §18 checklist): engine, content keywords and ai
// must not touch wall-clock time, ambient randomness, timers, DOM, Node APIs or
// object-key iteration order.
const determinism = {
  files: ['packages/engine/src/**/*.ts', 'packages/content/keywords/**/*.ts', 'packages/ai/src/**/*.ts'],
  rules: {
    'no-restricted-globals': [
      'error',
      ...['Date', 'performance', 'setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval',
        'queueMicrotask', 'requestAnimationFrame', 'window', 'document', 'navigator', 'globalThis', 'process',
        'require', 'Buffer', 'crypto', 'localStorage'].map((name) => ({
        name,
        message: 'Not allowed in deterministic code (ARCHITECTURE.md §1.2).',
      })),
    ],
    'no-restricted-properties': [
      'error',
      { object: 'Math', property: 'random', message: 'Use the seeded rng (engine/src/rng.ts).' },
      { object: 'Object', property: 'keys', message: 'Key iteration order is banned; use arrays.' },
      { object: 'Object', property: 'values', message: 'Key iteration order is banned; use arrays.' },
      { object: 'Object', property: 'entries', message: 'Key iteration order is banned; use arrays.' },
      { object: 'Reflect', property: 'ownKeys', message: 'Key iteration order is banned; use arrays.' },
    ],
    'no-restricted-syntax': [
      'error',
      { selector: 'ForInStatement', message: 'for…in is banned in deterministic code.' },
    ],
  },
};

// Dependency direction (ARCHITECTURE.md §2): engine ← content ← ai ← sim. One block per
// glob because a later no-restricted-imports entry replaces an earlier one, never merges.
const layer = (files, pkg, banned, banNode) => ({
  files,
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          ...(banNode
            ? [{ group: ['node:*', ...builtinModules], message: 'No Node APIs in deterministic code.' }]
            : []),
          ...banned.map((dep) => ({
            group: [`@vault-duel/${dep}`, `@vault-duel/${dep}/*`],
            message: `${pkg} must not depend on ${dep} (ARCHITECTURE.md §2).`,
          })),
        ],
      },
    ],
  },
});

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.gen.ts', 'docs/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
  determinism,
  layer(['packages/engine/**/*.ts'], 'engine', ['content', 'ai', 'sim'], true),
  layer(['packages/content/**/*.ts'], 'content', ['ai', 'sim'], false),
  layer(['packages/content/keywords/**/*.ts'], 'content', ['ai', 'sim'], true),
  layer(['packages/ai/**/*.ts'], 'ai', ['sim'], true),
  {
    files: ['packages/sim/**/*.ts', 'packages/content/scripts/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
);
