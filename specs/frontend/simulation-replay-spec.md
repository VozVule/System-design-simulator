# Simulation Run and Replay specification

Date: 2026-10-06
Status: Accepted by the user and implemented on 2026-10-06, including the synchronous-response and traffic-display amendments. Strict Svelte/TypeScript checks, 104 unit tests, 14 simulation browser cases, and the production build pass. The 40 existing editor browser cases also pass. Visual review covers approximately 20 components, capacity states, long labels, zero traffic, reduced motion, keyboard focus, and 800/1024/1440-pixel widths. Vertical and backward connections pass text-clearance and label-containment checks. The guide, canvas tools, and timeline pass separate-space checks at 1280 × 720, 1024 × 600, 800 × 520, and 640 × 520, including a visible snapshot notice. Ready for user review of the final interface.

### Confirmed request and response scope

On 2026-10-06, the user selected responses that return through the actual request path to the Caller Group. Request traffic and returning responses each advance one hop per step. Database handling, or handling at a terminal Server, creates a successful response; the request completes only when that response reaches its originating Caller Group.

Configured capacity applies to new requests only. Returning responses use no capacity and follow the recorded return path without another routing decision. Unhandled overflow drops immediately and silently: it creates no error response, timeout, or caller-delivered failure status. Dropped traffic is excluded from active in-flight traffic. The accounting rule is `generated = completed + dropped + in_flight`.

The accepted canvas/timeline/inspector layout is retained, with separate request and response directions on each connection. This milestone includes no caller waiting/awaiting metrics or failed status because a silent drop receives no reply. In-flight describes active modeled traffic, not every request for which a caller might still expect a reply.

## Purpose and related contracts

Run the current architecture, including unsaved changes, and inspect the backend's recorded result on the canvas. Keep the working architecture separate from the immutable run snapshot so that later edits cannot change the meaning of existing results.

This extends the [architecture editor](frontend-spec.md), [backend integration](backend-integration-spec.md), [component visuals](canvas-visuals-spec.md), and [editor productivity](editor-productivity-spec.md) specifications. The [backend simulation specification](../backend/simulation-spec.md) defines the authoritative calculation and HTTP contracts. The settled model is recorded in [simulation flow](../../docs/simulation-flow.md) and [release 1](../../docs/release-1.md).

The expected architecture size is approximately 20 components. This is a design and verification target, not a component-count limit. Request types are deferred to a later release; this milestone retains the existing round-robin and weighted routing model.

## Run input

- Provide a Run action in Edit mode. Capture the complete current architecture document, including positions, component configuration, Caller Group total test RPS, connections, weights, and destination order. Run does not require an architecture to have been saved.
- Provide an adjustable positive safe-integer run-length input. Its default is 60. Label the input **Total steps**, use **Step** for the visible playback position, and do not show an elapsed-time readout. The API and engine retain the names `total_ticks` and `tick`; one step remains one virtual second under the settled model.
- Send POST `/api/v1/simulations` with `{ "document": <captured document>, "total_ticks": <selected length> }`. Do not send an architecture name or saved architecture ID. Use the existing configured backend origin and JSON request conventions.
- Run uses current valid field values. Outstanding invalid component or connection drafts block Run with a message that identifies the fields; do not silently use earlier valid values. An invalid architecture-name draft affects Save but does not block Run because the name is not simulation input. An invalid Total steps draft blocks Run without changing the last valid input or a previous result.
- The backend performs authoritative simulation-readiness validation. A valid run must have a Caller Group, meet the release 1 role and routing rules, and have every component reachable through directed connections from a Caller Group. A zero-RPS caller and a zero-weight route do not make a structurally reachable component invalid. All-zero weights on a weighted router remain invalid.
- Keep Save validation separate: empty, disconnected, and otherwise incomplete diagrams can still be saved when their document fields and editing graph rules are valid. Failed Run validation does not add a save requirement or remove existing work.
- Do not impose a new arbitrary maximum step count or component count. Enforce the backend's exact-number contract: planned generated traffic must fit within the JavaScript safe integer range. Report the backend's validation error when the requested run cannot satisfy that contract.
- Total steps is runtime state. It does not mark the architecture dirty and is not part of its saved document. New, Open, and successful deletion of the active saved architecture start the resulting editor context with the default 60; returning between Edit and Replay preserves the selected value for the current architecture.

