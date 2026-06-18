# dt-clean <sup>[![Version Badge][npm-version-svg]][package-url]</sup>

[![github actions][actions-image]][actions-url]
[![coverage][codecov-image]][codecov-url]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

Ensures the only DefinitelyTyped (`@types/*`) packages you have installed are the ones you need, and points out the ones you're missing.

`dt-clean` inspects your `package.json` and, for each dependency, decides what should happen to its DefinitelyTyped types package:

- **add**: the runtime package ships no types of its own, but a matching `@types/*` package exists on the registry.
- **move**: an `@types/*` package is in `dependencies`, but belongs in `devDependencies`.
- **remove**: an `@types/*` package is installed but no longer needed: the runtime package now bundles its own types, or it no longer corresponds to any dependency.
- **keep**: the `@types/*` package is present and still needed. `@types/node` is always kept.

## Usage

```sh
# report only (the default)
npx dt-clean [dir]

# apply the changes to package.json
npx dt-clean --update [dir]
```

`dir` is the directory containing the `package.json` to inspect, and defaults to the current directory.

By default, `dt-clean` only prints a report and changes nothing:

```
Package         State    Action  Version
--------------  -------  ------  -------
@types/express  present  remove  ^4.0.0
@types/lodash   missing  add     ^4.17
@types/node     present  keep    ^25.0.0

3 `@types/*` packages: 1 keep, 0 move, 1 remove, 1 add.
```

The `State` column tells you whether each DefinitelyTyped package is currently `present` or `missing`; the `Action` column tells you what `--update` would do about it.

With `--update` (`-u`), `dt-clean` edits `package.json` in place - adding, moving, and removing the relevant `@types/*` entries - and then reminds you to run `npm install` (or your package manager's equivalent) to sync `node_modules`.

### Options

- `-u`, `--update`: apply the changes to `package.json` (default: report only).
- `--help`: show usage.

[package-url]: https://npmjs.org/package/dt-clean
[npm-version-svg]: https://versionbadg.es/ljharb/dt-clean.svg
[npm-badge-png]: https://nodei.co/npm/dt-clean.png?downloads=true&stars=true
[license-image]: https://img.shields.io/npm/l/dt-clean.svg
[license-url]: LICENSE
[downloads-image]: https://img.shields.io/npm/dm/dt-clean.svg
[downloads-url]: https://npm-stat.com/charts.html?package=dt-clean
[codecov-image]: https://codecov.io/gh/ljharb/dt-clean/branch/main/graphs/badge.svg
[codecov-url]: https://app.codecov.io/gh/ljharb/dt-clean/
[actions-image]: https://img.shields.io/github/check-runs/ljharb/dt-clean/main
[actions-url]: https://github.com/ljharb/dt-clean/actions
