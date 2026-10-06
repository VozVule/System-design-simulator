import { ComponentType } from '../src/lib/domain/component-types';
import { RoutingPolicy } from '../src/lib/domain/routing-policies';
import { describe, expect, it } from 'vitest';
import { copyComponent, copySelection, duplicateComponent, duplicateSelection, readComponentClipboard, readSelectionClipboard } from '../src/lib/clipboard';
import { newComponent, validateWrite, type ArchitectureDocument } from '../src/lib/domain';
import { editField, newEditor } from '../src/lib/editor';

describe('component clipboard', () => {
  it.each<ComponentType>(Object.values(ComponentType))('copies an immutable %s snapshot and pastes its complete configuration with a fresh ID', (type) => {
    const state = newEditor(), component = newComponent(type, { x: -12.5, y: 80 }, 'original');
    if (component.type === ComponentType.CALLER_GROUP) { component.caller_count = 125; component.test_rps = 0; }
    else { component.capacity_rps = 240; if ('routing_policy' in component) component.routing_policy = RoutingPolicy.WEIGHTED; }
    state.write.document.nodes.push(component);
    const text = copyComponent(state, component.id); component.label = 'Edited after copy';
    const copied = readComponentClipboard(text); if (!copied) throw new Error('Missing copied component');
    const pasted = duplicateComponent(state.write.document, copied, { x: 32, y: 48 }, () => 'fresh');
    expect(pasted).toEqual({ ...copied, id: 'fresh', label: copied.label + ' 2', position: { x: 32, y: 48 } });
    expect(copied.label).not.toBe(component.label); expect(state.write.document.nodes).toHaveLength(1);
    expect(state.write.document.edges).toEqual([]);
  });
  it('numbers repeated copies and copies of numbered or legacy labels without collisions', () => {
    const state = newEditor(), source = newComponent(ComponentType.SERVER, { x: 0, y: 0 }, 'a');
    state.write.document.nodes.push(source);
    const first = duplicateComponent(state.write.document, source, { x: 32, y: 32 }, () => 'b');
    expect(first.label).toBe('Server 2'); state.write.document.nodes.push(first);
    const second = duplicateComponent(state.write.document, first, { x: 64, y: 64 }, () => 'c');
    expect(second.label).toBe('Server 3'); state.write.document.nodes.push(second);
    expect(duplicateComponent(state.write.document, { ...source, label: 'Server Copy 2' }, { x: 96, y: 96 }, () => 'd').label).toBe('Server 4');
  });
  it('protects invalid drafts on the selected component without blocking valid copies of another component', () => {
    let state = newEditor(); state.write.document.nodes.push(newComponent(ComponentType.SERVER, { x: 0, y: 0 }, 'a'), newComponent(ComponentType.DATABASE, { x: 200, y: 0 }, 'b'));
    state = editField(state, 'node:a:capacity_rps', '');
    expect(() => copyComponent(state, 'a')).toThrow('invalid fields'); expect(copyComponent(state, 'b')).toContain(ComponentType.DATABASE);
  });
  it('ignores ordinary text and rejects recognized malformed or unsupported component payloads', () => {
    expect(readComponentClipboard('Hello')).toBeNull(); expect(readComponentClipboard('{"type":"server"}')).toBeNull();
    expect(() => readComponentClipboard('{"kind":"sysd-component","version":2}')).toThrow('unsupported format');
    const state = newEditor(); state.write.document.nodes.push(newComponent(ComponentType.SERVER, { x: 0, y: 0 }, 'a'));
    const invalid = JSON.parse(copyComponent(state, 'a')); invalid.component.capacity_rps = 0;
    expect(() => readComponentClipboard(JSON.stringify(invalid))).toThrow('invalid');
  });
  it('avoids IDs used by both nodes and edges, disambiguates labels, and keeps long Unicode labels valid', () => {
    const state = newEditor(), source = newComponent(ComponentType.SERVER, { x: 0, y: 0 }, 'a'); source.label = '😀'.repeat(120);
    state.write.document.nodes.push(source); state.write.document.edges.push({ id: 'edge', source: 'a', target: 'other', order: 0, weight: 1 });
    const ids = ['a', 'edge', 'b']; const first = duplicateComponent(state.write.document, source, { x: 32, y: 32 }, () => ids.shift()!);
    expect(first.id).toBe('b'); expect([...first.label]).toHaveLength(120); state.write.document.nodes.push(first);
    const second = duplicateComponent(state.write.document, source, { x: 64, y: 64 }, () => 'c');
    expect(second.label).toMatch(/ 3$/); expect([...second.label]).toHaveLength(120); expect(state.write.document.edges).toHaveLength(1);
  });
});

