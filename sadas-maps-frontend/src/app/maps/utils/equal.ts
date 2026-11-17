/**
 * Uguaglianza per contenuto di dati semplici (come configurazioni e parametri arrivati da JSON):
 * numeri, testi, booleani, null, array e oggetti semplici, annidati.
 *
 * Serve ai `computed` con `equal`: un oggetto nuovo con lo stesso contenuto non deve far ripartire
 * query e disegni. Regole:
 * - NaN è uguale a NaN (Object.is);
 * - una proprietà con valore undefined vale come assente: { a: 1, b: undefined } = { a: 1 };
 * - l'ordine delle proprietà non conta, quello degli elementi di un array sì.
 * Funzioni, date e altre classi si confrontano per riferimento.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => sameValue(item, b[i]));
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false;

  const keysA = definedKeys(a);
  const keysB = definedKeys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function definedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) => value[key] !== undefined);
}
