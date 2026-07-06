export function checkIfUserExists(email: string, accountingDatabase: D1Database) {
    return accountingDatabase.prepare(
        `
        SELECT 1
        FROM users
        WHERE email = ?
        `
    )
        .bind(email)
        .first();
}