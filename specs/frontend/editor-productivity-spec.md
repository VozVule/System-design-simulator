# Phase-one completion: component clipboard and adjustable panels

Requested by the user on 2026-10-03 as the final frontend phase-one scope. This extends [the frontend specification](frontend-spec.md), [component visuals](canvas-visuals-spec.md), and [backend integration](backend-integration-spec.md). Implementation covers these requirements; user acceptance testing confirms phase-one completion. Simulation remains a subsequent phase.

## Component copy/paste

- Ctrl+C/Ctrl+V on Windows/Linux and Cmd+C/Cmd+V on macOS copy and paste the currently selected component. Users can do this directly on the canvas without returning to the palette.
- Copy captures one immutable component snapshot: type, label, and all type-specific configuration. Invalid field drafts on that component block copying with a visible message; unrelated invalid components do not block copying a valid selection.
- Use native clipboard events with a validated, versioned component payload. Standard text copy/paste in inputs, textareas, selects, and contenteditable elements retains its normal behavior. Ordinary clipboard text does not create components; malformed recognized component data produces an error without changing the document.
- Paste assigns a fresh component ID that is unique across nodes and edges, preserves configuration, and uses a `copy` label with a numeric suffix for repeats. Long Unicode labels remain within the 120-character contract limit. Every paste uses a new object; subsequent edits to either component do not modify the other.
- Paste only the component. Original connections remain attached to the original IDs. A copied router keeps its routing policy and starts without destinations. This single-component operation does not imply bulk graph or connection duplication.
- Position pastes with a small offset from the copied component when visible. Otherwise place them within the current canvas view. Try distinct nearby positions for repeated pastes. Select and focus the pasted node so keyboard editing can continue. A densely filled or very small canvas may require rearranging nodes manually.
- The copied snapshot can be pasted repeatedly, after the original is removed, or into another architecture in the same application. Selection is not required for Paste. Copy alone does not make the architecture dirty; Paste does and persists only on an explicit Save.
- Clipboard operations cannot mutate behind library/navigation/delete dialogs or while editing is locked. Normal Save permits newer paste edits; its eventual response must retain those edits and leave them unsaved until the next Save.

## Adjustable responsive panels

- The component palette and configuration inspector have independent vertical resize dividers. Pointer capture keeps resizing active when the pointer leaves the divider; release/cancel ends the operation.
- Dividers have accessible names, orientation, controlled panel IDs, and current/minimum/maximum width values. Focused dividers support Left/Right arrows, Shift+arrows for larger steps, Home for minimum width, and End for maximum width.
- Use bounds of 64–400 pixels for the palette and 200–480 pixels for the inspector. Clamp maxima to the available workspace and reserve at least 200 pixels for the canvas. Desktop workspace support starts at 480 pixels; touch-specific mobile canvas behavior remains outside phase one.
- Keep preferred widths during New/Open operations in the current session. Window changes clamp the displayed widths; widening the window restores room for the preferred sizes. Reload starts with the default widths. Panel widths are view state, not architecture fields.
- Reflow according to each panel's actual width, independently of the browser width. A narrow palette becomes an icon rail with accessible Add buttons. Wider palettes show wrapped names and descriptions. Narrow inspectors stack coordinates, destination controls, and weights. Labels, help, validation messages, and long component names wrap without horizontal overflow.
- Panels scroll vertically when necessary. Inputs, routing choices, connection controls, removal actions, resize dividers, and canvas controls remain usable. Resizing neither modifies component coordinates nor marks a saved architecture dirty.

## Verification and completion

Separate unit tests cover snapshot isolation, complete configuration for all five types, ID/label uniqueness, Unicode limits, invalid selected drafts, and malformed/unrelated clipboard data. Browser tests use real keyboard clipboard shortcuts and native text inputs; verify repeat/cross-document paste, focus, pending Save reconciliation, unchanged original connections, backend PUT/reopen, pointer and keyboard resizing, panel reflow, no horizontal overflow, and preservation of saved state.

Phase one is ready for user testing when these checks and the existing canvas/backend Save acceptance suite pass, Svelte/TypeScript checks report no errors or warnings, and the production build succeeds. The completed implementation scope is create/edit/connect/configure, recognizable symbols, explicit durable Save/library operations, protected unsaved edits, copy/paste, and resizable responsive panels.
