// The How to play pages (D-257): copy and sample cards. Every rule number is a {NAME} placeholder rendered with
// renderText(template, globals) (D-172) or comes straight from the globals, so a tuned number changes the primer too.
// A page whose feature flag is off is left out, and so is each line about that feature.
import type { CardView } from './cards';
import { definitionView, keywordViews } from './cards';
import type { KeywordView } from './cards';
import type { ElementInfo, GameCtx } from '../content/load';
import { wheelLayout } from './wheel';

export type HowToArtId = 'goal' | 'cards' | 'positions' | 'combat' | 'lanes' | 'bonds' | 'graft' | 'split' | 'symbiosis' | 'appraisal' | 'winning' | 'faq' | 'keywords';

export interface HowToPage {
  readonly id: HowToArtId;
  readonly title: string;
  /** the one short paragraph under the demo */
  readonly summary: string;
  /** the few rules a new player trips over, always shown under the summary */
  readonly keys?: readonly string[];
  /** every rule of the page, one per line, folded under "All the rules" */
  readonly lines: readonly string[];
  /** questions and answers, shown open in place of the folded rules (the Common questions page); `lines` repeats them as text */
  readonly qa?: readonly { readonly q: string; readonly a: string }[];
  /** the rules start unfolded (the keyword glossary, whose lines are the page) */
  readonly open?: boolean;
}

