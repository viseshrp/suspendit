// Reused from nufftabs/entrypoints/shared/utils.ts (MIT).
export function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export async function runWithConcurrency<T>(
	items: T[],
	limit: number,
	task: (item: T) => Promise<void>,
): Promise<void> {
	let nextIndex = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (nextIndex < items.length) {
			const current = items[nextIndex++];
			if (current !== undefined) await task(current);
		}
	});
	await Promise.all(workers);
}
