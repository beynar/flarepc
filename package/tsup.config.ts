import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/lib/index.ts', 'src/lib/client.ts', 'src/lib/yjs/index.ts', 'src/lib/yjs/client.ts'],
	splitting: true,
	skipNodeModulesBundle: true,
	dts: true,
	bundle: true,
	minifyIdentifiers: true,
	minifySyntax: true,
	minifyWhitespace: true,
	platform: 'node',
	external: ['cloudflare:workers', '__STATIC_CONTENT_MANIFEST'],
	keepNames: true,
	minify: true,
	sourcemap: true,
	format: ['cjs', 'esm'],
	treeshake: true,
	clean: true,
});
