import { Direction, Game, key, Point } from './Game';
import { Cycle, TorusCycle } from './TorusCycle';
import { GridCycle } from './GridCycle';
import { boardDistance, RouteNode, searchRoute } from './RouteSearch';
type Move = { direction?: Direction; safe: boolean; reason: string };
type PreviewPath =
  | { cycle: Cycle; length: number }
  | { points: Point[]; directions: Direction[]; cursor: number; origin: Point };
export type Plan = Move & { directions: Direction[]; points: Point[]; path?: PreviewPath };
type FoodRoute = { directions: Direction[]; points: Point[]; coverage: boolean; cycleAfter?: GridCycle };

/** Short chases and compact coverage with a cycle as a safety certificate. */
export class AutoPlayer {
  private route: Direction[] = [];
  private points: Point[] = [];
  private cursor = 0;
  private expected = '';
  private cycle?: Cycle;
  private cycleRemaining = 0;
  private replanCycleAt = 0;
  private plannedStep = -1;
  private plannedMove?: Move;
  private pathOrigin?: Point;
  private cycleAfter?: GridCycle;
  private game?: Game;
  private retryRewireAt = 0;
  private ordered: boolean | undefined;
  private checkedLegacyCycle = false;
  private retryChaseAt = 0;
  private phaseReason = '';
  private coverageRoute = false;
  clear() {
    this.route = [];
    this.points = [];
    this.cursor = 0;
    this.expected = '';
    this.cycleRemaining = 0;
    this.cycleAfter = undefined;
    this.plannedStep = -1;
    this.plannedMove = undefined;
    this.ordered = undefined;
    this.retryChaseAt = 0;
    this.retryRewireAt = 0;
    this.coverageRoute = false;
  }
  preview(game: Game): Plan {
    const move = this.nextMove(game);
    if (move.direction === undefined) return { ...move, directions: [], points: [] };
    if (this.cursor < this.route.length) {
      return {
        ...move,
        directions: this.route.slice(this.cursor, this.cursor + 64),
        points: this.points.slice(this.cursor, this.cursor + 64),
        path: { points: this.points, directions: this.route, cursor: this.cursor, origin: this.pathOrigin! },
      };
    }
    if (this.cycleRemaining) {
      // The cycle may be a temporary fallback while a shortcut opens.
      const untilReplan = game.capacity >= 8192 ? this.replanCycleAt - game.steps : Infinity;
      const length = Math.min(this.cycleRemaining, untilReplan);
      const directions: Direction[] = [], points: Point[] = [];
      let point = game.head;
      for (let i = 0; i < Math.min(64, length); i++) {
        const direction = this.cycle!.direction(point);
        point = game.next(point, direction);
        directions.push(direction);
        points.push(point);
      }
      return { ...move, directions, points, path: { cycle: this.cycle!, length } };
    }
    return { ...move, directions: [move.direction], points: [game.next(game.head, move.direction)] };
  }

  nextMove(game: Game): Move {
    if (this.game !== game) {
      this.clear();
      this.checkedLegacyCycle = false;
      this.game = game;
      // An odd-by-odd walled grid cannot have a Hamiltonian cycle.
      const canCycle = game.wraparound
        || (game.width > 1 && game.height > 1 && (game.width % 2 === 0 || game.height % 2 === 0));
      this.cycle = canCycle
        ? game.capacity > 65_536 || (game.capacity >= 8192 && !game.autoCycle)
          ? new GridCycle(game.width, game.height, game.wraparound)
          : new TorusCycle(game.width, game.height, game.autoCycle, game.wraparound)
        : undefined;
    }
    if (game.dead || game.won) {
      this.clear();
      return { safe: game.won, reason: game.won ? 'World filled' : 'Game over' };
    }
    if (this.plannedMove && this.plannedStep === game.steps) return this.plannedMove;
    this.plannedStep = game.steps;
    return this.plannedMove = this.planMove(game);
  }

