import { prisma } from "../src/server/db";
import { hashPassword } from "better-auth/crypto";
import { Role } from "@prisma/client";

async function createAdmin() {
  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] || "Super Admin";

  if (!email || !password) {
    console.error("Usage: npm run admin:create <email> <password> [name]");
    process.exit(1);
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existing) {
      console.log(`User ${email} already exists. Updating role to SUPER_ADMIN.`);
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: Role.SUPER_ADMIN },
      });
      console.log(`User ${email} is now a SUPER_ADMIN.`);
      return;
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        role: Role.SUPER_ADMIN,
        emailVerified: true,
        accounts: {
          create: {
            accountId: email.toLowerCase().trim(),
            providerId: "credential",
            password: hashedPassword,
          },
        },
      },
    });

    console.log(`Super Admin created successfully: ${user.email} (ID: ${user.id})`);
  } catch (err) {
    console.error("Error creating super admin:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
