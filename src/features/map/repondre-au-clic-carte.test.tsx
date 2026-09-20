import { describe, expect, it, vi, beforeEach } from 'vitest';
import { lazy, Suspense, type ComponentType } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MapLink } from './MapLink';

/**
 * LE DÉFAUT QUE CES TESTS VERROUILLENT : le seul chemin vers la carte
 * répondait dans le vide.
 *
 * `App.tsx` pose bien un « Chargement de la carte… » sur la route `/carte`,
 * mais ce repli ne peut PAS paraître sur un clic : `HashRouter` enveloppe tout
 * changement d'URL dans `startTransition`, et React 19 garde alors
 * délibérément l'écran déjà affiché plutôt que de le remplacer par un repli.
 * Il ne se montre donc que sur un atterrissage direct sur `#/carte`.
 *
 * Et il y avait vraiment de quoi attendre : ouvrir la carte demande
 * `MapScreen` (1,5 ko compressés) ET **Leaflet, 43 ko**, tous deux réclamés à
 * l'instant du clic. De l'ordre de la seconde sur un téléphone, sans qu'un
 * pixel ne bouge.
 *
 * Ces tests tiennent le contrat, pas la mise en forme : l'intention précharge,
 * et le clic se voit.
 */

const carte = vi.hoisted(() => ({ charge: vi.fn() }));

vi.mock('./lazyMapScreen', () => ({
  chargeMapScreen: carte.charge,
  MapScreen: () => null,
}));

/** Monte le lien face à une carte dont le test décide lui-même de l'arrivée. */
function monterFaceAUneCarteLente() {
  let livre!: () => void;
  const CarteLente = lazy(
    () =>
      new Promise<{ default: ComponentType }>(resolve => {
        livre = () => resolve({ default: () => <p>la carte est là</p> });
      })
  );

  render(
    <MemoryRouter initialEntries={['/']}>
      {/* HORS des routes : le lien doit rester monté pendant la navigation,
          sinon on ne pourrait pas observer son état d'attente. */}
      <MapLink />
      <Suspense fallback={<p>repli</p>}>
        <Routes>
          <Route path="/" element={<p>tableau de bord</p>} />
          <Route path="/carte" element={<CarteLente />} />
        </Routes>
      </Suspense>
    </MemoryRouter>
  );

  return {
    lien: screen.getByRole('link', { name: /carte/i }),
    livreLaCarte: async () => {
      await act(async () => {
        livre();
      });
    },
  };
}

beforeEach(() => {
  cleanup();
  carte.charge.mockReset();
  // Un thunk qui ne se résout jamais : le préchargement ne doit RIEN changer
  // à ce qui est affiché, et surtout pas naviguer.
  carte.charge.mockImplementation(() => new Promise(() => {}));
});

describe('le lien vers la carte répond avant que la carte soit là', () => {
  it("précharge dès l'intention, sans naviguer", () => {
    const { lien } = monterFaceAUneCarteLente();

    fireEvent.pointerEnter(lien);

    expect(carte.charge).toHaveBeenCalledTimes(1);
    // Survoler n'est pas décider : on est toujours sur le tableau de bord.
    expect(screen.getByText('tableau de bord')).toBeTruthy();
    expect(lien).not.toHaveAttribute('aria-busy');
  });

  it('précharge aussi au clavier et au doigt posé', () => {
    const { lien } = monterFaceAUneCarteLente();

    // Tabuler jusqu'au bouton donne la même avance qu'un survol — sans quoi
    // seuls les visiteurs à la souris en profiteraient.
    fireEvent.focus(lien);
    expect(carte.charge).toHaveBeenCalledTimes(1);

    // Et sur un écran tactile, où rien ne survole, `pointerdown` précède le
    // clic de quelques dizaines de millisecondes.
    fireEvent.pointerDown(lien);
    expect(carte.charge).toHaveBeenCalledTimes(2);
  });

  it("dit qu'il charge tant que la carte n'est pas arrivée", async () => {
    const { lien, livreLaCarte } = monterFaceAUneCarteLente();

    fireEvent.click(lien);

    // LE CŒUR DU DÉFAUT : ici, avant, il ne se passait rigoureusement rien.
    expect(lien).toHaveAttribute('aria-busy', 'true');
    expect(lien.textContent).toContain('Chargement de la carte…');
    expect(screen.queryByText('la carte est là')).toBeNull();

    await livreLaCarte();

    expect(screen.getByText('la carte est là')).toBeTruthy();
    expect(lien).not.toHaveAttribute('aria-busy');
    expect(lien.textContent).toContain('Voir la carte');
  });

  it('laisse le navigateur ouvrir un nouvel onglet sur Ctrl+clic', () => {
    const { lien } = monterFaceAUneCarteLente();

    // On intercepte le clic pour piloter la transition ; il ne faut pas pour
    // autant confisquer les gestes du navigateur. On lit le verdict en fin de
    // propagation, puis on coupe la navigation : jsdom ne sait pas changer de
    // document et l'annoncerait par un « Not implemented ».
    let defautConfisque: boolean | undefined;
    const garde = (e: Event) => {
      defautConfisque = e.defaultPrevented;
      e.preventDefault();
    };
    document.addEventListener('click', garde);
    fireEvent.click(lien, { ctrlKey: true });
    document.removeEventListener('click', garde);

    expect(defautConfisque).toBe(false);
    expect(lien).not.toHaveAttribute('aria-busy');
    expect(screen.getByText('tableau de bord')).toBeTruthy();
  });
});
