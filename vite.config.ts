import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'child_process';

const gitCommit = execSync('git rev-parse --short HEAD')
  .toString()
  .trim();

const buildDate = new Date().toISOString();

export default defineConfig({
	plugins: [sveltekit(), tailwindcss()],
	define: {
		__GIT_COMMIT: JSON.stringify(gitCommit),
		__BUILD_DATE: JSON.stringify(buildDate)
	}
});