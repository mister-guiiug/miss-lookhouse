/**
 * RETIRER SON CONSENTEMENT — ce que ces tests tiennent.
 *
 * L'article 7.3 du RGPD veut que retirer son consentement soit aussi simple
 * que le donner. Au relevé du 29/09/2026, une fois le bandeau répondu, plus
 * rien dans l'app ne permettait de revenir sur son choix. Deux promesses :
 *
 *   1. le retrait se fait depuis les Réglages, en UN clic, et il parvient
 *      jusqu'à la bibliothèque de mesure — pas seulement au libellé ;
 *   2. sans clé de mesure, la carte « Mes données (RGPD) » reste celle
 *      d'avant : aucun intertitre orphelin.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  isAnalyticsLoaded,
  resetAnalytics,
} from '@mister-guiiug/dev-pwa-config/analytics';
import {
  readConsentChoice,
  writeConsentChoice,
} from '@mister-guiiug/dev-pwa-config/react/consent-banner';
import { CLE_DE_TEST } from '@mister-guiiug/dev-pwa-config/testing/posthog';

// L'accord rejoué au montage charge la bibliothèque : la vraie partirait
// interroger PostHog depuis jsdom. Le double du socle se souvient du retrait.
vi.mock('posthog-js/dist/module.slim.js', async () => {
  const { fauxPosthog } =
    await import('@mister-guiiug/dev-pwa-config/testing/posthog');
  return { default: fauxPosthog() };
});

// Le mode local, celui de la démo : pas de compte, donc ni connecteurs ni zone
// dangereuse — l'écran le plus court qui porte la carte « Mes données ».
vi.mock('../../backend/config', () => ({
  BACKEND: 'local',
  IS_SUPABASE: false,
  IS_LOCAL: true,
}));

vi.mock('@mister-guiiug/dev-pwa-config/react/auth-provider', () => ({
  useAuthContext: () => ({ user: null, signOut: vi.fn() }),
}));

const { SettingsScreen } = await import('./SettingsScreen');

function monter() {
  render(
    <MemoryRouter initialEntries={['/reglages']}>
      <SettingsScreen />
    </MemoryRouter>
  );
}

beforeEach(() => {
  // Le setup partagé ne vide pas le stockage : un choix laissé par un test
  // serait relu par le suivant.
  localStorage.clear();
  vi.stubEnv('VITE_POSTHOG_KEY', CLE_DE_TEST);
  // L'état de la mesure est celui d'un module : sans remise à zéro, la
  // bibliothèque resterait « chargée » d'un test à l'autre.
  resetAnalytics();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('Réglages — mesure d’audience', () => {
  it('les réglages permettent de retirer son consentement, en un clic', async () => {
    writeConsentChoice('granted');
    monter();

    const titre = await screen.findByRole('heading', {
      name: 'Mesure d’audience',
    });
    const section = titre.closest('section') as HTMLElement;
    expect(within(section).getByRole('status')).toHaveTextContent(
      'Vous avez accepté cette mesure.'
    );
    // L'accord rejoué au montage a chargé la bibliothèque — le double.
    await waitFor(() => expect(isAnalyticsLoaded()).toBe(true));
    const posthog = (await import('posthog-js/dist/module.slim.js')).default;
    expect(posthog.has_opted_out_capturing()).toBe(false);

    fireEvent.click(
      within(section).getByRole('button', {
        name: 'Retirer mon consentement',
      })
    );

    expect(readConsentChoice()).toBe('denied');
    // Le clic est PARVENU à la bibliothèque, pas seulement au libellé.
    expect(posthog.has_opted_out_capturing()).toBe(true);
    expect(within(section).getByRole('status')).toHaveTextContent(
      'Vous avez refusé cette mesure.'
    );
  });

  it('sans clé de mesure, la carte « Mes données » reste celle d’avant', async () => {
    // Le cas d'un clone local ou d'une préversion : rien à mesurer.
    vi.stubEnv('VITE_POSTHOG_KEY', '');
    writeConsentChoice('granted');
    monter();

    expect(
      await screen.findByRole('heading', { name: 'Mes données (RGPD)' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Mesure d’audience' })
    ).not.toBeInTheDocument();
  });
});
