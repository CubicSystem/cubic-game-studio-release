# Game Studio

A local development studio for game projects, in one page at `http://127.0.0.1:5170/`. The studio is a shell: a menu, the list of the repository's worktrees with their status, and the current target. Behind the menu are two built-in pages, one for worktree detail and one that runs the game of any worktree. Each project can replace or hide those pages, and add its own. Pages and settings live in the project's `studio/` folder.

It is a standalone tool: it needs Node and Git, not a particular game engine or build tool.

## Use

Run it inside the repository:

```sh
npx -y "github:CubicSystem/cubic-game-studio-release#semver:*"
```

npm downloads the latest release straight from this public GitHub repository and runs it. No npm registry, account or token is involved. `#semver:*` means the highest release tag, such as `v0.2.0`. A project usually adds it as a script, so every run uses the latest release without a dependency or lockfile entry:

```json
"scripts": { "studio": "npx -y \"github:CubicSystem/cubic-game-studio-release#semver:*\"" }
```

Use `#main` instead to follow every commit on `main`, or `#v0.2.0` to pin a release. The first run of a new release downloads and builds it; later runs reuse npm's cache.

`npm run studio` then does one of two things:

- If a studio for this checkout is already running, it reuses that studio and opens the page.
- Otherwise it sets up the project's studio files, starts a studio on the first free port from 5170, and opens the page in the default browser.

The studio and the games it started stop with Ctrl+C.

| Command or option | Meaning |
|---|---|
| `init` | Only create or refresh the project's studio files, then exit. |
| `--no-open` | Do not open the browser; useful for agents that open the page in their own browser. |
| `--find` | Only print the URL of a running studio for this checkout; exit 1 when none runs. |
| `--port <number>` | Port for a new studio. |
| `--config <file>` | Settings file, relative to the repository root. |

Every studio records its address in its worktree's own Git directory (`game-studio.json`, never tracked). Because of that record, a studio on any port is found again. When the record is missing or stale, the ports from 5170 are scanned. A studio of another repository or worktree is never reused.

## The project's studio folder

`init`, or the first start of a studio, creates what is missing:

| Path | Owner | Purpose |
|---|---|---|
| `studio/studio.json` | project | Settings: base branch, how a game starts, and the menu |
| `studio/pages/<id>/` | project | The project's own pages |
| `studio/README.md` | studio | Guide to settings, pages and the page SDK |
| `.agents/skills/studio/`, `.claude/skills/studio/` | studio | Agent skill that opens the studio |
| `.agents/skills/studio-page/`, `.claude/skills/studio-page/` | studio | Agent skill that adds or changes pages and menu entries |

- **Studio-owned files** carry a "Managed by cubic-game-studio" line with the release. A newer release refreshes them when it starts or runs `init`, so their guidance matches the release. A file is rewritten only when its content changed; the release number alone does not count, so most releases leave the project untouched.
- **Taking a file over:** removing that line hands a file to the project, and the studio then leaves it alone.
- **The skills** let any agent session find the rules for studio work from the request alone ("스튜디오에 사운드 페이지 추가해줘"). They exist only in projects that set up the studio.
- **Older settings:** projects that kept settings in `game-studio.json` or `scripts/config/studio.json` get them moved to `studio/studio.json`, and their `tools` become `menus`. Until then, those files are still read.

Commit the created files with the project.

## What the built-in pages show

- **Worktree list (always visible):**
  - The main worktree and the linked (sub) worktrees appear in separate groups, read from `git worktree list`.
  - Each entry shows its branch and status tags and can be folded.
- **Status:**
  - Changed files by kind: modified, added (including untracked), deleted, renamed and conflicted.
  - Commits to push or pull against the upstream branch.
  - For sub worktrees, whether the head is merged into `baseBranch`.
  - A coloured dot and a tag name the next step:
    - *work*: uncommitted changes.
    - *pull*: behind or diverged from the upstream.
    - *push*: unpushed commits, or no upstream.
    - *review*: not yet in the base branch.
    - *merged*: in the base branch with nothing left; safe to remove.
    - *current*: in sync.
- **Home** (`home`): the selected worktree in detail: branch and upstream, change counts, ahead/behind, merge state, the next step, changed files and recent commits. The fetch button runs `git fetch --prune`.
- **Game** (`game`):
  - Any worktree's game starts with the configured command on a free port and is shown in a frame that takes the page.
  - It stops from the page, which ends the whole process tree.
  - The game's output shows while it starts or after it failed. The log button shows or hides it at any time.
  - *Open in a new tab* asks the studio to open the game in the system's default browser, because an embedded app browser may block new tabs.

The studio never commits, pushes, merges or removes worktrees. For a merged worktree it shows the `git worktree remove` command to run yourself.

## Settings and menu

