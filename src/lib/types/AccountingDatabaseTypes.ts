export type User = {
	session_token: string;
	name: string;
	email: string;
	nickname: string;
	session_expiry: Date;
	role: 'user' | 'admin';
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

export type Log = {
	id: number;
	email: string;
	action: string;
	timestamp: number;
	date: Date;
};
