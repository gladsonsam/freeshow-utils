<script lang="ts">
  import { onMount } from "svelte";
  import Button from "$lib/ui/Button.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import IconButton from "$lib/ui/IconButton.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import {
    allKeys,
    keyName,
    parseChord,
    pitchClass,
    semitoneDelta,
    showChords,
    transposeChord,
  } from "$lib/core/chords";
  import {
    controlServer,
    controlSettings,
    publishControlState,
    registerControlModule,
    startControlServer,
    stopControlServer,
  } from "$lib/core/controlSurface";
  import { connectionStatus } from "$lib/core/freeshowClient";
  import {
    followOutput,
    keyChangerState,
    refresh,
    resetToOriginal,
    transposeBy,
    transposeTo,
  } from "./keyState";

  const MODULE_ID = "key-changer";

  /** how many distinct chords to show in the before/after preview */
  const PREVIEW_CHORDS = 6;

  let target = $derived($keyChangerState.target);
  let currentKey = $derived(target?.key ?? null);
  let minor = $derived(currentKey?.minor ?? false);
  let keys = $derived(allKeys(minor));
  let connected = $derived($connectionStatus === "connected");

  /** the key the song started in, named the way the grid names it */
  let originalLabel = $derived(
    target?.originalKey ? keyName(target.originalKey.pitch, target.originalKey.minor) : "",
  );

  let canTranspose = $derived(!!target && !!currentKey && connected && !$keyChangerState.busy);

  /**
   * What the first few chords become in a given key.
   *
   * Only ever a preview drawn from our own arithmetic - FreeShow does the real
   * transposition. It exists because key detection is sometimes a guess, and a
   * musician can tell at a glance whether "G D Em C" turning into "A E F#m D" is
   * what they meant, which is a far better check than trusting the label.
   *
   * The spelling deliberately follows FreeShow's rule rather than the key
   * signature: measured against a real show, it spells with sharps going up and
   * flats coming down, whatever key that lands in - D G A F#m up a semitone
   * becomes D# G# A# Gm, not Eb Ab Bb Gm. Spelling this "properly" would print a
   * preview that disagrees with the chords the band is about to see.
   */
  function preview(pitch: number): { from: string; to: string }[] {
    if (!target || !currentKey) return [];

    const steps = semitoneDelta(currentKey.pitch, pitch);
    const flats = steps < 0;

    const seen = new Set<string>();
    const chords: { from: string; to: string }[] = [];
    for (const label of showChords(target.show)) {
      if (seen.has(label) || !parseChord(label)) continue;
      seen.add(label);
      chords.push({ from: label, to: transposeChord(label, steps, flats) });
      if (chords.length >= PREVIEW_CHORDS) break;
    }
    return chords;
  }

  let hovered = $state<number | null>(null);
  let previewPitch = $derived(hovered ?? currentKey?.pitch ?? null);
  let previewChords = $derived(previewPitch === null ? [] : preview(previewPitch));

  function stepsTo(pitch: number): number {
    return currentKey ? semitoneDelta(currentKey.pitch, pitch) : 0;
  }

  /** "+2", "-3", or "" for the key it is already in */
  function stepLabel(pitch: number): string {
    const steps = stepsTo(pitch);
    return steps === 0 ? "" : steps > 0 ? `+${steps}` : `${steps}`;
  }

  // ── Remote control ──────────────────────────────────────────────────────────

  /**
   * Turn a key named in a URL into a pitch class.
   *
   * Accepts whatever a Companion button is likely to have been labelled with -
   * "G", "g", "Gm", "F#", "Gb", "Ab" - because the person building that page is
   * doing it once, by hand, months before it matters, and having it silently do
   * nothing is a bad way to find out you typed the wrong thing.
   */
  function pitchFromName(name: string): number | null {
    const parsed = parseChord(decodeURIComponent(name));
    return parsed ? pitchClass(parsed.root) : null;
  }

  async function handleControl(action: { path: string[] }) {
    const [verb, argument] = action.path;

    if (verb === "up") return transposeBy(1);
    if (verb === "down") return transposeBy(-1);
    if (verb === "reset") return resetToOriginal();
    if (verb === "refresh") return refresh();

    if (verb === "key" && argument) {
      const pitch = pitchFromName(argument);
      if (pitch !== null) await transposeTo(pitch);
    }
  }

  onMount(() => {
    const unfollow = followOutput();
    const unregister = registerControlModule(MODULE_ID, handleControl);
    if ($controlSettings.enabled) void startControlServer($controlSettings.port);

    return () => {
      unfollow();
      unregister();
    };
  });

  /**
   * Keep the published state in step with what the screen shows.
   *
   * This is what makes a Stream Deck button light up on the right key: Companion
   * polls it into a variable and a feedback compares that to the button's own
   * key. It has to be pushed on every change, including the ones that came from
   * the Stream Deck itself.
   */
  $effect(() => {
    publishControlState(MODULE_ID, {
      showName: target?.showName ?? "",
      showId: target?.showId ?? "",
      currentKey: currentKey?.label ?? "",
      currentPitch: currentKey?.pitch ?? -1,
      originalKey: originalLabel,
      minor,
      confident: currentKey?.confident ?? false,
      source: currentKey?.source ?? "",
      busy: $keyChangerState.busy,
      connected,
    });
  });

  async function toggleServer(enabled: boolean) {
    controlSettings.update((settings) => ({ ...settings, enabled }));
    if (enabled) await startControlServer($controlSettings.port);
    else await stopControlServer();
  }

  async function changePort(value: string) {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return;
    controlSettings.update((settings) => ({ ...settings, port }));
    if ($controlSettings.enabled) await startControlServer(port);
  }
