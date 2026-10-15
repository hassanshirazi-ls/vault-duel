// The module that sees content change. It imports the content root by name so Vite's HMR can treat it as the
// boundary for every JSON, globals.ts and keyword file edit (D-176): `accept` hands over the fresh module.
import * as content from '@vault-duel/content';
import type { ContentApi } from './load';

export const initialContentApi: ContentApi = content;

export function onContentReload(callback: (api: ContentApi) => void): void {
  if (!import.meta.hot) return;
  import.meta.hot.accept('@vault-duel/content', (fresh) => {
    if (fresh) callback(fresh as unknown as ContentApi);
  });
}
