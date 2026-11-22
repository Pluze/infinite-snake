import { expect, it } from 'vitest';
import { Game } from './Game';
import { GridCycle } from './GridCycle';
import { projectBite, projectSpawn } from './CycleRollout';

it('projects the same ordered body, food and RNG as executing each move', () => {
  for (const wrap of [false, true]) {
    const cycle = new GridCycle(48, 32, wrap);
    const initial = new Game(113, 48, 32, wrap);
    const body = Array.from({ length: 720 }, (_, i) => cycle.point((i + 1200) % cycle.size));
    const game = Game.restore({ ...initial.snapshot(), body, food: [], travel: body.at(-1)!,
      direction: cycle.direction(body[body.length - 2]) }, [0]);
    let projected = { length: body.length, at: (i: number) => cycle.index(body[i]) };
    for (const fraction of [1, .25, 0, 1, 0, .25]) {
      const target = game.food.values().next().value!;
      const result = projectBite(game, cycle, projected, target, fraction, true);
      const spawn = projectSpawn(game, cycle, result.body, game.rng);
      const score = game.score;
      for (let i = 0; i < result.bite.moves; i++) {
        const direction = result.bite.directions[i - result.bite.wait] ?? cycle.direction(game.head);
        if (!game.canMove(direction) || !game.step(direction)) throw Error('Illegal projected move');
      }
      expect(game.score).toBe(score + 10);
      expect(game.head).toEqual(target);
      expect(Array.from({ length: game.length }, (_, i) => result.body.at(i))).toEqual(game.body().map(p => cycle.index(p)));
      expect(spawn).toEqual({ target: game.food.values().next().value, rng: game.rng });
      projected = result.body;
    }
  }
});
