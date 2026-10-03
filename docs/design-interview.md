# Design interview

Date started: 2026-10-03
Status: Complete. The user confirmed the updated release 1 design on 2026-10-03. Subsequent implementation progress is tracked in the release 1 contract; the interview rounds below remain historical records.

The rounds below preserve the interview history. Earlier references to open decisions or pending confirmation are superseded by the agreed [release 1 contract](release-1.md) and the closing confirmation at the end of this document.

## Round 1: User decisions

1. Product purpose: simulating and visualizing architectures. Personal learning is a usage context, not a required product objective.
2. Claims: no promise of real capacity. The bounded model's correctness criteria remain open.
3. Delivery: local usage only, no deployment, first phase during the current weekend.
4. Technology: Python first; Go conditional on performance and calculation latency for complex systems. No strong frontend preference.

These answers are recorded in ADRs 0001–0003. They are not an approval of unanswered implementation details.

## Round 2: User decisions

5. Simulation uses virtual time. A scheduling algorithm has not yet been selected.
6. Connection/request semantics: the question was unclear to the user; unresolved and needs a concrete example.
7. Save/load: require export and a small local database with a library of previously saved architectures. The user prefers document-shaped storage and has not selected a storage engine. Revision history and save behavior remain open.

The virtual-time decision is recorded in ADR 0004. ADR 0002 now includes the persistence requirement.

## Round 3: User decisions and scope correction

6. First-phase scope is traffic routing and per-component request counts/rates. Latency is deferred; the model must not assume knowledge of hosted software or query duration. The synchronous/background completion question is retired for this phase.
8. SQLite is accepted for local storage.
9. Retain the latest saved version of each architecture, rather than automatic revision history.
10. RPS means requests per second with evenly spaced arrivals, from different callers. Whether RPS applies globally or per caller/source is still open.

These answers are recorded in ADRs 0005–0006 and updates to ADRs 0002 and 0004. The overview now has a first-phase scope section; its broader original proposal remains available as future context.

## Round 4: User decisions

11. Allow a user-configured maximum RPS. The user suggested yellow near 80% and red at 100%; whether capacity is advisory or enforced remains unresolved.
12. Support configurable traffic splits, with round-robin and weighted options.
13. Caller groups with total group RPS. The user's answer labeled "Q3" refers to Q13: 100 callers with 100 group RPS produce 100 requests per second total, averaging one per caller.
14. Accepted the proposed configurable run duration, initially 60 virtual seconds, per-second counts, and whole-run totals.
15. Explicit Save via the frontend, and prompt on exit when unsaved. Saved payload contents were not answered and remain open.

ADRs 0004–0006, the glossary, and the overview have been updated to reflect these answers.

## Round 5: User decisions

16. Capacity is enforced. Requests reaching a server that is full are dropped. Capacity intervals and application to routing components remain open.
17. Weighted splits are deterministic; the user prefers exact proportions where possible. Integer rounding still needs a rule.
18. Single destination per routing decision is sufficient now. Fanout is a desired later option. The answer did not explicitly settle cycles.
19. After Simulate, provide play/pause and fast-forward controls. The calculation/replay boundary and edit behavior remain open.
20. Save architecture and component configuration, with permission to retain the test RPS as well. Additional simulation data is not requested. The term "workload settings" caused confusion and will be replaced with concrete names in questions. Copy/duplicate behavior was not answered.

ADRs 0004–0006, the glossary, and the overview reflect these answers. Simulation results and playback state are outside the saved document; caller count belongs to client-group configuration, while run duration remains a runtime control.

## Round 6: User decisions

21. A capacity interval is one virtual second, named a **tick**. The capacity allowance resets per tick.
22. Routers follow configured routes; servers drop requests when full. Health-aware load balancers are a future feature.
23. Select Caller Group, Load Balancer, Gateway, and Server for the current release. A queue is requested for the next release discussion. The user explicitly requests a follow-up backlog and the term **release** for delivery scopes. Server forwarding, router capacity, and cycle rules were not explicitly answered.
24. Calculate a fixed snapshot, then replay it. The user asks for a technical explanation of how this works.
25. Export is not required for release 1 and belongs in the follow-up backlog.

