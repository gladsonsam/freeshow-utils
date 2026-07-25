<script lang="ts">
  import { freeshowClient } from "$lib/core/freeshowClient";
  import { appFunctions, findFunction } from "$lib/functions/registry";
  import ConnectionSettingsModal from "$lib/shell/ConnectionSettingsModal.svelte";
  import ConnectionIndicator from "$lib/ui/ConnectionIndicator.svelte";
  import Sidebar from "$lib/ui/Sidebar.svelte";

  const status = freeshowClient.status;

  let activeId = $state(appFunctions[0].id);
  let settingsOpen = $state(false);

  let active = $derived(findFunction(activeId));
</script>

<div class="app">
  <Sidebar
    title="FreeShow Utils"
    items={appFunctions}
    active={activeId}
    onSelect={(id) => (activeId = id)}
  >
    {#snippet footer()}
      <ConnectionIndicator status={$status} onclick={() => (settingsOpen = true)} />
    {/snippet}
  </Sidebar>

  <main class="main">
    <header class="main-head">
      <div class="titles">
        <h1 class="title">{active.name}</h1>
        <p class="subtitle">{active.description}</p>
      </div>
    </header>

    {#key active.id}
      <active.component />
    {/key}
  </main>
</div>

<ConnectionSettingsModal open={settingsOpen} onClose={() => (settingsOpen = false)} />

<style>
  .app {
    display: flex;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    background: var(--surface-0);
  }

  .main-head {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--border);
  }

  .titles {
    min-width: 0;
  }

  .title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
  }

  .subtitle {
    margin: 2px 0 0;
    font-size: 0.82rem;
    color: var(--text-faint);
  }
</style>
