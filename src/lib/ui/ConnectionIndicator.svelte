<script lang="ts">
  let {
    status,
    onclick,
  }: {
    status: "disconnected" | "connecting" | "connected" | "no-hook";
    onclick?: () => void;
  } = $props();

  const labels = {
    disconnected: "Offline",
    connecting: "Connecting…",
    connected: "Connected",
    "no-hook": "Needs setup",
  } as const;
</script>

<button type="button" class="indicator" title="FreeShow connection settings" {onclick}>
  <span class="dot {status}"></span>
  <span class="label">{labels[status]}</span>
</button>

<style>
  .indicator {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    background: transparent;
    border: none;
    color: var(--text-dim);
    font-size: 0.8rem;
    cursor: pointer;
  }

  .indicator:hover {
    background: var(--hover);
    color: var(--text);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-faint);
    flex-shrink: 0;
  }

  .dot.connected {
    background: var(--connected);
    box-shadow: 0 0 6px var(--connected);
  }

  .dot.connecting {
    background: var(--warning);
  }

  .dot.no-hook {
    background: var(--warning);
  }
</style>
