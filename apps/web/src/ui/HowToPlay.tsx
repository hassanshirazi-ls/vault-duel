// How to play (D-257): swipeable catalogue pages in the D-240 gothic style. A modal dialog over Home. The pages sit in
// a scroll-snap strip, so a swipe is the browser's own (smooth, off the main thread); the Previous/Next buttons, the
// page dots and the arrow keys move the same strip. Skip and Done close it and remember that it was seen.
// Illustrations are the game's own components (MiniCard, Gem, RoundTrack, Seal) plus CSS; nothing here is raster art.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { Monster, Pos } from '@vault-duel/engine';
import type { GameCtx } from '../content/load';
import { howToPages, howToQuiz, howToSamples, keywordGlossary } from '../view/howto';
import type { HowToArtId, HowToPage, HowToSamples, Quiz } from '../view/howto';
import { Glyph } from '../visual/glyphs';
import { Budget } from './Budget';
import { useGame } from './context';
import { ElementWheel } from './ElementWheel';
import { MiniCard } from './MiniCard';
import { RoundTrack } from './RoundTrack';
import { Seal } from './Seal';

const noop = (): void => undefined;

/** A card drawn for display only: no tap, no focus (inert), hidden from assistive tech. */
function Exhibit({ view, symbiote, side = 'me', monster }: { readonly view: HowToSamples['monsters'][number]; readonly symbiote?: HowToSamples['monsters'][number] | undefined; readonly side?: 'me' | 'them'; readonly monster?: Monster | undefined }) {
  return (
    <div className="ht-card" inert aria-hidden="true">
      <MiniCard view={view} monster={monster} side={side} symbiote={symbiote ?? null} onTap={noop} onLong={noop} />
    </div>
  );
}

/** A stand-in board monster for the positions demo, so the card draws its sword, shield or face-down mark. */
const exhibitMonster = (pos: Pos, faceDown: boolean): Monster => ({
  iid: -1,
  pos,
  faceDown,
  entered: -1,
  repositioned: -1,
  attacked: -1,
  wardUsed: false,
  permP: 0,
  permG: 0,
  timed: [],
  unstableUntil: -1,
  shroudUntil: -1,
  appraised: false,
  sym: -1,
});

