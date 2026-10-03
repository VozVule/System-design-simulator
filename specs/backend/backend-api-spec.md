# Backend architecture API specification

Date: 2026-10-03
Status: Approved and implemented on 2026-10-03 for release 1, backend milestone 1. Verification passed: 73 tests, strict mypy, OpenAPI validation, and standards/spec review. Simulation remains a subsequent milestone.

## Problem Statement

The frontend needs a stable contract for creating, opening, modifying, naming, saving, listing, and deleting architectures before the simulation engine exists. The project currently contains design documents, without backend code or an existing API contract.

Architectures are edited as complete JSON documents. Saving must be explicit, preserve component configuration and diagram positions, and retain the latest saved version in the local library. A partially connected diagram must remain saveable. Python type annotations must be enforced throughout the backend rather than left as an optional convention.

## Solution

Deliver a local Python/FastAPI backend with architecture CRUD backed by SQLite. Publish typed requests, responses, and errors through OpenAPI so the frontend can implement its editor and library independently of simulation.

The frontend owns the unsaved working document. The Save action creates a saved architecture with POST the first time and replaces its complete saved document with PUT thereafter. Adding or removing nodes or connections, moving nodes, changing configuration, and renaming all use this same replacement contract. There is no separate server-side working copy or second save command in this milestone.

The first release milestone ends when these operations work, persist across backend restarts, and pass HTTP integration tests, domain unit tests, and mandatory static type checking. The simulation engine is delivered later.

## User Stories

1. As an architecture designer, I want to start an empty architecture, so that I can build a diagram from scratch.
2. As an architecture designer, I want to choose a name, so that I can recognize the architecture in my library.
3. As an architecture designer, I want to add Caller Group, Load Balancer, Gateway, Server, and Database components, so that I can describe the release 1 system topology.
4. As an architecture designer, I want to connect components with directed connections, so that I can describe traffic direction.
5. As an architecture designer, I want to move and label components, so that the saved diagram remains understandable when reopened.
6. As an architecture designer, I want to configure caller count and total test RPS, so that offered traffic can be retained for later simulation.
7. As an architecture designer, I want to configure processing capacities, so that later simulation can use the limits I selected.
8. As an architecture designer, I want to configure round-robin or weighted routing, so that my intended routing policy is retained.
9. As an architecture designer, I want to retain fractional and zero relative weights, so that the document can represent my intended traffic split.
10. As an architecture designer, I want to preserve destination order, so that later deterministic routing uses the same order after reopening.
11. As an architecture designer, I want to remove components and their connections together, so that the saved document matches the canvas.
12. As an architecture designer, I want to remove or redirect a connection, so that I can revise the architecture without recreating it.
13. As an architecture designer, I want edits to remain unsaved until I select Save, so that I control when the library changes.
14. As an architecture designer, I want my first Save to create a library entry, so that I can return to the architecture later.
15. As an architecture designer, I want later Saves to replace the existing entry, so that the library retains its latest saved version.
16. As an architecture designer, I want to save an empty or disconnected diagram, so that I can pause editing before it is ready to simulate.
17. As an architecture designer, I want incomplete routing configuration to remain saveable, so that I can finish connecting destinations later.
18. As an architecture designer, I want to list saved architectures with names and timestamps, so that I can choose what to open.
19. As an architecture designer, I want to reopen the complete saved document, so that positions, settings, weights, IDs, and connection order are restored.
20. As an architecture designer, I want to rename a saved architecture, so that its library name reflects its purpose.
21. As an architecture designer, I want to delete a saved architecture, so that I can remove entries I no longer need.
22. As an architecture designer, I want saved architectures to survive backend restarts, so that the library is durable.
23. As an architecture designer, I want readable errors for invalid documents, so that I can correct problems without losing the previous saved architecture.
24. As an architecture designer, I want forbidden cycles and loopbacks rejected, so that the saved graph follows the agreed architecture rules.
25. As an architecture designer, I want a failed Save to leave the previous saved state intact, so that retrying does not repair a partially written document.
26. As a frontend developer, I want complete replacement semantics, so that adding, removing, and modifying diagram elements requires one write contract.
27. As a frontend developer, I want an authoritative Save response, so that I can update metadata and clear the dirty state only after persistence succeeds.
28. As a frontend developer, I want stable component tags and typed schemas, so that configuration panels and client types can be derived from the contract.
29. As a frontend developer, I want consistent status codes and structured field errors, so that I can implement predictable success and failure handling.
30. As a frontend developer, I want unknown architecture IDs to return an explicit error, so that the editor can handle deleted or missing library entries.
31. As a frontend developer, I want the backend to reject incorrect JSON types and unknown fields, so that contract mistakes are caught early.
32. As a frontend developer, I want an OpenAPI contract without simulation dependencies, so that editor and library work can begin immediately.
33. As a backend developer, I want typed document models and interfaces throughout the API, service, validation, and persistence layers, so that refactoring exposes incompatible changes.
34. As a backend developer, I want static type errors to fail the required checks, so that type declarations are enforced before changes are accepted.
35. As a backend developer, I want HTTP tests with real SQLite storage and separate domain tests, so that observable API behavior and graph rules are both verified.

