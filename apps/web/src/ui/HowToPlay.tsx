// How to play (D-257): swipeable catalogue pages in the D-240 gothic style. A modal dialog over Home. The pages sit in
// a scroll-snap strip, so a swipe is the browser's own (smooth, off the main thread); the Previous/Next buttons, the
// page dots and the arrow keys move the same strip. Skip and Done close it and remember that it was seen.
// Illustrations are the game's own components (MiniCard, Gem, RoundTrack, Seal) plus CSS; nothing here is raster art.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { GameCtx } from '../content/load';
import { howToPages, howToQuiz, howToSamples } from '../view/howto';
import type { HowToArtId, HowToPage, HowToSamples, Quiz } from '../view/howto';
import { Glyph } from '../visual/glyphs';
import { useGame } from './context';
import { ElementWheel } from './ElementWheel';
import { MiniCard } from './MiniCard';
import { RoundTrack } from './RoundTrack';
import { Seal } from './Seal';

const noop = (): void => undefined;

/** A card drawn for display only: no tap, no focus (inert), hidden from assistive tech. */
function Exhibit({ view, symbiote }: { readonly view: HowToSamples['monsters'][number]; readonly symbiote?: HowToSamples['monsters'][number] | undefined }) {
  return (
    <div className="ht-card" inert aria-hidden="true">
      <MiniCard view={view} side="me" symbiote={symbiote ?? null} onTap={noop} onLong={noop} />
    </div>
  );
}

/** A looping demo built from the game's own views (D-275). Its resting state is the finished picture, so with animations off it is a still. */
function Illustration({ id, ctx, samples }: { readonly id: HowToArtId; readonly ctx: GameCtx; readonly samples: HowToSamples }) {
  const g = ctx.globals;
  switch (id) {
    case 'goal': {
      const hero = samples.monsters[0];
      return (
        <div className="demo demo-goal">
          <div className="demo-foe">
            <span className="ht-life foe">
              <Glyph id="heart" size={22} filled /> <b>{g.COLLECTOR_LIFE}</b>
              <small>The Collector</small>
            </span>
            {hero?.power != null && (
              <span className="demo-float" aria-hidden="true">
                &minus;{hero.power}
              </span>
            )}
          </div>
          {hero !== undefined && (
            <div className="demo-hero">
              <Exhibit view={hero} />
            </div>
          )}
          <span className="ht-life me">
            <Glyph id="heart" size={22} filled /> <b>{g.PLAYER_LIFE}</b>
            <small>You</small>
          </span>
        </div>
      );
    }
    case 'cards':
      return (
        <div className="ht-board demo-cards">
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
        <>
          {samples.duel !== null && (
            <div className="demo demo-combat">
              <div className="demo-def">
                <Exhibit view={samples.duel.defender} />
              </div>
              <span className="demo-float bonus" aria-hidden="true">
                {ctx.render('+{ELEMENT_BONUS}')}
              </span>
              <div className="demo-atk">
                <Exhibit view={samples.duel.attacker} />
                <span className="demo-bonus" aria-hidden="true">
                  {ctx.render('+{ELEMENT_BONUS}')}
                </span>
              </div>
            </div>
          )}
          <ElementWheel />
        </>
      );
    case 'graft':
      return samples.graft === null ? (
        <Glyph id="swap" size={40} />
      ) : (
        <div className="ht-graft demo-graft">
          <span className="g-a">
            <Exhibit view={samples.graft.a} />
          </span>
          <b className="ht-plus" aria-hidden="true">+</b>
          <span className="g-b">
            <Exhibit view={samples.graft.b} />
          </span>
          <Glyph id="next" size={24} />
          <span className="g-r">
            <Exhibit view={samples.graft.result} />
          </span>
        </div>
      );
    case 'split':
      return samples.graft === null ? (
        <Glyph id="split" size={40} />
      ) : (
        <div className="ht-graft demo-split">
          <span className="g-r">
            <Exhibit view={samples.graft.result} />
          </span>
          <Glyph id="split" size={26} />
          <span className="g-a">
            <Exhibit view={samples.graft.a} />
          </span>
          <span className="g-b">
            <Exhibit view={samples.graft.b} />
          </span>
        </div>
      );
    case 'symbiosis':
      return samples.graft === null ? (
        <Glyph id="link" size={40} />
      ) : (
        <div className="ht-graft demo-symbiosis">
          <span className="g-b">
            <Exhibit view={samples.graft.b} />
          </span>
          <Glyph id="link" size={26} />
          <span className="g-a sym-host">
            <Exhibit view={samples.graft.a} symbiote={samples.graft.b} />
          </span>
        </div>
      );
    case 'appraisal':
      return (
        <div className="demo demo-appraisal">
          <RoundTrack globals={g} round={g.APPRAISAL_ROUNDS[0] ?? 0} />
          <div className="demo-take">
            {samples.monsters[0] !== undefined && (
              <span className="taken">
                <Exhibit view={samples.monsters[0]} />
              </span>
            )}
            <span className="ht-gavel gavel">
              <Glyph id="gavel" size={44} />
            </span>
          </div>
        </div>
      );
    case 'winning':
      return (
        <div className="ht-win demo-win">
          <span className="stamp">
            <Seal />
          </span>
          <p className="ht-stars" aria-hidden="true">
            {Array.from({ length: g.OBJECTIVES_PER_DAY }, (_, i) => (
              <span key={i} style={{ '--i': i } as CSSProperties}>
                <Glyph id="star" size={26} filled />
              </span>
            ))}
          </p>
        </div>
      );
  }
}

