import { formatClock } from "$lib/core/stageState";
import type { StageData, StageLine } from "$lib/core/types";

function line(text: string, chords: [string, number][] = []): StageLine {
  return {
    text,
    color: "#ffffff",
    chords: chords.map(([label, charIndex]) => ({ label, charIndex })),
    spans: [{ text, color: "#ffffff" }],
  };
}

/**
 * Stand-in data so the editor preview still shows something when FreeShow isn't
 * connected. Deliberately exercises the awkward cases: several chords per line,
 * a slash chord, a numbered chord, and group colours.
 */
export function fixtureStageData(timestamp: number = Date.now()): StageData {
  return {
    connected: true,
    current: {
      group: "Verse 1",
      color: "#5825f5",
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
    next: {
      group: "Chorus",
      color: "#f0008c",
      lines: [
        line("I once was lost, but now am found", [
          ["G", 0],
          ["C", 16],
          ["B/D#", 31],
        ]),
      ],
    },
    showName: "Amazing Grace",
    nextItemName: "Welcome Video",
    background: "",
    clock: formatClock(timestamp),
    timestamp,
  };
}
