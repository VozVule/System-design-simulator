# ADR 0005: Focus the first phase on traffic routing and load accounting

Date: 2026-10-03
Status: Accepted on 2026-10-03 with the consolidated release 1 contract

The agreed [release 1 contract](../release-1.md) resolves the release defaults discussed below. Earlier proposal and open-decision wording records the interview progression; future-release and conditional-performance questions remain deferred.

The 2026-10-06 [synchronous-response amendment](0008-synchronous-request-response-flow.md) supersedes this ADR's terminal-completion and response-exclusion defaults. The original discussion below remains historical. Requests still use the acyclic architecture, while replies follow the traversed connections in reverse and complete at their callers.

## Context

The proposed model included latency and downstream-call completion. The user clarified that the simulator cannot know what software a server hosts or accurately estimate query duration, and explicitly deferred latency.

## Decision recorded

- Model and visualize traffic routing through the architecture.
- Show per-component request counts or rates for a workload expressed in RPS.
- Load balancers and gateways are examples of the routing behavior the user wants to visualize.
- Do not model latency in the first phase or infer application/query durations from component names.
- Allow a user-configured maximum RPS. The user suggested yellow near 80% and red at 100%; exact thresholds are proposed defaults rather than a fully specified rule.
- Support round-robin routing and configurable weighted splits.
- Enforce configured capacity per tick (one virtual second): requests reaching a full node are dropped, and the allowance resets at the next tick. All component types support a configurable capacity in the shared abstraction.
- Weighted routing is deterministic.
- Each routing decision selects one destination for the first phase. Fanout is a desired later extension.
- Routing is simple and capacity-blind. A router follows its configured selection policy; the destination drops requests it cannot accept. Health-aware destination selection is future work.
- Release 1 has Caller Group, Load Balancer, Gateway, Server, and Database components. Caching is requested for the next release.
- Cycles and loopbacks are forbidden. This is settled and must not be reopened during this release's interview.
- Weighted integer allocation favors the first destination for remainder ties every tick: 3 requests at 50/50 produce 2/1 every tick, rather than alternating to compensate across ticks. The exact general allocation formula is a proposed implementation detail in ADR 0007.
- Playback uses aggregate tick frames; individual request inspection is outside release 1.
- Caller-group capacity is not used; group test RPS determines generated traffic directly.
- Display received, handled, and dropped counts. Capacity used = handled/configured capacity, as accepted in Q30.
- Propagation is one hop per tick; the user explicitly selected this temporal model.

## Consequences

- The synchronous/background completion question is retired from the first-phase interview.
- Service/query-time inputs and latency metrics are outside release 1. One-hop propagation is the selected abstract timing rule.
- Virtual time remains part of the model, with evenly spaced arrivals from different callers.
- Processing-node handled counts are received minus dropped. The release draft counts terminal-server and database handled traffic as completed and nonterminal output as next-tick traffic.
- The proposed Database role is a terminal capacity consumer. Each forwarded request counts as one database request; adding the component does not add query timing, read/write semantics, replication, or response traffic.

## Open decisions

- Server-forwarding, round-robin, validation, and accounting details are explicit proposals in [release-1.md](../release-1.md) for final review.
- Queues are future work requested for the next release discussion. Concurrency remains outside release 1.

Future features are recorded in [follow-up.md](../follow-up.md). A queue is requested for the next release discussion; release planning will decide its precise scope.
