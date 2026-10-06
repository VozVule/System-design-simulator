# Simulation engine and API specification

Date: 2026-10-06
Status: Accepted by the user and implemented on 2026-10-06, including the synchronous-response amendment. Strict mypy and all 143 backend tests pass, including domain, HTTP, storage-isolation, numeric-safety, and OpenAPI checks. Frontend integration and browser verification also pass.

## Purpose and source decisions

Calculate aggregate request and response movement through the architecture on the current canvas, then return a complete recorded run for frontend replay. A run uses a fixed document snapshot. Save is a separate action; unsaved architectures and unsaved configuration changes can be simulated.

This specification expands [simulation flow](../../docs/simulation-flow.md) and the [release 1 contract](../../docs/release-1.md). The existing [architecture API contract](backend-api-spec.md) remains the source for architecture document fields and Save validation. The companion [frontend replay specification](../frontend/simulation-replay-spec.md) defines presentation and interaction.

The 2026-10-06 discussion confirmed these choices:

- POST the current document and total tick count; Run does not require Save.
- Retain the default of **60 executed ticks**, with an adjustable total tick count.
- Present ticks as **steps** in replay. Do not display elapsed seconds or an estimated request duration.
- Require every component to be reachable from a Caller Group before a run. Incomplete or disconnected documents can still be saved.
- Use approximately **20 components** as the expected design and verification scale. This is a scale target, not a new graph-size validation limit.
- Add no new arbitrary run-duration limit. A complete response still describes a finite, explicitly requested number of ticks.
- Keep Gateway round-robin and weighted routing in release 1. Request types and Gateway matching rules belong to a later release.
- Model the complete synchronous request/response path. A Database replies to its calling Server, and each intermediate component returns the response along the actual request path. Successful completion occurs only when the original Caller Group receives the response.
- Apply capacity only to new forward requests. Responses do not consume capacity, and waiting for a response does not consume a later tick's capacity.
- Discard excess requests immediately. A capacity drop produces no error response, caller timeout, or inferred caller failure status.

These confirmed corrections replace the earlier one-way terminal-completion model in the source documents. Request topology stays acyclic; response movement is implicit on the existing connections in the reverse direction. The source documents' other settled decisions remain applicable.

## Scope

Release 1 includes Caller Group, Load Balancer, Gateway, Server, and Database; directed acyclic request graphs; fixed caller RPS; per-tick request capacity; immediate drops; one-destination request routing; successful responses returned to their original callers; aggregate node and edge counts; whole-run accounting; and a synchronous calculation API.

Request types, individual request inspection, real service or query latency, changing workloads, queues, caching, retries, fanout, health-aware routing, caller timeouts, saved run history, streaming, and background jobs are future work. Database handling starts a successful response; it is an intermediate event rather than completion. A Server with no outgoing request connection starts its own successful response.

A response represents a successful modeled result. The engine records its receipt and return at each component; payload contents, Server data transformation, and application status-code logic are not configurable behavior in this milestone. No extra processing delay is inferred from those application actions.

## Time and propagation

- The engine retains the release contract's accounting tick. Each tick uses the configured requests-per-second and capacity-per-second numbers once. One tick is one modeled second internally; this is an abstract accounting convention.
- The interface calls this a step. Playback pacing is a display setting and does not change traffic, capacity, or propagation.
- Tick 0 is the empty initial state. Execute ticks `1..total_ticks` and return `total_ticks + 1` frames.
- All Caller Groups generate their configured `test_rps` during every executed tick. `caller_count` describes the group and does not multiply its total RPS. Caller capacity is unused.
- Caller output also crosses the next-tick boundary. Generation at tick 1 first reaches the connected component at tick 2.
- Forward requests and reverse responses produced at tick `t` arrive at the next component at tick `t + 1`. A component can process arrivals and schedule their next hop during that tick; it cannot traverse another edge within the same tick.
- Execute exactly the requested number of ticks. Do not append drain ticks, stop early when counts repeat, or switch to a repeating-cycle response.
- Callers still generate on the final tick. Pending next-hop traffic at that boundary is reported as in flight.

