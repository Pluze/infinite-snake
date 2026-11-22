import { boardDistance, searchRoute } from './RouteSearch';
import { Direction, Game, key, Point } from './Game';

class Forest {
  private parent: Int32Array;
  components: number;
  constructor(size: number) {
    this.parent = new Int32Array(size).fill(-1);
    this.components = size;
  }
  root(i: number): number {
    let r = i;
    while (this.parent[r] >= 0) r = this.parent[r];
    while (i !== r) { const next = this.parent[i]; this.parent[i] = r; i = next; }
    return r;
  }
  join(a: number, b: number) {
    a = this.root(a); b = this.root(b);
    if (a === b) return false;
    if (this.parent[a] > this.parent[b]) [a, b] = [b, a];
    this.parent[a] += this.parent[b];
    this.parent[b] = a;
    this.components--;
    return true;
  }
}

// The same tile boundaries are used by every candidate in every meal.
const adjacency = new WeakMap<Game, Int32Array>();
function neighbors(game: Game) {
  let result = adjacency.get(game);
  if (result) return result;
  const cols = game.width / 2, rows = game.height / 2, count = cols * rows;
  result = new Int32Array(4 * count);
  for (let t = 0; t < count; t++) {
    const x = t % cols, y = Math.floor(t / cols);
    result[4 * t] = x + 1 < cols ? t + 1 : game.wraparound ? t - cols + 1 : -1;
    result[4 * t + 1] = y + 1 < rows ? t + cols : game.wraparound ? x : -1;
    result[4 * t + 2] = x ? t - 1 : game.wraparound ? t + cols - 1 : -1;
    result[4 * t + 3] = y ? t - cols : game.wraparound ? count - cols + x : -1;
  }
  adjacency.set(game, result);
  return result;
}

const bodyEdges = new WeakMap<Game, { next: number; codes: Int32Array }>();

const INVALID_EDGE = 0x7fffffff;
function edgeCode(a: Point, b: Point, cols: number, adjacent: Int32Array) {
  const t = (a.y >> 1) * cols + (a.x >> 1), n = (b.y >> 1) * cols + (b.x >> 1);
  const crosses = t !== n;
  // Crossing a tile boundary requires that side's join. Staying within
  // the tile forbids the join perpendicular to the traversed edge.
  const xSide = (a.y === b.y) === crosses;
  const d = xSide ? (a.x % 2 ? 0 : 2) : (a.y % 2 ? 1 : 3);
  const other = adjacent[4 * t + d];
  if ((a.x === b.x) === (a.y === b.y) || (crosses && other !== n)) return INVALID_EDGE;
  if (other < 0) return 0;
  const code = 1 + 2 * (d < 2 ? t : other) + (d & 1);
  return crosses ? code : -code;
}

type Route = { directions: Direction[]; points: Point[] };

