# Rerouting the free board

The previous planner could take shortcuts on an indexed cycle. On a half-full 256 x 256 board that still left waits of more than 55,000 moves. This version can replace the cycle around the body. Each 2 x 2 tile starts as a closed loop. Joining two components exchanges two facing edges for two crossings. A spanning tree of joins gives one closed, adjacent cycle covering every cell. Body edges constrain which joins are required or forbidden.

The planner tries a short chase and checks whether the resulting body still fits a spanning cycle. When it needs a new route, it connects the food to the body tree, considering both the distance from the head to the attachment and the number of tiles to the food. It attaches other components outside that arc when possible. If it relies on the tail moving, it checks the arrival time on each released cell. Longer routes are reconsidered after the tail advances. On a wrapped board, an older body can first follow a translated cycle after checking the release time of every occupied cell and any intervening food spawns.

The tile planner runs on even-sided boards with both sides at least four and between 4,096 and 65,536 cells. Other shapes and larger boards use the previous planner. The spanning-tree family and bounded search do not exhaust all legal snake paths.

## Matched runs

The baseline is `a02d76c`. Steps count actual game moves. Long intervals exceed 1,024 moves between foods. Peak counts wall-clock milliseconds inside one call to the planner in Node and includes runtime pauses. Runs with the same seed can diverge in later food placement as their bodies occupy different cells.

| Board | Edges | Starting occupancy | Steps, old / new | Long intervals | Longest interval | Peak ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 256 x 256 | Walls | 0% | 53,283 / 52,671 | 0 / 0 | 399 / 399 | 2.7 / 4.14 |
| 256 x 256 | Walls | 8% | 78,934 / 42,146 | 15 / 6 | 5,777 / 9,706 | 5.26 / 9.88 |
| 256 x 256 | Walls | 50% | 501,443 / 42,661 | 27 / 6 | 49,978 / 8,732 | 3.01 / 5.74 |
| 256 x 256 | Walls | 90% | 51,137 / 19,061 | 20 / 8 | 3,662 / 2,493 | 22.53 / 3.21 |
| 256 x 256 | Walls | 98% | 13,400 / 8,843 | 1 / 0 | 1,114 / 855 | 3.68 / 2.62 |
| 256 x 256 | Wrap | 0% | 39,382 / 38,896 | 0 / 0 | 243 / 243 | 3.28 / 2.52 |
| 256 x 256 | Wrap | 8% | 76,484 / 38,020 | 15 / 6 | 5,482 / 5,439 | 26.03 / 9.09 |
| 256 x 256 | Wrap | 50% | 547,995 / 122,773 | 26 / 11 | 54,298 / 20,575 | 6.42 / 5.41 |
| 256 x 256 | Wrap | 90% | 50,813 / 50,813 | 20 / 20 | 3,676 / 3,676 | 12.66 / 19.32 |
| 256 x 256 | Wrap | 98% | 13,629 / 13,629 | 0 / 0 | 931 / 931 | 3.76 / 5.15 |
| 256 x 128 | Walls | 8% | 39,778 / 33,402 | 15 / 9 | 3,010 / 3,495 | 6.05 / 11.98 |
| 256 x 128 | Walls | 50% | 305,029 / 52,038 | 29 / 10 | 32,554 / 7,999 | 3.91 / 2.5 |
| 256 x 128 | Wrap | 8% | 25,315 / 21,928 | 10 / 8 | 2,595 / 2,816 | 4.47 / 3.61 |
| 256 x 128 | Wrap | 50% | 289,781 / 89,320 | 26 / 9 | 32,552 / 16,525 | 2.39 / 3.74 |

Each opening run eats 100 foods. Synthetic occupancy fixtures eat 16, from identical initial bodies, with seeds 42, 91, and 999. The following half-board breakdown also includes seeds 7, 113, and 2026 and three further validation seeds, 5, 71, and 2027.

