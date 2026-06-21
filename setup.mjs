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

/** @type {import('./setup.d.ts')} */
export default async function setup(cwd) {
	const packageJSONpath = join(cwd, 'package.json');
	const raw = `${await readFile(packageJSONpath)}`;

	/** @type {PackageJSON} */
	const pkg = JSON.parse(raw);

	/** @type {NonNullable<PackageJSON['scripts']>} */
	const scripts = { ...pkg.scripts };

	const present = HOOKS.find((hook) => hasAuto(scripts[hook]));
	if (present) {
		return { action: 'present', script: present };
	}

	const free = HOOKS.find((hook) => !scripts[hook]);

	/** @type {SetupResult} */
	let result;
	if (free) {
		scripts[free] = AUTO;
		result = { action: 'set', script: free };
	} else {
		// every hook is occupied, so chain onto `dependencies` rather than clobber anything.
		scripts.dependencies = `${scripts.dependencies} && ${AUTO}`;
		result = { action: 'chained', script: 'dependencies' };
	}

	const next = { ...pkg, scripts };
	await writeFile(packageJSONpath, `${JSON.stringify(next, null, detectIndent(raw))}\n`);

	return result;
}
