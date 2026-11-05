/**
 * UNE SAUVEGARDE REFUSÉE SE DIT — ce que ces tests tiennent.
 *
 * `saveState` avalait toute erreur : stockage plein (quota), stockage refusé
 * (navigation privée). L'écran restait juste, mais rien ne survivait à la
 * fermeture — et rien ne le disait. Deux promesses :
 *
 *   1. un refus du stockage s'affiche, une seule fois même s'il se répète ;
 *   2. une écriture qui réussit ne dit rien.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { SaveFailureToast } from '../components/SaveFailureToast';
import { saveState } from './persistence';
import type { AppData } from './types';

const DONNEES: AppData = {
  searches: [],
  listings: [],
  notifications: [],
  similarities: [],
  statuses: {},
  notes: {},
  verifications: {},
};

function monter() {
  render(
    <ToastProvider>
      <SaveFailureToast />
    </ToastProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('sauvegarde locale refusée', () => {
  it('stockage plein : le message paraît, une seule fois', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota dépassé', 'QuotaExceededError');
    });
    monter();

    act(() => {
      saveState(DONNEES);
      saveState(DONNEES);
    });

    expect(
      await screen.findAllByText(/Stockage de l’appareil plein/)
    ).toHaveLength(1);
  });

  it('écriture réussie : rien à dire', () => {
    monter();

    act(() => saveState(DONNEES));

    expect(screen.queryByText(/Stockage de l’appareil plein/)).toBeNull();
    expect(localStorage.getItem('miss-lookhouse-v1')).not.toBeNull();
  });
});
