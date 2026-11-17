import type * as L from 'leaflet';

// L'ordine conta: prima Leaflet globale, poi il plugin che lo usa.
import './leaflet-global';
import 'leaflet.markercluster';

/**
 * Si usa Leaflet puro, senza wrapper Angular. L'unico plugin è Leaflet.markercluster,
 * incluso nel bundle principale (circa 8 KB compressi).
 *
 * In una prima versione si scaricava solo quando serviva, con un import dinamico. Ma se quel
 * download falliva, Chromium (Chrome, Edge) ricordava l'errore e non riprovava fino al
 * ricaricamento della pagina: i cluster non tornavano più. Incluso nel bundle, il plugin c'è sempre.
 */

/** Il plugin si registra sull'oggetto globale `L` (vedi leaflet-global.ts). */
const globalL = (globalThis as unknown as { L?: typeof L }).L;

/**
 * Nuovo gruppo di marcatori raggruppati in cluster, oppure null se il plugin non si è registrato
 * (non dovrebbe succedere: indicherebbe un problema di build). In quel caso si usano i marcatori singoli.
 */
export function createMarkerClusterGroup(options: L.MarkerClusterGroupOptions): L.MarkerClusterGroup | null {
  const ctor = globalL?.MarkerClusterGroup;
  if (!ctor) {
    console.error('[sadas-map] Leaflet.markercluster non registrato: marcatori senza cluster');
    return null;
  }
  return new ctor(options);
}
