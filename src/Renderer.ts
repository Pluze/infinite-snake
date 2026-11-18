import { add, Direction, Game, Point, vectors } from './Game';
import { Plan } from './AutoPlayer';
import { SnakeSprites, toward } from './SnakeSprites';
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private snakeSprites = new SnakeSprites();
  x = 0; y = 0; scale = 24; follow = true; autozoom = true; manualUntil = 0;
  width = 0; height = 0;
  private last = performance.now();
  onCameraChange = () => {};
  manual = true;
  onSteer: (d: Direction) => void = () => {};
  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize(); window.addEventListener('resize', () => this.resize());
    const pointers = new Map<number, { x: number; y: number }>();
    let touchStart: { x: number; y: number } | undefined, pinched = false;
    canvas.addEventListener('pointerdown', e => { if (e.button > 1) return; canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (e.pointerType === 'touch') { if (pointers.size === 1) { touchStart = { x: e.clientX, y: e.clientY }; pinched = false; } else pinched = true; } });
    canvas.addEventListener('pointermove', e => {
      const old = pointers.get(e.pointerId); if (!old) return;
      const current = { x: e.clientX, y: e.clientY };
      if (pointers.size === 2) {
        const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)![1];
        const before = Math.hypot(old.x - other.x, old.y - other.y), after = Math.hypot(current.x - other.x, current.y - other.y);
        if (before > 0) this.zoom(after / before, (current.x + other.x) / 2, (current.y + other.y) / 2);
      } else if (!(e.pointerType === 'touch' && this.manual)) { this.x -= (e.clientX - old.x) / this.scale; this.y -= (e.clientY - old.y) / this.scale; this.hold(); }
      pointers.set(e.pointerId, current);
    });
    const release = (e: PointerEvent) => {
      if (e.type === 'pointerup' && e.pointerType === 'touch' && this.manual && touchStart && !pinched) {
        const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 18) this.onSteer(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 0 : 2 : dy > 0 ? 1 : 3);
      }
      pointers.delete(e.pointerId); if (!pointers.size) touchStart = undefined;
    };
    canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
        : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? this.height : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      const pinch = e.ctrlKey || e.metaKey;
      if (dy && (pinch || (!e.shiftKey && Math.abs(dy) >= Math.abs(dx)))) {
        const delta = Math.max(-200, Math.min(200, dy));
        this.zoom(Math.exp(-delta * (pinch ? .012 : .003)), e.clientX, e.clientY);
      } else if (dx || dy) {
        this.x += (e.shiftKey && !dx ? dy : dx) / this.scale;
        if (!e.shiftKey) this.y += dy / this.scale;
        this.hold();
      }
    }, { passive: false });
  }
  private resize() {
    this.width = innerWidth; this.height = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr); this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.ctx.imageSmoothingEnabled = false;
  }
  private hold() { this.manualUntil = performance.now() + 4500; this.onCameraChange(); }
  zoom(factor: number, sx = this.width / 2, sy = this.height / 2) {
    const old = this.scale; this.scale = Math.min(56, Math.max(5, this.scale * factor));
    this.x += (sx - this.width / 2) * (1 / old - 1 / this.scale);
    this.y += (sy - this.height / 2) * (1 / old - 1 / this.scale);
    this.autozoom = false; this.hold();
  }
  recenter(game: Game, immediate = false) { this.follow = true; this.manualUntil = 0; if (immediate) { this.x = game.travel.x; this.y = game.travel.y; } this.onCameraChange(); }
  render(game: Game, plan: Plan, overlay: boolean, running: boolean, auto: boolean) {
    const now = performance.now(), dt = Math.min((now - this.last) / 1000, .1); this.last = now;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const blend = reduced ? 1 : 1 - Math.exp(-dt * 5);
    const first = plan.points[0];
    const routeStart = first?.x === game.head.x && first.y === game.head.y ? 1 : 0;
    if (this.follow && now > this.manualUntil) {
      const lead = running ? 3 : 1;
      const heading = vectors[game.direction];
      let lookX = heading.x * lead;
      let lookY = heading.y * lead;
      // Follow the upcoming bend rather than jumping the camera lead on a turn.
      if (auto && running && !reduced && plan.directions.length > routeStart) {
        lookX = 0;
        lookY = 0;
        for (const direction of plan.directions.slice(routeStart, routeStart + 5)) {
          lookX += vectors[direction].x * .7;
          lookY += vectors[direction].y * .7;
        }
      }
      const targetX = game.travel.x + lookX + (this.width > 800 ? 2 : 0);
      const targetY = game.travel.y + lookY + (this.width > 800 ? 0 : -1);
      const distance = Math.hypot(targetX - this.x, targetY - this.y);
      const catchup = distance * this.scale > Math.min(this.width, this.height) * .45 ? Math.max(.55, blend) : blend;
      this.x += (targetX - this.x) * catchup; this.y += (targetY - this.y) * catchup;
      if (this.autozoom) {
        const target = Math.max(8, Math.min(this.width < 800 ? 22 : 26, 30 / Math.pow(game.length / 6, .14)));
        this.scale += (target - this.scale) * (1 - Math.exp(-dt * 1.4));
      }
    }
    const ctx = this.ctx, s = this.scale, w = this.width, h = this.height;
    ctx.fillStyle = game.wraparound ? '#101915' : '#080e0b'; ctx.fillRect(0, 0, w, h);
    const screen = (x: number, y: number) => ({ x: (x - this.x) * s + w / 2, y: (y - this.y) * s + h / 2 });
    const left = Math.floor(this.x - w / s / 2) - 1, right = Math.ceil(this.x + w / s / 2) + 1;
    const top = Math.floor(this.y - h / s / 2) - 1, bottom = Math.ceil(this.y + h / s / 2) + 1;
    const wall = screen(-.5, -.5);
    if (!game.wraparound) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(wall.x, wall.y, game.width * s, game.height * s);
      ctx.clip();
      ctx.fillStyle = '#101915';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.strokeStyle = '#1d2b22'; ctx.lineWidth = 1; ctx.beginPath();
    const grid = s < 10 ? 4 : 1;
    for (let x = Math.floor(left / grid) * grid; x <= right; x += grid) { const p = screen(x - .5, 0); ctx.moveTo(Math.round(p.x) + .5, 0); ctx.lineTo(Math.round(p.x) + .5, h); }
    for (let y = Math.floor(top / grid) * grid; y <= bottom; y += grid) { const p = screen(0, y - .5); ctx.moveTo(0, Math.round(p.y) + .5); ctx.lineTo(w, Math.round(p.y) + .5); }
    ctx.stroke();
    if (game.wraparound) {
      // The view is a tiled cover of one finite torus. Every copy shares one state.
      ctx.strokeStyle = '#527448'; ctx.setLineDash([4, 7]); ctx.beginPath();
      for (let x = Math.ceil(left / game.width) * game.width; x <= right; x += game.width) { const p = screen(x - .5, 0); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, h); }
      for (let y = Math.ceil(top / game.height) * game.height; y <= bottom; y += game.height) { const p = screen(0, y - .5); ctx.moveTo(0, p.y); ctx.lineTo(w, p.y); }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '10px monospace'; ctx.fillStyle = '#6a8d60'; ctx.textAlign = 'left';
      for (let x = Math.ceil(left / game.width) * game.width; x <= right; x += game.width) for (let y = Math.ceil(top / game.height) * game.height; y <= bottom; y += game.height) { const p = screen(x, y); ctx.fillText(`WRAP · ${game.width} × ${game.height}`, p.x + 4, p.y + 12); }
    }
    const copies = (p: Point, draw: (x: number, y: number) => void) => {
      if (!game.wraparound) {
        if (game.contains(p) && p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) {
          const pos = screen(p.x, p.y);
          draw(pos.x, pos.y);
        }
        return;
      }
      for (let tx = Math.ceil((left - p.x) / game.width); tx <= Math.floor((right - p.x) / game.width); tx++)
        for (let ty = Math.ceil((top - p.y) / game.height); ty <= Math.floor((bottom - p.y) / game.height); ty++) {
          const pos = screen(p.x + tx * game.width, p.y + ty * game.height); draw(pos.x, pos.y);
        }
    };
    const foodPulse = running && !reduced ? (1 + Math.sin(now / 230)) / 2 : .5;
    for (const f of game.food.values()) copies(f, (x, y) => {
      const radius = s * .3;
      ctx.fillStyle = '#f4b37c'; ctx.shadowColor = '#ec9e60'; ctx.shadowBlur = s > 10 ? 5 + foodPulse * 8 : 0;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2); ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffe2b6'; ctx.fillRect(x - radius, y - radius, radius * .8, radius * .65);
      ctx.fillStyle = '#9cc880'; ctx.fillRect(x, y - radius - s * .12, s * .17, s * .12);
    });
    if (overlay && plan.directions.length > routeStart) {
      // Lift each step to adjacent display coordinates so seam routes never span the map.
      const route: Point[] = [game.head];
      for (const d of plan.directions.slice(routeStart)) route.push(add(route[route.length - 1], d));
      for (let tx = game.wraparound ? Math.floor(left / game.width) - 1 : 0; tx <= (game.wraparound ? Math.ceil(right / game.width) + 1 : 0); tx++)
        for (let ty = game.wraparound ? Math.floor(top / game.height) - 1 : 0; ty <= (game.wraparound ? Math.ceil(bottom / game.height) + 1 : 0); ty++) {
          ctx.strokeStyle = '#b5e69b80'; ctx.lineWidth = Math.max(1, s * .07); ctx.setLineDash([s * .15, s * .2]); ctx.beginPath();
          route.forEach((p, i) => { const sp = screen(p.x + tx * game.width, p.y + ty * game.height); if (i) ctx.lineTo(sp.x, sp.y); else ctx.moveTo(sp.x, sp.y); });
          ctx.stroke(); ctx.setLineDash([]);
        }
      const target = plan.points[plan.points.length - 1];
      if (target && game.hasFood(target)) copies(target, (x, y) => { ctx.strokeStyle = '#f7c795'; ctx.lineWidth = 1; ctx.strokeRect(x - s * .48, y - s * .48, s * .96, s * .96); });
    }
    const body = game.body();
    for (const [index, point] of body.entries()) {
      const previous = body[index - 1];
      const next = body[index + 1];
      copies(point, (x, y) => {
        const back = previous && toward(point, previous, game.width, game.height);
        const front = next && toward(point, next, game.width, game.height);
        const headAxisSize = game.direction % 2 === 0 ? game.width : game.height;
        const facing = back !== undefined && headAxisSize === 2 ? (back + 2) % 4 as Direction : game.direction;
        const tile = back !== undefined && front !== undefined
          ? { kind: 'body' as const, back, front }
          : front !== undefined
            ? { kind: 'tail' as const, facing: front }
            : { kind: 'head' as const, facing };
        const sprite = this.snakeSprites.get(tile, game.dead && !next);
        // Round shared cell edges identically so fractional camera zoom leaves no gaps.
        const x0 = Math.round(x - s / 2);
        const y0 = Math.round(y - s / 2);
        ctx.drawImage(sprite, x0, y0, Math.round(x + s / 2) - x0, Math.round(y + s / 2) - y0);
      });
    }
    if (overlay) for (let d = 0; d < 4; d++) {
      if (d === (game.direction + 2) % 4) continue;
      copies(game.next(game.head, d as Direction), (x, y) => {
        ctx.strokeStyle = game.canMove(d as Direction) ? '#b5e69b60' : '#f28c8799'; ctx.lineWidth = 1;
        ctx.strokeRect(x - s * .46, y - s * .46, s * .92, s * .92);
      });
    }
    if (!game.wraparound) {
      ctx.restore();
      ctx.strokeStyle = game.hitWall ? '#c86e5d' : '#6a855e';
      ctx.lineWidth = Math.max(2, s * .12);
      ctx.strokeRect(wall.x, wall.y, game.width * s, game.height * s);
    }

  }
}
