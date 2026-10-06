# Frontend architecture editor specification

Date: 2026-10-03
Status: Phase-one implementation complete and ready for user acceptance testing. The initial specification was approved on 2026-10-03 and first implemented with browser-local placeholders. The user confirmed browser acceptance tests plus separate editor/domain unit tests.

Subsequent integration: the user requested wiring to the implemented backend. The [backend integration spec](backend-integration-spec.md) supersedes the browser-only persistence requirements below; the canvas/editor behavior remains applicable.

Phase-one scope: the [visual specification](canvas-visuals-spec.md) and [clipboard/resizable-panel specification](editor-productivity-spec.md) complete the requested editor scope. These changes are implemented alongside backend persistence. The subsequent [simulation Run and Replay specification](simulation-replay-spec.md), accepted on 2026-10-06, extends the editor with unsaved Run and recorded results. User acceptance testing remains the final confirmation.

## Problem Statement

The user needs to create architectures, explicitly save them, reopen them, and modify their topology and configuration through a canvas. At specification authoring, the repository contained product decisions and an approved architecture-library API contract, but no frontend or backend implementation.

Waiting for the backend would prevent the architecture editor from being built and used. A static mockup would also be insufficient: adding components, changing connections, editing configuration, and saving must affect the architecture the user can reopen. The frontend must therefore work with local placeholders while preserving the future API's document shape and explicit Save behavior.

## Solution

Specify a local browser application with a component palette, an interactive architecture canvas, configuration inspectors, and a saved-architecture library. The user builds a directed, acyclic architecture using Caller Group, Load Balancer, Gateway, Server, and Database components. Selecting a component or connection on the canvas exposes its editable configuration.

Use a browser-local placeholder store for real create/save/open/replace/delete interactions. Saved architectures survive a page reload in the same browser profile and origin; unsaved changes remain a working document until the user selects Save. Label this storage mode clearly in the library. The frontend sends no architecture requests to a backend and does not require a backend process to run.

Keep saved documents compatible with the existing OpenAPI design contract. The placeholder store occupies the future persistence boundary, allowing a later task to introduce an HTTP adapter without redesigning the canvas or saved-document format. This milestone delivers the architecture editor and library; simulation remains a subsequent milestone.

## User Stories

