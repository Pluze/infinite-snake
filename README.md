# Infinite Snake

[Play online](https://pluze.github.io/infinite-snake/) · [Source](https://github.com/Pluze/infinite-snake) · [Deployment](https://github.com/Pluze/infinite-snake/actions/workflows/pages.yml)

A classic, manually controlled Snake game on a repeating **torus**, with a **64 × 48** default size. The left edge connects to the right edge, and the top connects to the bottom. With Wraparound enabled, what looks endless is the same finite world repeated in every direction, like moving on the surface of a doughnut. Repeated food and snake segments are views of the same objects, not newly generated terrain.

## Play

- **Arrow keys or WASD:** turn and start/resume play. The game starts in manual mode. Direct reversals are ignored.
- **Space / Play button:** start or pause.
- **Mobile:** swipe on the board or use the direction pad to turn and start. Pinch with two fingers to zoom. Open Controls for settings.
- **New game dimensions:** choose Small (32 × 24), Standard (64 × 48), or Large (96 × 64), or enter a custom width and height from 1 to 4,096 cells each. The dialog previews total cells. Dimensions apply only to the new run and are restored with its save. Invalid input leaves the current run intact.
- **Wraparound:** on by default. Turn it off in New game to play within solid walls. The renderer shows a single board, and hitting an edge ends the run. The setting is saved with the board.
- **Food:** each item adds 10 points and one body segment. One food appears at a time. After eating, it respawns on a free cell. Hit your body to end the run; fill the entire world to win.
- **Speed:** manual play defaults to 8 steps/s and offers 1–512 steps/s. Optional autoplay supports requests up to 65,536 steps/s and shows actual throughput separately. Switching back to manual caps speed at 512 steps/s.
- **Optional autoplay:** select Auto, then Play. On large boards, the planner uses bounded A* with tail-release timing, checks different approaches, and can simulate a safe return to a coverage cycle. As the board fills, it can reconnect edges in the free area to bring food forward without leaving new gaps. Route scores account for the current food and the cost of reaching the next one. After manual play or on walled boards without a coverage cycle, the recovery planner checks access to the tail. [Large-board benchmark](docs/autoplay-benchmark.md)
- **Pause before risk:** on by default. It pauses before an immediate collision or an autoplay move without a verified escape route. After a risk pause, turn to choose another direction or disable the assist to continue.

## Camera and interface

The camera starts in free mode. With Follow camera and Adaptive zoom enabled, it tracks the head with forward look-ahead and gradually zooms out as the snake grows. It follows continuous travel coordinates across seams instead of jumping to the other side. In Auto, look-ahead uses upcoming turns. The renderer tiles the same canonical body and food state across the visible area. Dashed seam lines mark repeating region boundaries; they are not walls.

- **Mouse drag / horizontal scroll / Shift-scroll:** pan, temporarily suspending follow for 4.5 seconds. In manual mode, one-finger touchscreen swipes steer instead of panning.
- **Mouse wheel / Ctrl or Command-scroll / pinch / zoom buttons:** adjust zoom and turn off adaptive zoom. At very small scales, the renderer switches to an overview.
- **C / Recenter:** resume following. Follow and adaptive zoom can be toggled independently.
- **F (hold):** temporarily invert route and safety overlays. Green adjacent cells are legal moves; red cells indicate immediate collisions. Autoplay paths are drawn continuously across seams.
- **Menu:** new game, fullscreen, help, and source. Starting a new game from the menu requires confirmation and keeps best score and preferences. After Game over, Play again starts a fresh run with the same board rules, mode, and speed.
- **Interface:** the left toolbar shows the title, score, and a compact dropdown containing only New game, Fullscreen, How to play, and Source code. The right control panel contains playback, Manual/Auto, speed, route visibility, follow, and risk assist. Less-used camera and single-step settings are under More options in that same panel. Opening the dropdown pauses play; click outside or press Escape to close it.
- **Charts stay on the board:** growth at bottom-left and efficiency at bottom-right on desktop. Mobile keeps the original bottom chart buttons and shows one chart at a time. Touch direction controls remain available during manual play. On mobile, playback stays visible and the Controls button expands the other common controls.

The snake uses a single green fill with a pixel outline. The eyes and tapered tail distinguish its ends.

The UI is entirely English and respects the system reduced-motion preference.

## Statistics and persistence

The game records score, length, steps, cumulative food efficiency, active time, and canonical head coordinates. The score tooltip shows the best score; the board keeps an accessible text description of its current state. Charts show length and cumulative food/steps with All, 100k, 10k, and 1k step windows and hover details. Every step's score is retained; display sampling preserves extrema. Efficiency at zero steps is shown as a dash.

IndexedDB atomically stores the finite world (body, food, random-generator state, the adapted cycle, and continuous camera travel) with incremental history blocks of 1,024 values. Saves are batched every 1.5 seconds and flushed on pause, visibility changes, and page exit. Abrupt termination may lose recent unfinished writes. Preferences and best score use localStorage. Reloading starts paused in manual mode.

The torus version uses a new `infinite-snake-torus-v2` database. The previous unbounded-world database is left untouched; those runs cannot be mapped onto a smaller torus without potentially overlapping the body, so a fresh torus run is created. Browser data removal deletes local saves. Local and online origins have separate progress.

Background play depends on browser throttling and freezing; missed time is not replayed. On browsers with heap telemetry, two readings above 85% or one above 95% trigger a pause and save. The map is finite and bounded; per-step history still grows with run duration. Autoplay rates are requests, not hardware-independent guarantees.

## Run locally

Requires Node.js 20+; CI uses Node.js 22.

```sh
npm ci
npm start
```

Open http://127.0.0.1:5174. On macOS, double-click `start.command`. It uses Node.js on your PATH or an optional ignored project-local `.runtime`; it does not depend on another project checkout. Production output is a static site with no backend or API keys.

## Validation and deployment

```sh
npm run ci
npx playwright install chromium
npm run test:browser
```

Unit tests cover all four seams, repeated-coordinate identity, continuous camera travel, seam collisions, vacating-tail moves, single-food respawning, bounded repeated laps, filling the world, four-direction autoplay, full-board completion on even and odd dimensions, move-count comparisons against cycle-only play, and exact save restoration including future random food placement. Browser tests cover keyboard-started manual play, wrapping, pause, mobile swipes and direction pads, autoplay, charts, restart, risk assist, camera recovery, and persistence. Desktop emulation does not replace real iOS-device testing.

Pushes to `main` run checks and Chromium tests before deploying GitHub Pages. Set Settings → Pages → Source to GitHub Actions. Vite uses relative asset paths for the `/infinite-snake/` subpath.

## Acknowledgment

Thanks to the [Infinite Minesweeper fork](https://github.com/Pluze/infinite-minesweeper) for the original inspiration.

The game uses procedural Canvas graphics and system fonts. Its chart sampler, save scheduler, memory monitor, and number formatter are implemented for this project.

MIT. See [LICENSE](LICENSE).
