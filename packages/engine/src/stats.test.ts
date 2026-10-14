import { describe, expect, it } from 'vitest';
import { FX, fxEnv, fxKw } from '../test-utils/fixture';
import { buildContent } from '../test-utils/content-builder';
import { TEST_GLOBALS, withGlobals } from '../test-utils/globals';
import { StateBuilder } from '../test-utils/state';
import {
  activeKw,
  attackPermission,
  effectiveGuard,
  effectivePower,
  elementOf,
  hasAdvantage,
  kindOf,
  locate,
  locSide,
  locSlot,
  monsterOf,
  roundOf,
  activeSide,
} from './stats';
import { FX_SPEC } from '../test-utils/fixture';

const env = fxEnv();
const E = (id: string): number => FX.elementIds.indexOf(id);

describe('locating', () => {
  it('finds board cards and encodes side/slot', () => {
    const b = new StateBuilder(FX);
    const a = b.card('fx-ember-whelp', 0);
    const c = b.card('fx-umbra-beast', 1);
    const off = b.card('fx-tide-sprite', 0);
    const s = b.place(0, 1, a).place(1, 2, c).build();
    expect(locSide(locate(s, a))).toBe(0);
    expect(locSlot(locate(s, a))).toBe(1);
    expect(locSide(locate(s, c))).toBe(1);
    expect(locSlot(locate(s, c))).toBe(2);
    expect(locate(s, off)).toBe(-1);
    expect(monsterOf(s, off)).toBeNull();
    expect(monsterOf(s, a)?.iid).toBe(a);
  });
  it('derives round and active side from the turn index', () => {
    const s = new StateBuilder(FX).turn(5).build();
    expect(roundOf(s)).toBe(3);
    expect(activeSide(s)).toBe(1);
  });
});

describe('effective stats (D-031)', () => {
  it('printed stats', () => {
    const b = new StateBuilder(FX);
    const a = b.card('fx-umbra-beast', 0);
    const s = b.place(0, 0, a).build();
    expect(effectivePower(s, env, a)).toBe(5);
    expect(effectiveGuard(s, env, a)).toBe(3);
  });
  it('adds permanent and active timed mods; timed mods apply while turn <= until', () => {
    const b = new StateBuilder(FX).turn(4);
    const a = b.card('fx-umbra-beast', 0);
    const s = b
      .place(0, 0, a, { permP: 1, permG: -1, timed: [{ p: 3, g: 2, until: 4 }, { p: 10, g: 10, until: 3 }] })
      .build();
    expect(effectivePower(s, env, a)).toBe(5 + 1 + 3);
    expect(effectiveGuard(s, env, a)).toBe(3 - 1 + 2);
    const later = new StateBuilder(FX).turn(5);
    const a2 = later.card('fx-umbra-beast', 0);
    const s2 = later.place(0, 0, a2, { timed: [{ p: 3, g: 2, until: 4 }] }).build();
    expect(effectivePower(s2, env, a2)).toBe(5);
  });
  it('floors at STAT_FLOOR but keeps stored modifiers unclamped', () => {
    const b = new StateBuilder(FX);
    const a = b.card('fx-ember-whelp', 0);
    const s = b.place(0, 0, a, { permP: -9 }).build();
    expect(effectivePower(s, env, a)).toBe(0);
    expect(monsterOf(s, a)?.permP).toBe(-9);
  });
  it('Unstable bonus applies to Power only, while unstableUntil >= 0', () => {
    const b = new StateBuilder(FX);
    const a = b.card('fx-ember-whelp', 0);
    const s = b.place(0, 0, a, { unstableUntil: 4 }).build();
    expect(effectivePower(s, env, a)).toBe(3 + TEST_GLOBALS.UNSTABLE_BONUS);
    expect(effectiveGuard(s, env, a)).toBe(2);
  });
  it('Ascend adds ASCEND_POWER / ASCEND_GUARD to a Chimera', () => {
    const b = new StateBuilder(FX);
    const ch = b.card('fx-family-hybrid', 0, { element: E('fx-ember'), kw: 0, ascended: true, materials: [] });
    const plain = b.card('fx-family-hybrid', 0, { element: E('fx-ember'), kw: 0, ascended: false, materials: [] });
    const s = b.place(0, 0, ch).place(0, 1, plain).build();
    expect(effectivePower(s, env, ch)).toBe(7 + 2);
    expect(effectiveGuard(s, env, ch)).toBe(5 + 1);
    expect(effectivePower(s, env, plain)).toBe(7);
  });
  it('off-board cards show printed stats only (D-043)', () => {
    const b = new StateBuilder(FX);
    const a = b.card('fx-umbra-beast', 0);
    const s = b.discard(0, a).build();
    expect(effectivePower(s, env, a)).toBe(5);
  });
  it('static hooks: Tethered applies only while alone, and not while face-down', () => {
    const b = new StateBuilder(FX);
    const t = b.card('fx-relic-tether', 1);
    const alone = b.place(1, 0, t).build();
    expect(effectivePower(alone, env, t)).toBe(6 - 2);
    const b2 = new StateBuilder(FX);
    const t2 = b2.card('fx-relic-tether', 1);
    const o2 = b2.card('fx-ember-whelp', 1);
    const two = b2.place(1, 0, t2).place(1, 1, o2).build();
    expect(effectivePower(two, env, t2)).toBe(6);
    const b3 = new StateBuilder(FX);
    const t3 = b3.card('fx-relic-tether', 1);
    const down = b3.place(1, 0, t3, { faceDown: true, pos: 1 }).build();
    expect(effectivePower(down, env, t3)).toBe(6);
  });
  it('uses the global TETHERED_PENALTY', () => {
    const e = fxEnv(withGlobals({ TETHERED_PENALTY: 5 }));
    const b = new StateBuilder(FX);
    const t = b.card('fx-relic-tether', 1);
    expect(effectivePower(b.place(1, 0, t).build(), e, t)).toBe(1);
  });
});

