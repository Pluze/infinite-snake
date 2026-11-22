import { Direction, Game, Point, nextRandom } from './Game';
import { boardDistance } from './RouteSearch';
import { Cycle } from './TorusCycle';

type Body = { length: number; at: (index: number) => number };
type Bite = { wait: number; moves: number; directions: Direction[]; points: Point[] };

const forward = (a: number, b: number, size: number) => (b - a + size) % size;

export function projectBite(game: Game, cycle: Cycle, body: Body, target: Point, fraction: number, record: boolean) {
  const size = cycle.size;
  const offset = (a: number, b: number) => forward(a, b, size);
  const oldHead = body.at(body.length - 1);
  const oldTail = body.at(0);
  const targetIndex = cycle.index(target);
  let wait = 0;
  if (fraction && offset(oldTail, targetIndex) < offset(oldTail, oldHead)) {
    // Jump directly to the tick when the moving tail has passed the food.
    // No forward shortcut can land on it while it is inside the body arc.
    let low = 1, high = body.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (offset(oldTail, body.at(mid)) <= offset(oldTail, targetIndex)) low = mid + 1;
      else high = mid;
    }
    wait = Math.min(low, offset(oldHead, targetIndex));
    const original = body;
    body = { length: original.length, at(i) {
      const tick = i + wait;
      return tick < original.length ? original.at(tick) : (oldHead + tick - original.length + 1) % size;
    } };
  }
  const start = body.at(body.length - 1);
  const limit = offset(start, cycle.index(target));
  let pos = start, progress = 0;
  const prefix: number[] = [], directions: Direction[] = [], points: Point[] = [];
  const skip = Math.floor((size - body.length) * fraction);
  const budget = Math.min(512, game.width + game.height, limit);
  for (let step = 1; skip && step <= budget && progress < limit; step++) {
    const tail = step <= body.length ? body.at(step - 1) : start;
    const clearance = offset(start, tail) || size;
    const head = cycle.point(pos);
    let advance = progress + 1, direction = cycle.direction(head);
    for (let d = 0; d < 4; d++) {
      const p = game.next(head, d as Direction);
      if (!game.contains(p)) continue;
      const next = offset(start, cycle.index(p));
      if (next > advance && next <= limit && next < clearance && next - step <= skip) {
        advance = next;
        direction = d as Direction;
      }
    }
    pos = (start + advance) % size;
    prefix.push(pos);
    if (record) { directions.push(direction); points.push(cycle.point(pos)); }
    progress = advance;
  }
  const moves = prefix.length + limit - progress;
  const previous = body;
  const grown = { length: previous.length + 1, at(i: number) {
    const index = moves - 1 + i;
    if (index < previous.length) return previous.at(index);
    const added = index - previous.length;
    return added < prefix.length ? prefix[added] : (pos + added - prefix.length + 1) % size;
  } };
  let lastJump = prefix.length;
  while (lastJump && offset(prefix[lastJump - 2] ?? start, prefix[lastJump - 1]) === 1) lastJump--;
  const signature = lastJump ? wait + '/' + prefix.slice(0, lastJump).join(',') : '';
  return { bite: { wait, moves: wait + moves, directions, points }, body: grown, signature };
}

export function projectSpawn(game: Game, cycle: Cycle, body: Body, rng: number) {
  const size = cycle.size;
  const offset = (a: number, b: number) => forward(a, b, size);
  // Binary search an ordered body instead of copying or scanning it.
  const tail = body.at(0);
  for (let attempt = 0; attempt < 24; attempt++) {
    rng = nextRandom(rng);
    const cell = Math.floor(rng / 4294967296 * size);
    const p = { x: cell % game.width, y: Math.floor(cell / game.width) };
    const needle = offset(tail, cycle.index(p));
    let lo = 0, hi = body.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (offset(tail, body.at(mid)) < needle) lo = mid + 1;
      else hi = mid;
    }
    if (lo < body.length && offset(tail, body.at(lo)) === needle) continue;
    return { target: p, rng };
  }
}

/** Compare certified forward-jump policies on identical RNG states. Consecutive
 * cycle moves are represented by their endpoints, even on a very long lap. */
export function chooseCycleRollout(game: Game, cycle: Cycle): Bite | undefined {
  const food = game.food.values().next().value;
  if (!food) return;
  const size = cycle.size;
  const initial: Body = { length: game.length, at: i => cycle.index(game.segment(game.first + i)!) };
  type State = { body: Body; rng: number; target: Point; cost: number; first?: Bite };
  let beam: State[] = [{ body: initial, rng: game.rng, target: food, cost: 0 }];
  let choice: Bite | undefined, shortest: Bite | undefined;
  for (let meal = 0; meal < 4; meal++) {
    const candidates: State[] = [];
    for (const state of beam) {
      const signatures = new Set<string>();
      for (const fraction of [1, .25, 0]) {
        const result = projectBite(game, cycle, state.body, state.target, fraction, meal === 0);
        if (!meal && (!shortest || result.bite.moves < shortest.moves)) shortest = result.bite;
        if (signatures.has(result.signature)) continue;
        signatures.add(result.signature);
        const body = result.body;
        const cost = state.cost + result.bite.moves;
        const first = state.first ?? result.bite;
        if (meal === 3 || body.length === size) {
          candidates.push({ ...state, body, cost, first });
          continue;
        }
        const spawn = projectSpawn(game, cycle, body, state.rng);
        if (spawn) candidates.push({ ...spawn, body, cost, first });
      }
    }
    if (!candidates.length) break;
    candidates.sort((a, b) => a.cost - b.cost);
    beam = candidates.slice(0, 3);
    choice = beam[0].first;
    if (initial.length + meal + 1 === size) break;
  }
  // Preserve a geometrically shortest first bite when the finite horizon
  // would defer it by more than half a body length and a board crossing.
  if (shortest && shortest.moves === boardDistance(game, game.head, food)
    && choice && choice.moves - shortest.moves > Math.max(game.width + game.height, game.length / 2)) return shortest;
  return choice;
}
