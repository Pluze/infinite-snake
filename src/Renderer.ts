import { Direction, Game, Point, vectors } from './Game';
import { Cycle } from './TorusCycle';
import { Plan } from './AutoPlayer';
import { snakePalettes, SnakeSprites, toward } from './SnakeSprites';
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private snakeSprites = new SnakeSprites();
  // World coordinates of the single continuous body, indexed by segment ID.
  private lifted = new Float64Array(0);
  private liftedGame?: Game;
  private liftedEnd = 0;
  private selectedCopy?: Point;
  private victory?: { game: Game; path: Path2D; head: Point; tail: Point; minX: number; maxX: number; minY: number; maxY: number };

  private updateBody(game: Game) {
    if (this.liftedGame !== game) {
      this.victory = undefined;
      this.selectedCopy = undefined;
      this.lifted = new Float64Array(0);
      this.liftedGame = game;
    }
    if (!game.wraparound) return;
    if (this.lifted.length < 2 * game.length) {
      this.lifted = new Float64Array(2 ** Math.ceil(Math.log2(game.length)) * 2);
      this.liftedEnd = game.first;
    }
    const start = Math.max(this.liftedEnd, game.first);
    let x = game.width > 2 ? game.travel.x : game.head.x;
    let y = game.height > 2 ? game.travel.y : game.head.y;
    let next = game.head;
    for (let i = game.last - 1; i >= start; i--) {
      const p = game.segment(i)!;
      const dx = p.x - next.x, dy = p.y - next.y;
      x += Math.abs(dx) > 1 ? -Math.sign(dx) : dx;
      y += Math.abs(dy) > 1 ? -Math.sign(dy) : dy;
      const slot = (2 * i) % this.lifted.length;
      this.lifted[slot] = x; this.lifted[slot + 1] = y;
      next = p;
    }
    this.liftedEnd = game.last;
  }

  private fitVictory() {
    const view = this.victory;
    if (!view) return;
    const usableWidth = this.width > 800 ? this.width - 260 : this.width;
    this.scale = Math.min(24, usableWidth * .9 / (view.maxX - view.minX + 2),
      this.height * .64 / (view.maxY - view.minY + 2));
    this.x = (view.minX + view.maxX) / 2 + (this.width - usableWidth) / (2 * this.scale);
    this.y = (view.minY + view.maxY) / 2 + this.height * .07 / this.scale;
  }

  private drawVictory(game: Game) {
    if (!this.victory) {
      const path = new Path2D();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let head = game.head, tail = game.tail;
      for (let i = game.first; i < game.last; i++) {
        const slot = (2 * i) % this.lifted.length, x = this.lifted[slot], y = this.lifted[slot + 1];
        if (i === game.first) { path.moveTo(x, y); tail = { x, y }; } else path.lineTo(x, y);
        if (i === game.last - 1) head = { x, y };
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      this.victory = { game, path, head, tail, minX, maxX, minY, maxY };
      this.fitVictory();
      this.onCameraChange();
    }
    const { path, head, tail } = this.victory, ctx = this.ctx;
    ctx.save();
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(this.scale, this.scale); ctx.translate(-this.x, -this.y);
    ctx.lineWidth = .55; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = snakePalettes[0].fill; ctx.stroke(path);
    const r = Math.max(.30, 4 / this.scale);
    ctx.fillStyle = '#d7ae82'; ctx.beginPath();
    ctx.moveTo(tail.x, tail.y - r); ctx.lineTo(tail.x + r, tail.y);
    ctx.lineTo(tail.x, tail.y + r); ctx.lineTo(tail.x - r, tail.y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#17241d'; ctx.strokeStyle = '#ecf6cc'; ctx.lineWidth = Math.max(.12, 1.5 / this.scale);
    ctx.beginPath(); ctx.arc(head.x, head.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  private overview = document.createElement('canvas');
  private overviewPattern: CanvasPattern | null = null;
  private overviewGame?: Game;
  private overviewStep = -1;
  private overviewOverlay = false;
  private overviewAt = -Infinity;
  x = 0; y = 0; scale = 24; follow = false; autozoom = true; manualUntil = 0;
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
    let tap: Point | undefined;
    canvas.addEventListener('pointerdown', e => {
      tap = pointers.size === 1 ? { x: e.clientX, y: e.clientY } : undefined;
    });
    const release = (e: PointerEvent) => {
      if (e.type === 'pointerup' && e.pointerType === 'touch' && this.manual && touchStart && !pinched) {
        const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 18) this.onSteer(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 0 : 2 : dy > 0 ? 1 : 3);
      }
      const game = this.liftedGame;
      if (e.type === 'pointerup' && tap && game?.wraparound && !game.won &&
          Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 5) {
        const x = Math.round(this.x + (e.clientX - this.width / 2) / this.scale);
        const y = Math.round(this.y + (e.clientY - this.height / 2) / this.scale);
        const index = game.segmentAt(game.wrap({ x, y }));
        if (index !== undefined) {
          this.updateBody(game);
          const slot = 2 * index % this.lifted.length;
          this.selectedCopy = { x: x - this.lifted[slot], y: y - this.lifted[slot + 1] };
          this.onCameraChange();
        }
      }
      tap = undefined;
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
    if (!Number.isFinite(factor) || factor <= 0) return;
    // Stay within a range where camera coordinates retain sub-cell precision.
    const old = this.scale;
    this.scale = Math.min(2 ** 40, Math.max(2 ** -40, this.scale * factor));
    this.x += (sx - this.width / 2) * (1 / old - 1 / this.scale);
    this.y += (sy - this.height / 2) * (1 / old - 1 / this.scale);
    this.autozoom = false; this.hold();
  }
  recenter(game: Game, immediate = false) {
    this.selectedCopy = undefined;
    if (game.won && this.victory?.game === game) this.fitVictory();
    else if (immediate) { this.x = game.travel.x; this.y = game.travel.y; }
    else this.follow = true;
    this.manualUntil = 0;
    this.onCameraChange();
  }
  resetOverview() {
    this.overviewGame = undefined;
    this.overviewPattern = null;
    this.overview.width = this.overview.height = 1;
  }
  render(game: Game, plan: Plan, overlay: boolean, running: boolean, auto: boolean) {
    const now = performance.now(), dt = Math.min((now - this.last) / 1000, .1); this.last = now;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const blend = reduced ? 1 : 1 - Math.exp(-dt * 5);
    if (!(game.won && game.wraparound) && this.follow && now > this.manualUntil) {
      const lead = running ? 3 : 1;
      const heading = vectors[game.direction];
      let lookX = heading.x * lead;
      let lookY = heading.y * lead;
      // Follow the upcoming bend rather than jumping the camera lead on a turn.
      if (auto && running && !reduced && plan.directions.length) {
        lookX = 0;
        lookY = 0;
        for (const direction of plan.directions.slice(0, 5)) {
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
    this.updateBody(game);
    const ctx = this.ctx, s = this.scale, w = this.width, h = this.height;
    ctx.fillStyle = game.wraparound ? '#101915' : '#080e0b'; ctx.fillRect(0, 0, w, h);
    if (game.wraparound && game.won) {
      this.drawVictory(game);
      return;
    }
    const focusX = this.selectedCopy?.x ?? Math.round((this.x - (game.width > 2 ? game.travel.x : game.head.x)) / game.width) * game.width;
    const focusY = this.selectedCopy?.y ?? Math.round((this.y - (game.height > 2 ? game.travel.y : game.head.y)) / game.height) * game.height;
    if (s < 3 || (game.wraparound && Math.min(game.width, game.height) * s < 8)) {
      this.drawOverview(game, overlay ? plan : undefined, now, focusX, focusY);
      return;
    }
    const screen = (x: number, y: number) => ({ x: (x - this.x) * s + w / 2, y: (y - this.y) * s + h / 2 });
    const left = Math.floor(this.x - w / s / 2) - 1, right = Math.ceil(this.x + w / s / 2) + 1;
    const top = Math.floor(this.y - h / s / 2) - 1, bottom = Math.ceil(this.y + h / s / 2) + 1;
    const x0 = game.wraparound ? left : Math.max(0, left);
    const x1 = game.wraparound ? right : Math.min(game.width - 1, right);
    const y0 = game.wraparound ? top : Math.max(0, top);
    const y1 = game.wraparound ? bottom : Math.min(game.height - 1, bottom);
    const visibleCells = Math.max(0, x1 - x0 + 1) * Math.max(0, y1 - y0 + 1);
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
    const copies = (p: Point, draw: (x: number, y: number, wx: number, wy: number) => void) => {
      if (!game.wraparound) {
        if (game.contains(p) && p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) {
          const pos = screen(p.x, p.y);
          draw(pos.x, pos.y, p.x, p.y);
        }
        return;
      }
      for (let tx = Math.ceil((left - p.x) / game.width); tx <= Math.floor((right - p.x) / game.width); tx++)
        for (let ty = Math.ceil((top - p.y) / game.height); ty <= Math.floor((bottom - p.y) / game.height); ty++) {
          const pos = screen(p.x + tx * game.width, p.y + ty * game.height); draw(pos.x, pos.y, p.x + tx * game.width, p.y + ty * game.height);
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
    if (overlay && plan.directions.length) {
      const edge = (x: number, y: number, direction: Direction) => {
        const vector = vectors[direction];
        ctx.moveTo(x, y);
        ctx.lineTo(x + vector.x * s, y + vector.y * s);
      };
      const path = plan.path;
      ctx.strokeStyle = '#b5e69b80';
      ctx.lineWidth = Math.max(1, s * .07);
      ctx.setLineDash([s * .15, s * .2]);
      ctx.beginPath();
      const drawCycle = (cycle: Cycle, length: number, origin: Point) => {
        const start = cycle.index(origin);
        if (length <= visibleCells) {
          for (let offset = 0; offset < length; offset++) {
            const point = cycle.point((start + offset) % cycle.size);
            const direction = cycle.direction(point);
            copies(point, (x, y) => edge(x, y, direction));
          }
        } else {
          // Long cycle routes are indexed by cell. Visit only the viewport.
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const point = game.wraparound ? game.wrap({ x, y }) : { x, y };
            if (cycle.distance(origin, point) >= length) continue;
            const pos = screen(x, y);
            edge(pos.x, pos.y, cycle.direction(point));
          }
        }
      };
      if (path && 'cycle' in path) drawCycle(path.cycle, path.length, game.head);
      else if (path) {
        if (path.lead) drawCycle(path.lead.cycle, path.lead.length, path.lead.origin);
        if (path.suffix) drawCycle(path.suffix.cycle, path.suffix.length, path.suffix.origin);
        for (let i = path.cursor; i < path.end; i++) {
          const point = i === 0 ? path.origin : path.points[i - 1];
          copies(point, (x, y) => edge(x, y, path.directions[i]));
        }
      } else {
        copies(game.head, (x, y) => edge(x, y, plan.directions[0]));
      }
      ctx.stroke();
      ctx.setLineDash([]);
      const target = game.food.values().next().value;
      if (target) copies(target, (x, y) => { ctx.strokeStyle = '#f7c795'; ctx.lineWidth = 1; ctx.strokeRect(x - s * .48, y - s * .48, s * .96, s * .96); });
    }
    const drawSegment = (index: number, point: Point, x: number, y: number, wx: number, wy: number) => {
      const previous = game.segments.get(index - 1);
      const next = game.segments.get(index + 1);
      const back = previous && toward(point, previous, game.width, game.height);
      const front = next && toward(point, next, game.width, game.height);
      const headAxisSize = game.direction % 2 === 0 ? game.width : game.height;
      const facing = back !== undefined && headAxisSize === 2 ? (back + 2) % 4 as Direction : game.direction;
      const tile = back !== undefined && front !== undefined
        ? { kind: 'body' as const, back, front }
        : front !== undefined
          ? { kind: 'tail' as const, facing: front }
          : { kind: 'head' as const, facing };
      const slot = 2 * index % this.lifted.length;
      const focused = !game.wraparound || (wx === this.lifted[slot] + focusX && wy === this.lifted[slot + 1] + focusY);
      const sprite = this.snakeSprites.get(tile, focused && game.dead && !next, focused ? 0 : 1);
      // Round shared cell edges identically so fractional camera zoom leaves no gaps.
      const x0 = Math.round(x - s / 2);
      const y0 = Math.round(y - s / 2);
      ctx.drawImage(sprite, x0, y0, Math.round(x + s / 2) - x0, Math.round(y + s / 2) - y0);
    };
    if (game.length <= visibleCells) {
      for (const [index, point] of game.segments) copies(point, (x, y, wx, wy) => drawSegment(index, point, x, y, wx, wy));
    } else {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const point = game.wraparound ? game.wrap({ x, y }) : { x, y };
        const index = game.segmentAt(point);
        if (index === undefined) continue;
        const pos = screen(x, y);
        drawSegment(index, point, pos.x, pos.y, x, y);
      }
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
  private drawOverview(game: Game, plan: Plan | undefined, now: number, focusX: number, focusY: number) {
    const ctx = this.ctx;
    const width = game.width * this.scale, height = game.height * this.scale;
    const left = this.width / 2 - (this.x + .5) * this.scale;
    const top = this.height / 2 - (this.y + .5) * this.scale;
    if (game.wraparound && width < 1 && height < 1) {
      // Repeated cells below a pixel on both axes are represented by density.
      ctx.fillStyle = `rgba(57, 75, 67, ${game.length / game.capacity * .45})`;
      ctx.fillRect(0, 0, this.width, this.height);
      return;
    }
    const tile = this.overview;
    const showPath = Boolean(plan?.path);
    const newGame = this.overviewGame !== game;
    if (newGame || this.overviewOverlay !== showPath || (this.overviewStep !== game.steps && now - this.overviewAt > 40)) {
      this.overviewGame = game;
      this.overviewOverlay = showPath;
      this.overviewStep = game.steps;
      this.overviewAt = now;
      const cols = Math.min(512, game.width), rows = Math.min(512, game.height);
      if (newGame) {
        tile.width = cols;
        tile.height = rows;
      }
      const raster = tile.getContext('2d')!;
      raster.fillStyle = '#101915';
      raster.fillRect(0, 0, tile.width, tile.height);
      const plot = (p: Point) => raster.fillRect(Math.floor(p.x * cols / game.width),
        Math.floor(p.y * rows / game.height), 1, 1);
      const path = plan?.path;
      raster.fillStyle = '#466647';
      if (path && 'cycle' in path) {
        const start = path.cycle.index(game.head);
        const stride = Math.max(1, Math.ceil(path.length / 16_384));
        for (let i = 0; i < path.length; i += stride) plot(path.cycle.point((start + i) % path.cycle.size));
      } else if (path) {
        for (let i = path.cursor; i < path.end; i++) plot(path.points[i]);
        for (const arc of [path.lead, path.suffix]) {
          if (!arc) continue;
          const { cycle, length, origin } = arc, start = cycle.index(origin);
          const stride = Math.max(1, Math.ceil(length / 16384));
          for (let i = 1; i < length; i += stride) plot(cycle.point((start + i) % cycle.size));
          plot(cycle.point((start + length) % cycle.size));
        }
      }
      const stride = Math.max(1, Math.ceil(game.length / 32_768));
      raster.fillStyle = snakePalettes[game.wraparound ? 1 : 0].fill;
      for (let i = game.first; i < game.last; i += stride) plot(game.segment(i)!);
      plot(game.head);
      raster.fillStyle = '#f4b37c';
      for (const food of game.food.values()) plot(food);
      this.overviewPattern = game.wraparound ? ctx.createPattern(tile, 'repeat') : null;
    }
    const pattern = this.overviewPattern;
    if (pattern) {
      const x = width < 1 ? 0 : left % width, y = height < 1 ? 0 : top % height;
      pattern.setTransform(new DOMMatrix([Math.max(1, width) / tile.width, 0, 0, Math.max(1, height) / tile.height, x, y]));
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = snakePalettes[0].fill;
      const stride = Math.max(1, Math.ceil(game.length / 32_768));
      const dot = (index: number) => {
        const slot = 2 * index % this.lifted.length;
        ctx.fillRect(left + (this.lifted[slot] + focusX) * this.scale,
          top + (this.lifted[slot + 1] + focusY) * this.scale, this.scale, this.scale);
      };
      for (let i = game.first; i < game.last; i += stride) dot(i);
      dot(game.last - 1);
    } else if (!game.wraparound && width >= .5 && height >= .5) {
      ctx.drawImage(tile, left, top, width, height);
    }
  }

}
