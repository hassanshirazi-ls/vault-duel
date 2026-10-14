// The "./node" entry point of @vault-duel/content (D-176): the Node-only parts. Browser code must not import it.
// The root entry (index.ts) is browser-safe and never reaches node:* modules.
export { CONTENT_ROOT, loadContent } from './load';
export * from './keyword-files';
