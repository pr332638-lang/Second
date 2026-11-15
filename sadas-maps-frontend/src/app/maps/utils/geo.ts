import type * as L from 'leaflet';
import type { GeometryLevel } from '../maps.models';

/** Livelli dei poligoni dal più al meno dettagliato (ordine usato per i ripieghi in cache). */
export const POLYGON_LEVELS: readonly GeometryLevel[] = ['L3', 'L2', 'L1', 'L0'];

/**
 * Livello di dettaglio dei confini in base allo zoom.
 * Il back-end restituisce versioni precalcolate per livello con JTS CoverageSimplifier,
 * che mantiene accostate le aree confinanti (vedi README, "Semplificazione per livello di zoom").
 */
export function detailLevelForZoom(zoom: number): GeometryLevel {
  if (zoom <= 5) return 'L0';
  if (zoom <= 8) return 'L1';
  if (zoom <= 11) return 'L2';
  return 'L3';
}

/** [ovest, sud, est, nord]: si confronta con MinLng/MinLat/MaxLng/MaxLat di POLYGONS_SBI. */
export type Bbox = [number, number, number, number];

/** true se due rettangoli [ovest, sud, est, nord] si toccano o si sovrappongono. */
export function bboxIntersects(a: Readonly<Bbox>, b: Readonly<Bbox>): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

export function boundsToBbox(bounds: L.LatLngBounds): Bbox {
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

export function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
