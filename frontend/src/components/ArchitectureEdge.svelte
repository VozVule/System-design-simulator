<script lang="ts">
  import { getContext } from 'svelte';
  import { BaseEdge, EdgeLabel, EdgeReconnectAnchor, getBezierPath, getSmoothStepPath, useSvelteFlow } from '@xyflow/svelte';
  import type { EdgeProps } from '@xyflow/svelte';
  import type { EdgeMetrics } from '../lib/simulation';
  import type { CanvasNode } from '../lib/canvas';
  import { REPLAY_VIEW, type ReplayView } from '../lib/replay-view';
  let { id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, selected, data }: EdgeProps = $props();
  const flow = useSvelteFlow<CanvasNode>();
  const replay = getContext<ReplayView>(REPLAY_VIEW);
  const metrics = $derived(data?.metrics as EdgeMetrics | undefined);
  const sourceNode = $derived(flow.getNode(source)), targetNode = $derived(flow.getNode(target));
  const vertical = $derived(Math.abs(targetY - sourceY) > Math.abs(targetX - sourceX));
  const detour = $derived(!!metrics && (vertical || targetX <= sourceX));
  const laneGap = 9;
  const offset = $derived(Math.max(80, (targetX - sourceX) / 2 + 20));
  const sourceTop = $derived(sourceNode?.position.y ?? sourceY - 64), targetTop = $derived(targetNode?.position.y ?? targetY - 64);
  const sourceBottom = $derived(sourceTop + (sourceNode?.measured?.height ?? 245)), targetBottom = $derived(targetTop + (targetNode?.measured?.height ?? 245));
  // Vertical paths cross the free gap between complete node bounds. Backward
  // paths go above both symbols, rather than through their labels or badges.
  const centerY = $derived(vertical && sourceBottom < targetTop ? (sourceBottom + targetTop) / 2 : vertical && targetBottom < sourceTop ? (targetBottom + sourceTop) / 2 : Math.min(sourceTop, targetTop) - 42);
  const geometry = $derived(detour
    ? getSmoothStepPath({ sourceX, sourceY: sourceY - laneGap, targetX, targetY: targetY - laneGap, sourcePosition, targetPosition, offset, centerY: centerY - laneGap, borderRadius: 10 })
    : getBezierPath({ sourceX, sourceY: sourceY - (metrics ? laneGap : 0), targetX, targetY: targetY - (metrics ? laneGap : 0), sourcePosition, targetPosition }));
  const path = $derived(geometry[0]);
  const returnPath = $derived((detour
    ? getSmoothStepPath({ sourceX: targetX, sourceY: targetY + laneGap, targetX: sourceX, targetY: sourceY + laneGap, sourcePosition: targetPosition, targetPosition: sourcePosition, offset, centerY: centerY + laneGap, borderRadius: 10 })
    : getBezierPath({ sourceX: targetX, sourceY: targetY + laneGap, targetX: sourceX, targetY: sourceY + laneGap, sourcePosition: targetPosition, targetPosition: sourcePosition }))[0]);
  const labelX = $derived(detour && vertical ? Math.max((sourceNode?.position.x ?? sourceX - 140) + (sourceNode?.measured?.width ?? 194), (targetNode?.position.x ?? targetX - 54) + (targetNode?.measured?.width ?? 194)) + 68 : geometry[1]);
  const labelY = $derived(detour && vertical ? (sourceY + targetY) / 2 : detour ? geometry[2] + 48 : geometry[2] - 54);
  const requestArrowId = $derived('request-arrow-' + id);
  const arrowId = $derived('response-arrow-' + id);
  const direction = $derived(Math.atan2(targetY - sourceY, targetX - sourceX) * 180 / Math.PI);
  const targetLabel = $derived(targetNode?.data.component.label ?? 'destination');
  const sourceLabel = $derived(sourceNode?.data.component.label ?? 'caller');
  const curves = new Map<string, { element: SVGPathElement; length: number }>();
  function position(curve: string, phase: number): { x: number; y: number; angle: number } | null {
    let measured = curves.get(curve);
    if (!measured) {
      const element = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      element.setAttribute('d', curve);
      const length = element.getTotalLength();
      if (!Number.isFinite(length) || length === 0) return null;
      if (curves.size > 3) curves.clear();
      measured = { element, length }; curves.set(curve, measured);
    }
    const distance = measured.length * Math.max(0, Math.min(1, phase));
    const point = measured.element.getPointAtLength(distance);
    const before = measured.element.getPointAtLength(Math.max(0, distance - 1));
    const after = measured.element.getPointAtLength(Math.min(measured.length, distance + 1));
    return { x: point.x, y: point.y, angle: Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI };
  }
  const requestPoint = $derived(metrics?.forwarded ? position(path, replay?.progress ?? 0) : null);
  const responsePoint = $derived(metrics?.returned ? position(returnPath, replay?.progress ?? 0) : null);
