import { describe, expect, it } from 'vitest';
import type { MapMetric, MapsConfig } from '../maps.models';
import { interpolateColor, normalize, resolveRange, styleFor } from './scale';
import {
  areaIdOf,
  fieldValue,
  formatValue,
  idOf,
  lastRowPerKey,
  renderTemplate,
  toCssSize,
  toNumber,
  uniqueRowsPerArea,
} from './values';

const metric: MapMetric = {
  idMetric: 'M1',
  name: 'Fatturato',
  displayType: 'BUBBLE',
  currentValueField: 'VAL',
  minValue: 0,
  maxValue: 100,
  minColor: '#000000',
  maxColor: '#ffffff',
  minOpacity: 0,
  maxOpacity: 255,
  minRadius: 4,
  maxRadius: 24,
};

describe('normalize', () => {
  it('limita i valori fuori scala', () => {
    expect(normalize(-10, { min: 0, max: 100 })).toBe(0);
    expect(normalize(150, { min: 0, max: 100 })).toBe(1);
  });
  it('non divide per zero con min = max', () => {
    expect(normalize(5, { min: 5, max: 5 })).toBe(1);
    expect(normalize(4, { min: 5, max: 5 })).toBe(0);
  });
});

describe('resolveRange', () => {
  it('calcola min e max dai dati se mancano', () => {
    const m = { ...metric, minValue: undefined, maxValue: undefined };
    expect(resolveRange(m, [{ VAL: 3 }, { VAL: '7,5' }, { VAL: null }])).toEqual({ min: 3, max: 7.5 });
  });
});

describe('styleFor', () => {
  it('interpola colore, opacità e raggio', () => {
    const s = styleFor({ VAL: 50 }, metric, { min: 0, max: 100 });
    expect(s.color).toBe('#808080');
    expect(s.opacity).toBeCloseTo(0.5, 2);
    expect(s.radius).toBe(14);
  });
  it('con Min/Max Color impostati ignora lo script', () => {
    const m = { ...metric, currentColorField: 'COL' };
    expect(styleFor({ VAL: 50, COL: '#ff0000' }, m, { min: 0, max: 100 }).color).toBe('#808080');
  });
  it('usa lo script solo se Min/Max Color non sono impostati', () => {
    const m = { ...metric, minColor: undefined, maxColor: undefined, currentColorField: 'COL' };
    expect(styleFor({ VAL: 50, COL: '#ff0000' }, m, { min: 0, max: 100 }).color).toBe('#ff0000');
  });
  it("riproduce l'esempio del componente originale", () => {
    const m = {
      ...metric,
      minColor: '#00FF00',
      maxColor: '#FF0000',
      minOpacity: 50,
      maxOpacity: 255,
      minRadius: 10,
      maxRadius: 30,
    };
    const s = styleFor({ VAL: 1500 }, m, { min: 1000, max: 3000 });
    expect(s.color).toBe('#40bf00');
    expect(Math.round(s.opacity * 255)).toBe(101);
    expect(s.radius).toBe(15);
  });
  it('usa il raggio dello script se Min/Max Radius non sono impostati', () => {
    const m = { ...metric, minRadius: undefined, maxRadius: undefined, currentRadiusField: 'R' };
    expect(styleFor({ VAL: 50, R: 9 }, m, { min: 0, max: 100 }).radius).toBe(9);
  });
});

