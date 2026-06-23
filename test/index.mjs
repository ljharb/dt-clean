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
import { createRequire } from 'module';

import applyChanges from '#/applyChanges';
import formatReport from '#/report';
import setup from '#/setup';
import exitCode, {
	TO_REMOVE,
	TO_ADD,
	TO_MOVE,
} from '#/exitCode';

const root = dirname(fileURLToPath(import.meta.url));
const binPath = join(root, '..', 'bin.mjs');

const { version: selfVersion } = createRequire(import.meta.url)('../package.json');
const AUTO = `DT_CLEAN_NPM_COMMAND="$npm_command" npx dt-clean@^${selfVersion} --auto`;

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

/**
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [opts]
 */
function runBin(args, { cwd, env } = {}) {
	const { stdout, stderr, status } = spawnSync('node', [binPath, ...args], {
		cwd,
		encoding: 'utf8',
		env,
	});
	return { stdout, stderr, status };
}

/**
 * Builds a child environment with a controlled `npm_command` and `npm_lifecycle_event`, since the
 * test runner itself sets both. `lifecycle` defaults to `'dependencies'` (where `--auto` is meant to
 * run); pass `false` to simulate `--auto` invoked outside a `dependencies` lifecycle script.
 *
 * `forwarded` sets `DT_CLEAN_NPM_COMMAND`, the variable a `npx`-wrapped `dependencies` script uses
 * to forward the real command past npx (which would otherwise erase it).
 *
 * @type {(opts?: { command?: string, lifecycle?: string | false, forwarded?: string }) => NodeJS.ProcessEnv}
 */
function envWith({ command, lifecycle = 'dependencies', forwarded } = {}) {
	// indexed by string variables so neither `camelcase` (dot access) nor `dot-notation` (bracket
	// access) fires on these intentionally snake_cased npm environment variables.
	const COMMAND = 'npm_command';
	const LIFECYCLE = 'npm_lifecycle_event';
	const FORWARDED = 'DT_CLEAN_NPM_COMMAND';

	// eslint-disable-next-line no-unused-vars
	const { [COMMAND]: _, [LIFECYCLE]: __, [FORWARDED]: ___, ...env } = process.env;

	if (typeof command === 'string') {
		env[COMMAND] = command;
	}
	if (typeof lifecycle === 'string') {
		env[LIFECYCLE] = lifecycle;
	}
	if (typeof forwarded === 'string') {
		env[FORWARDED] = forwarded;
	}
	return env;
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

test('exitCode: bitmasks each pending change kind', (t) => {
	/** @type {(kinds: { add?: boolean, move?: boolean, remove?: boolean }) => number} */
	function code({ add = false, move = false, remove = false }) {
		return exitCode({
			toAdd: new Map(add ? [['@types/a', '^1.0.0']] : []),
			toMove: new Map(move ? [['@types/m', '^1.0.0']] : []),
			toRemove: remove ? ['@types/r'] : [],
		});
	}

	t.equal(TO_REMOVE, 1, 'remove is bit 0');
	t.equal(TO_ADD, 2, 'add is bit 1');
	t.equal(TO_MOVE, 4, 'move is bit 2');

	t.equal(code({}), 0, 'a clean delta exits zero');
	t.equal(code({ remove: true }), TO_REMOVE, 'remove sets its own bit');
	t.equal(code({ add: true }), TO_ADD, 'add sets its own bit');
	t.equal(code({ move: true }), TO_MOVE, 'move sets its own bit');

	t.equal(code({ add: true, remove: true }), TO_ADD | TO_REMOVE, 'combined kinds OR their bits');
	t.equal(
		code({ add: true, move: true, remove: true }),
		TO_REMOVE | TO_ADD | TO_MOVE,
		'all three kinds combine',
	);
	t.equal(code({ add: true, move: true, remove: true }), 7, 'all three kinds combine into 7');

	t.end();
});

test('bin: exits with the remove bit for a dirty project', (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: { '@types/orphan': '^1.0.0' },
			devDependencies: { '@types/node': '^25.0.0' },
		},
	});

	const { status } = runBin([dir]);
	t.equal(status, TO_REMOVE, 'a dirty project exits nonzero with the remove bit set');
	t.end();
});

test('bin: exits zero for a clean project', (t) => {
	const dir = project(t, { pkg: { devDependencies: { '@types/node': '^25.0.0' } } });

	const { status } = runBin([], { cwd: dir });
	t.equal(status, 0, 'a clean project exits zero');
	t.end();
});

