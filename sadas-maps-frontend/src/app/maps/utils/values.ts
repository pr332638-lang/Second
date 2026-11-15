import type { QueryRow } from '../maps.models';

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

/** Nome del campo indicato da una proprietà, se è un singolo riferimento (utile per log e messaggi). */
export function fieldName(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  const single = SINGLE_FIELD.exec(ref);
  if (single) return single[1];
  return ref.includes('${') ? undefined : ref.trim();
}

/** Legge l'IdArea da una riga; null se il campo manca o è vuoto. */
export function idOf(row: QueryRow, ref: string | undefined): string | null {
  const v = fieldValue(row, ref);
  if (v === null || v === undefined || v === '') return null;
  return String(v);
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

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return numberFormat.format(value);
  return String(value);
}

/**
 * Popup Value: sostituisce `${F.CAMPO}` con i campi della riga e `${P.NOME}` con i parametri del Parent.
 * Il template viene dalla configurazione (fidato); i valori dai dati, quindi sono sempre escapati.
 * I segnaposto non riconosciuti restano come sono.
 */
export function renderTemplate(template: string, row: QueryRow, params: ParentParams = {}): string {
  return template.replace(PLACEHOLDER, (_, kind: string, name: string) =>
    escapeHtml(formatValue(kind === 'F' ? row[name] : params[name])),
  );
}

/** Numero → pixel, stringa → valore CSS così com'è. */
export function toCssSize(value: number | string | undefined, fallback: string): string {
  if (value === undefined || value === null || value === '') return fallback;
  return typeof value === 'number' ? `${value}px` : value;
}
