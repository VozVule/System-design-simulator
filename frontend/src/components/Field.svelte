<script lang="ts">
  let { label, value, error, oninput, numeric = false, hint, compact = false }: {
    label: string; value: string; error?: string; oninput: (text: string) => void; numeric?: boolean; hint?: string; compact?: boolean;
  } = $props();
  const id = $props.id();
</script>
<div class="form-field" class:compact>
  <label for={id}>{label}</label>
  <input {id} {value} inputmode={numeric ? 'decimal' : 'text'} aria-invalid={!!error} aria-describedby={error || hint ? id + '-help' : undefined} oninput={(e) => oninput(e.currentTarget.value)} autocomplete="off" />
  {#if error}<p id={id + '-help'} class="field-error">{error}</p>{:else if hint}<p id={id + '-help'} class="field-hint">{hint}</p>{/if}
</div>
