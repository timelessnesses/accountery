import { env as envPrivate } from '$env/dynamic/private';
import { env as envPublic } from '$env/dynamic/public';
import { error } from '@sveltejs/kit';
import { OAuth2Client } from 'google-auth-library';
import { requireLoginUser } from '$lib/server/loginUser';
import { getInstanceStatus, isBootstrapAdministrator } from '$lib/server/instanceLifecycle';
import { resolve } from '$app/paths';
import { PRIVACY_NOTICE_VERSION } from '$lib/privacyNotice';
import {
	ACCOUNTERY_EXPIRE_JWT_TIME,
	ACCOUNTERY_EXPIRE_REFRESH_TOKEN_TIME
} from '$lib/constants.js';
import { issuingNewSessionToken } from '$lib/stuff.js';

export type GoogleJwtRequest = {
	id_token: string;
};

const client = new OAuth2Client({
	client_id: envPublic.PUBLIC_GOOGLE_OAUTH_CLIENT_ID,
	client_secret: envPrivate.GOOGLE_OAUTH_CLIENT_SECRET
});

export async function POST({ request, cookies, platform }) {
	if (!envPublic.PUBLIC_GOOGLE_OAUTH_CLIENT_ID || !envPrivate.GOOGLE_OAUTH_CLIENT_SECRET) {
		throw error(400, 'Google OAuth client ID or secret is not set in environment variables.');
	}
	const accountingDatabase = platform?.env.AccountingDatabase as D1Database;
	const { id_token } = (await request.json()) as GoogleJwtRequest;

	const ticket = await client.verifyIdToken({
		idToken: id_token,
		audience: envPublic.PUBLIC_GOOGLE_OAUTH_CLIENT_ID
	});

	const payload = ticket.getPayload();
	if (!payload) {
		return new Response(JSON.stringify({ error: 'Invalid ID token' }), { status: 400 });
	}
	if (!payload.email?.endsWith('@tsu.ac.th')) {
		return new Response(JSON.stringify({ error: 'Invalid email' }), { status: 400 });
	}
	if (!payload.email_verified) {
		return new Response(JSON.stringify({ error: 'Email not verified' }), { status: 400 });
	}

	const studentID = payload.email.split('@')[0];
	const adminEmail = platform?.env.ADMIN_EMAIL ?? envPrivate.ADMIN_EMAIL;

	const loginUser = await requireLoginUser(accountingDatabase, payload.email, adminEmail);
	const instanceStatus = await getInstanceStatus(accountingDatabase);
	const bootstrap = isBootstrapAdministrator(
		{ email: payload.email, admin: true, name: '', nickname: '' },
		adminEmail
	);
	if (instanceStatus === 'destroying' && !bootstrap)
		error(503, 'This instance is being destroyed.');
	if (instanceStatus === 'closing' && loginUser.role !== 'admin' && !bootstrap)
		error(
			403,
			'This instance is closed to members. Only administrators can review retained records.'
		);
	/* await accountingDatabase.prepare("INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)").bind(
		payload.email,
		`User requested Google OAuth login with JWT. Student ID: ${studentID}. Giving new session token.`,
		Math.floor(Date.now() / 1000)
	).run(); */
	const id = await issuingNewSessionToken(
		payload.email,
		accountingDatabase,
		platform?.env.SharedSecrets as SecretsStoreSecret,
		adminEmail,
		instanceStatus === 'destroying'
	);
	const random_id = crypto.getRandomValues(new Uint8Array(32));
	const base64ized = btoa(String.fromCharCode(...random_id));
	const refresh_token = await crypto.subtle.digest('SHA-256', random_id).then((hash) => {
		return btoa(String.fromCharCode(...new Uint8Array(hash)));
	});
	await accountingDatabase
		.prepare('UPDATE users SET refresh_token = ?, refresh_when = ? WHERE email = ?')
		.bind(refresh_token, Math.floor(Date.now() / 1000), payload.email)
		.run();
	cookies.set('token', id, {
		path: '/',
		// httpOnly: true,
		sameSite: 'strict',
		// secure: true,
		maxAge: ACCOUNTERY_EXPIRE_JWT_TIME
	});
	cookies.set('refresh_token', base64ized, {
		path: '/',
		// httpOnly: true,
		sameSite: 'strict',
		// secure: true,
		maxAge: ACCOUNTERY_EXPIRE_REFRESH_TOKEN_TIME
	});
	if (instanceStatus !== 'destroying')
		await accountingDatabase
			.prepare('INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)')
			.bind(
				payload.email,
				`User ${payload.email} logged in with Google OAuth. Student ID: ${studentID}.`,
				Math.floor(Date.now() / 1000)
			)
			.run();
	const privacyNoticeRequired =
		instanceStatus === 'active' && loginUser.privacy_policy_read_version < PRIVACY_NOTICE_VERSION;
	return new Response(
		JSON.stringify({
			success: true,
			privacyNoticeRequired,
			redirectTo: privacyNoticeRequired
				? resolve('/privacy-notice')
				: instanceStatus === 'destroying'
					? resolve('/admin/instance')
					: instanceStatus === 'closing'
						? resolve('/admin')
						: resolve('/')
		}),
		{ status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
	);
}
