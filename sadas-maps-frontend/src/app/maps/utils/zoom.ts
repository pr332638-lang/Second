/**
 * Regole sullo zoom della mappa di base. Funzioni pure, senza Angular né Leaflet, per poterle provare da sole.
 */

/** Zoom massimo del server pubblico OpenStreetMap. */
export const OSM_PUBLIC_MAX_ZOOM = 19;

/**
 * Tetto prudenziale allo zoom massimo: a zoom 22 una tile copre pochi metri, e nessun server OSM
 * comune arriva oltre. Non è un limite rigido di Leaflet: serve solo a scartare configurazioni assurde.
 */
const LEAFLET_MAX_ZOOM = 22;

/**
 * Converte in numero uno zoom che può arrivare da una configurazione (anche XML, quindi anche come testo).
 * Restituisce NaN per tutto ciò che non è un numero valido: undefined, null, testo vuoto, "abc", Infinity.
 */
export function parseZoom(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : Number.NaN;
  }
  return Number.NaN;
}

/**
 * Zoom iniziale (MapCenterZoom) limitato all'intervallo ammesso.
 *
 * - valore non valido (NaN, assente, testo non numerico) → si usa `fallback`;
 * - decimali → arrotondati all'intero, perché le tile esistono solo per zoom interi;
 * - sotto 0 → 0; sopra `maxZoom` → `maxZoom`.
 *
 * Anche `fallback` e `maxZoom` vengono controllati: una configurazione sbagliata non deve impedire
 * alla mappa di aprirsi.
 */
export function clampZoom(zoom: unknown, maxZoom: number, fallback: number): number {
  const max = Number.isFinite(maxZoom) ? Math.max(0, Math.round(maxZoom)) : OSM_PUBLIC_MAX_ZOOM;
  const requested = parseZoom(zoom);
  const value = Number.isFinite(requested) ? requested : Number.isFinite(fallback) ? fallback : 0;
  return Math.min(Math.max(0, Math.round(value)), max);
}

export interface ZoomLimits {
  /** Zoom massimo a cui l'utente può arrivare. */
  maxZoom: number;
  /** Ultimo zoom per cui il server ha davvero le tile; oltre, Leaflet ingrandisce quelle esistenti. */
  maxNativeZoom: number;
}

/**
 * Limiti di zoom coerenti tra loro.
 *
 * Esempio: server con tile fino a 17 e mappa che deve arrivare a 19 → { maxZoom: 19, maxNativeZoom: 17 }:
 * a zoom 18 e 19 Leaflet usa le tile di zoom 17 ingrandite (un po' sfocate) invece di lasciare riquadri vuoti.
 *
 * - valori non validi → zoom del server pubblico OSM (19);
 * - maxNativeZoom non può superare maxZoom: oltre maxZoom le tile non verrebbero mai chieste;
 * - maxZoom resta entro il limite pratico di Leaflet.
 */
export function resolveZoomLimits(maxZoom: number, maxNativeZoom: number): ZoomLimits {
  const native = Number.isFinite(maxNativeZoom)
    ? Math.min(Math.max(0, Math.round(maxNativeZoom)), LEAFLET_MAX_ZOOM)
    : OSM_PUBLIC_MAX_ZOOM;
  const max = Number.isFinite(maxZoom) ? Math.min(Math.max(0, Math.round(maxZoom)), LEAFLET_MAX_ZOOM) : native;
  return { maxZoom: max, maxNativeZoom: Math.min(native, max) };
}
