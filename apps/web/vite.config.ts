import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

/** Every file under `dir`, as paths relative to it, in a stable order. */
function listFiles(dir: string, base = dir): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? listFiles(full, base) : [relative(base, full)];
    });
}

/**
 * Offline cache (D-250): after the build, writes dist/sw.js with the app shell (every emitted file except card art,
 * seeds.json, the worker script itself and the .woff fallbacks of fonts that ship as .woff2) as its precache list. The cache name hashes the files, so a new build is a
 * new cache and the old one is deleted when the new worker takes over. Content is bundled in the JS; seeds.json and
 * art/ are cached as they are used (see src/sw/sw.template.js).
 */
function offlineShell(): Plugin {
  let outDir = 'dist';
  return {
    name: 'vault-duel-offline-shell',
    apply: 'build',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = listFiles(outDir).filter((f) => f !== 'sw.js' && f !== 'seeds.json' && !f.startsWith('art/') && !f.endsWith('.woff'));
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const template = readFileSync(join(import.meta.dirname, 'src/sw/sw.template.js'), 'utf8');
      const sw = template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(['./', ...files]));
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}

/** D-257: the first 7 characters of VERCEL_GIT_COMMIT_SHA, else `git rev-parse --short HEAD`, else `dev`. */
function buildSha(): string {
  const vercel = process.env['VERCEL_GIT_COMMIT_SHA'];
  if (vercel !== undefined && vercel.trim() !== '') return vercel.trim().slice(0, 7);
  try {
    const out = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return out === '' ? 'dev' : out;
  } catch {
    return 'dev';
  }
}

// Workspace packages export TypeScript source ("exports": "./src/index.ts"), so Vite compiles them like app code
// and JSON/keyword edits reach the HMR graph (D-176).
export default defineConfig({
  plugins: [react(), offlineShell()],
  define: { __BUILD_SHA__: JSON.stringify(buildSha()) },
  worker: { format: 'es' },
  build: { target: 'es2022' },
});
