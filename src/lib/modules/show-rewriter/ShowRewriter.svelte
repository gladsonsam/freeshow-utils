<script lang="ts">
  import { onMount } from "svelte";
  import Button from "$lib/ui/Button.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import IconButton from "$lib/ui/IconButton.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import { connectionStatus, freeshowClient } from "$lib/core/freeshowClient";
  import { aiSettings } from "$lib/core/openrouter";
  import { TEMP_SLIDE_ID } from "$lib/core/types";
  import {
    addInstruction,
    apply,
    cancel,
    editSlide,
    instructions,
    loadShow,
    removeInstruction,
    rewrite,
    rewriterState,
    undo,
    updateInstruction,
    DEFAULT_SYSTEM_PROMPT,
    resetSystemPrompt,
    systemPrompt,
  } from "./rewriter";

  /** how many search matches to list - past this, typing more is quicker than scrolling */
  const MAX_MATCHES = 40;

  let connected = $derived($connectionStatus === "connected");
  let session = $derived($rewriterState);

  // ── Picking a show ──────────────────────────────────────────────────────────

  let shows = $state<{ id: string; name: string }[]>([]);
  let query = $state("");

  async function loadShowList() {
    const list: Record<string, { name?: string }> | null = await freeshowClient.request("get_shows");
    shows = Object.entries(list ?? {})
      .map(([id, show]) => ({ id, name: show?.name || "Untitled" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  let matches = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return shows.filter((show) => show.name.toLowerCase().includes(needle)).slice(0, MAX_MATCHES);
  });

  const out = freeshowClient.out;

  let outputShowId = $derived.by(() => {
    const id = $out?.out?.slide?.id;
    return id && id !== TEMP_SLIDE_ID ? id : "";
  });

  function pick(id: string) {
    const name = shows.find((show) => show.id === id)?.name ?? "Untitled";
    query = "";
    armed = false;
    void loadShow(id, name);
  }

  $effect(() => {
    if (connected) void loadShowList();
  });

  // ── Instructions ────────────────────────────────────────────────────────────

  let selectedId = $state("");
  let selected = $derived($instructions.find((item) => item.id === selectedId) ?? $instructions[0]);

  onMount(() => {
    if (!selectedId && $instructions[0]) selectedId = $instructions[0].id;
  });

  function newInstruction() {
    selectedId = addInstruction();
  }

  function deleteSelected() {
    if (!selected) return;
    const index = $instructions.indexOf(selected);
    removeInstruction(selected.id);
    selectedId = $instructions[Math.max(0, index - 1)]?.id ?? "";
  }

  // ── Review and apply ────────────────────────────────────────────────────────

  let hasRewrite = $derived(session.slides.some((slide) => slide.rewritten));
  let changedCount = $derived(
    session.slides.filter((slide) => slide.rewritten && slide.rewritten !== slide.text).length,
  );
  let live = $derived(!!session.showId && session.showId === outputShowId);

  /**
   * Writing to the song on screen changes what the congregation is looking at
   * the moment it lands, so that takes a second, deliberate click.
   */
  let armed = $state(false);

  function onApply() {
    if (live && !armed) {
      armed = true;
      return;
    }
    armed = false;
    void apply();
  }

  let canRewrite = $derived(
    connected && !!session.slides.length && !session.busy && !!selected?.text.trim() && !!$aiSettings.apiKey,
  );
</script>

<div class="show-rewriter">
  <aside class="side-column">
    <Panel title="Instructions" padded={false} scroll>
      {#snippet actions()}
        <Button size="sm" onclick={newInstruction}>New</Button>
      {/snippet}

      <ul class="list">
        {#each $instructions as item (item.id)}
          <li>
            <button
              type="button"
              class="list-item"
              class:active={selected?.id === item.id}
              onclick={() => (selectedId = item.id)}
            >
              {item.name || "Untitled"}
            </button>
          </li>
        {/each}
      </ul>
    </Panel>
  </aside>

  <div class="work-column">
    <Panel title="Show">
      {#snippet actions()}
        <Button
          size="sm"
          disabled={!connected || !outputShowId || session.busy}
          title="Load the song that is on output in FreeShow"
          onclick={() => pick(outputShowId)}
        >
          Song on output
        </Button>
        <IconButton title="Reload the show list" disabled={!connected} onclick={loadShowList}>
          <Icon name="refresh" />
        </IconButton>
      {/snippet}

      {#if !connected}
        <p class="empty">Not connected to FreeShow.</p>
      {:else}
        <input
          class="search"
          type="search"
          placeholder="Search {shows.length} shows…"
          bind:value={query}
        />
        {#if matches.length}
          <ul class="matches">
            {#each matches as show (show.id)}
              <li>
                <button type="button" class="list-item" onclick={() => pick(show.id)}>
                  {show.name}
                </button>
              </li>
            {/each}
          </ul>
        {:else if query.trim()}
          <p class="empty">No show matches “{query.trim()}”.</p>
        {/if}

        {#if session.showId}
          <p class="loaded">
            <strong>{session.showName}</strong>
            <span class="faint">· {session.slides.length} slides</span>
            {#if live}<span class="live">on screen now</span>{/if}
          </p>
        {/if}
      {/if}
    </Panel>

    <Panel title="Instruction">
      {#snippet actions()}
        <IconButton title="Delete this instruction" disabled={!selected} onclick={deleteSelected}>
          <Icon name="delete" />
        </IconButton>
        {#if session.busy && session.activity.startsWith("Waiting")}
          <Button size="sm" variant="ghost" onclick={cancel}>Cancel</Button>
        {/if}
        <Button
          variant="primary"
          size="sm"
          disabled={!canRewrite}
          onclick={() => selected && rewrite(selected.text)}
        >
          {session.busy && session.activity.startsWith("Waiting") ? "Rewriting…" : "Rewrite"}
        </Button>
      {/snippet}

      {#if selected}
        <input
          class="name"
          value={selected.name}
          placeholder="Name"
          oninput={(event) => updateInstruction(selected.id, { name: event.currentTarget.value })}
        />
        <textarea
          class="instruction"
          value={selected.text}
          placeholder="Tell the model what to change, e.g. add an English translation under each line."
          oninput={(event) => updateInstruction(selected.id, { text: event.currentTarget.value })}
        ></textarea>
      {:else}
        <p class="empty">No instructions. Add one with New.</p>
      {/if}

      {#if !$aiSettings.apiKey}
        <p class="hint">Add an OpenRouter API key in App settings to use this.</p>
      {:else}
        <p class="hint">Using {$aiSettings.model}. Change it in App settings.</p>
      {/if}

      <details class="reply-rules">
        <summary>
          How the model should reply
          {#if $systemPrompt !== DEFAULT_SYSTEM_PROMPT}<span class="faint">· edited</span>{/if}
        </summary>
        <textarea
          class="instruction rules"
          spellcheck="false"
          value={$systemPrompt}
          oninput={(event) => systemPrompt.set(event.currentTarget.value)}
        ></textarea>
        <div class="rules-foot">
          <p class="hint">
            Sent with every instruction. <code>{"{count}"}</code> becomes the number of slides. The
            reply is always one text per slide and is checked against the show before anything is
            written, so this shapes the words, not the show's structure.
          </p>
          <Button
            size="sm"
            variant="ghost"
            disabled={$systemPrompt === DEFAULT_SYSTEM_PROMPT}
            onclick={resetSystemPrompt}
          >
            Reset to default
          </Button>
        </div>
      </details>
    </Panel>

    {#if session.error}
      <div class="error-box">{session.error}</div>
    {:else if session.busy}
      <p class="status">{session.activity}</p>
    {:else if session.applied}
      <p class="status done">Written to FreeShow.</p>
    {/if}

    <Panel title="Review" padded={false} scroll>
      {#snippet actions()}
        {#if hasRewrite}
          <span class="faint small">{changedCount} of {session.slides.length} slides changed</span>
        {/if}
        {#if session.applied}
          <Button size="sm" disabled={session.busy || !connected} onclick={undo}>Undo</Button>
        {/if}
        <Button
          size="sm"
          variant={armed ? "danger" : "primary"}
          disabled={!hasRewrite || session.busy || !connected}
          onclick={onApply}
        >
          {armed ? "It's on screen: apply anyway" : "Apply to show"}
        </Button>
      {/snippet}

      {#if !session.slides.length}
        <p class="empty inset">Pick a show, choose an instruction and press Rewrite.</p>
      {:else}
        <div class="slides">
          <div class="slides-head">
            <span>Now</span>
            <span>Rewritten</span>
          </div>
          {#each session.slides as slide, index (index)}
            <div class="slide" class:changed={slide.rewritten && slide.rewritten !== slide.text}>
              {#if slide.group !== null}
                <div class="group">{slide.group}</div>
              {/if}
              <div class="pair">
                <pre class="before">{slide.text}</pre>
                {#if hasRewrite}
                  <textarea
                    class="after"
                    rows={Math.max(2, slide.rewritten.split("\n").length)}
                    value={slide.rewritten}
                    oninput={(event) => editSlide(index, event.currentTarget.value)}
                  ></textarea>
                {:else}
                  <div class="after placeholder"></div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </Panel>
  </div>
</div>

<style>
  .show-rewriter {
    flex: 1;
    display: flex;
    gap: var(--space-4);
    min-height: 0;
    padding: var(--space-5);
    overflow: hidden;
  }

  .side-column {
    flex-shrink: 0;
    width: 240px;
    display: flex;
    min-height: 0;
  }

  .side-column :global(.panel) {
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

  /* the review is the part that needs the room; the rest sizes to its content */
  .work-column > :global(.panel:not(:last-child)) {
    flex-shrink: 0;
  }

  .work-column > :global(.panel:last-child) {
    flex: 1 1 0;
    min-height: 240px;
  }

  .list,
  .matches {
    list-style: none;
    margin: 0;
    padding: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .matches {
    max-height: 200px;
    overflow-y: auto;
    padding: var(--space-2) 0 0;
  }

  .list-item {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius);
    color: var(--text-dim);
    text-align: left;
    font-size: 0.85rem;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .list-item:hover:not(.active) {
    background: var(--hover);
    color: var(--text);
  }

  .list-item.active {
    background: var(--hover);
    border-color: var(--secondary);
    color: var(--text);
  }

  .search,
  .name {
    width: 100%;
  }

  .name {
    margin-bottom: var(--space-2);
  }

  .instruction {
    width: 100%;
    min-height: 90px;
    resize: vertical;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .reply-rules {
    margin-top: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--line);
  }

  .reply-rules summary {
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--text-dim);
  }

  .rules {
    margin-top: var(--space-2);
    min-height: 200px;
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }

  .rules-foot {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .rules-foot code {
    font-family: var(--font-mono);
  }

  .loaded {
    margin: var(--space-3) 0 0;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .live {
    padding: 1px var(--space-2);
    border: 1px solid var(--danger);
    border-radius: var(--radius);
    color: var(--danger);
    font-size: 0.75rem;
  }

  .faint {
    color: var(--text-faint);
  }

  .small {
    font-size: 0.8rem;
  }

  .empty {
    margin: 0;
    padding: var(--space-2) 0;
    font-size: 0.85rem;
    color: var(--text-faint);
  }

  .empty.inset {
    padding: var(--space-4);
  }

  .hint {
    margin: var(--space-2) 0 0;
    font-size: 0.8rem;
    color: var(--text-faint);
  }

  .status {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-dim);
  }

  .status.done {
    color: var(--connected);
  }

  .error-box {
    padding: var(--space-3) var(--space-4);
    background: var(--danger-soft);
    border: 1px solid var(--danger);
    border-radius: var(--radius);
    color: var(--danger);
    font-size: 0.85rem;
  }

  .slides {
    display: flex;
    flex-direction: column;
  }

  .slides-head,
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .slides-head {
    position: sticky;
    top: 0;
    padding: var(--space-2) var(--space-4);
    background: var(--primary);
    border-bottom: 1px solid var(--line);
    font-size: 0.78rem;
    color: var(--text-faint);
  }

  .slide {
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--line);
  }

  .group {
    margin-bottom: var(--space-2);
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-dim);
  }

  .before,
  .after {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.85rem;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .before {
    color: var(--text-dim);
  }

  .after {
    width: 100%;
    resize: vertical;
  }

  .slide.changed .after {
    border-color: var(--secondary);
  }
</style>
