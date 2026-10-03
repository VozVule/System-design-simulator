# System Design Studio frontend

Interactive architecture editor built with Svelte, TypeScript, Svelte Flow, and Tailwind. It runs independently of the backend and uses a browser-local placeholder library. The saved resources follow the existing backend OpenAPI document contract.

## Run locally

Use Node.js 24 and npm. From this directory:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. The development server uses a fixed port so the browser-local library remains at the same origin. No backend process is needed.

Add the five component types using the palette or drag them onto the canvas. Select a node to edit its configuration and position, and drag between handles or use Connect to create directed paths. Select a connection to redirect/remove it; selected connections also have drag anchors. Weighted router destinations can be reordered and assigned relative weights. Pan, zoom, and Fit diagram affect only the view.

Save explicitly creates or replaces an architecture in the library. Saved positions, labels, caller configuration, capacities, routing policies, weights, and destination order survive a page reload. New/Open protect unsaved changes with Save/Discard/Cancel, and supported browsers warn when leaving a changed document. Simulation is deferred.

The placeholder library is specific to this browser profile and origin. Clearing site data removes it. Unsaved work is not persisted or recovered after closing the browser. There is no API connection, import/export, automatic Save, undo history, or data migration to the future backend.

## Verify

Install the test browser once:

```sh
npx playwright install chromium
npm run verify
```

`verify` runs strict Svelte/TypeScript checking, editor/domain/store unit tests, Chromium acceptance tests against the real frontend, and the production build. Browser tests isolate storage and cover complete editing round trips, actual gestures, invalid graphs, Save races, storage failures, navigation, and deletion. The backend tests remain separate.

For individual checks:

```sh
npm run check
npm test
npm run test:browser
npm run build
```

The production bundle is in `dist`. `npm run preview` serves it locally for inspection. Generated bundles, dependencies, and browser-test output are ignored by version control.

## Boundaries

The domain module owns contract-shaped schemas and graph commands. Editor state owns the working document, saved baseline, field drafts, and Save snapshot reconciliation. A small asynchronous architecture-store interface isolates the browser persistence adapter. Canvas presentation maps from the domain document and excludes canvas/runtime metadata from persistence.

An explicit development-only `?test-store` mode lets acceptance tests hold a Save through the same adapter interface. Its control module is excluded from production builds. There are no user-facing artificial delays or random failures.

The approved frontend behavior is specified in the [frontend spec](../specs/frontend/frontend-spec.md). Future HTTP wiring is a separate task.
