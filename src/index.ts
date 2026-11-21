import './style.css';
import { Direction, Game, MAX_WORLD_SIDE } from './Game';
import { AutoPlayer, Plan } from './AutoPlayer';
import { Renderer } from './Renderer';
import { Persistence } from './Persistence';
import { Charts } from './Charts';
import { ProgressSaver } from './ProgressSaver';
import { BrowserHeap, MemoryMonitor } from './MemoryMonitor';
import { formatCount as fmt } from './formatCount';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const checkbox = (id: string) => $<HTMLInputElement>(id);
const readLocal = (key: string, fallback: string) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const writeLocal = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* IndexedDB progress is independent of preferences. */ } };
let game = new Game(), running = false, auto = false, ready = false, busy = false, storageReady = false, restoreFailed = false;
let speedPower = 3, heldF = false, pendingDirections: Direction[] = [];
let plan: Plan = { directions: [], points: [], safe: true, reason: '' }, message = '';
let best = Number(readLocal('snake-best', '0')) || 0;
const bot = new AutoPlayer(), persistence = new Persistence(), charts = new Charts(), guard = new MemoryMonitor();
const renderer = new Renderer($<HTMLCanvasElement>('board'));
renderer.onSteer = d => steer(d);
const saver = new ProgressSaver(async () => {
  if (!storageReady || restoreFailed) return;
  $('save-status').textContent = 'Saving…';
  await persistence.save(game);
  $('save-status').textContent = `Saved · ${new Date().toLocaleTimeString('en-US', { hour12: false })}`;
}, () => { $('save-status').textContent = 'Save failed: check browser storage space'; }, 1500);
function settings() {
  writeLocal('snake-torus-settings-v2', JSON.stringify({ auto, speedPower, overlay: checkbox('overlay').checked, follow: renderer.follow, autozoom: renderer.autozoom, risk: checkbox('risk').checked }));
}
try {
  const s = JSON.parse(readLocal('snake-torus-settings-v2', '{}'));
  auto = false; speedPower = Number.isInteger(s.speedPower) ? Math.max(0, Math.min(16, s.speedPower)) : 3;
  checkbox('overlay').checked = s.overlay !== false; checkbox('risk').checked = s.risk === true;
  renderer.follow = s.follow !== false; renderer.autozoom = s.autozoom !== false;
} catch { /* Invalid preferences do not invalidate a saved game. */ }
checkbox('speed').value = String(speedPower);
function updateCameraUI() {
  $('recenter').hidden = renderer.follow && performance.now() >= renderer.manualUntil;
  checkbox('follow').checked = renderer.follow; checkbox('autozoom').checked = renderer.autozoom;
  $('zoom-label').textContent = `${Math.round(renderer.scale / 24 * 100)}%`;
  $('camera-status').textContent = !renderer.follow ? 'Free camera' : performance.now() < renderer.manualUntil ? 'Panning · follow resumes soon' : 'Following';
}
renderer.onCameraChange = () => { updateCameraUI(); settings(); };
function ui() {
  $('score').textContent = fmt(game.score); $('score').title = `Best score: ${fmt(best)}`;
  $('board').dataset.steps = String(game.steps); $('board').dataset.position = `${fmt(game.head.x)}, ${fmt(game.head.y)}`;
  $('board').setAttribute('aria-label', `Snake board. Score ${game.score}, length ${game.length}, ${game.steps} steps, head at ${game.head.x}, ${game.head.y}.`);
  $('efficiency-summary').textContent = game.steps ? `${(game.score / 10 / game.steps * 100).toFixed(2)}%` : '—';
  $('growth-summary').textContent = `${fmt(game.length)} cells`;
  $('speed-value').textContent = fmt(2 ** speedPower);
  checkbox('speed').max = auto ? '16' : '9'; checkbox('speed').value = String(speedPower);
  $('speed-mid').textContent = auto ? '256' : '16–32'; $('speed-max').textContent = auto ? '65,536' : '512';
  renderer.manual = !auto;
  $('world-caption').textContent = `${fmt(game.width)} × ${fmt(game.height)} · ${game.wraparound ? 'edges wrap' : 'solid walls'}`;
  $('play').textContent = game.won ? 'You win!' : game.dead ? 'Game over' : running ? 'Pause' : game.steps ? 'Resume' : 'Start';
  $('mode-indicator').hidden = !auto;
  $('play').setAttribute('aria-pressed', String(running));
  $<HTMLButtonElement>('play').disabled = !ready || busy || game.dead || game.won;
  $<HTMLButtonElement>('step').disabled = !ready || busy || running || game.dead;
  $('mode-auto').setAttribute('aria-pressed', String(auto)); $('mode-manual').setAttribute('aria-pressed', String(!auto));
  document.body.classList.toggle('manual', !auto); document.body.classList.toggle('dead', game.dead);
  $('status').textContent = game.won ? 'You filled the entire board! Start a new game from the menu.' : game.dead ? `You hit ${game.hitWall ? 'a wall' : 'your body'}. Game over. Start a new game from the menu.` : message || (running ? auto ? `Autoplay · ${plan.reason}` : 'Manual · arrow keys / WASD / direction pad' : auto ? 'Autoplay paused · press Space to start' : 'Arrow keys / WASD / swipe to play · Space pauses');
  $('status').hidden = running && !message && !game.dead && !game.won;
  updateCameraUI();
}
function pause(reason = '') { running = false; message = reason; saver.markDirty(); saver.flush(); ui(); }
function toggle() {
  if (!ready || busy || game.dead || game.won) return;
  running = !running; message = ''; credit = 0; lastTick = performance.now();
  if (!running) { saver.markDirty(); saver.flush(); } ui();
}
function mode(isAuto: boolean) { auto = isAuto; if (!auto) speedPower = Math.min(speedPower, 9); pendingDirections = []; bot.clear(); plan = { directions: [], points: [], safe: true, reason: '' }; message = ''; settings(); ui(); }
function steer(d: Direction) {
  if (!ready || busy || game.dead || game.won) return;
  if (auto) mode(false);
  if (!running && document.body.classList.contains('warning')) { pendingDirections = []; document.body.classList.remove('warning'); }
  const last = pendingDirections[pendingDirections.length - 1] ?? game.direction;
  if ((game.length === 1 || d !== (last + 2) % 4) && d !== last && pendingDirections.length < 3) pendingDirections.push(d);
  message = ''; if (!running) { running = true; credit = 0; lastTick = performance.now(); }
  $('board').focus({ preventScroll: true }); ui();
}
function move() {
  const next = auto ? bot.nextMove(game) : undefined;
  const d = next?.direction ?? (auto ? game.direction : pendingDirections[0] ?? game.direction);
  if (checkbox('risk').checked && (!game.canMove(d) || (next && !next.safe))) {
    document.body.classList.add('warning'); pause(`Risk pause: ${next && !next.safe ? next.reason : game.contains(game.next(game.head, d)) ? 'your body is directly ahead' : 'a wall is directly ahead'}. Turn or disable Pause before risk to continue.`); return false;
  }
  if (!auto) pendingDirections.shift();
  const moved = game.step(d);
  if (auto && moved) bot.advance(game);
  if (game.score > best) { best = game.score; writeLocal('snake-best', String(best)); }
  if (game.dead || game.won) pause();
  return moved;
}
$('play').onclick = () => { toggle(); $('board').focus({ preventScroll: true }); };
$('step').onclick = () => { if (!ready || busy || running || game.dead) return; document.body.classList.remove('warning'); message = ''; move(); saver.markDirty(); plan = auto ? bot.preview(game) : plan; ui(); };
$('mode-auto').onclick = () => mode(true); $('mode-manual').onclick = () => mode(false);
checkbox('speed').oninput = () => { speedPower = Number(checkbox('speed').value); credit = 0; settings(); ui(); };
for (const id of ['overlay', 'risk']) checkbox(id).onchange = () => { message = ''; document.body.classList.remove('warning'); settings(); ui(); };
checkbox('follow').onchange = () => { renderer.follow = checkbox('follow').checked; renderer.manualUntil = 0; settings(); ui(); };
checkbox('autozoom').onchange = () => { renderer.autozoom = checkbox('autozoom').checked; settings(); ui(); };
$('zoom-in').onclick = () => renderer.zoom(1.2); $('zoom-out').onclick = () => renderer.zoom(1 / 1.2);
$('recenter').onclick = () => renderer.recenter(game);
function closeMenu() {
  $('menu').hidden = true; $('menu-toggle').setAttribute('aria-expanded', 'false');
  $('board').focus({ preventScroll: true });
}
$('menu-toggle').onclick = () => {
  if (!$('menu').hidden) { closeMenu(); return; }
  pause(); $('menu').hidden = false; $('menu-toggle').setAttribute('aria-expanded', 'true');
  $('new-game').focus({ preventScroll: true });
};
$('mobile-controls').onclick = () => { const open = $('control-panel').classList.toggle('controls-open'); $('mobile-controls').setAttribute('aria-expanded', String(open)); };
$('camera-recenter').onclick = () => renderer.recenter(game);
document.addEventListener('pointerdown', e => {
  if (!$('menu').hidden && !document.querySelector('dialog[open]') && e.target instanceof Node && !$('menu').contains(e.target) && !$('menu-toggle').contains(e.target)) closeMenu();
});
$('fullscreen').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { message = 'Fullscreen is unavailable here. Try your browser fullscreen command.'; ui(); }
  closeMenu();
};
$('help').onclick = () => { pause(); closeMenu(); $<HTMLDialogElement>('help-dialog').showModal(); };
$('help-close').onclick = () => $<HTMLDialogElement>('help-dialog').close();
function updateWorldPreview() {
  const width = checkbox('world-width').valueAsNumber, height = checkbox('world-height').valueAsNumber;
  const valid = checkbox('world-width').validity.valid && checkbox('world-height').validity.valid;
  $('world-preview').textContent = valid ? `${fmt(width * height)} cells · ${checkbox('world-wrap').checked ? 'Edges wrap' : 'Solid walls'}` : `Enter whole numbers from 1 to ${fmt(MAX_WORLD_SIDE)} for both sides.`;
}
$('new-game').onclick = () => {
  pause(); checkbox('world-width').value = String(game.width); checkbox('world-height').value = String(game.height);
  checkbox('world-wrap').checked = game.wraparound;
  const size = `${game.width}x${game.height}`;
  $<HTMLSelectElement>('world-preset').value = ['32x24', '64x48', '96x64'].includes(size) ? size : 'custom';
  updateWorldPreview(); closeMenu(); $<HTMLDialogElement>('restart-dialog').showModal();
};
$<HTMLSelectElement>('world-preset').onchange = () => {
  const value = $<HTMLSelectElement>('world-preset').value;
  if (value !== 'custom') { const [width, height] = value.split('x'); checkbox('world-width').value = width; checkbox('world-height').value = height; }
  updateWorldPreview();
};
for (const id of ['world-width', 'world-height']) {
  const input = checkbox(id);
  input.max = String(MAX_WORLD_SIDE);
  input.oninput = () => { $<HTMLSelectElement>('world-preset').value = 'custom'; updateWorldPreview(); };
}
checkbox('world-wrap').onchange = updateWorldPreview;
$('restart-cancel').onclick = () => $<HTMLDialogElement>('restart-dialog').close();
async function reset(width = game.width, height = game.height, wraparound = game.wraparound) {
  if (busy) return; busy = true; running = false; saver.cancel();
  try {
    const nextGame = new Game(undefined, width, height, wraparound);
    if (storageReady) await persistence.clear();
    game = nextGame; auto = false; speedPower = Math.min(speedPower, 9); bot.clear(); charts.reset(); pendingDirections = []; restoreFailed = false;
    rateSteps = 0; rateTime = performance.now(); credit = 0; $('actual').textContent = 'Actual 0 steps/s';
    renderer.scale = 24; renderer.recenter(game, true); message = ''; ready = true;
    $('loading').hidden = true; $<HTMLDialogElement>('restart-dialog').close();
    document.body.classList.remove('warning'); plan = { directions: [], points: [], safe: true, reason: '' }; saver.markDirty(); saver.flush();
  } catch { $('loading-text').textContent = 'Could not clear the save. Reload and try again.'; message = 'Could not start a new game. Your previous save was not replaced.'; }
  finally { busy = false; ui(); }
}
$('world-form').onsubmit = e => { e.preventDefault(); if ($<HTMLFormElement>('world-form').reportValidity()) void reset(checkbox('world-width').valueAsNumber, checkbox('world-height').valueAsNumber, checkbox('world-wrap').checked); };
$('loading-reset').onclick = () => { if (ready || restoreFailed) void reset(); else { startupCancelled = true; $('loading-text').textContent = 'Canceling restore…'; } };
document.querySelectorAll<HTMLButtonElement>('[data-mobile]').forEach(button => button.onclick = () => {
  const id = button.dataset.mobile!, show = !$(id).classList.contains('mobile-open');
  document.querySelectorAll('.chart').forEach(chart => chart.classList.toggle('mobile-open', show && chart.id === id));
  document.querySelectorAll<HTMLButtonElement>('[data-mobile]').forEach(b => b.setAttribute('aria-expanded', String(show && b === button))); charts.invalidate();
});
document.querySelectorAll<HTMLButtonElement>('[data-dir]').forEach(button => button.onpointerdown = e => { e.preventDefault(); steer(Number(button.dataset.dir) as Direction); });
const keys: Record<string, Direction> = { ArrowRight: 0, d: 0, ArrowDown: 1, s: 1, ArrowLeft: 2, a: 2, ArrowUp: 3, w: 3 };
document.addEventListener('keydown', e => {
  if (!$('menu').hidden) { if (e.key === 'Escape') { e.preventDefault(); closeMenu(); } return; }
  if ((e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) || document.querySelector('dialog[open]')) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k in keys) { e.preventDefault(); if (!e.repeat) steer(keys[k]); }
  else if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) toggle(); }
  else if (k === 'f') heldF = true;
  else if (k === 'c') renderer.recenter(game);
});
document.addEventListener('keyup', e => { if (e.key.toLowerCase() === 'f') heldF = false; });
window.addEventListener('blur', () => heldF = false);
let lastTick = performance.now(), credit = 0, lastUI = 0, rateTime = performance.now(), rateSteps = 0, lastMemory = 0;
function tick() {
  const now = performance.now(), dt = Math.min(250, now - lastTick); lastTick = now;
  if (ready && running && !busy) {
    game.elapsed += dt / 1000;
    credit = Math.min(2 ** speedPower, credit + dt / 1000 * 2 ** speedPower);
    const deadline = now + 7; let count = 0;
    while (credit >= 1 && running && performance.now() < deadline && count < 4096) { if (!move()) break; credit--; count++; }
    if (count) saver.markDirty();
    if (now - lastMemory > 3000) { lastMemory = now; if (guard.shouldPause((performance as Performance & { memory?: BrowserHeap }).memory)) pause('High memory usage. Paused and saving progress.'); }
  }
  if (now - rateTime > 1000) { $('actual').textContent = `Actual ${fmt((game.steps - rateSteps) * 1000 / (now - rateTime))} steps/s`; rateSteps = game.steps; rateTime = now; }
  if (ready && now - lastUI > 200) { if (auto) plan = bot.preview(game); ui(); lastUI = now; }
}
setInterval(tick, 8);
function frame() {
  if (ready && !document.hidden) {
    if (auto && !busy) plan = bot.preview(game);
    renderer.render(game, plan, checkbox('overlay').checked !== heldF, running, auto);
    charts.render(game);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => { saver.markDirty(); saver.flush(); if (!document.hidden) { lastTick = performance.now(); charts.invalidate(); } });
window.addEventListener('pagehide', () => { saver.markDirty(); saver.flush(); });
window.addEventListener('resize', () => charts.invalidate());
let startupCancelled = false;
async function main() {
  ui();
  try {
    try { await persistence.open(); storageReady = true; }
    catch { $('save-status').textContent = 'Storage is disabled: progress will only last for this session'; }
    if (storageReady) {
      const saved = await persistence.load(text => $('loading-text').textContent = text);
      if (saved) game = saved;
    }
    if (startupCancelled) { await reset(); return; }
    renderer.recenter(game, true); plan = { directions: [], points: [], safe: true, reason: '' }; ready = true; speedPower = Math.min(speedPower, 9);
    rateSteps = game.steps; rateTime = performance.now(); lastTick = performance.now();
    $('loading').hidden = true; if (game.score > best) { best = game.score; writeLocal('snake-best', String(best)); }
    saver.markDirty(); ui();
  } catch (error) {
    restoreFailed = true;
    $('loading-text').textContent = `Loading failed: ${error instanceof Error ? error.message : String(error)}. You can start a new game.`;
    if (startupCancelled) await reset();
  }
}
void main();
