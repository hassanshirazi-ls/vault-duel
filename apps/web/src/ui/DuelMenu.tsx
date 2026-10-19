// The menu inside a duel (D-265, D-274, as drawn in DuelMenu.dc.html): a modal bottom sheet titled "Round N · your turn",
// a 2x2 grid of tiles (Undo with what it would take back, How to play, Restart in Practice only, Main menu), the last
// five log lines with a "Full log" link, and the full log on its own page with a small back control and a one-line title.
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { isPlayerToAct, roundOfState } from '../duel/turn';
import type { LogLine } from '../view/log';
import { recentLog } from '../view/log';
import { Glyph } from '../visual/glyphs';
import { useGame } from './context';
import { Sheet } from './Sheet';

export interface UndoTile {
  readonly enabled: boolean;
  /** what Undo would take back, or why it cannot */
  readonly sub: string;
}

function Tile({ icon, title, sub, onClick, disabled = false, confirm = false }: { readonly icon: string; readonly title: string; readonly sub: string; readonly onClick: () => void; readonly disabled?: boolean; readonly confirm?: boolean }) {
  return (
    <button type="button" className="tile" disabled={disabled} data-confirm={confirm ? '' : undefined} onClick={onClick}>
      <span className="tile-title">
        <Glyph id={icon} size={16} /> {title}
      </span>
      <span className="tile-sub">{sub}</span>
    </button>
  );
}

function LogList({ lines, className, refEl }: { readonly lines: readonly LogLine[]; readonly className?: string; readonly refEl?: RefObject<HTMLOListElement | null> }) {
  return (
    <ol className={`log ${className ?? ''}`} ref={refEl}>
      {lines.map((l, i) => (
        <li key={i} data-side={l.side ?? undefined}>
          <Glyph id={l.icon} size={15} />
          <span>{l.text}</span>
        </li>
      ))}
    </ol>
  );
}

export function DuelMenu({ log, undo, mood, onClose }: { readonly log: readonly LogLine[]; readonly undo: UndoTile; /** the Monarch's mood, in words (D-339: the header shows it only as the portrait ring) */ readonly mood?: string | null | undefined; readonly onClose: () => void }) {
  const mode = useGame((s) => s.mode);
  const state = useGame((s) => s.state);
  const doUndo = useGame((s) => s.undo);
  const openHowTo = useGame((s) => s.openHowTo);
  const openMenu = useGame((s) => s.openMenu);
  const startPractice = useGame((s) => s.startPractice);
  const [page, setPage] = useState<'menu' | 'log'>('menu');
  const [confirm, setConfirm] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (page === 'log' && list.current !== null) list.current.scrollTop = list.current.scrollHeight;
  }, [page]);
  const title = state === null ? 'Menu' : `Round ${roundOfState(state)} · ${isPlayerToAct(state) ? 'your turn' : 'his turn'}`;
  const close = (
    <button type="button" className="sheet-x" aria-label="Close menu" onClick={onClose}>
      <Glyph id="cross" size={18} />
    </button>
  );
  return (
    <Sheet modal onClose={onClose} label={page === 'menu' ? 'Duel menu' : 'Duel log'} className="duel-menu">
      {page === 'menu' ? (
        <div className="menu-list">
          <header className="sheet-head">
            <h2>{title}</h2>
            {close}
          </header>
          {mood !== undefined && mood !== null && (
            <p className="menu-mood" data-mood={state?.collector.mood}>
              <Glyph id="eye" size={16} /> The Monarch is {mood.toLowerCase()}. The ring around his portrait shows it.
            </p>
          )}
          <div className="tiles">
            <Tile
              icon="undo"
              title="Undo"
              sub={undo.sub}
              disabled={!undo.enabled}
              onClick={() => {
                onClose();
                doUndo();
              }}
            />
            <Tile
              icon="scroll"
              title="How to play"
              sub="Opens over the board"
              onClick={() => {
                onClose();
                openHowTo();
              }}
            />
            <Tile
              icon="swap"
              title="Restart"
              sub={mode !== 'practice' ? 'Practice only' : confirm ? 'Tap again to restart' : 'Start this vault over'}
              disabled={mode !== 'practice'}
              confirm={confirm}
              onClick={() => {
                if (!confirm) return setConfirm(true);
                onClose();
                startPractice();
              }}
            />
            <Tile icon="vault" title="Main menu" sub="Your duel is saved" onClick={openMenu} />
          </div>
          <section className="log-peek" aria-label="Recent log">
            <header>
              <h3>Duel log</h3>
              <button type="button" className="link" onClick={() => setPage('log')}>
                Full log
              </button>
            </header>
            {log.length === 0 ? <p className="muted">The court has not convened.</p> : <LogList lines={recentLog(log, 5)} />}
          </section>
          <p className="muted note">Undo goes back to the start of your turn. It stops at anything that revealed a card.</p>
        </div>
      ) : (
        <div className="menu-list log-sheet">
          <header className="sheet-head">
            <button type="button" className="sheet-x" aria-label="Back to the menu" onClick={() => setPage('menu')}>
              <Glyph id="back" size={20} />
            </button>
            <h2>Duel log</h2>
            {close}
          </header>
          {log.length === 0 ? <p className="muted">The court has not convened.</p> : <LogList lines={log} refEl={list} />}
        </div>
      )}
    </Sheet>
  );
}
