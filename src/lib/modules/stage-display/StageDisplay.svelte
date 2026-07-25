<script lang="ts">
  import { onMount } from "svelte";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { openPath } from "@tauri-apps/plugin-opener";
  import Button from "$lib/ui/Button.svelte";
  import Modal from "$lib/ui/Modal.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import IconButton from "$lib/ui/IconButton.svelte";
  import { stageData } from "$lib/core/stageState";
  import TemplateEditor from "./TemplateEditor.svelte";
  import TemplatePreview from "./TemplatePreview.svelte";
  import { fixtureStageData } from "./fixture";
  import {
    ensureSettings,
    forgetSettings,
    outputConfig,
    settingsFor,
    updateSettings,
  } from "./outputSettings";
  import {
    closeOutputWindow,
    listDisplays,
    listOpenOutputs,
    openOutputWindow,
    resolveDisplay,
    shortDisplayLabel,
    type Display,
  } from "./outputWindow";
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
  // template ids with an output window up - several at once on a multi-monitor rig
  let liveOutputs = $state<Set<string>>(new Set());
  // set when the window system refused to put the output on the chosen display
  let placementWarning = $state("");

  // previews show real output when FreeShow is up, sample data otherwise
  let previewData = $derived(
    $stageData.connected ? $stageData : fixtureStageData($stageData.timestamp || Date.now()),
  );

  const displayFor = (templateId: string) => {
    const settings = settingsFor($outputConfig, templateId);
    return resolveDisplay(displays, settings.displayName, settings.displayIndex);
  };

  onMount(() => {
    (async () => {
      try {
        await seedStarters();
      } catch (error) {
        errorMessage = `Could not install the starter templates: ${error}`;
      }
      await refresh();
      await refreshDisplays();
      await refreshOutputs();
      loading = false;
    })();

    // An output window can go away without telling us - Esc, the window manager,
    // a crash - and it must not be able to take the gallery down with it, so the
    // live state is re-read rather than pushed. The call is one cheap IPC round
    // trip against a handful of windows.
    const poll = setInterval(refreshOutputs, 1000);
    return () => clearInterval(poll);
  });

  async function refreshDisplays() {
    try {
      displays = await listDisplays();
    } catch (error) {
      errorMessage = `Could not read the connected displays: ${error}`;
    }
  }

  /** re-read which outputs are actually up; the windows outlive this component */
  async function refreshOutputs() {
    try {
      liveOutputs = await listOpenOutputs();
    } catch {
      // leave the last known state rather than blanking every card's status
    }
  }

  /**
   * The close event arrives *before* the window is gone, so trust the id it
   * carries instead of re-reading the window list.
   */
  function markClosed(templateId: string) {
    const next = new Set(liveOutputs);
    next.delete(templateId);
    liveOutputs = next;
  }

  function chooseDisplay(templateId: string, index: number) {
    updateSettings(templateId, { displayIndex: index, displayName: displays[index]?.name ?? null });
  }

  const toggleFullscreen = (templateId: string) =>
    updateSettings(templateId, { fullscreen: !settingsFor($outputConfig, templateId).fullscreen });

  async function refresh() {
    try {
      const metas = await listTemplates();
      // the gallery previews each template, so it needs the markup too; one
      // unreadable file shouldn't blank the whole gallery
      const loaded = await Promise.allSettled(metas.map((meta) => readTemplate(meta.id)));
      templates = loaded
        .filter((result) => result.status === "fulfilled")
        .map((result) => (result as PromiseFulfilledResult<Template>).value);
      // give each template its own output settings, so the pickers stay independent
      ensureSettings(templates.map((template) => template.id));
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
      // a live output would go on rendering a template that no longer exists
      await closeOutputWindow(meta.id);
      markClosed(meta.id);
      await deleteTemplate(meta.id);
      forgetSettings(meta.id);
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
      const settings = settingsFor($outputConfig, meta.id);
      placementWarning =
        (await openOutputWindow(meta, {
          display: displayFor(meta.id),
          fullscreen: settings.fullscreen,
        })) ?? "";
      await refreshOutputs();
    });

  const deactivate = (meta: TemplateMeta) =>
    guard(async () => {
      await closeOutputWindow(meta.id);
      markClosed(meta.id);
      placementWarning = "";
    });

  const toggleOutput = (meta: TemplateMeta) =>
    liveOutputs.has(meta.id) ? deactivate(meta) : activate(meta);

  const deactivateAll = () =>
    guard(async () => {
      await Promise.all([...liveOutputs].map((id) => closeOutputWindow(id)));
      liveOutputs = new Set();
      placementWarning = "";
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

<!-- outputs can also die outside our reach (a crash, a killed window), so
     re-check whenever the operator comes back to this window -->
<svelte:window onfocus={refreshOutputs} />

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

      {#if liveOutputs.size}
        <span class="live-count">
          {liveOutputs.size} output{liveOutputs.size === 1 ? "" : "s"} live
        </span>
        <Button variant="ghost" onclick={deactivateAll}>Deactivate all</Button>
      {/if}

      <div class="spacer"></div>
      <IconButton title="Re-scan connected displays" onclick={refreshDisplays}>
        <Icon name="refresh" />
      </IconButton>
      <Button variant="ghost" onclick={() => (confirmRestore = true)}>Restore starters</Button>
      <Button variant="ghost" onclick={openFolder}>Open templates folder</Button>
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
          {@const live = liveOutputs.has(template.id)}
          {@const settings = settingsFor($outputConfig, template.id)}
          <article class="card" class:live>
            <TemplatePreview html={template.html} data={previewData} />

            <div class="card-body">
              <h3 class="card-name">{template.name}</h3>
              <p class="card-meta">
                {#if live}
                  <span class="live-dot"></span>
                  On {displayFor(template.id)?.name ?? "this display"}
                {:else if formatCreated(template.created)}
                  Created {formatCreated(template.created)}
                {/if}
              </p>
            </div>

            <!-- each template picks its own screen: a stage rig runs lyrics on
                 one monitor and notes on another, at the same time -->
            <div class="card-output">
              <select
                class="display-select"
                value={String(displayFor(template.id)?.index ?? 0)}
                onchange={(event) => chooseDisplay(template.id, Number(event.currentTarget.value))}
                disabled={!displays.length}
                title="Display this template outputs to"
              >
                {#each displays as display}
                  <option value={String(display.index)}>{shortDisplayLabel(display)}</option>
                {/each}
                {#if !displays.length}
                  <option value="0">No displays detected</option>
                {/if}
              </select>

              <IconButton
                title={settings.fullscreen
                  ? "Fullscreen output — click for windowed"
                  : "Windowed output — click for fullscreen"}
                active={settings.fullscreen}
                onclick={() => toggleFullscreen(template.id)}
              >
                <Icon name="fullscreen" />
              </IconButton>
            </div>

            <div class="card-actions">
              <Button
                variant={live ? "danger" : "primary"}
                size="sm"
                onclick={() => toggleOutput(template)}
              >
                {live ? "Deactivate" : "Activate"}
              </Button>
              <div class="spacer"></div>
              <IconButton title="Edit template" onclick={() => edit(template)}>
                <Icon name="edit" />
              </IconButton>
              <IconButton title="Duplicate template" onclick={() => duplicate(template)}>
                <Icon name="duplicate" />
              </IconButton>
              <IconButton title="Export as .html" onclick={() => exportTemplate(template)}>
                <Icon name="export" />
              </IconButton>
              <IconButton title="Delete template" onclick={() => (pendingDelete = template)}>
                <Icon name="delete" />
              </IconButton>
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

  .live-count {
    font-size: 0.82rem;
    color: var(--text-dim);
    padding-left: var(--space-2);
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

  /* a live output is the one piece of state worth spotting across the room */
  .card.live {
    border-color: var(--connected);
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
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: var(--space-1) 0 0;
    min-height: 1.1rem;
    font-size: 0.78rem;
    color: var(--text-faint);
  }

  .live-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--connected);
    flex: none;
  }

  .card-output {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4) 0;
  }

  .display-select {
    flex: 1;
    min-width: 0;
    font-size: 0.82rem;
  }

  .card-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3) var(--space-2) var(--space-4);
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
