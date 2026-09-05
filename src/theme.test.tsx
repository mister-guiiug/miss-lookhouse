/**
 * Tests d'USAGE du thème après l'adoption du socle.
 *
 * Ce qui se joue ici n'est pas la mécanique de `useTheme` — elle est éprouvée
 * chez le socle — mais les deux promesses faites à l'utilisateur de CETTE app :
 *
 *   1. sa préférence enregistrée sous l'ancienne clé `lh_theme` survit ;
 *   2. la bascule de l'en-tête et le sélecteur des Réglages montrent le MÊME
 *      thème. C'est exactement ce qui divergeait quand la bascule lisait le
 *      store zustand et le socle son propre stockage.
 */
// `?raw` plutôt que `node:fs` : le tsconfig de l'app est celui d'un navigateur,
// et Vite sait déjà lire ce fichier.
import indexHtml from '../index.html?raw';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ThemeProvider,
  useThemeContext,
} from '@mister-guiiug/dev-pwa-config/react/theme-provider';
import { ThemeToggle } from '@mister-guiiug/dev-pwa-config/react/theme-toggle';
import { THEME_COLOR, THEME_LEGACY_KEYS, THEME_STORAGE_KEY } from './theme';

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

/** Un témoin qui lit l'état PARTAGÉ, comme le fait l'écran Réglages. */
function ThemeWitness() {
  const state = useThemeContext();
  return (
    <span data-testid="witness">{state?.theme ?? 'hors-fournisseur'}</span>
  );
}

function renderThemeUi() {
  return render(
    <ThemeProvider
      storageKey={THEME_STORAGE_KEY}
      legacyKeys={THEME_LEGACY_KEYS}
      themeColor={THEME_COLOR}
    >
      <ThemeToggle className="btn" />
      <ThemeWitness />
    </ThemeProvider>
  );
}

describe('migration du thème vers le socle', () => {
  it('reprend la préférence enregistrée sous l’ancienne clé « lh_theme »', () => {
    localStorage.setItem('lh_theme', 'dark');
    renderThemeUi();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByTestId('witness')).toHaveTextContent('dark');
    // Réécrite sous la clé famille : la migration n'a lieu qu'une fois.
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('la clé famille l’emporte sur l’ancienne', () => {
    localStorage.setItem('lh_theme', 'dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    renderThemeUi();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('la bascule et le sélecteur des Réglages ne divergent pas', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    renderThemeUi();
    expect(screen.getByTestId('witness')).toHaveTextContent('light');

    await userEvent.click(screen.getByRole('button'));

    // Un SEUL état : le témoin bouge en même temps que la bascule.
    expect(screen.getByTestId('witness')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('pose une balise theme-color qui suit le schéma affiché', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    renderThemeUi();

    const meta = document.head.querySelector('meta[data-dwc="theme-color"]');
    expect(meta?.getAttribute('content')).toBe(THEME_COLOR.dark);
  });
});

describe('script anti-FOUC d’index.html', () => {
  it('lit les mêmes clés que ThemeProvider, la famille d’abord', () => {
    // Un désaccord ne casse aucun build : il affiche le premier écran dans le
    // mauvais thème, puis bascule. D'où ce test. On lit le CODE du script, pas
    // les commentaires alentour, qui citent eux aussi les deux clés.
    const script = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1] ?? '';
    const family = script.indexOf(THEME_STORAGE_KEY);
    const legacy = script.indexOf(THEME_LEGACY_KEYS[0] as string);
    expect(family).toBeGreaterThan(-1);
    expect(legacy).toBeGreaterThan(-1);
    expect(family).toBeLessThan(legacy);
  });
});
