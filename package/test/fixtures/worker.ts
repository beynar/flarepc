import { procedure, createServer, createDurableServer, InferApiTypes, createServers } from '../../src/lib';
import z from 'zod';
import { DurableObject } from 'cloudflare:workers';

declare global {
	type Env = {
		TEST_DURABLE: DurableObject;
		API_KEY: string;
		Queue: Queue;
		TEST_RATE_LIMITER: RateLimit;
	};
}
declare module '../../src/lib' {
	interface Register {
		Env: Env;
		Tags: 'ADMIN' | 'MENTOR' | 'USER';
		Locals: {
			test: true;
		};
		Participant: {
			id: string;
			name: string;
		};
		Queues: {
			Queue: typeof Queue;
		};
	}
}

const router = {
	test: procedure()
		.input(z.string())
		.handle(async ({ input }) => {
			return {
				hello: input,
			};
		}),
};

export class TestDurable extends createDurableServer({
	locals: {
		test: true,
	},
}) {
	out = {
		message: procedure('out')
			.input(z.object({ message: z.string().default('hello') }))
			.handle(({ input }) => {
				return {
					hello: input.message,
				};
			}),
		nested: {
			message: procedure('out')
				.input(z.object({ message: z.string().default('hello') }))
				.handle(({ input, event }) => {
					return {
						hello: input.message,
					};
				}),
		},
	};
	in = {
		message: procedure('in')
			.input(z.object({ message: z.string() }))
			.handle(({ input, event }) => {
				console.log('event');
				return {
					hello: input.message,
				};
			}),
		nested: {
			message: procedure('in')
				.input(z.object({ message: z.string().default('hello') }))
				.handle(({ input }) => {
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
			// doc.getText('text').insert(0, 'hello world');
			return {
				ok: true,
			};
		}),
	};

	tasks = {
		test: procedure('schedule')
			.input(z.object({ message: z.string() }))
			.handle(async ({ input }) => {
				console.log('hello');
			}),
	};

	send = this.createSender(this.out);
	schedule = this.createScheduler(this.tasks);
}

const Queue = {
	test: procedure('queue')
		.input(z.string())
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
			test: true,
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
	throwError: procedure().handle(async () => {
		throw new Error('test');

		return {
			true: true,
		};
	}),
	validationTest: procedure()
		.input(
			z.object({
				email: z.string().email(),
				age: z.number().min(18).max(100),
				preferences: z.array(z.string()),
			}),
		)
		.handle(async ({ input }) => {
			return {
				valid: true,
				data: input,
			};
		}),
	rateLimited: procedure().handle(async ({ event }) => {
		// We can check rate limiting in the handler implementation
		// Since this is a test mock, we'll just return success
		return {
			accessed: true,
			timestamp: Date.now(),
		};
	}),
	test: procedure()
		.input(z.string())
		.handle(async ({ input }) => {
			return {
				hello: input,
			};
		}),
	nested: {
		test: procedure()
			.input(z.string())
			.handle(async ({ input }) => {
				return {
					hello: input,
				};
			}),
	},

	// File upload procedures
	fileUpload: procedure()
		.input(z.instanceof(File))
		.handle(async ({ input }) => {
			const file = input as File;
			return {
				success: true,
				fileName: file.name,
				type: file.type,
				size: file.size,
			};
		}),

	multiFileUpload: procedure()
		.input(z.array(z.instanceof(File)))
		.handle(async ({ input }) => {
			const files = input as File[];
			return {
				success: true,
				files: files.map((file) => ({
					name: file.name,
					type: file.type,
					size: file.size,
				})),
			};
		}),

	largeFileUpload: procedure()
		.input(z.instanceof(File))
		.handle(async ({ input }) => {
			const file = input as File;
			// Reject files larger than 5MB
			if (file.size > 5 * 1024 * 1024) {
				throw new Error(
					JSON.stringify({
						error: 'File too large',
						maxSize: '5MB',
					}),
				);
			}

			return {
				success: true,
				fileName: file.name,
				size: file.size,
			};
		}),
};

const adminRouter = {
	test: procedure()
		.input(z.string())
		.handle(async ({ input, event }) => {
			return {
				hello: input,
			};
		}),
	nested: {
		test: procedure()
			.input(z.string())
			.handle(async ({ input }) => {
				return {
					hello: input,
				};
			}),
	},
};

const servers = createServers({
	public: {
		router: publicRouter,
		objects: {
			TestDurable: TestDurable,
		},
		rateLimiters: {
			TEST_RATE_LIMITER: ({ request }) => {
				return request.headers.get('session') || '';
			},
		},
		locals: () => {
			return {
				test: true,
			};
		},
	},
	admin: {
		router: adminRouter,
	},
});

export type Servers = typeof servers.infer;
export type Server = typeof server.infer;
export type API = InferApiTypes<Server>;
export type PublicServer = typeof servers.infer.public;
export type AdminServer = typeof servers.infer.admin;
export type PublicAPI = InferApiTypes<PublicServer>;
export type AdminAPI = InferApiTypes<AdminServer>;
export default servers;
