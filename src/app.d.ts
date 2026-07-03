// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	const __GIT_COMMIT: string;
	const __BUILD_DATE: string;

	namespace App {
		interface Platform {
			env: Env;
			cf: CfProperties;
			ctx: ExecutionContext;
		}

		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		// interface Error {}
		interface Locals {
			user?: {
				email: string;
				name: string;
				nickname: string;
				admin: boolean;
			};
			google_oauth_client_id: string;
		}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
