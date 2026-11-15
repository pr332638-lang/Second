import {
  HttpErrorResponse,
  HttpResponse,
  type HttpEvent,
  type HttpHandlerFn,
  type HttpInterceptorFn,
  type HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { MAPS_API_BASE_URL } from '../maps/services/maps-data.service';
import { DemoBackendState } from './demo-backend.service';

/**
 * Registra le chiamate della mappa al back-end, vero o simulato, per il registro della pagina di prova:
 * tempo totale, tempo dichiarato dal server (X-Compute-Ms), dimensione e numero di elementi.
 * Va messo PRIMA del back-end simulato, così misura anche la sua latenza.
 */
export const requestLogInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const baseUrl = inject(MAPS_API_BASE_URL).replace(/\/+$/, '');
  const state = inject(DemoBackendState);

  const path = req.url.startsWith(baseUrl) ? req.url.slice(baseUrl.length) : null;
  const match = path ? /^\/components\/([^/]+)\/(query|geometries)$/.exec(path) : null;
  if (req.method !== 'POST' || !match) return next(req);

  const componentId = decodeURIComponent(match[1]!);
  const kind = match[2] === 'query' ? 'query' : 'geometrie';
  const body = (req.body ?? {}) as Record<string, unknown>;
  const start = performance.now();

  return next(req).pipe(
    tap({
      next: (event) => {
        if (!(event instanceof HttpResponse)) return;
        const totalMs = performance.now() - start;
        const header = event.headers.get('X-Compute-Ms');
        const serverMs = header !== null && header !== '' && Number.isFinite(Number(header)) ? Number(header) : null;
        const responseBody = (event.body ?? {}) as Record<string, unknown>;
        const sizeKb = JSON.stringify(event.body ?? null).length / 1024;
        if (kind === 'query') {
          const rows = Array.isArray(responseBody['rows']) ? responseBody['rows'].length : 0;
          state.record({ kind, detail: queryDetail(componentId, body, responseBody), sizeKb, totalMs, serverMs, items: rows, failed: false });
        } else {
          const features = Array.isArray(responseBody['features']) ? responseBody['features'].length : 0;
          state.record({ kind, detail: geometryDetail(body, responseBody), sizeKb, totalMs, serverMs, items: features, failed: false });
        }
      },
      error: (err: unknown) => {
        const message =
          err instanceof HttpErrorResponse
            ? `${err.status || 'rete'} ${errorDetail(err) ?? err.statusText ?? ''}`.trim()
            : String(err);
        state.record({
          kind,
          detail: componentId,
          sizeKb: 0,
          totalMs: performance.now() - start,
          serverMs: null,
          items: 0,
          failed: true,
          error: message,
        });
      },
    }),
  );
};

function queryDetail(componentId: string, body: Record<string, unknown>, response: Record<string, unknown>): string {
  const params = (body['params'] ?? {}) as Record<string, unknown>;
  const filters = Object.entries(params)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(', ');
  return `${componentId}${filters ? ` (${filters})` : ''}${response['preQueryOk'] === false ? ' → PreQuery fallita' : ''}`;
}

function geometryDetail(body: Record<string, unknown>, response: Record<string, unknown>): string {
  const ids = Array.isArray(body['ids']) ? body['ids'].length : 0;
  const notFound = Array.isArray(response['notFound']) ? response['notFound'].length : 0;
  return `${String(body['level'] ?? '?')}, ${ids} IdArea chiesti${Array.isArray(body['bbox']) ? ', area visibile' : ''}, ${notFound} inesistenti`;
}

/** Il campo detail di una risposta d'errore Problem Details del back-end Java, se c'è. */
function errorDetail(err: HttpErrorResponse): string | null {
  const e = err.error as unknown;
  return e && typeof e === 'object' && typeof (e as Record<string, unknown>)['detail'] === 'string'
    ? ((e as Record<string, unknown>)['detail'] as string)
    : null;
}
