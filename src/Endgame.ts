import { Direction, drawFoodCell, Game, Point } from './Game';

type State = {
  head: Point; direction: Direction; empty: number[]; food: number; rng: number;
  removed: number; parent: number; depth: number;
};

// Before the original tail has completely departed, the initial body and the
// number of non-growing moves give the exact next tail. Only the few empty
// cells, heading and RNG need to vary across search nodes.
export function shortestFinish(game: Game) {
  const holes = game.capacity - game.length;
  const target = game.food.values().next().value;
  if (!target || holes > 6 || game.capacity > 65_536) return;
  const id = (p: Point) => p.y * game.width + p.x;
  const empty: number[] = [];
  for (let i = 0; i < game.capacity; i++) if (!game.isOccupied(game.pointAt(i))) empty.push(i);
  const queue: State[] = [{ head: game.head, direction: game.direction, empty, food: id(target),
    rng: game.rng, removed: 0, parent: -1, depth: 0 }];
  const seen = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const state = queue[i];
    // Keep the explored levels complete. A truncated branch could otherwise
    // hide a shorter finish than the one we return.
    if (state.depth >= game.length) return;
    const tail = id(game.segment(game.first + state.removed)!);
    for (let d = 0; d < 4; d++) {
      if (game.capacity - state.empty.length > 1 && d === (state.direction + 2) % 4) continue;
      const direction = d as Direction, head = game.next(state.head, direction);
      if (!game.contains(head)) continue;
      const cell = id(head), slot = state.empty.indexOf(cell);
      if (cell === id(state.head) || (slot < 0 && cell !== tail)) continue;
      const eats = cell === state.food;
      if (eats && state.empty.length === 1) {
        const points = [head], directions = [direction];
        for (let j = i; queue[j].parent >= 0; j = queue[j].parent) {
          points.push(queue[j].head); directions.push(queue[j].direction);
        }
        return { points: points.reverse(), directions: directions.reverse() };
      }
      let free = state.empty, food = state.food, rng = state.rng;
      if (slot >= 0) {
        free = state.empty.slice();
        free.splice(slot, 1);
        if (!eats) { free.push(tail); free.sort((a, b) => a - b); }
      }
      if (eats) {
        const spawn = drawFoodCell(rng, game.capacity, n => free.includes(n), { count: free.length, at: rank => free[rank] });
        food = spawn.cell; rng = spawn.rng;
      }
      const removed = state.removed + Number(!eats);
      const signature = [cell, direction, removed, food, rng, ...free].join(',');
      if (seen.has(signature)) continue;
      if (queue.length >= 1024) return;
      seen.add(signature);
      queue.push({ head, direction, empty: free, food, rng, removed, parent: i, depth: state.depth + 1 });
    }
  }
}