1. As an architecture designer, I want to start a new empty architecture, so that I can build a system from scratch.
2. As an architecture designer, I want to name my architecture, so that I can recognize it in the saved library.
3. As an architecture designer, I want to see whether an architecture is new, saved, changed, saving, or failed to save, so that I understand its persistence state.
4. As an architecture designer, I want a palette of the five release 1 component types, so that I can model the agreed system components.
5. As an architecture designer, I want to drag components from the palette onto the canvas, so that I can place them where they make sense.
6. As an architecture designer, I want to add a component using a button as well, so that drag-and-drop is not my only way to build an architecture.
7. As an architecture designer, I want useful initial labels and configuration, so that each newly added component is immediately editable and saveable.
8. As an architecture designer, I want to move existing components on the canvas, so that I can organize the diagram without recreating them.
9. As an architecture designer, I want to pan, zoom, and fit the diagram into view, so that I can navigate an architecture larger than the visible canvas.
10. As an architecture designer, I want node positions preserved on Save, so that reopening restores the diagram I arranged.
11. As an architecture designer, I want directed connections with visible arrows, so that traffic direction is clear.
12. As an architecture designer, I want to connect components using canvas handles, so that topology changes happen directly on the diagram.
13. As an architecture designer, I want an inspector action for creating a connection, so that I can connect components without a pointer-drag gesture.
14. As an architecture designer, I want invalid connections rejected with an explanation, so that I can correct a proposed topology change.
15. As an architecture designer, I want cycles and loopbacks prevented, so that my architecture follows the agreed graph rules.
16. As an architecture designer, I want valid merged paths and multiple Caller Groups allowed, so that the editor supports an acyclic graph rather than restricting me to a tree.
17. As an architecture designer, I want to select a component on the canvas and edit its label, so that the diagram describes its purpose.
18. As an architecture designer, I want to configure Caller Group caller count and total test RPS, so that my intended offered traffic is saved.
19. As an architecture designer, I want total group RPS explained clearly, so that I do not confuse it with RPS per caller.
20. As an architecture designer, I want to configure the maximum RPS of processing components, so that later simulation can use my chosen capacities.
21. As an architecture designer, I want Caller Groups to omit a capacity control, so that the interface reflects their source role.
22. As an architecture designer, I want to select round-robin or weighted routing on a Load Balancer or Gateway, so that my intended routing policy is retained.
23. As an architecture designer, I want to edit relative destination weights, including zero and fractions, so that I can describe my intended traffic split.
24. As an architecture designer, I want to reorder a router's destinations, so that deterministic routing preserves the destination order I selected.
25. As an architecture designer, I want connection weights retained when switching routing policies, so that changing policies does not erase my configuration.
26. As an architecture designer, I want to redirect or remove an existing connection, so that I can revise a path without rebuilding the architecture.
27. As an architecture designer, I want deleting a component to remove its incident connections, so that the remaining diagram has no dangling references.
28. As an architecture designer, I want inline feedback for invalid configuration, so that I can fix fields before saving.
29. As an architecture designer, I want to save empty, disconnected, and partially configured diagrams, so that I can stop editing before an architecture is ready to simulate.
30. As an architecture designer, I want explicit Save, so that canvas interactions do not silently replace my saved architecture.
31. As an architecture designer, I want my first Save to create one library entry, so that I can return to the architecture later.
32. As an architecture designer, I want later Saves to replace that same entry, so that the library holds its latest saved version.
33. As an architecture designer, I want edits made during a pending Save preserved, so that completing an earlier Save cannot overwrite newer work.
34. As an architecture designer, I want failed Saves to retain my edits and the previous saved version, so that I can retry without reconstructing the architecture.
35. As an architecture designer, I want to open a library with names and timestamps, so that I can choose a saved architecture.
36. As an architecture designer, I want duplicate names to remain separate entries, so that identity does not depend on a name being unique.
37. As an architecture designer, I want reopening to restore labels, positions, connections, capacities, caller settings, weights, and destination order, so that I can continue from my saved work.
38. As an architecture designer, I want saved architectures to survive a page reload, so that placeholders support a useful editing workflow before the backend exists.
39. As an architecture designer, I want to rename an opened architecture and save it, so that its library entry reflects its current purpose.
40. As an architecture designer, I want to confirm deletion of a saved architecture, so that I do not accidentally remove it from my library.
41. As an architecture designer, I want Save/Discard/Cancel when leaving a changed architecture, so that I control whether the changes are kept.
42. As an architecture designer, I want a browser leave warning when unsaved changes exist, so that closing or reloading the page can warn me about losing work.
43. As an architecture designer, I want clear empty, loading, missing-entry, and storage-error states, so that I understand why an operation cannot complete.
44. As an architecture designer, I want keyboard access to selection, configuration, connection, and removal controls, so that I can use the editor without relying entirely on dragging.
45. As an architecture designer, I want the library to explain that it uses browser-local placeholders, so that I know where my saved architectures are available.
46. As a frontend developer, I want typed documents that match the approved OpenAPI contract, so that future API wiring does not require changing the editor's domain model.
47. As a frontend developer, I want browser acceptance tests and separate editor/domain unit tests, so that the complete workflow and its graph/state rules are verified independently.

## Implementation Decisions

### Delivery boundary and technologies

- Build the architecture editor and saved library as release 1 milestone 1, following the existing CRUD-before-simulation sequence. This document specifies that work; it does not implement the application.
- Retain Svelte, TypeScript, Svelte Flow, and Tailwind as the implementation defaults already accepted in the release contract. Use strict TypeScript checking for handwritten frontend code and tests. Select and pin compatible dependency versions during implementation.
- The app runs locally as a browser frontend. No backend startup, API credentials, authentication, or deployment is required.
- Architecture reads and mutations use a local placeholder adapter exclusively. Do not add fetch calls, an HTTP client, endpoint polling, or a configurable live-API mode in this milestone. Dependencies and frontend assets are outside this restriction on architecture operations.
- Do not calculate traffic, runtime capacity use, or routing results in the frontend. If a Simulate action is shown, it is disabled with an explanation that simulation is unavailable. Omit fabricated metrics, traffic animation, playback controls, and result panels from this milestone.

