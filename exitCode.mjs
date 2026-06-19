/** @import { DTDelta } from './getDelTa.d.ts' */

export const TO_REMOVE = 1;
export const TO_ADD = 2;
export const TO_MOVE = 4;

/** @typedef {1 | 2 | 4 | 3 | 6 | 7} PossibleExitCode */

/**
 * In report-only mode the exit code is a bitmask of the pending change kinds, so a clean
 * delta is `0` and any combination of kinds combines (e.g. add + remove is `3`).
 *
 * @type {(delta: Pick<DTDelta, 'toAdd' | 'toMove' | 'toRemove'>) => PossibleExitCode}
 */
export default function exitCode({
	toAdd,
	toMove,
	toRemove,
}) {
	let code = 0;
	if (toRemove.length > 0) {
		code |= TO_REMOVE;
	}
	if (toAdd.size > 0) {
		code |= TO_ADD;
	}
	if (toMove.size > 0) {
		code |= TO_MOVE;
	}
	return /** @type {PossibleExitCode} */ (code);
}
