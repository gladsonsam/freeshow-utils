<script lang="ts">
  import { onDestroy } from "svelte";
  import { connectionSettings } from "$lib/core/connectionSettings";
  import { freeshowClient } from "$lib/core/freeshowClient";
  import { stageData } from "$lib/core/stageState";
  import type { StageLine, SlideView } from "$lib/core/types";

  const status = freeshowClient.status;
  const errorMessage = freeshowClient.errorMessage;

  let controlsOpen = $state(true);

  $effect(() => {
    if ($status === "connected") controlsOpen = false;
  });

  onDestroy(() => freeshowClient.disconnect());

  // splits e.g. "C#m7" -> base "C#m", superscript "7"; "B/D#" -> base "B/D#", no superscript
  function formatChord(key: string): { base: string; sup: string; suffix: string } {
    const slashIndex = key.indexOf("/");
    const main = slashIndex >= 0 ? key.slice(0, slashIndex) : key;
    const suffix = slashIndex >= 0 ? key.slice(slashIndex) : "";
    const match = main.match(/^(.*?)(\d+)$/);
    if (match) return { base: match[1], sup: match[2], suffix };
    return { base: main, sup: "", suffix };
  }

  // per-character breakdown so an invisible mirror row can align chord spans above
  // the exact character FreeShow recorded them at
  function buildChordLine(line: StageLine) {
    const chars = [...line.text];
    const inlineChordAt = new Map<number, string>();
    const endChords: string[] = [];
    line.chords.forEach((chord) => {
      if (chord.charIndex < chars.length) inlineChordAt.set(chord.charIndex, chord.label);
      else endChords.push(chord.label);
    });
    return { chars, inlineChordAt, endChords };
  }
</script>

