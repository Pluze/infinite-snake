import { test, expect, Page } from '@playwright/test';
async function menu(page:Page){await page.locator('#menu-toggle').click();await expect(page.locator('#menu')).toBeVisible();}
async function close(page:Page){await page.keyboard.press('Escape');await expect(page.locator('#menu')).toBeHidden();}
async function more(page:Page){if(await page.locator('#advanced').getAttribute('open')===null)await page.locator('#advanced summary').click();}
async function step(page:Page){await more(page);await page.locator('#step').click();await page.locator('#board').focus();}
test('left toolbar, right controls and both desktop charts stay available',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
 await expect(page.locator('#growth-chart')).toBeVisible();await expect(page.locator('#efficiency-chart')).toBeVisible();await expect(page.locator('#speed')).toBeVisible();await expect(page.locator('.dpad')).toBeHidden();
 expect((await page.locator('#control-panel').boundingBox())!.x).toBeGreaterThan(1000);await expect(page.locator('#mode-manual')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#speed')).toHaveAttribute('max','9');await expect(page.locator('#follow')).not.toBeChecked();await expect(page.locator('#risk')).toBeChecked();
 await page.locator('#speed').fill('0');await page.locator('#board').focus();await page.keyboard.press('ArrowUp');await expect(page.locator('#play')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#board')).toHaveAttribute('data-position','5, 47');await page.keyboard.press('Space');
 const steps=await page.locator('#board').getAttribute('data-steps');await page.waitForTimeout(1100);await expect(page.locator('#board')).toHaveAttribute('data-steps',steps!);await expect(page.locator('#save-status')).toContainText('Saved');
 await page.reload();await expect(page.locator('#loading')).toBeHidden();await expect(page.locator('#board')).toHaveAttribute('data-position','5, 47');expect(errors).toEqual([]);await page.screenshot({path:'test-results/manual.png'});
});
test('compact dropdown keeps only navigation; settings stay on the right',async({page})=>{
 await page.addInitScript(() => { Math.random = () => 42 / 2147483647; });
 await page.goto('/');await expect(page.locator('#loading')).toBeHidden();await menu(page);
 await expect(page.locator('#menu .menu-actions > *')).toHaveCount(4);expect(await page.locator('dialog[open]').count()).toBe(0);expect((await page.locator('#menu').boundingBox())!.width).toBeLessThan(220);await page.screenshot({path:'test-results/dropdown.png'});
 await expect(page.locator('#settings-tab, #statistics-tab')).toHaveCount(0);await close(page);await expect(page.getByText('Food density')).toHaveCount(0);
 await page.locator('#mode-auto').click();await page.locator('#risk').check();await page.locator('#speed').fill('7');await page.locator('#play').click();await expect.poll(async()=>Number((await page.locator('#score').textContent())!.replaceAll(',',''))).toBeGreaterThan(10);
 await menu(page);await expect(page.locator('#play')).toHaveAttribute('aria-pressed','false');const steps=await page.locator('#board').getAttribute('data-steps');await page.waitForTimeout(350);await expect(page.locator('#board')).toHaveAttribute('data-steps',steps!);await expect(page.locator('#growth-chart')).toBeVisible();
 await expect(page.locator('#save-status')).toContainText('Saved');const score=await page.locator('#score').textContent();await close(page);await page.reload();await expect(page.locator('#loading')).toBeHidden();await expect(page.locator('#score')).toHaveText(score!);await expect(page.locator('#mode-manual')).toHaveAttribute('aria-pressed','true');
 await more(page);await expect(page.getByLabel('Theme', {exact:true})).toHaveCount(0);for(let i=0;i<5;i++)await page.locator('#zoom-out').click();await page.waitForTimeout(600);await page.screenshot({path:'test-results/torus-overview.png'});
});
test('mobile has a compact playback bar, expandable controls, swipe and original chart buttons',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();await page.goto('/');await expect(page.locator('#loading')).toBeHidden();await expect(page.locator('.dpad')).toBeVisible();await expect(page.locator('#growth-chart')).toBeHidden();await expect(page.locator('#speed')).toBeHidden();await expect(page.locator('#play')).toBeVisible();
 await page.locator('#mobile-controls').click();await page.locator('#speed').fill('0');await page.locator('#mobile-controls').click();await menu(page);await page.screenshot({path:'test-results/mobile-menu.png'});await close(page);
 const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:220,y:440}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:220,y:350}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.locator('#board')).toHaveAttribute('data-position','5, 47');await page.locator('#play').click();
 await page.locator('[data-dir="0"]').tap();await expect(page.locator('#play')).toHaveAttribute('aria-pressed','true');await page.locator('#play').click();await page.locator('[data-mobile="growth-chart"]').click();await expect(page.locator('#growth-chart')).toBeVisible();await page.locator('[data-mobile="efficiency-chart"]').click();await expect(page.locator('#growth-chart')).toBeHidden();await expect(page.locator('#efficiency-chart')).toBeVisible();await page.locator('[data-mobile="efficiency-chart"]').click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/mobile.png'});await context.close();
});
test('high-speed coverage autoplay saves; a new game returns to manual',async({page})=>{
 await page.goto('/');await expect(page.locator('#loading')).toBeHidden();await page.locator('#mode-auto').click();await page.locator('#risk').check();await page.locator('#speed').fill('16');await page.locator('#play').click();
 await page.waitForTimeout(7000);if(await page.locator('#play').getAttribute('aria-pressed')==='true')await page.locator('#play').click();const steps=Number((await page.locator('#board').getAttribute('data-steps'))!.replaceAll(',',''));expect(steps).toBeGreaterThan(100);await expect(page.locator('#status')).not.toContainText('You hit');await expect(page.locator('#save-status')).toContainText('Saved');
 await page.screenshot({path:'test-results/autoplay-board.png'});await page.reload();await expect(page.locator('#loading')).toBeHidden();await expect(page.locator('#board')).toHaveAttribute('data-steps',String(steps));await menu(page);await page.locator('#new-game').click();await page.locator('#restart-confirm').click();await expect(page.locator('#score')).toHaveText('0');await expect(page.locator('#mode-manual')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#growth-summary')).toHaveText('6 cells');await page.waitForTimeout(550);await page.screenshot({path:'test-results/desktop.png'});
});
test('risk assist and single-step control still work; recenter is contextual',async({page})=>{
 await page.addInitScript(() => { Math.random = () => 42 / 2147483647; });
 await page.goto('/');await expect(page.locator('#loading')).toBeHidden();await page.locator('#speed').fill('0');await page.locator('#risk').check();await step(page);
 for(const direction of ['ArrowDown','ArrowLeft']){await page.keyboard.press(direction);await page.keyboard.press('Space');await step(page);}
 await page.keyboard.press('ArrowUp');await page.keyboard.press('Space');await step(page);await expect(page.locator('#status')).toContainText('Risk pause');await expect(page.locator('#board')).toHaveAttribute('data-steps','3');await page.locator('#risk').uncheck();await step(page);await expect(page.locator('#status')).toContainText('You hit');await expect(page.locator('#play')).toBeEnabled();
 await page.mouse.move(600,350);await page.mouse.down();await page.mouse.move(800,400);await page.mouse.up();await expect(page.locator('#recenter')).toBeVisible();await page.locator('#recenter').click();await expect(page.locator('#camera-status')).toHaveText('Following');await expect(page.locator('#recenter')).toBeHidden();
});
test('small vertical wheel deltas zoom the board', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await more(page);
  await page.locator('#zoom-in').click(); // Lock the starting scale for comparison.
  const zoom = page.locator('#zoom-label');
  const before = parseInt((await zoom.textContent())!, 10);
  await page.mouse.move(600, 350);
  await page.mouse.wheel(0, 5);
  await expect.poll(async () => parseInt((await zoom.textContent())!, 10)).toBeLessThan(before);
});
test('custom world dimensions validate and restore correctly',async({page})=>{
 await page.goto('/');await expect(page.locator('#loading')).toBeHidden();await menu(page);await page.locator('#new-game').click();await expect(page.locator('#menu')).toBeHidden();await page.locator('#world-preset').selectOption('32x24');await expect(page.locator('#world-width')).toHaveValue('32');await expect(page.locator('#world-height')).toHaveValue('24');await expect(page.locator('#world-preview')).toContainText('768 cells');
 await page.locator('#world-width').fill('0');await page.locator('#restart-confirm').click();await expect(page.locator('#restart-dialog')).toBeVisible();await expect(page.locator('#world-caption')).toContainText('64 × 48');await page.locator('#world-width').fill('20');await page.locator('#world-height').fill('12');await expect(page.locator('#world-preset')).toHaveValue('custom');await expect(page.locator('#world-preview')).toContainText('240 cells');await page.screenshot({path:'test-results/new-game.png'});
 await page.locator('#restart-confirm').click();await expect(page.locator('#restart-dialog')).not.toBeVisible();await expect(page.locator('#world-caption')).toContainText('20 × 12');await expect(page.locator('#save-status')).toContainText('Saved');await page.reload();await expect(page.locator('#loading')).toBeHidden();await expect(page.locator('#world-caption')).toContainText('20 × 12');await page.locator('#speed').fill('0');await page.locator('#board').focus();await page.keyboard.press('ArrowUp');await expect(page.locator('#board')).toHaveAttribute('data-position','5, 11');await page.keyboard.press('Space');
});

