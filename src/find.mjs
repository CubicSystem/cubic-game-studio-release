// Finds a running studio of a checkout: the recorded one first, otherwise by scanning the studio's usual ports.
import { readStudioRecord } from './record.mjs';
import { sameDirectory } from './server.mjs';

/** Ports scanned when no recorded studio answers: the studio's default port and the next ones. */
export const STUDIO_PORTS = Array.from({ length: 30 }, (_, index) => 5170 + index);

/**
 * URL of a running studio that serves `root`, or null. A studio of another repository or worktree reports another root
 * and is skipped.
 */
export async function findStudio(root, ports = STUDIO_PORTS) {
  const probe = async origin => {
    try {
      const response = await fetch(new URL('api/state', origin), { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return null;
      const state = await response.json();
      return typeof state?.root === 'string' && sameDirectory(state.root, root) ? new URL('/', origin).href : null;
    } catch { return null; }
  };
  const record = readStudioRecord(root);
  const recorded = record ? await probe(record.url) : null;
  if (recorded) return recorded;
  return (await Promise.all(ports.map(port => probe(`http://127.0.0.1:${port}/`)))).find(Boolean) ?? null;
}
