# ADR 0001: Product purpose and limits of simulation claims

Date: 2026-10-03
Status: Accepted on 2026-10-03 with the consolidated release 1 contract

The agreed [release 1 contract](../release-1.md) resolves the release defaults discussed below. Earlier proposal and open-decision wording records the interview progression; future-release and conditional-performance questions remain deferred.

## Context

The overview describes a visual simulator for distributed system architectures. The initial interview framed its success around teaching, which the user explicitly rejected.

## Decision recorded

- The product is for simulating and visualizing architectures.
- It may be used for learning, and its creator intends to use it that way, but educational objectives must not dictate the product's behavior or scope.
- The simulator cannot promise real infrastructure capacity.

## Consequences

- Evaluate proposed features against architectural simulation and visualization needs, rather than required lessons or an interview-preparation curriculum.
- Distinguish modeled behavior from claims about real deployments.
- The meaning and validity of modeled results still need agreement. Rejecting real capacity predictions does not settle the simulation model.

## Open decisions

- What behavior must the first model represent?
- Which assumptions and limitations must accompany results?
- What reference examples will establish that the implementation follows its stated model?
