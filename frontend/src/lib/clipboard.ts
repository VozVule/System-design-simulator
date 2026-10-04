import { z } from 'zod';
import { ArchitectureError, clone, componentSchema, documentSchema, validateWrite } from './domain';
import type { ArchitectureDocument, Component } from './domain';
import type { EditorState } from './editor';

const clipboardSchema = z.strictObject({ kind: z.literal('sysd-component'), version: z.literal(1), component: componentSchema });
const selectionSchema = z.strictObject({
  kind: z.literal('sysd-selection'), version: z.literal(1),
  document: documentSchema.extend({ nodes: z.array(componentSchema).min(1) }),
});

export function copySelection(state: EditorState, ids: readonly string[]): string {
  const nodes = state.write.document.nodes.filter((node) => ids.includes(node.id));
  if (!nodes.length) throw new ArchitectureError('validation_error', 'Select components to copy.');
  if (nodes.length === 1) return copyComponent(state, nodes[0].id);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = state.write.document.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  const copiedIds = new Set([...nodes, ...edges].map((item) => item.id));
  if (Object.keys(state.errors).some((key) => copiedIds.has(key.split(':')[1]))) {
    throw new ArchitectureError('validation_error', 'Correct this selection’s invalid fields before copying.');
  }
  const document = validateWrite({ name: 'Copied selection', document: { format_version: 1, nodes, edges } }).document;
  return JSON.stringify(selectionSchema.parse({ kind: 'sysd-selection', version: 1, document }));
}

/** Read both group snapshots and previously copied single-component payloads. */
export function readSelectionClipboard(text: string): ArchitectureDocument | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (!value || typeof value !== 'object' || !('kind' in value)) return null;
  if (value.kind === 'sysd-component') {
    const component = readComponentClipboard(text);
    return component ? { format_version: 1, nodes: [component], edges: [] } : null;
  }
  if (value.kind !== 'sysd-selection') return null;
  const parsed = selectionSchema.safeParse(value);
  if (!parsed.success) throw new ArchitectureError('validation_error', 'This copied selection has an invalid or unsupported format. Copy it again.');
  try { return validateWrite({ name: 'Copied selection', document: parsed.data.document }).document; }
  catch { throw new ArchitectureError('validation_error', 'This copied selection has invalid components or connections. Copy it again.'); }
}

export function selectionBounds(copied: ArchitectureDocument): { x: number; y: number; width: number; height: number } {
  const x = Math.min(...copied.nodes.map((node) => node.position.x)), y = Math.min(...copied.nodes.map((node) => node.position.y));
  return { x, y, width: Math.max(...copied.nodes.map((node) => node.position.x)) - x + 194, height: Math.max(...copied.nodes.map((node) => node.position.y)) - y + 190 };
}

export function duplicateSelection(document: ArchitectureDocument, copied: ArchitectureDocument, position: { x: number; y: number }, makeId: () => string = () => crypto.randomUUID()): ArchitectureDocument {
  validateWrite({ name: 'Copied selection', document: copied });
  if (!copied.nodes.length) throw new ArchitectureError('validation_error', 'Select components to copy.');
  const used = new Set([...document.nodes, ...document.edges, ...copied.nodes, ...copied.edges].map((item) => item.id));
  const freshId = (): string => { let id = makeId(); while (used.has(id)) id = makeId(); used.add(id); return id; };
  const origin = selectionBounds(copied), next = clone(document), remapped = new Map<string, string>();
  const nodes = copied.nodes.map((node) => {
    const component = duplicateComponent(next, node, { x: position.x + (node.position.x - origin.x), y: position.y + (node.position.y - origin.y) }, freshId);
    remapped.set(node.id, component.id); next.nodes.push(component); return component;
  });
  const edges = copied.edges.map((edge) => ({ ...clone(edge), id: freshId(), source: remapped.get(edge.source)!, target: remapped.get(edge.target)! }));
  next.edges.push(...edges); validateWrite({ name: 'Architecture', document: next });
  return { format_version: 1, nodes, edges };
}

export function copyComponent(state: EditorState, id: string): string {
  const component = state.write.document.nodes.find((item) => item.id === id);
  if (!component) throw new ArchitectureError('validation_error', 'Select a component to copy.');
  if (Object.keys(state.errors).some((key) => key.startsWith(`node:${id}:`))) throw new ArchitectureError('validation_error', 'Correct this component’s invalid fields before copying.');
  return JSON.stringify(clipboardSchema.parse({ kind: 'sysd-component', version: 1, component }));
}

/** Ordinary text remains available to native text fields; only our versioned payload is a component. */
export function readComponentClipboard(text: string): Component | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (!value || typeof value !== 'object' || !('kind' in value) || value.kind !== 'sysd-component') return null;
  const parsed = clipboardSchema.safeParse(value);
  if (!parsed.success) throw new ArchitectureError('validation_error', 'This copied component has an invalid or unsupported format. Copy it again.');
  return parsed.data.component;
}

export function duplicateComponent(document: ArchitectureDocument, copied: Component, position: { x: number; y: number }, makeId: () => string = () => crypto.randomUUID()): Component {
  const used = new Set([...document.nodes, ...document.edges].map((item) => item.id));
  let id = makeId(); while (used.has(id)) id = makeId();
  const base = copied.label.replace(/(?: copy(?: \d+)?| \d+)$/i, '').trimEnd() || copied.label;
  let number = 2;
  const label = (): string => {
    const suffix = ' ' + number;
    return [...base].slice(0, 120 - suffix.length).join('').trimEnd() + suffix;
  };
  while (document.nodes.some((item) => item.label === label())) number++;
  return componentSchema.parse({ ...clone(copied), id, label: label(), position: { ...position } });
}
