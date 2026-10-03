# ADR 0002: Local first release within the current weekend

Date: 2026-10-03
Status: Accepted on 2026-10-03 with the consolidated release 1 contract

The agreed [release 1 contract](../release-1.md) resolves the release defaults discussed below. Earlier proposal and open-decision wording records the interview progression; future-release and conditional-performance questions remain deferred.

## Decision recorded

- Complete release 1 during the weekend of October 3–4, 2026. Earlier interview references to "first phase" mean this release.
- Run it locally.
- Do not deploy it during this release.
- Save architectures in a small local database so previous architectures can be reopened.
- Export was initially requested but is now deferred to the follow-up backlog.

## Consequences

- The scope must fit the weekend deadline.
- Hosted deployment is outside the first phase.
- A persistent library of architectures belongs in release 1.
- SQLite will hold saved architecture documents; each architecture retains its latest saved version. See ADR 0006.

## Open decisions

- The precise release 1 acceptance criteria and component roles; five component types are selected, including Database.
- The saved-document schema and save interaction details.
- The supported workload size and acceptable run duration.
