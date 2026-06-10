CREATE TABLE `pay_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cycle_start` text NOT NULL,
	`kind` text NOT NULL,
	`amount_satang` integer NOT NULL,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pay_adjustments_user_cycle_idx` ON `pay_adjustments` (`user_id`,`cycle_start`);--> statement-breakpoint
CREATE TABLE `pay_cycle_closures` (
	`cycle_start` text PRIMARY KEY NOT NULL,
	`cycle_end` text NOT NULL,
	`closed_by` text NOT NULL,
	`closed_at` integer NOT NULL,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pay_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cycle_start` text NOT NULL,
	`body` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pay_notes_user_cycle_idx` ON `pay_notes` (`user_id`,`cycle_start`);--> statement-breakpoint
CREATE TABLE `payslips` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cycle_start` text NOT NULL,
	`cycle_end` text NOT NULL,
	`pay_date` text NOT NULL,
	`minutes_total` integer NOT NULL,
	`base_satang` integer NOT NULL,
	`income_satang` integer NOT NULL,
	`deduction_satang` integer NOT NULL,
	`net_satang` integer NOT NULL,
	`lines_json` text,
	`owner_note` text,
	`closed_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payslips_user_cycle_idx` ON `payslips` (`user_id`,`cycle_start`);