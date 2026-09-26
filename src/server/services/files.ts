import { prisma } from "@/server/db";
import { AuthUser, assertAuthenticated, AuthorizationError } from "@/server/policies";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const UPLOAD_DIR = process.env.STORAGE_LOCAL_DIR || "./storage/uploads";
const MAX_IMAGE_BYTES = (parseInt(process.env.UPLOAD_IMAGE_MAX_MB || "5", 10)) * 1024 * 1024;
const MAX_DOC_BYTES = (parseInt(process.env.UPLOAD_DOC_MAX_MB || "10", 10)) * 1024 * 1024;

const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_DOC_MIMES = ["application/pdf"];

export async function saveUploadedFile(
  user: AuthUser,
  buffer: Buffer,
  originalName: string,
  mimeType: string
) {
  assertAuthenticated(user);

  // Validate MIME type
  const isImage = ALLOWED_IMAGE_MIMES.includes(mimeType);
  const isDoc = ALLOWED_DOC_MIMES.includes(mimeType);

  if (!isImage && !isDoc) {
    throw new Error("UNSUPPORTED_FILE_TYPE");
  }

  // Validate size
  const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
  if (buffer.length > maxBytes) {
    throw new Error("FILE_SIZE_LIMIT_EXCEEDED");
  }

  // Ensure storage dir exists
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  // Generate opaque storage key
  const ext = path.extname(originalName) || (isImage ? ".jpg" : ".pdf");
  const storageKey = `${crypto.randomUUID()}${ext}`;
  const filePath = path.join(UPLOAD_DIR, storageKey);

  // Write file to disk
  await fs.writeFile(filePath, buffer);

  // Create Attachment record
  const attachment = await prisma.attachment.create({
    data: {
      uploaderId: user.id,
      storageKey,
      originalName,
      mimeType,
      sizeBytes: buffer.length,
      isFinalized: false,
    },
  });

  return attachment;
}

export async function getAuthorizedFileStream(user: AuthUser, attachmentId: string) {
  assertAuthenticated(user);

  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: {
      workerEvidence: { include: { workerProfile: true } },
      requestAttachments: {
        include: {
          request: { include: { unit: { include: { building: true } }, workOrder: true } },
        },
      },
      commentAttachments: {
        include: {
          comment: {
            include: {
              request: { include: { unit: { include: { building: true } }, workOrder: true } },
            },
          },
        },
      },
      completionAttachments: {
        include: {
          workOrder: {
            include: {
              request: { include: { unit: { include: { building: true } } } },
            },
          },
        },
      },
    },
  });

  if (!attachment) throw new Error("NOT_FOUND");

  // Authorization checks
  if (user.role === "SUPER_ADMIN" || attachment.uploaderId === user.id) {
    // Permitted
  } else if (attachment.workerEvidence) {
    // Worker certificates stay private to worker & admin!
    // Approved portfolio can be seen if published
    const we = attachment.workerEvidence;
    if (we.kind === "CERTIFICATE" && user.id !== we.workerProfile.userId) {
      throw new AuthorizationError("FORBIDDEN");
    }
  }

  const filePath = path.join(UPLOAD_DIR, attachment.storageKey);
  const fileBuffer = await fs.readFile(filePath);

  return {
    buffer: fileBuffer,
    mimeType: attachment.mimeType,
    fileName: attachment.originalName,
  };
}
