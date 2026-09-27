---
name: studio-page
description: Add, change, replace, reorder or remove a page or menu entry of this project's development studio, meaning pages in studio/pages/ and the menu in studio/studio.json, including replacing or hiding the built-in home or game page. Use for requests such as "스튜디오에 사운드 페이지 추가해줘", "스튜디오 메뉴 바꿔줘", "스튜디오 게임 화면 교체해줘" or "add a studio page".
---
<!-- Managed by cubic-game-studio {{version}}. Changes here are overwritten; `game-studio init` refreshes this file. -->

# Studio pages and menus

The studio is a shell: a menu, the worktree list and the current target. Everything behind the menu can be the project's own page. Read [studio/README.md](../../../studio/README.md) for every settings field, the page example and the page SDK. Keep changes inside `studio/` unless the user asks for more.

## Procedure

1. Inspect `studio/studio.json` and `studio/pages/`, and the page the user refers to. If `studio/` is missing, run the studio once (see the [studio skill](../studio/SKILL.md)) or `game-studio init`; it creates the folder.
2. Write the page as `studio/pages/<id>/index.html`, with its scripts, styles and assets in the same folder under relative paths.
   - Use plain HTML, CSS and ES modules. A page needs no build step. If the project wants one, its output must land in the page's folder.
   - Only `studio/` is served, so do not refer to files outside it. To show game content, use the game's URL from the SDK context.
   - For the studio's look, link `/sdk/studio.css`. For the selected worktree and its game, use `import { studio } from '/sdk/studio.js'`.
3. Register it in `studio/studio.json` under `menus`: `{ "id": "<id>", "name": "<label>", "icon": "<icon>", "page": "pages/<id>/index.html" }`.
   - The menu keeps the array order.
   - Use the id `home` or `game` to relabel, replace or move a built-in page, and `"hidden": true` to remove an entry.
   - Use `url` instead of `page` for a page served elsewhere.
   - Keep ids unique and settings valid JSON. While the file cannot be parsed, the studio keeps the last good settings and shows the error.
4. To remove a page, delete its menu entry and its folder together.
5. Verify in the studio.
   - Open it with the studio skill and select the menu entry. Settings and pages apply without a restart; refresh the page.
   - Check that the page loads without console errors and reacts when another worktree is selected.
   - Pages are read from the selected worktree: select the worktree that contains your change.
6. Report which pages and menu entries changed. `studio/studio.json` and `studio/pages/` are project files, so commit them with the change.

Do not edit the files the studio manages: `studio/README.md` and the `studio` and `studio-page` skills. They carry a "Managed by cubic-game-studio" line and are replaced by newer releases. Put project-specific guidance for pages in the page folders.
