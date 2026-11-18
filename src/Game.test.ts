import { describe, expect, it } from 'vitest';
import { Direction, Game, key, Point } from './Game';
import { AutoPlayer } from './AutoPlayer';
import { TorusCycle } from './TorusCycle';
import { Persistence } from './Persistence';
import 'fake-indexeddb/auto';
function fixture(body: Point[], direction: Direction, food: Point[] = [], width = 8, height = 8) {
  const s = new Game(42, width, height).snapshot();
  return Game.restore({ ...s, body, travel: body[body.length - 1], direction, food }, [0]);
}
describe('finite torus rules', () => {
  it('accepts both dimension limits and restores a one-cell win', () => {
    for (const wraparound of [true, false]) {
      const tiny = new Game(42, 1, 1, wraparound);
      expect(tiny.won).toBe(true);
      expect(tiny.food.size).toBe(0);
      expect(Game.restore(tiny.snapshot(), tiny.scores).snapshot()).toEqual(tiny.snapshot());
      const large = new Game(42, 256, 256, wraparound);
      expect(large.capacity).toBe(65536);
      expect(large.food.size).toBe(1);
    }
    expect(() => new Game(42, 0, 8)).toThrow();
    expect(() => new Game(42, 8, 257)).toThrow();
  });
  it('wraps in all four directions and aliases repeated coordinates', () => {
    const g = new Game(42);
    expect(g.next({x:63,y:10},0)).toEqual({x:0,y:10});
    expect(g.next({x:0,y:10},2)).toEqual({x:63,y:10});
    expect(g.next({x:10,y:47},1)).toEqual({x:10,y:0});
    expect(g.next({x:10,y:0},3)).toEqual({x:10,y:47});
    const food=[...g.food.values()][0]; expect(g.hasFood({x:food.x+128,y:food.y-96})).toBe(true);
    expect(g.wrap({x:-1,y:-1})).toEqual({x:63,y:47});
  });
  it('crosses each seam while travel stays continuous for the camera', () => {
    for (const [head,d,expected] of [[{x:7,y:3},0,{x:0,y:3}],[{x:0,y:3},2,{x:7,y:3}],[{x:3,y:7},1,{x:3,y:0}],[{x:3,y:0},3,{x:3,y:7}]] as [Point,Direction,Point][]) {
      const reverse=((d+2)%4) as Direction, base=new Game(42,8,8), tail=base.next(head,reverse), g=fixture([tail,head],d);
      expect(g.step(d)).toBe(true); expect(g.head).toEqual(expected);
      expect(Math.abs(g.travel.x-head.x)+Math.abs(g.travel.y-head.y)).toBe(1);
      expect(g.wrap(g.travel)).toEqual(g.head);
    }
  });
  it('ends a walled run at the border and restores the same board rules', () => {
    const game = new Game(42, 8, 8, false);
    expect(game.next(game.head, 3)).toEqual({ x: 5, y: -1 });
    expect(game.canMove(3)).toBe(false);
    expect(game.step(3)).toBe(false);
    expect(game.head).toEqual({ x: 5, y: 0 });
    const restored = Game.restore(game.snapshot(), game.scores);
    expect(restored.wraparound).toBe(false);
    expect(restored.hitWall).toBe(true);
    expect(restored.dead).toBe(true);
  });
  it('collides with the same body across a seam', () => {
    const g=fixture([{x:1,y:0},{x:0,y:0},{x:0,y:1},{x:7,y:1},{x:7,y:0}],3);
    expect(g.canMove(0)).toBe(false); expect(g.step(0)).toBe(false); expect(g.dead).toBe(true);
  });
  it('ignores reversals and allows entry into a vacating tail', () => {
    const g = new Game(42); expect(g.step(2)).toBe(true); expect(g.head.x).toBe(6);
    const tail=fixture([{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],2);
    expect(tail.step(3)).toBe(true); expect(tail.occupied.size).toBe(4); expect(tail.occupied.has('0,0')).toBe(true);
  });
  it('respawns a single food on an unoccupied cell after eating', () => {
    const g=new Game(42); expect(g.food.size).toBe(1);
    const next=g.next(g.head,0); g.food.delete(g.food.keys().next().value!); g.food.set(key(next),next);
    expect(g.step()).toBe(true); expect(g.length).toBe(7); expect(g.score).toBe(10);
    expect(g.food.size).toBe(Number(!g.won)); expect([...g.food.keys()].every(k=>!g.occupied.has(k))).toBe(true);
    expect(new Game(42).snapshot()).toEqual(new Game(42).snapshot());
  });
  it('keeps one food and retains progress when loading a legacy multi-food save', () => {
    const snapshot = new Game(42).snapshot();
    const legacy = { ...snapshot, density: .04, food: [{ x: 6, y: 4 }, { x: 1, y: 7 }] };
    const restored = Game.restore(legacy, [0]);
    expect(restored.snapshot()).toEqual({ ...snapshot, food: [legacy.food[0]] });
  });
  it('wins when the final free cell is filled, instead of looping forever', () => {
    const cycle:Point[]=[];for(let y=0;y<8;y++)for(let n=0;n<8;n++)cycle.push({x:y%2?7-n:n,y});
    const g=fixture(cycle.slice(0,-1),2,[cycle[63]]);
    expect(g.step(2)).toBe(true);expect(g.won).toBe(true);expect(g.dead).toBe(false);expect(g.food.size).toBe(0);expect(g.step()).toBe(false);
  });
  it('keeps a small world bounded over many wraps', () => {
    const g=new Game(42,8,8);g.food.clear();
    for(let i=0;i<1000;i++){g.food.clear();expect(g.step()).toBe(true);expect(g.head.x).toBe((5+i+1)%8);expect(g.occupied.size).toBe(6);}
    expect(g.travel.x).toBe(1005);
  });
});
describe('torus autoplay', () => {
  it('takes one-step wrapped food routes when they preserve the safe body order', () => {
    const cycle = new TorusCycle(8,8), reference = new Game(42,8,8);
    for (const direction of [0,1,2,3] as Direction[]) {
      let checked = false;
      for (let headIndex=0;headIndex<64&&!checked;headIndex++) {
        const body=Array.from({length:6},(_,i)=>cycle.cells[(headIndex-5+i+64)%64]);
        const head=body[5], target=reference.next(head,direction);
        const crosses=Math.abs(head.x-target.x)>1||Math.abs(head.y-target.y)>1;
        const facing=cycle.direction(body[4]);
        if(!crosses||direction===(facing+2)%4||body.some(p=>key(p)===key(target)))continue;
        const g=fixture(body,facing,[target]), plan=new AutoPlayer().preview(g);
        expect(plan.directions).toEqual([direction]);expect(plan.points).toEqual([target]);expect(plan.safe).toBe(true);checked=true;
      }
      expect(checked).toBe(true);
    }
  });
  it('can take a longer safe route when it makes the next meal cheaper', () => {
    const body = [4, 5, 6, 7].map(x => ({ x, y: 0 }));
    const food = { x: 2, y: 6 };
    const game = fixture(body, 0, [food]);
    const plan = new AutoPlayer().preview(game);
    const cycle = new TorusCycle(8, 8);
    const cost = (directions: Direction[]) => {
      const result = fixture(body, 0, [food]);
      for (const direction of directions) expect(result.step(direction)).toBe(true);
      expect(result.head).toEqual(food);
      expect(result.length).toBe(body.length + 1);
      expect(cycle.ordered(result.body())).toBe(true);
      const free = cycle.cells.filter(p => !result.occupied.has(key(p)));
      return directions.length + free.reduce((sum, p) => sum + cycle.distance(food, p), 0) / free.length;
    };
    const shorter: Direction[] = [0, 0, 0, 3, 3];
    expect(plan.safe).toBe(true);
    expect(plan.directions.length).toBeGreaterThan(shorter.length);
    expect(cost(plan.directions)).toBeLessThan(cost(shorter));
  });
  it('grows on three seeded toruses without making an illegal suggested move', () => {
    for(const seed of [1,42,999]) {
      const g=new Game(seed),bot=new AutoPlayer();
      for(let i=0;i<3000&&!g.won;i++) {
        const p=bot.preview(g);if(!p.safe)break;
        expect(p.directions.length).toBeGreaterThan(0);expect(g.canMove(p.directions[0])).toBe(true);
        expect(g.step(p.directions[0])).toBe(true);bot.advance(g);
        expect(g.occupied.size).toBe(g.length);expect(g.food.size).toBe(Number(!g.won));
      }
      expect(g.score).toBeGreaterThan(100);expect(g.dead).toBe(false);
    }
  },30000);
});
describe('torus persistence',()=>{
  it('atomically restores food, RNG, travel and history, then continues identically',async()=>{
    const p=new Persistence();await p.open();await p.clear();const g=new Game(42),bot=new AutoPlayer();
    for(let i=0;i<1100;i++){const plan=bot.preview(g);if(!plan.safe)break;g.step(plan.directions[0]);bot.advance(g);if(i===500)await p.save(g);}
    await p.save(g);const loaded=(await p.load(()=>{}))!;
    expect(loaded.snapshot()).toEqual(g.snapshot());expect(loaded.scores).toEqual(g.scores);
    const d=bot.preview(g).directions[0];g.step(d);loaded.step(d);expect(loaded.snapshot()).toEqual(g.snapshot());
    await p.clear();expect(await p.load(()=>{})).toBeUndefined();
  });
});
