import { InjectionToken, inject } from '@angular/core';
import * as L from 'leaflet';
import { OSM_PUBLIC_MAX_ZOOM, resolveZoomLimits, type ZoomLimits } from '../utils/zoom';

export { clampZoom } from '../utils/zoom';

/**
 * Mappa di base: si usa solo OpenStreetMap.
 *
 * URL delle tile. Il server pubblico ha una policy d'uso restrittiva:
 * in produzione va sostituito con un tile server interno o commerciale che serve tile OSM.
 */
export const MAPS_OSM_TILE_URL = new InjectionToken<string>('MAPS_OSM_TILE_URL', {
  providedIn: 'root',
  factory: () => 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
});

/**
 * Ultimo zoom per cui il server ha davvero le tile: 19 per il server pubblico OSM.
 * Un server interno può fermarsi prima (es. 17) per occupare meno spazio.
 */
export const MAPS_OSM_MAX_NATIVE_ZOOM = new InjectionToken<number>('MAPS_OSM_MAX_NATIVE_ZOOM', {
  providedIn: 'root',
  factory: () => OSM_PUBLIC_MAX_ZOOM,
});

/**
 * Zoom massimo a cui l'utente può arrivare. Di default coincide con MAPS_OSM_MAX_NATIVE_ZOOM.
 * Se è più alto, oltre l'ultimo zoom del server Leaflet ingrandisce le tile esistenti invece di
 * lasciare riquadri vuoti (opzione maxNativeZoom).
 */
export const MAPS_OSM_MAX_ZOOM = new InjectionToken<number>('MAPS_OSM_MAX_ZOOM', {
  providedIn: 'root',
  factory: () => inject(MAPS_OSM_MAX_NATIVE_ZOOM),
});

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Limiti di zoom della mappa, letti dalla configurazione e resi coerenti tra loro. */
export function injectZoomLimits(): ZoomLimits {
  return resolveZoomLimits(inject(MAPS_OSM_MAX_ZOOM), inject(MAPS_OSM_MAX_NATIVE_ZOOM));
}

/**
 * Icona di default di Leaflet: con i bundler moderni i percorsi delle immagini vanno impostati a mano.
 * La cartella va in `imagePath`: altrimenti Leaflet la ricava dal CSS (riscritto dal bundler in `media/`)
 * e la antepone ai nomi dei file, producendo indirizzi inesistenti come `media/assets/leaflet/marker-icon.png`.
 */
export function configureDefaultIcon(assetsPath = 'assets/leaflet/'): void {
  L.Icon.Default.mergeOptions({
    imagePath: assetsPath,
    iconUrl: 'marker-icon.png',
    iconRetinaUrl: 'marker-icon-2x.png',
    shadowUrl: 'marker-shadow.png',
  });
}

/**
 * Livello OpenStreetMap. L'attribuzione è obbligatoria per la licenza dei dati.
 * Con maxNativeZoom < maxZoom, oltre maxNativeZoom Leaflet ingrandisce le tile dell'ultimo livello disponibile.
 */
export function createOsmLayer(url: string, limits: ZoomLimits): L.TileLayer {
  return L.tileLayer(url, {
    maxZoom: limits.maxZoom,
    maxNativeZoom: limits.maxNativeZoom,
    attribution: OSM_ATTRIBUTION,
  });
}
