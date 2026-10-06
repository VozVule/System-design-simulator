import type { Edge, Node } from '@xyflow/svelte';
import type { ArchitectureDocument, Component } from './domain';
import type { NodeMetrics, SimulationFrame } from './simulation';
export type CanvasNode = Node<{ component: Component; outputAvailable: boolean; metrics?: NodeMetrics }, 'component'>;
export function canvasNodes(doc: ArchitectureDocument, selected: readonly string[], frame?: SimulationFrame): CanvasNode[] {
  return doc.nodes.map((component) => ({
    id: component.id, type: 'component', position: { ...component.position },
    data: { component, outputAvailable: component.type !== 'database' && (!(component.type === 'caller_group' || component.type === 'server') || !doc.edges.some((e) => e.source === component.id)), ...(frame ? { metrics: frame.nodes[component.id] } : {}) },
    selected: selected.includes(component.id), ariaLabel: `${component.label} component`,
  }));
}
export function canvasEdges(doc: ArchitectureDocument, selected: readonly string[], frame?: SimulationFrame): Edge[] {
  return doc.edges.map((edge) => ({
    id: edge.id, source: edge.source, target: edge.target, type: 'connection',
    data: frame ? { metrics: frame.edges[edge.id], readonly: true } : {},
    selected: selected.includes(edge.id),
    ariaLabel: `${doc.nodes.find((n) => n.id === edge.source)?.label} to ${doc.nodes.find((n) => n.id === edge.target)?.label} connection`,
  }));
}
