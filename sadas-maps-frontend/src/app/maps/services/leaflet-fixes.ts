import * as L from 'leaflet';

/**
 * Correzioni a difetti di Leaflet 1.9.4, l'ultima versione 1.x. Si caricano una volta sola,
 * importando questo modulo (lo fa sadas-map.component.ts). Provate in leaflet-fixes.browser.spec.ts.
 */

/**
 * Renderer canvas: disegno dopo la rimozione della mappa.
 *
 * Il renderer chiede un disegno al frame successivo e ne ricorda una sola richiesta. Un disegno immediato
 * (a ogni fine spostamento o zoom) dimentica quella richiesta senza annullarla, e alla rimozione della mappa
 * il renderer annulla solo l'ultima. Se la mappa viene rimossa subito dopo, per esempio distruggendo
 * il componente dopo uno spostamento, la richiesta dimenticata parte con il canvas già eliminato:
 * "Cannot read properties of undefined (reading 'clearRect')".
 *
 * Correzione: senza canvas non c'è niente da disegnare.
 */
interface CanvasInternals {
  _ctx?: CanvasRenderingContext2D;
  _redraw(): void;
}

const canvasProto = L.Canvas.prototype as unknown as Partial<CanvasInternals>;
const redraw = canvasProto._redraw;
// _redraw è un metodo privato: se una versione futura di Leaflet lo togliesse o lo rinominasse,
// la correzione non si applica (con un avviso), invece di rompere ogni disegno della mappa.
// Per questo la versione di Leaflet è fissata in package.json: aggiornarla è una scelta esplicita,
// da fare dopo aver rilanciato leaflet-fixes.browser.spec.ts.
if (typeof redraw === 'function') {
  canvasProto._redraw = function (this: CanvasInternals): void {
    if (!this._ctx) return;
    redraw.call(this);
  };
} else {
  console.warn('[sadas-map] Leaflet è cambiato: la correzione del renderer canvas non è applicata');
}
