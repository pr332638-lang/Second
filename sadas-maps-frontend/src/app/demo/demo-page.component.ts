import { DecimalPipe, JsonPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';

import type { MapClickParams } from '../maps/maps.models';
import { SadasMapComponent } from '../maps/sadas-map.component';
import { DEMO_SCENARIOS, type DemoScenario } from './demo-scenarios';
import { DemoBackendState } from './demo-backend.service';
import { areaRegistry } from './mock-data/geo-generator';

const MACROAREE = ['Nord', 'Centro', 'Sud', 'Isole'] as const;
const LATENCIES = [0, 300, 1500] as const;

/**
 * PAGINA DI PROVA del prototipo. Prende il posto di ciò che in SadasBI farà il resto della pagina:
 * - sceglie la configurazione (al posto del Manager);
 * - simula un filtro Parent, che passa i parametri alla mappa;
 * - mostra i parametri del clic, invece di aprire Page o HyperLink;
 * - dice quale back-end è in uso (Java o simulato nel browser) e mostra il registro delle richieste;
 * - con il back-end simulato, controlla latenza ed errori.
 *
 * Tutto il codice del prototipo sta nella cartella demo/: al momento dell'integrazione si toglie.
 */
@Component({
  selector: 'sadas-demo-page',
  imports: [SadasMapComponent, JsonPipe, DecimalPipe],
  templateUrl: './demo-page.component.html',
  styleUrl: './demo-page.component.scss',
})
export class DemoPageComponent {
  protected readonly backend = inject(DemoBackendState);

  protected readonly scenarios = DEMO_SCENARIOS;
  protected readonly macroaree = MACROAREE;
  protected readonly latencies = LATENCIES;
  protected readonly regions = areaRegistry().regions.map((r) => ({ id: r.polygonId, name: r.name, macroarea: r.macroarea }));

  protected readonly scenarioId = signal<string>(DEMO_SCENARIOS[0]!.id);
  /** Filtro simulato del Parent: macroarea ('' = tutte). */
  protected readonly macroarea = signal('');
  /** Filtro simulato del Parent: IdArea_Poligono della regione (0 = nessuna). */
  protected readonly regione = signal(0);
  protected readonly lastClick = signal<MapClickParams | null>(null);

  protected readonly scenario = computed<DemoScenario>(
    () => DEMO_SCENARIOS.find((s) => s.id === this.scenarioId()) ?? DEMO_SCENARIOS[0]!,
  );

  /**
   * Un elenco con un solo scenario, usato con @for e track: cambiando scenario Angular distrugge
   * la mappa e ne crea una nuova, come succederebbe aprendo un'altra pagina.
   */
  protected readonly activeScenarios = computed(() => [this.scenario()]);

  /** Parametri che il Parent passerebbe alla mappa. Oggetto nuovo solo quando cambia il filtro. */
  protected readonly parentParams = computed<Readonly<Record<string, unknown>>>(() => {
    switch (this.scenario().filter) {
      case 'macroarea':
        return this.macroarea() ? { MACROAREA: this.macroarea() } : {};
      case 'regione':
        return this.regione() ? { REGIONE: this.regione() } : {};
      default:
        return {};
    }
  });

  /** Totali del registro, utili per le prove di prestazioni. */
  protected readonly totals = computed(() => {
    const log = this.backend.log();
    return {
      requests: log.length,
      sizeKb: log.reduce((sum, r) => sum + r.sizeKb, 0),
      failed: log.filter((r) => r.failed).length,
      geometryRequests: log.filter((r) => r.kind === 'geometrie').length,
    };
  });

  /** Indirizzo della stessa pagina con l'altro back-end. */
  protected readonly otherModeHref = computed(() => (this.backend.mode === 'java' ? '?backend=simulato' : '?backend=java'));

  protected selectScenario(id: string): void {
    this.scenarioId.set(id);
    this.macroarea.set('');
    this.regione.set(0);
    this.lastClick.set(null);
    this.backend.clearLog();
  }

  protected onAreaClick(params: MapClickParams): void {
    this.lastClick.set(params);
  }
}
