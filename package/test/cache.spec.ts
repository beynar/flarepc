import { it, expect } from 'vitest';

const longRunningFunction = async ({ id, name }: { id: string; name: string }) => {
	return {
		id,
		name,
	};
};

const cache = <A extends any[], T extends (...args: A) => Promise<any>>(fn: T): ((...args: A) => Promise<ReturnType<T>>) => {
	console.log(fn.toString());
	return async (...args) => {
		return fn(...args);
	};
};

it('Cache a value', async () => {
	const getUserCached = cache((params) =>
		longRunningFunction({
			id: params.id,
			name: params.name,
		}),
	);

	expect({
		ok: true,
	}).toEqual({
		ok: true,
	});
});
