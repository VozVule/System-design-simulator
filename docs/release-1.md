# Release 1 contract

Date: 2026-10-03
Status: Design agreed on 2026-10-03 after the Database and caching scope update. Backend CRUD/Save milestone implemented and verified. Simulation specifications accepted and implemented on 2026-10-06. Backend checks, frontend checks, browser acceptance tests, production build, and representative-diagram visual review pass.

Amended on 2026-10-06 for synchronous request/response flow: replies return from the Database through the Server and the actual request path to the Caller Group. Successful completion occurs on caller receipt. Capacity limits new incoming requests; replies pass freely. Excess requests are dropped without processing or a response. This supersedes the earlier one-way completion rule; the rules and acceptance totals below reflect the amendment recorded in [ADR 0008](adr/0008-synchronous-request-response-flow.md).

## Purpose and delivery

A general architecture simulator and visualizer for local use, with release 1 targeted for October 3–4, 2026. Personal learning is a usage context, not a curriculum requirement. Results describe the configured model; they do not promise real infrastructure capacity.

### Delivery sequence

On 2026-10-03, the user selected architecture CRUD and explicit Save as the first release milestone, before the simulation engine. Its backend/frontend contracts are described in the [backend API specification](../specs/backend/backend-api-spec.md), with a companion [OpenAPI design contract](../specs/backend/backend-api.openapi.json). The milestone requires enforced Python type declarations, HTTP integration tests with SQLite, and separate domain unit tests. The API specification was approved by the user; this sequencing does not change the agreed simulation behavior below.

The backend milestone is implemented with five CRUD endpoints, durable SQLite storage, generated API documentation, 73 passing domain/HTTP/contract tests, and strict static type checks. Setup and startup commands are in the [README](../README.md); the separate standards and specification reviews are recorded in [backend review](backend-review.md).

On 2026-10-06, the user discussed and accepted the [backend simulation specification](../specs/backend/simulation-spec.md) and [frontend replay specification](../specs/frontend/simulation-replay-spec.md), then requested parallel implementation of both. The user confirmed default 60 ticks, Run from the unsaved working canvas, separate Edit/Replay modes, and the canvas/timeline/inspector layout. Replay displays steps without elapsed-time labels. All components must be reachable from a Caller Group for Run. Expected scale is about 20 components; no new arbitrary graph-size or run-duration cap was selected. Request-type Gateway routing is deferred, and final visual styling must meet the replay specification's visual checks.

## Recorded decisions

- Canvas with Caller Group, Load Balancer, Gateway, Server, and Database components and directed connections.
- Request dependencies have no cycles or loopbacks; single-destination routing. Replies follow existing connections in reverse. Fanout is future work.
- Caller groups generate a total configured RPS shared across their caller count. Caller-group capacity is unused.
- A tick is one virtual second; configurable total run length defaults to 60 ticks.
- Request processing capacity resets per tick. Handle up to capacity and discard excess requests without a reply. Responses do not consume capacity.
- Routers follow round-robin or deterministic weighted splits without checking destination health or redistributing drops.
- Fixed weighted rounding: three requests at 50/50 produce 2/1 in stable destination order every tick, without rotating the remainder.
- Requests and replies advance one hop per tick. A handled request completes only when its response reaches the caller.
- Calculate a fixed snapshot, then replay aggregate tick frames with play/pause and fast-forward.
- Display received, handled, dropped, and capacity used = handled/capacity; show connection traffic and run totals.
- SQLite saved-architecture library, explicit Save, latest saved version, and an unsaved-changes prompt on leaving.
- Save diagram positions, component configuration, and test RPS. Results, playback state, and runtime tick count are not saved.
- Caching is planned for the next release. Queues are also requested for next-release discussion. Export, fanout, health-aware balancing, and retries are future work in [follow-up.md](follow-up.md).

## Agreed implementation defaults

These defaults were made explicit in the consolidated review and accepted with the release design.

### Clock and run end

- Tick 0 is the empty initial state; execute ticks 1–60 by default, yielding 60 calculated frames plus the initial frame.
- Apply the next-tick boundary to source output too: callers generate in tick 1, first destination receives in tick 2.
- Callers emit during every executed tick. Stop at the selected total; do not append automatic drain ticks.
- Record active requests and replies as in flight. Enforce `generated = caller completions + dropped + in flight`. Drops leave active inventory immediately and do not create replies or caller timeout events.

### Node roles and validation

