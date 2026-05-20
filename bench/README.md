# Benchmarks

Microbenchmarks for `@lickle/rx` using [mitata](https://github.com/evanwashere/mitata), with a thin comparator that diffs the working tree against saved snapshots or arbitrary git refs.

## Layout

```
bench/
  cmp.ts                       runner: save / diff snapshots
  <bench>/
    bench.ts                   mitata entry; honors BENCH_JSON=1
    snapshots/
      baseline.json            checked-in baseline
      <short-sha>.json         cached ref results (auto-written by diff)
```

Each `bench/<bench>/bench.ts` calls mitata's `run(...)` and switches to JSON output when `BENCH_JSON=1` is set:

```ts
await run({ format: process.env['BENCH_JSON'] ? { json: { samples: false } } : 'mitata' })
```

## Commands

```sh
pnpm bench                          # interactive mitata run of the default bench (core)
pnpm bench:save <bench> [name]      # write current results to bench/<bench>/snapshots/<name>.json
pnpm bench:diff <bench> [target...] # diff current vs snapshot name(s) or git ref(s)
```

Targets:

- A bare name resolves to `bench/<bench>/snapshots/<name>.json`.
- A git rev (sha, branch, tag, `HEAD~3`, …) is checked out via `git archive` into `.bench-cache/<sha>/`, the bench tree is overlaid for a stable harness, and the results are cached to `bench/<bench>/snapshots/<short-sha>.json` for re-use.

Default diff target is `baseline`.

## Examples

```sh
pnpm bench:save core                # save baseline
pnpm bench:diff core                # current vs baseline
pnpm bench:diff core HEAD~1         # current vs previous commit
pnpm bench:diff core main v0.1.16   # current vs two refs side-by-side
```

## Output

Each row shows current `avg`, target `avg`, and `Δ` (% change). Δ is grey for noise (<2%), green for faster, red for slower:

```
bench                                            current      baseline    Δ
subject.next / 1 sub × 1000 emits                4.57 µs      14.89 µs   -69.3%
operator chains / map x1 over subject 1000 emits 10.84 µs     20.94 µs   -48.2%
```

## Adding a new bench

```sh
mkdir -p bench/<name>
$EDITOR bench/<name>/bench.ts
pnpm bench:save <name>
```

## Notes

- `.bench-cache/` is git-ignored; it stores extracted worktrees keyed by sha. Safe to delete.
- The bench harness is always overlaid from the current tree before running, so the only thing that varies between checkouts is `src/`. This lets you re-run benches against historical commits without porting bench changes back in time.
- Vitest is configured to ignore `.bench-cache/` and `bench/` so test runs aren't affected.
