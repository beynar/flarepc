import {
	Env,
	Locals,
	Meta,
	Session,
	QueueHandler,
	StaticHandler,
	Cookies,
	DurableServer,
	ServerOptions,
	GetObjectJurisdictionOrLocationHint,
} from '.';

import type { Request as CfRequest } from '@cloudflare/workers-types';

const getMetaFromRequest = async ({
	event,
	getObjectJurisdictionOrLocationHint,
}: {
	event: RequestEvent;
	getObjectJurisdictionOrLocationHint?: GetObjectJurisdictionOrLocationHint;
}): Promise<void> => {
	[event.meta.name, event.meta.id] = decodeURI(event.request.url)
		.match(/\/\(([^:]+):([^)]+)\)/)
		?.slice(1) || [null, null];

	if (event.meta.id === 'random') {
		event.meta.id = crypto.randomUUID();
	}

	if (event.meta.name && event.meta.id && getObjectJurisdictionOrLocationHint) {
		const localization = await getObjectJurisdictionOrLocationHint(event);
		Object.assign(event.meta, {
			jurisdiction: localization?.jurisdiction || null,
			locationHint: localization?.locationHint || null,
		});
	}
};

export const getJurisdictionalNamespace = (
	namespace: DurableObjectNamespace<DurableServer>,
	jurisdiction: DurableObjectJurisdiction | null,
): DurableObjectNamespace<DurableServer> => {
	if (!jurisdiction) {
		return namespace;
	}
	try {
		return namespace.jurisdiction(jurisdiction);
	} catch (error) {
		// We must be in a dev env and the jurisdictional setting is not available
		return namespace;
	}
};

export const buildEvent = async (
	request: CfRequest,
	env: Env,
	ctx: ExecutionContext,
	opts: ServerOptions,
	server: string | null = null,
	isWebSocketConnect: boolean = false,
): Promise<RequestEvent> => {
	const url = new URL(decodeURI(request.url));
	const clonedHeaders = new Headers(request.headers);

	if (isWebSocketConnect) {
		// Websockets lacks the headers object, so we need to parse the headers from the search params and append them to the headers object
		const searchParamsHeaders = JSON.parse(url.searchParams.get('headers') || '{}');
		Object.entries(searchParamsHeaders).forEach(([key, value]) => {
			clonedHeaders.append(key, value as string);
		});
		url.searchParams.delete('headers');
	}

	// no need to clone the request for normal requests
	const clonedRequest = isWebSocketConnect
		? (new Request(request as any, {
				headers: clonedHeaders,
			}) as any)
		: request;

	const event = {
		ctx,
		env,
		path: [],
		locals: {},
		queue: new QueueHandler(env, ctx, opts.queues).send,
		request: clonedRequest,
		static: new StaticHandler(env, ctx),
		meta: { name: null, id: null, jurisdiction: null, locationHint: null, server },
		url,
		cookies: new Cookies(request as any),
	} satisfies RequestEvent;

	getPath(event);
	await getMetaFromRequest({ event, getObjectJurisdictionOrLocationHint: opts.getObjectJurisdictionOrLocationHint });

	event.locals = typeof opts.locals === 'function' ? await opts.locals(event) : opts.locals;
	return event;
};

export const getPath = (event: RequestEvent | DurableRequestEvent) => {
	let isObject = false;
	let isStatic = false;
	event.path = event.url.pathname
		.split('/')
		.filter(Boolean)
		.filter((part) => {
			if (part === 'static') {
				isStatic = true;
			}
			if (part.match(/\(([^:]+):([^)]+)\)/)) {
				isObject = true;
				return false;
			}
			if (part.match(/\[([^\]]+)\]/)) {
				return false;
			}
			return true;
		});
	const method = event.request.method;
	if (method !== 'POST' && !isObject && !isStatic) {
		event.path.push(method.toLocaleLowerCase());
	}
};

export type RequestEvent = {
	request: CfRequest;
	env: Env;
	ctx: ExecutionContext;
	locals: Locals;
	path: string[];
	meta: Meta;
	queue: QueueHandler['send'];
	static: StaticHandler;
	url: URL;
	cookies: Cookies;
};
export type CronRequestEvent = ScheduledController & {
	env: Env;
	ctx: ExecutionContext;
	queue: QueueHandler['send'];
};

export type ScheduleRequestEvent = {
	ctx: DurableObjectState;
	env: Env;
	locals: Locals;
	static: StaticHandler;
	queue: QueueHandler['send'];
};

export type DurableRequestEvent = {
	request: CfRequest;
	env: Env;
	ctx: DurableObjectState;
	locals: Locals;
	path: string[];
	meta: Meta;
	queue: QueueHandler['send'];
	static: StaticHandler;
	url: URL;
	cookies: Cookies;
};

export type WebsocketOutputRequestEvent = {
	to: { session: Session; ws: WebSocket }[];
	env: Env;
	ctx: DurableObjectState;
	locals: Locals;
	queue: QueueHandler['send'];
	static: StaticHandler;
};

export type WebsocketInputRequestEvent = {
	ws: WebSocket;
	session: Session;
	locals: Locals;
	env: Env;
	ctx: DurableObjectState;
	queue: QueueHandler['send'];
	static: StaticHandler;
};

export type QueueRequestEvent = {
	batch: MessageBatch;
	path: string[];
	message: Message<unknown>;
	ctx: ExecutionContext;
	env: Env;
};
