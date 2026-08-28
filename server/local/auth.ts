import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { appAccounts, appSessions, type AppAccount, type InsertAppAccount } from "../../drizzle/schema";
import { getDb } from "../db";
import { consumeOtp } from "./otp";

const SESSION_COOKIE = "anchor_bound_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const DB_UNAVAILABLE_ERROR = "Database is not configured. Set DATABASE_URL on the server.";

type Role = (typeof appAccounts.$inferSelect)["role"];

function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function sanitizeUser(user: AppAccount) {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

function getCookie(req: Request, name: string) {
  const header = req.headers.cookie ?? "";
  const part = header.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : "";
}

async function getSessionUser(req: Request): Promise<AppAccount | null> {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const db = await getDb();
  if (!db) return null;

  const sessions = await db.select().from(appSessions).where(eq(appSessions.token, token)).limit(1);
  const session = sessions[0];
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;

  const accounts = await db.select().from(appAccounts).where(eq(appAccounts.id, session.accountId)).limit(1);
  return accounts[0] ?? null;
}

async function setSession(res: Response, accountId: string) {
  const db = await getDb();
  if (!db) throw new Error(DB_UNAVAILABLE_ERROR);
  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(appSessions).values({ token, accountId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure}`);
}

async function clearSession(req: Request, res: Response) {
  const token = getCookie(req, SESSION_COOKIE);
  const db = await getDb();
  if (db && token) await db.delete(appSessions).where(eq(appSessions.token, token));
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
}

function validatePassword(password: unknown) {
  return typeof password === "string" && /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])\S{8,}$/.test(password);
}

/** String field on the incoming body -> trimmed value, or undefined if blank/absent (keeps DB columns null instead of ""). */
function optionalField(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : undefined;
}

export function registerLocalAuthRoutes(app: Express) {
  app.get("/api/auth/me", async (req, res) => {
    const user = await getSessionUser(req);
    res.json({ authenticated: Boolean(user), user: user ? sanitizeUser(user) : null });
  });

  app.post("/api/auth/register", async (req, res) => {
    const body = req.body ?? {};
    const role: Role = body.role === "professor" ? "professor" : "student";
    const email = String(body.email ?? "").trim().toLowerCase();
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const password = String(body.password ?? "");
    const otp = String(body.otp ?? "");

    if (!firstName || !lastName || !email) return res.status(400).json({ error: "First name, last name, and email are required." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (!validatePassword(password)) return res.status(400).json({ error: "Password must be at least 8 characters with uppercase, lowercase, number, and special character." });
    if (!/^\d{6}$/.test(otp)) return res.status(400).json({ error: "Enter the 6-digit email verification code." });

    const otpResult = await consumeOtp(email, otp);
    if (!otpResult.ok) return res.status(400).json({ error: otpResult.error });

    const documentCategory = String(body.documentCategory ?? "personal");
    if (role === "professor" && !String(body.universityCode ?? "").trim()) return res.status(400).json({ error: "University code is required for faculty registration." });
    // Student ID / university code are only relevant to education-category credentials.
    // Personal, government, employment, and organization holders don't have these at all.
    if (role === "student" && documentCategory === "education" && (!String(body.studentId ?? "").trim() || !String(body.universityCode ?? "").trim())) return res.status(400).json({ error: "Student ID and university code are required for education credentials." });

    const db = await getDb();
    if (!db) return res.status(503).json({ error: DB_UNAVAILABLE_ERROR });

    const existing = await db.select({ id: appAccounts.id }).from(appAccounts).where(eq(appAccounts.email, email)).limit(1);
    if (existing.length) return res.status(409).json({ error: "An account with this email already exists." });

    const id = crypto.randomUUID();
    const values: InsertAppAccount = {
      id,
      role,
      firstName,
      lastName,
      email,
      passwordHash: hashPassword(password),
      documentCategory: documentCategory as InsertAppAccount["documentCategory"],
      country: optionalField(body.country),
      state: optionalField(body.state),
      city: optionalField(body.city),
      university: optionalField(body.university),
      rollNumber: optionalField(body.rollNumber),
      studentId: optionalField(body.studentId),
      universityCode: optionalField(body.universityCode),
      documentNumber: optionalField(body.documentNumber),
      birthDate: optionalField(body.birthDate),
      issuingAuthority: optionalField(body.issuingAuthority),
      issuingCountry: optionalField(body.issuingCountry),
      employer: optionalField(body.employer),
      employeeId: optionalField(body.employeeId),
      organization: optionalField(body.organization),
      authorizedSigner: optionalField(body.authorizedSigner),
    };

    await db.insert(appAccounts).values(values);
    await setSession(res, id);
    const created = await db.select().from(appAccounts).where(eq(appAccounts.id, id)).limit(1);
    res.status(201).json({ authenticated: true, user: sanitizeUser(created[0]!) });
  });

  app.post("/api/auth/login", async (req, res) => {
    const body = req.body ?? {};
    const role: Role = body.role === "professor" ? "professor" : "student";
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    const db = await getDb();
    if (!db) return res.status(503).json({ error: DB_UNAVAILABLE_ERROR });

    const accounts = await db.select().from(appAccounts).where(eq(appAccounts.email, email)).limit(1);
    const user = accounts[0];

    if (!user || user.role !== role || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: "Invalid email or password." });
    // Only education-category accounts were ever issued a Student ID, so only check it for those.
    // Personal, government, employment, and organization holders sign in with just email + password.
    if (role === "student" && user.documentCategory === "education" && String(body.studentId ?? "").trim() !== String(user.studentId ?? "")) return res.status(401).json({ error: "Student ID does not match this account." });
    if (role === "professor" && String(body.facultyCode ?? "").trim() !== String(user.universityCode ?? "")) return res.status(401).json({ error: "University faculty code does not match this account." });

    await setSession(res, user.id);
    res.json({ authenticated: true, user: sanitizeUser(user) });
  });

  app.post("/api/auth/logout", async (req, res) => {
    await clearSession(req, res);
    res.json({ success: true });
  });
}