/** "3, 6 and 9" */
export function joinList(items: readonly (string | number)[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "Graft, Split or Symbiosis" */
const orList = (items: readonly string[]): string => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`);

/**
 * The bond actions that exist under the current switches (D-305, D-306): Graft always, Split and Symbiosis when their flag
 * is on. `BOND_ACTION` takes them out of the card play, so the play sentence stops naming them and a bond line appears.
 */
function bondNames(g: GameCtx['globals']): string[] {
  return ['Graft', ...(g.FLAGS.SPLIT ? ['Split'] : []), ...(g.FLAGS.SYMBIOSIS ? ['Symbiosis'] : [])];
}

export function howToPages(ctx: GameCtx): HowToPage[] {
  const g = ctx.globals;
  const f = g.FLAGS;
  const r = ctx.render;
  const deckSize = g.DECK_MONSTERS + g.DECK_SPELLS + g.DECK_TRAPS;
  const when = <T,>(on: boolean, ...lines: T[]): T[] => (on ? lines : []);
  const bonds = bondNames(g);
  const graftOnly = bonds.length === 1; // D-336: no Split or Symbiosis, so no Bond button and no options sheet
  const bondTurn = f.BOND_ACTION;
  const slots = f.TURN_SLOTS; // D-335: one monster, one spell or trap, one bond, any order
  const hasKeyword = (id: string): boolean => ctx.content.keywords.some((k) => k.id === id);
  const sentinel = hasKeyword('sentinel');
  const glossary = keywordGlossary(ctx);
  const noRoundOneAttacks = g.FIRST_ATTACK_ROUND_PLAYER > 1;
  const firstAttacks = r('No attacks in round 1: your monsters first attack in round {FIRST_ATTACK_ROUND_PLAYER}.');
  // a switch, an Ambush flip and a lane move are all the one reposition a monster gets each turn (D-282)
  const repoNames = f.LANES ? (f.LANE_SWAP ? 'Moving, swapping or switching' : 'Moving or switching') : 'Switching';
  const freeNote = slots
    ? `${repoNames} a monster is free: it uses none of those. Each monster gets one, before it attacks.`
    : `${repoNames} a monster does not use your card play. Each monster gets one a turn.`;
  const qa = commonQuestions(ctx);
  const placeNote = ' Before you place a monster, its Attack/Guard and Face-up/Face-down buttons choose how it stands.';
  // the play sentence by switch state (docs/reports/bond-flip-content-draft.md 3a): with the bond action on, Graft is no longer a play
  const playTail = bondTurn ? '' : bonds.length === 1 ? ', or Graft' : `, or use ${orList(bonds)}`;
  const playSummaryTail = bondTurn ? '' : bonds.length === 1 ? ' or Graft' : ` or use ${orList(bonds)}`;
  const pages: HowToPage[] = [
    {
      id: 'goal',
      title: 'The goal',
      summary: r('Every day brings one vault and one duel, the same for every player. You start with {PLAYER_LIFE} life and the Monarch has {COLLECTOR_LIFE}. Take his life to 0 before round {MAX_ROUNDS} ends.'),
      lines: [
        'Every day brings one vault and one duel, the same for every player, with one daily attempt.',
        r('You start with {PLAYER_LIFE} life. The Monarch has {COLLECTOR_LIFE}.'),
        `Your deck holds ${deckSize} cards, and you can read the whole list on the title screen.`,
        r('Take his life to 0 before round {MAX_ROUNDS} ends. A round is your turn, then his.'),
      ],
    },
    {
      id: 'cards',
      title: 'Playing cards',
      summary: slots
        ? r('Each turn you draw back up to {HAND_SIZE} cards. Then you may summon one monster and play one spell or trap, in any order. Tap a card, then tap where it goes. Hold any card to read it.') + placeNote
        : bondTurn
        ? r('Each turn you draw back up to {HAND_SIZE} cards, then play {PLAYS_PER_TURN|card|cards}: summon a monster, cast a spell or set a trap. Tap a card, then tap where it goes. Hold any card to read it.') + placeNote
        : r(`Each turn you draw back up to {HAND_SIZE} cards, then play {PLAYS_PER_TURN|card|cards}: summon a monster, cast a spell, set a trap${playSummaryTail}. Tap a card, then tap where it goes. Hold any card to read it.`) + placeNote,
      lines: [
        r('You begin with {OPENING_HAND} cards.'),
        ...when(f.REDRAW, r('Before round 1 you may send your hand back for a fresh one ({REDRAWS|redraw|redraws}).')),
        r('Each turn you draw back up to {HAND_SIZE} cards, at most {MAX_DRAW_PER_TURN|card|cards} a turn.'),
        slots
          ? 'Then you may summon one monster and play one spell or trap (cast the spell, or set the trap).'
          : bondTurn
            ? r('Then play {PLAYS_PER_TURN|card|cards}: summon a monster, cast a spell or set a trap.')
            : r(`Then play {PLAYS_PER_TURN|card|cards}: summon a monster, cast a spell, set a trap${playTail}.`),
        ...when(slots, r(`You may also make {BONDS_PER_TURN|bond|bonds}: ${orList(bonds)}. Summon, spell, bond and attacks come in any order.`)),
        ...when(bondTurn && !slots, r(`Before your first attack you may also make {BONDS_PER_TURN|bond action|bond actions}: ${orList(bonds)}, in either order. Your first attack ends the bond for the turn.`)),
        r('Your board has {BOARD_SLOTS} monster slots and {TRAP_SLOTS} trap slots.'),
        slots
          ? 'A monster stands in attack or guard. You may switch it once a turn, but not on the turn it was summoned, and not after it has attacked.'
          : r('A monster stands in attack or guard. You may switch it {REPOSITIONS_PER_TURN|time|times} a turn, but not on the turn it was summoned.'),
        r('Each monster in attack position may attack {ATTACKS_PER_TURN|time|times} a turn. Your first attacks come in round {FIRST_ATTACK_ROUND_PLAYER}.'),
        'Tap a card in your hand to lift it, then tap a glowing slot or target. Hold any card to read it.',
        'A monster from your hand shows two buttons: Attack or Guard, and Face-up or Face-down. Set them before you tap the slot. It starts face-up in Attack.',
      ],
    },
    ...when<HowToPage>(slots, {
      id: 'bonds',
      title: 'Your turn',
      summary: r(
        graftOnly
          ? 'Each turn: summon one monster, play one spell or trap, make one Graft and attack once with each monster. Any order. The dots beside End turn show what is left.'
          : `Each turn: summon one monster, play one spell or trap, make one bond (${orList(bonds)}) and attack once with each monster. Any order. The dots beside End turn show what is left.`,
      ),
      keys: [
        ...when(noRoundOneAttacks, firstAttacks),
        'Any order: summon after you attack, or attack after you summon.',
        freeNote,
        'Only a monster in Attack position can attack. A guard or a face-down monster cannot.',
      ],
      lines: [
        'Monster: summon one monster a turn.',
        'Spell/Trap: cast one spell or set one trap a turn.',
        graftOnly
          ? r('Graft: make {BONDS_PER_TURN|Graft|Grafts} a turn with the Graft button beside End turn.')
          : r(`Bond: make {BONDS_PER_TURN|bond|bonds} a turn, ${orList(bonds)}. All of them are under the Bond button beside End turn.`),
        'Attacks: each monster in attack position attacks once. The number on the Attacks pip is how many can still attack.',
        'Any order: you can attack first and summon or bond afterwards. Attacking closes nothing.',
        f.LANES
          ? 'A monster may move a lane or switch position once, before it attacks. After its attack it stays put, and a tick marks it.'
          : 'A monster may switch position once, before it attacks. After its attack it stays put, and a tick marks it.',
        'Moving and switching are free: they do not use your monster, spell or trap, or Graft.',
        'Graft joins monsters into a Chimera.',
        ...when(f.SPLIT, 'Split unbinds a Chimera back into its parts, which can save it from a Levy aimed at it.'),
        ...when(f.SYMBIOSIS, 'Symbiosis attaches a monster from your hand under one of yours, as extra Guard and a spare body.'),
        graftOnly
          ? 'The Graft button opens the workbench: pick two monsters and see the result, including Ascend and Unstable, before you confirm.'
          : 'The Bond button lists every bond you can make right now, with the board it leaves and whether it is exposed to the next Levy. The option marked Best is a hint only.',
      ],
    }),
    ...when<HowToPage>(bondTurn && !slots, {
      id: 'bonds',
      title: 'Play and bond',
      summary: r(`Each turn you get {PLAYS_PER_TURN|card play|card plays} and {BONDS_PER_TURN|bond action|bond actions}. A bond is ${orList(bonds)}. Bond before you attack: your first attack closes it.`),
      lines: [
        r('Each turn you have {PLAYS_PER_TURN|card play|card plays}: summon a monster, cast a spell or set a trap.'),
        r(`You also have {BONDS_PER_TURN|bond action|bond actions}: ${orList(bonds)}. A bond does not use up your card play.`),
        'Play and bond in either order, but your first attack closes the bond for the turn.',
        'Graft joins monsters into a Chimera.',
        ...when(f.SPLIT, 'Split unbinds a Chimera back into its parts, which can save it from a Levy aimed at it.'),
        ...when(f.SYMBIOSIS, 'Symbiosis attaches a monster from your hand under one of yours, as extra Guard and a spare body.'),
        'The Play and Bond pips above your hand show what is left this turn: a tick means used, a cross means your attack closed it.',
        'The Bonds button lists every bond you can make right now, with the board it leaves and whether it is exposed to the next Levy.',
        'The option marked Best is the one a strong player would likely pick. It is a hint only.',
      ],
    }),
    {
      id: 'positions',
      title: 'Attack, guard or face-down',
      summary:
        'Every monster stands one of three ways. Pick it before you place the monster: tap it in your hand, then use the Attack/Guard and Face-up/Face-down buttons. It starts face-up in Attack.',
      keys: [
        'Attack (sword badge): it can attack. If it is attacked, its Power fights back, and when it loses you take the difference.',
        'Guard (shield badge): it cannot attack. It defends with its Guard, and you take no damage when it falls.' +
          (f.RIPOSTE ? ' An attacker weaker than its Guard is destroyed instead (Riposte).' : ''),
        'Face-down (hidden card): a guard the Monarch cannot read, so he does not know its Power or Guard.' + (f.APPRAISAL ? ' The Levy cannot take it.' : ''),
      ],
      lines: [
        'A monster cannot change on the turn it arrives. From your next turn it may change once a turn' + (slots ? ', before it attacks.' : '.'),
        'Switch: a face-up monster turns from Attack to Guard, or from Guard to Attack.',
        f.AMBUSH
          ? r('Flip: a face-down monster can only turn face-up into Attack. That is an Ambush: +{AMBUSH_POWER} Power until the end of the turn, and it may attack right away.')
          : 'Flip: a face-down monster can only turn face-up into Attack, and it may attack right away.',
        'A face-down monster cannot flip into Guard. It stays face-down until you flip it or it is attacked.',
        'When a face-down monster is attacked, it is turned face-up and fights as a guard. It stays face-up in Guard after that.',
        f.LANES
          ? 'A switch, a flip and a lane move are the same one change a turn: a monster does one of them, not two.'
          : 'A switch and a flip are the same one change a turn: a monster does one of them, not both.',
        bondTurn || slots ? 'None of this uses your monster summon, your spell or trap, or your Graft.' : 'None of this uses your card play.',
        "The Monarch's face-down monsters work the same way: you learn their Guard only when your attack reveals them.",
      ],
    },
    {
      id: 'combat',
      title: 'Combat and elements',
      summary: r('The higher Power wins the fight. An attacker with element advantage gets +{ELEMENT_BONUS} Power: follow the arrows on the wheel, and every element has its own ink pattern and icon.'),
      lines: [
        'Attack a monster in attack position: the higher Power destroys the lower, and the loser takes the difference. A tie destroys both.',
        'Attack a monster in guard: Power above its Guard destroys it with no damage. Below it, you take the difference.',
        'A face-down monster is revealed and fights as a guard. With no monsters in the way, an attack hits life for its full Power.',
        ...when(f.RIPOSTE, 'Riposte: when your attack is weaker than a guard\u2019s Guard, the guard holds and your attacker is destroyed, and you still take the difference.'),
        ...when(f.RIPOSTE, 'A face-down monster\u2019s Guard is hidden, so attacking one can end in a Riposte.'),
        ...when(f.AMBUSH, r('Ambush: flip a face-down monster to attack and it gets +{AMBUSH_POWER} Power until the end of that turn.')),
        ...when(g.SICKNESS_MODE === 'monstersOnly', 'A monster you just summoned may attack monsters but not life until your next turn.'),
        r('An attacker with element advantage gets +{ELEMENT_BONUS} Power. Every element has its own ink pattern and icon, never color alone.'),
        'On the wheel, each arrow points at the element its tail beats. In a duel, hold a monster to see a small compass for its element: solid ink arrows to what it beats, dashed red arrows from what beats it.',
      ],
    },
    ...when<HowToPage>(f.LANES, {
      id: 'lanes',
      title: 'Lanes',
      summary: r("Your {BOARD_SLOTS} monster slots are lanes. A monster attacks only the Monarch's monster straight across from it, unless a Sentinel next to that lane pulls the attack to itself. An empty lane across means no hit. A direct hit on his life needs his board to be empty."),
      keys: [
        f.LANE_SWAP
          ? r('Move: tap your monster, then a lit slot up to {LANE_MOVE_RANGE|lane|lanes} away. If your own monster is there, the two swap places.')
          : r('Move: tap your monster, then a lit empty slot up to {LANE_MOVE_RANGE|lane|lanes} away.'),
        slots
          ? 'A move is free: it uses no summon, spell or trap, or Graft. Move first, then attack from the new lane.'
          : 'A move does not use your card play. Move first, then attack from the new lane.',
        f.LANE_SWAP
          ? 'A move or swap is that monster’s one change for the turn, so it cannot also switch position. A swap uses up the change of both monsters.'
          : 'A move is that monster’s one change for the turn, so it cannot also switch position.',
      ],
      lines: [
        r("The {BOARD_SLOTS} monster slots are lanes: each of your monsters faces the Monarch's slot straight across. You pick the lane when you summon."),
        'With lanes, a monster can only attack the monster across from it. An empty lane across means no attack, and life can be hit only when the Monarch has no monsters at all.',
        ...when(sentinel, r('A Sentinel guards nearby lanes: attacks in its lane and within {SENTINEL_REACH|lane|lanes} of it must target it. This is the only way an attack goes to the side. A shield badge with an arrow marks each covered lane and points at the Sentinel.')),
        'A direct hit on his life needs his whole monster board to be empty. Then his life glows when you pick an attacker.',
        f.LANE_SWAP
          ? r("Instead of switching, a monster may move up to {LANE_MOVE_RANGE|lane|lanes} sideways, trading places with your monster there. A move and a switch share one turn's reposition.")
          : r("Instead of switching, a monster may move up to {LANE_MOVE_RANGE|lane|lanes} sideways into an empty lane. A move and a switch share one turn's reposition."),
        ...when(f.LANE_SWAP, slots ? 'Both monsters in a swap must be free to change: not summoned this turn, not yet moved or switched, and not yet attacked.' : 'Both monsters in a swap must be free to change: not summoned this turn and not yet moved or switched.'),
        'A monster keeps its position when it moves, and a face-down monster stays face-down.',
        slots ? 'Moving never uses your summon, spell or trap, or Graft, and a moved monster can still attack this turn.' : 'Moving never uses your card play, and a moved monster can still attack this turn.',
        'Pick your monster and its lane lights up. A slot marked "No hit" has nothing to attack; lit Move and Swap slots show where it can go.',
        'He picks lanes too: he likes to summon across from a monster he can beat, or across from an empty lane.',
      ],
    }),
    {
      id: 'graft',
      title: 'Graft',
      summary: r('Graft joins {MIN_GRAFT_MATERIALS} monsters into one Chimera. The first material sets its element, and a preview shows the result before you confirm.') + (f.ASCEND ? r(' Add one more ({MAX_GRAFT_MATERIALS} in all) to Ascend it.') : ''),
      lines: [
        bondTurn
          ? slots
            ? r('Graft joins {MIN_GRAFT_MATERIALS} monsters from your hand or board into one Chimera. It is your bond, so it does not use up your monster summon, and board materials are sacrificed. Start it from the ' + (graftOnly ? 'Graft' : 'Bond') + ' button.')
            : r('Graft joins {MIN_GRAFT_MATERIALS} monsters from your hand or board into one Chimera. It is a bond action, so it does not use up your card play, and board materials are sacrificed.')
          : r('Graft joins {MIN_GRAFT_MATERIALS} monsters from your hand or board into one Chimera. It is your card play for the turn, and board materials are sacrificed.'),
        'The two kinds set the family and its Power and Guard. The first material sets the element, so the order matters.',
        r('A Chimera inherits up to {MAX_INHERITED_KEYWORDS|keyword|keywords}. If more are available, you choose.'),
        ...when(f.ASCEND, r('Ascend: add one more monster ({MAX_GRAFT_MATERIALS} in all) for +{ASCEND_POWER} Power and +{ASCEND_GUARD} Guard.')),
        ...when(f.UNSTABLE, r("Unstable: if one material's element beats the other's, the Chimera gets +{UNSTABLE_BONUS} Power but is destroyed at the end of your next turn.")),
        'A preview shows the result before you confirm. A new family is added to your Bestiary.',
      ],
    },
    ...when<HowToPage>(
      f.SPLIT,
      {
        id: 'split',
        title: 'Split',
        summary: 'Split unbinds a face-up Chimera of yours into the monsters it was grafted from.',
        lines: [
          'Split unbinds a face-up Chimera of yours into the monsters it was grafted from.',
          'The first part keeps its slot; the rest take the nearest free slots, or go to your hand if there is no room.',
          'Parts cannot attack or move that turn. Their materials must still be in your discard, and a Chimera that arrived this turn cannot split.',
          'Splitting is not destruction, so Echo, Haunt, Last Rites and Blood Tithe do not trigger.',
        ],
      },
    ),
    ...when<HowToPage>(
      f.SYMBIOSIS,
      {
        id: 'symbiosis',
        title: 'Symbiosis',
        summary: 'Symbiosis attaches a base monster from your hand under one of your face-up monsters.',
        lines: [
          'Symbiosis attaches a base monster from your hand under one of your face-up monsters.',
          r("The host gains +{SYMBIOSIS_GUARD_BONUS} Guard and, if it has room, the attached monster's keyword."),
          'The attached monster uses no slot. If the host is destroyed, it comes out in its slot as if newly summoned; if the host is levied, the Monarch takes both.',
          r('A host carries {SYMBIOTES_PER_HOST|attached monster|attached monsters} at most.'),
        ],
      },
    ),
    ...when<HowToPage>(
      f.APPRAISAL,
      {
        id: 'appraisal',
        title: 'Levy',
        summary:
          `At the start of his turn in rounds ${joinList(g.APPRAISAL_ROUNDS)} the Monarch takes your highest-Power face-up monster, if its Power is ` +
          r('{APPRAISAL_MIN_POWER} or more. A countdown on screen always shows the next one.') +
          (f.CROWNED ? r(' A monster he levies is crowned: it gets +{CROWN_POWER} Power while it serves him.') : ''),
        lines: [
          `At the start of his turn in rounds ${joinList(g.APPRAISAL_ROUNDS)}, the Monarch takes your highest-Power face-up monster${f.SYMBIOSIS ? ', and any monster attached under it' : ''}.`,
          r('Only a monster with Power {APPRAISAL_MIN_POWER} or more can be taken. Face-down monsters are safe.'),
          'A countdown on screen always shows the next Levy.',
          ...when(f.CROWNED, r('A monster he levies is crowned: it gets +{CROWN_POWER} Power while it serves him, and wears a crown badge on its card.')),
          ...when(f.INTENTS, 'An icon beside his portrait shows what kind of turn he plans: attack, levy, guard or scheme. It never shows which card.'),
          ...when(f.MOODS, r('As his life falls he turns Agitated (at {MOOD_AGITATED_AT} or less) and then Desperate (at {MOOD_DESPERATE_AT} or less), and his play changes.')),
        ],
      },
    ),
    {
      id: 'winning',
      title: 'Winning',
      summary: r('Take the Monarch to 0 life to win. You lose at 0 life, or when the vault seals at the end of round {MAX_ROUNDS}. A win adds the day\'s champion to your Bestiary.'),
      lines: [
        r('Win by taking the Monarch to 0 life. You lose at 0 life, or when the vault seals at the end of round {MAX_ROUNDS}.'),
        'Your result compares the rounds you used with the day\'s par.',
        ...when(ctx.objectiveIds.length > 0, r('Each day has {OBJECTIVES_PER_DAY|bonus objective|bonus objectives}, with a star for each one you meet.')),
        'A win adds the day\'s champion to your Bestiary. Share your round row with friends.',
        'Practice replays today\'s seed, unrecorded, once your daily attempt is done.',
      ],
    },
    {
      id: 'faq',
      title: 'Common questions',
      summary: 'Quick answers to what new players ask most. Open How to play from the duel menu any time.',
      lines: qa.map((x) => `${x.q} ${x.a}`),
      qa,
    },
    ...when<HowToPage>(glossary.length > 0, {
      id: 'keywords',
      title: 'Keywords and Flaws',
      summary: 'A keyword is a small rule a monster carries. A Flaw is a drawback, shown as a cracked frame. Hold any card to read its own.',
      lines: glossary.map((k) => `${k.name}${k.flaw ? ' (Flaw)' : ''}: ${k.text}`),
      open: true,
    }),
  ];
  return pages;
}

/** The Common questions page: the rules new players trip over, each answer read from the globals and switches. */
export function commonQuestions(ctx: GameCtx): { readonly q: string; readonly a: string }[] {
  const g = ctx.globals;
  const f = g.FLAGS;
  const r = ctx.render;
  const slots = f.TURN_SLOTS;
  const has = (id: string): boolean => ctx.content.keywords.some((k) => k.id === id);
  const when = <T,>(on: boolean, ...items: T[]): T[] => (on ? items : []);
  const noSlot = slots ? 'your summon, your spell or trap, or your Graft' : 'your card play';
  const quirks = [has('swift') ? 'Swift lets it hit life too' : '', has('slow') ? 'Slow stops it attacking at all' : ''].filter(Boolean);
  return [
    ...when(g.FIRST_ATTACK_ROUND_PLAYER > 1, {
      q: 'Can I attack on my first turn?',
      a: r('No. Round 1 is for setting up. Your monsters can first attack in round {FIRST_ATTACK_ROUND_PLAYER}.'),
    }),
    {
      q: 'How do I summon a monster in Guard or face-down?',
      a: 'Tap the monster in your hand. Two buttons appear: Attack or Guard, and Face-up or Face-down. Set them, then tap a lit slot. Face-down is always in Guard.',
    },
    {
      q: 'Can a monster attack on the turn I summon it?',
      a:
        g.SICKNESS_MODE === 'monstersOnly'
          ? `Yes, if it is in Attack position, but only the Monarch's monsters, not his life. It can hit his life from your next turn.${quirks.length > 0 ? ` ${joinList(quirks)}.` : ''}`
          : 'No. It can attack from your next turn.',
    },
    {
      q: 'What does face-down do?',
      a:
        'It hides the card from the Monarch, so he cannot see its Power or Guard. It defends as a guard' +
        (f.APPRAISAL ? ' and is safe from the Levy' : '') +
        '. It cannot attack until you flip it face-up into Attack' +
        (f.AMBUSH ? r(', which gives it +{AMBUSH_POWER} Power that turn (an Ambush).') : '.'),
    },
    ...when(f.LANES, {
      q: f.LANE_SWAP ? 'Does moving or swapping use up my turn?' : 'Does moving use up my turn?',
      a: `No. It does not use ${noSlot}. It only uses that monster's one change for the turn${f.LANE_SWAP ? ' (both monsters’, in a swap)' : ''}, so it cannot also switch between Attack and Guard.`,
    }),
    ...when(f.LANES, {
      q: f.LANE_SWAP ? 'Can I move or swap, then attack?' : 'Can I move, then attack?',
      a: slots ? 'Yes. Move first, then attack from the new lane. Not the other way round: after a monster attacks it stays put.' : 'Yes. Move first, then attack from the new lane.',
    }),
    {
      q: 'Can I switch to Guard and still attack?',
      a: 'No. Only a monster in Attack position attacks. Switching from Guard to Attack and then attacking works, if it was not summoned this turn.',
    },
    ...when(slots, {
      q: 'Can I summon or Graft after I attack?',
      a: 'Yes. Your summon, spell or trap, Graft and attacks come in any order. Attacking closes nothing.',
    }),
    ...when(f.LANES, {
      q: 'Why can’t my monster attack anything?',
      a:
        "It attacks only the lane straight across. If that lane is empty and he still has monsters elsewhere, there is nothing to hit: move it, or summon across from his monster. It may also be in Guard or face-down, or have attacked already" +
        (g.FIRST_ATTACK_ROUND_PLAYER > 1 ? ', or it is round 1.' : '.'),
    }),
    {
      q: 'Can I take a move back?',
      a: 'Often. Undo in the duel menu takes back your moves this turn, until a card is revealed or drawn.',
    },
  ];
}

