import type { Queue } from '@cloudflare/workers-types';
import {
	Handler,
	ConnectOptions,
	WebSocketClient,
	DurableServer,
	RequestEvent,
	QueueRequestEvent,
	DurableRequestEvent,
	WebsocketInputRequestEvent,
	WebsocketOutputRequestEvent,
	CronRequestEvent,
	CorsOptions,
	StaticServerOptions,
	DocOptions,
} from '.';

import type { DurableDoc } from './yjs';

import { StandardSchemaV1 } from './standardSchema';
export interface Register {}

export type Env = Register extends {
	Env: infer _Env;
}
	? _Env
	: {};

export type Locals = Register extends {
	Locals: infer _Locals;
}
	? _Locals
	: {};

export type Tags = Register extends {
	Tags: infer _Tags;
}
	? _Tags
	: string;

export type SessionData = Register extends {
	SessionData: infer _SessionData;
}
	? _SessionData
	: {};

export type Participant = Register extends {
	Participant: infer _Participant;
}
	? _Participant extends Record<string, any> & {
			id: string;
		}
		? _Participant
		: {
				id: string;
			}
	: {
			id: string;
		};

export type Queues = Register extends {
	Queues: infer _Queues;
}
	? _Queues extends Record<PickKeyType<Env, Queue>, Router>
		? _Queues
		: Record<string, Router>
	: Record<string, Router>;

export type ProcedureType = 'queue' | 'durable' | 'in' | 'out' | undefined;

export type MaybePromise<T> = T | Promise<T>;

export type SendOptions = {
	to?: 'ALL' | Tags | string[] | ((opts: { ws: WebSocket; session: Session }) => boolean | null | undefined);
	omit?: Tags | string[];
};

export type Middleware<T extends ProcedureType = undefined, R = any> = (event: DynamicRequestEvent<T>) => MaybePromise<R>;

type RateLimitKeyExtractor<T extends ProcedureLimiterEvent | WebsocketLimiterEvent> = (event: T) => string | void;

type ProcedureLimiterEvent = AllUnionFields<RequestEvent | DurableRequestEvent>;
type WebsocketLimiterEvent = WebsocketInputRequestEvent & { type: string; data: unknown };

export type ProcedureRateLimiters = Record<PickKeyType<Env, RateLimit>, RateLimitKeyExtractor<ProcedureLimiterEvent>>;

export type WebsocketRateLimiters = Record<
	PickKeyType<Env, RateLimit>,
	RateLimitKeyExtractor<WebsocketInputRequestEvent & { type: string; data: unknown }>
>;

export type Session = {
	id: string;
	participant: Participant;
	connected: boolean;
	createdAt: number;
	data: SessionData;
};

export type MessagePayload<O extends Router, T extends RouterPaths<O>> = {
	type: T;
	data: InferSchemaOutPutAtPath<O, T>;
	id?: string;
	error?: unknown;
	ctx: InferOutPutAtPath<O, T>;
};

export type SingletonPaths<R extends Router, P extends RouterPaths<R>> = P extends `${infer START}.${infer REST}` ? never : P;
type NestedPaths<R extends Router, P extends RouterPaths<R>> = P extends `${infer START}.${infer REST}` ? P : never;

export type MessageCallback<O extends Router, K extends RouterPaths<O>> = (payload: {
	data: InferSchemaOutPutAtPath<O, K>;
	ctx: InferOutPutAtPath<O, K>;
}) => void;

export type MessageHandlers<O extends Router> = Partial<
	{
		[K in SingletonPaths<O, RouterPaths<O>>]: MessageCallback<O, K>;
	} & UnionToIntersection<PathToNestedObject<O, NestedPaths<O, RouterPaths<O>>>>
>;

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

export type PathToNestedObject<O extends Router, P extends string, BasePath extends string = ''> = P extends `${infer START}.${infer REST}`
	? Partial<{ [K in START]: PathToNestedObject<O, REST, BasePath extends '' ? `${K}` : `${BasePath}.${K}`> }>
	: Partial<{
			[K in P]: `${BasePath}.${K}` extends RouterPaths<O> ? MessageCallback<O, `${BasePath}.${K}`> : unknown;
		}>;

