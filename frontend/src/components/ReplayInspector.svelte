<script lang="ts">
  import { ComponentType } from '../lib/domain/component-types';
  import { RoutingPolicy } from '../lib/domain/routing-policies';
  import { ArrowUpRight } from '@lucide/svelte';
  import ComponentIcon from './ComponentIcon.svelte';
  import { isRouterComponent, typeName } from '../lib/domain';
  import { capacityStatus, capacityLabel, capacityPercent } from '../lib/simulation';
  import type { SimulationResult, CallerMetrics, ProcessingMetrics } from '../lib/simulation';
  let { result, step, selected }: { result: SimulationResult; step: number; selected: string[] } = $props();
  const document = $derived(result.snapshot.document), frame = $derived(result.frames[step]);
  const node = $derived(document.nodes.find((node) => selected.length === 1 && node.id === selected[0]));
  const edge = $derived(document.edges.find((edge) => selected.length === 1 && edge.id === selected[0]));
  const metrics = $derived(node ? frame.nodes[node.id] : null);
  const caller = $derived(metrics && 'generated' in metrics ? metrics as CallerMetrics : null);
  const processing = $derived(metrics && 'handled' in metrics ? metrics as ProcessingMetrics : null);
  const status = $derived(node && node.type !== ComponentType.CALLER_GROUP && processing ? capacityStatus(processing.handled, node.capacity_rps) : null);
  const source = $derived(edge ? document.nodes.find((node) => node.id === edge.source) : null);
</script>
<div class="inspector-content replay-inspector" data-testid="replay-inspector">
  {#if node}
    <div class="selected-kind"><ComponentIcon type={node.type} /><span>{typeName(node.type)}</span></div><h2>{node.label}</h2><p class="inspector-intro">This step · Step {step} of {result.snapshot.total_ticks}</p>
    {#if caller && node.type === ComponentType.CALLER_GROUP}
      <div class="metric-section"><h3>Requests</h3><dl class="metric-list"><div><dt>Generated</dt><dd>{caller.generated.toLocaleString()}</dd></div><div><dt>Completed</dt><dd>{caller.completed.toLocaleString()}</dd></div></dl><p class="field-hint">Completed when a successful response reaches this caller.</p></div>
      <div class="metric-section"><h3>Captured configuration</h3><dl class="metric-list"><div><dt>Caller count</dt><dd>{node.caller_count.toLocaleString()}</dd></div><div><dt>Total test RPS</dt><dd>{node.test_rps.toLocaleString()}</dd></div></dl></div>
    {:else if processing && node.type !== ComponentType.CALLER_GROUP && status}
      <div class="capacity-card" data-status={status}><span>Capacity used<strong>{capacityPercent(processing.handled, node.capacity_rps)}</strong></span><span class="capacity-text">{capacityLabel(status)}</span></div>
      <div class="metric-section"><h3>Requests</h3><dl class="metric-list"><div><dt>Received</dt><dd>{processing.received.toLocaleString()}</dd></div><div><dt>Handled</dt><dd>{processing.handled.toLocaleString()}</dd></div><div><dt>Dropped</dt><dd>{processing.dropped.toLocaleString()}</dd></div></dl><p class="field-hint">Overflow drops without a response.</p></div>
      <div class="metric-section"><h3>Responses</h3><dl class="metric-list"><div><dt>Received</dt><dd>{processing.responses_received.toLocaleString()}</dd></div><div><dt>Returned</dt><dd>{processing.responses_returned.toLocaleString()}</dd></div></dl></div>
      <div class="metric-section"><h3>Captured configuration</h3><dl class="metric-list"><div><dt>Maximum RPS</dt><dd>{node.capacity_rps.toLocaleString()}</dd></div>{#if isRouterComponent(node)}<div><dt>Routing policy</dt><dd>{node.routing_policy === RoutingPolicy.WEIGHTED ? 'Weighted split' : 'Round-robin'}</dd></div>{/if}</dl><p class="field-hint">Capacity applies to new requests only. Returning responses use no capacity.</p></div>
    {/if}
  {:else if edge}
    <div class="selected-kind"><ArrowUpRight size={20} /><span>Directed connection</span></div><h2>Connection</h2><p class="inspector-intro">This step · Step {step} of {result.snapshot.total_ticks}</p>
    <div class="metric-section"><h3>Traffic sent · Step {step}</h3><dl class="metric-list"><div class="requests"><dt>Requests →</dt><dd>{frame.edges[edge.id].forwarded.toLocaleString()}</dd></div><div class="responses"><dt>← Responses</dt><dd>{frame.edges[edge.id].returned.toLocaleString()}</dd></div></dl><p class="field-hint">Sent in Step {step}; arrives in Step {step + 1}{step === result.snapshot.total_ticks ? ', beyond this run' : ''}. Responses follow the request’s original path.</p></div>
    <div class="metric-section"><h3>Captured connection</h3><dl class="metric-list"><div><dt>Source</dt><dd>{source?.label}</dd></div><div><dt>Destination</dt><dd>{document.nodes.find((node) => node.id === edge.target)?.label}</dd></div><div><dt>Destination order</dt><dd>{edge.order}</dd></div>{#if source && isRouterComponent(source) && source.routing_policy === RoutingPolicy.WEIGHTED}<div><dt>Relative weight</dt><dd>{edge.weight}</dd></div>{/if}</dl></div>
  {:else}
    <span class="eyebrow">RECORDED SIMULATION</span><h2>Explore your system.</h2><p class="inspector-intro">Select a component or connection to inspect its traffic and captured configuration.</p>
    <div class="metric-section"><h3>This step · Step {step}</h3><dl class="metric-list">{#each [['Generated', frame.counts.generated], ['Completed', frame.counts.completed], ['Dropped', frame.counts.dropped]] as [label, count]}<div><dt>{label}</dt><dd>{count.toLocaleString()}</dd></div>{/each}</dl></div>
  {/if}
  <p class="replay-count-explanation">Counts describe this step. Callers send a new batch each step, so steady traffic can keep the same counts while requests and responses move.</p>
  <section class="whole-run" aria-label="Whole run summary" data-testid="whole-run-summary"><h3>Whole run · {result.snapshot.total_ticks} steps</h3><dl class="metric-list"><div><dt>Generated</dt><dd>{result.summary.generated.toLocaleString()}</dd></div><div><dt>Completed</dt><dd>{result.summary.completed.toLocaleString()}</dd></div><div><dt>Dropped</dt><dd>{result.summary.dropped.toLocaleString()}</dd></div><div><dt>In flight</dt><dd>{result.summary.in_flight.toLocaleString()}</dd></div></dl><p class="field-hint">Final totals stay fixed while you inspect each step. In flight includes active requests and returning responses.</p></section>
</div>
