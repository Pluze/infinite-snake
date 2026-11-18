export type Point = { x: number; y: number };
export type Direction = 0 | 1 | 2 | 3;
export const vectors: Point[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
export const key = (p: Point) => `${p.x},${p.y}`;
export const add = (p: Point, d: Direction): Point => ({ x: p.x + vectors[d].x, y: p.y + vectors[d].y });
const modulo = (n: number, size: number) => ((n % size) + size) % size;
export type Snapshot = { version: 2; seed: number; rng: number; width: number; height: number; wraparound?: boolean; hitWall?: boolean; food: Point[]; autoCycle?: Point[]; body: Point[]; travel: Point; direction: Direction; steps: number; turns: number; elapsed: number; dead: boolean; won: boolean; score: number };
export class Game {
  seed: number;
  rng: number;
  readonly width: number;
  readonly height: number;
  autoCycle?: Point[];
  food = new Map<string, Point>();
  segments = new Map<number, Point>();
  occupied = new Set<string>();
  scores: number[] = [0];
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
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 256 || height > 256) throw Error('Invalid world size');
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
  private push(p: Point) { this.segments.set(this.last++, p); this.occupied.add(key(p)); }
  get head() { return this.segments.get(this.last - 1)!; }
  get tail() { return this.segments.get(this.first)!; }
  get length() { return this.last - this.first; }
  get capacity() { return this.width * this.height; }
  body() { return Array.from(this.segments.values()); }
  hasFood(p: Point) { return this.food.has(key(this.wraparound ? this.wrap(p) : p)); }
  private random() { let x = this.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.rng = x >>> 0; return this.rng / 4294967296; }
  private refillFood() {
    if (this.food.size || this.length === this.capacity) return;
    // Rejection sampling is fast on open boards. Near full occupancy, pick
    // one of the remaining free cells by rank so every cell stays equally likely.
    for (let attempt = 0; attempt < 24; attempt++) {
      const cell = Math.floor(this.random() * this.capacity);
      const point = { x: cell % this.width, y: Math.floor(cell / this.width) };
      if (!this.occupied.has(key(point))) {
        this.food.set(key(point), point);
        return;
      }
    }
    let rank = Math.floor(this.random() * (this.capacity - this.length));
    for (let cell = 0; cell < this.capacity; cell++) {
      const point = { x: cell % this.width, y: Math.floor(cell / this.width) };
      if (this.occupied.has(key(point))) continue;
      if (rank-- === 0) {
        this.food.set(key(point), point);
        return;
      }
    }
  }
  canMove(d: Direction) {
    const p = this.next(this.head, d);
    if (this.length > 1 && d === (this.direction + 2) % 4
      && key(p) !== key(this.next(this.head, this.direction))) return false;
    return key(p) !== key(this.head) && this.contains(p) && (!this.occupied.has(key(p)) || key(p) === key(this.tail));
  }
  step(d: Direction = this.direction) {
    if (this.dead || this.won) return false;
    if (this.length > 1 && d === (this.direction + 2) % 4) d = this.direction;
    const next = this.next(this.head, d);
    if (!this.canMove(d)) {
      this.dead = true;
      this.hitWall = !this.contains(next);
      return false;
    }
    const eats = this.hasFood(next);
    if (d !== this.direction) this.turns++;
    this.direction = d;
    if (!eats) { this.occupied.delete(key(this.tail)); this.segments.delete(this.first++); }
    else { this.food.delete(key(next)); this.score += 10; }
    this.push(next); this.travel = add(this.travel, d);
    this.steps++; this.scores.push(this.score);
    this.won = this.length === this.capacity;
    this.refillFood();
    return true;
  }
  snapshot(): Snapshot {
    return { version: 2, seed: this.seed, rng: this.rng, width: this.width, height: this.height, wraparound: this.wraparound, hitWall: this.hitWall, food: [...this.food.values()], autoCycle: this.autoCycle, body: this.body(), travel: this.travel, direction: this.direction, steps: this.steps, turns: this.turns, elapsed: this.elapsed, dead: this.dead, won: this.won, score: this.score };
  }
  static restore(s: Snapshot, scores: number[]) {
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
    game.scores = scores;
    return game;
  }
}
