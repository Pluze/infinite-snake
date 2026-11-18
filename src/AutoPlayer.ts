import { Direction, Game, key, Point } from './Game';
import { TorusCycle } from './TorusCycle';
export type Plan = { directions: Direction[]; points: Point[]; safe: boolean; reason: string };
type RouteNode = { p: Point; parent: number; d: Direction };
type FoodRoute = { directions: Direction[]; points: Point[]; coverage: boolean };

/** Short chases and compact coverage with a cycle as a safety certificate. */
export class AutoPlayer {
  private route: Direction[] = [];
  private points: Point[] = [];
  private cursor = 0;
  private expected = '';
  private cycle?: TorusCycle;
  private game?: Game;
  private retryRewireAt = 0;
  private ordered: boolean | undefined;
  private retryChaseAt = 0;
  private phaseReason = '';
  private coverageRoute = false;
  clear() {
    this.route = [];
    this.points = [];
    this.cursor = 0;
    this.expected = '';
    this.ordered = undefined;
    this.retryChaseAt = 0;
    this.retryRewireAt = 0;
    this.coverageRoute = false;
  }
  preview(game: Game): Plan {
    if (this.game !== game) {
      this.clear();
      this.game = game;
      // An odd-by-odd walled grid cannot have a Hamiltonian cycle.
      this.cycle = game.wraparound || (game.width > 1 && game.height > 1 && (game.width % 2 === 0 || game.height % 2 === 0))
        ? new TorusCycle(game.width, game.height, game.autoCycle, game.wraparound) : undefined;
    }
    if (game.won) return { directions: [], points: [], safe: true, reason: 'World filled' };
    // Ordered coverage can be interrupted safely as the moving tail frees
    // new connections. A direct chase may only rejoin the cycle after eating.
    const replan = this.coverageRoute && this.route.length - this.cursor > 32 && game.steps >= this.retryRewireAt;
    if (!replan && this.cursor < this.route.length && this.expected === key(game.head) && game.canMove(this.route[this.cursor]))
      return { directions: this.route.slice(this.cursor, this.cursor + 64), points: this.points.slice(this.cursor, this.cursor + 64), safe: true, reason: this.phaseReason };
    this.route = []; this.points = []; this.cursor = 0; this.coverageRoute = false;
    if (!this.cycle) return this.planRecovery(game);
    if (this.ordered !== true) this.ordered = this.cycle.ordered(game.body());
    if (!this.ordered) return this.planRecovery(game);
    const chases: FoodRoute[] = [];
    // A simple chase uses at most F moves and, with L >= F, cannot
    // replace the old head. Under a zero-gap certificate its new suffix
    // must follow the cycle, so a separate chase search cannot shorten it.
    if (game.length * 2 < game.capacity && game.steps >= this.retryChaseAt) {
      const firstAttempt = this.retryChaseAt === 0;
      const chase = this.findFoodRoute(game, true);
      if (chase) chases.push(chase);
      if (firstAttempt && chase !== undefined && (chase?.points.length ?? Infinity) > 1) {
        const alternative = this.findFoodRoute(game, true, true);
        if (alternative) chases.push(alternative);
      }
      this.retryChaseAt = game.steps + (game.length / game.capacity < .35 ? 6 : 32);
    }
    const food = game.food.values().next().value;
    if (!chases.length && food && game.steps >= this.retryRewireAt && this.cycle.distance(game.head, food) < this.cycle.distance(game.head, game.tail)) {
      this.retryRewireAt = game.steps + Math.max(12, Math.ceil(game.capacity / 256));
      let changed = false;
      for (let edits = 0; edits < 4 && this.cycle.bringFoodForward(game.head, game.tail, food); edits++) changed = true;
      if (changed) game.autoCycle = this.cycle.cells.slice();
    }
    return this.planCoverage(game, chases);
  }
  private planCoverage(game: Game, candidates: FoodRoute[]): Plan {
    const cycle = this.cycle!;
    const food = game.food.values().next().value;
    const slack = this.gapBudget(game);
    const clearance = cycle.distance(game.head, game.tail);
    const limit = food ? cycle.distance(game.head, food) : game.capacity;
    const shortcut = this.coverageShortcut(game, limit, clearance, slack);
    if (shortcut) {
      candidates.push(shortcut);
      const skipped = limit - shortcut.directions.length;
      if (skipped >= 4) {
        const compact = this.coverageShortcut(game, limit, clearance, Math.floor(skipped / 2));
        if (compact) candidates.push(compact);
      }
    }

    const next = cycle.direction(game.head);
    const safe = game.canMove(next);
    if (food && safe && candidates.length) {
      const body = game.body();
      let best = candidates[0];
      let bestCost = this.foodCost(game, cycle, food, body, best);
      for (const candidate of candidates.slice(1)) {
        const cost = this.foodCost(game, cycle, food, body, candidate);
        if (cost < bestCost) {
          best = candidate;
          bestCost = cost;
        }
      }
      // Following the cycle all the way is another certified candidate, even
      // when food is in a gap and the tail must pass it first.
      if (this.cycleFoodCost(game, cycle, food, body, limit) < bestCost) {
        const nodes = this.cycleRoute(game, cycle, limit);
        this.retryRewireAt = Math.max(this.retryRewireAt, game.steps + 12);
        return this.cacheRoute(game, nodes, 'Following a compact food route');
      }
      if (best.coverage) this.retryRewireAt = Math.max(this.retryRewireAt, game.steps + 12);
      return this.cacheRoute(game, best, best.coverage ? 'Following a compact food route' : 'Chasing food');
    }

    const reason = game.length / game.capacity < .75 ? 'Keeping the food route open' : 'Compact board filling';
    return { directions: [next], points: [game.next(game.head, next)], safe, reason };
  }

