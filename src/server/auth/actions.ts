"use server";

import { prisma } from "@/server/db";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { Role } from "@prisma/client";
import { cookies } from "next/headers";
import crypto from "crypto";
import { sendWelcomeEmail } from "@/server/services/email";

// ─── Direct registration flow with welcome email ──────────────────────────────

export async function initiateRegistration(formData: FormData) {
  const name = formData.get("name") as string;
  const email = (formData.get("email") as string)?.toLowerCase().trim();
  const password = formData.get("password") as string;
  const role = formData.get("role") as string;

  if (!name || !email || !password || !role) {
    return { error: "All fields are required" };
  }

  const allowedRoles: string[] = [Role.OWNER, Role.TENANT, Role.WORKER];
  if (!allowedRoles.includes(role)) {
    return { error: "INVALID_ROLE_SELF_REGISTRATION_RESTRICTED" };
  }

  if (password.length < 8) {
    return { error: "PASSWORD_TOO_SHORT" };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "EMAIL_ALREADY_EXISTS" };
  }

  const hashedPassword = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email,
      role: role as Role,
      emailVerified: true,
      accounts: {
        create: {
          accountId: email,
          providerId: "credential",
          password: hashedPassword,
        },
      },
    },
  });

  if (user.role === Role.WORKER) {
    await prisma.workerProfile.create({
      data: {
        userId: user.id,
        status: "DRAFT",
      },
    });
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set("better-auth.session_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  try {
    await sendWelcomeEmail(email, name.trim());
  } catch {
    return { success: true, email, warning: "EMAIL_SEND_FAILED" };
  }

  return { success: true, email, role: user.role };
}

// ─── Legacy registerUser (kept for backward compat — now unused) ──────────────

export async function registerUser(formData: FormData) {
  return initiateRegistration(formData);
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function loginUser(formData: FormData) {
  const email = (formData.get("email") as string)?.toLowerCase().trim();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "EMAIL_AND_PASSWORD_REQUIRED" };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { accounts: true },
  });

  if (!user) {
    return { error: "INVALID_CREDENTIALS" };
  }

  if (user.isDisabled) {
    return { error: "ACCOUNT_DISABLED" };
  }

  const credAccount = user.accounts.find((a) => a.providerId === "credential" && a.password);
  if (!credAccount || !credAccount.password) {
    return { error: "INVALID_CREDENTIALS" };
  }

  const valid = await verifyPassword({
    password,
    hash: credAccount.password,
  });

  if (!valid) {
    return { error: "INVALID_CREDENTIALS" };
  }

  // Create session
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set("better-auth.session_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return { success: true, role: user.role };
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logoutUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("better-auth.session_token")?.value;

  if (token) {
    await prisma.session.deleteMany({ where: { token } });
    cookieStore.delete("better-auth.session_token");
  }

  return { success: true };
}

// ─── Get current user ─────────────────────────────────────────────────────────

export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("better-auth.session_token")?.value;

    if (!token) return null;

    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      return null;
    }

    if (session.user.isDisabled) {
      return null;
    }

    return session.user;
  } catch {
    return null;
  }
}
