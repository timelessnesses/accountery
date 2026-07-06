import { type StudentJWT } from './types/AccountingDatabaseTypes';
import * as jose from 'jose';

export async function verifySessionToken(
	token: string,
	env: Env
): Promise<{ email: string; name: string; nickname: string; admin: boolean }> {
	const secret = env.SharedSecrets as SecretsStoreSecret;
	const secretValue = await secret.get();
	if (!secretValue) {
		throw new Error('Shared secret is not set in environment variables.');
	}
	
	const { payload } = await jose.jwtVerify<StudentJWT>(token, Uint8Array.fromBase64(secretValue));
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
