import type { Version } from '../getDelTa.d.ts';

export type Dependencies = Record<string, Version>;

export interface PackageJSON {
    name?: string;
    version?: string;
    dependencies?: Dependencies;
    devDependencies?: Dependencies;
    scripts?: Record<string, string>;
    [field: string]: unknown;
}
