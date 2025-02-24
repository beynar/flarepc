import { error } from './error';
import {
	DurableRequestEvent,
	WebsocketInputRequestEvent,
	PickKeyType,
	ProcedureRateLimiters,
	RequestEvent,
	WebsocketRateLimiters,
	Env,
} from '.';
import { AllUnionFields } from 'type-fest';

export const rateLimit = async <L extends ProcedureRateLimiters | WebsocketRateLimiters>(
	env: Env,
	limiters: L,
	event: AllUnionFields<RequestEvent | WebsocketInputRequestEvent | DurableRequestEvent>,
) => {
	const success = await Promise.all(
		Object.entries(limiters).map(async ([key, keyExtractor]) => {
			const rateLimitKey = (
				keyExtractor as (event: AllUnionFields<RequestEvent | WebsocketInputRequestEvent | DurableRequestEvent>) => string
			)(event);
			if (!rateLimitKey) {
				return true;
			}
			const limiter = env[key as keyof Env] as RateLimit;
			if (limiter) {
				const { success } = await limiter.limit({ key: rateLimitKey });
				return success;
			}
		}),
	).then((results) => results.every((result) => !!result));
	if (!success) {
		throw error('TOO_MANY_REQUESTS');
	}
};
