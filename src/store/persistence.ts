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

export function saveState(data: AppData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, data }));
  } catch {
    /* quota/SSR : silencieux */
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* silencieux */
  }
}
