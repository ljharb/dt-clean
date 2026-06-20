import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync, appendFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { npmHighImpact } from 'npm-high-impact';

import getDelTa from '#/getDelTa';
import hasTypes from 'hastypes';

const {
	REGISTRY_COUNT = '1000',
	REGISTRY_CONCURRENCY = '12',
	SHARD_INDEX = '0',
	SHARD_TOTAL = '1',
} = process.env;

const count = Number(REGISTRY_COUNT);
const concurrency = Number(REGISTRY_CONCURRENCY);
const shardIndex = Number(SHARD_INDEX);
const shardTotal = Number(SHARD_TOTAL);

// the top `count` most-impactful packages, de-duplicated so no package is ever tested twice, then
// round-robin-sharded so each matrix job gets a balanced, non-overlapping slice
const names = new Set(npmHighImpact.filter((name) => !name.startsWith('@types/')))
	.values()
	.take(count)
	.filter((_, index) => index % shardTotal === shardIndex)
	.toArray();

// packages that the registry no longer serves (unpublished/taken down); collected so the run can
// report them as skipped rather than treating a vanished package as a `dt-clean` resolution failure
/** @type {string[]} */
const takenDown = [];

// thrown when the registry has no `latest` for a package, i.e. it was unpublished or fully taken down
class TakenDownError extends Error {}

/** @type {<T>(fn: () => Promise<T>, attempts?: number) => Promise<T>} */
async function withRetry(fn, attempts = 3) {
	for (let i = 1; ; i += 1) {
		try {
			return await fn(); // eslint-disable-line no-await-in-loop
		} catch (e) {
			// a takedown is permanent, so retrying it only wastes requests
			if (e instanceof TakenDownError || i >= attempts) { throw e; }
		}
	}
}

/** @param {string} name */
async function latestVersion(name) {
	const res = await globalThis.fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}/latest`);
	if (res.status === 404) {
		throw new TakenDownError(`${name}: no longer published (registry responded 404)`);
	}
	if (!res.ok) {
		throw new Error(`registry responded ${res.status}`);
	}
	const { version } = /** @type {{ version: string }} */ (await res.json());
	return version;
}

/** @import { Test } from 'tape' */

/** @type {(t: Test, name: string) => Promise<void>} */
async function check(t, name) {
	/** @type {string} */
	let version;
	/** @type {boolean | string} */
	let raw;
	try {
		version = await withRetry(() => latestVersion(name));
		raw = await withRetry(() => hasTypes(`${name}@${version}`));
	} catch (e) {
		if (e instanceof TakenDownError) {
			takenDown.push(name);
			t.skip(e.message);
			return;
		}
		t.fail(`${name}: could not resolve types (${e instanceof Error ? e.message : e})`);
		return;
	}

	const dir = mkdtempSync(join(tmpdir(), 'dt-registry-'));
	let toAdd;
	try {
		writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'consumer', private: true, dependencies: { [name]: version } }));
		writeFileSync(join(dir, 'tsconfig.json'), '{}');
		({ toAdd } = await getDelTa(dir));
	} catch (e) {
		t.fail(`${name}@${version}: getDelTa threw (${e instanceof Error ? e.message : e})`);
		return;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}

	// `getDelTa` must agree with the raw `hastypes` verdict: a `@types` string => add exactly that range;
	// `true` (ships own) or `false` (no `@types`) => add nothing. Disagreement means a resolution bug.
	const added = [...toAdd.values()];
	if (typeof raw === 'string') {
		t.deepEqual(added, [raw.slice(raw.lastIndexOf('@') + 1)], `${name}@${version}: recommends ${raw}`);
	} else {
		t.deepEqual(added, [], `${name}@${version}: ${raw === true ? 'ships its own types' : 'has no `@types`'}; nothing added`);
	}
}

test(`registry smoke: top ${count}, shard ${shardIndex + 1}/${shardTotal} (${names.length} packages)`, async (t) => {
	let cursor = 0;
	async function worker() {
		while (cursor < names.length) {
			const name = names[cursor];
			cursor += 1;
			await check(t, name); // eslint-disable-line no-await-in-loop
		}
	}
	await Promise.all(Array.from({ length: concurrency }, worker));

	// surface takedowns so a shard whose only "failures" were vanished packages reads as skipped work
	// (a non-failing, visibly-annotated run) rather than as a green pass that silently hid them
	if (takenDown.length > 0) {
		t.comment(`skipped ${takenDown.length} taken-down package(s): ${takenDown.join(', ')}`);
		if (process.env.GITHUB_ACTIONS) {
			const summary = `${takenDown.length} package(s) skipped, no longer published: ${takenDown.join(', ')}`;
			process.stdout.write(`::warning title=Taken-down packages skipped::${summary}\n`);
			if (process.env.GITHUB_STEP_SUMMARY) {
				appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### registry smoke (shard ${shardIndex + 1}/${shardTotal})\n\n${summary}\n`);
			}
		}
	}

	t.end();
});
