/**
 * SE DÉCONNECTER AVEC DES ÉCRITURES EN ATTENTE — ce que ces tests tiennent.
 *
 * La purge à la déconnexion est voulue (appareil partagé, RGPD) : la file vit
 * sur l'appareil, pas dans le compte. Mais le bouton la jetait sans un mot —
 * des gestes que la personne croit enregistrés. Trois promesses :
 *
 *   1. file vide : le bouton déconnecte, sans question inutile ;
 *   2. file non vide : il COMPTE, il demande, et ne part pas sans accord ;
 *   3. accord donné : la file est vidée, puis la session fermée.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../backend/config', () => ({
  BACKEND: 'supabase',
  IS_SUPABASE: true,
  IS_LOCAL: false,
}));

const signOut = vi.fn(() => Promise.resolve());
vi.mock('@mister-guiiug/dev-pwa-config/react/auth-provider', () => ({
  useAuthContext: () => ({
    user: { id: 'u1', email: 'famille@exemple.fr' },
    signOut,
  }),
}));

// Les cartes voisines parlent au serveur : hors sujet ici.
vi.mock('./PushToggle', () => ({ PushToggle: () => null }));
vi.mock('./EmailToggle', () => ({ EmailToggle: () => null }));
vi.mock('./EmbeddingToggle', () => ({ EmbeddingToggle: () => null }));
vi.mock('./DangerZone', () => ({ DangerZone: () => null }));

const { SettingsScreen } = await import('./SettingsScreen');

const QUEUE_KEY = 'miss-lookhouse-syncq-v1';
const DEAD_KEY = 'miss-lookhouse-syncq-dead-v1';

function entree(id: string) {
  return {
    id,
    payload: { kind: 'setNotificationRead', id, readAt: null },
    key: `setNotificationRead:${id}`,
    attempts: 0,
    enqueuedAt: '2026-11-05T08:00:00.000Z',
  };
}

function monter() {
  render(
    <MemoryRouter initialEntries={['/reglages']}>
      <SettingsScreen />
    </MemoryRouter>
  );
}

const bouton = () => screen.getByRole('button', { name: /Se déconnecter/ });
const boite = () => screen.queryByRole('alertdialog');
const confirmer = () =>
  document.querySelector<HTMLButtonElement>('[data-dwc="confirm-confirm"]')!;
const annuler = () =>
  document.querySelector<HTMLButtonElement>('[data-dwc="confirm-cancel"]')!;
const lire = (key: string) =>
  (JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[]).length;

beforeEach(() => {
  localStorage.clear();
  signOut.mockClear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('Réglages — se déconnecter', () => {
  it('file vide : déconnecte sans rien demander', () => {
    monter();
    fireEvent.click(bouton());

    expect(boite()).toBeNull();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('écritures en attente (et refusées) : compte, demande, ne part pas sans accord', async () => {
    localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify([entree('n1'), entree('n2')])
    );
    localStorage.setItem(DEAD_KEY, JSON.stringify([entree('n3')]));
    monter();

    fireEvent.click(bouton());

    expect(boite()).toHaveTextContent(/3 modification\(s\)/);
    expect(signOut).not.toHaveBeenCalled();

    fireEvent.click(annuler());

    await waitFor(() => expect(boite()).toBeNull());
    expect(signOut).not.toHaveBeenCalled();
    expect(lire(QUEUE_KEY)).toBe(2);
    expect(lire(DEAD_KEY)).toBe(1);
  });

  it('accord donné : la file est vidée, puis la session fermée', () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([entree('n1')]));
    monter();

    fireEvent.click(bouton());
    fireEvent.click(confirmer());

    expect(lire(QUEUE_KEY)).toBe(0);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
