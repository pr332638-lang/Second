/**
 * SCENARI DEL PROTOTIPO: configurazioni pronte del componente mappa, al posto di quelle che
 * in futuro arriveranno dal SadasBI Manager. Le proprietà hanno gli stessi nomi del Manager
 * (Field Key `${F.CAMPO}`, Map Min/Max Color, ...), così il collegamento futuro sarà solo una traduzione.
 */
import type { MapsConfig } from '../maps/maps.models';
import { DEMO_IDS } from './mock-data/datasets';

/** Quale filtro simulato (al posto del Parent) mostra la pagina di prova. */
export type DemoFilterKind = 'macroarea' | 'regione' | 'nessuno';

export interface DemoScenario {
  id: string;
  title: string;
  /** Cosa si vuole provare con questo scenario. */
  description: string;
  filter: DemoFilterKind;
  config: MapsConfig;
}

const ITALIA = { mapCenterLat: 41.85, mapCenterLng: 12.6 } as const;

export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    id: DEMO_IDS.regioni,
    title: 'Regioni: popolazione, densità, classi',
    description:
      'Tre metriche da scegliere nel pannello dei livelli: poligoni con scala calcolata dai dati, bolle sui punti ' +
      'centrali, colore da espressione (Map Current Color). C’è anche una riga con un IdArea inesistente ' +
      'e una regione con un’isola (MultiPolygon).',
    filter: 'macroarea',
    config: {
      id: DEMO_IDS.regioni,
      title: 'Regioni (dati simulati)',
      fieldKeyForPolygons: '${F.IDAREA_POLIGONO}',
      fieldKeyForPoint: '${F.IDAREA_PUNTO}',
      fieldLabel: '${F.NOME}',
      externalPoint: false,
      dataEntryFlag: false,
      ...ITALIA,
      mapCenterZoom: 6,
      metrics: [
        {
          idMetric: 'POP',
          name: 'Popolazione',
          displayType: 'POLYGON',
          currentValueField: '${F.POPOLAZIONE}',
          minColor: '#fee8c8',
          maxColor: '#b30000',
          minOpacity: 170,
          maxOpacity: 230,
        },
        {
          idMetric: 'DENS',
          name: 'Densità (ab/km²)',
          displayType: 'BUBBLE',
          currentValueField: '${F.DENSITA}',
          minColor: '#c6dbef',
          maxColor: '#08519c',
          minOpacity: 200,
          maxOpacity: 235,
          minRadius: 6,
          maxRadius: 28,
          popupValue: '<b>${F.NOME}</b><br>Densità: ${F.DENSITA} ab/km²<br>Abitanti: ${F.POPOLAZIONE}',
        },
        {
          idMetric: 'CLASSE',
          name: 'Classe di densità (colore da espressione)',
          displayType: 'POLYGON',
          currentValueField: '${F.DENSITA}',
          currentColorField: '${F.COLORE}',
          minOpacity: 200,
          maxOpacity: 200,
        },
      ],
    },
  },
  {
    id: DEMO_IDS.province,
    title: 'Province: bolle e poligoni',
    description:
      '120 province. La metrica a poligoni ha Min/Max Value fissati (0–400): le province oltre 400 ab/km² ' +
      'prendono tutte il colore massimo. Prova anche il passaggio del mouse e la selezione.',
    filter: 'macroarea',
    config: {
      id: DEMO_IDS.province,
      title: 'Province (dati simulati)',
      fieldKeyForPolygons: '${F.IDAREA_POLIGONO}',
      fieldKeyForPoint: '${F.IDAREA_PUNTO}',
      fieldLabel: '${F.NOME}',
      externalPoint: false,
      dataEntryFlag: false,
      ...ITALIA,
      mapCenterZoom: 6,
      metrics: [
        {
          idMetric: 'POP',
          name: 'Popolazione',
          displayType: 'BUBBLE',
          currentValueField: '${F.POPOLAZIONE}',
          minColor: '#fdd49e',
          maxColor: '#d7301f',
          minOpacity: 190,
          maxOpacity: 235,
          minRadius: 4,
          maxRadius: 22,
        },
        {
          idMetric: 'DENS',
          name: 'Densità (ab/km²)',
          displayType: 'POLYGON',
          currentValueField: '${F.DENSITA}',
          minValue: 0,
          maxValue: 400,
          minColor: '#edf8e9',
          maxColor: '#006d2c',
          minOpacity: 180,
          maxOpacity: 230,
        },
      ],
    },
  },
  {
    id: DEMO_IDS.comuniRegione,
    title: 'Comuni di una regione (con PreQuery)',
    description:
      'La PreQuery simulata fallisce finché non scegli una regione: la mappa mostra il messaggio. ' +
      'Nella regione H c’è un comune con un’enclave (Polygon con un buco).',
    filter: 'regione',
    config: {
      id: DEMO_IDS.comuniRegione,
      title: 'Comuni della regione (dati simulati)',
      fieldKeyForPolygons: '${F.IDAREA_POLIGONO}',
      fieldKeyForPoint: '${F.IDAREA_PUNTO}',
      fieldLabel: '${F.NOME}',
      externalPoint: false,
      dataEntryFlag: false,
      ...ITALIA,
      mapCenterZoom: 6,
      metrics: [
        {
          idMetric: 'DENS',
          name: 'Densità (ab/km²)',
          displayType: 'POLYGON',
          currentValueField: '${F.DENSITA}',
          minColor: '#f2f0f7',
          maxColor: '#54278f',
          minOpacity: 180,
          maxOpacity: 235,
        },
        {
          idMetric: 'POP',
          name: 'Popolazione',
          displayType: 'BUBBLE',
          currentValueField: '${F.POPOLAZIONE}',
          minColor: '#fee391',
          maxColor: '#cc4c02',
          minOpacity: 200,
          maxOpacity: 235,
          minRadius: 3,
          maxRadius: 18,
        },
      ],
    },
  },
  {
    id: DEMO_IDS.comuniTutti,
    title: 'Tutti i comuni (prova di prestazioni)',
    description:
      '7.681 comuni insieme. Spostandoti e ingrandendo, la mappa chiede solo le aree visibili e cambia livello ' +
      'di dettaglio (L0–L3): il registro delle richieste mostra cosa arriva e quanto pesa.',
    filter: 'nessuno',
    config: {
      id: DEMO_IDS.comuniTutti,
      title: 'Tutti i comuni (dati simulati)',
      fieldKeyForPolygons: '${F.IDAREA_POLIGONO}',
      fieldKeyForPoint: '${F.IDAREA_PUNTO}',
      fieldLabel: '${F.NOME}',
      externalPoint: false,
      dataEntryFlag: false,
      ...ITALIA,
      mapCenterZoom: 6,
      metrics: [
        {
          idMetric: 'DENS',
          name: 'Densità (ab/km²)',
          displayType: 'POLYGON',
          currentValueField: '${F.DENSITA}',
          minValue: 0,
          maxValue: 600,
          minColor: '#ffffcc',
          maxColor: '#800026',
          minOpacity: 190,
          maxOpacity: 235,
        },
      ],
    },
  },
  {
    id: DEMO_IDS.negozi,
    title: 'Negozi: punti esterni e cluster',
    description:
      '2.500 negozi con coordinate dalla query, scritte come testo con la virgola (External point = Sì). ' +
      'Oltre 200 marcatori compaiono i cluster. Data Entry Flag è attivo: anche un clic fuori dai punti ' +
      'invia LAT e LNG. Sei righe hanno coordinate non valide. Due negozi diversi stanno allo stesso ' +
      'indirizzo (vicino a Milano, macroarea Nord): compaiono entrambi e, a bolle, si selezionano insieme.',
    filter: 'macroarea',
    config: {
      id: DEMO_IDS.negozi,
      title: 'Negozi (dati simulati)',
      fieldLabel: '${F.INSEGNA}',
      externalPoint: true,
      fieldLatitude: '${F.LAT}',
      fieldLongitude: '${F.LNG}',
      dataEntryFlag: true,
      ...ITALIA,
      mapCenterZoom: 6,
      metrics: [
        {
          idMetric: 'FATT_M',
          name: 'Negozi (marcatori)',
          displayType: 'MARKER',
          currentValueField: '${F.FATTURATO}',
          popupValue: '<b>${F.INSEGNA}</b><br>${F.CATEGORIA}<br>Fatturato: ${F.FATTURATO} €',
        },
        {
          idMetric: 'FATT_B',
          name: 'Fatturato (bolle)',
          displayType: 'BUBBLE',
          currentValueField: '${F.FATTURATO}',
          minColor: '#c7e9c0',
          maxColor: '#00441b',
          minOpacity: 160,
          maxOpacity: 220,
          minRadius: 2,
          maxRadius: 9,
          popupValue: '<b>${F.INSEGNA}</b><br>Fatturato: ${F.FATTURATO} €',
        },
      ],
    },
  },
];
