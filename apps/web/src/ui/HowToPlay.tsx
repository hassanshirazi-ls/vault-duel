// How to play (D-257): swipeable catalogue pages in the D-240 gothic style. A modal dialog over Home. The pages sit in
// a scroll-snap strip, so a swipe is the browser's own (smooth, off the main thread); the Previous/Next buttons, the
// page dots and the arrow keys move the same strip. Skip and Done close it and remember that it was seen.
// Illustrations are the game's own components (MiniCard, Gem, RoundTrack, Seal) plus CSS; nothing here is raster art.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { GameCtx } from '../content/load';
import { howToPages, howToSamples } from '../view/howto';
import type { HowToArtId, HowToPage, HowToSamples } from '../view/howto';
import { Glyph } from '../visual/glyphs';
import { useGame } from './context';
import { Gem } from './Gem';
import { MiniCard } from './MiniCard';
import { RoundTrack } from './RoundTrack';
import { Seal } from './Seal';

const noop = (): void => undefined;

/** A card drawn for display only: no tap, no focus (inert), hidden from assistive tech. */
function Exhibit({ view }: { readonly view: HowToSamples['monsters'][number] }) {
  return (
    <div className="ht-card" inert aria-hidden="true">
      <MiniCard view={view} side="me" onTap={noop} onLong={noop} />
    </div>
  );
}

function Illustration({ id, ctx, samples }: { readonly id: HowToArtId; readonly ctx: GameCtx; readonly samples: HowToSamples }) {
  const g = ctx.globals;
  switch (id) {
    case 'goal':
      return (
        <>
          <div className="ht-lives">
            <span className="ht-life">
              <Glyph id="heart" size={22} filled /> <b>{g.PLAYER_LIFE}</b>
              <small>You</small>
            </span>
            <Glyph id="sword" size={22} />
            <span className="ht-life foe">
              <Glyph id="heart" size={22} filled /> <b>{g.COLLECTOR_LIFE}</b>
              <small>The Collector</small>
            </span>
          </div>
          <RoundTrack globals={g} round={0} />
        </>
      );
    case 'cards':
      return (
        <div className="ht-board">
          <div className="ht-row">
            {Array.from({ length: g.BOARD_SLOTS }, (_, i) => {
              const v = samples.monsters[i % Math.max(1, samples.monsters.length)];
              return (
                <span key={i} className="ht-niche">
                  {v !== undefined && i < samples.monsters.length && <Exhibit view={v} />}
                </span>
              );
            })}
          </div>
          <div className="ht-row traps">
            {Array.from({ length: g.TRAP_SLOTS }, (_, i) => (
              <span key={i} className="ht-niche small" aria-hidden="true">
                <Glyph id="trap" size={22} />
              </span>
            ))}
          </div>
        </div>
      );
    case 'combat':
      return (
        <ul className="ht-beats">
          {[...ctx.elements.values()].map((e) => (
            <li key={e.id}>
              <span className="ht-el">
                <Gem element={e} /> {e.name}
              </span>
              <Glyph id="next" size={16} />
              <span className="ht-targets">
                {e.beats.map((id) => {
                  const t = ctx.elements.get(id);
                  return t === undefined ? null : (
                    <span key={id} className="ht-el">
                      <Gem element={t} /> {t.name}
                    </span>
                  );
                })}
              </span>
            </li>
          ))}
        </ul>
      );
    case 'graft':
      return samples.graft === null ? (
        <Glyph id="swap" size={40} />
      ) : (
        <div className="ht-graft">
          <Exhibit view={samples.graft.a} />
          <b className="ht-plus" aria-hidden="true">+</b>
          <Exhibit view={samples.graft.b} />
          <Glyph id="next" size={24} />
          <Exhibit view={samples.graft.result} />
        </div>
      );
    case 'appraisal':
      return (
        <>
          <RoundTrack globals={g} round={g.APPRAISAL_ROUNDS[0] ?? 0} />
          <div className="ht-gavel">
            <Glyph id="gavel" size={44} />
          </div>
        </>
      );
    case 'winning':
      return (
        <div className="ht-win">
          <Seal />
          <p className="ht-stars" aria-hidden="true">
            {Array.from({ length: g.OBJECTIVES_PER_DAY }, (_, i) => (
              <Glyph key={i} id="star" size={26} filled />
            ))}
          </p>
        </div>
      );
  }
}