export type DurableOptions = {
	getSessionDataAndParticipant?: (payload: {
		event: DurableRequestEvent;
		object: DurableServer;
	}) => MaybePromise<{ session: SessionData; participant: Participant; tags?: Tags[] }>;
	onError?: (payload: {
		error: unknown;
		ws?: WebSocket;
		session?: Session;
		message?: string;
		object: DurableServer;
		type?: string;
		data?: any;
	}) => MaybePromise<void>;
	onMessage?: (payload: { ws: WebSocket; session: Session; message: string; object: DurableServer }) => MaybePromise<void>;
	locals?:
		| Locals
		| ((event: Omit<DurableRequestEvent | RequestEvent | QueueRequestEvent | CronRequestEvent, 'locals'>) => MaybePromise<Locals>);
	broadcastPresenceTo?: 'NONE' | 'ALL' | Tags;
	rateLimiters?: WebsocketRateLimiters;
	blockConcurrencyWhile?: (object: DurableServer) => MaybePromise<void>;
	queues?: Queues;
};
export type HandleFunction<
	S extends StandardSchemaV1 | undefined,
	M extends Middleware<T>[] | undefined,
	T extends ProcedureType = undefined,
> = (payload: HandlePayload<S, M, T>) => MaybePromise<any>;

type OmitNever<T> = Pick<
	T,
	{
		[K in keyof T]: T[K] extends never ? never : K;
	}[keyof T]
>;

export type DynamicRequestEvent<T extends ProcedureType = undefined> = T extends 'queue'
	? QueueRequestEvent
	: T extends 'durable'
		? DurableRequestEvent
		: T extends 'in'
			? WebsocketInputRequestEvent
			: T extends 'out'
				? WebsocketOutputRequestEvent
				: RequestEvent;

export type HandlePayload<
	S extends StandardSchemaV1 | undefined,
	M extends Middleware<T>[] | undefined,
	T extends ProcedureType = undefined,
> = OmitNever<{
	event: DynamicRequestEvent<T>;
	input: S extends StandardSchemaV1 ? StandardSchemaV1.InferInput<S> : never;
	ctx: ReturnOfMiddlewares<M, T>;
}>;

export type ReturnOfMiddlewares<
	Use extends Middleware<T>[] | undefined,
	T extends ProcedureType = undefined,
	PreviousData = unknown,
> = Use extends Middleware<T>[]
	? Use extends [infer Head, ...infer Tail]
		? Head extends Middleware<T, infer HeadData>
			? Tail extends Middleware<T, infer TD>[]
				? PreviousData & HeadData & ReturnOfMiddlewares<Tail, T, PreviousData & HeadData>
				: HeadData & PreviousData
			: PreviousData
		: unknown
	: unknown;

export type Router = {
	[K: string]: Handler<any, any, any, any> | Router;
};

export type Server = {
	router: Router;
	objects?: Record<string, DurableServerDefinition>;
};

export type DurableServerDefinition<
	R extends Router = Router,
	I extends Router = Router,
	O extends Router = Router,
	D extends any = any,
> = {
	router?: R;
	in?: I;
	out?: O;
	_TYPE?: D;
};

type IO<R> = R extends Router
	? {
			[K in RouterPaths<R>]: {
				input: InferInputAtPath<R, K>;
				output: InferOutPutAtPath<R, K>;
			};
		}
	: never;

type InferWS<O> =
	O extends DurableServerDefinition<infer R, infer I, infer O>
		? {
				ws: WebSocketClient<I, O>;
				in: {
					[K in RouterPaths<I>]: InferOutPutAtPath<I, K>;
				};
				out: {
					[K in RouterPaths<O>]: InferInputAtPath<O, K>;
				};
			}
		: never;

export type InferApiTypes<S extends Server> = IO<S['router']> & {
	[K in keyof S['objects']]: IO<Get<S['objects'][K], 'router'>> & InferWS<S['objects'][K]>;
};

export type InferDurableApi<D extends DurableServer | DurableDoc> = DurableServerDefinition<D['router'], D['in'], D['out'], D['_TYPE']>;

