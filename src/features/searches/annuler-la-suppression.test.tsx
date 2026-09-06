/**
 * ANNULER PLUTÔT QUE CONFIRMER — ce que ces tests tiennent.
 *
 * Une `LocalSearch` porte dix-sept champs, dont un polygone, deux listes de
 * mots-clés et trois fourchettes. La perdre par erreur coûtait une ressaisie
 * complète ; la protéger coûtait une boîte « êtes-vous sûr ? » à chaque
 * suppression, y compris les voulues. On a échangé la seconde contre huit
 * secondes de sursis.
 *
 * Le piège de ce genre de fonctionnalité est de RECONSTITUER la recherche à
 * l'annulation (nouvel objet, champs recopiés, un oubli au passage). Le
 * premier test compare donc l'objet rendu à l'objet de départ, `toEqual` sur
 * la structure entière — pas trois champs choisis à la main.
 *
 * Le second piège est en mode compte : enfiler la suppression tout de suite,
 * puis « la retirer de la file » à l'annulation, ne marche que si la file n'a
 * pas encore drainé — or en ligne elle draine en quelques millisecondes.
 * Les tests de file montent un transport qui ÉCHOUE : toute intention enfilée
 * y RESTE. Si l'annulation en laissait une, ils la verraient.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import {
  UNDO_DELETE_MS,
  useAppStore,
  visibleSearches,
} from '../../store/useAppStore';
import { loadState } from '../../store/persistence';
import type { AppData, LocalSearch } from '../../store/types';
import { onSync } from '../../backend/syncBus';
import {
  clearPersistedQueues,
  createIntentQueue,
  type IntentQueue,
} from '../../backend/syncQueue';
import { DashboardScreen } from '../dashboard/DashboardScreen';
import { ImportScreen } from '../import/ImportScreen';
import { SearchesScreen } from './SearchesScreen';
import { UndoDeleteToasts } from './UndoDeleteToasts';

const QUEUE_KEY = 'miss-lookhouse-syncq-v1';

/** Tous les critères remplis : c'est l'objet qu'on veut retrouver INTACT. */
const RECHERCHE: LocalSearch = {
  id: 'srch_1',
  name: 'Maison Clermont-Ferrand',
  sourceIds: ['import_generique', 'leboncoin'],
  city: 'Clermont-Ferrand',
  postalCode: '63000',
  centerLat: 45.7772,
  centerLng: 3.087,
  radiusKm: 12,
  polygon: [
    [3.05, 45.75],
    [3.12, 45.75],
    [3.12, 45.81],
  ],
  priceMin: 150000,
  priceMax: 320000,
  surfaceMin: 80,
  surfaceMax: 160,
  roomsMin: 4,
  roomsMax: 7,
  propertyTypes: ['maison', 'villa'],
  keywordsRequired: ['jardin', 'garage'],
  keywordsExcluded: ['travaux', 'viager'],
  frequency: 'hourly',
  active: true,
  lastRunAt: '2026-09-01T08:00:00.000Z',
};

function emptyData(searches: LocalSearch[]): AppData {
  return {
    searches,
    listings: [],
    notifications: [],
    similarities: [],
    statuses: {},
    notes: {},
    verifications: {},
  };
}

function seed(searches: LocalSearch[] = [RECHERCHE]) {
  useAppStore.setState({
    ready: true,
    pendingDeletions: [],
    data: emptyData(searches),
  });
}

/**
 * Ce que les écrans affichent. On passe par la fonction que les écrans
 * emploient VRAIMENT : réécrire le filtre ici en ferait une seconde vérité,
 * qui resterait verte le jour où la première dérive.
 */
function visibles(): LocalSearch[] {
  const { data, pendingDeletions } = useAppStore.getState();
  return visibleSearches(data.searches, pendingDeletions);
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  // Toute minuterie encore armée est levée avant de rendre les vraies.
  act(() => {
    vi.runOnlyPendingTimers();
  });
  vi.useRealTimers();
  useAppStore.setState({ pendingDeletions: [], data: emptyData([]) });
  localStorage.clear();
});

