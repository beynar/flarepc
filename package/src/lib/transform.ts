import { stringify as dStringify, parse as dParse } from 'devalue';

const url = {
	stringify: (value: any) => {
		if (value instanceof URL) {
			return value.toString();
		}
	},
	parse: (value: any) => {
		return new URL(value);
	},
};

export const stringify = (value: unknown) => {
	return dStringify(value, {
		URL: url.stringify,
	});
};

export const parse = (value: string) => {
	return dParse(value, {
		URL: url.parse,
	});
};

export const form = (value: unknown, formData: FormData = new FormData()) => {
	const stringified = dStringify(value, {
		File: (value: any) => {
			if (value instanceof File) {
				formData.append(value.name, value);
				return value.name;
			}
		},
		Blob: (value: any) => {
			if (value instanceof Blob) {
				const id = crypto.randomUUID();
				const file = new File([value], id, { type: value.type });
				formData.append(id, file);
				return id;
			}
		},
		ArrayBuffer: (value: any) => {
			if (value instanceof ArrayBuffer) {
				const id = crypto.randomUUID();
				const file = new File([value], id, { type: 'application/octet-stream' });
				formData.append(id, file);
				return id;
			}
		},
		URL: url.stringify,
	});
	formData.append('value', stringified);
	return formData;
};

export const deform = (formData: FormData) => {
	const stringified = formData.get('value') as string;
	const value = dParse(stringified, {
		File: (value: any) => {
			return formData.get(value) as File;
		},
		Blob: (value: any) => {
			const file = formData.get(value) as File;
			return new Blob([file], { type: file.type });
		},
		ArrayBuffer: (value: any) => {
			const file = formData.get(value) as File;
			return file.arrayBuffer();
		},
		URL: url.parse,
	});
	return value;
};
