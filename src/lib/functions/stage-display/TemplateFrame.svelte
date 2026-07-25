<script lang="ts">
  import type { StageData } from "$lib/core/types";
  import {
    ERROR_MESSAGE,
    READY_MESSAGE,
    buildTemplateDocument,
    postStageData,
  } from "./templateRuntime";

  let {
    html,
    data,
    onError,
  }: {
    html: string;
    data: StageData;
    /** template-thrown errors, surfaced by the editor */
    onError?: (message: string) => void;
  } = $props();

  let frame = $state<HTMLIFrameElement | null>(null);
  let ready = $state(false);

  let srcdoc = $derived(buildTemplateDocument(html));

  // a new document means a new bootstrap - wait for it to announce itself again
  $effect(() => {
    srcdoc;
    ready = false;
  });

  // push every change; the first push happens as soon as the frame is ready
  $effect(() => {
    const payload = data;
    if (!ready) return;
    postStageData(frame, payload);
  });

  function onMessage(event: MessageEvent) {
    if (!frame || event.source !== frame.contentWindow) return;
    if (event.data?.type === READY_MESSAGE) {
      ready = true;
      postStageData(frame, data);
    } else if (event.data?.type === ERROR_MESSAGE) {
      onError?.(String(event.data.message));
    }
  }
</script>

<svelte:window onmessage={onMessage} />

<!-- allow-scripts only: no network, no top-level navigation, no same-origin access -->
<iframe bind:this={frame} title="Stage template" sandbox="allow-scripts" {srcdoc}></iframe>

<style>
  iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: none;
    background: #000;
  }
</style>
