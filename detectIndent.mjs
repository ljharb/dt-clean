/** @type {import('./detectIndent.d.ts')} */
export default function detectIndent(raw) {
	const match = (/^[ \t]+/m).exec(raw);
	return match?.[0] ?? '\t';
}