### Application surfaces

| Surface | Required behavior |
| --- | --- |
| Editor header | New, Library, architecture name, explicit Save, and a readable save-state indicator. The active name is editable here. |
| Component palette | Caller Group, Load Balancer, Gateway, Server, and Database; each supports drag-to-canvas and an Add button. |
| Architecture canvas | Custom typed nodes, directed connections, selection, dragging, connection creation/redirection, removal, pan, zoom, and fit-to-view. |
| Component inspector | Label and type-specific configuration for the selected node; deletion, coordinate editing, and connection controls. Component type is displayed, not changed in place. |
| Connection inspector | Source, target, direction, removal, and endpoint-redirection controls. Weight editing applies to weighted-router connections. |
| Router destination inspector | Outgoing destinations sorted by source-local order, weight controls for weighted routing, and Move up/Move down actions. |
| Architecture library | Saved metadata, Open and Delete actions, empty/loading/error states, and a browser-local storage notice. |

- Keep the canvas as the primary editing surface. Inspectors are tied to canvas selection; do not add a raw JSON editor as the way to modify architectures.
- Render the component type and label distinctly on each node. Compact configuration summaries may show test RPS or configured maximum RPS; those values are configuration, not measured results.
- Use the type-specific canvas symbols in [the canvas visual specification](canvas-visuals-spec.md) so that component types remain recognizable when labels change. These replace the initial small-icon cards.
- Use a desktop browser layout that keeps the canvas usable while palette, library, or inspector panels are open. At narrower desktop widths, panels may collapse or open as drawers. Touch-specific mobile canvas behavior is outside this milestone.
- The palette and inspector must be resizable through draggable, keyboard-accessible dividers. Their contents adapt to the panel width, as defined in [the editor productivity specification](editor-productivity-spec.md).
- A clean first visit opens an empty new architecture and an empty saved library. Do not automatically insert sample architectures or repopulate deleted entries. Fixtures belong to development and tests.

### Domain document and canvas mapping

- Use the OpenAPI contract's discriminated component union and snake_case fields as the saved domain shape. Common component fields are id, type, label, position, and capacity_rps; variant fields belong only to their specified component type.
- A saved write contains only name and document. The document contains format_version equal to 1, nodes, and edges. A saved resource additionally contains id, created_at, and updated_at. Library summaries contain those metadata fields plus format_version.
- Keep Svelte Flow presentation objects separate from the contract document. Explicit mapping retains every contract field and excludes handles, selection flags, dimensions, viewport state, validation messages, and other canvas-library properties. The canvas and inspectors update the same working domain document; they must not maintain divergent copies of the graph.
- Generate stable component and connection IDs that satisfy the contract pattern and are unique across both collections. Moving, configuring, reordering, saving, and reopening preserve those IDs. Architecture IDs are a separate UUID v4 namespace assigned by the placeholder store on first Save, standing in for future backend-generated IDs.
- Preserve node and edge array order. Destination routing order is determined by the edge order field per source, independently of the global edge-array order. Do not derive it from horizontal position, rendering order, or node labels.
- The inspector does not show Canvas Position fields. Use canvas dragging or focused-node arrow keys to change positions. Positions are finite canvas coordinates, including negative and fractional values. Convert palette drops through the current pan/zoom transform. Dragging an existing node changes its persisted position; pan, zoom, fit-to-view, focus, and selection do not mark the architecture changed.
- On reopening, use saved node coordinates and fit the viewport around the diagram. The exact former viewport is not saved. An empty canvas uses a sensible initial view.
- Do not save simulation results, playback state, runtime tick count, or derived routing cursors. format_version describes the document format, not retained historical revisions.

### Component configuration

All new components must be complete, correctly typed objects before the user supplies further configuration. The following are frontend defaults, not defaults inferred or supplied by the future API.

