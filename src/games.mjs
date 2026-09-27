// Game processes started by the studio, one per worktree: each runs the configured dev command on its own port.
import { spawn, spawnSync } from 'node:child_process';
import { freePort } from './net.mjs';

const ACTIVE = new Set(['starting', 'running', 'stopping']);

function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); } }
}

export class Games {
  processes = new Map();
  allocation = Promise.resolve();
  constructor(config, { spawnProcess = spawn, stopProcess = killTree } = {}) {
    this.config = config;
    this.spawnProcess = spawnProcess;
    this.stopProcess = stopProcess;
  }
  view(key) {
    const game = this.processes.get(key);
    return game ? { state: game.state, port: game.port, url: game.port ? `http://127.0.0.1:${game.port}/` : null, log: game.log.slice(-200), exitCode: game.exitCode } : { state: 'stopped', log: [] };
  }
  /** Ports of games that are starting, running or stopping. A port stays held until its game stops or fails. */
  heldPorts() {
    return new Set([...this.processes.values()].filter(game => game.port && ACTIVE.has(game.state)).map(game => game.port));
  }
  async start(key, cwd) {
    const current = this.processes.get(key);
    if (current && ACTIVE.has(current.state)) return;
    const game = { state: 'starting', port: null, log: [], exitCode: null, child: null };
    this.processes.set(key, game);
    const push = chunk => { for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) game.log.push(line.replace(/\x1b\[[0-9;]*m/g, '')); if (game.log.length > 400) game.log.splice(0, game.log.length - 400); };
    const fail = message => { game.state = 'failed'; game.child = null; push(`[studio] ${message}`); };
    // One allocation at a time, so a game whose server has not bound its port yet still keeps it from the next start.
    const allocated = this.allocation.then(() => freePort(this.config.game.firstPort, this.heldPorts())).then(port => { game.port = port; });
    this.allocation = allocated.catch(() => {});
    try { await allocated; } catch (error) { fail(String(error.message ?? error)); return; }
    if (game.state !== 'starting') return;
    const args = this.config.game.portArgs.map(arg => String(arg).replaceAll('{port}', String(game.port)));
    const command = [this.config.game.command, ...args].join(' ');
    push(`$ ${command}`);
    let child;
    try {
      child = this.spawnProcess(command, { cwd, shell: true, windowsHide: true, detached: process.platform !== 'win32', env: { ...process.env, BROWSER: 'none', FORCE_COLOR: '0' } });
    } catch (error) { fail(`could not start: ${error.message ?? error}`); return; }
    game.child = child;
    child.stdout?.on('data', push); child.stderr?.on('data', push);
    // A spawn failure (for example a folder removed after the list was read) fails only this game.
    child.on('error', error => { if (game.child === child) fail(`could not start: ${error.message ?? error}`); });
    child.on('exit', code => {
      if (game.child !== child) return;
      game.exitCode = code; game.state = game.state === 'stopping' ? 'stopped' : 'failed'; game.child = null;
      push(`[studio] process exited (${code})`);
    });
    // Ready once the dev server answers on its port.
    const deadline = Date.now() + 90000, port = game.port;
    const poll = () => {
      if (game.state !== 'starting' || game.child !== child) return;
      fetch(`http://127.0.0.1:${port}/`).then(response => {
        if (response.ok && game.state === 'starting') { game.state = 'running'; push(`[studio] ready on port ${port}`); }
        else if (game.state === 'starting') setTimeout(poll, 700);
      }).catch(() => {
        if (Date.now() > deadline) { push('[studio] no response within 90 s'); this.stop(key); }
        else setTimeout(poll, 700);
      });
    };
    setTimeout(poll, 700);
  }
  stop(key) {
    const game = this.processes.get(key);
    if (!game?.child) { if (game) game.state = 'stopped'; return; }
    game.state = 'stopping';
    this.stopProcess(game.child);
  }
  stopAll() { for (const key of this.processes.keys()) this.stop(key); }
}
