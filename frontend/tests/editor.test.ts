import { describe, expect, it } from 'vitest';
import { captureSave, clearElementDrafts, discardEditor, editField, finishSave, isDirty, newEditor, openEditor } from '../src/lib/editor';
import { newComponent } from '../src/lib/domain';
import type { Architecture, ArchitectureWrite } from '../src/lib/domain';
const saved = (write: ArchitectureWrite): Architecture => ({ ...structuredClone(write), name: write.name.trim(), id: 'df0748cc-6f1e-48dd-bc32-1a85848a2f32', created_at: '2026-10-03T10:00:00.000Z', updated_at: '2026-10-03T10:00:00.000Z' });
describe('working editor state', () => {
  it('starts pristine and returns clean when content returns to its baseline', () => {
    const initial = newEditor(); expect(isDirty(initial)).toBe(false);
    const changed = editField(initial, 'name', 'New name'); expect(isDirty(changed)).toBe(true);
    expect(isDirty(editField(changed, 'name', initial.write.name))).toBe(false);
  });
  it('keeps invalid text and prevents saving stale valid values', () => {
    const state = newEditor(); state.write.document.nodes.push(newComponent('server', { x: 0, y: 0 }, 'n'));
    const invalid = editField(state, 'node:n:capacity_rps', '');
    expect(invalid.drafts['node:n:capacity_rps']).toBe(''); expect(invalid.write.document.nodes[0].capacity_rps).toBe(100);
    expect(isDirty(invalid)).toBe(true); expect(() => captureSave(invalid)).toThrow('invalid fields');
    expect(editField(invalid, 'node:n:capacity_rps', '60').errors).toEqual({});
  });
  it.each(['0', '-1', '1.5', '9007199254740992', 'Infinity', 'NaN', ''])('rejects invalid caller count input %s', (input) => {
    const state = newEditor(); state.write.document.nodes.push(newComponent('caller_group', { x: 0, y: 0 }, 'n'));
    expect(editField(state, 'node:n:caller_count', input).errors).toHaveProperty('node:n:caller_count');
  });
  it('preserves later edits and adopts the first Save ID', () => {
    let state = editField(newEditor(), 'name', '  Original  '); const captured = captureSave(state);
    state = editField(state, 'name', 'Later'); const finished = finishSave(state, captured, saved(captured));
    expect(finished.write.name).toBe('Later'); expect(finished.baseline.name).toBe('Original'); expect(finished.id).toBeTruthy(); expect(isDirty(finished)).toBe(true);
  });
  it('applies response normalization only to a field unchanged since capture', () => {
    const state = editField(newEditor(), 'name', '  Original  '), captured = captureSave(state);
    const finished = finishSave(state, captured, saved(captured));
    expect(finished.write.name).toBe('Original'); expect(finished.drafts.name).toBeUndefined(); expect(isDirty(finished)).toBe(false);
  });
  it('retains invalid name drafts added while Save was pending', () => {
    let state = newEditor(); const captured = captureSave(state); state = editField(state, 'name', '');
    const finished = finishSave(state, captured, saved(captured));
    expect(finished.drafts.name).toBe(''); expect(isDirty(finished)).toBe(true);
  });
  it('makes Save captures immutable and discards back to the saved baseline', () => {
    let state = openEditor(saved(newEditor().write)); const captured = captureSave(state);
    state = editField(state, 'name', 'Changed'); expect(captured.name).toBe('Untitled architecture');
    expect(discardEditor(state).write.name).toBe('Untitled architecture'); expect(isDirty(discardEditor(state))).toBe(false);
  });
  it('clears only drafts of removed elements', () => {
    const state = newEditor(); state.drafts = { 'node:a:label': '', 'node:b:label': '' }; state.errors = { ...state.drafts };
    expect(clearElementDrafts(state, ['a']).errors).toEqual({ 'node:b:label': '' });
  });
});
