import { describe, expect, it } from 'vitest';
import { loadOnceWithRetry } from './load-once';

/** Caricamento finto: conta le chiamate e fallisce le prime `failures` volte. */
function fakeLoader(failures: number) {
  let calls = 0;
  const load = async () => {
    calls++;
    if (calls <= failures) throw new Error(`errore ${calls}`);
    return `plugin (tentativo ${calls})`;
  };
  return { load, calls: () => calls };
}

async function errorOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

describe('loadOnceWithRetry', () => {
  it('scarica una volta sola anche con più chiamate', async () => {
    const fake = fakeLoader(0);
    const get = loadOnceWithRetry(fake.load);
    expect(await get()).toBe('plugin (tentativo 1)');
    expect(await get()).toBe('plugin (tentativo 1)');
    expect(fake.calls()).toBe(1);
  });

  it('chiamate contemporanee condividono lo stesso caricamento', async () => {
    const fake = fakeLoader(0);
    const get = loadOnceWithRetry(fake.load);
    const [a, b, c] = await Promise.all([get(), get(), get()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(fake.calls()).toBe(1);
  });

  it('dopo un errore la chiamata successiva riprova', async () => {
    const fake = fakeLoader(1);
    const get = loadOnceWithRetry(fake.load);
    expect(await errorOf(get())).toBe('errore 1');
    expect(await get()).toBe('plugin (tentativo 2)');
    expect(fake.calls()).toBe(2);
  });

  it("l'errore arriva a tutte le chiamate che stavano aspettando, poi si riprova una volta", async () => {
    const fake = fakeLoader(1);
    const get = loadOnceWithRetry(fake.load);
    const errors = await Promise.all([errorOf(get()), errorOf(get())]);
    expect(errors[0]).toBe('errore 1');
    expect(errors[1]).toBe('errore 1');
    expect(fake.calls()).toBe(1);
    expect(await get()).toBe('plugin (tentativo 2)');
    expect(fake.calls()).toBe(2);
  });

  it('dopo il successo non riscarica più', async () => {
    const fake = fakeLoader(2);
    const get = loadOnceWithRetry(fake.load);
    await errorOf(get());
    await errorOf(get());
    expect(await get()).toBe('plugin (tentativo 3)');
    expect(await get()).toBe('plugin (tentativo 3)');
    expect(fake.calls()).toBe(3);
  });

  it('gestisce anche un errore lanciato subito, non dentro una promessa', async () => {
    let calls = 0;
    const get = loadOnceWithRetry<string>(() => {
      calls++;
      if (calls === 1) throw new Error('errore immediato');
      return Promise.resolve('ok');
    });
    expect(await errorOf(get())).toBe('errore immediato');
    expect(await get()).toBe('ok');
  });
});
