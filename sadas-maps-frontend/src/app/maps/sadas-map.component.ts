import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import * as L from 'leaflet';
import { EMPTY, Subject, catchError, debounceTime, of, switchMap, tap } from 'rxjs';

import { MapLegendComponent } from './legend/map-legend.component';
import type {
  GeometryLevel,
  LegendModel,
  MapClickParams,
  MapMetric,
  MapsConfig,
  MapsQueryResult,
  QueryRow,
} from './maps.models';
import {
  MAPS_OSM_TILE_URL,
  clampZoom,
  configureDefaultIcon,
  createOsmLayer,
  injectZoomLimits,
} from './services/base-layer.factory';
import './services/leaflet-fixes';
import { createMarkerClusterGroup } from './services/leaflet-plugins';
import { MAPS_PERFORMANCE } from './services/performance';
import { MapsDataService, type AreaFeature, type GeometryScope } from './services/maps-data.service';
import { sameValue } from './utils/equal';
import { boundsToBbox, detailLevelForZoom, isValidLatLng } from './utils/geo';
import {
  STYLE_DEFAULTS,
  clamp,
  resolveRange,
  styleFor,
  usesColorScale,
  usesRadiusScale,
  type ValueRange,
} from './utils/scale';
import {
  areaIdOf,
  escapeHtml,
  fieldValue,
  formatValue,
  idOf,
  renderTemplate,
  toCssSize,
  toNumber,
  uniqueRowsPerArea,
  type ParentParams,
} from './utils/values';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'blocked' | 'error';

/** Esito della ricerca della posizione di un punto. */
type PointLookup =
  | { kind: 'ok'; latlng: L.LatLng; idArea: string | null; feature?: AreaFeature }
  | { kind: 'missing' } // nessuna area corrispondente: conta come record non mappato
  | { kind: 'pending' }; // geometria non ancora scaricata

interface BuiltLayer {
  layer: L.Layer;
  unmatched: number;
}

interface QueryRequest {
  componentId: string;
  params: Readonly<Record<string, unknown>>;
}

/** Vista iniziale della mappa: centro e zoom dalla configurazione (MapCenterLat/Long/Zoom). */
interface MapView {
  center: L.LatLngTuple;
  zoom: number;
}

/** Voce del pannello dei livelli: un'area che l'utente può mostrare o nascondere. */
export interface AreaItem {
  key: string;
  label: string;
}

const DEFAULT_CENTER: L.LatLngTuple = [41.9, 12.5]; // Italia
const DEFAULT_ZOOM = 6;
/** Oltre questa soglia il pannello dei livelli mostra un campo di ricerca per le aree. */
const AREA_FILTER_THRESHOLD = 15;
const PREQUERY_DEFAULT_MESSAGE = 'Nessun dato da visualizzare: la condizione di pre-query non è soddisfatta.';
const BASE_MAP_UNAVAILABLE = 'Mappa di base non raggiungibile: controllare la connessione o il server delle mappe.';
const NO_DATA = 'Nessun dato da mostrare con i filtri attuali.';
const GEOMETRIES_UNAVAILABLE = 'Confini o punti delle aree non caricati: nuovo tentativo al prossimo spostamento della mappa.';
/**
 * Scala usata quando non ce n'è una (nessun valore numerico e Min/Max non impostati):
 * tutti i valori risultano "senza valore", quindi aree grigie e marcatori normali, invece di una mappa vuota.
 */
const NO_VALUES_RANGE: ValueRange = { min: 0, max: 0 };

/** Bordi di default, al passaggio del mouse e alla selezione (il componente originale cambiava opacità e bordo). */
const POLYGON_BORDER: L.PathOptions = { color: '#ffffff', weight: 0.6 };
const BUBBLE_BORDER: L.PathOptions = { color: '#ffffff', weight: 1 };
const HOVER_BORDER: L.PathOptions = { color: '#1f2933', weight: 2 };
const SELECTED_BORDER: L.PathOptions = { color: '#1f2933', weight: 3 };
const HOVER_OPACITY_BOOST = 0.15;
const SELECTED_OPACITY_BOOST = 0.25;

function hoverStyle(base: L.PathOptions): L.PathOptions {
  return { ...base, ...HOVER_BORDER, fillOpacity: clamp((base.fillOpacity ?? 0.5) + HOVER_OPACITY_BOOST, 0, 1) };
}

function selectedStyle(base: L.PathOptions): L.PathOptions {
  return { ...base, ...SELECTED_BORDER, fillOpacity: clamp((base.fillOpacity ?? 0.5) + SELECTED_OPACITY_BOOST, 0, 1) };
}

