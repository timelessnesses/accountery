import { env as envPrivate } from '$env/dynamic/private';
import { env as envPublic } from '$env/dynamic/public';
import { error } from '@sveltejs/kit';
import { OAuth2Client } from 'google-auth-library';
import * as jose from 'jose';
import { requireLoginUser } from '$lib/server/loginUser';
import { getInstanceStatus, isBootstrapAdministrator } from '$lib/server/instanceLifecycle';
import { resolve } from '$app/paths';
import { PRIVACY_NOTICE_VERSION } from '$lib/privacyNotice';

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

	const loginUser = await requireLoginUser(accountingDatabase, payload.email);
	const instanceStatus = await getInstanceStatus(accountingDatabase);
	const bootstrap = isBootstrapAdministrator(
		{ email: payload.email, admin: true, name: '', nickname: '' },
		platform?.env.ADMIN_EMAIL ?? envPrivate.ADMIN_EMAIL
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
		instanceStatus === 'destroying'
	);
	cookies.set('token', id, {
		path: '/',
		// httpOnly: true,
		sameSite: 'strict',
		// secure: true,
		maxAge: 3600
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

async function issuingNewSessionToken(
	studentEmail: string,
	database: D1Database,
	secret: SecretsStoreSecret,
	skipMetadataWrites = false
) {
	const stmt = await requireLoginUser(database, studentEmail);

	if (!(await secret.get())) {
		throw error(500, 'Shared secret is not set in environment variables.');
	}

	const sessionToken = await new jose.SignJWT({
		role: stmt.role,
		name: stmt.name,
		nickname: stmt.nickname
	})
		.setIssuedAt()
		.setExpirationTime('1h')
		.setSubject(studentEmail)
		.setProtectedHeader({
			alg: 'HS256',
			typ: 'JWT'
		})
		.sign(turnThisToUint8Array(await secret.get()));

	if (!skipMetadataWrites)
		await database
			.prepare('UPDATE users SET logged_in_when = ?, session_expiry = ? WHERE email = ?')
			.bind(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 3600, studentEmail)
			.run();
	return sessionToken;
}

function turnThisToUint8Array(secret: string): Uint8Array {
	const uint8Array = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
	return uint8Array;
}
