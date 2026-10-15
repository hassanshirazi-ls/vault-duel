// The shell of a full-page screen (Binder, Stats): a back plaque and an engraved title.
import type { ReactNode } from 'react';
import { Glyph } from '../visual/glyphs';

export function Page({ title, onBack, children, className }: { readonly title: string; readonly onBack: () => void; readonly children: ReactNode; readonly className?: string }) {
  return (
    <main className={`page ${className ?? ''}`}>
      <header className="page-head">
        <button type="button" className="btn ghost back" onClick={onBack} aria-label="Back">
          <Glyph id="back" size={22} />
        </button>
        <h1>{title}</h1>
      </header>
      {children}
    </main>
  );
}
