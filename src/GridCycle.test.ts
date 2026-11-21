import { expect, it } from 'vitest';
import { AutoPlayer } from './AutoPlayer';
import { Game } from './Game';
import { GridCycle } from './GridCycle';

it('indexes a closed, adjacent cycle on even and odd boards in both orientations', () => {
  const shapes = [
    [2, 3, false], [3, 2, false], [7, 8, false], [8, 7, false],
    [2, 5, true], [5, 2, true], [7, 7, true], [8, 7, true], [7, 8, true],
  ] as const;
  for (const [width, height, wraparound] of shapes) {
    const game = new Game(42, width, height, wraparound);
    const forward = new GridCycle(width, height, wraparound);
    expect(forward.ordered(game.body())).toBe(true);
    for (const cycle of [forward, forward.reversed()]) {
      for (let i = 0; i < cycle.size; i++) {
        const point = cycle.point(i);
        expect(game.contains(point)).toBe(true);
        expect(cycle.index(point)).toBe(i);
        expect(game.next(point, cycle.direction(point))).toEqual(cycle.point((i + 1) % cycle.size));
      }
    }
  }
});

it('plans and resumes autoplay on a board with over 16 million cells', () => {
  const game = new Game(42, 4096, 4096);
  const bot = new AutoPlayer();
  while (game.score < 100 && game.steps < 100_000) {
    const move = bot.nextMove(game);
    if (!move.safe || !game.step(move.direction)) throw Error('Autoplay lost its safe route');
    bot.advance(game);
  }
  expect(game.score).toBe(100);
  expect(game.autoCycle).toBeUndefined();
  const restored = Game.restore(game.snapshot(), [...game.scores]);
  const move = new AutoPlayer().nextMove(restored);
  expect(move.safe).toBe(true);
  expect(move.direction).toBeDefined();
  expect(restored.step(move.direction)).toBe(true);
});
