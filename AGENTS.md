# AGENTS.md

**Read this before writing code here.** FreeShow Utils is not an app with features. It is a
platform that runs modules. Almost every decision in this repo follows from that, and changes
that quietly assume otherwise are the main way to damage it.

## The idea

FreeShow does the heavy lifting; this app is where everything *around* it lives. Rather than
growing one program with more and more screens, it hosts self-contained **modules** — one job
each, independently useful.

Some ship with the app:

| Module | Status |
| --- | --- |
| Stage Display | shipped |
| Show Processor | shipped — runs Python scripts over pasted text; operating on shows directly is still to come |
| Show Importer | planned |

But shipping with the app is meant to be an accident of timing, nothing more. **The goal is that
anyone can write and share a module, and installing one is not a fork of this repo.** Someone
should be able to build a module for their own church's workflow, hand it to another church, and
have it work.

So the built-ins get **no privileges a third-party module wouldn't have**. Same connection, same
data, same UI kit, same registration. If you find yourself giving a built-in a shortcut — reaching
into another module's internals, adding a special case in the shell, talking to FreeShow outside
`core/` — you have broken the thing that makes this worth building. Fix the platform instead so
every module gets that capability.

## Two layers of extensibility

**1. Modules — extend the app.** A folder in `src/lib/modules/` and one entry in `registry.ts`.
The shell renders its sidebar from that list and knows nothing else about any module.

**2. Templates — extend a module.** Stage Display doesn't hardcode a layout; it runs user-written
HTML/CSS/JS templates in a sandboxed iframe, fed live data over `postMessage`. Users write them
in-app, and import and share them as ordinary `.html` files.

Layer 2 already works end to end, and it is the **reference for where layer 1 is going**: a stable
data contract, a sandbox, plain shareable files, no build step, no privileged access. Study
`src/lib/modules/stage-display/templateRuntime.ts` before designing anything extensible here.

Be honest about the gap: **modules are currently compile-time.** `registry.ts` is a static array,
so today a new module still means editing this repo. Runtime module installation is the direction,
not the current state. Don't document it as if it exists — but do build toward it. Concretely,
that means when you touch module-facing code, ask whether it would still work if the module were
loaded from disk at runtime by someone who has never seen this codebase.

## What a module gets, and what it owes

A module can rely on:

- `src/lib/core/` — the shared FreeShow connection and a clean, resolved data model. One
  connection per window, opened by the app shell, read by any module.
- `src/lib/ui/` — themed primitives, so a third-party module looks native for free.
- Its own folder, its own routes-free component, its own state.

A module must not:

- import from another module's folder — extract to `core/` or `ui/` instead
- talk to FreeShow directly — go through `core/`, so every module benefits from one fix
- require a change to the shell to work
- **write to FreeShow.** The whole app is read-only: it subscribes to the Stage feed and issues
  `get_*` queries. Nothing here may control or mutate a running FreeShow. This is a safety
  property for people using it live on a Sunday morning, not a style preference.

## Contracts you must not casually break

**`StageData` in `src/lib/core/types.ts`** is a public API. Templates users wrote months ago
depend on its shape. Add fields freely; never rename or remove one. It deliberately exposes no
FreeShow ids, layout keys or indices, so templates keep working when FreeShow's internals change —
don't leak those through it for convenience.

**The template runtime contract** — `window.onFreeShowUpdate` and `window.freeShowData` — is the
same kind of promise. Extend, don't reshape.

## Practical notes

```bash
npm run check          # must be 0 errors, 0 warnings before committing
npm run tauri dev      # run; if port 1420 is taken, use: cd src-tauri && cargo run
```

Commit messages: one short line, no body, no `Co-Authored-By`.

Things that will silently bite you:

- Tauri maps JS camelCase args to Rust snake_case (`destPath` → `dest_path`).
- Output windows are labelled `output-<template-id>` and must keep matching the `"output-*"` glob
  in `src-tauri/capabilities/default.json`. New window/monitor APIs need permissions added there
  or they fail at runtime with no build error.
- `trailingSlash = "always"` in `src/routes/+layout.ts` is load-bearing — without it
  adapter-static emits `output.html`, which Tauri can't resolve at `/output/`.
- Templates are document *fragments*, not full HTML documents.
- Starter templates are real `.html` files imported with Vite's `?raw`. Edit the files.

Styling tokens in `src/lib/ui/theme.css` are FreeShow's own values, so modules blend in. Its
conventions: selection is a `--secondary` outline (never a left accent bar), corners are square,
surfaces flat, headers normal case. Native `select` is drawn manually and `color-scheme: dark` is
set on `:root` — without both, dropdowns render white-on-white in the webview.

Type-checking does not catch visual regressions. Run the app and look at it.