  private coverageShortcut(game: Game, limit: number, clearance: number, slack: number): FoodRoute | undefined {
    if (slack < 1 || limit >= clearance) return;
    const cycle = this.cycle!;
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

  private cycleRoute(game: Game, cycle: TorusCycle, length: number): FoodRoute {
    const directions: Direction[] = [];
    const points: Point[] = [];
    let point = game.head;
    for (let i = 0; i < length; i++) {
      const direction = cycle.direction(point);
      point = game.next(point, direction);
      directions.push(direction);
      points.push(point);
    }
    return { directions, points, coverage: true };
  }

  private foodCost(game: Game, cycle: TorusCycle, food: Point, body: Point[], route: FoodRoute) {
    const remaining = game.capacity - game.length - 1;
    if (!remaining) return route.directions.length;
    // All moves except the final bite remove one segment from the tail.
    const moves = route.points.length;
    let occupiedDistance = 0;
    for (let i = moves - 1; i < body.length; i++)
      occupiedDistance += cycle.distance(food, body[i]);
    for (let i = Math.max(0, moves - game.length - 1); i < moves - 1; i++)
      occupiedDistance += cycle.distance(food, route.points[i]);
    return moves + this.nextFoodCost(game.capacity, remaining, occupiedDistance);
  }

  private cycleFoodCost(game: Game, cycle: TorusCycle, food: Point, body: Point[], distance: number) {
    const remaining = game.capacity - game.length - 1;
    if (!remaining) return distance;
    const appended = Math.min(distance - 1, game.length);
    // The newly occupied cells trail the food by 1, 2, ... consecutive edges.
    let occupiedDistance = appended * (game.capacity - (appended + 1) / 2);
    for (let i = Math.max(0, distance - 1); i < body.length; i++)
      occupiedDistance += cycle.distance(food, body[i]);
    return distance + this.nextFoodCost(game.capacity, remaining, occupiedDistance);
  }

  private nextFoodCost(capacity: number, remaining: number, occupiedDistance: number) {
    // Sum all forward distances, then subtract the cells occupied after eating.
    return (capacity * (capacity - 1) / 2 - occupiedDistance) / remaining;
  }
  private gapBudget(game: Game) {
    // Gaps behind the head can strand the next meal. Their cost rises with
    // the time it takes the tail to pass them and the odds of spawning there.
    const free = game.capacity - game.length;
    const allowance = Math.min(1, Math.max(0, (.5 - game.length / game.capacity) / .38));
    return Math.floor(allowance ** 3 * free);
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

  private cacheRoute(game: Game, route: FoodRoute, reason: string): Plan {
    this.route = route.directions;
    this.points = route.points;
    this.phaseReason = reason;
    this.coverageRoute = route.coverage;
    this.expected = key(game.head);
    return { directions: this.route.slice(0, 64), points: this.points.slice(0, 64), safe: true, reason };
  }

  // Null means this search tree found the food, but its route failed the safety check.
  private findFoodRoute(game: Game, requireCycleOrder: boolean, turnLeftFirst = false): FoodRoute | null | undefined {
    const nodes = [{ p: game.head, parent: -1, d: game.direction, straight: 0 }];
    const seen = new Set([key(game.head)]);
    for (let i = 0; i < nodes.length && i < 8192; i++) {
      const n = nodes[i];
      if (i && game.hasFood(n.p)) {
        const route = this.buildRoute(nodes, i);
        const future = game.body().concat(route.points).slice(-(game.length + 1));
        // The route visits distinct free cells. After eating, normal autoplay
        // also requires an ordered body so it can resume the safe cycle.
        const cycle = this.cycle;
        const safe = requireCycleOrder && cycle
          ? cycle.distance(future[0], n.p) - (future.length - 1) <= this.gapBudget(game) && cycle.ordered(future)
          : future.length === game.capacity || this.canReachTail(game, future);
        return safe ? route : null;
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
  private planRecovery(game: Game): Plan {
    const route = this.findFoodRoute(game, false);
    if (route) return this.cacheRoute(game, route, 'Keeping a route to the tail');
    const directions = [game.direction, (game.direction + 1) % 4, (game.direction + 3) % 4] as Direction[];
    if (game.length === 1) directions.push((game.direction + 2) % 4 as Direction);
    const choices = directions.filter(d => game.canMove(d)).map(d => {
      const p = game.next(game.head, d), eats = game.hasFood(p), future = game.body().slice(eats ? 0 : 1).concat(p);
      return { d, p, safe: future.length === game.capacity || this.canReachTail(game, future) };
    });
    const choice = choices.find(c => c.safe && c.d === this.cycle?.direction(game.head)) ?? choices.find(c => c.safe) ?? choices[0];
    if (!choice) return { directions: [], points: [], safe: false, reason: 'No available direction' };
    return { directions: [choice.d], points: [choice.p], safe: choice.safe, reason: choice.safe ? 'Keeping a path to the tail' : 'No verified escape route' };
  }
  advance(game: Game) {
    this.cursor++;
    this.expected = key(game.head);
    if (game.score !== game.scores[game.steps - 1]) {
      this.retryChaseAt = 0;
      this.retryRewireAt = 0;
    }
  }
  private canReachTail(game: Game, body: Point[]) {
    const tail = key(body[0]), head = body[body.length - 1];
    const blocked = new Set(body.slice(1, -1).map(key)), seen = new Set([key(head)]), queue = [head];
    for (let i = 0; i < queue.length; i++) {
      for (let d = 0; d < 4; d++) {
        const p = game.next(queue[i], d as Direction), k = key(p);
        if (!game.contains(p)) continue;
        if (k === tail) return true;
        if (!blocked.has(k) && !seen.has(k)) { seen.add(k); queue.push(p); }
      }
    }
    return false;
  }
}
