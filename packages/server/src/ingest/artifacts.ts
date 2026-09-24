/**
 * Durable ingest artifacts (§catalog import).
 *
 * Every stage writes its output to disk so a later stage NEVER re-hits the network. Three
 * mechanisms make that trustworthy:
 *
 *  1. Atomic writes — `<file>.tmp` then rename(). A killed process cannot leave a truncated
 *     file that still parses as valid JSON.
 *  2. `_state.json` after every unit, so `--resume` knows what completed. Resume re-validates
 *     each claimed file rather than trusting the list: validation-on-resume is what makes
 *     resume correct instead of merely optimistic.
 *  3. A manifest per run recording inputs (by runId + checksum), counts and warnings, so the
 *     lineage from raw snapshot to loaded row is a DAG you can actually audit.
 *
 * Artifacts live under `web/.cache/ingest/` — NOT the OS temp dir. They are ~150 MB and must
 * survive days of iteration on the normalizer; a temp dir gets swept. One .gitignore line
 * covers the whole tree, and short predictable paths matter on Windows.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export type Stage = 'fetch' | 'normalize' | 'classify' | 'plan' | 'apply' | 'images';

export interface RunManifest {
  runId: string;
  stage: Stage;
  source?: 'hyperone' | 'carrefour' | 'csv' | 'chefaa';
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'complete' | 'failed' | 'blocked';
  /** Lineage: which upstream artifacts this run consumed. */
  inputs: Array<{ stage: Stage; runId: string; checksum?: string }>;
  counts: Record<string, number>;
  warnings: Array<{ code: string; count: number; sampleKeys: string[] }>;
  /** Fingerprint of the selection set that produced this run's snapshots. */
  queryHash?: string;
  notes?: string[];
}

export interface RunState {
  runId: string;
  stage: Stage;
  /** Unit keys already finished, e.g. "en:page-001". */
  completed: string[];
  status: 'running' | 'complete' | 'failed' | 'blocked';
  lastError?: string;
  updatedAt: string;
}

/** Root of the artifact tree. Override with RAGAB_INGEST_DIR. */
export function ingestRoot(): string {
  const fromEnv = process.env.RAGAB_INGEST_DIR;
  if (fromEnv) return resolve(fromEnv);
  // packages/server/src/ingest/artifacts.ts → web/.cache/ingest
  return resolve(__dirname, '../../../../.cache/ingest');
}

/** Filesystem-safe ISO timestamp, e.g. 2026-09-12T17-20-05Z. */
export function newRunId(now = new Date()): string {
  return `${now.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-')}`;
}

export function runDir(stage: Stage, runId: string, source?: string): string {
  return source ? join(ingestRoot(), stage, source, runId) : join(ingestRoot(), stage, runId);
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/** Write JSON atomically: temp file in the same directory, then rename. */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 0), 'utf8');
  await rename(tmp, path);
}

/** Write pretty JSON atomically — for reports a human reads. */
export async function writeJsonPretty(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tmp, path);
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function tryReadJson<T>(path: string): Promise<T | null> {
  try {
    return await readJson<T>(path);
  } catch {
    return null;
  }
}

/** Append a line to a JSONL file, creating it if needed. */
export async function appendJsonl(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(value)}\n`, { encoding: 'utf8', flag: 'a' });
}

export function checksumOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

/* ── latest.json: the per-stage pointer ─────────────────────────────────────────────── */

type LatestMap = Partial<Record<string, string>>;

function latestPath(): string {
  return join(ingestRoot(), 'latest.json');
}

/**
 * A file rather than a symlink — Windows needs elevation for symlinks, and a pointer file is
 * inspectable with `cat`.
 */
export async function setLatest(key: string, runId: string): Promise<void> {
  const current = (await tryReadJson<LatestMap>(latestPath())) ?? {};
  current[key] = runId;
  await writeJsonPretty(latestPath(), current);
}

export async function getLatest(key: string): Promise<string | null> {
  const current = await tryReadJson<LatestMap>(latestPath());
  return current?.[key] ?? null;
}

/** Resolve a runId argument: an explicit id, or 'latest' / undefined → the pointer. */
export async function resolveRunId(key: string, requested?: string): Promise<string> {
  if (requested && requested !== 'latest') return requested;
  const latest = await getLatest(key);
  if (!latest) throw new Error(`no '${key}' run found — run that stage first`);
  return latest;
}

/* ── State ──────────────────────────────────────────────────────────────────────────── */

export function statePath(dir: string): string {
  return join(dir, '_state.json');
}

export async function loadState(dir: string): Promise<RunState | null> {
  return tryReadJson<RunState>(statePath(dir));
}

export async function saveState(dir: string, state: RunState): Promise<void> {
  await writeJsonPretty(statePath(dir), { ...state, updatedAt: new Date().toISOString() });
}

/* ── Manifest ───────────────────────────────────────────────────────────────────────── */

export function manifestPath(dir: string): string {
  return join(dir, 'manifest.json');
}

export async function saveManifest(dir: string, manifest: RunManifest): Promise<void> {
  await writeJsonPretty(manifestPath(dir), manifest);
}

export async function loadManifest(dir: string): Promise<RunManifest | null> {
  return tryReadJson<RunManifest>(manifestPath(dir));
}

/** Collapse per-row warnings into the manifest's aggregate shape. */
export function summarizeWarnings(
  warnings: Iterable<{ code: string; key: string }>,
  sampleLimit = 5,
): RunManifest['warnings'] {
  const byCode = new Map<string, { count: number; samples: string[] }>();
  for (const w of warnings) {
    const entry = byCode.get(w.code) ?? { count: 0, samples: [] };
    entry.count += 1;
    if (entry.samples.length < sampleLimit) entry.samples.push(w.key);
    byCode.set(w.code, entry);
  }
  return [...byCode.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([code, v]) => ({ code, count: v.count, sampleKeys: v.samples }));
}

/* ── Misc ───────────────────────────────────────────────────────────────────────────── */

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export async function listFiles(dir: string, suffix?: string): Promise<string[]> {
  try {
    const names = await readdir(dir);
    return names.filter((n) => !suffix || n.endsWith(suffix)).sort();
  } catch {
    return [];
  }
}
