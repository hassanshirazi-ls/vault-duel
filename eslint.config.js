import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import { builtinModules } from 'node:module';

// Determinism bans (ARCHITECTURE.md §1.2, §18 checklist): engine, content keywords and ai
// must not touch wall-clock time, ambient randomness, timers, DOM, Node APIs or
// object-key iteration order.
const mathRandom = { object: 'Math', property: 'random', message: 'Use the seeded rng (engine/src/rng.ts).' };

const determinism = {
  files: ['packages/engine/src/**/*.ts', 'packages/content/keywords/**/*.ts', 'packages/ai/src/**/*.ts'],
  ignores: ['**/*.test.ts'],
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
      mathRandom,
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
        // Builtins go in `paths` (exact names): as gitignore-style `patterns` they would also
        // match local files such as ./events.
        paths: banNode ? builtinModules.map((name) => ({ name, message: 'No Node APIs in deterministic code.' })) : [],
        patterns: [
          ...(banNode ? [{ group: ['node:*'], message: 'No Node APIs in deterministic code.' }] : []),
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
  // deepFreeze walks own keys, but freezing doesn't depend on visit order (D-147). Only the
  // key-iteration bans are lifted here; every other determinism rule still applies.
  {
    files: ['packages/engine/src/freeze.ts'],
    rules: { 'no-restricted-properties': ['error', mathRandom] },
  },
  // canonicalJson sorts own keys before writing them, so its output is independent of key order (D-191).
  {
    files: ['packages/engine/src/canonical.ts'],
    rules: { 'no-restricted-properties': ['error', mathRandom] },
  },
  layer(['packages/engine/**/*.ts'], 'engine', ['content', 'ai', 'sim'], true),
  layer(['packages/content/**/*.ts'], 'content', ['ai', 'sim'], false),
  // D-176: content's src is browser-safe. Only load.ts and keyword-files.ts (the "./node" entry) may use node:*.
  // Test files run under Node, so they are left out. A later block replaces the earlier no-restricted-imports for
  // the files it matches, so the ai and sim bans of the layer above are repeated here.
  {
    files: ['packages/content/src/**/*.ts'],
    ignores: ['packages/content/src/load.ts', 'packages/content/src/keyword-files.ts', 'packages/content/src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*'], message: 'content src is browser-safe (D-176); Node APIs live in load.ts and keyword-files.ts (./node).' },
            ...['ai', 'sim'].map((dep) => ({
              group: [`@vault-duel/${dep}`, `@vault-duel/${dep}/*`],
              message: `content must not depend on ${dep} (ARCHITECTURE.md §2).`,
            })),
          ],
        },
      ],
    },
  },
  layer(['packages/content/keywords/**/*.ts'], 'content', ['ai', 'sim'], true),
  layer(['packages/ai/**/*.ts'], 'ai', ['sim'], true),
  // apps/web: browser code with React. The determinism bans do not apply (they cover engine, keywords and ai only).
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  // The difficulty worker runs in a WebWorker scope: `self` is its global, `window` does not exist there.
  {
    files: ['apps/web/src/daily/difficulty.worker.ts'],
    languageOptions: { globals: globals.worker },
  },
  // Web tests run under Node (vitest), not in a browser.
  {
    files: ['apps/web/test/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['packages/sim/**/*.ts', 'packages/content/scripts/**/*.ts', '*.config.{js,ts}', 'apps/web/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
);
