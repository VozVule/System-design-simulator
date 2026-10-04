<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import { SvelteFlow, Background, BackgroundVariant, MarkerType, MiniMap, useSvelteFlow } from '@xyflow/svelte';
  import type { Edge } from '@xyflow/svelte';
  import { ZoomIn, ZoomOut, Maximize2, MousePointer2, Hand } from '@lucide/svelte';
  import '@xyflow/svelte/dist/style.css';
  import { canvasNodes, canvasEdges } from '../lib/canvas';
  import type { CanvasNode } from '../lib/canvas';
  import type { ArchitectureDocument, ComponentType } from '../lib/domain';
  import ArchitectureNode from './ArchitectureNode.svelte';
  import ArchitectureEdge from './ArchitectureEdge.svelte';
  let { document, selected, selectMode, locked, onmodechange, onselect, onpositions, onconnect, onremove, onadd }: {
    document: ArchitectureDocument; selected: string[]; selectMode: boolean; locked: boolean;
    onmodechange: (selectMode: boolean) => void;
    onselect: (ids: string[]) => void;
    onpositions: (positions: { id: string; x: number; y: number }[]) => void;
    onconnect: (source: string, target: string, oldId?: string) => void;
    onremove: (nodes: string[], edges: string[]) => void;
    onadd: (type: ComponentType, position: { x: number; y: number }) => void;
  } = $props();
  let nodes = $state.raw<CanvasNode[]>([]), edges = $state.raw<Edge[]>([]);
  let element: HTMLDivElement;
  let focusObserver: MutationObserver | null = null, focusId: string | null = null;
  onDestroy(() => focusObserver?.disconnect());
  $effect(() => {
    if (!selected.includes(focusId ?? '')) { focusObserver?.disconnect(); focusObserver = null; focusId = null; }
  });
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
  function zoom(direction: 1 | -1): void {
    // These helpers read the live viewport after Flow initialization. The
    // library's zoomIn/zoomOut shortcuts can capture the initial no-op store.
    void flow.setZoom(Math.max(0.2, Math.min(2, flow.getZoom() * 1.2 ** direction)));
  }
  export function pastePosition(origin: { x: number; y: number }, count: number): { x: number; y: number } {
    const bounds = element.getBoundingClientRect(), position = { x: origin.x + count * 32, y: origin.y + count * 32 };
    const available = (point: { x: number; y: number }): boolean => {
      const screen = flow.flowToScreenPosition(point), end = flow.flowToScreenPosition({ x: point.x + 194, y: point.y + 190 });
      return screen.x >= bounds.left + 2 && screen.y >= bounds.top + 2 && end.x <= bounds.right - 2 && end.y <= bounds.bottom - 2
        && !document.nodes.some((node) => Math.abs(node.position.x - point.x) < 8 && Math.abs(node.position.y - point.y) < 8);
    };
    if (available(position)) return position;
    const middle = center(); if (available(middle)) return middle;
    // An offscreen source or a new document should still get distinct, visible pastes.
    for (let ring = 1; ring <= 8; ring++) for (let x = -ring; x <= ring; x++) for (let y = -ring; y <= ring; y++) {
      if (Math.max(Math.abs(x), Math.abs(y)) !== ring) continue;
      const point = { x: middle.x + x * 32, y: middle.y + y * 32 }; if (available(point)) return point;
    }
    return middle;
  }
  export async function focusComponent(id: string): Promise<void> {
    focusObserver?.disconnect(); await tick(); if (!selected.includes(id)) return;
    focusId = id;
    const ready = (): void => {
      const target = element.querySelector<HTMLElement>(`.svelte-flow__node[data-id="${CSS.escape(id)}"]`);
      // New Flow nodes remain hidden until their measured bounds and handles are ready.
      if (!target || getComputedStyle(target).visibility === 'hidden') return;
      focusObserver?.disconnect(); focusObserver = null; focusId = null;
      target.focus({ preventScroll: true });
    };
    focusObserver = new MutationObserver(ready);
    focusObserver.observe(element, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
    ready();
  }
  function positions(items: CanvasNode[]): void { onpositions(items.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }))); }
  async function selectionChanged(): Promise<void> {
    // Wait for bound nodes and programmatic selections to reach the Flow store.
    await tick();
    onselect([...nodes, ...edges].filter((item) => item.selected).map((item) => item.id));
  }
  function drop(event: DragEvent): void {
    event.preventDefault(); if (locked) return;
    const type = event.dataTransfer?.getData('application/sysd-component');
    if (type === 'caller_group' || type === 'load_balancer' || type === 'gateway' || type === 'server' || type === 'database') onadd(type, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }
  function keydown(event: KeyboardEvent): void {
    if (locked || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement || (event.target instanceof Element && event.target.closest('[contenteditable]:not([contenteditable="false"])'))) return;
    if (event.key === 'Enter' && event.target instanceof Element) {
      const id = event.target.closest('.svelte-flow__node, .svelte-flow__edge')?.getAttribute('data-id');
      if (id) onselect([id]);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault(); onremove(nodes.filter((n) => n.selected).map((n) => n.id), edges.filter((e) => e.selected).map((e) => e.id));
    } else if (event.key.startsWith('Arrow')) {
      positions(flow.getNodes());
    }
  }
</script>
<svelte:window onkeydown={(event) => { if (event.target instanceof window.Node && element?.contains(event.target)) keydown(event); }} />
<div class="canvas" bind:this={element} role="region" aria-label="Architecture canvas" tabindex="-1" ondrop={drop} ondragover={(event) => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; }}>
  <SvelteFlow bind:nodes bind:edges {nodeTypes} {edgeTypes} defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed, color: '#959dac', width: 18, height: 18 } }} minZoom={0.2} maxZoom={2} deleteKey={null} multiSelectionKey="Shift" selectionOnDrag={selectMode && !locked} panOnDrag={selectMode ? [1, 2] : true} elementsSelectable={!locked}
    nodesDraggable={!locked} nodesConnectable={!locked} nodesFocusable={!locked} edgesFocusable={!locked}
    onselectionchange={() => void selectionChanged()}
    onselectionend={() => element.focus({ preventScroll: true })}
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
  <div class="canvas-tools"><button aria-label="Drag mode" title="Drag mode (V)" aria-pressed={!selectMode} onclick={() => onmodechange(false)} disabled={locked}><Hand size={18} /></button><button aria-label="Select mode" title="Select mode (V)" aria-pressed={selectMode} onclick={() => onmodechange(true)} disabled={locked}><MousePointer2 size={18} /></button><span></span><button aria-label="Zoom out" onclick={() => zoom(-1)}><ZoomOut size={18} /></button><button aria-label="Zoom in" onclick={() => zoom(1)}><ZoomIn size={18} /></button><span></span><button aria-label="Fit diagram" onclick={fit}><Maximize2 size={17} /></button></div>
  <div class="canvas-footnote">{selectMode ? 'Drag to select · Shift+click to add' : 'Drag to pan'} · V to switch · Delete to remove</div>
</div>