| Component | Contract tag | Initial configuration | Inspector fields |
| --- | --- | --- | --- |
| Caller Group | caller_group | caller_count 100; test_rps 100; capacity_rps null | Label, caller count, total test RPS. No capacity input. |
| Load Balancer | load_balancer | capacity_rps 100; routing_policy round_robin | Label, maximum RPS, routing policy, destinations. |
| Gateway | gateway | capacity_rps 100; routing_policy round_robin | Label, maximum RPS, routing policy, destinations. |
| Server | server | capacity_rps 100 | Label, maximum RPS. Zero or one outgoing connection. |
| Database | database | capacity_rps 100 | Label, maximum RPS. No outgoing connection. |

- New labels begin with the component's domain name. A numeric suffix may distinguish repeated types; duplicate labels are allowed and IDs determine identity.
- An Add button places a node near the visible canvas center with an offset from existing nodes. Select the new node and show its inspector.
- Explain Caller Group test RPS as total group traffic: 100 callers at 100 total test RPS represent 100 requests per second total, rather than 100 per caller. Changing caller count does not silently recalculate test RPS.
- Labels and names must be nonblank and contain at most 120 characters as submitted. Trim outer whitespace from architecture names on successful Save; preserve component labels as submitted, as the contract requires.
- Caller counts and processing capacities are positive safe integers. Total test RPS and connection order are nonnegative safe integers. Their maximum is 9,007,199,254,740,991. Coordinates and weights must be finite numbers; weights are nonnegative and may be fractional.
- Parse numeric form input deliberately. Blank input is invalid, not zero; reject fractions in integer fields and values outside the safe integer range. Saved numeric fields are JSON numbers, not strings or booleans. Caller capacity is always null, and null is not allowed for processing capacity.
- Apply valid field changes to the working document as the user edits. Retain temporarily invalid field text in editor-only form state, display its error, and prevent Save until corrected. Leaving a field, selecting another element, or opening the library must not silently reset invalid text or save a previous valid value. Outstanding invalid form edits count as unsaved changes.
- Coordinate inputs and connection controls in the inspector provide alternatives to pointer dragging. Changing a component's type requires removing it and adding a new component; no implicit conversion drops variant configuration.

### Connections, graph edits, and destination order

- Each connection stores id, source, target, order, and weight. New connections start with weight 1 and an order after the source's existing destinations. Choose a unique nonnegative safe order; if appending would exceed the allowed range, compact that source's orders while preserving its existing destination sequence.
- Enable outgoing handles only where the component role permits them. Caller Groups expose no incoming handle; Databases expose no outgoing handle. An inspector connection action uses the same candidate validation as a canvas gesture.
- Reject self-connections, cycles, missing endpoints, duplicate directed source/target pairs, and role violations before committing an edit. A failed gesture or inspector action leaves the existing graph unchanged and explains the reason. Moving nodes must not affect graph validation.
- Caller Groups may have at most one outgoing connection while editing and no incoming connections. Servers may have at most one outgoing connection. Databases have no outgoing connections. Load Balancers and Gateways may have multiple destinations; processing components may have multiple incoming paths if the graph remains acyclic.
- Permit deleting or redirecting a selected edge. Validate redirection against a candidate graph in which the old edge has been removed, so replacing an edge does not falsely exceed the source's outgoing limit. An invalid redirection retains the old edge.
- Preserve the connection ID and weight on redirection. If the source is unchanged, preserve order. If the source changes, assign a unique order at the end of the new source's destinations. Removing an edge need not renumber surviving orders; gaps are valid.
- Removing a node removes all its incoming and outgoing connections in the same edit. Clear selections and form errors associated with removed elements. Do not leave dangling edges for Save to discover later.
- Display a router's destinations in ascending order. Move up/Move down changes that source's persisted order values to reflect the requested sequence; it does not reorder the document's global edge array or change IDs. Distinct sources may reuse the same order values.
- Relative weights need not sum to 100. Preserve zero and fractional weights. A weighted router's inspector may display each destination's normalized percentage as a configuration aid; all-zero weights display an incomplete-routing message rather than dividing by zero.
- Round-robin hides weighted percentages and weight editing but retains stored weights. Weights also remain present on single-output Caller Group and Server edges even though those roles do not use them. Switching back to weighted routing restores the retained values.
- Destination order matters for both policies: round-robin visits that order, and future weighted rounding favors positive-weight destinations in that order. Describing this behavior must not introduce a routing engine into the editor.

### Save validation and incomplete diagrams

