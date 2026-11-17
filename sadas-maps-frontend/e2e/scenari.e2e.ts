import { expect, test } from './demo-page';

/** Ogni scenario della pagina di prova si carica, con i casi difficili previsti e senza errori. */
test.describe('scenari', () => {
  test('Regioni: poligoni, legenda e un record senza area', async ({ demo }) => {
    await demo.open('demo-regioni');
    await expect(demo.mapTitle).toHaveText('Regioni (dati simulati)');
    await expect(demo.legendTitle).toHaveText('Popolazione');
    await expect(demo.notice).toContainText('1 record senza area corrispondente');
    await expect.poll(async () => (await demo.layerCounts()).polygons).toBeGreaterThanOrEqual(20);
  });

  test('Province: bolle con la legenda dei raggi', async ({ demo }) => {
    await demo.open('demo-province');
    await expect(demo.mapTitle).toHaveText('Province (dati simulati)');
    await expect(demo.page.locator('.legend__bubble')).toHaveCount(2);
    await expect.poll(async () => (await demo.layerCounts()).bubbles).toBe(120);
  });

  test('Comuni di una regione: la PreQuery blocca finché non si sceglie una regione', async ({ demo }) => {
    await demo.open('demo-comuni-regione');
    await expect(demo.overlay).toHaveText('Selezionare una regione per vedere i suoi comuni.');
    expect((await demo.layerCounts()).polygons).toBe(0);

    const firstRegion = await demo.filter.locator('option').nth(1).getAttribute('value');
    await demo.setFilter(firstRegion!);
    await expect(demo.overlay).toHaveCount(0);
    await expect.poll(async () => (await demo.layerCounts()).polygons).toBeGreaterThan(50);
  });

  test('Tutti i comuni: migliaia di aree, solo quelle in vista', async ({ demo }) => {
    await demo.open('demo-comuni-tutti');
    await expect.poll(async () => (await demo.layerCounts()).polygons).toBeGreaterThan(1000);
    await expect(demo.log.filter({ hasText: 'GEOMETRIE' }).first()).toContainText('area visibile');
  });

  test('Negozi: cluster e righe con coordinate non valide', async ({ demo }) => {
    await demo.open('demo-negozi');
    await expect(demo.page.locator('.marker-cluster').first()).toBeVisible();
    await expect(demo.notice).toContainText('6 record senza area corrispondente');
  });
});

test.describe('mappa di base', () => {
  test('con le tile raggiungibili non c’è nessun avviso', async ({ demo }) => {
    await demo.open('demo-regioni');
    await expect(demo.page.locator('.leaflet-tile-loaded').first()).toBeAttached();
    await expect(demo.page.getByText('Mappa di base non raggiungibile')).toHaveCount(0);
  });

  test('senza tile i dati restano visibili e compare un avviso', async ({ demo }) => {
    await demo.open('demo-regioni', { tiles: 'unreachable' });
    await expect(demo.notice).toContainText('Mappa di base non raggiungibile');
    await expect(demo.legendTitle).toHaveText('Popolazione');
    await expect.poll(async () => (await demo.layerCounts()).polygons).toBeGreaterThan(0);
  });
});
