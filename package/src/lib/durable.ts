import { DurableObject } from 'cloudflare:workers';
import {
	Handler,
	DurableOptions,
	Env,
	Router,
	Session,
	getHandler,
	WSAPI,
	createRecursiveProxy,
	error,
	getErrorAsJson,
	handleError,
	handleRequest,
	stringify,
	parse,
	withCookies,
	Locals,
	SendOptions,
	Tags,
	Participant,
	SessionData,
	DurableMeta,
	StaticHandler,
	Cookies,
	DurableRequestEvent,
	QueueHandler,
	validate,
	MaybePromise,
	WS_RESPONSE_TYPE,
	tryParse,
} from '.';
import { rateLimit } from './ratelimit';
import { getPath } from './requestEvent';
import type { Request } from '@cloudflare/workers-types';
import { DurableKV } from './durableKv';
import { Scheduler } from './scheduler';

const getDefaultBroadcastPresenceTag = (opts?: DurableOptions) =>
	opts?.broadcastPresenceTo && opts?.broadcastPresenceTo !== 'ALL' && opts?.broadcastPresenceTo !== 'NONE'
		? opts?.broadcastPresenceTo
		: opts?.broadcastPresenceTo || 'ALL';

export const serializeSession = (ws: WebSocket, value: Session) => {
	ws.serializeAttachment(stringify(value));
};

export const deserializeSession = (ws: WebSocket): Session => {
	return parse(ws.deserializeAttachment()) as Session;
};

type ArrayBufferMessageHandler = (ws: WebSocket, message: ArrayBuffer) => MaybePromise<void>;
type UnHandledMessageHandler = (ws: WebSocket, message: Record<string, any>) => MaybePromise<void>;

export class DurableServer extends DurableObject<any> {
	kv: DurableKV;
	sql: SqlStorage;
	scheduler: Scheduler;
	_TYPE: any = 'DURABLE_SERVER';
	opts?: DurableOptions;
	// @ts-expect-error this will be set in the constructor by blocking concurrency if needed
	locals: Locals;
	// @ts-ignore
	router: Router;
	// @ts-ignore
	in: Router;
	// @ts-ignore
	out: Router;
	// @ts-ignore
	tasks: Router;
	onUnHandledMessage?: UnHandledMessageHandler;
	onArrayBufferMessage?: ArrayBufferMessageHandler;
	onConnectionOpen?: (ws: WebSocket, session: Session) => void;
	onConnectionClose?: (ws: WebSocket, session: Session) => void;
	blockConcurrencyWhile?: () => Promise<void>;

	setPresence = async ({ participant, sessionData }: { participant: Participant; sessionData?: SessionData }) => {
		const sessions = await this.getSessions();
		const session = sessions.find((s) => s.session.participant.id === participant.id);
		if (session) {
			const newSession = {
				...session.session,
				data: sessionData || {},
				participant,
			} satisfies Session;
			serializeSession(session.ws, newSession);
			this.sendPresence();
			return newSession;
		}
	};

	event = <D extends {}>(
		rest: D,
	): {
		ctx: DurableObjectState;
		env: Env;
		locals: Locals;
		static: StaticHandler;
		queue: QueueHandler['send'];
	} & D => {
		return Object.assign(rest, {
			ctx: this.ctx,
			env: this.env,
			locals: this.locals,
			static: new StaticHandler(this.env, this.ctx),
			queue: new QueueHandler(this.env, this.ctx, this.opts?.queues).send,
		});
	};

	durableEvent = (request: Request) => {
		const event = this.event({
			path: [],
			request,
			url: new URL(request.url),
			cookies: new Cookies(request),
			meta: this.meta,
		}) satisfies DurableRequestEvent;
		getPath(event);
		return event;
	};

	get meta() {
		return this.kv.get<DurableMeta>('meta')!;
	}

	constructor(
		public ctx: DurableObjectState,
		public env: Env,
	) {
		super(ctx, env);
		this.env = env;
		this.ctx = ctx;
		this.sql = ctx.storage.sql;
		this.kv = new DurableKV(ctx);
		this.scheduler = new Scheduler(this);
		void ctx.blockConcurrencyWhile(async () => {
			this.kv.init();
			this.scheduler.init();
			const locals = this.opts?.locals;
			if (typeof locals === 'function') {
				this.locals = await locals(this.event({}));
			} else if (locals) {
				this.locals = locals;
			}

			if (this.blockConcurrencyWhile) {
				await this.blockConcurrencyWhile?.();
			}
		});

		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
	}

	createSender =
		<O extends Router>(out: O) =>
		(
			{ omit, to = 'ALL' }: SendOptions = {
				to: 'ALL',
				omit: [],
			},
		) =>
			createRecursiveProxy(async ({ type, data }) => {
				if (!out) {
					throw error('SERVICE_UNAVAILABLE');
				}

				const sessions = this.getSessions(typeof to === 'string' && to !== 'ALL' ? to : undefined)
					.filter((s) => s.session.connected)
					.filter(
						typeof to === 'function'
							? to
							: ({ session }) => {
									if (omit && omit.length > 0) {
										return !omit.includes(session.participant.id);
									}
									if (to === 'ALL' || !to) {
										return true;
									} else if (Array.isArray(to)) {
										return to.includes(session.participant.id);
									}
									return true;
								},
					);

				if (sessions.length) {
					const handler = getHandler(out, type.split('.')) as Handler<any, any, any, any>;
					const parsedData = await validate(handler?.schema, data);
					const event = this.event({ to: sessions });
					const ctx = await handler?.call(event, parsedData);
					sessions.forEach(({ ws }) => {
						ws.send(stringify({ type, data: parsedData, ctx }));
					});
				}
			}) as WSAPI<O>;

