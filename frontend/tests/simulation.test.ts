import { describe, expect, it, vi } from 'vitest';
import { ArchitectureError, clone, equal } from '../src/lib/domain';
import type { ArchitectureDocument, ErrorDetail } from '../src/lib/domain';
import { capacityLabel, capacityStatus, decodeSimulation, HttpSimulation, mapRunIssues, parseTotalSteps, RunRequests } from '../src/lib/simulation';
import type { SimulationInput } from '../src/lib/simulation';
import { PlaybackClock } from '../src/lib/playback';

const document: ArchitectureDocument = {
  format_version: 1,
  nodes: [
    { id: 'caller', type: 'caller_group', label: 'Same label', position: { x: 0, y: 0 }, capacity_rps: null, caller_count: 10, test_rps: 100 },
    { id: 'server', type: 'server', label: 'Same label', position: { x: 250, y: 0 }, capacity_rps: 60 },
  ],
  edges: [{ id: 'edge', source: 'caller', target: 'server', order: 0, weight: 1 }],
};
const submitted: SimulationInput = { document, total_ticks: 3 };
function fixture() {
  return {
    snapshot: clone(submitted),
    frames: [
      { tick: 0, nodes: { caller: { generated: 0, completed: 0 }, server: { received: 0, handled: 0, dropped: 0, responses_received: 0, responses_returned: 0 } }, edges: { edge: { forwarded: 0, returned: 0 } }, counts: { generated: 0, completed: 0, dropped: 0 }, totals: { generated: 0, completed: 0, dropped: 0, in_flight: 0 } },
      { tick: 1, nodes: { caller: { generated: 100, completed: 0 }, server: { received: 0, handled: 0, dropped: 0, responses_received: 0, responses_returned: 0 } }, edges: { edge: { forwarded: 100, returned: 0 } }, counts: { generated: 100, completed: 0, dropped: 0 }, totals: { generated: 100, completed: 0, dropped: 0, in_flight: 100 } },
      { tick: 2, nodes: { caller: { generated: 100, completed: 0 }, server: { received: 100, handled: 60, dropped: 40, responses_received: 0, responses_returned: 60 } }, edges: { edge: { forwarded: 100, returned: 60 } }, counts: { generated: 100, completed: 0, dropped: 40 }, totals: { generated: 200, completed: 0, dropped: 40, in_flight: 160 } },
      { tick: 3, nodes: { caller: { generated: 100, completed: 60 }, server: { received: 100, handled: 60, dropped: 40, responses_received: 0, responses_returned: 60 } }, edges: { edge: { forwarded: 100, returned: 60 } }, counts: { generated: 100, completed: 60, dropped: 40 }, totals: { generated: 300, completed: 60, dropped: 80, in_flight: 160 } },
    ],
    summary: { generated: 300, completed: 60, dropped: 80, in_flight: 160 },
  };
}

