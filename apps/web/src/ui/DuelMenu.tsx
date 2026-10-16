// The menu inside a duel (D-265): How to play (over the board, so closing it returns to the same spot), the Duel log
// for the whole duel, Restart (Practice only) and Main menu (the duel stays saved). A modal bottom sheet.
import { useEffect, useRef, useState } from 'react';
import type { LogLine } from '../view/log';
import { Glyph } from '../visual/glyphs';
import { useGame } from './context';
import { Sheet } from './Sheet';

export function DuelMenu({ log, onClose }: { readonly log: readonly LogLine[]; readonly onClose: () => void }) {
  const mode = useGame((s) => s.mode);
  const openHowTo = useGame((s) => s.openHowTo);
  const openMenu = useGame((s) => s.openMenu);
  const startPractice = useGame((s) => s.startPractice);
  const [page, setPage] = useState<'menu' | 'log'>('menu');
  const [confirm, setConfirm] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (page === 'log' && list.current !== null) list.current.scrollTop = list.current.scrollHeight;
  }, [page]);
  return (
    <Sheet modal onClose={onClose} label={page === 'menu' ? 'Duel menu' : 'Duel log'} className="duel-menu">
      {page === 'menu' ? (
        <div className="menu-list">
          <h2>Menu</h2>
          <button
            type="button"
            className="btn"
            onClick={() => {
              onClose();
              openHowTo();
            }}
          >
            <Glyph id="scroll" size={18} /> How to play
          </button>
          <button type="button" className="btn" onClick={() => setPage('log')}>
            <Glyph id="scales" size={18} /> Duel log
          </button>
          {mode === 'practice' && (
            <button
              type="button"
              className="btn"
              data-confirm={confirm ? '' : undefined}
              onClick={() => {
                if (!confirm) return setConfirm(true);
                onClose();
                startPractice();
              }}
            >
              <Glyph id="swap" size={18} /> {confirm ? 'Tap again to restart' : 'Restart practice'}
            </button>
          )}
          <button type="button" className="btn" onClick={openMenu}>
            <Glyph id="vault" size={18} /> Main menu
          </button>
          <p className="muted">Your duel is saved. You can come back to it from the main menu.</p>
          <button type="button" className="btn ghost" onClick={onClose}>
            <Glyph id="cross" size={18} /> Close
          </button>
        </div>
      ) : (
        <div className="menu-list log-sheet">
          <div className="log-head">
            <button type="button" className="btn ghost" onClick={() => setPage('menu')}>
              <Glyph id="back" size={18} /> Back
            </button>
            <h2>Duel log</h2>
          </div>
          {log.length === 0 ? (
            <p className="muted">The auction has not begun.</p>
          ) : (
            <ol className="log" ref={list}>
              {log.map((l, i) => (
                <li key={i} data-side={l.side ?? undefined}>
                  <Glyph id={l.icon} size={15} />
                  <span>{l.text}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Sheet>
  );
}
