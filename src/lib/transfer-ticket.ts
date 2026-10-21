import "server-only";
import { createCipheriv, createHash, randomBytes } from "node:crypto";

export function createTransferTicket(payload: Record<string, unknown>) {
  const secret = process.env.TRANSFER_SERVICE_SECRET;
  if (!secret || secret.length < 32) throw new Error("TRANSFER_SERVICE_SECRET must contain at least 32 characters.");
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}
