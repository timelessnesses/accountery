import { verifySessionToken } from '$lib/auth';
import { redirect, type Handle } from '@sveltejs/kit';

const publicRoutes = ['/login', '/api/auth/google-jwt', '/api/auth/logout'];

export const handle: Handle = async ({ event, resolve }) => {
	const env = event.platform?.env as Env;
	const token = event.cookies.get('token');
	if (token) {
		try {
			const user = await verifySessionToken(token, env);
			console.log('User verified:', user.email, 'Admin:', user.admin);
			if (user) {
				console.log('Setting user:', user.email);
				event.locals.user = user;
			}
		} catch (error) {
			console.error('Error verifying session token:', error);
			event.locals.user = undefined;
			event.cookies.set('token', '', { path: '/', expires: new Date(0) });
			/* return redirect(302, "/login"); */
		}
	}
	const path = event.url.pathname;
	const isPublic = publicRoutes.some((r) => path.startsWith(r));
	console.log('Checking if user is logged in:', event.locals.user, 'Public route:', isPublic);
	if (!isPublic && !event.locals.user) {
		console.log('Redirecting to login');
		return redirect(302, '/login');
	}
	console.log('Resolving event');
	return resolve(event);
};
