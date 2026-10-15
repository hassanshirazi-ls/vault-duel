// The duel screen (D-237 mirrored layout): the Collector's header, traps and monsters on top, the round track across
// the middle, your monsters, traps, fanned hand and End turn at the bottom. Interaction is "tap card, tap target":
// everything offered comes from `getLegalActions` through view/legal.ts and view/selection.ts, and every change goes
// through the store's `act`. Animations are cues from engine events (visual/cues.ts), dropped by any tap.
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Action, Iid, Monster, Side } from '@vault-duel/engine';
import { MOOD_NAMES } from '@vault-duel/ai';
import { roundOfState } from '../duel/turn';
import { cardView } from '../view/cards';
import { INTENT_LABEL } from '../view/status';
import { appraisalCountdown, moodName } from '../view/status';
import { boardActionable, planFor, summonMode } from '../view/selection';
import type { Plan, Selection } from '../view/selection';
import { cueDurationMs, cuesFromEvents, quipMood } from '../visual/cues';
import type { Cue } from '../visual/cues';
import { Glyph } from '../visual/glyphs';
import { CollectorHeader } from './Collector';
import { useGame } from './context';
import { GraftSheet } from './GraftSheet';
import { prefersReducedMotion } from './hooks';
import { Inspect } from './Inspect';
import { CardBack, MiniCard } from './MiniCard';
import { RoundTrack } from './RoundTrack';

const CARD_CUES = new Set(['enter', 'graft', 'lunge', 'hit', 'ward', 'flash']);

