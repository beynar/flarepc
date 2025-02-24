import { HandleFunction, Middleware, ReturnOfMiddlewares, ProcedureType, DynamicRequestEvent, HandlePayload } from '.';
import { StandardSchemaV1 } from './standardSchema';

export const useMiddlewares = async <M extends Middleware<T>[], T extends ProcedureType = undefined>(
	middlewares: M,
	event: DynamicRequestEvent<T>,
): Promise<ReturnOfMiddlewares<M, T>> => {
	const data = {};
	if (middlewares) {
		for (const middleware of middlewares) {
			Object.assign(data, await middleware(event));
		}
	}
	return data as ReturnOfMiddlewares<M, T>;
};

export class Procedure<M extends Middleware<T>[], T extends ProcedureType = undefined> {
	private middlewares: M;
	private target: T;

	constructor(middlewares: M, target: T) {
		this.middlewares = middlewares;
		this.target = target;
	}

	use = <NewM extends Middleware<T>[]>(...middlewares: NewM) => {
		return new Procedure(this.middlewares.concat(middlewares), this.target) as Procedure<[...M, ...NewM], T>;
	};

	handle = <H extends HandleFunction<undefined, M, T>>(handleFunction: H) => {
		return new Handler(this.middlewares, undefined, handleFunction) as Handler<M, undefined, H, T>;
	};
	input = <S extends StandardSchemaV1>(schema: S) => {
		return {
			handle: <H extends HandleFunction<S, M, T>>(handleFunction: H) => {
				return new Handler(this.middlewares, schema, handleFunction) as Handler<M, S, H, T>;
			},
		};
	};
}

export class Handler<
	M extends Middleware<T>[],
	S extends StandardSchemaV1 | undefined,
	const H extends HandleFunction<S, M, T>,
	T extends ProcedureType = undefined,
> {
	middlewares: M;
	schema: S;
	handleFunction: H;

	constructor(middlewares: M, schema: S, handleFunction: H) {
		this.middlewares = middlewares;
		this.schema = schema;
		this.handleFunction = handleFunction;
	}

	call = async (event: DynamicRequestEvent<T>, input: S extends StandardSchemaV1 ? StandardSchemaV1.InferInput<S> : undefined) => {
		return this.handleFunction({ event, input, ctx: await useMiddlewares(this.middlewares, event) } as HandlePayload<S, M, T>);
	};
}

export const procedure = <T extends ProcedureType = undefined>(type?: T) => new Procedure([], type) as Procedure<[], T>;
