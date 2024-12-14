export const tryParse = <C>(data: unknown) => {
	try {
		return (typeof data !== 'string' ? data : JSON.parse(data)) as C;
	} catch (e) {
		return data as C;
	}
};

export const inputToSearchParams = (input: unknown) => {
	return `input=${encodeURIComponent(JSON.stringify(input))}`;
};

export const searchParamsToInput = (searchParams: URLSearchParams) => {
	return JSON.parse(decodeURIComponent(searchParams.get('input') || '{}'));
};

export const WS_RESPONSE_TYPE = '#__WS_RESPONSE_TYPE_#';