## Edit and Replay modes

| Mode | Canvas document | Inspector | Editing behavior |
| --- | --- | --- | --- |
| Edit | Current working architecture | Existing editable configuration | Existing add, move, connect, copy/paste, configure, and remove interactions. |
| Replay | Immutable document in the accepted result snapshot | Selected component or connection's recorded metrics and read-only configuration | Select, inspect, pan, zoom, Fit, and resize panels; no document mutation. |

- A successful Run enters Replay paused at Step 0. Step 0 is the empty initial frame; it is not the first executed step.
- Returning to Edit pauses playback and retains the accepted result, selected playback position, and progress within the current step. Returning to Replay displays that same snapshot, frame, and frozen traffic position. Pan, zoom, selection, panel sizes, and playback state remain view state.
- Replay always draws its result snapshot, including captured labels and positions. It must not draw the working document with old metrics. Configure Replay as read-only without disabling component/connection selection, keyboard focus, pan, zoom, or Fit. The existing canvas `locked` flag alone is insufficient because it also disables selection and focus.
- Hide the component palette's editing actions in Replay and use that space for the canvas. The right inspector and lower timeline remain the primary result surfaces. Do not add an all-component results table or charts in this milestone.
- If the working document differs from the snapshot, show a persistent note such as **Replay uses an earlier architecture. Return to Edit to run your changes.** Compare document values, not Save status. Changes to topology, configuration, RPS, routing, labels, or positions can produce this note; restoring the exact document clears it.
- The architecture name is outside the result snapshot. Renaming, Save completion, or a new saved baseline does not change simulation freshness. A run-length change is also separate from the document: show the result's captured total steps and the next Run setting distinctly when they differ.
- The Run action always captures the current working architecture. Replay offers an action to return to Edit for changes or a new Run; it never silently reruns the old snapshot in place of current edits.
- Successful New, Open, or deletion of the active saved architecture clears the old result and playback state. Cancelling an unsaved-changes dialog, failing Open, or cancelling/failing deletion preserves the current architecture and accepted result. Deleting a different library entry preserves the active architecture's result. Clear selected result items that are absent from the next mode's document; preserve selection by stable ID where the item still exists.

## Result contract and decoding

The successful response is one complete JSON object:

```text
{
  snapshot: { document, total_ticks },
  frames: [ { tick, nodes, edges, counts, totals }, ... ],
  summary: { generated, completed, dropped, in_flight }
}
```

| Field | Meaning |
| --- | --- |
| `snapshot` | The immutable document and total tick count used to calculate this result. |
| `frames` | Ordered frames for ticks 0 through `total_ticks`, inclusive. |
| `frame.nodes[id]` for a Caller Group | `{ generated, completed }`: requests emitted and successful return responses received during this step. Caller capacity is unused. |
| `frame.nodes[id]` for a processing component | `{ received, handled, dropped, responses_received, responses_returned }`: new-request work and separate returning-response work during this step. |
| `frame.edges[id]` | `{ forwarded, returned }`: requests sent from source to target and successful responses sent from target to source, each scheduled to arrive during the next step. |
| `frame.counts` | `{ generated, completed, dropped }`, the global increments during this step. |
| `frame.totals` | `{ generated, completed, dropped, in_flight }`: the first three are cumulative through this step; `in_flight` is active original requests represented by outbound requests or returning responses at the step boundary. Dropped requests are excluded. |
| `summary` | Whole-run totals, equal to the final frame's `totals`. |

