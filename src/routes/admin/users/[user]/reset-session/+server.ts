export const POST = async ({ params, platform }) => {
    const accountingDatabase = platform?.env.AccountingDatabase as D1Database;
    await accountingDatabase.prepare(`
        UPDATE users
        SET session_token = NULL,
            session_expiry = NULL
        WHERE email = ?
    `).bind(params.user).run();
    return new Response(null, { status: 200 });
}