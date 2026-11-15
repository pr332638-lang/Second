import type { MapMetric, QueryRow } from '../maps.models';
import { fieldValue, toNumber } from './values';

/** Valori di ripiego quando la metrica non li specifica. */
export const STYLE_DEFAULTS = {
  minColor: '#fee8c8',
  maxColor: '#b30000',
  minOpacity: 140, // 0-255
  maxOpacity: 220, // 0-255
  minRadius: 4, // px
  maxRadius: 24, // px
  noValueColor: '#9e9e9e',
} as const;

export interface ValueRange {
  min: number;
  max: number;
}

export interface AreaStyle {
  color: string;
  /** Già convertita in 0-1 per Leaflet. */
  opacity: number;
  /** Pixel. */
  radius: number;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Posizione di un valore nella scala, tra 0 e 1.
 * Sotto il minimo → 0, sopra il massimo → 1. Con min = max non si divide per zero.
 * NaN se il valore non è un numero.
 */
export function normalize(value: number, range: ValueRange): number {
  if (!Number.isFinite(value)) return Number.NaN;
  if (range.max === range.min) return value >= range.max ? 1 : 0;
  return clamp((value - range.min) / (range.max - range.min), 0, 1);
}

/**
 * Min e Max della scala: quelli della metrica se impostati, altrimenti calcolati dai dati.
 * Ciclo invece di Math.min(...valori) per non superare il limite di argomenti con decine di migliaia di righe.
 */
export function resolveRange(metric: MapMetric, rows: readonly QueryRow[]): ValueRange | null {
  let min = metric.minValue;
  let max = metric.maxValue;
  if (min === undefined || max === undefined) {
    let dataMin = Number.POSITIVE_INFINITY;
    let dataMax = Number.NEGATIVE_INFINITY;
    for (const row of rows) {
      const v = toNumber(fieldValue(row, metric.currentValueField));
      if (Number.isNaN(v)) continue;
      if (v < dataMin) dataMin = v;
      if (v > dataMax) dataMax = v;
    }
    if (dataMin === Number.POSITIVE_INFINITY) {
      if (min === undefined && max === undefined) return null;
      dataMin = dataMax = (min ?? max)!;
    }
    min ??= dataMin;
    max ??= dataMax;
  }
  return min <= max ? { min, max } : { min: max, max: min };
}

export function parseHexColor(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function toHexColor([r, g, b]: readonly [number, number, number]): string {
  return '#' + [r, g, b].map((c) => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, '0')).join('');
}

/** Interpolazione lineare in RGB, come da documentazione. */
export function interpolateColor(from: string, to: string, t: number): string {
  const a = parseHexColor(from) ?? parseHexColor(STYLE_DEFAULTS.minColor)!;
  const b = parseHexColor(to) ?? parseHexColor(STYLE_DEFAULTS.maxColor)!;
  return toHexColor([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]);
}

/**
 * Regola del componente originale: Map Current Color/Opacity/Radius (script) si usano
 * solo quando la coppia Min/Max corrispondente non è impostata.
 */
export function usesScale(minOut: unknown, maxOut: unknown, scriptField: string | undefined): boolean {
  return (minOut !== undefined && minOut !== null && maxOut !== undefined && maxOut !== null) || !scriptField;
}

export function usesColorScale(metric: MapMetric): boolean {
  return usesScale(metric.minColor, metric.maxColor, metric.currentColorField);
}

export function usesRadiusScale(metric: MapMetric): boolean {
  return usesScale(metric.minRadius, metric.maxRadius, metric.currentRadiusField);
}

/** Stile di un'area: scala Min/Max se impostata, altrimenti valore calcolato dallo script. */
export function styleFor(row: QueryRow, metric: MapMetric, range: ValueRange): AreaStyle {
  const t = normalize(toNumber(fieldValue(row, metric.currentValueField)), range);
  const hasValue = !Number.isNaN(t);

  const scaleColor = hasValue
    ? interpolateColor(metric.minColor ?? STYLE_DEFAULTS.minColor, metric.maxColor ?? STYLE_DEFAULTS.maxColor, t)
    : STYLE_DEFAULTS.noValueColor;
  const scriptColor = fieldValue(row, metric.currentColorField);
  const color =
    !usesColorScale(metric) && typeof scriptColor === 'string' && parseHexColor(scriptColor)
      ? scriptColor
      : scaleColor;

  const scaleOpacity = lerp(
    metric.minOpacity ?? STYLE_DEFAULTS.minOpacity,
    metric.maxOpacity ?? STYLE_DEFAULTS.maxOpacity,
    hasValue ? t : 0,
  );
  const scriptOpacity = toNumber(fieldValue(row, metric.currentOpacityField));
  const opacity255 =
    !usesScale(metric.minOpacity, metric.maxOpacity, metric.currentOpacityField) && !Number.isNaN(scriptOpacity)
      ? scriptOpacity
      : scaleOpacity;

  const scaleRadius = lerp(
    metric.minRadius ?? STYLE_DEFAULTS.minRadius,
    metric.maxRadius ?? STYLE_DEFAULTS.maxRadius,
    hasValue ? t : 0,
  );
  const scriptRadius = toNumber(fieldValue(row, metric.currentRadiusField));
  const radius = !usesRadiusScale(metric) && !Number.isNaN(scriptRadius) ? scriptRadius : scaleRadius;

  // Come nel componente originale, l'opacità è un intero tra 0 e 255 (101,25 → 101).
  return { color, opacity: Math.round(clamp(opacity255, 0, 255)) / 255, radius: Math.max(0, radius) };
}
