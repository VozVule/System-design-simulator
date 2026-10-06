# ADR 0008: Synchronous request and response flow

Date: 2026-10-06
Status: Accepted by the user on 2026-10-06 with the detailed simulation specifications. Parallel frontend and backend implementation was requested on the same date.

## Context

The earlier release 1 model counted handling at a terminal Server or Database as completion. The user clarified that synchronous traffic must cover the full flow: caller to Server to Database, then a Database reply to Server and a final response to the caller. The user selected capacity limits for new requests only and required overflow to be dropped without processing.

## Decisions

- Keep the saved request architecture acyclic. Replies follow the actual traversed connections in reverse; no reverse architecture edges are required.
- Apply one-hop-per-tick propagation to requests and replies, including newly created replies.
- Database or terminal Server handling creates a successful reply. Completion occurs when the Caller Group receives it.
- Replies do not consume component capacity, change routing cursors, or undergo a fresh routing decision. Waiting for a reply does not consume later ticks' RPS allowance.
- Excess incoming requests are discarded immediately and create no error response. The simulator records the drop; it does not invent a caller-delivered failure status or timeout.
- Preserve original caller and route information in aggregate cohorts. Do not allocate one object per request or expose individual traces.
- Retain the 60-tick default and exact selected run length without drain ticks. Record active forward and reverse traffic as in flight at the final boundary.

## Consequences

`generated = caller completions + dropped + in flight` remains the global accounting rule. A drop leaves active traffic immediately. In flight counts active original requests on either leg and does not count an upstream waiting context as another request.

For `Caller → LB → Server → Database`, first successful completion moves from tick 4 to tick 7. At 100 source RPS and capacities 100/60/60, a 60-tick run yields 6,000 generated, 3,240 completed, 2,320 dropped, and 440 in flight. Database handling remains 3,420 visits.

Replay needs separate request/response directions and counts on each existing connection, plus separate request-capacity and response metrics in the inspector. The accepted layout remains unchanged.

This supersedes the one-way terminal-completion and response-exclusion defaults described in the earlier release contract and [ADR 0005](0005-first-phase-traffic-routing.md). See the current [simulation flow](../simulation-flow.md), [backend specification](../../specs/backend/simulation-spec.md), and [frontend specification](../../specs/frontend/simulation-replay-spec.md).
