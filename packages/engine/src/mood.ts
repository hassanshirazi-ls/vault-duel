// Mood from the Collector's life (D-080). Thresholds are globals; FLAGS.MOODS = false pins Composed.
import type { Globals } from './types/globals';
import type { Mood } from './types/state';

export function moodOf(life: number, g: Pick<Globals, 'MOOD_AGITATED_AT' | 'MOOD_DESPERATE_AT' | 'FLAGS'>): Mood {
  if (!g.FLAGS.MOODS) return 0;
  if (life > g.MOOD_AGITATED_AT) return 0;
  if (life > g.MOOD_DESPERATE_AT) return 1;
  return 2;
}
