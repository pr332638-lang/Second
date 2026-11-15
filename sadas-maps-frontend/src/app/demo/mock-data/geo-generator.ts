/**
 * GEOMETRIE SIMULATE per il prototipo.
 *
 * Non sono confini reali: regioni, province e comuni FITTIZI ricavati da una griglia irregolare
 * sopra l'area dell'Italia. Riproducono però le caratteristiche dei dati veri delle tabelle SBI:
 *
 * - gerarchia: 20 regioni → 120 province → 7.680 comuni (più un'enclave), come l'ordine di grandezza reale;
 * - aree confinanti con confini condivisi IDENTICI (una copertura senza fessure), a ogni livello;
 * - quattro livelli di dettaglio L0–L3 (da pochi punti a molti), come farebbe il back-end con la semplificazione;
 * - due IdArea per ogni entità, uno per il confine e uno per il punto centrale (come IdArea_Poligono / IdArea_Punto);
 * - un comune con un'enclave (Polygon con un buco, InOut = 'I') e una regione con un'isola (MultiPolygon).
 *
 * Tutto è deterministico: a parità di codice, gli stessi numeri a ogni avvio.
 * Funzioni pure, senza Angular né Leaflet, per poterle provare da sole (geo-generator.spec.ts).
 */
import type { GeometryLevel } from '../../maps/maps.models';
import type { AreaFeature } from '../../maps/utils/geometry-cache';

// -----------------------------------------------------------------------------
// Griglia
// -----------------------------------------------------------------------------

/** Area coperta dalla griglia, circa l'Italia: longitudine 6,6–18,6 e latitudine 36,6–47,1. */
export const GRID = { west: 6.6, east: 18.6, south: 36.6, north: 47.1, cols: 80, rows: 96 } as const;

const REGION_COLS = 5;
const REGION_ROWS = 4;
const PROVINCES_PER_REGION_COLS = 2;
const PROVINCES_PER_REGION_ROWS = 3;
const COMUNI_PER_PROVINCE_SIDE = 8;
const REGION_CELL_COLS = PROVINCES_PER_REGION_COLS * COMUNI_PER_PROVINCE_SIDE; // 16
const REGION_CELL_ROWS = PROVINCES_PER_REGION_ROWS * COMUNI_PER_PROVINCE_SIDE; // 24

const DX = (GRID.east - GRID.west) / GRID.cols;
const DY = (GRID.north - GRID.south) / GRID.rows;

/** Punti intermedi di ogni lato di cella al livello più dettagliato (L3). */
const EDGE_DETAIL = 11;
/** Quali punti intermedi tenere per livello: sempre un sottoinsieme degli stessi, così i confini restano condivisi. */
const EDGE_POINTS_BY_LEVEL: Record<Exclude<GeometryLevel, 'POINT'>, readonly number[]> = {
  L0: [],
  L1: [6],
  L2: [3, 6, 9],
  L3: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};
/** Per le aree più grandi di una cella: ogni quanti nodi della griglia tenerne uno lungo il confine. */
const NODE_STEP_BY_LEVEL: Record<Exclude<GeometryLevel, 'POINT'>, number> = { L0: 4, L1: 2, L2: 1, L3: 1 };

export type Position = [number, number]; // [lng, lat], come in GeoJSON

// -----------------------------------------------------------------------------
// Numeri pseudo-casuali deterministici
// -----------------------------------------------------------------------------

