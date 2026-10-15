// The feedback link (D-257). The form URL comes from the build-time variable VITE_FEEDBACK_URL; only an https URL is
// used, anything else hides the link. The form reads `date`, `seed` and `build` as hidden fields of the same names.

export interface FeedbackParams {
  readonly date: string;
  /** the day's seed string (setup.seedString) */
  readonly seed: string;
  /** `<short sha>+<CONTENT_VERSION>` */
  readonly build: string;
}

/** The link target, or null when the base is unset, malformed or not https. Query params already on the base are kept. */
export function buildFeedbackUrl(base: string | undefined, params: FeedbackParams): string | null {
  if (base === undefined || base.trim() === '') return null;
  let url: URL;
  try {
    url = new URL(base.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  url.searchParams.set('date', params.date);
  url.searchParams.set('seed', params.seed);
  url.searchParams.set('build', params.build);
  return url.toString();
}

export const buildLabel = (sha: string, contentVersion: string): string => `${sha}+${contentVersion}`;
