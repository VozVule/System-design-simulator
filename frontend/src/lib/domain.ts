import { z } from 'zod';

const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const nonnegative = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
const label = z.string().min(1).refine((s) => [...s].length <= 120, 'Use at most 120 characters.').refine((s) => s.trim().length > 0, 'Enter a nonblank value.');
const position = z.strictObject({ x: z.number().finite(), y: z.number().finite() });
const common = { id, label, position };
const routing = z.enum(['round_robin', 'weighted']);
export const componentSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...common, type: z.literal('caller_group'), capacity_rps: z.null(), caller_count: positive, test_rps: nonnegative }),
  z.strictObject({ ...common, type: z.literal('load_balancer'), capacity_rps: positive, routing_policy: routing }),
  z.strictObject({ ...common, type: z.literal('gateway'), capacity_rps: positive, routing_policy: routing }),
  z.strictObject({ ...common, type: z.literal('server'), capacity_rps: positive }),
  z.strictObject({ ...common, type: z.literal('database'), capacity_rps: positive }),
]);
export const connectionSchema = z.strictObject({ id, source: id, target: id, order: nonnegative, weight: z.number().finite().min(0) });
export const documentSchema = z.strictObject({ format_version: z.literal(1), nodes: z.array(componentSchema), edges: z.array(connectionSchema) });
export const writeSchema = z.strictObject({ name: label, document: documentSchema });
const timestamp = z.string().datetime().endsWith('Z');
export const architectureSchema = z.strictObject({ ...writeSchema.shape, id: z.uuidv4(), created_at: timestamp, updated_at: timestamp });
export type Component = z.infer<typeof componentSchema>;
export type ComponentType = Component['type'];
export type Connection = z.infer<typeof connectionSchema>;
export type ArchitectureDocument = z.infer<typeof documentSchema>;
export type ArchitectureWrite = z.infer<typeof writeSchema>;
export type Architecture = z.infer<typeof architectureSchema>;
export type ArchitectureSummary = Omit<Architecture, 'document'> & { format_version: 1 };
export type DetailCode = 'required' | 'unknown_field' | 'invalid_type' | 'invalid_value' | 'unsupported_document_version' | 'duplicate_id' | 'missing_endpoint' | 'duplicate_connection' | 'duplicate_order' | 'self_connection' | 'cycle' | 'forbidden_incoming' | 'too_many_outgoing' | 'forbidden_outgoing';
export interface ErrorDetail { location: 'body' | 'path'; path: string; code: DetailCode; message: string }
export interface ErrorResponse { error: { code: 'validation_error' | 'unsupported_document_version' | 'architecture_not_found' | 'storage_unavailable' | 'internal_error'; message: string; details: ErrorDetail[] } }
export class ArchitectureError extends Error {
  readonly response: ErrorResponse;
  constructor(code: ErrorResponse['error']['code'], message: string, details: ErrorDetail[] = []) {
    super(message); this.name = 'ArchitectureError'; this.response = { error: { code, message, details } };
  }
}
export const catalog: { type: ComponentType; name: string; description: string; color: string }[] = [
  { type: 'caller_group', name: 'Caller Group', description: 'Generate offered traffic', color: '#b77926' },
  { type: 'load_balancer', name: 'Load Balancer', description: 'Distribute across destinations', color: '#6f57d2' },
  { type: 'gateway', name: 'Gateway', description: 'Route incoming requests', color: '#278597' },
  { type: 'server', name: 'Server', description: 'Handle or forward traffic', color: '#4377c5' },
  { type: 'database', name: 'Database', description: 'Complete a traffic path', color: '#41866c' },
];
export const typeName = (type: ComponentType): string => catalog.find((c) => c.type === type)?.name ?? type;
export function newComponent(type: ComponentType, at: { x: number; y: number }, nodeId: string = crypto.randomUUID()): Component {
  const base = { id: nodeId, label: typeName(type), position: at };
  switch (type) {
    case 'caller_group': return { ...base, type, capacity_rps: null, caller_count: 100, test_rps: 100 };
    case 'load_balancer': case 'gateway': return { ...base, type, capacity_rps: 100, routing_policy: 'round_robin' };
    case 'server': case 'database': return { ...base, type, capacity_rps: 100 };
  }
}
export const clone = <T>(value: T): T => structuredClone(value);
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export const equal = (a: unknown, b: unknown): boolean => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export const destinations = (doc: ArchitectureDocument, source: string): Connection[] => doc.edges.filter((e) => e.source === source).sort((a, b) => a.order - b.order);

