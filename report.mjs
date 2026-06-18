const STATES = /** @type {const} */ ({
	add: ['missing', 'add'],
	keep: ['present', 'keep'],
	move: ['present', 'move'],
	remove: ['present', 'remove'],
});

/** @import { ReportDelta } from './report.d.ts' */

/** @param {ReportDelta} delta */
function toRows({
	present,
	toAdd,
	toMove,
	toRemove,
}) {
	const removed = new Set(toRemove);

	const rows = present.entries().map(([name, version]) => {
		const action = removed.has(name)
			? 'remove'
			: toMove.has(name)
				? 'move'
				: 'keep';

		/** @typedef {typeof STATES[keyof typeof STATES][number]} State */

		return /** @type {[typeof name, State, State, typeof version]} */ ([
			name,
			STATES[action][0],
			STATES[action][1],
			version,
		]);
	}).toArray();

	toAdd.forEach((version, name) => {
		rows.push([
			name,
			STATES.add[0],
			STATES.add[1],
			version,
		]);
	});

	return rows.sort((a, b) => a[0].localeCompare(b[0]));
}

/** @param {string[]} headers @param {string[][]} rows */
function table(headers, rows) {
	const widths = headers.map((header, i) => Math.max(header.length, ...rows.map((row) => row[i].length)));

	/** @param {string[]} cells */
	function render(cells) {
		return cells.map((cell, i) => cell.padEnd(widths[i])).join('  ').replace(/ +$/, '');
	}
	return /** @type {string[]} */ ([]).concat(
		render(headers),
		render(widths.map((width) => '-'.repeat(width))),
		rows.map(render),
	).join('\n');
}

/** @type {import('./report.d.ts')} */
export default function formatReport(delta) {
	const rows = toRows(delta);
	if (rows.length === 0) {
		return 'No `@types/*` packages are present or needed.';
	}

	/** @param {string} action */
	function count(action) {
		return rows.filter((row) => row[2] === action).length;
	}
	const summary = `${rows.length} \`@types/*\` package${rows.length === 1 ? '' : 's'}: ${count('keep')} keep, ${count('move')} move, ${count('remove')} remove, ${count('add')} add.`;

	return `${table([
		'Package',
		'State',
		'Action',
		'Version',
	], rows)}\n\n${summary}`;
}
