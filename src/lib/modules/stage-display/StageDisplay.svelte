<script lang="ts">
  import { onMount } from "svelte";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { openPath } from "@tauri-apps/plugin-opener";
  import Button from "$lib/ui/Button.svelte";
  import Modal from "$lib/ui/Modal.svelte";
  import IconButton from "$lib/ui/IconButton.svelte";
  import { stageData } from "$lib/core/stageState";
  import TemplateEditor from "./TemplateEditor.svelte";
  import TemplatePreview from "./TemplatePreview.svelte";
  import { fixtureStageData } from "./fixture";
  import { outputSettings } from "./outputSettings";
  import { displayLabel, listDisplays, openOutputWindow, resolveDisplay, type Display } from "./outputWindow";
  import {
    deleteTemplate,
    exportTemplateFile,
    listTemplates,
    newTemplate,
    newTemplateId,
    readTemplate,
    readTemplateFile,
    restoreStarters,
    seedStarters,
    templatesFolder,
    writeTemplate,
    type Template,
    type TemplateMeta,
  } from "./templates";

  let templates = $state<Template[]>([]);
  let editing = $state<Template | null>(null);
  let pendingDelete = $state<TemplateMeta | null>(null);
  let errorMessage = $state("");
  let loading = $state(true);
  let displays = $state<Display[]>([]);
  let confirmRestore = $state(false);
  // set when the window system refused to put the output on the chosen display
  let placementWarning = $state("");

  // previews show real output when FreeShow is up, sample data otherwise
  let previewData = $derived(
    $stageData.connected ? $stageData : fixtureStageData($stageData.timestamp || Date.now()),
  );

  let selectedDisplay = $derived(
    resolveDisplay(displays, $outputSettings.displayName, $outputSettings.displayIndex),
  );

  onMount(async () => {
    try {
      await seedStarters();
    } catch (error) {
      errorMessage = `Could not install the starter templates: ${error}`;
    }
    await refresh();
    await refreshDisplays();
    loading = false;
  });

  async function refreshDisplays() {
    try {
      displays = await listDisplays();
    } catch (error) {
      errorMessage = `Could not read the connected displays: ${error}`;
    }
  }

  function chooseDisplay(index: number) {
    const display = displays[index];
    outputSettings.update((settings) => ({
      ...settings,
      displayIndex: index,
      displayName: display?.name ?? null,
    }));
  }

  async function refresh() {
    try {
      const metas = await listTemplates();
      // the gallery previews each template, so it needs the markup too; one
      // unreadable file shouldn't blank the whole gallery
      const loaded = await Promise.allSettled(metas.map((meta) => readTemplate(meta.id)));
      templates = loaded
        .filter((result) => result.status === "fulfilled")
        .map((result) => (result as PromiseFulfilledResult<Template>).value);
    } catch (error) {
      errorMessage = `Could not read the templates folder: ${error}`;
    }
  }

  /** wrap an action so a failure lands in the banner instead of the console */
  async function guard(action: () => Promise<void>) {
    try {
      errorMessage = "";
      await action();
    } catch (error) {
      errorMessage = String(error);
    }
  }

  const create = () =>
    guard(async () => {
      const template = newTemplate();
      await writeTemplate(template);
      await refresh();
      editing = template;
    });

  const edit = (meta: TemplateMeta) =>
    guard(async () => {
      editing = await readTemplate(meta.id);
    });

  const duplicate = (meta: TemplateMeta) =>
    guard(async () => {
      const source = await readTemplate(meta.id);
      await writeTemplate({
        id: newTemplateId(),
        name: `${source.name} copy`,
        created: new Date().toISOString(),
        html: source.html,
      });
      await refresh();
    });

  const remove = (meta: TemplateMeta) =>
    guard(async () => {
      await deleteTemplate(meta.id);
      pendingDelete = null;
      await refresh();
    });

  const importTemplate = () =>
    guard(async () => {
      const picked = await open({
        multiple: false,
        filters: [{ name: "HTML template", extensions: ["html", "htm"] }],
      });
      const path = Array.isArray(picked) ? picked[0] : picked;
      if (typeof path !== "string" || !path) return;

      const imported = await readTemplateFile(path);
      await writeTemplate({
        id: newTemplateId(),
        name: imported.name,
        created: new Date().toISOString(),
        html: imported.html,
      });
      await refresh();
    });

  const exportTemplate = (meta: TemplateMeta) =>
    guard(async () => {
      const path = await save({
        defaultPath: `${meta.name.replace(/[^\w \-]/g, "")}.html`,
        filters: [{ name: "HTML template", extensions: ["html"] }],
      });
      if (!path) return;
      await exportTemplateFile(meta.id, path);
    });

  const openFolder = () => guard(async () => openPath(await templatesFolder()));

  const restore = () =>
    guard(async () => {
      await restoreStarters();
      confirmRestore = false;
      await refresh();
    });

  const activate = (meta: TemplateMeta) =>
    guard(async () => {
      placementWarning =
        (await openOutputWindow(meta, {
          display: selectedDisplay,
          fullscreen: $outputSettings.fullscreen,
        })) ?? "";
    });

  const saveEdits = (template: Template) =>
    guard(async () => {
      await writeTemplate(template);
      editing = template;
      await refresh();
    });

  function formatCreated(created: string): string {
    if (!created) return "";
    const date = new Date(created);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
  }
</script>

