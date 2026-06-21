#!/usr/bin/env node

import { resolve } from 'path';

import pargs from 'pargs';

import getDelTa from '#/getDelTa';
import applyChanges from '#/applyChanges';
import formatReport from '#/report';
import exitCode from '#/exitCode';
import setupScripts from '#/setup';

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
			description: 'for a `dependencies` lifecycle script (or its `pre`/`post` hooks): apply the changes like `--update` during `npm install`, but during `npm ci` only print what would change and exit zero',
			type: 'boolean',
		},
		json: {
			default: false,
			description: 'print the result as JSON on stdout (the human-readable report moves to stderr)',
			type: 'boolean',
		},
		setup: {
			default: false,
			description: 'idempotently add `dt-clean --auto` to a `dependencies` lifecycle script in `package.json`, without overwriting any existing script',
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

const { npm_command: npmCommand, npm_lifecycle_event: lifecycleEvent } = process.env;

// the `dependencies` lifecycle and its `pre`/`post` hooks are the only safe slots for `--auto`,
// since npm runs them after a reify; `postdependencies`/`predependencies` let you add it without
// clobbering an existing `dependencies` script.
const DEPENDENCY_HOOKS = [
	'predependencies',
	'dependencies',
	'postdependencies',
];

if (setup) {
	const { action, script } = await setupScripts(cwd);
	console.log({
		chained: `Appended \`dt-clean --auto\` to the existing \`${script}\` script in \`package.json\`.`,
		exists: `\`${script}\` already invokes \`dt-clean\` (without \`--auto\`); leaving it unchanged - add \`--auto\` there yourself for install-time cleanup.`,
		moved: `Moved \`dt-clean --auto\` to the preferred \`${script}\` script in \`package.json\`.`,
		present: `\`${script}\` already runs \`dt-clean --auto\`; nothing to do.`,
		set: `Added \`dt-clean --auto\` to the \`${script}\` script in \`package.json\`.`,
	}[action]);
} else if (auto && (!lifecycleEvent || !DEPENDENCY_HOOKS.includes(lifecycleEvent))) {
	console.error('`--auto` only runs inside a `dependencies` (or `pre`/`postdependencies`) lifecycle script (see the README); use `--update` to apply changes manually.');
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

	if (update || (auto && npmCommand !== 'ci')) {
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
