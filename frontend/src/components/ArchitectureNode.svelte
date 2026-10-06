<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte';
  import type { NodeProps } from '@xyflow/svelte';
  import type { CanvasNode } from '../lib/canvas';
  import { catalog, typeName } from '../lib/domain';
  import { capacityStatus, capacityLabel, capacityPercent } from '../lib/simulation';
  import ComponentIcon from './ComponentIcon.svelte';
  let { data, selected }: NodeProps<CanvasNode> = $props();
  const node = $derived(data.component);
  const color = $derived(catalog.find((item) => item.type === node.type)?.color ?? '#666');
  const handleInset = $derived(node.type === 'server' ? '18%' : node.type === 'database' ? '16%' : node.type === 'gateway' ? '6%' : '8%');
  const status = $derived(data.metrics && 'handled' in data.metrics && node.type !== 'caller_group' ? capacityStatus(data.metrics.handled, node.capacity_rps) : null);
</script>
<div class="architecture-node" class:chosen={selected} style:--component-color={color} data-testid={'component-' + node.id}>
  <div class="node-symbol">
    <ComponentIcon type={node.type} size={112} />
    {#if node.type !== 'caller_group'}<Handle type="target" position={Position.Left} style={'left: ' + handleInset} aria-label={'Input for ' + node.label} />{/if}
    {#if node.type !== 'database'}<Handle type="source" position={Position.Right} style={'right: ' + handleInset} isConnectable={data.outputAvailable} aria-label={'Output for ' + node.label} />{/if}
  </div>
  <div class="node-label">{node.label}</div>
  <div class="node-type">{typeName(node.type)}</div>
  <div class="node-summary">{#if node.type === 'caller_group'}<strong>{node.test_rps.toLocaleString()}</strong> total RPS{:else}<strong>{node.capacity_rps.toLocaleString()}</strong> max RPS{/if}</div>
  {#if data.metrics}
    {#if 'generated' in data.metrics}<div class="node-replay-metrics caller"><span>Generated <strong>{data.metrics.generated.toLocaleString()}</strong></span><span>Completed <strong>{data.metrics.completed.toLocaleString()}</strong></span></div>
    {:else if node.type !== 'caller_group' && status}<div class="node-replay-metrics" data-status={status}><span>{capacityLabel(status)} <strong>{capacityPercent(data.metrics.handled, node.capacity_rps)}</strong></span><span>Dropped <strong>{data.metrics.dropped.toLocaleString()}</strong></span></div>{/if}
  {/if}
</div>
