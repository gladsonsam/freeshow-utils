# FreeShow Utils

A lightweight desktop companion for [FreeShow](https://freeshow.app), built as a set of
independent functions.

## Functions

### Stage Display

Live lyrics, chords and cues on a second screen — rendered by templates **you** write, in plain
HTML, CSS and JavaScript. Same idea as a browser source in OBS or vMix: no build step, no
framework, nothing to learn beyond the page you already know how to write.

- A gallery of templates, stored as ordinary `.html` files you can import, export and share
- A built-in editor (CodeMirror) with a live preview, fed either real FreeShow data or sample data
  when FreeShow isn't running
- "Activate" opens a borderless output window you can drag onto a stage monitor; each output
  window holds its own connection, so it keeps updating on its own
- Ships with three starter templates — Lyrics & Chords, Big Lyrics, and a Data Inspector

The app only ever **reads** from FreeShow. It subscribes to the Stage output feed and issues
`get_*` queries; it never sends anything that would control or change a running service.

### Text Processor

Run a Python script over pasted text and copy the result back out. Point it at a folder of `.py`
files; each script reads stdin and writes stdout.

## Setting up FreeShow

In FreeShow, under **Settings → Connections**, enable:

- **Stage Output** (default port `5511`) — the live output feed
- **REST / Companion API** (default port `5505`) — used only to resolve what's queued next in the
  project, which the Stage protocol can't report

FreeShow also needs at least one **Stage Show** to exist. It is used purely as a routing pointer
saying which output to mirror — FreeShow Utils ignores its layout entirely and renders your own
template instead.

Host and ports are configurable from the connection indicator at the bottom of the sidebar.

## Writing a template

See [the template guide](src/lib/functions/stage-display/starters/README.md) for the full data
contract and a worked example. The short version:

```html
<div id="line"></div>
<script>
  window.onFreeShowUpdate = function (data) {
    document.getElementById("line").textContent = data.current ? data.current.lines[0].text : "";
  };
</script>
```

Templates run in a sandboxed iframe (`sandbox="allow-scripts"`) — no network access, no access to
the app around them. Data arrives via `postMessage`.

## Project layout

```
src/lib/core/         FreeShow connector + the resolved data model (framework-agnostic)
src/lib/ui/           shared themed primitives (Sidebar, Button, Panel, Modal, Tabs)
src/lib/shell/        app-level chrome (connection settings)
src/lib/functions/    one folder per function, plus registry.ts listing them
src/routes/           app shell (/) and the stage output window (/output)
src-tauri/src/        Rust commands, grouped by concern (python.rs, templates.rs)
```

Adding a function is one entry in `src/lib/functions/registry.ts` plus one folder — the shell
renders the sidebar straight from that list.

## Requirements

- Node.js and npm
- Rust (for building the Tauri app)
- Python 3.x on your PATH, for the Text Processor only

## Development

```bash
npm install
npm run tauri dev      # run
npm run check          # type-check
npm run tauri build    # package
```

## Python script format

Scripts read stdin and write stdout:

```python
import sys

def process_text(text):
    return text.upper()

if __name__ == "__main__":
    print(process_text(sys.stdin.read()), end="")
```

See `scripts/example_script.py`.

## Licence

GPL-3.0-only, the same licence as FreeShow. This app deliberately re-uses FreeShow's UI palette
and conventions so the two sit together without a seam, which makes matching its licence the
right call.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).
