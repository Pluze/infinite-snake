import { ScoreHistory } from './ScoreHistory';
// A single 32-bit RNG draw selects a cell. Keep each possible cell in range.
export const MAX_WORLD_CELLS = 2 ** 32 - 1;
export function validWorldSize(width: number, height: number) {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height)
    && width > 0 && height > 0 && width * height <= MAX_WORLD_CELLS;
}
export type Point = { x: number; y: number };
export type Direction = 0 | 1 | 2 | 3;
export const vectors: Point[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
export const key = (p: Point) => `${p.x},${p.y}`;
export const add = (p: Point, d: Direction): Point => ({ x: p.x + vectors[d].x, y: p.y + vectors[d].y });
const modulo = (n: number, size: number) => ((n % size) + size) % size;
export const nextRandom = (state: number) => { state ^= state << 13; state ^= state >>> 17; return (state ^ (state << 5)) >>> 0; };
// All full simulations consume the same rejection draws and free-cell rank.
export function drawFoodCell(rng: number, capacity: number, isFree: (cell: number) => boolean,
  byRank?: { count: number; at: (rank: number) => number }) {
  for (let attempt = 0; attempt < 24; attempt++) {
    rng = nextRandom(rng);
    const cell = Math.floor(rng / 4294967296 * capacity);
    if (isFree(cell)) return { cell, rng };
  }
  if (byRank) {
    rng = nextRandom(rng);
    return { cell: byRank.at(Math.floor(rng / 4294967296 * byRank.count)), rng };
  }
  return { cell: -1, rng };
}
export type BridgeSave = { until: number; reverse: boolean; swapAxes: boolean; row: number; column: number };
export type Snapshot = { version: 2; seed: number; rng: number; width: number; height: number; wraparound?: boolean; hitWall?: boolean; food: Point[]; autoBridge?: BridgeSave; autoCycle?: Point[]; body: Point[]; travel: Point; direction: Direction; steps: number; turns: number; elapsed: number; dead: boolean; won: boolean; score: number; historyEvents?: number };
export class Game {
  seed: number;
  rng: number;
  readonly width: number;
  readonly height: number;
  autoCycle?: Point[];
  autoBridge?: BridgeSave;
  food = new Map<string, Point>();
  segments = new Map<number, Point>();
  occupied = new Map<number, number>();
  scores = new ScoreHistory();
  private planningOccupancy?: Uint32Array;
  private occupancyOrigin = 0;
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
    if (!validWorldSize(width, height)) throw Error('Invalid world size');
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
    const cell = p.y * this.width + p.x;
    if (this.planningOccupancy) this.planningOccupancy[cell] = this.last - this.occupancyOrigin + 1;
    else this.occupied.set(cell, this.last);
    if (this.planningBody) this.planningBody.push(p);
    else this.segments.set(this.last, p);
    this.last++;
  }
  segmentAt(p: Point) {
    if (!this.contains(p)) return undefined;
    const cell = p.y * this.width + p.x;
    if (!this.planningOccupancy) return this.occupied.get(cell);
    const offset = this.planningOccupancy[cell];
    return offset ? this.occupancyOrigin + offset - 1 : undefined;
  }
  isOccupied(p: Point) { return this.segmentAt(p) !== undefined; }
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
  pointAt(cell: number): Point { return { x: cell % this.width, y: Math.floor(cell / this.width) }; }
  forecastFood(isOccupied: (point: Point) => boolean) {
    const { cell } = drawFoodCell(this.rng, this.capacity, cell => !isOccupied(this.pointAt(cell)));
    return cell < 0 ? undefined : this.pointAt(cell);
  }
  private refillFood() {
    if (this.food.size || this.length === this.capacity) return;
    const free = (cell: number) => this.planningOccupancy ? !this.planningOccupancy[cell] : !this.occupied.has(cell);
    const result = drawFoodCell(this.rng, this.capacity, free, {
      count: this.capacity - this.length,
      at: rank => {
        for (let i = 0; i < this.capacity; i++) if (free(i) && rank-- === 0) return i;
        throw Error('Missing free cell');
      },
    });
    this.rng = result.rng;
    const point = this.pointAt(result.cell);
    this.food.set(key(point), point);
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
      else this.occupied.delete(tail.y * this.width + tail.x);
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
      copy.planningOccupancy = this.planningOccupancy?.slice() ?? new Uint32Array(this.capacity);
      copy.occupancyOrigin = this.planningOccupancy ? this.occupancyOrigin : this.first;
      if (!this.planningOccupancy)
        for (const [cell, index] of this.occupied) copy.planningOccupancy[cell] = index - this.first + 1;
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
    return { version: 2, seed: this.seed, rng: this.rng, width: this.width, height: this.height, wraparound: this.wraparound, hitWall: this.hitWall, food: [...this.food.values()], autoCycle: this.autoCycle, autoBridge: this.autoBridge, body: this.body(), travel: this.travel, direction: this.direction, steps: this.steps, turns: this.turns, elapsed: this.elapsed, dead: this.dead, won: this.won, score: this.score };
  }
  static restore(s: Snapshot, scores: number[] | ScoreHistory) {
    if (s.version !== 2 || !Array.isArray(s.body) || s.body.length < 1 || !s.body.every(p => Number.isSafeInteger(p.x) && Number.isSafeInteger(p.y) && p.x >= 0 && p.x < s.width && p.y >= 0 && p.y < s.height) || ![0,1,2,3].includes(s.direction) || scores.length !== s.steps + 1) throw Error('Incomplete save format');
    const game = new Game(s.seed, s.width, s.height, s.wraparound !== false);
    game.segments.clear(); game.occupied.clear(); game.first = game.last = 0;
    for (const p of s.body) {
      if (game.isOccupied(p)) throw Error('Repeated cell in saved body');
      if (game.length) {
        const dx = Math.abs(game.head.x - p.x), dy = Math.abs(game.head.y - p.y);
        const distance = game.wraparound ? Math.min(dx, game.width - dx) + Math.min(dy, game.height - dy) : dx + dy;
        if (distance !== 1) throw Error('Disconnected saved body');
      }
      game.push(p);
    }
    Object.assign(game, { rng: s.rng, direction: s.direction, steps: s.steps, turns: s.turns, elapsed: s.elapsed, dead: s.dead, hitWall: s.hitWall === true, won: s.won, score: s.score, travel: s.travel });
    if (s.food.some(p => !game.contains(p) || !Number.isInteger(p.x) || !Number.isInteger(p.y) || game.isOccupied(p)) || !s.travel || key(game.wraparound ? game.wrap(s.travel) : s.travel) !== key(game.head)) throw Error('Invalid board save');
    // Older saves can contain several foods. Keep the first and preserve RNG and history.
    const bridge = s.autoBridge;
    if (bridge && game.wraparound && game.width % 2 === 0 && game.height % 2 === 0
      && game.capacity <= 65_536 && Math.min(game.width, game.height) >= 4
      && Number.isSafeInteger(bridge.until) && bridge.until > s.steps && bridge.until - s.steps <= game.capacity
      && typeof bridge.reverse === 'boolean' && typeof bridge.swapAxes === 'boolean'
      && Number.isInteger(bridge.row) && bridge.row >= 0 && bridge.row < game.height && bridge.row % 2 === 0
      && Number.isInteger(bridge.column) && bridge.column >= 0 && bridge.column < game.width && bridge.column % 2 === 0) {
      game.autoBridge = { ...bridge };
    }
    game.autoCycle = Array.isArray(s.autoCycle) ? s.autoCycle : undefined;
    game.food = new Map(s.food.slice(0, 1).map(p => [key(p), p]));
    game.refillFood();
    game.scores = Array.isArray(scores) ? ScoreHistory.fromScores(scores) : new ScoreHistory(scores);
    if (game.scores.at(s.steps) !== s.score || game.won !== (game.length === game.capacity)) throw Error('Inconsistent saved progress');
    return game;
  }
}
