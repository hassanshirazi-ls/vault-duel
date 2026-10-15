// The right-hand ledger on wide landscape screens (D-240): deck and graveyard counts, the card being inspected or hovered
// (inspect lives here instead of in the bottom sheet), and a short duel log. Presentation only.
import type { Iid } from '@vault-duel/engine';
import { Glyph } from '../visual/glyphs';
import { useGame } from './context';
import { InspectCard } from './Inspect';
import type { LogEntry } from './useStepFx';

export function SidePanel({ shown, pinned, onUnpin, log }: { readonly shown: Iid | null; readonly pinned: boolean; readonly onUnpin: () => void; readonly log: readonly LogEntry[] }) {
  const state = useGame((s) => s.state);
  if (state === null) return null;
  const [me, them] = state.sides;
  const counts: readonly { readonly key: string; readonly who: string; readonly icon: string; readonly label: string; readonly n: number }[] = [
    { key: 'md', who: 'Your', icon: 'deck', label: 'deck', n: me.deck.length },
    { key: 'mg', who: 'Your', icon: 'tomb', label: 'graveyard', n: me.discard.length },
    { key: 'td', who: "Collector's", icon: 'deck', label: 'deck', n: them.deck.length },
    { key: 'tg', who: "Collector's", icon: 'tomb', label: 'graveyard', n: them.discard.length },
  ];
  return (
    <aside className="sidepanel" aria-label="Auction ledger" onClick={(e) => e.stopPropagation()}>
      <section className="panel">
        <h3 className="panel-title">Ledger</h3>
        <ul className="counts">
          {counts.map((c) => (
            <li key={c.key} className="count" aria-label={`${c.who} ${c.label} ${c.n}`}>
              <Glyph id={c.icon} size={20} />
              <span>
                {c.who} {c.label}
              </span>
              <b>{c.n}</b>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel inspect-panel" aria-label="Card details" aria-live="polite">
        {shown === null ? (
          <p className="muted">Hover a card, or hold one, to examine it here.</p>
        ) : (
          <div className="panel-scroll">
            <InspectCard iid={shown} onClose={pinned ? onUnpin : undefined} />
          </div>
        )}
      </section>
      <section className="panel log-panel" aria-label="Duel log">
        <h3 className="panel-title">Duel log</h3>
        {log.length === 0 ? (
          <p className="muted">The auction has not begun.</p>
        ) : (
          <ol className="log">
            {[...log].reverse().map((l) => (
              <li key={l.n} data-side={l.side ?? undefined}>
                <Glyph id={l.icon} size={15} />
                <span>{l.text}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}
