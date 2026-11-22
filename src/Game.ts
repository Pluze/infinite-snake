import { ScoreHistory } from './ScoreHistory';
export const MAX_WORLD_SIDE = 4096;
export type Point = { x: number; y: number };
export type Direction = 0 | 1 | 2 | 3;
export const vectors: Point[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
export const key = (p: Point) => `${p.x},${p.y}`;
export const add = (p: Point, d: Direction): Point => ({ x: p.x + vectors[d].x, y: p.y + vectors[d].y });
const modulo = (n: number, size: number) => ((n % size) + size) % size;
const nextRandom = (state: number) => { state ^= state << 13; state ^= state >>> 17; return (state ^ (state << 5)) >>> 0; };
export type Snapshot = { version: 2; seed: number; rng: number; width: number; height: number; wraparound?: boolean; hitWall?: boolean; food: Point[]; autoCycle?: Point[]; body: Point[]; travel: Point; direction: Direction; steps: number; turns: number; elapsed: number; dead: boolean; won: boolean; score: number; historyEvents?: number };
export class Game {
  seed: number;
  rng: number;
  readonly width: number;
  readonly height: number;
  autoCycle?: Point[];
  food = new Map<string, Point>();
  segments = new Map<number, Point>();
  occupied = new Map<string, number>();
  scores = new ScoreHistory();
  private planningOccupancy?: Uint8Array;
  private planningBody?: Point[];
  private planningOrigin = 0;
  first = 0;
  last = 0;
  direction: Direction = 0;
  steps = 0;
  turns = 0;
  elapsed = 0;
  score = 0;
  dead = false;
  hitWall = false;
  won = false;
  travel: Point;
  constructor(seed = Math.floor(Math.random() * 2147483647), width = 64, height = 48, readonly wraparound = true) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_WORLD_SIDE || height > MAX_WORLD_SIDE) throw Error('Invalid world size');
    this.seed = seed; this.rng = seed || 1; this.width = width; this.height = height;
    const vertical = width === 1 && height > 1;
    this.direction = vertical ? 1 : 0;
    const length = Math.max(1, Math.min(6, vertical ? height : width, this.capacity - 1));
    for (let i = 0; i < length; i++) this.push(vertical ? { x: 0, y: i } : { x: i, y: 0 });
    this.travel = this.head;
    this.won = this.length === this.capacity;
    this.refillFood();
  }
  wrap(p: Point): Point { return { x: modulo(p.x, this.width), y: modulo(p.y, this.height) }; }
  contains(p: Point) { return p.x >= 0 && p.y >= 0 && p.x < this.width && p.y < this.height; }
  next(p: Point, d: Direction) {
    const point = add(p, d);
    return this.wraparound ? this.wrap(point) : point;
  }
  private push(p: Point) {
    if (this.planningOccupancy) this.planningOccupancy[p.y * this.width + p.x] = 1;
    else this.occupied.set(key(p), this.last);
    if (this.planningBody) this.planningBody.push(p);
    else this.segments.set(this.last, p);
    this.last++;
  }
  isOccupied(p: Point) {
    return this.planningOccupancy ? this.planningOccupancy[p.y * this.width + p.x] === 1 : this.occupied.has(key(p));
  }
  segment(index: number) {
    return this.planningBody ? this.planningBody[index - this.planningOrigin] : this.segments.get(index);
  }
  get head() { return this.segment(this.last - 1)!; }
  get tail() { return this.segment(this.first)!; }
  get length() { return this.last - this.first; }
  get capacity() { return this.width * this.height; }
  body() {
    return this.planningBody ? this.planningBody.slice(this.first - this.planningOrigin) : Array.from(this.segments.values());
  }
  hasFood(p: Point) { return this.food.has(key(this.wraparound ? this.wrap(p) : p)); }
  private random() { this.rng = nextRandom(this.rng); return this.rng / 4294967296; }
  forecastFood(isOccupied: (point: Point) => boolean) {
    let rng = this.rng;
    for (let attempt = 0; attempt < 24; attempt++) {
      rng = nextRandom(rng);
      const cell = Math.floor(rng / 4294967296 * this.capacity);
      const point = { x: cell % this.width, y: Math.floor(cell / this.width) };
      if (!isOccupied(point)) return point;
    }
  }
  private refillFood() {
    if (this.food.size || this.length === this.capacity) return;
    // Rejection sampling is fast on open boards. Near full occupancy, pick
    // one of the remaining free cells by rank so every cell stays equally likely.
    for (let attempt = 0; attempt < 24; attempt++) {
      const cell = Math.floor(this.random() * this.capacity);
      const point = { x: cell % this.width, y: Math.floor(cell / this.width) };
      if (!this.isOccupied(point)) {
        this.food.set(key(point), point);
        return;
      }
    }
    let rank = Math.floor(this.random() * (this.capacity - this.length));
    for (let cell = 0; cell < this.capacity; cell++) {
      const point = { x: cell % this.width, y: Math.floor(cell / this.width) };
      if (this.isOccupied(point)) continue;
      if (rank-- === 0) {
        this.food.set(key(point), point);
        return;
      }
    }
  }
  canMove(d: Direction) {
    const p = this.next(this.head, d);
    if (this.length > 1 && d === (this.direction + 2) % 4
      && !samePoint(p, this.next(this.head, this.direction))) return false;
    return this.canEnter(p);
  }
  private canEnter(p: Point) {
    return this.contains(p) && !samePoint(p, this.head) && (samePoint(p, this.tail) || !this.isOccupied(p));
  }
  step(d: Direction = this.direction) {
    if (this.dead || this.won) return false;
    if (this.length > 1 && d === (this.direction + 2) % 4) d = this.direction;
    const next = this.next(this.head, d);
    if (!this.canEnter(next)) {
      this.dead = true;
      this.hitWall = !this.contains(next);
      return false;
    }
    const foodKey = key(next);
    const eats = this.food.has(foodKey);
    if (d !== this.direction) this.turns++;
    this.direction = d;
    if (!eats) {
      const tail = this.tail;
      if (this.planningOccupancy) this.planningOccupancy[tail.y * this.width + tail.x] = 0;
      else this.occupied.delete(key(tail));
      if (!this.planningBody) this.segments.delete(this.first);
      this.first++;
    } else { this.food.delete(foodKey); this.score += 10; }
    this.push(next);
    this.steps++;
    if (!this.planningBody) {
      this.travel = add(this.travel, d);
      this.scores.record(this.score);
    }
    this.won = this.length === this.capacity;
    this.refillFood();
    return true;
  }
  forkForPlanning() {
    const copy = new Game(this.seed, this.width, this.height, this.wraparound);
    copy.rng = this.rng;
    copy.direction = this.direction;
    copy.travel = this.travel;
    copy.food = new Map(this.food);
    copy.planningBody = this.body();
    copy.planningOrigin = this.first;
    copy.segments.clear();
    if (this.capacity <= 65_536) {
      copy.planningOccupancy = this.planningOccupancy?.slice() ?? new Uint8Array(this.capacity);
      if (!this.planningOccupancy)
        for (const point of copy.planningBody) copy.planningOccupancy[point.y * this.width + point.x] = 1;
      copy.occupied.clear();
    } else {
      copy.occupied = new Map(this.occupied);
    }
    copy.first = this.first;
    copy.last = this.last;
    copy.score = this.score;
    copy.dead = this.dead;
    copy.won = this.won;
    copy.scores = new ScoreHistory(this.score);
    return copy;
  }
  snapshot(): Snapshot {
    return { version: 2, seed: this.seed, rng: this.rng, width: this.width, height: this.height, wraparound: this.wraparound, hitWall: this.hitWall, food: [...this.food.values()], autoCycle: this.autoCycle, body: this.body(), travel: this.travel, direction: this.direction, steps: this.steps, turns: this.turns, elapsed: this.elapsed, dead: this.dead, won: this.won, score: this.score };
  }
  static restore(s: Snapshot, scores: number[] | ScoreHistory) {
    if (s.version !== 2 || !Array.isArray(s.body) || s.body.length < 1 || !s.body.every(p => Number.isSafeInteger(p.x) && Number.isSafeInteger(p.y) && p.x >= 0 && p.x < s.width && p.y >= 0 && p.y < s.height) || ![0,1,2,3].includes(s.direction) || scores.length !== s.steps + 1 || new Set(s.body.map(key)).size !== s.body.length) throw Error('Incomplete save format');
    const game = new Game(s.seed, s.width, s.height, s.wraparound !== false);
    game.segments.clear(); game.occupied.clear(); game.first = game.last = 0;
    for (const p of s.body) game.push(p);
    Object.assign(game, { rng: s.rng, direction: s.direction, steps: s.steps, turns: s.turns, elapsed: s.elapsed, dead: s.dead, hitWall: s.hitWall === true, won: s.won, score: s.score, travel: s.travel });
    if (s.food.some(p => !game.contains(p) || !Number.isInteger(p.x) || !Number.isInteger(p.y) || game.occupied.has(key(p))) || !s.travel || key(game.wraparound ? game.wrap(s.travel) : s.travel) !== key(game.head)) throw Error('Invalid board save');
    // Older saves can contain several foods. Keep the first and preserve RNG and history.
    game.autoCycle = Array.isArray(s.autoCycle) ? s.autoCycle : undefined;
    game.food = new Map(s.food.slice(0, 1).map(p => [key(p), p]));
    game.refillFood();
    game.scores = Array.isArray(scores) ? ScoreHistory.fromScores(scores) : scores;
    return game;
  }
}
