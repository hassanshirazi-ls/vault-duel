// Synthetic content for content tests (D-168, D-169): a small, valid set of cards with fixed "fixture-" ids, so a
// test never depends on live cards, counts or values. Every rule test copies this data and breaks one thing.
// Valid means: validateContent(fixtureData(), FIXTURE_GLOBALS) returns no errors and no warnings (asserted in
// validate.test.ts). Keyword and Flaw ids come from the registry (keywords/index.gen.ts), which is rules, not data.
import { withGlobals } from '@vault-duel/engine/test-utils/globals';
import type { Globals } from '@vault-duel/engine';
import type { ContentData } from '../src/load';

/** TEST_GLOBALS with small deck sizes, so the fixture needs only a handful of cards. */
export const FIXTURE_GLOBALS: Globals = withGlobals({
  COLLECTOR_DECK_SIZE: 3,
  DECK_MONSTERS: 2,
  DECK_SPELLS: 1,
  DECK_TRAPS: 1,
});

/** A fresh copy each call, so a test may mutate it freely. */
export function fixtureData(): ContentData {
  return {
    elements: [
      { id: 'ember', name: 'Ember', color: '#aa3311', icon: 'flame', beats: ['gale'], identity: 'fixture' },
      { id: 'gale', name: 'Gale', color: '#3377aa', icon: 'wind', beats: [], identity: 'fixture' },
    ],
    kinds: [
      { id: 'beast', name: 'Beast', profile: 'fixture', graftRole: 'fixture', silhouette: 'fixture' },
      { id: 'spirit', name: 'Spirit', profile: 'fixture', graftRole: 'fixture', silhouette: 'fixture' },
    ],
    recipes: [
      { id: 'fixture-pack', name: 'Fixture Pack', kinds: ['beast', 'beast'], power: 6, guard: 4 },
      { id: 'fixture-hybrid', name: 'Fixture Hybrid', kinds: ['beast', 'spirit'], power: 6, guard: 4 },
      { id: 'fixture-choir', name: 'Fixture Choir', kinds: ['spirit', 'spirit'], power: 6, guard: 4 },
    ],
    playerMonsters: [
      {
        id: 'fixture-whelp', type: 'monster', name: 'Fixture Whelp', element: 'ember', kind: 'beast',
        power: 4, guard: 4, keywords: [],
      },
      {
        id: 'fixture-stag', type: 'monster', name: 'Fixture Stag', element: 'gale', kind: 'spirit',
        power: 5, guard: 3, keywords: ['swift'],
      },
    ],
    playerSpells: [
      {
        id: 'fixture-bolt', type: 'spell', name: 'Fixture Bolt', text: 'Destroy an enemy monster.',
        target: { side: 'enemy', zone: 'board', where: { powerLte: '$UNMAKE_MAX_POWER' } },
        effects: [{ op: 'destroy', target: 'chosen' }],
      },
    ],
    playerTraps: [
      {
        id: 'fixture-snare', type: 'trap', name: 'Fixture Snare', text: 'Destroy the attacker.', trigger: 'enemyAttack',
        effects: [{ op: 'destroy', target: 'attacker' }],
      },
    ],
    relics: [
      {
        id: 'fixture-hydra', type: 'monster', name: 'Fixture Hydra', element: 'gale', kind: 'spirit',
        power: 4, guard: 4, keywords: [], flaw: 'brittle',
      },
      {
        id: 'fixture-mantle', type: 'monster', name: 'Fixture Mantle', element: 'ember', kind: 'beast',
        power: 3, guard: 4, keywords: [], flaw: 'slow',
      },
    ],
    collectorSpells: [
      {
        id: 'fixture-rite', type: 'spell', name: 'Fixture Rite', text: 'Draw a card.',
        effects: [{ op: 'draw', who: 'self', n: 1 }],
      },
    ],
    collectorTraps: [
      {
        id: 'fixture-ward-trap', type: 'trap', name: 'Fixture Ward', text: 'Cancel the attack.', trigger: 'enemyDirectAttack',
        effects: [{ op: 'cancelAttack' }],
      },
    ],
    collector: {
      deck: ['fixture-hydra', 'fixture-rite', 'fixture-ward-trap'],
      ace: 'fixture-hydra',
      canGraft: false,
      ai: {
        allowFaceDown: false,
        reposition: 'allAttack',
        play: ['summonAce', 'utility'],
        attack: ['lethal', 'attackAnything'],
        params: {},
        moods: { composed: {}, agitated: {}, desperate: {} },
        trapPreference: ['fixture-ward-trap'],
        tieBreak: ['cardId'],
      },
      dialogue: { composed: ['Fixture.'], agitated: ['Fixture.'], desperate: ['Fixture.'] },
    },
    objectives: [],
    twists: [],
    artBriefs: {
      'fixture-whelp': 'fierce and small · mid-snarl · ember orange, soot black',
      'fixture-stag': 'still and tall · standing in mist · grey green, pale blue',
      'fixture-hydra': 'many-headed and vast · rising from a lake · teal, black, bone',
      'fixture-mantle': 'heavy and armoured · crouched behind a shield · rust, iron grey',
      'fixture-bolt': 'quick and sharp · a bolt of fire · ember, white',
      'fixture-snare': 'taut and waiting · a trap in the snow · grey, white',
      'fixture-rite': 'quiet and dim · an open book · umber, gold',
      'fixture-ward-trap': 'still and cold · an iron ward · slate, silver',
      'fixture-pack': 'savage and crowded · packed beasts · bone, blood red',
      'fixture-hybrid': 'strange and pale · beast and spirit fused · ash, teal',
      'fixture-choir': 'hollow and wailing · spirits in a ring · grey, violet',
    },
  };
}
