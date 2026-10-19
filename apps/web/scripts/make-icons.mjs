// Renders public/icon.svg to the PNG sizes the manifest and iOS need. Playwright is not a repo dependency; pass the
// path of an installed copy: node scripts/make-icons.mjs /path/to/node_modules/playwright/index.mjs
// The maskable icon is the same seal scaled to 80% on paper, so Android's circular crop never clips the rim.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pub = resolve(here, '../public');
const playwrightPath = process.argv[2];
if (playwrightPath === undefined) throw new Error('usage: make-icons.mjs <path to playwright index.mjs>');
const { chromium } = await import(playwrightPath);
const svg = readFileSync(resolve(pub, 'icon.svg'), 'utf8');
const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#f3f0e8"/><g transform="translate(51.2 51.2) scale(.8)">${inner}</g></svg>`;

const jobs = [
  ['icons/icon-192.png', 192, svg],
  ['icons/icon-512.png', 512, svg],
  ['icons/icon-maskable-512.png', 512, maskable],
  ['apple-touch-icon.png', 180, svg],
  ['favicon-32.png', 32, svg],
];
mkdirSync(resolve(pub, 'icons'), { recursive: true });
const browser = await chromium.launch();
for (const [file, size, markup] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:#f3f0e8">${markup.replace('<svg ', `<svg style="display:block" width="${size}" height="${size}" `)}</body>`);
  writeFileSync(resolve(pub, file), await page.screenshot({ type: 'png' }));
  await page.close();
}
await browser.close();
console.log('wrote', jobs.map((j) => j[0]).join(', '));
