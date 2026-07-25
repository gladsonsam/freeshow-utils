<script lang="ts">
  import { connectionSettings } from "$lib/core/connectionSettings";
  import { freeshowClient } from "$lib/core/freeshowClient";
  import Button from "$lib/ui/Button.svelte";
  import Modal from "$lib/ui/Modal.svelte";

  let { open = false, onClose }: { open?: boolean; onClose?: () => void } = $props();

  const status = freeshowClient.status;
  const errorMessage = freeshowClient.errorMessage;

  let editable = $derived($status === "disconnected" || $status === "no-hook");
</script>

<Modal {open} {onClose} title="FreeShow connection" width="460px">
  <label class="field">
    <span class="field-label">Host</span>
    <input bind:value={$connectionSettings.host} placeholder="localhost" disabled={!editable} />
  </label>

  <div class="ports">
    <label class="field">
      <span class="field-label">Stage port</span>
      <input bind:value={$connectionSettings.stagePort} placeholder="5511" disabled={!editable} />
    </label>
    <label class="field">
      <span class="field-label">API port</span>
      <input bind:value={$connectionSettings.apiPort} placeholder="5505" disabled={!editable} />
    </label>
  </div>

  <label class="checkbox">
    <input type="checkbox" bind:checked={$connectionSettings.autoConnect} />
    <span>Connect automatically on launch</span>
  </label>

  <p class="hint">
    Enable <strong>Stage Output</strong> and the <strong>REST/Companion API</strong> under Settings →
    Connections in FreeShow. FreeShow also needs at least one Stage Show to exist — it is only used
    as a routing pointer to say which output to mirror; this app ignores its layout entirely.
  </p>

  {#if $errorMessage}
    <div class="error-box">{$errorMessage}</div>
  {/if}

  {#snippet footer()}
    {#if editable}
      <Button variant="primary" onclick={() => freeshowClient.connect()}>Connect</Button>
    {:else}
      <Button onclick={() => freeshowClient.disconnect()}>
        {$status === "connecting" ? "Cancel" : "Disconnect"}
      </Button>
    {/if}
    <Button variant="ghost" onclick={() => onClose?.()}>Close</Button>
  {/snippet}
</Modal>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
  }

  .field-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-dim);
  }

  .ports {
    display: flex;
    gap: var(--space-3);
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

  .hint {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--text-faint);
  }

  .error-box {
    padding: var(--space-3);
    background: var(--danger-soft);
    border: 1px solid var(--danger);
    border-radius: var(--radius);
    color: var(--danger);
    font-size: 0.8rem;
    line-height: 1.45;
  }
</style>
