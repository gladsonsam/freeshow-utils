<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { open } from "@tauri-apps/plugin-dialog";
  import Button from "$lib/ui/Button.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import IconButton from "$lib/ui/IconButton.svelte";
  import Panel from "$lib/ui/Panel.svelte";

  let scriptsFolder = $state<string | null>(null);
  let scriptsList = $state<string[]>([]);
  let selectedScript = $state<string | null>(null);
  let inputText = $state("");
  let outputText = $state("");
  let errorMessage = $state("");
  let isLoading = $state(false);
  let copySuccess = $state(false);
  let isReloading = $state(false);

  async function selectScriptsFolder() {
    try {
      const selected = await open({ directory: true, multiple: false });
      const folder = Array.isArray(selected) ? selected[0] : selected;
      if (typeof folder === "string" && folder) {
        scriptsFolder = folder;
        await loadScripts();
        errorMessage = "";
      }
    } catch (error) {
      errorMessage = `Error selecting folder: ${error}`;
    }
  }

  async function loadScripts() {
    if (!scriptsFolder) return;

    isReloading = true;
    try {
      const scripts = await invoke<string[]>("list_scripts", { folderPath: scriptsFolder });

      // keep the current selection if it survived the reload, else fall back to the first script
      const previousSelected = selectedScript;
      scriptsList = scripts;

      if (previousSelected && scripts.includes(previousSelected)) {
        selectedScript = previousSelected;
      } else if (scripts.length > 0) {
        if (!selectedScript || !scripts.includes(selectedScript)) selectedScript = scripts[0];
      } else {
        selectedScript = null;
      }
    } catch (error) {
      errorMessage = `Error loading scripts: ${error}`;
      scriptsList = [];
      selectedScript = null;
    } finally {
      isReloading = false;
    }
  }

  async function executeScript() {
    if (!selectedScript) {
      errorMessage = "Please select a script first";
      return;
    }
    if (!inputText.trim()) {
      errorMessage = "Please provide input text";
      return;
    }

    isLoading = true;
    errorMessage = "";
    outputText = "";

    try {
      outputText = await invoke<string>("execute_python_script", {
        scriptPath: selectedScript,
        inputText,
      });
    } catch (error) {
      errorMessage = `Execution error: ${error}`;
      outputText = "";
    } finally {
      isLoading = false;
    }
  }

  function clearOutput() {
    outputText = "";
    errorMessage = "";
    copySuccess = false;
  }

  async function copyToClipboard() {
    if (!outputText) return;
    try {
      await navigator.clipboard.writeText(outputText);
      copySuccess = true;
      setTimeout(() => (copySuccess = false), 2000);
    } catch (error) {
      errorMessage = `Failed to copy to clipboard: ${error}`;
    }
  }

  function scriptName(scriptPath: string): string {
    const parts = scriptPath.split(/[/\\]/);
    return parts[parts.length - 1] || scriptPath;
  }

  /**
   * The tail of the folder path - enough to recognise which folder it is
   * without the column having to be wide enough for a home directory. The
   * whole path is still on the element's tooltip.
   */
  function folderLabel(folderPath: string): string {
    const parts = folderPath.split(/[/\\]/).filter(Boolean);
    return parts.slice(-2).join("/") || folderPath;
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "F5" && scriptsFolder && !isReloading) {
      event.preventDefault();
      loadScripts();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="show-processor">
  <aside class="scripts-column">
    <Panel title="Scripts" padded={false} scroll>
      {#snippet actions()}
        {#if scriptsFolder}
          <IconButton
            title="Reload scripts from folder (F5)"
            disabled={isReloading}
            onclick={loadScripts}
          >
            <Icon name="refresh" />
          </IconButton>
        {/if}
      {/snippet}

      <div class="folder-row">
        <!-- loud only while it is the one thing left to do; once a folder is
             picked it is a rarely-used setting and shouldn't shout -->
        <Button
          variant={scriptsFolder ? "secondary" : "primary"}
          size="sm"
          full
          onclick={selectScriptsFolder}
        >
          {scriptsFolder ? "Change folder" : "Select scripts folder"}
        </Button>
        {#if scriptsFolder}
          <div class="folder-path" title={scriptsFolder}>{folderLabel(scriptsFolder)}</div>
        {/if}
      </div>

      {#if scriptsList.length}
        <ul class="script-list">
          {#each scriptsList as script}
            <li>
              <button
                type="button"
                class="script-item"
                class:active={selectedScript === script}
                title={script}
                onclick={() => {
                  selectedScript = script;
                  errorMessage = "";
                }}
              >
                {scriptName(script)}
              </button>
            </li>
          {/each}
        </ul>
      {:else if scriptsFolder}
        <p class="empty">No .py files in this folder.</p>
      {:else}
        <p class="empty">Pick a folder of Python scripts to get started.</p>
      {/if}
    </Panel>
  </aside>

  <div class="work-column">
    <Panel title="Input text">
      {#snippet actions()}
        {#if selectedScript}
          <span class="active-script">{scriptName(selectedScript)}</span>
        {/if}
        <Button
          variant="primary"
          size="sm"
          onclick={executeScript}
          disabled={isLoading || !selectedScript || !inputText.trim()}
        >
          {isLoading ? "Running…" : "▶ Run script"}
        </Button>
      {/snippet}

      <textarea class="editor" bind:value={inputText} placeholder="Enter or paste your text here…"
      ></textarea>
    </Panel>

    {#if errorMessage}
      <div class="error-box">{errorMessage}</div>
    {/if}

    <!-- always here, empty or not: a panel that appears on the first run would
         resize the input box out from under whoever is typing in it -->
    <Panel title="Output">
      {#snippet actions()}
        <Button
          size="sm"
          variant="ghost"
          onclick={clearOutput}
          disabled={!outputText && !errorMessage}
        >
          Clear
        </Button>
        <Button size="sm" onclick={copyToClipboard} disabled={!outputText}>
          {copySuccess ? "Copied" : "Copy"}
        </Button>
      {/snippet}

      <textarea class="editor" bind:value={outputText} placeholder="Output appears here…"
      ></textarea>
    </Panel>
  </div>
</div>

<style>
  .show-processor {
    flex: 1;
    display: flex;
    gap: var(--space-4);
    min-height: 0;
    padding: var(--space-5);
    overflow: hidden;
  }

  .scripts-column {
    flex-shrink: 0;
    width: 240px;
    display: flex;
    min-height: 0;
  }

  .scripts-column :global(.panel) {
    flex: 1;
  }

  .work-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
  }

  /* input and output split the column evenly and fill it, so the window height
     the operator gave us is the height of the boxes they type into. They stop
     shrinking at 160px and the column scrolls instead */
  .work-column :global(.panel) {
    flex: 1 1 0;
    min-height: 160px;
  }

  .folder-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border-bottom: 1px solid var(--line);
  }

  .folder-path {
    font-size: 0.75rem;
    color: var(--text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .script-list {
    list-style: none;
    margin: 0;
    padding: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .script-item {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius);
    color: var(--text-dim);
    text-align: left;
    font-size: 0.85rem;
    font-family: var(--font-mono);
    cursor: pointer;
    /* one row per script - a long filename broken across two lines makes the
       list look like it holds twice as many things as it does */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .script-item:hover:not(.active) {
    background: var(--hover);
    color: var(--text);
  }

  .script-item.active {
    background: var(--hover);
    border-color: var(--secondary);
    color: var(--text);
  }

  .empty {
    margin: 0;
    padding: var(--space-4);
    font-size: 0.85rem;
    color: var(--text-faint);
  }

  /* fills its panel rather than carrying a size of its own - the panel is what
     knows how much room there is */
  .editor {
    flex: 1;
    width: 100%;
    min-height: 0;
    resize: none;
    font-family: var(--font-mono);
    font-size: 0.9rem;
    line-height: 1.6;
  }

  .active-script {
    font-size: 0.8rem;
    font-family: var(--font-mono);
    color: var(--text-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 40ch;
  }

  .error-box {
    padding: var(--space-3) var(--space-4);
    background: var(--danger-soft);
    border: 1px solid var(--danger);
    border-radius: var(--radius);
    color: var(--danger);
    font-size: 0.85rem;
  }
</style>
