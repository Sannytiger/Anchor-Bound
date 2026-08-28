import { int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Anchor Bound's own account system — separate from the `users` table above,
 * which belongs to the platform's built-in OAuth scaffolding and is unused by
 * the app's actual sign-up/sign-in flow. This table backs every account type
 * the app issues: students, faculty/professors, and public identity holders
 * (personal, government, employment, and organization document categories).
 */
export const accountRoles = ["student", "professor"] as const;
export const documentCategories = ["education", "government", "employment", "organization", "personal"] as const;

export const appAccounts = mysqlTable("app_accounts", {
  /** UUID string, generated with crypto.randomUUID() at registration time. */
  id: varchar("id", { length: 36 }).primaryKey(),
  /** Portal the account registered through: "student" also covers all non-institutional public holders. */
  role: mysqlEnum("role", accountRoles).notNull(),
  firstName: varchar("firstName", { length: 120 }).notNull(),
  lastName: varchar("lastName", { length: 120 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  /** Which identity-evidence type the account was registered with; drives which fields below are populated. */
  documentCategory: mysqlEnum("documentCategory", documentCategories),

  // Location (collected for every account)
  country: varchar("country", { length: 120 }),
  state: varchar("state", { length: 120 }),
  city: varchar("city", { length: 120 }),

  // Education category (students) / institution fields (professors)
  university: varchar("university", { length: 200 }),
  rollNumber: varchar("rollNumber", { length: 120 }),
  studentId: varchar("studentId", { length: 120 }),
  universityCode: varchar("universityCode", { length: 120 }),

  // Personal / government identity evidence
  documentNumber: varchar("documentNumber", { length: 120 }),
  birthDate: varchar("birthDate", { length: 20 }),
  issuingAuthority: varchar("issuingAuthority", { length: 200 }),
  issuingCountry: varchar("issuingCountry", { length: 120 }),

  // Employment identity evidence
  employer: varchar("employer", { length: 200 }),
  employeeId: varchar("employeeId", { length: 120 }),

  // Organization identity evidence
  organization: varchar("organization", { length: 200 }),
  authorizedSigner: varchar("authorizedSigner", { length: 200 }),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AppAccount = typeof appAccounts.$inferSelect;
export type InsertAppAccount = typeof appAccounts.$inferInsert;

/** Login sessions for app_accounts, replacing the old sessions.json file. */
export const appSessions = mysqlTable("app_sessions", {
  token: varchar("token", { length: 64 }).primaryKey(),
  accountId: varchar("accountId", { length: 36 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});
export type AppSession = typeof appSessions.$inferSelect;
export type InsertAppSession = typeof appSessions.$inferInsert;

/** Pending email-verification OTP codes, replacing the old otps.json file. One row per email in flight. */
export const appEmailOtps = mysqlTable("app_email_otps", {
  email: varchar("email", { length: 320 }).primaryKey(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});
export type AppEmailOtp = typeof appEmailOtps.$inferSelect;
export type InsertAppEmailOtp = typeof appEmailOtps.$inferInsert;

/**
 * Issued credential / certificate records, replacing the old credentials.json file.
 * `tokenId` is the application-facing identifier shown to users (e.g. "#1042") — it's
 * assigned by the app (either read back from the on-chain mint event, or incremented
 * locally when no blockchain is configured), not a database auto-increment value, so
 * the existing numbering scheme (starting at 1042) carries over unchanged.
 */
export const credentialRecords = mysqlTable("credential_records", {
  id: int("id").autoincrement().primaryKey(),
  tokenId: int("tokenId").notNull().unique(),
  recipientAddress: varchar("recipientAddress", { length: 64 }).notNull(),
  recipientName: varchar("recipientName", { length: 200 }).notNull(),
  documentTitle: varchar("documentTitle", { length: 300 }).notNull(),
  issuerName: varchar("issuerName", { length: 200 }).notNull(),
  template: varchar("template", { length: 60 }).notNull(),
  fileHash: varchar("fileHash", { length: 128 }).notNull(),
  tokenURI: varchar("tokenURI", { length: 500 }).notNull(),
  txHash: varchar("txHash", { length: 128 }).notNull(),
  issuedAt: timestamp("issuedAt").defaultNow().notNull(),
  metadata: json("metadata"),
});
export type CredentialRecord = typeof credentialRecords.$inferSelect;
export type InsertCredentialRecord = typeof credentialRecords.$inferInsert;

// TODO: Add your tables here