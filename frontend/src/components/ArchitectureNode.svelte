<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte';
  import type { NodeProps } from '@xyflow/svelte';
  import type { CanvasNode } from '../lib/canvas';
  import { catalog, typeName } from '../lib/domain';
  import ComponentIcon from './ComponentIcon.svelte';
  let { data, selected }: NodeProps<CanvasNode> = $props();
  const node = $derived(data.component);
  const color = $derived(catalog.find((item) => item.type === node.type)?.color ?? '#666');
</script>
<div class="architecture-node" class:chosen={selected} style:--component-color={color} data-testid={'component-' + node.id}>
  {#if node.type !== 'caller_group'}<Handle type="target" position={Position.Left} aria-label={'Input for ' + node.label} />{/if}
  <div class="node-heading"><span class="node-icon"><ComponentIcon type={node.type} /></span><span class="node-type">{typeName(node.type)}</span></div>
  <div class="node-label">{node.label}</div>
  <div class="node-summary">{#if node.type === 'caller_group'}<strong>{node.test_rps.toLocaleString()}</strong> total RPS{:else}<strong>{node.capacity_rps.toLocaleString()}</strong> max RPS{/if}</div>
  {#if node.type !== 'database'}<Handle type="source" position={Position.Right} isConnectable={data.outputAvailable} aria-label={'Output for ' + node.label} />{/if}
</div>
