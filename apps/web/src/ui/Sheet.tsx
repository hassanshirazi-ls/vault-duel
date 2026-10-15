// Bottom sheet. `modal` sheets (inspect) dim the board and close on a tap outside or a swipe down; the Graft
// workbench is not modal: the board above it stays live because the player taps board cards to fill its slots.
import { useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';

const CLOSE_DRAG_PX = 70;

export function Sheet({ children, onClose, modal, label, className }: { readonly children: ReactNode; readonly onClose: () => void; readonly modal: boolean; readonly label: string; readonly className?: string }) {
  const [dy, setDy] = useState(0);
  const start = useRef<number | null>(null);
  const down = (e: PointerEvent): void => {
    start.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent): void => {
    if (start.current !== null) setDy(Math.max(0, e.clientY - start.current));
  };
  const up = (): void => {
    if (start.current === null) return;
    start.current = null;
    if (dy > CLOSE_DRAG_PX) onClose();
    setDy(0);
  };
  return (
    <div className={`sheet-layer ${modal ? 'modal' : ''}`}>
      {modal && <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />}
      <section
        className={`sheet ${className ?? ''}`}
        role={modal ? 'dialog' : 'region'}
        aria-label={label}
        style={dy > 0 ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}
      >
        <div className="sheet-grab" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <span className="sheet-handle" />
        </div>
        {children}
      </section>
    </div>
  );
}
