# Simulation flow and replay

Date: 2026-10-03
Status: Agreed on 2026-10-03 with the consolidated release 1 contract.

## Settled structure

1. Capture the architecture, component configuration, test RPS, and tick count as a fixed run snapshot.
2. Represent components and directed connections as an acyclic graph in the Python backend. No loops or loopbacks.
3. Calculate the run completely in the backend.
4. Return aggregate per-tick frames and whole-run totals.
5. Decode the JSON response once in the frontend. Play/pause/fast-forward selects frames using a playback clock; it does not rerun the simulation.

The DAG describes topology. The tick engine calculates movement. Frames describe the resulting history. Playback controls how quickly that history is displayed. One-hop-per-tick propagation is selected.

## Shared rules

- One tick is one virtual second.
- Default total run length: 60 executed ticks, configurable. Tick 0 is the initial state; frames follow executed ticks 1 through the total.
- Caller groups generate their configured total RPS. Caller-group capacity is unused.
- Processing nodes have per-tick capacity; excess arrivals drop.
- Routers select destinations without inspecting destination health or capacity.
- Weighted splits are deterministic, with fixed-order rounding; no fanout.
- Per processing node: `received = handled + dropped` and `capacity_used = handled / capacity`.
- Counts are aggregate. No individual request traces are retained in release 1.

## Earlier discussion: full-path accounting, not selected

For each tick, inject source traffic and process the DAG in topological order. At each node, sum all traffic from upstream nodes before applying its capacity once. Forward handled traffic according to the configured policy. Downstream nodes handle it in the same tick.

A tick is an accounting window for that second's routed traffic. No per-hop residence delay is introduced. The frontend can illustrate the path while replaying the resulting frame.

With fixed RPS and fixed settings, per-tick values will often repeat. Cumulative counters still increase. Future components such as queues can introduce evolving state if selected and specified in a later release.

## Selected model: advance traffic one hop per tick

For each tick, process each node's current incoming count, enforce its capacity, and schedule handled output as downstream arrivals for the next tick. Keep separate current and next arrival maps, then swap after all nodes have been processed. The release draft applies this boundary to source output too: callers generate on tick 1 and their first destination receives on tick 2.

This deliberately introduces a one-step propagation delay. It is an abstract timing rule, not an estimate of service/query duration. Deeper paths take more ticks to produce terminal completions.

Traffic awaiting its next hop is in flight. Excess arrivals still drop immediately; the next-tick buffers do not retain overflow. Execute exactly the selected total ticks. Callers emit during those ticks; stop at the final tick and report in-flight traffic instead of extending the run automatically.

All processing nodes read only current input. Outputs modify only next input. Merge all current arrivals before applying a node's capacity once. Node iteration order cannot cause multiple-hop traversal within one tick.

The source-edge convention makes the clock uniform. It was accepted with the consolidated release contract: the earlier illustrative comparison injected external caller traffic directly into LB during its generation tick.

## Reference timeline under the release draft

Architecture: `Caller Group → LB → Server → Database`, where Database is terminal under the agreed release 1 role.

- Generate 100 requests every executed tick.
- Capacities: LB 100, Server 60, Database 60.
- Tick 0 is the initial state; tick 1 reports the first completed virtual second.
- A frame reports node work during its tick. In-flight counts describe the boundary after that work.

| Tick | Generated | LB received | Server received / handled / dropped | Database completed | In flight at boundary |
| --- | ---: | ---: | --- | ---: | ---: |
| 0 | 0 | 0 | 0 / 0 / 0 | 0 | 0 |
| 1 | 100 | 0 | 0 / 0 / 0 | 0 | 100 |
| 2 | 100 | 100 | 0 / 0 / 0 | 0 | 200 |
| 3 | 100 | 100 | 100 / 60 / 40 | 0 | 260 |
| 4 | 100 | 100 | 100 / 60 / 40 | 60 | 260 |

After 60 ticks: 6,000 generated, 3,420 completed, 2,320 dropped, 260 in flight.

Global accounting: `generated = terminal completions + dropped + in flight`. Summing handled counts across nodes counts visits, rather than unique completed requests.

## Proposed response shape

Include the fixed graph/configuration snapshot and an ordered frames array. Key node entries by stable component ID, rather than type names, because multiple servers can coexist.

One illustrative frame excerpt:

```json
{
  "tick": 3,
  "nodes": {
    "server": { "received": 100, "handled": 60, "dropped": 40 }
  },
  "edges": {
    "server-to-database": { "forwarded": 60 }
  }
}
```

Capacity comes from the fixed snapshot. Edge forwarding schedules next-tick arrival. Frames also include cumulative generated/completed/dropped counts and boundary in-flight counts.

## Agreed contract

One-hop propagation and default total 60 ticks are settled. The agreed contract in [release-1.md](release-1.md) specifies source timing, terminal completion, rounding, validation, and persistence defaults.
