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
	Router,
	DurableObjects,
} from '.';
import { regiterDurableMeta } from './ambient';

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
	request: Request,
	env: Env,
	ctx: ExecutionContext,
	opts: ServerOptions,
	server: string | null = null,
): Promise<RequestEvent> => {
	const event = {
		ctx,
		env,
		path: [],
		locals: typeof opts.locals === 'function' ? await opts.locals(request, env, ctx) : opts.locals,
		queue: new QueueHandler(env, ctx, opts.queues).send,
		request,
		static: new StaticHandler(env, ctx),
		meta: { name: null, id: null, jurisdiction: null, locationHint: null, server },
		url: new URL(decodeURI(request.url)),
		cookies: new Cookies(request),
	} satisfies RequestEvent;

	getPath(event);
	await getMetaFromRequest({ event, getObjectJurisdictionOrLocationHint: opts.getObjectJurisdictionOrLocationHint });
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
	request: Request;
	env: Env;
	ctx: ExecutionContext;
	locals?: Locals;
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
	locals?: Locals;
	queue: QueueHandler['send'];
};

export type DurableRequestEvent = {
	request: Request;
	ctx: DurableObjectState;
	env: Env;
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
	from: {
		session: Session;
		ws: WebSocket;
	};
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
	locals: Locals;
};
