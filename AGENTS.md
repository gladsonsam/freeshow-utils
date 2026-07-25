# AGENTS.md

Guidance for AI agents working in this repo. Tauri v2 + SvelteKit (Svelte 5 runes) + TypeScript.

## Commands

```bash
npm run check          # svelte-check — must be 0 errors, 0 warnings before you commit
npm run build          # frontend build
npm run tauri dev      # run the app
cd src-tauri && cargo check
```

`npm run tauri dev` fails if a vite server is already on port 1420. If one is, run
`cd src-tauri && cargo run` instead — the debug build attaches to the existing dev server.

Commit messages: one short line, no body, no `Co-Authored-By`.

## Layout

```
src/lib/core/         FreeShow connector + resolved data model (no Svelte components)
src/lib/ui/           themed primitives (Sidebar, Button, Panel, Modal, Tabs, …)
src/lib/shell/        app-level chrome (connection settings)
src/lib/functions/    one folder per function + registry.ts
src/routes/           app shell (/) and the stage output window (/output)
src-tauri/src/        Rust commands grouped by concern (python.rs, templates.rs)
```

Adding a function = one entry in `src/lib/functions/registry.ts` plus one folder. Never wire a
function into the shell directly.

## Rules that will bite you

**Read-only against FreeShow.** The app subscribes to the Stage feed and issues `get_*` queries.
Never add a call that controls or mutates a running FreeShow — no clearing outputs, no changing
slides, nothing.

**`StageData` in `src/lib/core/types.ts` is a public API.** User-written templates depend on its
shape. Add fields freely; do not rename or remove them. It is deliberately free of FreeShow's
internal ids and layout indices so templates survive FreeShow protocol changes.

**Templates are document fragments**, not full HTML documents — `<style>`, markup and `<script>`
only. `buildTemplateDocument()` wraps them and injects the bootstrap. They run in an iframe with
`sandbox="allow-scripts"` (no network, no same-origin), fed by `postMessage`.

**Tauri arg naming**: `invoke("write_template", { destPath })` maps to a Rust `dest_path` param.
camelCase in JS, snake_case in Rust.

**Output window labels** are `output-<template-id>` and must keep matching the `"output-*"` glob
in `src-tauri/capabilities/default.json`. New window/monitor APIs need their permission added
there too, or they fail silently at runtime.

**`trailingSlash = "always"`** in `src/routes/+layout.ts` is load-bearing: without it
adapter-static emits `output.html`, which the Tauri asset protocol can't resolve at `/output/`.

**Starter templates** are real `.html` files imported with Vite's `?raw` and copied to the app
data dir on first run. Edit the files, not a string constant.

## Styling

Tokens in `src/lib/ui/theme.css` are FreeShow's own values (`--primary`, `--secondary`, `--hover`,
…), taken so the two apps sit together without a seam. Use them; don't introduce new colours.

FreeShow's conventions, which this UI follows:

- selection is a `--secondary` **outline**, never a left accent bar
- corners are square (the 5px `--radius` is for dialogs only)
- surfaces are flat; hover/focus are white overlays, not new colours
- headers are normal case, not uppercase with letter-spacing

Native form controls need help: `color-scheme: dark` is set on `:root`, and `select` is drawn
manually — otherwise dropdowns render white-on-white in the webview.

## Verifying UI work

Type-checking is not enough for visual changes. Run the app and look at it — on Linux, `grim` +
`magick` crop gives you a screenshot. To test template rendering without Tauri, build a harness
page that inlines a starter plus the bootstrap and posts fixture data into it, then screenshot it
with `chromium --headless --screenshot`.

Licensed GPL-3.0-only, matching FreeShow.