/** Every keyword, then every Flaw, in content order, with its rendered rule text. */
export function keywordGlossary(ctx: GameCtx): KeywordView[] {
  const all = keywordViews(ctx, (2 ** ctx.content.keywords.length - 1) >>> 0);
  return [...all.filter((k) => !k.flaw), ...all.filter((k) => k.flaw)];
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
          { label: 'The Monarch', right: diff < 0 },
          { label: 'Neither, it is equal', right: diff === 0 },
        ],
        why: r('You start with {PLAYER_LIFE} life and the Monarch with {COLLECTOR_LIFE}.'),
      };
    }
    case 'cards': {
      const f = g.FLAGS;
      const names = bondNames(g);
      if (f.TURN_SLOTS) {
        return {
          question: 'You summoned a monster this turn. Can you still set a trap?',
          answers: [
            { label: 'Yes, a spell or trap is its own slot', right: true },
            { label: 'No, one card a turn', right: false },
            { label: 'Only before you attack', right: false },
          ],
          why: 'Each turn you get one monster summon and one spell or trap, in any order, plus one bond.',
        };
      }
      const uses = f.BOND_ACTION
        ? r(`You play {PLAYS_PER_TURN|card|cards} a turn: a summon, a spell or a trap uses it. ${orList(names)} ${names.length === 1 ? 'is a bond action' : 'are bond actions'}, and you may make {BONDS_PER_TURN|bond action|bond actions} before your first attack.`)
        : r(`You play {PLAYS_PER_TURN|card|cards} a turn: a summon, a spell, a trap or ${names.length === 1 ? 'a Graft' : `one of ${orList(names)}`} ${names.length === 1 ? 'each use' : 'each uses'} one.`);
      return { question: 'How many cards can you play in one turn?', answers: numberAnswers(g.PLAYS_PER_TURN), why: uses };
    }
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
    case 'lanes':
      return {
        question: "Your monster is in Lane 1. The Monarch's Lane 1 is empty, but he has a monster in Lane 2 (no Sentinels). What can your monster attack?",
        answers: [
          { label: 'His monster in Lane 2', right: false },
          { label: 'His life', right: false },
          { label: 'Nothing from there', right: true },
        ],
        why: 'It attacks only straight across, and his life is open only when his board is empty. Move it a lane, or summon across from him.',
      };
    case 'bonds':
      if (g.FLAGS.TURN_SLOTS) {
        return {
          question: 'You attack with a monster, then want to Graft. Can you?',
          answers: [
            { label: 'Yes, any order', right: true },
            { label: 'No, the attack closed the bond', right: false },
            { label: 'Only if you have not summoned', right: false },
          ],
          why: 'Summon, spell or trap, bond and attacks come in any order. Attacking closes nothing.',
        };
      }
      return {
        question: 'You attack with a monster, then want to Graft. Can you?',
        answers: [
          { label: 'Yes, Graft is a bond', right: false },
          { label: 'No, the attack closed the bond', right: true },
          { label: 'Only if you have not played a card', right: false },
        ],
        why: 'Your first attack closes the bond for the turn. Graft first, then attack.',
      };
    case 'keywords': {
      const glossary = keywordGlossary(ctx);
      const flaw = glossary.find((k) => k.flaw);
      const plain = glossary.filter((k) => !k.flaw).slice(0, 2);
      if (flaw === undefined || plain.length < 2) return null;
      const answers = [plain[0], flaw, plain[1]].map((k) => ({ label: (k as KeywordView).name, right: k === flaw }));
      return { question: 'Which of these is a Flaw?', answers, why: `${flaw.name} is a Flaw: ${flaw.text}` };
    }
    case 'graft':
      return { question: 'How many monsters does a plain Graft join?', answers: numberAnswers(g.MIN_GRAFT_MATERIALS), why: r('Graft joins {MIN_GRAFT_MATERIALS} monsters into one Chimera.') };
    case 'split':
      return {
        question: 'Your board is full when you Split. Where does a part with no free slot go?',
        answers: [
          { label: 'It is lost', right: false },
          { label: 'To your hand', right: true },
          { label: "It stays in the Chimera's slot", right: false },
        ],
        why: 'A part with no room goes to your hand, so no card is lost.',
      };
    case 'symbiosis':
      return {
        question: 'How much Guard does a host gain from the monster attached under it?',
        answers: numberAnswers(g.SYMBIOSIS_GUARD_BONUS),
        why: r('The host gains +{SYMBIOSIS_GUARD_BONUS} Guard. Its Power does not change.'),
      };
    case 'appraisal': {
      const first = g.APPRAISAL_ROUNDS[0];
      if (first === undefined) return null;
      return { question: 'In which round does the first Levy fall?', answers: numberAnswers(first, g.APPRAISAL_ROUNDS), why: `The Monarch levies at the start of his turn in rounds ${joinList(g.APPRAISAL_ROUNDS)}.` };
    }
    case 'positions': {
      const flip = g.FLAGS.AMBUSH ? r('Flip it into Attack (+{AMBUSH_POWER}) and attack') : 'Flip it into Attack and attack';
      return {
        question: 'Your monster has been face-down since last turn. What can it do this turn?',
        answers: [
          { label: flip, right: true },
          { label: 'Flip face-up into Guard', right: false },
          { label: 'Nothing until it is attacked', right: false },
        ],
        why: g.FLAGS.AMBUSH
          ? r('A face-down monster can only flip into Attack. That Ambush gives it +{AMBUSH_POWER} Power this turn, and it may attack right away.')
          : 'A face-down monster can only flip into Attack, and it may attack right away.',
      };
    }
    case 'faq':
      return null;
    case 'winning':
      return { question: 'After which round does the vault seal?', answers: numberAnswers(g.MAX_ROUNDS), why: r('The vault seals at the end of round {MAX_ROUNDS}. If the Monarch still stands, you lose.') };
  }
}
