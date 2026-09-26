import { prisma } from "../src/server/db";
import fs from "fs/promises";
import path from "path";

const UPLOAD_DIR = process.env.STORAGE_LOCAL_DIR || "./storage/uploads";

async function cleanupUnattachedUploads() {
  console.log("🧹 Running cleanup for unattached uploads...");

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Find unfinalized attachments older than 24 hours
  const unattached = await prisma.attachment.findMany({
    where: {
      isFinalized: false,
      createdAt: { lt: oneDayAgo },
      workerEvidence: null,
      requestAttachments: { none: {} },
      commentAttachments: { none: {} },
      procurementImages: { none: {} },
      completionAttachments: { none: {} },
    },
  });

  console.log(`Found ${unattached.length} stale unattached upload(s).`);

  for (const item of unattached) {
    try {
      const filePath = path.join(UPLOAD_DIR, item.storageKey);
      await fs.unlink(filePath).catch(() => {});
      await prisma.attachment.delete({ where: { id: item.id } });
      console.log(`Deleted stale upload: ${item.originalName} (${item.storageKey})`);
    } catch (err) {
      console.error(`Error deleting attachment ${item.id}:`, err);
    }
  }

  console.log("Cleanup completed.");
}

cleanupUnattachedUploads()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
