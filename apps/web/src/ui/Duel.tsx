// The duel screen (D-237 mirrored layout): the Collector's header, traps and monsters on top, the round track across
// the middle, your monsters, traps, fanned hand and End turn at the bottom. Interaction is "tap card, tap target":
// everything offered comes from `getLegalActions` through view/legal.ts and view/selection.ts, and every change goes
// through the store's `act`. A step plays stage by stage (visual/playback.ts): your action, then the Collector's moves
// one at a time, each behind a telegraph. Any tap skips to the end of it. Tapping a chosen card again deselects it.
import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Action, Iid, Monster, Side } from '@vault-duel/engine';
import { MOOD_NAMES } from '@vault-duel/ai';
import { roundOfState } from '../duel/turn';
import { cardView } from '../view/cards';
import { monsterSlotKeys } from '../view/keys';
import { attackNote, coveredLanes, lanesOn, monstersOnly, movedThisTurn } from '../view/lanes';
import { groupLegal } from '../view/legal';
import { duelLog, undoLabel } from '../view/log';
import { boardActionable, planFor, summonMode } from '../view/selection';
import type { Plan, Selection } from '../view/selection';
import { INTENT_LABEL, appraisalCountdown, moodName } from '../view/status';
import { telegraphLine } from '../view/telegraph';
import { UNDO_WHY, undoStatus } from '../view/undo';
import { Glyph } from '../visual/glyphs';
import { CollectorHeader, LifeSeal } from './Collector';
import { GhostCard } from './Ghost';
import { SidePanel } from './SidePanel';
import { useStepFx } from './useStepFx';
import { useGame } from './context';
import { DuelMenu } from './DuelMenu';
import type { UndoTile } from './DuelMenu';
import { Budget } from './Budget';
import { ElementWheel } from './ElementWheel';
import { BondSheet } from './BondSheet';
import type { BondMode } from './BondSheet';
import { GraftSheet } from './GraftSheet';
import { useWide } from './hooks';
import { Inspect } from './Inspect';
import { CardBack, MiniCard } from './MiniCard';
import { RoundTrack } from './RoundTrack';

const CARD_CUES = new Set(['enter', 'graft', 'split', 'bond', 'lunge', 'hit', 'ward', 'flash']);
/** while the Collector's moves play, nothing is offered */
const NO_GROUPS = groupLegal([]);

