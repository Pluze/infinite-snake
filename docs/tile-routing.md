# Rerouting the free board

The previous planner could take shortcuts on an indexed cycle. On a half-full 256 x 256 board that still left waits of more than 55,000 moves. This version can replace the cycle around the body. Each 2 x 2 tile starts as a closed loop. Joining two components exchanges two facing edges for two crossings. A spanning tree of joins gives one closed, adjacent cycle covering every cell. Body edges constrain which joins are required or forbidden.

The planner tries a short chase and checks whether the resulting body still fits a spanning cycle. When it needs a new route, it connects the food to the body tree, pricing the walk from the head to the attachment and then from the landing corner to the food. It attaches other components outside that arc when possible. If it relies on the tail moving, it checks the arrival time on each released cell. Longer routes are reconsidered after the tail advances. On a wrapped board, an older body can first follow a translated cycle after checking the release time of every occupied cell and any intervening food spawns.

The tile planner covers walled rectangles with sides of at least two and 4,096 to 65,536 cells, plus smaller odd-by-odd walled boards with both sides at least three. Wrapped boards use the tile planner for even sides of at least four and 4,096 to 65,536 cells. The spanning-tree family and bounded search do not exhaust all legal snake paths.

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

## Dynamic costs for tile entrances and free-arc edits

For a fixed starting body, every win eats the same number of foods. Minimizing moves to victory therefore maximizes the final foods-per-step ratio. With a known RNG state, a full-game value function would assign zero to a win, infinite cost to a loss and the minimum of one plus each legal successor's value to an ongoing position. The ordered body, heading, food and RNG all affect that successor. The two calculations below solve smaller subproblems that preserve a route to safety. The live planner still uses bounded search, and future spawns can make a longer first bite preferable. The formulation uses the standard cost-to-go recurrence. [Bertsekas, Dynamic Programming](https://web.mit.edu/dimitrib/www/Bertsekas1987DP.pdf)

**Tile entrances.** The reverse breadth-first search gives the minimum number of free tiles to cross. The planner memoizes the remaining move count for each tile and landing corner needed by a reachable entrance. A stack follows decreasing tile depth and reuses the search buffers. An exit that attains the geometric lower bound finishes that state immediately. It considers every legal exit one layer closer to the goal. The candidate costs are the number of cell moves to the exit, one crossing move and the stored value at the next landing corner. On the goal tile the value is the perimeter distance to the food. The direction around the tile comes from the live body. Each state takes at most four transitions. A predecessor is retained to reconstruct the branch. This minimizes cell moves over minimum-hop tile branches before the remaining components are attached. Completing the spanning cycle can force additional detours. The extra cost and predecessor buffers are allocated on demand and use 320 KiB on a 256 × 256 board.

**Free-arc edits.** When the food lies between the head and tail on a materialized cycle, one sweep considers reversing a free segment or exchanging two linked pairs of edges. For cuts where the food falls inside the middle segment, the optimal outer cut minimizes its span among ends beyond the inner cut. A prefix-minimum tree over reversed endpoints answers that query. For food in the last segment, only the existence of a compatible outer cut matters. Each sweep finds the shortest first bite in this edit family in O(F log(F + 1)) time and O(F) scratch space for a free arc of length F. The planner repeats strictly improving edits until reaching the geometric lower bound, exhausting the edit family or spending its work allowance of three board lengths. Charging by actual free-arc length replaces the fixed edit counts. The occupied arc and its orientation survive every edit.

An independent small-board test enumerates reversals and four-cut permutations, checks each resulting edge and compares its minimum with the sweep. A walled 8 × 6 fixture previously took 27 steps to the food. The corner planner reaches it safely in seven, matching the Manhattan lower bound.

### Matched benchmarks against `00fe8e3`

Each pair below gives baseline / new. The staged 256 × 256 runs use seeds 42, 91, 999, 7, 113 and 2026. The opening collects 100 foods per seed. Each synthetic body collects 16, or all six on the last fixture. Steps and long intervals are summed over seeds. A long interval exceeds 1,024 moves. Peak is the slowest individual call to `nextMove`, measured with a wall clock in Node on a shared Mac and including descheduling. The baseline was independently recompiled and compared byte for byte with the benchmark modules.