- Parse and validate the full response once before accepting it as a result. Playback reuses the decoded frames; it does not reparse JSON or request data on each step.
- Validate the snapshot against the submitted document and run length. Require exactly `total_ticks + 1` frames in contiguous order, with frame `tick` matching its index. Require every frame to cover all snapshot node and connection IDs, including idle elements, with no missing or extra IDs.
- Use the node role in the snapshot to validate its metric shape. Require all count fields to be nonnegative safe integers. Frame 0 has zero node, edge, increment, and total counts. Validate that `summary` equals the final frame's totals and apply the backend contract's accounting checks.
- A malformed, incomplete, mismatched, or unsafe-number response is a Run failure. Do not present missing metrics as zero or install a partially decoded result. Preserve the working architecture and prior accepted result.
- Runtime frames and selected IDs must use stable component and connection IDs. Repeated types and duplicate user labels are valid; neither is a result-map key.
- The architecture document retains its forward acyclic graph. Responses use the reverse direction of the existing connections implicitly; Replay does not add reverse edges to the saved document. At a shared downstream component, each response follows the path that its request actually used, including the originating Caller Group.
- `responses_received` counts responses that reach a processing component during the current step; `responses_returned` counts responses scheduled from that component toward the caller for the next step. A Database or terminal Server creates its response while handling the request. Response traffic does not change that step's request received/handled/dropped counts or request-capacity use.
- The frontend may calculate presentation values such as capacity percentage from recorded handled counts and snapshot capacity. It must not calculate routing, capacity enforcement, propagation, request completion, or replacement frames.

## Metrics and their labels

Three different views of counts must stay distinct:

| View | Source | Visible scope |
| --- | --- | --- |
| Current step | Selected `frame.nodes`, `frame.edges`, and `frame.counts` | **This step**, with **Step n of T**. |
| Cumulative result at the selected step | Selected `frame.totals` | **Total through Step n**. |
| Final result | `summary` | **Whole run · T steps**, independent of replay position. |

- In the selected processing-component inspector, separate **Requests** (Received, Handled, Dropped) from **Responses** (Received, Returned), using the corresponding recorded fields. Also show configured Maximum RPS and Capacity used for the current step, with a note that capacity applies to new requests only. Capacity used is the recorded handled count divided by that component's `capacity_rps` in the snapshot, displayed as a percentage. Returning response work is excluded from this ratio. The exact count values remain visible even if percentage formatting is rounded.
- In the selected Caller Group inspector, show Generated and Completed for the current step, plus the captured caller count and total test RPS. Completed means successful replies received at that caller. Do not show capacity, fabricated processing metrics, a failed status, or waiting/awaiting counts for callers.
- In the connection inspector, show the captured source, destination, request-routing order, and applicable weight. Label the two traffic counts separately: **Requests →** for `forwarded` (source to target), and **← Responses** for `returned` (target to source). Both counts describe output scheduled during the selected step and arriving during the next step. Neither is its receiving endpoint's incoming count for the same step. Response routing does not apply weights or choose a new destination.
- Place a compact cumulative strip below the timeline, labeled **Total through Step n**, using `frame.totals`. Place the whole-run summary in a clearly separate inspector section, alongside selected-component details or in the default inspector overview. Global current-step counts from `frame.counts` can appear in that overview with an explicit scope; do not add three permanent count rows to the timeline. In-flight is a boundary count, not a cumulative sum, and is not part of `frame.counts`.
- Current-step counts are recorded batch sizes, not counters that decrease as markers move. Constant caller traffic can produce the same counts in successive steps after the pipeline fills; each active step contains a new batch. Explain this above the canvas with **Counts show traffic per step. Callers add their configured traffic each step.** Keep the recorded counts unchanged during display interpolation.
- Completed means a successful return response received at the originating Caller Group. Database or terminal Server handling creates a response but does not complete the end-to-end request. Do not use Database handled counts or the sum of handled counts across components as the completion total; those counts describe request processing and component visits.
- Dropped is the local count of new requests discarded before processing because capacity is full. It produces no error response or later caller failure notification. Do not add a failed count, show an error-response arrow, or imply that the caller was notified of a drop.
- In-flight counts only active requests or returning responses. A dropped request is removed from active traffic even though it receives no reply. Do not present in-flight as a complete caller waiting inventory, or calculate an awaiting count as generated minus caller completions. Use the engine's recorded boundary count and preserve `generated = completed + dropped + in_flight`.
- At Step 0 all current and cumulative counts are zero while the whole-run summary already contains the calculated final result. At the last step, cumulative totals and the whole-run summary agree.
- Show remaining in-flight traffic at the final step. Playback ends at the selected total; it does not append drain steps or count that traffic as completed or dropped.