export function Duel() {
  const ctx = useGame((s) => s.ctx);
  const rt = useGame((s) => s.rt);
  const state = useGame((s) => s.state);
  const liveGroups = useGame((s) => s.groups);
  const events = useGame((s) => s.events);
  const frames = useGame((s) => s.frames);
  const trail = useGame((s) => s.trail);
  const error = useGame((s) => s.error);
  const mode = useGame((s) => s.mode);
  const act = useGame((s) => s.act);
  const undo = useGame((s) => s.undo);
  const unpick = useGame((s) => s.graftUnpick);
  const [sel, setSel] = useState<Selection | null>(null);
  const [inspected, setInspected] = useState<Iid | null>(null);
  const [hovered, setHovered] = useState<Iid | null>(null);
  const [menu, setMenu] = useState(false);
  const [bondSheet, setBondSheet] = useState<BondMode | null>(null);
  const wide = useWide();
  const { shown, cues, ghosts, telegraph, blocked, quip } = useStepFx(ctx, rt, state, events, frames);
  const undoNow = useMemo(() => undoStatus(trail), [trail]);
  const log = useMemo(() => (ctx === null || state === null ? [] : duelLog(ctx, state, trail)), [ctx, state, trail]);

  if (ctx === null || rt === null || state === null || shown === null || liveGroups === null) return null;
  const groups = blocked ? NO_GROUPS : liveGroups;
  const g = ctx.globals;
  const S = shown;
  const me = S.sides[0];
  const them = S.sides[1];
  const pending = S.pending;
  const mulligan = S.step === 'mulligan';
  const plan: Plan = planFor(groups, pending === null ? sel : null);
  const targets: ReadonlyMap<Iid, Action> = pending !== null ? groups.graftPicks : plan.targets;
  const view = (iid: Iid) => cardView(ctx, rt.engine, S, iid);
  const doAct = (a: Action): void => {
    setSel(null);
    act(a);
  };
  const cueFor = (iid: Iid): { kind: string; beat: number } | undefined => cues.find((c) => c.iid === iid && CARD_CUES.has(c.kind));
  const intent = S.collector.intent;
  const appraisal = appraisalCountdown(g, S);
  const mood = S.collector.mood;
  const combatHint = (attacker: Iid, target: Iid | -1): string | undefined => {
    const p = rt.engine.previewCombat(S, attacker, target);
    if (!p.known) return undefined;
    return p.outcome.destroyDefender ? (p.outcome.destroyAttacker ? 'Trade' : 'Destroys') : p.outcome.destroyAttacker ? 'Lost' : 'Holds';
  };
  const hintFor = (iid: Iid): string | undefined => (sel?.t === 'board' && pending === null ? combatHint(sel.iid, iid) : undefined);

  // lanes (D-281..D-284): display only. What may be played, moved or attacked is whatever `groups` offers.
  const L = lanesOn(g);
  const sentinelBit = ctx.content.kwBit['sentinel'];
  const covers = [coveredLanes(g, rt.engine, sentinelBit, S, 0), coveredLanes(g, rt.engine, sentinelBit, S, 1)] as const;
  const selSlot = sel?.t === 'board' ? S.sides[0].board.findIndex((m) => m !== null && m.iid === sel.iid) : -1;
  const noLifeLane = pending === null && selSlot >= 0 && plan.direct === null && plan.targets.size === 0 ? attackNote(g, S, selSlot) : null;
  const selMonster = sel?.t === 'board' ? (S.sides[0].board[selSlot] ?? null) : null;

  // The Collector's telegraph: never name a face-down card of his before it is turned up.
  const nameOf = (iid: Iid): string => {
    const hidden = S.sides[1].board.some((m) => m !== null && m.iid === iid && m.faceDown);
    return hidden ? 'A face-down card' : view(iid).name;
  };
  const tgLine = telegraph === null ? null : telegraphLine(telegraph, nameOf);
  const markOf = (iid: Iid): { icon: string; label: string } | undefined => {
    if (telegraph === null) return undefined;
    if (telegraph.actor === iid) return { icon: telegraph.kind === 'reposition' || telegraph.kind === 'moveLane' ? 'swap' : 'sword', label: 'Acts' };
    if (telegraph.target === iid) return { icon: 'pos', label: 'Target' };
    return undefined;
  };
  const slotMarked = (side: Side, kind: 'monster' | 'trap', i: number): boolean =>
    telegraph?.slot !== undefined && telegraph.slot.side === side && telegraph.slot.kind === kind && telegraph.slot.index === i;

  const picked = (iid: Iid): boolean => pending !== null && pending.mats.includes(iid);

  const tapBoard = (m: Monster, mine: boolean): void => {
    const hit = targets.get(m.iid);
    if (hit !== undefined) return doAct(hit);
    if (picked(m.iid)) return unpick(m.iid);
    if (pending !== null) return setInspected(m.iid);
    const slot = mine ? me.board.findIndex((x) => x !== null && x.iid === m.iid) : -1;
    // a lane swap: the selected monster trades places with this one of yours
    const swap = mine && sel?.t === 'board' && sel.iid !== m.iid ? plan.moves.get(slot) : undefined;
    if (swap !== undefined) return doAct(swap);
    // Covetous with lanes: pick the sacrifice, then (it frees its own lane) a lane
    if (mine && sel?.t === 'hand' && plan.sacs.has(m.iid)) {
      const lane = sel.sac === m.iid ? plan.lanes.get(slot) : undefined;
      if (lane !== undefined) return doAct(lane);
      return setSel({ ...sel, sac: m.iid });
    }
    if (mine && boardActionable(groups, m.iid)) return setSel(sel?.t === 'board' && sel.iid === m.iid ? null : { t: 'board', iid: m.iid });
    setSel(null);
    setInspected(m.iid);
  };

  const monsterRow = (side: Side) => {
    const s = S.sides[side];
    const mine = side === 0;
    const ghostSlots = new Set(ghosts.filter((gh) => gh.side === side).map((gh) => gh.slot));
    const keys = monsterSlotKeys(s.board, ghostSlots);
    return (
      <div className="row monsters" data-side={mine ? 'me' : 'them'}>
        {s.board.map((m, i) => {
          const key = keys[i] as string;
          const guarded = covers[side].has(i);
          const niche = (child: ReactNode) => (
            <div key={key} className="niche" data-lane={L ? i : undefined} data-covered={guarded ? '' : undefined}>
              {child}
              {guarded && (
                <span className="cover-mark" title="Guarded by a Sentinel: attacks here must target it" aria-label="Guarded by a Sentinel">
                  <Glyph id="barrier" size={12} />
                </span>
              )}
            </div>
          );
          if (m === null) {
            const ghost = ghosts.find((gh) => gh.side === side && gh.slot === i);
            if (ghost !== undefined) return niche(<GhostCard ghost={ghost} />);
            const play = mine ? (plan.summon ?? plan.lanes.get(i) ?? null) : null;
            const move = mine ? (plan.moves.get(i) ?? null) : null;
            if (slotMarked(side, 'monster', i)) {
              return niche(
                <div className="empty-slot" data-glow="slot" aria-label="Empty monster slot, the Collector plays here">
                  <Glyph id="pos" size={22} />
                </div>,
              );
            }
            if (play !== null) {
              return niche(
                <button type="button" className="empty-slot" data-glow="slot" aria-label={L ? `Empty lane ${i + 1}, summon here` : 'Empty monster slot, summon here'} onClick={() => doAct(play)}>
                  <Glyph id="pos" size={22} />
                </button>,
              );
            }
            if (move !== null) {
              return niche(
                <button type="button" className="empty-slot" data-glow="slot" aria-label={`Empty lane ${i + 1}, move here`} onClick={() => doAct(move)}>
                  <Glyph id="swap" size={22} />
                  <span className="slot-note">Move</span>
                </button>,
              );
            }
            if (!mine && !blocked && me.board[i] !== null && attackNote(g, S, i) !== null && !guarded) {
              return niche(
                <div className="empty-slot" data-blocked={i === selSlot ? 'active' : ''} aria-label="Empty lane across: this monster cannot attack, and cannot hit his life while he has monsters">
                  <Glyph id="shield" size={20} />
                  <span className="slot-note">No hit</span>
                </div>,
              );
            }
            return niche(<div className="empty-slot" aria-label={L ? `Empty lane ${i + 1}` : 'Empty monster slot'} />);
          }
          const mark = markOf(m.iid);
          const lit = telegraph?.actor === m.iid;
          const moveHere = mine && sel?.t === 'board' && sel.iid !== m.iid && plan.moves.has(i);
          const sac = mine && plan.sacs.has(m.iid);
          const attachHere = mine && sel?.t === 'hand' && sel.attach === true && targets.has(m.iid);
          const glow = targets.has(m.iid) || telegraph?.target === m.iid || moveHere || sac ? 'target' : null;
          const note = moveHere ? 'Swap' : attachHere ? `+${g.SYMBIOSIS_GUARD_BONUS} Guard` : sac ? (sel?.t === 'hand' && sel.sac === m.iid ? 'Here' : 'Sacrifice') : undefined;
          if (m.faceDown && !mine) {
            return niche(
              <CardBack
                icon="facedown"
                label="Face-down monster"
                glow={glow}
                selected={lit}
                mark={mark}
                onTap={telegraph === null && glow !== null ? () => tapBoard(m, false) : undefined}
              />,
            );
          }
          const c = view(m.iid);
          const isSel = (sel?.t === 'board' && sel.iid === m.iid) || picked(m.iid) || lit || (sel?.t === 'hand' && sel.sac === m.iid);
          const dim = (sel !== null || pending !== null) && glow === null && !isSel;
          return niche(
            <MiniCard
              view={c}
              monster={m}
              side={mine ? 'me' : 'them'}
              glow={glow}
              selected={isSel}
              dim={dim}
              cue={cueFor(m.iid)}
              preview={glow === null || telegraph !== null ? undefined : (note ?? hintFor(m.iid))}
              mark={mark}
              monstersOnly={monstersOnly(g, rt.engine, S, m)}
              moved={movedThisTurn(g, S, m)}
              symbiote={m.sym >= 0 ? view(m.sym) : null}
              onTap={() => tapBoard(m, mine)}
              onLong={() => setInspected(m.iid)}
              onHover={(on) => setHovered(on ? m.iid : null)}
            />,
          );
        })}
      </div>
    );
  };

  const trapRow = (side: Side) => {
    const s = S.sides[side];
    const mine = side === 0;
    return (
      <div className="row traps" data-side={mine ? 'me' : 'them'}>
        {s.traps.map((t, i) => {
          const key = `trap-${i}`;
          if (t === null) {
            const open = mine && plan.setTrap !== null;
            if (slotMarked(side, 'trap', i)) {
              return (
                <div key={key} className="trap-slot empty" data-glow="slot" aria-label="Empty trap slot, the Collector sets a trap here">
                  <Glyph id="trap" size={18} />
                </div>
              );
            }
            return open ? (
              <button key={key} type="button" className="trap-slot open" data-glow="slot" aria-label="Empty trap slot, set trap here" onClick={() => doAct(plan.setTrap as Action)}>
                <Glyph id="trap" size={18} /> Set here
              </button>
            ) : (
              <div key={key} className="trap-slot empty" aria-label="Empty trap slot">
                <Glyph id="trap" size={18} />
              </div>
            );
          }
          if (!mine) {
            return (
              <div key={key} className="trap-slot set" aria-label="Set trap">
                <Glyph id="trap" size={18} /> Set trap
              </div>
            );
          }
          const c = view(t.iid);
          return (
            <button key={key} type="button" className="trap-slot set" onClick={() => setInspected(t.iid)}>
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
    groups.summons.has(iid) || groups.summonCovetous.has(iid) || groups.casts.has(iid) || groups.setTraps.has(iid) || groups.symbioses.has(iid);
  const handCard = (iid: Iid, i: number) => {
    const selected = sel?.t === 'hand' && sel.iid === iid;
    const mid = (n - 1) / 2;
    const style = { '--rot': `${(i - mid) * 4}deg`, '--drop': `${Math.abs(i - mid) ** 2 * 3}px`, zIndex: selected ? 20 : i } as CSSProperties;
    return (
      <div key={`h-${iid}`} className="hand-slot" data-selected={selected ? '' : undefined} style={style}>
        <MiniCard
          view={view(iid)}
          side="me"
          selected={selected}
          dim={!mulligan && !playable(iid) && sel === null}
          cue={cueFor(iid)}
          onTap={() => (mulligan ? setInspected(iid) : setSel(selected ? null : { t: 'hand', iid, faceDown: false, guard: false }))}
          onLong={() => setInspected(iid)}
          onHover={(on) => setHovered(on ? iid : null)}
        />
      </div>
    );
  };

  const selView = sel === null ? null : view(sel.iid);
  // bond rules (D-305..D-320): display only. What may be done is whatever `groups` offers.
  const F = g.FLAGS;
  const bondsOn = F.SPLIT || F.SYMBIOSIS || F.BOND_ACTION;
  const bondAvailable = groups.graftBegin !== null || groups.splits.size > 0 || groups.symbioses.size > 0;
  const budgetShown = F.BOND_ACTION && !blocked && !mulligan && S.result === null;
  const forfeitsBond = F.BOND_ACTION && S.bond === 0 && bondAvailable && sel?.t === 'board' && (plan.direct !== null || plan.targets.size > 0);
  // `lead` is the first thing to do; `rest` is the small print. The bond warning sits between them so it is never cut off.
  const hint = ((): { readonly lead: string; readonly rest: string } | null => {
    if (selView === null) return null;
    if (sel?.t === 'hand') {
      if (!plan.anything) return { lead: 'This cannot be played right now.', rest: '' };
      if (sel.attach === true) return { lead: 'Tap a glowing host to attach it under.', rest: '' };
      const bits: string[] = [];
      const how = summonMode(sel) === 'down' ? 'face-down' : summonMode(sel) === 'grd' ? 'in Guard' : 'in Attack';
      if (plan.summon !== null) bits.push(`Tap an empty slot to summon it ${how}.`);
      if (plan.lanes.size > 0) bits.push(`Tap a lit lane to summon it ${how}.`);
      else if (plan.sacs.size > 0) bits.push('Tap a glowing card to sacrifice, then a lane.');
      if (plan.targets.size > 0) bits.push('Tap a glowing target.');
      if (plan.setTrap !== null) bits.push('Tap an empty trap slot.');
      if (plan.canAttach) bits.push('Or Attach it under a monster.');
      return { lead: bits.join(' '), rest: '' };
    }
    const bits: string[] = [];
    if (plan.split !== null) bits.push('Split it back into its parts.');
    if (L && plan.direct !== null) bits.push('His board is empty: tap his life to attack it.');
    else if (plan.direct !== null || plan.targets.size > 0) bits.push('Tap a glowing target to attack.');
    else if (noLifeLane !== null) bits.push('Empty lane: it cannot hit his life while he has monsters.');
    else if (plan.moves.size === 0) bits.push('No attack available.');
    const rest: string[] = [];
    if (plan.moves.size > 0) rest.push('A lane move or a switch: once per turn.');
    if (selMonster !== null && monstersOnly(g, rt.engine, S, selMonster)) rest.push('Summoned this turn: it can hit monsters, not life.');
    return { lead: bits.join(' '), rest: rest.join(' ') };
  })();

  // the element compass (D-272) for the picked monster, an attacker on the board or one to summon from the hand. It sits
  // at the left of the hint bar so it never covers a lane (D-334); the Play/Bond pips give up their row meanwhile.
  const compassId = pending === null && !blocked && selView !== null && selView.element !== null && selView.power !== null ? selView.element.id : null;
  const track = <RoundTrack globals={g} round={roundOfState(S)} />;
  const openSplit = (m: Iid): void => {
    setInspected(null);
    setBondSheet({ t: 'split', m });
  };
  const maxLife = g.PLAYER_LIFE;
  const myDamage = cues.find((c) => c.kind === 'damage' && c.side === 0);
  const moodLabel = moodName(g, S);
  const canUndo = !blocked && undoNow.ok;
  const undoTile: UndoTile = blocked
    ? { enabled: false, sub: 'Wait for the Collector' }
    : undoNow.ok
      ? { enabled: true, sub: undoLabel(ctx, state, trail.slice(undoNow.to)) }
      : { enabled: false, sub: UNDO_WHY[undoNow.why] };
  const undoWhy = !blocked && !undoNow.ok && undoNow.why !== 'nothing' ? UNDO_WHY[undoNow.why] : null;

  return (
    <main className="duel" data-graft={pending !== null ? '' : undefined} data-budget={budgetShown ? '' : undefined} onClick={() => setSel(null)}>
      {mode === 'practice' && (
        <p className="ribbon" role="status">
          <Glyph id="scroll" size={14} /> Practice · Unrecorded
        </p>
      )}
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
        telegraph={tgLine}
        cues={cues}
        directGlow={plan.direct !== null}
        onDirect={() => doAct(plan.direct as Action)}
        previewDirect={sel?.t === 'board' && plan.direct !== null ? combatHint(sel.iid, -1) : undefined}
        onMenu={() => setMenu(true)}
      />

      <div className="board-area">
        {trapRow(1)}
        {L ? (
          <div className="lanes">
            <div className="lane-rails" aria-hidden="true">
              {S.sides[0].board.map((_, i) => (
                <span key={`rail-${i}`} className="rail" data-active={selSlot === i ? '' : undefined} />
              ))}
            </div>
            <div className="lane-rails labels" aria-hidden="true">
              {S.sides[0].board.map((_, i) => (
                <span key={`label-${i}`} className="rail">
                  <b>Lane {i + 1}</b>
                </span>
              ))}
            </div>
            {monsterRow(1)}
            {track}
            {monsterRow(0)}
          </div>
        ) : (
          <>
            {monsterRow(1)}
            {track}
            {monsterRow(0)}
          </>
        )}
        {trapRow(0)}
      </div>

      {error !== null && (
        <p className="error-bar" role="alert">
          {error}
        </p>
      )}

      {pending !== null && !blocked ? (
        <GraftSheet onInspect={setInspected} />
      ) : (
        <footer className="bottom" onClick={(e) => e.stopPropagation()}>
          {budgetShown && compassId === null && <Budget played={S.played} bond={S.bond} />}
          {blocked ? (
            <div className="hintbar" aria-live="polite">
              <p className="muted">
                <Glyph id="eye" size={16} /> The Collector is acting. Tap to skip.
              </p>
            </div>
          ) : mulligan ? (
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
            <div className="hintbar" aria-live="polite" data-compass={compassId !== null ? '' : undefined}>
              {selView === null ? (
                <>
                  <p className="muted">
                    {undoWhy ?? (bondsOn ? 'Tap a card, then tap where to play it.' : 'Tap a card, then tap where to play it. Tap it again to put it back. Hold a card to inspect.')}
                  </p>
                  <div className="hint-buttons">
                    {bondsOn && (
                      <button type="button" className="btn bonds-btn" data-hot={bondAvailable ? '' : undefined} disabled={!bondAvailable} onClick={() => setBondSheet({ t: 'options' })}>
                        <Glyph id="link" size={18} /> Bonds
                      </button>
                    )}
                    <button type="button" className="btn ghost" disabled={!canUndo} onClick={() => undo()} title={undoWhy ?? undefined}>
                      <Glyph id="undo" size={18} /> Undo
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {compassId !== null && (
                    <div className="compass-box">
                      <ElementWheel variant="compass" focus={compassId} />
                    </div>
                  )}
                  <p>
                    {!(L && sel?.t === 'board') && <b>{selView.name} </b>}
                    {hint?.lead}
                    {forfeitsBond && (
                      <span className="hint-warn">
                        {' '}
                        <Glyph id="lock" size={14} /> Attacking closes your bond.
                      </span>
                    )}
                    {hint !== null && hint.rest !== '' && ` ${hint.rest}`}
                  </p>
                  <div className="hint-buttons">
                    {plan.cast !== null && (
                      <button type="button" className="btn primary" onClick={() => doAct(plan.cast as Action)}>
                        <Glyph id="spell" size={18} /> Cast
                      </button>
                    )}
                    {sel?.t === 'hand' && plan.canAttach && (
                      <button type="button" className="btn" aria-pressed={sel.attach === true} onClick={() => setSel({ ...sel, attach: sel.attach !== true })}>
                        <Glyph id="link" size={18} /> Attach
                      </button>
                    )}
                    {sel?.t === 'board' && plan.split !== null && (
                      <button type="button" className="btn" onClick={() => setBondSheet({ t: 'split', m: sel.iid })}>
                        <Glyph id="split" size={18} /> Split
                      </button>
                    )}
                    {plan.reposition !== null &&
                      (L ? (
                        <button
                          type="button"
                          className="btn icon"
                          aria-label={selMonster?.pos === 0 ? 'Switch to Guard position' : 'Switch to Attack position'}
                          title={selMonster?.pos === 0 ? 'Switch to Guard' : 'Switch to Attack'}
                          onClick={() => doAct(plan.reposition as Action)}
                        >
                          <Glyph id={selMonster?.pos === 0 ? 'shield' : 'sword'} size={20} />
                        </button>
                      ) : (
                        <button type="button" className="btn" onClick={() => doAct(plan.reposition as Action)}>
                          <Glyph id="swap" size={18} /> Reposition
                        </button>
                      ))}
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
              <LifeSeal life={me.life} maxLife={maxLife} hit={myDamage} />
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

      {wide && <SidePanel shown={inspected ?? hovered} pinned={inspected !== null} onUnpin={() => setInspected(null)} log={log} onSplit={openSplit} />}
      {!wide && inspected !== null && <Inspect iid={inspected} onClose={() => setInspected(null)} onSplit={openSplit} />}
      {bondSheet !== null && <BondSheet mode={bondSheet} onClose={() => setBondSheet(null)} />}
      {menu && <DuelMenu log={log} undo={undoTile} onClose={() => setMenu(false)} />}
    </main>
  );
}
