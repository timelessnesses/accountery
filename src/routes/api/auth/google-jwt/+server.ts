import { env as envPrivate } from '$env/dynamic/private';
import { env as envPublic } from '$env/dynamic/public';
import { linkedUserAccountWithInfo } from '$lib/whitelisted';
import { error } from '@sveltejs/kit';
import { OAuth2Client } from 'google-auth-library';

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
	if (!Object.keys(linkedUserAccountWithInfo).find((key) => key === studentID)) {
		return new Response(JSON.stringify({ error: 'Student ID not whitelisted' }), { status: 400 });
	}
	/* await accountingDatabase.prepare("INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)").bind(
		payload.email,
		`User requested Google OAuth login with JWT. Student ID: ${studentID}. Giving new session token.`,
		Math.floor(Date.now() / 1000)
	).run(); */
	const id = await issuingNewSessionToken(payload.email, accountingDatabase);
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

async function issuingNewSessionToken(studentEmail: string, database: D1Database) {
	const studentID = studentEmail.split('@')[0];
	const sessionToken = randomString();
	// 1 hour
	const sessionTokenExpiry = Math.floor(Date.now() / 1000) + 3600;
	const studentInfo =
		linkedUserAccountWithInfo[parseInt(studentID) as keyof typeof linkedUserAccountWithInfo];
	const studentName = studentInfo.name;
	const studentNickname = studentInfo.nickname;
	const stmt = await database
		.prepare('SELECT * FROM users WHERE email = ?')
		.bind(studentEmail)
		.first();
	if (!stmt) {
		await database
			.prepare('INSERT INTO users (name, email, nickname) VALUES (?, ?, ?)')
			.bind(studentName, studentEmail, studentNickname)
			.run();
	}
	await database
		.prepare('UPDATE users SET session_token = ?, session_expiry = ? WHERE email = ?')
		.bind(sessionToken, sessionTokenExpiry, studentEmail)
		.run();
	return sessionToken;
}

function randomString() {
	return crypto.randomUUID();
}
