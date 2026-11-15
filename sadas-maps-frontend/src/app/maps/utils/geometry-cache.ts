import type { Feature, FeatureCollection, Geometry } from 'geojson';

/** Feature GeoJSON di un'area: id = AREAS_SBI.IdArea, properties.label = AREAS_SBI.Label. */
export type AreaFeature = Feature<Geometry, { label?: string }>;

/** Risposta del back-end alla richiesta di geometrie. */
export interface GeometriesResponse extends FeatureCollection<Geometry, { label?: string }> {
  /**
   * IdArea richiesti che non esistono in AREAS_SBI (indipendentemente dal bbox).
   * IdArea è un intero nel database: in JSON può arrivare come numero o come testo.
   */
  notFound?: ReadonlyArray<string | number>;
}

/**
 * Chiave di cache di un IdArea: sempre testo, così 1203 e "1203" sono la stessa area.
 * null per valori assenti o vuoti, che non vanno salvati.
 */
export function areaKey(id: unknown): string | null {
  if (id === undefined || id === null) return null;
  const key = String(id).trim();
  return key === '' ? null : key;
}

/**
 * Salva in memoria la risposta del back-end.
 *
 * - le geometrie vanno nel dizionario del livello richiesto;
 * - gli IdArea inesistenti vanno nell'insieme `notFound`, per non richiederli più.
 *
 * Gli IdArea vengono sempre convertiti in testo con `areaKey`: senza questa conversione un `notFound`
 * numerico (9999) non verrebbe trovato cercando il testo "9999", e l'area verrebbe richiesta
 * di nuovo a ogni spostamento della mappa.
 *
 * Restituisce true se la memoria è cambiata (serve ridisegnare).
 */
export function mergeGeometriesResponse(
  levelCache: Map<string, AreaFeature>,
  notFound: Set<string>,
  response: GeometriesResponse,
): boolean {
  let changed = false;
  for (const feature of response.features ?? []) {
    const key = areaKey(feature.id);
    if (key === null) continue;
    levelCache.set(key, feature as AreaFeature);
    changed = true;
  }
  for (const id of response.notFound ?? []) {
    const key = areaKey(id);
    if (key === null || notFound.has(key)) continue;
    notFound.add(key);
    changed = true;
  }
  return changed;
}
