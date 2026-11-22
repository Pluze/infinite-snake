import { expect, it } from 'vitest';
import { AutoPlayer } from './AutoPlayer';
import { Game } from './Game';
import { GridCycle } from './GridCycle';
import { TorusCycle } from './TorusCycle';

it('indexes a closed, adjacent cycle on even and odd boards in both orientations', () => {
  const shapes = [
    [2, 3, false], [3, 2, false], [7, 8, false], [8, 7, false],
    [2, 5, true], [5, 2, true], [7, 7, true], [8, 7, true], [7, 8, true],
  ] as const;
  for (const [width, height, wraparound] of shapes) {
    const game = new Game(42, width, height, wraparound);
    const forward = new GridCycle(width, height, wraparound);
    expect(forward.ordered(game.body())).toBe(true);
    for (const cycle of [forward, forward.reversed(), forward.transposed(), forward.transposed().reversed()]) {
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
  const restored = Game.restore(game.snapshot(), game.scores);
  const move = new AutoPlayer().nextMove(restored);
  expect(move.safe).toBe(true);
  expect(move.direction).toBeDefined();
  expect(restored.step(move.direction)).toBe(true);
});

it('skips long row scans on sparse and half-full 256 by 256 boards', () => {
  const scenarios = [
    { wraparound: true, length: 312, food: { x: 157, y: 187 }, maxSteps: 200 },
    { wraparound: true, length: 32_768, food: { x: 157, y: 100 }, maxSteps: 100 },
    { wraparound: false, length: 32_768, food: { x: 157, y: 100 }, maxSteps: 100 },
  ];
  for (const { wraparound, length, food, maxSteps } of scenarios) {
    const game = new Game(42, 256, 256, wraparound);
    const cycle = new GridCycle(game.width, game.height, wraparound);
    const end = cycle.index({ x: 139, y: 21 });
    const body = Array.from({ length }, (_, i) => cycle.point((end - length + 1 + i + cycle.size) % cycle.size));
    const restored = Game.restore({
      ...game.snapshot(), body, food: [food], travel: body[length - 1], direction: cycle.direction(body[length - 2]),
    }, [0]);
    const bot = new AutoPlayer();
    const { path } = bot.preview(restored);
    if (!path || 'cycle' in path) throw Error('Expected a direct shortcut to the food');
    expect(path.points[path.points.length - 1]).toEqual(food);
    expect(path.directions.length).toBeLessThanOrEqual(maxSteps);
    for (const direction of path.directions) {
      expect(bot.nextMove(restored)).toMatchObject({ direction, safe: true });
      expect(restored.step(direction)).toBe(true);
      bot.advance(restored);
    }
    expect(restored.score).toBe(10);
    expect(cycle.ordered(restored.body())).toBe(true);
  }
});

it('uses short re-planned chases when a large body blocks the indexed cycle', () => {
  const game = new Game(91, 256, 256);
  const cycle = new GridCycle(game.width, game.height, true);
  const end = game.seed * 157 % game.capacity;
  const length = Math.floor(game.capacity * .08);
  const body = Array.from({ length }, (_, i) => cycle.point((end - length + 1 + i + cycle.size) % cycle.size));
  const restored = Game.restore({
    ...game.snapshot(), body, food: [], travel: body[length - 1], direction: cycle.direction(body[length - 2]),
  }, [0]);
  const bot = new AutoPlayer();
  while (restored.score < 160 && restored.steps < 36_000) {
    const move = bot.nextMove(restored);
    if (!move.safe || move.direction === undefined || !restored.step(move.direction)) throw Error('Autoplay lost its safe route');
    bot.advance(restored);
  }
  expect(restored.score).toBe(160);
});

it('fills a nearly full board after saving and resuming autoplay', () => {
  for (const wraparound of [true, false]) {
    let game = new Game(42, 256, 256, wraparound);
    const cycle = new GridCycle(game.width, game.height, wraparound);
    const body = Array.from({ length: game.capacity - 65 }, (_, i) => cycle.point(i));
    game = Game.restore({
      ...game.snapshot(), body, food: [], travel: body[body.length - 1], direction: cycle.direction(body[body.length - 2]),
    }, [0]);
    let bot = new AutoPlayer();
    while (!game.won && game.steps < 2400) {
      const move = bot.nextMove(game);
      if (!move.safe || move.direction === undefined || !game.step(move.direction)) throw Error('Autoplay lost its safe route');
      bot.advance(game);
      if (game.score === 100 && game.score !== game.scores.at(game.steps - 1)) {
        game = Game.restore(game.snapshot(), game.scores);
        bot = new AutoPlayer();
      }
    }
    expect(game.won).toBe(true);
    expect(game.length).toBe(game.capacity);
  }
});

it('reduces detours when continuing a legacy 96 by 64 wall-board save', () => {
  const game = new Game(42, 96, 64, false);
  const cycle = new TorusCycle(game.width, game.height, undefined, false);
  const length = Math.floor(game.capacity * .24);
  const head = game.seed * 157 % game.capacity;
  const body = Array.from({ length }, (_, i) => cycle.point((head - length + 1 + i + cycle.size) % cycle.size));
  const restored = Game.restore({
    ...game.snapshot(), autoCycle: cycle.cells, body, food: [], travel: body[length - 1], direction: cycle.direction(body[length - 2]),
  }, [0]);
  const bot = new AutoPlayer();
  while (restored.score < 160 && restored.steps < 8000) {
    const move = bot.nextMove(restored);
    if (!move.safe || move.direction === undefined || !restored.step(move.direction)) throw Error('Autoplay lost its safe route');
    bot.advance(restored);
  }
  expect(restored.score).toBe(160);
});

it('executes delayed shortcuts after the tail releases a gap', () => {
  const game = new Game(91, 255, 256, true);
  const cycle = new GridCycle(game.width, game.height, true);
  const length = game.capacity / 2;
  const end = game.seed * 157 % game.capacity;
  const body = Array.from({ length }, (_, i) => cycle.point((end - length + 1 + i + cycle.size) % cycle.size));
  const restored = Game.restore({ ...game.snapshot(), body, food: [], travel: body[length - 1],
    direction: cycle.direction(body[length - 2]) }, [0]);
  const bot = new AutoPlayer();
  let waited = false;
  while (restored.score < 160 && restored.steps < 250_000) {
    const move = bot.nextMove(restored);
    waited ||= move.reason === 'Waiting for the tail to clear the food';
    if (!move.safe || move.direction === undefined || !restored.step(move.direction)) throw Error('Delayed shortcut collided');
    bot.advance(restored);
  }
  expect(waited).toBe(true);
  expect(restored.score).toBe(160);
});
