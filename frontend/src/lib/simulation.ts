import { CapacityStatus } from './domain/capacity-statuses';
import { ComponentType } from './domain/component-types';
import { z } from 'zod';
import { ArchitectureError, clone, documentSchema, equal, errorResponseSchema, graphIssues } from './domain';
import type { ArchitectureDocument, ErrorDetail } from './domain';

export const DEFAULT_TOTAL_STEPS = 60;
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const callerMetrics = z.strictObject({ generated: count, completed: count });
const processingMetrics = z.strictObject({ received: count, handled: count, dropped: count, responses_received: count, responses_returned: count });
const edgeMetrics = z.strictObject({ forwarded: count, returned: count });
const counts = z.strictObject({ generated: count, completed: count, dropped: count });
const totals = z.strictObject({ ...counts.shape, in_flight: count });
const frame = z.strictObject({ tick: count, nodes: z.record(z.string(), z.union([callerMetrics, processingMetrics])), edges: z.record(z.string(), edgeMetrics), counts, totals });
const resultSchema = z.strictObject({ snapshot: z.strictObject({ document: documentSchema, total_ticks: count.min(1) }), frames: z.array(frame), summary: totals });
export type CallerMetrics = z.infer<typeof callerMetrics>;
export type ProcessingMetrics = z.infer<typeof processingMetrics>;
export type NodeMetrics = CallerMetrics | ProcessingMetrics;
export type EdgeMetrics = z.infer<typeof edgeMetrics>;
export type SimulationFrame = z.infer<typeof frame>;
export type SimulationResult = z.infer<typeof resultSchema>;
export interface SimulationInput { document: ArchitectureDocument; total_ticks: number }

