# ADR 0003: Start in Python and make a Go migration conditional

Date: 2026-10-03
Status: Accepted on 2026-10-03 with the consolidated release 1 contract

The agreed [release 1 contract](../release-1.md) resolves the release defaults discussed below. Earlier proposal and open-decision wording records the interview progression; future-release and conditional-performance questions remain deferred.

## Decision recorded

- Start the backend in Python.
- Consider switching to Go if performance and calculation latency become a problem for complex systems.
- The user has no strong frontend technology preference.

## Consequences

- A Go rewrite is conditional, rather than a scheduled phase.
- The frontend technologies in the overview remain candidate choices, rather than user-imposed constraints.
- The engine/API separation in the overview remains an existing proposal; these answers do not settle the API contract or guarantee a migration will preserve model behavior.

## Open decisions

- What workload and architecture size define a complex system?
- What calculation duration is unacceptable?
- How to distinguish an engine bottleneck from API, serialization, or UI overhead before considering migration.
