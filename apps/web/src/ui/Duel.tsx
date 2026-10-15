import { useState } from 'react';
import type { Action, GameState, Iid, Monster } from '@vault-duel/engine';
import { roundOfState } from '../duel/turn';
import { cardView } from '../view/cards';
import type { CardView } from '../view/cards';
import { MODE_LABEL, POSITION_LABEL } from '../view/legal';
import { appraisalCountdown, graftPreviewView, INTENT_LABEL, moodName } from '../view/status';
import { useGame } from './context';

function CardText({ c }: { c: CardView }) {
  return (
    <>
      {c.element !== null && `[${c.element.icon}] ${c.element.name} `}
      {c.name}
      {c.power !== null && ` P${c.power}/G${c.guard}`}
      {c.kind !== null && ` ${c.kind}`}
      {c.isChimera && ' (Chimera)'}
      {c.keywords.map((k) => ` {${k.icon}:${k.name}}`).join('')}
    </>
  );
}

function Inspect({ iid, onClose }: { iid: Iid; onClose: () => void }) {
  const ctx = useGame((s) => s.ctx);
  const rt = useGame((s) => s.rt);
  const state = useGame((s) => s.state);
  if (ctx === null || rt === null || state === null) return null;
  const c = cardView(ctx, rt.engine, state, iid);
  return (
    <section aria-label="Card inspect">
      <h3><CardText c={c} /></h3>
      {c.text !== null && <p>{c.text}</p>}
      <ul>{c.keywords.map((k) => <li key={k.id}>[{k.icon}] {k.name}{k.flaw ? ' (Flaw)' : ''}: {k.text}</li>)}</ul>
      <button onClick={onClose}>Close</button>
    </section>
  );
}

function Slot({ m, mine, inspect }: { m: Monster | null; mine: boolean; inspect: (iid: Iid) => void }) {
  const ctx = useGame((s) => s.ctx);
  const rt = useGame((s) => s.rt);
  const state = useGame((s) => s.state);
  const groups = useGame((s) => s.groups);
  const act = useGame((s) => s.act);
  if (ctx === null || rt === null || state === null || groups === null) return null;
  if (m === null) return <li>(empty monster slot)</li>;
  if (m.faceDown && !mine) return <li>(face-down monster)</li>;
  const c = cardView(ctx, rt.engine, state, m.iid);
  const reposition = groups.repositions.get(m.iid);
  const attacks = groups.attacks.get(m.iid) ?? [];
  return (
    <li>
      <CardText c={c} /> - {m.faceDown ? 'face-down ' : ''}{POSITION_LABEL[m.pos]}
      <button onClick={() => inspect(m.iid)}>Inspect</button>
      {mine && reposition !== undefined && <button onClick={() => act(reposition)}>Reposition</button>}
      {mine && attacks.map((a, i) => {
        const label = a.target < 0 ? 'direct' : cardView(ctx, rt.engine, state, a.target).name;
        const p = rt.engine.previewCombat(state, a.a, a.target);
        const hint = p.known
          ? ` (${p.outcome.destroyDefender ? 'destroys it' : 'does not destroy it'}${p.outcome.destroyAttacker ? ', lost' : ''}, deals ${p.outcome.dmgToDefender}, takes ${p.outcome.dmgToAttacker})`
          : ' (unknown)';
        return <button key={i} onClick={() => act(a)}>Attack {label}{hint}</button>;
      })}
    </li>
  );
}

function Board({ state, side, inspect }: { state: GameState; side: 0 | 1; inspect: (iid: Iid) => void }) {
  const ctx = useGame((s) => s.ctx);
  const rt = useGame((s) => s.rt);
  if (ctx === null || rt === null) return null;
  const s = state.sides[side];
  return (
    <section aria-label={side === 0 ? 'Your board' : "Collector's board"}>
      <h3>{side === 0 ? 'Your board' : 'The Collector'} - life {s.life}</h3>
      <ul>{s.board.map((m, i) => <Slot key={i} m={m} mine={side === 0} inspect={inspect} />)}</ul>
      <ul>
        {s.traps.map((t, i) => (
          <li key={i}>
            {t === null ? '(empty trap slot)' : side === 0 ? `Trap: ${cardView(ctx, rt.engine, state, t.iid).name}` : '(set trap)'}
          </li>
        ))}
      </ul>
    </section>
  );
}

