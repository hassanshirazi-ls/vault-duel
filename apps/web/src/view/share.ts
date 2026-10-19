// The share text (D-247): text only. The round row comes from view/roundRow.ts (the engine has no meta share-grid yet;
// when it lands, roundRow.ts is the one file to swap). Nothing here is a rule; it only formats numbers it is given.
export interface ShareInput {
  readonly date: string;
  readonly won: boolean;
  readonly rounds: number;
  readonly par: number;
  readonly life: number;
  readonly stars: number;
  readonly starsMax: number;
  /** the emoji round row, exactly as the receipt prints it */
  readonly row: string;
  readonly url: string;
}

export function shareText(i: ShareInput): string {
  const stars = '★'.repeat(i.stars) + '☆'.repeat(Math.max(0, i.starsMax - i.stars));
  return [
    `Vault Duel ${i.date} · ${i.won ? 'Defied' : 'Bound'}`,
    `${i.rounds} ${i.rounds === 1 ? 'round' : 'rounds'} (par ${i.par}) · Life ${Math.max(0, i.life)} · ${stars}`,
    i.row,
    i.url,
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
