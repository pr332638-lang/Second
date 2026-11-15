import { describe, expect, it } from 'vitest';
import {
  areaKey,
  chunk,
  emptyKnowledge,
  idsToRequest,
  mergeGeometriesResponse,
  type AreaFeature,
  type GeometriesResponse,
} from './geometry-cache';
import type { Bbox } from './geo';

function feature(id: string | number | undefined, label = 'Area'): AreaFeature {
  return { type: 'Feature', id, properties: { label }, geometry: { type: 'Point', coordinates: [14.25, 40.85] } };
}

function response(
  features: AreaFeature[],
  notFound?: ReadonlyArray<string | number>,
  outside?: Record<string, Bbox>,
): GeometriesResponse {
  return { type: 'FeatureCollection', features, notFound, outside };
}

describe('areaKey', () => {
  it('numeri e testi diventano la stessa chiave', () => {
    expect(areaKey(1203)).toBe('1203');
    expect(areaKey('1203')).toBe('1203');
    expect(areaKey(' 1203 ')).toBe('1203');
  });
  it('gli interi scritti come decimali diventano interi', () => {
    expect(areaKey('1203.0')).toBe('1203');
    expect(areaKey('1203,00')).toBe('1203');
    expect(areaKey(' 1203,0 ')).toBe('1203');
  });
  it('le forme ambigue o non intere restano come sono', () => {
    expect(areaKey('1.000')).toBe('1.000'); // in italiano è mille
    expect(areaKey('1203.5')).toBe('1203.5');
    expect(areaKey('ABC')).toBe('ABC');
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
    const k = emptyKnowledge();
    mergeGeometriesResponse(new Map(), k, 'POLYGON', response([], [9999, '8888']));
    expect(k.notFound.POLYGON.has('9999')).toBe(true);
    expect(k.notFound.POLYGON.has('8888')).toBe(true);
    expect(k.notFound.POLYGON.size).toBe(2);
  });

  it('separa gli IdArea inesistenti per tipo', () => {
    const k = emptyKnowledge();
    // Un confine chiesto come punto: inesistente come punto, non come confine.
    mergeGeometriesResponse(new Map(), k, 'POINT', response([], [1001]));
    expect(k.notFound.POINT.has('1001')).toBe(true);
    expect(k.notFound.POLYGON.has('1001')).toBe(false);
  });

  it('salva le geometrie con chiave testuale anche se l’id è numerico', () => {
    const levelCache = new Map<string, AreaFeature>();
    mergeGeometriesResponse(levelCache, emptyKnowledge(), 'POINT', response([feature(1203, 'Milano'), feature('1204', 'Monza')]));
    expect(levelCache.get('1203')?.properties?.label).toBe('Milano');
    expect(levelCache.get('1204')?.properties?.label).toBe('Monza');
  });

  it('ignora feature senza id e IdArea vuoti', () => {
    const levelCache = new Map<string, AreaFeature>();
    const k = emptyKnowledge();
    const changed = mergeGeometriesResponse(levelCache, k, 'POLYGON', response([feature(undefined)], ['']));
    expect(changed).toBe(false);
    expect(levelCache.size).toBe(0);
    expect(k.notFound.POLYGON.size).toBe(0);
  });

  it('segnala se la memoria è cambiata', () => {
    const levelCache = new Map<string, AreaFeature>();
    const k = emptyKnowledge();
    k.notFound.POLYGON.add('9999');
    expect(mergeGeometriesResponse(levelCache, k, 'POLYGON', response([]))).toBe(false);
    expect(mergeGeometriesResponse(levelCache, k, 'POLYGON', response([], [9999]))).toBe(false); // già noto
    expect(mergeGeometriesResponse(levelCache, k, 'POLYGON', response([], [7777]))).toBe(true);
    expect(mergeGeometriesResponse(levelCache, k, 'POLYGON', response([feature(1)]))).toBe(true);
  });

  it('ricorda i rettangoli delle aree fuori vista senza chiedere un ridisegno', () => {
    const k = emptyKnowledge();
    const changed = mergeGeometriesResponse(new Map(), k, 'POLYGON', response([], [], { 1001: [6, 36, 9, 39] }));
    expect(changed).toBe(false);
    expect(k.extents.get('1001')).toEqual([6, 36, 9, 39]);
  });

  it('accetta una risposta senza notFound né outside', () => {
    const k = emptyKnowledge();
    expect(mergeGeometriesResponse(new Map(), k, 'POLYGON', response([feature(5)]))).toBe(true);
    expect(k.notFound.POLYGON.size).toBe(0);
    expect(k.extents.size).toBe(0);
  });
});

describe('idsToRequest', () => {
  const view: Bbox = [10, 40, 12, 42];

  it('esclude doppioni, aree in memoria e inesistenti del tipo chiesto', () => {
    const cache = new Map<string, AreaFeature>([['1', feature(1)]]);
    const k = emptyKnowledge();
    k.notFound.POLYGON.add('2');
    k.notFound.POINT.add('3');
    expect(idsToRequest(['1', '2', '3', '3', '4'], cache, k, 'POLYGON')).toEqual(['3', '4']);
  });

  it('non richiede le aree note come fuori vista, finché la vista non le raggiunge', () => {
    const k = emptyKnowledge();
    k.extents.set('5', [6, 36, 7, 37]); // lontana
    k.extents.set('6', [11, 41, 13, 43]); // tocca la vista
    expect(idsToRequest(['5', '6', '7'], new Map(), k, 'POLYGON', view)).toEqual(['6', '7']);
    // Senza bbox (punti) i rettangoli non contano.
    expect(idsToRequest(['5'], new Map(), k, 'POLYGON')).toEqual(['5']);
  });
});

describe('chunk', () => {
  it('divide in blocchi della dimensione data', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
    expect(chunk([1, 2], 0)).toEqual([[1], [2]]); // dimensione minima 1
  });
});
