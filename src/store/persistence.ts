/** Persistance locale versionnée (enveloppe `{ v, data }`). */
import type { AppData } from './types';

const KEY = 'miss-lookhouse-v1';
const VERSION = 1;

export function loadState(): AppData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const env = JSON.parse(raw) as { v?: number; data?: AppData };
    if (env.v !== VERSION || !env.data) return null;
    return env.data;
  } catch {
    return null;
  }
}

type SaveFailureListener = (error: unknown) => void;
const saveFailureListeners = new Set<SaveFailureListener>();

/**
 * Être prévenu qu'une sauvegarde a été REFUSÉE (stockage plein, navigation
 * privée). Rend le désabonnement. Un module sans React : c'est
 * `SaveFailureToast` qui en fait un message.
 */
export function onSaveFailure(listener: SaveFailureListener): () => void {
  saveFailureListeners.add(listener);
  return () => {
    saveFailureListeners.delete(listener);
  };
}

export function saveState(data: AppData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, data }));
  } catch (error) {
    // L'écran reste juste — c'est l'état en mémoire —, mais rien de ce qui
    // suit ne survivra à la fermeture. Le taire laissait croire le contraire.
    for (const listener of saveFailureListeners) listener(error);
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* silencieux */
  }
}
