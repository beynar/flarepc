import { it, expect, describe, test, vi } from 'vitest';
import { api } from './fixtures/client';

describe('Public server', () => {
	test('should be able to call a procedure', async () => {
		const [result] = await api.public.test('world');

		expect(result).toEqual({
			hello: 'world',
		});
	});

	test('should be able to call a nested procedure ', async () => {
		const [result] = await api.public.nested.test('world');

		expect(result).toEqual({
			hello: 'world',
		});
	});

	test('should fail with a wrong input', async () => {
		// @ts-expect-error
		const [result, error] = await api.public.test(true);

		expect(result).toBe(null);
		if (error) {
			expect(error.status).toBe(400);
			expect(error.statusText).toBe('Bad Request');
			expect(error.message.length).toBeGreaterThan(0);
		}
	});
	test('should handle random error', async () => {
		const [result, error] = await api.public.throwError();

		expect(result).toBe(null);
		if (error) {
			expect(error.status).toBe(500);
			expect(error.statusText).toBe('Internal Server Error');
			expect(error.message).toBe('test');
		}
	});

	test('should validate complex input correctly', async () => {
		const validInput = {
			email: 'test@example.com',
			age: 25,
			preferences: ['dark mode', 'notifications'],
		};

		const [result] = await api.public.validationTest(validInput);

		expect(result).toEqual({
			valid: true,
			data: validInput,
		});
	});

	test('should fail with invalid email', async () => {
		const invalidInput = {
			email: 'not-an-email',
			age: 25,
			preferences: ['dark mode'],
		};

		const [result, error] = await api.public.validationTest(invalidInput);

		expect(result).toBe(null);
		expect(error).toBeTruthy();
		expect(error?.status).toBe(400);
	});

	test('should fail with invalid age', async () => {
		const invalidInput = {
			email: 'test@example.com',
			age: 10, // Below minimum age
			preferences: ['dark mode'],
		};

		const [result, error] = await api.public.validationTest(invalidInput);

		expect(result).toBe(null);
		expect(error).toBeTruthy();
		expect(error?.status).toBe(400);
	});

	test('should handle rate limited procedures', async () => {
		const [result] = await api.public.rateLimited();

		expect(result).toEqual({
			accessed: true,
			timestamp: expect.any(Number),
		});
	});
});

describe('Admin server', () => {
	test('should be able to call a procedure', async () => {
		const [result] = await api.admin.test('world');

		expect(result).toEqual({
			hello: 'world',
		});
	});

	test('should be able to call a nested procedure', async () => {
		const [result] = await api.admin.nested.test('world');

		expect(result).toEqual({
			hello: 'world',
		});
	});
});

describe('File input handling', () => {
	test('should handle single file upload', async () => {
		// Create a mock text file
		const fileContent = 'This is a test file content';
		const mockFile = new File([fileContent], 'test.txt', { type: 'text/plain' });

		// Use the dedicated file upload procedure
		const [result] = await api.public.fileUpload(mockFile);

		// Verify the response
		expect(result).toEqual({
			success: true,
			fileName: 'test.txt',
			type: 'text/plain',
			size: fileContent.length,
		});
	});

	test('should handle binary file upload', async () => {
		// Create a mock binary file (e.g., image)
		const binaryData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG file header
		const mockFile = new File([binaryData], 'image.png', { type: 'image/png' });

		// Use the dedicated file upload procedure
		const [result] = await api.public.fileUpload(mockFile);

		console.log({ result });

		// Verify the response
		expect(result).toEqual({
			success: true,
			fileName: 'image.png',
			type: 'image/png',
			size: 4,
		});
	});

	test('should handle multiple file uploads', async () => {
		// Create multiple mock files
		const textFile = new File(['Text content'], 'text.txt', { type: 'text/plain' });
		const jsonFile = new File([JSON.stringify({ test: true })], 'data.json', { type: 'application/json' });

		// Use the dedicated multi-file upload procedure
		const [result] = await api.public.multiFileUpload([textFile, jsonFile]);
		console.dir({ result }, { depth: null });
		// Verify the response
		expect(result).toEqual({
			success: true,
			files: [
				{ name: 'text.txt', type: 'text/plain', size: 12 },
				{ name: 'data.json', type: 'application/json', size: 13 },
			],
		});
	});

	test('should reject files that are too large', async () => {
		// Create a mock file that's too large
		const largeContent = 'x'.repeat(10 * 1024 * 1024); // 10MB content
		const largeFile = new File([largeContent], 'large.txt', { type: 'text/plain' });

		// Use the large file upload procedure that checks file size
		const [result, error] = await api.public.largeFileUpload(largeFile);

		// Verify the error response
		expect(result).toBe(null);
		expect(error).toBeTruthy();
		expect(error?.status).toBe(500); // Internal Server Error from throw
		expect(error?.statusText).toBe('Internal Server Error');

		// Parse the error message which contains JSON
		const errorData = JSON.parse(error?.message);
		expect(errorData).toEqual({
			error: 'File too large',
			maxSize: '5MB',
		});
	});
});
