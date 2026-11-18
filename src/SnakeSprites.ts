import { Direction, Point, vectors } from './Game';

const resolution = 16;
const bodyRadius = .32;

type Tile =
  | { kind: 'body'; back: Direction; front: Direction }
  | { kind: 'head' | 'tail'; facing: Direction };

export class SnakeSprites {
  private cache = new Map<string, HTMLCanvasElement>();

  get(tile: Tile, dead: boolean) {
    const key = tile.kind === 'body'
      ? `body:${tile.back}:${tile.front}`
      : `${tile.kind}:${tile.facing}:${dead}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = resolution;
    const ctx = sprite.getContext('2d')!;
    const facing = vectors[tile.kind === 'body' ? tile.front : tile.facing];
    const back = tile.kind === 'body' ? vectors[tile.back] : undefined;
    const bend = back && back.x * facing.x + back.y * facing.y === 0;
    const fill = dead ? '#e39b83' : '#69ca90';
    const outline = dead ? '#9f594c' : '#357b59';

    for (let row = 0; row < resolution; row++) {
      for (let col = 0; col < resolution; col++) {
        const x = (col + .5) / resolution - .5;
        const y = (row + .5) / resolution - .5;
        const forward = x * facing.x + y * facing.y;
        const across = y * facing.x - x * facing.y;
        const side = Math.abs(across);
        let rim: number;
        if (tile.kind === 'tail') {
          const width = Math.min(bodyRadius, Math.max(0, (forward + .42) * .64));
          rim = width - side;
        } else if (tile.kind === 'head') {
          // A broad forehead with clipped corners and a chin that joins the neck.
          const width = forward < -.22 ? bodyRadius : .39;
          rim = Math.min(width - side, .45 - forward, .66 - forward - side);
        } else if (bend && back) {
          const backward = x * back.x + y * back.y;
          const radius = Math.hypot(.5 - forward, .5 - backward);
          rim = bodyRadius - Math.abs(radius - .5);
        } else {
          rim = bodyRadius - side;
        }
        if (rim < 0) continue;

        const eye = tile.kind === 'head' && forward >= .04 && forward < .25 && side >= .13 && side < .30;
        const pupil = eye && forward >= .12 && side < .26;
        const edge = rim < .07;
        ctx.fillStyle = pupil ? '#122725' : eye ? '#fff2ce' : edge ? outline : fill;
        ctx.fillRect(col, row, 1, 1);
      }
    }
    this.cache.set(key, sprite);
    return sprite;
  }
}

export function toward(from: Point, to: Point, width: number, height: number): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // With two cells on an axis both directions reach the same neighbor.
  // Pick the edge inside the canonical board so the two sprites meet.
  if (dx !== 0) return dx === 1 || (width > 2 && dx === 1 - width) ? 0 : 2;
  return dy === 1 || (height > 2 && dy === 1 - height) ? 1 : 3;
}
