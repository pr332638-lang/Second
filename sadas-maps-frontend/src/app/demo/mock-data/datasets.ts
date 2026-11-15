/**
 * DATI SIMULATI delle query del prototipo: quello che restituirebbe il back-end eseguendo
 * PreQuery e Query di ogni componente. Valori inventati ma plausibili (popolazione, densità, fatturato),
 * deterministici. Funzioni pure, senza Angular.
 */
import type { GeometryLevel, MapsQueryResult, QueryRow } from '../../maps/maps.models';
import type { GeometriesResponse } from '../../maps/utils/geometry-cache';
import {
  CELL_SIZE,
  GRID,
  areaKm2,
  areaRegistry,
  bboxIntersects,
  bboxOf,
  cellAt,
  cellCenter,
  featureFor,
  hash01,
  type AreaDef,
} from './geo-generator';

/** ID dei componenti degli scenari: il back-end simulato sceglie i dati in base a questi. */
export const DEMO_IDS = {
  regioni: 'demo-regioni',
  province: 'demo-province',
  comuniRegione: 'demo-comuni-regione',
  comuniTutti: 'demo-comuni-tutti',
  negozi: 'demo-negozi',
} as const;

/** IdArea che non esistono nelle tabelle simulate: servono a provare i "record senza area corrispondente". */
export const MISSING_POLYGON_ID = 1999;
export const MISSING_POINT_ID = 2999;

// -----------------------------------------------------------------------------
// Popolazione simulata
// -----------------------------------------------------------------------------

/** "Città" simulate: celle con molta popolazione, che decresce allontanandosi. */
const CITIES = Array.from({ length: 14 }, (_, k) => ({
  col: Math.floor(hash01(10, k) * GRID.cols),
  row: Math.floor(hash01(11, k) * GRID.rows),
  size: 40_000 + Math.floor(hash01(12, k) * 260_000),
}));

function comunePopulation(col: number, row: number): number {
  let pop = 400 + Math.floor(hash01(13, col, row) * 6_000);
  for (const c of CITIES) {
    const d2 = (c.col - col) ** 2 + (c.row - row) ** 2;
    pop += c.size * Math.exp(-d2 / 4.5);
  }
  return Math.round(pop);
}

interface AreaStats {
  population: number;
  areaKm2: number;
}

let statsCache: Map<number, AreaStats> | null = null;

/** Popolazione e superficie di ogni area (per regioni e province: somma dei loro comuni). */
function areaStats(): Map<number, AreaStats> {
  if (statsCache) return statsCache;
  const reg = areaRegistry();
  const stats = new Map<number, AreaStats>();
  const add = (id: number, population: number, km2: number) => {
    const s = stats.get(id) ?? { population: 0, areaKm2: 0 };
    s.population += population;
    s.areaKm2 += km2;
    stats.set(id, s);
  };
  for (const c of reg.comuni) {
    const population = c.kind === 'enclave' ? 2_850 : comunePopulation(c.block.c0, c.block.r0);
    const km2 = areaKm2(c);
    add(c.polygonId, population, km2);
    add(reg.regions[c.regionIndex]!.polygonId, population, km2);
    if (c.provinceIndex !== null) add(reg.provinces[c.provinceIndex]!.polygonId, population, km2);
  }
  statsCache = stats;
  return stats;
}

/** Riga di query per un'area, con le colonne che userebbe una query reale. */
function areaRow(a: AreaDef): MutableRow {
  const s = areaStats().get(a.polygonId)!;
  const density = s.population / s.areaKm2;
  return {
    IDAREA_POLIGONO: a.polygonId,
    IDAREA_PUNTO: a.pointId,
    NOME: a.name,
    MACROAREA: a.macroarea,
    POPOLAZIONE: s.population,
    SUPERFICIE_KM2: Math.round(s.areaKm2 * 10) / 10,
    DENSITA: Math.round(density * 10) / 10,
  };
}

