# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v1.2.3](https://github.com/ljharb/dt-clean/compare/v1.2.2...v1.2.3) - 2026-11-12

### Commits

- [Fix] exit 64 on usage errors and 70 on other failures, instead of 1 [`2b0dd0d`](https://github.com/ljharb/dt-clean/commit/2b0dd0d434c7eec366e49b252accb6592200f868)
- [actions] add a daily unpinned live-registry drift check [`8eb89f2`](https://github.com/ljharb/dt-clean/commit/8eb89f2fc3d86d27de3bb453a9a7a28671ad18c0)
- [Tests] cover `--auto` via `npx` when stdin is a terminal, or fails to read [`95fdd3d`](https://github.com/ljharb/dt-clean/commit/95fdd3d3ee60d3673949e27dae6ee5b7b6e5d391)
- [Tests] pin live fixture regeneration to a fixed registry date [`a82f5d3`](https://github.com/ljharb/dt-clean/commit/a82f5d3808c7ba354a1b138af9566d338089e06e)
- [types] `exitCode`: include `0` and `5` in the return type [`3950262`](https://github.com/ljharb/dt-clean/commit/3950262fe66111d421ad7c6d62a1d84c656afcdc)
- [Dev Deps] update `@ljharb/eslint-config`, `@types/node`, `auto-changelog`, `c8`, `eslint`, `esmock`, `globals` [`0826d11`](https://github.com/ljharb/dt-clean/commit/0826d11442040ab48cd42c95f401ae299d1c82db)
- [Fix] print usage to stderr on a bad option, keeping stdout clean for `--json` [`a1489a3`](https://github.com/ljharb/dt-clean/commit/a1489a3d2462f5a1b9a3846c018735e592832be6)
- [Deps] update `@definitelytyped/utils`, `hastypes`, `pargs`, `semver` [`0dcc4bc`](https://github.com/ljharb/dt-clean/commit/0dcc4bcfaf1e610c6dd817061b88863b1dfe09b0)
- [Dev Deps] update `c8`, `esmock`, `npmignore`, `tape` [`971bdd8`](https://github.com/ljharb/dt-clean/commit/971bdd89d9b3a5d57423e96701eb2580c74c8ffd)
- [Dev Deps] update `eslint`, `esmock`, `globals` [`41c7115`](https://github.com/ljharb/dt-clean/commit/41c7115d59db2dc1c1044365c4f12ef463840bf9)
- [Tests] update fixtures [`a28d0ac`](https://github.com/ljharb/dt-clean/commit/a28d0ac585d09520cd058ec375a6d835a0aaffb7)
- [Dev Deps] update `@types/semver`, `eslint`, `globals` [`637d9c4`](https://github.com/ljharb/dt-clean/commit/637d9c4623c58932b5304639dce04118f915fc72)
- [Tests] update fixtures [`49016ca`](https://github.com/ljharb/dt-clean/commit/49016ca49638e60c235519c99175f94c8468b276)
- [Refactor] `pipedCommand`: return once, after the `try`/`finally` [`beee1f9`](https://github.com/ljharb/dt-clean/commit/beee1f93a1f21bfd0757b140a402c221c5fa2fbc)
- [actions] set least-privilege `cache-mode` [`c0d9cd3`](https://github.com/ljharb/dt-clean/commit/c0d9cd3f25c2415fc1f5feff50b5f95e1dced877)
- [meta] fix `publishConfig.ignore`: exclude `.nycrc` and `tsconfig.json` [`a8d251c`](https://github.com/ljharb/dt-clean/commit/a8d251c863f653af0bed699f4bc075b0ad86d07b)
- [Deps] update `pargs` [`c9c5e53`](https://github.com/ljharb/dt-clean/commit/c9c5e530c4516b6be51f343d2833773a91f03ce5)
- [Deps] update `pargs` [`a9c5b9d`](https://github.com/ljharb/dt-clean/commit/a9c5b9d461b0008b91a1e3f77c95af3f34a69a00)
- [Deps] update `@definitelytyped/utils` [`3d621a8`](https://github.com/ljharb/dt-clean/commit/3d621a839c50092f1d68104a4cfb2c67750ffb1c)
- [meta] ignore &lt;= moderate issues [`0d3370b`](https://github.com/ljharb/dt-clean/commit/0d3370b2763b0f18e3493014b4c5708abff2c695)
- [readme] document the `--json` option [`4c2ceea`](https://github.com/ljharb/dt-clean/commit/4c2ceea79e03688d563c384fe7dc59d9312c7cbe)

## [v1.2.2](https://github.com/ljharb/dt-clean/compare/v1.2.1...v1.2.2) - 2026-07-18

### Commits

- [Fix] `--auto`: skip quietly on an unsupported node instead of failing the install [`74bbebc`](https://github.com/ljharb/dt-clean/commit/74bbebc2ed46b1a7da6c0d1adbb395bfcc1ed4c6)

## [v1.2.1](https://github.com/ljharb/dt-clean/compare/v1.2.0...v1.2.1) - 2026-07-17

### Commits

- [Fix] `--setup`: forward the npm command through a stdin pipe, so the auto script runs on Windows [`7b31f35`](https://github.com/ljharb/dt-clean/commit/7b31f356191f32b2eb81ff07044c389a1f58ece6)
- [Fix] name an unsupported node version instead of crashing on `#/` resolution [`2e758ef`](https://github.com/ljharb/dt-clean/commit/2e758ef670c6031ac4d8d70dff7bcf45f10e7ed9)
- [types] fix an error TS v6 ignores but v7 fails on [`2b985f7`](https://github.com/ljharb/dt-clean/commit/2b985f733dc915a57493a0a61f2170499ca0adf0)
- [Dev Deps] update `@arethetypeswrong/cli`, `@types/node`, `eslint`, `globals` [`52fc57d`](https://github.com/ljharb/dt-clean/commit/52fc57de3333593bfa4bb130566259755b2710a8)

## [v1.2.0](https://github.com/ljharb/dt-clean/compare/v1.1.1...v1.2.0) - 2026-06-22

### Commits

- [New] `--auto`: support running via `npx`, forwarding the npm command for the `npm ci` no-op [`88732ca`](https://github.com/ljharb/dt-clean/commit/88732ca9e9a9c28933a8adfde68f5b565d6e1a82)

## [v1.1.1](https://github.com/ljharb/dt-clean/compare/v1.1.0...v1.1.1) - 2026-06-21

### Commits

- [Fix] `--setup`: never duplicate `dt-clean`, and converge on the preferred hook [`bc32122`](https://github.com/ljharb/dt-clean/commit/bc321229b54decfd6000e8d58d202604c36af206)
- [Dev Deps] add `dt-clean` (self-reference) [`d1a6cdf`](https://github.com/ljharb/dt-clean/commit/d1a6cdf7de2c29d1a17858bf8febf4bd586253f6)

## [v1.1.0](https://github.com/ljharb/dt-clean/compare/v1.0.1...v1.1.0) - 2026-06-21

### Commits

- [New] add `--auto`, meant for the `dependencies` lifecycle script [`bc60a91`](https://github.com/ljharb/dt-clean/commit/bc60a91bf4f3e4d0964f8dcb71d1b0d1182612f9)
- [Tests] treat taken-down registry packages as skipped, not failures [`d020cc6`](https://github.com/ljharb/dt-clean/commit/d020cc62dd06de08189eebfe45e79a372ec8e5a1)
- [meta] run `dt-clean --setup` [`459cc0c`](https://github.com/ljharb/dt-clean/commit/459cc0cc3a5a2b64e498946c8930ae49899eb8b3)

## [v1.0.1](https://github.com/ljharb/dt-clean/compare/v1.0.0...v1.0.1) - 2026-06-19

### Commits

- [Fix] exit nonzero when changes are needed [`7c19b07`](https://github.com/ljharb/dt-clean/commit/7c19b07735c33d4a757f822355fd7a02760f7aed)
- [readme] use proper indefinite article [`a63be72`](https://github.com/ljharb/dt-clean/commit/a63be726dd3655a1e9bbecc7d8726b8637700888)
- [Deps] update `semver` [`a93456c`](https://github.com/ljharb/dt-clean/commit/a93456cda93fbde6d1c23b5b76418a60c11b14ea)
- [Dev Deps] downgrade `@types/node` [`7aa7c07`](https://github.com/ljharb/dt-clean/commit/7aa7c072d0003816e40591b7aa56cdcbe217fa92)

## v1.0.0 - 2026-06-19

### Commits

- Initial implementation, readme, tests, types, etc [`202952a`](https://github.com/ljharb/dt-clean/commit/202952a1ed579c6864988bb421eda7e27e52c532)
- Initial commit [`e817527`](https://github.com/ljharb/dt-clean/commit/e8175279344f1ce2c490779a6cb5900ed94ec6d2)
- npm init [`9dd6e5c`](https://github.com/ljharb/dt-clean/commit/9dd6e5cbaa1000a0e029c1531c13e359769db844)
- Only apps should have lockfiles [`dd98916`](https://github.com/ljharb/dt-clean/commit/dd9891647c9b54e793ddbb68cdd569fa0aad5967)
- [meta] add version settings [`63d1636`](https://github.com/ljharb/dt-clean/commit/63d16368dfa19750fd19c6264e304f6a0491620c)
