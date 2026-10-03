# ADR 0006: Store architecture documents in SQLite with latest-version saves

Date: 2026-10-03
Status: Accepted on 2026-10-03 with the consolidated release 1 contract

The agreed [release 1 contract](../release-1.md) resolves the release defaults discussed below. Earlier proposal and open-decision wording records the interview progression; future-release and conditional-performance questions remain deferred.

## Decision recorded

- Use SQLite for the small local architecture library.
- Retain the latest saved version of each architecture; automatic revision history is not required for the first phase.
- Architecture export is future work and is not required for release 1; see [follow-up.md](../follow-up.md).
- Saving is explicit, through a frontend Save action.
- Prompt about unsaved changes when leaving if the user has not saved.
- Save the architecture and configuration of its components.
- The user allows retaining the RPS to test; retain it alongside the architecture configuration.
- Additional run data is outside the requested saved payload; simulation results and playback state are not persisted.

## Proposed storage shape

The storage option accepted in the interview holds each architecture as a whole JSON document, with metadata for listing saved architectures. Exact fields and the document schema are still to be defined. Nodes and edges need not be normalized into individual relational records.

## Consequences

- A library can contain multiple saved architectures.
- Saving changes to one architecture updates its saved state rather than keeping every prior revision.
- Document format versions and architecture revision history are distinct concepts.

## Open decisions

- Whether a copy/Save As action is needed.
- Metadata fields and document schema.
- Export/import format and validation are deferred with export.

## Terminology clarification

"Workload settings" in earlier questions referred to test RPS, caller count, and run duration. The user requested concrete architecture/component configuration plus optionally test RPS. Caller count belongs to client-group configuration; run duration remains a runtime control unless explicitly added later.

## Browser facts relevant to the exit prompt

If the frontend runs in a browser, closing/reloading/leaving a tab can request the browser's standard leave/stay confirmation through `beforeunload`. Its text and buttons cannot be customized, prior user interaction is required, and some termination paths do not fire the event. See [MDN beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event) and [Chrome Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api).

An app-controlled action, such as opening a different architecture, can use a custom Save/Discard/Cancel dialog. This is a proposed interaction, not a requirement to add a desktop wrapper.
