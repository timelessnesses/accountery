const HASH_KEY_SETTING = 'departed_account_hash_key';

async function emailDigest(database: D1Database, email: string, createKey = false) {
	let setting = await database
		.prepare('SELECT value FROM app_settings WHERE key = ?')
		.bind(HASH_KEY_SETTING)
		.first<{ value: string }>();
	if (!setting && createKey) {
		const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
			byte.toString(16).padStart(2, '0')
		).join('');
		await database
			.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)')
			.bind(HASH_KEY_SETTING, key)
			.run();
		setting = await database
			.prepare('SELECT value FROM app_settings WHERE key = ?')
			.bind(HASH_KEY_SETTING)
			.first<{ value: string }>();
	}
	if (!setting) return null;
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(setting.value),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(email.trim().toLowerCase()));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function departedAccountHash(database: D1Database, email: string) {
	return (await emailDigest(database, email, true))!;
}

export async function isDepartedAccount(database: D1Database, email: string) {
	const hash = await emailDigest(database, email);
	if (!hash) return false;
	return Boolean(
		await database
			.prepare('SELECT 1 FROM departed_account_blocks WHERE email_hash = ?')
			.bind(hash)
			.first()
	);
}
