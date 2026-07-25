# Writing a stage template

A template is a plain snippet of HTML, CSS and JavaScript — the same idea as a browser source in
OBS or vMix. It runs in a sandboxed iframe with no network access, and FreeShow Utils feeds it live
data. Nothing else is injected: no framework, no build step, no bundler.

Write it as a **fragment**, not a full document — `<style>`, markup and `<script>`, with no
`<html>`, `<head>` or `<body>` tags of your own.

## Getting data

Two equivalent ways, use whichever suits:

```html
<script>
  // pushed on every change
  window.onFreeShowUpdate = function (data) {
    document.body.textContent = data.current ? data.current.lines[0].text : "";
  };

  // or pulled whenever you like
  setInterval(function () {
    console.log(window.freeShowData);
  }, 1000);
</script>
```

## The data

```js
{
  connected: boolean,      // is FreeShow reachable right now
  current: SlideView|null, // the slide currently on screen
  next: SlideView|null,    // the slide after it, in the same show
  showName: string,        // the show currently playing
  nextItemName: string,    // next item queued in the project (song, video, …)
  background: string,      // current output background, or ""
  scripture: Scripture|null,  // set when a bible passage is on screen
  clock: string,           // pre-formatted local time, e.g. "7:04 PM"
  timestamp: number        // ms epoch, if you'd rather format your own
}

SlideView = {
  group: string,           // "Verse 1", "Chorus", …
  color: string,           // the group's accent colour, e.g. "#5825f5"
  lines: StageLine[],      // every text item's lines run together
  items: [{ lines: StageLine[] }],  // the same lines, grouped by text box
  media: SlideMedia|null   // the slide's own picture (a PDF page, an imported deck)
}

StageLine = {
  text: string,            // the whole line as one string
  color: string,           // its dominant colour
  chords: [{ label: string, charIndex: number }],
  spans: [{ text: string, color: string }]   // FreeShow's inline colour runs
}

Scripture = {
  reference: string,       // "Genesis 1:2" — the passage on screen
  book: string,            // "Genesis"
  bookAbbreviation: string,// "Gen"
  chapter: string,         // "1"  (a string, that's how FreeShow reports it)
  verses: string,          // "2", or "2-4" for several on one slide
  versions: string[],      // ["NKJV", "ESV"], in the order their text appears
  versionLabel: string,    // "NKJV + ESV"
  attribution: string      // what an online bible requires you show, or ""
}
```

A slide is not one block of words. FreeShow keeps each text box as its own item, and a bilingual
show uses that to hold a language in each — the original in the first, the singable
transliteration in the second. `lines` runs them together; `items` keeps them apart, so a stage
screen with room for only one language can pick it. `lyrics-chords.html` does exactly that, with
`ITEM_INDEX` at the top of its script — for songs. Scripture is read rather than sung, so it draws
every translation there; see below.

`chord.charIndex` indexes into `line.text`. An index at or past `text.length` means the chord sits
past the end of the line — see `lyrics-chords.html` for one way to place both cases.

## Scripture

A bible passage arrives as an ordinary slide — the verse is in `current.lines` like any other
words, so a template that draws lyrics already draws scripture. What's different is worth knowing:

- `current.group` is the reference, e.g. `"Genesis 1:2"`, so a group tab labels itself. `next` has
  no group: only the verse actually on screen knows its own reference.
- Each translation is its own item, exactly as a bilingual song keeps each language in one —
  `items[0]` is the first version in `scripture.versions`, `items[1]` the second. Both starters
  draw *all* of them by default, since a reading is followed rather than sung. Set
  `SCRIPTURE_ITEM_INDEX` at the top of either script to pick just one — `0` for English only if
  English is your first version. It is the scripture counterpart of `ITEM_INDEX`, and like it,
  falls back to the last translation rather than to a blank screen if you ask for one that isn't
  there.
- FreeShow's scripture layout usually ends with one more item holding the reference and version
  names. The verses either side of the current one don't get it, so `next` has one item fewer.
- `showName` is the book and chapter, e.g. `"Genesis 1"`.
- `scripture` carries the reference already broken up, so you never have to parse it back out of
  the rendered words. It is `null` for anything that isn't scripture — which is the reliable way
  to tell the two apart.

Pick the preview's **Scripture** tab while writing a template to work against this shape without
a live connection.

## Sizing

Output windows are opened at whatever size the operator drags them to, so size everything in `vh`
/ `vw` / `%` rather than `px`, and the template will scale to any screen.

That still isn't enough for a slide with six chorded lines, which will simply overflow. Both lyric
starters handle it by measuring after each render and scaling the whole group down to fit:

```js
fit.style.transform = "scale(1)"; // measure unscaled
var scale = Math.min(1, box.clientWidth / fit.offsetWidth, box.clientHeight / fit.offsetHeight);
if (scale < 1) fit.style.transform = "scale(" + scale + ")";
```

Scale the group *uniformly* rather than shrinking the font — that's what keeps chords sitting over
the right characters. Two traps: the element you measure must shrink-wrap its contents
(`display: inline-flex`), and a CSS grid track needs `minmax(0, 1fr)` rather than `1fr`, or it
refuses to shrink below its content and there's never anything to fit into.

Re-run it on resize with a `ResizeObserver` — `transform` doesn't affect layout, so observing
`document.body` can't loop.

## Starters

- **Lyrics & Chords** — two-slide view with chords positioned over the lyrics, group tabs, and a
  show/clock/next footer.
- **Big Lyrics** — the current slide only, as large as it fits.
- **Data Inspector** — dumps the live data as JSON. Useful while writing your own template.
