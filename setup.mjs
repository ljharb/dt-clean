import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { createRequire } from 'module';

import detectIndent from '#/detectIndent';

/** @import { PackageJSON } from './types/types.d.ts' */
/** @import { SetupResult } from './setup.d.ts' */

const { version } = createRequire(import.meta.url)('./package.json');

// run through `npx`, npm erases the real `npm_command`, so the script forwards it in
// `DT_CLEAN_NPM_COMMAND` (a POSIX-shell expansion) to keep the `npm ci` no-op working; the version
// pin guarantees `npx` resolves a `dt-clean` new enough to honor it.
const AUTO = `DT_CLEAN_NPM_COMMAND="$npm_command" npx dt-clean@^${version} --auto`;

// listed most-preferred first: the `dependencies` event itself, then its `post`/`pre` hooks.
const HOOKS = /** @type {const} */ ([
	'dependencies',
	'postdependencies',
	'predependencies',
]);

// a standalone `dt-clean … --auto` invocation we authored (any era: bare, `npx`-wrapped, version
// pinned, and/or command-forwarding), which we may therefore safely relocate or upgrade in place.
const OWNED = /^(?:DT_CLEAN_NPM_COMMAND="\$npm_command" )?(?:npx )?dt-clean(?:@\S+)? --auto$/;

/** @param {string | undefined} script */
function isOwned(script) {
	return typeof script === 'string' && OWNED.test(script);
}

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

	const owned = HOOKS.find((hook) => isOwned(scripts[hook]));

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

	// the most-preferred hook our invocation should occupy: free, or already holding one of ours.
	const target = HOOKS.find((hook) => !scripts[hook] || isOwned(scripts[hook]));

	/** @type {SetupResult} */
	let result;
	if (target) {
		if (owned && owned !== target) {
			// a more-preferred hook is now free: relocate (and bring the current form with us).
			delete scripts[owned];
			scripts[target] = AUTO;
			result = { action: 'moved', script: target };
		} else if (owned === target && scripts[target] === AUTO) {
			return { action: 'present', script: owned };
		} else if (owned) {
			// our invocation is already best-placed but written in an older form: upgrade it in place.
			scripts[target] = AUTO;
			result = { action: 'upgraded', script: target };
		} else {
			scripts[target] = AUTO;
			result = { action: 'set', script: target };
		}
	} else {
		// every hook is occupied, so chain onto `dependencies` rather than clobber anything.
		scripts.dependencies = `${scripts.dependencies} && ${AUTO}`;
		result = { action: 'chained', script: 'dependencies' };
	}

	const next = { ...pkg, scripts };
	await writeFile(packageJSONpath, `${JSON.stringify(next, null, detectIndent(raw))}\n`);

	return result;
}