| Occupancy | Edges | Moves | Long intervals | Longest interval | Peak ms |
| --- | --- | ---: | ---: | ---: | ---: |
| 0% | Walls | 104,410 / 104,408 | 0 / 0 | 436 / 436 | 4.73 / 5.94 |
| 0% | Wrap | 77,531 / 77,531 | 0 / 0 | 245 / 245 | 3.00 / 3.80 |
| 8% | Walls | 88,454 / 88,422 | 14 / 14 | 9,706 / 9,706 | 18.38 / 10.26 |
| 8% | Wrap | 73,297 / 73,273 | 12 / 12 | 5,439 / 5,439 | 7.02 / 10.92 |
| 50% | Walls | 111,032 / 111,368 | 14 / 14 | 20,219 / 20,215 | 7.99 / 27.16 |
| 50% | Wrap | 254,132 / 254,116 | 20 / 20 | 32,871 / 32,871 | 40.00 / 46.04 |
| 90% | Walls | 44,096 / 43,564 | 16 / 15 | 3,197 / 3,200 | 4.37 / 7.72 |
| 90% | Wrap | 121,988 / 45,758 | 46 / 7 | 3,745 / 4,718 | 29.16 / 22.82 |
| 98% | Walls | 19,043 / 19,043 | 0 / 0 | 855 / 855 | 3.88 / 3.97 |
| 98% | Wrap | 27,998 / 25,264 | 3 / 4 | 1,178 / 1,178 | 8.78 / 8.23 |
| Last six | Walls | 79 / 79 | 0 / 0 | 6 / 6 | 6.46 / 5.67 |
| Last six | Wrap | 86 / 86 | 0 / 0 | 6 / 6 | 7.48 / 7.02 |

Six additional seeds (17, 31, 73, 83, 107, 171) used the same fixtures.

| Occupancy | Edges | Moves | Long intervals | Longest interval | Peak ms |
| --- | --- | ---: | ---: | ---: | ---: |
| 8% | Walls | 98,987 / 99,111 | 15 / 15 | 10,748 / 10,748 | 14.25 / 15.23 |
| 8% | Wrap | 82,596 / 88,048 | 16 / 16 | 6,053 / 6,053 | 9.22 / 13.87 |
| 50% | Walls | 123,111 / 125,611 | 21 / 22 | 15,070 / 15,070 | 8.90 / 5.26 |
| 50% | Wrap | 326,980 / 327,008 | 25 / 25 | 32,975 / 32,975 | 22.06 / 15.60 |
| 90% | Walls | 38,843 / 38,815 | 9 / 9 | 4,116 / 4,116 | 24.00 / 8.59 |
| 90% | Wrap | 83,296 / 40,006 | 29 / 6 | 4,653 / 5,158 | 38.07 / 68.59 |
| 98% | Walls | 19,490 / 18,959 | 0 / 0 | 809 / 809 | 4.83 / 20.63 |
| 98% | Wrap | 25,056 / 22,103 | 3 / 3 | 1,133 / 1,133 | 55.17 / 12.48 |

The following 96 × 64 games ran from the initial body to a win. Each ate 6,138 foods. The band totals below include the same three seeds throughout each game.

| Seed | Edges | Moves | Long intervals | CPU seconds | Peak ms |
| ---: | --- | ---: | ---: | ---: | ---: |
| 42 | Walls | 1,642,257 / 1,670,246 | 431 / 445 | 7.84 / 9.30 | 46.04 / 22.44 |
| 42 | Wrap | 1,290,156 / 1,336,536 | 223 / 253 | 6.61 / 7.09 | 13.83 / 18.54 |
| 91 | Walls | 1,627,765 / 1,597,923 | 408 / 415 | 7.26 / 8.06 | 10.73 / 17.89 |
| 91 | Wrap | 1,476,443 / 1,367,160 | 276 / 269 | 7.27 / 7.06 | 3.04 / 26.40 |
| 999 | Walls | 1,665,129 / 1,698,409 | 455 / 434 | 7.31 / 8.02 | 2.93 / 7.04 |
| 999 | Wrap | 1,388,629 / 1,337,134 | 244 / 228 | 6.85 / 6.60 | 14.33 / 2.42 |