With fixed workloads, a filled path can produce the same counts repeatedly. Round-robin can produce a repeating sequence instead. Repeated counts do not change the requested run length or cumulative accounting.

## Input document and simulation readiness

Reuse `ArchitectureDocument` format version 1 and its strict component/connection schemas. Preserve the submitted node and edge array order, IDs, labels, positions, capacities, caller configuration, routing policy, weights, and destination order in the result snapshot. The simulation request has no architecture name, saved architecture ID, or metadata.

Validation proceeds in this order:

1. Validate JSON, field types, required fields, document version, numeric ranges, and unknown fields.
2. Apply the existing Save-time structural checks: unique IDs across nodes and edges, existing endpoints, unique directed connections, unique outgoing orders per source, allowed connections, and an acyclic graph without self-connections.
3. Apply the simulation readiness and count-range checks below. Calculate only after validation succeeds.

### Additional readiness requirements

| Component or document | Run requirement |
| --- | --- |
| Document | Contains at least one Caller Group. An empty graph cannot run. |
| Caller Group | No incoming connections and exactly one outgoing connection. Zero `test_rps` is valid. |
| Load Balancer / Gateway | At least one outgoing connection and a valid routing policy. |
| Weighted router | At least one outgoing connection with a positive weight. |
| Server | Zero outgoing request connections to start a response, or exactly one to forward requests and await responses. |
| Database | No outgoing request connections; handling starts a response. |
| Every component | Reachable along directed edges from at least one Caller Group. |

Reachability uses topology, not traffic volume or routing weights. A Caller Group is reachable from itself. A component behind a zero-weight edge is structurally reachable and can report zero traffic. A graph whose sources all have zero RPS is valid and returns zero counters. Multiple caller-rooted subgraphs are valid; one source does not need to reach every component if all sources together do.

Every reachable forward path must eventually end at a terminal Server or Database. This follows from the DAG rule and required destinations for Callers and routers. Reverse responses follow that path back to its original caller; do not add explicit reverse edges or apply the forward graph's no-incoming-caller rule to implicit response movement.

Readiness checks apply only to simulation. Do not add them to architecture POST/PUT or mark a failed Run as a failed Save.

### Numeric contract

- Keep strict JSON integer input rules from the architecture API. `total_ticks` is a required positive JSON integer, up to `9_007_199_254_740_991`. Reject strings, booleans, and floating-point values such as `60.0`.
- The frontend supplies the default value 60. The API does not silently substitute 60 for a missing field.
- Every returned count is a nonnegative JSON integer no greater than `9_007_199_254_740_991`, so TypeScript can represent it exactly.
- Before allocation or frame generation, calculate `planned_generated = total_ticks * sum(caller.test_rps)` using exact integer arithmetic. Reject a run when this exceeds the exact JSON/JavaScript count range.
- The forward graph has no fanout or revisits. Each request visits a node or edge at most once in each direction. The planned-generated bound protects individual directional frame counts, cumulative global counts, and any internal per-node or per-edge totals for one direction. Do not publish a combined forward-plus-return visit total: across a run it can exceed this bound, and it does not count unique requests.
- Weights remain finite nonnegative JSON numbers and can be fractional. Weighted arithmetic must not overflow when finite weights are large or lose request conservation through floating-point rounding.
- Use exact rational values of the validated numeric weights for proportional allocation. A Python float's exact integer ratio is a suitable representation. Determinism is defined for the validated numeric values, not the original textual spelling of JSON numbers.
- No new arbitrary tick-count or graph-size cap is introduced. The expected scale is about 20 components and the default run is 60 ticks; this specification does not promise practical response sizes for every mathematically valid input.

## Engine behavior

Keep document/readiness validation and the tick engine independent of FastAPI, SQLite, and frontend playback. Reuse the existing validated document types where meanings are identical. Use typed run, frame, summary, cohort, and routing state structures. Do not create one object per request or one object per individual caller.

