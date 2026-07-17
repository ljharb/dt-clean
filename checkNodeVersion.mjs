import { createRequire } from 'module';

import semver from 'semver';

const {
	engines,
	name,
	version,
} = createRequire(import.meta.url)('./package.json');

/**
 * `engines.node` is enforced here rather than left to the installer: npm only warns about a mismatch
 * (`EBADENGINE`), and `npx` reruns an already-cached package without checking at all, so an
 * unsupported node still reaches this CLI and dies on whichever modern feature it meets first. In
 * practice that is `ERR_INVALID_MODULE_SPECIFIER` on the `#/` subpath imports `bin.mjs` defers - a
 * raw stack trace naming a specifier the user never wrote, rather than the version they need.
 *
 * @type {() => string | undefined}
 */
export default function checkNodeVersion() {
	return semver.satisfies(process.version, engines.node)
		? undefined
		: `${name} v${version} requires node \`${engines.node}\`, but this is node ${process.version}. Upgrade node to run it.`;
}