| Occupancy band | Wall moves | Wall peak ms | Wrap moves | Wrap peak ms |
| --- | ---: | ---: | ---: | ---: |
| 0-10% | 192,017 / 182,300 | 2.93 / 2.10 | 114,159 / 113,988 | 3.04 / 1.08 |
| 10-20% | 414,534 / 397,415 | 1.55 / 3.14 | 233,430 / 231,388 | 1.18 / 2.42 |
| 20-30% | 568,158 / 552,127 | 46.04 / 2.54 | 348,642 / 350,669 | 14.33 / 5.34 |
| 30-40% | 651,516 / 669,808 | 2.47 / 22.44 | 464,935 / 458,188 | 10.25 / 2.06 |
| 40-50% | 697,501 / 684,348 | 18.05 / 1.80 | 545,749 / 529,534 | 13.83 / 18.54 |
| 50-60% | 689,333 / 697,054 | 7.61 / 17.89 | 595,218 / 631,550 | 2.16 / 2.05 |
| 60-70% | 657,933 / 634,988 | 10.73 / 0.99 | 580,280 / 634,766 | 2.27 / 26.40 |
| 70-80% | 552,441 / 565,041 | 1.19 / 2.36 | 623,963 / 561,627 | 1.36 / 1.74 |
| 80-90% | 363,685 / 415,270 | 2.09 / 1.45 | 478,115 / 372,177 | 2.29 / 1.81 |
| 90-100% | 148,033 / 168,227 | 2.13 / 1.32 | 170,737 / 156,943 | 0.70 / 0.73 |

At half occupancy on wrapped seed 2026, the food appeared 159 cells away at step 237. Of the next 32,871 moves, 32,770 followed the transition cycle until the old body cleared, and 101 followed the subsequent food route. Seed 7 also spent 32,770 moves on a single transition. At 90% occupancy the new planner substantially reduces the number of long intervals on both wrapped seed sets, while the single longest interval grows in both. On the extra seeds the wrapped 8% fixture and the walled 50% fixture also cost more moves. A candidate that handed control back as soon as the retained body fitted the tile constraints and another that prioritized an earlier bite on a newly materialized cycle both increased midgame movement in the staged tests and were excluded.

Use the staged and continuous commands above to reproduce the measurements at each revision. For the additional seeds set `SNAKE_BENCH_FILL=.08,.5,.9,.98` and `SNAKE_BENCH_SEEDS=17,31,73,83,107,171`.

The two staged batches ran sequentially without a concurrent build or browser test. Across all 120 staged runs, process CPU time was 15.65 / 14.95 seconds. An earlier run with concurrent workloads had worst observed single calls of 278.35 / 195.16 ms. The six complete games used 43.15 / 46.14 CPU seconds for 9,090,379 / 9,007,408 moves. On the extra wrapped 90% seeds, the longest wait rose to 5,158 steps even though the batch total fell by 52%. In the Chrome regression for restoring legacy progress and starting a fresh 256 × 128 game, the new page used 2.5 MiB of JavaScript heap after collection. This measurement excludes native browser and graphics allocations.

## Direct routes and future food access

The original benchmark compared additional certified paths on boards with two even dimensions of at least four and 4,096 to 65,536 cells. Smaller boards retain their existing multi-food and endgame planners. The planner tries both one-turn Manhattan paths and alternative arrival directions. A wrapped board supports four alignments of the tile lattice. When two direct paths admit a full-board cycle, a breadth-first search on each projected body measures the extra distance from the bite to other free cells. Every reachable cell contributes its obstacle distance divided by its geometric distance, minus one. A disconnected free cell incurs a penalty of width plus height. This static-body estimate ranks paths. Separate tail-release checks and spanning-cycle completion certify them. The planner can also replay several seeded food spawns before certifying the resulting body. Its longer search and access estimates trade calculation time for additional route choices.

Each row below compares the historical standard / growth modes on six seeds (42, 91, 999, 7, 113, 2026), 16 foods per seed on a 256 × 256 board. Weighted stretch is total moves divided by the sum of the geometric distances at spawn. Worst stretch is the largest individual meal ratio. Both account for wraparound. Peak is the longest observed planner call in milliseconds on a shared Mac.

| Edges | Initial fill | Steps | Turns | Weighted stretch | Worst stretch | Peak ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Walls | 8% | 88,422 / 80,555 | 2,482 / 2,121 | 5.31 / 4.77 | 88.24 / 98.2 | 23.98 / 24.33 |
| Walls | 50% | 111,368 / 108,748 | 6,516 / 6,034 | 8.80 / 8.59 | 106.25 / 106.25 | 48.87 / 7.49 |
| Walls | 90% | 43,564 / 45,270 | 4,552 / 5,150 | 4.25 / 4.39 | 34.4 / 68.89 | 13.13 / 14.35 |
| Walls | 98% | 19,043 / 19,082 | 1,715 / 1,869 | 2.17 / 2.11 | 73 / 68.33 | 6.54 / 12.79 |
| Wrap | 8% | 73,273 / 64,737 | 1,579 / 1,251 | 5.79 / 5.09 | 59.06 / 58.82 | 18.06 / 13.79 |
| Wrap | 50% | 254,116 / 246,904 | 4,912 / 4,436 | 25.31 / 24.14 | 284.33 / 298.33 | 62.44 / 62.3 |
| Wrap | 90% | 45,758 / 45,758 | 956 / 956 | 6.06 / 6.06 | 59.44 / 59.44 | 45.59 / 52.94 |
| Wrap | 98% | 25,264 / 25,264 | 544 / 544 | 3.88 / 3.88 | 162.6 / 162.6 | 16.54 / 31.39 |

