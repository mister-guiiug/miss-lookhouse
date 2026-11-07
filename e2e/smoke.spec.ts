import { expect, test } from '@playwright/test';

/**
 * Le SMOKE : ce qui doit marcher pour qu'une livraison ait un sens.
 *
 * Le tag `@critical` est l'un des deux que la CI de la famille joue
 * (`e2e-grep` vaut `@critical|@a11y` par défaut) : une spec sans lui n'est PAS
 * jouée en intégration continue.
 *
 * LE BACKEND EST LOCAL : le build de test force `VITE_BACKEND=local` (voir
 * `playwright.config.ts`), le moteur tourne dans le navigateur sur le jeu de
 * démonstration de `src/demo/seed.ts`. Les annonces citées ci-dessous en
 * viennent ; elles sont fictives.
 */
test.describe('@critical le cadre', () => {
  test('l’app monte en mode local, sur le jeu de démonstration', async ({
    page,
  }) => {
    await page.goto('/');

    // ANCRÉ SUR CE QUE SEUL REACT REND. Le HTML servi porte déjà un `h1`
    // « Miss LookHouse » et une description (contenu servi du socle) : une
    // app dont le JavaScript ne charge pas affiche quand même un titre. Le
    // bouton d'import et les annonces récentes, eux, n'existent qu'une fois
    // le magasin hydraté.
    await expect(
      page.getByRole('link', { name: 'Importer des annonces' })
    ).toBeVisible();
    await expect(
      page.getByText('Appartement T3 lumineux — Lyon 7e', { exact: true })
    ).toBeVisible();
    // Et le contenu servi a bien été REMPLACÉ, pas seulement recouvert.
    await expect(page.locator('[data-dwc="served-content"]')).toHaveCount(0);

    // La porte de connexion n'existe pas en mode local : on est DANS l'app.
    await expect(page.getByText('mode démo')).toBeVisible();
  });

  test('une annonce se retrouve par le filtre et s’ouvre', async ({ page }) => {
    await page.goto('/#/annonces');
    await expect(page.getByText('4 annonce(s)')).toBeVisible();

    await page.getByLabel('Filtrer les annonces').fill('Villeurbanne');
    await expect(page.getByText('1 annonce(s)')).toBeVisible();

    await page
      .getByRole('link', { name: /Maison 5 pièces avec jardin/ })
      .click();
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Maison 5 pièces avec jardin — Villeurbanne',
      })
    ).toBeVisible();
  });

  test('une note privée survit au rechargement', async ({ page }) => {
    await page.goto('/#/annonces/demo-l1');

    const texte = `note e2e ${Date.now()}`;
    await page.getByPlaceholder('Ajouter une note…').fill(texte);
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByText(texte)).toBeVisible();

    // Le vrai contrat du mode local : ce qui est écrit se relit après un
    // démarrage à froid, pas seulement dans l'état vivant du magasin.
    await page.reload();
    await expect(page.getByText(texte)).toBeVisible();
  });
});
