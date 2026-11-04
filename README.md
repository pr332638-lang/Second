# Second – Componente Mappa Angular 22

Componente `<app-map>` standalone (signals, OnPush) basato su [Leaflet](https://leafletjs.com/),
che disegna tre tipologie grafiche: **POLYGON**, **POINT**, **MARKER**.

## File

- `src/app/map/map-feature.model.ts` – tipi `MapFeature` (POLYGON / POINT / MARKER)
- `src/app/map/map.component.ts` – il componente mappa
- `src/app/app.ts` – esempio d'uso

## Setup in un progetto Angular 22

```bash
npm install leaflet
npm install -D @types/leaflet
```

In `angular.json` (target `build.options`) aggiungere CSS e immagini di Leaflet:

```json
"styles": ["node_modules/leaflet/dist/leaflet.css", "src/styles.css"],
"assets": [
  { "glob": "**/*", "input": "public" },
  { "glob": "**/*", "input": "node_modules/leaflet/dist/images", "output": "leaflet" }
]
```

## Uso

```html
<app-map style="height: 500px" [features]="features" (featureClick)="onClick($event)" />
```

```ts
features: MapFeature[] = [
  { id: 'a', type: 'POLYGON', coordinates: [[41.91, 12.45], [41.92, 12.52], [41.88, 12.54]] },
  { id: 'b', type: 'POINT',   coordinates: [41.8986, 12.4769], radius: 8, color: '#2a9d8f' },
  { id: 'c', type: 'MARKER',  coordinates: [41.8902, 12.4922], label: 'Colosseo' },
];
```

Input: `features`, `center`, `zoom`, `fitToFeatures`. Output: `featureClick`.
