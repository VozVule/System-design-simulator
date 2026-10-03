import { describe, expect, it } from 'vitest';
import { copyComponent, duplicateComponent, readComponentClipboard } from '../src/lib/clipboard';
import { newComponent, type ComponentType } from '../src/lib/domain';
import { editField, newEditor } from '../src/lib/editor';

describe('component clipboard', () => {
  it.each<ComponentType>(['caller_group', 'load_balancer', 'gateway', 'server', 'database'])('copies an immutable %s snapshot and pastes its complete configuration with a fresh ID', (type) => {
    const state = newEditor(), component = newComponent(type, { x: -12.5, y: 80 }, 'original');
    if (component.type === 'caller_group') { component.caller_count = 125; component.test_rps = 0; }
    else { component.capacity_rps = 240; if ('routing_policy' in component) component.routing_policy = 'weighted'; }
    state.write.document.nodes.push(component);
    const text = copyComponent(state, component.id); component.label = 'Edited after copy';
    const copied = readComponentClipboard(text); if (!copied) throw new Error('Missing copied component');
    const pasted = duplicateComponent(state.write.document, copied, { x: 32, y: 48 }, () => 'fresh');
    expect(pasted).toEqual({ ...copied, id: 'fresh', label: copied.label + ' 2', position: { x: 32, y: 48 } });
    expect(copied.label).not.toBe(component.label); expect(state.write.document.nodes).toHaveLength(1);
    expect(state.write.document.edges).toEqual([]);
  });
  it('numbers repeated copies and copies of numbered or legacy labels without collisions', () => {
    const state = newEditor(), source = newComponent('server', { x: 0, y: 0 }, 'a');
    state.write.document.nodes.push(source);
    const first = duplicateComponent(state.write.document, source, { x: 32, y: 32 }, () => 'b');
    expect(first.label).toBe('Server 2'); state.write.document.nodes.push(first);
    const second = duplicateComponent(state.write.document, first, { x: 64, y: 64 }, () => 'c');
    expect(second.label).toBe('Server 3'); state.write.document.nodes.push(second);
    expect(duplicateComponent(state.write.document, { ...source, label: 'Server Copy 2' }, { x: 96, y: 96 }, () => 'd').label).toBe('Server 4');
  });
  it('protects invalid drafts on the selected component without blocking valid copies of another component', () => {
    let state = newEditor(); state.write.document.nodes.push(newComponent('server', { x: 0, y: 0 }, 'a'), newComponent('database', { x: 200, y: 0 }, 'b'));
    state = editField(state, 'node:a:capacity_rps', '');
    expect(() => copyComponent(state, 'a')).toThrow('invalid fields'); expect(copyComponent(state, 'b')).toContain('database');
  });
  it('ignores ordinary text and rejects recognized malformed or unsupported component payloads', () => {
    expect(readComponentClipboard('Hello')).toBeNull(); expect(readComponentClipboard('{"type":"server"}')).toBeNull();
    expect(() => readComponentClipboard('{"kind":"sysd-component","version":2}')).toThrow('unsupported format');
    const state = newEditor(); state.write.document.nodes.push(newComponent('server', { x: 0, y: 0 }, 'a'));
    const invalid = JSON.parse(copyComponent(state, 'a')); invalid.component.capacity_rps = 0;
    expect(() => readComponentClipboard(JSON.stringify(invalid))).toThrow('invalid');
  });
  it('avoids IDs used by both nodes and edges, disambiguates labels, and keeps long Unicode labels valid', () => {
    const state = newEditor(), source = newComponent('server', { x: 0, y: 0 }, 'a'); source.label = '😀'.repeat(120);
    state.write.document.nodes.push(source); state.write.document.edges.push({ id: 'edge', source: 'a', target: 'other', order: 0, weight: 1 });
    const ids = ['a', 'edge', 'b']; const first = duplicateComponent(state.write.document, source, { x: 32, y: 32 }, () => ids.shift()!);
    expect(first.id).toBe('b'); expect([...first.label]).toHaveLength(120); state.write.document.nodes.push(first);
    const second = duplicateComponent(state.write.document, source, { x: 64, y: 64 }, () => 'c');
    expect(second.label).toMatch(/ 3$/); expect([...second.label]).toHaveLength(120); expect(state.write.document.edges).toHaveLength(1);
  });
});
