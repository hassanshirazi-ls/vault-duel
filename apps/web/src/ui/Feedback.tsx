// The feedback link (D-257): a Tally form in a new tab, with the day's date, seed and build as hidden-field params.
// Hidden when VITE_FEEDBACK_URL is unset or not https.
import { buildFeedbackUrl, buildLabel } from '../view/feedback';
import { Glyph } from '../visual/glyphs';
import { useGame } from './context';

const SHA = typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : 'dev';

export function FeedbackLink({ plain = false }: { readonly plain?: boolean }) {
  const setup = useGame((s) => s.setup);
  const ctx = useGame((s) => s.ctx);
  if (setup === null || ctx === null) return null;
  const href = buildFeedbackUrl(import.meta.env.VITE_FEEDBACK_URL, {
    date: setup.date,
    seed: setup.seedString,
    build: buildLabel(SHA, ctx.globals.CONTENT_VERSION),
  });
  if (href === null) return null;
  return (
    <a className={plain ? 'feedback-link' : 'btn ghost feedback'} href={href} target="_blank" rel="noopener noreferrer">
      {!plain && <Glyph id="scroll" size={18} />} Send feedback
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