  private planMove(game: Game): Move {
    const large = game.capacity >= 8192;
    const replan = !large && this.coverageRoute && Math.max(this.route.length - this.cursor, this.cycleRemaining) > 32 && game.steps >= this.retryRewireAt;
    if (!replan && this.expected === key(game.head)) {
      const next = this.route[this.cursor];
      if (next !== undefined && game.canMove(next)) return { direction: next, safe: true, reason: this.phaseReason };
      if ((large || this.coverageRoute) && this.cycleRemaining > 0 && game.steps < this.replanCycleAt) return this.followCycle(game, this.cycleRemaining, this.phaseReason);
    }
    this.route = [];
    this.points = [];
    this.cursor = 0;
    this.coverageRoute = false;
    this.cycleRemaining = 0;
    this.cycleAfter = undefined;
    if (!this.cycle) return this.planRecovery(game);
    if (this.ordered !== true) {
      this.ordered = this.cycle.ordered(game.segments.values());
      if (!this.ordered && this.cycle instanceof GridCycle) {
        const reversed = this.cycle.reversed();
        if (reversed.ordered(game.segments.values())) {
          this.cycle = reversed;
          this.ordered = true;
        }
      }
    }
    if (!this.ordered && !this.checkedLegacyCycle && this.cycle instanceof GridCycle && game.capacity <= 65_536 && game.steps > 0) {
      this.checkedLegacyCycle = true;
      // A save from before indexed cycles may have been following the old layout.
      const previous = new TorusCycle(game.width, game.height, game.autoCycle, game.wraparound);
      if (previous.ordered(game.segments.values())) {
        this.cycle = previous;
        this.ordered = true;
      }
    }
    if (!this.ordered) return this.planRecovery(game);
    const chases: FoodRoute[] = [];
    // A simple chase uses at most F moves and, with L >= F, cannot
    // replace the old head. Under a zero-gap certificate its new suffix
    // must follow the cycle, so a separate chase search cannot shorten it.
    if (game.length * 2 < game.capacity && game.steps >= this.retryChaseAt) {
      const firstAttempt = this.retryChaseAt === 0;
      const chase = this.findFoodRoute(game, true);
      if (chase) chases.push(chase);
      if (!large && firstAttempt && chase !== undefined && (chase?.points.length ?? Infinity) > 1) {
        const alternative = this.findFoodRoute(game, true, true);
        if (alternative) chases.push(alternative);
      }
      this.retryChaseAt = game.steps + (game.length / game.capacity < .35 ? 6 : 32);
    }
    const food = game.food.values().next().value;
    if (!chases.length && food && this.cycle instanceof TorusCycle && game.steps >= this.retryRewireAt
      && this.cycle.distance(game.head, food) < this.cycle.distance(game.head, game.tail)) {
      this.retryRewireAt = game.steps + Math.max(12, Math.ceil(game.capacity / 256));
      let changed = false;
      for (let edits = 0; edits < (large ? 1 : 4) && this.cycle.bringFoodForward(game.head, game.tail, food); edits++) changed = true;
      if (changed) game.autoCycle = this.cycle.cells.slice();
    }
    return this.planCoverage(game, chases);
  }
  private planCoverage(game: Game, candidates: FoodRoute[]): Move {
    const cycle = this.cycle!;
    const food = game.food.values().next().value;
    const slack = this.gapBudget(game);
    const clearance = cycle.distance(game.head, game.tail);
    const limit = food ? cycle.distance(game.head, food) : game.capacity;
    const shortcut = this.coverageShortcut(game, limit, clearance, slack);
    if (shortcut) {
      candidates.push(shortcut);
      const skipped = limit - shortcut.directions.length;
      if (skipped >= 4 && game.capacity < 8192) {
        const compact = this.coverageShortcut(game, limit, clearance, Math.floor(skipped / 2));
        if (compact) candidates.push(compact);
      }
    }

    if (food && game.capacity >= 8192) {
      const incumbent = Math.min(limit, ...candidates.map(route => route.directions.length));
      const directDistance = boardDistance(game, game.head, food);
      // Try the tail-aware route when the existing choices would still scan
      // a substantial arc relative to the distance to the food.
      if (incumbent > Math.max(1024, directDistance * 2)) {
        const progress = this.planForwardShortcuts(game, limit, incumbent);
        if (progress) {
          if (progress.complete) candidates.push(progress.route);
          else if (!candidates.length) return this.cacheRoute(game, progress.route, 'Taking a shortcut through the safe cycle');
        }
      }
    }

    const next = cycle.direction(game.head);
    const safe = game.canMove(next);
    if (food && safe && candidates.length) {
      let best = candidates[0];
      let bestCost = this.foodCost(game, best.cycleAfter ?? cycle, food, best);
      for (const candidate of candidates.slice(1)) {
        const cost = this.foodCost(game, candidate.cycleAfter ?? cycle, food, candidate);
        if (cost < bestCost) {
          best = candidate;
          bestCost = cost;
        }
      }
      // Following the cycle all the way is another certified candidate, even
      // when food is in a gap and the tail must pass it first.
      if (this.cycleFoodCost(game, cycle, food, limit) < bestCost) {
        this.retryRewireAt = Math.max(this.retryRewireAt, game.steps + 12);
        this.coverageRoute = true;
        this.replanCycleAt = Infinity;
        return this.followCycle(game, limit, 'Following a compact food route');
      }
      if (best.coverage) this.retryRewireAt = Math.max(this.retryRewireAt, game.steps + 12);
      return this.cacheRoute(game, best, best.coverage ? 'Following a compact food route' : 'Chasing food');
    }

    const reason = game.length / game.capacity < .75 ? 'Keeping the food route open' : 'Compact board filling';
    if (game.capacity >= 8192 && food) {
      // The food can spawn in a gap behind the head. Once the tail has passed
      // that gap, search again instead of committing to the rest of the lap.
      if (slack === 0 && this.cycle instanceof GridCycle) {
        this.replanCycleAt = Infinity;
      } else if (limit >= clearance) {
        const target = cycle.distance(game.tail, food);
        let low = game.first + 1, high = game.last;
        while (low < high) {
          const middle = Math.floor((low + high) / 2);
          if (cycle.distance(game.tail, game.segments.get(middle)!) <= target) low = middle + 1;
          else high = middle;
        }
        this.replanCycleAt = game.steps + low - game.first;
        this.retryChaseAt = Math.min(this.retryChaseAt, this.replanCycleAt);
      } else {
        this.replanCycleAt = game.steps + Math.max(32, Math.ceil(boardDistance(game, game.head, food) / 2));
      }
    }
    return this.followCycle(game, limit, reason);
  }

