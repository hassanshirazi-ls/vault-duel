// Keyword rules that need only the registry (D-198): ids are unique and kebab-case, the display strings are set, and at
// most MAX_KEYWORDS entries exist. Browser-safe (no node:* import), so validateContent runs them in the browser dev build
// as well as in content:check. The registry has no file paths, so each problem names keywords/<id>.ts, the file that the
// id = file name rule (keyword-files.ts) requires. The file-level checks that need the files stay in keyword-files.ts.
import type { KeywordDef } from '@vault-duel/engine';
import type { ContentError } from './files';

/** KwMask is a 32-bit field (ARCHITECTURE.md §3, §8.4). */
export const MAX_KEYWORDS = 32;

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function keywordRegistryProblems(keywords: readonly KeywordDef[]): ContentError[] {
  const errors: ContentError[] = [];
  const seen = new Set<string>();
  for (const def of keywords) {
    const file = `keywords/${def.id}.ts`;
    const problem = (text: string, fix: string): void => {
      errors.push({ file, id: def.id, field: '', problem: text, fix });
    };
    if (!KEBAB.test(def.id)) problem('id is not kebab-case', 'use lowercase words joined by "-"');
    if (seen.has(def.id)) problem('duplicate id', 'rename one of them');
    seen.add(def.id);
    for (const field of ['name', 'icon', 'visual'] as const) {
      if (def[field].trim() === '') problem(`${field} is empty`, `set ${field} to a non-empty string`);
    }
  }
  if (keywords.length > MAX_KEYWORDS) {
    errors.push({
      file: 'keywords/',
      id: '(all)',
      field: '',
      problem: `${keywords.length} keywords and Flaws, the bit mask holds ${MAX_KEYWORDS}`,
      fix: 'remove one',
    });
  }
  return errors;
}
