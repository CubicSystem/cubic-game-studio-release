<!-- Managed by cubic-game-studio {{version}}. Changes here are overwritten; `game-studio init` refreshes this file. -->
# Studio folder

This folder configures the project's [development studio](https://github.com/CubicSystem/cubic-game-studio-release). The studio is a shell with a menu, the worktree list and the current target. The pages behind its menu can be replaced or added per project.

| Path | Owner | Purpose |
|---|---|---|
| `studio.json` | project | Settings: base branch, how a game starts, and the menu |
| `pages/<id>/` | project | The project's own pages, one folder per page |
| `README.md` | studio | This guide; refreshed by the studio |

The studio's agent skills (`.agents/skills/studio*/`, `.claude/skills/studio*/`) are also refreshed by the studio. Files without the "Managed by cubic-game-studio" line are left alone.

## Running the studio

Run `npm run studio` when the project defines that script, otherwise `npx -y "github:CubicSystem/cubic-game-studio-release#semver:*"`. Settings and pages are read on every request, so edits and branch switches apply after a refresh, without a restart.

## Settings

```json
{
  "baseBranch": "main",
  "game": { "command": "npm run dev --", "portArgs": ["--port", "{port}", "--strictPort"], "firstPort": 5173, "size": [480, 800] },
  "menus": [
    { "id": "sound", "name": "Sound", "icon": "sound", "page": "pages/sound/index.html" },
    { "id": "game", "name": "Play", "page": "pages/play/index.html" },
    { "id": "docs", "name": "Docs", "icon": "data", "url": "https://example.com/docs" }
  ]
}
```

| Field | Meaning |
|---|---|
| `baseBranch` | Branch that sub worktrees merge into. |
| `game.command`, `game.portArgs` | How a worktree's game starts; `{port}` is replaced with a free port from `game.firstPort`. |
| `game.size` | `[width, height]` of the game, for the frame of the built-in game page. |
| `menus[].id` | Unique id. `home` and `game` are the built-in pages. |
| `menus[].name`, `menus[].icon` | Label and icon: `home`, `game`, `image`, `sound`, `layout`, `data`, `settings`, `tool`. |
| `menus[].page` | A page in this folder, such as `pages/sound/index.html`. |
| `menus[].url` | An absolute URL, or a path on the selected worktree's running game server. |
| `menus[].hidden` | `true` removes the entry, a built-in page included. |

The menu keeps the order of `menus`. Built-in pages that `menus` does not name come first. Naming a built-in page lets you move, relabel, replace or hide it. An entry with neither `page` nor `url` is shown as not connected.

## Pages

A page is a plain web page in `pages/<id>/`. The studio serves this folder from the worktree selected in its sidebar. Selecting a worktree therefore shows that branch's version of the page. Keep a page's files inside this folder and refer to them with relative paths. Files outside `studio/` are not served.

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <link rel="stylesheet" href="/sdk/studio.css" />
  </head>
  <body>
    <h1>Sound</h1>
    <p id="target"></p>
    <script type="module">
      import { studio } from '/sdk/studio.js';
      studio.onContext(({ worktree, game }) => {
        document.querySelector('#target').textContent = `${worktree.name} · ${worktree.branch ?? 'detached'} · game ${game.state}`;
      });
    </script>
  </body>
</html>
```

### Page SDK (`/sdk/studio.js`)

| Member | Meaning |
|---|---|
| `studio.context` | The latest context, or `null` before the first one and when the page is opened outside the studio. |
| `studio.onContext(listener)` | Calls `listener(context)` now when known and after every change; returns a function that stops listening. |
| `studio.api(route, body?)` | Calls the studio API: `api('state')` for all worktrees, or `api('game/start', { path })` and `api('game/stop', { path })`. |

The context contains:

- `worktree`: `id`, `path`, `name`, `branch`, `main`, `current` and `phase`;
- `game`: `state` (`running`, `starting`, `stopping`, `stopped` or `failed`) and `url` while it runs;
- `menu`: the page's menu `id`;
- `studio`: `root` and `baseBranch`.

`/sdk/studio.css` provides the studio's colours, fonts and basic element styles.
