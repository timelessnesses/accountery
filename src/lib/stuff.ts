import { error } from "@sveltejs/kit";
import { requireLoginUser } from "./server/loginUser";
import * as jose from "jose";

export function turnThisToUint8Array(secret: string): Uint8Array {
	const uint8Array = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
	return uint8Array;
}

export async function issuingNewSessionToken(
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