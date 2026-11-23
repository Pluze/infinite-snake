import { expect, it } from 'vitest';
import { Game } from './Game';
import { GridCycle } from './GridCycle';
import { AutoPlayer } from './AutoPlayer';
import { bridgeLength } from './CycleBridge';
import { shortestFinish } from './Endgame';
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
  for (const growth of [false, true]) for (const wrap of [false, true]) for (const seed of [7, 42, 113]) {
    const game = new Game(seed, 16, 12, wrap);
    while (!game.won) {
      const route = tileRoute(game, growth);
      if (!route?.directions.length) throw Error('Lost the spanning cycle');
      const score = game.score;
      for (const d of route.directions) {
        if (!game.canMove(d) || !game.step(d)) throw Error('Invalid certified path');
      }
      expect(game.score).toBeGreaterThan(score);
    }
  }
});

it('chooses a seven-step branch across a walled board', () => {
  const initial = new Game(6, 8, 6, false);
  const cycle = new GridCycle(8, 6, false);
  const body = Array.from({ length: 15 }, (_, i) => cycle.point(30 + i));
  const food = { x: 6, y: 3 };
  const game = Game.restore({ ...initial.snapshot(), body, food: [food], travel: body[14],
    direction: cycle.direction(body[13]) }, [0]);
  const route = tileRoute(game);
  if (!route) throw Error('Expected a certified food route');
  const minimum = Math.abs(game.head.x - food.x) + Math.abs(game.head.y - food.y);
  expect(route.directions.length).toBe(minimum);
  for (const d of route.directions) expect(game.step(d)).toBe(true);
  expect(game.score).toBe(10);
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

it('resumes the same certified lane at multiple points in a half-full game', () => {
  for (const seed of [91, 113]) {
    let game = savedBoard(seed, 256, 256, true);
    let bot = new AutoPlayer(), restored = 0;
    while (game.steps < 80_000 && game.score < 160) {
      const move = bot.nextMove(game);
      if (game.autoBridge && game.steps % 300 === 0 && restored < 3) {
        const saved = game.snapshot();
        game = Game.restore(saved, game.scores);
        bot = new AutoPlayer();
        expect(bot.nextMove(game)).toEqual(move);
        expect(game.autoBridge).toEqual(saved.autoBridge);
        restored++;
      }
      if (!move.safe || move.direction === undefined || !game.step(move.direction)) throw Error('Unsafe transition');
      bot.advance(game);
    }
    expect(restored).toBe(3);
    expect(game.score).toBe(160);
    if (seed === 113) expect(game.steps).toBeLessThan(40_000);
  }
});

it('shows the full route to the current food across a scheduled replan', () => {
  const game = savedBoard(21, 96, 64, false);
  const bot = new AutoPlayer();
  const { path } = bot.preview(game);
  if (!path || 'cycle' in path) throw Error('Expected an explicit food route');
  expect(path.points[path.end - 1]).toEqual(game.food.values().next().value);
  const fork = game.forkForPlanning();
  for (let i = path.cursor; i < path.end; i++) expect(fork.step(path.directions[i])).toBe(true);
  expect(fork.score).toBeGreaterThan(game.score);
});

it('matches an independent shortest-win search with real steps and food respawns', () => {
  for (const [wrap, seed, start] of [[false, 2, 1], [true, 1, 0]] as const) {
    const initial = new Game(seed, 6, 4, wrap);
    const cycle = new GridCycle(6, 4, wrap);
    const body = Array.from({ length: 18 }, (_, i) => cycle.point((start + i) % 24));
    const game = Game.restore({ ...initial.snapshot(), body, travel: body[17],
      direction: cycle.direction(body[16]), food: [] }, [0]);
    const route = shortestFinish(game);
    if (!route) throw Error('Expected a winning suffix');
    let layer = [game];
    for (let depth = 0; depth <= route.directions.length; depth++) {
      expect(layer.some(state => state.won)).toBe(depth === route.directions.length);
      if (depth === route.directions.length) break;
      const next: Game[] = [];
      for (const state of layer) for (const d of [0, 1, 2, 3] as const) {
        if (!state.canMove(d)) continue;
        const branch = state.forkForPlanning();
        branch.step(d);
        next.push(branch);
      }
      layer = next;
    }
    const bot = new AutoPlayer();
    for (const direction of route.directions) {
      expect(bot.nextMove(game)).toMatchObject({ direction, safe: true });
      expect(game.step(direction)).toBe(true);
      bot.advance(game);
    }
    expect(game.won).toBe(true);
  }
});
