# ADR 0007: Shared capacity and fixed weighted rounding

Date: 2026-10-03
Status: Accepted on 2026-10-03 with the consolidated release 1 contract

The agreed [release 1 contract](../release-1.md) resolves the release defaults discussed below. Earlier proposal and open-decision wording records the interview progression; future-release and conditional-performance questions remain deferred.

## Decision recorded

- All component types support configurable capacity. The user prefers a common BaseComponent abstraction for shared configuration and accounting.
- Q31 clarified that caller-group capacity is irrelevant and unused for release 1. Its generation uses configured test RPS directly; shared fields do not force source admission behavior.
- Capacity resets per tick, and excess requests are dropped.
- No cycles or loopbacks are allowed.
- Weighted allocations are deterministic. Three requests at 50/50 allocate 2 to the first destination and 1 to the second every tick.
- Do not rotate weighted remainders between ticks to compensate for this fixed allocation.

## Consequences

- At small request counts, realized proportions may differ from configured weights. The 3-request 50/50 case realizes 2/1 per tick; this is intentional.
- Destination order must be explicit and persisted so "first" remains stable after saving and reopening an architecture.
- Shared capacity accounting preserves type-specific behavior: callers generate and routers select destinations. The release draft allows servers to terminate a path or forward through one connection.
- Saved component configuration and runtime counters are separate. Received/accepted/dropped values are derived during a run, rather than user-configurable capacity inputs.

## Proposed implementation details

- For weighted routing, normalize positive weights, floor each destination's proportional count, then distribute remaining whole requests one at a time in configured destination order. This formula is proposed to generalize the user's fixed-order example and is subject to final design review.
- No weighted rounding debt is carried into later ticks.
- Keep round-robin behavior separate from weighted rounding. Its across-tick cursor rule remains to be finalized.

## Open decisions

- One-hop propagation is settled; source-capacity accounting is closed as unused.
- Server-forwarding, round-robin, and validation defaults are proposed in [release-1.md](../release-1.md) for final review.
