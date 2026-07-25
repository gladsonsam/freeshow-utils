<script lang="ts">
  import { onMount } from "svelte";
  import Button from "$lib/ui/Button.svelte";
  import Modal from "$lib/ui/Modal.svelte";
  import {
    appSettings,
    appSettingsError,
    loadAppSettings,
    setCloseToTray,
    setLaunchOnStartup,
  } from "$lib/core/appSettings";

  let { open = false, onClose }: { open?: boolean; onClose?: () => void } = $props();

  onMount(loadAppSettings);
</script>

<Modal {open} {onClose} title="App settings" width="460px">
  <label class="checkbox">
    <input
      type="checkbox"
      checked={$appSettings.launchOnStartup}
      onchange={(event) => setLaunchOnStartup(event.currentTarget.checked)}
    />
    <span>Launch FreeShow Utils when I log in</span>
  </label>

  <label class="checkbox">
    <input
      type="checkbox"
      checked={$appSettings.closeToTray}
      onchange={(event) => setCloseToTray(event.currentTarget.checked)}
    />
    <span>Closing the window sends it to the tray instead of quitting</span>
  </label>

  <p class="hint">
    Any stage output windows keep running either way — closing this window never takes them down.
    Turn off "close to tray" and this window's close button quits the app for real, which also
    closes every stage output. To reopen the window while it's in the tray, use the tray icon;
    it also has a Quit item that stops everything.
  </p>

  {#if $appSettingsError}
    <div class="error-box">{$appSettingsError}</div>
  {/if}

  {#snippet footer()}
    <Button variant="ghost" onclick={() => onClose?.()}>Close</Button>
  {/snippet}
</Modal>

<style>
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
