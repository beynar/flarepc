import {
	Handler,
	error,
	handleError,
	handleRequest,
	RequestEvent,
	Router,
	Env,
	InferDurableApi,
	cors as corsHandler,
	withCookies,
	createStaticServer,
	CombinedRouters,
	QueueHandler,
	rateLimit,
	DurableServer,
	validate,
	FLARERROR,
	QueueRequestEvent,
	parse,
	CronRequestEvent,
	buildEvent,
	ServerOptions,
	CronHandler,
	getJurisdictionalNamespace,
	DurableObjects,
} from '.';
import type { Request } from '@cloudflare/workers-types';

const isHandler = (handler: any): handler is Handler<any, any, any, any> => {
	return 'call' in handler;
};

export const getHandler = (router: Router, path: string[]) => {
	type H = Router | Handler<any, any, any, any> | undefined;
	let handler: H = router;
	path.forEach((segment) => {
		handler = handler?.[segment as keyof typeof handler] ? (handler?.[segment as keyof typeof handler] as H) : undefined;
	});

	if (!handler || !isHandler(handler)) {
		throw error('NOT_FOUND', 'handler not found');
	}
	return handler;
};

const getDurableServer = async <O extends DurableObjects>({
	event,
	objects,
}: {
	event: RequestEvent;
	objects?: O;
}): Promise<DurableObjectStub<DurableServer> | null> => {
	const { name, id, jurisdiction, locationHint } = event.meta;

	if (!objects || !name) return null;

	if (id && name && name in objects) {
		let namespace = event.env[name as keyof typeof event.env] as DurableObjectNamespace<DurableServer>;
		const stubId = getJurisdictionalNamespace(namespace, jurisdiction).idFromName(id);
		const stub = (event.env[name as keyof typeof event.env] as any as DurableObjectNamespace<DurableServer>).get(
			stubId,
			locationHint ? { locationHint: locationHint } : {},
		) as DurableObjectStub<DurableServer>;

		return stub;
	}
	return null;
};

const isPathExcluded = (event: RequestEvent, exclude?: object): boolean => {
	if (!exclude) return false;
	const {
		path,
		meta: { name },
	} = event;
	let isExcluded = false;
	let current = exclude;

	$: for (const segment of path) {
		isExcluded = isExcluded || current[segment as keyof typeof current] === true;
		current = current?.[segment as keyof typeof current] as typeof exclude;
		if (isExcluded || !current) break $;
	}

	return isExcluded;
};

const executeFetch = async <O extends ServerOptions>(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
	opts: O,
	server: string | null = null,
): Promise<Response> => {
	const event = await buildEvent(request, env, ctx, opts, server);
	const stub = await getDurableServer({ event, objects: opts.objects });
	const isWebSocketConnect = request.headers.get('Upgrade') === 'websocket';

	// Cors are enabled by default with very permissive options to smoothen local development the usage and allows cookies to be used.
	const corsOptions = typeof opts.cors === 'function' ? await opts.cors(event) : opts.cors;
	const { preflight, corsify } =
		corsOptions === false
			? {
					preflight: null,
					corsify: null,
				}
			: corsHandler(corsOptions);

	let response: Response | undefined;
	$: try {
		// if (isPathExcluded(event, opts.exclude)) {
		// 	throw new FLARERROR('NOT_FOUND');
		// }

		for (let handler of (opts.before || []).concat(preflight || [], createStaticServer(opts.static)) || []) {
			response = (await handler(event)) ?? response;
			if (response) break $;
		}

		if (!isWebSocketConnect && opts.rateLimiters) {
			await rateLimit(env, opts.rateLimiters, event);
		}

		if (stub && event.meta?.name && event.meta?.id) {
			await stub.setMeta(event.meta);
			if (isWebSocketConnect) {
				return await stub.fetch(request.url);
			} else {
				// @ts-ignore
				response = await stub.handleRpc(request);
			}
		} else {
			response = await handleRequest(event, opts.router);
		}
	} catch (error) {
		opts.onError?.({ error, event });
		response = handleError(error);
	}

	for (let handler of (opts.after || []).concat(corsify || []) || []) {
		response = (await handler(response!, event)) ?? response;
	}

	return withCookies(response!, event);
};

