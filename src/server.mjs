// The studio's local web server: the shell page, the page SDK, the project's own pages and a JSON API for worktree
// status and each worktree's game. It serves only this machine and never commits, pushes, merges or removes anything.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaults, loadStudioConfig, resolveMenus } from './config.mjs';
import { Games } from './games.mjs';
import { git, parseWorktrees, readWorktrees } from './git.mjs';
import { LOCAL_HOSTS, hostName, openInBrowser } from './net.mjs';

/** The built shell page and SDK (`npm run build`), shipped in the package. */
export const PAGE_DIR = fileURLToPath(new URL('../dist/page/', import.meta.url));
const SHELL_FILES = {
  '/': 'index.html', '/studio.js': 'studio.js', '/studio.css': 'studio.css',
  '/sdk/studio.js': 'sdk/studio.js', '/sdk/studio.css': 'sdk/studio.css',
};
/** The folder of a worktree whose files the studio serves as project pages. */
export const PROJECT_FOLDER = 'studio';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm', '.map': 'application/json; charset=utf-8',
};

const originOf = value => { try { return new URL(value).origin; } catch { return null; } };

/**
 * Why a request must be refused, or null. Only local host names are served. A request from another origin, including
 * another port on the same machine, is refused; a change must also carry the studio marker and its own Origin.
 */
export function refuseRequest({ method, host, origin, marker, protocol = 'http' }) {
  if (!LOCAL_HOSTS.has(hostName(host ?? ''))) return 'Studio accepts local requests only';
  const own = originOf(`${protocol}://${host}`);
  if (origin !== undefined && originOf(origin) !== own) return 'Request comes from another origin';
  if (method !== 'GET' && (marker !== '1' || origin === undefined)) return 'Missing studio request marker';
  return null;
}

/**
 * The worktree a request names. The page sends back a path exactly as `git worktree list` reported it, so the match is
 * exact: no case folding, which would merge distinct folders on case-sensitive volumes of any operating system.
 */
export const findWorktree = (list, requested) => typeof requested === 'string' ? list.find(item => item.path === requested) : undefined;

/** Short stable id of a worktree for page URLs, derived from its path as Git reports it. */
export const worktreeId = worktreePath => createHash('sha1').update(worktreePath).digest('hex').slice(0, 12);

/** Whether two paths are the same directory on disk, compared by device and inode; exact resolved paths when either cannot be read. */
export function sameDirectory(a, b) {
  try {
    const first = statSync(a, { bigint: true }), second = statSync(b, { bigint: true });
    return first.dev === second.dev && first.ino === second.ino;
  } catch { return path.resolve(a) === path.resolve(b); }
}