Prepare component lookup, outgoing connections sorted by ascending `order` for each source, and empty arrival counts. Edge array order and node iteration order must not change routing results. Orders can have gaps; their numeric ordering defines destinations.

### Aggregate route cohorts

Retain enough internal provenance to return each successful response to the correct Caller Group through the exact components that forwarded its request. A cohort contains an aggregate count, the originating Caller Group ID, the traversed forward edge-ID prefix, and a phase of request or response. The arrival map also identifies the receiving component. This is engine state, not a public individual-request trace.

During forward movement, append the selected edge ID to the cohort's prefix. To schedule a response, use the prefix's last edge in reverse and remove that edge from the prefix. A response arriving at its original Caller Group has an empty prefix and completes there. Routers never apply round-robin or weighted routing to responses.

Merge only cohorts with identical caller ID, remaining prefix, phase, and receiving component. Distinct forward prefixes retain separate provenance at fan-in. Responses whose remaining prefixes become identical can merge after their already-traversed return segments are removed. Each count represents the same request attempt throughout its active forward and reverse phases; starting a response does not create a second request attempt.

Use separate `current_arrivals` and `next_arrivals` maps of cohorts. Initially there are no active cohorts. Every tick starts with an empty next map and zeroed frame entries for all nodes and edges. Cohort ordering is ascending caller ID, then lexicographic edge-ID prefix, independent of submitted node/edge array order. IDs use the existing ASCII identifier contract. Omit zero-count cohorts.

For each executed tick:

1. Generate each Caller Group's total configured requests. Report its `generated`, create one aggregate source cohort when this count is positive, and schedule its output on its single edge into the next-arrival map.
2. At each processing component, sum only current forward-request cohorts to obtain `received`. Apply capacity once: `handled = min(received, capacity_rps)` and `dropped = received - handled`. Allocate the handled count among incoming cohorts as specified below. Discard rejected counts immediately; they produce no response and enter no next map.
3. For a terminal Server or Database, convert accepted cohorts to responses and schedule their first reverse hop. For a nonterminal Server, schedule all accepted cohorts on its single outgoing request edge. For a router, allocate accepted cohorts using its configured request-routing policy and append the selected edges to their prefixes.
4. Independently process current response cohorts. A processing component reports them as `responses_received` and schedules their next reverse hop without capacity admission. A Caller Group reports incoming responses as `completed` and removes them from active traffic. A Caller Group can generate new requests and receive responses during the same tick.
5. Record a processing component's `responses_returned` as the sum of newly created terminal responses and relayed incoming responses. Database `responses_received` is always zero because a Database has no outgoing request connections.
6. Record each edge's `forwarded` as requests scheduled from its source to its target, and `returned` as responses scheduled from its target to its source. Both counts describe this tick's output arriving on the following tick.
7. Calculate tick counts, cumulative totals, and boundary in-flight count from all active forward and response cohorts in the next map. Append the frame, then replace the current map with the next map for the next executed tick.

Node iteration cannot make output visible within the same tick. Fan-in merges request counts before applying capacity. Excess input is dropped immediately; next-hop maps do not retain overflow as a queue. Unused capacity is lost when the tick ends. Responses and outstanding synchronous requests do not reduce the next tick's request capacity. Waiting requests are represented by their active traffic cohort, without an additional capacity-consuming copy at each upstream component.

### Capacity allocation among cohorts

For a component with total forward input `R > 0`, handled quota `H`, and ordered incoming cohort counts `r_j`, assign `floor(H * r_j / R)` accepted requests to each cohort. Allocate the remaining accepted requests one at a time in stable cohort order, one extra per cohort with remaining input, until the quota is exhausted. All arithmetic uses exact integers. The accepted counts sum to `H`, and a cohort's rejected count is its input minus its accepted count. When `R = 0`, do not divide or change request-routing state.

This allocation preserves shared capacity and defines which callers and paths retain active requests after fan-in. For Caller Groups `caller-a` and `caller-b` sending 70 and 50 requests into capacity 100, the admitted cohorts contain 59 and 41 requests; 11 and 9 are discarded. Cohort provenance is not discarded when aggregate input is admitted.

