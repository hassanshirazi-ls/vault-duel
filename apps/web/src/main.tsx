// Self-hosted fonts (D-351), latin subset and only the weights the styles use, so the offline app has them.
import '@fontsource/grenze-gotisch/latin-700.css';
import '@fontsource/spectral/latin-400-italic.css';
import '@fontsource/ibm-plex-sans-condensed/latin-400.css';
import '@fontsource/ibm-plex-sans-condensed/latin-600.css';
import './style/tokens.css';
import './style/base.css';
import './style/card.css';
import './style/screens.css';
import './style/meta.css';
import './style/howto.css';
import './style/wheel.css';
import './style/ink.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initialContentApi, onContentReload } from './content/hot';
import { loadGameContent } from './content/load';
import { parseOverrides } from './content/overrides';
import type { ContentApi } from './content/load';
import { fetchManifest } from './daily/manifest';
import { resolveSetup } from './daily/rating';
import { computeInWorker } from './daily/worker-client';
import { resolveDate } from './daily/date';
import { browserStorage } from './persistence/storage';
import { createGameStore, RESTART_NOTICE } from './store/game';
import { App } from './ui/App';
import { StoreContext } from './ui/context';

const storage = browserStorage();
// D-176, D-262: `?set=`, `?debug` and `?date=` work in dev builds only.
const devSearch = import.meta.env.DEV ? window.location.search : '';
const overrides = import.meta.env.DEV ? parseOverrides(window.location.search) : [];
let api: ContentApi = initialContentApi;

const store = createGameStore({
  storage,
  loadContent: () => loadGameContent(api, overrides),
  today: (g) => resolveDate(devSearch, new Date(), g.RESET_HOUR_LOCAL),
  resolveSetup: (ctx, date, onProgress) =>
    resolveSetup(ctx, date, {
      storage,
      manifest: () => fetchManifest(`${import.meta.env.BASE_URL}seeds.json`),
      compute: (date, onProgress) => computeInWorker(date, overrides, onProgress),
      onProgress,
    }),
});

// D-176, D-197: any content edit restarts the duel in progress.
onContentReload((fresh) => {
  api = fresh;
  const inDuel = store.getState().state !== null && store.getState().actions.length > 0;
  void store.getState().boot(inDuel ? { restartNotice: RESTART_NOTICE } : {});
});

void store.getState().boot();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <StoreContext.Provider value={store}>
      <App />
    </StoreContext.Provider>
  </StrictMode>,
);
