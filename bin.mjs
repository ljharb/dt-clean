#!/usr/bin/env node

import { resolve } from 'path';

import pargs from 'pargs';

import getDelTa from '#/getDelTa';
import applyChanges from '#/applyChanges';
import formatReport from '#/report';
import exitCode from '#/exitCode';

const {
	values: { json, update },
	positionals,
	help,
} = await pargs(import.meta.filename, {
	allowPositionals: 1,
	description: 'Reports which DefinitelyTyped (`@types/*`) packages a project should add, move, or remove. By default it only reports; with `--update` it edits `package.json`.',
	options: {
		json: {
			default: false,
			description: 'print the result as JSON on stdout (the human-readable report moves to stderr)',
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

if (update) {
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
	// report-only: the exit code is a bitmask of the pending change kinds, so a clean project exits zero.
	const code = exitCode({
		toAdd,
		toMove,
		toRemove,
	});
	process.exitCode = code;
	if (code > 0) {
		console.error('\nRe-run with `--update` (`-u`) to apply these changes to `package.json`.');
	}
}