/** Where a `url` menu entry opens: an absolute http(s) URL as it is, or a path on the worktree's running game server. */
export function toolUrl(menu, gameUrl) {
  if (!menu?.url) return null;
  try {
    const url = gameUrl ? new URL(menu.url, gameUrl) : new URL(menu.url);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

/**
 * The file a project page URL names inside a worktree's `studio/` folder, or null. The path must stay inside the folder,
 * also after resolving links, and a folder serves its index.html.
 */
export function projectFile(worktreePath, requested) {
  let relative;
  try { relative = decodeURIComponent(requested); } catch { return null; }
  if (relative.includes('\0')) return null;
  const folder = path.resolve(worktreePath, PROJECT_FOLDER);
  let file = path.resolve(folder, `.${path.sep}${relative}`);
  if (file !== folder && !file.startsWith(folder + path.sep)) return null;
  try {
    if (statSync(file).isDirectory()) file = path.join(file, 'index.html');
    const real = realpathSync(file), realFolder = realpathSync(folder);
    return real.startsWith(realFolder + path.sep) && statSync(real).isFile() ? real : null;
  } catch { return null; }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
function sendFile(res, file, { framable }) {
  res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Project pages are shown in the shell's frame; the shell itself must not be framed by another site.
  res.setHeader('Content-Security-Policy', framable ? "frame-ancestors 'self'" : "frame-ancestors 'none'");
  res.end(readFileSync(file));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0, data = '';
    req.on('data', chunk => { size += chunk.length; if (size > 64 * 1024) { reject(new Error('Request too large')); req.destroy(); } else data += chunk; });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

/**
 * Creates the studio server for the repository at `root` (not yet listening). Settings are read again on every API
 * request; while the file cannot be parsed, the last good settings stay and the error is reported to the page.
 */
export function createStudio({ root, configFile, pageDir = PAGE_DIR, games = new Games(defaults) }) {
  let config = defaults, configError = null;
  const readConfig = () => {
    try { config = loadStudioConfig(root, configFile); configError = null; } catch (error) { configError = String(error.message ?? error); }
    games.config = config;
  };
  readConfig();

  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://studio.local');
    const refused = refuseRequest({ method: req.method, host: req.headers.host, origin: req.headers.origin, marker: req.headers['x-studio'] });
    if (refused) { send(res, 403, { error: refused }); return; }
    const shell = SHELL_FILES[url.pathname];
    if (req.method === 'GET' && shell) { sendFile(res, path.join(pageDir, shell), { framable: shell.startsWith('sdk/') }); return; }
    // Project pages: /w/<worktree id>/<path in that worktree's studio/ folder>.
    const page = /^\/w\/([0-9a-f]{12})\/(.*)$/.exec(url.pathname);
    if (req.method === 'GET' && page) {
      const worktree = parseWorktrees(git(root, ['worktree', 'list', '--porcelain', '-z'])).find(item => worktreeId(item.path) === page[1]);
      const file = worktree && projectFile(worktree.path, page[2]);
      if (!file) { send(res, 404, { error: 'No such studio page' }); return; }
      sendFile(res, file, { framable: true });
      return;
    }
    if (!url.pathname.startsWith('/api/')) { send(res, 404, { error: 'Not found' }); return; }
    readConfig();
    const route = url.pathname.slice('/api/'.length);
    const list = readWorktrees(root, { baseBranch: config.baseBranch });
    // The repository the studio serves may be spelled differently from Git's list (separators, drive case), so compare the directory itself.
    const current = list.find(item => !item.missing && sameDirectory(item.path, root));
    if (req.method === 'GET' && route === 'state') {
      send(res, 200, {
        root, baseBranch: config.baseBranch, gameSize: config.game.size, menus: resolveMenus(config), configError,
        worktrees: list.map(item => ({ ...item, id: worktreeId(item.path), current: item === current, game: games.view(item.path) })),
      });
    } else if (req.method === 'POST' && (route === 'game/start' || route === 'game/stop')) {
      const target = findWorktree(list, (await readBody(req)).path);
      if (!target) { send(res, 404, { error: 'Unknown worktree' }); return; }
      if (route === 'game/start') {
        if (target.missing || !existsSync(target.path)) { send(res, 409, { error: 'Worktree folder is missing' }); return; }
        await games.start(target.path, target.path);
      } else games.stop(target.path);
      send(res, 200, { game: games.view(target.path) });
    } else if (req.method === 'POST' && route === 'open') {
      // The page names a worktree and optionally a menu entry; the server decides the URL.
      const body = await readBody(req), item = findWorktree(list, body.path);
      const game = item ? games.view(item.path) : null, gameUrl = game?.state === 'running' ? game.url : null;
      const menuId = typeof body.menu === 'string' ? body.menu : typeof body.tool === 'string' ? body.tool : null;
      const menu = menuId ? resolveMenus(config).find(entry => entry.id === menuId) : null;
      let target = null;
      if (!menuId) target = gameUrl;
      else if (menu?.kind === 'page' && item) target = new URL(`w/${worktreeId(item.path)}/${menu.page}`, `http://${req.headers.host}/`).href;
      else if (menu?.kind === 'url') target = toolUrl(menu, gameUrl);
      if (!target) { send(res, 404, { error: 'Nothing to open' }); return; }
      openInBrowser(target);
      send(res, 200, { url: target });
    } else if (req.method === 'POST' && route === 'fetch') {
      git(root, ['fetch', '--prune']);
      send(res, 200, { ok: true });
    } else send(res, 404, { error: 'Unknown studio request' });
  }

  const server = http.createServer((req, res) => { handle(req, res).catch(error => send(res, 500, { error: String(error.message ?? error) })); });
  return { server, games, close: () => new Promise(resolve => { games.stopAll(); server.close(() => resolve()); server.closeAllConnections?.(); }) };
}
