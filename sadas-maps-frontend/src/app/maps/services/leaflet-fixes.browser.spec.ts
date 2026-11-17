/**
 * Correzioni a Leaflet (leaflet-fixes.ts), provate in un browser vero: il difetto riguarda
 * il disegno su canvas e i frame di animazione del browser.
 */
import * as L from 'leaflet';
import './leaflet-fixes';

const nextFrames = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));

describe('correzioni a Leaflet', () => {
  it('rimuovere la mappa con un disegno su canvas ancora in attesa non genera errori', async () => {
    const host = document.createElement('div');
    host.style.cssText = 'width: 400px; height: 300px';
    document.body.appendChild(host);
    const errors: string[] = [];
    const onError = (e: ErrorEvent) => errors.push(e.message);
    window.addEventListener('error', onError);

    const map = L.map(host, { preferCanvas: true }).setView([44.5, 11], 7);
    const area = L.polygon([
      [44, 10],
      [45, 10],
      [45, 11],
    ]).addTo(map);
    await nextFrames();

    // Stessa sequenza di un clic o di un passaggio del mouse seguito da uno spostamento della mappa,
    // e poi dalla distruzione del componente (es. cambio di pagina) nello stesso frame:
    area.setStyle({ weight: 3 }); //            1. chiede un disegno al prossimo frame
    map.panBy([10, 0], { animate: false }); //  2. fine spostamento: disegno immediato, la richiesta resta in coda
    area.setStyle({ weight: 1 }); //            3. nuova richiesta
    map.remove(); //                            4. il renderer annulla solo l'ultima richiesta

    await nextFrames(); //                      5. la prima richiesta parte: senza correzione, errore
    window.removeEventListener('error', onError);
    host.remove();
    expect(errors).toEqual([]);
  });
});
