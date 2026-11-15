/**
 * Avvolge un caricamento asincrono (es. un import dinamico) in modo che:
 * - chiamate ripetute o contemporanee condividano lo stesso caricamento: si scarica una volta sola;
 * - se il caricamento fallisce, l'errore arrivi a tutti quelli che lo stavano aspettando,
 *   ma la chiamata successiva riparta da capo invece di ricevere per sempre lo stesso errore.
 *
 * Senza dipendenze da Angular o Leaflet, per poterla provare da sola (load-once.spec.ts).
 */
export function loadOnceWithRetry<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;

  return () => {
    if (!pending) {
      // Promise.resolve().then(load): anche un errore lanciato subito da `load` diventa una promessa fallita.
      const attempt: Promise<T> = Promise.resolve()
        .then(load)
        .catch((err: unknown) => {
          // Dimentica solo questo tentativo, se nel frattempo non ne è partito un altro.
          if (pending === attempt) pending = null;
          throw err;
        });
      pending = attempt;
    }
    return pending;
  };
}