export function tileRoute(game: Game): Route | undefined {
  if (game.width % 2 || game.height % 2 || Math.min(game.width, game.height) < 4) return;
  const target = game.food.values().next().value;
  if (!target) return;
  const budget = Math.min(2048, boardDistance(game, game.head, target) * 2 + 64);
  const path = searchRoute(game, game.head, target, budget,
    (_from, to, step) => (game.occupied.get(key(to)) ?? -1) < game.first + step, game.direction);
  if (path) {
    const moves = path.slice(1);
    const chase = { directions: moves.map(n => n.d), points: moves.map(n => n.p) };
    if (completeTileCycle(game, chase)) return chase;
    // A turn that cannot extend to a spanning cycle after this bite may be
    // harmless once the tail clears it. Execute a short sequence on a fork
    // and pin the exact resulting body, including every intervening growth.
    if (game.length < game.capacity / 3) {
      const fork = game.forkForPlanning();
      adjacency.set(fork, neighbors(game));
      if (chase.directions.every(d => fork.step(d))) {
        let budgetLeft = 2048;
        for (let meal = 1; meal < 6 && budgetLeft > 0; meal++) {
          const next = fork.food.values().next().value;
          if (!next) break;
          const allowance = Math.min(budgetLeft, 2 * boardDistance(fork, fork.head, next) + 64);
          budgetLeft -= allowance;
          const path = searchRoute(fork, fork.head, next, allowance, (_from, to) => !fork.isOccupied(to), fork.direction);
          if (!path) break;
          for (let i = 1; i < path.length; i++) {
            if (!fork.step(path[i].d)) return;
            chase.points.push(fork.head); chase.directions.push(path[i].d);
          }
          if (fork.won || completeTileCycle(fork, { directions: [], points: [] })) return chase;
        }
      }
    }
  }
  let best = completeTileCycle(game);
  const distance = boardDistance(game, game.head, target);
  const maxRelease = Math.min(game.length - 2, (best?.points.length ?? Infinity) - 2);
  // The tail will vacate these constraints before the bite. Try both the
  // geometric lower bound and a longer detour, then replay the released prefix.
  for (const release of [distance - 1, Math.ceil(Math.sqrt(game.length * distance))]) {
    if (release < 1 || release > maxRelease || (best && best.points.length <= 2 * distance + 8)) continue;
    const alternative = completeTileCycle(game, undefined, release);
    if (!alternative || alternative.points.length <= release || (best && alternative.points.length >= best.points.length)) continue;
    let safe = true;
    for (let i = 0; i < release; i++) {
      if ((game.occupied.get(key(alternative.points[i])) ?? -1) > game.first + i) { safe = false; break; }
    }
    if (safe) best = alternative;
  }
  return best;
}

/** Join neighboring 2x2 perimeter loops along a spanning tree. Each join
 * exchanges the two facing edges for two crossings of their shared boundary. */
