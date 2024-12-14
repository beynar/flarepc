import {
	procedure,
	createServer,
	createDurableServer,
	combineRouters,
	createServers,
	Server as SS,
	InferApiTypes,
	DurableServer,
	Router,
	CombinedServerOptions,
	DurableObjects,
} from './lib';
import { string, object, map, BaseSchema, boolean, instance, number, undefined_, null_, date, set } from 'valibot';
import { createClient } from './lib/client';
import { WebSocketClient } from './lib/websocket';

declare global {
	type Locals = {};

	interface Env {
		Queue: Queue;
		TestDurable: DurableObjectNamespace<TestDurable>;
	}
	type Queues = {
		Queue: typeof Queue;
	};
}
const router = {
	text: procedure().handle(async ({ event }) => {
		return {
			hello: 'world',
		};
	}),
	parametrized2: {
		update: procedure()
			.input(object({ name: string() }))
			.handle(async ({ input, event, ctx }) => {
				return {
					name: input.name,
				};
			}),
	},
	user: {
		get: procedure()
			.input(object({ name: string(), map: map(string(), string()) }))
			.handle(async ({ event, input }) => {
				return {
					userId: 1,
				};
			}),
	},
	httpVerbs: {
		get: procedure().handle(async ({ event }) => {
			return {
				hello: 'world',
			};
		}),
		put: procedure().handle(async ({ event }) => {
			return {
				hello: 'world',
			};
		}),
		delete: procedure().handle(async ({ event }) => {
			return {
				hello: 'world',
			};
		}),
		patch: procedure().handle(async ({ event }) => {
			return {
				hello: 'world',
			};
		}),
	},
	test: {
		object: procedure()
			.input(object({ name: string() }))
			.handle(async ({ input, event, ctx }) => {
				return {
					hello: input.name,
				};
			}),
		map: procedure()
			.use(() => {
				return {
					ok: true,
				};
			})
			.use(() => {
				return {
					ok2: true,
				};
			})
			.input(map(string(), string()))
			.handle(async ({ input, event, ctx }) => {
				return {
					hello: input,
				};
			}),
		set: procedure()
			.input(set(string()))
			.handle(async ({ input, event, ctx }) => {
				return {
					hello: input,
				};
			}),
		string: procedure()
			.input(string())
			.handle(async ({ input, event, ctx }) => {
				return {
					hello: input,
				};
			}),
		date: procedure()
			.input(date())
			.handle(async ({ input, event, ctx }) => {
				return {
					hello: input,
				};
			}),
		number: procedure()
			.input(number())
			.handle(async ({ input, event, ctx }) => {
				return {
					hello: input,
				};
			}),
		boolean: procedure()
			.input(
				object({
					boolean: boolean(),
				}),
			)
			.handle(async ({ input, event, ctx }) => {
				return {
					hello: input,
				};
			}),
		null: procedure()
			.input(null_())
			.handle(async ({ input }) => {
				return {
					hello: input,
				};
			}),
		undefined: procedure()
			.input(undefined_())
			.handle(async ({ input, event, ctx }) => {
				return {
					hello: input,
				};
			}),
		complex: procedure()
			.input(
				object({
					string: string(),
					number: number(),
					boolean: boolean(),
					date: date(),
					undefined: undefined_(),
					null: null_(),
					object: object({
						string: string(),
						number: number(),
						boolean: boolean(),
						map: map(string(), string()),
						date: date(),
						undefined: undefined_(),
						null: null_(),
						file: instance(File),
					}),
				}),
			)
			.handle(async ({ input, event, ctx }) => {
				return {
					hello: input,
				};
			}),
	},
};

export type AppRouter = typeof router;

const Queue = {
	test: procedure('queue')
		.input(string())
		.handle(async ({ input, event }) => {
			// console.log(input);
		}),
};

const durableRouter = {
	test: procedure('durable')
		.input(object({ id: string() }))
		.handle(async ({ input, event }) => {
			const promise = async () => {
				await new Promise((resolve) => {
					setTimeout(resolve, 2000);
				});
				console.log({ input });
				return {
					ok: true,
				};
			};

			return {
				ok: true,
			};
		}),
};

