import test from 'tape';
import esmock from 'esmock';
import { spawnSync } from 'child_process';
import {
	mkdtempSync,
	mkdirSync,
	writeFileSync,
	readFileSync,
	rmSync,
} from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import applyChanges from '#/applyChanges';
import formatReport from '#/report';

const root = dirname(fileURLToPath(import.meta.url));
const binPath = join(root, '..', 'bin.mjs');

/** @import { Test } from 'tape' */

/** @param {{ pkg: object, installed?: Record<string, unknown>, tsconfig?: boolean }} spec */
function makeProject({ pkg, installed = {}, tsconfig = true }) {
	const dir = mkdtempSync(join(tmpdir(), 'dt-clean-'));
	writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg, null, '\t')}\n`);
	if (tsconfig) {
		writeFileSync(join(dir, 'tsconfig.json'), '{}\n');
	}
	Object.entries(installed).forEach(([name, version]) => {
		const pkgDir = join(dir, 'node_modules', name);
		mkdirSync(pkgDir, { recursive: true });
		writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name, version }));
	});
	return dir;
}

/** @type {(t: Test, spec: { pkg: object, installed?: Record<string, unknown>, tsconfig?: boolean }) => string} */
function project(t, spec) {
	const dir = makeProject(spec);

	t.teardown(() => rmSync(dir, { recursive: true, force: true }));

	return dir;
}

const responses = /** @type {const} */ ({
	shipsown: true,
	shipsown2: true,
	runtimemove: false,
	'no-dt': false,
	weird: false,
	'needs-dt': '@types/needs-dt@^2.3.7',
	'declared-only': '@types/declared-only@^3.4.1',
});

/** @type {(specifier: string) => Promise<boolean | string>} */
async function fakeHasTypes(specifier) {
	const name = specifier.replace(/@[^@/]+$/, '');
	if (!(name in responses)) {
		throw new Error(`unexpected hasTypes call: ${specifier}`);
	}
	return responses[/** @type {keyof typeof responses} */ (name)];
}

/** @type {(hasTypes: (specifier: string) => Promise<boolean | string>) => Promise<typeof import('#/getDelTa').default>} */
function loadGetDelTa(hasTypes) {
	return esmock('#/getDelTa', { hastypes: { default: hasTypes } });
}

/** @param {Map<string, unknown> | Set<string> | string[]} map */
function keys(map) {
	return (map instanceof Map ? map.keys() : map.values()).toArray().sort();
}

test('getDelTa: classifies add / move / remove / remain', async (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: {
				'@types/runtimemove': '^1.0.0',
				runtimemove: '^1.2.3',
				'@types/shipsown': '^1.0.0',
				shipsown: '^1.0.0',
				'needs-dt': '^2.3.4',
				'no-dt': '^1.0.0',
				shipsown2: '^1.0.0',
				'declared-only': '^3.4.5',
				starred: '*',
				weird: '^4.0.0',
			},
			devDependencies: {
				'@types/node': '^25.0.0',
				'@types/orphan': '^1.0.0',
				'@types/starred2': '^1.0.0',
				starred2: '*',
			},
		},
		installed: {
			runtimemove: '1.2.3',
			shipsown: '1.0.0',
			shipsown2: '1.0.0',
			'needs-dt': '2.3.4',
			'no-dt': '1.0.0',
			weird: 123,
		},
	});

	const getDelTa = await loadGetDelTa(fakeHasTypes);
	const {
		present,
		toAdd,
		toMove,
		toRemove,
		toRemain,
	} = await getDelTa(dir);

	t.deepEqual(
		keys(present),
		['@types/node', '@types/orphan', '@types/runtimemove', '@types/shipsown', '@types/starred2'],
		'every `@types/*` is present',
	);
	t.deepEqual(keys(toRemove), ['@types/orphan', '@types/shipsown'], 'orphan + ships-own-types are removed');
	t.deepEqual(keys(toMove), ['@types/runtimemove'], 'runtime `@types` that stays is moved; removed one is not');
	t.deepEqual(keys(toAdd), ['@types/declared-only', '@types/needs-dt'], 'untyped deps with `@types` get added');
	t.deepEqual(toAdd.get('@types/needs-dt'), '^2.3.7', 'added range pins the full resolved `@types` triple');
	t.deepEqual(toAdd.get('@types/declared-only'), '^3.4.1', 'added range pins the full resolved `@types` triple even when the real package is not installed');
	t.deepEqual(
		keys(toRemain),
		['@types/node', '@types/runtimemove', '@types/starred2'],
		'kept `@types` (incl. node) remain',
	);

	t.end();
});

test('getDelTa: defaults cwd and hasTypes', async (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: { '@types/orphan': '^1.0.0' },
			devDependencies: { '@types/node': '^25.0.0' },
		},
	});

	const orig = process.cwd();
	process.chdir(dir);
	t.teardown(() => process.chdir(orig));

	const { default: getDelTa } = await import('#/getDelTa');
	const { toRemove, toMove, toAdd } = await getDelTa();

	t.deepEqual(keys(toRemove), ['@types/orphan'], 'orphan removed using default cwd + real hasTypes');
	t.deepEqual(keys(toMove), [], 'removed orphan is excluded from moves');
	t.deepEqual(keys(toAdd), [], 'nothing to add');

	t.end();
});

test('getDelTa: handles a project with no devDependencies', async (t) => {
	const dir = project(t, { pkg: { dependencies: { '@types/orphan': '^1.0.0' } } });

	const getDelTa = await loadGetDelTa(fakeHasTypes);
	const { toRemove } = await getDelTa(dir);

	t.deepEqual(keys(toRemove), ['@types/orphan'], 'classifies with only `dependencies` present');

	t.end();
});

test('getDelTa: with no tsconfig, every `@types` is removable', async (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: { lodash: '4.17.21' },
			devDependencies: {
				'@types/lodash': '4.17.13',
				'@types/node': '22.10.2',
			},
		},
		tsconfig: false,
	});

	const getDelTa = await loadGetDelTa(fakeHasTypes);
	const {
		toAdd,
		toMove,
		toRemove,
		toRemain,
	} = await getDelTa(dir);

	t.deepEqual(keys(toRemove), ['@types/lodash', '@types/node'], 'all `@types` (even `@types/node`) are removed');
	t.deepEqual(keys(toAdd), [], 'nothing is added without a `tsconfig.json`');
	t.deepEqual(keys(toMove), [], 'nothing to move');
	t.deepEqual(keys(toRemain), [], 'nothing remains');

	t.end();
});

test('getDelTa: tolerates a dependency whose type lookup fails', async (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: {
				'@types/some-pkg': '1.0.0',
				'some-pkg': '1.0.0',
				'other-pkg': '2.0.0',
			},
		},
		installed: {
			'some-pkg': '1.0.0',
			'other-pkg': '2.0.0',
		},
	});

	const getDelTa = await loadGetDelTa(() => Promise.reject(new Error('lookup failed')));
	const {
		toAdd,
		toRemove,
	} = await getDelTa(dir);

	t.deepEqual(keys(toRemove), [], 'a present `@types` whose lookup fails is left in place');
	t.deepEqual(keys(toAdd), [], 'a dependency whose lookup fails is not added');

	t.end();
});

test('getDelTa: preserves a prerelease range when the dep is not installed', async (t) => {
	const dir = project(t, { pkg: { dependencies: { 'pre-pkg': '1.0.0-beta.2' } } });

	// only answers for the exact prerelease spec; a coerced `1.0.0` lookup would miss the `@types`
	/** @type {(specifier: string) => Promise<boolean | string>} */
	async function hasTypes(specifier) {
		return specifier === 'pre-pkg@1.0.0-beta.2' ? '@types/pre-pkg@^1.0.5' : false;
	}

	const getDelTa = await loadGetDelTa(hasTypes);
	const { toAdd } = await getDelTa(dir);

	t.deepEqual(keys(toAdd), ['@types/pre-pkg'], 'looks up the prerelease version, not a coerced stable one');
	t.equal(toAdd.get('@types/pre-pkg'), '^1.0.5', 'adds the available `@types`');

	t.end();
});

