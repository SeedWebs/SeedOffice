CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`logo` text,
	`contact_name` text,
	`contact_email` text,
	`contact_phone` text,
	`note` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text,
	`name` text NOT NULL,
	`logo` text,
	`client_id` text,
	`type` text NOT NULL,
	`status` text DEFAULT 'dev' NOT NULL,
	`quoted_satang` integer,
	`billing_type` text DEFAULT 'fixed' NOT NULL,
	`recurring_period` text,
	`start_date` text,
	`due_date` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `projects_type_idx` ON `projects` (`type`,`status`);--> statement-breakpoint
CREATE INDEX `projects_client_idx` ON `projects` (`client_id`);