import { Game, Snapshot } from './Game';
import { ScoreChange, ScoreHistory } from './ScoreHistory';
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
  private legacy = false;
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
      const state = await read(tx.objectStore('state').get('game'), tx, signal) as Snapshot | undefined;
      if (!state) return undefined;
      if (!Number.isSafeInteger(state.steps) || state.steps < 0) throw Error('Invalid saved step count');
      const scores = new ScoreHistory();
      const chunkSize = 128 * 1024;
      const total = state.historyEvents ?? state.steps + 1;
      if (!Number.isSafeInteger(total) || total < 1 || total > state.steps + 1) throw Error('Invalid history size');
      let readCount = 0;
      for (let offset = 0; offset < total; offset += chunkSize) {
        signal?.throwIfAborted();
        progress(`Reading history… ${Math.floor(offset / total * 100)}%`, offset / total);
        const range = IDBKeyRange.bound(offset, offset + chunkSize, false, true);
        const blocks = await read(tx.objectStore('history').getAll(range, 128), tx, signal);
        if (state.historyEvents !== undefined) {
          if (!offset) scores.changes.length = 0;
          for (const block of blocks as ScoreChange[][]) for (const change of block) {
            const [step, score] = change;
            const previous = scores.changes[scores.changes.length - 1];
            if (!Number.isSafeInteger(step) || !Number.isFinite(score) || step > state.steps
              || (previous ? step <= previous[0] || score <= previous[1] : step !== 0)) throw Error('Invalid score event');
            scores.changes.push(change);
            readCount++;
          }
        } else {
          for (const block of blocks as number[][]) for (const score of block) {
            if (!Number.isFinite(score) || (readCount && score < scores.changes[scores.changes.length - 1][1]))
              throw Error('Invalid score history');
            if (!readCount) scores.changes[0] = [0, score];
            else scores.record(score);
            readCount++;
          }
        }
        if (readCount !== Math.min(total, offset + chunkSize)) throw Error('Incomplete score history');
      }
      scores.length = state.steps + 1;
      progress(`Restoring ${state.steps.toLocaleString('en-US')} steps…`, 1);
      await new Promise(resolve => setTimeout(resolve, 0));
      signal?.throwIfAborted();
      const game = Game.restore(state, scores);
      this.legacy = state.historyEvents === undefined;
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
      const events = game.scores.changes;
      const count = events.length;
      tx.objectStore('state').put({ ...game.snapshot(), historyEvents: count }, 'game');
      const history = tx.objectStore('history');
      const rewrite = replace || this.legacy;
      if (rewrite) history.clear();
      for (let i = Math.floor((rewrite ? 0 : this.savedEvents) / 1024) * 1024; i < count; i += 1024) {
        history.put(events.slice(i, i + 1024), i);
      }
      await completion;
      this.savedEvents = count;
      this.legacy = false;
    });
    return this.chain;
  }
  async clear() {
    await this.chain.catch(() => {});
    const tx = this.db.transaction(['state', 'history'], 'readwrite'), completion = done(tx);
    for (const name of ['state', 'history']) tx.objectStore(name).clear();
    await completion;
    this.savedEvents = 0;
    this.legacy = false;
  }
}