export function graphIssues(doc: ArchitectureDocument): ErrorDetail[] {
  const issues: ErrorDetail[] = [];
  const issue = (path: string, code: DetailCode, message: string): void => { issues.push({ location: 'body', path: `/document/${path}`, code, message }); };
  const ids = new Set<string>();
  for (const [collection, items] of [['nodes', doc.nodes], ['edges', doc.edges]] as const) items.forEach((item, i) => {
    if (ids.has(item.id)) issue(`${collection}/${i}/id`, 'duplicate_id', 'Each component and connection must have a unique ID.');
    ids.add(item.id);
  });
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  const pairs = new Set<string>(), orders = new Set<string>();
  const outgoing = new Map<string, string[]>(), incoming = new Map<string, number>();
  doc.edges.forEach((edge, i) => {
    for (const field of ['source', 'target'] as const) if (!nodes.has(edge[field])) issue(`edges/${i}/${field}`, 'missing_endpoint', 'A connection endpoint no longer exists.');
    const pair = JSON.stringify([edge.source, edge.target]), order = JSON.stringify([edge.source, edge.order]);
    if (pairs.has(pair)) issue(`edges/${i}`, 'duplicate_connection', 'These components are already connected in this direction.');
    if (orders.has(order)) issue(`edges/${i}/order`, 'duplicate_order', 'Destination order must be unique for this source.');
    pairs.add(pair); orders.add(order);
    if (edge.source === edge.target) issue(`edges/${i}`, 'self_connection', 'A component cannot connect to itself.');
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    const source = nodes.get(edge.source), target = nodes.get(edge.target);
    if (target?.type === 'caller_group') issue(`edges/${i}/target`, 'forbidden_incoming', 'Caller Groups cannot receive connections.');
    if (source?.type === 'database') issue(`edges/${i}/source`, 'forbidden_outgoing', 'Databases are terminal and cannot have outgoing connections.');
  });
  doc.nodes.forEach((node, i) => {
    if ((node.type === 'caller_group' || node.type === 'server') && (outgoing.get(node.id)?.length ?? 0) > 1) issue(`nodes/${i}`, 'too_many_outgoing', `${typeName(node.type)} supports at most one outgoing connection.`);
  });
  const degrees = new Map(doc.nodes.map((n) => [n.id, incoming.get(n.id) ?? 0]));
  const queue = doc.nodes.filter((n) => degrees.get(n.id) === 0).map((n) => n.id);
  let visited = 0;
  for (let index = 0; index < queue.length; index++) {
    visited++;
    for (const target of outgoing.get(queue[index]) ?? []) {
      const remaining = (degrees.get(target) ?? 0) - 1; degrees.set(target, remaining);
      if (remaining === 0) queue.push(target);
    }
  }
  if (visited < doc.nodes.length && doc.edges.every((e) => nodes.has(e.source) && nodes.has(e.target))) issue('edges', 'cycle', 'This connection would create a cycle. Architectures must be acyclic.');
  return issues;
}
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function validateWrite(input: unknown): ArchitectureWrite {
  if (isRecord(input) && isRecord(input.document) && Number.isSafeInteger(input.document.format_version) && input.document.format_version !== 1) throw new ArchitectureError('unsupported_document_version', 'Only document format version 1 is supported.', [{ location: 'body', path: '/document/format_version', code: 'unsupported_document_version', message: 'Unsupported document version.' }]);
  const parsed = writeSchema.safeParse(input);
  if (!parsed.success) throw new ArchitectureError('validation_error', 'Correct the highlighted configuration before saving.', parsed.error.issues.map((i) => ({ location: 'body', path: '/' + i.path.map((p) => String(p).replaceAll('~', '~0').replaceAll('/', '~1')).join('/'), code: i.code === 'unrecognized_keys' ? 'unknown_field' : i.code === 'invalid_type' ? 'invalid_type' : 'invalid_value', message: i.message })));
  const issues = graphIssues(parsed.data.document);
  if (issues.length) throw new ArchitectureError('validation_error', issues[0].message, issues);
  return { ...parsed.data, name: parsed.data.name.trim() };
}
export function validateArchitecture(input: unknown): Architecture {
  if (isRecord(input)) {
    try { validateWrite({ name: input.name, document: input.document }); }
    catch (cause) {
      if (cause instanceof ArchitectureError && cause.response.error.code === 'unsupported_document_version') throw cause;
      throw new ArchitectureError('internal_error', 'A saved architecture is corrupt. Your library has not been changed.');
    }
  }
  const resource = architectureSchema.safeParse(input);
  if (!resource.success) throw new ArchitectureError('internal_error', 'A saved architecture is corrupt or has an unsupported format. Your library has not been changed.');
  return resource.data;
}
export function connect(doc: ArchitectureDocument, source: string, target: string, edgeId: string = crypto.randomUUID(), previousId?: string): ArchitectureDocument {
  const candidate = clone(doc), old = candidate.edges.find((e) => e.id === previousId);
  candidate.edges = candidate.edges.filter((e) => e.id !== previousId);
  const existing = destinations(candidate, source);
  let order = existing.length ? existing[existing.length - 1].order + 1 : 0;
  if (!Number.isSafeInteger(order)) {
    existing.forEach((edge, index) => { edge.order = index; }); order = existing.length;
  }
  const edge = { id: old?.id ?? edgeId, source, target, order: old?.source === source ? old.order : order, weight: old?.weight ?? 1 };
  if (old) candidate.edges.splice(doc.edges.findIndex((e) => e.id === old.id), 0, edge);
  else candidate.edges.push(edge);
  validateWrite({ name: 'Architecture', document: candidate });
  return candidate;
}
export function removeElements(doc: ArchitectureDocument, nodeIds: string[], edgeIds: string[]): ArchitectureDocument {
  return { ...clone(doc), nodes: doc.nodes.filter((n) => !nodeIds.includes(n.id)), edges: doc.edges.filter((e) => !edgeIds.includes(e.id) && !nodeIds.includes(e.source) && !nodeIds.includes(e.target)) };
}
export function reorder(doc: ArchitectureDocument, edgeId: string, direction: -1 | 1): ArchitectureDocument {
  const candidate = clone(doc), edge = candidate.edges.find((e) => e.id === edgeId);
  if (!edge) return candidate;
  const list = destinations(candidate, edge.source), index = list.findIndex((e) => e.id === edgeId), target = index + direction;
  if (target < 0 || target >= list.length) return candidate;
  [list[index], list[target]] = [list[target], list[index]];
  list.forEach((item, i) => { item.order = i; });
  return candidate;
}
export function weightPercent(doc: ArchitectureDocument, edge: Connection): number | null {
  const total = destinations(doc, edge.source).reduce((sum, e) => sum + e.weight, 0);
  // Scale first so large finite weights cannot overflow their sum.
  if (!Number.isFinite(total)) {
    const max = Math.max(...destinations(doc, edge.source).map((e) => e.weight));
    return 100 * (edge.weight / max) / destinations(doc, edge.source).reduce((sum, e) => sum + e.weight / max, 0);
  }
  return total > 0 ? edge.weight / total * 100 : null;
}