test('bin: --update exits zero after cleaning a dirty project', (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: { '@types/orphan': '^1.0.0' },
			devDependencies: { '@types/node': '^25.0.0' },
		},
	});

	const { status } = runBin(['--update', dir]);
	t.equal(status, 0, '`--update` exits zero on success even though the project was dirty');
	t.end();
});

test('bin: --auto under `npm ci` reports but makes no changes', (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: { '@types/orphan': '^1.0.0' },
			devDependencies: { '@types/node': '^25.0.0' },
		},
	});
	const before = `${readFileSync(join(dir, 'package.json'))}`;

	const { stdout, stderr, status } = runBin(['--auto', dir], { env: envWith({ command: 'ci' }) });

	t.equal(`${readFileSync(join(dir, 'package.json'))}`, before, 'leaves `package.json` untouched under `npm ci`');
	t.match(stdout, /@types\/orphan\s+present\s+remove/, 'still prints the dry-run report of what would change');
	t.match(stderr, /npm ci/, 'notes that it left `package.json` unchanged');
	t.equal(status, 0, 'exits zero so a CI install never fails');
	t.end();
});

test('bin: --auto under `npm ci` on a clean project exits zero quietly', (t) => {
	const dir = project(t, { pkg: { devDependencies: { '@types/node': '^25.0.0' } } });

	const { stderr, status } = runBin(['--auto', dir], { env: envWith({ command: 'ci' }) });

	t.notOk((/npm ci/).test(stderr), 'says nothing about leaving the file alone when there is nothing to change');
	t.equal(status, 0, 'a clean project still exits zero');
	t.end();
});

test('bin: --auto under `npm install` applies the changes', (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: { '@types/orphan': '^1.0.0' },
			devDependencies: { '@types/node': '^25.0.0' },
		},
	});

	const { status } = runBin(['--auto', dir], { env: envWith({ command: 'install' }) });

	const pkg = JSON.parse(`${readFileSync(join(dir, 'package.json'))}`);
	t.notOk('dependencies' in pkg, 'removes the orphaned `@types` during `npm install`');
	t.equal(status, 0, '`--auto` exits zero after applying');
	t.end();
});

test('bin: --auto with no `npm_command` applies the changes', (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: { '@types/orphan': '^1.0.0' },
			devDependencies: { '@types/node': '^25.0.0' },
		},
	});

	const { status } = runBin(['--auto', dir], { env: envWith() });

	const pkg = JSON.parse(`${readFileSync(join(dir, 'package.json'))}`);
	t.notOk('dependencies' in pkg, 'applies when `npm_command` is unset, like `npm install`');
	t.equal(status, 0, '`--auto` exits zero after applying');
	t.end();
});

test('bin: --auto on a clean project exits zero without changes', (t) => {
	const dir = project(t, { pkg: { devDependencies: { '@types/node': '^25.0.0' } } });
	const before = `${readFileSync(join(dir, 'package.json'))}`;

	const { status } = runBin(['--auto', dir], { env: envWith() });

	t.equal(`${readFileSync(join(dir, 'package.json'))}`, before, 'leaves a clean project untouched');
	t.equal(status, 0, 'a no-op `--auto` exits zero');
	t.end();
});

test('bin: --auto outside a `dependencies` lifecycle script refuses to run', (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: { '@types/orphan': '^1.0.0' },
			devDependencies: { '@types/node': '^25.0.0' },
		},
	});
	const before = `${readFileSync(join(dir, 'package.json'))}`;

	const { stdout, stderr, status } = runBin(['--auto', dir], { env: envWith({ command: 'install', lifecycle: false }) });

	t.equal(`${readFileSync(join(dir, 'package.json'))}`, before, 'makes no changes when not run as a `dependencies` script');
	t.equal(stdout, '', 'prints no report');
	t.match(stderr, /only runs inside a `dependencies`/, 'explains why it refused');
	t.equal(status, 1, 'exits nonzero on misuse');
	t.end();
});