export interface DocProvider {
	doc: any;
	awareness: any;
	synced: boolean;
	on(event: string, callback: () => void): void;
}

export type DocProviderConstructor<O extends Router> = {
	new (ws: WebSocketClient<any, O>, opts?: DocOptions<O>): DocProvider;
};

export type Client<S extends Server> = API<S['router']> & {
	[K in keyof S['objects']]: (id?: 'random' | (string & {})) => S['objects'][K] extends DurableServerDefinition<
		infer R,
		infer I,
		infer O,
		infer T
	>
		? API<R> &
				OmitNever<{
					connect: (options?: ConnectOptions<O>) => Promise<WebSocketClient<I, O>>;
					doc: T extends 'DURABLE_DOC'
						? (
								provider: DocProviderConstructor<O>,
								options?: DocOptions<O>,
							) => Promise<{
								doc: DocProvider['doc'];
								awareness: DocProvider['awareness'];
								client: WebSocketClient<I, O>;
							}>
						: never;
				}>
		: never;
};

export type StreamCallbacks<C = string> = {
	onStart?: () => MaybePromise<void>;
	onChunk?: (onChunk: { chunk: C; first: boolean }) => MaybePromise<void>;
	onEnd?: (chunks: C[]) => MaybePromise<void>;
};

type ApiResult<T> = Promise<[Awaited<T>, null] | [null, object]>;

export type StreamCallback<S = any> = ({ chunk, first }: { chunk: S; first: boolean }) => void;

export type WSAPI<R extends Router> = {
	[K in keyof R]: R[K] extends Handler<infer M, infer S, infer H, infer T>
		? S extends StandardSchemaV1
			? (payload: StandardSchemaV1.InferInput<S>) => Promise<ApiResult<ReturnType<H>>>
			: () => Promise<ApiResult<ReturnType<H>>>
		: R[K] extends Router
			? WSAPI<R[K]>
			: R[K];
};

export type API<R extends Router = Router> = {
	[K in keyof R]: R[K] extends Handler<infer M, infer S, infer H, infer T>
		? S extends StandardSchemaV1
			? ReturnType<H> extends Promise<ReadableStream<infer C>>
				? (payload: StandardSchemaV1.InferInput<S>, callback: StreamCallback<C>) => void
				: (payload: StandardSchemaV1.InferInput<S>) => Promise<ApiResult<ReturnType<H>>>
			: ReturnType<H> extends Promise<ReadableStream<infer C>>
				? (callback: StreamCallback<C>) => void
				: () => Promise<ApiResult<ReturnType<H>>>
		: R[K] extends Router
			? API<R[K]>
			: R[K];
};

export type RouterPaths<R extends Router, P extends string = '', S extends '.' | '/' = '.'> = {
	[K in keyof R]: R[K] extends Router
		? P extends ''
			? RouterPaths<R[K], `${string & K}`>
			: RouterPaths<R[K], `${P}${S}${string & K}`>
		: P extends ''
			? `${string & K}`
			: `${P}${S}${string & K}`;
}[keyof R];

export type Get<T, K extends string> = K extends `${infer P}.${infer Rest}`
	? P extends keyof T
		? Get<T[P], Rest>
		: never
	: K extends keyof T
		? T[K]
		: 'never';

export type InferInputAtPath<R extends Router, P extends RouterPaths<R>> =
	Get<R, P> extends Handler<any, infer S, any, any> ? (S extends StandardSchemaV1 ? StandardSchemaV1.InferInput<S> : never) : never;
export type InferSchemaOutPutAtPath<R extends Router, P extends RouterPaths<R>> =
	Get<R, P> extends Handler<any, infer S, any, any> ? (S extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<S> : never) : never;

export type InferOutPutAtPath<R extends Router, P extends RouterPaths<R>> =
	Get<R, P> extends Handler<infer M, infer S, infer H, infer T>
		? H extends HandleFunction<S, infer M, T>
			? Awaited<ReturnType<H>>
			: never
		: never;

export type GetObjectJurisdictionOrLocationHint = (event: RequestEvent) => MaybePromise<{
	jurisdiction?: DurableObjectJurisdiction;
	locationHint?: DurableObjectLocationHint;
} | void>;

