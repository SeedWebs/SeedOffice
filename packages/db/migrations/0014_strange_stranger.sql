CREATE TABLE `gmail_sync_state` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`last_history_id` text,
	`last_sync_at` integer,
	`last_error` text,
	FOREIGN KEY (`mailbox_id`) REFERENCES `inbox_mailboxes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gmail_sync_state_mailbox_idx` ON `gmail_sync_state` (`mailbox_id`);--> statement-breakpoint
CREATE TABLE `inbox_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`gmail_attachment_id` text NOT NULL,
	`r2_key` text,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `inbox_messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inbox_attachments_message_idx` ON `inbox_attachments` (`message_id`);--> statement-breakpoint
CREATE TABLE `inbox_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`gmail_message_id` text NOT NULL,
	`direction` text NOT NULL,
	`from_addr` text DEFAULT '' NOT NULL,
	`to_addr` text DEFAULT '' NOT NULL,
	`cc_addr` text,
	`snippet` text DEFAULT '' NOT NULL,
	`body_key` text,
	`sent_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `inbox_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_messages_thread_gmail_idx` ON `inbox_messages` (`thread_id`,`gmail_message_id`);--> statement-breakpoint
CREATE INDEX `inbox_messages_thread_sent_idx` ON `inbox_messages` (`thread_id`,`sent_at`);--> statement-breakpoint
CREATE TABLE `inbox_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`gmail_thread_id` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`contact_email` text,
	`status` text DEFAULT 'open' NOT NULL,
	`unread` integer DEFAULT false NOT NULL,
	`assignee_id` text,
	`tags` text,
	`last_message_at` integer NOT NULL,
	`snooze_until` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `inbox_mailboxes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_threads_mailbox_gmail_idx` ON `inbox_threads` (`mailbox_id`,`gmail_thread_id`);--> statement-breakpoint
CREATE INDEX `inbox_threads_mailbox_last_idx` ON `inbox_threads` (`mailbox_id`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `inbox_threads_folder_idx` ON `inbox_threads` (`status`,`assignee_id`);