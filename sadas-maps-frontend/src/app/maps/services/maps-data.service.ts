import { HttpClient } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import type { GeometryLevel, MapsQueryResult } from '../maps.models';
import { POLYGON_LEVELS, type Bbox } from '../utils/geo';
import {
  areaKey,
  mergeGeometriesResponse,
  type AreaFeature,
  type GeometriesResponse,
} from '../utils/geometry-cache';

export type { AreaFeature } from '../utils/geometry-cache';

/** URL base delle API del componente. Da adattare alle convenzioni del back-end SadasBI. */
export const MAPS_API_BASE_URL = new InjectionToken<string>('MAPS_API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api/sadasbi/maps',
});

/**
 * Da dove vengono le geometrie. Le tabelle del plugin sono installate su una connessione specifica
 * (Manager → Settings → Plugin), e connessioni diverse possono avere versioni diverse del plugin
 * (es. ITA_SADASBI_MAPS_Default_2014 e _2015). Per questo le geometrie si chiedono per componente,
 * e il back-end usa la sua Connection; la cache è separata per connessione.
 */
export interface GeometryScope {
  componentId: string;
  /** Connection del componente; se assente la cache è separata per componente. */
  connection?: string;
}

interface ScopeCache {
  levels: Map<GeometryLevel, Map<string, AreaFeature>>;
  notFound: Set<string>;
}

/**
 * Accesso ai dati del componente Maps.
 *
 * Principio chiave: i valori arrivano con la query (leggeri), le geometrie a parte e restano in cache,
 * perché i confini non cambiano tra una query e l'altra.
 */
@Injectable({ providedIn: 'root' })
export class MapsDataService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(MAPS_API_BASE_URL);

  private readonly caches = new Map<string, ScopeCache>();

  /** Esegue PreQuery + Query del componente, con i parametri ereditati dal Parent. */
  runQuery(componentId: string, params: Readonly<Record<string, unknown>>): Observable<MapsQueryResult> {
    return this.http.post<MapsQueryResult>(
      `${this.baseUrl}/components/${encodeURIComponent(componentId)}/query`,
      { params },
    );
  }

  /** true se il back-end ha già detto che l'IdArea non esiste su quella connessione. */
  isMissing(scope: GeometryScope, id: string | number): boolean {
    const key = areaKey(id);
    return key !== null && this.cacheFor(scope).notFound.has(key);
  }

  /**
   * Geometria in cache. Per i poligoni, se manca il livello richiesto usa un altro livello già scaricato,
   * così cambiando zoom la mappa non resta vuota mentre arriva il dettaglio giusto.
   */
  getGeometry(scope: GeometryScope, id: string | number, level: GeometryLevel): AreaFeature | undefined {
    const key = areaKey(id);
    if (key === null) return undefined;
    const levels = this.cacheFor(scope).levels;
    const exact = levels.get(level)?.get(key);
    if (exact || level === 'POINT') return exact;
    for (const l of POLYGON_LEVELS) {
      const f = levels.get(l)?.get(key);
      if (f) return f;
    }
    return undefined;
  }

  /**
   * Scarica le geometrie mancanti. Per i poligoni si passa il bbox della vista corrente:
   * il back-end restituisce solo quelle che lo intersecano.
   * Emette true se la cache è cambiata (serve ridisegnare), false altrimenti.
   */
  loadGeometries(
    scope: GeometryScope,
    ids: readonly string[],
    level: GeometryLevel,
    bbox?: Bbox,
  ): Observable<boolean> {
    const cache = this.cacheFor(scope);
    const levelCache = this.levelCache(cache, level);
    const keys = ids.map(areaKey).filter((k): k is string => k !== null);
    const missing = [...new Set(keys)].filter((id) => !levelCache.has(id) && !cache.notFound.has(id));
    if (missing.length === 0) return of(false);

    return this.http
      .post<GeometriesResponse>(
        `${this.baseUrl}/components/${encodeURIComponent(scope.componentId)}/geometries`,
        { ids: missing, level, bbox },
      )
      // IdArea sempre convertiti in testo: vedi mergeGeometriesResponse.
      .pipe(map((response) => mergeGeometriesResponse(levelCache, cache.notFound, response)));
  }

  private cacheFor(scope: GeometryScope): ScopeCache {
    const key = scope.connection ? `conn:${scope.connection}` : `comp:${scope.componentId}`;
    let c = this.caches.get(key);
    if (!c) {
      c = { levels: new Map(), notFound: new Set() };
      this.caches.set(key, c);
    }
    return c;
  }

  private levelCache(cache: ScopeCache, level: GeometryLevel): Map<string, AreaFeature> {
    let c = cache.levels.get(level);
    if (!c) {
      c = new Map();
      cache.levels.set(level, c);
    }
    return c;
  }
}