## Implementation Decisions

### Milestone and boundaries

- This is release 1 milestone 1: architecture library CRUD and explicit Save. No simulation endpoint or engine is implemented here.
- Retain Python, FastAPI, and SQLite from the agreed release contract and ADRs 0002, 0003, and 0006.
- Build typed architecture/document models, pure document validation, an application service, a SQLite persistence adapter, and an HTTP API. Domain validation must be independent of FastAPI and database access.
- Use a small typed persistence interface for create, list, get, replace, and delete. Do not introduce generic repositories, per-node tables, or simulation abstractions ahead of their use.
- Transport models may also serve as the validated document model where their meaning is identical. Do not duplicate equivalent models merely to introduce extra mapping layers.
- Preserve the shared BaseComponent concept. Common component fields are declared once; discriminated variants enforce their type-specific configuration.

### HTTP surface

Resource routes use the prefix `/api/v1`. Request bodies and successful data responses use `application/json`. POST and PUT require that media type, permitting its normal charset parameter. All mutation bodies are required.

| Method and route | Request | Success | Behavior |
| --- | --- | --- | --- |
| POST `/api/v1/architectures` | ArchitectureWrite | 201 Architecture, with Location header | First Save: create and persist a new architecture with a server-generated ID. |
| GET `/api/v1/architectures` | No body | 200 ArchitectureList | List saved metadata only. Empty library returns an empty items array. |
| GET `/api/v1/architectures/{architecture_id}` | UUID path parameter | 200 Architecture | Open the latest saved document. |
| PUT `/api/v1/architectures/{architecture_id}` | ArchitectureWrite | 200 Architecture | Save a complete replacement of the existing name and document. |
| DELETE `/api/v1/architectures/{architecture_id}` | UUID path parameter; no body | 204, no body | Delete the saved architecture and its metadata atomically. |

- PUT replaces the whole document; it does not merge arrays, preserve omitted elements, or upsert a missing architecture. Missing required fields return 422. Nodes and connections absent from the replacement are removed.
- To remove a node, the frontend must also omit its incident connections from the same PUT. Dangling connections are rejected; the backend does not silently edit the submitted document.
- Renaming uses PUT with the updated name and complete current document. No separate PATCH or rename endpoint is required.
- An unknown, well-formed architecture ID returns 404 for GET, PUT, and DELETE. Repeating DELETE returns 404 after its initial 204. A malformed UUID returns 422.
- A POST retry is a new creation. It is not idempotent. PUT is idempotent for an unchanged submitted name/document: preserve both timestamps and return the current saved representation.
- When a replacement changes content, retain ID and created_at, replace the entire document and name atomically, and advance updated_at. Ignore JSON object key order when comparing content; preserve array order. Comparison occurs after name normalization and validation.
- List entries are ordered by updated_at descending, then ID ascending. Return the complete small local library without pagination or filters in this milestone.
- Duplicate names are allowed; ID identifies an architecture.
- There is no retained revision history or optimistic concurrency protocol. Successful writes are serialized by SQLite; the last committed replacement wins.
- Location on creation is the relative resource route including the generated architecture ID.
- Serve OpenAPI at `/openapi.json` and interactive API documentation at `/docs`. Declare stable operation IDs: createArchitecture, listArchitectures, getArchitecture, replaceArchitecture, deleteArchitecture.
- Allow configured local frontend origins through CORS, with GET, POST, PUT, DELETE, OPTIONS and Content-Type. Authentication and credentials are outside this local milestone.

