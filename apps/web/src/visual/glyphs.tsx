// Engraved glyphs and kind silhouettes, keyed by the icon / silhouette ids that content carries (elements.json
// `icon`, KeywordDef `icon`, kinds.json `silhouette`). Adding one is one entry in a table; an id with no entry
// draws the plain fallback glyph (D-238), so a content edit never breaks the UI.
import type { CSSProperties, ReactNode } from 'react';

const STROKE: Readonly<Record<string, ReactNode>> = {
  // elements
  flame: <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" />,
  feather: <path d="M20 4C10 4 6 9 6 15l-2 5M6 15c6 0 11-4 14-11M9 13h6" />,
  wave: <path d="M3 9c3-3 5 3 9 0s6 3 9 0M3 15c3-3 5 3 9 0s6 3 9 0" />,
  halo: (
    <>
      <ellipse cx="12" cy="7" rx="7" ry="3" />
      <path d="M12 11v9M8 15h8" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  // keywords
  shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />,
  barrier: <path d="M4 20a8 8 0 0 1 16 0M7.5 20a4.5 4.5 0 0 1 9 0M2 20h20" />,
  pierce: <path d="M4 20 19 5M11 4h9v9" />,
  wisp: <path d="M12 3c4 4 6 7 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 2 3 2z" />,
  echo: (
    <>
      <circle cx="9.5" cy="12" r="6" />
      <circle cx="15" cy="12" r="6" strokeDasharray="2 2.5" />
    </>
  ),
  swift: <path d="M3 8h12M6 12h15M3 16h12" />,
  // flaws (a crack is drawn over these, see Glyph `cracked`)
  slow: <path d="M7 3h10M7 21h10M8 3c0 6 8 6 8 9s-8 3-8 9" />,
  vain: (
    <>
      <ellipse cx="12" cy="10" rx="6" ry="7" />
      <path d="M12 17v4M8 21h8" />
    </>
  ),
  brittle: <path d="M12 3 6 10l4 3-3 8 10-10-4-3z" />,
  tethered: <path d="M9 8a4 4 0 0 0 0 8h2M15 8a4 4 0 0 1 0 8h-2M9 12h6" />,
  covetous: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v10M9 9.5c0-2 6-2 6 0s-6 1.5-6 3.5 6 2 6 0" />
    </>
  ),
  // intents and chrome
  sword: <path d="M5 19 17 7M14 4h6v6M7 17l-3 3M6 14l4 4" />,
  scales: <path d="M12 4v16M5 8h14M5 8l-3 7h6zM19 8l-3 7h6zM8 20h8" />,
  scroll: <path d="M7 4h11v13a3 3 0 0 1-3 3H6a3 3 0 0 0 3-3V6a2 2 0 0 0-2-2zM10 9h5M10 13h5" />,
  gavel: <path d="m13 4 7 7-3 3-7-7zM10 10l-6 6 4 4 6-6M3 21h8" />,
  vault: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4v5M12 15v5M4 12h5M15 12h5" />
    </>
  ),
  heart: <path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z" />,
  swap: <path d="m7 4-4 4 4 4M3 8h14M17 20l4-4-4-4M21 16H7" />,
  check: <path d="m5 12 5 5 9-10" />,
  cross: <path d="m6 6 12 12M18 6 6 18" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  facedown: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <path d="m3 3 18 18" />
    </>
  ),
  trap: <path d="M3 18h18M5 18l3-8 4 8 4-8 3 8" />,
  spell: <path d="m12 3 2.5 6 6.5.5-5 4.5 1.5 6.5-5.5-3.5L6.5 20.5 8 14 3 9.5 9.5 9z" />,
  star: <path d="m12 3 2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17l-5.6 3 1.3-6.2L3 9.5l6.3-.7z" />,
  pos: <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />,
  deck: <path d="M7 8h11v12H7zM4 5h11M4 5v12" />,
  tomb: <path d="M7 21V10a5 5 0 0 1 10 0v11zM12 10v6M9.5 12.5h5M4 21h16" />,
};

const FALLBACK: ReactNode = <path d="M12 4 20 12 12 20 4 12z" />;

/** True when the id has an engraved glyph; unknown ids draw the plain fallback. */
export const hasGlyph = (id: string): boolean => Object.hasOwn(STROKE, id);

interface GlyphProps {
  readonly id: string;
  readonly size?: number;
  /** a red crack over the glyph: how Flaws are marked (D-238) */
  readonly cracked?: boolean;
  readonly filled?: boolean;
  readonly className?: string;
}

