import { describe, expect, it } from 'vitest';
import { sameValue } from './equal';

describe('sameValue', () => {
  it('valori semplici', () => {
    expect(sameValue(1, 1)).toBe(true);
    expect(sameValue('a', 'a')).toBe(true);
    expect(sameValue(Number.NaN, Number.NaN)).toBe(true);
    expect(sameValue(1, '1')).toBe(false);
    expect(sameValue(null, undefined)).toBe(false);
    expect(sameValue(null, {})).toBe(false);
  });

  it('oggetti uguali per contenuto, in qualsiasi ordine', () => {
    expect(sameValue({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('una proprietà undefined vale come assente', () => {
    expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(true);
    expect(sameValue({ a: undefined }, { b: undefined })).toBe(true);
  });

  it('negli array conta l’ordine', () => {
    expect(sameValue([1, 2], [1, 2])).toBe(true);
    expect(sameValue([1, 2], [2, 1])).toBe(false);
    expect(sameValue([1], { 0: 1 })).toBe(false);
  });

  it('una configurazione ricreata con lo stesso contenuto è uguale', () => {
    const make = () => ({
      id: 'mappa',
      externalPoint: false,
      metrics: [{ idMetric: 'POP', name: 'Popolazione', displayType: 'POLYGON', minValue: undefined }],
    });
    expect(sameValue(make(), make())).toBe(true);
    expect(sameValue(make(), { ...make(), id: 'altra' })).toBe(false);
  });

  it('date e altre classi si confrontano per riferimento', () => {
    const d = new Date(0);
    expect(sameValue(d, d)).toBe(true);
    expect(sameValue(new Date(0), new Date(0))).toBe(false);
  });
});