describe('weekly twist (D-103, D-121, D-129)', () => {
  const twistContent = buildContent({
    ...FX_SPEC,
    twists: [
      {
        id: 'fx-twist',
        text: 'Umbra +1 Power, low-Power monsters +2 Guard',
        modifiers: [
          { where: { element: 'fx-umbra' }, power: 1 },
          { where: { powerLte: 3 }, guard: 2 },
        ],
      },
    ],
  });
  const on = fxEnv(withGlobals({ FLAGS: { WEEKLY_TWIST: true } }), twistContent);
  const off = fxEnv(TEST_GLOBALS, twistContent);

  it('applies matching modifiers when FLAGS.WEEKLY_TWIST is on', () => {
    const b = new StateBuilder(twistContent).twist(0);
    const u = b.card('fx-umbra-beast', 0);
    const w = b.card('fx-ember-whelp', 0);
    const s = b.place(0, 0, u).place(0, 1, w).build();
    expect(effectivePower(s, on, u)).toBe(6);
    expect(effectivePower(s, on, w)).toBe(3);
    expect(effectiveGuard(s, on, w)).toBe(4);
    expect(effectiveGuard(s, on, u)).toBe(3);
  });
  it('is ignored when the flag is off or no twist is selected', () => {
    const b = new StateBuilder(twistContent).twist(0);
    const u = b.card('fx-umbra-beast', 0);
    const s = b.place(0, 0, u).build();
    expect(effectivePower(s, off, u)).toBe(5);
    const none = new StateBuilder(twistContent);
    const u2 = none.card('fx-umbra-beast', 0);
    expect(effectivePower(none.place(0, 0, u2).build(), on, u2)).toBe(5);
  });
});

describe('active keywords', () => {
  it('printed | Chimera-inherited, none when face-down, minus a used Ward', () => {
    const b = new StateBuilder(FX);
    const ox = b.card('fx-warded-ox', 0);
    const ox2 = b.card('fx-warded-ox', 0);
    const hidden = b.card('fx-warded-ox', 0);
    const s = b
      .place(0, 0, ox)
      .place(0, 1, ox2, { wardUsed: true })
      .place(0, 2, hidden, { faceDown: true, pos: 1 })
      .build();
    expect(activeKw(s, env, ox)).toBe(fxKw(FX, 'fx-ward'));
    expect(activeKw(s, env, ox2)).toBe(0);
    expect(activeKw(s, env, hidden)).toBe(0);
    const s2 = new StateBuilder(FX);
    const ch2 = s2.card('fx-family-hybrid', 0, { element: 0, kw: fxKw(FX, 'fx-swift', 'fx-pierce'), ascended: false, materials: [] });
    expect(activeKw(s2.place(0, 0, ch2).build(), env, ch2)).toBe(fxKw(FX, 'fx-swift', 'fx-pierce'));
  });
});

