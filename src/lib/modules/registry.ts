import type { Component } from "svelte";
import StageDisplay from "./stage-display/StageDisplay.svelte";
import ShowProcessor from "./show-processor/ShowProcessor.svelte";

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
    id: "show-processor",
    name: "Show Processor",
    icon: "📝",
    description: "Reshape show text with your own Python scripts — reformat, translate, clean up.",
    component: ShowProcessor,
  },
];

export function findModule(id: string): AppModule {
  return appModules.find((module) => module.id === id) ?? appModules[0];
}
