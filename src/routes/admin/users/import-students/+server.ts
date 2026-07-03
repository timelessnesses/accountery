import { error } from '@sveltejs/kit';

type StudentRow = {
		id: string;
		name: string;
		nickname: string;
	};

export const POST = async ({ request, locals, platform }) => { 
    const body = await request.json() as { students: StudentRow[] };

    if (!locals.user || !locals.user.admin) {
        return error(403, 'Forbidden');
    }
    const preparedStatement = platform?.env.AccountingDatabase.prepare(
        'INSERT INTO users (email, name, nickname, role) VALUES (?, ?, ?, ?)'
    ) as D1PreparedStatement;
    const a = body.students.map((student) => {
        return preparedStatement?.bind(student.id, student.name, student.nickname, 'student');
    });

    try {
        await platform?.env.AccountingDatabase.batch(a)
    } catch (e) {
        console.error('Error inserting students:', e);
        return error(400, 'Error inserting students');
    }

    await platform?.env.AccountingDatabase.prepare('INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)').bind(
        locals.user.email,
        `Admin ${locals.user.email} imported ${body.students.length} students`,
        Math.floor(Date.now() / 1000)
    ).run();

    return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
    });
}