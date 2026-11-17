/**
 * Test del componente <sadas-map> in un browser vero (Chromium, modalità browser di Vitest):
 * Leaflet disegna su canvas e misura il DOM, cose che jsdom non sa fare.
 *
 * Si lanciano con `npm run test:browser`. Il back-end è un intercettore HTTP finto: ogni test decide
 * le righe della query e le geometrie, compresi i casi che i dati simulati non hanno (righe duplicate,
 * errori). Il componente passa per il vero MapsDataService e per richieste HTTP reali.
 */
import {
  HttpErrorResponse,
  HttpResponse,
  provideHttpClient,
  withInterceptors,
  type HttpInterceptorFn,
} from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { Feature, Geometry } from 'geojson';
import * as L from 'leaflet';
import { delay, of, throwError } from 'rxjs';
import { userEvent } from 'vitest/browser';

import type { MapClickParams, MapMetric, MapsConfig, MapsQueryResult, QueryRow } from './maps.models';
import { SadasMapComponent } from './sadas-map.component';
import { MAPS_OSM_TILE_URL } from './services/base-layer.factory';
import { DEFAULT_MAPS_PERFORMANCE, MAPS_PERFORMANCE } from './services/performance';

// -----------------------------------------------------------------------------
// Back-end finto
// -----------------------------------------------------------------------------

/** Tile trasparente 1×1: niente rete verso OpenStreetMap durante i test. */
const EMPTY_TILE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** Quadrato di lato 1° con l'angolo in basso a sinistra in (lat, lng). */
function square(id: string, lat: number, lng: number): Feature<Geometry, { label?: string }> {
  return {
    type: 'Feature',
    id,
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lng, lat],
          [lng + 1, lat],
          [lng + 1, lat + 1],
          [lng, lat + 1],
          [lng, lat],
        ],
      ],
    },
  };
}

function point(id: string, lat: number, lng: number): Feature<Geometry, { label?: string }> {
  return { type: 'Feature', id, properties: {}, geometry: { type: 'Point', coordinates: [lng, lat] } };
}

/** Due aree confinanti nel nord Italia, e due punti centrali. */
const POLYGONS = [square('1', 44, 10), square('2', 44, 11)];
const POINTS = [point('P1', 44.5, 10.5), point('P2', 44.5, 11.5)];

interface Backend {
  /** Risposta alla query; 'error' = errore 500. */
  query: MapsQueryResult | 'error';
  failGeometries: boolean;
  queries: Array<Readonly<Record<string, unknown>>>;
  geometryRequests: number;
}

let backend: Backend;

const fakeBackend: HttpInterceptorFn = (req) => {
  const match = /\/components\/[^/]+\/(query|geometries)$/.exec(req.url);
  if (!match) return throwError(() => new HttpErrorResponse({ status: 404, url: req.url }));
  // delay(0): la risposta arriva in modo asincrono, come da un server vero.
  const fail = () => throwError(() => new HttpErrorResponse({ status: 500, url: req.url })).pipe(delay(0));

  if (match[1] === 'query') {
    backend.queries.push((req.body as { params: Record<string, unknown> }).params);
    if (backend.query === 'error') return fail();
    return of(new HttpResponse({ status: 200, body: backend.query })).pipe(delay(0));
  }

  backend.geometryRequests++;
  if (backend.failGeometries) return fail();
  const { ids, level } = req.body as { ids: string[]; level: string };
  const pool = level === 'POINT' ? POINTS : POLYGONS;
  const features = pool.filter((f) => ids.includes(String(f.id)));
  const notFound = ids.filter((id) => !pool.some((f) => String(f.id) === id));
  return of(new HttpResponse({ status: 200, body: { type: 'FeatureCollection', features, notFound } })).pipe(delay(0));
};

function ok(rows: QueryRow[]): MapsQueryResult {
  return { preQueryOk: true, rows };
}

// -----------------------------------------------------------------------------
// Configurazioni
// -----------------------------------------------------------------------------

const POPOLAZIONE: MapMetric = {
  idMetric: 'POP',
  name: 'Popolazione',
  displayType: 'POLYGON',
  currentValueField: '${F.V}',
};
const DENSITA: MapMetric = { idMetric: 'DEN', name: 'Densità', displayType: 'POLYGON', currentValueField: '${F.D}' };

const BASE: MapsConfig = {
  id: 'test-map',
  fieldKeyForPolygons: '${F.ID}',
  fieldKeyForPoint: '${F.ID_PUNTO}',
  fieldLabel: '${F.NOME}',
  externalPoint: false,
  dataEntryFlag: false,
  height: 400,
  mapCenterLat: 44.5,
  mapCenterLng: 11,
  mapCenterZoom: 7,
  metrics: [POPOLAZIONE],
};

