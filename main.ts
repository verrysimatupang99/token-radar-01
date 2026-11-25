// Token Radar entry point: score the sealed snapshot, publish the board, and assemble the hand-in.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const TEXT_LIMIT = 65_536;
const DASHBOARD_LIMIT = { max_files: 400, max_bytes: 4_194_304 };
const SHOT_LIMIT = { max: 4, max_bytes: 524_288 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function option(label: string, fallback: string): string {
  const at = process.argv.indexOf(`--${label}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const found = process.argv.find((a) => a.startsWith(`--${label}=`));
  return found === undefined ? fallback : found.slice(label.length + 3);
}

function stop(code: number, message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

function publishFiles(source: string, target: string): string[] {
  if (!existsSync(source)) return [];
  mkdirSync(target, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(source)) {
    if (name.startsWith('.')) continue;
    const path = join(source, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(target, name));
    names.push(name);
  }
  return names;
}

if (process.argv.includes('--explain')) {
  process.stdout.write('token radar: radar-1 values each pre-token protocol from TVL, seven-day growth and age.\n');
  process.exit(0);
}

const input = option('input', '/input');
const snapshotPath = input.endsWith('.json') ? input : join(input, 'snapshot.json');
if (!existsSync(snapshotPath)) stop(2, `no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input`);


const output = option('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const refusal = boardIssue(board, snapshot);
if (refusal !== null) stop(1, `the model wrote a board the gate refuses: ${refusal}`);

mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(output, 'data.js'), dataScript(radar));

publishFiles(join(ROOT, 'dashboard'), join(output, 'dashboard'));
const shots = publishFiles(join(ROOT, 'screenshots'), join(output, 'screenshots'));
if (shots.length < 3) {
  stop(1, `screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
}
for (const name of shots) {
  if (!SHOT_NAME.test(name)) stop(1, `screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
}

writeFileSync(join(output, 'dossier.json'), buildDossier(output, { text_max_bytes: TEXT_LIMIT, screenshots: SHOT_LIMIT, dashboard: DASHBOARD_LIMIT }));

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(output, 'board.json')}, ${join(output, 'data.js')}, ${join(output, 'dashboard')} (3 files), ${join(output, 'screenshots')} (${shots.length} images) and ${join(output, 'dossier.json')}\n`,
);