Fresh games used seeds 42, 91 and 999. Each 32 × 24 game ran to a win. Each 256 × 256 game collected 1,500 foods.

| Size | Edges | Moves (standard / growth) | Turns (standard / growth) |
| --- | --- | ---: | ---: |
| 32 × 24 | Walls | 121,243 / 111,402 | 34,958 / 22,202 |
| 32 × 24 | Wrap | 103,452 / 88,290 | 38,572 / 21,007 |
| 256 × 256 | Walls | 1,310,208 / 1,314,036 | 30,784 / 29,910 |
| 256 × 256 | Wrap | 773,937 / 734,501 | 20,546 / 16,997 |

These tables compare the two historical policies in revision 59ca2b8. The current planner integrates certified direct routes, alternative arrival headings and bounded multi-meal search automatically. Its multi-meal search budget scales with body length and the distance to food. The benchmark runs the same planner as the game.

The integrated planner was run on the same six seeds. Openings collected 100 foods per seed and staged bodies collected 16. Long meals took more than 1,024 moves. Peak times are observed Node wall-clock timings with other tests running.

| Edges | Initial fill | Steps | Weighted stretch | Worst stretch | Long meals | Peak ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Walls | 0% | 104,418 | 1.000 | 1.05 | 0 | 4.10 |
| Walls | 8% | 80,555 | 4.769 | 98.20 | 13 | 10.63 |
| Walls | 50% | 108,748 | 8.590 | 106.25 | 14 | 17.30 |
| Walls | 90% | 45,270 | 4.390 | 68.89 | 16 | 5.78 |
| Walls | 98% | 19,082 | 2.111 | 68.33 | 0 | 6.50 |
| Wrap | 0% | 77,426 | 1.001 | 1.57 | 0 | 8.52 |
| Wrap | 8% | 64,737 | 5.093 | 58.82 | 13 | 9.12 |
| Wrap | 50% | 246,904 | 24.140 | 298.33 | 16 | 43.13 |
| Wrap | 90% | 45,758 | 6.064 | 59.44 | 7 | 29.99 |
| Wrap | 98% | 25,264 | 3.876 | 162.60 | 4 | 19.66 |

## Shortening a certified food route

For a meal spawned at step s and eaten at t, its cost is t − s. Its stretch is that cost divided by the wall-aware or wrap-aware Manhattan distance at spawn. This is a lower bound even for a moving snake because every legal move crosses one grid edge. The in-game chart also displays cost divided by width plus height, a separate normalization independent of spawn location.

