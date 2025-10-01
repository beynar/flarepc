import { Env, RequestEvent, error } from '.';
import { lookup } from 'mrmime';
import type { Request as CFRequest } from '@cloudflare/workers-types';

export type CacheControl = {
	browserTTL: number | null;
	edgeTTL: number;
	bypassCache: boolean;
};

export type StaticServerOptions = {
	cacheControl: ((req: CFRequest) => Partial<CacheControl>) | Partial<CacheControl>;
	defaultETag: 'strong' | 'weak';
	cacheBucket: 'DEFAULT' | (string & {});
};

const defaultCacheControl = {
	browserTTL: null,
	edgeTTL: 2 * 60 * 60 * 24, // 2 days
	bypassCache: false, // do not bypass Cloudflare's cache
};
const staticHandlerDefaultOptions = {
	cacheControl: defaultCacheControl,
	cacheBucket: 'DEFAULT',
	defaultETag: 'strong',
} satisfies StaticServerOptions;

type IsoExecutionContext = ExecutionContext | DurableObjectState;

type KVGetType = 'text' | 'arrayBuffer' | 'json' | 'stream' | 'file' | 'blob';
type ReturnTypeOfKV<T extends KVGetType> =
	| (T extends 'text'
			? string
			: T extends 'arrayBuffer'
			? ArrayBuffer
			: T extends 'file'
			? File
			: T extends 'blob'
			? Blob
			: T extends 'json'
			? unknown
			: T extends 'stream'
			? ReadableStream
			: never)
	| null;

const formatETag = (
	entityId: string,
	validatorType: string = 'strong'
	// entityId: string = pathKey,
	// validatorType: string = options.defaultETag
) => {
	if (!entityId) {
		return '';
	}
	switch (validatorType) {
		case 'weak':
			if (!entityId.startsWith('W/')) {
				if (entityId.startsWith(`"`) && entityId.endsWith(`"`)) {
					return `W/${entityId}`;
				}
				return `W/"${entityId}"`;
			}
			return entityId;
		case 'strong':
			if (entityId.startsWith(`W/"`)) {
				entityId = entityId.replace('W/', '');
			}
			if (!entityId.endsWith(`"`)) {
				entityId = `"${entityId}"`;
			}
			return entityId;
		default:
			return '';
	}
};

export class StaticHandler {
	private dev: boolean | undefined = undefined;
	private kv?: KVNamespace;
	private ctx: IsoExecutionContext;
	private manifestPromise: Promise<unknown> | null;
	private options: StaticServerOptions = staticHandlerDefaultOptions;
	manifest?: Record<string, string>;

	private getManifest = async () => {
		if (!this.manifest) {
			await this.manifestPromise;
			if (!this.manifest) {
				throw error(
					'BAD_REQUEST',
					`Static Handler not initialized. add\n[site]\nbucket="./public"\nto your wrangler.toml and put some files in ./public directory`
				);
			}
		}
		return this.manifest as Record<string, string>;
	};

