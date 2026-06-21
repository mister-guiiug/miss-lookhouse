import { useRef } from 'react';
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

export interface LongPressHandlers {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onClick: (e: ReactMouseEvent) => void;
}

/**
 * Détecte un APPUI LONG (souris ou tactile) via Pointer Events.
 * - Au-delà de `delay` ms maintenu → déclenche `onLongPress`.
 * - Un clic court déclenche `onClick`.
 * - Un appui long neutralise le clic suivant (préviens la navigation d'un lien).
 * - Un déplacement > 10 px annule (défilement de la liste).
 */
export function useLongPress(
  onLongPress: () => void,
  onClick?: () => void,
  delay = 500
): LongPressHandlers {
  const timer = useRef<number | null>(null);
  const longFired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const cancel = (): void => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return {
    onPointerDown: e => {
      longFired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      cancel();
      timer.current = window.setTimeout(() => {
        longFired.current = true;
        onLongPress();
      }, delay);
    },
    onPointerMove: e => {
      if (!start.current) return;
      if (
        Math.abs(e.clientX - start.current.x) > 10 ||
        Math.abs(e.clientY - start.current.y) > 10
      ) {
        cancel();
      }
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onClick: e => {
      if (longFired.current) {
        // L'appui long a déjà agi → on neutralise le clic (et la navigation).
        e.preventDefault();
        e.stopPropagation();
        longFired.current = false;
        return;
      }
      onClick?.();
    },
  };
}
