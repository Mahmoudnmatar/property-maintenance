import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/server/db";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: process.env.BETTER_AUTH_SECRET || "super-secret-key-for-development-only",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // In MVP local development
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "TENANT",
      },
      preferredLocale: {
        type: "string",
        required: false,
        defaultValue: "ar",
      },
      isDisabled: {
        type: "boolean",
        required: false,
        defaultValue: false,
      },
    },
  },
});
