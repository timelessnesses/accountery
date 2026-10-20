import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'child_process';

const gitCommit = execSync('git rev-parse --short HEAD').toString().trim();

const buildDate = new Date().toISOString();

export default defineConfig({
	// SvelteKit builds and registers src/service-worker.ts. A second generated worker
	// would replace the push and notificationclick handlers at the same scope.
	plugins: [sveltekit(), tailwindcss()],
	define: {
		__GIT_COMMIT: JSON.stringify(gitCommit),
		__BUILD_DATE: JSON.stringify(buildDate)
	},
	build: {
		sourcemap: true,
		rolldownOptions: {
			experimental: {
				nativeMagicString: true
			}
		}
	}
});