Created `docs/follow-up.md` with queues, fanout, health-aware balancing, and export as requested future work; Go remains conditional on performance and latency modeling remains a deferred discussion. Other original overview components are labeled candidates rather than future-release commitments.

## Round 7: User decisions

26. All components should expose capacity configuration in the shared BaseComponent abstraction. No cycles/loopbacks; the user explicitly says this decision must not be reopened. Server forwarding was not directly answered and is the only remaining server-role question.
27. Weighted rounding is fixed per tick. Three requests at 50/50 always produce 2/1 in destination order, without rotating which destination gets the extra request. Generalization and round-robin state will be made explicit in the final model proposal.
28. The user accepts the aggregate-frame recommendation. Use node received/accepted/drop counts and connection traffic counts for playback, rather than individual request traces.

ADRs 0004–0005 and 0007, the glossary, and the overview have been updated. Cycles/loopbacks are closed; they are never to be asked again in this release's interview.

## Round 8: User decisions and discussion focus

31. Caller-group capacity is irrelevant and unused for release 1. Do not continue asking about it.
30. Received/handled/dropped counts and capacity-used percentage are accepted. The user rightly questioned the need to ask about routine bookkeeping; state such derived definitions directly in future discussion.
29. Unresolved and explicitly the most pressing issue: brainstorm simulation propagation and fixed-snapshot replay together. The user proposes a per-tick state array and considers having traffic reside in a component for one tick or advance one hop per tick. Do not mark either propagation model agreed yet.

The current discussion focuses on separating DAG structure, temporal calculation rules, result frames, and frontend playback. Added `docs/simulation-flow.md` as a proposal comparing both temporal models, not an implementation commitment.

## Propagation decision after brainstorming

- The user selected one hop per tick, preferring its animation model and usefulness for future retries.
- Default total run length is 60 ticks, configurable for larger/deeper systems.
- Retries were added to the future-work backlog.
- Updated `docs/simulation-flow.md` for the selected mode and prepared `docs/release-1.md` as a consolidated review draft.
- That draft applies next-tick arrival to source output too. The earlier comparison used direct external injection at the first processing node. This initial clock convention is explicit for final review, not treated as an earlier user choice.
- Run-end in-flight accounting, server forwarding, round-robin state, validation, library fields, and frontend implementation defaults are presented together for final review rather than repeated bookkeeping questions.

## Decision tree

- Product purpose and limits of claims: recorded.
  - Virtual time: recorded.
    - Evenly spaced arrivals from different callers: recorded.
    - Caller groups and total group RPS: recorded.
    - Configurable duration, initial 60 seconds, per-second reporting and run totals: recorded.
    - Tick = one virtual second: recorded.
    - Aggregate caller-group counts without individual request traces: recorded.
    - Deterministic weighted selection: recorded.
    - Fixed-order weighted rounding without cross-tick compensation: recorded.
    - General allocation formula and round-robin cursor: explicit release-draft defaults.
    - One-hop-per-tick propagation and default total 60 ticks: recorded and closed.
    - Calculation ordering and reference examples: concrete in the release draft.
  - First-phase traffic routing and request counts: recorded.
    - User-supplied maximum RPS and proposed 80%/100% warning colors: recorded.
    - Enforced capacity and dropping excess requests: recorded.
      - Per-tick capacity allowance and reset: recorded.
      - Capacity-blind routing, no redistribution: recorded.
      - Capacity configuration on all component types: recorded.
      - Source capacity: unused and closed.
      - Per-node received/handled/dropped and handled/capacity: recorded.
    - Round-robin and weighted routing options: recorded.
      - Single-destination routing: recorded; fanout deferred.
      - No cycles/loopbacks: recorded and closed; do not ask again.
      - Five release 1 types: Caller Group, Load Balancer, Gateway, Server, and Database recorded.
      - Router capacity: recorded.
      - Server forwarding and validation: explicit release-draft defaults.
    - Play/pause and fast-forward after Simulate: recorded.
      - Fixed-snapshot calculation/replay boundary: recorded; edits require another calculation for updated results.
      - Aggregate frame data: recorded; individual request traces outside release 1.
    - Latency and application/query durations: deferred.
    - Synchronous waits and request completion timing: retired from this phase.
    - Caching: requested for the next release; behavior to be scoped then.
    - Queue: requested for next-release discussion; worker and concurrency remain deferred.
  - Per-node metric labels: recorded.
  - Global totals, in-flight accounting, and source clock convention: explicit release-draft defaults.
  - Reference-model validation: acceptance examples in the release draft.