- Enforce the contract's typed shape and structural graph rules before Save and inside the placeholder store. Stored resources are validated on read as well; TypeScript declarations alone do not validate browser storage.
- Reject unknown fields, unsupported types/policies or document versions, invalid numeric values, blank names/labels, invalid or duplicate IDs, missing endpoints, duplicate connections or source-local orders, cycles, and component-role violations.
- Allow empty graphs, disconnected components, multiple Caller Groups, graphs without a Caller Group, unconnected Caller Groups/routers, and weighted routers with no destinations or all-zero weights. These are valid editing states and must remain saveable.
- Missing minimum destinations and all-zero weighted routing may show nonblocking explanatory hints. They must not disable Save or be reported as Save validation errors. Do not add simulation-readiness flags or a simulation-validation endpoint.
- Show field-specific errors beside inputs and select/focus the relevant component or connection when possible. Use a persistent, accessible error summary for document-wide or storage errors. Branch on stable error codes rather than exact message text.

### Working document, explicit Save, and navigation

- The editor owns the active working name/document, its optional saved architecture ID, the last successful saved baseline, form drafts, and operation state. Persisting a library entry never implies automatic persistence of the working document.
- New creates an empty document with format_version 1 and a valid editable default name, Untitled architecture. It has no saved ID. A pristine new document can be abandoned without a prompt, and Save can explicitly create even that empty document.
- For an opened architecture, compute changed state from the working name/document relative to the last successful saved baseline, plus outstanding invalid form edits. Compare object content independently of object-key order while preserving array order. Returning all content to the baseline clears changed state. A new document becomes changed when edited from its pristine state.
- Distinguish New/unsaved, Saved, Unsaved changes, Saving, and Save failed with text. Keep Save available for a valid new architecture and a valid changed architecture. Invalid fields block persistence and provide actionable feedback. A clean saved architecture needs no repeat Save.
- Display Saving and Saved in a strong, brighter green with bold text (700 weight), including their spinner/check icon. Saving must retain this style while the captured document is still dirty. Unsaved changes and Save failed must remain visually distinct and must not use the successful-save style.
- Capture an immutable name/document snapshot when Save starts. First Save calls the placeholder create operation; subsequent Saves call complete replacement for the same architecture ID. Permit only one Save in flight per active architecture and prevent double-clicks or shortcuts from creating duplicate entries.
- Ordinary Save may leave canvas/configuration editing enabled. On success, adopt returned metadata and the authoritative saved snapshot as the baseline. If edits occurred after capture, retain them and keep the document changed. Apply name normalization to a current field only when that field has not been edited since capture. Later Save of a first-created document replaces the returned ID rather than creating another entry.
- A failed Save leaves the working document and form drafts intact, retains changed state, and does not replace the previous baseline or library entry. Show the cause and a Retry action. No automatic retry of first Save creates additional entries.
- New, opening another saved architecture, and leaving the editor for the library require Save/Discard/Cancel when changes or invalid drafts exist. Viewing the library in a drawer without abandoning the editor is allowed without a prompt; actually replacing the working document still requires the guard. Cancel preserves the editor, selection, field drafts, and pending destination.
- Discard restores the last saved baseline before completing the requested navigation, or abandons the new unsaved document. Save in this dialog commits the current form values first, blocks if invalid, and navigates only after persistence succeeds. Temporarily lock editing for this navigation-triggered Save so additional edits cannot be stranded. Failure leaves the dialog/editor available and does not navigate.
- While a Save is already pending, defer document-switching and deletion actions until it settles, then evaluate the guard against the latest working state. A delayed completion must never replace a different active architecture.
- Register the browser's standard leave/stay warning while changes or form drafts exist, including during a pending Save. Remove it when clean. Follow the existing ADR's browser limitations: this warning is best effort, its text is browser-controlled, and it does not perform an asynchronous Save on unload.
- Support the usual Save keyboard shortcut within the application. Delete/Backspace removes selected graph elements only when canvas focus is active; typing in form fields must never delete a node. Escape cancels a connection gesture or closes a dismissible panel without discarding work.
- Support Ctrl/Cmd+C and Ctrl/Cmd+V for a selected component, including repeated paste and paste into another architecture. New IDs, copied configuration, offset positions, selected pasted components, and native text-field behavior follow [the editor productivity specification](editor-productivity-spec.md).