describe('complete simulation result boundary', () => {
  it('retains distinct forward and return metrics, silent drops, caller completion, and all three scopes', () => {
    const result = decodeSimulation(fixture(), submitted);
    expect(result.frames[2].nodes.caller).toEqual({ generated: 100, completed: 0 });
    expect(result.frames[2].nodes.server).toEqual({ received: 100, handled: 60, dropped: 40, responses_received: 0, responses_returned: 60 });
    expect(result.frames[2].edges.edge).toEqual({ forwarded: 100, returned: 60 });
    expect(result.frames[3].counts).toEqual({ generated: 100, completed: 60, dropped: 40 });
    expect(result.frames[3].totals).toEqual({ generated: 300, completed: 60, dropped: 80, in_flight: 160 });
    expect(result.frames[0].totals.generated).toBe(0); expect(result.summary.generated).toBe(300);
    expect(Object.keys(result.frames[3].nodes.caller)).toEqual(['generated', 'completed']);
  });
  it('owns a deeply immutable result and snapshot with stable IDs despite duplicate labels', () => {
    const raw = fixture(), result = decodeSimulation(raw, submitted);
    raw.snapshot.document.nodes[0].label = 'Later work'; raw.frames[1].edges.edge.forwarded = 0;
    expect(result.snapshot.document.nodes[0].label).toBe('Same label'); expect(result.frames[1].edges.edge.forwarded).toBe(100);
    expect(Object.isFrozen(result.snapshot.document.nodes[0])).toBe(true); expect(Object.isFrozen(result.frames[1].edges.edge)).toBe(true);
    expect(() => { result.frames[1].edges.edge.forwarded = 50; }).toThrow();
  });
  it.each([
    ['missing frame', (value: ReturnType<typeof fixture>) => { value.frames.pop(); }],
    ['duplicate tick', (value: ReturnType<typeof fixture>) => { value.frames[2].tick = 1; }],
    ['missing node', (value: ReturnType<typeof fixture>) => { delete (value.frames[2].nodes as Record<string, unknown>).caller; }],
    ['extra edge', (value: ReturnType<typeof fixture>) => { Object.assign(value.frames[2].edges, { extra: { forwarded: 0, returned: 0 } }); }],
    ['caller processing shape', (value: ReturnType<typeof fixture>) => { Object.assign(value.frames[2].nodes.caller, { handled: 0 }); }],
    ['processing caller shape', (value: ReturnType<typeof fixture>) => { Object.assign(value.frames[2].nodes.server, { generated: 0 }); }],
    ['unsafe number', (value: ReturnType<typeof fixture>) => { value.frames[2].edges.edge.returned = Number.MAX_SAFE_INTEGER + 1; }],
    ['negative', (value: ReturnType<typeof fixture>) => { value.frames[2].counts.dropped = -1; }],
    ['fractional', (value: ReturnType<typeof fixture>) => { value.frames[2].counts.dropped = 0.5; }],
    ['unknown metric', (value: ReturnType<typeof fixture>) => { Object.assign(value.frames[2].edges.edge, { failed: 0 }); }],
    ['mismatched snapshot', (value: ReturnType<typeof fixture>) => { value.snapshot.document.nodes[0].position.x = 1; }],
    ['mismatched length', (value: ReturnType<typeof fixture>) => { value.snapshot.total_ticks = 2; }],
    ['nonzero initial frame', (value: ReturnType<typeof fixture>) => { value.frames[0].nodes.server.responses_received = 1; }],
    ['wrong summary', (value: ReturnType<typeof fixture>) => { value.summary.completed = 61; }],
    ['invalid request accounting', (value: ReturnType<typeof fixture>) => { value.frames[2].nodes.server.received = 101; }],
    ['capacity exceeded', (value: ReturnType<typeof fixture>) => { value.frames[2].nodes.server.handled = 61; value.frames[2].nodes.server.dropped = 39; }],
    ['early completion', (value: ReturnType<typeof fixture>) => { value.frames[2].nodes.caller.completed = 60; }],
    ['wrong return arrival', (value: ReturnType<typeof fixture>) => { value.frames[2].nodes.server.responses_received = 60; }],
    ['wrong global totals', (value: ReturnType<typeof fixture>) => { value.frames[2].totals.generated = 100; }],
    ['wrong boundary inventory', (value: ReturnType<typeof fixture>) => { value.frames[2].totals.in_flight = 100; }],
  ])('rejects %s instead of filling omitted values', (_label, mutate) => {
    const value = fixture(); mutate(value); expect(() => decodeSimulation(value, submitted)).toThrow('invalid simulation result');
  });
  it('detects exact arithmetic violations even when floating-point sums round to a safe operand', () => {
    const value = fixture(); value.frames[3].totals.generated = Number.MAX_SAFE_INTEGER;
    value.frames[3].totals.completed = Number.MAX_SAFE_INTEGER; value.frames[3].totals.dropped = 1; value.frames[3].totals.in_flight = 0;
    expect(() => decodeSimulation(value, submitted)).toThrow();
  });
});

