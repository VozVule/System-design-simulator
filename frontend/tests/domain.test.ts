import { ComponentType } from '../src/lib/domain/component-types';
import { describe, expect, it } from 'vitest';
import contract from '../../specs/backend/backend-api.openapi.json';
import { ArchitectureError, clone, connect, destinations, graphIssues, newComponent, removeElements, reorder, validateArchitecture, validateWrite, weightPercent } from '../src/lib/domain';
import { canvasEdges, canvasNodes } from '../src/lib/canvas';
import type { ArchitectureDocument } from '../src/lib/domain';

const doc = (): ArchitectureDocument => ({ format_version: 1, nodes: [newComponent(ComponentType.CALLER_GROUP, { x: -40.5, y: 10 }, 'caller'), newComponent(ComponentType.LOAD_BALANCER, { x: 200, y: 10 }, 'lb'), newComponent(ComponentType.SERVER, { x: 450, y: 10 }, 'a'), newComponent(ComponentType.SERVER, { x: 450, y: 170 }, 'b'), newComponent(ComponentType.DATABASE, { x: 750, y: 90 }, 'db')], edges: [] });
const write = (document: ArchitectureDocument) => ({ name: 'Architecture', document });
const codes = (document: ArchitectureDocument) => graphIssues(document).map((i) => i.code);
describe('saved document contract', () => {
  it('accepts the existing OpenAPI resource example without inventing fields', () => {
    const resource = contract.paths['/api/v1/architectures'].post.responses['201'].content['application/json'].example;
    expect(validateArchitecture(resource)).toEqual(resource);
  });
  it.each(Object.values(ComponentType))('creates a complete %s variant', (type) => {
    const component = newComponent(type, { x: -1.5, y: 3.2 }, 'node');
    expect(validateWrite(write({ format_version: 1, nodes: [component], edges: [] })).document.nodes[0]).toEqual(component);
  });
  it.each([{ nodes: [] }, { nodes: doc().nodes }])('accepts incomplete graphs', ({ nodes }) => expect(validateWrite(write({ format_version: 1, nodes, edges: [] }))).toBeDefined());
  it('preserves weights, array order and sparse destination order through canvas mapping', () => {
    const graph = connect(connect(doc(), 'lb', 'a', 'ea'), 'lb', 'b', 'eb');
    graph.edges[0].order = 9; graph.edges[0].weight = 0; graph.edges[1].order = 2; graph.edges[1].weight = 1.5;
    const before = clone(graph);
    expect(destinations(graph, 'lb').map((e) => e.id)).toEqual(['eb', 'ea']);
    expect(canvasNodes(graph, ['lb'])[1]).toMatchObject({ position: graph.nodes[1].position, selected: true });
    expect(canvasEdges(graph, []).map((e) => e.id)).toEqual(['ea', 'eb']);
    expect(validateWrite(write(graph)).document).toEqual(before);
    expect(graph).toEqual(before);
  });
  it('rejects extra editor metadata rather than serializing it', () => {
    expect(() => validateWrite({ ...write(doc()), selected: 'lb' })).toThrow(ArchitectureError);
    const graph = doc();
    expect(() => validateWrite(write({ ...graph, nodes: [{ ...graph.nodes[0], selected: true }] } as unknown as ArchitectureDocument))).toThrow(ArchitectureError);
  });
  it('reports an unsupported integer format version distinctly', () => {
    expect.assertions(2);
    try { validateWrite({ name: 'x', document: { format_version: 2, nodes: [], edges: [] } }); }
    catch (error) { expect(error).toBeInstanceOf(ArchitectureError); expect((error as ArchitectureError).response.error.code).toBe('unsupported_document_version'); }
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '100', true, null])('rejects invalid processing capacity %s', (capacity) => {
    const node = newComponent(ComponentType.SERVER, { x: 0, y: 0 }, 'node');
    expect(() => validateWrite({ name: 'x', document: { format_version: 1, nodes: [{ ...node, capacity_rps: capacity }], edges: [] } })).toThrow();
  });
  it('accepts zero traffic and safe maximum integers, but forbids nonfinite coordinates and weights', () => {
    const graph = doc(); const caller = graph.nodes[0]; if (caller.type === ComponentType.CALLER_GROUP) { caller.test_rps = 0; caller.caller_count = Number.MAX_SAFE_INTEGER; }
    expect(validateWrite(write(graph))).toBeDefined(); graph.nodes[0].position.x = Infinity;
    expect(() => validateWrite(write(graph))).toThrow();
    const weighted = connect(doc(), 'lb', 'a', 'e'); weighted.edges[0].weight = NaN;
    expect(() => validateWrite(write(weighted))).toThrow();
  });
});