/** Numero tra 0 e 1 che dipende solo dagli interi passati: sempre lo stesso per gli stessi argomenti. */
export function hash01(...values: number[]): number {
  let h = 2166136261;
  for (const v of values) {
    h ^= v | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

// -----------------------------------------------------------------------------
// Nodi e lati della griglia
// -----------------------------------------------------------------------------

/** Nodo (i, j) della griglia, spostato in modo irregolare tranne sul bordo esterno. */
function node(i: number, j: number): Position {
  let lng = GRID.west + i * DX;
  let lat = GRID.south + j * DY;
  if (i > 0 && i < GRID.cols && j > 0 && j < GRID.rows) {
    lng += (hash01(1, i, j) - 0.5) * 0.5 * DX;
    lat += (hash01(2, i, j) - 0.5) * 0.5 * DY;
  }
  return [lng, lat];
}

/**
 * Punti intermedi di un lato, nel verso "canonico":
 * - lato orizzontale 'h' (i, j): dal nodo (i, j) al nodo (i+1, j);
 * - lato verticale 'v' (i, j): dal nodo (i, j) al nodo (i, j+1).
 * Il lato ondeggia leggermente, così le aree non sembrano rettangoli.
 * Le due aree che condividono un lato usano gli stessi punti, una nel verso opposto all'altra.
 */
function edgeInterior(kind: 'h' | 'v', i: number, j: number, indices: readonly number[]): Position[] {
  const a = node(i, j);
  const b = kind === 'h' ? node(i + 1, j) : node(i, j + 1);
  const k = kind === 'h' ? 0 : 1;
  const freq = 1 + Math.floor(hash01(3, k, i, j) * 3);
  const phase = hash01(4, k, i, j);
  return indices.map((m) => {
    const t = m / (EDGE_DETAIL + 1);
    const wave = Math.sin(Math.PI * t) * Math.sin(2 * Math.PI * (t * freq + phase));
    const lng = a[0] + (b[0] - a[0]) * t + (kind === 'v' ? wave * 0.12 * DX : 0);
    const lat = a[1] + (b[1] - a[1]) * t + (kind === 'h' ? wave * 0.12 * DY : 0);
    return [lng, lat] as Position;
  });
}

/**
 * Anello del confine di un blocco di celle [c0, c1) × [r0, r1), in senso antiorario (RFC 7946).
 * Nei blocchi grandi, ai livelli bassi, si tiene un nodo ogni `step`: la scelta dipende dalla posizione
 * assoluta del nodo, quindi due blocchi vicini tengono gli stessi nodi sul confine comune.
 */
function blockRing(c0: number, r0: number, c1: number, r1: number, level: Exclude<GeometryLevel, 'POINT'>): Position[] {
  const single = c1 - c0 === 1 && r1 - r0 === 1;
  const step = single ? 1 : NODE_STEP_BY_LEVEL[level];
  const indices = step > 1 ? [] : EDGE_POINTS_BY_LEVEL[level];
  const keepI = (i: number) => i === c0 || i === c1 || i % step === 0;
  const keepJ = (j: number) => j === r0 || j === r1 || j % step === 0;

  const ring: Position[] = [];
  for (let i = c0; i < c1; i++) {
    if (keepI(i)) ring.push(node(i, r0));
    ring.push(...edgeInterior('h', i, r0, indices));
  }
  for (let j = r0; j < r1; j++) {
    if (keepJ(j)) ring.push(node(c1, j));
    ring.push(...edgeInterior('v', c1, j, indices));
  }
  for (let i = c1 - 1; i >= c0; i--) {
    if (keepI(i + 1)) ring.push(node(i + 1, r1));
    ring.push(...edgeInterior('h', i, r1, indices).reverse());
  }
  for (let j = r1 - 1; j >= r0; j--) {
    if (keepJ(j + 1)) ring.push(node(c0, j + 1));
    ring.push(...edgeInterior('v', c0, j, indices).reverse());
  }
  ring.push(ring[0]!);
  return ring.map(([x, y]) => [round5(x), round5(y)] as Position);
}

/** Punto di una cella in coordinate relative (u, v da 0 a 1), interpolando i suoi quattro nodi. */
function cellPoint(col: number, row: number, u: number, v: number): Position {
  const a = node(col, row);
  const b = node(col + 1, row);
  const c = node(col + 1, row + 1);
  const d = node(col, row + 1);
  const lng = (1 - u) * (1 - v) * a[0] + u * (1 - v) * b[0] + u * v * c[0] + (1 - u) * v * d[0];
  const lat = (1 - u) * (1 - v) * a[1] + u * (1 - v) * b[1] + u * v * c[1] + (1 - u) * v * d[1];
  return [round5(lng), round5(lat)];
}

// -----------------------------------------------------------------------------
// Casi particolari: enclave e isola
// -----------------------------------------------------------------------------

/** Cella del comune che contiene un'enclave (regione H, provincia H3). */
const ENCLAVE_HOST_CELL = { col: 35, row: 35 } as const;
/** Cella del comune a cui appartiene l'isola (regione A, provincia A1). */
const ISLAND_CELL = { col: 0, row: 0 } as const;

/** Bordo del buco/enclave: senso orario, come deve essere un buco in GeoJSON. */
function enclaveHoleRing(): Position[] {
  const { col, row } = ENCLAVE_HOST_CELL;
  const ring = [
    cellPoint(col, row, 0.3, 0.3),
    cellPoint(col, row, 0.3, 0.7),
    cellPoint(col, row, 0.7, 0.7),
    cellPoint(col, row, 0.7, 0.3),
  ];
  return [...ring, ring[0]!];
}

/** Isola a sud-ovest della griglia, con più punti ai livelli più dettagliati. Senso antiorario. */
function islandRing(level: Exclude<GeometryLevel, 'POINT'>): Position[] {
  const n = { L0: 6, L1: 8, L2: 12, L3: 24 }[level];
  const center: Position = [GRID.west + 0.6, GRID.south - 0.45];
  const ring: Position[] = [];
  for (let k = 0; k < n; k++) {
    const angle = (2 * Math.PI * k) / n;
    const wobble = 1 + 0.12 * Math.sin(angle * 3);
    ring.push([round5(center[0] + Math.cos(angle) * 0.28 * wobble), round5(center[1] + Math.sin(angle) * 0.2 * wobble)]);
  }
  return [...ring, ring[0]!];
}

// -----------------------------------------------------------------------------
// Anagrafica delle aree (come REGIONI_SBI, PROVINCE_SBI, COMUNI_SBI)
// -----------------------------------------------------------------------------

export type AreaKind = 'regione' | 'provincia' | 'comune' | 'enclave';

export interface AreaDef {
  kind: AreaKind;
  /** IdArea del confine (IdArea_Poligono). */
  polygonId: number;
  /** IdArea del punto centrale (IdArea_Punto). */
  pointId: number;
  name: string;
  /** Blocco di celle coperto: colonne [c0, c1), righe [r0, r1). Per l'enclave, la cella che la contiene. */
  block: { c0: number; r0: number; c1: number; r1: number };
  regionIndex: number;
  provinceIndex: number | null;
  /** Macroarea simulata: Nord, Centro, Sud, Isole. */
  macroarea: string;
}

const MACROAREE = ['Isole', 'Sud', 'Centro', 'Nord'] as const;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const REGION_COUNT = REGION_COLS * REGION_ROWS;
export const PROVINCE_COUNT = REGION_COUNT * PROVINCES_PER_REGION_COLS * PROVINCES_PER_REGION_ROWS;
export const ENCLAVE_POLYGON_ID = 300001;
export const ENCLAVE_POINT_ID = 300002;

export interface Registry {
  regions: AreaDef[];
  provinces: AreaDef[];
  comuni: AreaDef[];
  byPolygonId: Map<number, AreaDef>;
  byPointId: Map<number, AreaDef>;
}

let registry: Registry | null = null;

/** Tutte le aree simulate. Costruite una volta sola, alla prima richiesta. */
export function areaRegistry(): Registry {
  if (registry) return registry;

  const regions: AreaDef[] = [];
  const provinces: AreaDef[] = [];
  const comuni: AreaDef[] = [];

  for (let r = 0; r < REGION_COUNT; r++) {
    const rc = r % REGION_COLS;
    const rr = Math.floor(r / REGION_COLS);
    const letter = LETTERS[r]!;
    regions.push({
      kind: 'regione',
      polygonId: 1001 + r,
      pointId: 2001 + r,
      name: `Regione ${letter}`,
      block: { c0: rc * REGION_CELL_COLS, r0: rr * REGION_CELL_ROWS, c1: (rc + 1) * REGION_CELL_COLS, r1: (rr + 1) * REGION_CELL_ROWS },
      regionIndex: r,
      provinceIndex: null,
      macroarea: MACROAREE[rr]!,
    });

    for (let pr = 0; pr < PROVINCES_PER_REGION_ROWS; pr++) {
      for (let pc = 0; pc < PROVINCES_PER_REGION_COLS; pc++) {
        const p = r * PROVINCES_PER_REGION_COLS * PROVINCES_PER_REGION_ROWS + pr * PROVINCES_PER_REGION_COLS + pc;
        const c0 = rc * REGION_CELL_COLS + pc * COMUNI_PER_PROVINCE_SIDE;
        const r0 = rr * REGION_CELL_ROWS + pr * COMUNI_PER_PROVINCE_SIDE;
        const provinceName = `${letter}${pr * PROVINCES_PER_REGION_COLS + pc + 1}`;
        provinces.push({
          kind: 'provincia',
          polygonId: 10001 + p,
          pointId: 20001 + p,
          name: `Provincia ${provinceName}`,
          block: { c0, r0, c1: c0 + COMUNI_PER_PROVINCE_SIDE, r1: r0 + COMUNI_PER_PROVINCE_SIDE },
          regionIndex: r,
          provinceIndex: p,
          macroarea: MACROAREE[rr]!,
        });

        for (let y = 0; y < COMUNI_PER_PROVINCE_SIDE; y++) {
          for (let x = 0; x < COMUNI_PER_PROVINCE_SIDE; x++) {
            const col = c0 + x;
            const row = r0 + y;
            const k = row * GRID.cols + col;
            comuni.push({
              kind: 'comune',
              polygonId: 100001 + k,
              pointId: 200001 + k,
              name: `Comune ${provinceName}-${String(y * COMUNI_PER_PROVINCE_SIDE + x + 1).padStart(2, '0')}`,
              block: { c0: col, r0: row, c1: col + 1, r1: row + 1 },
              regionIndex: r,
              provinceIndex: p,
              macroarea: MACROAREE[rr]!,
            });
          }
        }
      }
    }
  }

  // Enclave: un comune interamente circondato da un altro.
  const host = comuni.find((c) => c.block.c0 === ENCLAVE_HOST_CELL.col && c.block.r0 === ENCLAVE_HOST_CELL.row)!;
  comuni.push({
    ...host,
    kind: 'enclave',
    polygonId: ENCLAVE_POLYGON_ID,
    pointId: ENCLAVE_POINT_ID,
    name: `Enclave di ${host.name.replace('Comune ', '')}`,
  });

  const byPolygonId = new Map<number, AreaDef>();
  const byPointId = new Map<number, AreaDef>();
  for (const a of [...regions, ...provinces, ...comuni]) {
    byPolygonId.set(a.polygonId, a);
    byPointId.set(a.pointId, a);
  }
  registry = { regions, provinces, comuni, byPolygonId, byPointId };
  return registry;
}

// -----------------------------------------------------------------------------
// Geometrie
// -----------------------------------------------------------------------------

function containsCell(a: AreaDef, cell: { col: number; row: number }): boolean {
  return a.block.c0 <= cell.col && cell.col < a.block.c1 && a.block.r0 <= cell.row && cell.row < a.block.r1;
}

/** Coordinate GeoJSON del confine di un'area al livello richiesto. */
function polygonGeometry(a: AreaDef, level: Exclude<GeometryLevel, 'POINT'>): AreaFeature['geometry'] {
  if (a.kind === 'enclave') {
    return { type: 'Polygon', coordinates: [[...enclaveHoleRing()].reverse()] };
  }
  const outer = blockRing(a.block.c0, a.block.r0, a.block.c1, a.block.r1, level);
  if (a.kind === 'comune' && containsCell(a, ENCLAVE_HOST_CELL)) {
    return { type: 'Polygon', coordinates: [outer, enclaveHoleRing()] }; // confine esterno + buco
  }
  if (containsCell(a, ISLAND_CELL)) {
    return { type: 'MultiPolygon', coordinates: [[outer], [islandRing(level)]] }; // terraferma + isola
  }
  return { type: 'Polygon', coordinates: [outer] };
}

/** Punto centrale: centro del blocco, spostato per il comune con l'enclave (altrimenti cadrebbe dentro). */
function pointPosition(a: AreaDef): Position {
  const { c0, r0, c1, r1 } = a.block;
  if (a.kind === 'enclave') return cellPoint(c0, r0, 0.5, 0.5);
  if (a.kind === 'comune' && containsCell(a, ENCLAVE_HOST_CELL)) return cellPoint(c0, r0, 0.15, 0.15);
  if (c1 - c0 === 1) return cellPoint(c0, r0, 0.5, 0.5);
  const midC = Math.floor((c0 + c1) / 2);
  const midR = Math.floor((r0 + r1) / 2);
  return cellPoint(midC, midR, 0, 0);
}

const geometryCache = new Map<string, AreaFeature>();

/**
 * Feature GeoJSON di un IdArea al livello richiesto, come la restituirebbe il back-end.
 * POINT vuole un IdArea_Punto; L0–L3 un IdArea_Poligono. Negli altri casi null (area inesistente).
 */
export function featureFor(id: number, level: GeometryLevel): AreaFeature | null {
  const key = `${id}|${level}`;
  const cached = geometryCache.get(key);
  if (cached) return cached;

  const reg = areaRegistry();
  let feature: AreaFeature | null = null;
  if (level === 'POINT') {
    const a = reg.byPointId.get(id);
    if (a) feature = { type: 'Feature', id, properties: { label: a.name }, geometry: { type: 'Point', coordinates: pointPosition(a) } };
  } else {
    const a = reg.byPolygonId.get(id);
    if (a) feature = { type: 'Feature', id, properties: { label: a.name }, geometry: polygonGeometry(a, level) };
  }
  if (feature) geometryCache.set(key, feature);
  return feature;
}

/** Rettangolo [ovest, sud, est, nord] di un'area (come MinLng/MinLat/MaxLng/MaxLat di POLYGONS_SBI). */
export function bboxOf(feature: AreaFeature): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const visit = (p: Position) => {
    if (p[0] < w) w = p[0];
    if (p[0] > e) e = p[0];
    if (p[1] < s) s = p[1];
    if (p[1] > n) n = p[1];
  };
  const g = feature.geometry;
  if (g.type === 'Point') visit(g.coordinates as Position);
  else if (g.type === 'Polygon') g.coordinates.forEach((ring) => ring.forEach((p) => visit(p as Position)));
  else if (g.type === 'MultiPolygon') g.coordinates.forEach((poly) => poly.forEach((ring) => ring.forEach((p) => visit(p as Position))));
  return [w, s, e, n];
}

export function bboxIntersects(a: readonly number[], b: readonly number[]): boolean {
  return a[0]! <= b[2]! && b[0]! <= a[2]! && a[1]! <= b[3]! && b[1]! <= a[3]!;
}

/** Superficie approssimata in km² (formula dell'area di Gauss su coordinate proiettate in modo semplice). */
export function areaKm2(a: AreaDef): number {
  const g = polygonGeometry(a, 'L2');
  const ringArea = (ring: readonly Position[]) => {
    let sum = 0;
    for (let k = 0; k < ring.length - 1; k++) {
      const [x1, y1] = ring[k]!;
      const [x2, y2] = ring[k + 1]!;
      sum += x1 * y2 - x2 * y1;
    }
    const meanLat = ring.reduce((acc, p) => acc + p[1], 0) / ring.length;
    return (Math.abs(sum) / 2) * 111.32 * 111.32 * Math.cos((meanLat * Math.PI) / 180);
  };
  const polygons = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];
  let total = 0;
  for (const poly of polygons) {
    poly.forEach((ring, idx) => {
      const area = ringArea(ring as Position[]);
      total += idx === 0 ? area : -area; // i buchi si sottraggono
    });
  }
  return total;
}

/** Cella (colonna, riga) che contiene un punto, o null se è fuori dalla griglia. */
export function cellAt(lng: number, lat: number): { col: number; row: number } | null {
  const col = Math.floor((lng - GRID.west) / DX);
  const row = Math.floor((lat - GRID.south) / DY);
  if (col < 0 || col >= GRID.cols || row < 0 || row >= GRID.rows) return null;
  return { col, row };
}

/** Coordinate approssimate del centro di una cella (senza irregolarità), per generare punti vicini. */
export function cellCenter(col: number, row: number): Position {
  return [GRID.west + (col + 0.5) * DX, GRID.south + (row + 0.5) * DY];
}

export const CELL_SIZE = { dx: DX, dy: DY } as const;