describe('presentation state', () => {
  it('uses exact thresholds with large safe counts; response work cannot affect capacity', () => {
    expect(capacityStatus(79, 100)).toBe('normal'); expect(capacityStatus(80, 100)).toBe('near'); expect(capacityStatus(99, 100)).toBe('near'); expect(capacityStatus(100, 100)).toBe('full');
    const capacity = 9_007_199_254_740_989, boundary = 7_205_759_403_792_791;
    expect(capacityStatus(boundary, capacity)).toBe('normal'); expect(capacityStatus(boundary + 1, capacity)).toBe('near');
    expect(capacityLabel(capacityStatus(60, 60))).toBe('At capacity');
  });
  it('keeps run length safe and independent of document/name state', () => {
    for (const value of ['', '0', '-1', '1.5', 'Infinity', '9007199254740992']) expect(parseTotalSteps(value)).toBeNull();
    expect(parseTotalSteps('60')).toBe(60); expect(parseTotalSteps(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
    const edited = clone(document); edited.nodes[0].position.y++; expect(equal(document, edited)).toBe(false);
    edited.nodes[0].position.y--; expect(equal(document, edited)).toBe(true);
  });
  it('maps captured pointers by ID, assigns only unchanged fields, and does not affect Save validation', () => {
    const current = clone(document); current.nodes.reverse();
    const details: ErrorDetail[] = [{ location: 'body', path: '/document/nodes/1/capacity_rps', code: 'invalid_value', message: 'Use a positive capacity.' }, { location: 'body', path: '/document/nodes/0', code: 'missing_destination', message: 'Connect this caller.' }];
    const issues = mapRunIssues(details, document, current);
    expect(issues[0]).toMatchObject({ id: 'server', field: 'node:server:capacity_rps' }); expect(issues[1]).toMatchObject({ id: 'caller' });
    current.nodes[0].capacity_rps = 70; expect(mapRunIssues(details, document, current)[0].field).toBeUndefined();
    current.nodes.shift(); expect(mapRunIssues(details, document, current)[0].id).toBeUndefined();
    expect(details[0].path).toBe('/document/nodes/1/capacity_rps');
  });
});

describe('request lifecycle and HTTP adapter', () => {
  it('rejects cancelled and abandoned-context responses without replacing prior results', () => {
    const gate = new RunRequests(), first = gate.begin(document, 3), edits = clone(document); edits.nodes[0].label = 'Later edit';
    expect(first.input.document.nodes[0].label).toBe('Same label'); expect(gate.accepts(first)).toBe(true); expect(() => gate.begin(edits, 3)).toThrow();
    gate.cancel(); expect(first.controller.signal.aborted).toBe(true); expect(gate.accepts(first)).toBe(false);
    const second = gate.begin(edits, 3); gate.reset(); expect(gate.accepts(second)).toBe(false);
    const third = gate.begin(document, 3); gate.finish(second); expect(gate.accepts(third)).toBe(true); gate.finish(third); expect(gate.pending).toBeNull();
  });
  it('POSTs only current captured document and ticks, decodes once, and has no library timeout', async () => {
    vi.useFakeTimers();
    let release!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => { release = resolve; }));
    const controller = new AbortController(), operation = new HttpSimulation('http://localhost:8000/', fetcher).run(submitted, controller.signal);
    await vi.advanceTimersByTimeAsync(11_000); expect(controller.signal.aborted).toBe(false);
    const response = new Response(JSON.stringify(fixture()), { status: 200 }); const json = vi.spyOn(response, 'json'); release(response);
    const result = await operation; expect(json).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('http://localhost:8000/api/v1/simulations'); expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string)).toEqual(submitted);
    const clock = new PlaybackClock(3, () => 0); clock.play(); clock.seek(2); clock.replay(); expect(result.frames[2].totals.completed).toBe(0); expect(fetcher).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it('reports readiness details, transport failures, malformed responses, and cancellation', async () => {
    const controller = new AbortController();
    const readiness = new HttpSimulation('', vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ error: { code: 'validation_error', message: 'Not ready.', details: [{ location: 'body', path: '/document/nodes/1', code: 'unreachable_component', message: 'Connect this component.' }] } }), { status: 422 })));
    await expect(readiness.run(submitted, controller.signal)).rejects.toBeInstanceOf(ArchitectureError);
    await expect(new HttpSimulation('', vi.fn<typeof fetch>(async () => { throw new Error('Offline'); })).run(submitted, controller.signal)).rejects.toThrow('Could not reach');
    await expect(new HttpSimulation('', vi.fn<typeof fetch>(async () => new Response('{'))).run(submitted, controller.signal)).rejects.toThrow('invalid simulation result');
    controller.abort(); await expect(new HttpSimulation('', vi.fn<typeof fetch>(async () => { throw new Error('Aborted'); })).run(submitted, controller.signal)).rejects.toThrow('Run cancelled');
  });
});

