import { error } from '@sveltejs/kit';

type StudentRow = {
	id: string;
	name: string;
	nickname: string;
};

export const POST = async ({ request, locals, platform }) => {
	const unfiltered = (await request.json()) as { students: StudentRow[] };

	const body = {
		students: (
			await Promise.all(
				unfiltered.students.map(async (student) => {
					const existingStudent = await platform?.env.AccountingDatabase.prepare(
						'SELECT * FROM users WHERE email = ? AND deleted_at IS NULL'
					)
						.bind(student.id)
						.first();

					if (existingStudent) {
						console.warn(`Student with email ${student.id} already exists. Skipping.`);
						return null;
					}

					return student;
				})
			)
		).filter((v): v is StudentRow => !!v)
	};

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
		await platform?.env.AccountingDatabase.batch(a);
	} catch (e) {
		console.error('Error inserting students:', e);
		return error(400, 'Error inserting students');
	}

	await platform?.env.AccountingDatabase.prepare(
		'INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)'
	)
		.bind(
			locals.user.email,
			`Admin ${locals.user.email} imported ${body.students.length} students`,
			Math.floor(Date.now() / 1000)
		)
		.run();

	return new Response(JSON.stringify({ ok: true }), {
		headers: { 'Content-Type': 'application/json' }
	});
};
