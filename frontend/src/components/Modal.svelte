<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  let { title, oncancel, children }: { title: string; oncancel: () => void; children: Snippet } = $props();
  let dialog: HTMLDialogElement;
  const id = $props.id();
  onMount(() => {
    const previous = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  });
</script>
<dialog bind:this={dialog} aria-labelledby={id} oncancel={(e) => { e.preventDefault(); oncancel(); }}>
  <h2 {id}>{title}</h2>
  {@render children()}
</dialog>
