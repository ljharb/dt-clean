import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';

import detectIndent from '#/detectIndent';

/** @type {<K extends string, V>(obj: Record<K, V>) => Record<K, V>} */
function sortKeys(obj) {
	return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

/** @import { PackageJSON } from './types/types.d.ts' */

/** @type {import('./applyChanges.d.ts')} */
export default async function applyChanges(cwd, {
	toAdd,
	toMove,
	toRemove,
}) {
	const packageJSONpath = join(cwd, 'package.json');
	const raw = `${await readFile(packageJSONpath)}`;

	/** @type {PackageJSON} */
	const pkg = JSON.parse(raw);

	/** @type {NonNullable<PackageJSON['dependencies']>} */
	const deps = { ...pkg.dependencies };
	/** @type {NonNullable<PackageJSON['devDependencies']>} */
	const devDeps = { ...pkg.devDependencies };

	toMove.forEach((version, name) => {
		delete deps[name];
		devDeps[name] = version;
	});
	toAdd.forEach((version, name) => {
		devDeps[name] = version;
	});
	toRemove.forEach((name) => {
		delete deps[name];
		delete devDeps[name];
	});

	const next = { ...pkg };
	if (Object.keys(deps).length > 0) {
		next.dependencies = sortKeys(deps);
	} else {
		delete next.dependencies;
	}
	if (Object.keys(devDeps).length > 0) {
		next.devDependencies = sortKeys(devDeps);
	} else {
		delete next.devDependencies;
	}

	const serialized = `${JSON.stringify(next, null, detectIndent(raw))}\n`;
	if (serialized === raw) {
		return false;
	}

	await writeFile(packageJSONpath, serialized);
	return true;
}
