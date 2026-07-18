#!/usr/bin/env node

import { resolve } from 'path';

// deliberately a relative specifier rather than `#/checkNodeVersion`: resolving a `#/` specifier is
// itself what fails on an unsupported node, so the check has to be reachable without one.
import checkNodeVersion from './checkNodeVersion.mjs';

const unsupported = checkNodeVersion();
if (unsupported) {
	console.error(unsupported);
	process.exit(1);
}

// deferred to dynamic imports so the check above gets to run: static imports are resolved before any
// of this module executes, and on an unsupported node that resolution is exactly what throws.
const [
	{ default: pargs },
	{ default: getDelTa },
	{ default: applyChanges },
	{ default: formatReport },
	{ default: exitCode },
	{ default: setupScripts },
] = await Promise.all([
	import('pargs'),
	import('#/getDelTa'),
	import('#/applyChanges'),
	import('#/report'),
	import('#/exitCode'),
	import('#/setup'),
]);

const {
	values: {
		auto,
		json,
		setup,
		update,
	},
	positionals,
	help,
} = await pargs(import.meta.filename, {
	allowPositionals: 1,
	description: 'Reports which DefinitelyTyped (`@types/*`) packages a project should add, move, or remove. By default it only reports; with `--update` it edits `package.json`.',
	options: {
		auto: {
			default: false,
			description: 'for a `dependencies` lifecycle script (or its `pre`/`post` hooks, or run via `npx`): apply the changes like `--update` during `npm install`, but during `npm ci` only print what would change and exit zero. Through `npx`, pipe the command into stdin (see the README) so the `npm ci` no-op still works',
			type: 'boolean',
		},
		json: {
			default: false,
			description: 'print the result as JSON on stdout (the human-readable report moves to stderr)',
			type: 'boolean',
		},
		setup: {
			default: false,
			description: 'idempotently add (or upgrade) a `dt-clean --auto` `dependencies` lifecycle script in `package.json`, without overwriting any script it did not author',
			type: 'boolean',
		},
		update: {
			default: false,
			description: 'apply the changes to `package.json`, then run `npm install` (or your package manager\'s equivalent)',
			short: 'u',
			type: 'boolean',
		},
	},
	positionals: [{ description: 'directory containing the `package.json` to inspect (default: the current directory)', name: 'dir' }],
});

await help();

const cwd = positionals.length > 0 ? resolve(positionals[0]) : process.cwd();

const {
	npm_command: npmCommand,
	npm_lifecycle_event: lifecycleEvent,
	DT_CLEAN_NPM_COMMAND: forwardedCommand,
} = process.env;

// the `dependencies` lifecycle and its `pre`/`post` hooks are the only safe slots for `--auto`,
// since npm runs them after a reify; `postdependencies`/`predependencies` let you add it without
// clobbering an existing `dependencies` script.
const DEPENDENCY_HOOKS = [
	'predependencies',
	'dependencies',
	'postdependencies',
];

// `npx` (`npm exec`) re-stamps `npm_lifecycle_event` to `npx` and overwrites the real `npm_command`
// with `exec`, so when a `dependencies` script runs `dt-clean` through `npx` the original command is
// only knowable if the script forwarded it (see the README).
const viaNpx = lifecycleEvent === 'npx';

/**
 * only an actual npm subcommand name counts: a value that did not expand (a literal `$npm_command`),
 * or empty input, is not a command.
 * @param {string | undefined} value
 */
function asCommand(value) {
	const trimmed = typeof value === 'string' ? value.trim() : '';
	return (/^[a-z-]+$/).test(trimmed) ? trimmed : undefined;
}

// the portable `dependencies` script pipes `node -p "process.env.npm_command"` into stdin, because
// npx erases the real command and no version-range escape survives both cmd.exe and POSIX shells.
// read it only when a pipe is attached, and never block a running install on a stdin left open.
async function pipedCommand() {
	if (process.stdin.isTTY) {
		return undefined;
	}
	const { text } = await import('stream/consumers');
	const timer = setTimeout(() => process.stdin.destroy(), 10000);
	timer.unref();
	try {
		return asCommand(await text(process.stdin));
	} catch {
		// destroyed by the timeout, or a read error: treat it as nothing forwarded
		return undefined;
	} finally {
		clearTimeout(timer);
	}
}

