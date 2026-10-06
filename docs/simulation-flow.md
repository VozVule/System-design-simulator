# Simulation flow and replay

Date: 2026-10-03
Updated: 2026-10-06
Status: One-hop rules agreed on 2026-10-03, extended to synchronous request/response flow on 2026-10-06. The user accepted the detailed specifications and requested parallel frontend and backend implementation on 2026-10-06. Implementation and automated/visual verification are complete.

## Settled structure

1. Capture the architecture, component configuration, test RPS, and tick count as a fixed run snapshot.
2. Represent request dependencies as an acyclic graph in the Python backend. Replies follow the traversed connections in reverse without adding reverse architecture edges.
3. Calculate the run completely in the backend.
4. Return aggregate request and response counts per tick, plus whole-run totals.
5. Decode the JSON response once in the frontend. Play/pause/fast-forward selects frames using a playback clock; it does not rerun the simulation.

The DAG describes request topology. The tick engine calculates request and response movement. Frames describe the resulting history. Playback controls how quickly that history is displayed. One-hop-per-tick propagation applies to both directions.

## Shared rules

- One tick is one virtual second.
- Default total run length: 60 executed ticks, configurable. Tick 0 is the initial state; frames follow executed ticks 1 through the total.
- Replay presents ticks as steps and does not show elapsed time. Playback speed controls display pacing only.
- Caller groups generate their configured total RPS. Caller-group capacity is unused.
- Processing capacity applies to new incoming requests. Excess requests drop immediately without processing or a response. Replies pass without another capacity charge; waiting for a reply does not consume a later tick's capacity.
- Routers select destinations without inspecting destination health or capacity.
- Weighted splits are deterministic, with fixed-order rounding; no fanout.
- Per processing node: `received = handled + dropped` and `capacity_used = handled / capacity`.
- Responses have separate received/returned counts. They do not change request capacity use.
- A handled request at a Database or terminal Server starts a reply. A request completes when that reply reaches its Caller Group.
- Counts are aggregate. Internal batches retain caller and route provenance for correct return routing; no individual request traces are returned or retained as run history.
- Dropped traffic is a final simulation outcome, receives no reply, and leaves the active in-flight inventory. Caller timeouts and failure status codes are outside this milestone.

## Earlier discussion: full-path accounting, not selected

For each tick, inject source traffic and process the DAG in topological order. At each node, sum all traffic from upstream nodes before applying its capacity once. Forward handled traffic according to the configured policy. Downstream nodes handle it in the same tick.

A tick is an accounting window for that second's routed traffic. No per-hop residence delay is introduced. The frontend can illustrate the path while replaying the resulting frame.

With fixed RPS and fixed settings, per-tick values will often repeat. Cumulative counters still increase. Future components such as queues can introduce evolving state if selected and specified in a later release.

## Selected model: advance requests and replies one hop per tick

For each tick, process current incoming requests, enforce capacity once after fan-in, and schedule handled output as downstream requests for the next tick. A Database or Server with no outgoing request connection starts a reply instead. Current replies return along the actual traversed path and schedule their next reverse hop for the next tick. Load Balancers and Gateways do not route replies again.

Keep separate request/reply maps for current and next arrivals, then swap after all nodes have been processed. The boundary applies to source output too: callers generate on tick 1 and their first destination receives on tick 2. A newly created reply cannot be received upstream within its creation tick.

This deliberately introduces a one-step propagation delay. It is an abstract timing rule, not an estimate of service/query duration. Deeper paths take more ticks to return a successful response to the caller. A Server receiving a Database reply reports that event and returns the result upstream; application payload transformation is not modeled.

Traffic awaiting its next request or reply hop is in flight. A logical request appears once in that active inventory. Do not count a Server's waiting context as another request. Excess requests still drop immediately; the next-tick buffers do not retain overflow. Execute exactly the selected total ticks. Callers emit during those ticks; stop at the final tick and report active traffic instead of extending the run automatically.

All nodes read only current input in each direction. Outputs modify only next input. Merge current request arrivals before applying capacity once. Retain aggregate caller/route provenance so fan-in cannot send replies to the wrong caller. Node iteration order cannot cause multiple-hop traversal within one tick.