- Caller Group: no incoming connections, exactly one outgoing connection, configurable caller count and total RPS.
- Load Balancer/Gateway: configured processing capacity, one or more destinations, and a routing policy. They share routing primitives in this release.
- Server: configured request capacity; zero outgoing request connections to start a reply, or one to forward handled traffic and receive its downstream reply.
- Database: configured capacity and no outgoing connections in release 1. It accepts requests up to its per-tick capacity, drops excess, and uses the same metrics and capacity colors as other processing components.
- Each request forwarded by a server to a database counts as one database request. Database handling starts a reply to that Server; the reply returns through the actual request path to its caller. Query timing, payload contents, read/write behavior, replication, application status-code logic, and caller timeouts are outside release 1.
- Save incomplete diagrams while editing; reject invalid simulation inputs with readable backend validation errors.
- For simulation, require at least one Caller Group and require every component to be reachable from a Caller Group. Reachability is structural; zero-RPS sources and zero-weight paths can still yield valid zero-traffic components. Save readiness remains separate.
- Validate unique IDs, existing edge endpoints, no duplicate connections, allowed connection counts, and an acyclic graph.
- Use positive integer caller counts/capacities, nonnegative integer RPS, and positive integer total ticks.
- Weighted routes use nonnegative relative weights with at least one positive weight. Zero-weight destinations receive no traffic; weights need not sum to 100.

### Routing and accounting

- Persist explicit destination order so "first" stays stable after reopening.
- Weighted routing: floor proportional counts, then distribute remaining whole requests in fixed order among positive-weight destinations. No cross-tick rounding debt.
- Round-robin: carry a rotating cursor across ticks and reset it when a new simulation starts. This stays distinct from fixed weighted rounding.
- Aggregate counts suffice. Internal cohorts retain originating caller and traversed path for reverse routing; no per-request objects or individual traces are exposed.
- Every node reads current-tick requests/replies and writes output only to next-tick input in the relevant direction. Merge request fan-in before enforcing capacity once.
- A terminal Server or Database creates a successful reply for handled traffic. Intermediate components return it along its actual path without a new routing decision or another capacity charge. Only caller receipt counts as completed.
- Per-node counts describe that tick; cumulative totals are separate. Summing handled values across nodes counts visits, not unique completions.
- Capacity colors: below 80% normal; 80% to below 100% yellow; 100% red.
- One-tick hops are abstract timing rules. Do not report estimated service/query latency.

### API and replay

- Retain Python/FastAPI; keep the domain model and tick engine independent of the API.
- Return fixed graph/configuration snapshot, ordered frames keyed by node/edge IDs, and summary in one JSON response. No streaming is needed.
- Run sends the current working document and explicit `total_ticks` to POST `/api/v1/simulations`, as specified in the accepted simulation API contract. It does not require or perform Save.
- Decode once in the frontend. Playback selects frames; it does not calculate routing or capacity.
- At 1×, advance one tick per real second; faster playback advances recorded ticks more quickly. Pause holds the current frame.
- Display tick position as Step; do not display elapsed seconds or estimate a request/response round-trip duration. The internal accounting tick and one-hop rule remain unchanged.
- Keep the result's snapshot so edited configuration is not presented as belonging to an old run. Recalculate to get updated results.
- Edit uses the working document; Replay uses the immutable run snapshot and retains selection, inspection, pan, zoom, and Fit while preventing document mutation.
- Retain Svelte/TypeScript, Svelte Flow, and Tailwind from the overview as implementation defaults; the user has no strong frontend preference.

### Persistence and library

- Store complete architecture JSON documents in SQLite, with ID, name, document-format version, and created/updated timestamps for listing.
- Configuration and runtime counters stay separate. Callers generate; processing components use shared capacity accounting.
- Provide new/save/open/rename. A separate Duplicate action is deferred unless requested.
- In-app navigation can show Save/Discard/Cancel; browser close/reload requests the standard leave/stay warning where supported, as documented in ADR 0006.
- Profile calculation separately from response/rendering if performance becomes a problem. Go remains conditional on measured Python limitations.

## Model acceptance examples

These are checks for the eventual implementation, not measured infrastructure claims.

1. A node receiving 100 requests with capacity 60 reports received 100, handled 60, dropped 40, and capacity used 100%.
2. Three handled requests split 50/50 route 2/1 every tick in stored destination order.
3. A 70/30 split of 100 requests to servers with capacities 50/100 causes the first to drop 20 and the second to handle 30; no redistribution.
4. `Caller → LB → Server → Database` generates at tick 1, reaches LB at tick 2, Server at tick 3, and Database at tick 4. Its successful reply reaches Server at tick 5, LB at tick 6, and Caller at tick 7. Changing node iteration order does not change this.
5. For that graph at 100 source RPS and capacities LB 100, Server 60, Database 60, after 60 ticks: 6,000 generated, 3,240 completed at callers, 2,320 dropped, and 440 in flight. Database handling totals 3,420 visits.
6. Playback speed/pause changes presentation timing only. Running the same snapshot again gives identical results.
7. Save/reopen restores positions, component settings, RPS, weights, and destination order. Simulate recalculates results.

The engine and replay explanation is expanded in [simulation-flow.md](simulation-flow.md). The user confirmed the initial design with "Good. looks good." on 2026-10-03. The detailed simulation contracts and synchronous-response amendment were accepted for implementation on 2026-10-06.