</script>

<div class="module">
  <Panel title="Current song">
    {#snippet actions()}
      <IconButton title="Re-read this song from FreeShow" onclick={() => refresh()}>
        <Icon name="refresh" />
      </IconButton>
    {/snippet}

    {#if !connected}
      <p class="empty">Not connected to FreeShow.</p>
    {:else if !target}
      <p class="empty">
        Waiting for a song. Put one on output in FreeShow and it will appear here.
      </p>
    {:else}
      <div class="song">
        <div class="song-name" title={target.showName}>{target.showName}</div>

        {#if currentKey}
          <div class="key-readout">
            <span class="key-badge">{currentKey.label}</span>
            <span class="key-source">
              {#if currentKey.source === "metadata"}
                from the song's metadata
              {:else if currentKey.confident}
                read from its chords
              {:else}
                best guess from its chords — it starts and ends on different chords
              {/if}
            </span>
          </div>
        {:else}
          <p class="empty">
            This song has no chords, so there is no key to read. Transposing needs chords.
          </p>
        {/if}
      </div>
    {/if}
  </Panel>

  <Panel title="Key">
    {#snippet actions()}
      <Button size="sm" disabled={!canTranspose} onclick={() => transposeBy(-1)}>−1</Button>
      <Button size="sm" disabled={!canTranspose} onclick={() => transposeBy(1)}>+1</Button>
      {#if originalLabel}
        <Button
          size="sm"
          disabled={!canTranspose || currentKey?.pitch === target?.originalKey?.pitch}
          onclick={() => resetToOriginal()}
        >
          Reset to {originalLabel}
        </Button>
      {/if}
    {/snippet}

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="grid" onmouseleave={() => (hovered = null)}>
      {#each keys as key (key.pitch)}
        <button
          class="key"
          class:current={currentKey?.pitch === key.pitch}
          class:original={target?.originalKey?.pitch === key.pitch &&
            currentKey?.pitch !== key.pitch}
          disabled={!canTranspose}
          title={currentKey?.pitch === key.pitch
            ? `Already in ${key.label}`
            : `Transpose to ${key.label}`}
          onmouseenter={() => (hovered = key.pitch)}
          onfocus={() => (hovered = key.pitch)}
          onclick={() => transposeTo(key.pitch)}
        >
          <span class="key-label">{key.label}</span>
          <span class="key-step">{stepLabel(key.pitch)}</span>
        </button>
      {/each}
    </div>

    {#if $keyChangerState.busy}
      <p class="status busy">{$keyChangerState.activity}</p>
    {:else if $keyChangerState.error}
      <p class="status error">{$keyChangerState.error}</p>
    {:else if previewChords.length}
      <div class="preview">
        {#each previewChords as chord (chord.from)}
          <span class="chord">
            <span class="chord-from">{chord.from}</span>
            {#if chord.from !== chord.to}
              <span class="chord-arrow">→</span>
              <span class="chord-to">{chord.to}</span>
            {/if}
          </span>
        {/each}
      </div>
    {/if}
  </Panel>

  <Panel title="Stream Deck">
    <label class="row">
      <input
        type="checkbox"
        checked={$controlSettings.enabled}
        onchange={(event) => toggleServer(event.currentTarget.checked)}
      />
      <span>Let Companion control this over the network</span>
    </label>

    <label class="row">
      <span class="row-label">Port</span>
      <input
        class="port"
        type="number"
        min="1"
        max="65535"
        value={$controlSettings.port}
        onchange={(event) => changePort(event.currentTarget.value)}
      />
      {#if $controlServer.running}
        <span class="running">listening</span>
      {/if}
    </label>

    {#if $controlServer.error}
      <p class="status error">{$controlServer.error}</p>
    {/if}

    <p class="hint">
      In Companion, add a <strong>Generic HTTP</strong> connection pointed at this machine. A button
      per key POSTs to
      <code>/action/key-changer/key/G</code>; <code>/action/key-changer/up</code>,
      <code>/down</code> and <code>/reset</code> do the rest. To light the current key up, poll
      <code>/state/key-changer</code> and compare <code>currentKey</code> against the button.
    </p>
  </Panel>
</div>

<style>
  .module {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
    overflow-y: auto;
  }

  .empty {
    margin: 0;
    color: var(--text-faint);
    font-size: 0.9rem;
  }

  .song {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .song-name {
    font-size: 1.1rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .key-readout {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .key-badge {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius);
    background: var(--secondary-soft);
    color: var(--text);
    font-size: 1.05rem;
    font-weight: 700;
  }

  .key-source {
    color: var(--text-faint);
    font-size: 0.82rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: var(--space-2);
  }

  .key {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: var(--space-3) var(--space-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--primary-lighter);
    color: var(--text);
    font-family: var(--font);
    cursor: pointer;
    transition:
      background var(--transition),
      border-color var(--transition);
  }

  .key:hover:not(:disabled) {
    background: var(--focus);
  }

  .key:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* FreeShow marks selection with a --secondary outline, never an accent bar */
  .key.current {
    border-color: var(--secondary);
    background: var(--secondary-soft);
  }

  .key.original {
    border-color: var(--secondary-opacity);
  }

  .key-label {
    font-size: 1.05rem;
    font-weight: 600;
  }

  .key-step {
    min-height: 1em;
    font-size: 0.72rem;
    color: var(--text-faint);
  }

  .status {
    margin: var(--space-3) 0 0;
    font-size: 0.85rem;
  }

  .status.busy {
    color: var(--text-dim);
  }

  .status.error {
    color: var(--danger);
  }

  .preview {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-top: var(--space-4);
    padding-top: var(--space-3);
    border-top: 1px solid var(--line);
    font-family: var(--font-mono);
    font-size: 0.85rem;
  }

  .chord {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .chord-from {
    color: var(--text-faint);
  }

  .chord-arrow {
    color: var(--text-faint);
  }

  .chord-to {
    color: var(--text);
    font-weight: 600;
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
    font-size: 0.9rem;
  }

  .row-label {
    color: var(--text-dim);
  }

  .port {
    width: 6rem;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--primary-darker);
    color: var(--text);
    font-family: var(--font-mono);
  }

  .running {
    color: var(--connected);
    font-size: 0.82rem;
  }

  .hint {
    margin: 0;
    color: var(--text-faint);
    font-size: 0.82rem;
    line-height: 1.5;
  }

  .hint code {
    padding: 1px 4px;
    border-radius: var(--radius);
    background: var(--primary-darker);
    font-family: var(--font-mono);
    font-size: 0.78rem;
  }
</style>
