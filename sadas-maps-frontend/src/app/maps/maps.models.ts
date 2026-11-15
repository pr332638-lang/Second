/**
 * Modelli del componente Maps di SadasBI.
 * I nomi delle proprietà ricalcano quelli della documentazione del componente.
 *
 * Le proprietà che indicano un campo della query (Field Key, Map Current Value, Field Label,
 * Field Latitude/Longitude, ...) usano la sintassi del Manager: `${F.CAMPO}`, per esempio
 * `${F.IDAREA_REGIONE}`. È accettato anche il nome di colonna semplice. Vedi `fieldValue` in utils/values.ts.
 */

/**
 * Provider della mappa di base: solo OpenStreetMap.
 * Le configurazioni esistenti possono contenere GOOGLE o BING: vengono ignorati e si usa OSM.
 */
export type MapProvider = 'OSM';

/** Display Type di una metrica: poligono, bolla o marcatore. */
export type DisplayType = 'POLYGON' | 'BUBBLE' | 'MARKER';

/**
 * Livello di dettaglio delle geometrie richieste al back-end.
 * POINT = punto centrale (IdArea_Punto); L0..L3 = poligoni da poco a molto dettagliati.
 */
export type GeometryLevel = 'POINT' | 'L0' | 'L1' | 'L2' | 'L3';

export interface MapMetric {
  /** ID Metric → ${P.#IDMETRIC} */
  idMetric: string;
  /** Name → ${P.#METR_LABEL} */
  name: string;
  displayType: DisplayType;
  /** Map Current Value: campo della query con il valore → ${P.#METR_VALUE} */
  currentValueField: string;

  /** Map Min/Max Value. Se assenti si calcolano dai dati (da confermare con i tutor). */
  minValue?: number;
  maxValue?: number;
  /** Map Min/Max Color, esadecimali. */
  minColor?: string;
  maxColor?: string;
  /** Map Min/Max Opacity, da 0 a 255. */
  minOpacity?: number;
  maxOpacity?: number;
  /** Map Min/Max Radius, in pixel (solo bolle). */
  minRadius?: number;
  maxRadius?: number;

  /**
   * Map Current Color/Opacity/Radius sono espressioni. Qui si assume che il back-end le esegua
   * e restituisca il risultato in una colonna della riga: questi campi ne indicano il nome.
   * Come nel componente originale, si usano solo se la coppia Min/Max corrispondente non è impostata.
   */
  currentColorField?: string;
  currentOpacityField?: string;
  currentRadiusField?: string;

  /** Popup Value: testo/HTML con segnaposto `${F.CAMPO}` (campi) e `${P.NOME}` (parametri del Parent). */
  popupValue?: string;
  /** Map Current Image Marker: URL dell'immagine. */
  imageMarkerUrl?: string;
}

export interface MapsConfig {
  /** ID dell'elemento nella pagina. */
  id: string;
  /**
   * Connection: connessione su cui gira la query e su cui è installato il plugin delle mappe.
   * Serve a tenere separate in cache le geometrie di connessioni con versioni diverse del plugin.
   */
  connection?: string;
  title?: string;
  tabIndex?: number;
  /** Field Label: campo con l'etichetta dell'area. */
  fieldLabel?: string;

  /** Sempre OSM. Facoltativo: l'URL del server delle tile si imposta con MAPS_OSM_TILE_URL. */
  mapProvider?: MapProvider;

  /** Field Key for Polygons: campo che contiene AREAS_SBI.IdArea per i poligoni. */
  fieldKeyForPolygons?: string;
  /** Field Key for Point: campo che contiene AREAS_SBI.IdArea per bolle e marcatori. */
  fieldKeyForPoint?: string;
  /** External point: se true lat/lng arrivano dalla query. */
  externalPoint: boolean;
  fieldLatitude?: string;
  fieldLongitude?: string;

  metrics: MapMetric[];

  /**
   * false se il campo Query è vuoto: la mappa non esegue una query propria
   * e visualizza il risultato dell'elemento Parent (input `parentResult`). Default true.
   */
  hasQuery?: boolean;

  /** Data Entry Flag: se true anche il clic fuori dalle aree invia LAT/LNG. */
  dataEntryFlag: boolean;

  mapCenterLat?: number;
  mapCenterLng?: number;
  /** Zoom iniziale. Un valore non valido (es. NaN o testo non numerico) fa usare il default, zoom 6. */
  mapCenterZoom?: number | string;

  /**
   * Numero = pixel, stringa = valore CSS (es. '100%').
   * Se assenti, come nel componente originale, la mappa occupa tutto lo spazio libero (100%).
   */
  width?: number | string;
  height?: number | string;
}

export type QueryRow = Readonly<Record<string, unknown>>;

/**
 * Risposta del back-end alla query del componente (PreQuery inclusa).
 *
 * La PreQuery (script Groovy o jar Java) restituisce vero o falso; con falso la query non viene eseguita
 * e la mappa mostra il messaggio. Il messaggio arriva dallo script (HashMap false → testo)
 * o dalla proprietà On Failure Answer (manuale SadasBI, cap. 8).
 */
export interface MapsQueryResult {
  preQueryOk: boolean;
  /** Messaggio della PreQuery fallita. */
  message?: string;
  rows: QueryRow[];
}

/** Parametri passati alla pagina collegata o al Parent al clic sulla mappa. */
export interface MapClickParams {
  IDAREAMAP: string | null;
  IDMETRIC: string | null;
  METR_LABEL: string | null;
  METR_VALUE: unknown;
  LABELMAP: string | null;
  LAT: number;
  LNG: number;
  /** Record della query selezionato (null con clic fuori dalle aree). */
  record: QueryRow | null;
}

/** Modello della legenda generata da Min/Max Value e Min/Max Color. */
export interface LegendModel {
  title: string;
  min: number;
  max: number;
  minColor: string;
  maxColor: string;
  minOpacity: number;
  maxOpacity: number;
  /** Presente solo per le bolle. */
  radius?: { min: number; max: number };
}
