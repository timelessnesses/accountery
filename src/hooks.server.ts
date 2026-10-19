import { base, resolve } from '$app/paths';
import { verifyJWT } from '$lib/auth';
import { redirect, type Handle } from '@sveltejs/kit';

const publicRoutes = ['/login', '/api/auth/google-jwt', '/api/auth/logout'];

export const handle: Handle = async ({ event, resolve: resolveRequest }) => {
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
			}
		}
	}
	const path = event.url.pathname.slice(base.length);
	const isCalendarFeed =
		/^\/api\/calendar\/[a-f0-9]{64}$/.test(path) &&
		(event.request.method === 'GET' || event.request.method === 'HEAD');
	const isPublicBalances =
		(path === '/obligations-owed' || path === '/obligations-owed/__data.json') &&
		(event.request.method === 'GET' || event.request.method === 'HEAD');
	const isPublic =
		isCalendarFeed || isPublicBalances || publicRoutes.some((r) => path.startsWith(r));
	if (!isPublic && !event.locals.user) {
		return redirect(302, resolve('/login'));
	}
	return resolveRequest(event);
};
