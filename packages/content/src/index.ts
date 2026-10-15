// @vault-duel/content public entry point (ARCHITECTURE.md §2, D-176). Browser-safe: no node:* module is reachable
// from here. The Node-only parts (reading files, keyword-file checks) are on the "./node" entry.
export { DEFAULT_GLOBALS, OverridesError, withOverrides } from './globals';
export { compileContent } from './compile';
export type { GameContent } from './compile';
export { KEYWORDS } from '../keywords/index.gen';
export { validateContent } from './validate';
export type { ValidationResult } from './validate';
export { CONTENT_FILES, formatError, parseContent, parseFile } from './files';
export type { ContentData, ContentError, ContentKey, ContentLoad } from './files';
export { RAW_CONTENT } from './data';
export { PLANNED_GLOBALS } from './planned-globals';
export type { PlannedGlobal } from './planned-globals';
export { parseTemplate, renderText } from './text';
export { GlobalsSchema, globalsProblems } from './schemas/globals';
export * from './schemas/common';
export * from './schemas/effect';
export * from './schemas/card';
export * from './schemas/element';
export * from './schemas/kind';
export * from './schemas/recipe';
export * from './schemas/collector';
export type { CollectorAiConfig } from './schemas/collector';
export * from './schemas/objective';
export * from './schemas/twist';
export * from './schemas/art-brief';
