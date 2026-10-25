import { type StudentJWT } from './types/AccountingDatabaseTypes';
import * as jose from 'jose';
import { env as envPrivate } from '$env/dynamic/private';
import { requireLoginUser } from '$lib/server/loginUser';

export async function verifyJWT(
	token: string,
	env: Env
): Promise<{
	email: string;
	name: string;
	nickname: string;
	admin: boolean;
	privacyPolicyReadVersion: number;
}> {
	const secret = env.SharedSecrets as SecretsStoreSecret;
	const secretValue = await secret.get();
	if (!secretValue) {
		throw new Error('Shared secret is not set in environment variables.');
	}

	const { payload } = await jose.jwtVerify<StudentJWT>(token, turnThisToUint8Array(secretValue), {
		algorithms: ['HS256']
	});

	if (!payload.sub) {
		throw new Error('Invalid JWT token.');
	}
	const user = await requireLoginUser(env.AccountingDatabase, payload.sub);

	return {
		email: payload.sub as string,
		name: user.name,
		nickname: user.nickname,
		admin: user.role === 'admin' || envPrivate.ADMIN_EMAIL === user.email,
		privacyPolicyReadVersion: user.privacy_policy_read_version
	};
}
function turnThisToUint8Array(secret: string): Uint8Array {
	const uint8Array = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
	return uint8Array;
}