/**
 * Classe di densità con il colore già calcolato: simula il risultato di un'espressione
 * Map Current Color eseguita dal back-end.
 */
function densityClass(density: number): { CLASSE: string; COLORE: string } {
  if (density < 60) return { CLASSE: 'Bassa', COLORE: '#a6d96a' };
  if (density < 150) return { CLASSE: 'Media', COLORE: '#fdae61' };
  return { CLASSE: 'Alta', COLORE: '#d7191c' };
}

// -----------------------------------------------------------------------------
// Scenari
// -----------------------------------------------------------------------------

type MutableRow = Record<string, unknown>;

function filterByMacroarea(rows: readonly QueryRow[], params: Readonly<Record<string, unknown>>): QueryRow[] {
  const m = params['MACROAREA'];
  return typeof m === 'string' && m !== '' ? rows.filter((r) => r['MACROAREA'] === m) : [...rows];
}

function regioniRows(params: Readonly<Record<string, unknown>>): QueryRow[] {
  const rows: MutableRow[] = areaRegistry().regions.map((a) => {
    const row = areaRow(a);
    return { ...row, ...densityClass(row['DENSITA'] as number) };
  });
  // Una riga con un IdArea inesistente, come capita con dati sporchi o tabelle non aggiornate.
  rows.push({
    IDAREA_POLIGONO: MISSING_POLYGON_ID,
    IDAREA_PUNTO: MISSING_POINT_ID,
    NOME: 'Regione inesistente',
    MACROAREA: 'Nord',
    POPOLAZIONE: 100_000,
    SUPERFICIE_KM2: 1_000,
    DENSITA: 100,
    CLASSE: 'Media',
    COLORE: '#fdae61',
  });
  return filterByMacroarea(rows, params);
}

function provinceRows(params: Readonly<Record<string, unknown>>): QueryRow[] {
  const reg = areaRegistry();
  const rows: MutableRow[] = reg.provinces.map((a) => ({
    ...areaRow(a),
    REGIONE: reg.regions[a.regionIndex]!.name,
    SIGLA: a.name.replace('Provincia ', ''),
  }));
  return filterByMacroarea(rows, params);
}

function comuniRows(regionPolygonId: number | null): QueryRow[] {
  const reg = areaRegistry();
  return reg.comuni
    .filter((c) => regionPolygonId === null || reg.regions[c.regionIndex]!.polygonId === regionPolygonId)
    .map((c) => ({
      ...areaRow(c),
      REGIONE: reg.regions[c.regionIndex]!.name,
      PROVINCIA: c.provinceIndex !== null ? reg.provinces[c.provinceIndex]!.name : '',
    }));
}

const CATEGORIES = ['Alimentari', 'Abbigliamento', 'Elettronica', 'Casa', 'Farmacia'] as const;
export const NEGOZI_COUNT = 2_500;
/** Righe con coordinate non valide (vuote, testo, fuori intervallo): devono finire tra i "record senza area". */
export const NEGOZI_INVALID_COUNT = 6;

let negoziCache: QueryRow[] | null = null;

/**
 * Punti esterni (External point = Sì): negozi con coordinate scritte come TESTO con la virgola
 * decimale, come può succedere con dati importati da CSV o Excel.
 */
