import type { Component } from "svelte";
import StageDisplay from "./stage-display/StageDisplay.svelte";
import TextProcessor from "./text-processor/TextProcessor.svelte";

export type AppFunction = {
  id: string;
  name: string;
  icon: string;
  description: string;
  component: Component<any>;
};

/**
 * Every tool the app offers. The sidebar renders straight from this list, so
 * adding a function is one entry here plus one folder under src/lib/functions -
 * the shell never needs touching.
 */
export const appFunctions: AppFunction[] = [
  {
    id: "stage-display",
    name: "Stage Display",
    icon: "🎤",
    description: "Live lyrics, chords and cues on a second screen, driven by your own templates.",
    component: StageDisplay,
  },
  {
    id: "text-processor",
    name: "Text Processor",
    icon: "📝",
    description: "Run a Python script over pasted text and copy the result back out.",
    component: TextProcessor,
  },
];

export function findFunction(id: string): AppFunction {
  return appFunctions.find((fn) => fn.id === id) ?? appFunctions[0];
}
