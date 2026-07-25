import { formatClock } from "$lib/core/stageState";
import type { SlideMedia, SlideTextItem, StageData, StageLine } from "$lib/core/types";

function line(text: string, chords: [string, number][] = []): StageLine {
  return {
    text,
    color: "#ffffff",
    chords: chords.map(([label, charIndex]) => ({ label, charIndex })),
    spans: [{ text, color: "#ffffff" }],
  };
}

/**
 * A stand-in for the page image of a PDF or slide-deck import. Inline SVG rather
 * than a real photo so the fixture stays a text file, and so it is obvious in
 * the preview that this is fake.
 */
const PAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240">
  <rect width="320" height="240" fill="#f4f1ea"/>
  <rect x="28" y="34" width="150" height="16" rx="3" fill="#1f2937"/>
  <rect x="28" y="74" width="264" height="9" rx="3" fill="#9ca3af"/>
  <rect x="28" y="94" width="264" height="9" rx="3" fill="#9ca3af"/>
  <rect x="28" y="114" width="196" height="9" rx="3" fill="#9ca3af"/>
  <rect x="28" y="148" width="120" height="62" rx="4" fill="#c7d2e4"/>
  <rect x="164" y="148" width="128" height="62" rx="4" fill="#dbe3ef"/>
</svg>`;

const fixtureMedia: SlideMedia = {
  src: `data:image/svg+xml;utf8,${encodeURIComponent(PAGE_SVG)}`,
  type: "image",
  path: "/Imports/PDF/Sample Handout/2.jpg",
  name: "2",
};

/**
 * Stand-in data so the editor preview still shows something when FreeShow isn't
 * connected. Deliberately exercises the awkward cases: several chords per line,
 * a slash chord, a numbered chord, group colours, a bilingual slide whose two
 * languages sit in separate text items, and - as the next slide - a textless
 * slide that is nothing but an image, the shape a PDF import takes.
 */
export function fixtureStageData(timestamp: number = Date.now()): StageData {
  // as a bilingual show stores it: the original in one text box, the singable
  // transliteration (the one carrying chords) in the next
  const currentItems: SlideTextItem[] = [
    { lines: [line("अमेजिंग ग्रेस, हाउ स्वीट"), line("दैट सेव्ड अ रेच लाइक मी")] },
    {
      lines: [
        line("Amazing grace, how sweet the sound", [
          ["G", 0],
          ["C", 14],
          ["G", 24],
        ]),
        line("That saved a wretch like me", [
          ["G", 5],
          ["D7", 20],
        ]),
      ],
    },
  ];

  return {
    connected: true,
    current: {
      group: "Verse 1",
      color: "#5825f5",
      lines: currentItems.flatMap((item) => item.lines),
      items: currentItems,
      media: null,
    },
    next: {
      group: "Slide 2",
      color: "#f0008c",
      lines: [],
      items: [],
      media: fixtureMedia,
    },
    showName: "Amazing Grace",
    nextItemName: "Welcome Video",
    background: "",
    // this fixture is a song; see fixtureScriptureData for the scripture shape
    scripture: null,
    clock: formatClock(timestamp),
    timestamp,
  };
}

/**
 * The same idea for a bible passage, which reaches a template by a different
 * route entirely - see `resolveTempSlide`. Copied from what FreeShow actually
 * sends: two translations in separate text items, then a third item holding the
 * reference and version names, exactly as its scripture template lays them out.
 * The next verse has no such item, which is why it has one item fewer.
 */
export function fixtureScriptureData(timestamp: number = Date.now()): StageData {
  const currentItems: SlideTextItem[] = [
    { lines: [line("In the beginning God created the heavens and the earth.")] },
    { lines: [line("ആദിയിൽ ദൈവം ആകാശവും ഭൂമിയും സൃഷ്ടിച്ചു.")] },
    { lines: [line("Genesis 1:1"), line("NKJV + Sathyavedapusthakam 1910")] },
  ];

  const nextItems: SlideTextItem[] = [
    {
      lines: [
        line(
          "The earth was without form, and void; and darkness was on the face of the deep.",
        ),
      ],
    },
    { lines: [line("ഭൂമി പാഴായും ശൂന്യമായും ഇരുന്നു; ആഴത്തിന്മീതെ ഇരുൾ ഉണ്ടായിരുന്നു.")] },
  ];

  return {
    connected: true,
    current: {
      group: "Genesis 1:1",
      color: "",
      lines: currentItems.flatMap((item) => item.lines),
      items: currentItems,
      media: null,
    },
    next: {
      // only the verse on screen knows its own reference
      group: "",
      color: "",
      lines: nextItems.flatMap((item) => item.lines),
      items: nextItems,
      media: null,
    },
    showName: "Genesis 1",
    nextItemName: "",
    background: "",
    scripture: {
      reference: "Genesis 1:1",
      book: "Genesis",
      bookAbbreviation: "Gen",
      chapter: "1",
      verses: "1",
      versions: ["NKJV", "Sathyavedapusthakam 1910"],
      versionLabel: "NKJV + Sathyavedapusthakam 1910",
      attribution: "",
    },
    clock: formatClock(timestamp),
    timestamp,
  };
}