| Seed | Edges | Steps, old / new | Long intervals | Longest interval | Peak ms |
| ---: | --- | ---: | ---: | ---: | ---: |
| 42 | Walls | 164,908 / 20,711 | 9 / 3 | 45,681 / 6,800 | 4.66 / 5.74 |
| 42 | Wrap | 164,870 / 36,934 | 9 / 4 | 45,635 / 15,262 | 3.93 / 5.41 |
| 91 | Walls | 187,122 / 11,016 | 10 / 1 | 49,978 / 8,732 | 1.83 / 3.86 |
| 91 | Wrap | 199,818 / 44,146 | 10 / 4 | 54,298 / 18,905 | 2.35 / 4.86 |
| 999 | Walls | 149,413 / 10,934 | 8 / 2 | 37,265 / 5,809 | 3.05 / 3.39 |
| 999 | Wrap | 183,307 / 41,693 | 7 / 3 | 36,205 / 20,575 | 4.05 / 5.31 |
| 7 | Walls | 179,068 / 13,271 | 6 / 2 | 55,309 / 8,877 | 0.96 / 3.58 |
| 7 | Wrap | 178,666 / 46,671 | 7 / 2 | 55,301 / 32,796 | 2.39 / 5.17 |
| 113 | Walls | 126,135 / 15,857 | 10 / 2 | 24,100 / 7,596 | 2.49 / 3.09 |
| 113 | Wrap | 118,113 / 46,565 | 10 / 6 | 23,938 / 14,327 | 2.81 / 7.31 |
| 2026 | Walls | 218,011 / 39,243 | 9 / 4 | 44,082 / 20,219 | 3.12 / 3.63 |
| 2026 | Wrap | 198,683 / 50,491 | 8 / 3 | 43,998 / 32,871 | 2.28 / 5.49 |
| 5 | Walls | 165,664 / 12,333 | 8 / 2 | 32,851 / 6,173 | 5.31 / 12.46 |
| 5 | Wrap | 164,592 / 36,199 | 7 / 1 | 32,799 / 32,811 | 3.42 / 7.84 |
| 71 | Walls | 239,487 / 4,788 | 10 / 0 | 58,363 / 517 | 3.31 / 2.18 |
| 71 | Wrap | 245,551 / 55,272 | 10 / 5 | 58,335 / 24,377 | 2.78 / 5.66 |
| 2027 | Walls | 152,785 / 33,390 | 11 / 2 | 32,634 / 21,044 | 1.49 / 3.46 |
| 2027 | Wrap | 152,513 / 37,778 | 11 / 3 | 32,538 / 17,207 | 2.48 / 4.68 |

## Continuous games

Seed 42 played from a fresh 96 x 64 board until it filled all 6,144 cells in both boundary modes. Each band counts moves taken within that interval.

| Occupancy interval | Walls, old / new | Wrap, old / new |
| --- | ---: | ---: |
| 0% to 10% | 62,697 / 58,851 | 48,417 / 37,809 |
| 10% to 20% | 144,737 / 137,143 | 123,129 / 77,927 |
| 20% to 30% | 308,892 / 198,401 | 269,715 / 119,229 |
| 30% to 40% | 629,513 / 220,385 | 639,643 / 154,721 |
| 40% to 50% | 689,557 / 233,776 | 700,224 / 163,369 |
| 50% to 60% | 732,134 / 222,299 | 751,776 / 188,405 |
| 60% to 70% | 735,543 / 200,600 | 791,631 / 190,896 |
| 70% to 80% | 822,294 / 208,963 | 804,650 / 166,435 |
| 80% to 90% | 502,198 / 112,415 | 458,656 / 134,426 |
| 90% to 100% | 52,058 / 49,424 | 53,609 / 56,939 |

Run `SNAKE_BENCH_FILL=.5 SNAKE_BENCH_SEEDS=42,91,999,7,113,2026,5,71,2027 node scripts/benchmark-autoplay.cjs` for the half-board sweep. For continuous games use `SNAKE_BENCH_WIDTH=96 SNAKE_BENCH_HEIGHT=64 SNAKE_BENCH_CONTINUOUS=1 SNAKE_BENCH_UNTIL=1 SNAKE_BENCH_STEP_LIMIT=30000000 SNAKE_BENCH_SEEDS=42 node scripts/benchmark-autoplay.cjs`.

## Runtime and consistency audit

The comparison starts at `ca22652`. The tile solver now reuses its forest and search buffers and stops joining edges once all tiles are connected. The game, renderer and planners look up body segments by numeric cell index. Free cells in a nearly full board still use the same random draws and row-major rank as in older saves.

With at most six empty cells on boards of up to 65,536 cells, autoplay can search for the shortest sequence all the way to victory. It searches in increasing move count, keeping the exact head, heading, free cells, number of released segments, food and RNG. Until the original tail has departed, those values determine every legal successor. The search stops at the original body length or 1,024 stored states and returns a plan only on reaching a win. Other positions continue with the existing planner. On a wraparound board, the planner can translate the return lanes to the rows and columns of the head and food. It compares the number of meals guaranteed during the transition. With equal meal counts it switches lanes only for an earlier bite that saves at least the geometric head-to-food distance. The save records the chosen layout and expiration step. Reloading rechecks the remaining transition against the restored body and projected food spawns.

Two 6 × 4 saved positions dropped from 34 to 16 moves with walls and from 14 to 12 with wrapping. Tests independently enumerate legal moves using the game engine to verify both minima.

### Full games on the 96 × 64 preset

The rows cover complete games from a fresh board. Each ate 6,138 foods. Elapsed time covers the whole simulation. Peak is the longest single planner call, including scheduling pauses. Old and new runs are paired by seed. Timings come from Node on one shared Mac. Host load varied sharply during the run. Per-seed wall-clock maxima include time when the process was descheduled and cannot establish a frame-time bound.