### Round-robin

Each router has a run-local cursor initialized to destination index 0. The cursor selects the next destination for the next handled request. Advance only for handled traffic; dropped traffic does not consume turns. A tick with zero handled requests leaves the cursor unchanged. A new Run resets all cursors.

Aggregate allocation is arithmetic. For a cohort with `h` accepted requests and `D` destinations, assign `h // D` to every destination, then one additional request to each of the next `h % D` destinations starting at the cursor and wrapping. Set the next cursor to `(cursor + h) % D`. Process accepted cohorts in stable cohort order using this single router cursor. Split cohort counts according to these allocations, preserving each cohort's prefix until its selected edge is appended.

The component's overall destination counts equal arithmetic round-robin allocation of its total handled count `H` from the tick's initial cursor; the final cursor is `(initial_cursor + H) % D`. Cohorts do not have independent cursors. No loop runs once per request.

Round-robin includes every configured destination regardless of its stored weight. It does not inspect destination capacity or health. With three handled requests and two destinations, consecutive active ticks allocate `2/1`, then `1/2`, then `2/1`.

### Weighted routing

For `H` handled requests and positive total weight `W`, first allocate `floor(H * weight_i / W)` to each destination. Set zero-weight destinations to zero. Assign the remaining whole requests one at a time to positive-weight destinations in ascending stored destination order, one extra request per destination until the remainder is exhausted.

Use exact arithmetic for floors and remainders. Do not carry rounding debt into another tick. For three requests with equal weights, fixed ordered destinations receive `2/1` on every active tick. Weights are relative and need not sum to 100.

Calculate those destination quotas once for the component's total handled input, before assigning accepted cohorts. Do not independently round configured weights for each cohort; that can change the agreed aggregate split.

Assign accepted cohorts in stable cohort order against the remaining destination quotas. For the current cohort count `h`, remaining quotas `q_i`, and `Q = sum(q_i) > 0`, allocate `floor(h * q_i / Q)` to each destination. Distribute that cohort's remainder in stored destination order, one extra per destination with an unallocated remaining quota. Subtract the allocated counts from `q_i`, then process the next cohort. The final cohort receives exactly the remaining quotas. Skip zero-quota destinations and use exact integer arithmetic throughout.

Every cohort's allocations sum to its accepted count, and every destination receives exactly the overall quota initially calculated from its configured weight. Split cohorts preserve caller/path provenance, and no per-request loop is required.

Routers forward according to their configured policy. Capacity drops at a downstream component do not cause redistribution to another destination.

### Capacity status

The numeric utilization for a processing component is `handled / snapshot.capacity_rps` for the selected frame. It is derived from the recorded frame and snapshot in the frontend, not stored as another API count.

Threshold checks use exact integer comparisons: at capacity when `handled = capacity_rps`; otherwise near capacity when `5 * handled >= 4 * capacity_rps`. In TypeScript, use exact integer arithmetic such as `BigInt` for these cross-products. A rounded display percentage or floating-point ratio must not determine the status.

| Exact ratio | Display status |
| --- | --- |
| Below 0.8 | Normal |
| At least 0.8 and below 1 | Yellow / near capacity |
| Equal to 1 | Red / at capacity |

At capacity can occur with zero drops. Report the drop count separately. Caller Groups have no capacity percentage.

## Accounting invariants

For every processing node in every frame:

`received = handled + dropped`

For every caller's single edge:

`forwarded = generated`

For every nonterminal processing node:

`sum(outgoing forwarded) = handled`

For every processing node at tick `t >= 1`:

`received(t) = sum(incoming forwarded(t - 1))`

`responses_received(t) = sum(outgoing returned(t - 1))`

For every terminal Server or Database:

`responses_returned = handled`

`responses_received = 0`

For every nonterminal processing node:

`responses_returned = responses_received`

For every processing node, using its incoming request edges in reverse:

`sum(incoming edges' returned) = responses_returned`

For every Caller Group at tick `t >= 1`:

