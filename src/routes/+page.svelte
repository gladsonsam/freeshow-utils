<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { open } from "@tauri-apps/plugin-dialog";
  import { onMount } from "svelte";

  let scriptsFolder = $state<string | null>(null);
  let scriptsList = $state<string[]>([]);
  let selectedScript = $state<string | null>(null);
  let inputText = $state("");
  let outputText = $state("");
  let errorMessage = $state("");
  let isLoading = $state(false);
  let copySuccess = $state(false);
  let showOutput = $state(false);
  let isReloading = $state(false);

  async function selectScriptsFolder() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });

      if (selected && typeof selected === "string") {
        scriptsFolder = selected;
        await loadScripts();
        errorMessage = "";
      } else if (selected && Array.isArray(selected) && selected.length > 0) {
        scriptsFolder = selected[0];
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
      const scripts = await invoke<string[]>("list_scripts", {
        folderPath: scriptsFolder,
      });
      
      const previousSelected = selectedScript;
      scriptsList = scripts;
      
      // If we had a selected script, try to keep it selected if it still exists
      if (previousSelected && scripts.includes(previousSelected)) {
        selectedScript = previousSelected;
      } else if (scripts.length > 0) {
        // Otherwise, select the first script (or keep first if none was selected)
        if (!selectedScript || !scripts.includes(selectedScript)) {
          selectedScript = scripts[0];
        }
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

  async function reloadScripts() {
    await loadScripts();
  }

  function selectScript(scriptPath: string) {
    selectedScript = scriptPath;
    errorMessage = "";
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
      const result = await invoke<string>("execute_python_script", {
        scriptPath: selectedScript,
        inputText: inputText,
      });
      outputText = result;
      showOutput = true;
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
    showOutput = false;
  }

  async function copyToClipboard() {
    if (!outputText) return;
    
    try {
      await navigator.clipboard.writeText(outputText);
      copySuccess = true;
      setTimeout(() => {
        copySuccess = false;
      }, 2000);
    } catch (error) {
      errorMessage = `Failed to copy to clipboard: ${error}`;
    }
  }

  function getScriptName(scriptPath: string): string {
    const parts = scriptPath.split(/[/\\]/);
    return parts[parts.length - 1] || scriptPath;
  }

  // Add keyboard shortcut for reload (F5)
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'F5' && scriptsFolder && !isReloading) {
      event.preventDefault();
      reloadScripts();
    }
  }

  // Set up keyboard listener
  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