  private coverageShortcut(game: Game, limit: number, clearance: number, slack: number): FoodRoute | undefined {
    if (slack < 1 || limit >= clearance) return;
    const cycle = this.cycle!;
    if (game.capacity >= 8192) {
      const food = cycle.point((cycle.index(game.head) + limit) % cycle.size);
      const path = searchRoute(game, game.head, food, this.searchBudget(game), (from, to, steps) => {
        const progress = cycle.distance(game.head, to);
        return progress > cycle.distance(game.head, from) && progress <= limit && progress - steps <= slack;
      }, game.direction);
      return path && this.searchedRoute(path, true);
    }
    const nodes = [{ p: game.head, parent: -1, d: game.direction, progress: 0, steps: 0 }];
    const seen = new Set([key(game.head)]);
    for (let i = 0; i < nodes.length && i < 4096; i++) {
      const n = nodes[i];
      if (n.progress === limit && i) return this.buildRoute(nodes, i, true);
      for (const d of [n.d, (n.d + 1) % 4, (n.d + 3) % 4] as Direction[]) {
        const p = game.next(n.p, d);
        if (!game.contains(p)) continue;
        const k = key(p);
        const progress = cycle.distance(game.head, p);
        const jump = progress - n.progress;
        if (jump <= 0 || progress > limit || progress - n.steps - 1 > slack || seen.has(k)) continue;
        seen.add(k);
        nodes.push({ p, parent: i, d, progress, steps: n.steps + 1 });
      }
    }
  }