### Save and frontend working state

1. New creates a local unnamed/unsaved working document. It need not contact the backend before the first Save.
2. The frontend chooses a name and sends the complete ArchitectureWrite on first Save. The returned ID marks the working document as an existing saved architecture.
3. Canvas and configuration edits change the local working document and set its dirty state.
4. Save of an existing architecture sends the complete ArchitectureWrite through PUT. Successful writes are durable before the success response is returned.
5. On success, use the response as the authoritative saved representation. If additional edits occurred while the request was pending, retain those edits and keep the document dirty. Do not issue overlapping Saves for one architecture.
6. On failure, retain the local edits and dirty state. The previous saved architecture remains unchanged.
7. Opening an architecture uses GET. The frontend's agreed Save/Discard/Cancel interaction controls leaving an unsaved working document; Discard restores the last saved document or abandons a new unsaved document.

Save is a user action mapped to POST/PUT. It is not an additional endpoint or an automatic write on every canvas change. No backend draft session is created, and saved documents do not contain a dirty flag.

### Typed resource contracts

All object schemas reject unknown fields at every nesting level. Field names use snake_case. Unless explicitly described otherwise, every listed field is required, null is forbidden, and missing values are not filled with implicit API defaults. The companion OpenAPI document records the field schemas and examples.

| Model | Fields and meaning |
| --- | --- |
| ArchitectureWrite | name: string of 1–120 characters as submitted; trim outer whitespace before storing and reject a blank result; document: ArchitectureDocument. Server metadata is not accepted. |
| Architecture | id: server-generated UUID v4 string; name: normalized name; created_at and updated_at: UTC RFC 3339 strings; document: ArchitectureDocument. |
| ArchitectureSummary | id, name, created_at, updated_at as above; format_version: 1. Does not include nodes or edges. |
| ArchitectureList | items: ordered array of ArchitectureSummary. |
| ArchitectureDocument | format_version: literal integer 1; nodes: array of Component; edges: array of Connection. Empty arrays are allowed. |
| Position | x and y: finite JSON numbers in canvas coordinates; negative and fractional coordinates are allowed. |
| Component common fields | id: stable frontend-generated identifier; type: component tag; label: nonblank string of 1–120 characters, preserved as submitted; position: Position; capacity_rps: type-dependent field described below. |
| Connection | id: stable frontend-generated identifier; source and target: component IDs; order: nonnegative integer; weight: finite nonnegative JSON number. All fields are required. |

- Component and connection identifiers match `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`. IDs must be unique across all components and connections in one document. They are not regenerated or rewritten on Save.
- The architecture UUID is separate from IDs inside its document. Architecture IDs are generated by the backend; component and connection IDs are generated by the frontend.
- Caller counts and capacities are positive integers. Test RPS and connection order are nonnegative integers. All integer values are limited to 9,007,199,254,740,991 for exact frontend representation.
- Integer fields reject strings, booleans, and floating-point inputs, including 1.0. Numeric coordinates and weights accept JSON integers or fractions, but reject numeric strings, booleans, NaN, and infinity. Pydantic runtime validation enforces this even where OpenAPI cannot express every coercion rule.
- Metadata is read-only. The client cannot supply an architecture ID, created_at, updated_at, results, or playback state in ArchitectureWrite.
- Document-format version describes the payload shape, not saved historical revisions. Only version 1 is accepted. Other integer versions produce 422 with unsupported_document_version; wrongly typed versions produce ordinary field validation errors.
- Persist node and edge array order without sorting or dropping fields. JSON object key order and textual number formatting have no preservation guarantee.

### Component variants

Component is a discriminated union using the type field. Every variant has the common fields and only the additional fields below. Fields belonging to another variant are rejected.