/** "Try it": tap an answer, learn at once whether it is right and why (D-275). */
function TryIt({ quiz }: { readonly quiz: Quiz }) {
  const [picked, setPicked] = useState<number | null>(null);
  const chosen = picked === null ? null : quiz.answers[picked];
  return (
    <div className="try">
      <h4>Try it</h4>
      <p className="try-q">{quiz.question}</p>
      <div className="try-answers">
        {quiz.answers.map((a, i) => (
          <button
            key={a.label}
            type="button"
            className="try-a"
            data-state={picked === i ? (a.right ? 'right' : 'wrong') : undefined}
            aria-pressed={picked === i}
            onClick={() => setPicked(i)}
          >
            {picked === i && <Glyph id={a.right ? 'check' : 'cross'} size={18} />} {a.label}
          </button>
        ))}
      </div>
      <p className="try-result" role="status" aria-live="polite" data-state={chosen === undefined || chosen === null ? undefined : chosen.right ? 'right' : 'wrong'}>
        {chosen !== undefined && chosen !== null && (
          <>
            <Glyph id={chosen.right ? 'check' : 'cross'} size={18} /> <b>{chosen.right ? 'Right.' : 'Not quite.'}</b> {quiz.why}
          </>
        )}
      </p>
    </div>
  );
}

export function HowToPlay() {
  const ctx = useGame((s) => s.ctx);
  const close = useGame((s) => s.closeHowTo);
  const pages: readonly HowToPage[] = useMemo(() => (ctx === null ? [] : howToPages(ctx)), [ctx]);
  const samples = useMemo(() => (ctx === null ? { monsters: [], graft: null, duel: null } : howToSamples(ctx)), [ctx]);
  const quizzes = useMemo(() => (ctx === null ? [] : pages.map((p) => howToQuiz(ctx, p.id))), [ctx, pages]);
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
              <p className="ht-summary">{p.summary}</p>
              {quizzes[i] !== null && quizzes[i] !== undefined && <TryIt quiz={quizzes[i] as Quiz} />}
              <details className="ht-more">
                <summary>All the rules</summary>
                <ul className="ht-lines">
                  {p.lines.map((line, j) => (
                    <li key={j}>{line}</li>
                  ))}
                </ul>
              </details>
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
