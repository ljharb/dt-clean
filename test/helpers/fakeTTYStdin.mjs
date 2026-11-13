// `--import`ed ahead of `bin.mjs` so the "stdin is a terminal" path can be exercised while the suite
// still pipes input in. `process.stdin.isTTY` is the lowest level `bin.mjs` reads to decide whether to
// read stdin at all, so redefining it here is enough.
Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