`completed(t) = sum(outgoing returned(t - 1))`

At every frame boundary:

`totals.generated = totals.completed + totals.dropped + totals.in_flight`

`totals.in_flight = sum(edges.forwarded + edges.returned)`

The last identity follows from one-hop propagation: every active request attempt pending at the boundary has just been scheduled on one edge, either as a forward request or as its successful reverse response. The engine can also calculate in flight as the sum of all next-arrival cohort counts; both quantities must agree. Dropped requests are absorbing outcomes and are never in flight. A newly created response replaces its request's forward phase and does not increase the number of active attempts.

Tick-global counts are generated traffic summed across Caller Groups, drops summed across processing nodes, and successful completions summed across Caller Groups. Cumulative totals add these counts through the selected tick. In flight is a boundary inventory, not a cumulative counter. A Database's handled count measures admitted database requests and newly created replies; it is not the run's completed count.

Summing handled values across components measures forward processing visits. Summing response counts across components measures return visits. Neither sum is a count of unique completions. Do not combine request and return visits as a unique-request metric, infer caller failures/timeouts from drops, or sum in-flight counts across frames for a final total.

## HTTP API

### Request

`POST /api/v1/simulations`

Operation ID: `simulateArchitecture`. Use the same API origin, JSON media-type rules, CORS configuration, strict object schemas, and structured error envelope as the existing architecture API.

| Field | Contract |
| --- | --- |
| `document` | Required complete `ArchitectureDocument` version 1. |
| `total_ticks` | Required positive safe integer. Interface default: 60. |

Unknown fields are rejected. A request containing a saved architecture ID instead of a document is not supported. The backend does not load or save an architecture as part of Run.

Return `200 application/json` after the complete result has been calculated. There is no saved simulation resource, `Location`, polling route, run ID, automatic retry, or streaming protocol. No SQLite access is needed for a valid run.

Each request owns its input, arrivals, frames, and routing cursors. Concurrent requests cannot share mutable engine state. HTTP integration must keep CPU calculation from blocking unrelated API event-loop work; the existing synchronous/thread-pool boundary is sufficient for this local milestone. Do not introduce a durable job system for this endpoint.

### Response models

All fields listed below are required. Simulation-owned fields reject null and unknown fields. The captured `ArchitectureDocument` retains its existing field rules, including `capacity_rps: null` for Caller Groups. Counts follow the safe-integer rule above.

| Model | Fields |
| --- | --- |
| `SimulationResult` | `snapshot: SimulationSnapshot`, `frames: SimulationFrame[]`, `summary: SimulationTotals`. |
| `SimulationSnapshot` | `document: ArchitectureDocument`, `total_ticks: positive safe integer`. Equal to the validated request values. |
| `SimulationFrame` | `tick: nonnegative safe integer`, `nodes: map of node ID to NodeFrame`, `edges: map of edge ID to EdgeFrame`, `counts: TickCounts`, `totals: SimulationTotals`. |
| Caller `NodeFrame` | `generated`, `completed`: nonnegative safe integers. Completed counts successful responses received by this Caller Group during the tick. Selected by the node's `caller_group` type in the snapshot. |
| Processing `NodeFrame` | `received`, `handled`, `dropped`: nonnegative safe integers for forward requests; `responses_received`, `responses_returned`: nonnegative safe integers for replies. Returned includes newly created terminal replies and relayed incoming replies. Selected by any other supported node type in the snapshot. |
| `EdgeFrame` | `forwarded`, `returned`: nonnegative safe integers. Forwarded moves source to target; returned moves target to source. Both are output sent now, arriving next tick. |
| `TickCounts` | `generated`, `completed`, `dropped`: nonnegative safe integers for work in this tick. |
| `SimulationTotals` | `generated`, `completed`, `dropped`: cumulative nonnegative safe integers; `in_flight`: nonnegative safe integer at this frame's boundary. |

Frame node-map keys match exactly the snapshot node IDs. Edge-map keys match exactly the snapshot edge IDs. Every frame includes every node and edge, including zero counts. Maps are keyed by IDs rather than labels or component type names. A node's frame shape must agree with its snapshot type.

