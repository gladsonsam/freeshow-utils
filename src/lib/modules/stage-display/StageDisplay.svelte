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
    displayRef,
    listDisplays,
    listOpenOutputs,
    matchDisplay,
    moveOutputWindow,
    openOutputWindow,
    outputDisplay,
    refLabel,
    sameDisplay,
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
  /**
   * Templates whose output this session has already opened for the display it
   * is currently pinned to. Without it, the reconciler would fight the operator:
   * close an auto-start output and it would spring straight back. Entries are
   * dropped when the display goes away, so a stage display that disconnects and
   * reconnects gets its output opened again.
   */
  let autoStarted = new Set<string>();

  // previews show real output when FreeShow is up, sample data otherwise
  let previewData = $derived(
    $stageData.connected ? $stageData : fixtureStageData($stageData.timestamp || Date.now()),
  );

  /**
   * The live display a template is pinned to, or `null` when that display is not
   * connected right now. It deliberately does not fall back to another screen -
   * see `matchDisplay`.
   */
  const displayFor = (templateId: string) =>
    matchDisplay(displays, settingsFor($outputConfig, templateId).display);

  /** the remembered choice, connected or not, for labelling and for the picker */
  const targetFor = (templateId: string) => settingsFor($outputConfig, templateId).display;

  /** a template is waiting when it has a display pinned and that display is absent */
  const waitingFor = (templateId: string) => {
    const target = targetFor(templateId);
    return target && !matchDisplay(displays, target) ? refLabel(target) : "";
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
      await reconcileOutputs();
      loading = false;
    })();

    // Two things are re-read on a timer rather than pushed at us.
    //
    // An output window can go away without telling us - Esc, the window manager,
    // a crash - and it must not be able to take the gallery down with it.
    //
    // The set of connected displays changes on its own too, and that one matters
    // more: a wireless stage display connects minutes after the app has started,
    // and neither Tauri nor the platform hands us an event for it. Enumerating
    // is a live EnumDisplayMonitors/GDK call and costs one cheap IPC round trip,
    // so it is polled alongside the windows. Without this the display list is a
    // snapshot taken at launch, and anything connected later is simply invisible.
    const poll = setInterval(tick, 1000);
    return () => clearInterval(poll);
  });

  async function tick() {
    await refreshDisplays();
    await refreshOutputs();
    await reconcileOutputs();
  }

  async function refreshDisplays() {
    try {
      const next = await listDisplays();
      // replacing the array on every tick would re-render the gallery once a
      // second and reset any open <select>; only publish real changes
      if (!sameDisplayList(displays, next)) displays = next;
    } catch (error) {
      errorMessage = `Could not read the connected displays: ${error}`;
    }
  }

  const sameDisplayList = (a: Display[], b: Display[]) =>
    a.length === b.length && a.every((display, i) => sameDisplay(display, b[i]));

  /** re-read which outputs are actually up; the windows outlive this component */
  async function refreshOutputs() {
    try {
      liveOutputs = await listOpenOutputs();
    } catch {
      // leave the last known state rather than blanking every card's status
    }
  }

  /**
   * Keep every auto-start template's output on the display it was pinned to.
   *
   * This is what makes "set the output once" mean something. It used to run once
   * at launch against a single snapshot of the connected displays, which is the
   * wrong shape for a wireless stage display: that display is never there yet
   * when the app starts, so the output opened on whatever screen *was* there and
   * had to be dragged across by hand every week. Running it on the poll turns
   * "the display was missing at launch" from a permanent failure into a wait.
   *
   * Three cases, in order:
   *
   * - pinned display connected, no output up -> open it (once - see `autoStarted`)
   * - pinned display connected, output up on the wrong screen -> move it
   * - pinned display gone -> leave the output alone and arm the auto-start again,
   *   so reconnecting the display puts it back
   */
  async function reconcileOutputs() {
    for (const template of templates) {
      const settings = settingsFor($outputConfig, template.id);
      if (!settings.autoStart) continue;

      const target = displayFor(template.id);
      if (!target) {
        // pinned display is not connected - re-arm and wait for it
        autoStarted.delete(template.id);
        continue;
      }

      try {
        if (!liveOutputs.has(template.id)) {
          // the operator closing an output must stick, so open only once per
          // appearance of the display
          if (autoStarted.has(template.id)) continue;
          autoStarted.add(template.id);
          placementWarning =
            (await openOutputWindow(template, {
              display: target,
              fullscreen: settings.fullscreen,
            })) ?? placementWarning;
          await refreshOutputs();
          continue;
        }

        autoStarted.add(template.id);

        // already up: it may have opened before the pinned display connected
        const current = await outputDisplay(template.id, displays);
        if (current && !sameDisplay(current, target)) {
          placementWarning =
            (await moveOutputWindow(template.id, target, settings.fullscreen)) ?? placementWarning;
        }
      } catch (error) {
        errorMessage = `Could not start "${template.name}" on ${refLabel(settings.display)}: ${error}`;
      }
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

  function chooseDisplay(templateId: string, value: string) {
    // "keep" is the placeholder for a pinned display that isn't connected right
    // now - selecting it must not overwrite the choice with a connected one
    if (value === "keep") return;
    const display = displays.find((d) => String(d.index) === value);
    if (!display) return;
    updateSettings(templateId, { display: displayRef(display) });
    // a new display choice is a fresh chance to auto-start on it
    autoStarted.delete(templateId);
  }

  const toggleFullscreen = (templateId: string) =>
    updateSettings(templateId, { fullscreen: !settingsFor($outputConfig, templateId).fullscreen });

  const toggleAutoStart = (templateId: string) => {
    // re-arm, so switching it off and back on starts the output again rather
    // than silently doing nothing because this session already opened it once
    autoStarted.delete(templateId);
    updateSettings(templateId, { autoStart: !settingsFor($outputConfig, templateId).autoStart });
  };

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
      const display = displayFor(meta.id);

      // opening it anyway on some other screen is the old silent-fallback bug;
      // say so instead, and let the reconciler move it when the display shows up
      placementWarning =
        settings.display && !display
          ? `${refLabel(settings.display)} is not connected. The output will open on it as soon as it is.`
          : "";

      autoStarted.add(meta.id);
      const warning = await openOutputWindow(meta, {
        display,
        fullscreen: settings.fullscreen,
      });
      if (warning) placementWarning = warning;
      await refreshOutputs();
    });

  const deactivate = (meta: TemplateMeta) =>
    guard(async () => {
      await closeOutputWindow(meta.id);
      markClosed(meta.id);
      // closing by hand must stick even with auto-start on, until the pinned
      // display comes back
      autoStarted.add(meta.id);
      placementWarning = "";
    });

  const toggleOutput = (meta: TemplateMeta) =>
    liveOutputs.has(meta.id) ? deactivate(meta) : activate(meta);

  const deactivateAll = () =>
    guard(async () => {
      await Promise.all([...liveOutputs].map((id) => closeOutputWindow(id)));
      for (const id of liveOutputs) autoStarted.add(id);
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
          {@const waiting = waitingFor(template.id)}
          <article class="card" class:live>
            <TemplatePreview html={template.html} data={previewData} />

            <div class="card-body">
              <h3 class="card-name">{template.name}</h3>
              <p class="card-meta">
                {#if live}
                  <span class="live-dot"></span>
                  On {displayFor(template.id)?.name ?? "this display"}
                {:else if waiting}
                  <span class="wait-dot"></span>
                  Waiting for {waiting}
                {:else if formatCreated(template.created)}
                  Created {formatCreated(template.created)}
                {/if}
              </p>
            </div>

            <!-- each template picks its own screen: a stage rig runs lyrics on
                 one monitor and notes on another, at the same time -->
            <div class="card-output">
              <!-- A display that is pinned but not connected keeps its place in
                   the list. Dropping it would silently repoint the template at
                   whatever screen happens to be plugged in, which is how an
                   output ends up somewhere nobody chose. -->
              <select
                class="display-select"
                class:waiting
                value={waiting ? "keep" : String(displayFor(template.id)?.index ?? "none")}
                onchange={(event) => chooseDisplay(template.id, event.currentTarget.value)}
                title={waiting
                  ? `${waiting} is not connected — the output opens on it as soon as it is`
                  : "Display this template outputs to"}
              >
                {#if waiting}
                  <option value="keep">{waiting} (not connected)</option>
                {:else if !settings.display}
                  <option value="none">Choose a display…</option>
                {/if}
                {#each displays as display}
                  <option value={String(display.index)}>{shortDisplayLabel(display)}</option>
                {/each}
                {#if !displays.length && !waiting}
                  <option value="none">No displays detected</option>
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

              <IconButton
                title={settings.autoStart
                  ? "Opens automatically when the app starts — click to stop"
                  : "Open this display automatically when the app starts"}
                active={settings.autoStart}
                onclick={() => toggleAutoStart(template.id)}
              >
                <Icon name="pin" />
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
    border-radius: var(--radius);
    /* the preview thumbnail is a black rectangle filling the card's top edge -
       without this it paints square corners over the rounded border */
    overflow: hidden;
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

  .live-dot,
  .wait-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--connected);
    flex: none;
  }

  /* pinned to a display that isn't connected yet - not an error, just not there */
  .wait-dot {
    background: none;
    border: 1px solid var(--warning);
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

  .display-select.waiting {
    color: var(--warning);
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
    border-radius: var(--radius);
    color: var(--danger);
    font-size: 0.85rem;
  }

  .warn-box {
    padding: var(--space-3) var(--space-4);
    background: rgb(245 180 0 / 0.14);
    border: 1px solid var(--warning);
    border-radius: var(--radius);
    color: var(--warning);
    font-size: 0.85rem;
  }
</style>
