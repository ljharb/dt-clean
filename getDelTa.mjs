import { join } from 'path';
import { pathToFileURL } from 'url';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { findPackageJSON } from 'module';
import { mangleScopedPackage, typesPackageNameToRealName } from '@definitelytyped/utils';

import hasTypes from 'hastypes';
import semver from 'semver';

/** @import getDelTA, { DTPackage, Version } from './getDelTa.d.ts' */
/** @import { PackageJSON } from './types/types.d.ts'*/

/** @type {<T>(entry: [string, T]) => entry is [DTPackage, T]} */
function isDTPackageEntry([name]) {
	return name.startsWith('@types/');
}

/** @type {<T extends string>(name: T) => DTPackage<T>} */
function toDTName(name) {
	return `@types/${mangleScopedPackage(name)}`;
}

/** @type {<T extends string>(name: DTPackage<T>) => T} */
function fromDTName(name) {
	return typesPackageNameToRealName(name);
}

/** @type {getDelTA} */
export default async function getDelTa(cwd = process.cwd()) {
	const packageJSONpath = join(cwd, 'package.json');
	const anchor = pathToFileURL(packageJSONpath);

	/** @type {PackageJSON} */
	const {
		dependencies,
		devDependencies,
	} = JSON.parse(`${await readFile(packageJSONpath)}`);

	const deps = new Map(dependencies ? Object.entries(dependencies) : []);
	const devDeps = new Map(devDependencies ? Object.entries(devDependencies) : []);

	const allDeps = /** @type {const} */ ([...deps, ...devDeps]);

	// `@types/*` packages declared as runtime `dependencies` belong in `devDependencies`.
	const dtRuntimeDepsPresent = new Map(deps.entries().filter(isDTPackageEntry));

	// every `@types/*` package present, whether a runtime or a dev dependency.
	const dtPackagesPresent = new Map(allDeps.filter(isDTPackageEntry));

	if (!existsSync(join(cwd, 'tsconfig.json'))) {
		return {
			present: dtPackagesPresent,
			toAdd: new Map(),
			toMove: new Map(),
			toRemain: new Set(),
			toRemove: dtPackagesPresent.keys().toArray(),
		};
	}

	/** @type {(name: string) => Promise<Version | null>} */
	async function installedVersion(name) {
		try {
			const pkgPath = /** @type {string} */ (findPackageJSON(name, anchor));
			const { version } = JSON.parse(`${await readFile(pkgPath)}`);
			return typeof version === 'string' ? version : null;
		} catch {
			return null;
		}
	}

	/** @type {(name: string, declaredRange: string) => Promise<Version | null>} */
	async function resolveVersion(name, declaredRange) {
		const installed = await installedVersion(name);
		if (installed !== null) {
			return installed;
		}
		// keep any prerelease tag: a prerelease-only package (e.g. `1.0.0-beta.2`) has no coerced stable
		// version on the registry, so dropping it would make the `@types` lookup miss
		return semver.coerce(declaredRange, { includePrerelease: true })?.version ?? null;
	}

	// `node` is never a dependency, yet `@types/node` is always wanted, so it is exempt.
	const nodeTypes = toDTName('node');

	const pToRemove = Promise.all(dtPackagesPresent.keys()
		.filter((name) => name !== nodeTypes)
		.map(async (name) => {
			const realName = fromDTName(name);
			const range = deps.get(realName) ?? devDeps.get(realName);
			// if the real package isn't a declared dependency it may still be installed (transitively, or
			// as a type-only dependency whose types matter), so fall back to the installed version
			const version = typeof range === 'undefined'
				? await installedVersion(realName)
				: await resolveVersion(realName, range);
			if (version === null) {
				// neither declared nor installed => a genuine orphan to remove; declared but unresolvable => keep
				return /** @type {const} */ ([name, typeof range === 'undefined']);
			}
			// query the exact resolved version (a `major.minor` range can miss prerelease-only minors); a
			// dependency whose lookup can't resolve is left alone rather than crashing the whole run
			const shipsOwnTypes = await hasTypes(`${realName}@${version}`).catch(() => false) === true;
			return /** @type {const} */ ([name, shipsOwnTypes]);
		})
		.toArray()).then((entries) => entries.filter(([, remove]) => remove).map(([name]) => name));

	// `hastypes` returns `true` if `X` ships its own types, `false` if no `@types/X`
	// exists, or the `@types/X` specifier string when one exists and is needed.
	const pToAdd = Promise.all(allDeps
		.filter(([name]) => !isDTPackageEntry([name, '']) && !dtPackagesPresent.has(toDTName(name)))
		.map(async ([name, range]) => {
			const version = await resolveVersion(name, range);
			if (version === null) {
				return null;
			}
			const result = await hasTypes(`${name}@${version}`).catch(() => null);
			if (typeof result !== 'string') {
				return null;
			}
			// `hastypes` resolves the `@types` specifier to a full caret range (`@types/x@^a.b.c`); use it as-is
			const dtRange = result.slice(result.lastIndexOf('@') + 1);
			return /** @type {const} */ ([toDTName(name), dtRange]);
		}));

	const [
		toRemove,
		toAdd,
	] = await Promise.all([
		pToRemove,
		pToAdd,
	]);

	const removed = new Set(toRemove);

	const toRemain = new Set(dtPackagesPresent.keys().filter((name) => !removed.has(name)));

	const toMove = new Map(dtRuntimeDepsPresent.entries().filter(([name]) => !removed.has(name)));

	return {
		present: dtPackagesPresent,
		toAdd: new Map(toAdd.filter((x) => x !== null)),
		toMove,
		toRemain,
		toRemove,
	};
}
