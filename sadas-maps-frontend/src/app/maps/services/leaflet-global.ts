import * as L from 'leaflet';

/**
 * Espone Leaflet come oggetto globale `L`, prima che si carichino i plugin.
 *
 * Leaflet.markercluster, come molti plugin 1.x, usa l'oggetto globale `L` appena viene caricato.
 * Con gli import ES di Angular `L` non è globale: lo esponiamo qui, come copia estendibile
 * (lo spazio dei nomi di un import ES non si può modificare). I plugin aggiungono metodi alle classi
 * di Leaflet, che restano condivise con l'import ES.
 *
 * Questo modulo va importato PRIMA dei plugin (vedi leaflet-plugins.ts): gli import si eseguono
 * nell'ordine in cui sono scritti.
 */
const w = globalThis as unknown as { L?: typeof L };
w.L ??= { ...L };
