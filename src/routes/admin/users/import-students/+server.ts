import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin';
import { departedAccountHash, isDepartedAccount } from '$lib/server/departedAccounts';

type StudentRow = {
	id: string;
	name: string;
	nickname: string;
};

export const POST = async ({ request, locals, platform }) => {
	const admin = requireAdmin(locals.user);
	const database = platform!.env.AccountingDatabase;
	const unfiltered = (await request.json()) as { students: StudentRow[] };

	const body = {
		students: (
			await Promise.all(
				unfiltered.students.map(async (student) => {
					const existingStudent = await platform?.env.AccountingDatabase.prepare(
						'SELECT email FROM users WHERE email = ?'
					)
						.bind(student.id)
						.first();

					if (
						existingStudent ||
						/^left-user-/i.test(student.id) ||
						(await isDepartedAccount(database, student.id))
					) {
						return null;
					}

					return student;
				})
			)
		).filter((v): v is StudentRow => !!v)
	};

	const preparedStatement = platform?.env.AccountingDatabase.prepare(
		`INSERT OR IGNORE INTO users (email, name, nickname, role)
		SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM departed_account_blocks WHERE email_hash = ?)`
	) as D1PreparedStatement;
	const a = await Promise.all(
		body.students.map(async (student) => {
			return preparedStatement.bind(
				student.id,
				student.name,
				student.nickname,
				'student',
				await departedAccountHash(database, student.id)
			);
		})
	);

	let importedCount = 0;
	try {
		if (a.length > 0)
			importedCount = (await database.batch(a)).reduce(
				(sum, result) => sum + result.meta.changes,
				0
			);
	} catch (e) {
		console.error('Error inserting students:', e);
		return error(400, 'Error inserting students');
	}

	await platform?.env.AccountingDatabase.prepare(
		'INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)'
	)
		.bind(
			admin.email,
			`Admin ${admin.email} imported ${importedCount} students`,
			Math.floor(Date.now() / 1000)
		)
		.run();

	return new Response(
		JSON.stringify({
			ok: true,
			importedCount,
			skippedCount: unfiltered.students.length - importedCount
		}),
		{
			headers: { 'Content-Type': 'application/json' }
		}
	);
};
