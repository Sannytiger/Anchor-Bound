import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { Express } from "express";
import { appEmailOtps } from "../../drizzle/schema";
import { getDb } from "../db";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_API_URL = "https://api.resend.com/emails";
const DB_UNAVAILABLE_ERROR = "Database is not configured. Set DATABASE_URL on the server.";

function generateCode() {
  // crypto.randomInt is cryptographically strong and end-exclusive, so this yields 100000-999999.
  return crypto.randomInt(100000, 1000000).toString();
}

async function storeOtp(email: string, code: string) {
  const db = await getDb();
  if (!db) throw new Error(DB_UNAVAILABLE_ERROR);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await db.insert(appEmailOtps).values({ email, code, expiresAt }).onDuplicateKeyUpdate({ set: { code, expiresAt } });
}

/** Checks a submitted OTP against the stored record for the email and consumes it on success. */
export async function consumeOtp(email: string, submitted: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await getDb();
  if (!db) return { ok: false, error: DB_UNAVAILABLE_ERROR };

  const rows = await db.select().from(appEmailOtps).where(eq(appEmailOtps.email, email)).limit(1);
  const record = rows[0];
  if (!record) return { ok: false, error: "Send a verification code to this email before continuing." };
  if (Date.now() > record.expiresAt.getTime()) {
    await db.delete(appEmailOtps).where(eq(appEmailOtps.email, email));
    return { ok: false, error: "Your verification code expired. Request a new one." };
  }
  if (record.code !== submitted) return { ok: false, error: "That verification code is incorrect." };

  await db.delete(appEmailOtps).where(eq(appEmailOtps.email, email));
  return { ok: true };
}

async function sendViaResend(email: string, firstName: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Email delivery is not configured. Set RESEND_API_KEY on the server.");
  const from = process.env.RESEND_FROM_EMAIL || "Anchor Bound <onboarding@resend.dev>";
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your Anchor Bound verification code",
      text: `${greeting}\n\nYour Anchor Bound verification code is ${code}. It expires in 10 minutes.\n\nIf you didn't request this, you can safely ignore this email.`,
      html: `<div style="font-family:sans-serif;line-height:1.5"><p>${greeting}</p><p>Your Anchor Bound verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p><p>This code expires in 10 minutes.</p><p style="color:#666;font-size:13px">If you didn't request this, you can safely ignore this email.</p></div>`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Resend API error:", response.status, detail);
    throw new Error("Failed to send the verification email. Please try again.");
  }
}

export function registerOtpRoutes(app: Express) {
  app.post("/api/auth/send-otp", async (req, res) => {
    const body = req.body ?? {};
    const email = String(body.email ?? "").trim().toLowerCase();
    const firstName = String(body.firstName ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address before requesting a code." });
    }

    const db = await getDb();
    if (!db) return res.status(503).json({ error: DB_UNAVAILABLE_ERROR });

    const code = generateCode();
    try {
      await sendViaResend(email, firstName, code);
    } catch (error) {
      return res.status(502).json({ error: error instanceof Error ? error.message : "Failed to send verification email." });
    }
    // Only persist the code once we know the email actually went out.
    await storeOtp(email, code);
    res.json({ success: true });
  });
}
