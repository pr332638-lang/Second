/** Tipologie grafiche rappresentabili sulla mappa. */
export type MapFeatureType = 'POLYGON' | 'POINT' | 'MARKER';

/** Coordinata geografica: [latitudine, longitudine]. */
export type LatLng = [number, number];

interface BaseFeature {
  id: string;
  /** Testo mostrato nel popup al click (opzionale). */
  label?: string;
  /** Colore del contorno / riempimento (opzionale). */
  color?: string;
}

export interface PolygonFeature extends BaseFeature {
  type: 'POLYGON';
  /** Vertici del poligono (almeno 3). */
  coordinates: LatLng[];
}

export interface PointFeature extends BaseFeature {
  type: 'POINT';
  coordinates: LatLng;
  /** Raggio del punto in pixel (default 6). */
  radius?: number;
}

export interface MarkerFeature extends BaseFeature {
  type: 'MARKER';
  coordinates: LatLng;
}

export type MapFeature = PolygonFeature | PointFeature | MarkerFeature;
