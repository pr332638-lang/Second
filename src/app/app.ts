import { Component, signal } from '@angular/core';

import { MapComponent } from './map/map.component';
import { MapFeature } from './map/map-feature.model';

@Component({
  selector: 'app-root',
  imports: [MapComponent],
  template: `
    <h1>Mappa</h1>
    <app-map
      style="height: 500px"
      [features]="features()"
      (featureClick)="selected.set($event)"
    />
    @if (selected(); as f) {
      <p>Selezionato: <strong>{{ f.type }}</strong> – {{ f.label ?? f.id }}</p>
    }
  `,
})
export class App {
  protected readonly selected = signal<MapFeature | undefined>(undefined);

  protected readonly features = signal<MapFeature[]>([
    {
      id: 'area-1',
      type: 'POLYGON',
      label: 'Area di esempio',
      color: '#e63946',
      coordinates: [
        [41.91, 12.45],
        [41.92, 12.52],
        [41.88, 12.54],
        [41.87, 12.47],
      ],
    },
    { id: 'p-1', type: 'POINT', label: 'Punto A', coordinates: [41.8986, 12.4769], color: '#2a9d8f' },
    { id: 'p-2', type: 'POINT', label: 'Punto B', coordinates: [41.9029, 12.4534], radius: 10 },
    { id: 'm-1', type: 'MARKER', label: 'Colosseo', coordinates: [41.8902, 12.4922] },
  ]);
}
