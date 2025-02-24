import { DurableObject } from 'cloudflare:workers';
import { DurableRequestEvent, RequestEvent } from './requestEvent';
import { MaybePromise, Meta, Session } from './types';
import { DurableServer } from './durable';

// This is a work in progress plugin system for durable objects. will document later.
export type Plugin = {
	procedures: Record<string, (this: DurableServer, event: RequestEvent) => MaybePromise<void>>;
	blockConcurrencyWhile?: () => MaybePromise<void>;
	onWebSocketOpen?: (this: DurableServer, ws: WebSocket, session: Session) => void;
	onWebSocketClose?: (this: DurableServer, ws: WebSocket, session: Session) => void;
	onWebSocketMessage?: (this: DurableServer, ws: WebSocket, message: string | ArrayBuffer) => void;
	onWebSocketError?: (this: DurableServer, ws: WebSocket, error: unknown) => void;
	onFetch?: (this: DurableServer, meta: Meta) => MaybePromise<Response>;
	beforeFetch?: (this: DurableServer, meta: Meta) => MaybePromise<void>;
	afterFetch?: (this: DurableServer, meta: Meta, response: Response) => MaybePromise<void>;
};

type PluginDefinition = {
	procedures: Record<string, (event: RequestEvent) => Promise<void>>;
};

type DurableOptions<T extends Record<string, PluginDefinition>> = {
	plugins: T;
};

type ExposedPlugin<T extends Record<string, PluginDefinition>> = {
	[K in keyof T]: T[K]['procedures'];
};

class DurableServerWithPlugins<T extends Record<string, PluginDefinition>> extends DurableObject {
	constructor(
		public ctx: DurableObjectState,
		public env: Env,
	) {
		super(ctx, env);
	}
}

export const createDurableServerWithPlugins = <T extends Record<string, PluginDefinition>>(opts?: DurableOptions<T>) => {
	class _DurableServerWithPlugins extends DurableServerWithPlugins<T> {
		_TYPE = 'DURABLE_SERVER' as const;
		opts = opts;
		plugins?: T;
		exposed?: ExposedPlugin<T>;

		constructor(ctx: DurableObjectState, env: Env) {
			super(ctx, env);
			this.plugins = opts?.plugins;
			this.exposed = Object.entries(opts?.plugins || {}).reduce((acc, [key, plugin]) => {
				(acc as any)[key] = plugin.procedures;
				return acc;
			}, {} as ExposedPlugin<T>);
		}
	}
	return _DurableServerWithPlugins;
};

class Test extends createDurableServerWithPlugins({
	plugins: {
		memory: {
			procedures: {
				coucou: async () => {
					//
				},
			},
		},
		yjs: {
			procedures: {
				getDoc: async () => {
					//
				},
			},
		},
	},
}) {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.exposed?.memory.coucou();
	}
}
