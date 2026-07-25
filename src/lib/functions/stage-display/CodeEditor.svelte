<script lang="ts">
  import { onMount } from "svelte";
  import { EditorView, basicSetup } from "codemirror";
  import { html as htmlLanguage } from "@codemirror/lang-html";
  import { oneDark } from "@codemirror/theme-one-dark";

  let {
    initial,
    onChange,
  }: {
    /** the editor is uncontrolled - `initial` seeds it, `onChange` reports edits */
    initial: string;
    onChange: (value: string) => void;
  } = $props();

  let host = $state<HTMLDivElement | null>(null);

  onMount(() => {
    const view = new EditorView({
      parent: host!,
      doc: initial,
      extensions: [
        basicSetup,
        htmlLanguage(),
        oneDark,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString());
        }),
        EditorView.theme({
          "&": { height: "100%", fontSize: "13px" },
          ".cm-scroller": { fontFamily: "var(--font-mono)" },
        }),
      ],
    });

    return () => view.destroy();
  });
</script>

<div class="code-host" bind:this={host}></div>

<style>
  .code-host {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .code-host :global(.cm-editor) {
    height: 100%;
  }

  .code-host :global(.cm-editor.cm-focused) {
    outline: none;
  }
</style>