export function HowToPlay() {
  const ctx = useGame((s) => s.ctx);
  const close = useGame((s) => s.closeHowTo);
  const pages: readonly HowToPage[] = useMemo(() => (ctx === null ? [] : howToPages(ctx)), [ctx]);
  const samples = useMemo(() => (ctx === null ? { monsters: [], graft: null } : howToSamples(ctx)), [ctx]);
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  /** the page a button, dot or key is scrolling to; scroll events on the way there must not move the index back */
  const heading = useRef<number | null>(null);
  const calm = ctx !== null && !ctx.globals.FLAGS.ANIMATIONS;

  // focus moves into the dialog and comes back to where it was (the "?" button, or nothing on the first open)
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    return () => before?.focus();
  }, []);

  const reduced = (): boolean => calm || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const go = (to: number): void => {
    const el = strip.current;
    if (el === null) return;
    const i = Math.max(0, Math.min(pages.length - 1, to));
    heading.current = Math.abs(el.scrollLeft - i * el.clientWidth) < 1 ? null : i;
    el.scrollTo({ left: i * el.clientWidth, behavior: reduced() ? 'auto' : 'smooth' });
    setIndex(i);
  };

  // keep the strip aligned when the window is resized or rotated
  useEffect(() => {
    const el = strip.current;
    if (el === null) return undefined;
    const onResize = (): void => el.scrollTo({ left: index * el.clientWidth, behavior: 'auto' });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [index]);

  const onScroll = (): void => {
    const el = strip.current;
    if (el === null || el.clientWidth === 0) return;
    const at = Math.max(0, Math.min(pages.length - 1, Math.round(el.scrollLeft / el.clientWidth)));
    if (heading.current !== null) {
      if (at !== heading.current) return;
      heading.current = null;
    }
    setIndex(at);
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(index - 1);
    } else if (e.key === 'Tab' && dialog.current !== null) {
      const items = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')];
      const first = items[0];
      const last = items[items.length - 1];
      if (first === undefined || last === undefined) return;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  if (ctx === null || pages.length === 0) return null;
  const last = index === pages.length - 1;
  return (
    <div className="ht-layer">
      <div className="ht" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="ht-title" tabIndex={-1} onKeyDown={onKey}>
        <header className="ht-head">
          <h2 id="ht-title">How to play</h2>
          <button type="button" className="btn ghost ht-skip" onClick={close}>
            Skip
          </button>
        </header>
        <div className="ht-strip" ref={strip} onScroll={onScroll} onTouchStart={() => (heading.current = null)} onWheel={() => (heading.current = null)}>
          {pages.map((p, i) => (
            <section
              key={p.id}
              className="ht-page"
              role="group"
              aria-roledescription="page"
              aria-label={`${i + 1} of ${pages.length}: ${p.title}`}
              inert={i !== index}
              tabIndex={i === index ? 0 : -1}
            >
              <p className="eyebrow">
                Lot {i + 1} of {pages.length}
              </p>
              <h3>{p.title}</h3>
              <div className="ht-art">
                <Illustration id={p.id} ctx={ctx} samples={samples} />
              </div>
              <ul className="ht-lines">
                {p.lines.map((line, j) => (
                  <li key={j}>{line}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          Page {index + 1} of {pages.length}: {pages[index]?.title}
        </p>
        <footer className="ht-foot">
          <button type="button" className="btn ghost ht-nav" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous page">
            <Glyph id="back" size={22} />
          </button>
          <div className="ht-dots">
            {pages.map((p, i) => (
              <button key={p.id} type="button" className="ht-dot" aria-label={`Page ${i + 1}: ${p.title}`} aria-current={i === index ? 'step' : undefined} onClick={() => go(i)}>
                <i />
              </button>
            ))}
          </div>
          {last ? (
            <button type="button" className="btn primary ht-nav wide" onClick={close}>
              Done
            </button>
          ) : (
            <button type="button" className="btn primary ht-nav" onClick={() => go(index + 1)} aria-label="Next page">
              <Glyph id="next" size={22} />
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
