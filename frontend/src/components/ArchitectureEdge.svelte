<script lang="ts">
  import { BaseEdge, EdgeReconnectAnchor, getBezierPath } from '@xyflow/svelte';
  import type { EdgeProps } from '@xyflow/svelte';
  let { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, selected }: EdgeProps = $props();
  const path = $derived(getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })[0]);
</script>
<BaseEdge {id} {path} {markerEnd} style={'stroke-width: ' + (selected ? '2.5' : '1.7') + '; stroke: ' + (selected ? '#6554c9' : '#959dac')} />
{#if selected}
  <EdgeReconnectAnchor type="source" position={{ x: sourceX, y: sourceY }} size={22}><span class="reconnect-dot"></span></EdgeReconnectAnchor>
  <EdgeReconnectAnchor type="target" position={{ x: targetX, y: targetY }} size={22}><span class="reconnect-dot"></span></EdgeReconnectAnchor>
{/if}
