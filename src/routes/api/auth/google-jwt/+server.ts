import { GOOGLE_OAUTH_CLIENT_SECRET } from '$env/static/private';
import { PUBLIC_GOOGLE_OAUTH_CLIENT_ID } from '$env/static/public';
import { linkedUserAccountWithInfo } from '$lib/whitelisted';
import { OAuth2Client } from 'google-auth-library';

export type GoogleJwtRequest = {
	id_token: string;
};

const client = new OAuth2Client({
	client_id: PUBLIC_GOOGLE_OAUTH_CLIENT_ID,
	client_secret: GOOGLE_OAUTH_CLIENT_SECRET
});

export async function POST({ request, cookies, platform }) {
	const accountingDatabase = platform?.env.AccountingDatabase as D1Database;
	await accountingDatabase.prepare("INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)").bind(
		'unknown',
		`User requested Google OAuth login with JWT`,
		Math.floor(Date.now() / 1000)
	).run();
	const { id_token } = (await request.json()) as GoogleJwtRequest;

	const ticket = await client.verifyIdToken({
		idToken: id_token,
		audience: PUBLIC_GOOGLE_OAUTH_CLIENT_ID
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
	const id = await issuingNewSessionToken(payload.email, accountingDatabase);
	cookies.set('token', id, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure: true,
		maxAge: 3600
	})
	return new Response(JSON.stringify({ success: true }), { status: 200 });
}

async function issuingNewSessionToken(studentEmail: string, database: D1Database) {
	const studentID = studentEmail.split('@')[0];
	const sessionToken = randomString(64);
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

function randomString(length: number) {
	return crypto.randomUUID()
}