function completeTileCycle(game: Game, chase?: Route, release = 0): Route | undefined {
  const food = game.food.values().next().value;
  const w = game.width, h = game.height;
  if (!food || w % 2 || h % 2 || w < 4 || h < 4 || game.length < 2) return;
  const cols = w / 2, count = cols * (h / 2);
  const tile = (x: number, y: number) => (y >> 1) * cols + (x >> 1);
  const flags = new Int8Array(count * 2); // forbidden, optional, or joined
  const forest = new Forest(count);
  const adjacent = neighbors(game);
  const neighbor = (t: number, d: number) => adjacent[4 * t + d];
  const edge = (t: number, d: number, n: number) => 2 * (d < 2 ? t : n) + (d & 1);
  // Positive codes force a join, negative codes keep an internal edge.
  function apply(code: number) {
    if (!code) return true;
    if (code === INVALID_EDGE) return false;
    const id = Math.abs(code) - 1, value = Math.sign(code);
    if (flags[id]) return flags[id] === value;
    flags[id] = value;
    return value < 0 || forest.join(id >> 1, adjacent[(id >> 1) * 4 + (id & 1)]);
  }
  // At the bite all but the last move have released a tail segment. Pin the
  // actual remaining body. The search already checked the arrival time at each cell.
  const moves = chase?.points.length ?? 0;
  const first = game.first + Math.max(release, moves - 1);
  const segment = (i: number) => i < game.last ? game.segment(i)! : chase!.points[i - game.last];
  // The live body's edge requirements survive replans and tail movement.
  // A ring indexed by segment number keeps them bounded to one board.
  let cached = bodyEdges.get(game);
  if (!cached || cached.codes.length < game.length) {
    const size = 2 ** Math.ceil(Math.log2(game.length));
    cached = { next: game.first + 1, codes: new Int32Array(size) };
    bodyEdges.set(game, cached);
  }
  const mask = cached.codes.length - 1;
  const from = Math.max(cached.next, game.first + 1);
  if (from < game.last) {
    let a = game.segment(from - 1)!;
    for (let i = from; i < game.last; i++) {
      const b = game.segment(i)!;
      cached.codes[i & mask] = edgeCode(a, b, cols, adjacent);
      a = b;
    }
    cached.next = game.last;
  }
  for (let i = first + 1; i < game.last; i++) {
    if (!apply(cached.codes[i & mask])) return;
  }
  let previous = segment(Math.max(first, game.last - 1));
  for (let i = Math.max(first + 1, game.last); i < game.last + moves; i++) {
    const p = segment(i);
    if (!apply(edgeCode(previous, p, cols, adjacent))) return;
    previous = p;
  }
  if (chase) {
    for (let t = 0; t < count; t++) for (let d = 0; d < 2; d++) {
      const n = neighbor(t, d);
      if (n >= 0 && flags[2 * t + d] >= 0) forest.join(t, n);
    }
    return forest.components === 1 ? chase : undefined;
  }
  const goal = tile(food.x, food.y), root = forest.root(tile(previous.x, previous.y));
  const protectedEdge = new Uint8Array(flags.length);
  function trace(protect: boolean, visit?: (n: number, id: number, step: number) => void) {
    const directions: Direction[] = [], points: Point[] = [];
    let p = game.head, prev = game.segment(game.last - 2)!;
    for (let step = 0; step < game.capacity; step++) {
      const t = tile(p.x, p.y);
      const east = p.x % 2 === 1, south = p.y % 2 === 1;
      let moved = false;
      for (let arm = 0; arm < 2; arm++) {
        const side = arm ? (south ? 1 : 3) : (east ? 0 : 2);
        const n = neighbor(t, side), id = edge(t, side, n);
        const joined = n >= 0 && flags[id] === 1;
        const d = (joined ? side : arm ? (east ? 2 : 0) : (south ? 3 : 1)) as Direction;
        const next = game.next(p, d);
        if (next.x === prev.x && next.y === prev.y) continue;
        if (!joined && n >= 0) {
          if (visit && !flags[id]) visit(n, id, step);
          else if (protect) protectedEdge[id] = 1;
        }
        if (!protect && !visit) { directions.push(d); points.push(next); }
        prev = p; p = next; moved = true; break;
      }
      if (!moved) return;
      if (visit && p.x === segment(first).x && p.y === segment(first).y) return;
      if (p.x === food!.x && p.y === food!.y) return { directions, points };
    }
  }
  if (forest.root(goal) !== root) {
    // Distance from each free tile to the food, without crossing the body tree.
    const parent = new Int32Array(count).fill(-1), depth = new Int32Array(count);
    const queue = new Int32Array(count);
    queue[0] = goal; parent[goal] = goal;
    let end = 1;
    for (let i = 0; i < end; i++) {
      const t = queue[i];
      for (let d = 0; d < 4; d++) {
        const n = neighbor(t, d);
        if (n < 0 || parent[n] >= 0 || forest.root(n) === root || flags[edge(t, d, n)] < 0) continue;
        parent[n] = t * 4 + d;
        depth[n] = depth[t] + 1;
        queue[end++] = n;
      }
    }
    let reached = -1, entrance = -1, best = Infinity;
    trace(false, (n, id, step) => {
      if (parent[n] < 0 || step + 2 * depth[n] >= best) return;
      best = step + 2 * depth[n]; reached = n; entrance = id;
    });
    if (reached < 0) return;
    flags[entrance] = 1;
    forest.join(reached, root);
    for (let t = reached; t !== goal;) {
      const link = parent[t], p = Math.floor(link / 4);
      flags[edge(p, link % 4, t)] = 1;
      forest.join(p, t); t = p;
    }
  }
  if (!trace(true)) return;
  // Attach the rest of the board behind the food wherever possible. Only a
  // disconnected component can force an extra detour into the protected arc.
  for (let priority = 0; priority <= 1; priority++) {
    for (let t = 0; t < count; t++) for (let d = 0; d < 2; d++) {
      const id = 2 * t + d;
      if (flags[id] || protectedEdge[id] !== priority) continue;
      const n = neighbor(t, d);
      if (n >= 0 && forest.join(t, n)) flags[id] = 1;
    }
  }
  // A missing component would make the fallback cycle incomplete.
  if (forest.components !== 1) return;
  return trace(false);
}
