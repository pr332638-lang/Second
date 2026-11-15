import { describe, expect, it } from 'vitest';
import { clampZoom, parseZoom, resolveZoomLimits } from './zoom';

describe('parseZoom', () => {
  it('accetta numeri e testi numerici', () => {
    expect(parseZoom(8)).toBe(8);
    expect(parseZoom('8')).toBe(8);
    expect(parseZoom(' 7,5 ')).toBe(7.5);
  });
  it('restituisce NaN per tutto il resto', () => {
    for (const v of [undefined, null, '', '  ', 'abc', Number.NaN, Infinity, {}, true]) {
      expect(parseZoom(v)).toBeNaN();
    }
  });
});

describe('clampZoom', () => {
  it('arrotonda e limita all’intervallo', () => {
    expect(clampZoom(8, 19, 6)).toBe(8);
    expect(clampZoom(7.6, 19, 6)).toBe(8);
    expect(clampZoom(-2, 19, 6)).toBe(0);
    expect(clampZoom(22, 19, 6)).toBe(19);
    expect(clampZoom(18, 17, 6)).toBe(17);
  });
  it('usa il default se lo zoom non è valido', () => {
    expect(clampZoom(Number.NaN, 19, 6)).toBe(6);
    expect(clampZoom(undefined, 19, 6)).toBe(6);
    expect(clampZoom('abc', 19, 6)).toBe(6);
    expect(clampZoom('', 19, 6)).toBe(6);
  });
  it('legge lo zoom scritto come testo, per esempio da un XML', () => {
    expect(clampZoom('10', 19, 6)).toBe(10);
  });
  it('non si rompe se anche default o massimo non sono validi', () => {
    expect(clampZoom(Number.NaN, 19, Number.NaN)).toBe(0);
    expect(clampZoom(25, Number.NaN, 6)).toBe(19);
    expect(clampZoom(8, 5, 6)).toBe(5);
  });
});

describe('resolveZoomLimits', () => {
  it('di default zoom massimo e zoom delle tile coincidono', () => {
    expect(resolveZoomLimits(19, 19)).toEqual({ maxZoom: 19, maxNativeZoom: 19 });
  });
  it('permette di ingrandire oltre le tile del server', () => {
    expect(resolveZoomLimits(19, 17)).toEqual({ maxZoom: 19, maxNativeZoom: 17 });
  });
  it('lo zoom delle tile non supera lo zoom massimo', () => {
    expect(resolveZoomLimits(15, 19)).toEqual({ maxZoom: 15, maxNativeZoom: 15 });
  });
  it('valori non validi → valori del server pubblico OSM', () => {
    expect(resolveZoomLimits(Number.NaN, Number.NaN)).toEqual({ maxZoom: 19, maxNativeZoom: 19 });
    expect(resolveZoomLimits(Number.NaN, 17)).toEqual({ maxZoom: 17, maxNativeZoom: 17 });
  });
  it('arrotonda e resta entro i limiti di Leaflet', () => {
    expect(resolveZoomLimits(30, 17.4)).toEqual({ maxZoom: 22, maxNativeZoom: 17 });
    expect(resolveZoomLimits(-3, -1)).toEqual({ maxZoom: 0, maxNativeZoom: 0 });
  });
});
