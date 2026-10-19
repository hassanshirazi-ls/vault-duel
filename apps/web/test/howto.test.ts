import * as content from '@vault-duel/content';
import { describe, expect, it } from 'vitest';
import { loadGameContent } from '../src/content/load';
import { commonQuestions, howToPages, howToQuiz, howToSamples, joinList, keywordGlossary } from '../src/view/howto';
import { makeStore } from './helpers';

const ctxFor = (overrides: readonly string[] = []) => {
  const r = loadGameContent(content, overrides);
  if (!r.ok) throw new Error(r.lines.join('\n'));
  return r.ctx;
};

// The pre-flip rules (the live defaults since 2026-10-16 have lanes, sickness and the bond rules on)
const OFF = ['FLAGS.LANES=false', 'FLAGS.SPLIT=false', 'FLAGS.SYMBIOSIS=false', 'FLAGS.BOND_ACTION=false', 'FLAGS.TURN_SLOTS=false', 'SICKNESS_MODE=classic'];

describe('How to play copy', () => {
  it('has the six pages in order, with no unrendered placeholder', () => {
    const pages = howToPages(ctxFor(OFF));
    expect(pages.map((p) => p.id)).toEqual(['goal', 'cards', 'positions', 'combat', 'graft', 'appraisal', 'winning', 'faq', 'keywords']);
    const live = howToPages(ctxFor());
    // D-336: Split and Symbiosis are off by default, so their pages are gone. D-359: Your turn follows Playing cards
    expect(live.map((p) => p.id)).toEqual(['goal', 'cards', 'bonds', 'positions', 'combat', 'lanes', 'graft', 'appraisal', 'winning', 'faq', 'keywords']);
    expect(howToPages(ctxFor(['FLAGS.SPLIT=true', 'FLAGS.SYMBIOSIS=true'])).map((p) => p.id)).toEqual(['goal', 'cards', 'bonds', 'positions', 'combat', 'lanes', 'graft', 'split', 'symbiosis', 'appraisal', 'winning', 'faq', 'keywords']);
    const texts = (ps: typeof pages) => ps.flatMap((p) => [p.summary, ...(p.keys ?? []), ...p.lines, ...(p.qa ?? []).flatMap((x) => [x.q, x.a])]);
    for (const l of texts(live)) expect(l).not.toMatch(/[{}|]/);
    for (const l of texts(pages)) expect(l).not.toMatch(/[{}|]/);
  });
  it('reads every number from the globals', () => {
    const ctx = ctxFor();
    const g = ctx.globals;
    const text = howToPages(ctx).flatMap((p) => p.lines).join('\n');
    expect(text).toContain(`${g.PLAYER_LIFE} life`);
    expect(text).toContain(`${g.COLLECTOR_LIFE}`);
    expect(text).toContain(`round ${g.MAX_ROUNDS}`);
    expect(text).toContain(`rounds ${joinList(g.APPRAISAL_ROUNDS)}`);
    expect(text).toContain(`Power ${g.APPRAISAL_MIN_POWER} or more`);
    expect(text).toContain(`+${g.ELEMENT_BONUS} Power`);
    expect(text).toContain(`+${g.UNSTABLE_BONUS} Power`);
    expect(text).toContain(`${g.DECK_MONSTERS + g.DECK_SPELLS + g.DECK_TRAPS} cards`);
  });
  it('follows a tuned number', () => {
    const text = howToPages(ctxFor(['PLAYER_LIFE=17', 'APPRAISAL_ROUNDS=[4,8]'])).flatMap((p) => p.lines).join('\n');
    expect(text).toContain('17 life');
    expect(text).toContain('rounds 4 and 8');
  });
  it('drops a page and lines whose feature flag is off', () => {
    const pages = howToPages(ctxFor(['FLAGS.APPRAISAL=false', 'FLAGS.UNSTABLE=false', 'FLAGS.ASCEND=false']));
    expect(pages.some((p) => p.id === 'appraisal')).toBe(false);
    const graft = pages.find((p) => p.id === 'graft')?.lines.join('\n') ?? '';
    expect(graft).not.toContain('Unstable');
    expect(graft).not.toContain('Ascend');
  });
  it('teaches lanes and sickness only when those rules are on', () => {
    // the keyword glossary quotes each keyword's own card text (Sentinel's names lanes), so it is left out here
    const text = (o: readonly string[]) => howToPages(ctxFor(o)).filter((p) => p.id !== 'keywords').flatMap((p) => p.lines).join('\n');
    expect(howToPages(ctxFor(OFF)).some((p) => p.id === 'lanes')).toBe(false);
    expect(text(OFF)).not.toMatch(/lane|just summoned/);
    const on = text([]);
    expect(on).toContain('only attack the monster across');
    expect(on).toContain('up to 1 lane sideways');
    expect(on).toContain('just summoned may attack monsters but not life');
    expect(text(['LANE_MOVE_RANGE=2'])).toContain('up to 2 lanes sideways');
    expect(on).not.toMatch(/[{}|]/);
  });
  it('teaches lanes, the bond turn and every keyword on their own pages', () => {
    const ctx = ctxFor();
    const pages = howToPages(ctx);
    const page = (id: string) => pages.find((p) => p.id === id);
    expect(page('lanes')?.lines.join('\n')).toContain(`within ${ctx.globals.SENTINEL_REACH} lane of it`);
    const bonds = page('bonds')?.lines.join('\n') ?? '';
    expect(bonds).toContain('Attacking closes nothing');
    expect(bonds).toContain('Graft button');
    expect(bonds).not.toMatch(/Split|Symbiosis/);
    const multi = howToPages(ctxFor(['FLAGS.SPLIT=true', 'FLAGS.SYMBIOSIS=true'])).find((p) => p.id === 'bonds')?.lines.join('\n') ?? '';
    expect(multi).toContain('Graft, Split or Symbiosis');
    expect(multi).toContain('marked Best');
    expect(page('bonds')?.title).toBe('Your turn');
    const keywords = page('keywords');
    expect(keywords?.open).toBe(true);
    expect(keywords?.lines.length).toBe(ctx.content.keywords.length);
    expect(keywords?.lines.join('\n')).toMatch(/^Sentinel: /m);
    expect(keywords?.lines.join('\n')).toMatch(/\(Flaw\): /);
    for (const p of pages) for (const l of [p.summary, ...p.lines]) expect(l).not.toMatch(/[{}|]/);
    expect(howToQuiz(ctx, 'lanes')?.answers.filter((a) => a.right)).toHaveLength(1);
    expect(howToQuiz(ctx, 'bonds')?.answers.filter((a) => a.right)).toHaveLength(1);
    const kq = howToQuiz(ctx, 'keywords');
    expect(kq?.answers.filter((a) => a.right).map((a) => a.label)).toEqual([keywordGlossary(ctx).find((k) => k.flaw)?.name]);
  });
  it('teaches the turn slots (D-335): one monster, one spell or trap, one bond, any order', () => {
    const ctx = ctxFor();
    const text = howToPages(ctx).flatMap((p) => [p.summary, ...p.lines]).join('\n');
    expect(text).toContain('summon one monster and play one spell or trap');
    expect(text).toContain('Monster: summon one monster a turn.');
    expect(text).toContain('Spell/Trap: cast one spell or set one trap a turn.');
    expect(text).toContain('with the Graft button beside End turn');
    expect(howToPages(ctxFor(['FLAGS.SPLIT=true'])).flatMap((p) => p.lines).join('\n')).toContain('under the Bond button beside End turn');
    expect(text).toContain('not after it has attacked');
    expect(text).toContain('only way an attack goes to the side');
    expect(text).toContain('direct hit on his life needs his whole monster board to be empty');
    expect(text).not.toContain('first attack closes');
    expect(howToQuiz(ctx, 'cards')?.answers.find((a) => a.right)?.label).toBe('Yes, a spell or trap is its own slot');
    expect(howToQuiz(ctx, 'bonds')?.answers.find((a) => a.right)?.label).toBe('Yes, any order');
    const old = howToPages(ctxFor(['FLAGS.TURN_SLOTS=false']));
    expect(old.find((p) => p.id === 'bonds')?.title).toBe('Play and bond');
  });
  it('points the combat page at the in-duel compass', () => {
    const text = howToPages(ctxFor()).find((p) => p.id === 'combat')?.lines.join('\n') ?? '';
    expect(text).toContain('hold a monster to see a small compass');
    expect(text).not.toContain('strip');
  });
  it('teaches Riposte and Ambush with their numbers, and drops them with their switches (D-337, D-338)', () => {
    const combat = (o: readonly string[] = []) => howToPages(ctxFor(o)).find((p) => p.id === 'combat')?.lines.join('\n') ?? '';
    expect(combat()).toContain('Riposte');
    expect(combat()).toContain(`+${ctxFor().globals.AMBUSH_POWER} Power until the end of that turn`);
    expect(combat(['AMBUSH_POWER=3'])).toContain('+3 Power');
    expect(combat(['FLAGS.RIPOSTE=false', 'FLAGS.AMBUSH=false'])).not.toMatch(/Riposte|Ambush/);
  });
  it('answers the first-game questions where they cannot be missed (D-359)', () => {
    const ctx = ctxFor();
    const g = ctx.globals;
    const pages = howToPages(ctx);
    const page = (id: string) => pages.find((p) => p.id === id);
    // no attacks in round 1, the any-order turn and the free reposition are key rules, not folded away
    const turnKeys = page('bonds')?.keys?.join('\n') ?? '';
    expect(turnKeys).toContain(`first attack in round ${g.FIRST_ATTACK_ROUND_PLAYER}`);
    expect(turnKeys).toContain('Moving, swapping or switching a monster is free');
    expect(turnKeys).toContain('Only a monster in Attack position can attack');
    expect(page('cards')?.summary).toContain('Attack/Guard and Face-up/Face-down buttons');
    // the positions page: the three stances, and that a face-down monster flips only into Attack
    const pos = page('positions');
    expect(pos?.keys).toHaveLength(3);
    expect(pos?.keys?.join('\n')).toContain('The Levy cannot take it.');
    expect(pos?.lines.join('\n')).toContain(`can only turn face-up into Attack. That is an Ambush: +${g.AMBUSH_POWER} Power`);
    expect(pos?.lines.join('\n')).toContain('cannot flip into Guard');
    expect(howToQuiz(ctx, 'positions')?.answers.filter((a) => a.right)).toHaveLength(1);
    // lanes: a swap uses up both monsters' change, and a moved monster still attacks
    const lanes = page('lanes')?.keys?.join('\n') ?? '';
    expect(lanes).toContain('the two swap places');
    expect(lanes).toContain('A swap uses up the change of both monsters');
    expect(lanes).toContain('Move first, then attack from the new lane');
    // Common questions: shown open as questions and answers, mirrored into the lines
    const faq = page('faq');
    expect(faq?.qa?.map((x) => x.q)).toEqual([
      'Can I attack on my first turn?',
      'How do I summon a monster in Guard or face-down?',
      'Can a monster attack on the turn I summon it?',
      'What does face-down do?',
      'Does moving or swapping use up my turn?',
      'Can I move or swap, then attack?',
      'Can I switch to Guard and still attack?',
      'Can I summon or Graft after I attack?',
      'Why can\u2019t my monster attack anything?',
      'Can I take a move back?',
    ]);
    expect(faq?.lines).toHaveLength(faq?.qa?.length ?? -1);
    expect(howToQuiz(ctx, 'faq')).toBeNull();
    // the questions follow the switches
    const plain = commonQuestions(ctxFor([...OFF, 'FIRST_ATTACK_ROUND_PLAYER=1'])).map((x) => x.q).join('\n');
    expect(plain).not.toMatch(/first turn|moving|move or|swap|Graft after/);
    expect(howToPages(ctxFor(['FLAGS.LANE_SWAP=false'])).find((p) => p.id === 'lanes')?.keys?.join('\n')).not.toContain('swap');
  });
  it('joins lists', () => {
    expect(joinList([3, 6, 9])).toBe('3, 6 and 9');
    expect(joinList([5])).toBe('5');
  });
  it('finds sample cards and a Graft example in the content', () => {
    const ctx = ctxFor();
    const s = howToSamples(ctx);
    expect(s.monsters.length).toBe(ctx.globals.BOARD_SLOTS);
    expect(s.graft?.result.element?.id).toBe(s.graft?.a.element?.id);
  });
});

describe('How to play in the store', () => {
  it('opens on first Home, closes and stays closed after a reboot, reopens on demand', async () => {
    const h = makeStore('2026-10-14');
    await h.store.getState().boot();
    expect(h.store.getState().howTo).toBe(true);
    h.store.getState().closeHowTo();
    expect(h.store.getState().howTo).toBe(false);
    await h.store.getState().boot();
    expect(h.store.getState().howTo).toBe(false);
    h.store.getState().openHowTo();
    expect(h.store.getState().howTo).toBe(true);
  });
});
