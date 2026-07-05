
export const GET = async ({ request, platform, locals }) => { 
    if (!locals.user || !locals.user.admin) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    const { transactionId, bank } = await request.json() as { transactionId: number, bank: string };
    const found = await platform?.env.AccountingDatabase.prepare(
        `
        SELECT slipok_response
        FROM slipok_cache
        WHERE transaction_id = ?
        AND sending_bank = ?
        `
    ).bind(transactionId, bank).first();

    if (!found) {
        return new Response(JSON.stringify({ error: 'No matching slip found', success: false }), { status: 200 });
    }

    return new Response(JSON.stringify({ success: true, data: found.slipok_response }), { status: 200 });
}