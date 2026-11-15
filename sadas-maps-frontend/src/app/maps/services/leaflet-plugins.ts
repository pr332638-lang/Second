import * as L from 'leaflet';
import { loadOnceWithRetry } from '../utils/load-once';

/**
 * Si usa Leaflet puro, senza wrapper Angular. L'unico plugin è Leaflet.markercluster,
 * che come molti plugin 1.x si aggancia all'oggetto globale `L`.
 * Con gli import ES di Angular `L` non è globale: lo esponiamo una sola volta, come copia estendibile.
 * I plugin aggiungono metodi alle classi di Leaflet, che restano condivise con l'import ES.
 *
 * DA VERIFICARE nel progetto reale: il caricamento dei plugin dipende dalla versione del bundler.
 */
export function ensureGlobalLeaflet(): typeof L {
  const w = window as unknown as { L?: typeof L };
  w.L ??= { ...L };
  return w.L;
}

type ClusterGroupCtor = new (options?: Record<string, unknown>) => L.FeatureGroup & {
  addLayers(layers: L.Layer[]): unknown;
};

/**
 * Carica Leaflet.markercluster su richiesta (code splitting).
 *
 * Il download avviene una volta sola, anche con più mappe nella pagina. Se fallisce
 * (es. rete momentaneamente assente), la chiamata successiva riprova invece di restituire
 * per sempre lo stesso errore.
 */
export const loadMarkerClusterGroup: () => Promise<ClusterGroupCtor> = loadOnceWithRetry(async () => {
  const globalL = ensureGlobalLeaflet() as unknown as Record<string, unknown>;
  const mod = (await import('leaflet.markercluster')) as unknown as Record<string, unknown>;
  const ctor = (mod['MarkerClusterGroup'] ?? globalL['MarkerClusterGroup']) as ClusterGroupCtor | undefined;
  if (!ctor) throw new Error('Leaflet.markercluster non disponibile');
  return ctor;
});
