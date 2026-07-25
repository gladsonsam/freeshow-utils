import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { TemplateMeta } from "./templates";

/** window label for a template's output window - must match the "output-*" capability glob */
export const outputLabel = (id: string) => `output-${id}`;

/**
 * Open (or focus) a borderless window rendering one template, ready to be dragged
 * onto a stage monitor. It opens its own FreeShow connection, so it keeps
 * updating independently of the control window.
 */
export async function openOutputWindow(template: TemplateMeta): Promise<void> {
  const label = outputLabel(template.id);

  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.setFocus();
    return;
  }

  const window = new WebviewWindow(label, {
    url: `/output/?template=${encodeURIComponent(template.id)}`,
    title: `${template.name} — Stage Output`,
    width: 1280,
    height: 720,
    decorations: false,
    resizable: true,
    focus: true,
  });

  await new Promise<void>((resolve, reject) => {
    window.once("tauri://created", () => resolve());
    window.once("tauri://error", (event) => reject(new Error(String(event.payload))));
  });
}
