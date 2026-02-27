CREATE TABLE `clips` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`storage_key` text,
	`thumbnail_key` text,
	`file_size` integer,
	`duration_seconds` real,
	`fps` integer,
	`clip_order` integer,
	`name` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `swing_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `clips_session_id_idx` ON `clips` (`session_id`);--> statement-breakpoint
CREATE TABLE `swing_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recorded_at` text NOT NULL,
	`ended_at` text,
	`duration_seconds` real,
	`device_info` text,
	`club_type` text,
	`notes` text,
	`location_display_name` text,
	`latitude` real,
	`longitude` real,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `swing_sessions_user_id_idx` ON `swing_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `swing_sessions_user_recorded_idx` ON `swing_sessions` (`user_id`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_settings_user_key_idx` ON `user_settings` (`user_id`,`key`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_id` text NOT NULL,
	`email` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_clerk_id_unique` ON `users` (`clerk_id`);