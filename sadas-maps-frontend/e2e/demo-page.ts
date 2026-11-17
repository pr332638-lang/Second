import { test as base, expect, type Locator, type Page } from '@playwright/test';

/** Tile vuota al posto di OpenStreetMap: i test non dipendono da internet e non caricano il server pubblico. */
const EMPTY_TILE = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>';
const OSM_TILES = /tile\.openstreetmap\.org/;

type ScenarioId =
  | 'demo-regioni'
  | 'demo-province'
  | 'demo-comuni-regione'
  | 'demo-comuni-tutti'
  | 'demo-negozi';

/** Numero di layer Leaflet per tipo, sulla mappa corrente. */
interface LayerCounts {
  polygons: number;
  bubbles: number;
  markers: number;
}

/**
 * La pagina di prova vista dai test: scenario, filtro, back-end simulato, mappa e pannelli.
 * Per ciò che Leaflet disegna su canvas (poligoni e bolle) si legge la mappa Leaflet stessa,
 * che init script espone come window.__map.
 */
class DemoPage {
  /** Errori in console e eccezioni non gestite: alla fine di ogni test devono essere zero. */
  readonly errors: string[] = [];

  constructor(readonly page: Page) {
    page.on('pageerror', (e) => this.errors.push(e.message));
    page.on('console', (m) => {
      // Le richieste fallite di proposito (errore simulato) le registra già il componente.
      if (m.type() === 'error' && !/Failed to load resource|\[sadas-map\] errore/.test(m.text())) {
        this.errors.push(m.text());
      }
    });
  }

  /** Apre la pagina di prova con il back-end simulato e, se indicato, uno scenario. */
  async open(scenario?: ScenarioId, options: { tiles?: 'ok' | 'unreachable' } = {}): Promise<void> {
    const tiles = options.tiles ?? 'ok';
    await this.page.route(OSM_TILES, (route) =>
      tiles === 'ok' ? route.fulfill({ contentType: 'image/svg+xml', body: EMPTY_TILE }) : route.abort(),
    );
    // Espone la mappa Leaflet creata dal componente (L globale è definito da leaflet-global.ts).
    await this.page.addInitScript(() => {
      let leaflet: unknown;
      Object.defineProperty(window, 'L', {
        configurable: true,
        get: () => leaflet,
        set(value: { Map: { addInitHook(fn: () => void): void } }) {
          leaflet = value;
          value.Map.addInitHook(function (this: unknown) {
            (window as unknown as { __map: unknown }).__map = this;
          });
        },
      });
    });
    await this.page.goto('/?backend=simulato');
    await expect(this.mapTitle).toBeVisible();
    if (scenario) await this.selectScenario(scenario);
  }

  // --- Pannello laterale -------------------------------------------------------

  async selectScenario(id: ScenarioId): Promise<void> {
    await this.page.getByLabel('Scenario').selectOption(id);
    await this.waitForIdle();
  }

  get filter(): Locator {
    return this.page.getByLabel(/Filtro Parent simulato/);
  }

  async setFilter(value: string): Promise<void> {
    await this.filter.selectOption(value);
    await this.waitForIdle();
  }

  get failRequests(): Locator {
    return this.page.getByLabel('Simula un errore del server');
  }

  /** Valore di un parametro nel riquadro "Ultimo clic" (es. 'LABELMAP'). */
  lastClick(name: string): Locator {
    return this.page.locator('.demo__params dt', { hasText: new RegExp(`^${name}$`) }).locator('xpath=following-sibling::dd[1]');
  }

  get log(): Locator {
    return this.page.locator('.demo__log li');
  }

  // --- Mappa -------------------------------------------------------------------

  get mapTitle(): Locator {
    return this.page.locator('.sadas-map__title');
  }

  get mapCanvas(): Locator {
    return this.page.locator('.sadas-map__canvas');
  }

  get notice(): Locator {
    return this.page.locator('.sadas-map__notice');
  }

  get overlay(): Locator {
    return this.page.locator('.sadas-map__overlay');
  }

  get legendTitle(): Locator {
    return this.page.locator('.legend__title');
  }

  get panel(): Locator {
    return this.page.getByRole('region', { name: 'Livelli della mappa' }).or(this.page.locator('.sadas-map__panel'));
  }

  /** Attende la fine del caricamento: niente "Caricamento…" sulla mappa. */
  async waitForIdle(): Promise<void> {
    await expect(this.page.locator('.sadas-map__overlay--soft')).toHaveCount(0);
  }

