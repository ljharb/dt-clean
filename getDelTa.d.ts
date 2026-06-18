declare function getDelTa(
    cwd?: string,
): Promise<getDelTa.DTDelta>;

declare namespace getDelTa {
    type Version = string & {};
    type DTPackage<T extends string = string> = `@types/${T}`;

    type DTDelta = {
        present: Map<DTPackage, Version>;
        toAdd: Map<DTPackage, Version>;
        toMove: Map<DTPackage, Version>;
        toRemain: Set<DTPackage>;
        toRemove: DTPackage[];
    };
}

export = getDelTa;