{#if editing}
  <TemplateEditor
    template={editing}
    onSave={saveEdits}
    onBack={() => {
      editing = null;
      refresh();
    }}
  />
{:else}
  <div class="gallery">
    <div class="toolbar">
      <Button variant="primary" onclick={create}>+ New template</Button>
      <Button onclick={importTemplate}>Import…</Button>
      <div class="spacer"></div>
      <Button variant="ghost" onclick={() => (confirmRestore = true)}>Restore starters</Button>
      <Button variant="ghost" onclick={openFolder}>Open templates folder</Button>
    </div>

    <div class="output-bar">
      <span class="output-label">Output display</span>
      <select
        class="display-select"
        value={String(selectedDisplay?.index ?? 0)}
        onchange={(event) => chooseDisplay(Number(event.currentTarget.value))}
        disabled={!displays.length}
      >
        {#each displays as display}
          <option value={String(display.index)}>{displayLabel(display)}</option>
        {/each}
        {#if !displays.length}
          <option value="0">No displays detected</option>
        {/if}
      </select>

      <IconButton title="Re-scan connected displays" onclick={refreshDisplays}>⟳</IconButton>

      <label class="checkbox">
        <input type="checkbox" bind:checked={$outputSettings.fullscreen} />
        <span>Fullscreen</span>
      </label>

      <span class="output-hint">
        Activate opens the template on this display. On Linux/Wayland the display
        choice only applies to fullscreen output.
      </span>
    </div>

    {#if placementWarning}
      <div class="warn-box">{placementWarning}</div>
    {/if}

    {#if errorMessage}
      <div class="error-box">{errorMessage}</div>
    {/if}

    {#if loading}
      <p class="empty">Loading templates…</p>
    {:else if !templates.length}
      <p class="empty">No templates yet — create one, or import a .html file.</p>
    {:else}
      <div class="grid">
        {#each templates as template (template.id)}
          <article class="card">
            <TemplatePreview html={template.html} data={previewData} />
            <div class="card-body">
              <h3 class="card-name">{template.name}</h3>
              {#if formatCreated(template.created)}
                <p class="card-meta">Created {formatCreated(template.created)}</p>
              {/if}
            </div>
            <div class="card-actions">
              <Button variant="primary" size="sm" onclick={() => activate(template)}>Activate</Button>
              <Button size="sm" onclick={() => edit(template)}>Edit</Button>
              <Button variant="ghost" size="sm" onclick={() => duplicate(template)}>Duplicate</Button>
              <Button variant="ghost" size="sm" onclick={() => exportTemplate(template)}>Export</Button>
              <Button variant="ghost" size="sm" onclick={() => (pendingDelete = template)}>Delete</Button>
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<Modal
  open={confirmRestore}
  title="Restore starter templates"
  onClose={() => (confirmRestore = false)}
  width="420px"
>
  <p class="confirm">
    Rewrite the three bundled starters to their shipped versions. Any edits you made to those
    three are overwritten; your own templates are untouched.
  </p>
  {#snippet footer()}
    <Button variant="primary" onclick={restore}>Restore</Button>
    <Button variant="ghost" onclick={() => (confirmRestore = false)}>Cancel</Button>
  {/snippet}
</Modal>

<Modal
  open={!!pendingDelete}
  title="Delete template"
  onClose={() => (pendingDelete = null)}
  width="380px"
>
  <p class="confirm">Delete “{pendingDelete?.name}”? This removes the file from disk.</p>
  {#snippet footer()}
    <Button variant="danger" onclick={() => pendingDelete && remove(pendingDelete)}>Delete</Button>
    <Button variant="ghost" onclick={() => (pendingDelete = null)}>Cancel</Button>
  {/snippet}
</Modal>

<style>
  .gallery {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-height: 0;
    padding: var(--space-5);
    overflow-y: auto;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .spacer {
    flex: 1;
  }

  .output-bar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    background: var(--primary);
    border: 1px solid var(--line);
  }

  .output-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-dim);
  }

  .display-select {
    min-width: 240px;
  }

  .checkbox {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.85rem;
    color: var(--text-dim);
  }

  .checkbox input {
    width: auto;
    accent-color: var(--secondary);
  }

  .output-hint {
    font-size: 0.8rem;
    color: var(--text-faint);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-3);
  }

  .card {
    display: flex;
    flex-direction: column;
    background: var(--primary);
    border: 1px solid var(--line);
    transition: border-color var(--transition);
  }

  .card:hover {
    border-color: var(--secondary-opacity);
  }

  .card-body {
    padding: var(--space-3) var(--space-4) 0;
  }

  .card-name {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    word-break: break-word;
  }

  .card-meta {
    margin: var(--space-1) 0 0;
    font-size: 0.78rem;
    color: var(--text-faint);
  }

  .card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-4);
  }

  .empty {
    margin: 0;
    color: var(--text-faint);
  }

  .confirm {
    margin: 0;
    line-height: 1.5;
  }

  .error-box {
    padding: var(--space-3) var(--space-4);
    background: var(--danger-soft);
    border: 1px solid var(--danger);
    color: var(--danger);
    font-size: 0.85rem;
  }

  .warn-box {
    padding: var(--space-3) var(--space-4);
    background: rgb(245 180 0 / 0.14);
    border: 1px solid var(--warning);
    color: var(--warning);
    font-size: 0.85rem;
  }
</style>