test('a walled board draws one period, saves its rules and stops at the wall', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await menu(page);
  await page.locator('#new-game').click();
  await page.locator('#world-width').fill('8');
  await page.locator('#world-height').fill('8');
  await page.getByLabel('Wraparound').uncheck();
  await expect(page.locator('#world-preview')).toHaveText('64 cells · Solid walls');
  await page.locator('#restart-confirm').click();
  await expect(page.locator('#world-caption')).toHaveText('8 × 8 · solid walls');
  await expect(page.locator('#save-status')).toContainText('Saved');
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#world-caption')).toHaveText('8 × 8 · solid walls');
  const board = page.locator('#board');
  await expect.poll(() => board.evaluate((canvas: HTMLCanvasElement) =>
    [...canvas.getContext('2d')!.getImageData(300, 400, 1, 1).data]
  )).toEqual([8, 14, 11, 255]);
  await page.locator('#speed').fill('0');
  await page.locator('#risk').uncheck();
  await board.focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await step(page);
  await expect(page.locator('#status')).toContainText('You hit a wall');
  await expect(board).toHaveAttribute('data-position', '5, 0');
  await page.screenshot({ path: 'test-results/walled-board.png' });
  await page.getByRole('button', { name: 'Play again', exact: true }).click();
  await expect(page.locator('#play')).toHaveText('Start');
  await expect(board).toHaveAttribute('data-steps', '0');
  await expect(page.locator('#world-caption')).toHaveText('8 × 8 · solid walls');
  await expect(page.locator('#risk')).not.toBeChecked();
  await expect(page.locator('#speed')).toHaveValue('0');
  await expect(page.locator('#restart-dialog')).not.toBeVisible();
});

