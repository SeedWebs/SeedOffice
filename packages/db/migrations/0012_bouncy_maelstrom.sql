CREATE TABLE `inbox_google_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`client_id` text NOT NULL,
	`client_secret_enc` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `inbox_mailboxes` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`company_label` text NOT NULL,
	`name` text NOT NULL,
	`email_address` text,
	`gmail_account_id` text,
	`refresh_token_enc` text,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`connected_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `inbox_google_clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inbox_mailboxes_status_idx` ON `inbox_mailboxes` (`status`);