## Timeline and playback clock

- The timeline spans Step 0 through the snapshot's final step. Provide Play/Pause, Previous step, Next step, a keyboard-accessible scrubber, and speed choices 1×, 2×, 4×, and 8×.
- At 1×, advance one recorded step per real second. At 2×/4×/8×, advance two/four/eight recorded steps per real second. Speed affects display timing only.
- Previous/Next and scrubbing pause playback before selecting the requested frame. Clamp positions to 0–T. Previous is unavailable at 0 and Next at T.
- Play starts from the selected frame. At the final frame, show Replay from start as an explicit action that selects Step 0 and begins playback. Automatically stop at T and keep its final metrics visible.
- Keep progress within the selected step as a display value from 0 up to 1. During playback, it advances continuously at the selected speed; crossing 1 selects the next recorded frame and starts that frame's progress at 0. This value controls traffic markers and the hop-progress indicator only.
- Pause holds the current frame and its progress. Resume continues from that position without applying the paused duration as catch-up. A speed change retains the current frame and progress while applying the new rate. Previous/Next and scrubbing reset progress to 0 and leave playback paused. Replay from start also resets progress to 0 before playing.
- Use a monotonic playback clock and integer frame selection with fractional display progress, not accumulated simulation updates or timer-event counting. Delayed display callbacks may skip intermediate rendered frames while advancing to the correct recorded frame and progress; the last frame must still be displayed. Stop at T with progress 0 and keep the final outbound markers frozen at their send endpoints. Do not animate them into an unrecorded step T + 1.
- Pause when leaving Replay or when the browser tab becomes hidden. Returning does not silently resume or jump through frames. Document changes in Edit never mutate the stored result.
- Speed, stepping, scrubbing, selection, and replay do not issue simulation requests, mark the architecture dirty, or change any recorded count. No elapsed-time or service/query-latency readout is included.

## Visual design and accessibility

The canvas/timeline/selected-inspector layout is accepted. The discussion prototype's visual styling is not approved. The implementation must fit the existing editor's typography, surfaces, and spacing, and must receive visual review with representative diagrams.