  async layerCounts(): Promise<LayerCounts> {
    return this.page.evaluate(() => {
      const w = window as unknown as { __map: LeafletMapLike; L: LeafletLike };
      const counts = { polygons: 0, bubbles: 0, markers: 0 };
      w.__map.eachLayer((layer) => {
        if (layer instanceof w.L.Polygon) counts.polygons++;
        else if (layer instanceof w.L.CircleMarker) counts.bubbles++;
        else if (layer instanceof w.L.Marker) counts.markers++;
      });
      return counts;
    });
  }

  async zoom(): Promise<number> {
    return this.page.evaluate(() => (window as unknown as { __map: LeafletMapLike }).__map.getZoom());
  }

  /** Centra la mappa senza animazione. */
  async setView(lat: number, lng: number, zoom: number): Promise<void> {
    await this.page.evaluate(
      ([la, ln, z]) => {
        (window as unknown as { __map: LeafletMapLike }).__map.setView([la!, ln!], z!, { animate: false });
      },
      [lat, lng, zoom],
    );
  }

  /** Clic del mouse vero nel punto della mappa indicato. */
  async clickAt(lat: number, lng: number): Promise<void> {
    const point = await this.page.evaluate(
      ([la, ln]) => (window as unknown as { __map: LeafletMapLike }).__map.latLngToContainerPoint([la!, ln!]),
      [lat, lng],
    );
    const box = (await this.mapCanvas.boundingBox())!;
    await this.page.mouse.click(box.x + point.x, box.y + point.y);
  }

  /** Centro del primo poligono disegnato (per cliccarlo). */
  async firstPolygonCenter(): Promise<{ lat: number; lng: number; id: string }> {
    return this.page.evaluate(() => {
      const w = window as unknown as { __map: LeafletMapLike; L: LeafletLike };
      let found: { lat: number; lng: number; id: string } | null = null;
      w.__map.eachLayer((layer) => {
        if (!found && layer instanceof w.L.Polygon) {
          const polygon = layer as unknown as PolygonLike;
          const c = polygon.getBounds().getCenter();
          found = { lat: c.lat, lng: c.lng, id: String(polygon.feature?.id) };
        }
      });
      if (!found) throw new Error('nessun poligono sulla mappa');
      return found;
    });
  }

  /** Stile dei layer canvas (poligoni o bolle) in un punto: bordo di selezione = spessore 3. */
  async selectedAt(lat: number, lng: number): Promise<boolean[]> {
    return this.page.evaluate(
      ([la, ln]) => {
        const w = window as unknown as { __map: LeafletMapLike; L: LeafletLike };
        const result: boolean[] = [];
        w.__map.eachLayer((layer) => {
          if (layer instanceof w.L.CircleMarker) {
            const bubble = layer as unknown as BubbleLike;
            const p = bubble.getLatLng();
            if (Math.abs(p.lat - la!) < 1e-6 && Math.abs(p.lng - ln!) < 1e-6) result.push(bubble.options.weight === 3);
          }
        });
        return result;
      },
      [lat, lng],
    );
  }

  async isPolygonSelected(id: string): Promise<boolean> {
    return this.page.evaluate((target) => {
      const w = window as unknown as { __map: LeafletMapLike; L: LeafletLike };
      let selected = false;
      w.__map.eachLayer((layer) => {
        const polygon = layer as unknown as PolygonLike;
        if (layer instanceof w.L.Polygon && String(polygon.feature?.id) === target) selected = polygon.options.weight === 3;
      });
      return selected;
    }, id);
  }
}

// Tipi minimi di Leaflet usati dentro page.evaluate (il codice gira nel browser, senza import).
interface LatLngLike {
  lat: number;
  lng: number;
}
interface LeafletMapLike {
  eachLayer(fn: (layer: object) => void): void;
  getZoom(): number;
  setView(center: [number, number], zoom: number, options: { animate: boolean }): void;
  latLngToContainerPoint(latlng: [number, number]): { x: number; y: number };
}
interface LeafletLike {
  Polygon: abstract new (...args: never[]) => object;
  CircleMarker: abstract new (...args: never[]) => object;
  Marker: abstract new (...args: never[]) => object;
}
interface PolygonLike {
  feature?: { id?: unknown };
  options: { weight?: number };
  getBounds(): { getCenter(): LatLngLike };
}
interface BubbleLike {
  options: { weight?: number };
  getLatLng(): LatLngLike;
}

/** test con la pagina di prova già pronta; a fine test controlla che non ci siano errori in console. */
export const test = base.extend<{ demo: DemoPage }>({
  demo: async ({ page }, use) => {
    const demo = new DemoPage(page);
    await use(demo);
    expect(demo.errors, 'errori in console o eccezioni non gestite').toEqual([]);
  },
});

export { expect };
