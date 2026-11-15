import { describe, expect, it } from 'vitest';
import type { AreaFeature } from '../../maps/utils/geometry-cache';
import { DEMO_IDS, MISSING_POLYGON_ID, NEGOZI_COUNT, NEGOZI_INVALID_COUNT, runMockGeometries, runMockQuery } from './datasets';
import {
  ENCLAVE_POLYGON_ID,
  PROVINCE_COUNT,
  REGION_COUNT,
  areaRegistry,
  featureFor,
  type Position,
} from './geo-generator';

type Ring = Position[];

function rings(f: AreaFeature): Ring[] {
  const g = f.geometry;
  if (g.type === 'Polygon') return g.coordinates as Ring[];
  if (g.type === 'MultiPolygon') return (g.coordinates as Ring[][]).flat();
  return [];
}

/** Area con segno: positiva se l'anello è antiorario. */
function signedArea(ring: Ring): number {
  let sum = 0;
  for (let k = 0; k < ring.length - 1; k++) sum += ring[k]![0] * ring[k + 1]![1] - ring[k + 1]![0] * ring[k]![1];
  return sum / 2;
}

/** Quanti segmenti di A compaiono, nel verso opposto, in B: cioè quanti segmenti di confine condividono. */
function sharedSegments(a: Ring, b: Ring): number {
  const key = (p: Position, q: Position) => `${p[0]},${p[1]}|${q[0]},${q[1]}`;
  const segA = new Set<string>();
  for (let k = 0; k < a.length - 1; k++) segA.add(key(a[k]!, a[k + 1]!));
  let shared = 0;
  for (let k = 0; k < b.length - 1; k++) if (segA.has(key(b[k + 1]!, b[k]!))) shared++;
  return shared;
}

const comuneId = (col: number, row: number) => 100001 + row * 80 + col;

describe('anagrafica simulata', () => {
  it('ha 20 regioni, 120 province e 7.681 comuni (7.680 più un’enclave)', () => {
    const reg = areaRegistry();
    expect(reg.regions.length).toBe(REGION_COUNT);
    expect(reg.provinces.length).toBe(PROVINCE_COUNT);
    expect(reg.comuni.length).toBe(7_681);
  });
  it('gli IdArea sono tutti diversi', () => {
    const reg = areaRegistry();
    const all = [...reg.regions, ...reg.provinces, ...reg.comuni];
    expect(reg.byPolygonId.size).toBe(all.length);
    expect(reg.byPointId.size).toBe(all.length);
  });
});

describe('geometrie simulate', () => {
  it('gli anelli sono chiusi e i confini esterni antiorari', () => {
    for (const id of [1001, 10001, comuneId(10, 10)]) {
      for (const level of ['L0', 'L3'] as const) {
        const outer = rings(featureFor(id, level)!)[0]!;
        expect(JSON.stringify(outer[0])).toBe(JSON.stringify(outer[outer.length - 1]));
        expect(signedArea(outer) > 0).toBe(true);
      }
    }
  });

  it('due comuni vicini condividono esattamente lo stesso confine, a ogni livello', () => {
    const a = rings(featureFor(comuneId(10, 10), 'L3')!)[0]!;
    const b = rings(featureFor(comuneId(11, 10), 'L3')!)[0]!;
    expect(sharedSegments(a, b)).toBe(12); // 11 punti intermedi → 12 segmenti
    const a0 = rings(featureFor(comuneId(10, 10), 'L0')!)[0]!;
    const b0 = rings(featureFor(comuneId(11, 10), 'L0')!)[0]!;
    expect(sharedSegments(a0, b0)).toBe(1);
  });

  it('due province vicine condividono il confine anche semplificato (L0)', () => {
    const a = rings(featureFor(10001, 'L0')!)[0]!;
    const b = rings(featureFor(10002, 'L0')!)[0]!;
    expect(sharedSegments(a, b)).toBe(2); // 8 celle, un nodo ogni 4
  });

  it('più dettaglio ai livelli più alti', () => {
    const count = (level: 'L0' | 'L1' | 'L2' | 'L3') => rings(featureFor(comuneId(20, 30), level)!)[0]!.length;
    expect(count('L0') < count('L1')).toBe(true);
    expect(count('L1') < count('L2')).toBe(true);
    expect(count('L2') < count('L3')).toBe(true);
  });

  it("il comune con l'enclave ha un buco orario, e l'enclave è quel buco al contrario", () => {
    const host = featureFor(comuneId(35, 35), 'L2')!;
    expect(host.geometry.type).toBe('Polygon');
    const [, hole] = rings(host);
    expect(signedArea(hole!) < 0).toBe(true);
    const enclave = rings(featureFor(ENCLAVE_POLYGON_ID, 'L2')!)[0]!;
    expect(JSON.stringify(enclave)).toBe(JSON.stringify([...hole!].reverse()));
  });

  it("la regione A, la provincia A1 e il comune A1-01 includono l'isola (MultiPolygon)", () => {
    for (const id of [1001, 10001, comuneId(0, 0)]) {
      expect(featureFor(id, 'L1')!.geometry.type).toBe('MultiPolygon');
    }
  });

  it('i punti si chiedono con IdArea_Punto, i confini con IdArea_Poligono', () => {
    expect(featureFor(2001, 'POINT')!.geometry.type).toBe('Point');
    expect(featureFor(2001, 'L1')).toBe(null);
    expect(featureFor(1001, 'POINT')).toBe(null);
  });
});

describe('back-end simulato', () => {
  it('le geometrie inesistenti tornano in notFound come numeri', () => {
    const res = runMockGeometries([String(MISSING_POLYGON_ID), '1001'], 'L1');
    expect(res.features.length).toBe(1);
    expect(JSON.stringify(res.notFound)).toBe(JSON.stringify([MISSING_POLYGON_ID]));
  });
  it('con un rettangolo lontano non restituisce confini, e non li segna come inesistenti', () => {
    const res = runMockGeometries(['1001', '1020'], 'L1', [-80, 10, -70, 20]);
    expect(res.features.length).toBe(0);
    expect(res.notFound?.length).toBe(0);
  });
  it('la query delle regioni contiene anche una riga con un IdArea inesistente', () => {
    const res = runMockQuery(DEMO_IDS.regioni, {});
    expect(res.rows.length).toBe(REGION_COUNT + 1);
    expect(res.rows.some((r) => r['IDAREA_POLIGONO'] === MISSING_POLYGON_ID)).toBe(true);
  });
  it('il filtro MACROAREA riduce le righe', () => {
    const nord = runMockQuery(DEMO_IDS.regioni, { MACROAREA: 'Nord' });
    expect(nord.rows.every((r) => r['MACROAREA'] === 'Nord')).toBe(true);
    expect(nord.rows.length).toBe(6); // 5 regioni + la riga inesistente
  });
  it('la PreQuery dei comuni di una regione fallisce senza filtro REGIONE', () => {
    const res = runMockQuery(DEMO_IDS.comuniRegione, {});
    expect(res.preQueryOk).toBe(false);
    expect(runMockQuery(DEMO_IDS.comuniRegione, { REGIONE: 1008 }).rows.length).toBe(385); // 384 comuni + enclave
  });
  it('i negozi hanno coordinate come testo con la virgola, più alcune non valide', () => {
    const rows = runMockQuery(DEMO_IDS.negozi, {}).rows;
    expect(rows.length).toBe(NEGOZI_COUNT + NEGOZI_INVALID_COUNT);
    expect(String(rows[0]!['LAT']).includes(',')).toBe(true);
  });
});
