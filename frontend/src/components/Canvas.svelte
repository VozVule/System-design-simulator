<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { SvelteFlow, Background, BackgroundVariant, MarkerType, MiniMap, useSvelteFlow } from '@xyflow/svelte';
  import type { Edge } from '@xyflow/svelte';
  import { ZoomIn, ZoomOut, Maximize2, MousePointer2 } from '@lucide/svelte';
  import '@xyflow/svelte/dist/style.css';
  import { canvasNodes, canvasEdges } from '../lib/canvas';
  import type { CanvasNode } from '../lib/canvas';
  import type { ArchitectureDocument, ComponentType } from '../lib/domain';
  import ArchitectureNode from './ArchitectureNode.svelte';
  import ArchitectureEdge from './ArchitectureEdge.svelte';
  let { document, selected, locked, onselect, onpositions, onconnect, onremove, onadd }: {
    document: ArchitectureDocument; selected: string | null; locked: boolean;
    onselect: (id: string | null) => void;
    onpositions: (positions: { id: string; x: number; y: number }[]) => void;
    onconnect: (source: string, target: string, oldId?: string) => void;
    onremove: (nodes: string[], edges: string[]) => void;
    onadd: (type: ComponentType, position: { x: number; y: number }) => void;
  } = $props();
  let nodes = $state.raw<CanvasNode[]>([]), edges = $state.raw<Edge[]>([]);
  let element: HTMLDivElement;
  const flow = useSvelteFlow<CanvasNode>();
  const nodeTypes = { component: ArchitectureNode }, edgeTypes = { connection: ArchitectureEdge };
  $effect(() => {
    const old = untrack(() => nodes);
    nodes = canvasNodes(document, selected).map((node) => ({ ...old.find((n) => n.id === node.id), ...node }));
    edges = canvasEdges(document, selected);
  });
  export function center(): { x: number; y: number } {
    const bounds = element.getBoundingClientRect();
    const position = flow.screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
    return { x: position.x - 97, y: position.y - 90 };
  }
  export async function fit(): Promise<void> {
    await tick();
    if (nodes.length) { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); await flow.fitView({ padding: 0.2, maxZoom: 1, duration: 180 }); }
  }
  function positions(items: CanvasNode[]): void { onpositions(items.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }))); }
  function drop(event: DragEvent): void {
    event.preventDefault(); if (locked) return;
    const type = event.dataTransfer?.getData('application/sysd-component');
    if (type === 'caller_group' || type === 'load_balancer' || type === 'gateway' || type === 'server' || type === 'database') onadd(type, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }
  function keydown(event: KeyboardEvent): void {
    if (locked || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key === 'Enter' && event.target instanceof Element) {
      const id = event.target.closest('.svelte-flow__node, .svelte-flow__edge')?.getAttribute('data-id');
      if (id) onselect(id);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault(); onremove(nodes.filter((n) => n.selected).map((n) => n.id), edges.filter((e) => e.selected).map((e) => e.id));
    } else if (event.key.startsWith('Arrow')) {
      setTimeout(() => positions(nodes), 0);
    }
  }
</script>
<svelte:window onkeydown={(event) => { if (event.target instanceof window.Node && element?.contains(event.target)) keydown(event); }} />
<div class="canvas" bind:this={element} role="region" aria-label="Architecture canvas" ondrop={drop} ondragover={(event) => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; }}>
  <SvelteFlow bind:nodes bind:edges {nodeTypes} {edgeTypes} defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed, color: '#959dac', width: 18, height: 18 } }} minZoom={0.2} maxZoom={2} deleteKey={null} multiSelectionKey={null}
    nodesDraggable={!locked} nodesConnectable={!locked} nodesFocusable={!locked} edgesFocusable={!locked}
    onnodeclick={({ node }) => onselect(node.id)} onedgeclick={({ edge }) => onselect(edge.id)} onpaneclick={() => onselect(null)}
    onnodedrag={({ nodes: moving }) => positions(moving)}
    onbeforeconnect={(edge) => { if (!locked) onconnect(edge.source, edge.target); return false; }}
    onbeforereconnect={(edge, old) => { if (!locked) onconnect(edge.source, edge.target, old.id); return false; }}
    oninit={() => { if (document.nodes.length) void fit(); }}
  >
    <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} />
    <MiniMap pannable zoomable nodeColor="#e2dff5" maskColor="#f5f6f8cc" />
  </SvelteFlow>
  <div class="canvas-tag"><span class="live-dot"></span>Architecture workspace</div>
  {#if !document.nodes.length}<div class="canvas-empty"><div class="empty-diagram"><span></span><i></i><span></span><i></i><span></span></div><h1>Build something that connects.</h1><p>Drag a component onto the canvas,<br />or add one from the palette to get started.</p><span class="empty-hint"><MousePointer2 size={14} /> Your architecture starts here</span></div>{/if}
  <div class="canvas-tools"><button aria-label="Zoom out" onclick={() => flow.zoomOut()}><ZoomOut size={18} /></button><button aria-label="Zoom in" onclick={() => flow.zoomIn()}><ZoomIn size={18} /></button><span></span><button aria-label="Fit diagram" onclick={fit}><Maximize2 size={17} /></button></div>
  <div class="canvas-footnote">Drag to arrange · Scroll to zoom · Delete to remove</div>
</div>