test('bin: --auto in a `postdependencies` hook applies the changes', (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: { '@types/orphan': '^1.0.0' },
			devDependencies: { '@types/node': '^25.0.0' },
		},
	});

	const { status } = runBin(['--auto', dir], { env: envWith({ command: 'install', lifecycle: 'postdependencies' }) });

	const pkg = JSON.parse(`${readFileSync(join(dir, 'package.json'))}`);
	t.notOk('dependencies' in pkg, 'the `postdependencies` hook is a valid slot, so it applies');
	t.equal(status, 0, '`--auto` exits zero after applying');
	t.end();
});

test('bin: --auto in a `predependencies` hook applies the changes', (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: { '@types/orphan': '^1.0.0' },
			devDependencies: { '@types/node': '^25.0.0' },
		},
	});

	const { status } = runBin(['--auto', dir], { env: envWith({ command: 'install', lifecycle: 'predependencies' }) });

	const pkg = JSON.parse(`${readFileSync(join(dir, 'package.json'))}`);
	t.notOk('dependencies' in pkg, 'the `predependencies` hook is a valid slot, so it applies');
	t.equal(status, 0, '`--auto` exits zero after applying');
	t.end();
});

test('bin: --auto in an unrelated lifecycle script refuses to run', (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: { '@types/orphan': '^1.0.0' },
			devDependencies: { '@types/node': '^25.0.0' },
		},
	});
	const before = `${readFileSync(join(dir, 'package.json'))}`;

	const { status } = runBin(['--auto', dir], { env: envWith({ command: 'install', lifecycle: 'postinstall' }) });

	t.equal(`${readFileSync(join(dir, 'package.json'))}`, before, 'a non-`dependencies` lifecycle event is rejected too');
	t.equal(status, 1, 'exits nonzero on misuse');
	t.end();
});

test('bin: --auto via `npx` (lifecycle `npx`) is allowed, not rejected as misuse', (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: { '@types/orphan': '^1.0.0' },
			devDependencies: { '@types/node': '^25.0.0' },
		},
	});

	const { stderr, status } = runBin(['--auto', dir], { env: envWith({ command: 'exec', lifecycle: 'npx', forwarded: 'install' }) });

	t.doesNotMatch(stderr, /only runs inside a `dependencies`/, 'an `npx` invocation is not treated as misuse');
	t.equal(status, 0, 'exits zero');
	t.end();
});

test('bin: --auto via `npx` with a forwarded `install` applies the changes', (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: { '@types/orphan': '^1.0.0' },
			devDependencies: { '@types/node': '^25.0.0' },
		},
	});

	const { status } = runBin(['--auto', dir], { env: envWith({ command: 'exec', lifecycle: 'npx', forwarded: 'install' }) });

	const pkg = JSON.parse(`${readFileSync(join(dir, 'package.json'))}`);
	t.notOk('dependencies' in pkg, 'applies when `npx` forwards a non-`ci` command');
	t.equal(status, 0, 'exits zero after applying');
	t.end();
});

test('bin: --auto via `npx` with a forwarded `ci` reports but makes no changes', (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: { '@types/orphan': '^1.0.0' },
			devDependencies: { '@types/node': '^25.0.0' },
		},
	});
	const before = `${readFileSync(join(dir, 'package.json'))}`;

	const { stdout, stderr, status } = runBin(['--auto', dir], { env: envWith({ command: 'exec', lifecycle: 'npx', forwarded: 'ci' }) });

	t.equal(`${readFileSync(join(dir, 'package.json'))}`, before, 'leaves `package.json` unchanged under a forwarded `npm ci`');
	t.match(stdout, /@types\/orphan\s+present\s+remove/, 'still prints the dry-run report of what would change');
	t.match(stderr, /`npm ci` detected/, 'explains the `npm ci` no-op');
	t.equal(status, 0, 'exits zero so the install never fails');
	t.end();
});

test('bin: --auto via `npx` with no forwarded command errors with the fix', (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: { '@types/orphan': '^1.0.0' },
			devDependencies: { '@types/node': '^25.0.0' },
		},
	});
	const before = `${readFileSync(join(dir, 'package.json'))}`;

	const { stdout, stderr, status } = runBin(['--auto', dir], { env: envWith({ command: 'exec', lifecycle: 'npx' }) });

	t.equal(`${readFileSync(join(dir, 'package.json'))}`, before, 'makes no changes (errors before touching `package.json`)');
	t.equal(stdout, '', 'prints no report');
	t.match(stderr, /needs the real npm command forwarded in `DT_CLEAN_NPM_COMMAND`/, 'explains what is missing');
	t.match(stderr, /DT_CLEAN_NPM_COMMAND="\$npm_command" npx dt-clean --auto/, 'shows the fix');
	t.equal(status, 1, 'exits nonzero so the misconfiguration is loud');
	t.end();
});