test('custom dimensions accept both endpoints', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await menu(page);
  await page.locator('#new-game').click();
  await page.locator('#world-width').fill('1');
  await page.locator('#world-height').fill('4097');
  await expect(page.locator('#world-preview')).toContainText('from 1 to 4,096');
  await page.locator('#world-height').fill('4096');
  await expect(page.locator('#world-preview')).toHaveText('4,096 cells · Edges wrap');
  await page.locator('#restart-confirm').click();
  await expect(page.locator('#world-caption')).toHaveText('1 × 4,096 · edges wrap');
  await expect(page.locator('#board')).toHaveAttribute('data-position', '0, 5');
});

test('draws the route and highlights food past the old preview cutoff', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  const result = await page.evaluate(async () => {
    const gameModule = '/src/Game.ts', botModule = '/src/AutoPlayer.ts';
    const rendererModule = '/src/Renderer.ts', cycleModule = '/src/GridCycle.ts';
    const { Game, key }: typeof import('../src/Game') = await import(gameModule);
    const { AutoPlayer }: typeof import('../src/AutoPlayer') = await import(botModule);
    const { Renderer }: typeof import('../src/Renderer') = await import(rendererModule);
    const { GridCycle }: typeof import('../src/GridCycle') = await import(cycleModule);
    const canvas = document.createElement('canvas');
    const renderer = new Renderer(canvas);
    renderer.follow = false;
    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = '#b5e69b80';
    const routeColor = ctx.strokeStyle;
    let edges = 0, foodOutline = false;
    const lineTo = ctx.lineTo.bind(ctx), strokeRect = ctx.strokeRect.bind(ctx);
    ctx.lineTo = (x, y) => {
      if (ctx.strokeStyle === routeColor) edges++;
      lineTo(x, y);
    };
    ctx.strokeRect = (x, y, w, h) => {
      if (ctx.strokeStyle === '#f7c795') foodOutline = true;
      strokeRect(x, y, w, h);
    };
    const capture = (game: InstanceType<typeof Game>, showPrefix = false) => {
      const food = game.food.values().next().value!;
      renderer.x = food.x;
      renderer.y = food.y;
      const plan = new AutoPlayer().preview(game);
      edges = 0;
      foodOutline = false;
      renderer.render(game, plan, true, false, true);
      if (showPrefix) {
        renderer.x = game.head.x;
        renderer.y = game.head.y;
        renderer.render(game, plan, true, false, true);
      }
      return { edges: edges > 0, foodOutline, cycle: Boolean(plan.path && 'cycle' in plan.path) };
    };

    const sparse = new Game(42, 4096, 4096, false);
    const distant = { x: 3000, y: 3000 };
    sparse.food = new Map([[key(distant), distant]]);

    const dense = new Game(42, 256, 256, false);
    const cycle = new GridCycle(256, 256, false);
    const body = Array.from({ length: 60_000 }, (_, i) => cycle.point(i));
    const food = cycle.point(65_000);
    const restored = Game.restore({ ...dense.snapshot(), body, food: [food], travel: body[body.length - 1],
      direction: cycle.direction(body[body.length - 2]) }, [0]);
    return { sparse: capture(sparse), dense: capture(restored, true) };
  });
  expect(result).toEqual({
    sparse: { edges: true, foodOutline: true, cycle: false },
    dense: { edges: true, foodOutline: true, cycle: true },
  });
});