describe('element and kind facts', () => {
  it('Chimera element comes from the Chimera record; Chimeras have no kind', () => {
    const b = new StateBuilder(FX);
    const ch = b.card('fx-family-hybrid', 0, { element: E('fx-lumen'), kw: 0, ascended: false, materials: [] });
    const w = b.card('fx-ember-whelp', 0);
    const s = b.place(0, 0, ch).place(0, 1, w).build();
    expect(elementOf(s, env, ch)).toBe(E('fx-lumen'));
    expect(kindOf(s, env, ch)).toBe(-1);
    expect(kindOf(s, env, w)).toBe(FX.kindIds.indexOf('fx-beast'));
  });
  it('advantage is directional (D-029); mutual pair works both ways', () => {
    const b = new StateBuilder(FX);
    const ember = b.card('fx-ember-whelp', 0);
    const tide = b.card('fx-tide-sprite', 1);
    const umbra = b.card('fx-umbra-beast', 1);
    const lumen = b.card('fx-lumen-seer', 0);
    const s = b.build();
    expect(hasAdvantage(s, env, ember, tide)).toBe(true);
    expect(hasAdvantage(s, env, tide, ember)).toBe(false);
    expect(hasAdvantage(s, env, lumen, umbra)).toBe(true);
    expect(hasAdvantage(s, env, umbra, lumen)).toBe(true);
    expect(hasAdvantage(s, env, ember, ember)).toBe(false);
  });
});

describe('attackPermission', () => {
  it('universal summoning sickness, then any (D-022)', () => {
    const b = new StateBuilder(FX).turn(2);
    const fresh = b.card('fx-ember-whelp', 0);
    const old = b.card('fx-umbra-beast', 0);
    const s = b.place(0, 0, fresh, { entered: 2 }).place(0, 1, old, { entered: 0 }).build();
    expect(attackPermission(s, env, fresh)).toBe('none');
    expect(attackPermission(s, env, old)).toBe('any');
  });
  it('Swift grants monstersOnly on the entered turn; Slow restricts to none', () => {
    const b = new StateBuilder(FX).turn(2);
    const sw = b.card('fx-swift-scout', 0);
    const sl = b.card('fx-relic-slow', 0);
    const s = b.place(0, 0, sw, { entered: 2 }).place(0, 1, sl, { entered: 2 }).build();
    expect(attackPermission(s, env, sw)).toBe('monstersOnly');
    expect(attackPermission(s, env, sl)).toBe('none');
    const later = new StateBuilder(FX).turn(4);
    const sw2 = later.card('fx-swift-scout', 0);
    expect(attackPermission(later.place(0, 0, sw2, { entered: 2 }).build(), env, sw2)).toBe('any');
  });
  it('lattice is order-independent: min(max(base, grants), restrictions)', () => {
    const b = new StateBuilder(FX).turn(2);
    const both = b.card('fx-family-hybrid', 0, { element: 0, kw: fxKw(FX, 'fx-swift', 'fx-slow'), ascended: false, materials: [] });
    const s = b.place(0, 0, both, { entered: 2 }).build();
    expect(attackPermission(s, env, both)).toBe('none'); // Slow's restriction beats Swift's grant
  });
  it('round-1 player ban is absolute, even for Swift (D-015, D-042); the Collector is not banned', () => {
    const b = new StateBuilder(FX).turn(0);
    const sw = b.card('fx-swift-scout', 0);
    const old = b.card('fx-umbra-beast', 0);
    const s = b.place(0, 0, sw, { entered: 0 }).place(0, 1, old, { entered: -1 }).build();
    expect(attackPermission(s, env, sw)).toBe('none');
    expect(attackPermission(s, env, old)).toBe('none');
    const c = new StateBuilder(FX).turn(1);
    const rc = c.card('fx-umbra-beast', 1);
    expect(attackPermission(c.place(1, 0, rc, { entered: -1 }).build(), env, rc)).toBe('any');
  });
  it('the ban length comes from FIRST_ATTACK_ROUND_PLAYER', () => {
    const e = fxEnv(withGlobals({ FIRST_ATTACK_ROUND_PLAYER: 3 }));
    const b = new StateBuilder(FX).turn(2);
    const a = b.card('fx-umbra-beast', 0);
    expect(attackPermission(b.place(0, 0, a, { entered: 0 }).build(), e, a)).toBe('none');
  });
  it('a card that is not on a board has no permission', () => {
    const b = new StateBuilder(FX);
    const a = b.card('fx-umbra-beast', 0);
    expect(attackPermission(b.hand(0, a).build(), env, a)).toBe('none');
  });
});
