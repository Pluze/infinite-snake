import { boardDistance, routeCandidates, searchRoute } from './RouteSearch';
import { Direction, Game, Point } from './Game';

class Forest {
  private parent: Int32Array;
  components: number;
  constructor(size: number) {
    this.parent = new Int32Array(size);
    this.components = size;
  }
  reset() { this.parent.fill(-1); this.components = this.parent.length; }
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

// Candidates run synchronously. A simulated continuation can borrow the same
// scratch space because only its returned directions and points escape a search.
function makeWorkspace(count: number) {
  return {
    forest: new Forest(count), flags: new Int8Array(2 * count),
    protectedEdge: new Uint8Array(2 * count), deferred: new Int32Array(2 * count),
    branch: undefined as { cost: Int32Array; side: Uint8Array } | undefined,
    parent: new Int32Array(count), depth: new Int32Array(count), queue: new Int32Array(count),
  };
}
const workspaces = new WeakMap<Game, ReturnType<typeof makeWorkspace>>();
const bodyEdges = Array.from({ length: 4 }, () => new WeakMap<Game, { next: number; codes: Int32Array; latest?: Float64Array; minFirst: number }>());

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

// A shortest rectangular-grid path needs at most one turn on an empty
// board. Test both elbows against tail release times and the cycle certificate.
function* elbowRoutes(game: Game, target: Point, splitLeg = false): Generator<Route> {
  const delta = (value: number, size: number) => game.wraparound && Math.abs(value) * 2 > size
    ? value - Math.sign(value) * size : value;
  const dx = delta(target.x - game.head.x, game.width), dy = delta(target.y - game.head.y, game.height);
  const horizontal: Direction = dx < 0 ? 2 : 0, vertical: Direction = dy < 0 ? 3 : 1;
  const verticalFirst = game.direction === vertical;
  for (const verticalStart of dx && dy ? [verticalFirst, !verticalFirst] : [verticalFirst]) {
    const first = verticalStart ? vertical : horizontal, second = verticalStart ? horizontal : vertical;
    const a = Math.abs(verticalStart ? dy : dx), b = Math.abs(verticalStart ? dx : dy);
    // Bisect the possible turn positions. Adjacent positions exercise both
    // tile parities. Every generated route still attains the geometric bound.
    const cuts = splitLeg ? new Set([1, a - 1, a >> 1, (a >> 1) + 1, a >> 2, a - (a >> 2)]) : [a];
    cuts: for (const cut of cuts) {
      if (splitLeg && (!b || cut <= 0 || cut >= a)) continue;
      let point = game.head;
      const points: Point[] = [], directions: Direction[] = [];
      for (const [direction, length] of [[first, cut], [second, b], [first, a - cut]] as const) {
        for (let step = 0; step < length; step++) {
          point = game.next(point, direction);
          if ((!points.length && !game.canMove(direction)) ||
              (game.segmentAt(point) ?? -1) >= game.first + points.length + 1) continue cuts;
          points.push(point);
          directions.push(direction);
        }
      }
      yield { points, directions };
    }
  }
}

// Uniform food spawns make every remaining free cell a potential target.
// Price the static detour after a bite. A pocket behind the body must wait
// for a release, so give it a finite penalty. This ranks certified routes.
function futureDetour(game: Game, route: Route) {
  const { width, height, capacity } = game;
  // A straight post-bite body blocks geodesics only on its own row or
  // column. Every off-axis target has an unobstructed perpendicular-first
  // geodesic. Behind the tail a parallel lane adds two moves; on the torus
  // the other direction along the same line can be shorter.
  const n = route.directions.length, direction = route.directions[n - 1];
  if (n >= game.length) {
    let straight = 0;
    while (straight < game.length && route.directions[n - 1 - straight] === direction) straight++;
    if (straight === game.length) {
      const horizontal = direction % 2 === 0, size = horizontal ? width : height;
      const head = route.points[n - 1], coordinate = horizontal ? head.x : head.y;
      const behind = game.wraparound ? Math.floor((size - 1) / 2)
        : direction < 2 ? coordinate : size - 1 - coordinate;
      let excess = 0;
      for (let d = game.length + 1; d <= behind; d++) {
        excess += (game.wraparound ? Math.min(2, size - 2 * d) : 2) / d;
      }
      return excess;
    }
  }
  let buffers = accessBuffers.get(game);
  if (!buffers) {
    buffers = { distance: new Int32Array(capacity), queue: new Int32Array(capacity) };
    accessBuffers.set(game, buffers);
  }
  const { distance, queue } = buffers;
  distance.fill(-1);
  const retained = game.first + route.points.length - 1;
  for (let i = retained; i < game.last; i++) {
    const p = game.segment(i)!;
    distance[p.y * width + p.x] = -2;
  }
  for (let i = Math.max(0, retained - game.last); i < route.points.length; i++) {
    const p = route.points[i];
    distance[p.y * width + p.x] = -2;
  }
  const head = route.points[route.points.length - 1];
  const start = head.y * width + head.x;
  queue[0] = start;
  distance[start] = 0;
  let end = 1, excess = 0;
  for (let i = 0; i < end; i++) {
    const cell = queue[i], x = cell % width, y = Math.floor(cell / width);
    const steps = distance[cell];
    const dx = Math.abs(x - head.x), dy = Math.abs(y - head.y);
    const direct = game.wraparound ? Math.min(dx, width - dx) + Math.min(dy, height - dy) : dx + dy;
    if (direct) excess += steps / direct - 1;
    for (let d = 0; d < 4; d++) {
      let next: number;
      if (d === 0) next = x + 1 < width ? cell + 1 : game.wraparound ? cell + 1 - width : -1;
      else if (d === 2) next = x ? cell - 1 : game.wraparound ? cell + width - 1 : -1;
      else if (d === 1) next = y + 1 < height ? cell + width : game.wraparound ? x : -1;
      else next = y ? cell - width : game.wraparound ? capacity - width + x : -1;
      if (next < 0 || distance[next] !== -1) continue;
      distance[next] = steps + 1;
      queue[end++] = next;
    }
  }
  return excess + (capacity - game.length - end) * (width + height);
}
const accessBuffers = new WeakMap<Game, { distance: Int32Array; queue: Int32Array }>();

// A simple certified arc induces a DAG: a shortcut can only point to a
// later cell. Reverse topological order gives the minimum number of moves
// in this graph. Replay the release times before requesting a new certificate.
const arcBuffers = new WeakMap<Game, { ranks: Int32Array; cost: Int32Array; successor: Int32Array; heading: Uint8Array }>();
function shortenArc(game: Game, route: Route): Route | undefined {
  const n = route.points.length;
  let buffers = arcBuffers.get(game);
  if (!buffers) {
    const size = game.capacity;
    buffers = { ranks: new Int32Array(size), cost: new Int32Array(size + 1),
      successor: new Int32Array(size), heading: new Uint8Array(size) };
    arcBuffers.set(game, buffers);
  }
  const { ranks, cost, successor, heading } = buffers;
  const { width, height, capacity, wraparound } = game;
  cost[n] = 0;
  for (let i = n; i >= 0; i--) {
    const p = i ? route.points[i - 1] : game.head;
    const cell = p.y * width + p.x;
    if (i < n) {
      cost[i] = cost[i + 1] + 1;
      successor[i] = i + 1;
      heading[i] = route.directions[i];
      for (let d = 0; d < 4; d++) {
        let next: number;
        if (d === 0) next = p.x + 1 < width ? cell + 1 : wraparound ? cell + 1 - width : -1;
        else if (d === 2) next = p.x ? cell - 1 : wraparound ? cell + width - 1 : -1;
        else if (d === 1) next = p.y + 1 < height ? cell + width : wraparound ? p.x : -1;
        else next = p.y ? cell - width : wraparound ? capacity - width + p.x : -1;
        if (next < 0) continue;
        const j = ranks[next];
        if (j > i && cost[j] + 1 < cost[i] && (i !== 0 || game.canMove(d as Direction))) {
          cost[i] = cost[j] + 1; successor[i] = j; heading[i] = d;
        }
      }
    }
    ranks[cell] = i;
  }
  for (const p of route.points) ranks[p.y * width + p.x] = 0;
  if (cost[0] >= n) return;
  const points: Point[] = [], directions: Direction[] = [];
  for (let i = 0; i < n; i = successor[i]) {
    const p = route.points[successor[i] - 1];
    if ((game.segmentAt(p) ?? -1) >= game.first + points.length + 1) return;
    directions.push(heading[i] as Direction); points.push(p);
  }
  return { directions, points };
}

export function tileRoute(game: Game, before = Infinity): Route | undefined {
  if (game.width % 2 || game.height % 2 || Math.min(game.width, game.height) < 4) return;
  const target = game.food.values().next().value;
  if (!target) return;
  const phases = game.wraparound ? [0, 1, 2, 3] : [0];
  const certified = (board: Game, chase: Route) =>
    phases.some(phase => completeTileCycle(board, chase, 0, phase));
  const distance = boardDistance(game, game.head, target);
  if (distance >= before) return;
  const budget = Math.min(2048, distance * 2 + 64);
  if (distance <= budget) {
    const elbows = Array.from(elbowRoutes(game, target)).filter(route => certified(game, route));
    if (elbows.length === 1) return elbows[0];
    if (elbows.length === 2) {
      return futureDetour(game, elbows[1]) < futureDetour(game, elbows[0]) ? elbows[1] : elbows[0];
    }
  }
  const candidates = routeCandidates(game, game.head, target, budget,
    (_from, to, step) => (game.segmentAt(to) ?? -1) < game.first + step, game.direction);
  const first = candidates.next();
  if (!first.done) {
    const path = first.value;
    const moves = path.slice(1);
    const chase = { directions: moves.map(n => n.d), points: moves.map(n => n.p) };
    if (certified(game, chase)) return chase;
    // Alternate arrival headings can preserve the spanning cycle even when
    // the first shortest path cuts across its required joins.
    for (const nodes of candidates) {
      const moves = nodes.slice(1);
      const chase = { directions: moves.map(n => n.d), points: moves.map(n => n.p) };
      if (certified(game, chase)) return chase;
    }
    // A turn that cannot extend to a spanning cycle after this bite may be
    // harmless once the tail clears it. Execute a short sequence on a fork
    // and pin the exact resulting body, including every intervening growth.
    if (game.length < game.capacity * 2 / 3) {
      const fork = game.forkForPlanning();
      adjacency.set(fork, neighbors(game));
      const workspace = workspaces.get(game);
      if (workspace) workspaces.set(fork, workspace);
      if (chase.directions.every(d => fork.step(d))) {
        let budgetLeft = Math.min(8192, 4 * game.length + budget);
        while (budgetLeft > 0) {
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
          if (fork.won || certified(fork, { directions: [], points: [] })) return chase;
        }
      }
    }
  }
  // Once the body is longer than the free area, a simple path through free
  // cells cannot replace the retained body. Extra first-bite shortcuts at
  // this stage regressed complete meal sequences in the dense fixtures.
  const roomForChase = game.capacity - game.length > game.length;
  // A long initial arc also bounds the later tail-release search. Preserve
  // that witness on crowded boards even when this is an early retry.
  const traceBound = roomForChase ? before : Infinity;
  let best: Route | undefined;
  for (const phase of phases) {
    const route = completeTileCycle(game, undefined, 0, phase, Math.min(traceBound, best?.points.length ?? Infinity));
    if (route && (!best || route.points.length < best.points.length)) best = route;
  }
  const maxRelease = Math.min(game.length - 2, (best?.points.length ?? Infinity) - 2);
  // The tail will vacate these constraints before the bite. Try both the
  // geometric lower bound and a longer detour, then replay the released prefix.
  const middle = Math.ceil(Math.sqrt(game.length * distance));
  const releases = [distance - 1, middle];
  // A fresh meal can justify a wider search for a release time. A scheduled
  // retry already has a live incumbent and only tests the two cheaper bounds.
  if (roomForChase && !Number.isFinite(before)) {
    for (let r = middle * 2; r < maxRelease; r *= 2) releases.push(r);
    if (maxRelease > middle) releases.push(maxRelease);
  }
  for (const release of releases) {
    if (release < 1 || release > maxRelease || (best && (release >= best.points.length - 1 || best.points.length <= 2 * distance + 8))) continue;
    const alternative = completeTileCycle(game, undefined, release, 0, Math.min(traceBound, best?.points.length ?? Infinity));
    if (!alternative || alternative.points.length <= release || (best && alternative.points.length >= best.points.length)) continue;
    let safe = true;
    for (let i = 0; i < release; i++) {
      if ((game.segmentAt(alternative.points[i]) ?? -1) > game.first + i) { safe = false; break; }
    }
    if (safe) best = alternative;
  }
  if (!roomForChase || !best || best.points.length <= 2 * distance) return best;
  if (distance <= budget && distance > 2) {
    const retained = Math.min(game.length - 1, distance - 1);
    const empty: Route = { directions: [], points: [] };
    const compatible = phases.filter(phase => completeTileCycle(game, empty, retained, phase));
    if (compatible.length) {
      for (const route of elbowRoutes(game, target, true)) {
        if (compatible.some(phase => completeTileCycle(game, route, 0, phase))) return route;
      }
    }
  }
  const short = shortenArc(game, best);
  if (short && certified(game, short)) return short;
  return best;
}

/** Join neighboring 2x2 perimeter loops along a spanning tree. Each join
 * exchanges the two facing edges for two crossings of their shared boundary. */
function completeTileCycle(game: Game, chase?: Route, release = 0, phase = 0, before = Infinity): Route | undefined {
  const w = game.width, h = game.height;
  const shiftX = phase & 1, shiftY = phase >> 1;
  const local = (p: Point) => phase ? { x: (p.x + shiftX) % w, y: (p.y + shiftY) % h } : p;
  const world = (x: number, y: number) => phase ? { x: (x + w - shiftX) % w, y: (y + h - shiftY) % h } : { x, y };
  const target = game.food.values().next().value;
  const food = target && local(target);
  if (!food || w % 2 || h % 2 || w < 4 || h < 4 || game.length < 2) return;
  const cols = w / 2, count = cols * (h / 2);
  const tile = (x: number, y: number) => (y >> 1) * cols + (x >> 1);
  let workspace = workspaces.get(game);
  if (!workspace) { workspace = makeWorkspace(count); workspaces.set(game, workspace); }
  const { flags, forest, protectedEdge, deferred, parent, depth, queue } = workspace;
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
  const segment = (i: number) => local(i < game.last ? game.segment(i)! : chase!.points[i - game.last]);
  // The live body's edge requirements survive replans and tail movement.
  // A ring indexed by segment number keeps them bounded to one board.
  let cached = bodyEdges[phase].get(game);
  if (!cached || cached.codes.length < game.length) {
    const size = 2 ** Math.ceil(Math.log2(game.length));
    cached = { next: game.first + 1, codes: new Int32Array(size), latest: game.segments.size ? new Float64Array(flags.length) : undefined, minFirst: game.first };
    bodyEdges[phase].set(game, cached);
  }
  const mask = cached.codes.length - 1;
  const from = Math.max(cached.next, game.first + 1);
  if (from < game.last) {
    let a = local(game.segment(from - 1)!);
    for (let i = from; i < game.last; i++) {
      const b = local(game.segment(i)!);
      const code = edgeCode(a, b, cols, adjacent);
      cached.codes[i & mask] = code;
      if (code === INVALID_EDGE) cached.minFirst = i;
      else if (code && cached.latest) {
        // A boundary cannot simultaneously be joined and kept closed. When
        // its sign changes, every suffix containing the previous occurrence
        // is infeasible until that older edge has left the body.
        const edge = Math.abs(code) - 1, previous = cached.latest[edge];
        if (previous * Math.sign(code) < 0) cached.minFirst = Math.max(cached.minFirst, Math.abs(previous));
        cached.latest[edge] = Math.sign(code) * i;
      }
      a = b;
    }
    cached.next = game.last;
  }
  if (first < cached.minFirst) return;
  flags.fill(0);
  forest.reset();
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
    for (let t = 0; t < count && forest.components > 1; t++) for (let d = 0; d < 2; d++) {
      const n = adjacent[4 * t + d];
      if (n >= 0 && !flags[2 * t + d]) forest.join(t, n);
    }
    return forest.components === 1 ? chase : undefined;
  }
  const goal = tile(food.x, food.y), root = forest.root(tile(previous.x, previous.y));
  protectedEdge.fill(0);
  const tail = segment(first);
  function trace(protect: boolean, visit?: (n: number, id: number, step: number, side: number, corner: number) => void) {
    const directions: Direction[] = [], points: Point[] = [];
    let { x, y } = local(game.head);
    const previousCell = local(game.segment(game.last - 2)!);
    let prevX = previousCell.x, prevY = previousCell.y;
    const limit = Math.min(game.capacity, before - 1);
    for (let step = 0; step < limit; step++) {
      const t = tile(x, y);
      const east = (x & 1) === 1, south = (y & 1) === 1;
      let moved = false;
      for (let arm = 0; arm < 2; arm++) {
        const side = arm ? (south ? 1 : 3) : (east ? 0 : 2);
        const n = neighbor(t, side), id = edge(t, side, n);
        const joined = n >= 0 && flags[id] === 1;
        const d = (joined ? side : arm ? (east ? 2 : 0) : (south ? 3 : 1)) as Direction;
        let nx = x, ny = y;
        if (d === 0) nx = x + 1 === w ? 0 : x + 1;
        else if (d === 2) nx = x === 0 ? w - 1 : x - 1;
        else if (d === 1) ny = y + 1 === h ? 0 : y + 1;
        else ny = y === 0 ? h - 1 : y - 1;
        if (nx === prevX && ny === prevY) continue;
        if (!joined && n >= 0) {
          if (visit && !flags[id]) visit(n, id, step, side, south ? (east ? 2 : 3) : (east ? 1 : 0));
          else if (protect) protectedEdge[id] = 1;
        }
        if (!protect && !visit) { directions.push(d); points.push(world(nx, ny)); }
        prevX = x; prevY = y; x = nx; y = ny; moved = true; break;
      }
      if (!moved) return;
      if (visit && x === tail.x && y === tail.y) return;
      if (x === food!.x && y === food!.y) return { directions, points };
    }
  }
  if (forest.root(goal) !== root) {
    // Distance from each free tile to the food, without crossing the body tree.
    parent.fill(-1);
    depth[goal] = 0;
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
    // Orient every tile perimeter in the body's direction. In the free-tile
    // distance DAG a state is the corner where the snake enters a tile.
    // A transition walks to the chosen side, crosses it, and pays the
    // remaining cost from the landing corner. Depth strictly decreases.
    // Corners run clockwise from NW = 0. Crossing a vertical boundary flips
    // the corner with XOR 1, and crossing a horizontal one uses XOR 3.
    const { cost: branchCost, side: branchSide } = workspace.branch ??= {
      cost: new Int32Array(4 * count), side: new Uint8Array(4 * count),
    };
    const goalCorner = (food.y & 1) ? (food.x & 1 ? 2 : 3) : (food.x & 1);
    let reached = -1, entrance = -1, firstCorner = -1, best = Infinity;
    let clockwise: boolean | undefined;
    const along = (a: number, b: number) => (clockwise ? b - a : a - b) & 3;
    branchCost.fill(-1);
    // The explicit stack follows decreasing depth. A state is expanded only
    // if a reachable entrance needs its value. Try the original BFS parent
    // first; once its cost reaches the geometric bound no other exit can win.
    // BFS is complete and edge deferral has not started, so both buffers are free.
    const stateStack = queue, optionStack = deferred;
    const costFrom = (start: number) => {
      if (branchCost[start] >= 0) return branchCost[start];
      let top = 0;
      stateStack[0] = start;
      optionStack[0] = 0;
      while (top >= 0) {
        const state = stateStack[top], t = state >> 2, corner = state & 3;
        const preferred = ((parent[t] & 3) + 2) & 3;
        const option = optionStack[top];
        if (option === 5) { top--; continue; }
        const side = option ? option - 1 : preferred;
        optionStack[top]++;
        if (option && side === preferred) continue;
        const n = adjacent[4 * t + side];
        if (n < 0 || parent[n] < 0 || depth[n] !== depth[t] - 1 || flags[edge(t, side, n)] < 0) continue;
        const leave = (side + (clockwise ? 1 : 2)) & 3;
        const next = 4 * n + (leave ^ (side & 1 ? 3 : 1));
        if (branchCost[next] < 0) {
          optionStack[top]--;
          stateStack[++top] = next;
          optionStack[top] = 0;
          continue;
        }
        const cost = along(corner, leave) + 1 + branchCost[next];
        if (branchCost[state] >= 0 && branchCost[state] <= cost) continue;
        branchCost[state] = cost;
        branchSide[state] = side;
        const x = (t % cols) * 2 + Number(corner === 1 || corner === 2);
        const y = Math.floor(t / cols) * 2 + Number(corner >= 2);
        const dx = Math.abs(x - food!.x), dy = Math.abs(y - food!.y);
        const bound = game.wraparound ? Math.min(dx, w - dx) + Math.min(dy, h - dy) : dx + dy;
        if (cost === bound || cost === depth[t]) top--;
      }
      return branchCost[start];
    };
    trace(false, (n, id, step, side, corner) => {
      if (parent[n] < 0 || step + 1 + depth[n] >= best) return;
      if (clockwise === undefined) {
        clockwise = corner === ((side + 1) & 3);
        for (let c = 0; c < 4; c++) branchCost[4 * goal + c] = along(c, goalCorner);
      }
      const land = corner ^ (side & 1 ? 3 : 1);
      const cost = step + 1 + costFrom(4 * n + land);
      if (cost < best) { best = cost; reached = n; entrance = id; firstCorner = land; }
    });
    if (reached < 0) return;
    flags[entrance] = 1;
    forest.join(reached, root);
    let corner = firstCorner;
    for (let t = reached; t !== goal;) {
      const side = branchSide[4 * t + corner], n = neighbor(t, side);
      flags[edge(t, side, n)] = 1;
      forest.join(t, n);
      corner = ((side + (clockwise ? 1 : 2)) & 3) ^ (side & 1 ? 3 : 1);
      t = n;
    }
  }
  if (!trace(true)) return;
  // Attach the rest of the board behind the food wherever possible. Only a
  // disconnected component can force an extra detour into the protected arc.
  let deferredCount = 0;
  for (let id = 0; id < flags.length && forest.components > 1; id++) {
    if (flags[id]) continue;
    const t = id >> 1, n = adjacent[4 * t + (id & 1)];
    if (n < 0) continue;
    if (protectedEdge[id]) deferred[deferredCount++] = id;
    else if (forest.join(t, n)) flags[id] = 1;
  }
  for (let i = 0; i < deferredCount && forest.components > 1; i++) {
    const id = deferred[i], t = id >> 1;
    if (forest.join(t, adjacent[4 * t + (id & 1)])) flags[id] = 1;
  }
  // A missing component would make the fallback cycle incomplete.
  if (forest.components !== 1) return;
  return trace(false);
}