	// @ts-ignore
	async fetch(request: Request & { cf: { meta: DurableMeta; isWebSocketConnect: boolean } }): Promise<Response> {
		this.kv.set('meta', request.cf.meta);
		console.log('client-id', request.headers.get('client-id'));
		if (request.cf.isWebSocketConnect) {
			if (!this.out && !this.in) {
				throw error('SERVICE_UNAVAILABLE');
			}
			let session: Session | undefined = undefined;
			let ws: WebSocket | undefined = undefined;
			try {
				const [client, server] = Object.values(new WebSocketPair());
				ws = server;
				const event = this.durableEvent(request);
				let {
					session: sessionData = {},
					participant = { id: crypto.randomUUID() },
					tags = [],
				} = (await this.opts?.getSessionDataAndParticipant?.({ event, object: this })) || {};

				if (!participant.id) {
					participant.id = crypto.randomUUID();
				}

				session = {
					id: crypto.randomUUID(),
					participant,
					connected: true,
					createdAt: Date.now(),
					data: sessionData,
				};

				serializeSession(server, session);

				this.ctx.acceptWebSocket(server, tags);

				this.sendPresence();

				this.onConnectionOpen?.(server, session);

				return withCookies(
					new Response(null, {
						status: 101,
						webSocket: client,
					}),
					event,
				);
			} catch (error) {
				this.opts?.onError?.({ error, ws, session, object: this });
				return handleError(error);
			}
		} else {
			const event = this.durableEvent(request);
			try {
				return withCookies(await handleRequest(event, this.router), event);
			} catch (error) {
				return handleError(error);
			}
		}
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		if (typeof message !== 'string') {
			return this.onArrayBufferMessage?.(ws, message);
		}

		const session = deserializeSession(ws);

		let id: string | undefined = undefined;
		let data: any | undefined = undefined;
		let type: string | undefined = undefined;
		console.log({ session, data, type, message }, this.in);
		try {
			const { type: messageType, data: messageData, id: messageId } = parse(message as string);
			id = messageId;
			type = messageType;
			data = messageData;
			if (!this.in) {
				throw error('SERVICE_UNAVAILABLE');
			}
			const handler = getHandler(this.in, String(type).split('.')) as Handler<any, any, any, any>;
			console.log({ handler });
			if (!handler) {
				if (this.onUnHandledMessage) {
					this.onUnHandledMessage(ws, tryParse(message));
				} else {
					throw error('SERVICE_UNAVAILABLE');
				}
			}

			const event = this.event({ session, ws });
			this.opts?.rateLimiters &&
				this.opts?.rateLimiters &&
				(await rateLimit(this.env, this.opts?.rateLimiters, Object.assign({}, event, { type, data })));

			const parsedData = await validate(handler?.schema, data);
			const response = await handler?.call(event, parsedData);
			ws.send(stringify({ type: WS_RESPONSE_TYPE, data: response, id, error: null }));
		} catch (error) {
			this.opts?.onError?.({ error, ws, session, message, object: this, type, data });
			const { body, status, statusText } = getErrorAsJson(error);
			if (id) {
				ws.send(stringify({ type: WS_RESPONSE_TYPE, error: { ...JSON.parse(body), status, statusText }, id, data: null }));
			} else {
				ws.send(stringify({ type: 'error', data: { ...JSON.parse(body), status, statusText } }));
			}
		}
	}

	async webSocketError(ws: WebSocket, error: unknown) {
		setTimeout(() => {
			this.sendPresence();
		});
		this.onConnectionClose?.(ws, deserializeSession(ws));
	}
	async webSocketClose(ws: WebSocket, code: number, reason: string) {
		setTimeout(() => {
			this.sendPresence();
		});
		this.onConnectionClose?.(ws, deserializeSession(ws));
	}

	getSessions = (tag?: Tags) => {
		return this.ctx.getWebSockets(tag).map((ws) => ({
			session: deserializeSession(ws),
			ws,
		}));
	};

	sendPresence = (tag: Tags | undefined = getDefaultBroadcastPresenceTag(this.opts)) => {
		const webSockets: WebSocket[] = [];
		if (this.opts?.broadcastPresenceTo === 'NONE' && !tag) {
			// If some tag is passed this options will overtake the default options we will broadcast presence
			return;
		}

		const participants = this.getSessions(tag === 'ALL' ? undefined : tag)
			.filter(({ ws, session }) => {
				if (session.connected !== true) {
					return false;
				}
				webSockets.push(ws);
				return true;
			})
			.map(({ session: { participant } }) => participant);

		webSockets.forEach((value) => {
			value.send(stringify({ type: 'presence', data: participants }));
		});
	};
}

export const createDurableServer = (opts?: DurableOptions) => {
	return class extends DurableServer {
		_TYPE = 'DURABLE_SERVER' as const;
		opts = opts;
	};
};
