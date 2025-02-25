import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		include: ['**/*.test.ts'],
		poolOptions: {
			workers: {
				wrangler: { configPath: './test/fixtures/wrangler.toml' },
			},
		},
	},
});
