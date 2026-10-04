# Frontend backend integration

Requested by the user on 2026-10-03 after the frontend editor and backend architecture API were implemented. This change supersedes the temporary browser-only persistence boundary in [the frontend spec](frontend-spec.md). The existing editor, validation, explicit Save, and unsaved-change behavior remain applicable.

## Behavior

- The first Save sends POST `/api/v1/architectures` with `{name, document}`. Only a validated 201 resource establishes the saved ID and baseline. The backend owns architecture IDs and timestamps.
- Subsequent Saves send PUT `/api/v1/architectures/{id}` with the complete name and document. Only a validated 200 resource with the same ID advances the baseline. Canvas edits do not send writes until Save.
- Save and continue and the keyboard Save shortcut use the same Save path. New starts a fresh working architecture; it does not create a backend resource until Save.
- The library uses GET collection, Open uses GET by ID, and confirmed Delete uses DELETE by ID. Reads and writes use the same backend library so resources remain reopenable after reload. There is no automatic migration of browser placeholder data.
- The default backend origin is `http://127.0.0.1:8000`. `VITE_API_BASE_URL` can configure another origin before development startup or production build. The backend must allow the frontend origin through its existing CORS configuration.

## Requests and failures

- Validate outgoing documents and incoming resources against the [approved API contract](../backend/backend-api.openapi.json). Do not persist canvas runtime metadata or invent server metadata.
- Keep the immutable Save snapshot and allow only one Save in flight. Successful responses reconcile that snapshot while retaining newer working edits.
- On request failure, retain the working document, invalid drafts, resource ID, and previous saved baseline. Show the backend message and map body field pointers to current fields through the submitted component/connection IDs; do not attach stale field errors to newer edits. Other failures remain visible in the error banner.
- Missing IDs remain failures; PUT never falls back to POST. No write is automatically retried. Explicit Retry Save uses the existing ID when available.
- Abort stalled requests after 10 seconds. An aborted/lost POST response can still correspond to a committed backend resource, so tell the user to check the library before retrying a first Save.
- A failed library refresh after successful Save does not undo the confirmed Save; the library provides its own error and Refresh/Retry control.
- Keep the browser placeholder adapter only for development acceptance tests. Production defaults to the HTTP adapter with no storage-mode selector.

## Verification

Keep separate editor/domain unit tests and browser acceptance tests. Add adapter unit coverage for request payloads, metadata, CRUD responses, structured errors, response validation, unavailable requests, and timeout without automatic retry. Cover field-pointer mapping and newer edits separately at the editor seam.

Browser API tests must use the actual frontend and real backend with an isolated temporary SQLite database, separate from the developer's library. Verify button-triggered POST then PUT of the same ID, persisted canvas configuration and positions, reload/Open/Delete, pending Save edits, 404/validation failures, explicit network-failure retry, and Save before navigation. Retain the existing isolated placeholder acceptance tests for canvas gestures and browser-storage failures.

## Save feedback

The Save button shows Saving with a spinner during requests and a green Saved state after a successful response when the document is clean. Keep Saved visible until a document edit is made; selection, mode, pan, zoom, and panel changes do not clear it. Show no toast. If newer edits exist when a Save completes, keep Unsaved changes and the enabled Save action. Failed requests show Save failed and Retry Save. Library refresh runs separately from the completed Save.