test('camera zoom goes far beyond the old limits in both directions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await more(page);
  const zoom = page.locator('#zoom-label');
  await page.locator('#zoom-out').evaluate(button => {
    for (let i = 0; i < 60; i++) (button as HTMLButtonElement).click();
  });
  expect(parseFloat((await zoom.textContent())!)).toBeLessThan(.01);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.locator('#zoom-in').evaluate(button => {
    for (let i = 0; i < 100; i++) (button as HTMLButtonElement).click();
  });
  expect(parseFloat((await zoom.textContent())!)).toBeGreaterThan(10_000);
  await expect(page.locator('#follow')).not.toBeChecked();
  expect(errors).toEqual([]);
});

test('can skip a stalled storage open without touching the existing save', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(IDBFactory.prototype, 'open', { value: () => new EventTarget() });
  });
  await page.goto('/');
  await expect(page.locator('#loading-progress')).toBeVisible();
  await page.getByRole('button', { name: 'Start new game without loading save' }).click();
  await expect(page.locator('#loading')).toBeHidden({ timeout: 2000 });
  await expect(page.locator('#play')).toBeEnabled();
  await expect(page.locator('#save-status')).toContainText('existing save kept');
});

test('loading timeout cancels storage and enables a session-only game', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    Object.defineProperty(IDBFactory.prototype, 'open', { value: () => new EventTarget() });
  });
  await page.goto('/');
  await expect(page.locator('#loading-progress')).toBeVisible();
  await page.clock.fastForward(8500);
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#save-status')).toContainText('session only');
});

test('the loading button retries when the game script failed to load', async ({ page }) => {
  await page.route('**/src/index.ts', route => route.abort(), { times: 1 });
  await page.goto('/');
  await expect(page.locator('#loading-text')).toContainText('The game could not load');
  await page.getByRole('button', { name: 'Start new game without loading save' }).click();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#save-status')).toContainText('existing save kept');
});

