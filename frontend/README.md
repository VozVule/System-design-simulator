# System Design Studio frontend

Interactive architecture editor built with Svelte, TypeScript, Svelte Flow, and Tailwind. Save creates an architecture with POST, then uses PUT for complete replacements of the same resource. The library reads, reopens, and deletes architectures through the local backend.

## Run locally

Use Node.js 24 and npm. Install frontend dependencies from this directory:

```sh
npm ci
```

From the repository root, start both services:

```sh
./scripts/start.sh
```

See the [repository README](../README.md) to create the project Python environment and install backend dependencies. Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Keep the launcher running in the foreground; Ctrl+C stops both services. If either port is occupied, resolve the existing process before restarting the launcher.

The frontend defaults to backend origin `http://127.0.0.1:8000`. To change it, copy `.env.example` to `.env.local`, set `VITE_API_BASE_URL` to the backend origin, and restart Vite (or rebuild for production). Set the backend's `SYSD_CORS_ORIGINS` to include the frontend origin if it differs from the default port 5173 origins. Vite environment values are public; do not put credentials in them.

Add the five component types using the palette or drag them onto the canvas. Select a node to edit its configuration and position, and drag between handles or use Connect to create directed paths. Select a connection to redirect/remove it; selected connections also have drag anchors. Weighted router destinations can be reordered and assigned relative weights. Pan, zoom, and Fit diagram affect only the view.

Select a component on the canvas and press **Ctrl+C / Ctrl+V** (Windows/Linux) or **Cmd+C / Cmd+V** (macOS) to copy and paste it. Each paste keeps the copied configuration, gets a new ID and a `copy` label, and is selected for further editing. Connections stay with the original component. You can paste repeatedly or into another architecture. Copy records a snapshot; subsequent edits to the original do not alter that snapshot. Correct invalid fields on the selected component before copying. Text fields retain normal text copy/paste.

Drag the divider beside the component palette or inspector to resize that panel. Focus a divider and use Left/Right arrows to adjust it, Shift+arrows for larger steps, or Home/End for its minimum/maximum width. Narrow palettes become an icon rail; narrow inspectors stack fields and wrap text. Widths adapt to the window and remain available while switching architectures in the current session. Resizing changes the view and does not create unsaved architecture edits.

Save explicitly creates or replaces an architecture in the backend's SQLite library. Saved positions, labels, caller configuration, capacities, routing policies, weights, and destination order survive a page reload and backend restart. New/Open protect unsaved changes with Save/Discard/Cancel, and supported browsers warn when leaving a changed document. Simulation is deferred.

Failed requests preserve the working document and previous saved baseline. Backend validation errors highlight fields where possible. Saves use immutable snapshots, preserve edits made while a request is pending, and prevent overlapping requests. A request times out after 10 seconds; writes are never automatically retried. If a first Save times out or loses its response, check the library before retrying because the backend may already have created the resource.

Unsaved work is not recovered after closing the browser. Existing browser-local placeholder entries are not automatically migrated to the backend. There is no import/export, automatic Save, or undo history.

## Verify

Install the test browser once:

```sh
npx playwright install chromium
npm run verify
```

`verify` runs strict Svelte/TypeScript checking, editor/domain/store unit tests, Chromium acceptance tests against the real frontend, and the production build. Browser tests start a separate frontend on port 5174 and the real backend on port 18000 using `.venv/bin/python` and a temporary SQLite database. These ports must be available and backend dependencies must already be installed. Tests never modify the developer's saved library.

API acceptance tests cover first Save POST, later PUT, backend reopening/deletion, copied connected components, pending Save edits, real validation/404 responses, disconnected requests, and Save before navigation. Canvas acceptance tests use the development-only browser placeholder store to isolate graph gestures, native clipboard shortcuts, panel resizing/reflow, and storage-failure cases. Backend unit/HTTP tests remain separate.

For individual checks:

```sh
npm run check
npm test
npm run test:browser
npm run build
```

The production bundle is in `dist`. `npm run preview` serves it locally for inspection. Generated bundles, dependencies, and browser-test output are ignored by version control.

## Boundaries

The domain module owns contract-shaped schemas and graph commands. Editor state owns the working document, saved baseline, field drafts, and Save snapshot reconciliation. A small asynchronous architecture-store interface isolates HTTP persistence. Responses are validated before entering editor state. Canvas presentation maps from the domain document and excludes canvas/runtime metadata from persistence.

An explicit development-only `?test-store` mode selects the browser placeholder adapter and lets acceptance tests hold a Save through the same interface. Its control module is excluded from production builds. The normal application uses HTTP; there are no user-facing artificial delays or random failures.

The approved editor behavior is specified in the [frontend spec](../specs/frontend/frontend-spec.md). The [backend integration spec](../specs/frontend/backend-integration-spec.md) supersedes its temporary browser-only persistence boundary.

The final phase-one requirements are in the [clipboard and resizable-panel spec](../specs/frontend/editor-productivity-spec.md). Phase one includes architecture creation/editing, backend Save/library operations, recognizable component shapes, copy/paste shortcuts, and adjustable responsive panels. Simulation remains a later phase.