describe('monotonic recorded-frame playback', () => {
  it('handles delayed callbacks, pause/resume, speed changes, stepping, visibility, and final frame without simulation work', () => {
    let now = 0; const clock = new PlaybackClock(60, () => now);
    clock.play(); now = 3_450; expect(clock.update()).toBe(3);
    clock.pause(); now = 50_000; expect(clock.update()).toBe(3); clock.play(); now += 500; expect(clock.update()).toBe(3); now += 500; expect(clock.update()).toBe(4);
    clock.setSpeed(4); now += 500; expect(clock.update()).toBe(6);
    clock.seek(9); expect(clock.playing).toBe(false); clock.play(); now += 250; expect(clock.update()).toBe(10);
    clock.hidden(); now += 10_000; expect(clock.update()).toBe(10); expect(clock.playing).toBe(false);
    clock.setSpeed(8); clock.play(); now += 20_000; expect(clock.update()).toBe(60); expect(clock.playing).toBe(false);
    clock.seek(-9); expect(clock.step).toBe(0); clock.seek(90); expect(clock.step).toBe(60);
    clock.replay(); expect(clock.step).toBe(0); expect(clock.playing).toBe(true); now += 125; expect(clock.update()).toBe(1);
  });

  it('keeps within-step progress on pause, resume, and speed changes', () => {
    let now = 0; const clock = new PlaybackClock(4, () => now);
    clock.play(); now = 350; clock.pause();
    expect(clock.step).toBe(0); expect(clock.progress).toBeCloseTo(0.35); expect(clock.playing).toBe(false);
    now = 10_350; expect(clock.update()).toBe(0); expect(clock.progress).toBeCloseTo(0.35);
    clock.play(); now = 10_550; expect(clock.update()).toBe(0); expect(clock.progress).toBeCloseTo(0.55);
    now = 10_575; clock.setSpeed(4); expect(clock.progress).toBeCloseTo(0.575);
    now = 10_675; expect(clock.update()).toBe(0); expect(clock.progress).toBeCloseTo(0.975);
    now = 10_700; expect(clock.update()).toBe(1); expect(clock.progress).toBeCloseTo(0.075);
    clock.seek(2); expect(clock.step).toBe(2); expect(clock.progress).toBe(0); expect(clock.playing).toBe(false);
  });

  it('catches up continuous progress after a delayed callback and stops at the final boundary', () => {
    let now = 0; const clock = new PlaybackClock(4, () => now);
    clock.play(); now = 1_250; clock.play(); expect(clock.update()).toBe(1); expect(clock.progress).toBeCloseTo(0.25);
    now = 3_900; expect(clock.update()).toBe(3); expect(clock.progress).toBeCloseTo(0.9);
    now = 12_000; expect(clock.update()).toBe(4); expect(clock.progress).toBe(0); expect(clock.playing).toBe(false);
    clock.replay(); expect(clock.step).toBe(0); expect(clock.progress).toBe(0); expect(clock.playing).toBe(true);
    now = 12_250; expect(clock.update()).toBe(0); expect(clock.progress).toBeCloseTo(0.25);
    clock.hidden(); now = 20_000; expect(clock.update()).toBe(0); expect(clock.progress).toBeCloseTo(0.25); expect(clock.playing).toBe(false);
  });
});