export type Meta = {
	name: string | null;
	id: string | null;
	jurisdiction: DurableObjectJurisdiction | null;
	locationHint: DurableObjectLocationHint | null;
	server: string | null;
};
export type DurableMeta = Meta & Required<Pick<Meta, 'name' | 'id'>>;
type String<T extends string | {}> = T extends string ? T : never;
export type PickKeyType<Source extends unknown, TargetType> = String<
	| {
			[K in keyof Source]: Source[K] extends TargetType ? K : never;
	  }[keyof Source]
	| (string | {})
>;

export type QueuesRouter = {
	[K in PickKeyType<Env, Queue>]: Router;
};

export type QueueApi<R extends Router> = {
	[K in keyof R]: R[K] extends Handler<infer M, infer S, infer H, infer T>
		? S extends StandardSchemaV1
			? {
					sendBatch: (payload: StandardSchemaV1.InferInput<S>[], delay?: number) => Promise<void>;
					send: (payload: StandardSchemaV1.InferInput<S>, delay?: number) => Promise<void>;
				}
			: () => void
		: R[K] extends Router
			? QueueApi<R[K]>
			: R[K];
};

export type CombinedRouters<R extends Router[]> = R extends [infer First, ...infer Rest]
	? Rest extends Router[]
		? First & CombinedRouters<Rest>
		: First
	: Router;

export type DurableObjects = Record<
	string,
	{
		prototype: DurableServer | DurableDoc;
	}
>;

import { AllUnionFields, LiteralUnion } from 'type-fest';

type EventsUnion = Omit<AllUnionFields<RequestEvent | QueueRequestEvent | CronRequestEvent | DurableRequestEvent>, 'locals'>;

export type CronHandler = (event: CronRequestEvent) => void;
export type LocalsOptions = Locals | ((event: EventsUnion) => MaybePromise<Locals>);
export type ServerOptions<R extends Router = Router, O extends DurableObjects = DurableObjects> = {
	router: R;
	locals?: LocalsOptions;
	before?: ((event: RequestEvent) => MaybePromise<Response | void>)[];
	after?: ((response: Response, event: RequestEvent) => MaybePromise<Response | void>)[];
	onError?: (errorPayload: { error: unknown; event: RequestEvent }) => Response | void;
	queues?: Queues;
	cors?: false | CorsOptions | ((event: RequestEvent) => MaybePromise<CorsOptions | false | undefined>);
	getObjectJurisdictionOrLocationHint?: GetObjectJurisdictionOrLocationHint;
	objects?: O;
	static?: StaticServerOptions;
	rateLimiters?: ProcedureRateLimiters;
	crons?: Record<string, CronHandler>;
	// exclude?: BooleanRoutes<R, O>;
	// include?: BooleanRoutes<R, O>;
};

export type RoutesPathToBooleanRoutes<
	R extends Router,
	P extends string,
	BasePath extends string = '',
	Depth extends number[] = [1, 1, 1, 1, 1, 1], // just trying to avoid infinite recursion
> = Depth extends []
	? never
	: P extends `${infer START}.${infer REST}`
		? {
				[K in START]?: RoutesPathToBooleanRoutes<R, REST, BasePath extends '' ? `${K}` : `${BasePath}.${K}`, Tail<Depth>> | boolean;
			}
		: {
				[K in P]?: `${BasePath}.${K}` extends RouterPaths<R> ? boolean : unknown;
			};

type Tail<T extends any[]> = T extends [any, ...infer U] ? U : never;

export type BooleanRoutes<R extends Router, O extends DurableObjects | undefined = undefined> = Partial<
	(O extends DurableObjects
		? { [K in keyof O]: RoutesPathToBooleanRoutes<O[K]['prototype']['router'], RouterPaths<O[K]['prototype']['router']>> }
		: any) & {
		[K in SingletonPaths<R, RouterPaths<R>>]: boolean;
	} & UnionToIntersection<RoutesPathToBooleanRoutes<R, NestedPaths<R, RouterPaths<R>>>>
>;
