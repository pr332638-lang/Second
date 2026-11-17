import { expect, test } from './demo-page';

test.describe('back-end simulato', () => {
  test('se la query fallisce compare un errore; tolto l’errore, la mappa torna', async ({ demo }) => {
    await demo.open('demo-regioni');
    await demo.failRequests.check();
    await demo.setFilter('Nord');
    await expect(demo.page.getByRole('alert')).toHaveText('Errore nel caricamento dei dati.');

    await demo.failRequests.uncheck();
    await demo.setFilter('Sud');
    await expect(demo.page.getByRole('alert')).toHaveCount(0);
    await expect(demo.legendTitle).toHaveText('Popolazione');
  });

  test('se le geometrie non arrivano compare un avviso, che sparisce al caricamento successivo', async ({ demo }) => {
    await demo.open('demo-comuni-tutti');
    await expect.poll(async () => (await demo.layerCounts()).polygons).toBeGreaterThan(0);
    await demo.failRequests.check();
    await demo.setView(45.4, 9.2, 10); // nuovo livello di dettaglio: servono nuove geometrie
    await expect(demo.notice).toContainText('Confini o punti delle aree non caricati');

    await demo.failRequests.uncheck();
    await demo.setView(45.45, 9.25, 10);
    await expect(demo.page.getByText('Confini o punti delle aree non caricati')).toHaveCount(0);
  });

  test('ingrandendo si chiedono confini più dettagliati', async ({ demo }) => {
    await demo.open('demo-regioni');
    await expect(demo.log.filter({ hasText: 'GEOMETRIE' })).not.toHaveCount(0);
    await demo.setView(44, 11, 9);
    await demo.setView(44, 11, 11);
    await expect(demo.log.filter({ hasText: /L[23],/ }).first()).toBeVisible();
  });
});

test.describe('scelta del back-end', () => {
  test('senza parametro la pagina usa il back-end Java e offre il passaggio a quello simulato', async ({ page }) => {
    await page.route(/tile\.openstreetmap\.org/, (route) => route.abort());
    await page.goto('/');
    await expect(page.getByText('Java 21 · http://localhost:8080 (via proxy)')).toBeVisible();
    await page.getByRole('link', { name: 'usa il back-end simulato nel browser' }).click();
    await expect(page).toHaveURL(/backend=simulato/);
    await expect(page.getByText('Simulato nel browser')).toBeVisible();
  });
});