Frames are ordered by tick, cover every integer `0..total_ticks`, and contain no duplicates or omissions. Frame 0 contains zero values in every entry, count, and total. `summary` equals the final frame's `totals`. Do not truncate a response or omit zero frames to reduce response size.

There are no cumulative per-node or per-edge summary maps in this milestone. The selected node shows current-tick metrics; the run summary supplies whole-run global totals. Recorded frames remain sufficient for later analysis if that feature is separately specified.

### Complete request example

```json
{
  "document": {
    "format_version": 1,
    "nodes": [
      { "id": "caller", "type": "caller_group", "label": "Caller Group", "position": { "x": 0, "y": 0 }, "capacity_rps": null, "caller_count": 10, "test_rps": 100 },
      { "id": "lb", "type": "load_balancer", "label": "Load Balancer", "position": { "x": 250, "y": 0 }, "capacity_rps": 100, "routing_policy": "round_robin" },
      { "id": "server", "type": "server", "label": "Server", "position": { "x": 500, "y": 0 }, "capacity_rps": 60 },
      { "id": "database", "type": "database", "label": "Database", "position": { "x": 750, "y": 0 }, "capacity_rps": 60 }
    ],
    "edges": [
      { "id": "caller-to-lb", "source": "caller", "target": "lb", "order": 0, "weight": 1 },
      { "id": "lb-to-server", "source": "lb", "target": "server", "order": 0, "weight": 1 },
      { "id": "server-to-database", "source": "server", "target": "database", "order": 0, "weight": 1 }
    ]
  },
  "total_ticks": 60
}
```

### Frame and summary examples

The response snapshot equals the example request. Its frames include this complete tick-3 frame:

```json
{
  "tick": 3,
  "nodes": {
    "caller": { "generated": 100, "completed": 0 },
    "lb": { "received": 100, "handled": 100, "dropped": 0, "responses_received": 0, "responses_returned": 0 },
    "server": { "received": 100, "handled": 60, "dropped": 40, "responses_received": 0, "responses_returned": 0 },
    "database": { "received": 0, "handled": 0, "dropped": 0, "responses_received": 0, "responses_returned": 0 }
  },
  "edges": {
    "caller-to-lb": { "forwarded": 100, "returned": 0 },
    "lb-to-server": { "forwarded": 100, "returned": 0 },
    "server-to-database": { "forwarded": 60, "returned": 0 }
  },
  "counts": { "generated": 100, "completed": 0, "dropped": 40 },
  "totals": { "generated": 300, "completed": 0, "dropped": 40, "in_flight": 260 }
}
```

The Database first handles 60 requests and starts their replies on tick 4. The Server receives those replies on tick 5, the Load Balancer receives them on tick 6, and the Caller Group first completes them on tick 7. That complete frame is:

```json
{
  "tick": 7,
  "nodes": {
    "caller": { "generated": 100, "completed": 60 },
    "lb": { "received": 100, "handled": 100, "dropped": 0, "responses_received": 60, "responses_returned": 60 },
    "server": { "received": 100, "handled": 60, "dropped": 40, "responses_received": 60, "responses_returned": 60 },
    "database": { "received": 60, "handled": 60, "dropped": 0, "responses_received": 0, "responses_returned": 60 }
  },
  "edges": {
    "caller-to-lb": { "forwarded": 100, "returned": 60 },
    "lb-to-server": { "forwarded": 100, "returned": 60 },
    "server-to-database": { "forwarded": 60, "returned": 60 }
  },
  "counts": { "generated": 100, "completed": 60, "dropped": 40 },
  "totals": { "generated": 700, "completed": 60, "dropped": 200, "in_flight": 440 }
}
```

At tick 60, the frame's `counts` are `{ "generated": 100, "completed": 60, "dropped": 40 }`. Its `totals` and the whole result's `summary` both equal:

```json
{
  "generated": 6000,
  "completed": 3240,
  "dropped": 2320,
  "in_flight": 440
}
```

