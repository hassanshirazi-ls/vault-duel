// Content at startup (D-176): parse -> validate -> compile. Never throws; a failure comes back as the §10.3 lines.
// The content API is passed in so the dev build can hand over a freshly reloaded module (hot.ts).
import type * as ContentModule from '@vault-duel/content';
import type { GameContent } from '@vault-duel/content';
import type { Globals } from '@vault-duel/engine';

export type ContentApi = Pick<
  typeof ContentModule,
  'RAW_CONTENT' | 'parseContent' | 'validateContent' | 'compileContent' | 'DEFAULT_GLOBALS' | 'KEYWORDS' | 'formatError' | 'renderText'
>;

export interface ElementInfo {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly icon: string;
  /** ids of the elements this one beats (elements.json); the reverse gives "weak to" */
  readonly beats: readonly string[];
}

export interface KindInfo {
  readonly id: string;
  readonly name: string;
  /** silhouette id from kinds.json; the placeholder art draws it (D-195), unknown ids get a generic one */
  readonly silhouette: string;
}

export interface ObjectiveInfo {
  readonly id: string;
  readonly text: string;
  readonly metric: 'grafts' | 'playerLife' | 'round' | 'appraisedLost';
  readonly lte: number | string | undefined;
  readonly gte: number | string | undefined;
}

export type CardKind = 'monster' | 'spell' | 'trap' | 'family';

/** What the UI shows about a definition; ids index `GameContent.ids`. Text is a template: render it with `GameCtx.render`. */
export interface CardInfo {
  readonly id: string;
  readonly name: string;
  readonly type: CardKind;
  readonly text: string | null;
  readonly element: string | null;
  readonly kind: string | null;
  readonly keywords: readonly string[];
  readonly flaw: string | null;
}

export interface GameCtx {
  readonly content: GameContent;
  readonly globals: Globals;
  readonly objectiveIds: readonly string[];
  readonly cards: ReadonlyMap<string, CardInfo>;
  readonly elements: ReadonlyMap<string, ElementInfo>;
  readonly kindNames: ReadonlyMap<string, string>;
  readonly kinds: ReadonlyMap<string, KindInfo>;
  readonly objectives: ReadonlyMap<string, ObjectiveInfo>;
  /** the Collector's lines per mood name (collector.json › dialogue); templates, render them */
  readonly dialogue: Readonly<Record<string, readonly string[]>>;
  readonly objectiveText: ReadonlyMap<string, string>;
  readonly twistText: readonly string[];
  readonly warnings: readonly string[];
  /** D-172: every card, keyword, objective and twist text goes through this. */
  render(template: string): string;
}

export type LoadResult = { readonly ok: true; readonly ctx: GameCtx } | { readonly ok: false; readonly lines: readonly string[] };

export function loadGameContent(api: ContentApi): LoadResult {
  const globals = api.DEFAULT_GLOBALS;
  const load = api.parseContent(api.RAW_CONTENT);
  const validation = api.validateContent(load.data, globals, api.KEYWORDS);
  const errors = [...load.errors, ...validation.errors];
  if (errors.length > 0) return { ok: false, lines: errors.map(api.formatError) };
  let content: GameContent;
  try {
    content = api.compileContent(load.data, api.KEYWORDS, globals);
  } catch (e) {
    return { ok: false, lines: [`compile failed: ${e instanceof Error ? e.message : String(e)}`] };
  }
  const { data } = load;
  const cards = new Map<string, CardInfo>();
  const monster = (c: NonNullable<typeof data.playerMonsters>[number], flaw: string | null): CardInfo => ({
    id: c.id, name: c.name, type: 'monster', text: c.text ?? null, element: c.element, kind: c.kind, keywords: c.keywords, flaw,
  });
  for (const c of data.playerMonsters ?? []) cards.set(c.id, monster(c, null));
  for (const c of data.relics ?? []) cards.set(c.id, monster(c, c.flaw));
  for (const c of [...(data.playerSpells ?? []), ...(data.collectorSpells ?? [])]) {
    cards.set(c.id, { id: c.id, name: c.name, type: 'spell', text: c.text, element: null, kind: null, keywords: [], flaw: null });
  }
  for (const c of [...(data.playerTraps ?? []), ...(data.collectorTraps ?? [])]) {
    cards.set(c.id, { id: c.id, name: c.name, type: 'trap', text: c.text, element: null, kind: null, keywords: [], flaw: null });
  }
  for (const r of data.recipes ?? []) {
    cards.set(r.id, { id: r.id, name: r.name, type: 'family', text: null, element: null, kind: null, keywords: [], flaw: null });
  }
  return {
    ok: true,
    ctx: {
      content,
      globals,
      objectiveIds: (data.objectives ?? []).map((o) => o.id),
      cards,
      elements: new Map((data.elements ?? []).map((e) => [e.id, { id: e.id, name: e.name, color: e.color, icon: e.icon, beats: e.beats }])),
      kindNames: new Map((data.kinds ?? []).map((k) => [k.id, k.name])),
      kinds: new Map((data.kinds ?? []).map((k) => [k.id, { id: k.id, name: k.name, silhouette: k.silhouette }])),
      objectives: new Map(
        (data.objectives ?? []).map((o) => [o.id, { id: o.id, text: o.text, metric: o.metric, lte: o.lte, gte: o.gte }]),
      ),
      dialogue: data.collector?.dialogue ?? {},
      objectiveText: new Map((data.objectives ?? []).map((o) => [o.id, o.text])),
      twistText: content.twists.map((t) => t.text),
      warnings: validation.warnings.map(api.formatError),
      render: (template) => api.renderText(template, globals),
    },
  };
}
