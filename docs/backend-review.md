# Backend milestone review

Date: 2026-10-03
Baseline: `8c20f7fabac717069d1bb82f96c611e121763537` (approved documents before implementation).
Implementation: `1986ac3`; fixes and re-review: `aef6631`.

The implement skill's code-review step ran separate Standards and Spec agents against the backend changes. The agreed API specification and OpenAPI contract supplied the Spec axis. AGENTS.md, required typing/tooling, and the review skill's smell baseline supplied the Standards axis. Concurrent frontend work was outside this review.

## Standards

No documented standards violations were found. Backend commands use .venv; dynamic SQLite/JSON inputs are validated at adapter boundaries; domain validation stays independent of FastAPI/database access; service/store interfaces follow the specification's small design.

One P3 maintenance judgment was identified: decoding depended on positional agreement between SQLite SELECT projections and model field order. SQLite now uses named rows, and the persistence adapter validates values by column name. The Standards agent confirmed the concern was resolved and found no new meaningful smells or documented violations.

## Spec

Two P2 public-validation findings were identified and fixed:

- Error pointers discarded real unknown-field names equal to component tags. The API now removes only the synthetic discriminated-union location segment, retaining actual field names at root, document, node, position, and connection levels.
- Some control-character-only names became empty after normalization and produced 500. Shared nonblank validation now rejects those names and labels; invalid names return 422 with a field pointer.

Regression tests reproduced the failures before the fixes and passed afterward. The Spec agent confirmed both findings were resolved, with no new concrete gaps, material scope creep, or missing CRUD, graph-validation, or durability requirements.

Standards: one P3 judgment resolved, zero outstanding. Spec: two P2 findings resolved, zero outstanding.

## Verification

- Final required check: `.venv/bin/python scripts/check.py` passed strict mypy over 15 source files and all 73 tests.
- Tests comprise 35 domain cases, 35 HTTP cases using real temporary SQLite files, and three contract cases including full approved/generated OpenAPI validation.
- A deliberately invalid typing probe was rejected for both missing annotations and an incompatible return type.
- Live smoke checks verified API documentation and all five endpoints on the running localhost backend; the smoke architecture was deleted afterward.
- The application initializes a durable SQLite library at `data/architectures.sqlite3` by default. Dependency versions are pinned and installations, tests, and startup all use the repository's .venv.
