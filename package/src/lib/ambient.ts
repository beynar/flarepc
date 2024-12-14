import type { DurableMeta } from './types';
import { AsyncLocalStorage } from 'node:async_hooks';

const metaStorage = new AsyncLocalStorage<DurableMeta>();

export const regiterDurableMeta = async (meta: DurableMeta) => {
	return new Promise((resolve, reject) => {
		metaStorage.run(meta, () => resolve);
	});
};

export const getDurableMeta = (): DurableMeta => {
	return (metaStorage.getStore() || {}) as DurableMeta;
};

export const runWithMeta = (meta: DurableMeta, cb: () => void) => {
	return new Promise(async (resolve, reject) => {
		return await metaStorage.run(meta, async () => {
			await cb();
			resolve(true);
		});
	});
};
