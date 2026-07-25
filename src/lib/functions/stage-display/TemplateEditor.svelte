<script lang="ts">
  import { stageData } from "$lib/core/stageState";
  import Button from "$lib/ui/Button.svelte";
  import Tabs from "$lib/ui/Tabs.svelte";
  import CodeEditor from "./CodeEditor.svelte";
  import TemplateFrame from "./TemplateFrame.svelte";
  import { fixtureStageData } from "./fixture";
  import type { Template } from "./templates";

  let {
    template,
    onSave,
    onBack,
  }: {
    template: Template;
    onSave: (template: Template) => Promise<void> | void;
    onBack: () => void;
  } = $props();

  const PREVIEW_DEBOUNCE_MS = 400;

  let name = $state(template.name);
  let html = $state(template.html);
  let previewHtml = $state(template.html);
  let source = $state<"live" | "fixture">("fixture");
  let errors = $state<string[]>([]);
  let saving = $state(false);
  let savedAt = $state("");

  let dirty = $derived(name !== template.name || html !== template.html);

  // reload the preview a beat after typing stops, not on every keystroke
  $effect(() => {
    const pending = html;
    const timer = setTimeout(() => {
      errors = [];
      previewHtml = pending;
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });

  let previewData = $derived(
    source === "live" ? $stageData : fixtureStageData($stageData.timestamp || Date.now()),
  );

  async function save() {
    if (saving) return;
    saving = true;
    try {
      await onSave({ ...template, name: name.trim() || "Untitled template", html });
      savedAt = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } finally {
      saving = false;
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      save();
    }
  }

  function recordError(message: string) {
    // keep the console short - a broken template can fire the same error rapidly
    if (errors[errors.length - 1] === message) return;
    errors = [...errors, message].slice(-20);
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="editor">
  <header class="editor-head">
    <Button variant="ghost" onclick={onBack}>← Templates</Button>
    <input class="name-input" bind:value={name} placeholder="Template name" />
    <div class="spacer"></div>
    {#if savedAt && !dirty}
      <span class="saved">Saved {savedAt}</span>
    {/if}
    <Button variant="primary" onclick={save} disabled={saving || !dirty}>
      {saving ? "Saving…" : "Save"}
    </Button>
  </header>

  <div class="panes">
    <div class="pane code-pane">
      <div class="pane-head">
        <span class="pane-title">HTML · CSS · JS</span>
        <span class="hint">Ctrl+S to save</span>
      </div>
      <CodeEditor initial={template.html} onChange={(value) => (html = value)} />
      {#if errors.length}
        <div class="console">
          {#each errors as error}
            <div class="console-line">{error}</div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="pane preview-pane">
      <div class="pane-head">
        <span class="pane-title">Preview</span>
        <Tabs
          tabs={[
            { id: "fixture", label: "Sample data" },
            { id: "live", label: $stageData.connected ? "Live" : "Live (offline)" },
          ]}
          active={source}
          onSelect={(id) => (source = id as "live" | "fixture")}
        />
      </div>
      <div class="preview-stage">
        <TemplateFrame html={previewHtml} data={previewData} onError={recordError} />
      </div>
    </div>
  </div>
</div>

<style>
  .editor {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .editor-head {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--border);
  }

  .name-input {
    width: 280px;
    font-weight: 600;
  }

  .spacer {
    flex: 1;
  }

  .saved {
    font-size: 0.8rem;
    color: var(--text-faint);
  }

  .panes {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  .pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .code-pane {
    border-right: 1px solid var(--border);
  }

  .pane-head {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--border);
    min-height: 44px;
  }

  .pane-title {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-dim);
  }

  .hint {
    font-size: 0.75rem;
    color: var(--text-faint);
  }

  .console {
    flex-shrink: 0;
    max-height: 140px;
    overflow-y: auto;
    padding: var(--space-2) var(--space-4);
    border-top: 1px solid var(--danger);
    background: var(--danger-soft);
  }

  .console-line {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    line-height: 1.6;
    color: var(--danger);
  }

  .preview-stage {
    flex: 1;
    min-height: 0;
    background: #000;
  }
</style>
