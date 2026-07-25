<script lang="ts">
  import { onMount } from "svelte";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { openPath } from "@tauri-apps/plugin-opener";
  import Button from "$lib/ui/Button.svelte";
  import Modal from "$lib/ui/Modal.svelte";
  import TemplateEditor from "./TemplateEditor.svelte";
  import { openOutputWindow } from "./outputWindow";
  import {
    deleteTemplate,
    exportTemplateFile,
    listTemplates,
    newTemplate,
    newTemplateId,
    readTemplate,
    readTemplateFile,
    seedStarters,
    templatesFolder,
    writeTemplate,
    type Template,
    type TemplateMeta,
  } from "./templates";

  let templates = $state<TemplateMeta[]>([]);
  let editing = $state<Template | null>(null);
  let pendingDelete = $state<TemplateMeta | null>(null);
  let errorMessage = $state("");
  let loading = $state(true);

  onMount(async () => {
    try {
      await seedStarters();
    } catch (error) {
      errorMessage = `Could not install the starter templates: ${error}`;
    }
    await refresh();
    loading = false;
  });

  async function refresh() {
    try {
      templates = await listTemplates();
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

  const activate = (meta: TemplateMeta) => guard(() => openOutputWindow(meta));

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
      <Button variant="ghost" onclick={openFolder}>Open templates folder</Button>
    </div>

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

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--space-3);
  }

  .card {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-4);
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: var(--radius);
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
    border-radius: var(--radius-sm);
    color: var(--danger);
    font-size: 0.85rem;
  }
</style>
