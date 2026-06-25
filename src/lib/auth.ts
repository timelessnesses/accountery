export type User = {
	session_token: string;
	name: string;
	email: string;
	nickname: string;
	session_expiry: Date;
};

export type Transaction = {
	id: number;
	email: string;
	amount: number;
	description: string;
	date: Date;
	type: string;
};

export type Obligation = {
	id: number;
	start_date: Date;
	end_date: Date;
	amount: number;
	description: string;
};

export async function verifySessionToken(
	token: string,
	env: Env
): Promise<{ email: string; name: string; nickname: string }> {
	const db = env.AccountingDatabase;
	const stmt = db.prepare('SELECT * FROM users WHERE session_token = ?');
	const result = await stmt.bind(token).first<User>();
	if (!result) {
		throw new Error('Invalid session token');
	}
	return {
		email: result.email,
		name: result.name,
		nickname: result.nickname
	};
}
