import { error } from '.';
import { StandardSchemaV1 } from './standardSchema';

export const validate = async <S extends StandardSchemaV1 | undefined>(schema: S, input: any) => {
	if (schema === undefined) {
		return undefined;
	} else {
		let result = schema['~standard'].validate(input);
		if (result instanceof Promise) result = await result;

		if (result.issues) {
			throw error('BAD_REQUEST', JSON.stringify(result.issues, null, 2));
		}
		return result.value;
	}
};
