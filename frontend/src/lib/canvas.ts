import type { Edge, Node } from '@xyflow/svelte';
import type { ArchitectureDocument, Component } from './domain';
export type CanvasNode = Node<{ component: Component; outputAvailable: boolean }, 'component'>;
export function canvasNodes(doc: ArchitectureDocument, selected: string | null): CanvasNode[] {
  return doc.nodes.map((component) => ({
    id: component.id, type: 'component', position: { ...component.position },
    data: { component, outputAvailable: component.type !== 'database' && (!(component.type === 'caller_group' || component.type === 'server') || !doc.edges.some((e) => e.source === component.id)) },
    selected: selected === component.id, ariaLabel: `${component.label} component`,
  }));
}
export function canvasEdges(doc: ArchitectureDocument, selected: string | null): Edge[] {
  return doc.edges.map((edge) => ({
    id: edge.id, source: edge.source, target: edge.target, type: 'connection',
    selected: selected === edge.id,
    ariaLabel: `${doc.nodes.find((n) => n.id === edge.source)?.label} to ${doc.nodes.find((n) => n.id === edge.target)?.label} connection`,
  }));
}