const invalid = (): never => { throw new ArchitectureError('internal_error', 'The backend returned an invalid simulation result. Your document and previous result have been kept.'); };
const exactSum = (values: number[]): bigint => values.reduce((sum, value) => sum + BigInt(value), 0n);
const requireEqual = (a: bigint | number, b: bigint | number): void => { if (BigInt(a) !== BigInt(b)) invalid(); };
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
/** Decode once at the transport boundary. Replay reads these frames without calculating traffic. */
export function decodeSimulation(input: unknown, submitted: SimulationInput): SimulationResult {
  const parsed = resultSchema.safeParse(input); if (!parsed.success) return invalid();
  const result = parsed.data, doc = result.snapshot.document;
  if (!equal(result.snapshot, submitted) || graphIssues(doc).length || result.frames.length !== submitted.total_ticks + 1) invalid();
  const nodeIds = doc.nodes.map((node) => node.id).sort(), edgeIds = doc.edges.map((edge) => edge.id).sort();
  const incoming = (id: string) => doc.edges.filter((edge) => edge.target === id);
  const outgoing = (id: string) => doc.edges.filter((edge) => edge.source === id);
  for (const [tick, current] of result.frames.entries()) {
    if (current.tick !== tick || !equal(Object.keys(current.nodes).sort(), nodeIds) || !equal(Object.keys(current.edges).sort(), edgeIds)) invalid();
    const prior = result.frames[tick - 1];
    const generated: number[] = [], completed: number[] = [], dropped: number[] = [];
    for (const node of doc.nodes) {
      const metrics = current.nodes[node.id], ins = incoming(node.id), outs = outgoing(node.id);
      if (node.type === ComponentType.CALLER_GROUP) {
        if (!('generated' in metrics)) invalid();
        const caller = metrics as CallerMetrics;
        generated.push(caller.generated); completed.push(caller.completed);
        if (tick) {
          requireEqual(caller.generated, node.test_rps);
          requireEqual(caller.generated, exactSum(outs.map((edge) => current.edges[edge.id].forwarded)));
          requireEqual(caller.completed, exactSum(outs.map((edge) => prior.edges[edge.id].returned)));
        }
      } else {
        if (!('handled' in metrics)) invalid();
        const work = metrics as ProcessingMetrics; dropped.push(work.dropped);
        requireEqual(work.received, BigInt(work.handled) + BigInt(work.dropped));
        if (work.handled > node.capacity_rps) invalid();
        if (tick) {
          requireEqual(work.received, exactSum(ins.map((edge) => prior.edges[edge.id].forwarded)));
          requireEqual(work.responses_received, exactSum(outs.map((edge) => prior.edges[edge.id].returned)));
        }
        if (outs.length) {
          requireEqual(work.handled, exactSum(outs.map((edge) => current.edges[edge.id].forwarded)));
          requireEqual(work.responses_returned, work.responses_received);
        } else {
          requireEqual(work.responses_received, 0); requireEqual(work.responses_returned, work.handled);
        }
        requireEqual(work.responses_returned, exactSum(ins.map((edge) => current.edges[edge.id].returned)));
      }
    }
    requireEqual(current.counts.generated, exactSum(generated)); requireEqual(current.counts.completed, exactSum(completed)); requireEqual(current.counts.dropped, exactSum(dropped));
    for (const key of ['generated', 'completed', 'dropped'] as const) requireEqual(current.totals[key], BigInt(prior?.totals[key] ?? 0) + BigInt(current.counts[key]));
    requireEqual(current.totals.generated, exactSum([current.totals.completed, current.totals.dropped, current.totals.in_flight]));
    requireEqual(current.totals.in_flight, exactSum(Object.values(current.edges).flatMap((edge) => [edge.forwarded, edge.returned])));
    if (tick === 0 && [...Object.values(current.nodes), ...Object.values(current.edges), current.counts, current.totals].some((metrics) => Object.values(metrics).some((value) => value !== 0))) invalid();
  }
  if (!equal(result.summary, result.frames.at(-1)?.totals)) invalid();
  return freeze(result);
}
export function capacityStatus(handled: number, capacity: number): CapacityStatus {
  return handled === capacity ? CapacityStatus.FULL : BigInt(handled) * 5n >= BigInt(capacity) * 4n ? CapacityStatus.NEAR : CapacityStatus.NORMAL;
}
export const capacityLabel = (status: CapacityStatus): string => ({ [CapacityStatus.NORMAL]: 'Normal', [CapacityStatus.NEAR]: 'Near capacity', [CapacityStatus.FULL]: 'At capacity' })[status];
export const capacityPercent = (handled: number, capacity: number): string => (handled / capacity * 100).toLocaleString(undefined, { maximumFractionDigits: 1 }) + '%';
export function parseTotalSteps(text: string): number | null {
  const value = Number(text); return text.trim() && Number.isSafeInteger(value) && value > 0 ? value : null;
}
export interface RunIssue { message: string; id?: string; field?: string; path: string }
/** Keep Run errors separate from Save/draft validation and bind pointers through captured IDs. */
export function mapRunIssues(details: ErrorDetail[], captured: ArchitectureDocument, current: ArchitectureDocument): RunIssue[] {
  return details.map((detail) => {
    const match = /^\/document\/(nodes|edges)\/(\d+)(?:\/(.*))?$/.exec(detail.path);
    if (!match) return { message: detail.message, path: detail.path };
    const collection = match[1] as 'nodes' | 'edges', old = captured[collection][Number(match[2])];
    const now = current[collection].find((item) => item.id === old?.id), pointer = match[3];
    const read = (item: unknown): unknown => pointer?.split('/').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, item);
    const unchanged = old && now && pointer && equal(read(old), read(now));
    return { path: detail.path, message: `${old && 'label' in old ? old.label : old ? 'Connection' : 'Captured run'}: ${detail.message}`, ...(now ? { id: now.id } : {}), ...(unchanged ? { field: `${collection === 'nodes' ? 'node' : 'edge'}:${old.id}:${pointer.replace('position/', '')}` } : {}) };
  });
}
export class HttpSimulation {
  constructor(private readonly baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000', private readonly fetcher: typeof fetch = (input, init) => fetch(input, init)) {}
  async run(input: SimulationInput, signal: AbortSignal): Promise<SimulationResult> {
    try {
      const response = await this.fetcher(`${this.baseUrl.replace(/\/+$/, '')}/api/v1/simulations`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
      let body: unknown; try { body = await response.json(); } catch { return invalid(); }
      if (!response.ok) {
        const parsed = errorResponseSchema.safeParse(body); if (!parsed.success) return invalid();
        const error = parsed.data.error; throw new ArchitectureError(error.code, error.message, error.details);
      }
      if (response.status !== 200) return invalid();
      return decodeSimulation(body, input);
    } catch (cause) {
      if (signal.aborted) throw new Error('Run cancelled. Your document and previous result have been kept.');
      if (cause instanceof ArchitectureError) throw cause;
      throw new Error('Could not reach the local backend. Your document and previous result have been kept. Start the backend and Run again.');
    }
  }
}
export interface PendingRun { input: SimulationInput; context: number; id: number; controller: AbortController }
export class RunRequests {
  private context = 0; private sequence = 0; pending: PendingRun | null = null;
  begin(document: ArchitectureDocument, total_ticks: number): PendingRun {
    if (this.pending) throw new Error('A simulation is already calculating.');
    return this.pending = { input: freeze(clone({ document, total_ticks })), context: this.context, id: ++this.sequence, controller: new AbortController() };
  }
  accepts(request: PendingRun): boolean { return this.pending === request && request.context === this.context && !request.controller.signal.aborted; }
  finish(request: PendingRun): void { if (this.pending === request) this.pending = null; }
  cancel(): void { this.pending?.controller.abort(); this.pending = null; }
  reset(): void { this.cancel(); this.context++; }
}
