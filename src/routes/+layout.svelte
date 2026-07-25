<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import "$lib/ui/theme.css";
  import { connectionSettings } from "$lib/core/connectionSettings";
  import { freeshowClient } from "$lib/core/freeshowClient";

  let { children } = $props();

  // One connection per window, opened at the app level so every function (and
  // every output window) reads the same live state without re-implementing it.
  onMount(() => {
    if (get(connectionSettings).autoConnect) freeshowClient.connect();
    return () => freeshowClient.disconnect();
  });
</script>

{@render children?.()}