| Domain component | type value | capacity_rps | Additional required fields |
| --- | --- | --- | --- |
| Caller Group | caller_group | null; unused | caller_count: positive integer; test_rps: nonnegative integer representing total group RPS. |
| Load Balancer | load_balancer | Positive integer | routing_policy: round_robin or weighted. |
| Gateway | gateway | Positive integer | routing_policy: round_robin or weighted. |
| Server | server | Positive integer | None. |
| Database | database | Positive integer | None. |

- The capacity field exists in the shared component shape. Caller Groups carry null and do not enforce a capacity limit; do not introduce source admission behavior.
- Store round-robin/weighted policy and destination configuration now; this milestone does not allocate requests or maintain routing cursors.
- Each connection stores an explicit order. Orders must be unique among connections with the same source; gaps are allowed. Ascending order defines that source's destination order regardless of the global edge array order.
- weight is required and retained for every connection. It is used by future weighted routing, and unused by round-robin and single-output sources/servers. Relative weights may be fractional and need not sum to 100. Zero is allowed.
- The frontend supplies complete, correctly typed configuration when creating a component. Backend Save does not invent capacities, labels, weights, or RPS.

### Save validation versus simulation readiness

Save validates the document's typed shape and structural integrity. It does not require a complete runnable architecture.

Reject on both POST and PUT:

- Missing required fields, unknown fields, unsupported component types/policies, invalid numeric types/ranges, invalid IDs, or blank names/labels.
- Duplicate IDs, missing connection endpoints, or duplicate directed source/target pairs.
- Duplicate destination orders for one source, self-connections, cycles, or loopbacks.
- Any incoming connection to a Caller Group.
- More than one outgoing connection from a Caller Group or Server.
- Any outgoing connection from a Database.

Allow on both POST and PUT:

- An empty graph, disconnected components, and multiple Caller Groups.
- A Caller Group with no outgoing connection while editing.
- A Load Balancer or Gateway with no outgoing connections while editing.
- A Server with no outgoing connection, as allowed for terminal servers.
- A weighted router with no destinations or all destination weights zero while editing.
- A graph without a Caller Group, or without traffic paths reaching a terminal component.

Minimum required destinations and at least one positive weight for a weighted router remain future simulation-input checks. No readiness flag or simulation validation endpoint is introduced here. This preserves the existing agreement to save incomplete diagrams and reject invalid simulation inputs later.

### Error contract

Every documented error returns ErrorResponse: an object with a required error field containing code, message, and details. Details is always an array, including when empty. Each detail contains location (body or path), path (a JSON Pointer within that location), code, and message. The empty pointer identifies the whole body; `/architecture_id` identifies the UUID path parameter. A capacity field can use `/document/nodes/2/capacity_rps`.

| HTTP status | error.code | Meaning |
| --- | --- | --- |
| 400 | invalid_json | Body is not valid JSON; reject nonstandard numeric constants too. |
| 415 | unsupported_media_type | POST/PUT body is not supplied as application/json. |
| 422 | validation_error | Body/path has an invalid type, missing/unknown field, or invalid graph structure. |
| 422 | unsupported_document_version | Well-typed integer document version is not supported. |
| 404 | architecture_not_found | A well-formed architecture UUID has no saved entry. |
| 503 | storage_unavailable | Database cannot complete the operation, including lock timeout or unavailable storage. |
| 500 | internal_error | Unexpected failure, invalid stored document, or invalid server response. |

- Detail codes are stable application codes: required, unknown_field, invalid_type, invalid_value, unsupported_document_version, duplicate_id, missing_endpoint, duplicate_connection, duplicate_order, self_connection, cycle, forbidden_incoming, too_many_outgoing, and forbidden_outgoing.
- Human-readable messages are suitable for displaying in the editor; the frontend branches on codes rather than message wording. Tests do not depend on exact message text or error ordering.
- Normalize FastAPI request validation and malformed JSON errors into this envelope. Do not expose its default unrelated validation shape on some routes.
- Validation errors identify relevant document fields or graph collections. Metadata/database failures normally have an empty details array.
- Validate path/body before attempting mutation; missing-resource checking occurs after valid request input. No invalid write modifies timestamps or stored content.

### SQLite and durability