const areaCollator = new Intl.Collator('it-IT', { sensitivity: 'base', numeric: true });

configureDefaultIcon();

/**
 * Componente Maps di SadasBI.
 *
 * Note di progetto:
 * - Angular 22 è zoneless e OnPush di default: lo stato è tutto in signal, quindi gli eventi
 *   Leaflet aggiornano la vista senza NgZone.
 * - Valori e geometrie arrivano separati; le geometrie sono in cache nel servizio, per connessione.
 * - Poligoni, bolle e marcatori standard sono disegnati su canvas (preferCanvas).
 * - Come nell'originale: pannello dei livelli con scelta della metrica e aree attivabili,
 *   legenda a barra sotto la mappa, barra della scala.
 */
@Component({
  selector: 'sadas-map',
  imports: [MapLegendComponent],
  templateUrl: './sadas-map.component.html',
  styleUrl: './sadas-map.component.scss',
  host: {
    class: 'sadas-map',
    '[style.width]': 'cssWidth()',
    '[style.height]': 'cssHeight()',
  },
})
export class SadasMapComponent {
  /** Configurazione del componente (proprietà definite nell'editor SadasBI). Passare un oggetto stabile. */
  readonly config = input.required<MapsConfig>();
  /** Parametri ereditati dal Parent (es. condizioni di un filtro). Ogni cambio rilancia la query. */
  readonly parentParams = input<Readonly<Record<string, unknown>>>({});
  /** Risultato della query del Parent: usato quando la mappa non ha una Query propria (hasQuery = false). */
  readonly parentResult = input<MapsQueryResult | null>(null);
  /** Clic su un'area, o sulla mappa con Data Entry Flag attivo. L'host apre Page o HyperLink. */
  readonly areaClick = output<MapClickParams>();

  /**
   * La configurazione confrontata per CONTENUTO: se la pagina ospite passa un oggetto nuovo uguale
   * al precedente, non riparte niente (né query né disegno). Tutto il componente legge questa, non `config`.
   */
  protected readonly settings = computed(() => this.config(), { equal: sameValue });
  /** I parametri del Parent, anch'essi confrontati per contenuto. */
  private readonly params = computed(() => this.parentParams(), { equal: sameValue });
  /** Ciò da cui dipende la query: cambiare titolo, metriche o centro non deve rilanciarla. */
  private readonly querySource = computed(
    () => {
      const config = this.settings();
      return { componentId: config.id, hasQuery: config.hasQuery !== false };
    },
    { equal: sameValue },
  );
  /** Centro e zoom chiesti dalla configurazione. Se cambiano dopo la creazione, la mappa si sposta. */
  private readonly configuredView = computed<MapView>(
    () => {
      const config = this.settings();
      const hasCenter = Number.isFinite(config.mapCenterLat) && Number.isFinite(config.mapCenterLng);
      return {
        center: hasCenter ? [config.mapCenterLat!, config.mapCenterLng!] : DEFAULT_CENTER,
        // MapCenterZoom assente, non numerico o NaN → DEFAULT_ZOOM; fuori intervallo → limitato.
        zoom: clampZoom(config.mapCenterZoom, this.zoomLimits.maxZoom, DEFAULT_ZOOM),
      };
    },
    { equal: sameValue },
  );

  private readonly mapHost = viewChild.required<ElementRef<HTMLElement>>('mapHost');
  private readonly data = inject(MapsDataService);
  /** Soglie tarate per computer lenti (services/performance.ts). */
  protected readonly perf = inject(MAPS_PERFORMANCE);
  private readonly osmUrl = inject(MAPS_OSM_TILE_URL);
  /** Zoom massimo della mappa e ultimo zoom con tile vere sul server (vedi base-layer.factory.ts). */
  private readonly zoomLimits = injectZoomLimits();

  protected readonly status = signal<LoadStatus>('idle');
  /** Messaggio bloccante: PreQuery fallita o errore. */
  protected readonly message = signal<string | null>(null);
  /** Avviso non bloccante sulla mappa di base (es. tile non raggiungibili). */
  protected readonly notice = signal<string | null>(null);
  /** Avviso non bloccante: l'ultima richiesta di geometrie è fallita. Sparisce alla prima riuscita. */
  protected readonly geometryNotice = signal<string | null>(null);
  /**
   * Avviso non bloccante: la query (o il risultato del Parent) non ha righe. Senza, la mappa resterebbe
   * vuota senza spiegazioni. Non compare con la PreQuery fallita, che ha già il suo messaggio.
   */
  protected readonly noDataNotice = computed(() =>
    this.status() === 'ready' && this.rows().length === 0 ? NO_DATA : null,
  );
  protected readonly rows = signal<readonly QueryRow[]>([]);
  protected readonly unmatched = signal(0);

