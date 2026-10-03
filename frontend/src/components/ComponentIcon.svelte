<script lang="ts">
  import type { ComponentType } from '../lib/domain';
  let { type, size = 20 }: { type: ComponentType; size?: number } = $props();
</script>
<svg width={size} height={size} viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-component-symbol={type}>
  {#if type === 'caller_group'}
    <rect x="8" y="18" width="84" height="52" rx="6" fill="var(--symbol-fill, none)" />
    <path d="M8 59h84M42 70v14m16-14v14M30 84h40" />
    <path d="M24 32h28m-28 10h46" opacity=".45" />
  {:else if type === 'load_balancer'}
    <rect x="8" y="22" width="84" height="56" rx="8" fill="var(--symbol-fill, none)" />
    <path d="M21 50h22m0 0V35h33M43 50h33M43 50v15h33m-7-37 7 7-7 7m0 1 7 7-7 7m0 1 7 7-7 7" />
  {:else if type === 'gateway'}
    <path d="m50 6 44 44-44 44L6 50Z" fill="var(--symbol-fill, none)" />
    <path d="M31 50h38m-9-9 9 9-9 9" />
  {:else if type === 'server'}
    <rect x="18" y="8" width="64" height="24" rx="5" fill="var(--symbol-fill, none)" />
    <rect x="18" y="38" width="64" height="24" rx="5" fill="var(--symbol-fill, none)" />
    <rect x="18" y="68" width="64" height="24" rx="5" fill="var(--symbol-fill, none)" />
    <path d="M31 20h1m-1 30h1m-1 30h1M54 20h15M54 50h15M54 80h15" />
  {:else}
    <path d="M16 26v52c0 8 15 14 34 14s34-6 34-14V26" fill="var(--symbol-fill, none)" />
    <ellipse cx="50" cy="26" rx="34" ry="14" fill="var(--symbol-fill, none)" />
    <path d="M16 50c0 8 15 14 34 14s34-6 34-14M16 66c0 8 15 14 34 14s34-6 34-14" />
  {/if}
</svg>