</script>
<BaseEdge {id} {path} markerEnd={metrics ? 'url(#' + requestArrowId + ')' : markerEnd} style={metrics ? 'stroke-width: ' + (selected ? 3 : 2) + '; stroke: #4775cd; stroke-opacity: ' + (metrics.forwarded ? 1 : 0.25) + ';' : 'stroke-width: ' + (selected ? '2.5' : '1.7') + '; stroke: ' + (selected ? '#6554c9' : '#959dac')} />
{#if metrics}
  <defs>
    <marker id={requestArrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#4775cd" /></marker>
    <marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#268572" /></marker>
  </defs>
  <path class="response-edge" d={returnPath} fill="none" stroke="#268572" stroke-opacity={metrics.returned ? 1 : 0.25} stroke-width={selected ? 3 : 2} marker-end={'url(#' + arrowId + ')'} pointer-events="none" />
  {#if requestPoint}<g class="traffic-batch request-batch" data-testid={'request-batch-' + id} data-progress={replay?.progress ?? 0} transform={`translate(${requestPoint.x} ${requestPoint.y})`} pointer-events="none" aria-hidden="true"><circle r="9" /><path d="M-3 -4 L2 0 L-3 4" transform={'rotate(' + requestPoint.angle + ')'} /></g>{/if}
  {#if responsePoint}<g class="traffic-batch response-batch" data-testid={'response-batch-' + id} data-progress={replay?.progress ?? 0} transform={`translate(${responsePoint.x} ${responsePoint.y})`} pointer-events="none" aria-hidden="true"><circle r="9" /><path d="M-3 -4 L2 0 L-3 4" transform={'rotate(' + responsePoint.angle + ')'} /></g>{/if}
  <EdgeLabel x={labelX} y={labelY} selectEdgeOnClick class={'edge-traffic-label nodrag nopan' + (selected ? ' selected' : '')} data-testid={'edge-traffic-' + id}>
    <div class="traffic-label-scope">{replay?.step === replay?.total ? 'Final step · in flight' : `Step ${replay?.step ?? 0} → ${(replay?.step ?? 0) + 1}`}</div>
    <div class="traffic-row requests" aria-label={`${metrics.forwarded} requests to ${targetLabel}`}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style:transform={'rotate(' + direction + 'deg)'}><path d="M1 6H10M6 2L10 6L6 10" /></svg><span><b>Requests</b><small title={targetLabel}>to {targetLabel}</small></span><strong>{metrics.forwarded.toLocaleString()}</strong></div>
    <div class="traffic-row responses" aria-label={`${metrics.returned} responses to ${sourceLabel}`}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style:transform={'rotate(' + (direction + 180) + 'deg)'}><path d="M1 6H10M6 2L10 6L6 10" /></svg><span><b>Responses</b><small title={sourceLabel}>to {sourceLabel}</small></span><strong>{metrics.returned.toLocaleString()}</strong></div>
  </EdgeLabel>
{/if}
{#if selected && !data?.readonly}
  <EdgeReconnectAnchor type="source" position={{ x: sourceX, y: sourceY }} size={22}><span class="reconnect-dot"></span></EdgeReconnectAnchor>
  <EdgeReconnectAnchor type="target" position={{ x: targetX, y: targetY }} size={22}><span class="reconnect-dot"></span></EdgeReconnectAnchor>
{/if}