const EXTERNAL: MapsConfig = {
  ...BASE,
  externalPoint: true,
  fieldKeyForPoint: undefined,
  fieldLatitude: '${F.LAT}',
  fieldLongitude: '${F.LNG}',
};

// -----------------------------------------------------------------------------
// Utilità
// -----------------------------------------------------------------------------

interface Rendered {
  fixture: ComponentFixture<SadasMapComponent>;
  el: HTMLElement;
  clicks: MapClickParams[];
  /** La mappa Leaflet del componente (campo privato: si legge solo nei test). */
  map: () => L.Map;
}

async function render(config: MapsConfig, inputs: Record<string, unknown> = {}): Promise<Rendered> {
  const fixture = TestBed.createComponent(SadasMapComponent);
  fixture.componentRef.setInput('config', config);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  const clicks: MapClickParams[] = [];
  fixture.componentInstance.areaClick.subscribe((c) => clicks.push(c));
  await fixture.whenStable();
  const map = () => {
    const m = (fixture.componentInstance as unknown as { map?: L.Map }).map;
    if (!m) throw new Error('mappa non ancora creata');
    return m;
  };
  return { fixture, el: fixture.nativeElement as HTMLElement, clicks, map };
}

function layersOf<T extends L.Layer>(map: L.Map, type: abstract new (...args: never[]) => T): T[] {
  const found: T[] = [];
  map.eachLayer((layer) => {
    if (layer instanceof type) found.push(layer);
  });
  return found;
}

const polygons = (r: Rendered) => layersOf(r.map(), L.Polygon);
const bubbles = (r: Rendered) => layersOf(r.map(), L.CircleMarker);
const text = (r: Rendered, selector: string) => r.el.querySelector(selector)?.textContent?.trim() ?? null;
const legendLabels = (r: Rendered) =>
  [...r.el.querySelectorAll('.legend__labels span')].map((s) => s.textContent?.trim());

/** Attende che la condizione diventi vera, aggiornando la vista a ogni tentativo. */
async function until(r: Rendered, check: () => unknown): Promise<void> {
  await expect
    .poll(async () => {
      await r.fixture.whenStable();
      return Boolean(check());
    })
    .toBe(true);
}

/** Bordo dello stile "selezionato" (SELECTED_BORDER nel componente). */
const isSelected = (layer: L.Path) => layer.options.weight === 3;

/** Clic come quello di Leaflet su un layer: con latlng e l'evento DOM originale. */
function fireClick(target: L.Evented, latlng: L.LatLngExpression): void {
  target.fire('click', { latlng: L.latLng(latlng), originalEvent: new MouseEvent('click') });
}

// -----------------------------------------------------------------------------
// Test
// -----------------------------------------------------------------------------