	serve = async (request: CFRequest, key: string): Promise<Response | void> => {
		const url = new URL(request.url);
		const manifest = await this.getManifest();

		let mimeType = lookup(key) || 'application/octet-stream';
		if (mimeType?.startsWith('text') || mimeType === 'application/javascript') {
			mimeType += '; charset=utf-8';
		}

		const pathKey = manifest[key];
		const cache = this.options.cacheBucket === 'DEFAULT' ? caches.default : await caches.open(this.options.cacheBucket);
		const cacheKey = new Request(`${url.origin}/${pathKey}`, request as Request);

		if (!pathKey) {
			throw error('NOT_FOUND');
		}
		let shouldEdgeCache = true;
		const cacheControl = Object.assign(
			{},
			defaultCacheControl,
			typeof this.options.cacheControl === 'function' ? this.options.cacheControl(request) : this.options.cacheControl
		);

		if (cacheControl.bypassCache || cacheControl.edgeTTL === null || request.method == 'HEAD') {
			shouldEdgeCache = false;
		}

		const shouldSetBrowserCache = typeof cacheControl.browserTTL === 'number';

		let response = null;
		if (shouldEdgeCache) {
			response = await cache.match(cacheKey);
		}

		// COPY PASTE FROM : https://github.com/cloudflare/workers-sdk/blob/main/packages/kv-asset-handler/src/index.ts
		if (response) {
			if (response.status > 300 && response.status < 400) {
				if (response.body && 'cancel' in Object.getPrototypeOf(response.body)) {
					// Body exists and environment supports readable streams
					response.body.cancel();
				} else {
					// Environment doesnt support readable streams, or null repsonse body. Nothing to do
				}
				response = new Response(null, response);
			} else {
				// fixes #165
				const opts = {
					headers: new Headers(response.headers),
					status: 0,
					statusText: '',
				};

				opts.headers.set('cf-cache-status', 'HIT');

				if (response.status) {
					opts.status = response.status;
					opts.statusText = response.statusText;
				} else if (opts.headers.has('Content-Range')) {
					opts.status = 206;
					opts.statusText = 'Partial Content';
				} else {
					opts.status = 200;
					opts.statusText = 'OK';
				}
				response = new Response(response.body, opts);
			}
		} else {
			const body = await this.kv!.get(pathKey, 'arrayBuffer');

			if (body === null) {
				throw error('NOT_FOUND');
			}
			response = new Response(body);

			if (shouldEdgeCache) {
				response.headers.set('Accept-Ranges', 'bytes');
				response.headers.set('Content-Length', String(body.byteLength));
				// set etag before cache insertion
				if (!response.headers.has('etag')) {
					response.headers.set('etag', formatETag(pathKey));
				}
				// determine Cloudflare cache behavior
				response.headers.set('Cache-Control', `max-age=${cacheControl.edgeTTL}`);
				this.ctx.waitUntil(cache.put(cacheKey, response.clone()));
				response.headers.set('CF-Cache-Status', 'MISS');
			}
		}
		response.headers.set('Content-Type', mimeType);

		if (response.status === 304) {
			const etag = formatETag(response.headers.get('etag') || '');
			const ifNoneMatch = cacheKey.headers.get('if-none-match');
			const proxyCacheStatus = response.headers.get('CF-Cache-Status');
			if (etag) {
				if (ifNoneMatch && ifNoneMatch === etag && proxyCacheStatus === 'MISS') {
					response.headers.set('CF-Cache-Status', 'EXPIRED');
				} else {
					response.headers.set('CF-Cache-Status', 'REVALIDATED');
				}
				response.headers.set('etag', formatETag(etag, 'weak'));
			}
		}
		if (shouldSetBrowserCache) {
			response.headers.set('Cache-Control', `max-age=${cacheControl.browserTTL}`);
		} else {
			response.headers.delete('Cache-Control');
		}
		return response;
	};

	get = async <T extends KVGetType>(key: string, type: T): Promise<ReturnTypeOfKV<T>> => {
		const manifest = await this.getManifest();

		try {
			const path = manifest[key];

			if (!path) {
				throw error('NOT_FOUND');
			}

			const asset = await this.kv!.get(path, {
				type: (type === 'file' || type === 'blob' ? 'arrayBuffer' : type) as any,
			});
			if (!asset) {
				return null;
			}
			if (!!asset && (asset as any) instanceof ArrayBuffer && (type === 'file' || type === 'blob')) {
				const blob = new Blob([asset], { type: lookup(key) });
				if (type === 'blob') {
					return blob as ReturnTypeOfKV<T>;
				}
				const file = new File([blob], key, {
					type: blob.type,
				});
				return file as ReturnTypeOfKV<T>;
			}
			return (asset || null) as ReturnTypeOfKV<T>;
		} catch (error) {
			return null;
		}
	};
	constructor(env: Env, ctx: IsoExecutionContext, options?: StaticServerOptions) {
		this.kv = (env as { __STATIC_CONTENT?: KVNamespace })['__STATIC_CONTENT'];
		this.ctx = ctx;
		try {
			// @ts-ignore
			this.manifestPromise = import('__STATIC_CONTENT_MANIFEST').then((manifest) => {
				this.manifest = JSON.parse(manifest.default);

				this.manifestPromise = null;
			});
		} catch (error) {
			this.manifestPromise = null;
			this.manifestPromise = null;
		}
	}
}

export const createStaticServer =
	(options?: StaticServerOptions) =>
	(event: RequestEvent): Promise<Response | void> | void => {
		if (event.path[0] === 'static') {
			const handler = new StaticHandler(event.env, event.ctx, options);
			return handler.serve(event.request, event.path.at(-1)!);
		}
	};