describe('utilità sui valori', () => {
  it('legge numeri con la virgola decimale', () => {
    expect(toNumber('45,46')).toBe(45.46);
    expect(toNumber('1.234,5')).toBe(1234.5);
    expect(toNumber('5.801.692')).toBe(5801692);
    expect(toNumber('45.46')).toBe(45.46);
    expect(toNumber('abc')).toBeNaN();
  });
  it('escapa i valori nei popup', () => {
    expect(renderTemplate('<b>${F.NOME}</b>', { NOME: '<script>' })).toBe('<b>&lt;script&gt;</b>');
  });
  it('nei popup sostituisce campi ${F.x} e parametri ${P.x}, lasciando gli altri segnaposto', () => {
    const html = renderTemplate('${F.NOME} (${P.ANNO}) ${ALTRO}', { NOME: 'Napoli' }, { ANNO: 2026 });
    expect(html).toBe('Napoli (2026) ${ALTRO}');
  });
  it('nei popup lascia visibili i campi inesistenti, ma svuota quelli vuoti', () => {
    const html = renderTemplate('${F.NOME}|${F.VUOTO}|${F.NOMEE}|${P.MANCA}', { NOME: 'Roma', VUOTO: null });
    expect(html).toBe('Roma||${F.NOMEE}|${P.MANCA}');
  });
  it('nei popup formatta i numeri e i testi con separatori, non i codici', () => {
    expect(renderTemplate('${F.POP}', { POP: 5801692 })).toBe('5.801.692');
    expect(renderTemplate('${F.POP}', { POP: '5.801.692' })).toBe('5.801.692');
    expect(renderTemplate('${F.CAP}', { CAP: '20121' })).toBe('20121');
  });
  it('formatValue: numeri all’italiana, NaN e null vuoti', () => {
    expect(formatValue(5801692)).toBe('5.801.692');
    expect(formatValue(12.345)).toBe('12,35');
    expect(formatValue(Number.NaN)).toBe('');
    expect(formatValue(Number.POSITIVE_INFINITY)).toBe('');
    expect(formatValue(null)).toBe('');
    expect(formatValue(undefined)).toBe('');
  });
  it('formatValue: testi con separatori all’italiana, con tutti i loro decimali', () => {
    expect(formatValue('12.345,5')).toBe('12.345,5');
    expect(formatValue('12345,5')).toBe('12.345,5');
    // come per i numeri, in italiano il punto delle migliaia compare da 5 cifre
    expect(formatValue('1234,5')).toBe('1234,5');
    expect(formatValue('5.801.692')).toBe('5.801.692');
    expect(formatValue(' 0,5 ')).toBe('0,5');
    expect(formatValue('-12.345,50')).toBe('-12.345,50');
    // coordinate: nessun arrotondamento a due decimali
    expect(formatValue('45,46123')).toBe('45,46123');
    // troppi decimali: limitati a 20 invece di mandare in errore Intl.NumberFormat
    // (oltre la 17ª cifra le cifre sono quelle del double, quindi si controlla solo la lunghezza)
    expect(formatValue('0,' + '1'.repeat(150)).length).toBe('0,'.length + 20);
  });
  it('formatValue: codici, testi ambigui e malformati restano come sono', () => {
    // codici e identificativi, con o senza zeri iniziali
    expect(formatValue('015146')).toBe('015146');
    expect(formatValue('20121')).toBe('20121');
    expect(formatValue('3331234567')).toBe('3331234567');
    expect(formatValue('12345678901')).toBe('12345678901');
    // un solo punto senza virgola: dodicimila o dodici virgola tre?
    expect(formatValue('12.345')).toBe('12.345');
    expect(formatValue('9.18765')).toBe('9.18765');
    // separatori in posizioni non valide
    expect(formatValue('1..2')).toBe('1..2');
    expect(formatValue('1.')).toBe('1.');
    expect(formatValue('1.2.3,4')).toBe('1.2.3,4');
    expect(formatValue('12.34.567')).toBe('12.34.567');
    expect(formatValue('Napoli')).toBe('Napoli');
  });
  it('interpola i colori esadecimali corti', () => {
    expect(interpolateColor('#000', '#fff', 1)).toBe('#ffffff');
  });
});

describe('righe con lo stesso IdArea', () => {
  it("vince l'ultima riga, le righe senza chiave restano tutte", () => {
    const rows = [
      { ID: '1', V: 'a' },
      { ID: '2', V: 'b' },
      { ID: null, V: 'x' },
      { ID: '1', V: 'c' },
      { ID: null, V: 'y' },
    ];
    const result = lastRowPerKey(rows, (r) => idOf(r, '${F.ID}'));
    expect(result.map((r) => r.V)).toEqual(['b', 'c', 'x', 'y']);
  });

  const config: MapsConfig = {
    id: 'map1',
    fieldKeyForPolygons: '${F.ID_POLY}',
    fieldKeyForPoint: '${F.ID_PUNTO}',
    externalPoint: false,
    fieldLatitude: '${F.LAT}',
    fieldLongitude: '${F.LNG}',
    dataEntryFlag: false,
    metrics: [],
  };
  // Min/Max Value non impostati: la scala si calcola dai dati.
  const fromData = { ...metric, currentValueField: '${F.V}', minValue: undefined, maxValue: undefined };
  const polygons: MapMetric = { ...fromData, displayType: 'POLYGON' };
  const markers: MapMetric = { ...fromData, displayType: 'MARKER' };

  it('la scala usa solo le righe che vengono disegnate', () => {
    const rows = [
      { ID_POLY: 1, V: 100 },
      { ID_POLY: 2, V: 10 },
      { ID_POLY: 1, V: 5 }, // sostituisce la prima riga: 100 non deve entrare nella scala
    ];
    const unique = uniqueRowsPerArea(rows, polygons, config);
    expect(unique.map((r) => r['V'])).toEqual([10, 5]);
    expect(resolveRange(polygons, unique)).toEqual({ min: 5, max: 10 });
  });

  it('per i punti conta Field Key for Point, non quello dei poligoni', () => {
    const rows = [
      { ID_POLY: 1, ID_PUNTO: 'A', V: 1 },
      { ID_POLY: 1, ID_PUNTO: 'B', V: 2 },
      { ID_POLY: 2, ID_PUNTO: 'A', V: 3 },
    ];
    expect(uniqueRowsPerArea(rows, markers, config).map((r) => r['V'])).toEqual([2, 3]);
    expect(areaIdOf(rows[0], markers, config)).toBe('A');
    expect(areaIdOf(rows[0], polygons, config)).toBe('1');
  });

  it('External point: record distinti con le stesse coordinate restano tutti', () => {
    const external: MapsConfig = { ...config, externalPoint: true, fieldKeyForPoint: undefined };
    const rows = [
      { INSEGNA: 'Negozio 1', LAT: '45,46', LNG: '9,19' },
      { INSEGNA: 'Negozio 2', LAT: '45,46', LNG: '9,19' }, // stesso indirizzo, negozio diverso
      { INSEGNA: 'Negozio 3', LAT: '41,90', LNG: '12,49' },
    ];
    expect(areaIdOf(rows[0], markers, external)).toBeNull();
    expect(uniqueRowsPerArea(rows, markers, external).map((r) => r['INSEGNA'])).toEqual([
      'Negozio 1',
      'Negozio 2',
      'Negozio 3',
    ]);
  });

  it('External point con IdArea: vince comunque l’ultima riga per IdArea', () => {
    const external: MapsConfig = { ...config, externalPoint: true };
    const rows = [
      { ID_PUNTO: 7, V: 1, LAT: '45,46', LNG: '9,19' },
      { ID_PUNTO: 7, V: 2, LAT: '45,47', LNG: '9,20' },
    ];
    expect(uniqueRowsPerArea(rows, markers, external).map((r) => r['V'])).toEqual([2]);
  });
});

