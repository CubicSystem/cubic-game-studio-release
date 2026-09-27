// Worktree status for the development studio. Reads only; never changes the repository.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

/** Runs git with unquoted paths; returns stdout or throws with git's own error. */
export function git(cwd, args) {
  const result = spawnSync('git', ['-c', 'core.quotePath=false', ...args], { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  if (result.status !== 0) throw new Error((result.stderr || result.error?.message || `git ${args[0]} failed`).trim());
  return result.stdout;
}
const tryGit = (cwd, args) => { try { return git(cwd, args); } catch { return null; } };

/** Parses `git worktree list --porcelain -z`. The first entry is the main worktree. */
export function parseWorktrees(text) {
  const entries = [];
  let entry;
  for (const field of text.split('\0')) {
    if (!field) { if (entry) entries.push(entry); entry = undefined; continue; }
    const space = field.indexOf(' '), key = space < 0 ? field : field.slice(0, space), value = space < 0 ? '' : field.slice(space + 1);
    if (key === 'worktree') entry = { path: value, head: '', branch: null, detached: false, bare: false, locked: false, prunable: false };
    else if (!entry) continue;
    else if (key === 'HEAD') entry.head = value;
    else if (key === 'branch') entry.branch = value.replace(/^refs\/heads\//, '');
    else if (key === 'detached') entry.detached = true;
    else if (key === 'bare') entry.bare = true;
    else if (key === 'locked') entry.locked = true;
    else if (key === 'prunable') entry.prunable = true;
  }
  if (entry) entries.push(entry);
  return entries.map((item, index) => ({ ...item, main: index === 0 }));
}

/** Parses `git status --porcelain=v1 -z` into changed files with one kind each: M, A (new, incl. untracked), D, R, U (conflict). */
export function parseStatus(text) {
  const fields = text.split('\0'), files = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!field || field.length < 4) continue;
    const x = field[0], y = field[1], file = field.slice(3);
    // Renames and copies carry the original path in the next field.
    if (x === 'R' || x === 'C') i++;
    const conflict = x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D');
    const kind = conflict ? 'U' : x === '?' ? 'A' : x === 'A' ? 'A' : x === 'D' || y === 'D' ? 'D' : x === 'R' || x === 'C' ? 'R' : 'M';
    files.push({ kind, path: file, staged: x !== ' ' && x !== '?' });
  }
  return files;
}

/**
 * One word for what a worktree needs next.
 * main: work → pull → push → current. sub: work → pull → push → review (waiting for the base branch) → merged (safe to clean up).
 * pull covers a branch behind its upstream and one that diverged from it, since a push would be rejected until it pulls.
 * A detached HEAD has no branch to push, so it goes straight to the merge check.
 */
export function phaseOf({ main, files, upstream, ahead, behind = 0, merged, detached = false }) {
  if (files.length) return 'work';
  if (upstream && behind > 0) return 'pull';
  if ((!upstream && !detached) || ahead > 0) return 'push';
  if (main) return 'current';
  return merged ? 'merged' : 'review';
}

/** Collects the status of every worktree of the repository that contains `root`. */
export function readWorktrees(root, { baseBranch = 'main', limitFiles = 200, commits = 5 } = {}) {
  const list = parseWorktrees(git(root, ['worktree', 'list', '--porcelain', '-z']));
  const baseRef = tryGit(root, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${baseBranch}`]) ? `origin/${baseBranch}`
    : tryGit(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${baseBranch}`]) ? baseBranch : null;
  return list.filter(item => !item.bare).map(item => {
    const base = { ...item, name: path.basename(item.path), missing: item.prunable };
    if (item.prunable) return { ...base, files: [], upstream: null, ahead: 0, behind: 0, merged: null, phase: 'work', commits: [], error: 'Worktree folder is missing' };
    try {
      const files = parseStatus(git(item.path, ['status', '--porcelain=v1', '-z', '--untracked-files=all']));
      const upstream = tryGit(item.path, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])?.trim() || null;
      let ahead = 0, behind = 0;
      if (upstream) {
        const [left, right] = (tryGit(item.path, ['rev-list', '--left-right', '--count', `${upstream}...HEAD`]) ?? '0\t0').trim().split(/\s+/).map(Number);
        behind = left || 0; ahead = right || 0;
      }
      const merged = item.main || !baseRef || !item.head ? null : tryGit(root, ['merge-base', '--is-ancestor', item.head, baseRef]) !== null;
      const log = tryGit(item.path, ['log', `-${commits}`, '--format=%h%x00%s%x00%ct%x00']) ?? '';
      const parts = log.split('\0').map(part => part.replace(/^\n/, ''));
      const recent = [];
      for (let i = 0; i + 2 < parts.length; i += 3) if (parts[i]) recent.push({ hash: parts[i], subject: parts[i + 1], time: Number(parts[i + 2]) * 1000 });
      const status = { ...base, files: files.slice(0, limitFiles), fileCount: files.length, upstream, ahead, behind, merged, baseRef, commits: recent };
      return { ...status, phase: phaseOf({ main: item.main, files, upstream, ahead, behind, merged, detached: item.detached }) };
    } catch (error) {
      return { ...base, files: [], upstream: null, ahead: 0, behind: 0, merged: null, phase: 'work', commits: [], error: String(error.message ?? error) };
    }
  });
}
