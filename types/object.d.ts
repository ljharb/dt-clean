export {};

declare global {
	interface ObjectConstructor {
		// the stock lib signatures widen keys to `string` and drop the value generic; thread them through
		entries<K extends string, V>(o: Record<K, V>): [K, V][];
		fromEntries<K extends string, V>(entries: Iterable<readonly [K, V]>): Record<K, V>;
	}
}
