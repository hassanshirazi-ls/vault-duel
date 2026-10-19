// The Monarch's header (D-237, D-238, D-339, D-351): a crowned ink portrait whose ring shows the mood, life, his trap icons,
// the intent plaque and a one-line speech that fades by itself, over a faint spiral that turns slowly. The 1-12 round
// strip, with the levy countdown, lives in RoundTrack.
import type { CSSProperties } from 'react';
import type { TelegraphLine } from '../view/telegraph';
import type { Cue } from '../visual/cues';
import { Glyph, InkSplash } from '../visual/glyphs';
import { spiralPath } from '../visual/spiral';
import { TrapIcons } from './TrapIcons';
import type { TrapIcon } from './TrapIcons';

const MOOD_LABEL: Readonly<Record<string, string>> = { composed: 'Composed', agitated: 'Agitated', desperate: 'Desperate' };

const EYE_L = spiralPath(24.5, 36, 3, 4.2);
const EYE_R = spiralPath(35.5, 36, 3, 4.2);
const EYE_L_TIGHT = spiralPath(24.5, 36, 4, 4.6);
const EYE_R_TIGHT = spiralPath(35.5, 36, 4, 4.6);
const BACKDROP = spiralPath(0, 0, 9, 98);

/** The faint spiral behind the header. It turns slowly in CSS (a compositor-only rotation) and stops under reduced motion or when animations are off. */
function SpiralBackdrop() {
  return (
    <span className="spiral-wrap" aria-hidden="true">
      <svg className="spiral" viewBox="-100 -100 200 200" focusable="false">
        <path d={BACKDROP} fill="none" stroke="currentColor" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
}

/** One expression per mood index (the eyes and the mouth change); an index with no entry shows the composed face. */
function Face({ mood }: { readonly mood: number }) {
  const m = mood === 1 || mood === 2 ? mood : 0;
  const ink = { fill: 'none', stroke: 'var(--ink)' } as const;
  return (
    <svg viewBox="0 0 60 60" width="100%" height="100%" aria-hidden="true">
      <rect width="60" height="60" fill="var(--card)" />
      <path d="M14 22 18 8l6 9 6-12 6 12 6-9 4 14z" fill="var(--ink)" />
      <ellipse cx="30" cy="38" rx="13" ry="17" fill="var(--card)" stroke="var(--ink)" strokeWidth="1.5" />
      <path d={m === 0 ? EYE_L : EYE_L_TIGHT} {...ink} strokeWidth={m === 2 ? 1.1 : 0.9} />
      <path d={m === 0 ? EYE_R : EYE_R_TIGHT} {...ink} strokeWidth={m === 2 ? 1.1 : 0.9} />
      {m === 1 && <path d="M19 29l8 3M41 29l-8 3" {...ink} strokeWidth="1.4" strokeLinecap="round" />}
      {m === 2 && <path d="M18 27l9 5M42 27l-9 5M36 22l3 4-2 3 3 4" {...ink} strokeWidth="1.3" strokeLinecap="round" />}
      {m === 0 && <path d="M25 47q5 3 10 0" {...ink} strokeWidth="1.1" strokeLinecap="round" />}
      {m === 1 && <path d="M25 48q5-1 10 1" {...ink} strokeWidth="1.4" strokeLinecap="round" />}
      {m === 2 && <path d="M24 47q6 8 12 0z" fill="var(--ink)" stroke="var(--ink)" strokeWidth="1" strokeLinejoin="round" />}
      {m === 2 && <path d="M47 30q2 4 0 6-2-2 0-6z" fill="var(--card)" stroke="var(--ink)" strokeWidth="0.9" />}
      <path d="M22 50v6M38 50v6M30 52v8" stroke="var(--ink)" strokeWidth="0.7" />
    </svg>
  );
}

/** The ink life seal: heart and number, with the ink splash and the floating loss when damage lands (D-240, D-351). */
export function LifeSeal({ life, maxLife, hit }: { readonly life: number; readonly maxLife: number; readonly hit: Cue | undefined }) {
  const style = { '--b': hit?.beat ?? 0 } as CSSProperties;
  return (
    <>
      <span className="seal">
        <Glyph id="heart" size={11} filled />
        <b>{Math.max(0, life)}</b>
      </span>
      <span className="life-max">/{maxLife}</span>
      {hit !== undefined && (
        <>
          <InkSplash className="splash" style={style} />
          <span className="float cue cue-float" style={style}>
            -{hit.amount}
          </span>
        </>
      )}
    </>
  );
}

export interface CollectorHeaderProps {
  readonly life: number;
  readonly maxLife: number;
  readonly mood: number;
  readonly moodName: string | null;
  readonly moodCount: number;
  readonly intent: { readonly icon: string; readonly label: string } | null;
  /** his trap slots, as small card backs beside his life */
  readonly traps: readonly TrapIcon[];
  readonly quip: { readonly key: number; readonly text: string } | null;
  /** the Monarch's next move, announced before it happens (D-266); replaces the speech while it shows */
  readonly telegraph: TelegraphLine | null;
  readonly cues: readonly Cue[];
  readonly directGlow: boolean;
  readonly onDirect: () => void;
  readonly previewDirect: string | undefined;
  readonly onMenu: () => void;
}

/**
 * The one-row header (D-339): portrait (its ring is the mood), life, his trap icons, the intent plaque and the menu. On a wide
 * screen the same parts stand in a column and the name and the mood in words come back. The levy countdown lives in the
 * round strip.
 */
export function CollectorHeader(p: CollectorHeaderProps) {
  const damage = p.cues.find((c) => c.kind === 'damage' && c.side === 1);
  const gavel = p.cues.find((c) => c.kind === 'gavel');
  const intentCue = p.cues.find((c) => c.kind === 'intent');
  const moodWord = p.moodName === null ? null : (MOOD_LABEL[p.moodName] ?? p.moodName);
  return (
    <header className="collector">
      <SpiralBackdrop />
      <div className="portrait" data-mood={p.moodName === null ? undefined : p.mood} role="img" aria-label={moodWord === null ? 'The Monarch' : `The Monarch, ${moodWord.toLowerCase()}`} title={moodWord ?? undefined}>
        <Face mood={p.mood} />
      </div>
      {gavel !== undefined && (
        <span className="gavel-fx cue" style={{ '--b': gavel.beat } as CSSProperties}>
          <Glyph id="crown" size={34} filled />
        </span>
      )}
      <div className="collector-main">
        <div className="collector-row head">
          <h2 className="collector-name">The Monarch</h2>
          {moodWord !== null && (
            <span className="mood" data-mood={p.mood} title="Mood">
              <span className="pips" aria-hidden="true">
                {Array.from({ length: p.moodCount }, (_, i) => (
                  <i key={i} data-on={i <= p.mood ? '' : undefined} />
                ))}
              </span>
              {moodWord}
            </span>
          )}
          <button type="button" className="btn ghost menu-btn" aria-label="Menu" onClick={p.onMenu}>
            <Glyph id="menu" size={20} />
          </button>
        </div>
        <div className="collector-row body">
          <button
            type="button"
            className="life"
            data-glow={p.directGlow ? 'target' : undefined}
            onClick={p.directGlow ? p.onDirect : undefined}
            disabled={!p.directGlow}
            aria-label={`Monarch life ${p.life}${p.directGlow ? ', attack directly' : ''}`}
          >
            <LifeSeal life={p.life} maxLife={p.maxLife} hit={damage} />
            {p.directGlow && (
              <span className="life-hit">
                <Glyph id="sword" size={14} /> {p.previewDirect ?? 'Attack'}
              </span>
            )}
          </button>
          <TrapIcons traps={p.traps} side="them" />
          {p.intent !== null && (
            <span className={`plaque ${intentCue !== undefined ? 'cue cue-flash' : ''}`} style={{ '--b': intentCue?.beat ?? 0 } as CSSProperties}>
              <Glyph id={p.intent.icon} size={18} />
              {p.intent.label}
            </span>
          )}
        </div>
        <div className="statusline">
          {p.telegraph !== null ? (
            <p className="telegraph" role="status">
              <Glyph id={p.telegraph.icon} size={16} /> {p.telegraph.text}
            </p>
          ) : (
            p.quip !== null && (
              <p key={p.quip.key} className="quip" role="status">
                “{p.quip.text}”
              </p>
            )
          )}
        </div>
      </div>
    </header>
  );
}