const executeQueue = (batch: MessageBatch, env: Env, ctx: ExecutionContext, router: Router, { locals }: ServerOptions) => {
	return Promise.all(
		batch.messages.map(async (message) => {
			if (typeof message.body === 'string') {
				const { type, payload } = parse(message.body);
				const path = type.split('.');

				const handler = getHandler(router, path) as Handler<any, any, any, any>;
				const event = {
					batch,
					ctx,
					env,
					locals: {},
					message,
					path,
				} satisfies QueueRequestEvent;
				event.locals = typeof locals === 'function' ? await locals(event) : locals;
				try {
					await handler.call(event, validate(handler?.schema, payload));
					message.ack();
				} catch (error) {
					if (message.attempts < 10) {
						message.retry();
					} else {
						console.error(error, event);
					}
				}
			}
		}),
	);
};

const executeCron = async (controller: ScheduledController, env: Env, ctx: ExecutionContext, handler: CronHandler, opts: ServerOptions) => {
	const event = Object.assign(controller, {
		ctx,
		env,
		locals: {},
		queue: new QueueHandler(env, ctx).send,
	}) satisfies CronRequestEvent;
	event.locals = typeof opts.locals === 'function' ? await opts.locals(event) : opts.locals;
	return handler(event);
};

// type Filters<R extends Router | undefined, O extends DurableObjects | undefined> = {
// 	exclude?: BooleanRoutes<R, O>;
// 	include?: BooleanRoutes<R, O>;
// };

type RecordZ<K extends keyof any> = {
	[P in K]: ServerOptions;
};
type ServersOptions<S extends string = string> = RecordZ<S>;

export const createServers = <S extends string, O extends ServersOptions<S>>(opts: O) => {
	const servers = Object.keys(opts) as S[];

	const crons = combineCrons(opts);

	const queues = combineQueues(opts);

	return {
		async fetch(request: Request, env: Env, ctx: ExecutionContext) {
			const server = servers.find((server) => decodeURI(request.url).includes(`[${server}]`));

			if (!server || !(server in opts)) {
				return handleError(new FLARERROR('NOT_FOUND', 'server not found'));
			}

			return executeFetch(request, env, ctx, opts[server], server);
		},
		queue: queues
			? (batch: MessageBatch, env: Env, ctx: ExecutionContext) => {
					const { router, server } = queues[batch.queue];
					return executeQueue(batch, env, ctx, router, opts[server as S]);
				}
			: undefined,
		scheduled: crons
			? async (controller: ScheduledController, env: Env, ctx: ExecutionContext) => {
					const { handler, server } = crons[controller.cron];
					for (const cron in crons) {
						if (cron.replaceAll(' ', '') === controller.cron.replaceAll(' ', '')) {
							await executeCron(controller, env, ctx, handler, opts[server as S]);
							break;
						}
					}
				}
			: undefined,
		infer: {} as {
			[K in keyof O]: {
				router: O[K]['router'];
				objects: O[K]['objects'] extends DurableObjects
					? { [P in keyof O[K]['objects']]: InferDurableApi<O[K]['objects'][P]['prototype']> }
					: undefined;
			};
		},
	};
};

export const createServer = <R extends Router, O extends DurableObjects>(opts: ServerOptions<R, O>) => ({
	async fetch(r: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// @ts-ignore
		return executeFetch(r, env, ctx, opts);
	},
	infer: {} as {
		router: R;
		objects: O extends DurableObjects ? { [K in keyof O]: InferDurableApi<O[K]['prototype']> } : undefined;
	},
	queue: opts.queues
		? (batch: MessageBatch, env: Env, ctx: ExecutionContext) => executeQueue(batch, env, ctx, opts.queues![batch.queue], opts)
		: undefined,
	scheduled: opts.crons
		? (event: ScheduledController, env: Env, ctx: ExecutionContext) => executeCron(event, env, ctx, opts.crons![event.cron], opts)
		: undefined,
});
export const combineRouters = <R extends Router[]>(...routers: R) => {
	const router: Router = {};

	for (const r of routers) {
		Object.assign(router, r);
	}
	return router as CombinedRouters<R>;
};

