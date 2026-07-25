<script lang="ts">
  import { freeshowClient } from "$lib/core/freeshowClient";
  import { appModules, findModule } from "$lib/modules/registry";
  import AppSettingsModal from "$lib/shell/AppSettingsModal.svelte";
  import ConnectionSettingsModal from "$lib/shell/ConnectionSettingsModal.svelte";
  import ConnectionIndicator from "$lib/ui/ConnectionIndicator.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import IconButton from "$lib/ui/IconButton.svelte";
  import Sidebar from "$lib/ui/Sidebar.svelte";

  const status = freeshowClient.status;

  let activeId = $state(appModules[0].id);
  let connectionSettingsOpen = $state(false);
  let appSettingsOpen = $state(false);

  let active = $derived(findModule(activeId));
</script>

<div class="app">
  <Sidebar
    title="FreeShow Utils"
    items={appModules}
    active={activeId}
    onSelect={(id) => (activeId = id)}
  >
    {#snippet footer()}
      <div class="sidebar-foot-row">
        <ConnectionIndicator status={$status} onclick={() => (connectionSettingsOpen = true)} />
        <IconButton title="App settings" onclick={() => (appSettingsOpen = true)}>
          <Icon name="settings" />
        </IconButton>
      </div>
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

<ConnectionSettingsModal
  open={connectionSettingsOpen}
  onClose={() => (connectionSettingsOpen = false)}
/>
<AppSettingsModal open={appSettingsOpen} onClose={() => (appSettingsOpen = false)} />

<style>
  .app {
    display: flex;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }

  .sidebar-foot-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    background: var(--primary-darkest);
  }

  .main-head {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--line);
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