{#snippet slideBlock(slide: SlideView)}
  <div class="block">
    <div class="group-tab" style={slide.color ? `background:${slide.color}` : ""}>
      {slide.group}
    </div>
    <div class="lyrics">
      {#each slide.lines as line}
        {@const built = buildChordLine(line)}
        <div class="lyric-line">
          {#if built.inlineChordAt.size || built.endChords.length}
            <div class="chord-row">
              {#each built.chars as char, i}
                {#if built.inlineChordAt.has(i)}
                  {@const chord = formatChord(built.inlineChordAt.get(i)!)}
                  <span class="chord"
                    >{chord.base}{#if chord.sup}<sup>{chord.sup}</sup>{/if}{chord.suffix}</span
                  >
                {/if}
                <span class="invisible">{char}</span>
              {/each}
              {#each built.endChords as label, i}
                {@const chord = formatChord(label)}
                <span class="chord end" style="transform: translateX(calc({1.4 * (i + 1)}em - 50%));"
                  >{chord.base}{#if chord.sup}<sup>{chord.sup}</sup>{/if}{chord.suffix}</span
                >
              {/each}
            </div>
          {/if}
          <div class="text-row">
            {#each line.spans as span}
              <span style="color:{span.color}">{span.text}</span>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
{/snippet}

<div
  class="stage-tool"
  style={$stageData.background ? `background-image: url(${$stageData.background})` : ""}
>
  <button
    type="button"
    class="controls-toggle"
    onclick={() => (controlsOpen = !controlsOpen)}
    title="Connection settings"
  >
    <span class="dot" class:live={$status === "connected"}></span>
  </button>

  {#if controlsOpen}
    <div class="controls">
      <input
        class="conn-input"
        bind:value={$connectionSettings.host}
        placeholder="host"
        disabled={$status !== "disconnected"}
      />
      <span class="colon">:</span>
      <input
        class="conn-input port"
        bind:value={$connectionSettings.stagePort}
        placeholder="port"
        disabled={$status !== "disconnected"}
      />
      {#if $status === "disconnected" || $status === "no-hook"}
        <button class="button connect-button" onclick={() => freeshowClient.connect()}>Connect</button>
      {:else}
        <button class="button disconnect-button" onclick={() => freeshowClient.disconnect()}>
          {$status === "connecting" ? "Connecting…" : "Disconnect"}
        </button>
      {/if}
      <span class="status-text">{$status}</span>
    </div>
    {#if $errorMessage}
      <div class="error-box">{$errorMessage}</div>
    {/if}
  {/if}

  <div class="stage-card">
    {#if !$stageData.connected}
      <div class="placeholder">
        {$status === "no-hook" ? "Waiting for a Stage Show routing pointer…" : "Not connected."}
      </div>
    {:else}
      <div class="blocks">
        {#if $stageData.current}{@render slideBlock($stageData.current)}{/if}
        {#if $stageData.next}{@render slideBlock($stageData.next)}{/if}
      </div>

      <div class="bottom-bar">
        <div class="pill current-pill">{$stageData.showName || "—"}</div>
        <div class="tab-label">Current</div>
        <div class="clock">{$stageData.clock}</div>
        <div class="tab-label">Next</div>
        <div class="pill next-pill">{$stageData.nextItemName || "—"}</div>
      </div>
    {/if}
  </div>
</div>

<style>
  .stage-tool {
    position: relative;
    height: 100%;
    width: 100%;
    background-color: #000;
    background-size: cover;
    background-position: center;
    padding: 1.5rem;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }

  .controls-toggle {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    z-index: 10;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #6c757d;
  }

  .dot.live {
    background: #2ecc71;
    box-shadow: 0 0 6px #2ecc71;
  }

  .controls {
    position: relative;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 6px;
    padding: 0.5rem;
    margin-bottom: 0.75rem;
    align-self: flex-end;
  }

  .conn-input {
    background: #252526;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    color: #e0e0e0;
    padding: 0.4rem 0.6rem;
    font-size: 0.85rem;
    width: 120px;
  }

  .conn-input.port {
    width: 60px;
  }

  .colon {
    color: #858585;
  }

  .button {
    padding: 0.4rem 1rem;
    border: none;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    color: white;
  }

  .connect-button {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }

  .disconnect-button {
    background: #6c757d;
  }

  .status-text {
    font-size: 0.8rem;
    color: #aaa;
    text-transform: capitalize;
  }

  .error-box {
    background-color: rgba(58, 31, 31, 0.9);
    border: 1px solid #5a2f2f;
    border-radius: 4px;
    padding: 0.6rem 0.9rem;
    color: #ff8a8a;
    font-size: 0.8rem;
    margin-bottom: 0.75rem;
    align-self: flex-end;
    max-width: 360px;
  }

  .stage-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: rgba(0, 0, 0, 0.88);
    border-radius: 12px;
    overflow: hidden;
    min-height: 0;
  }

  .placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #777;
    font-size: 1.1rem;
  }

  .blocks {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .block {
    flex: 1;
    display: flex;
    align-items: stretch;
    min-height: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .block:last-child {
    border-bottom: none;
  }

  .group-tab {
    flex-shrink: 0;
    width: 3.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #444;
    color: #fff;
    font-weight: 700;
    font-size: 1.1rem;
    letter-spacing: 0.02em;
    writing-mode: vertical-rl;
    text-orientation: mixed;
    transform: rotate(180deg);
    text-align: center;
    padding: 0.75rem 0;
  }

  .lyrics {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1.25rem;
    padding: 1.25rem 2rem;
    overflow: hidden;
  }

  .lyric-line {
    position: relative;
  }

  .chord-row {
    position: relative;
    height: 1.3em;
    line-height: 0;
    white-space: nowrap;
  }

  .chord-row .invisible {
    opacity: 0;
    line-height: 0;
    font-size: 2.4rem;
    font-weight: 700;
  }

  .chord-row .chord {
    position: absolute;
    top: 0;
    line-height: 1;
    font-weight: 700;
    font-size: 1.4rem;
    color: #f5b400;
    white-space: nowrap;
  }

  .chord-row .chord sup {
    font-size: 0.65em;
    top: -0.5em;
  }

  .text-row {
    font-size: 2.4rem;
    font-weight: 700;
    line-height: 1.25;
  }

  .bottom-bar {
    flex-shrink: 0;
    display: flex;
    align-items: stretch;
    background: #000;
  }

  .pill {
    display: flex;
    align-items: center;
    padding: 0.6rem 1.25rem;
    font-size: 1.3rem;
    font-weight: 700;
    color: #fff;
  }

  .current-pill {
    background: #4caf50;
  }

  .next-pill {
    background: #2b8fd6;
    flex: 1;
    justify-content: flex-end;
  }

  .tab-label {
    flex-shrink: 0;
    width: 1.8rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    color: #000;
    font-weight: 700;
    font-size: 0.75rem;
    writing-mode: vertical-rl;
    text-orientation: mixed;
    transform: rotate(180deg);
  }

  .clock {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 1.6rem;
    font-weight: 700;
    font-feature-settings: "tnum" 1;
    padding: 0.5rem 1rem;
  }
</style>
