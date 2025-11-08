<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { open } from "@tauri-apps/plugin-dialog";

  let pythonScriptPath = $state<string | null>(null);
  let inputText = $state("");
  let outputText = $state("");
  let errorMessage = $state("");
  let isLoading = $state(false);
  let copySuccess = $state(false);
  let showOutput = $state(false);

  async function selectPythonScript() {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Python",
            extensions: ["py"],
          },
        ],
      });

      if (selected && typeof selected === "string") {
        pythonScriptPath = selected;
        errorMessage = "";
      } else if (selected && Array.isArray(selected) && selected.length > 0) {
        pythonScriptPath = selected[0];
        errorMessage = "";
      }
    } catch (error) {
      errorMessage = `Error selecting file: ${error}`;
    }
  }

  async function executeScript() {
    if (!pythonScriptPath) {
      errorMessage = "Please select a Python script file first";
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
        scriptPath: pythonScriptPath,
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
      // Reset success message after 2 seconds
      setTimeout(() => {
        copySuccess = false;
      }, 2000);
    } catch (error) {
      errorMessage = `Failed to copy to clipboard: ${error}`;
    }
  }
</script>

<main class="container">
  <div class="header">
    <h1>FreeShow Formatter</h1>
    <p class="subtitle">Execute Python scripts to process your text</p>
  </div>

  <div class="content">
    <!-- Python Script Selection -->
    <section class="section">
      <label class="label" for="script-select">
        <strong>Python Script</strong>
      </label>
      <div class="file-selector">
        <button type="button" class="button primary" onclick={selectPythonScript}>
          {pythonScriptPath ? "Change Script" : "Select Python Script"}
        </button>
        {#if pythonScriptPath}
          <span class="file-path">{pythonScriptPath.split(/[/\\]/).pop()}</span>
        {/if}
      </div>
    </section>

    <!-- Input Text Area -->
    <section class="section">
      <label class="label" for="input-text">
        <strong>Input Text</strong>
      </label>
      <textarea
        id="input-text"
        class="textarea"
        bind:value={inputText}
        placeholder="Enter or paste your text here..."
        rows="8"
      ></textarea>
    </section>

    <!-- Execute Button -->
    <section class="section">
      <button
        type="button"
        class="button execute"
        onclick={executeScript}
        disabled={isLoading || !pythonScriptPath || !inputText.trim()}
      >
        {isLoading ? "Executing..." : "Execute Script"}
      </button>
      {#if outputText || errorMessage}
        <button type="button" class="button secondary" onclick={clearOutput}>
          Clear Output
        </button>
      {/if}
    </section>

    <!-- Error Message -->
    {#if errorMessage}
      <section class="section">
        <div class="error-box">
          <strong>Error:</strong> {errorMessage}
        </div>
      </section>
    {/if}

    <!-- Output Text Area -->
    {#if showOutput || outputText}
      <section class="section">
        <div class="output-header">
          <label class="label" for="output-text">
            <strong>Output Text</strong>
          </label>
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
          class="textarea output"
          bind:value={outputText}
          rows="8"
          placeholder="Output will appear here after script execution..."
        ></textarea>
      </section>
    {/if}
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
      Ubuntu, Cantarell, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
  }

  .container {
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem;
    min-height: 100vh;
  }

  .header {
    text-align: center;
    margin-bottom: 2rem;
    color: white;
  }

  .header h1 {
    margin: 0 0 0.5rem 0;
    font-size: 2.5rem;
    font-weight: 700;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
  }

  .subtitle {
    margin: 0;
    font-size: 1.1rem;
    opacity: 0.9;
  }

  .content {
    background: white;
    border-radius: 12px;
    padding: 2rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  }

  .section {
    margin-bottom: 1.5rem;
  }

  .label {
    display: block;
    margin-bottom: 0.5rem;
    color: #333;
    font-size: 0.95rem;
  }

  .file-selector {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .file-path {
    color: #666;
    font-size: 0.9rem;
    font-style: italic;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .textarea {
    width: 100%;
    padding: 0.75rem;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    font-size: 0.95rem;
    font-family: "Courier New", monospace;
    resize: vertical;
    transition: border-color 0.2s;
    box-sizing: border-box;
  }

  .textarea:focus {
    outline: none;
    border-color: #667eea;
  }

  .textarea.output {
    background-color: #ffffff;
    color: #212529;
    border-color: #667eea;
  }

  .output-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .copy-button {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    margin: 0;
  }

  .copy-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
  }

  .button {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    margin-right: 0.5rem;
  }

  .button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .button.primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .button.primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .button.execute {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    color: white;
    font-size: 1.1rem;
    padding: 1rem 2rem;
  }

  .button.execute:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(245, 87, 108, 0.4);
  }

  .button.secondary {
    background: #6c757d;
    color: white;
  }

  .button.secondary:hover {
    background: #5a6268;
  }

  .error-box {
    background-color: #fee;
    border: 2px solid #fcc;
    border-radius: 8px;
    padding: 1rem;
    color: #c33;
  }

  @media (prefers-color-scheme: dark) {
    .content {
      background: #1e1e1e;
      color: #e0e0e0;
    }

    .label {
      color: #e0e0e0;
    }

    .textarea {
      background-color: #2d2d2d;
      color: #e0e0e0;
      border-color: #444;
    }

    .textarea:focus {
      border-color: #667eea;
    }

    .textarea.output {
      background-color: #ffffff;
      color: #212529;
      border-color: #667eea;
    }

    .file-path {
      color: #aaa;
    }
  }
</style>
