// Card art: a placeholder generated from data (kind silhouette on an element-colored glow, under the gilt frame),
// replaced automatically by public/art/<cardId>.webp when that file exists (D-195, D-237). Adding art needs no code.
import { useState } from 'react';
import { elementStyle } from '../visual/elements';
import { Silhouette } from '../visual/glyphs';

const loaded = new Set<string>();
const missing = new Set<string>();

function ArtImage({ cardId }: { readonly cardId: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'missing'>(missing.has(cardId) ? 'missing' : loaded.has(cardId) ? 'ok' : 'idle');
  if (state === 'missing') return null;
  return (
    <img
      className="art-img"
      src={`${import.meta.env.BASE_URL}art/${encodeURIComponent(cardId)}.webp`}
      alt=""
      draggable={false}
      loading="lazy"
      decoding="async"
      data-loaded={state === 'ok' ? '' : undefined}
      onLoad={() => {
        loaded.add(cardId);
        setState('ok');
      }}
      onError={() => {
        missing.add(cardId);
        setState('missing');
      }}
    />
  );
}

export function Art({ cardId, silhouette, elementId }: { readonly cardId: string; readonly silhouette: string; readonly elementId: string | null }) {
  return (
    <div className="art" style={elementStyle(elementId)}>
      <div className="art-glow" />
      <Silhouette id={silhouette} className="art-sil" />
      <ArtImage key={cardId} cardId={cardId} />
    </div>
  );
}
