import bigLyrics from "./big-lyrics.html?raw";
import dataInspector from "./data-inspector.html?raw";
import lyricsChords from "./lyrics-chords.html?raw";

export type Starter = { id: string; name: string; html: string };

/**
 * Bundled into the app and copied into the templates folder on first run. After
 * that they're ordinary user templates - editable, deletable, and not restored.
 */
export const starters: Starter[] = [
  { id: "starter-lyrics-chords", name: "Lyrics & Chords", html: lyricsChords },
  { id: "starter-big-lyrics", name: "Big Lyrics", html: bigLyrics },
  { id: "starter-data-inspector", name: "Data Inspector", html: dataInspector },
];