describe('la suppression d’une recherche est rattrapable', () => {
  it('supprimer puis annuler : elle est là, avec TOUS ses critères', () => {
    seed();
    const { deleteSearch, undoDeleteSearch } = useAppStore.getState();

    deleteSearch('srch_1');
    // Elle a disparu des écrans tout de suite — le geste a l'air fait.
    expect(visibles()).toEqual([]);

    vi.advanceTimersByTime(UNDO_DELETE_MS - 1);
    undoDeleteSearch('srch_1');
    // Et le délai qui filait n'emporte plus rien.
    vi.advanceTimersByTime(60_000);

    // `toEqual` sur l'objet ENTIER : polygone, fourchettes, mots-clés,
    // fréquence, dernier passage. Un champ reconstitué de travers serait vu.
    expect(visibles()).toEqual([RECHERCHE]);
  });

  it('supprimer et laisser filer : elle n’y est plus, ici comme sur le disque', () => {
    seed();
    useAppStore.getState().deleteSearch('srch_1');

    vi.advanceTimersByTime(UNDO_DELETE_MS - 1);
    // Une milliseconde avant l'échéance, rien n'est encore perdu.
    expect(useAppStore.getState().data.searches).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(useAppStore.getState().data.searches).toEqual([]);
    expect(useAppStore.getState().pendingDeletions).toEqual([]);
    // Persistée, pas seulement en mémoire : un rechargement ne la ramène pas.
    expect(loadState()?.searches).toEqual([]);
  });

  it('rien n’est écrit sur le disque tant que le délai court', () => {
    seed();
    useAppStore.getState().deleteSearch('srch_1');
    vi.advanceTimersByTime(UNDO_DELETE_MS - 1);

    // Le sursis n'est pas persisté : une session interrompue ici laisse la
    // recherche intacte. La panne va du bon côté.
    expect(loadState()).toBeNull();
  });

  it('supprimer deux fois de suite ne double pas le sursis', () => {
    seed();
    const { deleteSearch } = useAppStore.getState();
    deleteSearch('srch_1');
    deleteSearch('srch_1');
    expect(useAppStore.getState().pendingDeletions).toEqual(['srch_1']);
  });

  it('une hydratation pendant le sursis ANNULE la suppression', () => {
    seed();
    useAppStore.getState().deleteSearch('srch_1');

    // Le pull de connexion (`SupabaseSync`) remplace tout le jeu de données.
    // Les identifiants en sursis appartiennent au jeu PRÉCÉDENT : les garder
    // masquerait une recherche du serveur, ou déclencherait un commit sans
    // objet. On repart de zéro — et la panne va du bon côté, elle RÉTABLIT.
    useAppStore.getState().hydrate(emptyData([RECHERCHE]));
    expect(useAppStore.getState().pendingDeletions).toEqual([]);

    // Et la minuterie du jeu précédent n'emporte rien au passage.
    vi.advanceTimersByTime(60_000);
    expect(useAppStore.getState().data.searches).toEqual([RECHERCHE]);
  });
});

describe('en mode compte, la file d’écritures en attente', () => {
  let queue: IntentQueue;
  let off: () => void;

  beforeEach(() => {
    clearPersistedQueues();
    // Le transport ÉCHOUE : ce qui est enfilé y reste, et se voit.
    queue = createIntentQueue({
      process: () => Promise.reject(new Error('hors ligne')),
    });
    off = onSync(intent => {
      queue.enqueue(intent);
      void queue.flush();
    });
  });

  afterEach(() => {
    off();
    queue.stop();
    clearPersistedQueues();
  });

  it('annuler avant le rejeu ne laisse RIEN dans la file', () => {
    seed();
    const { deleteSearch, undoDeleteSearch } = useAppStore.getState();

    deleteSearch('srch_1');
    // Pas de mutation enfilée pendant le sursis : il n'y en aura donc pas à
    // retirer, et surtout pas de mutation CONTRAIRE à empiler ensuite.
    expect(queue.pending()).toBe(0);

    undoDeleteSearch('srch_1');
    vi.advanceTimersByTime(60_000);

    expect(queue.pending()).toBe(0);
    expect(queue.deadLetters()).toEqual([]);
    expect(localStorage.getItem(QUEUE_KEY)).toBe('[]');
  });

  it('… et laisser filer enfile EXACTEMENT une suppression', () => {
    seed();
    useAppStore.getState().deleteSearch('srch_1');

    vi.advanceTimersByTime(UNDO_DELETE_MS);

    expect(queue.pending()).toBe(1);
    expect(queue.list()[0]?.payload).toEqual({
      kind: 'deleteSearch',
      id: 'srch_1',
    });
  });
});

