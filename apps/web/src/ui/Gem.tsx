import type { ElementInfo } from '../content/load';
import { elementStyle } from '../visual/elements';
import { Glyph } from '../visual/glyphs';

/** Round gilt-ringed gem with the engraved icon: color and icon always together (D-238). */
export function Gem({ element, large = false }: { readonly element: ElementInfo | null; readonly large?: boolean }) {
  if (element === null) return null;
  return (
    <span className={large ? 'gem lg' : 'gem'} style={elementStyle(element.id)} role="img" aria-label={element.name} title={element.name}>
      <Glyph id={element.icon} size={large ? 20 : 14} />
    </span>
  );
}
