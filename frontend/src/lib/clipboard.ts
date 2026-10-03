import { z } from 'zod';
import { ArchitectureError, clone, componentSchema } from './domain';
import type { ArchitectureDocument, Component } from './domain';
import type { EditorState } from './editor';

const clipboardSchema = z.strictObject({ kind: z.literal('sysd-component'), version: z.literal(1), component: componentSchema });

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
  let suffix = ' copy', number = 1;
  const label = (): string => [...copied.label].slice(0, 120 - suffix.length).join('').trimEnd() + suffix;
  while (document.nodes.some((item) => item.label === label())) suffix = ' copy ' + ++number;
  return componentSchema.parse({ ...clone(copied), id, label: label(), position: { ...position } });
}
