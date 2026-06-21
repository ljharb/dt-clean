import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';

import detectIndent from '#/detectIndent';

/** @import { PackageJSON } from './types/types.d.ts' */
/** @import { SetupResult } from './setup.d.ts' */

const AUTO = 'dt-clean --auto';

// listed most-preferred first: the `dependencies` event itself, then its `post`/`pre` hooks.
const HOOKS = /** @type {const} */ ([
	'dependencies',
	'postdependencies',
	'predependencies',
]);

/** @param {string | undefined} script */
function hasAuto(script) {
	// matches a `dt-clean … --auto` invocation confined to one `&&`/`;`/`|`-delimited segment
	return typeof script === 'string' && (/\bdt-clean\b[^&|;]*--auto\b/).test(script);
}

/** @param {string | undefined} script */
function hasDtClean(script) {
	return typeof script === 'string' && (/\bdt-clean\b/).test(script);
}

/** @type {import('./setup.d.ts')} */
export default async function setup(cwd) {
	const packageJSONpath = join(cwd, 'package.json');
	const raw = `${await readFile(packageJSONpath)}`;

	/** @type {PackageJSON} */
	const pkg = JSON.parse(raw);

	/** @type {NonNullable<PackageJSON['scripts']>} */
	const scripts = { ...pkg.scripts };

	// a standalone `dt-clean --auto` we wrote ourselves, which we may therefore safely relocate.
	const owned = HOOKS.find((hook) => scripts[hook] === AUTO);

	if (!owned) {
		// a `dt-clean --auto` we didn't write (chained or customized): leave it exactly as-is.
		const wired = HOOKS.find((hook) => hasAuto(scripts[hook]));
		if (wired) {
			return { action: 'present', script: wired };
		}
		// some other `dt-clean` invocation: don't add a second one.
		const existing = HOOKS.find((hook) => hasDtClean(scripts[hook]));
		if (existing) {
			return { action: 'exists', script: existing };
		}
	}

	// the most-preferred hook our invocation should occupy: free, or already holding it.
	const target = HOOKS.find((hook) => !scripts[hook] || scripts[hook] === AUTO);

	if (owned && owned === target) {
		return { action: 'present', script: owned };
	}

	/** @type {SetupResult} */
	let result;
	if (target) {
		if (owned) {
			// a more-preferred hook is now free: relocate to it.
			delete scripts[owned];
		}
		scripts[target] = AUTO;
		result = { action: owned ? 'moved' : 'set', script: target };
	} else {
		// every hook is occupied, so chain onto `dependencies` rather than clobber anything.
		scripts.dependencies = `${scripts.dependencies} && ${AUTO}`;
		result = { action: 'chained', script: 'dependencies' };
	}

	const next = { ...pkg, scripts };
	await writeFile(packageJSONpath, `${JSON.stringify(next, null, detectIndent(raw))}\n`);

	return result;
}