A Hamiltonian cycle containing the snake in order supplies a safe continuation. Reusing such a witness across food placements has also been studied using answer set programming. A head's ability to enter a body cell depends on its arrival time and the tail's release time. Safe-interval planning models time-dependent occupancy, although Snake also moves its own obstacles and cannot wait in place. These observations motivate the certificate and release checks here. Neither paper establishes a food-efficiency optimum for this implementation. [Winning Snake](https://arxiv.org/abs/2408.08150) · [Safe Interval Path Planning](https://www.cs.cmu.edu/~maxim/files/sipp_icra11.pdf)

When the free area exceeds the body length and the available certified route exceeds twice the geometric lower bound, the planner tests additional two-turn shortest paths. For a shortest route of length d, every candidate retains the same suffix of the original body at the bite. A tile alignment incompatible with that suffix can be excluded from all those checks. Boundary joins that require opposite states are indexed by their most recent conflicting body edge so a retry can reject an impossible suffix early.

If the efficient geometric candidates fail, number the cells of the certified arc from the head at 0 to the food at n. Connect i to every adjacent later cell j, including the original successor. On this directed acyclic graph the exact remaining distance satisfies D(n) = 0 and D(i) = 1 + min D(j). A reverse pass solves it in O(n) time since each cell has at most four neighbors. The reconstructed route must pass both the arrival-time collision checks and a new spanning-cycle check at the bite. A failed check leaves the original route available. Optimality applies only to the graph before those extra constraints. A retry with an existing plan also stops tracing an alternative once it cannot improve the incumbent length.

A straight body immediately after a bite admits an exact shortcut for scoring future access. Every off-axis target has a shortest path that moves perpendicular to the body first. Only free cells directly beyond the tail can incur a detour. Going around the body on the adjacent parallel line adds two moves, and a wrapping board may offer a shorter passage along the other direction of the same line. Summing over just that ray replaces a board-wide flood fill in this case.

The walled 96 × 64 regression fixture places the head and food 80 moves apart. The old planner initially displayed a 5,730-move arc and ate after 868 actual moves as it replanned. The new planner ate in 80 actual moves. The regression advances the production controller through every move.

Paired 256 × 256 runs used 13 seeds per topology. Fresh boards ran for 100 meals per seed. Constructed states at each higher occupancy ran for 16 meals per seed. Steps are totals across seeds. Peak time is the slowest individual planner call observed in Node, including runtime pauses.

| Boundary | Initial fill | Previous steps | Revised steps | Previous peak (ms) | Revised peak (ms) |
|---|---:|---:|---:|---:|---:|
| Walls | 0% | 223,937 | 223,937 | 16.22 | 4.10 |
| Walls | 8% | 196,561 | 195,655 | 12.83 | 14.02 |
| Walls | 50% | 266,265 | 266,265 | 23.81 | 23.24 |
| Walls | 90% | 101,669 | 101,669 | 7.48 | 5.13 |
| Walls | 98% | 41,854 | 41,854 | 6.15 | 15.84 |
| Wrap | 0% | 167,063 | 167,063 | 7.07 | 4.98 |
| Wrap | 8% | 155,087 | 154,923 | 10.59 | 12.15 |
| Wrap | 50% | 599,949 | 599,949 | 39.90 | 70.93 |
| Wrap | 90% | 100,045 | 100,045 | 39.59 | 31.54 |
| Wrap | 98% | 49,076 | 49,076 | 28.39 | 73.46 |

On 96 × 64 boards grown naturally to half full (seeds 13, 71 and 317), walled runs used 2,513,148 moves versus 2,536,847 previously. Wrapped runs used 1,671,602 versus 1,709,454. Total CPU time rose from 10.98 to 12.95 seconds with walls and from 7.82 to 8.55 seconds with wrapping. Long detours remain possible. Both 64 × 64 seed-211 games reached full occupancy.

## Walled boards with odd sides

A grid move switches checkerboard color. An odd-by-odd rectangle has unequal color counts, so a cycle visiting every cell exactly once cannot exist. The old controller fell back to chasing food and checking tail reachability. When no food route passed, it tested escape moves again at each step. This could consume most of the simulation budget, trap the snake, or repeat the same body configuration without ever reaching the food.

The new planner extends boundary tiles into 2x3 or 3x2 perimeter loops. With two odd sides the southeast tile covers eight of its nine cells. Two diagonal cells share the same two perimeter neighbors, so either can occupy the same position in that loop. The planner can switch the omitted cell at a bite, after checking the old cell has cleared the retained body, or on the winning move. The full route still uses actual grid coordinates, including the additional boundary cells. A restored position outside this family can use recovery. Once recovery has spent twice the board area without a bite, it can detect a repeated body and heading and stop autoplay.

Complete runs below started fresh with seeds 42, 91 and 999. Each triple lists actual moves to victory in that order. The old 37x37 runs each went 4,107 consecutive moves without food and were stopped. Runs from screenshots cannot be replayed exactly without their starting seeds.

| Walled size | New moves to victory |
|---|---|
| 37x37 | 127,697 / 117,661 / 131,151 |
| 37x47 | 164,057 / 162,335 / 163,733 |
| 67x47 | 500,503 / 513,837 / 495,545 |
| 78x79 | 1,865,807 / 1,691,244 / 1,575,263 |
| 79x79 | 1,844,813 / 1,768,017 / 1,734,497 |

The old 78x79 runs took 4,751,397 / 4,821,182 / 4,814,530 moves. Total meals longer than 1,024 moves fell from 4,179 to 1,366. On 79x79 seed 42, the first 10% fill took 56,208 moves previously and 68,250 after the change. In that phase the old controller reported tail recovery on 55,923 moves and the new controller on zero. The slowest observed planning call fell from 35.19 to 3.25 ms in this Node run. Timing depends on host load. One meal later in the same revised game still took 6,192 moves.
