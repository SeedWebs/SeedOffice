CREATE TABLE `client_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`body` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `client_notes_client_idx` ON `client_notes` (`client_id`);--> statement-breakpoint
CREATE TABLE `recurring_services` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`project_id` text,
	`label` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`period` text NOT NULL,
	`amount_satang` integer NOT NULL,
	`next_due_date` text,
	`status` text DEFAULT 'active' NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recurring_client_idx` ON `recurring_services` (`client_id`,`status`);