- Local weekend release 1: recorded.
  - Persistent library: recorded.
    - SQLite and latest saved version: recorded.
    - Explicit Save and unsaved-changes prompt: recorded.
    - Saved payload: architecture, component configuration, and test RPS recorded; results/playback not retained.
    - Export/import: deferred to follow-up backlog.
    - Copy action: explicitly deferred in the release draft.
    - Document fields and validation: explicit release-draft defaults.
  - Final acceptance criteria: concrete in the release draft.
- Python backend: recorded.
  - Profile if performance problems occur, separating calculation from response/rendering. Go conditional as recorded; no unmeasured benchmark target is claimed.
- Frontend technology: no strong user preference.
  - Retain overview technologies as implementation defaults in the release draft; the user has no strong frontend preference.

## Final frontier presented: consolidated shared-understanding review

- Propagation is settled: one hop per tick.
- Review `docs/release-1.md`: recorded decisions, explicitly proposed implementation defaults, and acceptance examples.
- Confirm source timing, server forwarding, run-end accounting, routing state, validation, and library details together.
- Overall shared-understanding confirmation concludes the design interview. No implementation has been requested or started.

Q29 propagation, Q30 metrics, Q31 source capacity, and no-loopbacks are settled; do not reopen them.

All remaining defaults are explicit in the consolidated review. No loopback or propagation-mode question remains.

Technical explanation accepted in Q28: the backend calculates the fixed run and returns a sequence of frames; the frontend changes which frame is displayed. Playback requires no engine recalculation.

## Storage facts checked for round 3

- SQLite can store an entire architecture as JSON text while keeping its identifier, name, and timestamps as metadata. Modeling each node and edge in separate tables is not required. See [SQLite JSON support](https://www.sqlite.org/json1.html).
- Python exposes SQLite through its standard-library [sqlite3 module](https://docs.python.org/3/library/sqlite3.html). SQLite lists local application storage as an [appropriate use](https://www.sqlite.org/whentouse.html).
- [TinyDB](https://tinydb.readthedocs.io/en/latest/intro.html) is a lightweight Python document database using JSON-file storage by default. Its documentation warns against use requiring multiple threads/processes or ACID guarantees.
- User accepted the SQLite option in Q8. Whole-document storage with metadata is the proposed shape; exact fields remain open.
- A document's format version is distinct from retained historical revisions of an architecture. Q9 selected latest-version saves.

Recommendations presented in the interview are proposals until the user answers them.

## Component scope adjustment

- User added Database to release 1 and requested caching for the next release.
- Updated the release contract, overview, glossary, routing ADR, and follow-up backlog to reflect this scope.
- Proposed Database behavior uses the existing per-tick capacity/drop model, consumes one database request per forwarded request, and completes the path without outgoing connections. Query timing remains excluded.
- Updated the reference timeline to `Caller Group → LB → Server → Database`; the tick rules and accounting are unchanged.
- Database inclusion and next-release caching are recorded user choices. The concrete Database role joins the existing implementation defaults for consolidated review.

## Closing confirmation

- On 2026-10-03, after the Database and caching scope update, the user confirmed: "Good. looks good."
- The consolidated release 1 scope and its explicitly stated implementation defaults are agreed, including the Database role and source-edge timing.
- The design interview is complete. Future feature behavior stays in the follow-up backlog for later release planning.
- Implementation has not been requested or started.