### Placeholder library and future persistence boundary

- Build a typed architecture-store interface with asynchronous create, list, get, replace, and delete operations corresponding to the existing operation meanings. Inputs and resource/error outputs match the approved contract. The interface has a browser-local implementation only in this milestone; it is not an HTTP client.
- Use browser localStorage for the small placeholder library, with one namespaced, versioned store containing complete saved resources. Keep the store-envelope version separate from document format_version. Commit mutations by writing the complete candidate store successfully before resolving the operation or updating visible library state.
- The adapter assigns UUID v4 architecture IDs and UTC RFC 3339 timestamps ending in Z. Creation sets created_at equal to updated_at. Changed replacement keeps ID/created_at and advances updated_at; an identical normalized replacement preserves both timestamps. Names may be duplicated.
- List returns metadata only, ordered by updated_at descending and then ID ascending. Open returns the complete saved resource. Whole-document replacement removes omitted components and connections; the store never merges arrays, repairs dangling edges, or upserts a missing ID.
- Persist saved snapshots only. Do not autosave canvas changes or invalid form drafts. Reload restores the saved library and starts a clean editor; reopening an entry restores its latest successful Save. Browser storage cleared by the user, another browser profile, or a changed frontend origin does not carry this placeholder library forward.
- Do not seed real user storage. Use contract-shaped fixtures for tests covering all five components, an empty document, a disconnected document, and weighted destinations including fractional/zero weights and nonconsecutive order values.
- Surface unavailable storage, write/quota failure, corrupt stored resources, and unsupported store/document versions explicitly. Do not silently reset corrupt storage, clear the library, or claim a successful Save. Offer retry where useful; preserve any readable previous state and current edits. No in-memory fallback may present itself as a durable Save.
- Missing entries return architecture_not_found; schema/graph failures use validation_error with the contract's detail codes; storage failures use storage_unavailable; corrupt resources use internal_error; unsupported document versions use unsupported_document_version. Each follows the ErrorResponse envelope with an always-present details array and applicable JSON Pointer locations. Browser-store version errors remain a local adapter error with a readable explanation.
- A missing entry during Open leaves the current editor intact and permits refreshing the library. A missing saved ID during Save preserves the current work and reports the problem; it does not silently create a second architecture. Individual component copying is available; full architecture export remains deferred.
- Show real operation states even if normal local operations resolve quickly. Tests may inject delayed completion and failures through the same store interface; do not add artificial user-facing latency or simulate failure randomly.
- Later API wiring will map the store's operations to the agreed HTTP operations. It is a separate task and must preserve explicit Save, document replacement, IDs, form behavior, and error mapping. SQLite remains the agreed eventual backend persistence; browser storage is the temporary frontend placeholder.

### Library actions and deletion

- Show names, created and last-saved timestamps, and a way to distinguish entries with duplicate names. Timestamps may be localized for display without changing stored UTC values. An empty library offers New; list/load errors offer retry.
- Rename the opened architecture through the header, then Save the complete current document. Do not add an independent library rename operation that could bypass pending canvas edits.
- Confirm deletion using the architecture's name and state that it removes the saved entry. Delete only after confirmation; success removes the entry, and failure retains it. Keep the dialog actionable until the operation completes.
- Deleting a different library entry leaves the active editor unchanged. Deleting the active entry uses a single confirmation that also explains any unsaved work will be discarded; success resets to a pristine new architecture. Cancelling or failing preserves both saved and working state. Do not Save an architecture as a prerequisite to deleting it.
- The library stores only the latest version of each ID. Duplicate, Save As, revision history, and exporting remain deferred.

### Accessibility and interaction feedback

- Give palette controls, nodes, edge actions, form fields, and dialogs accessible names. Provide visible focus, labeled validation messages, and text save/error states; do not communicate solely with color.
- Keyboard selection must reach node/connection inspectors. Add buttons, arrow-key component movement, endpoint selectors, and destination Move up/Move down actions cover the essential workflow without pointer dragging.
- Dialogs manage focus, return focus to the triggering control on cancellation, and do not leak deletion shortcuts to the canvas. Graph mutations triggered by keyboard and pointer use the same validation and document-edit behavior.