- Preserve the prominent approved type-specific SVG symbols: Caller Group monitor, Load Balancer splitter box, Gateway diamond, Server rack, and Database cylinder. Keep labels and type text readable. Do not replace them with small generic icons or result cards that obscure component identity.
- Show compact current-step metrics near each symbol: caller Generated and Completed, or processing request-capacity use and dropped traffic. Put complete request and response metrics in the selected inspector. Status badges must not cover labels, symbols, handles, connection paths, selection rings, or keyboard focus indicators.
- For processing components, below 80% capacity use is normal; 80% to below 100% is yellow; 100% is red. Provide percentage text and readable status text in addition to color. Use exact integer threshold checks as defined in the backend specification: equality for 100%, and exact cross-products such as `BigInt(handled) * 5n >= BigInt(capacity) * 4n` for 80%. A rounded percentage or floating-point ratio must not determine status. Caller Groups have no utilization color.
- Use a status badge, indicator, or restrained outline that preserves type color and shape. Selection and keyboard focus must remain distinguishable from capacity status. A component at 100% capacity is red even if it dropped no traffic; dropped counts remain a separate metric.
- Use two distinct connection lanes: blue for requests from the captured source to target, and green for responses from target to source. Keep separate directional arrows and current-step counts, with destination labels such as **Requests to Server** and **Responses to Caller**. Arrows must follow the actual path direction, including vertical or right-to-left layouts. Preserve selection state and keep paths and labels clear of component text.
- Show a batch marker for each direction with a nonzero recorded count. Interpolate its position along that direction's actual path from the selected frame's send endpoint at progress 0 toward its next-step arrival endpoint at progress 1. Markers represent aggregate batches, not individual requests. A zero-traffic direction has no marker and uses a subdued lane. The connection label shows **Step n → n + 1**, or **Final step · in flight** at T. Marker movement never changes the recorded counts.
- Pause freezes request and response markers together; resume and speed changes retain their positions. At the final step, remaining outbound markers stay frozen because no next frame was calculated. Reduced-motion preferences hide moving markers and the hop-progress indicator while retaining both counts, arrows, and traffic labels.
- Put the traffic guide in its own row above the canvas. Show the blue/green key, playback status, the current send/arrival steps, and the explanation of repeated per-step counts. Show **Initial frame · no traffic sent yet** at 0; at T, show that the run ended and that the remaining in-flight traffic has no extra steps. The timeline remains in a separate row below the canvas. The guide, canvas navigation tools, canvas footnote, timeline, and cumulative strip must not overlap, including at narrow widths and short window heights.
- Keep at least 120 pixels of canvas height for navigation tools. All other rows retain their required height. If notices and wrapped controls exceed the window height, scroll the canvas column vertically. Clip graph content within the canvas; allow totals to wrap within a narrow timeline.
- Keep timeline controls compact, with clear spacing between playback actions, Step position, speed, and count scopes. Reflow controls and inspector content at narrow desktop widths without horizontal overflow. Preserve the current resizable-inspector behavior and usable canvas navigation.
- Give every control an accessible name. The scrubber exposes its minimum, maximum, and current Step; standard keyboard range controls work. Metrics include text labels. Keyboard users can select and inspect nodes or connections while Replay is read-only.
- Announce Run calculation, success, failure, and mode changes through existing status/error surfaces. Do not announce every automatic playback frame as a live-region update; that would make the controls difficult to use with a screen reader.

## Pending Run, failure, and Save

- Allow only one calculation request at a time. Show **Calculating…** with busy state and disable duplicate Run submissions. Provide Cancel for the pending request; cancellation retains the working architecture and previous accepted result. Cancelling the HTTP request does not imply that backend calculation was stopped.
- Do not automatically apply the library adapter's fixed 10-second timeout to simulation. Keep Cancel available while waiting. Any later transport timeout policy needs its own explicit contract; the selected step count is not a wall-clock timeout.
- The request owns an immutable snapshot. Editing and ordinary explicit Save can continue during calculation. A successful response is accepted only for its captured editor context; if newer edits exist, keep them and show the snapshot-difference note when entering Replay.
- Associate asynchronous requests with both the current architecture context and a distinct request identity. Cancel, successful New/Open, and successful deletion of the active saved architecture invalidate or abort a pending Run. Cancelled/failed deletion and deletion of another library entry retain the active context. Ignore any later response from a cancelled request or abandoned context so it cannot replace a retained result or the next architecture's result.
- While a replacement Run is pending or fails, retain the prior accepted result. Show validation, HTTP, unavailable-backend, cancellation, and invalid-response errors clearly. No request is automatically retried. A subsequent explicit Run captures current edits and settings afresh.
- Map backend validation pointers through the submitted node/edge IDs. Select the affected current item when it still exists, and attach field errors only when that field still matches the submitted value. If it was changed or removed, display the captured-run error without assigning it to another item at the old array index. Multiple readiness issues remain readable and actionable.
- Keep Run validation messages separate from the editor's invalid-draft state. A readiness message such as an unreachable component or a router without destinations must not make Save unavailable or mark an unchanged document dirty.
- Keep Save independent from Run. Run and playback never change the saved ID, baseline, saved document, or Save status. Save continues to use the current working architecture and the existing reconciliation rules; it never persists the replay snapshot, results, total steps, playback position, or speed.
- Keep Save/Discard/Cancel and browser leave warnings tied to unsaved architecture changes. Switching Edit/Replay needs no unsaved-changes dialog because it retains the working document. Results are session state and are cleared by reload rather than stored with architectures.

## Verification and acceptance

Implementation must keep strict Svelte/TypeScript checks and the production build passing. Use separate response-adapter/playback-state unit tests and real frontend/backend browser acceptance tests. Browser API tests use an isolated temporary SQLite library and the repository's approved startup path.

