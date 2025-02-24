import { createRecursiveProxy, validate, getHandler, error, Handler, PickKeyType, Queues, QueueApi, Env, stringify } from '.';

const createBatches = (data: string[]) => {
	const maxItemsPerBatch = 100;
	const maxTotalSizePerBatch = 256 * 1024;

	let batches: string[][] = [];
	let currentBatch: string[] = [];
	let currentBatchSize = 0;

	for (const item of data) {
		if (currentBatchSize + item.length >= maxTotalSizePerBatch || currentBatch.length >= maxItemsPerBatch) {
			batches.push(currentBatch);
			currentBatch = [];
			currentBatchSize = 0;
		} else {
			currentBatch.push(item);
			currentBatchSize += item.length;
		}
	}
	if (currentBatch.length > 0) {
		batches.push(currentBatch);
	}

	return batches;
};

export class QueueHandler {
	private env: Env;
	private queues?: Queues;
	private ctx: { waitUntil: ExecutionContext['waitUntil'] };
	constructor(env: Env, ctx: { waitUntil: ExecutionContext['waitUntil'] }, queues?: Queues) {
		this.env = env;
		this.queues = queues;
		this.ctx = ctx;
	}

	send = <Q extends PickKeyType<Env, Queue>>(queueName: Q) => {
		return createRecursiveProxy(({ type, data, opts }) => {
			if (!this.queues || !this.env?.[queueName as keyof Env]) {
				throw error('SERVICE_UNAVAILABLE');
			}
			const isBatch = type.includes('sendBatch');
			const path = type.replace('.send', '').replace('.sendBatch', '').split('.');
			const queue = this.env[queueName as keyof Env] as Queue;
			const handler = getHandler(this.queues![queueName], path) as Handler<any, any, any, any>;
			if (isBatch) {
				let messages: string[] = [];
				for (const item of data) {
					messages.push(
						stringify({
							type: path.join('.'),
							payload: validate(handler?.schema, item),
						}),
					);
				}
				const sendBatches = async () => {
					return Promise.all(
						createBatches(messages).map((batch) => {
							return queue.sendBatch(
								batch.map((body) => ({
									body,
									contentType: 'text',
								})),
								{ delaySeconds: opts as number },
							);
						}),
					);
				};
				return this.ctx.waitUntil(sendBatches());
			} else {
				const parsedData = stringify({
					type: path.join('.'),
					payload: validate(handler?.schema, data),
				});
				return this.ctx.waitUntil(queue.send(parsedData, { contentType: 'text', delaySeconds: 1 }));
			}
		}) as QueueApi<Queues[Q]>;
	};
}
