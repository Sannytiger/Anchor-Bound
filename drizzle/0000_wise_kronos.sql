CREATE TABLE `app_accounts` (
	`id` varchar(36) NOT NULL,
	`role` enum('student','professor') NOT NULL,
	`firstName` varchar(120) NOT NULL,
	`lastName` varchar(120) NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`documentCategory` enum('education','government','employment','organization','personal'),
	`country` varchar(120),
	`state` varchar(120),
	`city` varchar(120),
	`university` varchar(200),
	`rollNumber` varchar(120),
	`studentId` varchar(120),
	`universityCode` varchar(120),
	`documentNumber` varchar(120),
	`birthDate` varchar(20),
	`issuingAuthority` varchar(200),
	`issuingCountry` varchar(120),
	`employer` varchar(200),
	`employeeId` varchar(120),
	`organization` varchar(200),
	`authorizedSigner` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `app_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_accounts_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `app_email_otps` (
	`email` varchar(320) NOT NULL,
	`code` varchar(6) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `app_email_otps_email` PRIMARY KEY(`email`)
);
--> statement-breakpoint
CREATE TABLE `app_sessions` (
	`token` varchar(64) NOT NULL,
	`accountId` varchar(36) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `app_sessions_token` PRIMARY KEY(`token`)
);
--> statement-breakpoint
CREATE TABLE `credential_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tokenId` int NOT NULL,
	`recipientAddress` varchar(64) NOT NULL,
	`recipientName` varchar(200) NOT NULL,
	`documentTitle` varchar(300) NOT NULL,
	`issuerName` varchar(200) NOT NULL,
	`template` varchar(60) NOT NULL,
	`fileHash` varchar(128) NOT NULL,
	`tokenURI` varchar(500) NOT NULL,
	`txHash` varchar(128) NOT NULL,
	`issuedAt` timestamp NOT NULL DEFAULT (now()),
	`metadata` json,
	CONSTRAINT `credential_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `credential_records_tokenId_unique` UNIQUE(`tokenId`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
