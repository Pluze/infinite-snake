import { Direction, Game, Point } from './Game';

export type RouteNode = { p: Point; parent: number; d: Direction };
type SearchNode = RouteNode & { id: number; steps: number; left: number; cost: number };

const ahead = (a: SearchNode, b: SearchNode) => a.cost < b.cost || (a.cost === b.cost && a.left < b.left);

export function boardDistance(game: Game, a: Point, b: Point) {
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  return game.wraparound ? Math.min(dx, game.width - dx) + Math.min(dy, game.height - dy) : dx + dy;
}

/** Bounded A* with sparse storage, including on boards with millions of cells. */
export function searchRoute(
  game: Game, start: Point, target: Point, budget: number,
  canVisit: (from: Point, to: Point, steps: number) => boolean,
  startDirection?: Direction,
): RouteNode[] | undefined {
  const id = (p: Point) => p.y * game.width + p.x;
  const left = boardDistance(game, start, target);
  const nodes: SearchNode[] = [{ p: start, id: id(start), d: startDirection ?? 0, parent: -1, steps: 0, left, cost: left }];
  const best = new Map([[nodes[0].id, 0]]);
  const heap = [0];
  for (let expanded = 0; heap.length && expanded < budget;) {
    const index = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      let slot = 0;
      while (slot * 2 + 1 < heap.length) {
        let child = slot * 2 + 1;
        if (child + 1 < heap.length && ahead(nodes[heap[child + 1]], nodes[heap[child]])) child++;
        if (!ahead(nodes[heap[child]], nodes[last])) break;
        heap[slot] = heap[child];
        slot = child;
      }
      heap[slot] = last;
    }
    const current = nodes[index];
    if (best.get(current.id) !== index) continue;
    if (current.left === 0) {
      const route: RouteNode[] = [];
      for (let i = index; i >= 0; i = nodes[i].parent) route.push(nodes[i]);
      return route.reverse();
    }
    expanded++;
    for (let turn = 0; turn < 4; turn++) {
      const d = (current.d + turn) % 4 as Direction;
      if (index === 0 && startDirection !== undefined && !game.canMove(d)) continue;
      const p = game.next(current.p, d);
      if (!game.contains(p)) continue;
      const cell = id(p), steps = current.steps + 1;
      const previous = best.get(cell);
      if ((previous !== undefined && nodes[previous].steps <= steps) || !canVisit(current.p, p, steps)) continue;
      const left = boardDistance(game, p, target);
      const next = { p, id: cell, parent: index, d, steps, left, cost: steps + left };
      const nextIndex = nodes.push(next) - 1;
      best.set(cell, nextIndex);
      let slot = heap.length;
      while (slot > 0) {
        const parent = (slot - 1) >> 1;
        if (!ahead(next, nodes[heap[parent]])) break;
        heap[slot] = heap[parent];
        slot = parent;
      }
      heap[slot] = nextIndex;
    }
  }
}
