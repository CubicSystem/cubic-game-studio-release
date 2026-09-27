// Studio page SDK. A project page under studio/pages/ imports it with `import { studio } from '/sdk/studio.js'`.
// The studio shell sends the page its context (selected worktree, its game, the page's menu entry) and every change.

/**
 * @typedef {{ id: string, path: string, name: string, branch: string | null, main: boolean, current: boolean, phase: string }} Worktree
 * @typedef {{ state: 'running' | 'starting' | 'stopping' | 'stopped' | 'failed', url: string | null }} Game
 * @typedef {{ worktree: Worktree, game: Game, menu: { id: string }, studio: { root: string, baseBranch: string } }} Context
 */

/** @type {Context | null} */
let context = null;
/** @type {Set<(context: Context) => void>} */
const listeners = new Set();

window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'studio:context') return;
  context = event.data.context;
  for (const listener of listeners) listener(context);
});
// Ask the shell for the current context; it also sends one whenever the context changes.
if (window.parent !== window) window.parent.postMessage({ type: 'studio:ready' }, location.origin);

export const studio = {
  /** The latest context, or null before the first one and when the page is opened outside the studio. */
  get context() { return context; },
  /**
   * Calls `listener` now when the context is known and after every change.
   * @param {(context: Context) => void} listener
   * @returns {() => void} stops listening
   */
  onContext(listener) {
    listeners.add(listener);
    if (context) listener(context);
    return () => { listeners.delete(listener); };
  },
  /**
   * Calls the studio API: `api('state')`, `api('game/start', { path })` or `api('game/stop', { path })`.
   * @param {string} route
   * @param {object} [body] sends a POST with the studio's request marker
   */
  async api(route, body) {
    const response = await fetch(`/api/${route}`, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio': '1' }, body: JSON.stringify(body) } : undefined);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
    return data;
  },
};
