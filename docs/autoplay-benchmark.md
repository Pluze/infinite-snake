# 256 × 256 autoplay benchmark

The baseline is the deployed revision `fd451ca`. Both boundary modes use seeds 42, 91, and 999. Opening runs collect 100 foods from a fresh board. The other runs start at 8%, 50%, 90%, or 98% occupancy with a contiguous body and collect 16 foods each. The benchmark executes every move and fails on an unsafe move or if a run exceeds two million steps.

Peak planning time is the maximum measured wall-clock time of an `AutoPlayer.nextMove` call in Node.js, including garbage collection and scheduling. Long routes are intervals of more than 1,024 actual moves between meals. The geometric lower bound sums head-to-food Manhattan distances at the start of each interval, taking the shorter distance on each wrapped axis. Different routes can change later food placement, so each lower bound applies to its own run.

Run `node scripts/benchmark-autoplay.cjs` to reproduce the measurements. The script also accepts the path to another revision's compiled TypeScript output.

| Boundary | Initial occupancy | Seed | Actual steps | Peak planning (ms) | Long routes | Longest meal (steps) | Geometric lower bound |
|---|---:|---:|---:|---:|---:|---:|---:|
| Walls | Opening | 42 | 23,294 → 18,108 | 2.95 → 4.22 | 0 → 0 | 739 → 365 | 17,510 → 17,510 |
| Walls | Opening | 91 | 21,591 → 17,001 | 1.53 → 2.22 | 0 → 0 | 645 → 399 | 16,423 → 16,423 |
| Walls | Opening | 999 | 22,878 → 19,798 | 1.36 → 1.93 | 0 → 0 | 632 → 379 | 18,518 → 18,726 |
| Walls | 8% | 42 | 43,324 → 27,676 | 3.29 → 17.35 | 8 → 5 | 5,451 → 5,678 | 2,760 → 2,760 |
| Walls | 8% | 91 | 49,273 → 26,826 | 3.15 → 10.55 | 9 → 6 | 5,496 → 5,699 | 2,597 → 2,496 |
| Walls | 8% | 999 | 39,002 → 35,465 | 4.04 → 7.56 | 7 → 7 | 5,780 → 5,537 | 2,966 → 2,971 |
| Walls | 50% | 42 | 241,724 → 174,658 | 4.93 → 14.17 | 13 → 11 | 33,416 → 21,939 | 2,696 → 2,554 |
| Walls | 50% | 91 | 311,928 → 259,627 | 7.09 → 9.23 | 9 → 9 | 44,956 → 47,322 | 1,950 → 2,991 |
| Walls | 50% | 999 | 225,138 → 197,339 | 3.05 → 7.34 | 11 → 6 | 48,913 → 32,634 | 2,830 → 2,861 |
| Walls | 90% | 42 | 46,903 → 13,067 | 4.61 → 35.19 | 12 → 5 | 6,402 → 2,359 | 1,969 → 1,391 |
| Walls | 90% | 91 | 52,144 → 18,979 | 3.49 → 11.17 | 13 → 8 | 6,322 → 3,180 | 1,902 → 1,499 |
| Walls | 90% | 999 | 55,979 → 19,091 | 1.14 → 7.20 | 16 → 7 | 6,493 → 3,662 | 1,883 → 1,529 |
| Walls | 98% | 42 | 11,404 → 3,881 | 1.11 → 3.32 | 5 → 0 | 1,288 → 623 | 1,790 → 1,569 |
| Walls | 98% | 91 | 9,515 → 4,777 | 1.11 → 3.43 | 3 → 0 | 1,195 → 846 | 1,105 → 1,315 |
| Walls | 98% | 999 | 9,465 → 4,742 | 2.69 → 7.24 | 5 → 1 | 1,135 → 1,114 | 1,255 → 1,250 |
| Wraparound | Opening | 42 | 16,104 → 14,140 | 4.36 → 6.62 | 0 → 0 | 402 → 304 | 12,882 → 12,882 |
| Wraparound | Opening | 91 | 15,811 → 13,371 | 1.72 → 1.62 | 0 → 0 | 450 → 272 | 12,173 → 12,173 |
| Wraparound | Opening | 999 | 17,002 → 14,397 | 1.41 → 1.85 | 0 → 0 | 405 → 294 | 13,698 → 13,827 |
| Wraparound | 8% | 42 | 43,180 → 37,848 | 4.92 → 18.34 | 8 → 7 | 5,355 → 5,510 | 2,248 → 2,248 |
| Wraparound | 8% | 91 | 48,927 → 27,385 | 2.76 → 11.64 | 9 → 5 | 5,410 → 5,634 | 1,965 → 1,965 |
| Wraparound | 8% | 999 | 38,122 → 27,285 | 2.72 → 7.98 | 7 → 6 | 5,368 → 5,484 | 2,132 → 2,273 |
| Wraparound | 50% | 42 | 217,408 → 155,080 | 2.71 → 9.64 | 14 → 9 | 25,646 → 25,132 | 2,096 → 1,988 |
| Wraparound | 50% | 91 | 302,447 → 259,487 | 4.11 → 3.25 | 9 → 9 | 45,229 → 47,576 | 1,621 → 1,945 |
| Wraparound | 50% | 999 | 216,240 → 197,233 | 3.10 → 8.47 | 13 → 6 | 41,658 → 32,612 | 2,340 → 2,295 |
| Wraparound | 90% | 42 | 47,111 → 12,435 | 3.37 → 7.56 | 12 → 5 | 6,426 → 1,943 | 1,183 → 1,033 |
| Wraparound | 90% | 91 | 52,146 → 19,107 | 3.01 → 7.16 | 13 → 8 | 6,402 → 3,210 | 1,480 → 1,189 |
| Wraparound | 90% | 999 | 56,041 → 19,271 | 0.98 → 12.56 | 16 → 7 | 6,519 → 3,676 | 1,395 → 1,289 |
| Wraparound | 98% | 42 | 11,474 → 4,250 | 1.08 → 7.48 | 5 → 0 | 1,296 → 838 | 1,126 → 1,270 |
| Wraparound | 98% | 91 | 9,607 → 4,860 | 1.12 → 6.53 | 3 → 0 | 1,200 → 931 | 875 → 1,052 |
| Wraparound | 98% | 999 | 9,603 → 4,519 | 3.68 → 3.28 | 5 → 0 | 1,291 → 704 | 871 → 1,123 |

