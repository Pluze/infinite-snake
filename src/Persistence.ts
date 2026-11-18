import { Game, Snapshot } from './Game';
const request = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error); });
/** Atomic metadata + bounded world state and append-only history journal. No full history serialization on save. */
export class Persistence {
  private db!: IDBDatabase;
  private savedScores = 0;
  private chain: Promise<void> = Promise.resolve();
  async open() {
    const req = indexedDB.open('infinite-snake-torus-v2', 1);
    req.onupgradeneeded = () => { for (const name of ['state', 'history']) req.result.createObjectStore(name); };
    this.db = await request(req);
  }
  async load(progress: (text: string) => void): Promise<Game | undefined> {
    progress('Reading saved progress…');
    const tx = this.db.transaction(['state', 'history']);
    const stateReq = request(tx.objectStore('state').get('game')) as Promise<Snapshot | undefined>;
    const scores: number[] = [];
    const read = (store: string, receive: (value: unknown) => void) => new Promise<void>((resolve, reject) => {
      const cursor = tx.objectStore(store).openCursor();
      cursor.onerror = () => reject(cursor.error);
      cursor.onsuccess = () => { const c = cursor.result; if (!c) return resolve(); receive(c.value); c.continue(); };
    });
    await read('history', v => { for (const n of v as number[]) scores.push(n); });
    const state = await stateReq;
    if (!state) return undefined;
    progress(`Restoring ${state.steps.toLocaleString('en-US')} steps of history…`);
    await new Promise(resolve => setTimeout(resolve, 0));
    this.savedScores = scores.length;
    return Game.restore(state, scores);
  }
  save(game: Game) {
    this.chain = this.chain.catch(() => {}).then(async () => {
      const tx = this.db.transaction(['state', 'history'], 'readwrite');
      const completion = done(tx);
      tx.objectStore('state').put(game.snapshot(), 'game');
      const count = game.scores.length;
      const history = tx.objectStore('history');
      for (let i = Math.floor(this.savedScores / 1024) * 1024; i < count; i += 1024) history.put(game.scores.slice(i, i + 1024), i);
      await completion;
      this.savedScores = count;
    });
    return this.chain;
  }
  async clear() {
    await this.chain.catch(() => {});
    const tx = this.db.transaction(['state', 'history'], 'readwrite'), completion = done(tx);
    for (const name of ['state', 'history']) tx.objectStore(name).clear();
    await completion;
    this.savedScores = 0;
  }
}
