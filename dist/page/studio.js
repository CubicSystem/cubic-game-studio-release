// page/studio.ts
var $ = (selector) => document.querySelector(selector);
var esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
var icon = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
var icons = {
  home: '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z"/>',
  game: '<rect x="3" y="7" width="18" height="11" rx="4"/><path d="M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 14h.01"/>',
  image: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.6"/><path d="m20 15-4.5-4.5L6 20"/>',
  sound: '<path d="M5 10v4h3l5 4V6L8 10z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
  data: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  tool: '<path d="M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  mainFolder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 13h6"/>',
  branch: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 8v8M18 10c0 4-6 3-10 7"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
  fetch: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  local: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/>'
};
var phaseLabel = { work: "\uC791\uC5C5 \uC911", pull: "\uBC1B\uC544\uC624\uAE30 \uD544\uC694", push: "\uD478\uC2DC \uD544\uC694", review: "\uBCD1\uD569 \uB300\uAE30", merged: "\uBCD1\uD569\uB428 \xB7 \uC815\uB9AC \uAC00\uB2A5", current: "\uCD5C\uC2E0" };
var gameLabel = { running: "\uC2E4\uD589 \uC911", starting: "\uC2DC\uC791 \uC911", stopping: "\uC911\uC9C0 \uC911", stopped: "\uAEBC\uC9D0", failed: "\uC2E4\uD328" };
var state;
var selectedPath = "";
var view = "home";
var folded = new Set(JSON.parse(safeRead("studio:folded") ?? "[]"));
function safeRead(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeWrite(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
  }
}
async function api(route, body) {
  const response = await fetch(`/api/${route}`, body ? { method: "POST", headers: { "Content-Type": "application/json", "X-Studio": "1" }, body: JSON.stringify(body) } : void 0);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}