// const server = createServer({
// 	router,
// 	// locals,
// 	objects: {
// 		TestDurable: TestDurable,
// 	},
// 	// queues: {
// 	// 	Queue,
// 	// },
// });
// export class TestDoc extends createDurableDoc({
// 	locals: () => {
// 		return {};
// 	},
// 	storage: {
// 		getDoc: async ({}) => {
// 			return new Doc();
// 		},
// 		saveDoc: async ({ snapshot, doc }) => {
// 			console.log({ snapshot, doc });
// 		},
// 	},
// }) {
// 	out = {
// 		message: procedure('out')
// 			.input(object({ message: string() }))
// 			.handle(async ({ input, event }) => {
// 				return {
// 					hello: input.message,
// 				};
// 			}),
// 	};
// 	in = {
// 		message: procedure('in')
// 			.input(object({ message: string() }))
// 			.handle(async ({ input, event }) => {
// 				return {
// 					hello: input.message,
// 				};
// 			}),
// 	};
// 	testRouter = {
// 		test2: procedure('durable').handle(async ({ event }) => {
// 			return {
// 				ok: false,
// 			};
// 		}),
// 	};
// 	send = this.createSender(this.out);

// 	router = combineRouters(durableRouter, this.testRouter);
// }

// export type Server = typeof server.infer;
// export default server;

// const adminRouter = {
// 	admin: procedure().handle(async ({ event }) => {
// 		return {
// 			hello: 'world',
// 			res,
// 		};
// 	}),
// };

// const servers = createServers({
// 	public: {
// 		router: publicRouter,
// 		objects: {
// 			TestDurable: TestDurable,
// 			// TestDoc: TestDoc,
// 		},
// 	},
// 	admin: {
// 		router: adminRouter,
// 	},
// });

// export type Servers = typeof servers.infer;

// type D = Servers['public']['objects']['TestDurable'];
// export type PublicServer = typeof servers.infer.public;
// export type AdminServer = typeof servers.infer.admin;

const publicRouter = {
	get: procedure().handle(async ({ event }) => {
		return {
			hello: 'world',
		};
	}),
	nested: {
		nested: {
			nested: procedure().handle(async ({ event }) => {
				return {
					hello: 'world',
				};
			}),
		},
	},
};

export class TestDurable extends createDurableServer() {
	out = {
		message: procedure('out')
			.input(object({ message: string() }))
			.handle(async ({ input, event }) => {
				return {
					hello: input.message,
				};
			}),
	};
	in = {
		message: procedure('in')
			.input(object({ message: string() }))
			.handle(async ({ input, event }) => {
				return {
					hello: input.message,
				};
			}),
	};
	router = {
		test2: procedure('durable').handle(async ({ event }) => {
			return {
				ok: false,
			};
		}),
	};
	send = this.createSender(this.out);

	// 	router = combineRouters(durableRouter, this.testRouter);
	// 	test() {
	// 		return {
	// 			name: this.ctx.id.name || 'name',
	// 			ok: false,
	// 		};
	// 	}
}
const server = createServer({
	router: publicRouter,
	objects: {
		TestDurable: TestDurable,
	},
	exclude: {
		TestDurable: {
			test2: true,
		},

		nested: {
			nested: {
				nested: true,
			},
		},
	},
});
const servers = createServers({
	test: {
		router: publicRouter,
		objects: {
			TestDurable: TestDurable,
		},
		exclude: {
			get: true,
		},
		// exclude:{

		// }
		// exclude: {
		// 	TestDurable: {
		// 		test2: true,
		// 	},
		// },
	},
});

export type Server = typeof server.infer;
export type Servers = typeof servers.infer;

type In = typeof server.infer.objects.TestDurable.in;
type Out = typeof server.infer.objects.TestDurable.out;
type WSS = WebSocketClient<In, Out>;
const client = createClient<Server>({
	endpoint: '',
});
const client2 = createClient<Servers, 'test'>({
	endpoint: '',
	server: 'test',
});

// client2.TestDurable()
const wss = {} as WSS;

const result = await wss.send?.message({ message: 'hello' });
