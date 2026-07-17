// `--import`ed ahead of `bin.mjs` so the `engines.node` check can be exercised end-to-end while the
// suite itself runs on a node that satisfies it. `process.version` is the lowest level the check
// reads, and it is a configurable own property, so redefining it here is enough - and it lands before
// the entry point resolves anything, which is the whole point of the check.
Object.defineProperty(process, 'version', { configurable: true, value: 'v18.0.0' });
