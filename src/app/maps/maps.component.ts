import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

import { MapComponent } from '../map/map.component';
import { MapFeature, MapFeatureType } from '../map/map-feature.model';

/** Valore del selettore: una tipologia oppure tutte. */
export type MapsFilter = MapFeatureType | 'ALL';

interface FilterOption {
  value: MapsFilter;
  label: string;
}

/**
 * Mappa con selettore: permette di scegliere se visualizzare
 * poligoni (POLYGON), bolle (POINT) o marcatori (MARKER).
 */
@Component({
  selector: 'app-maps',
  imports: [MapComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="selector" role="radiogroup" aria-label="Tipologia da visualizzare">
      @for (opt of options; track opt.value) {
        <label class="option" [class.active]="filter() === opt.value">
          <input
            type="radio"
            name="maps-filter"
            [value]="opt.value"
            [checked]="filter() === opt.value"
            (change)="filter.set(opt.value)"
          />
          {{ opt.label }} <span class="count">{{ counts()[opt.value] }}</span>
        </label>
      }
    </div>

    <app-map class="map" [features]="visibleFeatures()" (featureClick)="featureClick.emit($event)" />
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 8px; }
    .selector { display: flex; flex-wrap: wrap; gap: 4px; }
    .option {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px; border: 1px solid #ccc; border-radius: 999px;
      cursor: pointer; user-select: none; font: 14px system-ui, sans-serif;
    }
    .option input { position: absolute; opacity: 0; pointer-events: none; }
    .option:has(input:focus-visible) { outline: 2px solid #3388ff; outline-offset: 2px; }
    .option.active { background: #3388ff; border-color: #3388ff; color: #fff; }
    .count { font-size: 12px; opacity: 0.7; }
    .map { flex: 1; min-height: 400px; }
  `,
})
export class MapsComponent {
  /** Tutti gli elementi disponibili. */
  readonly features = input<MapFeature[]>([]);
  /** Tipologia selezionata; supporta il two-way binding: [(filter)]="...". */
  readonly filter = model<MapsFilter>('ALL');

  readonly featureClick = output<MapFeature>();

  protected readonly options: FilterOption[] = [
    { value: 'ALL', label: 'Tutti' },
    { value: 'POLYGON', label: 'Poligoni' },
    { value: 'POINT', label: 'Bolle' },
    { value: 'MARKER', label: 'Marcatori' },
  ];

  protected readonly visibleFeatures = computed(() => {
    const filter = this.filter();
    const features = this.features();
    return filter === 'ALL' ? features : features.filter((f) => f.type === filter);
  });

  protected readonly counts = computed(() => {
    const counts: Record<MapsFilter, number> = { ALL: 0, POLYGON: 0, POINT: 0, MARKER: 0 };
    for (const f of this.features()) {
      counts[f.type]++;
      counts.ALL++;
    }
    return counts;
  });
}
