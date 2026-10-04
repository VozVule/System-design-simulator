# Phase-one completion: component clipboard and adjustable panels

Requested by the user on 2026-10-03 as the final frontend phase-one scope. This extends [the frontend specification](frontend-spec.md), [component visuals](canvas-visuals-spec.md), and [backend integration](backend-integration-spec.md). Implementation covers these requirements; user acceptance testing confirms phase-one completion. Simulation remains a subsequent phase.

## Component and group copy/paste

- Ctrl+C/Ctrl+V on Windows/Linux and Cmd+C/Cmd+V on macOS copy and paste the currently selected component or group of components. Users can do this directly on the canvas without returning to the palette.
- Copy captures an immutable snapshot of all selected components: type, label, position, and all type-specific configuration. Include every connection whose source and target are both in the selected group. Invalid field drafts on copied components or internal connections block copying with a visible message; unrelated invalid fields do not block a valid selection.
- Use native clipboard events with validated, versioned component or group payloads. Continue accepting previously copied single-component payloads. Reject malformed group graphs, including missing endpoints, duplicate IDs, and cycles. Standard text copy/paste in inputs, textareas, selects, and contenteditable elements retains its normal behavior. Ordinary clipboard text does not create components; malformed recognized component data produces an error without changing the document.
- Paste assigns fresh component and connection IDs that are unique across nodes and edges, preserves configuration, and uses numbered labels such as `Server 2` and `Server 3`, including when copying a numbered component. Long Unicode labels remain within the 120-character contract limit. Every paste uses a new object; subsequent edits to either component do not modify the other.
- Paste all copied components with one shared position offset, preserving the relative layout. Remap internal connection endpoints to the new component IDs and preserve their weights and destination order. Exclude connections to unselected components. Original components and connections remain intact. A router copied alone keeps its routing policy and starts without destinations.
- Position pastes with a small offset from the copied component when visible. Otherwise place them within the current canvas view. Try distinct nearby positions for repeated pastes. Select the pasted components and their internal connections. Focus a single pasted node or the canvas for a group so keyboard editing and deletion can continue. Fit the view to a pasted group, including groups too large for the current viewport. A densely filled or very small canvas may require rearranging nodes manually.
- A copied component or group snapshot can be pasted repeatedly, after the original is removed, or into another architecture in the same application. Selection is not required for Paste. Copy alone does not make the architecture dirty; Paste does and persists only on an explicit Save.
- Clipboard operations cannot mutate behind library/navigation/delete dialogs or while editing is locked. Normal Save permits newer paste edits; its eventual response must retain those edits and leave them unsaved until the next Save.

## Canvas selection

- Press V or use the canvas toolbar to switch between Drag mode (pan the canvas) and Select mode (drag a box around components). Ignore V in text fields and dialogs, and preserve Ctrl/Cmd+V for Paste.
- Shift+click adds or removes individual items. Drag selected components or their selection box to move the group. Delete/Backspace or the inspector removal action removes all selected items and incident connections.
- Group selection survives movement and edits. New/Open clears selection. Selection and mode changes do not mark the architecture dirty. The inspector shows properties for one selected item and group actions for multiple items.

## Adjustable responsive panels

- The component palette and configuration inspector have independent vertical resize dividers. Pointer capture keeps resizing active when the pointer leaves the divider; release/cancel ends the operation.
- Dividers have accessible names, orientation, controlled panel IDs, and current/minimum/maximum width values. Focused dividers support Left/Right arrows, Shift+arrows for larger steps, Home for minimum width, and End for maximum width.
- Use bounds of 64–400 pixels for the palette and 200–480 pixels for the inspector. Clamp maxima to the available workspace and reserve at least 200 pixels for the canvas. Desktop workspace support starts at 480 pixels; touch-specific mobile canvas behavior remains outside phase one.
- Keep preferred widths during New/Open operations in the current session. Window changes clamp the displayed widths; widening the window restores room for the preferred sizes. Reload starts with the default widths. Panel widths are view state, not architecture fields.
- Reflow according to each panel's actual width, independently of the browser width. A narrow palette becomes an icon rail with accessible Add buttons. Wider palettes show wrapped names and descriptions. Narrow inspectors stack destination controls and weights. Labels, help, validation messages, and long component names wrap without horizontal overflow.
- Panels scroll vertically when necessary. Inputs, routing choices, connection controls, removal actions, resize dividers, and canvas controls remain usable. Resizing neither modifies component coordinates nor marks a saved architecture dirty.

## Verification and completion

Separate unit tests cover snapshot isolation, internal-edge endpoint remapping, group layout/weight/order preservation, complete configuration for all five types, ID/label uniqueness, Unicode limits, invalid selected drafts, and malformed/unrelated clipboard data. Browser tests use real keyboard clipboard shortcuts and native text inputs; verify repeat/cross-document paste, focus, pending Save reconciliation, unchanged original connections, backend PUT/reopen, pointer and keyboard resizing, panel reflow, no horizontal overflow, and preservation of saved state.

Phase one is ready for user testing when these checks and the existing canvas/backend Save acceptance suite pass, Svelte/TypeScript checks report no errors or warnings, and the production build succeeds. The completed implementation scope is create/edit/connect/configure, recognizable symbols, explicit durable Save/library operations, protected unsaved edits, copy/paste, and resizable responsive panels.