test('restores and compacts long legacy progress and switches to a 256 by 128 board promptly', async ({ page }) => {
  test.setTimeout(60_000);
  const steps = Number(process.env.SNAKE_HISTORY_STEPS ?? 262_145);
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  const cdp = await page.context().newCDPSession(page);
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    return (await cdp.send('Runtime.getHeapUsage')).usedSize;
  };
  const cleanHeap = await heap();
  await page.evaluate(async steps => {
    const gameModule = '/src/Game.ts';
    const { Game }: typeof import('../src/Game') = await import(gameModule);
    const game = new Game(42, 256, 128, false);
    const open = indexedDB.open('infinite-snake-torus-v2');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const tx = db.transaction(['state', 'history'], 'readwrite');
    const complete = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    tx.objectStore('state').put({ ...game.snapshot(), steps }, 'game');
    const history = tx.objectStore('history');
    history.clear();
    for (let offset = 0; offset <= steps; offset += 1024) {
      history.put(new Array(Math.min(1024, steps + 1 - offset)).fill(0), offset);
    }
    await complete;
    db.close();
  }, steps);
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden({ timeout: 15000 });
  await expect(page.locator('#board')).toHaveAttribute('data-steps', String(steps));
  const restoredHeap = await heap();
  await expect.poll(() => page.evaluate(async () => {
    const open = indexedDB.open('infinite-snake-torus-v2');
    const db = await new Promise<IDBDatabase>(resolve => open.onsuccess = () => resolve(open.result));
    const request = db.transaction('state').objectStore('state').get('game');
    const count = await new Promise<number>(resolve => request.onsuccess = () => resolve(request.result.historyEvents));
    db.close();
    return count;
  })).toBe(1);

  // Hold the save completion on this page. New Game must not wait for it.
  await page.evaluate(() => {
    const create = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      const transaction = create.apply(this, args);
      if (args[1] === 'readwrite') Object.defineProperty(transaction, 'oncomplete', { set() {} });
      return transaction;
    };
  });
  await menu(page);
  await page.locator('#new-game').click();
  await page.locator('#restart-confirm').click();
  await expect(page.locator('#restart-dialog')).toBeHidden({ timeout: 2000 });
  await expect(page.locator('#board')).toHaveAttribute('data-steps', '0');
  await expect(page.locator('#world-caption')).toHaveText('256 × 128 · solid walls');
  await expect(page.locator('#play')).toBeEnabled();
  const freshHeap = await heap();
  expect(restoredHeap - cleanHeap).toBeLessThan(24 * 1024 ** 2);
  expect(freshHeap - cleanHeap).toBeLessThan(24 * 1024 ** 2);
  console.info(`Browser JavaScript heap in MiB: clean=${(cleanHeap / 1024 ** 2).toFixed(1)}, restored=${(restoredHeap / 1024 ** 2).toFixed(1)}, fresh=${(freshHeap / 1024 ** 2).toFixed(1)}`);
});

test('can cancel while reading history and restore the original save on reload', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('stall-history')) return;
    const getAll = IDBObjectStore.prototype.getAll;
    Object.defineProperty(IDBObjectStore.prototype, 'getAll', {
      value(this: IDBObjectStore, ...args: Parameters<typeof getAll>) {
        return this.name === 'history' ? new EventTarget() : getAll.apply(this, args);
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await step(page);
  await expect(page.locator('#board')).toHaveAttribute('data-steps', '1');
  // Allow the scheduled save to finish before injecting the stalled read.
  await expect.poll(() => page.evaluate(async () => {
    const open = indexedDB.open('infinite-snake-torus-v2');
    const db = await new Promise<IDBDatabase>(resolve => open.onsuccess = () => resolve(open.result));
    const req = db.transaction('state').objectStore('state').get('game');
    const saved = await new Promise<number>(resolve => req.onsuccess = () => resolve(req.result?.steps ?? -1));
    db.close();
    return saved;
  })).toBe(1);
  await page.evaluate(() => sessionStorage.setItem('stall-history', '1'));
  await page.reload();
  await expect(page.locator('#loading-progress')).toHaveAttribute('value', '0');
  await page.getByRole('button', { name: 'Start new game without loading save' }).click();
  await expect(page.locator('#play')).toBeEnabled({ timeout: 2000 });
  await expect(page.locator('#board')).toHaveAttribute('data-steps', '0');
  await page.evaluate(() => sessionStorage.removeItem('stall-history'));
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#board')).toHaveAttribute('data-steps', '1');
});

test('winning offers a quick replay with the same board rules', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await menu(page);
  await page.locator('#new-game').press('Enter');
  await page.locator('#world-width').fill('2');
  await page.locator('#world-height').fill('1');
  await page.locator('#restart-confirm').click();
  await step(page);
  await expect(page.locator('#play')).toHaveText('You win! · Play again');
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('Start');
  await expect(page.locator('#score')).toHaveText('0');
  await expect(page.locator('#board')).toHaveAttribute('data-steps', '0');
  await expect(page.locator('#world-caption')).toHaveText('2 × 1 · edges wrap');
});

test('a paused free camera does not redraw an unchanged board each frame', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  const paints = await page.locator('#board').evaluate(async canvas => {
    const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await frame();
    await frame();
    const ctx = (canvas as HTMLCanvasElement).getContext('2d')!;
    const fill = ctx.fillRect;
    let paints = 0;
    ctx.fillRect = function (...args) { paints++; return fill.apply(this, args); };
    for (let i = 0; i < 4; i++) await frame();
    ctx.fillRect = fill;
    return paints;
  });
  expect(paints).toBe(0);
});
