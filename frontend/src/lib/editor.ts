import { ArchitectureError, clone, equal, validateWrite } from './domain';
import type { Architecture, ArchitectureWrite } from './domain';

export interface EditorState {
  write: ArchitectureWrite;
  id: string | null;
  baseline: ArchitectureWrite;
  drafts: Record<string, string>;
  errors: Record<string, string>;
}
export function newEditor(): EditorState {
  const write: ArchitectureWrite = { name: 'Untitled architecture', document: { format_version: 1, nodes: [], edges: [] } };
  return { write, id: null, baseline: clone(write), drafts: {}, errors: {} };
}
export function openEditor(resource: Architecture): EditorState {
  const write = { name: resource.name, document: clone(resource.document) };
  return { write, id: resource.id, baseline: clone(write), drafts: {}, errors: {} };
}
export const isDirty = (state: EditorState): boolean => !equal(state.write, state.baseline) || Object.keys(state.errors).length > 0;
export const fieldValue = (state: EditorState, key: string, fallback: string | number): string => state.drafts[key] ?? String(fallback);
export function editField(state: EditorState, key: string, text: string): EditorState {
  const next = { ...state, write: clone(state.write), drafts: { ...state.drafts, [key]: text }, errors: { ...state.errors } };
  delete next.errors[key];
  const [collection, identifier, field] = key.split(':');
  const fail = (message: string): EditorState => { next.errors[key] = message; return next; };
  if (key === 'name' || field === 'label') {
    if (!text.trim() || [...text].length > 120) return fail('Enter a nonblank value of at most 120 characters.');
    if (key === 'name') next.write.name = text;
    else { const node = next.write.document.nodes.find((n) => n.id === identifier); if (node) node.label = text; }
    return next;
  }
  const value = Number(text);
  if (!text.trim() || !Number.isFinite(value)) return fail('Enter a finite number.');
  if (field !== 'x' && field !== 'y' && field !== 'weight') {
    if (!Number.isSafeInteger(value) || value < (field === 'test_rps' ? 0 : 1)) return fail(field === 'test_rps' ? 'Enter a nonnegative safe whole number.' : 'Enter a positive safe whole number.');
  } else if (field === 'weight' && value < 0) return fail('Weight cannot be negative.');
  if (collection === 'node') {
    const node = next.write.document.nodes.find((n) => n.id === identifier);
    if (node) {
      if (field === 'x' || field === 'y') node.position[field] = value;
      else if (field === 'capacity_rps' && node.type !== 'caller_group') node.capacity_rps = value;
      else if (node.type === 'caller_group' && (field === 'caller_count' || field === 'test_rps')) node[field] = value;
    }
  } else if (collection === 'edge' && field === 'weight') {
    const edge = next.write.document.edges.find((e) => e.id === identifier); if (edge) edge.weight = value;
  }
  return next;
}
export function captureSave(state: EditorState): ArchitectureWrite {
  if (Object.keys(state.errors).length) throw new ArchitectureError('validation_error', 'Correct the invalid fields before saving.');
  validateWrite(state.write);
  return clone(state.write);
}
export function finishSave(current: EditorState, captured: ArchitectureWrite, resource: Architecture): EditorState {
  const baseline = { name: resource.name, document: clone(resource.document) }, write = clone(current.write);
  const drafts = { ...current.drafts };
  if (current.write.name === captured.name && !current.errors.name) { write.name = resource.name; delete drafts.name; }
  // A Save commits its captured snapshot; the current working document may have newer edits.
  if (equal(current.write.document, captured.document)) write.document = clone(resource.document);
  return { ...current, id: resource.id, baseline, write, drafts };
}
export function discardEditor(state: EditorState): EditorState {
  return { ...state, write: clone(state.baseline), drafts: {}, errors: {} };
}
export function clearElementDrafts(state: EditorState, removed: string[]): EditorState {
  const keep = ([key]: [string, string]): boolean => !removed.includes(key.split(':')[1]);
  return { ...state, drafts: Object.fromEntries(Object.entries(state.drafts).filter(keep)), errors: Object.fromEntries(Object.entries(state.errors).filter(keep)) };
}