const POSITION_DEMO: readonly { readonly label: string; readonly icon: string; readonly pos: Pos; readonly faceDown: boolean }[] = [
  { label: 'Attack', icon: 'sword', pos: 0, faceDown: false },
  { label: 'Guard', icon: 'shield', pos: 1, faceDown: false },
  { label: 'Face-down', icon: 'facedown', pos: 1, faceDown: true },
];

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
              <small>The Monarch</small>
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
    case 'positions': {
      const v = samples.monsters[0];
      return (
        <div className="ht-row ht-positions" aria-hidden="true">
          {POSITION_DEMO.map((d) => (
            <span key={d.label} className="ht-position">
              <span className="ht-niche">{v !== undefined && <Exhibit view={v} monster={exhibitMonster(d.pos, d.faceDown)} />}</span>
              <small>
                <Glyph id={d.icon} size={14} /> {d.label}
              </small>
            </span>
          ))}
        </div>
      );
    }
    case 'faq':
      return <Glyph id="info" size={40} />;
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
    case 'lanes': {
      // lane 1: your strongest sample attacks his weakest straight across; lane 2: nothing across, so no hit; lane 3: his
      // monster faces an empty lane
      const [a, b, c] = [...samples.monsters].sort((x, y) => (y.power ?? 0) - (x.power ?? 0));
      const niche = (v: HowToSamples['monsters'][number] | undefined, side: 'me' | 'them', atk = false) => (
        <span className={atk ? 'ht-lane-cell ht-lane-atk' : 'ht-lane-cell'}>
          <span className="ht-niche">{v !== undefined && <Exhibit view={v} side={side} />}</span>
        </span>
      );
      return (
        <div className="ht-lanes" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <b key={`l${i}`} className="ht-lane-cell ht-lane-name">
              Lane {i + 1}
            </b>
          ))}
          {niche(c, 'them')}
          {niche(undefined, 'them')}
          {niche(b, 'them')}
          <span className="ht-lane-cell ht-lane-mark hit">
            <Glyph id="sword" size={20} />
          </span>
          <span className="ht-lane-cell ht-lane-mark">
            <span className="miss">No hit</span>
          </span>
          <span className="ht-lane-cell ht-lane-mark" />
          {niche(a, 'me', true)}
          {niche(b, 'me')}
          {niche(undefined, 'me')}
        </div>
      );
    }
    case 'bonds':
      if (g.FLAGS.TURN_SLOTS) {
        // D-336: with Graft the only bond, the duel's button and dot say Graft, so the demo does too
        const bondName = g.FLAGS.SPLIT || g.FLAGS.SYMBIOSIS ? 'Bond' : 'Graft';
        return (
          <div className="ht-bonds" inert aria-hidden="true">
            <div className="ht-bond-step">
              <Budget played={false} bond={0} slots={{ spell: 0, attacks: 2 }} bondName={bondName} />
              <small>Your turn starts: all open</small>
            </div>
            <div className="ht-bond-step">
              <Budget played bond={0} slots={{ spell: 0, attacks: 1 }} bondName={bondName} />
              <small>Summoned and attacked once: the rest is still open</small>
            </div>
            <div className="ht-bond-step">
              <Budget played bond={1} slots={{ spell: 1, attacks: 0 }} bondName={bondName} />
              <small>All used: end your turn</small>
            </div>
          </div>
        );
      }
      return (
        <div className="ht-bonds" inert aria-hidden="true">
          <div className="ht-bond-step">
            <Budget played={false} bond={0} />
            <small>Your turn starts</small>
          </div>
          <div className="ht-bond-step">
            <Budget played bond={1} />
            <small>A card played and a bond made</small>
          </div>
          <div className="ht-bond-step">
            <Budget played={false} bond={2} />
            <small>Attacked first: the bond is closed</small>
          </div>
          <p className="ht-bond-kinds">
            <span>
              <Glyph id="swap" size={18} /> Graft
            </span>
            {g.FLAGS.SPLIT && (
              <span>
                <Glyph id="split" size={18} /> Split
              </span>
            )}
            {g.FLAGS.SYMBIOSIS && (
              <span>
                <Glyph id="link" size={18} /> Symbiosis
              </span>
            )}
          </p>
        </div>
      );
    case 'keywords':
      return (
        <ul className="ht-keywords" aria-hidden="true">
          {keywordGlossary(ctx).map((k) => (
            <li key={k.id} data-flaw={k.flaw ? '' : undefined}>
              <Glyph id={k.icon} size={18} /> {k.name}
            </li>
          ))}
        </ul>
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
              <Glyph id="crown" size={44} filled />
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
          {g.FLAGS.BONUS_OBJECTIVES && <p className="ht-stars" aria-hidden="true">
            {Array.from({ length: g.OBJECTIVES_PER_DAY }, (_, i) => (
              <span key={i} style={{ '--i': i } as CSSProperties}>
                <Glyph id="star" size={26} filled />
              </span>
            ))}
          </p>}
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
                Page {i + 1} of {pages.length}
              </p>
              <h3>{p.title}</h3>
              <div className="ht-art">
                <Illustration id={p.id} ctx={ctx} samples={samples} />
              </div>
              <p className="ht-summary">{p.summary}</p>
              {p.keys !== undefined && p.keys.length > 0 && (
                <ul className="ht-lines ht-keys" aria-label="Key rules">
                  {p.keys.map((line, j) => (
                    <li key={j}>{line}</li>
                  ))}
                </ul>
              )}
              {quizzes[i] !== null && quizzes[i] !== undefined && <TryIt quiz={quizzes[i] as Quiz} />}
              {p.qa !== undefined ? (
                <dl className="ht-qa">
                  {p.qa.map((x) => (
                    <div key={x.q}>
                      <dt>{x.q}</dt>
                      <dd>{x.a}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <details className="ht-more" open={p.open}>
                  <summary>All the rules</summary>
                  <ul className="ht-lines">
                    {p.lines.map((line, j) => (
                      <li key={j}>{line}</li>
                    ))}
                  </ul>
                </details>
              )}
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
