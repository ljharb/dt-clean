import type { DTPackage, Version } from './getDelTa.d.ts';

declare function applyChanges(cwd: string, delta: {
    toAdd: Map<DTPackage, Version>;
    toMove: Map<DTPackage, Version>;
    toRemove: DTPackage[];
}): Promise<boolean>;

export = applyChanges;
