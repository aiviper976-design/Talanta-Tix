ALTER TABLE `orders` ADD `whatsappOptIn` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `purchaseReminders` ADD `whatsappMessageId` varchar(255);