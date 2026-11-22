// Run from a checkout with dependencies installed. An optional argument points
// to another revision's already-compiled Game.js, GridCycle.js, and AutoPlayer.js.
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const temporary = process.argv[2] ? undefined : mkdtempSync(join(tmpdir(), 'snake-benchmark-'));
const compiled = temporary ?? resolve(process.argv[2]);
try {
  if (temporary) {
    execFileSync(process.execPath, [
      'node_modules/typescript/bin/tsc', 'src/AutoPlayer.ts', '--target', 'es2020', '--module', 'commonjs',
      '--skipLibCheck', '--strict', '--outDir', compiled,
    ], { stdio: 'inherit' });
  }

  const { Game } = require(join(compiled, 'Game.js'));
  const { TorusCycle } = require(join(compiled, 'TorusCycle.js'));
  const { GridCycle } = require(join(compiled, 'GridCycle.js'));
  const { AutoPlayer } = require(join(compiled, 'AutoPlayer.js'));
  const { boardDistance } = require(join(compiled, 'RouteSearch.js'));

  function start(seed, wraparound, fill) {
    const game = new Game(seed, Number(process.env.SNAKE_BENCH_WIDTH ?? 256), Number(process.env.SNAKE_BENCH_HEIGHT ?? 256), wraparound);
    if (!fill) return game;
    const cycle = game.capacity < 8192
      ? new TorusCycle(game.width, game.height, undefined, wraparound)
      : new GridCycle(game.width, game.height, wraparound);
    const length = Math.floor(game.capacity * fill);
    const head = seed * 157 % game.capacity;
    const body = Array.from({ length }, (_, i) => cycle.point((head - length + 1 + i + cycle.size) % cycle.size));
    return Game.restore({
      ...game.snapshot(), autoCycle: cycle instanceof TorusCycle ? cycle.cells : undefined, body, food: [], travel: body[length - 1], direction: cycle.direction(body[length - 2]),
    }, [0]);
  }

  for (const wraparound of [false, true]) {
    for (const fill of (process.env.SNAKE_BENCH_FILL ? process.env.SNAKE_BENCH_FILL.split(',').map(Number) : [0, .08, .5, .9, .98])) {
      for (const seed of [42, 91, 999]) {
        const game = start(seed, wraparound, fill);
        const bot = new AutoPlayer();
        const meals = fill ? 16 : 100;
        const startedAt = performance.now();
        let lastBite = 0, lowerBound = 0, slowMeals = 0, longestMeal = 0, peakMs = 0;
        while (game.score < meals * 10 && game.steps < 2_000_000) {
          if (game.steps === lastBite) lowerBound += boardDistance(game, game.head, game.food.values().next().value);
          const started = performance.now();
          const move = bot.nextMove(game);
          peakMs = Math.max(peakMs, performance.now() - started);
          if (!move.safe || move.direction === undefined || !game.step(move.direction)) {
            throw Error(`Unsafe move at step ${game.steps} (fill=${fill}, seed=${seed}, wrap=${wraparound})`);
          }
          bot.advance(game);
          if (game.score > game.scores.at(game.steps - 1)) {
            const distance = game.steps - lastBite;
            lastBite = game.steps;
            longestMeal = Math.max(longestMeal, distance);
            if (distance > 1024) slowMeals++;
          }
        }
        if (game.score !== meals * 10) throw Error('Run exceeded the benchmark step budget');
        console.log(JSON.stringify({ wraparound, fill, seed, meals, steps: game.steps, lowerBound,
          longestMeal, slowMeals, peakMs: Number(peakMs.toFixed(2)), movesPerSecond: Math.round(game.steps * 1000 / (performance.now() - startedAt)) }));
      }
    }
  }
} finally {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}