function negoziRows(params: Readonly<Record<string, unknown>>): QueryRow[] {
  if (!negoziCache) {
    const reg = areaRegistry();
    const rows: QueryRow[] = [];
    for (let k = 0; k < NEGOZI_COUNT; k++) {
      // Metà dei negozi vicino alle "città", metà sparsi.
      const city = CITIES[Math.floor(hash01(20, k) * CITIES.length)]!;
      const near = hash01(21, k) < 0.5;
      const col = near ? city.col + (hash01(22, k) - 0.5) * 6 : hash01(23, k) * GRID.cols;
      const row = near ? city.row + (hash01(24, k) - 0.5) * 6 : hash01(25, k) * GRID.rows;
      const [lng, lat] = cellCenter(Math.min(Math.max(col, 0), GRID.cols - 1), Math.min(Math.max(row, 0), GRID.rows - 1));
      const jLng = lng + (hash01(26, k) - 0.5) * CELL_SIZE.dx;
      const jLat = lat + (hash01(27, k) - 0.5) * CELL_SIZE.dy;
      const cell = cellAt(jLng, jLat);
      const region = cell
        ? reg.regions.find((r) => r.block.c0 <= cell.col && cell.col < r.block.c1 && r.block.r0 <= cell.row && cell.row < r.block.r1)
        : undefined;
      rows.push({
        INSEGNA: `Negozio ${String(k + 1).padStart(4, '0')}`,
        CATEGORIA: CATEGORIES[Math.floor(hash01(28, k) * CATEGORIES.length)]!,
        MACROAREA: region?.macroarea ?? 'Isole',
        LAT: jLat.toFixed(5).replace('.', ','),
        LNG: jLng.toFixed(5).replace('.', ','),
        FATTURATO: Math.round(50_000 + hash01(29, k) * 1_950_000),
      });
    }
    const invalid: Array<[unknown, unknown]> = [
      ['', ''],
      ['abc', '12,5'],
      ['95,0', '12,5'],
      ['41,9', '200,0'],
      [null, null],
      ['41,9', undefined],
    ];
    invalid.forEach(([lat, lng], k) =>
      rows.push({
        INSEGNA: `Negozio con coordinate errate ${k + 1}`,
        CATEGORIA: 'Casa',
        MACROAREA: 'Centro',
        LAT: lat,
        LNG: lng,
        FATTURATO: 100_000,
      }),
    );
    negoziCache = rows;
  }
  return filterByMacroarea(negoziCache, params);
}

/**
 * Esegue "PreQuery + Query" simulate per un componente.
 * Lo scenario dei comuni di una regione ha una PreQuery che fallisce se manca il filtro REGIONE.
 */
export function runMockQuery(componentId: string, params: Readonly<Record<string, unknown>>): MapsQueryResult {
  switch (componentId) {
    case DEMO_IDS.regioni:
      return { preQueryOk: true, rows: regioniRows(params) };
    case DEMO_IDS.province:
      return { preQueryOk: true, rows: provinceRows(params) };
    case DEMO_IDS.comuniRegione: {
      const region = Number(params['REGIONE']);
      if (!Number.isFinite(region) || region <= 0) {
        return { preQueryOk: false, message: 'Selezionare una regione per vedere i suoi comuni.', rows: [] };
      }
      return { preQueryOk: true, rows: comuniRows(region) };
    }
    case DEMO_IDS.comuniTutti:
      return { preQueryOk: true, rows: comuniRows(null) };
    case DEMO_IDS.negozi:
      return { preQueryOk: true, rows: negoziRows(params) };
    default:
      return { preQueryOk: false, message: `Componente sconosciuto al back-end simulato: ${componentId}`, rows: [] };
  }
}

/**
 * Geometrie simulate, con le stesse regole proposte per il back-end vero:
 * - POINT → punti centrali, L0–L3 → confini al livello di dettaglio richiesto;
 * - con il bbox si restituiscono solo i confini che lo intersecano;
 * - gli IdArea inesistenti finiscono in `notFound`, come numeri (IdArea è un intero nel database).
 */
export function runMockGeometries(
  ids: readonly (string | number)[],
  level: GeometryLevel,
  bbox?: readonly number[],
): GeometriesResponse {
  const features: GeometriesResponse['features'] = [];
  const notFound: number[] = [];
  for (const raw of ids) {
    const id = Number(raw);
    const feature = Number.isInteger(id) ? featureFor(id, level) : null;
    if (!feature) {
      if (Number.isInteger(id)) notFound.push(id);
      continue;
    }
    if (level !== 'POINT' && bbox && bbox.length === 4 && !bboxIntersects(bboxOf(feature), bbox)) continue;
    features.push(feature);
  }
  return { type: 'FeatureCollection', features, notFound };
}
