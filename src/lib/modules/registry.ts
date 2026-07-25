import type { Component } from "svelte";
import StageDisplay from "./stage-display/StageDisplay.svelte";
import TextProcessor from "./text-processor/TextProcessor.svelte";

export type AppModule = {
  id: string;
  name: string;
  icon: string;
  description: string;
  component: Component<any>;
};

/**
 * The modules that ship with the app. The sidebar renders straight from this
 * list, so adding one is a single entry here plus a folder under src/lib/modules
 * - the shell never needs touching.
 *
 * These are built in only because they shipped first. They get no privileges a
 * third-party module wouldn't have: same connection, same UI kit, same data.
 * Keep it that way - the goal is for this list to eventually be seeded from
 * user-installed modules too.
 */
export const appModules: AppModule[] = [
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

export function findModule(id: string): AppModule {
  return appModules.find((module) => module.id === id) ?? appModules[0];
}