describe('selection clipboard', () => {
  function graph(): ArchitectureDocument {
    const router = newComponent(ComponentType.LOAD_BALANCER, { x: -20.5, y: 10 }, 'router');
    if (router.type === ComponentType.LOAD_BALANCER) { router.routing_policy = RoutingPolicy.WEIGHTED; router.capacity_rps = 320; }
    return { format_version: 1, nodes: [router, newComponent(ComponentType.SERVER, { x: 250, y: 30.5 }, 'app'), newComponent(ComponentType.DATABASE, { x: 500, y: -10 }, 'db'), newComponent(ComponentType.DATABASE, { x: -20.5, y: 280 }, 'external')], edges: [
      { id: 'internal', source: 'router', target: 'app', order: 3, weight: 1.5 },
      { id: 'external-edge', source: 'router', target: 'external', order: 7, weight: 0 },
      { id: 'data', source: 'app', target: 'db', order: 0, weight: 1 },
    ] };
  }
  const selected = ['router', 'app', 'db'];
  function snapshot(): ArchitectureDocument {
    const state = newEditor(); state.write.document = graph();
    return readSelectionClipboard(copySelection(state, selected))!;
  }
  it('copies an immutable group with internal connections and excludes connections to unselected components', () => {
    const state = newEditor(); state.write.document = graph(); const before = JSON.stringify(state);
    const text = copySelection(state, [...selected, 'external-edge']);
    expect(JSON.stringify(state)).toBe(before);
    state.write.document.nodes[0].label = 'Later edit'; state.write.document.edges[0].weight = 0;
    const copied = readSelectionClipboard(text)!;
    expect(copied.nodes.map((node) => node.id)).toEqual(selected);
    expect(copied.edges.map((edge) => edge.id)).toEqual(['internal', 'data']);
    expect(copied.nodes[0].label).toBe('Load Balancer'); expect(copied.edges[0].weight).toBe(1.5);
  });
  it('remaps every node and edge ID, keeps internal wiring, layout, routing order and weights, and leaves the original intact', () => {
    const document = graph(), copied = snapshot(), before = structuredClone(document);
    const collisions = ['router', 'internal', 'new-1', 'new-2', 'new-3', 'new-4', 'new-5'];
    const pasted = duplicateSelection(document, copied, { x: 40, y: 60 }, () => collisions.shift()!);
    expect(document).toEqual(before);
    expect(pasted.nodes.map((node) => node.id)).toEqual(['new-1', 'new-2', 'new-3']);
    expect(pasted.edges).toEqual([
      { ...copied.edges[0], id: 'new-4', source: 'new-1', target: 'new-2' },
      { ...copied.edges[1], id: 'new-5', source: 'new-2', target: 'new-3' },
    ]);
    for (const [index, node] of pasted.nodes.entries()) {
      expect(node.position.x - copied.nodes[index].position.x).toBeCloseTo(60.5);
      expect(node.position.y - copied.nodes[index].position.y).toBeCloseTo(70);
      const { id: _id, label: _label, position: _position, ...configuration } = node;
      const { id: _oldId, label: _oldLabel, position: _oldPosition, ...originalConfiguration } = copied.nodes[index];
      expect(configuration).toEqual(originalConfiguration);
    }
    expect(() => validateWrite({ name: 'Pasted', document: { format_version: 1, nodes: [...document.nodes, ...pasted.nodes], edges: [...document.edges, ...pasted.edges] } })).not.toThrow();
    pasted.nodes[0].label = 'Changed'; pasted.edges[0].weight = 10;
    expect(copied.nodes[0].label).toBe('Load Balancer'); expect(copied.edges[0].weight).toBe(1.5);
  });
  it('supports repeated paste, copying a copy, and paste into another document with distinct numbered labels and IDs', () => {
    let document = graph(); const copied = snapshot(); let id = 0;
    const first = duplicateSelection(document, copied, { x: 50, y: 50 }, () => 'new-' + ++id);
    document = { format_version: 1, nodes: [...document.nodes, ...first.nodes], edges: [...document.edges, ...first.edges] };
    const second = duplicateSelection(document, first, { x: 82, y: 82 }, () => 'new-' + ++id);
    expect(first.nodes.map((node) => node.label)).toEqual(['Load Balancer 2', 'Server 2', 'Database 2']);
    expect(second.nodes.map((node) => node.label)).toEqual(['Load Balancer 3', 'Server 3', 'Database 3']);
    const ids = ['router', 'internal', 'fresh-1', 'fresh-2', 'fresh-3', 'fresh-4', 'fresh-5'];
    const elsewhere = duplicateSelection(newEditor().write.document, copied, { x: 0, y: 0 }, () => ids.shift()!);
    expect(elsewhere.nodes.map((node) => node.id)).toEqual(['fresh-1', 'fresh-2', 'fresh-3']); expect(elsewhere.edges).toHaveLength(2);
  });
  it('blocks invalid drafts on copied nodes or internal edges and permits unrelated invalid drafts', () => {
    let state = newEditor(); state.write.document = graph();
    state = editField(state, 'node:external:capacity_rps', '');
    expect(() => copySelection(state, selected)).not.toThrow();
    state = editField(state, 'edge:internal:weight', '-1'); expect(() => copySelection(state, selected)).toThrow('invalid fields');
    state = editField(state, 'edge:internal:weight', '1.5');
    state = editField(state, 'node:app:capacity_rps', ''); expect(() => copySelection(state, selected)).toThrow('invalid fields');
    expect(() => copySelection(state, ['internal'])).toThrow('Select components');
  });
  it('accepts legacy single components, ignores text, and rejects malformed or invalid group graphs', () => {
    const state = newEditor(); state.write.document = graph();
    expect(readSelectionClipboard(copyComponent(state, 'router'))).toEqual({ format_version: 1, nodes: [state.write.document.nodes[0]], edges: [] });
    expect(readSelectionClipboard('Native text')).toBeNull(); expect(readSelectionClipboard('{"kind":"unrelated"}')).toBeNull();
    const payload = JSON.parse(copySelection(state, selected));
    expect(() => readSelectionClipboard(JSON.stringify({ ...payload, version: 2 }))).toThrow('unsupported format');
    expect(() => readSelectionClipboard(JSON.stringify({ ...payload, document: { ...payload.document, nodes: [] } }))).toThrow('invalid');
    const missing = structuredClone(payload); missing.document.edges[0].target = 'missing';
    expect(() => readSelectionClipboard(JSON.stringify(missing))).toThrow('invalid components or connections');
    const duplicate = structuredClone(payload); duplicate.document.edges[0].id = 'router';
    expect(() => readSelectionClipboard(JSON.stringify(duplicate))).toThrow('invalid components or connections');
    const cycle = structuredClone(payload); cycle.document.edges.push({ id: 'cycle', source: 'app', target: 'router', order: 1, weight: 1 });
    expect(() => readSelectionClipboard(JSON.stringify(cycle))).toThrow('invalid components or connections');
  });
});
