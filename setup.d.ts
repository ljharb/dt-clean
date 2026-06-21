declare function setup(cwd: string): Promise<setup.SetupResult>;

declare namespace setup {
    type DependencyHook = 'predependencies' | 'dependencies' | 'postdependencies';

    type SetupResult = {
        action: 'present' | 'exists' | 'set' | 'moved' | 'chained';
        script: DependencyHook;
    };
}

export = setup;
