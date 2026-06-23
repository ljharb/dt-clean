# dt-clean <sup>[![Version Badge][npm-version-svg]][package-url]</sup>

[![github actions][actions-image]][actions-url]
[![coverage][codecov-image]][codecov-url]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

Ensures the only DefinitelyTyped (`@types/*`) packages you have installed are the ones you need, and points out the ones you're missing.

`dt-clean` inspects your `package.json` and, for each dependency, decides what should happen to its DefinitelyTyped types package:

- **add**: the runtime package ships no types of its own, but a matching `@types/*` package exists on the registry.
- **move**: a `@types/*` package is in `dependencies`, but belongs in `devDependencies`.
- **remove**: a `@types/*` package is installed but no longer needed: the runtime package now bundles its own types, or it no longer corresponds to any dependency.
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
- `--setup`: idempotently wire (or upgrade) `dt-clean --auto` in a `dependencies` lifecycle script, without overwriting any script it did not author (see [Automatic cleanup](#automatic-cleanup)).
- `--auto`: for use in a `dependencies` lifecycle script (run directly or via `npx`) - apply the changes like `--update` during `npm install`, but during `npm ci` only print what would change and exit `0`. Through `npx`, the script must forward the command in `DT_CLEAN_NPM_COMMAND` for the `npm ci` no-op to work (see [Automatic cleanup](#automatic-cleanup)).
- `--help`: show usage.

### Automatic cleanup

To keep your `@types/*` set tidy on every install, run `dt-clean --auto` from a [`dependencies` lifecycle script](https://docs.npmjs.com/cli/using-npm/scripts#npm-install) - the one npm's installer (arborist) runs after any operation that changes `node_modules`.

The one-step way to set this up, in any project, is:

```sh
npx dt-clean --setup
```

`--setup` edits `package.json` for you and is safe to run anywhere:

- if you have no `dependencies` script, it adds one that runs `dt-clean --auto` via `npx` (so `dt-clean` itself need not be a dependency);
- if you already have one, it adds the invocation to a free `postdependencies` (or `predependencies`) hook instead, so your existing script is never touched - and if every hook is taken, it appends `&& …` to your `dependencies` script rather than clobbering it;
- if it already placed the invocation in a `post`/`pre` hook and the preferred `dependencies` slot later frees up, re-running moves it back to the most-preferred available hook;
- if an older form of the invocation it authored is present (a bare `dt-clean --auto`, or one without the command-forwarding prefix), re-running **upgrades it in place** to the current form;
- if the current invocation is already in the best available hook, it does nothing; and if some other `dt-clean` invocation (or a customized one you wrote) is already present, it leaves that alone rather than adding a duplicate.

It only ever manages this one invocation and leaves the rest of your `package.json` (and its formatting) alone, so it's safe to re-run - repeated runs converge on the same result. That result is the equivalent of:

```json
{
  "scripts": {
    "dependencies": "DT_CLEAN_NPM_COMMAND=\"$npm_command\" npx dt-clean@^1.2.0 --auto"
  }
}
```

The `DT_CLEAN_NPM_COMMAND="$npm_command"` prefix is why this looks more involved than a bare `dt-clean --auto`: `npx` (`npm exec`) runs `dt-clean` in a fresh environment where npm's own `npm_command` has been overwritten (to `exec`), so without this forward `dt-clean` could not tell `npm install` from `npm ci`. The prefix copies the real command into a variable that survives `npx`, which `dt-clean` reads back. (It is a POSIX-shell expansion, matching npm's default script shell on macOS and Linux.)

Once it's wired in, `dt-clean --auto` decides what to do from the npm command - read straight from `npm_command` when invoked directly, or from the forwarded `DT_CLEAN_NPM_COMMAND` when invoked through `npx`:

- under `npm install`, it applies the changes for you, so a fresh install keeps your `@types/*` set tidy automatically;
- under `npm ci` (typically used in CI pipelines, where `package.json` must not be mutated), it only prints what would change and exits `0`, so it never edits a checked-in file and never fails the install.

When invoked directly and `npm_command` is anything else (or absent), `--auto` applies the changes, exactly as under `npm install`. When invoked through `npx` *without* a forwarded command (for example a hand-written `npx dt-clean --auto` that omits the prefix), `dt-clean` cannot tell `install` from `ci`, so rather than risk mutating `package.json` during a `ci` it **errors and exits nonzero**, printing the prefix to add (or just run `dt-clean --setup`). It never guesses.

To avoid surprising edits, `--auto` runs *only* inside the `dependencies` lifecycle (or its `predependencies`/`postdependencies` hooks), or via `npx`: it checks `npm_lifecycle_event`, and if it is invoked any other way (for example directly from the shell) it refuses to do anything and exits nonzero. Use `--update` to apply changes manually.

### Exit codes

In the default report-only mode, the exit code is a bitmask of the kinds of pending changes, so a clean project exits `0` and you can fail CI (or a `git` pre-commit hook) on drift:

| Value | Meaning                                  |
| ----- | ---------------------------------------- |
| `1`   | there are `@types/*` packages to remove  |
| `2`   | there are `@types/*` packages to add     |
| `4`   | there are `@types/*` packages to move    |

The bits combine, so a project that needs both an add and a remove exits `3`, and one that needs all three exits `7`.

With `--update`, `dt-clean` applies the changes, leaving the project clean, so a successful run always exits `0`;
a nonzero exit then means the update itself failed.

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