<div class="app-container">
  <!-- Left Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <h2 class="app-title">FreeShow Formatter</h2>
    </div>
    
    <div class="sidebar-content">
      <div class="folder-section">
        <div class="folder-buttons">
          <button type="button" class="folder-button" onclick={selectScriptsFolder}>
            {scriptsFolder ? "📁 Change Folder" : "📁 Select Scripts Folder"}
          </button>
          {#if scriptsFolder}
            <button
              type="button"
              class="reload-button"
              onclick={reloadScripts}
              disabled={isReloading}
              title="Reload scripts from folder (F5)"
            >
              {isReloading ? "⏳" : "🔄"}
            </button>
          {/if}
        </div>
        {#if scriptsFolder}
          <div class="folder-path">{scriptsFolder.split(/[/\\]/).pop()}</div>
        {/if}
      </div>

      {#if scriptsList.length > 0}
        <div class="scripts-section">
          <h3 class="section-title">Scripts ({scriptsList.length})</h3>
          <div class="scripts-list">
            {#each scriptsList as script}
              <button
                type="button"
                class="script-item"
                class:active={selectedScript === script}
                onclick={() => selectScript(script)}
              >
                {getScriptName(script)}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </aside>

  <!-- Main Content -->
  <main class="main-content">
    <div class="content-header">
      <h1 class="page-title">Text Processor</h1>
      {#if selectedScript}
        <div class="selected-script">
          <span class="script-label">Active:</span>
          <span class="script-name">{getScriptName(selectedScript)}</span>
        </div>
      {/if}
    </div>

    <div class="content-body">
      <!-- Input Section -->
      <section class="input-section">
        <div class="section-header">
          <h2 class="section-title">Input Text</h2>
        </div>
        <textarea
          id="input-text"
          class="textarea input-textarea"
          bind:value={inputText}
          placeholder="Enter or paste your text here..."
          rows="12"
        ></textarea>
      </section>

      <!-- Action Buttons -->
      <div class="action-buttons">
        <button
          type="button"
          class="button execute-button"
          onclick={executeScript}
          disabled={isLoading || !selectedScript || !inputText.trim()}
        >
          {isLoading ? "⏳ Executing..." : "▶ Execute Script"}
        </button>
        {#if outputText || errorMessage}
          <button type="button" class="button clear-button" onclick={clearOutput}>
            🗑 Clear
          </button>
        {/if}
      </div>

      <!-- Error Message -->
      {#if errorMessage}
        <div class="error-box">
          <strong>Error:</strong> {errorMessage}
        </div>
      {/if}

      <!-- Output Section -->
      {#if showOutput || outputText}
        <section class="output-section">
          <div class="section-header">
            <h2 class="section-title">Output Text</h2>
            {#if outputText}
              <button
                type="button"
                class="button copy-button"
                onclick={copyToClipboard}
                title="Copy to clipboard"
              >
                {copySuccess ? "✓ Copied!" : "📋 Copy"}
              </button>
            {/if}
          </div>
          <textarea
            id="output-text"
            class="textarea output-textarea"
            bind:value={outputText}
            rows="12"
            placeholder="Output will appear here after script execution..."
          ></textarea>
        </section>
      {/if}
    </div>
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
      Ubuntu, Cantarell, sans-serif;
    background: #1e1e1e;
    color: #e0e0e0;
    overflow: hidden;
  }

  .app-container {
    display: flex;
    height: 100vh;
    width: 100vw;
  }

  /* Sidebar */
  .sidebar {
    width: 280px;
    background: #252526;
    border-right: 1px solid #3e3e42;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    padding: 1.5rem 1rem;
    border-bottom: 1px solid #3e3e42;
  }

  .app-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: #e0e0e0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .folder-section {
    margin-bottom: 2rem;
  }

  .folder-buttons {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .folder-button {
    flex: 1;
    padding: 0.75rem;
    background: #0e639c;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .folder-button:hover {
    background: #1177bb;
  }

  .reload-button {
    padding: 0.75rem;
    background: #37373d;
    color: #e0e0e0;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .reload-button:hover:not(:disabled) {
    background: #464647;
    transform: rotate(180deg);
  }

  .reload-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .folder-path {
    font-size: 0.85rem;
    color: #858585;
    padding: 0.5rem;
    background: #2d2d30;
    border-radius: 4px;
    word-break: break-all;
  }

  .scripts-section {
    margin-top: 1rem;
  }

  .section-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: #858585;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 0.75rem 0;
    padding: 0 0.5rem;
  }

  .scripts-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .script-item {
    padding: 0.75rem 1rem;
    background: #2d2d30;
    color: #e0e0e0;
    border: none;
    border-radius: 4px;
    text-align: left;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
    border-left: 3px solid transparent;
  }

  .script-item:hover {
    background: #37373d;
  }

  .script-item.active {
    background: #37373d;
    border-left-color: #667eea;
    color: #ffffff;
  }

  /* Main Content */
  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #1e1e1e;
  }

  .content-header {
    padding: 1.5rem 2rem;
    border-bottom: 1px solid #3e3e42;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .page-title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: #e0e0e0;
  }

  .selected-script {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: #2d2d30;
    border-radius: 4px;
  }

  .script-label {
    font-size: 0.85rem;
    color: #858585;
  }

  .script-name {
    font-size: 0.9rem;
    color: #667eea;
    font-weight: 500;
  }

  .content-body {
    flex: 1;
    overflow-y: auto;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .input-section,
  .output-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .section-header .section-title {
    font-size: 1rem;
    font-weight: 600;
    color: #e0e0e0;
    margin: 0;
    text-transform: none;
    letter-spacing: 0;
    padding: 0;
  }

  .textarea {
    width: 100%;
    padding: 1rem;
    background: #252526;
    color: #e0e0e0;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    font-size: 0.95rem;
    font-family: "Consolas", "Monaco", "Courier New", monospace;
    resize: vertical;
    transition: border-color 0.2s;
    box-sizing: border-box;
    line-height: 1.6;
  }

  .textarea:focus {
    outline: none;
    border-color: #667eea;
  }

  .textarea::placeholder {
    color: #6a6a6a;
  }

  .input-textarea {
    min-height: 200px;
  }

  .output-textarea {
    background: #ffffff;
    color: #212529;
    border-color: #667eea;
    min-height: 200px;
  }

  .output-textarea::placeholder {
    color: #6c757d;
  }

  .action-buttons {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .button {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 4px;
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .execute-button {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-size: 1rem;
    padding: 0.875rem 2rem;
  }

  .execute-button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .clear-button {
    background: #6c757d;
    color: white;
  }

  .clear-button:hover {
    background: #5a6268;
  }

  .copy-button {
    background: #0e639c;
    color: white;
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
  }

  .copy-button:hover {
    background: #1177bb;
  }

  .error-box {
    background-color: #3a1f1f;
    border: 1px solid #5a2f2f;
    border-radius: 4px;
    padding: 1rem;
    color: #ff6b6b;
  }

  .error-box strong {
    color: #ff4444;
  }

  /* Scrollbar styling */
  .sidebar-content::-webkit-scrollbar,
  .content-body::-webkit-scrollbar {
    width: 10px;
  }

  .sidebar-content::-webkit-scrollbar-track,
  .content-body::-webkit-scrollbar-track {
    background: #1e1e1e;
  }

  .sidebar-content::-webkit-scrollbar-thumb,
  .content-body::-webkit-scrollbar-thumb {
    background: #424242;
    border-radius: 5px;
  }

  .sidebar-content::-webkit-scrollbar-thumb:hover,
  .content-body::-webkit-scrollbar-thumb:hover {
    background: #4e4e4e;
  }
</style>