function openInSystemBrowser(link, target) {
  link.addEventListener("click", (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !link.href) return;
    event.preventDefault();
    api("open", target).then((result) => say(`\uAE30\uBCF8 \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C \uC5F4\uC5C8\uC2B5\uB2C8\uB2E4: ${result.url}`)).catch(() => window.open(link.href, "_blank", "noopener"));
  });
}
var configErrorShown = false;
function say(message, error = false) {
  const foot = $("#foot");
  foot.textContent = message;
  foot.classList.toggle("error", error);
  configErrorShown = false;
}
var current = () => state?.worktrees.find((item) => item.path === selectedPath) ?? state?.worktrees[0];
var relative = new Intl.RelativeTimeFormat("ko", { numeric: "auto" });
function ago(time) {
  const seconds = Math.round((time - Date.now()) / 1e3);
  for (const [unit, size] of [["day", 86400], ["hour", 3600], ["minute", 60]]) if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  return "\uBC29\uAE08";
}
var count = (item, kind) => item.files.filter((file) => file.kind === kind).length;
async function refresh(quiet = false) {
  try {
    state = await api("state");
    const version = $("#version");
    version.textContent = `v${state.version}`;
    version.title = `cubic-game-studio ${state.version}`;
    version.hidden = false;
    document.documentElement.style.setProperty("--game-w", String(state.gameSize[0]));
    document.documentElement.style.setProperty("--game-h", String(state.gameSize[1]));
    if (!state.worktrees.some((item) => item.path === selectedPath)) selectedPath = state.worktrees.find((item) => item.current)?.path ?? state.worktrees[0]?.path ?? "";
    render();
    if (state.configError) {
      say(`\uC124\uC815 \uD30C\uC77C\uC744 \uC77D\uC9C0 \uBABB\uD574 \uB9C8\uC9C0\uB9C9 \uC815\uC0C1 \uC124\uC815\uC744 \uC501\uB2C8\uB2E4. ${state.configError}`, true);
      configErrorShown = true;
    } else if (!quiet || configErrorShown) say(`\uC6CC\uD06C\uD2B8\uB9AC ${state.worktrees.length}\uAC1C\uB97C \uC77D\uC5C8\uC2B5\uB2C8\uB2E4.`);
  } catch (error) {
    say(`\uC0C1\uD0DC\uB97C \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${error.message}`, true);
  }
}
function tags(item) {
  const out = [`<span class="tag phase ${item.phase}">${phaseLabel[item.phase]}</span>`];
  for (const [kind, sign, title] of [["M", "M", "\uC218\uC815\uB41C \uD30C\uC77C"], ["A", "+", "\uCD94\uAC00\uB41C \uD30C\uC77C"], ["D", "\u2212", "\uC0AD\uC81C\uB41C \uD30C\uC77C"], ["R", "R", "\uC774\uB984\uC774 \uBC14\uB010 \uD30C\uC77C"], ["U", "!", "\uCDA9\uB3CC"]]) {
    const n = count(item, kind);
    if (n) out.push(`<span class="tag ${kind}" title="${title}">${sign} ${n}</span>`);
  }
  if (item.detached) out.push('<span class="tag" title="\uBE0C\uB79C\uCE58 \uC5C6\uC774 \uCEE4\uBC0B\uC5D0 \uACE0\uC815\uB41C \uC6CC\uD06C\uD2B8\uB9AC">detached</span>');
  else if (!item.upstream) out.push('<span class="tag push" title="\uC6D0\uACA9 \uBE0C\uB79C\uCE58\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4">\uC6D0\uACA9 \uC5C6\uC74C</span>');
  if (item.ahead) out.push(`<span class="tag push" title="\uD478\uC2DC\uD560 \uCEE4\uBC0B">\u2191 ${item.ahead}</span>`);
  if (item.behind) out.push(`<span class="tag pull" title="\uBC1B\uC544\uC62C \uCEE4\uBC0B">\u2193 ${item.behind}</span>`);
  return out.join("");
}
function treeEntry(item) {
  const open = !folded.has(item.path), branch = item.branch ?? (item.detached ? `detached ${item.head.slice(0, 7)}` : "(\uBE0C\uB79C\uCE58 \uC5C6\uC74C)");
  return `<div class="wt" data-open="${open}">
    <div class="wt-head">
      <button class="fold" data-fold="${esc(item.path)}" aria-expanded="${open}" aria-label="${esc(item.name)} ${open ? "\uC811\uAE30" : "\uD3BC\uCE58\uAE30"}">${icon(icons.chevron)}</button>
      <button class="row" data-tree="${esc(item.path)}" ${item.path === selectedPath ? 'aria-current="page"' : ""} title="${esc(item.path)}">
        ${icon(item.main ? icons.mainFolder : icons.folder)}<span class="name">${esc(item.name)}</span>
        <span class="end"><span class="dot ${item.phase}" title="${phaseLabel[item.phase]}"></span></span>
      </button>
    </div>
    <div class="wt-body">
      <span class="wt-branch" title="\uBE0C\uB79C\uCE58 ${esc(branch)}">${icon(icons.branch)}<span>${esc(branch)}</span></span>
      <span class="wt-tags">${tags(item)}</span>
    </div>
  </div>`;
}
function renderRail() {
  const menus = state?.menus ?? [];
  const parts = [];
  menus.forEach((menu, index) => {
    if (index > 0 && menus[index - 1].kind === "builtin" && menu.kind !== "builtin") parts.push("<hr>");
    const extra = menu.kind === "none" ? `class="unlinked" title="${esc(menu.name)} (\uC5F0\uACB0 \uC548 \uB428)"` : `title="${esc(menu.name)}"`;
    parts.push(`<button data-menu="${esc(menu.id)}" aria-pressed="${view === menu.id}" ${extra}>${icon(icons[menu.icon] ?? icons.tool)}<span>${esc(menu.name)}</span></button>`);
  });
  $("#rail").innerHTML = parts.join("");
  document.querySelectorAll("#rail [data-menu]").forEach((item) => item.addEventListener("click", () => {
    view = item.dataset.menu;
    render();
  }));
}
function renderTree() {
  const list = state?.worktrees ?? [];
  $("#project").textContent = state ? state.root.split(/[\\/]/).pop() ?? "" : "";
  $("#tree-main").innerHTML = list.filter((item) => item.main).map(treeEntry).join("");
  const subs = list.filter((item) => !item.main);
  $("#sub-count").textContent = String(subs.length);
  $("#tree-sub").innerHTML = subs.length ? subs.map(treeEntry).join("") : '<div class="empty-list">\uC5C6\uC74C</div>';
  document.querySelectorAll(".side [data-fold]").forEach((item) => item.addEventListener("click", () => {
    const key = item.dataset.fold;
    if (folded.has(key)) folded.delete(key);
    else folded.add(key);
    safeWrite("studio:folded", JSON.stringify([...folded]));
    renderTree();
  }));
  document.querySelectorAll(".side [data-tree]").forEach((item) => item.addEventListener("click", () => {
    selectedPath = item.dataset.tree;
    render();
  }));
}
function nextStep(item) {
  const base = state?.baseBranch ?? "main";
  switch (item.phase) {
    case "work":
      return `\uCEE4\uBC0B\uD558\uC9C0 \uC54A\uC740 \uBCC0\uACBD ${item.fileCount ?? item.files.length}\uAC1C\uAC00 \uC788\uC2B5\uB2C8\uB2E4. \uCEE4\uBC0B\uD558\uC138\uC694.`;
    case "pull":
      return item.ahead ? `\uC6D0\uACA9\uACFC \uAC08\uB77C\uC84C\uC2B5\uB2C8\uB2E4. \uBC1B\uC544\uC62C \uCEE4\uBC0B ${item.behind}\uAC1C, \uD478\uC2DC\uD560 \uCEE4\uBC0B ${item.ahead}\uAC1C\uAC00 \uC788\uC2B5\uB2C8\uB2E4. \uBA3C\uC800 \uBC1B\uC544\uC640 \uD569\uCE5C \uB4A4 \uD478\uC2DC\uD558\uC138\uC694.` : `\uC6D0\uACA9\uC5D0 \uC0C8 \uCEE4\uBC0B ${item.behind}\uAC1C\uAC00 \uC788\uC2B5\uB2C8\uB2E4. \uBC1B\uC544\uC624\uC138\uC694.`;
    case "push":
      return item.upstream ? `\uCEE4\uBC0B ${item.ahead}\uAC1C\uB97C \uD478\uC2DC\uD558\uC138\uC694.` : "\uC6D0\uACA9 \uBE0C\uB79C\uCE58\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uD478\uC2DC\uD574\uC11C \uC6D0\uACA9 \uBE0C\uB79C\uCE58\uB97C \uB9CC\uB4DC\uC138\uC694.";
    case "review":
      return `${base}\uC5D0 \uC544\uC9C1 \uBCD1\uD569\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. PR \uBCD1\uD569\uC744 \uAE30\uB2E4\uB9AC\uB294 \uC911\uC785\uB2C8\uB2E4.`;
    case "merged":
      return `${base}\uC5D0 \uBCD1\uD569\uB410\uACE0 \uB0A8\uC740 \uBCC0\uACBD\uB3C4 \uC5C6\uC2B5\uB2C8\uB2E4. \uC774 \uC6CC\uD06C\uD2B8\uB9AC\uB294 \uC815\uB9AC\uD574\uB3C4 \uB429\uB2C8\uB2E4.`;
    case "current":
      return "\uD560 \uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uC6D0\uACA9\uACFC \uAC19\uC740 \uC0C1\uD0DC\uC785\uB2C8\uB2E4.";
  }
}
function syncText(item) {
  if (!item.upstream) return "\uC6D0\uACA9 \uBE0C\uB79C\uCE58 \uC5C6\uC74C";
  if (item.ahead && item.behind) return "\uC6D0\uACA9\uACFC \uAC08\uB77C\uC9D0";
  return item.behind ? "\uBC1B\uC544\uC62C \uCEE4\uBC0B\uC774 \uC788\uC2B5\uB2C8\uB2E4" : item.ahead ? "\uD478\uC2DC\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4" : "\uC6D0\uACA9\uACFC \uAC19\uC74C";
}
function renderDetail(item) {
  const files = item.files.length ? item.files.map((file) => `<div class="f"><span class="k ${file.kind}">${file.kind}</span><span class="path">${esc(file.path)}</span><small>${file.staged ? "\uC2A4\uD14C\uC774\uC9D5\uB428" : ""}</small></div>`).join("") + ((item.fileCount ?? 0) > item.files.length ? `<div class="none">\uC678 ${(item.fileCount ?? 0) - item.files.length}\uAC1C</div>` : "") : '<div class="none">\uCEE4\uBC0B\uD558\uC9C0 \uC54A\uC740 \uBCC0\uACBD\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>';
  const commits = item.commits.map((c) => `<div><span class="mono">${esc(c.hash)}</span><span class="subject">${esc(c.subject)}</span><span class="spacer"></span><span class="mono">${ago(c.time)}</span></div>`).join("");
  const cleanup = item.phase === "merged" ? `<span class="spacer"></span><code>git worktree remove "${esc(item.path)}"</code>` : "";
  $("#detail").innerHTML = `
    <header>
      <h1>${esc(item.name)}<span class="phase ${item.phase}">${phaseLabel[item.phase]}</span></h1>
      <p class="mono">${item.main ? "\uBA54\uC778 \uC6CC\uD06C\uD2B8\uB9AC" : "\uC11C\uBE0C \uC6CC\uD06C\uD2B8\uB9AC"} \xB7 ${esc(item.path)}</p>
    </header>
    ${item.error ? `<div class="next" style="color:var(--del)"><b>\uC77D\uAE30 \uC2E4\uD328</b><span>${esc(item.error)}</span></div>` : ""}
    <div class="facts">
      <div class="fact"><span>\uBE0C\uB79C\uCE58</span><b class="small">${esc(item.branch ?? "(\uC5C6\uC74C)")}</b><small>${esc(item.upstream ?? "\uC6D0\uACA9 \uBE0C\uB79C\uCE58 \uC5C6\uC74C")}</small></div>
      <div class="fact"><span>\uCEE4\uBC0B \uC548 \uD55C \uBCC0\uACBD</span><b>${item.fileCount ?? item.files.length}</b><small>\uC218\uC815 ${count(item, "M")} \xB7 \uCD94\uAC00 ${count(item, "A")} \xB7 \uC0AD\uC81C ${count(item, "D")}</small></div>
      <div class="fact"><span>\uD478\uC2DC / \uBC1B\uC544\uC624\uAE30</span><b>\u2191${item.ahead} \u2193${item.behind}</b><small>${syncText(item)}</small></div>
      ${item.main ? "" : `<div class="fact"><span>${esc(state?.baseBranch)} \uBCD1\uD569</span><b>${item.merged === null ? "\uD655\uC778 \uBD88\uAC00" : item.merged ? "\uBCD1\uD569\uB428" : "\uC544\uC9C1"}</b><small>${esc(item.baseRef ?? "\uAE30\uC900 \uBE0C\uB79C\uCE58 \uC5C6\uC74C")} \uAE30\uC900</small></div>`}
    </div>
    <div class="next"><b>\uB2E4\uC74C \uD560 \uC77C</b><span>${nextStep(item)}</span>${cleanup}</div>
    <div><p class="h3">\uBCC0\uACBD\uB41C \uD30C\uC77C</p><div class="files">${files}</div></div>
    <div><p class="h3">\uCD5C\uADFC \uCEE4\uBC0B</p><div class="commits">${commits || '<div class="none">\uCEE4\uBC0B\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>'}</div></div>`;
}
var logMode = "auto";
var logFor = "";
var logShown = (game) => game.log.length > 0 && (logMode === "open" || logMode === "auto" && (game.state === "starting" || game.state === "failed"));
function renderGame(item) {
  const game = item.game, running = game.state === "running";
  const url = game.url ?? "";
  if (logFor !== item.path) {
    logFor = item.path;
    logMode = "auto";
  }
  const key = `${item.path}|${running ? url : ""}`;
  const section = $("#view-game");
  if (section.dataset.key !== key) {
    section.dataset.key = key;
    section.innerHTML = `
      <div class="bar"><h2>\uAC8C\uC784</h2><span class="pill" id="game-state"></span><span class="spacer"></span><span class="mono foot" id="game-url"></span></div>
      <div class="bar">
        <button class="btn primary" id="game-toggle"></button>
        <button class="btn" id="game-reload">\uC0C8\uB85C\uACE0\uCE68</button>
        <a class="btn" id="game-open" target="_blank" rel="noopener">\uC0C8 \uD0ED\uC73C\uB85C \uC5F4\uAE30</a>
        <span class="spacer"></span>
        <button class="btn" id="game-log-toggle" aria-controls="game-log">\uB85C\uADF8</button>
      </div>
      <div class="stage">
        <div class="frame-box"><div class="frame">${running ? `<iframe title="${esc(item.name)} \uAC8C\uC784" src="${esc(url)}"></iframe>` : '<span id="game-off"></span>'}</div></div>
        <pre class="log" id="game-log" hidden></pre>
      </div>`;
    $("#game-toggle").addEventListener("click", () => void toggleGame());
    $("#game-reload").addEventListener("click", () => {
      const frame = section.querySelector("iframe");
      if (frame) frame.src = frame.src;
    });
    $("#game-log-toggle").addEventListener("click", () => {
      const target = current();
      if (!target) return;
      logMode = logShown(target.game) ? "closed" : "open";
      renderGame(target);
    });
    openInSystemBrowser($("#game-open"), { path: item.path });
  }
  const pill = $("#game-state");
  pill.textContent = gameLabel[game.state];
  pill.className = `pill ${game.state}`;
  $("#game-url").textContent = game.url ?? "";
  const toggle = $("#game-toggle");
  toggle.textContent = running || game.state === "starting" ? "\uC911\uC9C0" : "\uAC8C\uC784 \uC2E4\uD589";
  toggle.disabled = game.state === "stopping";
  $("#game-reload").disabled = !running;
  const open = $("#game-open");
  if (running) open.href = url;
  else open.removeAttribute("href");
  open.setAttribute("aria-disabled", String(!running));
  const off = document.querySelector("#game-off");
  if (off) off.textContent = game.state === "starting" ? "\uAC1C\uBC1C \uC11C\uBC84\uB97C \uC2DC\uC791\uD558\uB294 \uC911\uC785\uB2C8\uB2E4\u2026" : game.state === "failed" ? "\uC2E4\uD589\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uB85C\uADF8\uB97C \uD655\uC778\uD558\uC138\uC694." : "\uAC8C\uC784\uC774 \uAEBC\uC838 \uC788\uC2B5\uB2C8\uB2E4";
  const log = $("#game-log"), shown = logShown(game);
  log.hidden = !shown;
  log.textContent = game.log.join("\n");
  if (shown) log.scrollTop = log.scrollHeight;
  const logToggle = $("#game-log-toggle");
  logToggle.disabled = !game.log.length;
  logToggle.textContent = shown ? "\uB85C\uADF8 \uC228\uAE30\uAE30" : "\uB85C\uADF8";
  logToggle.setAttribute("aria-expanded", String(shown));
}
async function toggleGame() {
  const item = current();
  if (!item) return;
  const starting = !(item.game.state === "running" || item.game.state === "starting");
  try {
    await api(starting ? "game/start" : "game/stop", { path: item.path });
    say(starting ? `${item.name}: \uAC1C\uBC1C \uC11C\uBC84\uB97C \uC2DC\uC791\uD569\uB2C8\uB2E4.` : `${item.name}: \uAC1C\uBC1C \uC11C\uBC84\uB97C \uBA48\uCDC4\uC2B5\uB2C8\uB2E4.`);
  } catch (error) {
    say(`\uC2E4\uD589 \uC694\uCCAD \uC2E4\uD328: ${error.message}`, true);
  }
  await refresh(true);
}
var pageUrl = (item, page) => `/w/${item.id}/${page.split("/").map(encodeURIComponent).join("/")}`;
function renderPage(item, menu) {
  const section = $("#view-page");
  const gameUrl = item.game.state === "running" ? item.game.url ?? null : null;
  let url = null;
  if (menu.kind === "page" && menu.page) url = pageUrl(item, menu.page);
  else if (menu.kind === "url" && menu.url) {
    try {
      url = (gameUrl ? new URL(menu.url, gameUrl) : new URL(menu.url)).href;
    } catch {
      url = null;
    }
  }
  const key = `${menu.id}|${menu.kind}|${url ?? menu.url ?? ""}|${item.path}`;
  if (section.dataset.key === key) return;
  section.dataset.key = key;
  sentContext = "";
  const title = `<div class="bar"><h2>${esc(menu.name)}</h2>`;
  if (url) {
    const own = menu.kind === "page";
    section.innerHTML = `${title}<span class="spacer"></span>
         ${own ? '<button class="btn" id="page-reload">\uC0C8\uB85C\uACE0\uCE68</button>' : ""}
         <a class="btn" id="page-open" href="${esc(url)}" target="_blank" rel="noopener">\uC0C8 \uD0ED\uC73C\uB85C \uC5F4\uAE30</a></div>
       <iframe class="tool-frame" id="page-frame" title="${esc(menu.name)}" src="${esc(url)}"></iframe>
       <p class="foot">${own ? `<code>studio/${esc(menu.page)}</code> \xB7 ` : ""}\uB300\uC0C1 \uC6CC\uD06C\uD2B8\uB9AC: ${esc(item.name)}</p>`;
    document.querySelector("#page-reload")?.addEventListener("click", () => {
      const frame = $("#page-frame");
      frame.src = frame.src;
    });
    openInSystemBrowser($("#page-open"), { path: item.path, menu: menu.id });
  } else if (menu.kind === "url") {
    section.innerHTML = `${title}</div>
       <div class="empty"><b>\uAC8C\uC784 \uC11C\uBC84\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4</b><span>${esc(menu.name)} \uD398\uC774\uC9C0\uB294 \uAC8C\uC784 \uAC1C\uBC1C \uC11C\uBC84\uC5D0\uC11C \uC5F4\uB9BD\uB2C8\uB2E4(<code>${esc(menu.url)}</code>). \uAC8C\uC784 \uBA54\uB274\uC5D0\uC11C ${esc(item.name)}\uC758 \uAC8C\uC784\uC744 \uC2E4\uD589\uD558\uC138\uC694.</span></div>`;
  } else {
    section.innerHTML = `${title}</div>
       <div class="empty"><b>\uC5F0\uACB0 \uC548 \uB428</b><span>\uC544\uC9C1 ${esc(menu.name)} \uD398\uC774\uC9C0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. <code>studio/pages/${esc(menu.id)}/index.html</code>\uC744 \uB9CC\uB4E4\uACE0 <code>studio/studio.json</code>\uC758 \uC774 \uBA54\uB274 \uD56D\uBAA9\uC5D0 <code>"page": "pages/${esc(menu.id)}/index.html"</code>\uC744 \uC801\uC73C\uBA74 \uC5EC\uAE30\uC11C \uC5F4\uB9BD\uB2C8\uB2E4.</span></div>`;
  }
}
function pageContext(item, menu) {
  return {
    worktree: { id: item.id, path: item.path, name: item.name, branch: item.branch, main: item.main, current: item.current, phase: item.phase },
    game: { state: item.game.state, url: item.game.state === "running" ? item.game.url ?? null : null },
    menu: { id: menu.id },
    studio: { root: state?.root ?? "", baseBranch: state?.baseBranch ?? "" }
  };
}
var sentContext = "";
function postContext(force = false) {
  const item = current(), menu = activeMenu();
  const frame = document.querySelector("#view-page.active #page-frame");
  if (!item || !menu || menu.kind !== "page" || !frame?.contentWindow) return;
  const context = pageContext(item, menu), text = JSON.stringify(context);
  if (!force && text === sentContext) return;
  sentContext = text;
  frame.contentWindow.postMessage({ type: "studio:context", context }, location.origin);
}
window.addEventListener("message", (event) => {
  const frame = document.querySelector("#page-frame");
  if (event.origin === location.origin && event.source === frame?.contentWindow && event.data?.type === "studio:ready") postContext(true);
});
function renderContext(item) {
  $("#context").innerHTML = `
    <span>${icon(item.main ? icons.mainFolder : icons.folder)}${esc(item.name)}</span>
    <span>${icon(icons.local)}\uB85C\uCEEC</span>
    <span>${icon(icons.branch)}<span class="mono">${esc(item.branch ?? "(\uC5C6\uC74C)")}</span></span>
    <span><span class="phase ${item.phase}">${phaseLabel[item.phase]}</span></span>`;
}
function activeMenu() {
  const menus = state?.menus ?? [];
  return menus.find((entry) => entry.id === view) ?? menus[0];
}
function render() {
  const menu = activeMenu();
  if (menu) view = menu.id;
  renderRail();
  renderTree();
  const item = current();
  document.querySelectorAll(".view").forEach((section) => section.classList.remove("active"));
  const builtIn = menu?.kind === "builtin" ? menu.id : null;
  $(builtIn === "home" ? "#view-home" : builtIn === "game" ? "#view-game" : "#view-page").classList.add("active");
  if (!item || !menu) {
    $("#detail").innerHTML = '<div class="empty"><b>\uC6CC\uD06C\uD2B8\uB9AC\uB97C \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4</b></div>';
    return;
  }
  renderDetail(item);
  if (builtIn === "game") renderGame(item);
  if (!builtIn) renderPage(item, menu);
  else {
    $("#view-page").innerHTML = "";
    $("#view-page").dataset.key = "";
  }
  renderContext(item);
  postContext();
}
$("#refresh").innerHTML = icon(icons.refresh);
$("#fetch").innerHTML = icon(icons.fetch);
$("#refresh").addEventListener("click", () => void refresh());
$("#fetch").addEventListener("click", async () => {
  const button = $("#fetch");
  button.setAttribute("aria-busy", "true");
  say("\uC6D0\uACA9 \uBE0C\uB79C\uCE58\uB97C \uBC1B\uC544\uC624\uB294 \uC911\u2026");
  try {
    await api("fetch", {});
    await refresh(true);
    say("\uC6D0\uACA9 \uBE0C\uB79C\uCE58\uB97C \uBC1B\uC544\uC654\uC2B5\uB2C8\uB2E4.");
  } catch (error) {
    say(`fetch \uC2E4\uD328: ${error.message}`, true);
  } finally {
    button.removeAttribute("aria-busy");
  }
});
window.addEventListener("focus", () => void refresh(true));
var tick = () => {
  const busy = state?.worktrees.some((item) => item.game.state === "starting" || item.game.state === "stopping");
  setTimeout(() => {
    void refresh(true).finally(tick);
  }, busy ? 1500 : 1e4);
};
void refresh().then(tick);