## Algorithm

With a known random seed, the minimum full-game move count corresponds to a shortest path over states that contain the ordered body, heading, food position, and random generator state. For random food placement, the goal can instead be framed as a Markov decision process that maximizes the probability of filling the board and then minimizes the expected move count. The published complexity results concern more general grid models. [The Complexity of Snake](https://pure.tue.nl/ws/files/62033115/24.pdf)

The planner uses bounded A* with tail-release times to generate approaches with different arrival directions. It simulates escapes using the game's collision, growth, and spawning rules. At higher occupancy it can rearrange the free part of a Hamiltonian cycle while preserving body order. It also estimates the wait if the next food lands in a gap in the body arc. Bounded search can still miss shorter feasible routes. [Safe Interval Path Planning](https://publications.ri.cmu.edu/sipp-safe-interval-path-planning-for-dynamic-environments) · [Winning Snake](https://doi.org/10.1017/S1471068424000267)

AlphaSnake combines a learned policy with tree search. Its experiments used 10 × 10 boards, so they do not establish real-time performance for this project's 256 × 256 boards. [AlphaSnake](https://arxiv.org/abs/2211.09622)

## Smaller presets and rectangular boards

The comparison below uses the preceding English-history revision, `3e75a70`, as the baseline. Use `SNAKE_BENCH_WIDTH=96 SNAKE_BENCH_HEIGHT=64 SNAKE_BENCH_FILL=0,.24,.5` with the benchmark command for the smaller preset, or set `SNAKE_BENCH_HEIGHT=128 SNAKE_BENCH_FILL=.08` for the rectangular board. Midgame fixtures on the 96 × 64 board use its previous cycle layout so both versions resume the same body. Values sum seeds 42, 91, and 999 in solid-wall mode.

| Board and initial occupancy | Actual steps | Long routes |
|---|---:|---:|
| 96 × 64, opening | 32,667 → 20,209 | 0 → 0 |
| 96 × 64, 24% | 21,759 → 21,390 | 11 → 9 |
| 96 × 64, 50% | 14,387 → 14,387 | 4 → 4 |
| 256 × 128, 8% | 50,411 → 40,359 | 19 → 16 |

At 24% occupancy, the 96 × 64 wall-board runs took 10,725 → 6,156 steps for seed 42, 6,153 → 5,094 for seed 91, and 4,881 → 10,140 for seed 999. The same headless Node.js run measured a peak planning call of 7.18 → 14.65 ms across these three samples. This measurement includes runtime pauses and does not measure browser frame rate.