describe('riferimenti ai campi', () => {
  const row = { IDAREA_REGIONE: 15, POPOLAZIONE: '5.801.692', PROV: 'NA', COM: 'Pozzuoli' };
  it('legge un singolo ${F.CAMPO} mantenendo il tipo', () => {
    expect(fieldValue(row, '${F.IDAREA_REGIONE}')).toBe(15);
    expect(fieldValue(row, ' ${ F.IDAREA_REGIONE } ')).toBe(15);
  });
  it('accetta anche il nome di colonna semplice', () => {
    expect(fieldValue(row, 'IDAREA_REGIONE')).toBe(15);
  });
  it('compone le espressioni con più riferimenti in una stringa', () => {
    expect(fieldValue(row, '${F.PROV}-${F.COM}')).toBe('NA-Pozzuoli');
  });
  it('usa i riferimenti per IdArea e valore della metrica', () => {
    expect(idOf(row, '${F.IDAREA_REGIONE}')).toBe('15');
    expect(idOf(row, '${F.MANCANTE}')).toBeNull();
    // Stessa chiave della memoria delle geometrie: spazi e ".0" non impediscono il collegamento.
    expect(idOf({ ID: ' 1203 ' }, '${F.ID}')).toBe('1203');
    expect(idOf({ ID: '1203.0' }, '${F.ID}')).toBe('1203');
    const m = { ...metric, currentValueField: '${F.POPOLAZIONE}', minValue: 0, maxValue: 10_000_000 };
    expect(resolveRange(m, [row])).toEqual({ min: 0, max: 10_000_000 });
    expect(styleFor(row, { ...m, minValue: undefined, maxValue: undefined }, { min: 0, max: 5_801_692 }).radius).toBe(24);
  });
});

describe('dimensioni', () => {
  it('numero in pixel, stringa così com’è', () => {
    expect(toCssSize(500, '100%')).toBe('500px');
    expect(toCssSize('100%', '400px')).toBe('100%');
    expect(toCssSize(undefined, '100%')).toBe('100%');
    // Numeri scritti come testo, come da una configurazione XML.
    expect(toCssSize('400', '100%')).toBe('400px');
    expect(toCssSize(' 250.5 ', '100%')).toBe('250.5px');
    expect(toCssSize('  ', '100%')).toBe('100%');
    expect(toCssSize(Number.NaN, '100%')).toBe('100%');
  });
});

describe('arrotondamento opacità', () => {
  it("l'opacità è un intero tra 0 e 255 come nell'originale", () => {
    const s = styleFor({ VAL: 50 }, { ...metric, minOpacity: 0, maxOpacity: 255 }, { min: 0, max: 100 });
    expect(s.opacity * 255).toBe(128);
  });
  it('interpola i colori esadecimali corti', () => {
    expect(interpolateColor('#000', '#fff', 1)).toBe('#ffffff');
  });
});
