import { validate, RequestEvent, deform, form, DurableRequestEvent, Router, getHandler, handleError, error, stringify } from '.';

export const handleRequest = async (event: DurableRequestEvent | RequestEvent, router?: Router) => {
	if (!router) {
		throw error('SERVICE_UNAVAILABLE');
	}

	const handler = getHandler(router, event.path);
	const request = event.request;
	const url = event.url;
	const method = event.request.method;

	const flarepcMode = event.request.headers.get('x-flarepc-client') as 'json' | 'form' | null;
	const isClientRequest = !!flarepcMode;
	let result: string | File | FormData | ReadableStream = JSON.stringify({
		error: {
			message: 'Not Found',
		},
	});
	let headers: Record<string, string> = { 'Content-Type': 'application/json' };

	const requestData =
		method === 'GET'
			? JSON.parse(decodeURIComponent(new URLSearchParams(url.search).get('input') || '{}'))
			: isClientRequest
				? deform((await request.formData()) as FormData)
				: await request.json();

	if (handler && 'call' in handler) {
		result = await handler.call(event as any, await validate(handler.schema, requestData));
		if (result instanceof Response) {
			return result;
		}

		if (result?.constructor.name === 'ReadableStream') {
			headers['Content-Type'] = 'text/event-stream';
		} else if (result && result instanceof File) {
			headers = {
				'Content-Type': result.type,
				'Content-Disposition': 'attachment; filename=' + result.name,
			};
		} else {
			if (isClientRequest) {
				delete headers['Content-Type'];
			}
			if (flarepcMode === 'json') {
				result = stringify(result);
			} else if (flarepcMode === 'form') {
				result = form(result);
			} else {
				result = JSON.stringify(result);
			}
		}
	}
	return new Response(result, { headers, status: 200 });
};
