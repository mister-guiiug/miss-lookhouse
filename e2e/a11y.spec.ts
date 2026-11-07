import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectNoA11yViolations } from '@mister-guiiug/dev-pwa-config/playwright-a11y';

/**
 * axe-core sur les trois écrans où l'on passe le plus de temps : l'accueil,
 * la liste des annonces, la fiche d'une annonce (photos, statut, prix,
 * vérification, notes — la plus chargée de l'app). La fiche auditée est celle
 * du studio marqué « Suspecte » : ses pastilles portent à la fois le vert
 * (« active ») et le rouge (statut, anomalies), les deux tons qu'axe a pris en
 * défaut de contraste avant correction.
 *
 * CHAQUE AUDIT ATTEND SON ÉCRAN. Lancé au `load`, axe pourrait auditer le
 * contenu servi du socle — et sortir vert sur une page que personne ne lit.
 * L'ancre est toujours un élément que seul React rend.
 *
 * LES DEUX THÈMES. Le thème suit le système par défaut : un contraste juste
 * en clair peut être faux en sombre.
 */
const ECRANS: { nom: string; url: string; ancre: (page: Page) => unknown }[] = [
  {
    nom: 'accueil',
    url: '/',
    ancre: page =>
      expect(
        page.getByRole('link', { name: 'Importer des annonces' })
      ).toBeVisible(),
  },
  {
    nom: 'annonces',
    url: '/#/annonces',
    ancre: page => expect(page.getByText('4 annonce(s)')).toBeVisible(),
  },
  {
    nom: 'fiche d’une annonce',
    url: '/#/annonces/demo-l4',
    ancre: page =>
      expect(
        page.getByRole('heading', { name: 'Vérification métier' })
      ).toBeVisible(),
  },
];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`@a11y accessibilité, thème ${theme === 'light' ? 'clair' : 'sombre'}`, () => {
    test.use({ colorScheme: theme });

    for (const ecran of ECRANS) {
      test(`${ecran.nom} sans violation WCAG A/AA`, async ({ page }) => {
        await page.goto(ecran.url);
        await ecran.ancre(page);
        await expectNoA11yViolations(page, AxeBuilder, expect);
      });
    }
  });
}
