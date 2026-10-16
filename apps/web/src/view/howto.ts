// The How to play pages (D-257): copy and sample cards. Every rule number is a {NAME} placeholder rendered with
// renderText(template, globals) (D-172) or comes straight from the globals, so a tuned number changes the primer too.
// A page whose feature flag is off is left out, and so is each line about that feature.
import type { CardView } from './cards';
import { definitionView } from './cards';
import type { ElementInfo, GameCtx } from '../content/load';
import { wheelLayout } from './wheel';

export type HowToArtId = 'goal' | 'cards' | 'combat' | 'graft' | 'appraisal' | 'winning';

export interface HowToPage {
  readonly id: HowToArtId;
  readonly title: string;
  /** the one short paragraph under the demo */
  readonly summary: string;
  /** every rule of the page, one per line, folded under "All the rules" */
  readonly lines: readonly string[];
}

/** "3, 6 and 9" */
export function joinList(items: readonly (string | number)[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function howToPages(ctx: GameCtx): HowToPage[] {
  const g = ctx.globals;
  const f = g.FLAGS;
  const r = ctx.render;
  const deckSize = g.DECK_MONSTERS + g.DECK_SPELLS + g.DECK_TRAPS;
  const when = <T,>(on: boolean, ...lines: T[]): T[] => (on ? lines : []);
  const pages: HowToPage[] = [
    {
      id: 'goal',
      title: 'The goal',
      summary: r('Every day brings one vault and one duel, the same for every player. You start with {PLAYER_LIFE} life and the Collector has {COLLECTOR_LIFE}. Take his life to 0 before round {MAX_ROUNDS} ends.'),
      lines: [
        'Every day brings one vault and one duel, the same for every player, with one daily attempt.',
        r('You start with {PLAYER_LIFE} life. The Collector has {COLLECTOR_LIFE}.'),
        `Your deck holds ${deckSize} cards, and you can read the whole list on the title screen.`,
        r('Take his life to 0 before round {MAX_ROUNDS} ends. A round is your turn, then his.'),
      ],
    },
    {
      id: 'cards',
      title: 'Playing cards',
      summary: r('Each turn you draw back up to {HAND_SIZE} cards, then play {PLAYS_PER_TURN|card|cards}: summon a monster, cast a spell, set a trap or Graft. Tap a card, then tap where it goes. Hold any card to read it.'),
      lines: [
        r('You begin with {OPENING_HAND} cards.'),
        ...when(f.REDRAW, r('Before round 1 you may send your hand back for a fresh one ({REDRAWS|redraw|redraws}).')),
        r('Each turn you draw back up to {HAND_SIZE} cards, at most {MAX_DRAW_PER_TURN|card|cards} a turn.'),
        r('Then play {PLAYS_PER_TURN|card|cards}: summon a monster, cast a spell, set a trap, or Graft.'),
        r('Your board has {BOARD_SLOTS} monster slots and {TRAP_SLOTS} trap slots.'),
        r('A monster stands in attack or guard. You may switch it {REPOSITIONS_PER_TURN|time|times} a turn, but not on the turn it was summoned.'),
        r('Each monster in attack position may attack {ATTACKS_PER_TURN|time|times} a turn. Your first attacks come in round {FIRST_ATTACK_ROUND_PLAYER}.'),
        'Tap a card in your hand to lift it, then tap a glowing slot or target. Hold any card to read it.',
      ],
    },
    {
      id: 'combat',
      title: 'Combat and elements',
      summary: r('The higher Power wins the fight. An attacker with element advantage gets +{ELEMENT_BONUS} Power: follow the arrows on the wheel, and every element has its icon as well as its color.'),
      lines: [
        'Attack a monster in attack position: the higher Power destroys the lower, and the loser takes the difference. A tie destroys both.',
        'Attack a monster in guard: Power above its Guard destroys it with no damage. Below it, you take the difference.',
        'A face-down monster is revealed and fights as a guard. With no monsters in the way, an attack hits life for its full Power.',
        r('An attacker with element advantage gets +{ELEMENT_BONUS} Power. Colors always come with an icon.'),
        'On the wheel, each arrow points at the element its tail beats. Tap an element in a duel to see its own compass.',
      ],
    },
    {
      id: 'graft',
      title: 'Graft',
      summary: r('Graft joins {MIN_GRAFT_MATERIALS} monsters into one Chimera. The first material sets its element, and a preview shows the result before you confirm.') + (f.ASCEND ? r(' Add one more ({MAX_GRAFT_MATERIALS} in all) to Ascend it.') : ''),
      lines: [
        r('Graft joins {MIN_GRAFT_MATERIALS} monsters from your hand or board into one Chimera. It is your card play for the turn, and board materials are sacrificed.'),
        'The two kinds set the family and its Power and Guard. The first material sets the element, so the order matters.',
        r('A Chimera inherits up to {MAX_INHERITED_KEYWORDS|keyword|keywords}. If more are available, you choose.'),
        ...when(f.ASCEND, r('Ascend: add one more monster ({MAX_GRAFT_MATERIALS} in all) for +{ASCEND_POWER} Power and +{ASCEND_GUARD} Guard.')),
        ...when(f.UNSTABLE, r("Unstable: if one material's element beats the other's, the Chimera gets +{UNSTABLE_BONUS} Power but is destroyed at the end of your next turn.")),
        'A preview shows the result before you confirm. A new family is added to your Binder.',
      ],
    },
    ...when<HowToPage>(
      f.APPRAISAL,
      {
        id: 'appraisal',
        title: 'Appraisal',
      summary: `At the start of his turn in rounds ${joinList(g.APPRAISAL_ROUNDS)} the Collector takes your highest-Power face-up monster, if its Power is ` + r('{APPRAISAL_MIN_POWER} or more. A countdown on screen always shows the next one.'),
        lines: [
          `At the start of his turn in rounds ${joinList(g.APPRAISAL_ROUNDS)}, the Collector takes your highest-Power face-up monster.`,
          r('Only a monster with Power {APPRAISAL_MIN_POWER} or more can be taken. Face-down monsters are safe.'),
          'A countdown on screen always shows the next Appraisal.',
          ...when(f.INTENTS, 'An icon beside his portrait shows what kind of turn he plans: attack, appraise, guard or scheme. It never shows which card.'),
          ...when(f.MOODS, r('As his life falls he turns Agitated (at {MOOD_AGITATED_AT} or less) and then Desperate (at {MOOD_DESPERATE_AT} or less), and his play changes.')),
        ],
      },
    ),
    {
      id: 'winning',
      title: 'Winning',
      summary: r('Take the Collector to 0 life to win. You lose at 0 life, or when the vault seals at the end of round {MAX_ROUNDS}. A win adds the day\'s signature card to your Binder.'),
      lines: [
        r('Win by taking the Collector to 0 life. You lose at 0 life, or when the vault seals at the end of round {MAX_ROUNDS}.'),
        'Your result compares the rounds you used with the day\'s par.',
        ...when(ctx.objectiveIds.length > 0, r('Each day has {OBJECTIVES_PER_DAY|bonus objective|bonus objectives}, with a star for each one you meet.')),
        'A win adds the day\'s signature card to your Binder. Share your round row with friends.',
        'Practice replays today\'s seed, unrecorded, once your daily attempt is done.',
      ],
    },
  ];
  return pages;
}

export interface HowToSamples {
  /** up to BOARD_SLOTS sample monsters, taken from the content in file order */
  readonly monsters: readonly CardView[];
  /** two materials, the Chimera they make (element from the first, as the Graft rule says) and its recipe name */
  readonly graft: { readonly a: CardView; readonly b: CardView; readonly result: CardView } | null;
  /** the combat demo: an attacker whose element beats the defender's, from the first one-way arrow of the wheel */
  readonly duel: { readonly attacker: CardView; readonly defender: CardView } | null;
}

/** Sample cards for the illustrations, all read from the compiled content. */
export function howToSamples(ctx: GameCtx): HowToSamples {
  const views: CardView[] = [];
  const kindOf = new Map<string, string>();
  for (const info of ctx.cards.values()) {
    if (info.type !== 'monster' || info.flaw !== null) continue;
    const v = definitionView(ctx, info.id);
    if (v === null) continue;
    views.push(v);
    if (info.kind !== null) kindOf.set(info.id, info.kind);
  }
  const a = views[0];
  const b = a === undefined ? undefined : (views.find((v) => v.element?.id !== a.element?.id && kindOf.get(v.id) !== kindOf.get(a.id)) ?? views[1]);
  let graft: HowToSamples['graft'] = null;
  if (a !== undefined && b !== undefined) {
    const ka = kindOf.get(a.id);
    const kb = kindOf.get(b.id);
    const recipe = ctx.recipes.find((r) => (r.kinds[0] === ka && r.kinds[1] === kb) || (r.kinds[0] === kb && r.kinds[1] === ka));
    const fam = recipe === undefined ? null : definitionView(ctx, recipe.id);
    if (fam !== null) graft = { a, b, result: { ...fam, element: a.element } };
  }
  let duel: HowToSamples['duel'] = null;
  const pair = advantagePair(ctx);
  if (pair !== null) {
    const attacker = views.find((v) => v.element?.id === pair.attacker.id);
    const defender = views.find((v) => v.element?.id === pair.defender.id);
    if (attacker !== undefined && defender !== undefined) duel = { attacker, defender };
  }
  return { monsters: views.slice(0, ctx.globals.BOARD_SLOTS), graft, duel };
}

/** The first element pair where one beats the other and not the reverse (any advantage when every pair is two-way). */
export function advantagePair(ctx: GameCtx): { readonly attacker: ElementInfo; readonly defender: ElementInfo } | null {
  const layout = wheelLayout([...ctx.elements.values()]);
  const edge = layout.edges.find((e) => !e.twoWay) ?? layout.edges[0];
  if (edge === undefined) return null;
  return { attacker: layout.order[edge.from] as ElementInfo, defender: layout.order[edge.to] as ElementInfo };
}

/** "Try it" (D-275): a question with a few answers, graded at once. Everything is read from the globals and the element matrix. */
export interface Quiz {
  readonly question: string;
  readonly answers: readonly { readonly label: string; readonly right: boolean }[];
  /** shown after any answer: why the right one is right */
  readonly why: string;
}

/** The right number plus the nearest distinct others, ascending and at least 1, three in all. */
function numberAnswers(right: number, avoid: readonly number[] = []): Quiz['answers'] {
  const out = new Set<number>([right]);
  for (let d = 1; out.size < 3 && d < 20; d++) {
    for (const n of [right + d, right - d]) if (out.size < 3 && n >= 1 && !avoid.includes(n)) out.add(n);
  }
  return [...out].sort((a, b) => a - b).map((n) => ({ label: String(n), right: n === right }));
}

export function howToQuiz(ctx: GameCtx, id: HowToArtId): Quiz | null {
  const g = ctx.globals;
  const r = ctx.render;
  switch (id) {
    case 'goal': {
      const diff = g.PLAYER_LIFE - g.COLLECTOR_LIFE;
      return {
        question: 'Who starts the duel with more life?',
        answers: [
          { label: 'You', right: diff > 0 },
          { label: 'The Collector', right: diff < 0 },
          { label: 'Neither, it is equal', right: diff === 0 },
        ],
        why: r('You start with {PLAYER_LIFE} life and the Collector with {COLLECTOR_LIFE}.'),
      };
    }
    case 'cards':
      return { question: 'How many cards can you play in one turn?', answers: numberAnswers(g.PLAYS_PER_TURN), why: r('You play {PLAYS_PER_TURN|card|cards} a turn: a summon, a spell, a trap or a Graft each use one.') };
    case 'combat': {
      const pair = advantagePair(ctx);
      if (pair === null) return null;
      // ask about the reverse attack: does the defender's element beat the attacker's?
      const reverse = pair.defender.beats.includes(pair.attacker.id);
      return {
        question: `Your ${pair.defender.name} monster attacks a ${pair.attacker.name} monster. Who gets the Power bonus?`,
        answers: [
          { label: `Your ${pair.defender.name} monster`, right: reverse },
          { label: `The ${pair.attacker.name} monster`, right: false },
          { label: 'Neither of them', right: !reverse },
        ],
        why: reverse
          ? r(`${pair.defender.name} beats ${pair.attacker.name}, so the attacker gets +{ELEMENT_BONUS} Power.`)
          : r(`${pair.defender.name} does not beat ${pair.attacker.name} (it is ${pair.attacker.name} that beats ${pair.defender.name}), and only an attacker gets +{ELEMENT_BONUS} Power, so nobody does.`),
      };
    }
    case 'graft':
      return { question: 'How many monsters does a plain Graft join?', answers: numberAnswers(g.MIN_GRAFT_MATERIALS), why: r('Graft joins {MIN_GRAFT_MATERIALS} monsters into one Chimera.') };
    case 'appraisal': {
      const first = g.APPRAISAL_ROUNDS[0];
      if (first === undefined) return null;
      return { question: 'In which round does the first Appraisal fall?', answers: numberAnswers(first, g.APPRAISAL_ROUNDS), why: `The Collector appraises at the start of his turn in rounds ${joinList(g.APPRAISAL_ROUNDS)}.` };
    }
    case 'winning':
      return { question: 'After which round does the vault seal?', answers: numberAnswers(g.MAX_ROUNDS), why: r('The vault seals at the end of round {MAX_ROUNDS}. If the Collector still stands, you lose.') };
  }
}