## Testing Decisions

The user requested browser acceptance tests plus separate editor/domain unit tests. These are the two test seams for this milestone. There is no existing frontend implementation or test suite to reuse; the backend specification provides prior acceptance examples for document round trips, replacement, invalid graphs, and failed persistence, but its HTTP/SQLite tests do not substitute for frontend tests.

Good tests verify observable user behavior, contract-shaped data, and pure graph/state outcomes. They do not assert Svelte internals, canvas-library object structures, storage key spelling, implementation-specific helper calls, or exact error wording. Prefer the complete browser application as the highest seam; use focused unit tests for branching graph rules and pending-operation state transitions that would be cumbersome to exhaust through gestures.

### Browser acceptance tests

- Use Playwright against the actual locally served frontend with its real browser-local placeholder adapter. Isolate storage per test. No backend process or intercepted API response is needed; verify that architecture workflows issue no backend requests.
- Use accessible labels for controls and stable public element identifiers where canvas gestures need them. Assert visible diagrams, inspector values, saved-library contents, and behavior after reopening/reloading. Avoid snapshots of canvas-library internals or brittle absolute screen coordinates.
- Use contract-shaped fixtures and narrowly injected delay/storage-failure controls only for otherwise inaccessible failure and race cases. Normal persistence cases use real browser storage. Include at least one actual failed browser-storage write rather than testing only a simulated UI error.

Acceptance scenarios:

1. A fresh browser context shows a new empty diagram and empty library. New is available without a backend; cancelling a pristine new diagram causes no unsaved-change prompt.
2. Name an empty architecture and Save it. It appears once in the library, can be reopened, and remains empty. Repeated Save input while pending cannot create duplicate entries.
3. Add all five component types through the palette, including a drag under a changed zoom/pan transform. Verify defaults and build a valid directed topology using canvas handles.
4. Select components, change labels and positions, configure total test RPS/caller count and processing capacities, and change router policies. Save/reopen restores the same values and visible layout; a page reload preserves the saved library.
5. Build weighted destinations with fractional and zero weights, reorder them, switch to round-robin and back, and Save/reopen. Weights, connection IDs, and source-local destination order remain unchanged except for intentional edits.
6. Open a saved architecture, move/add/remove nodes, redirect/remove edges, rename, and Save. Reopen the same ID to verify whole-document replacement, incident-edge removal, retained created timestamp, and advanced last-saved timestamp.
7. Attempt a self-connection, cycle, duplicate connection, incoming Caller Group connection, second Server output, and Database output. Each action explains the issue and retains the previous valid diagram. A valid merge into a processing component succeeds.
8. Save disconnected components, a Caller Group without an output, a router without destinations, and an all-zero weighted router. These states remain saveable despite incomplete-routing hints.
9. Enter blank/invalid names, labels, capacities, caller counts, RPS, and weights. Feedback is attached to the relevant controls, Save cannot persist stale valid values, and field drafts survive selection changes until corrected or explicitly discarded.
10. Open/New from a changed architecture and exercise Save, Discard, and Cancel. Save persists before navigation; Discard restores/abandons the appropriate draft; Cancel preserves the working diagram and form drafts. An invalid or failed navigation Save does not leave the editor.
11. Exercise a delayed ordinary Save, edit again before completion, and verify that success retains the newer edit and changed state. The next Save updates the same library entry. Document-switching waits for pending Save completion and still protects newer changes.
12. Cause a storage write failure on Save and Delete. The editor retains current work, the prior saved entry and timestamp remain unchanged, errors are visible, and retry succeeds after the failure is removed. Unavailable/corrupt storage is not silently reset or presented as saved.
13. List entries with duplicate names and verify ordering/identity, open one, cancel a deletion, and then confirm it. Deleting another entry preserves the editor; deleting the active one resets only after success and clearly warns about unsaved work.
14. Make an entry unavailable before Open or replacement. The error leaves the current diagram intact; refreshing the library updates its contents, and replacement does not silently create a new entry.
15. Exercise component addition, selection, inspector edits, connection controls and arrow-key movement, destination reordering, Save, and dialogs with the keyboard. Delete in a numeric/name field changes text rather than deleting a selected node. Selection, pan, and zoom alone do not mark the document changed.
16. Exercise the browser leave-warning hook after user interaction where automation supports native dialogs. Verify clean-versus-changed registration through observable navigation behavior. Do not claim protection against browser/process termination paths that cannot fire the warning.

