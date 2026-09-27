CREATE TABLE `logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`action` text NOT NULL,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`recipient_email` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`data` text,
	`sent_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `obligation_exemptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`obligation_id` integer NOT NULL,
	`email` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `obligation_exemptions_obligation_email` ON `obligation_exemptions` (`obligation_id`,`email`);--> statement-breakpoint
CREATE TABLE `obligations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`start_date` integer NOT NULL,
	`amount` integer NOT NULL,
	`description` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `slipok_cache` (
	`transaction_id` integer NOT NULL,
	`slipok_response` text NOT NULL,
	`trans_ref` text,
	`sending_bank` text
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`amount` integer NOT NULL,
	`description` text NOT NULL,
	`date` integer NOT NULL,
	`type` text NOT NULL,
	`image` text,
	`approved` text DEFAULT 'pending'
);
--> statement-breakpoint
CREATE TABLE `unpaid_obligation_daily` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`day` text NOT NULL,
	`unpaid_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unpaid_obligation_daily_email_day` ON `unpaid_obligation_daily` (`email`,`day`);--> statement-breakpoint
CREATE TABLE `users` (
	`session_token` text,
	`name` text NOT NULL,
	`email` text PRIMARY KEY NOT NULL,
	`nickname` text NOT NULL,
	`session_expiry` integer,
	`role` text DEFAULT 'user' NOT NULL,
	`logged_in_when` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `web_push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `web_push_subscriptions_endpoint` ON `web_push_subscriptions` (`endpoint`);