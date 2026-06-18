import type { Version } from '../getDelTa.d.ts';

export type Dependencies = Record<string, Version>;

export interface PackageJSON {
    name?: string;
    version?: string;
    dependencies?: Dependencies;
    devDependencies?: Dependencies;
    [field: string]: unknown;
}