// the command npm is really running: straight from npm when invoked directly; through `npx` it comes
// from the piped stdin, falling back to the legacy `DT_CLEAN_NPM_COMMAND` env var that older setups
// forward (checked first, so those scripts never touch stdin).
let forwarded;
if (auto && viaNpx) {
	forwarded = asCommand(forwardedCommand);
	if (!forwarded) {
		forwarded = await pipedCommand();
	}
}
const effectiveCommand = viaNpx ? forwarded : npmCommand;

if (setup) {
	const { action, script } = await setupScripts(cwd);
	console.log({
		chained: `Appended \`dt-clean --auto\` to the existing \`${script}\` script in \`package.json\`.`,
		exists: `\`${script}\` already invokes \`dt-clean\` (without \`--auto\`); leaving it unchanged - add \`--auto\` there yourself for install-time cleanup.`,
		moved: `Moved \`dt-clean --auto\` to the preferred \`${script}\` script in \`package.json\`.`,
		present: `\`${script}\` already runs \`dt-clean --auto\`; nothing to do.`,
		set: `Added \`dt-clean --auto\` to the \`${script}\` script in \`package.json\`.`,
		upgraded: `Upgraded the \`dt-clean --auto\` invocation in the \`${script}\` script in \`package.json\`.`,
	}[action]);
} else if (auto && !viaNpx && (!lifecycleEvent || !DEPENDENCY_HOOKS.includes(lifecycleEvent))) {
	console.error('`--auto` only runs inside a `dependencies` (or `pre`/`postdependencies`) lifecycle script, or via `npx` (see the README); use `--update` to apply changes manually.');
	process.exitCode = 1;
} else if (auto && viaNpx && !forwarded) {
	// run through `npx`, npm has already erased the real `npm_command`, so without the piped value
	// `--auto` cannot tell `npm install` from `npm ci`; rather than guess, fail loudly with the fix.
	console.error('`--auto` run via `npx` needs the real npm command, which `npx` otherwise erases. Pipe it in with `node -p "process.env.npm_command" | npx dt-clean --auto` as your `dependencies` script (or run `dt-clean --setup` to write it); use `--update` to apply changes manually.');
	process.exitCode = 1;
} else {
	const {
		present,
		toAdd,
		toMove,
		toRemain,
		toRemove,
	} = await getDelTa(cwd);

	const report = formatReport({
		present,
		toAdd,
		toMove,
		toRemove,
	});

	if (json) {
		console.log(JSON.stringify({
			present: Object.fromEntries(present),
			toAdd: Object.fromEntries(toAdd),
			toMove: Object.fromEntries(toMove),
			toRemain: Array.from(toRemain),
			toRemove,
		}, null, '\t'));
		console.error(report);
	} else {
		console.log(report);
	}

	// any command other than `npm ci` is a write context: directly, npm always sets `npm_command` (an
	// absent one means `npm install`); through `npx`, the guard above guarantees a forwarded command,
	// so `effectiveCommand` is known here either way.
	const applyAuto = auto && effectiveCommand !== 'ci';

	if (update || applyAuto) {
		// `--update` applies the changes, leaving the project clean, so a successful run exits zero;
		// only an error (e.g. a failed write, which throws) yields a nonzero exit.
		const changed = await applyChanges(cwd, {
			toAdd,
			toMove,
			toRemove,
		});
		console.error(changed
			? '\nUpdated `package.json`; run `npm install` (or your package manager’s equivalent) to sync.'
			: '\nNo changes needed.');
	} else {
		const code = exitCode({
			toAdd,
			toMove,
			toRemove,
		});
		if (auto) {
			// `--auto` under `npm ci`: leave the exit code at zero so a CI install never fails; the
			// report above already lists what `npm install` would change.
			if (code > 0) {
				console.error('\n`npm ci` detected; `package.json` left unchanged. Run `npm install` or `dt-clean --update` to apply these changes.');
			}
		} else {
			// report-only: the exit code is a bitmask of the pending change kinds, so a clean project exits zero.
			process.exitCode = code;
			if (code > 0) {
				console.error('\nRe-run with `--update` (`-u`) to apply these changes to `package.json`.');
			}
		}
	}
}
