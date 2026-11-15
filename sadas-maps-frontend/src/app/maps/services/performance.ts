import { InjectionToken } from '@angular/core';

/**
 * Impostazioni che pesano sulle prestazioni, raccolte in un punto solo per poterle tarare dopo le misure.
 *
 * I valori di default sono pensati per i computer dei clienti, che si ipotizzano MEDIAMENTE LENTI:
 * meno elementi nella pagina, meno richieste durante gli spostamenti, cluster prima.
 * Si cambiano con un provider, senza toccare il componente:
 *   { provide: MAPS_PERFORMANCE, useValue: { ...DEFAULT_MAPS_PERFORMANCE, clusterThreshold: 500 } }
 */
export interface MapsPerformanceOptions {
  /** Oltre questo numero di marcatori si raggruppano in cluster (i marcatori sono elementi HTML, pesanti). */
  clusterThreshold: number;
  /** Aree mostrate al massimo nell'elenco del pannello dei livelli; per le altre si usa la ricerca. */
  areaListLimit: number;
  /** Attesa dopo l'ultimo spostamento o zoom prima di chiedere le geometrie (ms). */
  geometryDebounceMs: number;
  /** Margine intorno alla vista per le geometrie, come frazione della vista (0,2 = 20% per lato). */
  boundsPadding: number;
}

export const DEFAULT_MAPS_PERFORMANCE: MapsPerformanceOptions = {
  clusterThreshold: 200,
  areaListLimit: 200,
  geometryDebounceMs: 250,
  boundsPadding: 0.2,
};

export const MAPS_PERFORMANCE = new InjectionToken<MapsPerformanceOptions>('MAPS_PERFORMANCE', {
  providedIn: 'root',
  factory: () => DEFAULT_MAPS_PERFORMANCE,
});
