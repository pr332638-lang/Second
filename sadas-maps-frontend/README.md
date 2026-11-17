# Componente Maps SadasBI – front-end Angular 22 e back-end Java 21

Componente standalone `<sadas-map>` che visualizza il risultato di una query su mappa Leaflet,
con poligoni, bolle e marcatori, legenda, selettore di metrica e clic verso le pagine collegate.

È una **prima versione basata sulla documentazione**: le parti marcate *da verificare* dipendono
da risposte dei tutor o dal codice esistente di SadasBI.

**Fase attuale: prototipo con dati simulati, front-end e back-end.** L'integrazione con il SadasBI Manager
arriverà dopo. Il back-end Java 21 (`backend/`) legge tabelle SBI simulate e le trasforma in GeoJSON con la
stessa pipeline prevista per i dati veri; il front-end lo chiama tramite il proxy di `ng serve`.
Il componente (`src/app/maps/`) è già indipendente dal Manager; tutto ciò che serve solo al prototipo
sta in `src/app/demo/` e nel package `simulation` del back-end, e si toglierà al momento dell'integrazione.

## Struttura

```
backend/                            Back-end Java 21 (Spring Boot 3.5 + JTS 1.20): vedi *Back-end Java 21*
proxy.conf.json                     Proxy di ng serve: /api → http://localhost:8080
angular.json, package.json, tsconfig*.json   Progetto Angular 22 (dipendenze, stili di Leaflet, proxy)
src/main.ts, src/index.html         Avvio dell'applicazione
src/app/app.ts, app.config.ts       Avvio del prototipo (pagina di prova + intercettori)
src/styles.scss                     Stili globali del prototipo
playwright.config.ts, e2e/          Test end-to-end della pagina di prova (Playwright): vedi *Test*
src/app/demo/                       SOLO PROTOTIPO, da togliere all'integrazione
├── demo-page.component.*          Pagina di prova: scenario, filtro Parent simulato, clic, registro richieste
├── demo-scenarios.ts              Configurazioni pronte (al posto del Manager)
├── demo-backend.service.ts        Back-end in uso (Java o simulato), latenza, errori, registro
├── request-log.interceptor.ts     Registra ogni chiamata: tempo totale, tempo del server, KB, elementi
├── mock-backend.interceptor.ts    Back-end simulato nel browser (con ?backend=simulato)
└── mock-data/
    ├── geo-generator.ts           Regioni, province e comuni fittizi su una griglia irregolare
    ├── datasets.ts                Righe delle query simulate e PreQuery simulata
    └── mock-data.spec.ts          Test (Vitest)
src/app/maps/
├── maps.models.ts                 Configurazione, metriche, risposte API, parametri di clic
├── sadas-map.component.ts/.html/.scss   Componente principale
├── sadas-map.component.browser.spec.ts  Test del componente in un browser vero (Vitest, modalità browser)
├── legend/map-legend.component.ts Legenda a barra da Min/Max Value e Min/Max Color
├── services/
│   ├── maps-data.service.ts       Query e geometrie (con cache per livello di dettaglio)
│   ├── base-layer.factory.ts      Mappa di base OpenStreetMap: URL e zoom del server
│   ├── leaflet-global.ts          Leaflet come oggetto globale L, prima dei plugin
│   ├── leaflet-plugins.ts         markercluster (nel bundle principale) e creazione dei cluster
│   ├── leaflet-fixes.ts           Correzioni a difetti di Leaflet 1.9.4 (con leaflet-fixes.browser.spec.ts)
│   └── performance.ts             Soglie di prestazioni (MAPS_PERFORMANCE), tarate per computer lenti
└── utils/
    ├── scale.ts                   Interpolazione colore, opacità, raggio
    ├── values.ts                  Numeri con virgola, escape HTML, template dei popup
    ├── geo.ts                     Livello di dettaglio per zoom, bbox
    ├── zoom.ts                    Zoom iniziale e limiti di zoom (con zoom.spec.ts)
    ├── geometry-cache.ts          Salvataggio in memoria delle geometrie; IdArea sempre come testo (con geometry-cache.spec.ts)
    └── scale.spec.ts              Test (Vitest)
```

## Prototipo con dati simulati

### Avvio

Il progetto Angular 22 è già completo: `package.json` con le dipendenze, `angular.json` con stili e
immagini di Leaflet e markercluster e con il proxy di `ng serve`, `src/main.ts`, `src/index.html`, `tsconfig`.
Requisiti: Node.js 20.19+ / 22.12+ / 24+.

1. Installare le dipendenze: `npm install`.
2. Avviare il back-end: `cd backend && mvn spring-boot:run` (Java 21, porta 8080).
3. Avviare il front-end con `npm start` (cioè `ng serve`, con `proxy.conf.json` già indicato in `angular.json`)
   e aprire http://localhost:4200.
