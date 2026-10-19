import adapter from '@joshthomas/sveltekit-adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = { kit: { adapter: adapter() } };

export default config;
