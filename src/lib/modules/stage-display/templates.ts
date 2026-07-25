import { invoke } from "@tauri-apps/api/core";
import { starters, startersReadme } from "./starters";

export type TemplateMeta = { id: string; name: string; created: string };
export type Template = TemplateMeta & { html: string };

const SEEDED_KEY = "freeshow-utils.starters-seeded.v2";

export const listTemplates = () => invoke<TemplateMeta[]>("list_templates");

export const readTemplate = (id: string) => invoke<Template>("read_template", { id });

export const writeTemplate = (template: Template) =>
  invoke<TemplateMeta>("write_template", {
    id: template.id,
    name: template.name,
    created: template.created,
    html: template.html,
  });

export const deleteTemplate = (id: string) => invoke<void>("delete_template", { id });

export const readTemplateFile = (sourcePath: string) =>
  invoke<{ name: string; html: string }>("read_template_file", { sourcePath });

export const exportTemplateFile = (id: string, destPath: string) =>
  invoke<void>("export_template_file", { id, destPath });

export const templatesFolder = () => invoke<string>("templates_folder");

const writeTemplatesReadme = (contents: string) =>
  invoke<void>("write_templates_readme", { contents });

/** ids double as filenames and window labels, so keep them url/path safe */
export function newTemplateId(): string {
  return "tpl-" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export function newTemplate(name = "Untitled template", html = STARTER_SKELETON): Template {
  return { id: newTemplateId(), name, created: new Date().toISOString(), html };
}

export const STARTER_SKELETON = `<style>
  #stage {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 6vh;
    font-weight: 700;
    text-align: center;
    padding: 4vh;
  }
</style>

<div id="stage">Waiting for FreeShow…</div>

<script>
  window.onFreeShowUpdate = function (data) {
    var stage = document.getElementById("stage");
    stage.textContent = data.current
      ? data.current.lines.map(function (line) { return line.text; }).join(" / ")
      : "Waiting for FreeShow…";
  };
</script>
`;

/**
 * Copy the bundled starters into the templates folder the first time the app
 * runs. Guarded by a flag rather than by "is it missing?" so a starter the user
 * deleted stays deleted.
 */
export async function seedStarters(): Promise<void> {
  const seenBefore = typeof localStorage !== "undefined" && !!localStorage.getItem(SEEDED_KEY);
  const templates = await listTemplates();

  // an empty folder always re-seeds, so a user who cleared everything (or moved
  // machines with their settings but not their files) isn't left with nothing
  if (seenBefore && templates.length) return;

  const existing = new Set(templates.map((template) => template.id));
  const created = new Date().toISOString();

  for (const starter of starters) {
    if (existing.has(starter.id)) continue;
    await writeTemplate({ ...starter, created });
  }
  await writeTemplatesReadme(startersReadme);

  localStorage?.setItem(SEEDED_KEY, "1");
}
