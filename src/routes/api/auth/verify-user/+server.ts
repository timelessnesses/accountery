import { checkIfUserExists } from './checkUserExist';

// honestly for check if user is deleted xD
export const GET = async ({ platform, locals }) => {
    if (!locals.user) {
        return new Response(JSON.stringify({ error: 'User not logged in' }), { status: 401 });
    }
    const userExists = await checkIfUserExists(locals.user?.email, platform?.env.AccountingDatabase as D1Database);

    if (!userExists) {
        return new Response(JSON.stringify({ error: 'User not found' }), { status: 400 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
};