4. Test: vedi *Test* (`npm test`, `npm run test:browser`, `npm run e2e`). Compilazione di produzione: `npm run build`.

Senza Java si può usare il back-end simulato nel browser: http://localhost:4200/?backend=simulato.
La pagina di prova dice quale back-end è in uso e ha un collegamento per passare all'altro.

La mappa di base usa il server pubblico OpenStreetMap, quindi serve internet. Senza rete i dati simulati
si vedono lo stesso, con l'avviso "Mappa di base non raggiungibile".

### Cosa simula

- **Aree fittizie**: 20 regioni, 120 province e 7.681 comuni (uno è un'enclave) su una griglia irregolare
  sopra l'Italia. Non sono confini reali, ma si comportano come i dati delle tabelle SBI: aree confinanti con
  confini identici, livelli di dettaglio L0–L3, due IdArea per entità (confine e punto centrale),
  un comune con un buco (enclave) e una regione con un'isola (MultiPolygon). Nomi come "Regione H" o
  "Comune H3-28" rendono evidente che sono inventati.
- **Valori fittizi**: popolazione con "città" simulate, densità, classi con colore da espressione,
  2.500 negozi con coordinate come testo con la virgola.
- **Casi difficili voluti**: una riga con un IdArea inesistente, sei negozi con coordinate non valide,
  una PreQuery che fallisce senza filtro.
- **Back-end**: di default il back-end Java 21, che genera le tabelle AREAS_SBI, POLYGONS_SBI e POINTS_SBI
  simulate e ne ricava il GeoJSON con JTS, come farà con il database. In alternativa il back-end simulato
  nel browser, con latenza regolabile ed errori simulati. I due usano lo stesso algoritmo: stessi IdArea,
  nomi e valori (le superfici del back-end Java sono calcolate sui confini pieni e possono differire di poco).
  Tutto è deterministico: stessi dati a ogni avvio.

### Scenari della pagina di prova

| Scenario | Cosa si prova |
| --- | --- |
| Regioni | Tre metriche dal pannello dei livelli (poligoni, bolle, colore da espressione), filtro macroarea, record senza area, isola |
| Province | Min/Max Value fissati, passaggio del mouse e selezione |
| Comuni di una regione | PreQuery che fallisce senza filtro, enclave nella regione H |
| Tutti i comuni | Prestazioni con 7.681 aree, aree visibili e livelli di dettaglio (registro delle richieste) |
| Negozi | Punti esterni con coordinate come testo, cluster oltre 200 marcatori, Data Entry Flag |

Pesi indicativi delle geometrie di tutti i comuni (JSON non compresso): circa 1,6 MB a L0, 2,1 MB a L1,
3,3 MB a L2, 7,8 MB a L3. I confini reali saranno più dettagliati: queste misure servono a confrontare
le strategie, non a stimare i volumi di produzione.

### Registro delle richieste

`request-log.interceptor.ts` registra ogni chiamata, con entrambi i back-end: tempo totale visto dal browser,
tempo di lavoro dichiarato dal server (intestazione `X-Compute-Ms`), dimensione della risposta (JSON non
compresso) e numero di righe o aree. Le richieste fallite mostrano lo stato HTTP e il `detail` dell'errore.

### All'integrazione

Nel front-end si eliminano la cartella `demo/`, `app.ts` e `app.config.ts` del prototipo ed eventualmente
si imposta `MAPS_API_BASE_URL`: il componente in `maps/` non cambia.
Il componente è scritto e verificato con `"strict": true` (TypeScript) e `"strictTemplates": true` (Angular),
dichiarati in `tsconfig.json` anche se nelle versioni attuali sono già il default: nel progetto che lo ospita
vanno mantenuti attivi, altrimenti si perdono i controlli sui tipi su cui il codice fa affidamento. Nel back-end si sostituiscono le classi
del package `simulation` (vedi *Back-end Java 21*).

## Dipendenze

```bash
npm install leaflet@^1.9.4 leaflet.markercluster
npm install -D @types/leaflet @types/leaflet.markercluster @types/geojson
```

Si usa **Leaflet puro**, senza wrapper Angular: la mappa si crea nel codice del componente.
L'unico plugin è Leaflet.markercluster (uso confermato dai tutor), per raggruppare i marcatori quando sono molti.
Usa l'oggetto globale `L` appena viene caricato: `leaflet-global.ts` lo espone e va importato prima del plugin
(lo fa `leaflet-plugins.ts`).

Si usa Leaflet 1.9 perché markercluster è pensato per la 1.x.
Leaflet 2.0 cambia l'API (niente `L` globale, costruttori al posto dei metodi factory) e all'ultima
verifica era ancora in beta: prima di passarci, controllare che sia stabile e che i plugin lo supportino.

In `angular.json`:

```json
"styles": [
  "node_modules/leaflet/dist/leaflet.css",
  "node_modules/leaflet.markercluster/dist/MarkerCluster.css",
  "node_modules/leaflet.markercluster/dist/MarkerCluster.Default.css",
  "src/styles.scss"
],
"assets": [
  { "glob": "**/*", "input": "node_modules/leaflet/dist/images", "output": "assets/leaflet" }
]
```

Serve anche `provideHttpClient()` nella configurazione dell'applicazione.

Nel progetto tutto questo è già fatto. In `angular.json` c'è inoltre
`"allowedCommonJsDependencies": ["leaflet", "leaflet.markercluster"]`, per evitare l'avviso sui moduli
CommonJS (i due pacchetti non sono ESM).

## Mappa di base

Si usa solo **OpenStreetMap**. Le configurazioni esistenti con Google o Bing vengono trattate come OSM.

- L'indirizzo delle tile si imposta con `MAPS_OSM_TILE_URL`. Il default è il server pubblico,
  che ha una policy d'uso restrittiva: va bene per sviluppo e demo; in produzione serve un server
  interno o commerciale che distribuisca tile OSM.
- **Zoom.** Due impostazioni, in `utils/zoom.ts` le regole:
  - `MAPS_OSM_MAX_NATIVE_ZOOM`: l'ultimo zoom per cui il server ha davvero le tile
    (default 19, quello del server pubblico);
  - `MAPS_OSM_MAX_ZOOM`: lo zoom massimo a cui l'utente può arrivare (default uguale al precedente).
    Se è più alto, oltre l'ultimo zoom del server Leaflet ingrandisce le tile esistenti
    (opzione `maxNativeZoom`), un po' sfocate, invece di lasciare riquadri vuoti.
  Lo zoom delle tile non può superare lo zoom massimo; valori non validi tornano a 19.
- **Zoom iniziale.** MapCenterZoom viene arrotondato e limitato tra 0 e lo zoom massimo.
  Se manca o non è un numero valido (NaN, testo non numerico) si usa il default, zoom 6.
  È accettato anche come testo (`"10"`), come può arrivare da una configurazione XML.
- Se le tile non arrivano (rete chiusa, server non raggiungibile), dati e legenda restano visibili
  e compare un avviso, che sparisce alla prima tile caricata.
- L'attribuzione "© OpenStreetMap contributors" è obbligatoria per la licenza dei dati e resta sempre visibile.
- OpenStreetMap non offre immagini satellitari.

```ts
providers: [
  { provide: MAPS_OSM_TILE_URL, useValue: 'https://tiles.esempio.it/osm/{z}/{x}/{y}.png' },
  // il server interno ha tile fino a 17, ma l'utente può ingrandire fino a 19
  { provide: MAPS_OSM_MAX_NATIVE_ZOOM, useValue: 17 },
  { provide: MAPS_OSM_MAX_ZOOM, useValue: 19 },
]
```

## Uso

```html
<sadas-map
  [config]="mapConfig"
  [parentParams]="filtroParams()"
  (areaClick)="apriPaginaCollegata($event)" />

<!-- Query vuota: la mappa visualizza il risultato del Parent -->
<sadas-map
  [config]="{ ...mapConfig, hasQuery: false }"
  [parentResult]="risultatoParent()"
  (areaClick)="apriPaginaCollegata($event)" />
```

```ts
mapConfig: MapsConfig = {
  id: 'map1',
  connection: 'Comuni', // connessione con il plugin delle mappe installato
  title: 'Fatturato per provincia',
  fieldKeyForPolygons: '${F.ID_AREA_POLY}',
  fieldKeyForPoint: '${F.ID_AREA_PUNTO}',
  externalPoint: false,
  fieldLabel: '${F.NOME}',
  dataEntryFlag: false,
  height: 500,
  metrics: [{
    idMetric: 'FATT', name: 'Fatturato', displayType: 'POLYGON',
    currentValueField: '${F.FATTURATO}', minColor: '#fee8c8', maxColor: '#b30000',
    popupValue: '<b>${F.NOME}</b><br>Fatturato ${P.ANNO}: ${F.FATTURATO}',
  }],
};
```

**Riferimenti ai campi.** Come nel Manager di SadasBI, le proprietà che indicano un campo della query
usano `${F.CAMPO}` (es. Field Key `${F.IDAREA_REGIONE}`, Map Current Value `${F.POPOLAZIONE}`).
Un singolo riferimento restituisce il valore con il suo tipo; un'espressione con più riferimenti
(es. `${F.PROV}-${F.COMUNE}`) restituisce una stringa. È accettato anche il nome di colonna semplice.
Nel Popup Value, `${P.NOME}` inserisce un parametro ricevuto dal Parent; i valori sono sempre protetti per l'HTML.

**Dimensioni.** Senza Width e Height la mappa occupa tutto lo spazio libero, come nel componente originale.
Se il contenitore della pagina non ha un'altezza definita, vale un'altezza minima di 300 px.

`config` deve essere un oggetto stabile: ogni nuovo oggetto rilancia la query.
Il componente **non naviga**: emette `areaClick` con IDAREAMAP, IDMETRIC, METR_LABEL, METR_VALUE,
LABELMAP, LAT, LNG e il record; l'host apre Page o HyperLink con il meccanismo di SadasBI.
Page e HyperLink non sono mai impostati insieme. Il drill-down (regioni → province → comuni)
si ottiene collegando pagine diverse tramite Page, non dentro il componente.

Interazione e aspetto, come nel componente originale (schermate del manuale SadasBI, pp. 140–141):
- **pannello "Livelli"** in alto a destra, richiudibile: menu per scegliere la metrica (una alla volta)
  e una casella per ogni area, per mostrarla o nasconderla; con più di 15 aree compare una ricerca.
  Le aree nascoste non si disegnano ma restano nel calcolo della scala;
- **legenda a barra** sotto la mappa, con sfumatura da Min Color a Max Color e valori minimo, medio e massimo
  (per le bolle anche il raggio minimo e massimo);
- **barra della scala** in km in basso a sinistra;
- al passaggio del mouse poligoni e bolle aumentano opacità e spessore del bordo;
- l'area cliccata resta evidenziata come selezionata, anche dopo un ridisegno;
- un clic fuori dalle aree toglie la selezione.

## Contratto con il back-end Java (proposta)

Gli URL partono da `MAPS_API_BASE_URL` (default `/api/sadasbi/maps`), sovrascrivibile con un provider.

**1. Query del componente** – `POST /components/{id}/query`

```json
// richiesta
{ "params": { "REGIONE": "LOMBARDIA" } }
// risposta
{ "preQueryOk": true, "rows": [ { "ID_AREA_POLY": 1203, "NOME": "Milano", "FATTURATO": 125000 } ] }
// PreQuery fallita: la query non viene eseguita e la mappa mostra il messaggio
{ "preQueryOk": false, "message": "Selezionare una regione", "rows": [] }
```

La PreQuery ha **due esiti**, come descritto nel manuale SadasBI (cap. 8): lo script Groovy o il jar Java
(interfaccia `ExternalActionInterface`) restituisce un booleano, oppure una `HashMap` che associa `false`
a un messaggio. Il messaggio può venire anche dalla proprietà *On Failure Answer*.
Il "warning" descritto nella tesi del 2015 non esiste nella versione attuale.

Per ora il back-end esegue anche le espressioni Map Current Color/Opacity/Radius e restituisce il risultato
in colonne indicate da `currentColorField`, `currentOpacityField`, `currentRadiusField`.
Il manuale però suggerisce che siano **espressioni JavaScript** valutate nel browser (vedi Assunzioni).
Come nel componente originale, si usano **solo se la coppia Min/Max corrispondente non è impostata**.

Se il campo Query è vuoto (`hasQuery: false`), la mappa non chiama questa API e visualizza
il risultato dell'elemento Parent, passato nell'input `parentResult`.

**2. Geometrie** – `POST /components/{id}/geometries`

Le tabelle del plugin sono installate **su una connessione specifica** (Manager → Settings → Plugin),
e connessioni diverse possono avere versioni diverse del plugin (es. `ITA_SADASBI_MAPS_Default_2014`
e `_2015`). Per questo le geometrie si chiedono per componente: il back-end le legge dalla
**Connection del componente**. Nel front-end la cache è separata per connessione (`config.connection`).

```json
// richiesta: livello L0-L3 per i poligoni (bbox = [ovest, sud, est, nord]), POINT per i punti centrali
{ "ids": ["1203", "1204"], "level": "L1", "bbox": [8.5, 44.6, 11.4, 46.7] }
// risposta: GeoJSON con id = IdArea, coordinate [lng, lat]
{
  "type": "FeatureCollection",
  "features": [
    { "type": "Feature", "id": 1203, "properties": { "label": "Milano" },
      "geometry": { "type": "MultiPolygon", "coordinates": [[[[9.1, 45.4], "..."]]] } }
  ],
  "notFound": [9999],
  "outside": { "1300": [12.1, 41.6, 12.9, 42.1] }
}
```

`id` e `notFound` sono numeri, perché IdArea è un intero nel database (un IdArea non numerico finisce in
`notFound` come testo); il front-end li tratta comunque come testo. Un IdArea chiesto con il livello sbagliato
(un confine con `POINT`, un punto con L0–L3) è in `notFound`; il front-end ricorda gli IdArea inesistenti
separatamente per punti e confini, così un errore di configurazione sui punti non nasconde i confini.

Le aree esistenti ma fuori dal bbox non sono in `notFound`: sono in `outside`, con il loro rettangolo
[ovest, sud, est, nord] preso da POLYGONS_SBI. Il front-end lo ricorda e richiede l'area solo quando la vista
la raggiunge, invece di richiederla a ogni spostamento. Con tutti i comuni, `outside` pesa qualche centinaio
di KB la prima volta, poi non si ripete.

Il front-end manda al massimo 5.000 IdArea per richiesta (`MAX_IDS_PER_REQUEST`), in blocchi scaricati
due alla volta; il back-end ne accetta fino a 20.000.

Errori: 404 per un componente sconosciuto, 400 per richieste non valide (livello inesistente, bbox con meno
di 4 valori, più di 20.000 IdArea), in formato Problem Details (RFC 9457) con il messaggio nel campo `detail`.
Entrambe le API rispondono con l'intestazione `X-Compute-Ms`, il tempo di lavoro del server.

Compiti del back-end:
- filtrare con `MinLat/MaxLat/MinLng/MaxLng` di POLYGONS_SBI che intersecano il bbox;
- costruire le geometrie unendo i confini esterni e sottraendo i buchi (vedi *Costruzione delle geometrie*);
- restituire le versioni semplificate del livello richiesto, precalcolate (vedi *Semplificazione per livello di zoom*);
- limitare le coordinate a 5 decimali e rispondere con gzip;
- elencare in `notFound` gli IdArea inesistenti e in `outside` il rettangolo delle aree fuori dal bbox.

## Prestazioni (caso con migliaia o decine di migliaia di record)

- Valori e geometrie separati; le geometrie restano in cache per livello di dettaglio.
- Poligoni solo nella vista corrente (+20% di margine), con livello di dettaglio legato allo zoom.
- Rendering su canvas (`preferCanvas`) per poligoni e bolle.
- Marcatori raggruppati in cluster oltre 200 elementi. Il plugin è nel bundle principale (circa 8 KB
  compressi), quindi è sempre disponibile. Scaricarlo solo quando serve non conviene: se quel download
  fallisce, Chromium (Chrome, Edge) ricorda l'errore e non riprova fino al ricaricamento della pagina.
- Angular 22 è zoneless e OnPush di default: gli eventi della mappa non scatenano change detection globale.

### Computer lenti

Si ipotizza che i clienti usino computer **mediamente lenti**. Le soglie che pesano di più stanno in
`services/performance.ts` (`MAPS_PERFORMANCE`), con valori di default prudenti, da tarare dopo le misure:

| Impostazione | Default | Perché |
| --- | --- | --- |
| `clusterThreshold` | 200 | I marcatori sono elementi HTML: oltre poche centinaia rallentano zoom e spostamenti |
| `areaListLimit` | 200 | Il pannello dei livelli non crea migliaia di caselle: le altre aree si trovano con la ricerca |
| `geometryDebounceMs` | 250 | Durante una serie di spostamenti o zoom si chiede una sola volta le geometrie |
| `boundsPadding` | 0,2 | Margine intorno alla vista: abbastanza per spostamenti brevi, senza scaricare troppo |

Inoltre i testi di tooltip e popup si costruiscono solo quando si aprono, non per tutte le aree al disegno.

**Come provare.** Chrome → Strumenti per sviluppatori → Performance → CPU: rallentamento 4× (o 6×),
e Network "Fast 4G". Con lo scenario *Tutti i comuni*, misurare il primo disegno, lo zoom da Italia a regione
e la reattività del passaggio del mouse; il registro delle richieste dà i tempi di rete e del server.
I tempi accettabili vanno concordati con i tutor (vedi documento delle domande).

Se le misure non bastano, i passi successivi, in ordine di costo: geometrie ancora più semplici a zoom bassi
(tolleranze del back-end), aggiornare solo le aree cambiate invece di ridisegnare tutto il livello,
decodificare il GeoJSON in un Web Worker.

## Assunzioni da verificare con i tutor

1. URL e formato delle API (sopra, è una proposta).
2. **Espressioni JavaScript.** Secondo il manuale SadasBI (cap. 5–6), le proprietà con l'icona JS nel Manager
   sono espressioni JavaScript con `${F.X}` (campi della query del componente), `${P.X}` (parametri ereditati,
   `${P.@X}` dai filtri), `${V.X}` (variabili di progetto) e funzioni utente (`$wnd.nome(...)`).
   Per esempio HyperLink `${V.BASEURL} + '/' + ${P.COUNTRYNAME}` o un testo `'Abitanti: ' + ${F.POP}`.
   Questo codice per ora gestisce solo riferimenti `${F.X}` e `${P.X}` (singoli o composti come testo)
   e lascia le espressioni Map Current Color/Opacity/Radius al back-end. Prima di scrivere un valutatore
   va chiesto ai tutor se nel nuovo stack ne esiste già uno comune a tutti i componenti, e quali proprietà
   della mappa accettano JavaScript. Valutare codice scritto dagli utenti va fatto con attenzione alla sicurezza.
3. Min/Max Value mancanti: qui si calcolano dai dati.
4. Una riga per IdArea; con più righe sulla stessa area vince l'ultima, come nell'originale.
   Le righe scartate non contano nemmeno per la scala e la legenda. Con External point senza IdArea
   ogni riga è un record distinto: due record con le stesse coordinate (es. due negozi nello stesso
   indirizzo) compaiono entrambi.
5. Più metriche: una alla volta, scelta dal pannello dei livelli, come nell'originale.
6. Server delle tile OSM: oggi il server pubblico (`MAPS_OSM_TILE_URL`, tile fino allo zoom 19 con
   `MAPS_OSM_MAX_NATIVE_ZOOM`). Per la produzione va scelto un server interno o commerciale.
7. Image Marker: dimensione fissa 32×32 px, ancorata in basso al centro.
8. Default della mappa senza MapCenter: Italia, zoom 6.
9. Caricamento dei plugin Leaflet con il bundler del progetto (`leaflet-plugins.ts`).
10. Pannello dei livelli: posizione in alto a destra e ricerca oltre 15 aree sono scelte di questo codice.
    Con migliaia di aree (es. tutti i comuni) l'elenco resta lungo anche con la ricerca.
11. Query vuota: come arriva il risultato del Parent al componente (qui: input `parentResult`).
12. Colori di hover e selezione: valori scelti qui, il componente originale non li documenta.
13. Riferimenti ai campi: vedi punto 2.
14. IdArea: nell'originale è un intero; il front-end lo tratta come stringa, quindi accetta entrambi.
15. Numeri come stringhe: virgola decimale e punti delle migliaia (`5.801.692`) vengono riconosciuti;
    un solo punto senza virgola (`45.46`) è considerato decimale.
    Nei popup e nei tooltip, invece, un testo si riformatta all'italiana solo se contiene già dei separatori
    (virgola decimale, o almeno due punti delle migliaia), conservando tutti i suoi decimali: `"45,46123"`
    resta `45,46123`. Gli altri testi si mostrano come sono, così codici come CAP, telefoni e partite IVA
    (`"20121"`) non diventano `20.121`, e un testo ambiguo come `"12.345"` non viene interpretato.

## Costruzione delle geometrie (dal componente originale)

Il componente originale costruiva immagini PNG dei poligoni con `java.awt.geom.Area`:
sommava i poligoni esterni (`InOut = 'O'`) e sottraeva i buchi (`InOut = 'I'`).
In Java 21 con JTS si replica lo stesso procedimento producendo GeoJSON:

1. per ogni area, `Polygon` da POINTS_SBI ordinati per `Progressive`;
2. unione dei poligoni esterni, poi differenza con i buchi;
3. il risultato è già un `Polygon` o `MultiPolygon` valido, senza dover assegnare ogni buco al suo confine;
4. orientamento normalizzato secondo RFC 7946 prima della serializzazione.

La ricerca lato server dell'area cliccata (`contains` con prefiltro sul rettangolo) non serve più:
con poligoni vettoriali Leaflet sa già quale area è stata cliccata.

## Semplificazione per livello di zoom

Aree confinanti (regioni, province, comuni) formano una *copertura*: ogni confine interno è condiviso
da due aree. Semplificare ogni area da sola, per esempio con `TopologyPreservingSimplifier`, **non va bene**:
quel semplificatore preserva la topologia della singola geometria, ma due aree vicine possono semplificare
in modo diverso lo stesso confine, e a zoom bassi compaiono fessure e sovrapposizioni.

Si usa invece `CoverageSimplifier` di JTS (`org.locationtech.jts.coverage`, presente in jts-core 1.20),
che semplifica ogni confine condiviso una volta sola e mantiene le aree perfettamente accostate.

1. **Una copertura per livello amministrativo**: tutte le regioni insieme, tutte le province insieme,
   tutti i comuni insieme (nel pacchetto italiano si ricavano da REGIONI_SBI, PROVINCE_SBI, COMUNI_SBI
   tramite `IdArea_Poligono`). Le aree di tipo punto restano fuori.
2. **Validare prima**: `CoverageValidator` segnala buchi e sovrapposizioni tra aree vicine già presenti
   nei dati d'origine. La semplificazione non li ripara: vanno corretti prima.
3. **Precalcolare, non semplificare per richiesta**: `CoverageSimplifier` lavora sull'intera copertura.
   Semplificare solo le aree in vista darebbe risultati diversi da una richiesta all'altra, e la cache
   del front-end mescolerebbe versioni incompatibili dello stesso confine.
4. **Una tolleranza per livello** (L0–L3): la tolleranza è una **distanza** nelle unità delle coordinate
   (qui gradi): indica di quanto, al massimo, una linea semplificata si può spostare dall'originale.
   Internamente è la radice quadrata della tolleranza d'area dell'algoritmo di Visvalingam-Whyatt.
   Nel prototipo: L0 0,02°, L1 0,005°, L2 0,001°, L3 0 (confini pieni). Un grado di latitudine è circa
   111 km, quindi 0,02° sono circa 2 km. Vanno tarate sui dati reali, guardando il risultato sulla mappa.
5. **Dove salvarle**: in cache sul server applicativo, oppure in tabelle aggiuntive del plugin
   create all'installazione del pacchetto .sme (da chiedere ai tutor).

## Back-end Java 21

Prototipo del back-end in `backend/`: Spring Boot 3.5, JTS 1.20, Java 21. Espone le due API del
*Contratto con il back-end Java* su http://localhost:8080 e usa la connessione simulata `DEMO`.

```bash
cd backend
mvn spring-boot:run      # avvio
mvn test                 # test JUnit 5
mvn package              # jar eseguibile in target/: java -jar target/sadasbi-maps-backend-0.1.0-SNAPSHOT.jar
```

### Struttura

```
com.sadas.sadasbi.maps
├── MapsApplication              Avvio Spring Boot
├── sbi/                         Modello delle tabelle del plugin
│   ├── SbiModel                 Righe di AREAS_SBI, POLYGONS_SBI, POINTS_SBI, REGIONI/PROVINCE/COMUNI_SBI
│   ├── SbiTables                Le tabelle di una connessione; coperture per livello amministrativo
│   └── SbiTablesProvider        Tabelle per Connection (il plugin si installa per connessione)
├── component/                   Componente mappa
│   ├── MapComponent             Connection, PreQuery (vero/falso + messaggio), Query
│   ├── ComponentRegistry        ID del componente → definizione
│   └── QueryService             PreQuery, poi Query; con PreQuery falsa solo il messaggio
├── geometry/                    Pipeline delle geometrie (Java puro)
│   ├── RingAssembler            Vertici per Progressive, anelli chiusi, anomalie annotate
│   ├── GeometryEngine           Interfaccia per unioni, differenze, semplificazione
│   ├── GeometryService          Cache per connessione e livello, filtro bbox, notFound
│   ├── GeometryLevel            POINT, L0–L3 con le tolleranze
│   └── GeoJsonWriter            GeoJSON RFC 7946 scritto direttamente, 5 decimali
├── geometry/jts/                L'unica parte che usa JTS
│   └── JtsGeometryEngine        Unione 'O' meno 'I', GeometryFixer, CoverageValidator, CoverageSimplifier
├── simulation/                  SOLO PROTOTIPO
│   ├── SimulatedGrid            Stessa geografia fittizia del front-end, a pieno dettaglio
│   ├── SimulatedSbiTables       ...trasformata in righe delle tabelle SBI
│   ├── SimulatedQueries         Righe delle query degli scenari
│   └── SimulatedComponentRegistry  I cinque componenti della pagina di prova, connessione DEMO
├── api/                         MapsController, ApiExceptionHandler (Problem Details)
└── config/                      MapsConfiguration (collega i pezzi), WebConfiguration (CORS)
```

Spring e JTS sono confinati in `api/`, `config/` e `geometry/jts/`: il resto è Java puro e si prova senza
avviare Spring (`GeometryServiceTest` usa un motore geometrico finto).

### Come funziona

1. **Tabelle SBI.** I dati simulati non sono GeoJSON già pronto: sono righe di AREAS_SBI, POLYGONS_SBI
   (con InOut e rettangolo di ingombro) e POINTS_SBI (con Progressive, anelli già chiusi), due aree per
   entità (confine e punto), come nel pacchetto italiano. Così la pipeline è quella dei dati veri.
2. **Costruzione**, una volta per connessione: `RingAssembler` ricompone gli anelli, `JtsGeometryEngine`
   unisce i confini esterni e sottrae i buchi (enclave), riparando le geometrie non valide.
3. **Semplificazione**, una volta per livello: `CoverageSimplifier` per ogni copertura (regioni, province,
   comuni, ricavate dalle tabelle amministrative), dopo un controllo con `CoverageValidator`.
4. **Richiesta**: `GeometryService` prende le aree dalla cache, scarta quelle fuori dal bbox usando il
   rettangolo di POLYGONS_SBI (senza toccare i vertici) e `GeoJsonWriter` scrive la risposta, compressa
   con gzip da Spring (`application.properties`).

All'avvio un thread costruisce in background tutte le geometrie della connessione `DEMO` (*warm-up*):
il server risponde subito, e una richiesta di geometrie che arriva prima aspetta che siano pronte.
I log riportano i tempi di costruzione di ogni livello e le anomalie trovate nei dati.

### All'integrazione

Si cambia solo `MapsConfiguration`:
- `SimulatedSbiTablesProvider` → un `SbiTablesProvider` che legge le tabelle via JDBC dalla Connection;
- `SimulatedComponentRegistry` → un `ComponentRegistry` che legge le pagine salvate dal Manager, con
  PreQuery (script Groovy o jar `ExternalActionInterface`) e Query vere;
- il package `simulation` si elimina.

Restano da decidere con i tutor: dove vive questo back-end nel server SadasBI, dove salvare le geometrie
semplificate e come invalidare la cache quando cambia il pacchetto delle mappe.

### Stato delle verifiche

Senza accesso a Maven Central da questo ambiente, il progetto **non è stato compilato con Maven**.
- Le classi in Java puro (`sbi`, `component`, `geometry`, `simulation`) sono state compilate con `javac`
  (Java 21) e i 24 test eseguiti con un sostituto minimo di JUnit: tutti superati.
- Le classi che usano Spring e JTS (`api`, `config`, `geometry/jts`, `MapsApplication`) sono state compilate
  solo contro versioni ridotte delle API, ricostruite dalla documentazione: firme verificate, comportamento no.
- Al primo `mvn test` / `mvn spring-boot:run` va controllato in particolare il tempo di
  `CoverageValidator` e `CoverageSimplifier` sui 7.681 comuni (nei log).

## Test

```bash
npm test -- --watch=false   # funzioni pure e dati simulati (Vitest, in Node con jsdom: veloce)
npm run test:browser        # componente <sadas-map> e correzioni a Leaflet (Vitest in Chromium)
npm run e2e                 # pagina di prova completa (Playwright, Chromium)
npm run e2e:all             # come sopra, anche in Firefox e WebKit
cd backend && mvn test      # back-end (JUnit 5)
```

**Prima volta:** `test:browser` ed `e2e` usano Chromium di Playwright. Se non è già installato:
`npx playwright install chromium` (per `e2e:all` anche `firefox webkit`).

| Livello | File | Cosa prova |
| --- | --- | --- |
| Unità | `utils/*.spec.ts`, `mock-data/mock-data.spec.ts` | Funzioni pure: scala, colori, numeri, template, zoom, memoria delle geometrie, deduplicazione; dati simulati |
| Componente | `sadas-map.component.browser.spec.ts`, `services/leaflet-fixes.browser.spec.ts` | `<sadas-map>` con un back-end finto (intercettore HTTP) e dati costruiti apposta: scala e legenda con righe duplicate, record senza area, PreQuery, errori di query e geometrie, parametri del Parent, Query vuota, clic veri sul canvas, selezione, Data Entry Flag, bolle, External point con coordinate uguali, popup protetti per l'HTML, cluster |
| End-to-end | `e2e/*.e2e.ts` | La pagina di prova con il back-end simulato: i cinque scenari, mappa di base raggiungibile e no, clic e selezione, pannello dei livelli (metrica, Tutte/Nessuna, ricerca), cluster, filtro del Parent, errori simulati, livelli di dettaglio, scelta del back-end |

Report dell'ultima esecuzione completa (esiti, durate, ambiente, difetto di Leaflet trovato): `docs/report-test-2026-11-17.pdf`.

Note:
- I test di componente ed end-to-end non usano internet: le tile di OpenStreetMap sono sostituite da tile vuote.
- I test end-to-end avviano `ng serve` sulla porta 4300 (o riusano un server già avviato lì) e falliscono
  se in console compaiono errori o eccezioni non gestite.
- Per leggere ciò che Leaflet disegna su canvas (poligoni e bolle), i test accedono alla mappa Leaflet:
  nei test del componente al suo campo privato `map`, negli end-to-end tramite `window.__map`, esposto
  solo dai test (`e2e/demo-page.ts`).
- Non coperti: il back-end Java (gli end-to-end usano quello simulato), le tile vere di OpenStreetMap,
  le prestazioni su computer lenti (vedi *Computer lenti*).

Back-end: dati simulati (con i valori di controllo calcolati dal generatore del front-end), PreQuery,
assemblaggio degli anelli, `GeometryService` con un motore finto, scrittura del GeoJSON.