test('bin: --auto via `npx` with an unexpanded forwarded command errors too', (t) => {
	const dir = project(t, {
		pkg: {
			dependencies: { '@types/orphan': '^1.0.0' },
			devDependencies: { '@types/node': '^25.0.0' },
		},
	});
	const before = `${readFileSync(join(dir, 'package.json'))}`;

	const { stderr, status } = runBin(['--auto', dir], { env: envWith({ command: 'exec', lifecycle: 'npx', forwarded: '$npm_command' }) });

	t.equal(`${readFileSync(join(dir, 'package.json'))}`, before, 'a literal, unexpanded `$npm_command` counts as missing, so it errors rather than guess');
	t.match(stderr, /needs the real npm command forwarded/, 'explains the problem');
	t.equal(status, 1, 'exits nonzero');
	t.end();
});

/** @param {string} dir */
function readScripts(dir) {
	return JSON.parse(`${readFileSync(join(dir, 'package.json'))}`).scripts;
}

test('setup: uses the `dependencies` event when it is free', async (t) => {
	const dir = project(t, { pkg: { scripts: { test: 'tape' } } });

	const result = await setup(dir);

	t.deepEqual(result, { action: 'set', script: 'dependencies' }, 'reports the slot it used');
	t.deepEqual(
		readScripts(dir),
		{ test: 'tape', dependencies: AUTO },
		'adds the `dependencies` script and preserves the existing ones',
	);

	t.end();
});

test('setup: falls back to `postdependencies` when `dependencies` is taken', async (t) => {
	const dir = project(t, { pkg: { scripts: { dependencies: 'do-something' } } });

	const result = await setup(dir);

	t.deepEqual(result, { action: 'set', script: 'postdependencies' }, 'uses the `post` hook');
	t.deepEqual(
		readScripts(dir),
		{ dependencies: 'do-something', postdependencies: AUTO },
		'leaves the existing `dependencies` script untouched',
	);

	t.end();
});

test('setup: falls back to `predependencies` when `dependencies` and `postdependencies` are taken', async (t) => {
	const dir = project(t, {
		pkg: {
			scripts: {
				dependencies: 'a',
				postdependencies: 'b',
			},
		},
	});

	const result = await setup(dir);

	t.deepEqual(result, { action: 'set', script: 'predependencies' }, 'uses the `pre` hook');
	t.equal(readScripts(dir).predependencies, AUTO, 'adds the `predependencies` script');

	t.end();
});

test('setup: chains onto `dependencies` when every hook is occupied', async (t) => {
	const dir = project(t, {
		pkg: {
			scripts: {
				predependencies: 'a',
				dependencies: 'b',
				postdependencies: 'c',
			},
		},
	});

	const result = await setup(dir);

	t.deepEqual(result, { action: 'chained', script: 'dependencies' }, 'reports that it chained');
	t.equal(readScripts(dir).dependencies, `b && ${AUTO}`, 'appends without dropping the original command');

	t.end();
});

test('setup: is idempotent when already wired (even inside a chained script)', async (t) => {
	const dir = project(t, { pkg: { scripts: { dependencies: 'build && dt-clean --auto' } } });
	const before = `${readFileSync(join(dir, 'package.json'))}`;

	const result = await setup(dir);

	t.deepEqual(result, { action: 'present', script: 'dependencies' }, 'detects the existing invocation');
	t.equal(`${readFileSync(join(dir, 'package.json'))}`, before, 'leaves `package.json` byte-for-byte unchanged');

	t.end();
});

test('setup: leaves the current standalone invocation alone when it is already best-placed', async (t) => {
	const dir = project(t, { pkg: { scripts: { dependencies: AUTO } } });
	const before = `${readFileSync(join(dir, 'package.json'))}`;

	const result = await setup(dir);

	t.deepEqual(result, { action: 'present', script: 'dependencies' }, 'already in the preferred slot');
	t.equal(`${readFileSync(join(dir, 'package.json'))}`, before, 'makes no change');

	t.end();
});

