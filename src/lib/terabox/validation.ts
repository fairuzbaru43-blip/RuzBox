import { z } from "zod";
import { getTeraboxRoot } from "./client";

export const safeNameSchema = z.string().trim().min(1).max(180).refine(value => !/[\\/\u0000-\u001f]/.test(value) && value !== "." && value !== "..", "Use a file name without slashes.");
export const oauthCodeSchema = z.string().trim().min(3).max(300).regex(/^[A-Za-z0-9._~+-]+$/);
export function assertWithinRoot(path: string) {
  const root = getTeraboxRoot();
  if (path !== root && !path.startsWith(`${root}/`)) throw new Error("That path is outside the RuzBox application folder.");
  if (path.includes("..") || path.includes("\\")) throw new Error("Invalid file path.");
  return path;
}
export function getChildPath(parent: string, name: string) {
  assertWithinRoot(parent);
  const clean = safeNameSchema.parse(name);
  return `${parent.replace(/\/$/, "")}/${clean}`;
}
