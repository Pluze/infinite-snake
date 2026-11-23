import { Game, Snapshot } from './Game';
import { ScoreHistory } from './ScoreHistory';
function read<T>(req: IDBRequest<T>, tx: IDBTransaction, signal?: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    const finish = () => { clearTimeout(timeout); signal?.removeEventListener('abort', abort); };
    const fail = (error: unknown) => { finish(); reject(error); };
    const abort = () => fail(signal?.reason);
    const timeout = setTimeout(() => {
      fail(Error('Reading local storage timed out'));
      try { tx.abort(); } catch { /* The read already finished. */ }
    }, 8000);
    signal?.addEventListener('abort', abort, { once: true });
    req.onsuccess = () => { finish(); resolve(req.result); };
    req.onerror = () => fail(req.error);
  });
}
const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error); });
/** Atomic metadata + bounded world state and append-only history journal. No full history serialization on save. */
export class Persistence {
  private db!: IDBDatabase;
  private savedEvents = 0;
  private rewriteHistory = false;
  private savedGame?: Game;
  private revision?: string;
  private chain: Promise<void> = Promise.resolve();
  async open(signal?: AbortSignal) {
    signal?.throwIfAborted();
    const req = indexedDB.open('infinite-snake-torus-v2', 1);
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const fail = (error: unknown) => { cleanup(); reject(error); };
      const abort = () => fail(signal?.reason);
      const timeout = setTimeout(() => fail(Error('Opening local storage timed out')), 8000);
      let active = true;
      const cleanup = () => {
        active = false;
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
      };
      signal?.addEventListener('abort', abort, { once: true });
      req.onupgradeneeded = () => {
        if (!active) { req.transaction?.abort(); return; }
        for (const name of ['state', 'history']) req.result.createObjectStore(name);
      };
      req.onblocked = () => fail(Error('Local storage is blocked by another tab'));
      req.onerror = () => fail(req.error);
      req.onsuccess = () => {
        if (!active) { req.result.close(); return; }
        cleanup();
        resolve(req.result);
      };
    });
    this.db.onversionchange = () => this.db.close();
  }
  close() { this.db?.close(); }
  async load(progress: (text: string, fraction?: number) => void, signal?: AbortSignal): Promise<Game | undefined> {
    signal?.throwIfAborted();
    const tx = this.db.transaction(['state', 'history']);
    const abort = () => { try { tx.abort(); } catch { /* The read already finished. */ } };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const metadata = tx.objectStore('state');
      const [state, revision] = await Promise.all([
        read(metadata.get('game'), tx, signal) as Promise<Snapshot | undefined>,
        read(metadata.get('historyRevision'), tx, signal) as Promise<string | undefined>,
      ]);
      if (!state) return undefined;
      if (!Number.isSafeInteger(state.steps) || state.steps < 0) throw Error('Invalid saved step count');
      const scores = new ScoreHistory();
      const chunkSize = 128 * 1024;
      const total = state.historyEvents ?? state.steps + 1;
      let incomplete = !Number.isSafeInteger(total) || total < 1 || total > state.steps + 1;
      let readCount = 0;
      history: for (let offset = 0; !incomplete && offset < total; offset += chunkSize) {
        signal?.throwIfAborted();
        progress(`Reading history… ${Math.floor(offset / total * 100)}%`, offset / total);
        const range = IDBKeyRange.bound(offset, Math.min(total, offset + chunkSize), false, true);
        const store = tx.objectStore('history');
        const [keys, blocks] = await Promise.all([
          read(store.getAllKeys(range, 128), tx, signal),
          read(store.getAll(range, 128), tx, signal),
        ]);
        for (const [index, block] of blocks.entries()) {
          if (keys[index] !== readCount || !Array.isArray(block)) { incomplete = true; break history; }
          const expected = Math.min(1024, total - readCount);
          for (const entry of block.slice(0, expected)) {
            const [step, score] = state.historyEvents === undefined
              ? [readCount, entry] : Array.isArray(entry) ? entry : [];
            const previous = readCount ? scores.changes[scores.changes.length - 1] : undefined;
            if (!Number.isSafeInteger(step) || !Number.isFinite(score) || score < 0 || score > state.score
              || step > state.steps || (step === state.steps && score !== state.score)
              || (previous ? step <= previous[0] || score < previous[1] || (state.historyEvents !== undefined && score === previous[1]) : step !== 0)) {
              incomplete = true;
              break history;
            }
            if (!previous) scores.changes[0] = [0, score];
            else if (score !== previous[1]) scores.changes.push([step, score]);
            readCount++;
          }
          if (block.length !== expected) { incomplete = true; break history; }
        }
        if (readCount !== Math.min(total, offset + chunkSize)) incomplete = true;
      }
      // The board checkpoint is independent of the chart. Preserve the
      // verified history prefix and anchor any missing suffix at the saved score.
      if (scores.at(state.steps) !== state.score) {
        incomplete = true;
        if (state.steps === 0) scores.changes[0] = [0, state.score];
        else scores.changes.push([state.steps, state.score]);
      }
      scores.length = state.steps + 1;
      progress(`Restoring ${state.steps.toLocaleString('en-US')} steps…`, 1);
      await new Promise(resolve => setTimeout(resolve, 0));
      signal?.throwIfAborted();
      const game = Game.restore(state, scores);
      this.rewriteHistory = incomplete || state.historyEvents === undefined;
      this.savedGame = game;
      this.revision = revision;
      this.savedEvents = scores.changes.length;
      return game;
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }
  save(game: Game, replace = false) {
    this.chain = this.chain.catch(() => {}).then(async () => {
      const tx = this.db.transaction(['state', 'history'], 'readwrite');
      const completion = done(tx);
      const metadata = tx.objectStore('state');
      const currentRevision = await read(metadata.get('historyRevision'), tx);
      const events = game.scores.changes;
      const count = events.length;
      const revision = crypto.randomUUID();
      metadata.put({ ...game.snapshot(), historyEvents: count }, 'game');
      metadata.put(revision, 'historyRevision');
      const history = tx.objectStore('history');
      const rewrite = replace || this.rewriteHistory || this.savedGame !== game || currentRevision !== this.revision;
      if (rewrite) history.clear();
      for (let i = Math.floor((rewrite ? 0 : this.savedEvents) / 1024) * 1024; i < count; i += 1024) {
        history.put(events.slice(i, i + 1024), i);
      }
      await completion;
      this.savedEvents = count;
      this.rewriteHistory = false;
      this.savedGame = game;
      this.revision = revision;
    });
    return this.chain;
  }
  async clear() {
    await this.chain.catch(() => {});
    const tx = this.db.transaction(['state', 'history'], 'readwrite'), completion = done(tx);
    for (const name of ['state', 'history']) tx.objectStore(name).clear();
    await completion;
    this.savedEvents = 0;
    this.rewriteHistory = false;
    this.savedGame = undefined;
    this.revision = undefined;
  }
}
