import { describe, expect, it } from "vitest";

describe("email service configuration", () => {
  it("does not crash when RESEND_API_KEY is missing", async () => {
    const originalKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;

    try {
      await expect(import("../src/server/services/email")).resolves.toBeDefined();
    } finally {
      if (originalKey) {
        process.env.RESEND_API_KEY = originalKey;
      } else {
        delete process.env.RESEND_API_KEY;
      }
    }
  });
});
