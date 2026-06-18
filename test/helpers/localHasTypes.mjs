import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, dirname, basename, extname } from 'path';
import { mangleScopedPackage } from '@definitelytyped/utils';

/**
 * An offline `hastypes` that reads a fixture's committed `node_modules` stubs instead of the
 * registry: a bundled `.d.ts` means the package ships its own types; otherwise a `@types/`
 * stub means a DefinitelyTyped package exists. Keeps the fixture snapshots deterministic.
 *
 * @type {(cwd: string) => (specifier: string) => Promise<boolean | string>}
 */
export default function localHasTypes(cwd) {
	return async function hasTypes(specifier) {
		const name = specifier.replace(/@[^@/]+$/, '');
		const pkgDir = join(cwd, 'node_modules', name);

		try {
			const { main, types, typings } = JSON.parse(`${await readFile(join(pkgDir, 'package.json'))}`);
			const declared = types ?? typings;
			if (typeof declared === 'string' && declared.endsWith('.d.ts') && existsSync(join(pkgDir, declared))) {
				return true;
			}
			const entry = main ?? 'index.js';
			const extless = join(dirname(entry), basename(entry, extname(entry)));
			if (existsSync(join(pkgDir, `${extless}.d.ts`))) {
				return true;
			}
		} catch {
			return false;
		}

		const dtName = mangleScopedPackage(name);
		const dtDir = join(cwd, 'node_modules', '@types', dtName);
		if (existsSync(join(dtDir, 'package.json'))) {
			const { version } = JSON.parse(`${await readFile(join(dtDir, 'package.json'))}`);
			// match `hastypes`, which returns the resolved `@types` version as a caret range
			return `@types/${dtName}@^${version}`;
		}

		return false;
	};
}
