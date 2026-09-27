// Where a running studio records its address, so the next `game-studio` run reuses it instead of starting another.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { git } from './git.mjs';
import { LOCAL_HOSTS } from './net.mjs';

/**
 * The record file of a checkout, inside the worktree's own Git directory: each worktree has its own (node_modules may
 * be shared between worktrees) and it is never tracked. Null outside a Git checkout.
 */
export function studioRecordPath(root) {
  try { return path.resolve(root, git(root, ['rev-parse', '--git-path', 'game-studio.json']).trim()); } catch { return null; }
}

/** The recorded studio `{ url, id }` of a checkout, or null when there is none or it does not point at a local host. */
export function readStudioRecord(root) {
  const file = studioRecordPath(root);
  if (!file) return null;
  try {
    const record = JSON.parse(readFileSync(file, 'utf8'));
    const url = new URL(record.url);
    return (url.protocol === 'http:' || url.protocol === 'https:') && LOCAL_HOSTS.has(url.hostname) ? { ...record, url: url.href } : null;
  } catch { return null; }
}

export function writeStudioRecord(file, record) { if (file) try { writeFileSync(file, JSON.stringify(record)); } catch { /* optional */ } }

/** Removes the record only while it still belongs to the studio that wrote it. */
export function clearStudioRecord(file, id) {
  if (!file) return;
  try { if (JSON.parse(readFileSync(file, 'utf8')).id === id) rmSync(file); } catch { /* already gone */ }
}
