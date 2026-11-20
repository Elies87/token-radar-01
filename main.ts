// Token Launch Radar — entrypoint for the make.fun token-radar-01 bounty.
// Node 22, standard library only, no network.
//
// What a run does, in order:
//   1. Locates the sealed DefiLlama snapshot (default /input/snapshot.json,
//      override with --input <file|directory>).
//   2. Scores every pre-token protocol with the radar model in lib/model.ts
//      and refuses to hand in a board the gate itself would reject.
//   3. Writes the ranked board twice: board.json for the scorer and data.js
//      for the static dashboard, which is copied to the output untouched
//      together with the screenshots.
//   4. Writes dossier.json last, through the vendored make.fun library,
//      because the scorer rebuilds it from the output and compares bytes.
//
// MAKEFUN_OUTPUT_DIR stands in for /output outside the grader's container:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

// The gate's own caps, mirrored from the kit's reference/gate.json: the text
// cap shapes how many bytes the dossier may quote, the rest are refusals.
const DOSSIER_TEXT_MAX = 65_536;
const SHOT_LIMITS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_LIMITS = { max_files: 400, max_bytes: 4_194_304 };
const SHOT_NAME_OK = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

const repoDir = fileURLToPath(new URL('.', import.meta.url));

/** Reads "--name value" or "--name=value" from argv, else the fallback. */
function readArg(name: string, fallback: string): string {
  const flag = `--${name}`;
  const at = process.argv.indexOf(flag);
  if (at >= 0 && process.argv[at + 1] !== undefined) return process.argv[at + 1]!;
  const glued = process.argv.find((a) => a.startsWith(`${flag}=`));
  return glued === undefined ? fallback : glued.slice(flag.length + 1);
}

/** Copies the regular, non-hidden files of one directory into another. */
function mirrorDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const src = join(from, name);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(to, name));
    names.push(name);
  }
  return names;
}

function fail(message: string, code: number): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

function main(): void {
  const inputArg = readArg('input', '/input');
  const snapshotPath = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
  if (!existsSync(snapshotPath)) {
    fail(`no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input`, 2);
  }
  const outDir = readArg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

  const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    fail(`the model wrote a board the gate refuses: ${issue}`, 1);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(outDir, 'data.js'), dataScript(radar));

  mirrorDir(join(repoDir, 'dashboard'), join(outDir, 'dashboard'));
  const shots = mirrorDir(join(repoDir, 'screenshots'), join(outDir, 'screenshots'));
  if (shots.length < 3) {
    fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`, 1);
  }
  for (const name of shots) {
    if (!SHOT_NAME_OK.test(name)) {
      fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`, 1);
    }
  }

  const dossier = buildDossier(outDir, {
    text_max_bytes: DOSSIER_TEXT_MAX,
    screenshots: SHOT_LIMITS,
    dashboard: DASHBOARD_LIMITS,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  process.stdout.write(
    `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
      `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ${join(outDir, 'dashboard')} (3 files), ${join(outDir, 'screenshots')} (${shots.length} images) and ${join(outDir, 'dossier.json')}\n`,
  );
}

main();
