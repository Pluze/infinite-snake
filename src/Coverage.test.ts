import { expect, it } from 'vitest';
import { Game, key } from './Game';
import { AutoPlayer } from './AutoPlayer';
import { TorusCycle } from './TorusCycle';
it('constructs a single adjacent cycle for even and odd rectangular toruses',()=>{
 for(const [w,h] of [[1,2],[2,1],[1,9],[9,1],[2,2],[2,3],[3,2],[3,3],[8,8],[13,9],[12,9],[9,12],[32,24],[64,48],[256,255]]){
  const cycle=new TorusCycle(w,h),g=new Game(1,w,h);
  expect(new Set(cycle.cells.map(key)).size).toBe(w*h);expect(cycle.ordered(g.body())).toBe(true);
  for(let i=0;i<cycle.cells.length;i++)expect(g.next(cycle.cells[i],cycle.direction(cycle.cells[i]))).toEqual(cycle.cells[(i+1)%cycle.cells.length]);
 }
});
it('fills the board safely and uses fewer aggregate moves than cycle-only play',()=>{
 let optimizedTotal=0,baselineTotal=0;
 for(const [w,h] of [[8,8],[13,9],[16,12]])for(const seed of [1,42,999]){
  const g=new Game(seed,w,h),bot=new AutoPlayer(),cycle=new TorusCycle(w,h);
  const max=w*h*w*h*2;
  while(!g.won&&g.steps<max){const plan=bot.preview(g);expect(plan.safe).toBe(true);expect(plan.directions.length).toBeGreaterThan(0);expect(g.step(plan.directions[0])).toBe(true);bot.advance(g);if(g.won || g.score !== g.scores[g.steps - 1])expect(new TorusCycle(w,h,g.autoCycle).ordered(g.body())).toBe(true);}
  expect(g.won).toBe(true);expect(g.dead).toBe(false);optimizedTotal+=g.steps;
  const baseline=new Game(seed,w,h);
  while(!baseline.won&&baseline.steps<max)expect(baseline.step(cycle.direction(baseline.head))).toBe(true);
  expect(baseline.won).toBe(true);baselineTotal+=baseline.steps;
  console.info(`coverage ${w}x${h} seed=${seed}: optimized=${g.steps}, cycle=${baseline.steps}`);
 }
 console.info(`coverage totals: optimized=${optimizedTotal}, cycle=${baselineTotal}`);
 expect(optimizedTotal).toBeLessThan(baselineTotal);
},60000);

function foodEfficiencyArea(capacity: number, steps: number[]) {
  let area = 0;
  let previousLength = 6;
  for (const [band, step] of steps.entries()) {
    const length = Math.ceil(capacity * (band + 1) / 10);
    // Each band spans 0.1 of board occupancy. Its rate is food per 100 moves.
    area += (length - previousLength) * 10 / (step - (steps[band - 1] ?? 0));
    previousLength = length;
  }
  return area;
}

it('improves efficiency AUC while still filling each benchmark board safely', () => {
  // Cumulative steps at each 10% checkpoint from the published planner (384fa6b).
  const runs = [
    { width: 32, height: 24, seed: 42, wrap: true, previous: [1694,3982,8491,13756,19500,24906,29974,33941,37145,38274] },
    { width: 64, height: 48, seed: 42, wrap: true, previous: [20431,59493,114962,205131,287950,356393,439094,498613,542621,559048] },
    { width: 31, height: 23, seed: 91, wrap: true, previous: [1699,4496,8848,13730,19558,25392,30595,35249,37913,38970] },
    { width: 48, height: 32, seed: 41, wrap: false, previous: [9147,22471,44822,75950,101588,123016,142622,159362,171183,175638] },
  ];
  for (const { width, height, seed, wrap, previous } of runs) {
    const game = new Game(seed, width, height, wrap);
    const bot = new AutoPlayer();
    const steps: number[] = [];
    while (!game.won && game.steps < previous[9]) {
      const plan = bot.preview(game);
      if (!plan.safe || !game.step(plan.directions[0])) throw Error('Autoplay lost its safe route');
      bot.advance(game);
      if (game.length >= Math.ceil(game.capacity * (steps.length + 1) / 10)) steps.push(game.steps);
    }
    expect(game.won).toBe(true);
    expect(game.autoCycle).toBeDefined();
    const restoredCycle = new TorusCycle(width, height, game.autoCycle, wrap);
    expect(restoredCycle.cells).toEqual(game.autoCycle);
    expect(restoredCycle.ordered(game.body())).toBe(true);
    expect(steps).toHaveLength(10);
    expect(game.steps).toBeLessThan(previous[9]);
    expect(foodEfficiencyArea(game.capacity, steps)).toBeGreaterThan(foodEfficiencyArea(game.capacity, previous));
  }
}, 60000);

it('fills walled boards with at least one even dimension and steers safely on odd boards', () => {
  for (const [width, height] of [[8, 8], [8, 9], [9, 8], [9, 9]]) {
    const game = new Game(42, width, height, false);
    const bot = new AutoPlayer();
    const canCycle = width % 2 === 0 || height % 2 === 0;
    while (!game.won && game.steps < (canCycle ? game.capacity ** 2 : 40)) {
      const plan = bot.preview(game);
      expect(plan.safe).toBe(true);
      expect(game.step(plan.directions[0])).toBe(true);
      bot.advance(game);
    }
    expect(game.score).toBeGreaterThan(0);
    expect(game.hitWall).toBe(false);
    if (canCycle) expect(game.won).toBe(true);
  }
});

it('plays through tiny wraparound boards without trying to move onto the head', () => {
  for (const [width, height] of [[1, 2], [2, 1], [1, 9], [9, 1], [2, 2], [2, 3], [3, 2], [3, 3]]) {
    const game = new Game(42, width, height);
    const bot = new AutoPlayer();
    while (!game.won && game.steps < game.capacity ** 2) {
      const plan = bot.preview(game);
      expect(plan.safe).toBe(true);
      expect(game.step(plan.directions[0])).toBe(true);
      bot.advance(game);
    }
    expect(game.won).toBe(true);
  }
});

it('fills two-cell-wide and two-cell-high boards without getting trapped', () => {
  for (const span of [2, 3, 9, 31, 128, 256]) {
    for (const [width, height] of [[2, span], [span, 2]]) {
      for (const wraparound of [true, false]) {
        const game = new Game(42, width, height, wraparound);
        const bot = new AutoPlayer();
        while (!game.won && game.steps < game.capacity ** 2) {
          const move = bot.nextMove(game);
          if (!move.safe || !game.step(move.direction)) throw Error(`Autoplay failed on ${width}×${height}, wrap=${wraparound}`);
          bot.advance(game);
        }
        expect(game.won).toBe(true);
      }
    }
  }
});

it('reaches the first 100 meals quickly on a 256 by 256 board', () => {
  // The published planner used 63,660 wrapped and 74,938 walled steps.
  for (const wraparound of [true, false]) {
    const game = new Game(42, 256, 256, wraparound);
    const bot = new AutoPlayer();
    while (game.score < 1000 && game.steps < 30_000) {
      const move = bot.nextMove(game);
      if (!move.safe || !game.step(move.direction)) throw Error('Autoplay lost its safe route');
      bot.advance(game);
    }
    expect(game.score).toBe(1000);
    expect(game.steps).toBeLessThan(30_000);
  }
});
