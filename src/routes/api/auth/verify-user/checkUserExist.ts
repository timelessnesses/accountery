import timed from "$lib/timed";

export async function checkIfUserExists(email: string, accountingDatabase: D1Database) {
	return await timed(() => accountingDatabase.prepare(
		`
        SELECT 1
        FROM users
        WHERE email = ?
        AND deleted_at IS NULL
    `
	)
		.bind(email)
		.first(),
		'Checking if user exists',
	);
}
