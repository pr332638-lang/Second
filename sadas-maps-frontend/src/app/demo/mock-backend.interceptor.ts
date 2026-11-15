import {
  HttpErrorResponse,
  HttpHeaders,
  HttpResponse,
  type HttpEvent,
  type HttpHandlerFn,
  type HttpInterceptorFn,
  type HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, map, mergeMap, throwError, timer } from 'rxjs';

import type { GeometryLevel } from '../maps/maps.models';
import { MAPS_API_BASE_URL } from '../maps/services/maps-data.service';
import { DemoBackendState } from './demo-backend.service';
import { runMockGeometries, runMockQuery } from './mock-data/datasets';

const GEOMETRY_LEVELS: readonly GeometryLevel[] = ['POINT', 'L0', 'L1', 'L2', 'L3'];

/**
 * BACK-END SIMULATO NEL BROWSER (modalità ?backend=simulato).
 *
 * Risponde alle due chiamate del componente mappa con dati generati nel browser, nello stesso formato
 * del back-end Java della cartella backend/ (vedi README):
 *   POST {base}/components/{id}/query       → { preQueryOk, message?, rows }
 *   POST {base}/components/{id}/geometries  → FeatureCollection GeoJSON + notFound
 * Come il back-end Java, aggiunge l'intestazione X-Compute-Ms.
 * In modalità 'java' e per tutte le altre richieste (es. le tile) lascia passare senza modifiche.
 *
 * Utile per lavorare sul front-end senza Java e per simulare latenza ed errori del server.
 */
export const mockBackendInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const state = inject(DemoBackendState);
  if (state.mode !== 'simulato') return next(req);

  const baseUrl = inject(MAPS_API_BASE_URL).replace(/\/+$/, '');
  const path = req.url.startsWith(baseUrl) ? req.url.slice(baseUrl.length) : null;
  const match = path ? /^\/components\/([^/]+)\/(query|geometries)$/.exec(path) : null;
  if (req.method !== 'POST' || !match) return next(req);

  const componentId = decodeURIComponent(match[1]!);
  const isQuery = match[2] === 'query';
  const body = (req.body ?? {}) as Record<string, unknown>;
  const latency = state.latencyMs();

  if (state.failRequests()) {
    return timer(latency).pipe(
      mergeMap(() =>
        throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Errore simulato', url: req.url })),
      ),
    );
  }

  // I dati si generano al momento dell'iscrizione, non prima: se la richiesta viene annullata
  // durante l'attesa (switchMap nel componente), il lavoro non viene nemmeno fatto.
  return timer(latency).pipe(
    map(() => {
      const start = performance.now();
      let responseBody: unknown;
      if (isQuery) {
        const params = (body['params'] ?? {}) as Readonly<Record<string, unknown>>;
        responseBody = runMockQuery(componentId, params);
      } else {
        const ids = Array.isArray(body['ids']) ? (body['ids'] as (string | number)[]) : [];
        const level = GEOMETRY_LEVELS.includes(body['level'] as GeometryLevel) ? (body['level'] as GeometryLevel) : 'L1';
        const bbox = Array.isArray(body['bbox']) ? (body['bbox'] as number[]) : undefined;
        responseBody = runMockGeometries(ids, level, bbox);
      }
      const headers = new HttpHeaders({ 'X-Compute-Ms': String(Math.round(performance.now() - start)) });
      return new HttpResponse({ status: 200, url: req.url, body: responseBody, headers });
    }),
  );
};