  private planForwardShortcuts(game: Game, limit: number, incumbent: number) {
    const cycle = this.cycle!;
    const directions: Direction[] = [];
    const points: Point[] = [];
    const origin = game.head;
    const start = cycle.index(origin);
    const offset = (point: Point) => (cycle.index(point) - start + cycle.size) % cycle.size;
    let current = origin;
    let progress = 0;
    const budget = Math.min(incumbent - 1, Math.max(1024, game.width + game.height));
    for (let step = 1; step <= budget; step++) {
      const released = game.segments.get(game.first + step);
      const retained = game.segments.get(game.first + step - 1);
      // Compare each jump with the tail on that move. Eating keeps one extra
      // old segment. Once the old head is the tail, its lifted index is size.
      const moveClearance = released ? offset(released) || cycle.size : cycle.size;
      const eatClearance = retained ? offset(retained) || cycle.size : cycle.size;
      let best = progress;
      let next: Point | undefined;
      let direction: Direction = game.direction;
      for (let d = 0; d < 4; d++) {
        const move = d as Direction;
        const point = game.next(current, move);
        if (!game.contains(point) || (step === 1 && !game.canMove(move))) continue;
        const advance = offset(point);
        if (advance <= best || advance > limit || advance >= (advance === limit ? eatClearance : moveClearance)) continue;
        best = advance;
        next = point;
        direction = move;
      }
      if (!next) break;
      progress = best;
      current = next;
      directions.push(direction);
      points.push(next);
      if (progress === limit) return { complete: true, route: { directions, points, coverage: true } };
    }
    // A partial route is useful only if it has already bypassed a material
    // part of the scan. Its final step will trigger a fresh plan.
    if (progress - directions.length >= 128) return { complete: false, route: { directions, points, coverage: true } };
  }

  private followCycle(game: Game, length: number, reason: string): Move {
    const direction = this.cycle!.direction(game.head);
    this.cycleRemaining = length;
    this.expected = key(game.head);
    this.phaseReason = reason;
    return { direction, safe: game.canMove(direction), reason };
  }

  private foodCost(game: Game, cycle: Cycle, food: Point, route: FoodRoute) {
    const remaining = game.capacity - game.length - 1;
    const moves = route.points.length;
    if (!remaining) return moves;
    // All moves except the final bite remove one segment from the tail.
    const bodyDistance = this.bodyDistance(game, cycle, food, moves - 1);
    let routeDistance = 0;
    for (let i = Math.max(0, moves - game.length - 1); i < moves - 1; i++)
      routeDistance += cycle.distance(food, route.points[i]);
    return moves + this.nextFoodCost(game.capacity, remaining, bodyDistance + routeDistance);
  }

  private cycleFoodCost(game: Game, cycle: Cycle, food: Point, distance: number) {
    const remaining = game.capacity - game.length - 1;
    if (!remaining) return distance;
    const appended = Math.min(distance - 1, game.length);
    // The newly occupied cells trail the food by 1, 2, ... consecutive edges.
    const occupiedDistance = appended * (game.capacity - (appended + 1) / 2)
      + this.bodyDistance(game, cycle, food, distance - 1);
    return distance + this.nextFoodCost(game.capacity, remaining, occupiedDistance);
  }

  private bodyDistance(game: Game, cycle: Cycle, food: Point, removed: number) {
    const first = game.first + removed;
    let distance = 0;
    // Only the scoring heuristic is sampled. Route safety uses exact cycle order.
    const stride = game.capacity >= 8192 ? Math.max(1, Math.ceil((game.last - first) / 512)) : 1;
    for (let i = first; i < game.last; i += stride) {
      distance += cycle.distance(food, game.segments.get(i)!) * Math.min(stride, game.last - i);
    }
    return distance;
  }