function GraftPanel({ state }: { state: GameState }) {
  const ctx = useGame((s) => s.ctx);
  const rt = useGame((s) => s.rt);
  const groups = useGame((s) => s.groups);
  const act = useGame((s) => s.act);
  if (ctx === null || rt === null || groups === null || state.pending === null) return null;
  const preview = graftPreviewView(ctx, rt.engine, state);
  const name = (iid: Iid): string => cardView(ctx, rt.engine, state, iid).name;
  return (
    <section aria-label="Graft">
      <h3>Graft - step: {state.pending.stage}</h3>
      <p>Chosen: {state.pending.mats.map(name).join(' + ') || 'nothing yet'}</p>
      {preview !== null && (
        <p>
          Result: {preview.name} {preview.element !== null && `[${preview.element.icon}] ${preview.element.name} `}
          P{preview.power}/G{preview.guard}
          {preview.ascended && ' - Ascended'}
          {preview.unstable && ' - Unstable'}
          {preview.keywords.map((k) => ` {${k.icon}:${k.name}}`).join('')}
        </p>
      )}
      <ul>
        {[...groups.graftPicks].map(([iid, a]) => <li key={iid}><button onClick={() => act(a)}>Use {name(iid)}</button></li>)}
      </ul>
      {groups.graftSkipAscend !== null && <button onClick={() => act(groups.graftSkipAscend as Action)}>Skip Ascend</button>}
      {groups.graftKeywords.map((a, i) => (
        <button key={i} onClick={() => act(a)}>
          Inherit {preview?.available.filter((k) => { const bit = ctx.content.kwBit[k.id]; return bit !== undefined && (a.kw >>> bit) & 1; }).map((k) => `[${k.icon}] ${k.name}`).join(' + ')}
        </button>
      ))}
      {groups.graftPositions.map((a) => <button key={a.pos} onClick={() => act(a)}>Enter in {POSITION_LABEL[a.pos]}</button>)}
      {groups.graftCancel !== null && <button onClick={() => act(groups.graftCancel as Action)}>Cancel Graft</button>}
    </section>
  );
}

export function Duel() {
  const ctx = useGame((s) => s.ctx);
  const rt = useGame((s) => s.rt);
  const state = useGame((s) => s.state);
  const groups = useGame((s) => s.groups);
  const error = useGame((s) => s.error);
  const act = useGame((s) => s.act);
  const [inspected, setInspected] = useState<Iid | null>(null);
  if (ctx === null || rt === null || state === null || groups === null) return null;
  const g = ctx.globals;
  const me = state.sides[0];
  const intent = state.collector.intent;
  const appraisal = appraisalCountdown(g, state);
  const mood = moodName(g, state);
  const pending = state.pending !== null;
  const nameOf = (iid: Iid): string => cardView(ctx, rt.engine, state, iid).name;
  return (
    <main>
      <h1>Round {roundOfState(state)} of {g.MAX_ROUNDS}</h1>
      <p>
        Your life {me.life} - Collector life {state.sides[1].life}
        {intent !== null && ` - [${INTENT_LABEL[intent].icon}] ${INTENT_LABEL[intent].label}`}
        {mood !== null && ` - mood: ${mood}`}
        {appraisal !== null && ` - Appraisal in round ${appraisal.round} (${appraisal.roundsAway === 0 ? 'after your turn' : `${appraisal.roundsAway} rounds away`})`}
      </p>
      {error !== null && <p role="alert">{error}</p>}
      <Board state={state} side={1} inspect={setInspected} />
      <Board state={state} side={0} inspect={setInspected} />
      {inspected !== null && <Inspect iid={inspected} onClose={() => setInspected(null)} />}
      {state.step === 'mulligan' && (
        <section aria-label="Opening hand">
          <p>Keep this hand?</p>
          {groups.keep !== null && <button onClick={() => act(groups.keep as Action)}>Keep</button>}
          {groups.redraw !== null && <button onClick={() => act(groups.redraw as Action)}>Redraw</button>}
        </section>
      )}
      {pending && <GraftPanel state={state} />}
      <section aria-label="Hand">
        <h3>Hand</h3>
        <ul>
          {me.hand.map((iid) => {
            const c = cardView(ctx, rt.engine, state, iid);
            const summons = groups.summons.get(iid) ?? [];
            const covetous = groups.summonCovetous.get(iid) ?? [];
            const casts = groups.casts.get(iid) ?? [];
            const setTrap = groups.setTraps.get(iid);
            return (
              <li key={iid}>
                <CardText c={c} />
                <button onClick={() => setInspected(iid)}>Inspect</button>
                {summons.map((a) => <button key={a.mode} onClick={() => act(a)}>Summon: {MODE_LABEL[a.mode]}</button>)}
                {covetous.map((a, i) => <button key={i} onClick={() => act(a)}>Covetous summon, sacrificing {nameOf(a.sac)} ({a.mode === 'atk' ? 'attack' : 'guard'})</button>)}
                {casts.map((a, i) => <button key={i} onClick={() => act(a)}>Cast{a.target >= 0 ? ` on ${nameOf(a.target)}` : ''}</button>)}
                {setTrap !== undefined && <button onClick={() => act(setTrap)}>Set trap</button>}
              </li>
            );
          })}
        </ul>
        {groups.graftBegin !== null && <button onClick={() => act(groups.graftBegin as Action)}>Graft</button>}
      </section>
      {groups.endTurn !== null && <button onClick={() => act(groups.endTurn as Action)}>End turn</button>}
    </main>
  );
}