  /** Pannello dei livelli. */
  protected readonly panelOpen = signal(true);
  protected readonly areaFilter = signal('');
  private readonly hiddenAreas = signal<ReadonlySet<string>>(new Set());

  private readonly selectedMetric = signal(0);
  private readonly mapReady = signal(false);
  private readonly geometryVersion = signal(0);
  /**
   * Livello di dettaglio dei confini per lo zoom corrente (L0–L3), aggiornato a ogni fine zoom.
   * Il disegno dei poligoni dipende da questo signal: cambiando zoom si ridisegna con il livello giusto
   * anche quando le sue geometrie sono già in memoria e non c'è nulla da scaricare.
   * Gli zoom dentro lo stesso livello non cambiano il valore, quindi non ridisegnano.
   */
  private readonly detailLevel = signal<GeometryLevel>(detailLevelForZoom(DEFAULT_ZOOM));

  protected readonly metrics = computed(() => this.settings().metrics ?? []);
  protected readonly metricIndex = computed(() =>
    Math.min(this.selectedMetric(), Math.max(0, this.metrics().length - 1)),
  );
  protected readonly metric = computed<MapMetric | null>(() => this.metrics()[this.metricIndex()] ?? null);
  /**
   * Righe della metrica corrente, una per IdArea (vince l'ultima): le stesse per scala, legenda,
   * pannello dei livelli e disegno, così i valori delle righe scartate non allargano la scala.
   */
  private readonly uniqueRows = computed<readonly QueryRow[]>(() => {
    const m = this.metric();
    return m ? uniqueRowsPerArea(this.rows(), m, this.settings()) : this.rows();
  });
  /**
   * Righe scartate perché ripetono un'area già presente (vale l'ultima). Si mostrano in un avviso:
   * quale riga vince dipende dall'ordine delle righe, che solo la query può garantire (ORDER BY).
   */
  protected readonly repeatedRows = computed(() => this.rows().length - this.uniqueRows().length);
  private readonly range = computed<ValueRange | null>(() => {
    const m = this.metric();
    return m ? resolveRange(m, this.uniqueRows()) : null;
  });

  private readonly scope = computed<GeometryScope>(() => ({
    componentId: this.settings().id,
    connection: this.settings().connection,
  }));

  /** Aree della metrica corrente, in ordine alfabetico, per il pannello dei livelli. */
  protected readonly areaItems = computed<AreaItem[]>(() => {
    const metric = this.metric();
    const config = this.settings();
    if (!metric) return [];
    // Stessi parametri del Parent dei tooltip (labelFor): un `${P.…}` in Field Label vale anche qui.
    const params = this.params();
    const byKey = new Map<string, string>();
    for (const row of this.uniqueRows()) {
      const key = areaKeyOf(row, metric, config);
      if (key === null) continue;
      const label = fieldValue(row, config.fieldLabel, params);
      byKey.set(key, label === undefined || label === null || label === '' ? key : String(label));
    }
    return [...byKey].map(([key, label]) => ({ key, label })).sort((a, b) => areaCollator.compare(a.label, b.label));
  });
  protected readonly showAreaFilter = computed(() => this.areaItems().length > AREA_FILTER_THRESHOLD);
  /** Aree che corrispondono alla ricerca (tutte, se la ricerca è vuota). */
  protected readonly matchingAreaItems = computed(() => {
    const q = this.areaFilter().trim().toLocaleLowerCase('it-IT');
    const items = this.areaItems();
    return q ? items.filter((i) => i.label.toLocaleLowerCase('it-IT').includes(q)) : items;
  });
  /**
   * Aree effettivamente elencate: al massimo areaListLimit. Migliaia di caselle nella pagina
   * renderebbero lento il pannello su un computer lento; per le altre si usa la ricerca.
   */
  protected readonly visibleAreaItems = computed(() => this.matchingAreaItems().slice(0, this.perf.areaListLimit));
  protected readonly hiddenListCount = computed(() => this.matchingAreaItems().length - this.visibleAreaItems().length);
  protected readonly showPanel = computed(() => this.metrics().length > 1 || this.areaItems().length > 0);

