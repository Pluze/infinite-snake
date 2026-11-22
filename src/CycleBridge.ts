import { drawFoodCell, Game } from './Game';
import { Cycle } from './TorusCycle';

/** Verify following a new cycle until every old segment has left. Before
 * that tick every appended cell stays occupied and is visited only once. */
export function bridgeLength(game: Game, cycle: Cycle, options: { maxSteps?: number; accept?: (ticks: number) => boolean } = {}): number | undefined {
  const food = game.food.values().next().value;
  if (!food || !game.canMove(cycle.direction(game.head))) return;
  const start = cycle.index(game.head);
  const arrival = (index: number) => (index - start + cycle.size) % cycle.size || cycle.size;
  let bite = arrival(cycle.index(food)), rng = game.rng;
  const meals: number[] = [];
  while (bite <= Math.min(options.maxSteps ?? Infinity, game.length + meals.length)) {
    meals.push(bite);
    if (meals.length > 16 || game.length + meals.length >= cycle.size) return;
    const retainedFrom = game.first + bite - meals.length;
    const draw = drawFoodCell(rng, cycle.size, cell => {
      const point = game.pointAt(cell);
      return arrival(cycle.index(point)) > bite && (game.segmentAt(point) ?? -1) < retainedFrom;
    });
    if (draw.cell < 0) return;
    rng = draw.rng;
    bite = arrival(cycle.index(game.pointAt(draw.cell)));
  }
  const ticks = Math.min(options.maxSteps ?? Infinity, game.length + meals.length);
  if (options.accept && !options.accept(ticks)) return;
  // Nearby blocked lanes are common. Reject them before walking the body.
  let grows = 0;
  for (let step = 1; step <= Math.min(ticks, 16); step++) {
    if (step === meals[grows]) grows++;
    const index = game.segmentAt(cycle.point((start + step) % cycle.size));
    if (index !== undefined && index >= game.first + step - grows) return;
  }
  let release = 0, meal = 0;
  for (let i = game.first; i < game.last; i++) {
    const p = game.segment(i)!;
    release++;
    while (release === meals[meal]) { release++; meal++; }
    const at = arrival(cycle.index(p));
    if (at <= ticks && at < release) return;
  }
  return ticks;
}
