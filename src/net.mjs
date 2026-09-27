// Local network helpers: which host names count as this machine, free ports and the system browser.
import { spawn } from 'node:child_process';
import net from 'node:net';

export const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** Host name of a Host header value such as `127.0.0.1:5170`, or '' when it cannot be parsed. */
export const hostName = value => { try { return new URL(`http://${value}`).hostname; } catch { return ''; } };

/** First port from `start` that is free on this machine and not in `held`. */
export const freePort = (start, held = new Set()) => new Promise((resolve, reject) => {
  const probe = port => {
    if (port > 65535) { reject(new Error('No free port')); return; }
    if (held.has(port)) { probe(port + 1); return; }
    const server = net.createServer();
    server.once('error', () => probe(port + 1));
    server.once('listening', () => server.close(() => resolve(port)));
    server.listen(port, '127.0.0.1');
  };
  probe(start);
});

/** Opens a URL in the system's default browser. No shell is involved, and callers pass only URLs the studio built. */
export function openInBrowser(url) {
  const [command, args] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const child = spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true });
  child.on('error', () => {});
  child.unref();
}
