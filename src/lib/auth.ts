import { type StudentJWT } from './types/AccountingDatabaseTypes';
import * as jose from 'jose';
import { env as envPrivate } from '$env/dynamic/private';

export async function verifySessionToken(
	token: string,
	env: Env
): Promise<{ email: string; name: string; nickname: string; admin: boolean }> {
	const secret = env.SharedSecrets as SecretsStoreSecret;
	const secretValue = await secret.get();
	if (!secretValue) {
		throw new Error('Shared secret is not set in environment variables.');
	}

	const { payload } = await jose.jwtVerify<StudentJWT>(token, turnThisToUint8Array(secretValue), {
		algorithms: ['HS256']
	});

	if (envPrivate.ADMIN_EMAIL && envPrivate.ADMIN_EMAIL === payload.sub) {
		payload.role = 'admin';
	}

	if (!payload) {
		throw new Error('Invalid JWT token.');
	}

	return {
		email: payload.sub as string,
		name: payload.name,
		nickname: payload.nickname,
		admin: payload.role === 'admin'
	};
}
function turnThisToUint8Array(secret: string): Uint8Array {
	const uint8Array = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
	return uint8Array;
}
