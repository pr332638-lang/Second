import type { QueryRow } from '../maps.models';
import { areaKey } from './geometry-cache';

/**
 * Converte un valore della query in numero.
 * Gestisce le stringhe con virgola decimale ("45,46") e con separatore delle migliaia
 * ("1.234,5", "5.801.692"). Un solo punto senza virgola ("45.46") resta un decimale.
 */
export function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value !== 'string') return Number.NaN;

  let s = value.trim();
  if (s === '') return Number.NaN;
  if (s.includes(',')) {
    // con la virgola presente, i punti sono separatori delle migliaia
    s = s.replace(/\./g, '').replace(',', '.');
  } else if ((s.match(/\./g) ?? []).length > 1) {
    // più punti e nessuna virgola: sono separatori delle migliaia
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.NaN;
}

// -----------------------------------------------------------------------------
// Riferimenti ai campi
// -----------------------------------------------------------------------------

/** `${F.CAMPO}` = campo della query, `${P.NOME}` = parametro ricevuto dal Parent. */
const PLACEHOLDER = /\$\{\s*([FP])\.([^}]+?)\s*\}/g;
const SINGLE_FIELD = /^\s*\$\{\s*F\.([^}]+?)\s*\}\s*$/;

export type ParentParams = Readonly<Record<string, unknown>>;

/**
 * Valore di una proprietà che indica un campo (Field Key, Map Current Value, Field Label, ...).
 *
 * Come nel Manager di SadasBI, la proprietà può essere:
 * - un singolo riferimento `${F.CAMPO}` → valore del campo, con il suo tipo originale;
 * - un'espressione che combina testo e riferimenti (es. `${F.PROV}-${F.COMUNE}`) → stringa;
 * - un nome di colonna semplice (`CAMPO`) → accettato per comodità.
 *
 * Se le espressioni ammesse fossero più complesse (calcoli, funzioni), andrebbero valutate dal back-end.
 */
export function fieldValue(row: QueryRow, ref: string | undefined, params: ParentParams = {}): unknown {
  if (!ref) return undefined;
  const single = SINGLE_FIELD.exec(ref);
  if (single) return row[single[1] ?? ''];
  if (!ref.includes('${')) return row[ref.trim()];
  return ref.replace(PLACEHOLDER, (_, kind: string, name: string) =>
    formatRaw(kind === 'F' ? row[name] : params[name]),
  );
}

/** Legge l'IdArea da una riga; null se il campo manca o è vuoto. */
export function idOf(row: QueryRow, ref: string | undefined): string | null {
  // Stessa normalizzazione della memoria delle geometrie: " 1203" e "1203.0" diventano "1203",
  // così la riga si collega alla sua geometria.
  return areaKey(fieldValue(row, ref));
}

function formatRaw(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

// -----------------------------------------------------------------------------
// Testo e HTML
// -----------------------------------------------------------------------------

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const numberFormat = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });

/**
 * Testi che sono senza dubbio numeri scritti all'italiana, perché contengono già dei separatori:
 * - virgola decimale, con o senza punti delle migliaia in gruppi di tre ("45,4612", "12.345,5", "0,5");
 * - almeno due punti delle migliaia in gruppi di tre ("5.801.692").
 * Tutti gli altri testi si mostrano come sono: codici e identificativi ("20121", "015146", "3331234567"),
 * testi con un solo punto e senza virgola ("12.345" può voler dire dodicimila o dodici virgola tre)
 * e testi malformati ("1..2", "1.2.3,4").
 */
const DECIMAL_COMMA_TEXT = /^-?(?:0|[1-9]\d*|[1-9]\d{0,2}(?:\.\d{3})+),(\d+)$/;
const THOUSANDS_TEXT = /^-?[1-9]\d{0,2}(?:\.\d{3}){2,}$/;

/** Decimali mostrati al massimo per i numeri scritti come testo. */
const MAX_TEXT_DECIMALS = 20;

/** Formattatori per numero di decimali, creati una volta sola. */
const textNumberFormats = new Map<number, Intl.NumberFormat>();

function textNumberFormat(decimals: number): Intl.NumberFormat {
  let format = textNumberFormats.get(decimals);
  if (!format) {
    format = new Intl.NumberFormat('it-IT', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    textNumberFormats.set(decimals, format);
  }
  return format;
}

/**
 * Valore pronto da mostrare; valori assenti o non validi (NaN, Infinity) diventano testo vuoto.
 * - Numeri: all'italiana, con al massimo due decimali (5801692 → "5.801.692").
 * - Testi con separatori (vedi sopra): all'italiana, con tutti i decimali scritti nel testo,
 *   senza arrotondare (coordinate come "45,46123" restano precise).
 * - Tutti gli altri testi: come sono.
 */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? numberFormat.format(value) : '';
  if (typeof value === 'string') {
    const text = value.trim();
    const decimals = DECIMAL_COMMA_TEXT.exec(text)?.[1]?.length ?? (THOUSANDS_TEXT.test(text) ? 0 : undefined);
    if (decimals !== undefined) {
      const n = toNumber(text);
      // Intl.NumberFormat accetta al massimo 100 decimali; oltre 15-17 cifre un double non ha comunque precisione.
      if (Number.isFinite(n)) return textNumberFormat(Math.min(decimals, MAX_TEXT_DECIMALS)).format(n);
    }
  }
  return String(value);
}

/**
 * Popup Value: sostituisce `${F.CAMPO}` con i campi della riga e `${P.NOME}` con i parametri del Parent.
 * Il template viene dalla configurazione (fidato); i valori dai dati, quindi sono sempre escapati.
 *
 * - un campo o parametro che esiste ma è vuoto diventa testo vuoto;
 * - un campo o parametro che NON esiste (es. un errore di battitura) resta scritto com'è, così
 *   l'errore si vede nel popup invece di far sparire il valore in silenzio;
 * - gli altri segnaposto (es. `${V.X}`, non gestiti) restano come sono.
 */
export function renderTemplate(template: string, row: QueryRow, params: ParentParams = {}): string {
  return template.replace(PLACEHOLDER, (placeholder: string, kind: string, name: string) => {
    const source = kind === 'F' ? row : params;
    if (!Object.hasOwn(source, name)) return escapeHtml(placeholder);
    return escapeHtml(formatValue(source[name]));
  });
}

/**
 * Width/Height → valore CSS: un numero è in pixel, anche se scritto come testo ("400" → "400px",
 * come può arrivare da una configurazione XML); gli altri testi passano così come sono ("50%", "300px").
 */
export function toCssSize(value: number | string | undefined, fallback: string): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? `${value}px` : fallback;
  const text = value.trim();
  if (text === '') return fallback;
  return /^\d+(?:\.\d+)?$/.test(text) ? `${text}px` : text;
}
