import { expect, it } from 'vitest';
import { Game } from './Game';
import { TorusCycle } from './TorusCycle';

it('matches exhaustive free-arc rewiring and preserves the occupied arc', () => {
  let improvements = 0;
  for (const wrap of [false, true]) {
    const game = new Game(42, 6, 4, wrap);
    const base = new TorusCycle(6, 4, undefined, wrap);
    for (const start of [0, 9, 19]) for (const clearance of [8, 16]) {
      const cells = Array.from({ length: base.size }, (_, i) => base.point((start + i) % base.size));
      const neighbor = (i: number, j: number) => ([0, 1, 2, 3] as const).some(d => {
        const p = game.next(cells[i], d);
        return p.x === cells[j].x && p.y === cells[j].y;
      });
      const original = cells.map((_, i) => i);
      const minimum = original.slice();
      function consider(order: number[]) {
        if (order.every((cell, i) => neighbor(cell, order[(i + 1) % order.length]))) {
          order.forEach((cell, i) => { minimum[cell] = Math.min(minimum[cell], i); });
        }
      }
      for (let a = 1; a < clearance; a++) for (let b = a + 1; b < clearance; b++) {
        consider([...original.slice(0, a), ...original.slice(a, b + 1).reverse(), ...original.slice(b + 1)]);
      }
      for (let k = 0; k < clearance; k++) for (let i = k + 1; i < clearance; i++) {
        for (let l = i + 1; l < clearance; l++) for (let j = l + 1; j < clearance; j++) {
          consider([...original.slice(0, k + 1), ...original.slice(l + 1, j + 1), ...original.slice(i + 1, l + 1),
            ...original.slice(k + 1, i + 1), ...original.slice(j + 1)]);
        }
      }
      for (let food = 1; food < clearance; food++) {
        const cycle = new TorusCycle(6, 4, cells, wrap);
        const changed = cycle.bringFoodForward(cells[0], cells[clearance], cells[food]);
        expect(changed).toBe(minimum[food] < food);
        expect(cycle.distance(cells[0], cells[food])).toBe(minimum[food]);
        expect(cycle.cells.slice(clearance)).toEqual(cells.slice(clearance));
        expect(cycle.point(0)).toEqual(cells[0]);
        expect(new Set(cycle.cells).size).toBe(cycle.size);
        expect(cycle.cells.every((p, i) => cycle.index(p) === i
          && neighbor(cells.indexOf(p), cells.indexOf(cycle.point((i + 1) % cycle.size))))).toBe(true);
        if (changed) improvements++;
      }
    }
  }
  expect(improvements).toBeGreaterThan(0);
});