describe('SadasMapComponent (browser)', () => {
  beforeEach(() => {
    backend = { query: ok([]), failGeometries: false, queries: [], geometryRequests: 0 };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([fakeBackend])),
        { provide: MAPS_OSM_TILE_URL, useValue: EMPTY_TILE },
        // Niente attesa prima di chiedere le geometrie; cluster già da 4 marcatori.
        { provide: MAPS_PERFORMANCE, useValue: { ...DEFAULT_MAPS_PERFORMANCE, geometryDebounceMs: 0, clusterThreshold: 3 } },
      ],
    });
  });

  describe('dati e scala', () => {
    it('disegna i poligoni e la legenda dai valori della query', async () => {
      backend.query = ok([
        { ID: 1, NOME: 'Area 1', V: 10 },
        { ID: 2, NOME: 'Area 2', V: 30 },
      ]);
      const r = await render(BASE);
      await until(r, () => polygons(r).length === 2);
      expect(text(r, '.legend__title')).toBe('Popolazione');
      expect(legendLabels(r)).toEqual(['≤ 10', '20', '≥ 30']);
    });

    it('con più righe per la stessa area, scala e legenda usano solo quella disegnata', async () => {
      backend.query = ok([
        { ID: 1, NOME: 'Area 1', V: 100 }, // sostituita dalla terza riga: 100 non deve entrare nella scala
        { ID: 2, NOME: 'Area 2', V: 10 },
        { ID: 1, NOME: 'Area 1', V: 5 },
      ]);
      const r = await render(BASE);
      await until(r, () => polygons(r).length === 2);
      expect(legendLabels(r)).toEqual(['≤ 5', '7,5', '≥ 10']);
    });

    it('conta i record senza area corrispondente', async () => {
      backend.query = ok([
        { ID: 1, NOME: 'Area 1', V: 10 },
        { ID: 999, NOME: 'Inesistente', V: 20 },
        { NOME: 'Senza IdArea', V: 30 },
      ]);
      const r = await render(BASE);
      await until(r, () => text(r, '.sadas-map__notice')?.includes('2 record senza area corrispondente'));
      expect(polygons(r)).toHaveLength(1);
    });

    it('senza valori numerici disegna lo stesso le aree, senza legenda', async () => {
      backend.query = ok([
        { ID: 1, NOME: 'Area 1', V: 'n.d.' },
        { ID: 2, NOME: 'Area 2', V: null },
      ]);
      const r = await render(BASE);
      await until(r, () => polygons(r).length === 2);
      expect(r.el.querySelector('sadas-map-legend')).toBeNull();
    });

    it('cambiando metrica dal pannello dei livelli cambia la legenda', async () => {
      backend.query = ok([
        { ID: 1, NOME: 'Area 1', V: 10, D: 1 },
        { ID: 2, NOME: 'Area 2', V: 30, D: 3 },
      ]);
      const r = await render({ ...BASE, metrics: [POPOLAZIONE, DENSITA] });
      await until(r, () => polygons(r).length === 2);
      const select = r.el.querySelector<HTMLSelectElement>('.sadas-map__panel select')!;
      await userEvent.selectOptions(select, 'Densità');
      await until(r, () => text(r, '.legend__title') === 'Densità');
      expect(legendLabels(r)).toEqual(['≤ 1', '2', '≥ 3']);
    });

    it('un’area nascosta dal pannello non si disegna, ma resta nella scala', async () => {
      backend.query = ok([
        { ID: 1, NOME: 'Area 1', V: 10 },
        { ID: 2, NOME: 'Area 2', V: 30 },
      ]);
      const r = await render(BASE);
      await until(r, () => polygons(r).length === 2);
      const area2 = [...r.el.querySelectorAll('.sadas-map__area-list label')].find((l) =>
        l.textContent?.includes('Area 2'),
      )!;
      await userEvent.click(area2.querySelector('input')!);
      await until(r, () => polygons(r).length === 1);
      expect(String(polygons(r)[0]!.feature?.id)).toBe('1');
      expect(legendLabels(r)).toEqual(['≤ 10', '20', '≥ 30']);
    });
  });

  describe('PreQuery, errori e risultato del Parent', () => {
    it('con PreQuery fallita mostra il messaggio e non chiede geometrie', async () => {
      backend.query = { preQueryOk: false, message: 'Selezionare una regione', rows: [] };
      const r = await render(BASE);
      await until(r, () => text(r, '.sadas-map__overlay') === 'Selezionare una regione');
      expect(backend.geometryRequests).toBe(0);
      expect(polygons(r)).toHaveLength(0);
    });

    it('con PreQuery fallita senza messaggio usa quello di default', async () => {
      backend.query = { preQueryOk: false, message: null, rows: [] };
      const r = await render(BASE);
      await until(r, () => text(r, '.sadas-map__overlay')?.includes('condizione di pre-query non è soddisfatta'));
    });

    it('se la query fallisce mostra un errore', async () => {
      backend.query = 'error';
      const r = await render(BASE);
      await until(r, () => text(r, '[role="alert"]') === 'Errore nel caricamento dei dati.');
    });

    it('passa i parametri del Parent alla query e la rilancia quando cambiano', async () => {
      backend.query = ok([{ ID: 1, NOME: 'Area 1', V: 10 }]);
      const r = await render(BASE, { parentParams: { REGIONE: 3 } });
      await until(r, () => backend.queries.length === 1);
      expect(backend.queries[0]).toEqual({ REGIONE: 3 });
      r.fixture.componentRef.setInput('parentParams', { REGIONE: 4 });
      await until(r, () => backend.queries.length === 2);
      expect(backend.queries[1]).toEqual({ REGIONE: 4 });
    });

    it('con Query vuota usa il risultato del Parent, senza chiamare la query', async () => {
      const r = await render(
        { ...BASE, hasQuery: false },
        { parentResult: ok([{ ID: 1, NOME: 'Area 1', V: 10 }]) },
      );
      await until(r, () => polygons(r).length === 1);
      expect(backend.queries).toHaveLength(0);
    });

    it('se le geometrie non arrivano mostra un avviso, che sparisce al caricamento successivo', async () => {
      backend.query = ok([{ ID: 1, NOME: 'Area 1', V: 10 }]);
      backend.failGeometries = true;
      const r = await render(BASE);
      await until(r, () => text(r, '.sadas-map__notice')?.includes('Confini o punti delle aree non caricati'));
      expect(polygons(r)).toHaveLength(0);

      backend.failGeometries = false;
      r.map().panBy([5, 5], { animate: false }); // uno spostamento richiede di nuovo le geometrie
      await until(r, () => polygons(r).length === 1);
      await until(r, () => !text(r, '.sadas-map__notice'));
    });
  });

  describe('clic e selezione', () => {
    it('un clic vero su un poligono emette i parametri e lo seleziona', async () => {
      backend.query = ok([
        { ID: 1, NOME: 'Area 1', V: 10 },
        { ID: 2, NOME: 'Area 2', V: 30 },
      ]);
      const r = await render(BASE);
      await until(r, () => polygons(r).length === 2);

      // La legenda compare sotto la mappa e la accorcia: si aspetta che Leaflet abbia ricalcolato
      // le dimensioni, altrimenti il punto calcolato non corrisponde più a quello cliccato.
      await until(r, () => text(r, '.legend__title'));
      await until(r, () => r.map().getSize().y === r.el.querySelector('.sadas-map__canvas')!.clientHeight);

      // Clic del mouse sul centro dell'area 2, disegnata su canvas.
      const pt = r.map().latLngToContainerPoint([44.5, 11.5]);
      await userEvent.click(r.el.querySelector('.sadas-map__canvas')!, { position: { x: pt.x, y: pt.y } });
      await until(r, () => r.clicks.length === 1);

      const click = r.clicks[0]!;
      expect(click).toMatchObject({
        IDAREAMAP: '2',
        IDMETRIC: 'POP',
        METR_LABEL: 'Popolazione',
        METR_VALUE: 30,
        LABELMAP: 'Area 2',
        record: { ID: 2, NOME: 'Area 2', V: 30 },
      });
      expect(click.LAT).toBeCloseTo(44.5, 1);
      expect(click.LNG).toBeCloseTo(11.5, 1);

      const [area1, area2] = ['1', '2'].map((id) => polygons(r).find((p) => String(p.feature?.id) === id)!);
      expect(isSelected(area2!)).toBe(true);
      expect(isSelected(area1!)).toBe(false);
    });

    it('la selezione resta dopo un ridisegno e si toglie con un clic fuori dalle aree', async () => {
      backend.query = ok([
        { ID: 1, NOME: 'Area 1', V: 10 },
        { ID: 2, NOME: 'Area 2', V: 30 },
      ]);
      const r = await render(BASE);
      await until(r, () => polygons(r).length === 2);
      const area1 = () => polygons(r).find((p) => String(p.feature?.id) === '1')!;
      fireClick(area1(), [44.5, 10.5]);
      await until(r, () => isSelected(area1()));

      r.map().setZoom(9, { animate: false }); // cambia livello di dettaglio: nuovo disegno
      await until(r, () => polygons(r).length === 2 && isSelected(area1()));

      fireClick(r.map(), [40, 5]);
      await until(r, () => !isSelected(area1()));
      expect(r.clicks).toHaveLength(1); // senza Data Entry Flag il clic fuori non emette nulla
    });

    it('con Data Entry Flag un clic fuori dalle aree emette solo LAT e LNG', async () => {
      backend.query = ok([{ ID: 1, NOME: 'Area 1', V: 10 }]);
      const r = await render({ ...BASE, dataEntryFlag: true });
      await until(r, () => polygons(r).length === 1);
      fireClick(r.map(), [41.9, 12.5]);
      await until(r, () => r.clicks.length === 1);
      expect(r.clicks[0]).toMatchObject({ IDAREAMAP: null, LABELMAP: null, LAT: 41.9, LNG: 12.5, record: null });
    });
  });

  describe('bolle e marcatori', () => {
    it('le bolle si posizionano sui punti centrali delle aree', async () => {
      backend.query = ok([
        { ID_PUNTO: 'P1', NOME: 'Punto 1', V: 10 },
        { ID_PUNTO: 'P2', NOME: 'Punto 2', V: 30 },
      ]);
      const r = await render({ ...BASE, metrics: [{ ...POPOLAZIONE, displayType: 'BUBBLE' }] });
      await until(r, () => bubbles(r).length === 2);
      const radii = bubbles(r)
        .map((b) => b.getRadius())
        .sort((a, b) => a - b);
      expect(radii[0]).toBeLessThan(radii[1]!); // il valore più alto ha la bolla più grande
    });

    it('External point: record con le stesse coordinate compaiono e si selezionano insieme', async () => {
      backend.query = ok([
        { NOME: 'Negozio A', V: 10, LAT: '45,46', LNG: '9,19' },
        { NOME: 'Negozio B', V: 30, LAT: '45,46', LNG: '9,19' }, // stesso indirizzo
        { NOME: 'Negozio C', V: 20, LAT: '45,10', LNG: '9,50' },
      ]);
      const r = await render({
        ...EXTERNAL,
        mapCenterLat: 45.3,
        mapCenterLng: 9.3,
        metrics: [{ ...POPOLAZIONE, displayType: 'BUBBLE' }],
      });
      await until(r, () => bubbles(r).length === 3);
      expect(backend.geometryRequests).toBe(0); // le coordinate arrivano dalla query

      const atAddress = () => bubbles(r).filter((b) => b.getLatLng().equals([45.46, 9.19]));
      fireClick(atAddress()[0]!, [45.46, 9.19]);
      await until(r, () => atAddress().every(isSelected));
      const other = bubbles(r).find((b) => !b.getLatLng().equals([45.46, 9.19]))!;
      expect(isSelected(other)).toBe(false);
      expect(r.clicks[0]).toMatchObject({ IDAREAMAP: null, LAT: 45.46, LNG: 9.19 });
    });

    it('il popup usa il Popup Value con i parametri del Parent, protetti per l’HTML', async () => {
      backend.query = ok([{ NOME: '<i>Negozio</i>', V: 1234567, LAT: '45,46', LNG: '9,19' }]);
      const r = await render(
        {
          ...EXTERNAL,
          mapCenterLat: 45.46,
          mapCenterLng: 9.19,
          metrics: [{ ...POPOLAZIONE, displayType: 'BUBBLE', popupValue: '<b>${F.NOME}</b> ${F.V} (${P.ANNO})' }],
        },
        { parentParams: { ANNO: 2026 } },
      );
      await until(r, () => bubbles(r).length === 1);
      fireClick(bubbles(r)[0]!, [45.46, 9.19]);
      await until(r, () => r.el.querySelector('.leaflet-popup-content'));
      expect(r.el.querySelector('.leaflet-popup-content')!.innerHTML).toBe(
        '<b>&lt;i&gt;Negozio&lt;/i&gt;</b> 1.234.567 (2026)',
      );
    });

    it('oltre la soglia i marcatori si raggruppano in cluster', async () => {
      const shops = [0, 1, 2, 3].map((i) => ({ NOME: `Negozio ${i}`, V: i, LAT: 45.46 + i * 0.001, LNG: 9.19 }));
      backend.query = ok(shops);
      const r = await render({
        ...EXTERNAL,
        mapCenterLat: 45.46,
        mapCenterLng: 9.19,
        metrics: [{ ...POPOLAZIONE, displayType: 'MARKER' }],
      });
      await until(r, () => r.el.querySelector('.marker-cluster'));
      expect(text(r, '.marker-cluster')).toBe('4');
    });

    it('fino alla soglia i marcatori restano singoli, con l’icona di Leaflet', async () => {
      backend.query = ok([
        { NOME: 'Negozio 1', V: 1, LAT: 45.46, LNG: 9.19 },
        { NOME: 'Negozio 2', V: 2, LAT: 45.5, LNG: 9.3 },
      ]);
      const r = await render({
        ...EXTERNAL,
        mapCenterLat: 45.46,
        mapCenterLng: 9.19,
        metrics: [{ ...POPOLAZIONE, displayType: 'MARKER' }],
      });
      await until(r, () => r.el.querySelectorAll('img.leaflet-marker-icon').length === 2);
      expect(r.el.querySelector('.marker-cluster')).toBeNull();
      expect(r.el.querySelector('sadas-map-legend')).toBeNull(); // niente legenda per i marcatori
    });

    it('le righe con coordinate non valide sono record senza area', async () => {
      backend.query = ok([
        { NOME: 'Valido', V: 1, LAT: '45,46', LNG: '9,19' },
        { NOME: 'Testo', V: 2, LAT: 'abc', LNG: '9,19' },
        { NOME: 'Fuori intervallo', V: 3, LAT: '95', LNG: '9,19' },
      ]);
      const r = await render({ ...EXTERNAL, metrics: [{ ...POPOLAZIONE, displayType: 'BUBBLE' }] });
      await until(r, () => text(r, '.sadas-map__notice')?.includes('2 record senza area corrispondente'));
      expect(bubbles(r)).toHaveLength(1);
    });
  });
});
