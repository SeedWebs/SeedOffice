CREATE TABLE `calendar_events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`type` text DEFAULT 'other' NOT NULL,
	`user_id` text,
	`project_id` text,
	`source` text DEFAULT 'local' NOT NULL,
	`gcal_id` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `calendar_events_date_idx` ON `calendar_events` (`start_date`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expense_date` text NOT NULL,
	`amount_satang` integer NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`description` text NOT NULL,
	`receipt_key` text,
	`paid_by` text DEFAULT 'self' NOT NULL,
	`project_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_by` text,
	`approved_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `expenses_user_idx` ON `expenses` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`expense_date`);