describe('à l’écran : le geste, puis le rattrapage', () => {
  function renderScreen() {
    return render(
      <ToastProvider>
        <UndoDeleteToasts />
        <MemoryRouter>
          <SearchesScreen />
        </MemoryRouter>
      </ToastProvider>
    );
  }

  const deleteButton = () =>
    screen.getByRole('button', {
      name: 'Supprimer la recherche « Maison Clermont-Ferrand »',
    });

  it('supprime sans rien demander, puis propose d’annuler', () => {
    seed();
    renderScreen();

    fireEvent.click(deleteButton());

    // Aucune boîte de confirmation : l'annulation la REMPLACE.
    expect(screen.queryByText('Maison Clermont-Ferrand')).toBeNull();
    expect(
      screen.getByText(
        'Aucune recherche. Créez-en une pour définir votre veille.'
      )
    ).toBeTruthy();

    const annuler = screen.getByRole('button', { name: 'Annuler' });
    fireEvent.click(annuler);

    expect(screen.getByText('Maison Clermont-Ferrand')).toBeTruthy();
    // Le message s'en va avec la suppression qu'il proposait d'annuler.
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
  });

  it('le message tient TOUT le sursis, et annule encore à la fin', () => {
    seed();
    renderScreen();

    fireEvent.click(deleteButton());

    // Le socle sait effacer un message tout seul (5 s par défaut) et suspend sa
    // minuterie au survol — bon pour un message, ruineux pour un délai de
    // grâce : le store, lui, ne se met pas en pause. D'où `duration: 0`. Sans
    // lui, le « Annuler » s'en irait AVANT la suppression qu'il annule, et
    // l'utilisateur regarderait sa recherche disparaître sans recours.
    act(() => {
      vi.advanceTimersByTime(UNDO_DELETE_MS - 1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByText('Maison Clermont-Ferrand')).toBeTruthy();
  });

  it('deux recherches : seule celle qu’on supprime s’en va', () => {
    const autre: LocalSearch = { ...RECHERCHE, id: 'srch_2', name: 'Riom T3' };
    seed([RECHERCHE, autre]);
    renderScreen();

    fireEvent.click(deleteButton());

    // La LISTE reste affichée (ce n'est pas l'état vide qui masque) : c'est
    // bien la ligne supprimée, et elle seule, qui a disparu.
    expect(screen.queryByText('Maison Clermont-Ferrand')).toBeNull();
    expect(screen.getByText('Riom T3')).toBeTruthy();
  });

  it('elle disparaît AUSSI des autres écrans qui la listent', () => {
    seed([RECHERCHE, { ...RECHERCHE, id: 'srch_2', name: 'Riom T3' }]);
    useAppStore.getState().deleteSearch('srch_1');

    // L'import : y rattacher un import partirait avec la recherche.
    render(
      <MemoryRouter>
        <ImportScreen />
      </MemoryRouter>
    );
    const options = screen
      .getByLabelText(/Rattacher à une recherche/)
      .querySelectorAll('option');
    expect([...options].map(o => o.textContent)).toEqual([
      '— Aucune (pas de filtre) —',
      'Riom T3',
    ]);
    cleanup();

    // La vue d'ensemble : deux chiffres pour une seule vérité, sinon.
    render(
      <MemoryRouter>
        <DashboardScreen />
      </MemoryRouter>
    );
    const kpi = screen.getByText('Recherches actives').closest('a');
    expect(kpi?.querySelector('.price')?.textContent).toBe('1');
  });

  it('le message disparaît de lui-même quand le délai a filé', () => {
    seed();
    renderScreen();

    fireEvent.click(deleteButton());
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(UNDO_DELETE_MS);
    });

    // Il ne reste pas un « Annuler » qui n'annulerait plus rien — c'est le
    // mode d'échec qu'on redoutait en laissant le socle gérer la durée (sa
    // minuterie se met en pause au survol, pas celle du store).
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
    expect(useAppStore.getState().data.searches).toEqual([]);
  });
});