export function Duel() {
  const ctx = useGame((s) => s.ctx);
  const rt = useGame((s) => s.rt);
  const state = useGame((s) => s.state);
  const groups = useGame((s) => s.groups);
  const events = useGame((s) => s.events);
  const error = useGame((s) => s.error);
  const act = useGame((s) => s.act);
  const [sel, setSel] = useState<Selection | null>(null);
  const [inspected, setInspected] = useState<Iid | null>(null);
  const [seen, setSeen] = useState(events);
  const [cues, setCues] = useState<readonly Cue[]>([]);
  const [quip, setQuip] = useState<{ key: number; text: string } | null>(null);

  // New engine events: build this step's cues and, on a mood shift or an Appraisal, the Collector's quip.
  // (Derived in render, the React pattern for state that follows other state.)
  if (seen !== events) {
    setSeen(events);
    if (ctx !== null && state !== null) {
      const animate = ctx.globals.FLAGS.ANIMATIONS && !prefersReducedMotion();
      setCues(animate ? cuesFromEvents(events) : []);
      const mood = quipMood(events, state.collector.mood);
      const lines = mood === null ? undefined : ctx.dialogue[MOOD_NAMES[mood] ?? 'composed'];
      if (lines !== undefined && lines.length > 0) setQuip({ key: state.nActions, text: ctx.render(lines[state.nActions % lines.length] as string) });
    }
  }

  // Cues end by themselves, or at the next tap anywhere (skippable, and the tap still does its normal job).
  useEffect(() => {
    if (cues.length === 0) return;
    const clear = (): void => setCues([]);
    const timer = window.setTimeout(clear, cueDurationMs(cues));
    document.addEventListener('pointerdown', clear, { capture: true, once: true });
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', clear, { capture: true });
    };
  }, [cues]);

  if (ctx === null || rt === null || state === null || groups === null) return null;
  const g = ctx.globals;
  const me = state.sides[0];
  const them = state.sides[1];
  const pending = state.pending;
  const mulligan = state.step === 'mulligan';
  const plan: Plan = planFor(groups, pending === null ? sel : null);
  const targets: ReadonlyMap<Iid, Action> = pending !== null ? groups.graftPicks : plan.targets;
  const view = (iid: Iid) => cardView(ctx, rt.engine, state, iid);
  const doAct = (a: Action): void => {
    setSel(null);
    act(a);
  };
  const cueFor = (iid: Iid): { kind: string; beat: number } | undefined => cues.find((c) => c.iid === iid && CARD_CUES.has(c.kind));
  const intent = state.collector.intent;
  const appraisal = appraisalCountdown(g, state);
  const mood = state.collector.mood;
  const combatHint = (attacker: Iid, target: Iid | -1): string | undefined => {
    const p = rt.engine.previewCombat(state, attacker, target);
    if (!p.known) return undefined;
    return p.outcome.destroyDefender ? (p.outcome.destroyAttacker ? 'Trade' : 'Destroys') : p.outcome.destroyAttacker ? 'Lost' : 'Holds';
  };
  const hintFor = (iid: Iid): string | undefined => (sel?.t === 'board' && pending === null ? combatHint(sel.iid, iid) : undefined);

  const tapBoard = (m: Monster, mine: boolean): void => {
    const hit = targets.get(m.iid);
    if (hit !== undefined) return doAct(hit);
    if (pending !== null) return setInspected(m.iid);
    if (mine && boardActionable(groups, m.iid)) return setSel(sel?.t === 'board' && sel.iid === m.iid ? null : { t: 'board', iid: m.iid });
    setSel(null);
    setInspected(m.iid);
  };

  const monsterRow = (side: Side) => {
    const s = state.sides[side];
    const mine = side === 0;
    return (
      <div className="row monsters" data-side={mine ? 'me' : 'them'}>
        {s.board.map((m, i) => {
          if (m === null) {
            const open = mine && plan.summon !== null;
            return open ? (
              <button key={i} type="button" className="empty-slot" data-glow="slot" aria-label="Empty monster slot, summon here" onClick={() => doAct(plan.summon as Action)}>
                <Glyph id="pos" size={22} />
              </button>
            ) : (
              <div key={i} className="empty-slot" aria-label="Empty monster slot" />
            );
          }
          const glow = targets.has(m.iid) ? 'target' : null;
          if (m.faceDown && !mine) {
            return <CardBack key={m.iid} icon="facedown" label="Face-down monster" glow={glow} onTap={glow === null ? undefined : () => tapBoard(m, false)} />;
          }
          const c = view(m.iid);
          const dim = (sel !== null || pending !== null) && glow === null && !(sel?.t === 'board' && sel.iid === m.iid);
          return (
            <MiniCard
              key={m.iid}
              view={c}
              monster={m}
              side={mine ? 'me' : 'them'}
              glow={glow}
              selected={sel?.t === 'board' && sel.iid === m.iid}
              dim={dim}
              cue={cueFor(m.iid)}
              preview={glow === null ? undefined : hintFor(m.iid)}
              onTap={() => tapBoard(m, mine)}
              onLong={() => setInspected(m.iid)}
            />
          );
        })}
      </div>
    );
  };

  const trapRow = (side: Side) => {
    const s = state.sides[side];
    const mine = side === 0;
    return (
      <div className="row traps" data-side={mine ? 'me' : 'them'}>
        {s.traps.map((t, i) => {
          if (t === null) {
            const open = mine && plan.setTrap !== null;
            return open ? (
              <button key={i} type="button" className="trap-slot open" data-glow="slot" aria-label="Empty trap slot, set trap here" onClick={() => doAct(plan.setTrap as Action)}>
                <Glyph id="trap" size={18} /> Set here
              </button>
            ) : (
              <div key={i} className="trap-slot empty" aria-label="Empty trap slot">
                <Glyph id="trap" size={18} />
              </div>
            );
          }
          if (!mine) {
            return (
              <div key={i} className="trap-slot set" aria-label="Set trap">
                <Glyph id="trap" size={18} /> Set trap
              </div>
            );
          }
          const c = view(t.iid);
          return (
            <button key={i} type="button" className="trap-slot set" onClick={() => setInspected(t.iid)}>
              <Glyph id="trap" size={18} /> {c.name}
            </button>
          );
        })}
      </div>
    );
  };

  // hand
  const hand = me.hand;
  const n = hand.length;
  const playable = (iid: Iid): boolean =>
    groups.summons.has(iid) || groups.summonCovetous.has(iid) || groups.casts.has(iid) || groups.setTraps.has(iid);
  const handCard = (iid: Iid, i: number) => {
    const selected = sel?.t === 'hand' && sel.iid === iid;
    const mid = (n - 1) / 2;
    const style = { '--rot': `${(i - mid) * 4}deg`, '--drop': `${Math.abs(i - mid) ** 2 * 3}px`, zIndex: selected ? 20 : i } as CSSProperties;
    return (
      <div key={iid} className="hand-slot" data-selected={selected ? '' : undefined} style={style}>
        <MiniCard
          view={view(iid)}
          side="me"
          selected={selected}
          dim={!mulligan && !playable(iid) && sel === null}
          cue={cueFor(iid)}
          onTap={() => (mulligan ? setInspected(iid) : setSel(selected ? null : { t: 'hand', iid, faceDown: false, guard: false }))}
          onLong={() => setInspected(iid)}
        />
      </div>
    );
  };

  const selView = sel === null ? null : view(sel.iid);
  const hint = (() => {
    if (selView === null) return null;
    if (sel?.t === 'hand') {
      if (!plan.anything) return 'This cannot be played right now.';
      const bits: string[] = [];
      if (plan.summon !== null) bits.push(`Tap an empty slot to summon it ${summonMode(sel) === 'down' ? 'face-down' : summonMode(sel) === 'grd' ? 'in Guard' : 'in Attack'}.`);
      if (plan.targets.size > 0) bits.push('Tap a glowing target.');
      if (plan.setTrap !== null) bits.push('Tap an empty trap slot.');
      return bits.join(' ');
    }
    return plan.direct !== null || plan.targets.size > 0 ? 'Tap a glowing target to attack.' : 'No attack available.';
  })();

  const maxLife = g.PLAYER_LIFE;
  const myDamage = cues.find((c) => c.kind === 'damage' && c.side === 0);
  const moodLabel = moodName(g, state);

  return (
    <main className="duel" data-graft={pending !== null ? '' : undefined} onClick={() => setSel(null)}>
      <CollectorHeader
        life={them.life}
        maxLife={g.COLLECTOR_LIFE}
        mood={mood}
        moodName={moodLabel}
        moodCount={MOOD_NAMES.length}
        intent={intent === null ? null : INTENT_LABEL[intent]}
        appraisal={
          appraisal === null
            ? null
            : appraisal.roundsAway === 0
              ? 'Appraisal after your turn'
              : `Appraisal in round ${appraisal.round} · ${appraisal.roundsAway} away`
        }
        quip={quip}
        cues={cues}
        directGlow={plan.direct !== null}
        onDirect={() => doAct(plan.direct as Action)}
        previewDirect={sel?.t === 'board' && plan.direct !== null ? combatHint(sel.iid, -1) : undefined}
      />

      <div className="board-area">
        {trapRow(1)}
        {monsterRow(1)}
        <RoundTrack globals={g} round={roundOfState(state)} />
        {monsterRow(0)}
        {trapRow(0)}
      </div>

      {error !== null && (
        <p className="error-bar" role="alert">
          {error}
        </p>
      )}

      {pending !== null ? (
        <GraftSheet onInspect={setInspected} />
      ) : (
        <footer className="bottom" onClick={(e) => e.stopPropagation()}>
          {mulligan ? (
            <div className="hintbar mulligan">
              <p>Keep this hand?</p>
              <div className="hint-buttons">
                {groups.keep !== null && (
                  <button type="button" className="btn primary" onClick={() => doAct(groups.keep as Action)}>
                    <Glyph id="check" size={18} /> Keep
                  </button>
                )}
                {groups.redraw !== null && (
                  <button type="button" className="btn" onClick={() => doAct(groups.redraw as Action)}>
                    <Glyph id="swap" size={18} /> Redraw
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="hintbar" aria-live="polite">
              {selView === null ? (
                <p className="muted">Tap a card, then tap where to play it. Hold a card to inspect.</p>
              ) : (
                <>
                  <p>
                    <b>{selView.name}</b> {hint}
                  </p>
                  <div className="hint-buttons">
                    {plan.cast !== null && (
                      <button type="button" className="btn primary" onClick={() => doAct(plan.cast as Action)}>
                        <Glyph id="spell" size={18} /> Cast
                      </button>
                    )}
                    {plan.reposition !== null && (
                      <button type="button" className="btn" onClick={() => doAct(plan.reposition as Action)}>
                        <Glyph id="swap" size={18} /> Reposition
                      </button>
                    )}
                    <button type="button" className="btn ghost icon" aria-label="Inspect" onClick={() => setInspected(sel?.iid ?? null)}>
                      <Glyph id="info" size={20} />
                    </button>
                    <button type="button" className="btn ghost icon" aria-label="Cancel" onClick={() => setSel(null)}>
                      <Glyph id="cross" size={20} />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {sel?.t === 'hand' && plan.modes.size > 0 && (
            <div className="mode-toggles">
              <button
                type="button"
                className="toggle"
                aria-pressed={sel.guard}
                disabled={!plan.modes.has('grd') && !sel.guard}
                onClick={() => setSel({ ...sel, guard: !sel.guard, faceDown: false })}
              >
                <Glyph id={sel.guard ? 'shield' : 'sword'} size={18} />
                <span>{sel.guard ? 'Guard' : 'Attack'}</span>
              </button>
              <button
                type="button"
                className="toggle"
                aria-pressed={sel.faceDown}
                disabled={!plan.modes.has('down') && !sel.faceDown}
                onClick={() => setSel({ ...sel, faceDown: !sel.faceDown })}
              >
                <Glyph id={sel.faceDown ? 'facedown' : 'eye'} size={18} />
                <span>{sel.faceDown ? 'Face-down' : 'Face-up'}</span>
              </button>
            </div>
          )}
          <div className="hand" aria-label="Your hand" style={{ '--n': n, '--k': n > 1 ? 1 / (n - 1) : 0 } as CSSProperties}>
            {hand.map(handCard)}
          </div>

          <div className="playerbar">
            <span className="life me" aria-label={`Your life ${me.life}`}>
              <Glyph id="heart" size={20} filled />
              <b>{Math.max(0, me.life)}</b>
              <span className="life-max">/{maxLife}</span>
              {myDamage !== undefined && (
                <span className="float cue cue-float" style={{ '--b': myDamage.beat } as CSSProperties}>
                  -{myDamage.amount}
                </span>
              )}
            </span>
            {!mulligan && groups.graftBegin !== null && (
              <button type="button" className="btn" onClick={() => doAct(groups.graftBegin as Action)}>
                <Glyph id="swap" size={18} /> Graft
              </button>
            )}
            {!mulligan && (
              <button type="button" className="btn primary end-turn" disabled={groups.endTurn === null} onClick={() => doAct(groups.endTurn as Action)}>
                End turn <Glyph id="check" size={20} />
              </button>
            )}
          </div>
        </footer>
      )}

      {inspected !== null && <Inspect iid={inspected} onClose={() => setInspected(null)} />}
    </main>
  );
}
