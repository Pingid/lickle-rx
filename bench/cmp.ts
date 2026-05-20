// Generic bench runner / snapshot comparator.
//
// Convention:
//   bench/<bench>/bench.ts          — entry script (mitata)
//   bench/<bench>/snapshots/*.json  — saved results
//
// Bench scripts must call `mitata`'s `run({ format: { json: { samples: false } } })`
// (or write a `{ rows: { <name>: { avg, min, p75 } } }` document) when run with
// BENCH_JSON=1.
//
// Usage:
//   tsx bench/cmp.ts save <bench> [name]        snapshot current results
//   tsx bench/cmp.ts diff <bench> [target...]   compare current vs snapshot or git ref(s)

import { spawn, execSync } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'

type Row = { avg: number; min: number; p75: number }
type Snap = { ref: string; at: string; rows: Record<string, Row> }
type Tgt = { label: string; snap: Snap }

const root = path.resolve(import.meta.dirname, '..')
const cache = path.join(root, '.bench-cache')
const tsx = path.join(root, 'node_modules/.bin/tsx')

const benchScript = (b: string) => path.join('bench', b, 'bench.ts')
const snapDir = (b: string) => path.join(root, 'bench', b, 'snapshots')
const snapPath = (b: string, n: string) => path.join(snapDir(b), `${n}.json`)
const hasBench = (b: string) => fs.existsSync(path.join(root, benchScript(b)))

// ---------------- git ----------------

const sh = (cmd: string, cwd = root) =>
  execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    .toString()
    .trim()

