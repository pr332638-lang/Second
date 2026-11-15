import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { bboxIntersects, type Bbox } from './geo';

/** Feature GeoJSON di un'area: id = AREAS_SBI.IdArea, properties.label = AREAS_SBI.Label. */
export type AreaFeature = Feature<Geometry, { label?: string }>;

/** Risposta del back-end alla richiesta di geometrie. */
export interface GeometriesResponse extends FeatureCollection<Geometry, { label?: string }> {
  /**
   * IdArea richiesti che non esistono, o che non sono del tipo chiesto (un confine chiesto come punto
   * o viceversa). IdArea è un intero nel database: in JSON può arrivare come numero o come testo.
   */
  notFound?: ReadonlyArray<string | number>;
  /**
   * Aree esistenti ma escluse perché fuori dal bbox della richiesta, con il loro rettangolo
   * [ovest, sud, est, nord]. Il front-end le richiede solo quando la vista le raggiunge.
   */
  outside?: Readonly<Record<string, Readonly<Bbox>>>;
}

/** Tipo di geometria: punti centrali o confini. Gli IdArea inesistenti si ricordano per tipo. */
export type GeometryKind = 'POINT' | 'POLYGON';

/**
 * Quello che il front-end sa delle geometrie di una connessione, oltre alle geometrie stesse.
 * - notFound: IdArea inesistenti, separati per tipo;
 * - extents: rettangolo delle aree poligonali già viste fuori vista (non dipende dal livello).
 */
export interface GeometryKnowledge {
  notFound: Record<GeometryKind, Set<string>>;
  extents: Map<string, Readonly<Bbox>>;
}

export function emptyKnowledge(): GeometryKnowledge {
  return { notFound: { POINT: new Set(), POLYGON: new Set() }, extents: new Map() };
}

/**
 * Chiave di cache di un IdArea: sempre testo, così 1203, "1203", " 1203 " e "1203.0" sono la stessa area.
 * null per valori assenti o vuoti, che non vanno salvati.
 *
 * Gli interi scritti come decimali ("1203.0", "1203,00") capitano con colonne numeriche convertite in testo:
 * senza normalizzarli l'area verrebbe chiesta come "1203.0", il back-end risponderebbe con 1203
 * e la richiesta si ripeterebbe a ogni spostamento della mappa.
 */
export function areaKey(id: unknown): string | null {
  if (id === undefined || id === null) return null;
  const key = String(id).trim();
  if (key === '') return null;
  // Solo forme non ambigue: ".0" (come Double.toString in Java) e ",0"/",00". "1.000" resta com'è,
  // perché in italiano è mille.
  const integerAsDecimal = /^(-?\d+)(?:\.0|,00?)$/.exec(key);
  return integerAsDecimal ? integerAsDecimal[1]! : key;
}

/**
 * IdArea da chiedere al back-end: senza doppioni, non già in memoria per quel livello, non noti come
 * inesistenti per quel tipo e, se c'è un bbox, non già noti come fuori vista.
 * Un'area di cui si conosce il rettangolo si chiede solo quando il rettangolo tocca la vista.
 */
export function idsToRequest(
  keys: readonly string[],
  levelCache: ReadonlyMap<string, AreaFeature>,
  knowledge: GeometryKnowledge,
  kind: GeometryKind,
  bbox?: Readonly<Bbox>,
): string[] {
  const notFound = knowledge.notFound[kind];
  const result: string[] = [];
  for (const key of new Set(keys)) {
    if (levelCache.has(key) || notFound.has(key)) continue;
    const extent = bbox ? knowledge.extents.get(key) : undefined;
    if (extent && bbox && !bboxIntersects(extent, bbox)) continue;
    result.push(key);
  }
  return result;
}

/** Divide un elenco in blocchi di al massimo `size` elementi (il back-end limita gli IdArea per richiesta). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const blocks: T[][] = [];
  const step = Math.max(1, Math.floor(size));
  for (let i = 0; i < items.length; i += step) blocks.push(items.slice(i, i + step));
  return blocks;
}

/**
 * Salva in memoria la risposta del back-end.
 *
 * - le geometrie vanno nel dizionario del livello richiesto;
 * - gli IdArea inesistenti vanno nell'insieme `notFound` del tipo richiesto, per non richiederli più;
 * - le aree fuori vista lasciano il loro rettangolo, per richiederle solo quando servono.
 *
 * Gli IdArea vengono sempre convertiti in testo con `areaKey`: senza questa conversione un `notFound`
 * numerico (9999) non verrebbe trovato cercando il testo "9999", e l'area verrebbe richiesta
 * di nuovo a ogni spostamento della mappa.
 *
 * Restituisce true se è cambiato qualcosa che si vede (serve ridisegnare). I rettangoli delle aree
 * fuori vista non cambiano il disegno.
 */
export function mergeGeometriesResponse(
  levelCache: Map<string, AreaFeature>,
  knowledge: GeometryKnowledge,
  kind: GeometryKind,
  response: GeometriesResponse,
): boolean {
  let changed = false;
  for (const feature of response.features ?? []) {
    const key = areaKey(feature.id);
    if (key === null) continue;
    levelCache.set(key, feature as AreaFeature);
    changed = true;
  }
  const notFound = knowledge.notFound[kind];
  for (const id of response.notFound ?? []) {
    const key = areaKey(id);
    if (key === null || notFound.has(key)) continue;
    notFound.add(key);
    changed = true;
  }
  for (const [id, extent] of Object.entries(response.outside ?? {})) {
    const key = areaKey(id);
    if (key !== null && Array.isArray(extent) && extent.length === 4 && extent.every(Number.isFinite)) {
      knowledge.extents.set(key, extent);
    }
  }
  return changed;
}