export const combineCrons = (opts: ServersOptions) => {
	let hasCrons = false;
	const CRONS: Record<
		string,
		{
			server: string;
			handler: CronHandler;
		}
	> = {};
	for (const server in opts) {
		for (const cron in opts[server].crons) {
			hasCrons = true;
			const handler = opts[server]!.crons![cron];
			Object.assign(CRONS, {
				[cron]: {
					server,
					handler,
				},
			});
		}
	}
	return hasCrons ? CRONS : undefined;
};

export const combineQueues = (opts: ServersOptions) => {
	const QUEUES: Record<
		string,
		{
			router: Router;
			server: string;
		}
	> = {};
	let hasQueues = false;
	for (const server in opts) {
		const queues = opts[server].queues;
		if (queues) {
			hasQueues = true;
			for (const queue in queues) {
				if (queue in QUEUES) {
					QUEUES[queue].router = combineRouters(QUEUES[queue].router, queues[queue]);
				} else {
					Object.assign(QUEUES, {
						[queue]: {
							router: queues[queue],
							server,
						},
					});
				}
			}
		}
	}
	return hasQueues ? QUEUES : undefined;
};

const tast = [
	{
		image: {
			attributes: {
				itemID: 'gid://shopify/Metafield/22890933125361',
				itemType: 'file_reference',
				itemProp: 'home_reassurance@fr:meta-cms-y9qye2mtYK',
			},
			value: {
				alt: 'image',
				height: 512,
				width: 512,
				src: 'https://cdn.shopify.com/s/files/1/0355/0769/9852/files/kisspng-flag-of-france-emoji-flag-of-italy-mexico-flag-emoji-5b45acd45f90e5.2998003715312928843915_4000x.png?v=1673542231',
				id: 'gid://shopify/MediaImage/30991431532785',
			},
		},
		label: {
			attributes: {
				itemID: 'gid://shopify/Metafield/22890933092593',
				itemType: 'multi_line_text_field',
				itemProp: 'home_reassurance@fr:meta-cms-5yqFC8I1Ma',
			},
			value: '<p>Concept 100% Français</p>',
		},
	},
	{
		image: {
			attributes: {
				itemID: 'gid://shopify/Metafield/22890933190897',
				itemType: 'file_reference',
				itemProp: 'home_reassurance@fr:meta-cms-kV-2PGBzpP',
			},
			value: {
				alt: 'image',
				height: 100,
				width: 100,
				src: 'https://cdn.shopify.com/s/files/1/0355/0769/9852/files/camion-de-livraison.png?v=1669917660',
				id: 'gid://shopify/MediaImage/44078630994261',
			},
		},
		label: {
			attributes: {
				itemID: 'gid://shopify/Metafield/22890933158129',
				itemType: 'multi_line_text_field',
				itemProp: 'home_reassurance@fr:meta-cms-p5HvXqKUN5',
			},
			value: '<p>Livraison garantie avant Noël</p>',
		},
	},
	{
		image: {
			attributes: {
				itemID: 'gid://shopify/Metafield/22890933256433',
				itemType: 'file_reference',
				itemProp: 'home_reassurance@fr:meta-cms-qDLHFXFqrm',
			},
			value: {
				alt: 'image',
				height: 100,
				width: 100,
				src: 'https://cdn.shopify.com/s/files/1/0355/0769/9852/files/Cadeau_2a528d71-2429-4af7-9bcc-cdcd0017211f_4000x.png?v=1700576112',
				id: 'gid://shopify/MediaImage/44361818997077',
			},
		},
		label: {
			attributes: {
				itemID: 'gid://shopify/Metafield/22890933223665',
				itemType: 'multi_line_text_field',
				itemProp: 'home_reassurance@fr:meta-cms-ZwWqCh4My4',
			},
			value: '<p>La cadeau parfait pour un(e) fan de sport</p>',
		},
	},
];
