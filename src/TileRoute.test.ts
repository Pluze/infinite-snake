import { expect, it } from 'vitest';
import { Game } from './Game';
import { GridCycle } from './GridCycle';
import { AutoPlayer } from './AutoPlayer';
import { bridgeLength } from './CycleBridge';
import { tileRoute } from './TileRoute';

function savedBoard(seed: number, w: number, h: number, wrap: boolean) {
  const game = new Game(seed, w, h, wrap);
  const cycle = new GridCycle(w, h, wrap);
  const length = game.capacity / 2;
  const end = seed * 157 % game.capacity;
  const body = Array.from({ length }, (_, i) => cycle.point((end - length + 1 + i + cycle.size) % cycle.size));
  return Game.restore({ ...game.snapshot(), body, food: [], travel: body[length - 1],
    direction: cycle.direction(body[length - 2]) }, [0]);
}

it('completes games using only certified tile routes', () => {
  for (const wrap of [false, true]) for (const seed of [7, 42, 113]) {
    const game = new Game(seed, 16, 12, wrap);
    while (!game.won) {
      const route = tileRoute(game);
      if (!route?.directions.length) throw Error('Lost the spanning cycle');
      const score = game.score;
      for (const d of route.directions) {
        if (!game.canMove(d) || !game.step(d)) throw Error('Invalid certified path');
      }
      expect(game.score).toBeGreaterThan(score);
    }
  }
});

it('predicts the exact release tick of the old body across a torus seam', () => {
  let verified = 0, rejected = 0, grew = false;
  for (const seed of [7, 42, 91, 113, 999]) {
    const game = savedBoard(seed, 32, 24, true);
    for (const origin of [0, 6, 14]) for (const reverse of [true, false]) {
      const cycle = new GridCycle(32, 24, false, reverse, false, origin);
      const predicted = bridgeLength(game, cycle);
      const fork = game.forkForPlanning();
      let ticks = 0;
      while (fork.first < game.last && !fork.won) {
        const d = cycle.direction(fork.head);
        if (!fork.canMove(d) || !fork.step(d)) break;
        ticks++;
      }
      if (fork.first === game.last) {
        expect(predicted).toBe(ticks);
        grew ||= fork.score > game.score;
        verified++;
      } else { expect(predicted).toBeUndefined(); rejected++; }
    }
  }
  expect(verified * rejected).toBeGreaterThan(0);
  expect(grew).toBe(true);
});

it('resumes a half-full wrapped game while changing cycles', () => {
  let game = savedBoard(91, 256, 256, true);
  let bot = new AutoPlayer(), restored = false;
  while (game.steps < 80_000 && game.score < 160) {
    const move = bot.nextMove(game);
    if (!move.safe || move.direction === undefined || !game.step(move.direction)) throw Error('Unsafe transition');
    bot.advance(game);
    if (!restored && move.reason === 'Moving to a shorter food cycle' && game.steps % 300 === 0) {
      game = Game.restore(game.snapshot(), game.scores);
      bot = new AutoPlayer();
      restored = true;
    }
  }
  expect(restored).toBe(true);
  expect(game.score).toBe(160);
});
