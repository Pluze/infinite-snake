import { Game, key, nextRandom } from './Game';
import { Cycle } from './TorusCycle';

/** Verify following a new cycle until every old segment has left. Before
 * that tick every appended cell stays occupied and is visited only once. */
export function bridgeLength(game: Game, cycle: Cycle): number | undefined {
  const food = game.food.values().next().value;
  if (!food || !game.canMove(cycle.direction(game.head))) return;
  const start = cycle.index(game.head);
  const arrival = (index: number) => (index - start + cycle.size) % cycle.size || cycle.size;
  let bite = arrival(cycle.index(food)), rng = game.rng;
  const meals: number[] = [];
  while (bite <= game.length + meals.length) {
    meals.push(bite);
    if (meals.length > 16 || game.length + meals.length >= cycle.size) return;
    const retainedFrom = game.first + bite - meals.length;
    let spawned = false;
    for (let attempt = 0; attempt < 24; attempt++) {
      rng = nextRandom(rng);
      const cell = Math.floor(rng / 4294967296 * cycle.size);
      const p = { x: cell % game.width, y: Math.floor(cell / game.width) };
      const tick = arrival(cycle.index(p));
      if (tick <= bite || (game.occupied.get(key(p)) ?? -1) >= retainedFrom) continue;
      bite = tick; spawned = true; break;
    }
    if (!spawned) return;
  }
  let release = 0, meal = 0;
  for (const p of game.segments.values()) {
    release++;
    while (release === meals[meal]) { release++; meal++; }
    if (arrival(cycle.index(p)) < release) return;
  }
  return release;
}
