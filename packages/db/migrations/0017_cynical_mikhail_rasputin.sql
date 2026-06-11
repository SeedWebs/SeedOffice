CREATE TABLE `calendar_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`google_email` text,
	`google_account_id` text,
	`refresh_token_enc` text,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`sync_token` text,
	`last_sync_at` integer,
	`last_error` text,
	`connected_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `inbox_google_clients`(`id`) ON UPDATE no action ON DELETE no action
);
