// Studio settings of a repository. The server reads them on every request, so edits and branch switches apply at once.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Settings files looked up in the repository root, in this order. The last two are read for older projects. */
export const CONFIG_FILES = ['studio/studio.json', 'game-studio.json', 'scripts/config/studio.json'];

export const defaults = {
  baseBranch: 'main',
  game: { command: 'npm run dev --', portArgs: ['--port', '{port}', '--strictPort'], firstPort: 5173, size: [480, 800] },
  menus: [],
};

/** Pages the studio itself provides. A menu entry with the same id relabels, replaces or hides one. */
export const BUILT_IN_PAGES = { home: { name: '홈', icon: 'home' }, game: { name: '게임', icon: 'game' } };

/** The settings file of a repository: `explicit` when given, otherwise the first of CONFIG_FILES that exists, or null. */
export function findConfigFile(root, explicit) {
  if (explicit) return path.resolve(root, explicit);
  return CONFIG_FILES.map(file => path.join(root, file)).find(file => existsSync(file)) ?? null;
}

/**
 * Reads the settings of a repository. Without a settings file the defaults apply. A file that cannot be read or
 * parsed (for example while it is half-saved) throws, so the caller can keep its last good settings.
 */
export function loadStudioConfig(root, explicit) {
  const file = findConfigFile(root, explicit);
  if (!file) return defaults;
  let raw;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (error) {
    throw new Error(`${path.relative(root, file).split(path.sep).join('/')}: ${error.message}`);
  }
  const game = { ...defaults.game, ...raw?.game };
  const size = Array.isArray(game.size) && game.size.length === 2 && game.size.every(value => Number.isFinite(value) && value > 0) ? game.size : defaults.game.size;
  // `tools` is the menu list of older settings files; its entries behave like menu entries with a `url`.
  const menus = [...(Array.isArray(raw?.menus) ? raw.menus : []), ...(Array.isArray(raw?.tools) ? raw.tools : [])];
  const { tools: _tools, ...rest } = raw ?? {};
  return { ...defaults, ...rest, game: { ...game, size }, menus };
}

/**
 * The menu the studio shows, in order. Entries keep the order of `menus`; built-in pages that `menus` does not name
 * come first. An entry is one of:
 * - a built-in page (`home`, `game`), optionally relabelled;
 * - `page`: a page in the project's `studio/` folder, read from the selected worktree;
 * - `url`: an absolute URL, or a path on the selected worktree's running game server;
 * - neither: listed as not connected yet.
 * `hidden: true` removes an entry, built-in pages included. Later entries with an id already used are ignored.
 */
export function resolveMenus(config) {
  const entries = (config.menus ?? []).filter(entry => entry && typeof entry.id === 'string' && entry.id.trim());
  const named = new Set(entries.map(entry => entry.id));
  const seen = new Set(), menus = [];
  const add = entry => {
    if (seen.has(entry.id)) return;
    seen.add(entry.id);
    if (entry.hidden === true) return;
    const builtIn = BUILT_IN_PAGES[entry.id];
    const page = typeof entry.page === 'string' && entry.page.trim() ? entry.page.trim().replace(/^\.\//, '') : null;
    const url = !page && typeof entry.url === 'string' && entry.url.trim() ? entry.url.trim() : null;
    menus.push({
      id: entry.id, name: typeof entry.name === 'string' && entry.name ? entry.name : builtIn?.name ?? entry.id,
      icon: typeof entry.icon === 'string' && entry.icon ? entry.icon : builtIn?.icon ?? 'tool',
      kind: page ? 'page' : url ? 'url' : builtIn ? 'builtin' : 'none', page, url,
    });
  };
  for (const id of Object.keys(BUILT_IN_PAGES)) if (!named.has(id)) add({ id });
  for (const entry of entries) add(entry);
  return menus;
}