The source-edge convention makes the clock uniform. It was accepted with the consolidated release contract: the earlier illustrative comparison injected external caller traffic directly into LB during its generation tick.

## Reference timeline with synchronous replies

Request architecture: `Caller Group → LB → Server → Database`. Database ends the forward leg and replies through `Server → LB → Caller Group`.

- Generate 100 requests every executed tick.
- Capacities: LB 100, Server 60, Database 60.
- Tick 0 is the initial state; the interface shows Step 0 and omits elapsed-time labels.
- A frame reports node work during its tick. In-flight counts describe the boundary after that work.

| Step | Generated | LB requests received | Server requests received / handled / dropped | Database handled | Server replies received | LB replies received | Caller completed | In flight at boundary |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 0 | 0 | 0 | 0 / 0 / 0 | 0 | 0 | 0 | 0 | 0 |
| 1 | 100 | 0 | 0 / 0 / 0 | 0 | 0 | 0 | 0 | 100 |
| 2 | 100 | 100 | 0 / 0 / 0 | 0 | 0 | 0 | 0 | 200 |
| 3 | 100 | 100 | 100 / 60 / 40 | 0 | 0 | 0 | 0 | 260 |
| 4 | 100 | 100 | 100 / 60 / 40 | 60 | 0 | 0 | 0 | 320 |
| 5 | 100 | 100 | 100 / 60 / 40 | 60 | 60 | 0 | 0 | 380 |
| 6 | 100 | 100 | 100 / 60 / 40 | 60 | 60 | 60 | 0 | 440 |
| 7 | 100 | 100 | 100 / 60 / 40 | 60 | 60 | 60 | 60 | 440 |

After 60 ticks: 6,000 generated, 3,240 completed at callers, 2,320 dropped, and 440 in flight. Database has handled 3,420 requests; those are processing visits, and 180 resulting replies are still on the return leg.

Global accounting: `generated = caller completions + dropped + in flight`. Boundary in flight equals the sum of all edge request forwarding and response returning counts. Summing handled counts across nodes counts visits, rather than unique completed requests.

## Proposed response shape

Include the fixed graph/configuration snapshot and an ordered frames array. Key node entries by stable component ID, rather than type names, because multiple servers can coexist.

One illustrative frame excerpt:

```json
{
  "tick": 5,
  "nodes": {
    "server": { "received": 100, "handled": 60, "dropped": 40, "responses_received": 60, "responses_returned": 60 }
  },
  "edges": {
    "lb-to-server": { "forwarded": 100, "returned": 60 },
    "server-to-database": { "forwarded": 60, "returned": 60 }
  }
}
```

Capacity comes from the fixed snapshot. Edge `forwarded` schedules request arrival at its stored target next tick; `returned` schedules reply arrival at its stored source next tick. Frames also include current and cumulative generated/completed/dropped counts and boundary in-flight counts. Caller entries contain `generated` and `completed`.

## Agreed contract

One-hop propagation and default total 60 ticks are settled. The current contract in [release-1.md](release-1.md) specifies source timing, caller completion, rounding, validation, and persistence defaults. The response amendment is recorded in [ADR 0008](adr/0008-synchronous-request-response-flow.md).

The 2026-10-06 discussion selected Run from the current canvas, including unsaved changes; separate Edit and Replay modes; and a canvas, lower timeline, and selected-component inspector. Every component must be reachable from a Caller Group for Run, while Save continues to allow incomplete diagrams. About 20 components is the expected scale, without a new arbitrary graph-size or run-duration cap. Gateway request-type routing remains future work.

The accepted [backend simulation specification](../specs/backend/simulation-spec.md) defines the tick engine, readiness checks, result accounting, and POST `/api/v1/simulations`. The accepted [frontend replay specification](../specs/frontend/simulation-replay-spec.md) defines snapshot isolation, step controls, metric scopes, and visual acceptance. The layout is accepted; final styling follows the existing editor and requires representative-diagram visual review.