| Seed | Edges | Steps in both | Old / new elapsed (s) | Old / new CPU (s) | Old / new peak (ms) |
| ---: | --- | ---: | ---: | ---: | ---: |
| 42 | Walls | 1,642,257 | 75.57 / 9.62 | 26.40 / 10.10 | 2270.87 / 10.64 |
| 42 | Wrap | 1,290,156 | 20.90 / 33.47 | 16.33 / 14.72 | 93.72 / 651.59 |
| 91 | Walls | 1,627,765 | 26.32 / 13.25 | 18.89 / 13.29 | 196.82 / 46.90 |
| 91 | Wrap | 1,476,443 | 40.84 / 13.30 | 23.05 / 13.29 | 351.69 / 15.33 |
| 999 | Walls | 1,665,129 | 15.47 / 10.35 | 15.39 / 10.90 | 75.06 / 16.25 |
| 999 | Wrap | 1,388,629 | 12.55 / 9.44 | 12.88 / 9.68 | 16.83 / 24.17 |

Total process CPU time across the six games was 112.94 / 71.99 seconds. The slowest call on seed 42 with wrapping rose from 93.72 to 651.59 ms even though the process consumed less CPU over that game.

An isolated repeat of seed 42 ran the new revision first. The walled game took 7.25 / 6.06 seconds with peak calls of 8.73 / 18.60 ms. The wrapped game took 6.46 / 5.35 seconds with peaks of 17.47 / 3.11 ms. Move counts matched the first run.

### Staged 256 × 256 games

Seeds 42, 91, 999, 7, 113 and 2026 start from matched bodies. Each opening collects 100 foods. Synthetic fixtures collect 16 foods or finish the board if fewer remain. A long interval exceeds 1,024 moves between foods. Steps and intervals are totals over six seeds, and the two maxima are taken across those six runs.

| Initial occupancy | Edges | Old / new steps | Old / new long intervals | Old / new longest interval | Old / new peak (ms) |
| --- | --- | ---: | ---: | ---: | ---: |
| 0% | Walls | 104,410 / 104,410 | 0 / 0 | 436 / 436 | 7.39 / 121.47 |
| 0% | Wrap | 77,531 / 77,531 | 0 / 0 | 245 / 245 | 4.16 / 7.06 |
| 8% | Walls | 88,454 / 88,454 | 14 / 14 | 9,706 / 9,706 | 15.25 / 12.67 |
| 8% | Wrap | 83,249 / 73,297 | 14 / 12 | 5,454 / 5,439 | 33.58 / 9.41 |
| 50% | Walls | 111,032 / 111,032 | 14 / 14 | 20,219 / 20,219 | 13.16 / 7.52 |
| 50% | Wrap | 266,500 / 254,132 | 22 / 20 | 32,871 / 32,871 | 11.75 / 68.66 |
| 90% | Walls | 44,096 / 44,096 | 16 / 16 | 3,197 / 3,197 | 13.57 / 31.22 |
| 90% | Wrap | 121,988 / 121,988 | 46 / 46 | 3,745 / 3,745 | 30.53 / 42.46 |
| 98% | Walls | 19,043 / 19,043 | 0 / 0 | 855 / 855 | 13.91 / 6.68 |
| 98% | Wrap | 27,998 / 27,998 | 3 / 3 | 1,178 / 1,178 | 15.28 / 14.47 |
| Last six cells | Walls | 79 / 79 | 0 / 0 | 6 / 6 | 5.99 / 8.47 |
| Last six cells | Wrap | 86 / 86 | 0 / 0 | 6 / 6 | 6.12 / 7.85 |

On six additional wraparound seeds (17, 31, 73, 83, 107, 171), the 8% fixture took 85,152 / 82,596 moves. The 50% fixture took 326,980 moves in both revisions.

A candidate that scored individual tile turns more precisely, and another that tried alternative shortest corridors, both increased aggregate whole-game moves on the three 96 × 64 seeds. They were excluded. The middle of a large wrapped game still has extended waits. The bounded finish search only affects positions where it finds a complete win.

To reproduce the staged sweep, run the following command at each revision with the same benchmark driver. The optional last argument accepts the directory containing compiled planner modules. Reuse the continuous-game command above with `SNAKE_BENCH_SEEDS=42,91,999` for the full-game comparison.

```sh
SNAKE_BENCH_FILL=0,.08,.5,.9,.98,.999908447265625 \
SNAKE_BENCH_SEEDS=42,91,999,7,113,2026 node scripts/benchmark-autoplay.cjs
```

### Browser memory

A standalone headless Chrome 157 instance loaded the production build on macOS with a 1440 × 960 viewport. The board had solid walls. The renderer column gives the largest resident set among that browser's three renderer processes, as reported by the operating system. Heap values come from the Chrome DevTools Protocol without forced garbage collection. These are point-in-time readings and exclude GPU and browser-process memory.

| State | Largest renderer RSS (MiB) | Used JavaScript heap (MiB) |
| --- | ---: | ---: |
| Default board, paused | 140.0 | 1.7 |
| Fresh 256 × 128 board, paused | 151.9 | 2.3 |
| After eight additional restarts | 160.3 | 2.6 |
| After five seconds of maximum-speed autoplay, 329,731 steps | 261.8 | 30.2 |