  protected readonly legend = computed<LegendModel | null>(() => {
    const m = this.metric();
    const r = this.range();
    // Niente legenda per i marcatori o se il colore arriva da un'espressione.
    if (!m || !r || m.displayType === 'MARKER' || !usesColorScale(m)) return null;
    return {
      title: m.name,
      min: r.min,
      max: r.max,
      minColor: m.minColor ?? STYLE_DEFAULTS.minColor,
      maxColor: m.maxColor ?? STYLE_DEFAULTS.maxColor,
      minOpacity: (m.minOpacity ?? STYLE_DEFAULTS.minOpacity) / 255,
      maxOpacity: (m.maxOpacity ?? STYLE_DEFAULTS.maxOpacity) / 255,
      radius:
        m.displayType === 'BUBBLE' && usesRadiusScale(m)
          ? { min: m.minRadius ?? STYLE_DEFAULTS.minRadius, max: m.maxRadius ?? STYLE_DEFAULTS.maxRadius }
          : undefined,
    };
  });

  protected readonly cssWidth = computed(() => toCssSize(this.settings().width, '100%'));
  protected readonly cssHeight = computed(() => toCssSize(this.settings().height, '100%'));

  private map?: L.Map;
  /** Ultima vista della configurazione applicata alla mappa. */
  private appliedView?: MapView;
  private dataLayer?: L.Layer;
  private resizeObserver?: ResizeObserver;

  /** Area selezionata: la chiave sopravvive ai ridisegni, i layer no. */
  private selectedKey: string | null = null;
  /**
   * Layer evidenziati come selezionati. Di solito uno, ma più record possono avere la stessa chiave
   * (es. due negozi senza IdArea con le stesse coordinate): si evidenziano e si ripristinano tutti insieme.
   */
  private selectedPaths: L.Path[] = [];
  /** Layer del disegno corrente per chiave, per selezionare tutti quelli di una chiave. */
  private readonly pathsByKey = new Map<string, L.Path[]>();
  private readonly baseStyles = new WeakMap<L.Path, L.PathOptions>();

  /** null = annulla la query in corso (es. passaggio al risultato del Parent). */
  private readonly query$ = new Subject<QueryRequest | null>();
  private readonly geometryNeeded$ = new Subject<void>();