const refSha = (r: string) => sh(`git rev-parse ${r}^{commit}`)
const isRef = (a: string) => {
  try {
    execSync(`git rev-parse --verify ${a}^{commit}`, { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// ---------------- parse mitata json ----------------

const parseRows = (j: any): Record<string, Row> => {
  if (j && typeof j === 'object' && j.rows) return j.rows
  const rows: Record<string, Row> = {}
  for (const b of j.benchmarks ?? []) {
    const s = b.runs?.[0]?.stats
    if (!s) continue
    const g = j.layout?.[b.group]?.name ?? ''
    const key = g ? `${g} / ${b.alias}` : b.alias
    rows[key] = { avg: s.avg, min: s.min, p75: s.p75 }
  }
  return rows
}

// ---------------- bench runner ----------------

const runBench = (bench: string, cwd: string, ref: string): Promise<Snap> =>
  new Promise((res, rej) => {
    const p = spawn(tsx, [benchScript(bench)], {
      cwd,
      env: { ...process.env, BENCH_JSON: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) => {
      if (code !== 0) return rej(new Error(`bench '${bench}' failed (${cwd}):\n${err}`))
      try {
        // strip leading non-JSON noise mitata may print before the document
        const i = out.indexOf('{')
        res({ ref, at: new Date().toISOString(), rows: parseRows(JSON.parse(out.slice(i))) })
      } catch (e) {
        console.error(out)
        rej(e)
      }
    })
  })

const extract = (bench: string, sha: string): string => {
  const dir = path.join(cache, sha)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    execSync(`git archive ${sha} | tar -x -C ${dir}`, { cwd: root, stdio: 'inherit' })
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'))
  }
  // Overlay current bench tree so cross-commit comparisons use a fixed harness.
  const benchDir = path.join('bench', bench)
  const dst = path.join(dir, benchDir)
  fs.rmSync(dst, { recursive: true, force: true })
  fs.cpSync(path.join(root, benchDir), dst, {
    recursive: true,
    filter: (s) => path.basename(s) !== 'snapshots',
  })
  return dir
}

const runRef = async (bench: string, ref: string): Promise<Tgt> => {
  const sha = refSha(ref)
  return { label: `${ref}@${sha.slice(0, 7)}`, snap: await runBench(bench, extract(bench, sha), sha) }
}

// ---------------- snapshots ----------------

const loadSnap = (b: string, n: string): Snap => JSON.parse(fs.readFileSync(snapPath(b, n), 'utf8'))
const saveSnap = (b: string, n: string, s: Snap) => {
  fs.mkdirSync(snapDir(b), { recursive: true })
  fs.writeFileSync(snapPath(b, n), JSON.stringify(s, null, 2) + '\n')
}

const resolveTgt = async (bench: string, a: string): Promise<Tgt> => {
  if (fs.existsSync(snapPath(bench, a))) return { label: a, snap: loadSnap(bench, a) }
  if (isRef(a)) {
    const sha = refSha(a).slice(0, 7)
    const label = `${a}@${sha}`
    if (fs.existsSync(snapPath(bench, sha))) return { label, snap: loadSnap(bench, sha) }
    const tgt = await runRef(bench, a)
    saveSnap(bench, sha, tgt.snap)
    console.error(`> cached ${path.relative(root, snapPath(bench, sha))}`)
    return { label, snap: tgt.snap }
  }
  throw new Error(`'${a}' is neither a snapshot nor a git ref`)
}

// ---------------- table ----------------

const fmt = (ns: number) => {
  const u = ['ns', 'µs', 'ms', 's']
  let v = ns
  let i = 0
  while (v >= 1000 && i < 3) {
    v /= 1000
    i++
  }
  return `${v.toFixed(2)} ${u[i]}`
}
const ansi = (s: string, code: number) => `\x1b[${code}m${s}\x1b[0m`
const stripAnsi = (s: string) => s.replace(/\x1b\[\d+m/g, '')
const pct = (cur: number, ref: number) => {
  const d = ((cur - ref) / ref) * 100
  const s = `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`
  return ansi(s, Math.abs(d) < 2 ? 90 : d > 0 ? 31 : 32)
}
const pad = (s: string, n: number, right = false) => {
  const sp = ' '.repeat(Math.max(0, n - stripAnsi(s).length))
  return right ? sp + s : s + sp
}

const diffTable = (cur: Snap, tgts: Tgt[]) => {
  const all = Array.from(new Set([...Object.keys(cur.rows), ...tgts.flatMap((t) => Object.keys(t.snap.rows))]))
  const w = Math.max(5, ...all.map((n) => n.length))
  const head =
    pad('bench', w) +
    '  ' +
    pad('current', 12, true) +
    tgts.map((t) => '  ' + pad(t.label, 18, true) + '  ' + pad('Δ', 8, true)).join('')
  console.log(ansi(head, 1))
  for (const n of all) {
    const cr = cur.rows[n]
    let line = pad(n, w) + '  ' + pad(cr ? fmt(cr.avg) : '-', 12, true)
    for (const t of tgts) {
      const tr = t.snap.rows[n]
      line += '  ' + pad(tr ? fmt(tr.avg) : '-', 18, true) + '  ' + pad(cr && tr ? pct(cr.avg, tr.avg) : '-', 8, true)
    }
    console.log(line)
  }
}

// ---------------- main ----------------

const knownBenches = () => {
  const dir = path.join(root, 'bench')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && hasBench(e.name))
    .map((e) => e.name)
}

const usage = `Usage:
  tsx bench/cmp.ts save <bench> [name]        save current results to bench/<bench>/snapshots/<name>.json (default: baseline)
  tsx bench/cmp.ts diff <bench> [target...]   compare current <bench> vs snapshot name(s) or git ref(s)
                                              (default target: baseline). Ref results are cached
                                              to bench/<bench>/snapshots/<short-sha>.json

Known benches: ${knownBenches().join(', ') || '(none)'}
`

const [cmd, bench, ...args] = process.argv.slice(2)

if ((cmd === 'save' || cmd === 'diff') && bench && !hasBench(bench)) {
  console.error(`unknown bench '${bench}': no ${benchScript(bench)}\n`)
  process.stderr.write(usage)
  process.exit(1)
}

if (cmd === 'save' && bench) {
  const n = args[0] ?? 'baseline'
  console.error(`> running ${bench} bench ...`)
  const s = await runBench(bench, root, sh('git rev-parse --short HEAD'))
  saveSnap(bench, n, s)
  console.log(`saved ${path.relative(root, snapPath(bench, n))} (${Object.keys(s.rows).length} benches)`)
} else if (cmd === 'diff' && bench) {
  console.error(`> running ${bench} bench (current) ...`)
  const cur = await runBench(bench, root, 'current')
  const tgts: Tgt[] = []
  for (const a of args.length ? args : ['baseline']) {
    console.error(`> resolving ${a} ...`)
    tgts.push(await resolveTgt(bench, a))
  }
  diffTable(cur, tgts)
} else {
  process.stderr.write(usage)
  process.exit(cmd ? 1 : 0)
}
