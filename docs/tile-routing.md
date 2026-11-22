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
