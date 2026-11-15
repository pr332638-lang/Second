import { Injectable, InjectionToken, inject, signal } from '@angular/core';

/**
 * Quale back-end usa la pagina di prova:
 * - 'java': il back-end Java 21 della cartella backend/ (avviato con mvn spring-boot:run), tramite il proxy di ng serve;
 * - 'simulato': il back-end simulato nel browser (mock-backend.interceptor.ts), senza bisogno di Java.
 */
export type BackendMode = 'java' | 'simulato';

/**
 * Modalità scelta all'avvio: 'java' di default, 'simulato' aggiungendo ?backend=simulato all'indirizzo.
 * Si cambia ricaricando la pagina, così le cache delle geometrie ripartono da zero.
 */
export function readBackendMode(search: string = globalThis.location?.search ?? ''): BackendMode {
  return new URLSearchParams(search).get('backend') === 'simulato' ? 'simulato' : 'java';
}

export const DEMO_BACKEND_MODE = new InjectionToken<BackendMode>('DEMO_BACKEND_MODE', {
  providedIn: 'root',
  factory: () => readBackendMode(),
});

/** Una richiesta al back-end (vero o simulato), per il registro della pagina di prova. */
export interface RequestLogEntry {
  kind: 'query' | 'geometrie';
  /** Dettaglio leggibile: componente, filtri, livello, numero di IdArea. */
  detail: string;
  /** Dimensione della risposta in KB (JSON non compresso). */
  sizeKb: number;
  /** Tempo totale visto dal browser: rete + lavoro del back-end (+ latenza aggiunta, se simulato). */
  totalMs: number;
  /** Tempo di lavoro dichiarato dal back-end (intestazione X-Compute-Ms), se c'è. */
  serverMs: number | null;
  /** Righe (query) o aree (geometrie) restituite. */
  items: number;
  failed: boolean;
  /** Messaggio d'errore, se la richiesta è fallita. */
  error?: string;
}

/**
 * Impostazioni e registro del back-end della pagina di prova.
 * La pagina li modifica e li mostra; gli intercettori HTTP li leggono e li aggiornano.
 */
@Injectable({ providedIn: 'root' })
export class DemoBackendState {
  readonly mode = inject(DEMO_BACKEND_MODE);

  /** Solo back-end simulato: ritardo aggiunto a ogni risposta, per simulare la rete (ms). */
  readonly latencyMs = signal(300);
  /** Solo back-end simulato: se true, ogni richiesta risponde con un errore 500. */
  readonly failRequests = signal(false);

  /** Ultime richieste, dalla più recente. */
  readonly log = signal<readonly RequestLogEntry[]>([]);

  record(entry: RequestLogEntry): void {
    this.log.update((log) => [entry, ...log].slice(0, 30));
  }

  clearLog(): void {
    this.log.set([]);
  }
}