export function Glyph({ id, size = 18, cracked = false, filled = false, className }: GlyphProps) {
  const body = hasGlyph(id) ? STROKE[id] : FALLBACK;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {body}
      {cracked && <path className="crack" d="M14 2.5 11 9l4 2-3 6 2 5" stroke="var(--flaw)" strokeWidth="2" fill="none" />}
    </svg>
  );
}

const SILHOUETTES: Readonly<Record<string, ReactNode>> = {
  quadruped: (
    <>
      <path d="M14 58c0-11 9-18 24-18h20c7 0 12 2 16 7l9-7v15l-7 5v18h-9V66h-8v16h-9V66H40v16h-9V66h-7c-6 0-10-3-10-8z" />
      <path d="M72 40 76 28l6 10zM84 40l4-12 4 12z" />
      <path d="M14 58c-6-2-10-8-8-16 5 5 9 7 14 8z" />
    </>
  ),
  'armored-humanoid': (
    <>
      <circle cx="50" cy="24" r="10" />
      <path d="M50 10v6M38 38h24l6 26-6 20H38l-6-20z" />
      <path d="M26 44h12v26a10 10 0 0 1-12-8zM66 36h4v38h-4z" />
      <path d="M62 34l8-14 4 4z" />
    </>
  ),
  serpent: (
    <>
      <path d="M14 82c24 4 30-14 18-22s-6-24 18-24 22-12 34-16" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
      <path d="M78 18 94 12 88 28 78 30z" />
    </>
  ),
  golem: (
    <>
      <rect x="34" y="12" width="32" height="24" rx="3" />
      <rect x="24" y="40" width="52" height="34" rx="4" />
      <rect x="10" y="42" width="14" height="30" rx="3" />
      <rect x="76" y="42" width="14" height="30" rx="3" />
      <rect x="30" y="76" width="14" height="14" rx="2" />
      <rect x="56" y="76" width="14" height="14" rx="2" />
    </>
  ),
  wisp: (
    <>
      <path d="M50 8c12 14 24 26 24 44a24 24 0 0 1-48 0c0-12 8-20 14-28 2 8 6 10 10 10-2-8-2-16 0-26z" />
      <path d="M30 80c-6 6-14 8-20 8 8 0 14 4 20 4zM70 80c6 6 14 8 20 8-8 0-14 4-20 4z" />
    </>
  ),
  chimera: (
    <>
      <path d="M10 56c6-14 16-22 30-24l-6-14 14 8 8-8 4 12c12 2 22 10 30 24-8-2-14-2-20 2l-10 24-8-14-10 14-8-22c-6-4-14-4-24-2z" />
      <path d="M44 26 40 10l12 10zM60 26l6-14 2 16z" />
    </>
  ),
  spell: <path d="M30 14h46v58a14 14 0 0 1-14 14H22a14 14 0 0 0 14-14V28a14 14 0 0 0-6-14zM44 34h24v6H44zM44 48h24v6H44z" />,
  trap: <path d="M8 76h84v8H8zM14 76l14-36 22 36 22-36 14 36z" />,
};

export function Silhouette({ id, className }: { readonly id: string; readonly className?: string }) {
  const body = Object.hasOwn(SILHOUETTES, id) ? SILHOUETTES[id] : SILHOUETTES['chimera'];
  return (
    <svg className={className} viewBox="0 0 100 100" fill="currentColor" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">
      {body}
    </svg>
  );
}

/** A blood-ink blot, drawn over the life seal when damage lands (D-240). */
export function InkSplash({ className, style }: { readonly className?: string; readonly style?: CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 100 100" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M50 14c5 8 6 14 12 12 8-4 14-12 18-6s-4 12 0 18 14 4 12 12-12 8-12 14 8 14 2 20-12-4-18 2-4 16-12 14-8-12-14-14-16 6-20-2 6-14 4-20-14-8-12-16 12-6 16-10-2-14 4-18 10 6 14 4 6-8 8-14z" />
      <circle cx="14" cy="22" r="4" />
      <circle cx="88" cy="78" r="5" />
      <circle cx="82" cy="12" r="3" />
      <circle cx="10" cy="80" r="3.5" />
    </svg>
  );
}

/** The shadow hand that takes a card on an Appraisal (D-240). Dark with a violet rim, drawn from the top. */
export function ShadowHand({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 120" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M32 0h36v38c6-4 12-2 12 4l-4 14c8 0 10 6 8 12l-6 22c-2 8-12 14-24 14H40c-12 0-20-8-22-18L12 56c-2-6 2-10 8-8l6 8V0z" />
      <path d="M26 56l-4 56 8-8 4-52zM44 62l-2 54 8-6 2-50zM60 60l2 48 8-8-2-44z" opacity="0.5" />
      <path d="M26 38 18 68 12 62zM74 40l8 22-8 4z" />
    </svg>
  );
}
