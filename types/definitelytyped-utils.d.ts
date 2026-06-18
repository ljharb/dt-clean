import '@definitelytyped/utils';

declare module '@definitelytyped/utils' {
	export function mangleScopedPackage<T extends string>(packageName: T): T;
	export function typesPackageNameToRealName<T extends string>(typesPackageName: `@types/${T}`): T;
}