describe('graph commands', () => {
  it('rejects each graph rule with a stable code', () => {
    const graph = connect(doc(), 'lb', 'a', 'e');
    const cases = [
      { edge: { id: 'caller', source: 'lb', target: 'b', order: 1, weight: 1 }, code: 'duplicate_id' },
      { edge: { id: 'x', source: 'lb', target: 'absent', order: 1, weight: 1 }, code: 'missing_endpoint' },
      { edge: { id: 'x', source: 'lb', target: 'a', order: 1, weight: 1 }, code: 'duplicate_connection' },
      { edge: { id: 'x', source: 'lb', target: 'b', order: 0, weight: 1 }, code: 'duplicate_order' },
      { edge: { id: 'x', source: 'b', target: 'b', order: 0, weight: 1 }, code: 'self_connection' },
      { edge: { id: 'x', source: 'a', target: 'lb', order: 0, weight: 1 }, code: 'cycle' },
      { edge: { id: 'x', source: 'a', target: 'caller', order: 0, weight: 1 }, code: 'forbidden_incoming' },
      { edge: { id: 'x', source: 'db', target: 'b', order: 0, weight: 1 }, code: 'forbidden_outgoing' },
    ];
    for (const test of cases) expect(codes({ ...graph, edges: [...graph.edges, test.edge] })).toContain(test.code);
    const first = connect(doc(), 'a', 'db', 'e');
    expect(() => connect(first, 'a', 'b', 'x')).toThrow('at most one');
    expect(first.edges).toHaveLength(1);
  });
  it('permits acyclic merges and multiple caller groups', () => {
    let graph = doc(); graph.nodes.push(newComponent(ComponentType.CALLER_GROUP, { x: 0, y: 100 }, 'second'));
    for (const [source, target, id] of [['caller', 'lb', 'one'], ['second', 'lb', 'two'], ['lb', 'a', 'three'], ['lb', 'b', 'four'], ['a', 'db', 'five'], ['b', 'db', 'six']]) graph = connect(graph, source, target, id);
    expect(graphIssues(graph)).toEqual([]);
  });
  it('removes incident edges atomically and preserves unrelated elements', () => {
    let graph = connect(doc(), 'caller', 'lb', 'e1'); graph = connect(graph, 'lb', 'a', 'e2'); graph = connect(graph, 'b', 'db', 'e3');
    expect(removeElements(graph, ['lb'], []).edges.map((e) => e.id)).toEqual(['e3']);
    expect(removeElements(graph, [], ['e2']).nodes).toEqual(graph.nodes);
  });
  it('redirects a single-output edge after removing its old candidate', () => {
    const graph = connect(doc(), 'caller', 'lb', 'e'); graph.edges[0].weight = 2.5; graph.edges[0].order = 9;
    const redirected = connect(graph, 'caller', 'a', 'unused', 'e');
    expect(redirected.edges[0]).toEqual({ id: 'e', source: 'caller', target: 'a', order: 9, weight: 2.5 });
    expect(graph.edges[0].target).toBe('lb');
  });
  it('retains global edge array order and IDs when reordering destinations', () => {
    const graph = connect(connect(doc(), 'lb', 'a', 'e1'), 'lb', 'b', 'e2');
    const result = reorder(graph, 'e2', -1);
    expect(destinations(result, 'lb').map((e) => e.id)).toEqual(['e2', 'e1']);
    expect(result.edges.map((e) => e.id)).toEqual(['e1', 'e2']);
  });
  it('compacts source orders at the safe integer boundary', () => {
    const graph = connect(doc(), 'lb', 'a', 'e'); graph.edges[0].order = Number.MAX_SAFE_INTEGER;
    expect(connect(graph, 'lb', 'b', 'x').edges.map((e) => e.order)).toEqual([0, 1]);
  });
  it('displays all-zero weights as incomplete and scales very large finite weights', () => {
    const graph = connect(connect(doc(), 'lb', 'a', 'e1'), 'lb', 'b', 'e2');
    graph.edges.forEach((e) => e.weight = 0); expect(weightPercent(graph, graph.edges[0])).toBeNull();
    graph.edges.forEach((e) => e.weight = Number.MAX_VALUE); expect(weightPercent(graph, graph.edges[0])).toBe(50);
  });
});
