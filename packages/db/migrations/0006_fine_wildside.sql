CREATE TABLE `time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`task_id` text NOT NULL,
	`project_id` text NOT NULL,
	`work_date` text NOT NULL,
	`minutes` integer NOT NULL,
	`note` text,
	`rate_snapshot_satang` integer NOT NULL,
	`source` text NOT NULL,
	`edit_count` integer DEFAULT 0 NOT NULL,
	`last_edited_by` text,
	`edited_at` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `time_entries_user_date_idx` ON `time_entries` (`user_id`,`work_date`);--> statement-breakpoint
CREATE INDEX `time_entries_task_idx` ON `time_entries` (`task_id`);--> statement-breakpoint
CREATE INDEX `time_entries_project_idx` ON `time_entries` (`project_id`);--> statement-breakpoint
CREATE TABLE `timer_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`task_id` text NOT NULL,
	`started_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `timer_sessions_user_id_unique` ON `timer_sessions` (`user_id`);