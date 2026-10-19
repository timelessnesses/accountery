export type User = {
	name: string;
	email: string;
	nickname: string;
	session_expiry: Date | null;
	role: 'student' | 'admin';
	logged_in_when: Date | null;
	deleted_at: Date | null;
	left_at: number | null;
};

export type Transaction = {
	id: number;
	email: string;
	amount: number;
	description: string;
	date: Date;
	type: string;
	image: string;
	// voided is where transaction is wrongfully marked as something else. voided is just there to make it "not count towards rejected"
	approved: 'approved' | 'pending' | 'rejected' | 'voided';
	processor: string;
	reject_reason: string;
	void_reason: string;
};

export type Obligation = {
	id: number;
	start_date: Date;
	amount: number;
	description: string;
	end_date: Date | null;
};

export type Log = {
	id: number;
	email: string;
	action: string;
	timestamp: number;
	date: Date;
	targets: string;
	actor_type: 'user' | 'application';
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

export type Notification = {
	endpoint: string;
	email: string;
	p256dh: string;
	auth: string;
}