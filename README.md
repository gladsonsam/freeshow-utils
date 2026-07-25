# FreeShow Utils

A lightweight desktop companion for [FreeShow](https://freeshow.app).

- **Stage Display** — live lyrics, chords and cues on a second screen, rendered by templates you
  write in plain HTML/CSS/JS. Pick a display, hit Activate.
- **Show Processor** — reshape show text with your own Python scripts.

Read-only: it subscribes to FreeShow's output feed and never sends anything that changes a
running service.

## Setup

In FreeShow, under **Settings → Connections**, enable **Stage Output** (port `5511`) and the
**REST / Companion API** (port `5505`). You also need at least one Stage Show to exist — it's only
a pointer saying which output to mirror; your template does the rendering.

Host and ports are editable from the connection indicator in the sidebar.

## Writing a template

```html
<div id="line"></div>
<script>
  window.onFreeShowUpdate = function (data) {
    document.getElementById("line").textContent = data.current ? data.current.lines[0].text : "";
  };
</script>
```

Templates are ordinary `.html` files you can import and share, edited in-app with a live preview.
They run sandboxed — no network, no access to the app. Three starters are included.

Full data contract: [template guide](src/lib/modules/stage-display/starters/README.md).

## Development

Needs Node.js and Rust (plus Python 3 for the Show Processor).

```bash
npm install
npm run tauri dev      # run
npm run check          # type-check
npm run tauri build    # package
```
