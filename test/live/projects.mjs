import test from 'tape';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import getDelTa from '#/getDelTa';

/** @type {(map: Map<string, unknown> | Set<string> | string[]) => string[]} */
function keys(map) {
	return (map instanceof Map ? map.keys() : map.values()).toArray().sort();
}

// the registry smoke test exercises the `toAdd` path with no `node_modules`; this installs a real tree
// so the `installedVersion` lookup, `toRemove` (ships-own), `toMove`, and `toRemain` paths run for real.
test('installed project: classifies remove / move / keep against a real `node_modules`', async (t) => {
	const dir = mkdtempSync(join(tmpdir(), 'dt-project-'));
	t.teardown(() => rmSync(dir, { recursive: true, force: true }));

	writeFileSync(join(dir, 'tsconfig.json'), '{}\n');
	writeFileSync(join(dir, 'package.json'), `${JSON.stringify({
		name: 'consumer',
		private: true,
		dependencies: {
			lodash: '4.17.21',
			'@types/lodash': '4.17.24', // a still-needed runtime `@types` => move to devDependencies, and keep
			axios: '1.7.9',
		},
		devDependencies: {
			'@types/node': '22.10.2', // always exempt => keep
			'@types/axios': '0.14.4', // axios ships its own types => remove
		},
	}, null, '\t')}\n`);

	const install = spawnSync('npm', ['install', '--no-save', '--no-audit', '--no-fund'], { cwd: dir, encoding: 'utf8' });
	t.equal(install.status, 0, install.status === 0 ? 'npm install succeeds' : `npm install failed: ${install.stderr}`);

	const {
		toRemove,
		toMove,
		toRemain,
		toAdd,
	} = await getDelTa(dir);

	t.deepEqual(keys(toRemove), ['@types/axios'], 'removes the `@types` for a package that ships its own types');
	t.deepEqual(keys(toMove), ['@types/lodash'], 'moves a still-needed runtime `@types` to devDependencies');
	t.deepEqual(keys(toRemain), ['@types/lodash', '@types/node'], 'keeps the needed `@types` (including exempt `@types/node`)');
	t.deepEqual(keys(toAdd), [], 'adds nothing when every dependency is already typed');

	t.end();
});
