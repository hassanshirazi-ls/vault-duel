// @vault-duel/content public entry point (ARCHITECTURE.md §2).
export { DEFAULT_GLOBALS, withOverrides } from './globals';
export { compileContent } from './compile';
export { KEYWORDS } from '../keywords/index.gen';
export { checkKeywordSources, loadKeywordFiles, sortKeywords } from './keyword-files';
export { CONTENT_FILES, CONTENT_ROOT, formatError, loadContent, parseFile } from './load';
export { GlobalsSchema, globalsProblems } from './schemas/globals';
export type { ContentData, ContentError, ContentKey, ContentLoad } from './load';
export * from './schemas/common';
export * from './schemas/effect';
export * from './schemas/card';
export * from './schemas/element';
export * from './schemas/kind';
export * from './schemas/recipe';
export * from './schemas/collector';
export * from './schemas/objective';
export * from './schemas/twist';
export * from './schemas/art-brief';
