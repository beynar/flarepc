// Shamelessly copied and slightly adapted from https://github.com/kwhitley/itty-router
import { MaybePromise, RequestEvent } from '.';
import type { Request } from '@cloudflare/workers-types';

export type CorsOptions = {
	credentials?: true;
	origin?: boolean | string | string[] | RegExp | ((origin: string) => string | void);
	maxAge?: number;
	allowMethods?: string | string[];
	allowHeaders?: any;
	exposeHeaders?: string | string[];
};

export type Preflight = (event: RequestEvent) => MaybePromise<Response | void>;
export type Corsify = (response: Response, event: RequestEvent) => Response | void;

export type CorsPair = {
	preflight: Preflight;
	corsify: Corsify;
};

export const cors = (options: CorsOptions = {}) => {
	// Destructure and set defaults for options.
	let { origin = '*', credentials = true, allowMethods = '*', allowHeaders, exposeHeaders, maxAge = 3600 } = options;

	if (allowHeaders && (allowHeaders[0] || allowHeaders) !== '*') {
		allowHeaders.concat(['x-flarepc-client']);
	}

	const getAccessControlOrigin = (request?: Request): string => {
		const requestOrigin = request?.headers?.get('origin'); // may be null if no request passed
		// @ts-expect-error
		if (origin === true) return requestOrigin;
		// @ts-expect-error
		if (origin instanceof RegExp) return origin.test(requestOrigin) ? requestOrigin : undefined;
		// @ts-expect-error
		if (Array.isArray(origin)) return origin.includes(requestOrigin) ? requestOrigin : undefined;
		// @ts-expect-error
		if (origin instanceof Function) return origin(requestOrigin);

		// @ts-expect-error
		return origin == '*' && credentials ? requestOrigin : origin;
	};

	const appendHeadersAndReturn = (response: Response, headers: Record<string, any>): Response => {
		for (const [key, value] of Object.entries(headers)) {
			if (value) response.headers.append(key, value);
		}
		return response;
	};

	const preflight = ({ request }: RequestEvent) => {
		if (request.method == 'OPTIONS') {
			const response = new Response(null, { status: 204 });

			const r = appendHeadersAndReturn(response, {
				'access-control-allow-origin': getAccessControlOrigin(request),
				// @ts-ignore
				'access-control-allow-methods': allowMethods?.join?.(',') ?? allowMethods, // include allowed methods
				// @ts-ignore
				'access-control-expose-headers': exposeHeaders?.join?.(',') ?? exposeHeaders, // include allowed headers
				'access-control-allow-headers': allowHeaders?.join?.(',') ?? allowHeaders ?? request.headers.get('access-control-request-headers'), // include allowed headers
				'access-control-max-age': maxAge,
				'access-control-allow-credentials': credentials,
			});

			return r;
		} // otherwise ignore
	};

	const corsify = (response: Response, event: RequestEvent) => {
		// ignore if already has CORS headers
		if (response?.headers?.get('access-control-allow-origin') || response.status == 101) return response;

		return appendHeadersAndReturn(response.clone(), {
			'access-control-allow-origin': getAccessControlOrigin(event.request),
			'access-control-allow-credentials': credentials,
		});
	};

	// Return corsify and preflight methods.
	return { corsify, preflight };
};
