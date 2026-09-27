#!/usr/bin/env node
// game-studio: opens the development studio of the Git repository in the current directory.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { findConfigFile } from '../src/config.mjs';
import { STUDIO_PORTS, findStudio } from '../src/find.mjs';
import { git } from '../src/git.mjs';
import { freePort, openInBrowser } from '../src/net.mjs';
import { clearStudioRecord, studioRecordPath, writeStudioRecord } from '../src/record.mjs';
import { MANAGED_FILES, SETTINGS_FILE, describeSetup, setupProject } from '../src/scaffold.mjs';
import { PAGE_DIR, createStudio } from '../src/server.mjs';

const usage = `Usage: game-studio [init] [options]

Opens the development studio of the Git repository in the current directory. A studio that already
serves this checkout is reused; otherwise one starts on a free local port. Starting a studio also
creates a missing studio/ folder and refreshes the files the studio manages.

  init              Only create or refresh the project's studio files (${SETTINGS_FILE}, its guide
                    and the studio's agent skills), then exit

Options:
  --port <number>   Port for a new studio (default: the first free port from ${STUDIO_PORTS[0]})
  --config <file>   Settings file (default: ${SETTINGS_FILE})
  --no-open         Do not open the browser
  --find            Only print the URL of a running studio for this checkout; exit 1 when none runs
  --version         Print the version
  --help            Print this help`;

const fail = message => { console.error(`game-studio: ${message}`); process.exit(1); };
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

let values, positionals;
try {
  ({ values, positionals } = parseArgs({ allowPositionals: true, options: {
    port: { type: 'string' }, config: { type: 'string' }, 'no-open': { type: 'boolean' },
    find: { type: 'boolean' }, version: { type: 'boolean' }, help: { type: 'boolean' },
  } }));
} catch (error) { fail(`${error.message}\n\n${usage}`); }
if (values.help) { console.log(usage); process.exit(0); }
if (values.version) { console.log(version); process.exit(0); }
const command = positionals[0];
if (command !== undefined && (command !== 'init' || positionals.length > 1)) fail(`unknown command: ${positionals.join(' ')}\n\n${usage}`);

let root;
try { root = path.resolve(git(process.cwd(), ['rev-parse', '--show-toplevel']).trim()); } catch { fail('run it inside a Git repository.'); }
const open = !values['no-open'];

/** Creates or refreshes the project's studio files and lists what changed. */
function setup({ verbose }) {
  let report;
  try { report = setupProject(root, { version }); } catch (error) { console.error(`game-studio: studio files were not set up: ${error.message}`); return false; }
  const lines = describeSetup(verbose ? report : { ...report, unmanaged: [] });
  if (lines.length) console.log(`Studio files (commit them with the project):\n${lines.map(line => `  ${line}`).join('\n')}`);
  else if (verbose) console.log(`Studio files are up to date (${[SETTINGS_FILE, ...MANAGED_FILES].length} files).`);
  return true;
}
if (command === 'init') process.exit(setup({ verbose: true }) ? 0 : 1);

const found = await findStudio(root);
if (values.find) {
  if (found) console.log(found);
  else { console.error('No running studio for this checkout.'); process.exitCode = 1; }
  process.exit();
}
if (found) {
  console.log(`Game Studio is already running: ${found}`);
  if (open) openInBrowser(found);
  process.exit(0);
}

if (values.config && !existsSync(findConfigFile(root, values.config))) fail(`settings file not found: ${values.config}`);
if (!existsSync(path.join(PAGE_DIR, 'index.html'))) fail('the studio page is not built; run `npm run build` in the game-studio package.');
setup({ verbose: false });
const port = values.port === undefined ? await freePort(STUDIO_PORTS[0]) : Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`invalid port: ${values.port}`);

const studio = createStudio({ root, configFile: values.config });
const record = { url: `http://127.0.0.1:${port}/`, id: randomUUID() }, recordFile = studioRecordPath(root);
let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  clearStudioRecord(recordFile, record.id);
  await studio.close();
  process.exit(0);
};
studio.server.on('error', error => fail(error.code === 'EADDRINUSE' ? `port ${port} is already in use` : error.message));
studio.server.listen(port, '127.0.0.1', () => {
  // Record the address, whatever port was chosen, so the next run finds this studio again.
  writeStudioRecord(recordFile, record);
  console.log(`Game Studio: ${record.url}\n  repository: ${root}\n  press Ctrl+C to stop the studio and the games it started`);
  if (open) openInBrowser(record.url);
});
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => void shutdown());
process.on('exit', () => { clearStudioRecord(recordFile, record.id); studio.games.stopAll(); });