  private nextFoodCost(capacity: number, remaining: number, occupiedDistance: number) {
    // Sum all forward distances, then subtract the cells occupied after eating.
    return (capacity * (capacity - 1) / 2 - occupiedDistance) / remaining;
  }
  private gapBudget(game: Game) {
    // Gaps behind the head can strand the next meal. Their cost rises with
    // the time it takes the tail to pass them and the odds of spawning there.
    const free = game.capacity - game.length;
    const fill = game.length / game.capacity;
    const allowance = Math.min(1, Math.max(0, (.5 - fill) / .38)) ** 3;
    const largeAllowance = game.capacity >= 8192 ? Math.max(0, (.85 - fill) * .4) : 0;
    const narrowAllowance = Math.min(game.width, game.height) === 2 ? Math.max(0, (.8 - fill) * .65) : 0;
    return Math.floor(Math.max(allowance, largeAllowance, narrowAllowance) * free);
  }
  private buildRoute(nodes: RouteNode[], target: number, coverage = false): FoodRoute {
    const directions: Direction[] = [];
    const points: Point[] = [];
    for (let i = target; i > 0; i = nodes[i].parent) {
      directions.push(nodes[i].d);
      points.push(nodes[i].p);
    }
    return { directions: directions.reverse(), points: points.reverse(), coverage };
  }

  private cacheRoute(game: Game, route: FoodRoute, reason: string): Move {
    this.route = route.directions;
    this.points = route.points;
    this.phaseReason = reason;
    this.coverageRoute = route.coverage;
    this.expected = key(game.head);
    this.pathOrigin = game.head;
    this.cycleAfter = route.cycleAfter;
    return { direction: this.route[0], safe: true, reason };
  }

  private searchBudget(game: Game) {
    return Math.max(2048, game.width + game.height + 128);
  }

  private searchedRoute(path: RouteNode[], coverage = false): FoodRoute {
    const moves = path.slice(1);
    return { points: moves.map(node => node.p), directions: moves.map(node => node.d), coverage };
  }

  private safeFoodRoute(game: Game, route: FoodRoute, requireCycleOrder: boolean, cycle = this.cycle) {
    if (requireCycleOrder && cycle) {
      // The old suffix is already ordered. Check just the new edges and the
      // retained span, rather than copying and rescanning the whole body.
      const retained = game.segments.get(game.first + route.points.length - 1);
      let first = 0;
      let previous = game.head;
      let span = retained ? cycle.distance(retained, previous) : 0;
      if (!retained) {
        first = route.points.length - game.length;
        previous = route.points[first - 1];
      }
      for (let i = first; i < route.points.length; i++) {
        const point = route.points[i];
        const advance = cycle.distance(previous, point);
        if (!advance) return false;
        span += advance;
        previous = point;
      }
      return span < cycle.size && span - game.length <= this.gapBudget(game);
    }
    return this.canReachFutureTail(game, route.points, true);
  }

