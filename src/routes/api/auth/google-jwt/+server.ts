import { env as envPrivate } from '$env/dynamic/private';
import { env as envPublic } from '$env/dynamic/public';
import { error } from '@sveltejs/kit';
import { OAuth2Client } from 'google-auth-library';
import { env } from 'process';
import * as jose from 'jose';
import { type User } from '$lib/types/AccountingDatabaseTypes.js';

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

	const existsInWhitelist = await accountingDatabase
		.prepare('SELECT * FROM users WHERE email = ?')
		.bind(payload.email)
		.all();

	if (existsInWhitelist.results.length === 0 && env.ADMIN_EMAIL !== payload.email) {
		return new Response(JSON.stringify({ error: 'Student ID not whitelisted' }), { status: 400 });
	}
	/* await accountingDatabase.prepare("INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)").bind(
		payload.email,
		`User requested Google OAuth login with JWT. Student ID: ${studentID}. Giving new session token.`,
		Math.floor(Date.now() / 1000)
	).run(); */
	const id = await issuingNewSessionToken(payload.email, accountingDatabase, platform?.env.SharedSecrets as SecretsStoreSecret);
	cookies.set('token', id, {
		path: '/',
		// httpOnly: true,
		sameSite: 'strict',
		// secure: true,
		maxAge: 3600
	});
	await accountingDatabase
		.prepare('INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)')
		.bind(
			payload.email,
			`User ${payload.email} logged in with Google OAuth. Student ID: ${studentID}.`,
			Math.floor(Date.now() / 1000)
		)
		.run();
	return new Response(JSON.stringify({ success: true }), { status: 200 });
}

async function issuingNewSessionToken(studentEmail: string, database: D1Database, secret: SecretsStoreSecret) {
	const studentID = studentEmail.split('@')[0];
	const stmt = await database
		.prepare('SELECT * FROM users WHERE email = ?')
		.bind(studentEmail)
		.first<User>();
	if (!stmt) {
		throw error(400, `Student ID ${studentID} not found in the database.`);
	}

	if (! await secret.get()) {
		throw error(500, 'Shared secret is not set in environment variables.');
	}

	const sessionToken = await new jose.SignJWT(
		{ role: stmt.role, name: stmt.name, nickname: stmt.nickname }
	)
		.setIssuedAt()
		.setExpirationTime('1h')
		.setSubject(studentEmail)
		.setProtectedHeader(
			{
				alg: 'HS256',
				typ: 'JWT'
			}
		)
		.sign(turnThisToUint8Array(await secret.get()));
	
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