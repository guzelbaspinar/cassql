# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