The studio reads the first of these files that exists in the repository root: `studio/studio.json`, then the older `game-studio.json` and `scripts/config/studio.json`. `--config` names another file. The file is read again on every request, so edits and branch switches apply on the next refresh without a restart. While the file cannot be parsed, the studio keeps the last valid settings and shows the error.

```json
{
  "baseBranch": "main",
  "game": { "command": "npm run dev --", "portArgs": ["--port", "{port}", "--strictPort"], "firstPort": 5173, "size": [480, 800] },
  "menus": [
    { "id": "sound", "name": "Sound", "icon": "sound", "page": "pages/sound/index.html" },
    { "id": "game", "name": "Play", "page": "pages/play/index.html" },
    { "id": "docs", "name": "Docs", "icon": "data", "url": "https://example.com/docs" },
    { "id": "home", "hidden": true }
  ]
}
```

| Field | Default | Meaning |
|---|---|---|
| `baseBranch` | `main` | Branch that sub worktrees merge into; compared against `origin/<baseBranch>` when it exists. |
| `game.command` | `npm run dev --` | Command run inside a worktree to start its game, followed by `game.portArgs` with `{port}` replaced. |
| `game.portArgs` | `["--port", "{port}", "--strictPort"]` | Arguments that make the game's dev server use the given port. |
| `game.firstPort` | `5173` | First port tried for games; the next free port is used. |
| `game.size` | `[480, 800]` | `[width, height]` of the game, for the built-in game page's frame. |
| `menus` | `[]` | Menu entries, in order. |

A menu entry has an `id` and optionally `name`, `icon` (`home`, `game`, `image`, `sound`, `layout`, `data`, `settings`, `tool`) and one of:

- `page`: a page in the project's `studio/` folder, such as `pages/sound/index.html`;
- `url`: an absolute URL, or a path on the selected worktree's running game server;
- neither: the entry is listed as not connected.

Rules for the menu:

- It keeps the order of `menus`. The built-in pages `home` and `game` come first unless `menus` names them.
- Naming a built-in page moves, relabels, replaces (with `page` or `url`) or hides (`"hidden": true`) it.
- A later entry with an id already used is ignored.
- The older `tools` list is read as more `url` entries.

## Project pages and the page SDK

A project page is a plain web page in `studio/pages/<id>/`, with its files under relative paths.

- **Where it comes from:** the studio serves the `studio/` folder of the worktree selected in its sidebar at `/w/<worktree id>/`. Selecting a worktree therefore shows that branch's version of a page.
- **What is served:** only files inside `studio/`, also after resolving links.
- **No build step:** plain HTML, CSS and ES modules work as they are.

```html
<link rel="stylesheet" href="/sdk/studio.css" />
<script type="module">
  import { studio } from '/sdk/studio.js';
  studio.onContext(({ worktree, game }) => { document.title = `${worktree.name} · ${game.state}`; });
</script>
```

| SDK member | Meaning |
|---|---|
| `studio.context` | The latest context, or `null` before the first one and outside the studio. |
| `studio.onContext(listener)` | Calls `listener(context)` now when known and after every change; returns a function that stops listening. |
| `studio.api(route, body?)` | Calls the studio API: `api('state')`, `api('game/start', { path })`, `api('game/stop', { path })`. |

The context has these fields:

- `worktree`: `id`, `path`, `name`, `branch`, `main`, `current` and `phase`.
- `game`: `state` and, while the game runs, its `url`.
- `menu`: the page's menu entry `id`.
- `studio`: `root` and `baseBranch`.

The shell sends the context only to project pages, which share its origin, and never to `url` entries. `/sdk/studio.css` provides the studio's colours, fonts and basic element styles. `examples/studio/` holds a sample settings file and page.

## Security

- **Local requests only:** the studio listens on `127.0.0.1`. It answers only requests whose host name is local, and never a page from another origin, including another port on the same machine.
- **Changes:**
  - Every request that changes something needs the `X-Studio: 1` header and an `Origin` equal to the studio's own.
  - A request names a worktree by the exact path that `git worktree list` reports. Paths are never case-folded.
  - The studio recognises its own repository by comparing the directory itself (device and inode).
- **Project pages:**
  - They are served only from the `studio/` folder of worktrees Git reports.
  - They share the studio's origin, so they can use its API like the shell does. Treat them as project code.
  - Only project pages may frame each other inside the studio. The shell cannot be framed by another site.
- **Games:**
  - A game starts only in an existing worktree folder, and only with the configured command, never a command from a page.
  - Its port stays reserved until the game stops or fails, and a process that cannot start fails only that game.
- **Opening in the default browser** takes a running game or a configured menu entry, never a URL from a page, and runs no shell.

## Releases

This repository holds the published releases, one commit and tag per version. The studio is developed in a private repository.
