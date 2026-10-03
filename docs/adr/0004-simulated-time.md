# ADR 0004: Model behavior using virtual time

Date: 2026-10-03
Status: Accepted on 2026-10-03 with the consolidated release 1 contract

The agreed [release 1 contract](../release-1.md) resolves the release defaults discussed below. Earlier proposal and open-decision wording records the interview progression; future-release and conditional-performance questions remain deferred.

## Decision recorded

- The simulation uses virtual time.
- Arrivals are evenly spaced for a configured RPS, from different callers.
- A client node represents a caller group. Its RPS is the group's total, shared evenly among callers; 100 callers with 100 total RPS means an average of one request per caller per second.
- Q14 accepted the recommendation of configurable duration, initially 60 virtual seconds, with per-second counts and whole-run totals.
- The first phase models traffic routing and request counts. Latency is deferred; virtual time does not imply modeling service or query duration.
- The user requests play/pause and fast-forward controls after pressing Simulate.
- A **tick** is one virtual second. Use this term for further model and interface discussions.
- Calculate a fixed snapshot and replay its results. Configuration changes require a new calculation to affect results.
- Use aggregate frames for release 1 rather than retaining individual request paths or caller-level traces. The user accepted the Q28 recommendation.
- Q30 accepted received/handled/dropped counts and capacity used = handled/configured capacity. These definitions are settled.
- One-hop-per-tick propagation is selected. Handled output becomes downstream input on the following tick.
- The default run length is 60 total ticks, configurable for larger/deeper systems.

## Consequences

- The model can represent behavior at different points during a run.
- Simulation time and computation duration are distinct quantities.
- Tick duration, one-hop propagation, snapshot replay, and aggregate frames are settled. Separate current/next traffic buffers prevent node iteration order from letting traffic skip ahead.
- Future queues and retries can retain state between ticks; both are outside release 1.

## Open decisions

- Clock-boundary, round-robin, validation, and library defaults are proposed together in [release-1.md](../release-1.md) for final review. Propagation mode is settled and must not be reopened.

## Replay representation

The Python backend calculates one frame per tick, containing node request/drop counts and edge traffic counts, plus whole-run totals. The frontend holds those frames in memory, displays the current tick, and advances its playback position at the selected speed. Pause stops advancing; replay does not recalculate routing. Frame fields and numeric metric meanings will be finalized with the remaining model decisions.

The complete JSON response is decoded once; playback selects successive frames. Result streaming is not required by the selected snapshot/replay model. Node IDs identify frame entries so multiple components of the same type can coexist.

The selected one-hop calculation is documented in [simulation-flow.md](../simulation-flow.md). The release draft starts at initial tick 0 and executes ticks 1–60 by default. It stops at the configured total and reports in-flight traffic, without automatically extending the run to drain it.
