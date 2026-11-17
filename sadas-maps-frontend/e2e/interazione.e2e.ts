import { expect, test } from './demo-page';

/** Indirizzo dei due negozi diversi con le stesse coordinate (datasets.ts). */
const SAME_ADDRESS = { lat: 45.4643, lng: 9.1895 };

test.describe('clic e selezione', () => {
  test('un clic su un’area la seleziona e manda i parametri alla pagina collegata', async ({ demo }) => {
    await demo.open('demo-regioni');
    await expect.poll(async () => (await demo.layerCounts()).polygons).toBeGreaterThan(0);
    const area = await demo.firstPolygonCenter();

    await demo.clickAt(area.lat, area.lng);
    await expect(demo.lastClick('IDAREAMAP')).toHaveText(area.id);
    await expect(demo.lastClick('METR_LABEL')).toHaveText('Popolazione');
    await expect(demo.lastClick('LABELMAP')).toHaveText(/^Regione /);
    expect(await demo.isPolygonSelected(area.id)).toBe(true);

    // Un clic fuori dalle aree toglie la selezione (Regioni non ha Data Entry Flag: nessun nuovo clic).
    await demo.clickAt(36.2, 7.5);
    await expect.poll(() => demo.isPolygonSelected(area.id)).toBe(false);
    await expect(demo.lastClick('IDAREAMAP')).toHaveText(area.id);
  });

  test('Negozi: con Data Entry Flag un clic fuori dai punti manda LAT e LNG', async ({ demo }) => {
    await demo.open('demo-negozi');
    await demo.clickAt(36.2, 7.5);
    await expect(demo.lastClick('IDAREAMAP')).toHaveText('—');
    await expect(demo.lastClick('LAT, LNG')).toHaveText(/^36[.,]\d+, 7[.,]\d+$/);
  });

  test('Negozi a bolle: due negozi allo stesso indirizzo si selezionano insieme', async ({ demo }) => {
    await demo.open('demo-negozi');
    await demo.setFilter('Nord');
    await demo.panel.getByLabel('Metrica').selectOption({ label: 'Fatturato (bolle)' });
    await expect.poll(async () => (await demo.selectedAt(SAME_ADDRESS.lat, SAME_ADDRESS.lng)).length).toBe(2);

    await demo.setView(SAME_ADDRESS.lat, SAME_ADDRESS.lng, 15);
    await demo.clickAt(SAME_ADDRESS.lat, SAME_ADDRESS.lng);
    await expect(demo.lastClick('LABELMAP')).toHaveText(/^Negozio stesso indirizzo [AB]$/);
    await expect.poll(() => demo.selectedAt(SAME_ADDRESS.lat, SAME_ADDRESS.lng)).toEqual([true, true]);
  });
});

test.describe('pannello dei livelli', () => {
  test('cambiare metrica cambia legenda e tipo di disegno', async ({ demo }) => {
    await demo.open('demo-regioni');
    await expect(demo.legendTitle).toHaveText('Popolazione');
    await demo.panel.getByLabel('Metrica').selectOption({ label: 'Densità (ab/km²)' });
    await expect(demo.legendTitle).toHaveText('Densità (ab/km²)');
    await expect.poll(async () => (await demo.layerCounts()).bubbles).toBeGreaterThan(0);
    expect((await demo.layerCounts()).polygons).toBe(0);
  });

  test('“Nessuna” nasconde tutte le aree, la legenda resta; “Tutte” le rimostra', async ({ demo }) => {
    await demo.open('demo-regioni');
    await expect.poll(async () => (await demo.layerCounts()).polygons).toBeGreaterThan(0);
    const before = (await demo.layerCounts()).polygons;

    await demo.panel.getByRole('button', { name: 'Nessuna' }).click();
    await expect.poll(async () => (await demo.layerCounts()).polygons).toBe(0);
    await expect(demo.legendTitle).toHaveText('Popolazione');
    await expect(demo.panel.getByRole('checkbox', { checked: true })).toHaveCount(0);

    await demo.panel.getByRole('button', { name: 'Tutte' }).click();
    await expect.poll(async () => (await demo.layerCounts()).polygons).toBe(before);
  });

  test('la ricerca filtra l’elenco delle aree', async ({ demo }) => {
    await demo.open('demo-regioni');
    await demo.panel.getByLabel('Cerca area').fill('Regione B');
    await expect(demo.panel.getByRole('checkbox')).toHaveCount(1);
    await expect(demo.panel.locator('.sadas-map__area-list')).toContainText('Regione B');
    await demo.panel.getByLabel('Cerca area').fill('zzz');
    await expect(demo.panel.getByText('Nessuna area trovata')).toBeVisible();
  });
});

test.describe('cluster dei marcatori', () => {
  test('un clic su un cluster ingrandisce; allo zoom alto restano marcatori con l’icona', async ({ demo }) => {
    await demo.open('demo-negozi');
    const clusters = demo.page.locator('.marker-cluster');
    await expect(clusters.first()).toBeVisible();
    const zoomBefore = await demo.zoom();

    await clusters.first().click();
    await expect.poll(() => demo.zoom()).toBeGreaterThan(zoomBefore);

    await demo.setView(SAME_ADDRESS.lat - 0.3, SAME_ADDRESS.lng + 0.5, 18);
    const icon = demo.page.locator('img.leaflet-marker-icon').first();
    await expect(icon).toBeVisible();
    expect(await icon.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  });

  test('il filtro del Parent rilancia la query e cambia i marcatori', async ({ demo }) => {
    await demo.open('demo-negozi');
    const queries = demo.log.filter({ hasText: 'QUERY' });
    await expect(queries).toHaveCount(1);
    await demo.setFilter('Isole');
    await expect(queries).toHaveCount(2);
    // Le sei righe non valide non sono delle Isole: l'avviso dei record senza area sparisce.
    await expect(demo.page.getByText('6 record senza area corrispondente')).toHaveCount(0);
  });
});
