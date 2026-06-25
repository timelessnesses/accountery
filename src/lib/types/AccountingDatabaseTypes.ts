export type User = {
	session_token: string;
	name: string;
	email: string;
	nickname: string;
	session_expiry: Date;
};

export type Transaction = {
	id: number;
	email: string;
	amount: number;
	description: string;
	date: Date;
	type: string;
	image: string;
	approved: 'approved' | 'pending' | 'rejected';
};

export type Obligation = {
	id: number;
	start_date: Date;
	amount: number;
	description: string;
};
