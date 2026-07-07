export function checkIfUserExists(email: string, accountingDatabase: D1Database) {
    return accountingDatabase.prepare(
        `
        SELECT 1
        FROM users
        WHERE email = ?
        AND deleted_at IS NULL
        `
    )
        .bind(email)
        .first();
}