Required unit checks cover complete-frame validation, malformed/mismatched/unsafe counts, snapshot isolation, caller and processing metric shapes, separate forward/return connection metrics, completion at caller receipt, silent-drop labels, per-step/cumulative/final scopes, capacity threshold boundaries with response work excluded, response replacement, document comparison, late response rejection, and pointer mapping after newer edits. Use a controllable monotonic clock to verify play/pause with progress preserved, speed changes within a step, callback delays, stepping and scrubbing with progress reset, hidden-tab pause, and final-step progress reset. These checks must demonstrate that playback does not calculate simulation values or call Run again.

Required browser acceptance cases:

1. Build a valid unsaved architecture, choose 60 steps, and Run. Exactly one POST contains its current document and `total_ticks: 60`; there is no architecture Save request. Replay opens paused at Step 0 with zero current and cumulative counts.
2. Use `Caller → LB → Server → Database` with 100 total source RPS and capacities 100/60/60. Caller generation starts at Step 1, LB receives requests at 2, Server at 3, and Database handles at 4. The first responses reach Server at 5, LB at 6, and Caller at 7; only caller receipt increments Completed. At Step 60 the whole-run summary is 6,000 generated, 3,240 completed, 2,320 dropped, and 440 in flight. Database handled totals are 3,420 request visits, not end-to-end completions.
3. Select each component and a connection. Verify request and response metrics against the same backend frame, next-step arrival in each direction, snapshot configuration, idle-element zeros, and utilization at below 80%, exactly 80%, and exactly 100%. Return responses do not consume request capacity or change its status. Capacity overflow increases Dropped locally without creating an error response, caller failed status, or waiting inventory.
4. Play, pause, change speed, step both ways, and scrub. Verify that blue request and green response batch markers travel along their respective paths from selected-frame send endpoints toward next-step arrival endpoints. Pause freezes their positions; resume and speed changes preserve progress; stepping and scrubbing reset progress. The same recorded frame always has the same metrics; counts do not change as markers move. Playback stops at the final step with the remaining markers frozen at send endpoints and without draining traffic. No elapsed-time readout appears.
5. Return to Edit, change RPS, capacity, routing, topology, a label, or a position, then return to Replay. The previous snapshot remains intact and the difference note is visible. Restoring the exact document clears the note. Name edits and Save alone do not make results outdated.
6. Recalculate after edits and replace the result only on a valid complete response. During a pending Run, preserve newer editor changes and Save reconciliation. A failure, malformed response, or cancellation retains the prior result. New/Open or successful active-architecture deletion clears the result, resets Total steps to 60, and ignores a late Run response. Cancelled/failed deletion and deletion of another library entry retain the active result and pending request.
7. Run a diagram containing an unreachable component or an incomplete router and see readable readiness errors linked to the affected items. Save still accepts the incomplete architecture. Zero source RPS and structurally reachable zero-weight destinations remain valid when routing otherwise meets the contract.
8. Change Total steps to another valid value and verify frames 0–T, captured length labels, and final in-flight accounting. Invalid run-length input blocks Run. The input is absent from Save payloads; New/Open restores 60.
9. In Replay, attempt dragging, adding, connecting, deleting, and pasting; no document mutation occurs. Selection, keyboard inspection, pan, zoom, Fit, timeline controls, and inspector resizing remain usable.
10. Check representative approximately 20-component diagrams with repeated types, fan-in, unequal capacities, long labels, and zero-traffic directions. Verify clear symbols, distinct request/response lanes, readable metric scopes, no overlaps or horizontal overflow, visible selection/focus at each capacity status, and reduced-motion behavior at supported desktop widths and short window heights. Verify that the guide has its own row above the canvas and that navigation tools and the footnote stay clear of the separate timeline below. A shared downstream response follows its recorded actual path rather than the request router's current weighted or round-robin decision.

The milestone is ready for user review when these checks pass and the representative-diagram visual review confirms the final styling. Layout agreement alone does not complete visual acceptance.
