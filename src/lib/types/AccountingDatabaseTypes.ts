export type User = {
	name: string;
	email: string;
	nickname: string;
	session_expiry: Date | null;
	role: 'user' | 'admin';
	logged_in_when: Date | null;
	deleted_at: Date | null;
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

export type StudentJWT = {
	name: string;
	nickname: string;
	role: User['role'];
};

export type TransformedUser = {
	paid: number;
	owed: number;
	net: number;
} & User;
