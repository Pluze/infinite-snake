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
    if (length < 2 || length >= game.capacity) throw Error('Synthetic fixtures need two body cells and at least one free cell');
    const head = seed * 157 % game.capacity;
    const body = Array.from({ length }, (_, i) => cycle.point((head - length + 1 + i + cycle.size) % cycle.size));
    return Game.restore({
      ...game.snapshot(), autoCycle: cycle instanceof TorusCycle ? cycle.cells : undefined, body, food: [], travel: body[length - 1], direction: cycle.direction(body[length - 2]),
    }, [0]);
  }

  for (const wraparound of [false, true]) {
    const continuous = process.env.SNAKE_BENCH_CONTINUOUS === '1';
    const stepLimit = Number(process.env.SNAKE_BENCH_STEP_LIMIT ?? 2_000_000);
    for (const fill of (continuous ? [0] : process.env.SNAKE_BENCH_FILL ? process.env.SNAKE_BENCH_FILL.split(',').map(Number) : [0, .08, .5, .9, .98])) {
      for (const seed of (process.env.SNAKE_BENCH_SEEDS ?? '42,91,999').split(',').map(Number)) {
        const game = start(seed, wraparound, fill);
        const bot = new AutoPlayer();
        const meals = continuous ? Math.max(0, Math.ceil(game.capacity * Number(process.env.SNAKE_BENCH_UNTIL ?? .3)) - game.length)
          : Math.min(game.capacity - game.length, fill ? 16 : 100);
        let band = 1, bandStart = 0, bandPeakMs = 0, nextMoveMs = 0, escapeMoves = 0, longIntervals = 0;
        const startedAt = performance.now();
        const cpuStart = process.cpuUsage();
        let lastBite = 0, lowerBound = 0, slowMeals = 0, longestMeal = 0, peakMs = 0;
        while (game.score < meals * 10 && game.steps < stepLimit) {
          if (game.steps === lastBite) lowerBound += boardDistance(game, game.head, game.food.values().next().value);
          const started = performance.now();
          const move = bot.nextMove(game);
          const tookMs = performance.now() - started;
          peakMs = Math.max(peakMs, tookMs);
          bandPeakMs = Math.max(bandPeakMs, tookMs);
          nextMoveMs += tookMs;
          if (move.reason === 'Rejoining the safe cycle') escapeMoves++;
          if (!move.safe || move.direction === undefined || !game.step(move.direction)) {
            throw Error(`Unsafe move at step ${game.steps} (fill=${fill}, seed=${seed}, wrap=${wraparound})`);
          }
          bot.advance(game);
          if (game.score > game.scores.at(game.steps - 1)) {
            const distance = game.steps - lastBite;
            lastBite = game.steps;
            longestMeal = Math.max(longestMeal, distance);
            if (distance > 1024) { slowMeals++; longIntervals++; }
            if (continuous && game.length >= Math.ceil(game.capacity * band / 10)) {
              console.log(JSON.stringify({ wraparound, seed, band, steps: game.steps - bandStart,
                peakMs: +bandPeakMs.toFixed(2), nextMoveMs: +nextMoveMs.toFixed(2), escapeMoves, longIntervals }));
              band++;
              bandStart = game.steps;
              bandPeakMs = nextMoveMs = escapeMoves = longIntervals = 0;
            }
          }
        }
        if (game.score !== meals * 10) throw Error('Run exceeded the benchmark step budget');
        const elapsedMs = performance.now() - startedAt;
        const cpu = process.cpuUsage(cpuStart);
        console.log(JSON.stringify({ width: game.width, height: game.height, wraparound, fill, seed, meals, won: game.won,
          elapsedMs: +elapsedMs.toFixed(2), cpuMs: (cpu.user + cpu.system) / 1000, steps: game.steps, lowerBound,
          longestMeal, slowMeals, peakMs: Number(peakMs.toFixed(2)), movesPerSecond: Math.round(game.steps * 1000 / elapsedMs) }));
      }
    }
  }
} finally {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}