  constructor() {
    afterNextRender(() => this.initMap());

    // Query: switchMap annulla la richiesta precedente se il Parent cambia di nuovo.
    this.query$
      .pipe(
        switchMap((request) => {
          if (!request) return EMPTY;
          this.status.set('loading');
          this.message.set(null);
          return this.data.runQuery(request.componentId, request.params).pipe(
            catchError((err: unknown) => {
              console.error('[sadas-map] errore query', err);
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((result) => this.applyQueryResult(result));

    effect(() => {
      const source = this.querySource();
      if (!source.hasQuery) {
        // Query vuota: si visualizza il risultato dell'elemento Parent.
        const parentResult = this.parentResult();
        untracked(() => {
          this.query$.next(null);
          if (parentResult) {
            this.applyQueryResult(parentResult);
          } else {
            this.rows.set([]);
            this.status.set('idle');
          }
        });
        return;
      }
      const params = this.params();
      untracked(() => this.query$.next({ componentId: source.componentId, params }));
    });

    // Vista: se MapCenterLat/Long/Zoom cambiano dopo la creazione, la mappa si sposta lì.
    // Solo quando cambiano davvero: gli spostamenti fatti dall'utente non vengono annullati.
    effect(() => {
      const view = this.configuredView();
      if (!this.mapReady()) return;
      untracked(() => {
        if (this.appliedView && sameValue(view, this.appliedView)) return;
        this.appliedView = view;
        this.map?.setView(view.center, view.zoom, { animate: false });
      });
    });

    // Geometrie: dopo nuovi dati, cambio metrica o spostamento della mappa.
    this.geometryNeeded$
      .pipe(
        debounceTime(this.perf.geometryDebounceMs),
        switchMap(() =>
          this.loadNeededGeometries().pipe(
            // Ogni risposta riuscita toglie l'avviso di un errore precedente.
            tap(() => this.geometryNotice.set(null)),
            catchError((err: unknown) => {
              // Senza avviso le aree resterebbero "in arrivo" per sempre: mappa vuota senza spiegazioni.
              // Le geometrie mancanti non finiscono in memoria, quindi il prossimo spostamento le richiede di nuovo.
              console.error('[sadas-map] errore geometrie', err);
              this.geometryNotice.set(GEOMETRIES_UNAVAILABLE);
              return of(false);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((changed) => {
        if (changed) this.geometryVersion.update((v) => v + 1);
      });

    effect(() => {
      this.rows();
      this.metric();
      if (this.mapReady()) untracked(() => this.geometryNeeded$.next());
    });

    // Configurazione: ID Metric ripetuti rendono ambiguo il parametro IDMETRIC del clic.
    effect(() => {
      const ids = this.metrics().map((m) => m.idMetric);
      const repeated = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
      if (repeated.length > 0) {
        console.warn(
          `[sadas-map] ${untracked(this.settings).id}: ID Metric ripetuti (${repeated.join(', ')}): ` +
            'il parametro IDMETRIC del clic è ambiguo',
        );
      }
    });

    // Disegno: ogni volta che cambiano dati, metrica, scala, aree visibili o geometrie disponibili.
    effect(() => {
      if (!this.mapReady()) return;
      const config = this.settings();
      const metric = this.metric();
      const rows = this.uniqueRows();
      const range = this.range();
      const hidden = this.hiddenAreas();
      // Il livello conta solo per i poligoni: bolle e marcatori non si ridisegnano cambiando zoom.
      const level = metric?.displayType === 'POLYGON' ? this.detailLevel() : null;
      this.geometryVersion();
      untracked(() => this.render(config, metric, rows, range, hidden, level));
    });

    inject(DestroyRef).onDestroy(() => {
      this.resizeObserver?.disconnect();
      this.map?.remove();
      this.map = undefined;
    });
  }

  // ---------------------------------------------------------------------------
  // Pannello dei livelli
  // ---------------------------------------------------------------------------

  protected selectMetric(index: number): void {
    this.selectedMetric.set(index);
    this.map?.closePopup();
  }

  protected isAreaVisible(key: string): boolean {
    return !this.hiddenAreas().has(key);
  }

  protected setAreaVisible(key: string, visible: boolean): void {
    this.hiddenAreas.update((hidden) => {
      const next = new Set(hidden);
      if (visible) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /**
   * Mostra o nasconde tutte le aree che corrispondono alla ricerca, anche quelle oltre il limite
   * dell'elenco (areaListLimit): "Nessuna" deve nascondere davvero tutte le aree.
   */
  protected setAllAreasVisible(visible: boolean): void {
    const keys = this.matchingAreaItems().map((i) => i.key);
    this.hiddenAreas.update((hidden) => {
      const next = new Set(hidden);
      for (const k of keys) {
        if (visible) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // Inizializzazione
  // ---------------------------------------------------------------------------

  private initMap(): void {
    const view = this.configuredView();
    const map = L.map(this.mapHost().nativeElement, {
      center: view.center,
      zoom: view.zoom,
      maxZoom: this.zoomLimits.maxZoom,
      preferCanvas: true,
    });
    this.map = map;
    this.appliedView = view;
    this.detailLevel.set(detailLevelForZoom(map.getZoom()));

    // Mappa di base: solo OpenStreetMap. Se le tile non arrivano (rete chiusa, server non raggiungibile)
    // i dati restano visibili e si mostra un avviso, che sparisce alla prima tile caricata.
    const base = createOsmLayer(this.osmUrl, this.zoomLimits);
    base.on('tileerror', () => this.notice.set(BASE_MAP_UNAVAILABLE));
    base.on('tileload', () => {
      if (this.notice() === BASE_MAP_UNAVAILABLE) this.notice.set(null);
    });
    base.addTo(map);

    // Barra della scala in km, presente in tutte le mappe dell'originale.
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => this.onMapClick(e));
    map.on('zoomend', () => this.detailLevel.set(detailLevelForZoom(map.getZoom())));
    map.on('moveend', () => this.geometryNeeded$.next());

    // La mappa deve ricalcolare le dimensioni se il contenitore cambia (tab, pannelli, percentuali).
    this.resizeObserver = new ResizeObserver(() => map.invalidateSize());
    this.resizeObserver.observe(this.mapHost().nativeElement);

    this.mapReady.set(true);
  }

  private applyQueryResult(result: MapsQueryResult | null): void {
    if (result === null) {
      this.rows.set([]);
      this.status.set('error');
      this.message.set('Errore nel caricamento dei dati.');
      return;
    }
    if (!result.preQueryOk) {
      this.rows.set([]);
      this.status.set('blocked');
      this.message.set(result.message || PREQUERY_DEFAULT_MESSAGE);
      return;
    }
    this.rows.set(result.rows ?? []);
    this.status.set('ready');
    this.message.set(null);
  }

  // ---------------------------------------------------------------------------
  // Geometrie
  // ---------------------------------------------------------------------------

  private loadNeededGeometries() {
    const map = this.map;
    const metric = this.metric();
    const config = this.settings();
    const rows = this.rows();
    if (!map || !metric || rows.length === 0) return of(false);

    if (metric.displayType === 'POLYGON') {
      const ids = collectIds(rows, config.fieldKeyForPolygons);
      const level = detailLevelForZoom(map.getZoom());
      const bbox = boundsToBbox(map.getBounds().pad(this.perf.boundsPadding)); // margine per pan brevi
      return this.data.loadGeometries(this.scope(), ids, level, bbox);
    }
    if (!config.externalPoint) {
      return this.data.loadGeometries(this.scope(), collectIds(rows, config.fieldKeyForPoint), 'POINT');
    }
    return of(false); // coordinate esterne: nessuna geometria da scaricare
  }

  // ---------------------------------------------------------------------------
  // Disegno
  // ---------------------------------------------------------------------------

  private render(
    config: MapsConfig,
    metric: MapMetric | null,
    uniqueRows: readonly QueryRow[],
    range: ValueRange | null,
    hidden: ReadonlySet<string>,
    level: GeometryLevel | null,
  ): void {
    const map = this.map;
    if (!map) return;

    this.dataLayer?.remove();
    this.dataLayer = undefined;
    // La chiave resta: i nuovi layer con quella chiave verranno riselezionati in registerPath.
    this.selectedPaths = [];
    this.pathsByKey.clear();

    if (!metric || uniqueRows.length === 0) {
      this.unmatched.set(0);
      return;
    }
    // Senza valori numerici si disegna lo stesso: aree grigie, bolle minime, marcatori normali.
    const scale = range ?? NO_VALUES_RANGE;

    // Le righe sono già una per IdArea (uniqueRows). Le aree nascoste dal pannello non si disegnano,
    // ma restano nella scala e nella legenda.
    const rows =
      hidden.size === 0
        ? uniqueRows
        : uniqueRows.filter((row) => {
            const key = areaKeyOf(row, metric, config);
            return key === null || !hidden.has(key);
          });

    const built =
      metric.displayType === 'POLYGON'
        ? this.buildPolygons(config, metric, rows, scale, level ?? detailLevelForZoom(map.getZoom()))
        : metric.displayType === 'BUBBLE'
          ? this.buildBubbles(config, metric, rows, scale)
          : this.buildMarkers(config, metric, rows);

    this.dataLayer = built.layer.addTo(map);
    this.unmatched.set(built.unmatched);
  }

  private buildPolygons(
    config: MapsConfig,
    metric: MapMetric,
    rows: readonly QueryRow[],
    range: ValueRange,
    level: GeometryLevel,
  ): BuiltLayer {
    const scope = this.scope();
    const rowById = new Map<string, QueryRow>();
    const features: AreaFeature[] = [];
    let unmatched = 0;

    for (const row of rows) {
      const id = idOf(row, config.fieldKeyForPolygons);
      if (id === null || this.data.isMissing(scope, id, level)) {
        unmatched++;
        continue;
      }
      rowById.set(id, row);
      const feature = this.data.getGeometry(scope, id, level);
      if (feature) features.push(feature); // assente = fuori vista o in arrivo
    }

    const baseStyle = (id: string): L.PathOptions => {
      const row = rowById.get(id);
      const s = row ? styleFor(row, metric, range) : null;
      return {
        ...POLYGON_BORDER,
        fillColor: s?.color ?? STYLE_DEFAULTS.noValueColor,
        fillOpacity: s?.opacity ?? 0.5,
      };
    };

    const layer = L.geoJSON(features, {
      style: (feature) => baseStyle(String(feature?.id)),
      onEachFeature: (feature, lyr) => {
        const id = String(feature.id);
        const row = rowById.get(id);
        if (!row) return;
        const path = lyr as L.Path;
        const label = this.labelFor(row, config, feature as AreaFeature, id);
        this.registerPath(path, id, baseStyle(id), true);
        // Testo costruito solo all'apertura: con migliaia di aree si risparmia lavoro al disegno.
        path.bindTooltip(() => tooltipHtml(label, metric, row), { sticky: true });
        path.on('click', (e) => this.onAreaClick(e as L.LeafletMouseEvent, metric, row, id, label, id));
      },
    });
    return { layer, unmatched };
  }

  private buildBubbles(config: MapsConfig, metric: MapMetric, rows: readonly QueryRow[], range: ValueRange): BuiltLayer {
    const items: { marker: L.CircleMarker; radius: number }[] = [];
    let unmatched = 0;

    for (const row of rows) {
      const pos = this.pointFor(row, config);
      if (pos.kind === 'missing') unmatched++;
      if (pos.kind !== 'ok') continue;

      const s = styleFor(row, metric, range);
      const label = this.labelFor(row, config, pos.feature, pos.idArea);
      const key = pointKey(pos);
      const base: L.CircleMarkerOptions = {
        ...BUBBLE_BORDER,
        radius: s.radius,
        fillColor: s.color,
        fillOpacity: s.opacity,
      };
      const marker = L.circleMarker(pos.latlng, base);
      // Le bolle non vengono portate in primo piano: coprirebbero quelle più piccole.
      this.registerPath(marker, key, base, false);
      this.decoratePoint(marker, metric, row, pos.idArea, label, key);
      items.push({ marker, radius: s.radius });
    }

    // Bolle grandi sotto, piccole sopra: restano tutte cliccabili.
    items.sort((a, b) => b.radius - a.radius);
    return { layer: L.featureGroup(items.map((i) => i.marker)), unmatched };
  }

  private buildMarkers(config: MapsConfig, metric: MapMetric, rows: readonly QueryRow[]): BuiltLayer {
    // Dimensioni e ancoraggio fissi finché non si chiarisce se sono configurabili.
    const icon = metric.imageMarkerUrl
      ? L.icon({ iconUrl: metric.imageMarkerUrl, iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -28] })
      : new L.Icon.Default();

    const markers: L.Marker[] = [];
    let unmatched = 0;

    for (const row of rows) {
      const pos = this.pointFor(row, config);
      if (pos.kind === 'missing') unmatched++;
      if (pos.kind !== 'ok') continue;

      const label = this.labelFor(row, config, pos.feature, pos.idArea);
      const marker = L.marker(pos.latlng, { icon, keyboard: false, title: label });
      this.decoratePoint(marker, metric, row, pos.idArea, label, pointKey(pos));
      markers.push(marker);
    }

    if (markers.length > this.perf.clusterThreshold) {
      const cluster = createMarkerClusterGroup({ chunkedLoading: true, showCoverageOnHover: false });
      if (cluster) {
        cluster.addLayers(markers);
        return { layer: cluster, unmatched };
      }
    }
    return { layer: L.featureGroup(markers), unmatched };
  }

  /** Popup, tooltip e clic comuni a bolle e marcatori. */
  private decoratePoint(
    layer: L.Layer,
    metric: MapMetric,
    row: QueryRow,
    idArea: string | null,
    label: string,
    key: string,
  ): void {
    // Testi costruiti solo all'apertura (e con i parametri del Parent di quel momento).
    layer.bindTooltip(() => escapeHtml(label));
    layer.bindPopup(() => popupHtml(metric, row, label, this.parentParams()));
    layer.on('click', (e) => this.onAreaClick(e as L.LeafletMouseEvent, metric, row, idArea, label, key));
  }

  /** Posizione di un punto: dalla query (External point) o dal punto centrale dell'area. */
  private pointFor(row: QueryRow, config: MapsConfig): PointLookup {
    if (config.externalPoint) {
      const lat = toNumber(fieldValue(row, config.fieldLatitude));
      const lng = toNumber(fieldValue(row, config.fieldLongitude));
      if (!isValidLatLng(lat, lng)) return { kind: 'missing' };
      return { kind: 'ok', latlng: L.latLng(lat, lng), idArea: idOf(row, config.fieldKeyForPoint) };
    }

    const scope = this.scope();
    const id = idOf(row, config.fieldKeyForPoint);
    if (id === null || this.data.isMissing(scope, id, 'POINT')) return { kind: 'missing' };
    const feature = this.data.getGeometry(scope, id, 'POINT');
    if (!feature) return { kind: 'pending' };
    if (feature.geometry.type !== 'Point') return { kind: 'missing' };
    const [lng, lat] = feature.geometry.coordinates; // GeoJSON: [lng, lat]
    return { kind: 'ok', latlng: L.latLng(lat, lng), idArea: id, feature };
  }

  private labelFor(row: QueryRow, config: MapsConfig, feature: AreaFeature | undefined, id: string | null): string {
    const fromField = fieldValue(row, config.fieldLabel, this.parentParams());
    if (fromField !== undefined && fromField !== null && fromField !== '') return String(fromField);
    return feature?.properties?.label ?? id ?? '';
  }

  // ---------------------------------------------------------------------------
  // Hover e selezione
  // ---------------------------------------------------------------------------

  /** Stile di base, hover e riselezione dopo un ridisegno. */
  private registerPath(path: L.Path, key: string, base: L.PathOptions, bringToFrontOnHover: boolean): void {
    this.baseStyles.set(path, base);
    const sameKey = this.pathsByKey.get(key);
    if (sameKey) sameKey.push(path);
    else this.pathsByKey.set(key, [path]);
    if (key === this.selectedKey) {
      this.selectedPaths.push(path);
      path.setStyle(selectedStyle(base));
    }
    path.on('mouseover', () => {
      if (this.selectedPaths.includes(path)) return;
      path.setStyle(hoverStyle(base));
      if (bringToFrontOnHover) {
        path.bringToFront();
        // L'area selezionata torna sopra: il suo bordo spesso non deve essere coperto dalla vicina.
        for (const selected of this.selectedPaths) selected.bringToFront();
      }
    });
    path.on('mouseout', () => {
      if (this.selectedPaths.includes(path)) return;
      path.setStyle(base);
    });
  }

  /**
   * Seleziona l'area con questa chiave (null = nessuna selezione): ripristina tutti i layer selezionati
   * prima ed evidenzia tutti quelli della chiave. I marcatori non hanno layer da evidenziare,
   * ma la chiave si ricorda lo stesso.
   */
  private select(key: string | null): void {
    for (const previous of this.selectedPaths) previous.setStyle(this.baseStyles.get(previous) ?? {});
    this.selectedKey = key;
    this.selectedPaths = key === null ? [] : [...(this.pathsByKey.get(key) ?? [])];
    for (const path of this.selectedPaths) {
      path.setStyle(selectedStyle(this.baseStyles.get(path) ?? {}));
      if (path instanceof L.Polygon) path.bringToFront();
    }
  }

  // ---------------------------------------------------------------------------
  // Clic
  // ---------------------------------------------------------------------------

  private onAreaClick(
    e: L.LeafletMouseEvent,
    metric: MapMetric,
    row: QueryRow,
    idArea: string | null,
    label: string,
    key: string,
  ): void {
    // Impedisce che lo stesso clic arrivi anche alla mappa (Data Entry Flag).
    L.DomEvent.stopPropagation(e);
    this.select(key);
    this.areaClick.emit({
      IDAREAMAP: idArea,
      IDMETRIC: metric.idMetric,
      METR_LABEL: metric.name,
      METR_VALUE: fieldValue(row, metric.currentValueField) ?? null,
      LABELMAP: label,
      LAT: e.latlng.lat, // punto cliccato, non il centro dell'area
      LNG: e.latlng.lng,
      record: row,
    });
  }

  private onMapClick(e: L.LeafletMouseEvent): void {
    this.select(null); // clic fuori dalle aree: nessuna area selezionata
    if (!this.settings().dataEntryFlag) return;
    const metric = this.metric();
    this.areaClick.emit({
      IDAREAMAP: null,
      IDMETRIC: metric?.idMetric ?? null,
      METR_LABEL: metric?.name ?? null,
      METR_VALUE: null,
      LABELMAP: null,
      LAT: e.latlng.lat,
      LNG: e.latlng.lng,
      record: null,
    });
  }
}

// -----------------------------------------------------------------------------
// Funzioni di supporto
// -----------------------------------------------------------------------------

function collectIds(rows: readonly QueryRow[], field: string | undefined): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    const id = idOf(row, field);
    if (id !== null) ids.push(id);
  }
  return ids;
}

/**
 * Chiave di un'area per la metrica corrente: IdArea del poligono o del punto,
 * oppure le coordinate con External point senza IdArea. Stessa chiave usata per la selezione.
 */
function areaKeyOf(row: QueryRow, metric: MapMetric, config: MapsConfig): string | null {
  const id = areaIdOf(row, metric, config);
  if (id !== null || metric.displayType === 'POLYGON' || !config.externalPoint) return id;
  const lat = toNumber(fieldValue(row, config.fieldLatitude));
  const lng = toNumber(fieldValue(row, config.fieldLongitude));
  return isValidLatLng(lat, lng) ? `${lat},${lng}` : null;
}

/** Chiave di selezione di un punto: IdArea, o le coordinate con External point (come areaKeyOf). */
function pointKey(pos: Extract<PointLookup, { kind: 'ok' }>): string {
  return pos.idArea ?? `${pos.latlng.lat},${pos.latlng.lng}`;
}

function tooltipHtml(label: string, metric: MapMetric, row: QueryRow): string {
  const value = formatValue(fieldValue(row, metric.currentValueField));
  return `<strong>${escapeHtml(label)}</strong><br>${escapeHtml(metric.name)}: ${escapeHtml(value)}`;
}

function popupHtml(metric: MapMetric, row: QueryRow, label: string, params: ParentParams): string {
  if (metric.popupValue) return renderTemplate(metric.popupValue, row, params);
  return tooltipHtml(label, metric, row);
}
