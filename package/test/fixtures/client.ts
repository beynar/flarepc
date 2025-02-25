import { it, expect } from 'vitest';
import worker, { Servers } from './worker';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { createClient } from '../../src/lib/client';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

export const api = {
	get public() {
		return createClient<Servers, 'public'>({
			endpoint: 'https://example.com',
			server: 'public',
			headers: {
				session: 'test',
			},
			includeCredentials: false,
			fetch: async (_endpoint: any, body: any) => {
				const request = new IncomingRequest(_endpoint, body);
				const ctx = createExecutionContext();
				await waitOnExecutionContext(ctx);
				return worker.fetch(request as any, env as any, ctx);
			},
		});
	},

	get admin() {
		return createClient<Servers, 'admin'>({
			endpoint: 'https://example.com',
			server: 'admin',
			headers: {
				session: 'test',
			},
			includeCredentials: false,
			fetch: async (_endpoint: any, body: any) => {
				const request = new IncomingRequest(_endpoint, body);
				const ctx = createExecutionContext();
				await waitOnExecutionContext(ctx);
				return worker.fetch(request as any, env as any, ctx);
			},
		});
	},
};
