import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';

import { LatLng, MapFeature } from './map-feature.model';

/** Icona del MARKER: le immagini vengono copiate da node_modules/leaflet (vedi angular.json). */
const MARKER_ICON = L.icon({
  iconUrl: 'leaflet/marker-icon.png',
  iconRetinaUrl: 'leaflet/marker-icon-2x.png',
  shadowUrl: 'leaflet/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const DEFAULT_COLOR = '#3388ff';

@Component({
  selector: 'app-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #mapContainer class="map"></div>`,
  styles: `
    :host { display: block; }
    .map { width: 100%; height: 100%; min-height: 400px; }
  `,
})
export class MapComponent {
  /** Elementi da disegnare sulla mappa. */
  readonly features = input<MapFeature[]>([]);
  /** Centro iniziale della mappa. */
  readonly center = input<LatLng>([41.9028, 12.4964]); // Roma
  /** Zoom iniziale. */
  readonly zoom = input(6);
  /** Se true, adatta la vista per contenere tutti gli elementi. */
  readonly fitToFeatures = input(true);

  /** Emesso quando l'utente clicca un elemento. */
  readonly featureClick = output<MapFeature>();

  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');
  private readonly map = signal<L.Map | undefined>(undefined);
  private readonly layer = L.featureGroup();

  constructor() {
    // La mappa va creata solo nel browser, dopo il primo render.
    afterNextRender(() => {
      const map = L.map(this.container().nativeElement, {
        center: this.center(),
        zoom: this.zoom(),
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      this.layer.addTo(map);
      this.map.set(map);
    });

    // Ridisegna gli elementi ogni volta che cambia l'input `features`.
    effect(() => {
      const map = this.map();
      const features = this.features();
      if (!map) return;

      this.layer.clearLayers();
      features.forEach((f) => this.toLayer(f).addTo(this.layer));

      if (this.fitToFeatures() && features.length > 0) {
        map.fitBounds(this.layer.getBounds(), { padding: [20, 20], maxZoom: 15 });
      }
    });

    inject(DestroyRef).onDestroy(() => this.map()?.remove());
  }

  /** Converte un MapFeature nel corrispondente layer Leaflet. */
  private toLayer(feature: MapFeature): L.Layer {
    const color = feature.color ?? DEFAULT_COLOR;
    let layer: L.Layer;

    switch (feature.type) {
      case 'POLYGON':
        layer = L.polygon(feature.coordinates, { color, fillColor: color, fillOpacity: 0.3 });
        break;
      case 'POINT':
        layer = L.circleMarker(feature.coordinates, {
          radius: feature.radius ?? 6,
          color,
          fillColor: color,
          fillOpacity: 0.9,
        });
        break;
      case 'MARKER':
        layer = L.marker(feature.coordinates, { icon: MARKER_ICON });
        break;
    }

    if (feature.label) {
      layer.bindPopup(feature.label);
    }
    layer.on('click', () => this.featureClick.emit(feature));
    return layer;
  }
}
