// Sets up the studio files of a project: its own `studio/` settings and the guide and agent skills the studio manages.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaults } from './config.mjs';

const TEMPLATES = fileURLToPath(new URL('../templates/', import.meta.url));

/** Files the studio owns in a project. They carry MARKER and are replaced by newer releases. */
export const MANAGED_FILES = [
  'studio/README.md',
  '.agents/skills/studio/SKILL.md',
  '.agents/skills/studio-page/SKILL.md',
  '.claude/skills/studio/SKILL.md',
  '.claude/skills/studio-page/SKILL.md',
];
export const MARKER = 'Managed by cubic-game-studio';
export const SETTINGS_FILE = 'studio/studio.json';
/** Settings files of older projects, moved into SETTINGS_FILE by setup. */
export const LEGACY_SETTINGS_FILES = ['game-studio.json', 'scripts/config/studio.json'];

const starter = () => ({ baseBranch: defaults.baseBranch, game: { ...defaults.game }, menus: [] });
const managedText = (file, version) => readFileSync(path.join(TEMPLATES, file), 'utf8').replaceAll('{{version}}', version);
/** Managed text without its release number and with LF line endings, so a release that changes nothing else rewrites no file. */
const comparable = text => text.replace(/\r\n/g, '\n').replace(new RegExp(`(${MARKER} )\\S+?(\\. )`), '$1$2');

/** Settings of an older file in the current shape: its `tools` become `menus` entries, which behave the same. */
export function migrateSettings(raw) {
  const { tools, ...rest } = raw ?? {};
  return { ...rest, menus: [...(Array.isArray(rest.menus) ? rest.menus : []), ...(Array.isArray(tools) ? tools : [])] };
}

/**
 * Creates or refreshes the studio files of the project at `root` and reports what changed.
 * - `studio/studio.json` belongs to the project: it is created when missing (from an older settings file when there is
 *   one, which is then removed) and never overwritten.
 * - Managed files are created when missing and refreshed when their content differs from this release's (the release
 *   number in the marker alone does not count); a file without MARKER was taken over by the project and is left alone.
 * An older settings file that cannot be parsed throws before anything is written.
 */
export function setupProject(root, { version }) {
  const report = { created: [], updated: [], moved: [], unmanaged: [] };
  const settings = path.join(root, SETTINGS_FILE);
  if (!existsSync(settings)) {
    const legacy = LEGACY_SETTINGS_FILES.find(file => existsSync(path.join(root, file)));
    let data = starter();
    if (legacy) {
      try { data = migrateSettings(JSON.parse(readFileSync(path.join(root, legacy), 'utf8'))); } catch (error) {
        throw new Error(`${legacy}: ${error.message}`);
      }
    }
    mkdirSync(path.dirname(settings), { recursive: true });
    writeFileSync(settings, `${JSON.stringify(data, null, 2)}\n`);
    if (legacy) { rmSync(path.join(root, legacy)); report.moved.push(`${legacy} -> ${SETTINGS_FILE}`); }
    else report.created.push(SETTINGS_FILE);
  }
  for (const file of MANAGED_FILES) {
    const target = path.join(root, file), text = managedText(file, version);
    if (!existsSync(target)) {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, text);
      report.created.push(file);
      continue;
    }
    const current = readFileSync(target, 'utf8');
    if (!current.includes(MARKER)) report.unmanaged.push(file);
    else if (comparable(current) !== comparable(text)) { writeFileSync(target, text); report.updated.push(file); }
  }
  return report;
}

/** One line per change, for the command's output; empty when nothing changed. */
export function describeSetup(report) {
  return [
    ...report.moved.map(entry => `moved   ${entry}`),
    ...report.created.map(file => `created ${file}`),
    ...report.updated.map(file => `updated ${file}`),
    ...report.unmanaged.map(file => `kept    ${file} (no "${MARKER}" line, so the project owns it)`),
  ];
}