test('setup: upgrades a legacy standalone invocation in place', async (t) => {
	const dir = project(t, { pkg: { scripts: { dependencies: 'dt-clean --auto' } } });

	const result = await setup(dir);

	t.deepEqual(result, { action: 'upgraded', script: 'dependencies' }, 'reports the in-place upgrade');
	t.equal(readScripts(dir).dependencies, AUTO, 'rewrites the bare invocation to the forwarding form');

	t.end();
});

test('setup: upgrades a legacy `npx`-wrapped, version-pinned invocation in place', async (t) => {
	const dir = project(t, { pkg: { scripts: { dependencies: 'npx dt-clean@^1.1.1 --auto' } } });

	const result = await setup(dir);

	t.deepEqual(result, { action: 'upgraded', script: 'dependencies' }, 'recognizes the older `npx` form as ours');
	t.equal(readScripts(dir).dependencies, AUTO, 'upgrades it to forward the command');

	t.end();
});

test('setup: moves a standalone invocation to a now-free, more-preferred hook', async (t) => {
	const dir = project(t, { pkg: { scripts: { predependencies: 'dt-clean --auto' } } });

	const result = await setup(dir);

	t.deepEqual(result, { action: 'moved', script: 'dependencies' }, 'relocates from `pre` to `dependencies`');
	t.deepEqual(
		readScripts(dir),
		{ dependencies: AUTO },
		'the `predependencies` hook is gone and `dependencies` now holds it',
	);

	t.end();
});

test('setup: moves toward the best available hook even when `dependencies` stays taken', async (t) => {
	const dir = project(t, {
		pkg: {
			scripts: {
				dependencies: 'build',
				predependencies: 'dt-clean --auto',
			},
		},
	});

	const result = await setup(dir);

	t.deepEqual(result, { action: 'moved', script: 'postdependencies' }, 'relocates `pre` -> `post` (the best free hook)');
	t.deepEqual(
		readScripts(dir),
		{ dependencies: 'build', postdependencies: AUTO },
		'leaves the occupied `dependencies` script and moves ours up to `post`',
	);

	t.end();
});

test('setup: does not relocate a chained `dt-clean --auto` it does not own', async (t) => {
	const dir = project(t, { pkg: { scripts: { postdependencies: 'flush-cache && dt-clean --auto' } } });
	const before = `${readFileSync(join(dir, 'package.json'))}`;

	const result = await setup(dir);

	t.deepEqual(result, { action: 'present', script: 'postdependencies' }, 'treats a customized invocation as present');
	t.equal(`${readFileSync(join(dir, 'package.json'))}`, before, 'never rewrites a script it did not author');

	t.end();
});

test('setup: never adds a second `dt-clean` when one is already present without `--auto`', async (t) => {
	const dir = project(t, { pkg: { scripts: { dependencies: 'dt-clean --update' } } });
	const before = `${readFileSync(join(dir, 'package.json'))}`;

	const result = await setup(dir);

	t.deepEqual(result, { action: 'exists', script: 'dependencies' }, 'reports the existing `dt-clean` invocation');
	t.equal(`${readFileSync(join(dir, 'package.json'))}`, before, 'makes no change rather than duplicating `dt-clean`');

	t.end();
});

test('setup: detects an existing `dt-clean` in any hook, not just `dependencies`', async (t) => {
	const dir = project(t, {
		pkg: {
			scripts: {
				build: 'tsc',
				postdependencies: 'dt-clean',
			},
		},
	});
	const before = `${readFileSync(join(dir, 'package.json'))}`;

	const result = await setup(dir);

	t.deepEqual(result, { action: 'exists', script: 'postdependencies' }, 'finds the bare `dt-clean` in the `post` hook');
	t.equal(`${readFileSync(join(dir, 'package.json'))}`, before, 'and leaves it alone');

	t.end();
});

test('bin: --setup wires the script and is idempotent on a second run', (t) => {
	const dir = project(t, { pkg: { scripts: { test: 'tape' } } });

	const first = runBin(['--setup', dir]);
	t.match(first.stdout, /Added `dt-clean --auto` to the `dependencies`/, 'announces the change');
	t.equal(first.status, 0, 'exits zero');
	t.equal(readScripts(dir).dependencies, AUTO, 'wires the `dependencies` script');

	const second = runBin(['--setup', dir]);
	t.match(second.stdout, /already runs `dt-clean --auto`/, 'a second run is a no-op');
	t.equal(second.status, 0, 'still exits zero');

	t.end();
});
