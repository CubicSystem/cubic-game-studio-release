---
name: studio
description: Open this project's development studio (worktree list, game runner, project pages), reusing a running studio or starting one. Use for "스튜디오 열어줘", "스튜디오 띄워줘", "open the studio" or an explicit studio request.
---
<!-- Managed by cubic-game-studio {{version}}. Changes here are overwritten; `game-studio init` refreshes this file. -->

# Open the development studio

The development studio is the separate cubic-game-studio tool, configured by [`studio/`](../../../studio/README.md). Below, `STUDIO` means `npm run studio --` when `package.json` defines a `studio` script, otherwise `npx -y "github:CubicSystem/cubic-game-studio-release#semver:*"`. Work in the current checkout and inspect its path and branch. Opening the studio does not create or switch worktrees or branches.

## Find or start the studio

1. Run `STUDIO --find`. It prints the URL of a running studio for this checkout, or exits with 1 when none runs. Studios of other repositories or worktrees are ignored.
2. When none runs, start the studio as a long-running background process the agent owns with `STUDIO --no-open`. Use the host's own server tool when it has one (for example a preview server configured in `.claude/launch.json`), otherwise run it as a background command. Take the URL from the `Game Studio:` line of its output, or repeat step 1 until it answers.

The first run of a new studio release downloads it and needs network access. On start the studio creates a missing `studio/` folder and refreshes its managed files; report any files it lists, since they belong in a commit. Do not stop a studio the user started unless asked. Stopping the studio also stops the games it started. Settings and pages apply without a restart.

## Open and report

Open the URL where the user is working: the host's built-in browser when it has one (for example the Claude desktop app's browser pane), otherwise the system's default browser with `STUDIO` (it reuses the running studio and only opens the page). Use the default browser whenever the user asks for it.

Report the URL in one line and leave the studio running. To add or change the studio's pages or menu, use the [studio-page skill](../studio-page/SKILL.md).
