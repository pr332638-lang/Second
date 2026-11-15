import { describe, expect, it } from 'vitest';
import { areaKey, mergeGeometriesResponse, type AreaFeature, type GeometriesResponse } from './geometry-cache';

function feature(id: string | number | undefined, label = 'Area'): AreaFeature {
  return { type: 'Feature', id, properties: { label }, geometry: { type: 'Point', coordinates: [14.25, 40.85] } };
}

function response(features: AreaFeature[], notFound?: ReadonlyArray<string | number>): GeometriesResponse {
  return { type: 'FeatureCollection', features, notFound };
}

describe('areaKey', () => {
  it('numeri e testi diventano la stessa chiave', () => {
    expect(areaKey(1203)).toBe('1203');
    expect(areaKey('1203')).toBe('1203');
    expect(areaKey(' 1203 ')).toBe('1203');
  });
  it('valori assenti o vuoti non sono chiavi', () => {
    expect(areaKey(undefined)).toBe(null);
    expect(areaKey(null)).toBe(null);
    expect(areaKey('')).toBe(null);
    expect(areaKey('  ')).toBe(null);
  });
});

describe('mergeGeometriesResponse', () => {
  it('salva gli IdArea inesistenti come testo anche se arrivano come numeri', () => {
    const levelCache = new Map<string, AreaFeature>();
    const notFound = new Set<string>();
    mergeGeometriesResponse(levelCache, notFound, response([], [9999, '8888']));
    expect(notFound.has('9999')).toBe(true);
    expect(notFound.has('8888')).toBe(true);
    expect(notFound.size).toBe(2);
  });

  it('salva le geometrie con chiave testuale anche se l’id è numerico', () => {
    const levelCache = new Map<string, AreaFeature>();
    mergeGeometriesResponse(levelCache, new Set(), response([feature(1203, 'Milano'), feature('1204', 'Monza')]));
    expect(levelCache.get('1203')?.properties?.label).toBe('Milano');
    expect(levelCache.get('1204')?.properties?.label).toBe('Monza');
  });

  it('ignora feature senza id e IdArea vuoti', () => {
    const levelCache = new Map<string, AreaFeature>();
    const notFound = new Set<string>();
    const changed = mergeGeometriesResponse(levelCache, notFound, response([feature(undefined)], ['']));
    expect(changed).toBe(false);
    expect(levelCache.size).toBe(0);
    expect(notFound.size).toBe(0);
  });

  it('segnala se la memoria è cambiata', () => {
    const levelCache = new Map<string, AreaFeature>();
    const notFound = new Set<string>(['9999']);
    expect(mergeGeometriesResponse(levelCache, notFound, response([]))).toBe(false);
    expect(mergeGeometriesResponse(levelCache, notFound, response([], [9999]))).toBe(false); // già noto
    expect(mergeGeometriesResponse(levelCache, notFound, response([], [7777]))).toBe(true);
    expect(mergeGeometriesResponse(levelCache, notFound, response([feature(1)]))).toBe(true);
  });

  it('accetta una risposta senza notFound', () => {
    const levelCache = new Map<string, AreaFeature>();
    const notFound = new Set<string>();
    expect(mergeGeometriesResponse(levelCache, notFound, response([feature(5)]))).toBe(true);
    expect(notFound.size).toBe(0);
  });
});
