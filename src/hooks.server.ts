import { verifyJWT } from '$lib/auth';
import { redirect, type Handle } from '@sveltejs/kit';

const publicRoutes = ['/login', '/api/auth/google-jwt', '/api/auth/logout'];

export const handle: Handle = async ({ event, resolve }) => {
	const env = event.platform?.env as Env;
	const token = event.cookies.get('token');
	if (token) {
		if (env.AUTHENTICATION_METHOD === 'JWT') { 
			try {
				const user = await verifyJWT(token, env);
				if (user) {
					event.locals.user = user;
				}
			} catch (error) {
				console.error('Error verifying session token:', error);
				event.locals.user = undefined;
				event.cookies.set('token', '', { path: '/', expires: new Date(0) });
				/* return redirect(302, "/login"); */
			}
		}
	}
	const path = event.url.pathname;
	const isPublic = publicRoutes.some((r) => path.startsWith(r));
	if (!isPublic && !event.locals.user) {
		return redirect(302, '/login');
	}
	return resolve(event);
};
