ALTER TABLE `orders` ADD `idempotencyKey` varchar(96);--> statement-breakpoint
ALTER TABLE `orders` ADD `ticketToken` varchar(96);--> statement-breakpoint
ALTER TABLE `orders` ADD `expiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD `paidAt` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_idempotencyKey_unique` UNIQUE(`idempotencyKey`);--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_ticketToken_unique` UNIQUE(`ticketToken`);