### Editor/domain unit tests

- Test public editor commands/state transitions, document validation, and conversion between the saved domain document and canvas presentation. Keep them independent of Svelte rendering, browser storage, and HTTP.
- Verify contract-shaped round trips for all component variants, preserved IDs/array order, finite negative/fractional positions, caller capacity null, fractional/zero weights, and explicit destination order. Serialization excludes editor/runtime metadata and variant-inappropriate fields.
- Verify add/move/configure/remove/connect/redirect/reorder outcomes, including atomic incident-edge deletion, redirection evaluated without the old edge, preservation of unaffected IDs, and source-local order reassignment. Valid DAG merges must not be rejected as multiple parents.
- Verify graph rejection for duplicate IDs across collections, missing endpoints, duplicate directed pairs/orders, self-connections, cycles, and component-role restrictions. Verify acceptance of every incomplete Save state without invoking future simulation rules.
- Verify numeric/name/label bounds and parsing at meaningful boundaries: zero where allowed, zero where prohibited, fractions in integer fields, values above the safe integer maximum, nonfinite numbers, blank input, and the 120-character name/label limit.
- Verify dirty-state comparison, invalid draft retention, return-to-baseline behavior, immutable Save capture, failed-Save preservation, delayed first-Save ID adoption, newer-edit retention, name-normalization races, and guarded navigation after pending operations.
- Verify policy changes retain weights and destination order; percentages handle zero totals and do not mutate stored weights. Do not test request allocation, round-robin runtime cursors, or capacity/drop accounting before simulation exists.

During implementation, require strict frontend type checking, both test suites, and a production build to pass. A visual browser review should confirm that the canvas, arrows, inspector, dialogs, and long labels remain usable at normal and narrower desktop widths. This specification alone does not claim those implementation checks have run.

## Out of Scope

- Frontend implementation during this specification-writing task.
- API wiring, backend implementation/startup, HTTP mocks standing in for nonexistent endpoints, SQLite access from the frontend, and migration of browser placeholder data into a future backend.
- Simulation calculation, simulation endpoints, generated result placeholders, tick frames, playback, runtime counters, capacity colors based on runtime use, or traffic animation.
- Latency, caching, queues, retries, fanout, health-aware routing, and component types outside the five release 1 types.
- Automatic Save, persisted unsaved drafts, crash recovery, per-node server mutations, document-version migration, revision history, Duplicate, Save As, import, and export.
- Multi-user or concurrent multi-tab editing, conflict resolution, authentication, search/pagination, cloud synchronization, and deployment.
- Raw JSON editing, changing an existing node's type, automatic graph layout, grouped/bulk editing, and an undo/redo history system. These may be specified later without changing this milestone's explicit Save contract.
- Touch-specific mobile editing, a desktop wrapper, and infrastructure capacity predictions.

## Further Notes

- The [release 1 contract](../../docs/release-1.md), [domain glossary](../../docs/glossary.md), and accepted [ADRs](../../docs/adr/) define the product vocabulary and settled rules. The [backend API specification](../backend/backend-api-spec.md) and [OpenAPI design contract](../backend/backend-api.openapi.json) define saved documents and future resource operations. The frontend implementation uses browser-local placeholders independently of backend availability.
- This frontend milestone advances the existing architecture CRUD/Save sequence without changing the broader simulation agreement. Browser-local placeholder storage is a temporary implementation choice for the frontend, not a replacement for the agreed SQLite backend.
- Palette values, application surfaces, browser-local storage, field-draft handling, and concrete canvas interactions are implementation defaults synthesized for this specification. They were not all individually selected in the prior interview. The testing seam was checked with the user, who requested separate editor/domain unit tests in addition to browser acceptance tests.
- Issue-tracker publication is pending because no project tracker or triage configuration was supplied. Run `/setup-matt-pocock-skills`, then publish this specification to the configured tracker with the `ready-for-agent` label. No issue has been created by this task.
