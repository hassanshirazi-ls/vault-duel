// How long the Monarch's speech stays above the hand (D-373). One timer is the single authority: it says when the line starts to
// fade and when it is gone, so the CSS never has its own clock (a remount cannot restart it).
export const QUIP_MS = 6000;
export const QUIP_FADE_MS = 600;
export type QuipPhase = 'fading' | 'gone';

/** Starts the clock for one quip (by identity, not by action count). Returns the cancel function. */
export function scheduleQuip(key: number, set: (key: number, phase: QuipPhase) => void): () => void {
  const fade = setTimeout(() => set(key, 'fading'), QUIP_MS - QUIP_FADE_MS);
  const gone = setTimeout(() => set(key, 'gone'), QUIP_MS);
  return () => {
    clearTimeout(fade);
    clearTimeout(gone);
  };
}
