export type NotificationMessage = {
	type: 'notification';
	id?: string;
	event?:
		| { type: 'review'; transactionId: number }
		| { type: 'reminder'; day: string; email: string };
	data: {
		title: string;
		body: string;
		icon?: string;
		url?: string;
		destination: 'all' | 'students' | 'admins' | string[];
		output: 'all' | 'push' | 'email';
	};
};
