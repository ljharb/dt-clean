// `--import`ed ahead of `bin.mjs` so a failed stdin read can be exercised end-to-end. Destroying stdin
// with an error is what `bin.mjs`'s own timeout does (minus the error), and it makes the read reject the
// same way a real read error would - without waiting out the 10s timeout.
process.stdin.destroy(new Error('simulated stdin read failure'));
