CREATE TABLE `purchaseReminders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderCode` varchar(32) NOT NULL,
	`reminderNumber` int NOT NULL,
	`status` enum('sending','sent') NOT NULL DEFAULT 'sending',
	`claimedAt` timestamp NOT NULL DEFAULT (now()),
	`sentAt` timestamp,
	`messageId` varchar(255),
	CONSTRAINT `purchaseReminders_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchaseReminders_orderCode_reminderNumber_unique` UNIQUE(`orderCode`,`reminderNumber`)
);
