// A card that was destroyed or taken, drawn once more in its old slot while it burns to embers or a shadow hand
// snatches it (D-240). Purely visual: it is inert and gone when the cues end.
import type { CSSProperties } from 'react';
import { ShadowHand } from '../visual/glyphs';
import { MiniCard } from './MiniCard';
import type { Ghost as GhostData } from './useStepFx';

const noop = (): void => undefined;

export function GhostCard({ ghost }: { readonly ghost: GhostData }) {
  return (
    <div className="ghost-card" data-kind={ghost.kind} style={{ '--b': ghost.beat } as CSSProperties} inert aria-hidden="true">
      <MiniCard view={ghost.view} monster={ghost.monster} side={ghost.side === 0 ? 'me' : 'them'} onTap={noop} onLong={noop} />
      {ghost.kind === 'burn' ? (
        <>
          <span className="char" />
          <span className="embers">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </>
      ) : (
        <ShadowHand className="shadow-hand" />
      )}
    </div>
  );
}