  // Null means this search tree found the food, but its route failed the safety check.
  private findFoodRoute(game: Game, requireCycleOrder: boolean, turnLeftFirst = false): FoodRoute | null | undefined {
    if (game.capacity >= 8192) {
      const food = game.food.values().next().value;
      if (!food) return;
      const path = searchRoute(game, game.head, food, this.searchBudget(game),
        (_from, to) => !game.occupied.has(key(to)), game.direction);
      if (!path) return;
      const route = this.searchedRoute(path);
      if (this.safeFoodRoute(game, route, requireCycleOrder)) return route;
      // A long chase replaces the entire old body. If its new suffix fits the
      // reverse cycle, we can switch direction safely once it reaches food.
      if (requireCycleOrder && this.cycle instanceof GridCycle && route.points.length > game.length) {
        const reversed = this.cycle.reversed();
        if (this.safeFoodRoute(game, route, true, reversed)) return { ...route, cycleAfter: reversed };
      }
      return null;
    }
    const nodes = [{ p: game.head, parent: -1, d: game.direction, straight: 0 }];
    const seen = new Set([key(game.head)]);
    for (let i = 0; i < nodes.length && i < 8192; i++) {
      const n = nodes[i];
      if (i && game.hasFood(n.p)) {
        const route = this.buildRoute(nodes, i);
        return this.safeFoodRoute(game, route, requireCycleOrder) ? route : null;
      }
      const turnFirst = requireCycleOrder && n.straight >= 3;
      const right = (n.d + 1) % 4, left = (n.d + 3) % 4;
      const turns = turnLeftFirst ? [left, right] : [right, left];
      const directions = (turnFirst || turnLeftFirst ? [...turns, n.d] : [n.d, ...turns]) as Direction[];
      if (game.length === 1 && i === 0) directions.push((n.d + 2) % 4 as Direction);
      for (const d of directions) {
        const p = game.next(n.p, d), k = key(p);
        if (!game.contains(p) || seen.has(k) || game.occupied.has(k)) continue;
        seen.add(k);
        nodes.push({ p, parent: i, d, straight: d === n.d ? n.straight + 1 : 1 });
      }
    }
  }
  private planRecovery(game: Game): Move {
    const route = this.findFoodRoute(game, false);
    if (route) return this.cacheRoute(game, route, 'Keeping a route to the tail');
    const directions = [game.direction, (game.direction + 1) % 4, (game.direction + 3) % 4] as Direction[];
    if (game.length === 1) directions.push((game.direction + 2) % 4 as Direction);
    const choices = directions.filter(d => game.canMove(d)).map(d => {
      const p = game.next(game.head, d);
      return { d, safe: this.canReachFutureTail(game, [p], game.hasFood(p)) };
    });
    const choice = choices.find(c => c.safe && c.d === this.cycle?.direction(game.head)) ?? choices.find(c => c.safe) ?? choices[0];
    if (!choice) return { safe: false, reason: 'No available direction' };
    return { direction: choice.d, safe: choice.safe, reason: choice.safe ? 'Keeping a path to the tail' : 'No verified escape route' };
  }
  advance(game: Game) {
    this.cursor++;
    this.cycleRemaining = Math.max(0, this.cycleRemaining - 1);
    this.expected = key(game.head);
    if (game.score !== game.scores[game.steps - 1]) {
      if (this.cycleAfter && this.cursor === this.route.length) this.cycle = this.cycleAfter;
      this.retryChaseAt = 0;
      this.retryRewireAt = 0;
      this.cycleRemaining = 0;
    }
  }
  private canReachFutureTail(game: Game, path: Point[], grows: boolean) {
    const length = game.length + Number(grows);
    if (length === game.capacity || length === 1) return true;
    const removed = path.length - Number(grows);
    const first = game.first + removed;
    const head = path[path.length - 1];
    const tail = game.segments.get(first) ?? path[first - game.last];
    const tailKey = key(tail);
    const firstAppended = Math.max(0, first - game.last + 1);
    const appended = new Set(path.slice(firstAppended, -1).map(key));
    const isBlocked = (cell: string) => (game.occupied.get(cell) ?? -1) >= first || appended.has(cell);
    if (game.capacity >= 8192) {
      return Boolean(searchRoute(game, head, tail, this.searchBudget(game),
        (_from, to) => {
          const cell = key(to);
          return cell === tailKey || !isBlocked(cell);
        }));
    }
    const seen = new Set([key(head)]), queue = [head];
    for (let i = 0; i < queue.length; i++) {
      for (let d = 0; d < 4; d++) {
        const p = game.next(queue[i], d as Direction), cell = key(p);
        if (!game.contains(p)) continue;
        if (cell === tailKey) return true;
        if (!isBlocked(cell) && !seen.has(cell)) { seen.add(cell); queue.push(p); }
      }
    }
    return false;
  }
}
