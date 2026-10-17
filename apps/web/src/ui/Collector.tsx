// Collector header (D-237, D-238, D-339): portrait whose ring shows the mood, life, his trap icons, the intent plaque and a
// one-line quip that fades by itself. The 1-12 round strip, with the Appraisal countdown, lives in RoundTrack.
import type { CSSProperties } from 'react';
import type { TelegraphLine } from '../view/telegraph';
import type { Cue } from '../visual/cues';
import { Glyph, InkSplash } from '../visual/glyphs';
import { TrapIcons } from './TrapIcons';
import type { TrapIcon } from './TrapIcons';

const MOOD_LABEL: Readonly<Record<string, string>> = { composed: 'Composed', agitated: 'Agitated', desperate: 'Desperate' };

/** One expression per mood index; an index with no entry shows the composed face. */
function Face({ mood }: { readonly mood: number }) {
  const m = mood === 1 || mood === 2 ? mood : 0;
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
      <defs>
        <radialGradient id="face-glow" cx="50%" cy="40%" r="70%">
          <stop offset="0" stopColor={['#3a2d3f', '#4a2a2f', '#4b1f26'][m]} />
          <stop offset="1" stopColor="#120d12" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" fill="url(#face-glow)" />
      <path d="M8 64c2-12 12-16 24-16s22 4 24 16z" fill="#0b070c" />
      <path d="M26 48l6 8 6-8" fill="none" stroke="#c9a24a" strokeWidth="1.5" />
      <ellipse cx="32" cy="30" rx="12" ry="15" fill="#d8c9a8" />
      <path d="M17 22h30l-3-14H20z" fill="#0b070c" />
      <rect x="14" y="21" width="36" height="4" rx="2" fill="#c9a24a" />
      {/* eyes and brows: calm, narrowed, wide */}
      {m === 0 && (
        <g fill="#1a1210">
          <ellipse cx="27" cy="30" rx="1.8" ry="1.4" />
          <ellipse cx="37" cy="30" rx="1.8" ry="1.4" />
          <path d="M24 27q3-2 6 0M34 27q3-2 6 0" fill="none" stroke="#1a1210" strokeWidth="1" />
        </g>
      )}
      {m === 1 && (
        <g fill="#1a1210">
          <ellipse cx="27" cy="31" rx="1.8" ry="1.2" />
          <ellipse cx="37" cy="31" rx="1.8" ry="1.2" />
          <path d="M23 27l7 2.5M41 27l-7 2.5" fill="none" stroke="#1a1210" strokeWidth="1.4" />
        </g>
      )}
      {m === 2 && (
        <g fill="#1a1210">
          <circle cx="27" cy="31" r="2.6" fill="#fff" stroke="#1a1210" />
          <circle cx="37" cy="31" r="2.6" fill="#fff" stroke="#1a1210" />
          <circle cx="27" cy="31" r="1" />
          <circle cx="37" cy="31" r="1" />
          <path d="M23 25l7 1.5M41 25l-7 1.5" fill="none" stroke="#1a1210" strokeWidth="1.4" />
          <path d="M46 24q2 4 0 6-2-2 0-6z" fill="#7ab8ff" />
        </g>
      )}
      {/* monocle */}
      <circle cx="37" cy="30" r="5" fill="none" stroke="#c9a24a" strokeWidth="1.4" />
      <path d="M41 34q4 8 2 14" fill="none" stroke="#c9a24a" strokeWidth="0.9" />
      {m === 2 && <path d="M34 26l3 4-2 3 3 4" fill="none" stroke="#ff5a52" strokeWidth="0.9" />}
      {/* mouth */}
      {m === 0 && <path d="M28 40q4 3 8 0" fill="none" stroke="#6a3b2b" strokeWidth="1.3" strokeLinecap="round" />}
      {m === 1 && <path d="M28 41h8" fill="none" stroke="#6a3b2b" strokeWidth="1.5" strokeLinecap="round" />}
      {m === 2 && <path d="M28 43q4-5 8 0" fill="none" stroke="#6a3b2b" strokeWidth="1.5" strokeLinecap="round" />}
    </svg>
  );
}

/** The red wax life seal: heart and number, with the blood-ink splash and the floating loss when damage lands (D-240). */
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
  /** the Collector's next move, announced before it happens (D-266); replaces the quip while it shows */
  readonly telegraph: TelegraphLine | null;
  readonly cues: readonly Cue[];
  readonly directGlow: boolean;
  readonly onDirect: () => void;
  readonly previewDirect: string | undefined;
  readonly onMenu: () => void;
}

/**
 * The one-row header (D-339): portrait (its ring is the mood), life, his trap icons, the intent plaque and the menu. On a wide
 * screen the same parts stand in a column and the name and the mood in words come back. The Appraisal countdown lives in the
 * round strip.
 */
export function CollectorHeader(p: CollectorHeaderProps) {
  const damage = p.cues.find((c) => c.kind === 'damage' && c.side === 1);
  const gavel = p.cues.find((c) => c.kind === 'gavel');
  const intentCue = p.cues.find((c) => c.kind === 'intent');
  const moodWord = p.moodName === null ? null : (MOOD_LABEL[p.moodName] ?? p.moodName);
  return (
    <header className="collector">
      <div className="portrait" data-mood={p.moodName === null ? undefined : p.mood} role="img" aria-label={moodWord === null ? 'The Collector' : `The Collector, ${moodWord.toLowerCase()}`} title={moodWord ?? undefined}>
        <Face mood={p.mood} />
      </div>
      {gavel !== undefined && (
        <span className="gavel-fx cue" style={{ '--b': gavel.beat } as CSSProperties}>
          <Glyph id="gavel" size={34} filled />
        </span>
      )}
      <div className="collector-main">
        <div className="collector-row head">
          <h2 className="collector-name">The Collector</h2>
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
            aria-label={`Collector life ${p.life}${p.directGlow ? ', attack directly' : ''}`}
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
