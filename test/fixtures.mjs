import test from 'tape';
import esmock from 'esmock';
import {
	readdirSync,
	readFileSync,
	writeFileSync,
	existsSync,
	mkdirSync,
	rmSync,
} from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mangleScopedPackage } from '@definitelytyped/utils';
import semver from 'semver';
import realHasTypes from 'hastypes';

import formatReport from '#/report';
import exitCode from '#/exitCode';
import localHasTypes from './helpers/localHasTypes.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(root, 'fixtures');

const {
	GREP,
	FIXTURE,
	UPDATE_SNAPSHOTS,
	LIVE,
} = process.env;
const grep = GREP ? new RegExp(GREP) : null;
const write = !!(UPDATE_SNAPSHOTS || LIVE);

// `LIVE` resolves against the registry as it was at this moment, so a newly published version
// (eg, an `@types/*` patch) can't make the committed fixtures drift. Bump it deliberately,
// or override it with npm's `before` config, then re-run `npm run tests:live` to adopt newer releases.
// npm config comes from `.npmrc` files and case-insensitive env vars, so only npm can resolve it.
const configuredBefore = LIVE ? execFileSync('npm', ['config', 'get', 'before'], { encoding: 'utf8' }).trim() : 'null';
const before = configuredBefore === 'null' ? '2026-11-12T00:00:00.000Z' : configuredBefore;
if (isNaN(Number(new Date(before)))) {
	throw new TypeError(`npm's \`before\` config must be a valid date; got \`${configuredBefore}\``);
}

const fixtures = readdirSync(fixturesDir, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.filter((name) => (!FIXTURE || name === FIXTURE) && (!grep || grep.test(name)));

const SNAPSHOTS = /** @type {const} */ (['stdout', 'stderr', 'exit-code']);

// `LIVE`: rebuild a fixture's committed `node_modules` stubs from the real registry, so the
// offline runs match reality. A bundled `.d.ts` => ships own types; a `@types/` stub => DT exists.
/** @param {string} dir */
async function regenerateStubs(dir) {
	const nodeModules = join(dir, 'node_modules');
	rmSync(nodeModules, { recursive: true, force: true });

	// without a tsconfig, `getDelTa` short-circuits before resolving any types, so no stubs are needed
	if (!existsSync(join(dir, 'tsconfig.json'))) {
		return;
	}

	const { dependencies, devDependencies } = JSON.parse(`${readFileSync(join(dir, 'package.json'))}`);
	const reals = Object.entries({ ...dependencies, ...devDependencies }).filter(([name]) => !name.startsWith('@types/'));
	await Promise.all(reals.map(async ([name, version]) => {
		const coerced = semver.coerce(version);
		if (!coerced) {
			return;
		}
		const result = await realHasTypes(`${name}@${coerced.major}.${coerced.minor}`, { before });

		const pkgDir = join(nodeModules, name);
		mkdirSync(pkgDir, { recursive: true });
		const stub = { name, version, ...result === true && { types: 'index.d.ts' } };
		writeFileSync(join(pkgDir, 'package.json'), `${JSON.stringify(stub, null, '\t')}\n`);

		if (result === true) {
			writeFileSync(join(pkgDir, 'index.d.ts'), 'export {};\n');
		} else if (typeof result === 'string') {
			const dtName = mangleScopedPackage(name);
			const dtDir = join(nodeModules, '@types', dtName);
			mkdirSync(dtDir, { recursive: true });
			// `hastypes` returns a caret range (`@types/x@^a.b.c`); the stub stores the plain version
			const dtVersion = result.slice(result.lastIndexOf('@') + 1).replace(/^\^/, '');
			writeFileSync(join(dtDir, 'package.json'), `${JSON.stringify({ name: `@types/${dtName}`, version: dtVersion }, null, '\t')}\n`);
		}
	}));
}

// Reconstruct what the CLI prints, resolving types offline via the fixture's committed stubs
// (using `getDelTa`'s own `hasTypes` option - no test-only seam in the runtime CLI)
/** @param {string} dir */
async function runFixture(dir) {
	const getDelTa = await esmock('#/getDelTa', { hastypes: { default: localHasTypes(dir) } });
	const {
		present,
		toAdd,
		toMove,
		toRemove,
	} = await getDelTa(dir);

	const code = exitCode({
		toAdd,
		toMove,
		toRemove,
	});
	return {
		stdout: `${formatReport({
			present,
			toAdd,
			toMove,
			toRemove,
		})}\n`,
		stderr: code > 0 ? '\nRe-run with `--update` (`-u`) to apply these changes to `package.json`.\n' : '',
		'exit-code': `${code}\n`,
	};
}

fixtures.forEach((name) => {
	test(`fixture: ${name}`, async (t) => {
		const dir = join(fixturesDir, name);
		if (LIVE) {
			await regenerateStubs(dir);
		}

		const actual = await runFixture(dir);
		const expectedDir = join(dir, 'expected');

		if (write) {
			mkdirSync(expectedDir, { recursive: true });
			SNAPSHOTS.forEach((file) => writeFileSync(join(expectedDir, file), actual[file]));
			t.pass(`${name}: snapshots written`);
		} else {
			SNAPSHOTS.forEach((file) => {
				const expectedPath = join(expectedDir, file);
				t.ok(existsSync(expectedPath), `${name}: ${file} snapshot exists`);
				t.equal(actual[file], `${readFileSync(expectedPath)}`, `${name}: ${file} matches`);
			});
		}

		t.end();
	});
});