test('getDelTa: keeps `@types` for an installed-but-undeclared package', async (t) => {
	const dir = project(t, {
		pkg: { devDependencies: { '@types/runtimemove': '^1.0.0' } },
		installed: { runtimemove: '1.2.3' },
	});

	const getDelTa = await loadGetDelTa(fakeHasTypes);
	const {
		toRemove,
		toRemain,
	} = await getDelTa(dir);

	t.deepEqual(keys(toRemove), [], 'a transitively-installed (or type-only) package keeps its `@types`');
	t.deepEqual(keys(toRemain), ['@types/runtimemove'], 'the `@types` remains');

	t.end();
});

test('applyChanges: moves, adds, and removes, sorted', async (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: {
				'@types/moved': '^2.0.0',
				'@types/removed': '^1.0.0',
				left: '^1.0.0',
			},
			devDependencies: { zzz: '^1.0.0' },
		},
	});

	const changed = await applyChanges(dir, {
		toAdd: new Map([['@types/added', '^3.0.0']]),
		toMove: new Map([['@types/moved', '^2.0.0']]),
		toRemove: ['@types/removed'],
	});

	t.equal(changed, true, 'reports that it changed the file');

	const pkg = JSON.parse(`${readFileSync(join(dir, 'package.json'))}`);
	t.deepEqual(pkg.dependencies, { left: '^1.0.0' }, 'moved/removed `@types` leave `dependencies`');
	t.deepEqual(
		Object.keys(pkg.devDependencies),
		['@types/added', '@types/moved', 'zzz'],
		'added + moved land in `devDependencies`, sorted',
	);

	t.end();
});

