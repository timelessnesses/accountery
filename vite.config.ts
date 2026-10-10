import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'child_process';
import { VitePWA } from 'vite-plugin-pwa'


const gitCommit = execSync('git rev-parse --short HEAD').toString().trim();

const buildDate = new Date().toISOString();

export default defineConfig({
	plugins: [sveltekit(), tailwindcss(), VitePWA({ registerType: 'autoUpdate' })],
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
