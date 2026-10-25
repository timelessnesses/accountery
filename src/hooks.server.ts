import { base, resolve } from '$app/paths';
import { building } from '$app/environment';
import { verifyJWT } from '$lib/auth';
import { json, redirect, type Handle } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { getInstanceLifecycle, isBootstrapAdministrator } from '$lib/server/instanceLifecycle';
import { PRIVACY_NOTICE_VERSION, safeNoticeReturnTo } from '$lib/privacyNotice';

const publicRoutes = ['/login', '/login/__data.json', '/api/auth/google-jwt', '/api/auth/logout'];
export const handle: Handle = async ({ event, resolve: resolveRequest }) => {
	const path = event.url.pathname.slice(base.length);
	// The public privacy policy is also rendered during prerendering, where
	// no database or session is available. Do not exempt /privacy-notice here.
	if (
		['/privacy', '/privacy/', '/privacy/__data.json'].includes(path) &&
		['GET', 'HEAD'].includes(event.request.method)
	) {
		return resolveRequest(event);
	}
	// Let SvelteKit skip dynamic routes discovered while crawling the public
	// document, rather than attempting session/database access during the build.
	if (building) return resolveRequest(event);
	const env = event.platform?.env as Env;
	const lifecycle = await getInstanceLifecycle(env.AccountingDatabase);
	if (lifecycle.status === 'destroyed')
		return new Response(
			'This instance has been destroyed. Application records and receipt files have been deleted.',
			{
				status: 410,
				headers: { 'Cache-Control': 'no-store' }
			}
		);
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
	const bootstrap = isBootstrapAdministrator(
		event.locals.user,
		env.ADMIN_EMAIL ?? privateEnv.ADMIN_EMAIL
	);
	const authenticationPath =
		path === '/login' ||
		path === '/login/__data.json' ||
		path === '/api/auth/google-jwt' ||
		path === '/api/auth/logout';
	if (
		lifecycle.status === 'destroying' &&
		!authenticationPath &&
		!(bootstrap && (path === '/admin/instance' || path === '/admin/instance/__data.json'))
	)
		return new Response('This instance is being destroyed. Only the owner can resume cleanup.', {
			status: 503,
			headers: { 'Cache-Control': 'no-store' }
		});
	if (lifecycle.status === 'closing' && !authenticationPath) {
		if (!event.locals.user?.admin)
			return new Response(
				'This instance has closed. Records are retained for administrator review until scheduled deletion.',
				{ status: 503, headers: { 'Cache-Control': 'no-store' } }
			);
		if (!['GET', 'HEAD'].includes(event.request.method))
			return new Response(
				'This instance is closed. Administrator access is read-only during the 90-day retention period.',
				{ status: 403, headers: { 'Cache-Control': 'no-store' } }
			);
	}
	const isCalendarFeed =
		/^\/api\/calendar\/[a-f0-9]{64}$/.test(path) &&
		(event.request.method === 'GET' || event.request.method === 'HEAD');
	const isPublicBalances =
		(path === '/obligations-owed' || path === '/obligations-owed/__data.json') &&
		(event.request.method === 'GET' || event.request.method === 'HEAD');
	const isPublic = isCalendarFeed || isPublicBalances || publicRoutes.includes(path);
	if (!isPublic && !event.locals.user) {
		return redirect(302, resolve('/login'));
	}
	const isNotice = ['/privacy-notice', '/privacy-notice/', '/privacy-notice/__data.json'].includes(
		path
	);
	const isPushSettings = path === '/api/notifications';
	if (
		event.locals.user &&
		lifecycle.status === 'active' &&
		!isPublic &&
		!isNotice &&
		!isPushSettings
	) {
		const version =
			event.locals.user.privacyPolicyReadVersion ??
			(
				await env.AccountingDatabase.prepare(
					'SELECT privacy_policy_read_version FROM users WHERE email = ?'
				)
					.bind(event.locals.user.email)
					.first<{ privacy_policy_read_version: number }>()
			)?.privacy_policy_read_version ??
			0;
		if (version < PRIVACY_NOTICE_VERSION) {
			const target = new URL(event.url);
			target.searchParams.delete('x-sveltekit-invalidated');
			const next = safeNoticeReturnTo(
				target.pathname.replace(/\/__data\.json$/, '') + target.search
			);
			const noticeUrl = resolve('/privacy-notice') + '?next=' + encodeURIComponent(next);
			if (path.startsWith('/api/') || !['GET', 'HEAD'].includes(event.request.method))
				return json(
					{
						code: 'privacy_notice_required',
						message: 'Read and acknowledge the privacy notice before continuing.',
						noticeUrl
					},
					{ status: 403, headers: { 'Cache-Control': 'no-store' } }
				);
			redirect(303, noticeUrl);
		}
	}
	return resolveRequest(event);
};
