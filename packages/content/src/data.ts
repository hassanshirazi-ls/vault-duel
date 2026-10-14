// Every content JSON file, imported statically (D-176). This is the browser-safe source of the raw content: the web
// dev build parses RAW_CONTENT and reloads when a JSON file changes (Vite HMR). Node reads the same files through
// load.ts. The Record type makes a new key in CONTENT_FILES a compile error here until it is listed.
import elements from '../elements.json' with { type: 'json' };
import kinds from '../kinds.json' with { type: 'json' };
import recipes from '../recipes.json' with { type: 'json' };
import playerMonsters from '../cards/player-monsters.json' with { type: 'json' };
import playerSpells from '../cards/player-spells.json' with { type: 'json' };
import playerTraps from '../cards/player-traps.json' with { type: 'json' };
import relics from '../cards/relics.json' with { type: 'json' };
import collectorSpells from '../cards/collector-spells.json' with { type: 'json' };
import collectorTraps from '../cards/collector-traps.json' with { type: 'json' };
import collector from '../collector.json' with { type: 'json' };
import objectives from '../objectives.json' with { type: 'json' };
import twists from '../twists.json' with { type: 'json' };
import artBriefs from '../art-briefs.json' with { type: 'json' };
import type { ContentKey } from './files';

export const RAW_CONTENT: Readonly<Record<ContentKey, unknown>> = {
  elements,
  kinds,
  recipes,
  playerMonsters,
  playerSpells,
  playerTraps,
  relics,
  collectorSpells,
  collectorTraps,
  collector,
  objectives,
  twists,
  artBriefs,
};
