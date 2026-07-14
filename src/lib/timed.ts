export default async function timed<T>(fn: () => Promise<T>, key?: string): Promise<T> {
	console.log(`Starting ${key}`);
	const start = performance.now();
	try {
		const result = await fn();
		console.log(`Finished ${key} in ${performance.now() - start}ms`);
		return result;
	} catch (e) {
		console.log(`Failed ${key} in ${performance.now() - start}ms`);
		throw e;
	}
}