test('applyChanges: emptying a section deletes the key', async (t) => {
	const dir = project(t, { pkg: { dependencies: { '@types/removed': '^1.0.0' } } });

	const changed = await applyChanges(dir, {
		toAdd: new Map(),
		toMove: new Map(),
		toRemove: ['@types/removed'],
	});

	t.equal(changed, true, 'reports a change');
	const pkg = JSON.parse(`${readFileSync(join(dir, 'package.json'))}`);
	t.notOk('dependencies' in pkg, 'empty `dependencies` is deleted');

	t.end();
});

test('applyChanges: no-op leaves the file untouched', async (t) => {
	const dir = project(t, { pkg: { devDependencies: { '@types/node': '^25.0.0' } } });
	const before = `${readFileSync(join(dir, 'package.json'))}`;

	const changed = await applyChanges(dir, {
		toAdd: new Map(),
		toMove: new Map(),
		toRemove: [],
	});

	t.equal(changed, false, 'reports no change');
	t.equal(`${readFileSync(join(dir, 'package.json'))}`, before, 'file is byte-for-byte identical');

	t.end();
});

test('applyChanges: defaults indentation to tabs', async (t) => {
	const dir = mkdtempSync(join(tmpdir(), 'dt-clean-'));
	t.teardown(() => rmSync(dir, { recursive: true, force: true }));
	writeFileSync(join(dir, 'package.json'), '{"devDependencies":{"@types/removed":"^1.0.0","keep":"^1.0.0"}}');

	const changed = await applyChanges(dir, {
		toAdd: new Map(),
		toMove: new Map(),
		toRemove: ['@types/removed'],
	});

	t.equal(changed, true, 'reports a change');
	t.ok((/\n\t/).test(`${readFileSync(join(dir, 'package.json'))}`), 'rewrites an unindented file with tabs');

	t.end();
});