Final in flight comprises 260 forward requests and 180 returning responses. The Database has handled 3,420 requests by tick 60; 180 of their successful responses have not yet reached the caller, so 3,240 requests are completed. Capacity drops create no returning traffic.

For a direct `Caller Group → terminal Server` path at 100 source RPS and Server capacity 60, the first three cumulative boundaries are:

| Tick | Generated | Completed | Dropped | In flight |
| --- | ---: | ---: | ---: | ---: |
| 1 | 100 | 0 | 0 | 100 |
| 2 | 200 | 0 | 40 | 160 |
| 3 | 300 | 60 | 80 | 160 |

The Server first creates 60 replies on tick 2. Those replies complete at the Caller Group on tick 3. Each filled boundary contains 100 forward requests and 60 returning responses.

### Errors

Use the architecture API's `ErrorResponse`: `{ "error": { "code", "message", "details" } }`. Every detail has `location`, JSON Pointer `path`, stable `code`, and a readable `message`. Existing document-shape and structural detail codes remain applicable.

| HTTP status | `error.code` | Meaning |
| --- | --- | --- |
| 400 | `invalid_json` | Malformed JSON or nonstandard numeric constants. |
| 415 | `unsupported_media_type` | Request is not supplied as `application/json`. |
| 422 | `validation_error` | Invalid input shape, graph, simulation readiness, or exact-count range. |
| 422 | `unsupported_document_version` | Well-typed document version is unsupported. |
| 500 | `internal_error` | Unexpected calculation failure or invalid generated response. |

New simulation-specific detail codes:

| Detail code | Pointer example | Meaning |
| --- | --- | --- |
| `missing_source` | `/document/nodes` | No Caller Group exists. |
| `missing_destination` | `/document/nodes/1` | Caller Group or router has no required outgoing connection. |
| `all_zero_weights` | `/document/nodes/1/routing_policy` | Weighted router has destinations but none has positive weight. |
| `unreachable_component` | `/document/nodes/3` | Component is not reachable from any Caller Group. |
| `count_overflow` | `/total_ticks` | Planned generated count exceeds the exact output range. Message identifies reducing ticks or source RPS as corrective actions. |

An invalid `total_ticks` field uses existing type/range detail codes. Structural errors use pointers relative to the simulation body, such as `/document/edges/2/target`. Readiness errors identify the affected component's submitted index; the frontend maps indices to stable IDs from that request snapshot.

Report applicable readiness issues together after structural integrity is established. Do not report missing positive weights for a router with no destinations in addition to its missing-destination error. Error order and exact human wording are not API branching contracts.

Example readiness response:

```json
{
  "error": {
    "code": "validation_error",
    "message": "The architecture is not ready to simulate.",
    "details": [
      {
        "location": "body",
        "path": "/document/nodes/3",
        "code": "unreachable_component",
        "message": "Connect this component to a path from a Caller Group."
      }
    ]
  }
}
```

A rejected or failed Run does not change saved architecture content, timestamps, frontend drafts, or previous results. Expected drops caused by capacity are successful simulation results, not HTTP errors. The endpoint has no architecture-not-found or storage-unavailable response because it uses the submitted document without library access.

## Verification and acceptance

Implement typed domain tests separately from HTTP tests. Declare all backend runtime and test dependencies in project configuration, install them in the repository `.venv`, and run the required strict type checks and tests through `.venv/bin/python` as required by [project instructions](../../AGENTS.md).

Domain acceptance cases:

