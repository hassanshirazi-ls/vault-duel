// The share text (D-247): text only. The round row comes from view/roundRow.ts (the engine has no meta share-grid yet;
// when it lands, roundRow.ts is the one file to swap). Nothing here is a rule; it only formats numbers it is given.
/** D-264 launch day, the day the daily numbering starts at #1. The only place the launch date lives. */
export const LAUNCH_DATE = '2026-10-15';

const dayStamp = (ymd: string): number => {
  const [y = 0, m = 1, d = 1] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** The daily number: LAUNCH_DATE is #1. Calendar arithmetic on the YYYY-MM-DD strings, so no time zone or DST drift. */
export const dayNumber = (date: string): number => Math.round((dayStamp(date) - dayStamp(LAUNCH_DATE)) / 86_400_000) + 1;

export interface ShareInput {
  /** the local calendar date of the duel, YYYY-MM-DD */
  readonly date: string;
  readonly won: boolean;
  readonly rounds: number;
  /** MAX_ROUNDS from the globals */
  readonly maxRounds: number;
  readonly par: number;
  readonly life: number;
  readonly stars: number;
  readonly starsMax: number;
  /** false when FLAGS.BONUS_OBJECTIVES is off: the line ends at par, with no stars (default true) */
  readonly showStars?: boolean;
  /** the emoji round row, exactly as the receipt prints it */
  readonly row: string;
  readonly url: string;
}

/** The link as shown in chat: no scheme, no trailing slash, any path kept. */
export const shortUrl = (url: string): string => url.replace(/^https?:\/\//, '').replace(/\/+$/, '');

/** The scorecard (owner's pick, D-247): `Vault Duel #6 🏆 9/12`, the round row, `❤️ 12 life · par 8 · ★★☆`, the link. */
export function shareText(i: ShareInput): string {
  const stars = '★'.repeat(i.stars) + '☆'.repeat(Math.max(0, i.starsMax - i.stars));
  return [
    `Vault Duel #${dayNumber(i.date)} ${i.won ? '🏆' : '💀'} ${i.won ? i.rounds : 'X'}/${i.maxRounds}`,
    i.row,
    `❤️ ${Math.max(0, i.life)} life · par ${i.par}${i.showStars === false ? '' : ` · ${stars}`}`,
    shortUrl(i.url),
  ].join('\n');
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export interface ShareEnv {
  readonly share?: ((data: { text: string }) => Promise<void>) | undefined;
  readonly copy?: ((text: string) => Promise<void>) | undefined;
}

/** Web Share API first, then the clipboard. A cancelled share sheet (AbortError) is not an error. */
export async function sendShare(text: string, env: ShareEnv): Promise<ShareOutcome> {
  if (env.share !== undefined) {
    try {
      await env.share({ text });
      return 'shared';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled';
      // fall through to the clipboard
    }
  }
  if (env.copy !== undefined) {
    try {
      await env.copy(text);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  return 'failed';
}

export function browserShareEnv(): ShareEnv {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return {
    share: nav !== undefined && typeof nav.share === 'function' ? (d) => nav.share(d) : undefined,
    copy: nav?.clipboard !== undefined ? (t) => nav.clipboard.writeText(t) : undefined,
  };
}