test('formatReport: tabulates every state and action', (t) => {
	const out = formatReport({
		present: new Map([
			['@types/keep', '^1.0.0'],
			['@types/move', '^2.0.0'],
			['@types/remove', '^3.0.0'],
		]),
		toAdd: new Map([['@types/add', '^4.5']]),
		toMove: new Map([['@types/move', '^2.0.0']]),
		toRemove: ['@types/remove'],
	});

	t.match(out, /Package\s+State\s+Action\s+Version/, 'has a header row');
	t.match(out, /@types\/keep\s+present\s+keep\s+\^1\.0\.0/, 'keeps a present, needed `@types`');
	t.match(out, /@types\/move\s+present\s+move\s+\^2\.0\.0/, 'flags a runtime `@types` to move');
	t.match(out, /@types\/remove\s+present\s+remove\s+\^3\.0\.0/, 'flags an unneeded `@types` to remove');
	t.match(out, /@types\/add\s+missing\s+add\s+\^4\.5/, 'flags a missing `@types` to add');
	t.match(out, /4 `@types\/\*` packages: 1 keep, 1 move, 1 remove, 1 add\./, 'summarizes the counts');

	t.end();
});

test('formatReport: singular summary and empty case', (t) => {
	t.match(
		formatReport({
			present: new Map([['@types/node', '^25.0.0']]),
			toAdd: new Map(),
			toMove: new Map(),
			toRemove: [],
		}),
		/1 `@types\/\*` package: 1 keep/,
		'uses the singular for a single `@types`',
	);

	t.equal(
		formatReport({
			present: new Map(),
			toAdd: new Map(),
			toMove: new Map(),
			toRemove: [],
		}),
		'No `@types/*` packages are present or needed.',
		'reports when there is nothing to show',
	);

	t.end();
});

/** @type {(args: string[], opts?: { cwd?: string }) => { stdout: string, stderr: string }} */
function runBin(args, { cwd } = {}) {
	const { stdout, stderr } = spawnSync('node', [binPath, ...args], {
		cwd,
		encoding: 'utf8',
	});
	return { stdout, stderr };
}

test('bin: --help prints usage', (t) => {
	const { stdout } = runBin(['--help']);
	t.ok((/Usage: dt-clean/).test(stdout), 'prints the help text');
	t.end();
});

test('bin: reports a dirty project via a positional dir', (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: { '@types/orphan': '^1.0.0' },
			devDependencies: { '@types/node': '^25.0.0' },
		},
	});

	const { stdout } = runBin([dir]);
	t.ok((/@types\/orphan/).test(stdout), 'lists the orphaned `@types`');
	t.end();
});

test('bin: --json prints structured data on stdout, report on stderr', (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: { '@types/orphan': '^1.0.0' },
			devDependencies: { '@types/node': '^25.0.0' },
		},
	});

	const { stdout, stderr } = runBin(['--json', dir]);
	const data = JSON.parse(stdout);

	t.deepEqual(data.toRemove, ['@types/orphan'], '`toRemove` is in the JSON');
	t.deepEqual(data.toRemain, ['@types/node'], '`toRemain` is a JSON array');
	t.deepEqual(Object.keys(data.present).sort(), ['@types/node', '@types/orphan'], '`present` is keyed by name');
	t.match(stderr, /@types\/orphan\s+present\s+remove/, 'the human-readable report is on stderr');
	t.end();
});

test('bin: reports a clean project from the current directory', (t) => {
	const dir = project(t, { pkg: { devDependencies: { '@types/node': '^25.0.0' } } });

	const { stdout } = runBin([], { cwd: dir });
	t.match(stdout, /@types\/node\s+present\s+keep/, 'tabulates the kept `@types` from the current directory');
	t.end();
});

test('bin: --update edits a dirty project', (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: { '@types/orphan': '^1.0.0' },
			devDependencies: { '@types/node': '^25.0.0' },
		},
	});

	runBin(['--update', dir]);
	const pkg = JSON.parse(`${readFileSync(join(dir, 'package.json'))}`);
	t.notOk('dependencies' in pkg, 'removes the orphaned `@types` from `package.json`');
	t.end();
});

test('bin: --update on a clean project changes nothing', (t) => {
	const dir = project(t, { pkg: { devDependencies: { '@types/node': '^25.0.0' } } });
	const before = `${readFileSync(join(dir, 'package.json'))}`;

	runBin(['-u'], { cwd: dir });
	t.equal(`${readFileSync(join(dir, 'package.json'))}`, before, 'leaves a clean project untouched');
	t.end();
});