1. A processing node receiving 100 with capacity 60 reports 100 received, 60 handled, 40 dropped, and derived capacity use 100%.
2. Three handled requests with equal weighted destinations yield `2/1` every active tick; zero-weight destinations receive zero. Fractional and very large finite weights conserve requests.
3. Three handled requests over two round-robin destinations alternate `2/1` and `1/2`. Zero-input ticks preserve the cursor; a new run resets it. Dropped inputs do not advance it.
4. A 70/30 split of 100 into terminal Servers with capacities 50/100 yields 50 handled, 20 dropped, and 50 newly created replies at the first, and 30 handled and 30 newly created replies at the second. Those 80 replies complete only on arrival at their original caller. No redistribution or error reply occurs.
5. `Caller → LB → Server → Database` first generates on tick 1, reaches LB on tick 2, Server on tick 3, and Database on tick 4. Its first successful replies reach Server on tick 5, LB on tick 6, and Caller on tick 7. Reordering node/edge arrays without changing destination orders preserves ID-keyed counts and cohort attribution.
6. At 100 source RPS and capacities 100/60/60, the 60-tick summary is 6,000 generated, 3,240 completed, 2,320 dropped, and 440 in flight. The Database has handled 3,420 requests. Final in flight contains 260 forward requests and 180 responses. There are 61 frames, including tick 0.
7. In a one-tick `Caller → terminal Server` run at 100 RPS, completion and drops are zero and in flight is 100. No drain occurs. With Server capacity 60 and two ticks, totals are 200 generated, zero completed, 40 dropped, and 160 in flight. At tick 3 they are 300 generated, 60 completed, 80 dropped, and 160 in flight.
8. Caller Groups `caller-a` and `caller-b` generating 70 and 50 into one terminal Server of capacity 100 merge to 120 received, 100 handled, and 20 dropped on tick 2. Their replies contain 59 and 41 requests respectively and complete at the correct caller on tick 3. Capacity applies once regardless of iteration order.
9. Empty, no-source, missing-destination, all-zero weighted, and unreachable-component inputs are rejected. Valid disconnected caller-rooted subgraphs and structurally reachable zero-traffic nodes are accepted.
10. Each frame has complete ID coverage and satisfies all accounting invariants. Repeated runs of the same document/tick count produce equal result content.
11. Total generated exactly at the safe-integer boundary is allowed when practical to calculate; inputs beyond it are rejected before generating frames. Test the range validator independently without allocating a huge run.
12. Merged paths and routers retain each accepted cohort's actual return prefix. Responses traverse the original route backward even if the router's current cursor has changed. Request routing never runs for a returning response.
13. A nonterminal Server can receive and return replies while admitting its full request capacity in the same tick. Terminal Servers and Databases have zero `responses_received`; their `responses_returned` equals their handled requests. Waiting for replies does not reduce later request capacity.
14. Weighted routing over multiple accepted cohorts preserves the once-calculated overall destination quotas and each cohort's accepted count. For three one-request cohorts and equal weights, the component still routes `2/1`, rather than independently rounding each cohort to produce `3/0`. Test zero remaining quotas and the final cohort allocation.
15. Dropped requests immediately leave all cohort maps, never start responses, and never become caller completions. Every node/edge result uses the prescribed forward/return fields without inferred timeout or caller-failure fields.

HTTP acceptance cases:

- Run an unsaved document with POST and receive the exact snapshot, ordered frames, and summary without creating or changing library records.
- Verify strict field types, unknown-field rejection, document version errors, media-type handling, malformed JSON, readiness detail codes/pointers, and no partial success response.
- During implementation, extend the approved machine-readable `backend-api.openapi.json` contract with the simulation operation and DTOs/errors, then verify it against generated OpenAPI. Preserve CRUD behavior and checks. The current contract test compares the complete path set, so its approved input must include the new route when the implementation adds it.
- Verify independent routing state across concurrent and repeated requests and retain all existing CRUD/Save checks.
- Exercise representative 20-component chains, branches, and fan-in, including merged caller provenance and return paths. Record calculation cost and response size separately from browser rendering; do not assert an unmeasured latency target or request-count-dependent loop.

Public frame and response growth is proportional to executed ticks times nodes plus edges. Calculation also depends on the number of active aggregate route cohorts, their outgoing allocations, cohort ordering, and exact-weight arithmetic. Distinct forward paths can increase cohort count even in a small DAG; merging equal provenance limits duplication but does not make cost depend only on node and edge count. Request volume must not create a per-request processing loop. Measure cohort growth at the representative scale and address larger graphs from those measurements in a later task.
