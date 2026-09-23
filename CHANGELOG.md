# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.7] - 2026-09-23

### Changed

- Release bump for npm support full diagnostic workflow run.

## [0.1.6] - 2026-09-23

### Changed

- Release bump for npm Trusted Publishing smoke test (support ticket).

## [0.1.5] - 2026-09-19

### Changed

- **Publish CI:** Removed temporary OIDC debug logging from the publish workflow; continues **npm stage publish** (fetch-kit model).

### Fixed

- **Dependencies:** `overrides` pin `adm-zip` to 0.6.1 (transitive via `cassandra-driver` audit advisory).

## [0.1.4] - 2026-09-14

### Fixed

- **UPDATE:** Unknown `$`-prefixed mutation operators (e.g. typo `$apend`) now throw `CassqlUnsupportedError` instead of being written as a literal column value. Use `{ $raw: value }` when you intentionally set a literal object that looks like an operator.
- **WHERE:** Operator lookup uses a prototype-less map so keys such as `toString` or `constructor` are rejected like other unsupported operators.
- **WHERE:** `$in` and oversized `$token.value` lists are capped at 2000 elements with `CassqlValidationError`; bound values are appended in a loop to avoid stack overflow from spread on huge arrays.
- **ORDER BY:** Entries missing `column` or `order` throw `CassqlValidationError` instead of being silently dropped.
- **stream():** Query-building validation errors reject the returned Promise (method is `async`), consistent with other `Model` methods.
- **$inc:** Rejects non-finite numbers (`NaN`, `±Infinity`).

### Added

- **`Model` options:** Optional `redactParams` hook masks bound values in `logger.error` output only; `CassqlExecutionError.params` remains raw for debugging.
- **`redactParamsForLogging`:** Exported helper to apply the same masking outside `Model` if needed.
- **README:** Warning about sensitive data in execution error params and how to use `redactParams`.

### Changed

- **`Model.batchExecute`:** Optional fifth argument `redactParams` for batch failure logs.

## [0.1.3] - 2026-09-12

### Changed

- Publish workflow restored to **npm stage publish** (fetch-kit model): CI stages releases; approve on npmjs.com or with `npm stage approve` (2FA).

## [0.1.1] - 2026-03-12

### Changed

- Publish workflow: detect existing npm versions using `package.json` `name` (scoped package).
- README: npm version and license badges.

## [0.1.0] - 2026-03-12

### Added

- Initial public release of **@guzelbaspinar/cassql**: secure, ORM-style Cassandra (CQL) query builder.
- `Model` API: `find`, `findOne`, `findPage`, `count`, `stream`, `insert`, `insertOrThrow`, `update`, `delete`, `raw`, and batch helpers.
- Parameterized CQL with strict identifier validation, dual **CJS** / **ESM** / TypeScript builds.
- GitHub Actions CI (Node 20/22, coverage thresholds) and npm OIDC stage publish workflow.
