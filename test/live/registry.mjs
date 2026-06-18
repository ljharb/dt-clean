import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
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

// the top `count` most-impactful packages, round-robin-sharded so each matrix job gets a balanced slice
const names = npmHighImpact
	.filter((name) => !name.startsWith('@types/'))
	.slice(0, count)
	.filter((_, index) => index % shardTotal === shardIndex);

/** @type {<T>(fn: () => Promise<T>, attempts?: number) => Promise<T>} */
async function withRetry(fn, attempts = 3) {
	for (let i = 1; ; i += 1) {
		try {
			return await fn(); // eslint-disable-line no-await-in-loop
		} catch (e) {
			if (i >= attempts) { throw e; }
		}
	}
}

/** @type {(name: string) => Promise<string>} */
async function latestVersion(name) {
	const res = await globalThis.fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}/latest`);
	if (!res.ok) {
		throw new Error(`registry responded ${res.status}`);
	}
	const { version } = await res.json();
	return version;
}

/** @type {(t: import('tape').Test, name: string) => Promise<void>} */
async function check(t, name) {
	/** @type {string} */
	let version;
	/** @type {boolean | string} */
	let raw;
	try {
		version = await withRetry(() => latestVersion(name));
		raw = await withRetry(() => hasTypes(`${name}@${version}`));
	} catch (e) {
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

	t.end();
});
