import { procedure, createServer, createDurableServer, InferApiTypes, createServers, error } from 'flarepc';
import { createDurableDoc } from 'flarepc/yjs';
import { string, optional, object } from 'valibot';
import { DurableObject } from 'cloudflare:workers';

import Groq from 'groq-sdk';
declare global {
	type Env = {
		TestDurable: DurableObject;
		GROQ_API_KEY: string;
		Queue: Queue;
		MY_RATE_LIMITER: RateLimit;
	};
}
// declare module 'flarepc' {
// 	interface Register {
// 		Env: Env;
// 		Tags: 'ADMIN' | 'MENTOR' | 'USER';
// 		Locals: {
// 			groq: Groq;
// 		};
// 		Participant: {
// 			id: string;
// 			name: string;
// 		};
// 		Queues: {
// 			Queue: typeof Queue;
// 		};
// 	}
// }

const router = {
	text: procedure()
		.input(string())
		.handle(async ({ event, input }) => {
			return {
				hello: input,
			};
		}),
};

// const TestDurable = createDurableDoc({});

// export { TestDurable };
export class TestDurable extends createDurableDoc({
	locals: {},

	rateLimiters: {
		MY_RATE_LIMITER: ({ session }) => {
			return session.id;
		},
	},
}) {
	out = {
		message: procedure('out')
			.input(object({ message: optional(string(), 'hello') }))
			.handle(({ input }) => {
				return {
					hello: input.message,
				};
			}),
		arn: {
			aud: procedure('out')
				.input(object({ message: optional(string(), 'hello') }))
				.handle(({ input, event }) => {
					return {
						hello: input.message,
					};
				}),
		},
	};
	in = {
		message: procedure('in')
			.input(object({ message: string() }))
			.handle(({ input, event }) => {
				console.log('event');
				return {
					hello: input.message,
				};
			}),
		paul: {
			louis: procedure('in')
				.input(object({ message: optional(string(), 'hello') }))
				.handle(({ input, event }) => {
					return {
						hello: input.message,
					};
				}),
		},
	};
	router = {
		test: procedure('durable').handle(async ({ event }) => {
			return {
				hello: 'world',
				headers: Object.fromEntries(event.request.headers.entries()),
			};
		}),
		update: procedure('durable').handle(async ({ event }) => {
			const doc = this.doc;
			doc.getText('text').insert(0, 'hello world');
			return {
				ok: true,
			};
		}),
		undo: procedure('durable').handle(async ({ event }) => {
			this.undo();
			return {
				ok: true,
			};
		}),
		redo: procedure('durable').handle(async ({ event }) => {
			this.redo();
			return {
				ok: true,
			};
		}),
	};

	tasks = {
		test: procedure('in')
			.input(object({ message: string() }))
			.handle(async ({ input }) => {
				return {
					hello: input.message,
				};
			}),
	};

	send = this.createSender(this.out);
}

const Queue = {
	test: procedure('queue')
		.input(string())
		.handle(async ({ input, event }) => {
			console.log(event.batch);
		}),
};

const server = createServer({
	objects: {
		TestDurable: TestDurable,
	},
	router,
	locals: () => {
		return {
			prod: true,
			groq: {} as Groq,
		};
	},
	after: [(event) => {}],
	getObjectJurisdictionOrLocationHint: (event) => {
		if (event.request.cf?.isEUCountry) {
			return {
				jurisdiction: 'eu',
			};
		}
	},
	rateLimiters: {
		MY_RATE_LIMITER: ({ request }) => {
			return request.headers.get('cf-connecting-ip') || '';
		},
	},
	queues: {
		Queue,
	},
});

const publicRouter = {
	public: procedure()
		.input(string())
		.handle(async ({ event }) => {
			return {
				hello: 'world',
			};
		}),
	test: procedure().handle(async ({ event }) => {
		return {
			hello: 'world',
		};
	}),
	caca: {
		prout: {
			vomi: procedure().handle(async ({ event }) => {
				return {
					caca: 'world',
				};
			}),
		},
	},
};

const adminRouter = {
	admin: procedure()
		.input(string())
		.handle(async ({ event }) => {
			return {
				hello: 'world',
			};
		}),
};

const server_ = createServer({
	router: publicRouter,
	objects: {
		TestDurable: TestDurable,
	},
	// exclude: {
	// 	test: true,
	// },
});

const servers = createServers({
	public: {
		router: publicRouter,
		getObjectJurisdictionOrLocationHint: (event) => {
			if (event.request.cf?.isEUCountry) {
				return {
					jurisdiction: 'eu',
				};
			} else {
				return {};
			}
		},
		objects: {
			TestDurable: TestDurable,
		},
		queues: {
			Queue,
		},
		crons: {
			'0*****': (event) => {
				console.log(event);
			},
		},
		locals: ({}) => {
			return {
				prod: true,
				groq: {} as Groq,
			};
		},
		cors: undefined,
	},
	admin: {
		router: adminRouter,
	},
});

export type Servers = typeof servers.infer;
export type Server = typeof server_.infer;
export type API = InferApiTypes<Server>;
export type PublicServer = typeof servers.infer.public;
export type AdminServer = typeof servers.infer.admin;
export type PublicAPI = InferApiTypes<PublicServer>;
export type AdminAPI = InferApiTypes<AdminServer>;
// export default server;
export default servers;
