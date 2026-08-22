# FreeShow Utils

A lightweight desktop companion for [FreeShow](https://freeshow.app).

- **Stage Display** — live lyrics, chords and cues on a second screen, rendered by templates you
  write in plain HTML/CSS/JS. Pick a display, hit Activate.
- **Show Processor** — reshape show text with your own Python scripts.
- **Key Changer** — put the song on output into any key, from the app or from a Stream Deck.

Almost entirely read-only: it subscribes to FreeShow's output feed and asks it questions. The one
thing it can change is a song's key, and only through FreeShow's own transpose actions.

## Setup

In FreeShow, under **Settings → Connections**, enable **Stage Output** (port `5511`) and the
**REST / Companion API** (port `5505`). You also need at least one Stage Show to exist — it's only
a pointer saying which output to mirror; your template does the rendering.

Host and ports are editable from the connection indicator in the sidebar.

## Driving the Key Changer from a Stream Deck

Turn on the network control in the Key Changer and point a **Generic HTTP** connection in Bitfocus
Companion at this machine. Companion can live on another box; it usually does.

| | |
| --- | --- |
| `POST /action/key-changer/key/G` | put the current song in G — any key name works, `F#`, `Bb`, `Am` |
| `POST /action/key-changer/up` / `/down` | one semitone |
| `POST /action/key-changer/reset` | back to the key the song started in |
| `GET /state/key-changer` | `currentKey`, `showName` and friends, for a button that lights up |

For the highlight: poll `/state/key-changer` into a Companion variable and add a feedback comparing
it to each button's own key. The port listens on the whole network and has no password, the same as
FreeShow's own — keep it off the open internet.

If turning the control on reports that the port is already in use, something else on that machine
holds it. The usual suspect is FreeShow itself, if the port was changed to one of the ones it uses
(`5505`, `5510`, `5511`, `5513`+); `5512` is the default because it is the gap between them.

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
