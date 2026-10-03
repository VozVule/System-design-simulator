# Recognizable canvas components and Save feedback

Requested by the user on 2026-10-03. The stronger Save indicator and the five component symbols are implemented. This extends [the frontend spec](frontend-spec.md) and preserves [backend integration](backend-integration-spec.md).

## Save indicator

The header's Saving and Saved text must use a brighter, saturated green (`#087f3f`) and bold text (font weight 700). The spinner and check icon inherit this color. Saving takes precedence over the unsaved-document color while a request is pending. Saved appears only after a successful Save when there are no newer edits. Unsaved changes, New architecture, and Save failed retain separate text and styling; color alone must not communicate the state.

## Canvas symbols

Component type must be recognizable from its symbol and silhouette without reading the user-assigned name. Replace the small corner-icon treatment with a prominent type-specific graphic that is the main visual body of the node. Keep the editable label and a compact configuration summary adjacent to or below the graphic.

| Component | Required graphic |
| --- | --- |
| Caller Group | Desktop computer monitor with a visible screen and stand. It represents a group of callers; it is not one node per caller. |
| Load Balancer | Rectangular box containing arrows that split one incoming path into multiple outgoing paths. |
| Gateway | Diamond: a square rotated 45 degrees. Keep its name and configuration text upright. |
| Server | Recognizable server or rack icon with stacked units. |
| Database | Database cylinder with a visible elliptical top and curved sides. |

- Use crisp SVG/vector graphics with a consistent stroke weight and visual scale. Keep the existing component colors as secondary cues. Shape must distinguish the types without relying on color.
- Use matching symbols in the palette and inspector so that adding, selecting, and editing a component remain consistent.
- Retain component type text and accessible names for keyboard and assistive-technology use. Custom labels identify individual components; symbols identify their types.
- Preserve clear selected and keyboard-focus states around each shape. The node's full visual area must remain selectable and draggable, not only its thin SVG strokes.
- Keep connection handles visible and place arrow endpoints on the visible symbol boundary. Preserve the existing allowed inputs/outputs: no Caller Group input, no Database output. Rotate only the Gateway's graphic; do not rotate labels or its interaction container.
- Keep symbols legible at normal editing zoom and when fitting a typical diagram. Long labels must wrap without covering symbols, handles, or connection paths.
- Preserve IDs, saved positions, edges, configuration, routing order, and POST/PUT payloads. Graphics are derived from component type and are not stored as new document fields. Existing saved architectures must reopen without migration.

## Implementation scope and checks

This is a small-to-moderate frontend presentation change. The existing custom node renderer and shared icon component already provide the extension points. The main work is symbol layout, connection-handle placement, selection bounds, and checking canvas interactions. No backend or API changes are required. A rough implementation estimate is half a day to one day, including visual adjustments and interaction checks; it is not a delivery commitment.

Verify all five symbols with repeated types and renamed components. Check selection, keyboard focus, palette drops, dragging, input/output connections, edge redirection, pan/zoom/Fit, and Save/reopen with existing documents. Confirm that the Save indicator is green and bold both during a pending request and after success, and that failure or newer unsaved edits cannot appear as Saved.