- Use the standard-library SQLite interface for the local library and a configurable durable database location. Production must not use a temporary or in-memory database by default.
- One saved architecture has an ID primary key, name, format version, created_at, updated_at, and the complete serialized ArchitectureDocument. Nodes and edges are not normalized into separate tables.
- Name and timestamps are metadata; do not duplicate them inside ArchitectureDocument. Keep the stored version metadata equal to document.format_version.
- Initialize the empty library schema when needed. Save incomplete valid documents exactly as allowed above; no sample architecture is automatically inserted.
- Validate incoming documents before writing; validate stored documents on reading them. Convert storage results into typed metadata/resource objects at the persistence boundary.
- Use bound SQL parameters and transactions. Create, replace, and delete either commit completely or leave previous state unchanged. A successful response is sent after commit.
- An identical PUT preserves updated_at. An actual edit produces a later updated_at even if wall-clock precision would otherwise produce an equal timestamp. created_at equals updated_at on creation.
- Store only the latest saved version. Do not persist simulation results, runtime counters, replay state, individual request traces, or runtime tick count.

### Required typing and API documentation

- Type all function/method parameters and returns, including constructors, validators, dependencies, persistence operations, application setup, and test helpers. Annotate model/class fields, module-level state, and collections whose element types are not evident.
- Use precise document/resource/error models and parameterized containers. Do not use untyped dictionaries, bare containers, or Any as architecture/service/repository interfaces.
- Isolate dynamic framework/SQLite/JSON data at adapter boundaries and validate it before domain or service use. Do not use unchecked casts or validation-bypassing construction to make external input appear typed.
- Require mypy strict mode over all handwritten backend code and tests, plus disallow_any_explicit, disallow_any_unimported, and warn_unreachable. No blanket ignore_missing_imports or module-wide disabling of checks.
- Enable the Pydantic mypy plugin, with init_typed, init_forbid_extra, and warn_required_dynamic_aliases. Limit any unavoidable third-party suppression to a documented exact line with an error code; it must not weaken application interfaces. The [mypy strict-mode documentation](https://mypy.readthedocs.io/en/stable/command_line.html#cmdoption-mypy-strict) and [Pydantic mypy integration](https://docs.pydantic.dev/latest/integrations/mypy/) document these controls.
- Use Pydantic models with strict numeric/string validation and unknown fields forbidden. Use literal tags/policies and a discriminated component union; intentional decoding of a UUID string at the HTTP boundary remains allowed. [Pydantic strict mode](https://docs.pydantic.dev/latest/concepts/strict_mode/) and [discriminated unions](https://docs.pydantic.dev/latest/concepts/unions/#discriminated-unions) support these choices.
- Define typed response models on every data/error response; a bodyless DELETE success is explicit. Generate the implementation's OpenAPI from these runtime models and compare it with the agreed contract. [FastAPI response models](https://fastapi.tiangolo.com/tutorial/response-model/) provide response validation and OpenAPI schemas.
- Pin a compatible Python/dependency toolchain during implementation. Expose one documented validation command that runs static checking and both test suites; CI must fail on type errors when CI is configured. Typing is an acceptance gate from the first backend code onward.
- Use the repository-local .venv for all backend dependency installs, Python scripts, tests, type checks, and application startup. System Python may only bootstrap the environment. Install dependencies with the environment's Python/pip and declare them in the backend dependency configuration; do not use system or user-site installations.
- Include all five operations, discriminated component schemas, error schemas, status codes, and representative payloads in OpenAPI. Frontend client/type generation must not infer contracts from arbitrary JSON blobs.

## Testing Decisions

The user requested two test seams: HTTP integration tests backed by real temporary SQLite storage, and separate domain unit tests. The workspace has no existing implementation or test suite to reuse.

Good tests verify public behavior and domain rules, not private helpers, SQL text, repository call counts, or class inheritance. HTTP tests exercise the real FastAPI application and persistence adapter; do not replace SQLite with a mocked repository. Use isolated temporary database files and an injectable database location, without touching the user's library.

HTTP integration acceptance:

1. Empty library lists successfully with no items.
2. First Save of an empty or partially connected diagram returns 201, Location, a UUID, normalized name, and equal creation/update timestamps; GET/list expose that entry.
3. Create/save/open a document containing all five component types, positions, labels, integer configuration, fractional weights, zero weights, and explicit destination order; GET restores the same semantic document.
4. A PUT adds, changes, and removes components/connections together, persists changed name/configuration/positions, retains ID/created_at, advances updated_at, and does not retain omitted elements.
5. Renaming through PUT retains the supplied complete diagram. An identical repeated PUT preserves document and timestamps.
6. Creating a new application instance against the same database file still lists and opens saved architectures. Deleted architectures remain deleted after restart.
7. DELETE returns 204 with no body; subsequent GET/PUT/DELETE return 404. List no longer contains the entry.
8. Multiple saved entries list in the documented order and duplicate names remain distinct by ID.
9. Representative strict-type, unknown-field, graph, and unsupported-version failures return the documented envelope. A rejected PUT leaves saved document and updated_at unchanged; a rejected POST creates no entry.
10. Unknown UUIDs, malformed UUIDs, missing bodies, malformed JSON, and incorrect media types have the documented statuses and detail locations.
11. A real SQLite lock or equivalent controlled storage failure causes a failed Save without replacing the previous document; after releasing the failure condition, GET returns the previous state.
12. The served OpenAPI includes every operation, typed schemas, error/status contracts, examples, and the creation Location header. Responses conform to the contract; configured frontend-origin preflight permits the required methods.

Domain unit acceptance:

- Empty and disconnected typed documents are valid to save; missing minimum connections and all-zero weighted destinations remain allowed editing states.
- Duplicate IDs, unknown endpoints, duplicate directed connections, duplicate source-local orders, self-connections, and cycles are rejected with stable domain issue codes and useful field locations.
- Caller Group incoming/outgoing limits, Server outgoing limits, and Database terminal behavior are enforced. Load Balancer/Gateway may have multiple destinations.
- Destination order is explicit and stable when edge arrays are rearranged; distinct source components may reuse the same order values and gaps are valid.
- Multiple sources and merged paths are allowed if acyclic; validation must not incorrectly enforce a tree.
- Component-type configuration, nonnegative weights, positive counts/capacities, exact integer types, and unused caller capacity follow the declared domain contract. Avoid exhaustive repetitions of library validation internals.
- No routing, dropping, clock, or simulation accounting tests are added before that behavior exists.

Separate from functional tests, the required static check covers all handwritten backend and test code with the stated strict configuration. It must reject missing annotations and incompatible assignments/returns; completing the API with type-check failures does not satisfy this milestone.

## Out of Scope

- Simulation calculation, a simulation endpoint, tick frames, playback, routing execution, capacity enforcement at runtime, drops, or request accounting.
- Service/query latency, queues, caching, retries, fanout, health-aware routing, or additional component types.
- Server-side unsaved drafts, automatic Save, per-node/per-connection mutation routes, PATCH, Duplicate, Save As, or a separate save-command endpoint.
- Export/import, retained architecture revisions, document-version migration, pagination, search, authentication, multi-user editing, ETags, and conflict resolution.
- Frontend implementation or deployment. The existing frontend Save/Discard/Cancel and browser leave-warning requirements remain frontend responsibilities.
- Go migration, generic storage frameworks, normalized graph tables, or performance targets without a measured workload.

## Further Notes

- The agreed release 1 contract remains the source of truth for broader product behavior. This spec selects CRUD/Save as its first delivery milestone without changing the simulation model or reopening settled decisions.
- Endpoint paths, DTO names, field spellings, error conventions, replacement semantics, numeric limits, and Save-versus-simulation validation boundaries are concrete API defaults synthesized for this specification. They were not all individually settled during the earlier design interview.
- The companion OpenAPI contract is a design artifact before implementation. Once implemented, runtime models generate OpenAPI; the documented agreement and executable contract must remain aligned rather than maintained as competing sources of truth.
- Testing seams were checked with the user, who requested separate domain tests in addition to HTTP/SQLite integration tests.
- Draft contract checks passed for JSON parsing, 89 local references, 18 schema-checked examples, five operation IDs, and 12 deliberately invalid payloads. These authoring checks used a focused schema walker; full OpenAPI validation and backend runtime verification remain implementation checks.
- Issue-tracker publication is pending: no project tracker or triage configuration was supplied. Run `/setup-matt-pocock-skills`, then publish this specification to the configured tracker with the `ready-for-agent` label. No issue has been created by this task.
