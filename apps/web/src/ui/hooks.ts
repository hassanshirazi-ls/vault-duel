import { useRef, useSyncExternalStore } from 'react';
import type { MouseEvent } from 'react';

const LONG_MS = 450;

/** Tap runs `onTap`; holding for about half a second runs `onLong` instead (card inspect). */
export function useLongPress(onTap: () => void, onLong: () => void) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const clear = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown: (): void => {
      fired.current = false;
      clear();
      timer.current = window.setTimeout(() => {
        fired.current = true;
        timer.current = null;
        onLong();
      }, LONG_MS);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: MouseEvent): void => e.preventDefault(),
    onClick: (e: MouseEvent): void => {
      e.stopPropagation();
      if (fired.current) {
        fired.current = false;
        return;
      }
      onTap();
    },
  };
}

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The wide-landscape layout query (D-240); the same one screens.css uses for the side panels. */
export const WIDE_QUERY = '(min-width: 1024px) and (orientation: landscape)';

const canMatch = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/** True on wide landscape screens, where the Collector and ledger panels show and card inspect leaves the bottom sheet. */
export function useWide(): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (!canMatch()) return () => undefined;
      const mq = window.matchMedia(WIDE_QUERY);
      mq.addEventListener('change', notify);
      return () => mq.removeEventListener('change', notify);
    },
    () => canMatch() && window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}
